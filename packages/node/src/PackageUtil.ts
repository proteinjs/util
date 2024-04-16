import ts from 'typescript';
import * as path from 'path';
import { Logger, Graph, GraphAlgorithms } from '@proteinjs/util';
import { cmd } from './cmd';
import { Fs } from './Fs';

export type Package = { 
  name: string, 
  version?: string, 
  exactVersion?: boolean, 
  development?: boolean 
}

export type LocalPackage = {
  name: string,
  filePath: string, 
  packageJson: any
};

export type LocalPackageMap = {
  [packageName: string]: LocalPackage
};

export type WorkspaceMetadata = {
  packageMap: LocalPackageMap,
  packageGraph: any, // @dagrejs/graphlib.Graph
  sortedPackageNames: string[], // local package names, in dependency order (ie. if a depends on b, [b, a] will be returned)
}

export class PackageUtil {
  private static LOGGER = new Logger('PackageUtil');

  /**
   * Add package dependencies
   * 
   * @param packages packages to install
   * @param cwdPath directory to execute the command from
   */
  static async installPackages(packages: Package[], cwdPath?: string) {
    for (let backage of packages) {
      const { name, version, exactVersion, development } = backage;
      const resolvedExactVersion = typeof exactVersion === 'undefined' ? true : exactVersion;
      const resolvedDevelopment = typeof development === 'undefined' ? false : development;
      const args = [
        'i',
        `${resolvedDevelopment ? `-D` : resolvedExactVersion ? '--save-exact' : `-S`}`,
        `${name}${version ? `@${version}` : ''}`
      ];
      const command = 'npm ' + args.join(' ');
      let envVars;
      if (cwdPath)
        envVars = { cwd: cwdPath }
      PackageUtil.LOGGER.info(`Running command: ${command}`);
      await cmd('npm', args, envVars);
      PackageUtil.LOGGER.info(`Ran command: ${command}`);
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
    const args = [
      'uninstall',
      packageNamesStr
    ];
    const command = 'npm ' + args.join(' ');
    let envVars;
    if (cwdPath)
      envVars = { cwd: cwdPath }
    PackageUtil.LOGGER.info(`Running command: ${command}`);
    await cmd('npm', args, envVars);
    PackageUtil.LOGGER.info(`Ran command: ${command}`);
  }

  static async runPackageScript(name: string, cwdPath?: string) {
    const args = [
      'run',
      name,
    ];
    const command = 'npm ' + args.join(' ');
    let envVars;
      if (cwdPath)
        envVars = { cwd: cwdPath }
    PackageUtil.LOGGER.info(`Running command: ${command}`);
    await cmd('npm', args, envVars);
    PackageUtil.LOGGER.info(`Ran command: ${command}`);
  }

  /**
   * Install package in directory
   * @param cwd directory of package
   */
  static async npmInstall(cwd: string) {
    const args = ['i'];
    const command = 'npm ' + args.join(' ');
    let envVars;
    if (cwd)
      envVars = { cwd: cwd }
    PackageUtil.LOGGER.info(`Running command: ${command}`);
    await cmd('npm', args, envVars);
    PackageUtil.LOGGER.info(`Ran command: ${command}`);
  }

  /**
   * Get typescript declarations for ts files by path
   * @param params 
   * @returns a map of typescript file path to typscript declaration
   */
  static generateTypescriptDeclarations(params: { tsFilePaths: string[], includeDependencyDeclarations?: boolean }): {[tsFilePath: string]: string} {
    // declarations for this file and its local dependencies
    const declarations: {[filePath: string]: string} = {};

    // Create a Program from a root file name.
    const program = ts.createProgram(params.tsFilePaths, {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      declaration: true,  // This is what makes the magic happen.
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
      for (let tsFilePath of params.tsFilePaths) {
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
      result.diagnostics.forEach(diagnostic => {
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
    const packageMap: {[packageName: string]: LocalPackage} = {};
    const filePaths = await Fs.getFilePathsMatchingGlob(dir, '**/package.json', ['**/node_modules/**', '**/dist/**', ...globIgnorePatterns]);
    for (let filePath of filePaths) {
      const packageJson = JSON.parse(await Fs.readFile(filePath));
      const name = packageJson['name'];
      packageMap[name] = { name, filePath, packageJson };
    }

    return packageMap;
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
    for (let localPackage of Object.values(packageMap)) {
      const packageName = localPackage.packageJson['name'];
      if (!graph.hasNode(packageName))
        graph.setNode(packageName);

      PackageUtil.addDependencies(packageName, localPackage.packageJson['dependencies'], graph, packageMap);
      PackageUtil.addDependencies(packageName, localPackage.packageJson['devDependencies'], graph, packageMap);
    }

    return graph;
  }

  private static addDependencies(sourcePackageName: string, dependencies: any, graph: any, packageMap: LocalPackageMap) {
    if (!dependencies)
      return;

    for (let dependencyPackageName of Object.keys(dependencies)) {
      const dependencyPackageVersion = dependencies[dependencyPackageName] as string;
      if (!(dependencyPackageVersion.startsWith('file:') || dependencyPackageVersion.startsWith('.') || !!packageMap[dependencyPackageName]))
        continue;

      if (!graph.hasNode(dependencyPackageName))
        graph.setNode(dependencyPackageName);

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

  /**
   * Get metadata about a workspace, such as package dependency relationships and fs paths.
   * @param workspacePath path to the directory containing the repo
   * @returns `WorkspaceMetadata`
   */
  static async getWorkspaceMetadata(workspacePath: string): Promise<WorkspaceMetadata> {
    const packageMap = await PackageUtil.getLocalPackageMap(workspacePath);
    const packageGraph = await PackageUtil.getPackageDependencyGraph(packageMap);
    const sortedPackageNames = PackageUtil.getDependencyOrder(packageGraph).filter(packageName => !!packageMap[packageName]);
    return {
      packageMap,
      packageGraph,
      sortedPackageNames
    };
  }

  /**
   * Symlink the dependencies of `localPackage` to other local packages in the workspace.
   * @param localPackage package to symlink the dependencies of
   * @param localPackageMap `LocalPackageMap` of the workspace
   * @param logger optionally provide a logger to capture this method's logging
   */
  static async symlinkDependencies(localPackage: LocalPackage, localPackageMap: LocalPackageMap, logger?: Logger) {
    const packageDir = path.dirname(localPackage.filePath);
    const nodeModulesPath = path.resolve(packageDir, 'node_modules');
    if (!await Fs.exists(nodeModulesPath))
      await Fs.createFolder(nodeModulesPath);
  
    const linkDependencies = async (dependencies: Record<string, string> | undefined,) => {
      if (!dependencies)
        return;
    
      for (let dependencyPackageName in dependencies) {
        const dependencyPath = localPackageMap[dependencyPackageName]?.filePath ? path.dirname(localPackageMap[dependencyPackageName].filePath) : null;
        if (!dependencyPath)
          continue;
    
        const symlinkPath = path.join(nodeModulesPath, dependencyPackageName);
        if (await Fs.exists(symlinkPath))
          await Fs.deleteFolder(symlinkPath);
    
        await cmd('ln', ['-s', dependencyPath, symlinkPath], { cwd: packageDir });
        logger?.debug(`Symlinked dependency (${dependencyPackageName}) ${symlinkPath} -> ${dependencyPath}`);
      }
    };
  
    await linkDependencies(localPackage.packageJson.dependencies);
    await linkDependencies(localPackage.packageJson.devDependencies);
  }
}