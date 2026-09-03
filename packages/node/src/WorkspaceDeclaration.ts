import * as path from 'path';
import * as fs from 'fs/promises';

/** A declared-workspace rule was broken. The message names every path involved. */
export class WorkspaceDeclarationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceDeclarationError';
    Object.setPrototypeOf(this, WorkspaceDeclarationError.prototype); // ES5 target: keep instanceof true across the Error subclass
  }
}

export type DiscoveredPackage = {
  /** Absolute package.json path — the package's identity. */
  filePath: string;
  packageJson: any;
  /** `declared`: named by a workspace declaration; `crawled`: found by the bounded walk of an undeclared tree. */
  origin: 'declared' | 'crawled';
  /** The declaration file (lerna.json or the root package.json) that named a `declared` package. */
  declaredBy?: string;
};

type Declaration = {
  rootDir: string;
  /** Each pattern with the file that declared it, in declaration order. */
  patterns: Array<{ pattern: string; source: string }>;
};

/**
 * The ONE owner of workspace membership: which package.json files belong to the workspace rooted
 * at a directory.
 *
 * Membership is DECLARED, never crawled. A directory holding a `lerna.json` (its `packages`
 * globs; lerna's own default `packages/*` when the field is absent) or a root `package.json`
 * carrying `workspacePackages` (extra roots the workspace tooling builds alongside lerna's
 * members — e.g. an app's `ops/*` tools that lerna must not version) is a workspace ROOT. Its
 * members are exactly what it declares, and it OWNS its subtree: nothing undeclared beneath it is
 * a member, however the tree is walked from above. A member that is itself a root expands through
 * its own declaration (the metarepo's nested lerna roots).
 *
 * Why: the previous crawl (every package.json under the root, keyed by name, last path wins)
 * let a CI fixture tree whose package.json files reused the app's own package names shadow the
 * real packages — build-workspace built "1 package in workspace" and the release image shipped
 * with no server dist (n3xah/app Deploy to Test run 33747781291, 2026-09-03). A declaration
 * cannot be shadowed by a file nobody declared.
 *
 * A tree with no declaration at its root (the n3xa metarepo root) still crawls — bounded exactly
 * as before: never into hidden directories, `node_modules`, `dist`, or through symlinks — and
 * hands every declared root it meets to that root's declaration.
 *
 * Hard errors, each naming its paths: a declared literal path with no package.json; two leaf
 * packages sharing a name (dependencies resolve to members BY NAME). Containers — a package.json
 * with members beneath it; every root in the metarepo is named `root` — are identified by path
 * and exempt from the name rule.
 *
 * npm's own `workspaces` field is deliberately NOT read: it changes how `npm i` installs at the
 * root, which is a different install model from the per-package installs this tooling performs.
 */
export class WorkspaceDeclaration {
  /** Root package.json field naming extra member globs beside lerna's `packages`. */
  static readonly EXTRA_PACKAGES_FIELD = 'workspacePackages';
  private static readonly lernaDefaultPackages = ['packages/*'];
  private static readonly prunedDirNames = new Set(['node_modules', 'dist']);

  /** Every member package.json of the workspace rooted at `rootDir`, sorted by path. */
  static async discover(rootDir: string): Promise<DiscoveredPackage[]> {
    const found = new Map<string, DiscoveredPackage>();
    const root = path.resolve(rootDir);
    const declaration = await WorkspaceDeclaration.read(root);
    if (declaration) {
      await WorkspaceDeclaration.discoverDeclared(declaration, found);
    } else {
      await WorkspaceDeclaration.crawl(root, found);
    }
    const discovered = Array.from(found.values()).sort((a, b) =>
      a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0
    );
    WorkspaceDeclaration.assertNoLeafNameCollisions(discovered);
    return discovered;
  }

