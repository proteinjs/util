import path from 'path';
import fsExtra from 'fs-extra';
import fs from 'fs/promises';
import { Logger } from '@proteinjs/util';
import globby from 'globby';

export type File = {
  path: string,
  content: string,
}

export type FileContentMap = {
  [filePath: string]: string
}

export interface FileDescriptor {
    name: string;
    nameWithoutExtension: string;
    path: string;
    projectRelativePath: string;
}

export class Fs {
  private static LOGGER = new Logger('Fs');

  static async exists(path: string) {
    return await fsExtra.exists(path);
  }

  static async createFolder(path: string) {
    await fs.mkdir(path);
  }

  static async deleteFolder(path: string) {
    await fs.rm(path, { recursive: true, force: true });
  }

  static async readFiles(filePaths: string[]) {
    const fileMap: FileContentMap = {};
    for (let filePath of filePaths) {
      const fp = `${filePath}`;
      fileMap[fp] = await Fs.readFile(fp);
    }
    return fileMap;
  }

  static async readFile(filePath: string) {
    if (!(await fsExtra.exists(filePath)))
      throw new Error(`File does not exist at path: ${filePath}`);
    
    const fileContent = (await fsExtra.readFile(filePath)).toString();
    if (!fileContent)
      throw new Error(`File is empty: ${filePath}`);

    Fs.LOGGER.debug(`Read file: ${filePath}`);
    return fileContent;
  }

  static async writeFiles(files: File[]) {
    for (let file of files) {
      await fsExtra.ensureFile(file.path);
      await fsExtra.writeFile(file.path, file.content);
      Fs.LOGGER.debug(`Wrote file: ${file.path}`);
    }
  }

  /** Produces a join only if the relative path does not escape the base path */
  static baseContainedJoin(basePath: string, relativePath: string) {
    if (relativePath.includes('..'))
        throw new Error(`Failed to access file: ${relativePath}, file path cannot contain '..'`);

      return path.join(basePath, relativePath);
  }

  static relativeFilePath(fromRelativePath: string, toRelativePath: string) {
    return path.join(
      path.relative(
        path.parse(fromRelativePath).dir, path.parse(toRelativePath).dir
      ),
      path.parse(toRelativePath).name
    );
  }

  // @param dir to recursively search for files
  // @param globIgnorePatterns ie. ['**/node_modules/**', '**/dist/**'] to ignore these directories
  // @return string[] of file paths
  static async getFilePaths(dir: string, globIgnorePatterns: string[] = []) {
    return await globby(dir + '**/*', {
      ignore: [...globIgnorePatterns]
    });
  }

  // @param dirPrefix recursively search for files in this dir
  // @param glob file matching pattern ie. **/package.json
  // @param globIgnorePatterns ie. ['**/node_modules/**', '**/dist/**'] to ignore these directories
  // @return string[] of file paths
  static async getFilePathsMatchingGlob(dirPrefix: string, glob: string, globIgnorePatterns: string[] = []) {
    if (dirPrefix[dirPrefix.length - 1] != path.sep)
      dirPrefix += path.sep;

    return await globby(dirPrefix + glob, {
      ignore: [...globIgnorePatterns]
    });
  }

  // deprecated, performance sucks. use getFilePaths
  static async getFilesInDirectory(dir: string, excludedDirs?: string[], rootDir?: string,): Promise<FileDescriptor[]> {
    let results: FileDescriptor[] = [];
    if (!rootDir)
      rootDir = dir;

    const dirents = await fsExtra.readdir(dir, { withFileTypes: true });

    for (const dirent of dirents) {
        const fullPath = path.resolve(dir, dirent.name);

        if (dirent.isDirectory()) {
            if (excludedDirs && !excludedDirs.includes(dirent.name)) {
                results = results.concat(await Fs.getFilesInDirectory(fullPath, excludedDirs, rootDir));
            }
        } else {
            const fileDescriptor: FileDescriptor = {
                name: dirent.name,
                nameWithoutExtension: path.parse(dirent.name).name,
                path: fullPath,
                projectRelativePath: path.relative(rootDir, fullPath)
            };
            results.push(fileDescriptor);
        }
    }

    return results;
  }

  static async rename(oldPath: string, newName: string) {
    const newPath = path.join(path.dirname(oldPath), newName);
    await fsExtra.rename(oldPath, newPath);
    Fs.LOGGER.info(`Renamed: ${oldPath} to ${newPath}`);
  }

  static async copy(sourcePath: string, destinationPath: string) {
    await fsExtra.copy(sourcePath, destinationPath);
    Fs.LOGGER.info(`Copied: ${sourcePath} to ${destinationPath}`);
  }

  static async move(sourcePath: string, destinationPath: string) {
    await fsExtra.move(sourcePath, destinationPath);
    Fs.LOGGER.info(`Moved: ${sourcePath} to ${destinationPath}`);
  }
}