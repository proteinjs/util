import ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Graph, GraphAlgorithms } from '@proteinjs/util';
import { cmd } from './cmd';
import { Fs } from './Fs';
import { WorkspaceDeclaration } from './WorkspaceDeclaration';

export type Package = {
  name: string;
  version?: string;
  exactVersion?: boolean;
  development?: boolean;
};

export type LocalPackage = {
  name: string;
  filePath: string;
  packageJson: any;
  workspace?: {
    path: string;
    rootPackageJson: any;
    lernaJson?: any;
  };
};

/**
 * Name-keyed resolution index: dependency declarations reference packages BY NAME, so name →
 * package is how a declared dep resolves to a workspace member. Names are not identities —
 * every workspace root in a metarepo is named `root` — so when several packages share a name,
 * this map holds only one of them (deterministically: the lexicographically last package.json
 * path wins). Enumeration and identity questions belong to `LocalPackagePathMap`.
 */
export type LocalPackageMap = {
  [packageName: string]: LocalPackage;
};

/**
 * Path-keyed identity map: one entry per discovered package.json, keyed by its absolute path.
 * This is the DISCOVERY truth — same-named packages (the metarepo root, the app root, and every
 * nested lerna root are all named `root`) never collide here. Use it wherever the question is
 * "which packages exist" (enumeration, symlink coverage); use `LocalPackageMap` only to resolve
 * a dependency NAME to its workspace member.
 */
export type LocalPackagePathMap = {
  [packageJsonPath: string]: LocalPackage;
};

export type WorkspaceMetadata = {
  packageMap: LocalPackageMap;
  packagePathMap: LocalPackagePathMap; // every discovered package, path-keyed (collision-free)
  packageGraph: any; // @dagrejs/graphlib.Graph
  sortedPackageNames: string[]; // local package names, in dependency order (ie. if a depends on b, [b, a] will be returned)
  workspaceToPackageMap: { [workspacePath: string]: string[] }; // string[] is names of packages in workspace
};

export class PackageUtil {
  /**
   * Add package dependencies
   *
   * @param packages packages to install
   * @param cwdPath directory to execute the command from
   */
  static async installPackages(packages: Package[], cwdPath?: string) {
    for (const backage of packages) {
      const { name, version, exactVersion, development } = backage;
      const resolvedExactVersion = typeof exactVersion === 'undefined' ? true : exactVersion;
      const resolvedDevelopment = typeof development === 'undefined' ? false : development;
      const args = [
        'i',
        `${resolvedDevelopment ? `-D` : resolvedExactVersion ? '--save-exact' : `-S`}`,
        `${name}${version ? `@${version}` : ''}`,
      ];
      let envVars;
      if (cwdPath) {
        envVars = { cwd: cwdPath };
      }
      return await cmd('npm', args, envVars);
    }
  }

  /**
   * Remove package dependencies
   *
   * @param packageNames
   * @param cwdPath
   */
  static async uninstallPackages(packageNames: string[], cwdPath?: string) {
    const packageNamesStr = packageNames.join(' ');
    const args = ['uninstall', packageNamesStr];
    let envVars;
    if (cwdPath) {
      envVars = { cwd: cwdPath };
    }
    return await cmd('npm', args, envVars);
  }

  static async runPackageScript(name: string, cwdPath?: string) {
    const args = ['run', name];
    let envVars;
    if (cwdPath) {
      envVars = { cwd: cwdPath };
    }
    return await cmd('npm', args, envVars);
  }

  /**
   * Install package in directory
   * @param cwd directory of package
   */
  static async npmInstall(cwd: string) {
    const args = ['i'];
    let envVars;
    if (cwd) {
      envVars = { cwd: cwd };
    }
    return await cmd('npm', args, envVars);
  }

  /**
   * Get typescript declarations for ts files by path
   * @param params
   * @returns a map of typescript file path to typscript declaration
   */
  static generateTypescriptDeclarations(params: { tsFilePaths: string[]; includeDependencyDeclarations?: boolean }): {
    [tsFilePath: string]: string;
  } {
    // declarations for this file and its local dependencies
    const declarations: { [filePath: string]: string } = {};

    // Create a Program from a root file name.
    const program = ts.createProgram(params.tsFilePaths, {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      declaration: true, // This is what makes the magic happen.
      emitDeclarationOnly: true,
    });

    // Create a custom emit writer that writes to our variable.
    const customWriteFile: ts.WriteFileCallback = (fileName, data) => {
      if (fileName.endsWith('.d.ts')) {
        const tsFileName = fileName.slice(0, fileName.indexOf('.d.ts')) + '.ts';
        declarations[tsFileName] = data;
      }
    };

    // Generate the declaration content.
    if (params.includeDependencyDeclarations) {
      const result = program.emit(undefined, customWriteFile, undefined, true);
      PackageUtil.logCompilerErrors(result);
    } else {
      for (const tsFilePath of params.tsFilePaths) {
        const sourceFile = program.getSourceFile(tsFilePath);
        const result = program.emit(sourceFile, customWriteFile, undefined, true);
        PackageUtil.logCompilerErrors(result);
      }
    }

    return declarations;
  }

