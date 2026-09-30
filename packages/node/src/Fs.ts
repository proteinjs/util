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

  static async deleteFiles(paths: string[]) {
    for (const p of paths) {
      const fp = `${p}`;
      if (!(await fsExtra.exists(fp))) {
        throw new Error(`File does not exist at path: ${fp}`);
      }

      const stat = await fsExtra.lstat(fp);
      if (stat.isDirectory()) {
        throw new Error(`Path is a directory, not a file: ${fp}`);
      }

      await fs.unlink(fp);
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
    return await Fs.getFilePathsMatchingGlob(dir, '**/*', globIgnorePatterns);
  }

  // @param dirPrefix recursively search for files in this dir
  // @param glob file matching pattern ie. **/package.json
  // @param globIgnorePatterns ie. ['**/node_modules/**', '**/dist/**'] to ignore these directories
  // @return string[] of absolute file paths
  static async getFilePathsMatchingGlob(dirPrefix: string, glob: string, globIgnorePatterns: string[] = []) {
    // Match relative to the directory (`cwd`) rather than folding it into an absolute pattern.
    // In the absolute form fast-glob matched the ignore list against the absolute entry path,
    // and a globstar does not cross a dot-segment — so under any base path containing a
    // dot-directory (`~/.n3xa/workspaces/<name>`, a `.scratch` estate) the ignore list matched
    // nothing: every node_modules/dist was walked in full, workspace symlinks followed into
    // cycles, and the caller ran out of heap on a large tree. Relative matching keeps the ignore
    // list and the entry paths in the same frame, so the prune holds under any base path.
    return await globby(glob, {
      cwd: dirPrefix,
      absolute: true,
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
   * - `dir` is the search path: a directory is searched recursively from within (rows
   *   `./rel:line:text`); a FILE is searched alone, from its directory by name (rows
   *   `name:line:text`); a path that is neither rejects with `no such file or directory: <path>` —
   *   never a spawn error (ask 1553: a file as the child's cwd read "spawn ENOTDIR")
   * - Optional maxColumns (default 500) truncates each output line via `cut -c1-N`
   * - Optional maxLines: the child is ended at that many matching lines and the result holds exactly
   *   them (`cmd`'s `maxStdoutLines`; the ended child is not an error) — a consumer's page bound is
   *   also the work bound (ask 1553: every hit was read into memory before the consumer paged)
   * - Resolves { code, stdout, stderr }; rejects on a non-zero exit (grep's 1 = no matches, 2 = failure).
   */
  static async grep(params: {
    pattern: string;
    dir?: string; // the search path — a directory, or a file to search alone; defaults to process.cwd()
    maxResults?: number; // passed as -m <N> (grep's per-FILE cap)
    maxColumns?: number; // truncates each output line via cut -c1-N (default 500). Set <=0 to disable.
    maxLines?: number; // total matching lines to read; the child is ended past it
  }): Promise<{ code: number; stdout: string; stderr: string }> {
    const { pattern, dir, maxResults, maxColumns, maxLines } = params || {};
    if (!pattern || typeof pattern !== 'string') {
      throw new Error('Fs.grep: "pattern" (string) is required.');
    }
    const { cwd, target } = await Fs.grepTarget(dir || process.cwd());

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
      '--exclude=package-lock.json',
    ];

    if (typeof maxResults === 'number' && maxResults > 0) {
      args.push('-m', String(maxResults));
    }

    // Use -e to ensure the pattern is treated as a single argument
    args.push('-e', pattern, target);

    // Helper to shell-escape args when we build a pipeline string
    const shEscape = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;

    const cols = typeof maxColumns === 'number' ? maxColumns : 500;

    // cols > 0: truncate with cut, grep's exit code preserved by pipefail; else grep alone.
    const grepCmd = ['grep', ...args].map(shEscape).join(' ');
    const [command, commandArgs]: [string, string[]] =
      cols > 0 ? ['bash', ['-lc', `set -o pipefail; ${grepCmd} | cut -c1-${cols}`]] : ['grep', args];

    // `detached`: the child is its own process group, so `maxLines` ends grep, cut and the shell
    // together, not the shell alone.
    return await cmd(
      command,
      commandArgs,
      { cwd, detached: true },
      {
        maxStdoutLines: maxLines,
        omitLogs: {
          stdout: { omit: true },
          stderr: { omit: true },
        },
      }
    );
  }

  /** The child's cwd and grep's target for a search path: a directory is searched from within
   * (`.`), a file from its directory by name; a path that is neither a file nor a directory is
   * named in the tool's own words. */
  private static async grepTarget(searchPath: string): Promise<{ cwd: string; target: string }> {
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(searchPath);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new Error(`no such file or directory: ${searchPath}`);
      }
      throw error;
    }
    if (stat.isDirectory()) {
      return { cwd: searchPath, target: '.' };
    }
    if (stat.isFile()) {
      return { cwd: path.dirname(searchPath), target: path.basename(searchPath) };
    }
    throw new Error(`no such file or directory: ${searchPath}`);
  }
}
