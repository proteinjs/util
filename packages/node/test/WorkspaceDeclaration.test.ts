import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { PackageUtil } from '../src/PackageUtil';
import { WorkspaceDeclaration, WorkspaceDeclarationError } from '../src/WorkspaceDeclaration';

/**
 * Workspace membership comes from the DECLARATION, never from a crawl (n3xah/app Deploy to Test
 * run 33747781291, 2026-09-03): the scanner crawled every package.json under the app and keyed
 * them by name, so CI fixture trees whose package.json files reused the app's own package names
 * (`@n3xa/app-common/-server/-ui` under scripts/ci/fixtures) shadowed the real packages — walk
 * order put the fixtures last, they had no build script, and build-workspace reported "1 package
 * in workspace" (ops/error-bridge), shipping an image with no packages/server/dist.
 *
 * The rules pinned here:
 *  - a directory holding lerna.json `packages` (or a root package.json `workspacePackages`) is a
 *    workspace ROOT; its members are exactly what it declares, and it OWNS its subtree — nothing
 *    undeclared beneath it is a member, however the tree is walked from above;
 *  - a declared literal path with no package.json is a hard error naming the declaration;
 *  - two leaf packages sharing a name is a hard error naming both paths (roots — the containers
 *    every metarepo names `root` — are identified by path and exempt);
 *  - an undeclared tree still crawls (bounded: no hidden dirs, node_modules, dist, symlinks), and
 *    hands every declared root it meets to that root's declaration.
 */
