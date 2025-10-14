import path from 'path';
import fsExtra from 'fs-extra';
import fs from 'fs/promises';
import globby from 'globby';
import { cmd } from './cmd';

export type File = {
  path: string;
  content: string;
};

export type FileContentMap = {
  [filePath: string]: string;
};

export interface FileDescriptor {
  name: string;
  nameWithoutExtension: string;
  path: string;
  projectRelativePath: string;
}

export type GrepMatch = {
  path: string;
  line: number;
  excerpt: string;
};

export class Fs {
  static async exists(path: string) {
    return await fsExtra.exists(path);
  }

  static async createFolder(path: string) {
    await fs.mkdir(path, { recursive: true });
  }

  static async deleteFolder(path: string) {
    await fsExtra.remove(path);
  }

  static async readFiles(filePaths: string[]) {
    const fileMap: FileContentMap = {};
    for (const filePath of filePaths) {
      const fp = `${filePath}`;
      fileMap[fp] = await Fs.readFile(fp);
    }
    return fileMap;
  }

  static async readFile(filePath: string) {
    if (!(await fsExtra.exists(filePath))) {
      throw new Error(`File does not exist at path: ${filePath}`);
    }

    const fileContent = (await fsExtra.readFile(filePath)).toString();
    if (!fileContent) {
      throw new Error(`File is empty: ${filePath}`);
    }

    return fileContent;
  }

  static async writeFiles(files: File[]) {
    for (const file of files) {
      await fsExtra.ensureFile(file.path);
      await fsExtra.writeFile(file.path, file.content);
    }
  }

  /** Produces a join only if the relative path does not escape the base path */
  static baseContainedJoin(basePath: string, relativePath: string) {
    if (relativePath.includes('..')) {
      throw new Error(`Failed to access file: ${relativePath}, file path cannot contain '..'`);
    }

    return path.join(basePath, relativePath);
  }

  static relativeFilePath(fromRelativePath: string, toRelativePath: string) {
    return path.join(
      path.relative(path.parse(fromRelativePath).dir, path.parse(toRelativePath).dir),
      path.parse(toRelativePath).name
    );
  }

  // @param dir to recursively search for files
  // @param globIgnorePatterns ie. ['**/node_modules/**', '**/dist/**'] to ignore these directories
  // @return string[] of file paths
  static async getFilePaths(dir: string, globIgnorePatterns: string[] = []) {
    return await globby(dir + '**/*', {
      ignore: [...globIgnorePatterns],
    });
  }

  // @param dirPrefix recursively search for files in this dir
  // @param glob file matching pattern ie. **/package.json
  // @param globIgnorePatterns ie. ['**/node_modules/**', '**/dist/**'] to ignore these directories
  // @return string[] of file paths
  static async getFilePathsMatchingGlob(dirPrefix: string, glob: string, globIgnorePatterns: string[] = []) {
    if (dirPrefix[dirPrefix.length - 1] != path.sep) {
      dirPrefix += path.sep;
    }

    return await globby(dirPrefix + glob, {
      ignore: [...globIgnorePatterns],
    });
  }

  // deprecated, performance sucks. use getFilePaths
  static async getFilesInDirectory(dir: string, excludedDirs?: string[], rootDir?: string): Promise<FileDescriptor[]> {
    let results: FileDescriptor[] = [];
    if (!rootDir) {
      rootDir = dir;
    }

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
          projectRelativePath: path.relative(rootDir, fullPath),
        };
        results.push(fileDescriptor);
      }
    }

    return results;
  }

  static async rename(oldPath: string, newName: string) {
    const newPath = path.join(path.dirname(oldPath), newName);
    await fsExtra.rename(oldPath, newPath);
  }

  static async copy(sourcePath: string, destinationPath: string) {
    await fsExtra.copy(sourcePath, destinationPath);
  }

  static async move(sourcePath: string, destinationPath: string) {
    await fsExtra.move(sourcePath, destinationPath);
  }

  /**
   * Minimal, robust grep wrapper.
   * - Literal search (-F) to avoid regex surprises like "parentheses not balanced"
   * - Recursive (-R), show file and line (-nH), no color, ignore binary (-I)
   * - Excludes heavy dirs: node_modules, dist, .git, generated, protein
   * - Optional maxColumns (default 500) truncates each output line via `cut -c1-N`
   * - Returns { code, stdout, stderr } without throwing on non-zero exit codes.
   */
  static async grep(params: {
    pattern: string;
    dir?: string; // search root; defaults to process.cwd()
    maxResults?: number; // passed as -m <N>
    maxColumns?: number; // truncates each output line via cut -c1-N (default 500). Set <=0 to disable.
  }): Promise<{ code: number; stdout: string; stderr: string }> {
    const { pattern, dir, maxResults, maxColumns } = params || {};
    if (!pattern || typeof pattern !== 'string') {
      throw new Error('Fs.grep: "pattern" (string) is required.');
    }
    const cwd = dir || process.cwd();

    const args: string[] = [
      '-R', // recurse
      '-n', // line numbers
      '-H', // show filename
      '-I', // ignore binary files
      '--color=never',
      '-F', // literal match (no regex surprises)
      '--exclude-dir=node_modules',
      '--exclude-dir=dist',
      '--exclude-dir=.git',
      '--exclude-dir=generated',
      '--exclude-dir=protein',
      '--exclude=CHANGELOG.md',
    ];

    if (typeof maxResults === 'number' && maxResults > 0) {
      args.push('-m', String(maxResults));
    }

    // Use -e to ensure the pattern is treated as a single argument
    args.push('-e', pattern, '.');

    // Helper to shell-escape args when we build a pipeline string
    const shEscape = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;

    const cols = typeof maxColumns === 'number' ? maxColumns : 500;

    try {
      if (cols > 0) {
        // Truncate with cut; preserve grep's exit code using pipefail
        const grepCmd = ['grep', ...args].map(shEscape).join(' ');
        const pipeline = `set -o pipefail; ${grepCmd} | cut -c1-${cols}`;
        const res = await cmd('bash', ['-lc', pipeline], { cwd });
        return res; // { code: 0, stdout, stderr: '' } on success
      } else {
        // No truncation requested
        const res = await cmd('grep', args, { cwd });
        return res;
      }
    } catch (e: any) {
      // Translate rejection into a structured result (no throw)
      const code = typeof e?.code === 'number' ? e.code : -1;
      const stdout = typeof e?.stdout === 'string' ? e.stdout : '';
      const stderr = typeof e?.stderr === 'string' ? e.stderr : String(e);
      return { code, stdout, stderr };
    }
  }
}