  private static logCompilerErrors(result: ts.EmitResult) {
    if (result.emitSkipped || result.diagnostics.length > 0) {
      // Log errors if there were any.
      result.diagnostics.forEach((diagnostic) => {
        if (diagnostic.file) {
          const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
          console.error(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
        } else {
          console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        }
      });
    }
  }

  /**
   * Get the name-keyed resolution index of local packages within the repo specified by
   * directory path. Derived from `getLocalPackagePathMap` (which owns discovery); see
   * `LocalPackageMap` for the name-collision semantics.
   *
   * @param dir dir path that contains local packages
   * @returns {[packageName: string]: LocalPackage}
   */
  static async getLocalPackageMap(dir: string): Promise<LocalPackageMap> {
    return PackageUtil.toNameKeyedMap(await PackageUtil.getLocalPackagePathMap(dir));
  }

  /**
   * Every member package of the workspace rooted at `dir`, keyed by package.json path — the
   * package's IDENTITY. Same-named packages (every workspace root is named `root`) are distinct
   * entries here; anything that enumerates workspace members must start from this map, not from
   * the name-keyed index.
   *
   * Membership is DECLARED, never crawled — `WorkspaceDeclaration` is the one owner: a root's
   * lerna.json `packages` (plus the root package.json's `workspacePackages` extra roots) names
   * exactly its members, a declared root owns its subtree, and only a tree with no declaration
   * at its root is walked (bounded: never into hidden directories, `node_modules`, `dist`, or
   * through symlinks — the unbounded-glob OOM of 2026-09-02 stays fixed). A same-named
   * package.json nobody declared (the CI fixture trees that shadowed the app's packages in
   * n3xah/app run 33747781291) is not a member; a leaf-name collision among members is a hard
   * error naming both paths.
   *
   * @param dir dir path that contains local packages
   * @returns {[packageJsonPath: string]: LocalPackage}
   */
  static async getLocalPackagePathMap(dir: string): Promise<LocalPackagePathMap> {
    const packagePathMap: LocalPackagePathMap = {};
    for (const { filePath, packageJson } of await WorkspaceDeclaration.discover(dir)) {
      const name = packageJson['name'];
      packagePathMap[filePath] = {
        name,
        filePath,
        packageJson,
      };
      const packageDir = path.dirname(filePath);
      const parentDir = path.dirname(packageDir);
      const workspacePackageJsonPath = await PackageUtil.findPackageJsonPath(parentDir);
      if (workspacePackageJsonPath) {
        const workspacePath = path.dirname(workspacePackageJsonPath);
        const workspacePackageJson = JSON.parse(await Fs.readFile(workspacePackageJsonPath));
        const workspaceLernaJsonPath = path.join(workspacePath, 'lerna.json');
        const workspaceLernaJson = (await Fs.exists(workspaceLernaJsonPath))
          ? JSON.parse(await Fs.readFile(workspaceLernaJsonPath))
          : undefined;
        packagePathMap[filePath].workspace = {
          path: workspacePath,
          rootPackageJson: workspacePackageJson,
          lernaJson: workspaceLernaJson,
        };
      }
    }

    return packagePathMap;
  }

  /**
   * Finds the nearest package.json in the directory hierarchy starting from the given directory.
   * @param dir The starting directory path to search from.
   * @returns The path to the closest package.json, or `undefined` if one can't be found
   */
  private static async findPackageJsonPath(dir: string): Promise<string | undefined> {
    const packagePath = path.join(dir, 'package.json');
    if (await Fs.exists(packagePath)) {
      return packagePath;
    }

    const parentDir = path.dirname(dir);
    if (parentDir === dir) {
      return undefined;
    }

    return PackageUtil.findPackageJsonPath(parentDir);
  }

  /**
   * Generate a dependency graph of package names.
   * It will crawl through dependencies and devDependencies in the provided packageJsons.
   * If packagea depends on packageb, nodes with ids packagea and packageb will be added to the graph.
   * An edge from packagea -> packageb will be added to the graph as well.
   *
   * You can get dependency order of packages by calling: `PackageUtil.getDependencyOrder`
   *
   * @param packageJsons an array of package.json objects
   * @returns @dagrejs/graphlib.Graph
   */
  static async getPackageDependencyGraph(packageMap: LocalPackageMap) {
    const graph = new Graph();
    for (const localPackage of Object.values(packageMap)) {
      const packageName = localPackage.packageJson['name'];
      if (!graph.hasNode(packageName)) {
        graph.setNode(packageName);
      }

      PackageUtil.addDependencies(packageName, localPackage.packageJson['dependencies'], graph, packageMap);
      PackageUtil.addDependencies(packageName, localPackage.packageJson['devDependencies'], graph, packageMap);
    }

    return graph;
  }

  private static addDependencies(
    sourcePackageName: string,
    dependencies: any,
    graph: any,
    packageMap: LocalPackageMap
  ) {
    if (!dependencies) {
      return;
    }

    for (const dependencyPackageName of Object.keys(dependencies)) {
      const dependencyPackageVersion = dependencies[dependencyPackageName] as string;
      if (
        !(
          dependencyPackageVersion.startsWith('file:') ||
          dependencyPackageVersion.startsWith('.') ||
          !!packageMap[dependencyPackageName]
        )
      ) {
        continue;
      }

      if (!graph.hasNode(dependencyPackageName)) {
        graph.setNode(dependencyPackageName);
      }

      graph.setEdge(sourcePackageName, dependencyPackageName);
    }
  }

  static async hasTests(packageDir: string): Promise<boolean> {
    return (await Fs.getFilePathsMatchingGlob(packageDir, 'test/**/*.test.ts')).length > 0;
  }

  /**
   * Get package names in reverse topological sort order. Useful for building and installing dependencies.
   * @param packageDependencyGraph @dagrejs/graphlib.Graph
   * @returns package names in dependency order (ie. if a depends on b, [b, a] will be returned)
   */
  static getDependencyOrder(packageDependencyGraph: any): string[] {
    return GraphAlgorithms.topsort(packageDependencyGraph).reverse();
  }

  private static getWorkspaceToPackageMap(packageMap: LocalPackageMap) {
    const workspaceToPackageMap: { [workspacePath: string]: string[] } = {};
    for (const packageName of Object.keys(packageMap)) {
      const localPackage = packageMap[packageName];
      if (!localPackage.workspace) {
        continue;
      }

      if (!workspaceToPackageMap[localPackage.workspace.path]) {
        workspaceToPackageMap[localPackage.workspace.path] = [];
      }

      workspaceToPackageMap[localPackage.workspace.path].push(packageName);
    }

    return workspaceToPackageMap;
  }

  /**
   * Get metadata about a workspace, such as package dependency relationships and fs paths.
   * @param workspacePath path to the directory containing the repo
   * @returns `WorkspaceMetadata`
   */
  static async getWorkspaceMetadata(workspacePath: string): Promise<WorkspaceMetadata> {
    const packagePathMap = await PackageUtil.getLocalPackagePathMap(workspacePath);
    const packageMap = PackageUtil.toNameKeyedMap(packagePathMap);
    const packageGraph = await PackageUtil.getPackageDependencyGraph(packageMap);
    const sortedPackageNames = PackageUtil.getDependencyOrder(packageGraph).filter(
      (packageName) => !!packageMap[packageName]
    );
    const workspaceToPackageMap = PackageUtil.getWorkspaceToPackageMap(packageMap);
    return {
      packageMap,
      packagePathMap,
      packageGraph,
      sortedPackageNames,
      workspaceToPackageMap,
    };
  }

  /**
   * Symlink the dependencies of `localPackage` to other local packages in the workspace.
   *
   * This links the package's full TRANSITIVE closure of workspace dependencies,
   * not just its directly-declared ones. A package's `package.json` only lists
   * its direct deps, but those deps pull in workspace packages of their own
   * (e.g. `flow-server` declares `@n3xah/space-server`, which itself depends on
   * `@n3xah/space-common`). Node resolves a transitive dep like `space-common`
   * out of the consumer's own `node_modules` first, so if we only symlinked
   * direct deps, npm would satisfy `space-common` with a stale registry copy
   * that lags the live workspace source — causing schema/version drift. By
   * linking the whole closure, every workspace package a package can reach at
   * runtime resolves to the live source tree.
   *
   * @param localPackage package to symlink the dependencies of
   * @param localPackageMap `LocalPackageMap` of the workspace
   */
  static async symlinkDependencies(localPackage: LocalPackage, localPackageMap: LocalPackageMap) {
    const packageDir = path.dirname(localPackage.filePath);
    const nodeModulesPath = path.resolve(packageDir, 'node_modules');
    if (!(await Fs.exists(nodeModulesPath))) {
      await Fs.createFolder(nodeModulesPath);
    }

    const transitiveWorkspaceDependencies = await PackageUtil.getTransitiveWorkspaceDependencies(
      localPackage,
      localPackageMap
    );
    for (const dependencyPackageName of transitiveWorkspaceDependencies) {
      await PackageUtil.symlinkPackage(dependencyPackageName, nodeModulesPath, packageDir, localPackageMap);
    }
  }

  /**
   * Compute the transitive closure of workspace dependencies for `localPackage`.
   *
   * Traverses dependency DECLARATIONS (`dependencies` + `devDependencies`) starting from THIS
   * package instance's own package.json, resolving each declared name through
   * `localPackageMap` and expanding through the resolved packages' declarations in turn.
   * Cycle safety and the visited set are PATH-KEYED (package.json paths): identity is the
   * path, never the name. The closure is never seeded from a shared name-keyed graph node —
   * same-named packages (every workspace root is named `root`) share such a node, so a
   * graph-seeded closure conflates their dependencies and computes another package's closure
   * for whichever same-named instance lost the name-keyed collision.
   *
   * Only names present in `localPackageMap` are traversed and returned — i.e. packages that
   * actually live in the workspace and can be symlinked. The package itself is excluded from
   * the result (its own path seeds the visited set).
   *
   * Public: WorkspaceDoctor (@proteinjs/build) diagnoses the same closure this method links —
   * verification and repair must agree on the set of packages that ought to be symlinked.
   *
   * @returns workspace package names this package transitively depends on
   */
  static async getTransitiveWorkspaceDependencies(
    localPackage: LocalPackage,
    localPackageMap: LocalPackageMap
  ): Promise<string[]> {
    const transitiveDependencies = new Set<string>();
    const visitedPaths = new Set<string>([localPackage.filePath]);
    const stack: LocalPackage[] = [localPackage];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const declared = {
        ...(current.packageJson['dependencies'] ?? {}),
        ...(current.packageJson['devDependencies'] ?? {}),
      };
      for (const dependencyPackageName of Object.keys(declared)) {
        const dependencyPackage = localPackageMap[dependencyPackageName];
        if (!dependencyPackage || visitedPaths.has(dependencyPackage.filePath)) {
          continue;
        }

        visitedPaths.add(dependencyPackage.filePath);
        transitiveDependencies.add(dependencyPackageName);
        stack.push(dependencyPackage);
      }
    }

    return Array.from(transitiveDependencies);
  }