describe('WorkspaceDeclaration — membership is declared, never crawled', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ws-decl-')));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  const writeJson = async (relPath: string, json: unknown) => {
    const filePath = path.join(root, relPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(json, null, 2));
    return filePath;
  };
  const writePackage = (relDir: string, name: string, extra: Record<string, unknown> = {}) =>
    writeJson(path.join(relDir, 'package.json'), { name, version: '1.0.0', ...extra });
  const buildable = { scripts: { build: 'tsc' } };
  const rel = (filePaths: string[]) => filePaths.map((p) => path.relative(root, p)).sort();

  it('resolves a declared package to ITS OWN package.json — a same-named fixture beneath the root is not a member (the 33747781291 shadowing repro)', async () => {
    await writeJson('lerna.json', { packages: ['packages/common', 'packages/server'] });
    const rootPkg = await writePackage('.', 'root');
    const common = await writePackage('packages/common', '@t/common', buildable);
    const server = await writePackage('packages/server', '@t/server', buildable);
    // The impostor: same name, sorts AFTER the real one (walk order made it "win"), no build script.
    await writePackage('scripts/ci/fixtures/floor-sync/repo/packages/server', '@t/server');
    await writePackage('scripts/ci/fixtures/floor-sync/repo', 'root');

    const { packageMap, packagePathMap, sortedPackageNames } = await PackageUtil.getWorkspaceMetadata(root);

    expect(packageMap['@t/server'].filePath).toBe(server);
    expect(packageMap['@t/server'].packageJson.scripts?.build).toBe('tsc');
    expect(rel(Object.keys(packagePathMap))).toEqual(rel([rootPkg, common, server]));
    expect(sortedPackageNames.filter((n) => n !== 'root').sort()).toEqual(['@t/common', '@t/server']);
  });

  it('expands lerna globs (packages/*, packages/**) and the root package.json `workspacePackages` extra roots', async () => {
    await writeJson('lerna.json', { packages: ['packages/*'] });
    const rootPkg = await writeJson('package.json', {
      name: 'root',
      version: '1.0.0',
      [WorkspaceDeclaration.EXTRA_PACKAGES_FIELD]: ['ops/*'],
    });
    const a = await writePackage('packages/a', '@t/a', buildable);
    const b = await writePackage('packages/b', '@t/b', buildable);
    const bridge = await writePackage('ops/error-bridge', '@t/error-bridge', buildable);
    await fs.mkdir(path.join(root, 'ops/notes'), { recursive: true }); // a glob match without package.json: skipped
    await writePackage('packages/a/test/fixtures/x', '@t/a-fixture'); // not matched by packages/* — not a member

    const { packagePathMap } = await PackageUtil.getWorkspaceMetadata(root);
    expect(rel(Object.keys(packagePathMap))).toEqual(rel([rootPkg, a, b, bridge]));

    // packages/** reaches nested dirs but still never enters hidden dirs, node_modules, dist, or symlinks.
    await writeJson('lerna.json', { packages: ['packages/**'] });
    const deep = await writePackage('packages/group/c', '@t/c', buildable);
    await writePackage('packages/.hidden/h', '@t/hidden');
    await writePackage('packages/a/node_modules/dep', '@t/dep');
    await writePackage('packages/a/dist', '@t/dist-artifact');
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-outside-'));
    try {
      await fs.mkdir(path.join(outside, 'o'));
      await fs.writeFile(path.join(outside, 'o', 'package.json'), JSON.stringify({ name: '@t/outside' }));
      await fs.symlink(path.join(outside, 'o'), path.join(root, 'packages', 'linked'));
      const nested = await writePackage('packages/a/test/fixtures/x', '@t/a-fixture'); // packages/** DOES reach it
      const { packagePathMap: deepMap } = await PackageUtil.getWorkspaceMetadata(root);
      expect(rel(Object.keys(deepMap))).toEqual(rel([rootPkg, a, b, bridge, deep, nested]));
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('a declared literal path with no package.json is a hard error naming the declaration and the path', async () => {
    await writeJson('lerna.json', { packages: ['packages/common', 'packages/ui'] });
    await writePackage('.', 'root');
    await writePackage('packages/common', '@t/common', buildable);
    await fs.mkdir(path.join(root, 'packages/ui'), { recursive: true }); // declared, but empty

    await expect(PackageUtil.getWorkspaceMetadata(root)).rejects.toThrow(WorkspaceDeclarationError);
    await expect(PackageUtil.getWorkspaceMetadata(root)).rejects.toThrow(
      /lerna\.json declares "packages\/ui" but .*packages\/ui\/package\.json does not exist/
    );
  });

  it('an undeclared tree crawls, and every declared root it meets owns its own subtree (the metarepo shape)', async () => {
    // Metarepo root: no lerna.json, no workspacePackages — a crawl root, named `root` like every root.
    const meta = await writePackage('.', 'root');
    // packages/app is a declared root; its fixtures are NOT members even though the crawl passes above them.
    await writeJson('packages/app/lerna.json', { packages: ['packages/common'] });
    const app = await writePackage('packages/app', 'root');
    const appCommon = await writePackage('packages/app/packages/common', '@t/app-common', buildable);
    await writePackage('packages/app/scripts/ci/fixtures/f/packages/common', '@t/app-common');
    await writePackage('packages/app/packages/undeclared', '@t/undeclared', buildable);
    // A plain undeclared package elsewhere in the crawl stays a member (today's behavior for loose trees).
    const loose = await writePackage('packages/loose', '@t/loose', buildable);

    const { packageMap, packagePathMap } = await PackageUtil.getWorkspaceMetadata(root);
    expect(rel(Object.keys(packagePathMap))).toEqual(rel([meta, app, appCommon, loose]));
    expect(packageMap['@t/app-common'].filePath).toBe(appCommon);
    expect(packageMap['@t/undeclared']).toBeUndefined();
  });

  it('two leaf packages sharing a name is a hard error naming both paths and which one is declared', async () => {
    await writePackage('.', 'root');
    await writeJson('packages/app/lerna.json', { packages: ['packages/common'] });
    await writePackage('packages/app', 'root');
    const declared = await writePackage('packages/app/packages/common', '@t/app-common', buildable);
    const crawled = await writePackage('tools/impostor', '@t/app-common');

    let error: unknown;
    try {
      await WorkspaceDeclaration.discover(root);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(WorkspaceDeclarationError);
    const message = String((error as Error).message);
    expect(message).toContain('@t/app-common');
    expect(message).toContain(declared);
    expect(message).toContain(crawled);
    expect(message).toMatch(/declared by .*packages\/app\/lerna\.json/);
    expect(message).toMatch(/crawled/);

    // Declared vs declared collides the same way.
    await fs.rm(path.join(root, 'tools'), { recursive: true });
    await writeJson('packages/other/lerna.json', { packages: ['packages/*'] });
    await writePackage('packages/other', 'root');
    const otherCommon = await writePackage('packages/other/packages/common', '@t/app-common', buildable);
    await expect(WorkspaceDeclaration.discover(root)).rejects.toThrow(otherCommon);
  });

  it('containers named `root` at every level stay legal — roots are identified by path, not name', async () => {
    const meta = await writePackage('.', 'root');
    await writeJson('packages/app/lerna.json', { packages: ['packages/*'] });
    const app = await writePackage('packages/app', 'root');
    const common = await writePackage('packages/app/packages/common', '@t/common', buildable);
    await writeJson('packages/lib/lerna.json', {}); // lerna's default packages/* when the field is absent
    const lib = await writePackage('packages/lib', 'root');
    const libA = await writePackage('packages/lib/packages/a', '@t/lib-a', buildable);

    const discovered = await WorkspaceDeclaration.discover(root);
    expect(rel(discovered.map((d) => d.filePath))).toEqual(rel([meta, app, common, lib, libA]));
    const byPath = new Map(discovered.map((d) => [d.filePath, d]));
    expect(byPath.get(common)?.origin).toBe('declared');
    expect(byPath.get(common)?.declaredBy).toBe(path.join(root, 'packages/app/lerna.json'));
    expect(byPath.get(meta)?.origin).toBe('crawled');
  });
});