  /** The declaration at `dir` when `dir` is a workspace root; undefined otherwise. */
  static async read(dir: string): Promise<Declaration | undefined> {
    const patterns: Declaration['patterns'] = [];
    const lernaPath = path.join(dir, 'lerna.json');
    const lernaJson = await WorkspaceDeclaration.readJsonIfExists(lernaPath);
    if (lernaJson) {
      const declared = Array.isArray(lernaJson.packages)
        ? lernaJson.packages
        : WorkspaceDeclaration.lernaDefaultPackages;
      for (const pattern of declared) {
        patterns.push({ pattern: WorkspaceDeclaration.assertPattern(pattern, lernaPath), source: lernaPath });
      }
    }
    const packageJsonPath = path.join(dir, 'package.json');
    const packageJson = await WorkspaceDeclaration.readJsonIfExists(packageJsonPath);
    const extra = packageJson?.[WorkspaceDeclaration.EXTRA_PACKAGES_FIELD];
    if (extra !== undefined) {
      if (!Array.isArray(extra)) {
        throw new WorkspaceDeclarationError(
          `${packageJsonPath}: "${WorkspaceDeclaration.EXTRA_PACKAGES_FIELD}" must be an array of package globs`
        );
      }
      for (const pattern of extra) {
        patterns.push({
          pattern: WorkspaceDeclaration.assertPattern(pattern, packageJsonPath),
          source: packageJsonPath,
        });
      }
    }
    return patterns.length > 0 ? { rootDir: dir, patterns } : undefined;
  }

  /** A declared root: its own package.json (the container), then exactly its declared members. */
  private static async discoverDeclared(declaration: Declaration, found: Map<string, DiscoveredPackage>) {
    const own = path.join(declaration.rootDir, 'package.json');
    if (await WorkspaceDeclaration.exists(own)) {
      await WorkspaceDeclaration.add(found, own, 'declared', declaration.patterns[0].source);
    }
    for (const { pattern, source } of declaration.patterns) {
      for (const memberDir of await WorkspaceDeclaration.expand(declaration.rootDir, pattern, source)) {
        const nested = await WorkspaceDeclaration.read(memberDir);
        if (nested) {
          await WorkspaceDeclaration.discoverDeclared(nested, found); // a nested root owns its subtree
        } else {
          await WorkspaceDeclaration.add(found, path.join(memberDir, 'package.json'), 'declared', source);
        }
      }
    }
  }

  /**
   * The bounded walk of an UNDECLARED tree (the metarepo root): every package.json it meets is a
   * member, and every declared root it meets is handed to that root's declaration instead of
   * being walked. Never enters hidden directories, node_modules, or dist; never follows symlinks
   * (`withFileTypes` reports a symlink as neither directory nor file).
   */
  private static async crawl(rootDir: string, found: Map<string, DiscoveredPackage>) {
    const pending: string[] = [rootDir];
    while (pending.length > 0) {
      const currentDir = pending.pop()!;
      for (const dirent of await fs.readdir(currentDir, { withFileTypes: true })) {
        const entryPath = path.join(currentDir, dirent.name);
        if (dirent.isDirectory()) {
          if (WorkspaceDeclaration.isPrunedDirName(dirent.name)) {
            continue;
          }
          const declaration = await WorkspaceDeclaration.read(entryPath);
          if (declaration) {
            await WorkspaceDeclaration.discoverDeclared(declaration, found);
          } else {
            pending.push(entryPath);
          }
        } else if (dirent.isFile() && dirent.name === 'package.json') {
          await WorkspaceDeclaration.add(found, entryPath, 'crawled');
        }
      }
    }
  }

  /**
   * The directories a declared pattern names under `rootDir`, lerna's semantics: a literal path
   * MUST hold a package.json (hard error otherwise — a declared package that does not exist is
   * a broken declaration, never a silent skip); a glob (`*` within a segment, `**` for any depth)
   * matches directories that hold one, walking with the same prune rules as the crawl. A declared
   * root met inside a glob's walk is matched as a whole and not walked past — it owns its subtree.
   */
  private static async expand(rootDir: string, pattern: string, source: string): Promise<string[]> {
    const segments = pattern.split('/').filter((segment) => segment.length > 0 && segment !== '.');
    if (!segments.some((segment) => segment.includes('*'))) {
      const dir = path.join(rootDir, ...segments);
      if (!(await WorkspaceDeclaration.exists(path.join(dir, 'package.json')))) {
        throw new WorkspaceDeclarationError(
          `${source} declares "${pattern}" but ${path.join(dir, 'package.json')} does not exist — a declared package must exist (fix the declaration or restore the package)`
        );
      }
      return [dir];
    }
    const matches = new Set<string>();
    await WorkspaceDeclaration.matchSegments(rootDir, segments, 0, matches);
    return Array.from(matches).sort();
  }