  /**
   * Symlink a single workspace package into `nodeModulesPath`, and create
   * `node_modules/.bin/<name>` shims for any `bin` it declares.
   *
   * This is the per-dependency linking logic used by `symlinkDependencies` for
   * each package in the transitive closure. The caller is responsible for
   * deciding WHICH packages to link; this method just links the one named.
   *
   * @param dependencyPackageName name of the workspace package to link
   * @param nodeModulesPath absolute path to the consumer's `node_modules`
   * @param packageDir absolute path to the consumer package's directory (cwd for `ln`)
   * @param localPackageMap `LocalPackageMap` of the workspace
   */
  private static async symlinkPackage(
    dependencyPackageName: string,
    nodeModulesPath: string,
    packageDir: string,
    localPackageMap: LocalPackageMap
  ) {
    const dependencyPath = localPackageMap[dependencyPackageName]?.filePath
      ? path.dirname(localPackageMap[dependencyPackageName].filePath)
      : null;
    if (!dependencyPath) {
      return;
    }

    const symlinkPath = path.join(nodeModulesPath, dependencyPackageName);
    const symlinkParent = path.dirname(symlinkPath);
    if (!(await Fs.exists(symlinkParent))) {
      await Fs.createFolder(symlinkParent);
    }
    // Clear out any existing entry at symlinkPath before creating the
    // new symlink. Use `fs.lstat` rather than `Fs.exists` because
    // `Fs.exists` is `fs.stat`-backed — which FOLLOWS symlinks and
    // throws on a broken target, making broken symlinks invisible
    // here. That's a real failure mode: if a prior run produced a
    // symlink to a path that no longer exists (e.g. after the tree
    // was moved, mounted elsewhere, or retargeted by tooling), the
    // broken link survives the `Fs.exists` check, the delete is
    // skipped, and `ln -s` then fails with "File exists".
    try {
      await fs.lstat(symlinkPath);
      // Existing entry (symlink, file, or directory) — remove it.
      // `deleteFolder` (fs-extra `remove`) handles all three.
      await Fs.deleteFolder(symlinkPath);
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
      // Nothing there — nothing to clean up.
    }

    // Use a RELATIVE link target so the workspace is portable across
    // mount points (a developer's laptop, CI containers, a remote
    // sandbox, etc.) without having to re-run `symlink-workspace` just
    // because the absolute root path changed. `ln -s TARGET LINK`
    // resolves TARGET relative to the directory containing the link —
    // i.e. `symlinkParent` — so we compute the relative path from there.
    const relativeDependencyPath = path.relative(symlinkParent, dependencyPath);
    await cmd('ln', ['-s', relativeDependencyPath, symlinkPath], { cwd: packageDir });

    // Create `.bin/<name>` shims for every bin the dependency declares.
    //
    // This is normally npm's job: `npm install` creates shims at
    // `node_modules/.bin/<name>` pointing into the installed package so
    // lifecycle scripts like `npm run watch` (where npm prepends
    // `./node_modules/.bin` to PATH) can find them. `symlink-workspace`
    // bypasses `npm install`, so without this loop the shims only exist
    // if the user happened to run `npm install` at some point and they
    // survive. They don't survive a broken-symlink sweep, a fresh
    // checkout, or a move to a new host — so we create them ourselves.
    //
    // Also chmod +x the bin target: tsc output doesn't preserve the
    // execute bit that `npm install` sets from the published tarball.
    const depPackageJson = JSON.parse(await Fs.readFile(localPackageMap[dependencyPackageName].filePath));
    const bin = depPackageJson.bin;
    const binEntries: Array<{ name: string; relPath: string }> = [];
    if (bin && typeof bin === 'object') {
      for (const binName in bin) {
        binEntries.push({ name: binName, relPath: bin[binName] });
      }
    } else if (bin && typeof bin === 'string') {
      // Shorthand: `"bin": "./path"` — the exposed name is the
      // package's bare name (scope stripped). Matches npm behavior.
      const bareName = dependencyPackageName.includes('/')
        ? dependencyPackageName.split('/').pop()!
        : dependencyPackageName;
      binEntries.push({ name: bareName, relPath: bin });
    }

    if (binEntries.length > 0) {
      const dotBinDir = path.join(nodeModulesPath, '.bin');
      if (!(await Fs.exists(dotBinDir))) {
        await Fs.createFolder(dotBinDir);
      }
      for (const { name, relPath } of binEntries) {
        const binFilePath = path.resolve(dependencyPath, relPath);
        if (await Fs.exists(binFilePath)) {
          await fs.chmod(binFilePath, 0o755);
        }
        const shimPath = path.join(dotBinDir, name);
        // Same lstat-based cleanup as for the dep symlink — broken
        // shims from a prior run in a different environment would
        // otherwise make `ln -s` fail with "File exists".
        try {
          await fs.lstat(shimPath);
          await Fs.deleteFolder(shimPath);
        } catch (e: any) {
          if (e.code !== 'ENOENT') {
            throw e;
          }
        }
        // Relative target: from `node_modules/.bin` into the dep
        // directory. Goes through the dep's symlinked node_modules
        // entry (not into the source tree) so the shim continues to
        // resolve correctly after the workspace is relocated.
        const shimTargetAbsolute = path.join(nodeModulesPath, dependencyPackageName, relPath);
        const shimRelative = path.relative(dotBinDir, shimTargetAbsolute);
        await cmd('ln', ['-s', shimRelative, shimPath], { cwd: packageDir });
      }
    }
  }

  /**
   * Derive the name-keyed resolution index from the path-keyed discovery map. When several
   * packages share a name, the lexicographically last package.json path wins — deterministic,
   * and irrelevant for real dependency names (nothing declares a dep on `root`; uniquely-named
   * packages resolve identically either way).
   */
  private static toNameKeyedMap(packagePathMap: LocalPackagePathMap): LocalPackageMap {
    const packageMap: LocalPackageMap = {};
    for (const filePath of Object.keys(packagePathMap).sort()) {
      const localPackage = packagePathMap[filePath];
      packageMap[localPackage.name] = localPackage;
    }
    return packageMap;
  }
}
