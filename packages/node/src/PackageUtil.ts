import ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Graph, GraphAlgorithms } from '@proteinjs/util';
import { cmd } from './cmd';
import { Fs } from './Fs';

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

export type LocalPackageMap = {
  [packageName: string]: LocalPackage;
};

export type WorkspaceMetadata = {
  packageMap: LocalPackageMap;
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
   * Get map of local packages within repo specified by directory path
   *
   * @param dir dir path that contains local packages
   * @param globIgnorePatterns already includes: ['**\/node_modules/**', '**\/dist/**']
   * @returns {[packageName: string]: LocalPackage}
   */
  static async getLocalPackageMap(dir: string, globIgnorePatterns: string[] = []): Promise<LocalPackageMap> {
    const packageMap: { [packageName: string]: LocalPackage } = {};
    const filePaths = await Fs.getFilePathsMatchingGlob(dir, '**/package.json', [
      '**/node_modules/**',
      '**/dist/**',
      ...globIgnorePatterns,
    ]);
    for (const filePath of filePaths) {
      const packageJson = JSON.parse(await Fs.readFile(filePath));
      const name = packageJson['name'];
      packageMap[name] = {
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
        packageMap[name].workspace = {
          path: workspacePath,
          rootPackageJson: workspacePackageJson,
          lernaJson: workspaceLernaJson,
        };
      }
    }

    return packageMap;
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
    const packageMap = await PackageUtil.getLocalPackageMap(workspacePath);
    const packageGraph = await PackageUtil.getPackageDependencyGraph(packageMap);
    const sortedPackageNames = PackageUtil.getDependencyOrder(packageGraph).filter(
      (packageName) => !!packageMap[packageName]
    );
    const workspaceToPackageMap = PackageUtil.getWorkspaceToPackageMap(packageMap);
    return {
      packageMap,
      packageGraph,
      sortedPackageNames,
      workspaceToPackageMap,
    };
  }

  /**
   * Symlink the dependencies of `localPackage` to other local packages in the workspace.
   * @param localPackage package to symlink the dependencies of
   * @param localPackageMap `LocalPackageMap` of the workspace
   * @param logger optionally provide a logger to capture this method's logging
   */
  static async symlinkDependencies(localPackage: LocalPackage, localPackageMap: LocalPackageMap) {
    const packageDir = path.dirname(localPackage.filePath);
    const nodeModulesPath = path.resolve(packageDir, 'node_modules');
    if (!(await Fs.exists(nodeModulesPath))) {
      await Fs.createFolder(nodeModulesPath);
    }

    const linkDependencies = async (dependencies: Record<string, string> | undefined) => {
      if (!dependencies) {
        return;
      }

      for (const dependencyPackageName in dependencies) {
        const dependencyPath = localPackageMap[dependencyPackageName]?.filePath
          ? path.dirname(localPackageMap[dependencyPackageName].filePath)
          : null;
        if (!dependencyPath) {
          continue;
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
    };

    await linkDependencies(localPackage.packageJson.dependencies);
    await linkDependencies(localPackage.packageJson.devDependencies);
  }
}