  private static async matchSegments(dir: string, segments: string[], index: number, matches: Set<string>) {
    if (index === segments.length) {
      if (await WorkspaceDeclaration.exists(path.join(dir, 'package.json'))) {
        matches.add(dir);
      }
      return;
    }
    const segment = segments[index];
    const remaining = segments.length - index - 1;
    if (segment === '**') {
      await WorkspaceDeclaration.matchSegments(dir, segments, index + 1, matches); // zero directories
      for (const child of await WorkspaceDeclaration.childDirs(dir)) {
        if (await WorkspaceDeclaration.read(child)) {
          matches.add(child); // a nested root owns its subtree — matched whole, never walked past
          continue;
        }
        await WorkspaceDeclaration.matchSegments(child, segments, index, matches); // one more directory under **
      }
      return;
    }
    const children = segment.includes('*')
      ? (await WorkspaceDeclaration.childDirs(dir)).filter((child) =>
          WorkspaceDeclaration.segmentMatcher(segment).test(path.basename(child))
        )
      : (await WorkspaceDeclaration.isRealDir(path.join(dir, segment)))
        ? [path.join(dir, segment)]
        : [];
    for (const child of children) {
      if (remaining > 0 && (await WorkspaceDeclaration.read(child))) {
        matches.add(child);
        continue;
      }
      await WorkspaceDeclaration.matchSegments(child, segments, index + 1, matches);
    }
  }

  /** Leaf packages resolve by name; two leaves with one name is a broken workspace, not a tie to break. */
  private static assertNoLeafNameCollisions(discovered: DiscoveredPackage[]) {
    const dirs = discovered.map((entry) => path.dirname(entry.filePath));
    const isContainer = (entry: DiscoveredPackage) => {
      const prefix = path.dirname(entry.filePath) + path.sep;
      return dirs.some((dir) => dir.startsWith(prefix));
    };
    const byName = new Map<string, DiscoveredPackage[]>();
    for (const entry of discovered) {
      const name = entry.packageJson?.name;
      if (typeof name !== 'string' || name.length === 0) {
        continue;
      }
      byName.set(name, (byName.get(name) ?? []).concat(entry));
    }
    const collisions: string[] = [];
    for (const [name, entries] of Array.from(byName.entries())) {
      const leaves = entries.filter((entry) => !isContainer(entry));
      if (leaves.length < 2) {
        continue;
      }
      collisions.push(
        `"${name}" is claimed by\n` +
          leaves
            .map(
              (entry) =>
                `  - ${entry.filePath} (${entry.origin === 'declared' ? `declared by ${entry.declaredBy}` : 'crawled — no declaration names it'})`
            )
            .join('\n')
      );
    }
    if (collisions.length > 0) {
      throw new WorkspaceDeclarationError(
        `Workspace package name collision — dependencies resolve to workspace members BY NAME, so two packages cannot share one:\n${collisions.join('\n')}\nRename the impostor (fixtures carry fixture names) or move it outside the workspace.`
      );
    }
  }

  private static async add(
    found: Map<string, DiscoveredPackage>,
    filePath: string,
    origin: DiscoveredPackage['origin'],
    declaredBy?: string
  ) {
    if (found.has(filePath)) {
      return;
    }
    const packageJson = JSON.parse(await fs.readFile(filePath, 'utf8'));
    found.set(filePath, { filePath, packageJson, origin, ...(declaredBy ? { declaredBy } : {}) });
  }

  private static assertPattern(pattern: unknown, source: string): string {
    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      throw new WorkspaceDeclarationError(
        `${source}: package patterns must be non-empty strings, got ${JSON.stringify(pattern)}`
      );
    }
    if (path.isAbsolute(pattern) || pattern.split('/').includes('..')) {
      throw new WorkspaceDeclarationError(
        `${source}: package pattern "${pattern}" must be relative to the root and stay inside it`
      );
    }
    return pattern;
  }

  private static segmentMatcher(segment: string): RegExp {
    const escaped = segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    return new RegExp(`^${escaped}$`);
  }

  private static isPrunedDirName(name: string): boolean {
    return name.startsWith('.') || WorkspaceDeclaration.prunedDirNames.has(name);
  }

  /** Real (non-symlink, non-pruned) child directories of `dir`. */
  private static async childDirs(dir: string): Promise<string[]> {
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return dirents
      .filter((dirent) => dirent.isDirectory() && !WorkspaceDeclaration.isPrunedDirName(dirent.name))
      .map((dirent) => path.join(dir, dirent.name))
      .sort();
  }

  private static async isRealDir(p: string): Promise<boolean> {
    try {
      return (await fs.lstat(p)).isDirectory();
    } catch {
      return false;
    }
  }

  private static async exists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  private static async readJsonIfExists(p: string): Promise<any | undefined> {
    let text: string;
    try {
      text = await fs.readFile(p, 'utf8');
    } catch {
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new WorkspaceDeclarationError(
        `${p} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
