import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { Fs } from '../src/Fs';

/**
 * Regression tests for the symlink-traversal OOM class (2026-08-24: three dev-server heap
 * deaths at 8-16GB under metarepo-scale dev-task lanes).
 *
 * The important property: `Fs.getFilePaths` / `Fs.getFilePathsMatchingGlob` / `Fs.grep` must
 * NOT follow directory symlinks while walking. A workspace full of symlinks (workspace
 * shortcuts, lane checkouts) multiplies the walk through every link, and ONE ancestor-pointing
 * link (observed: `packages/user/packages/server/server -> <itself>`) makes the walk INFINITE —
 * fast-glob has no cycle guard, so a single Glob/Grep tool call allocates the entire heap of
 * the process that runs it (the dev server) and kills it. Each real file must be reported
 * exactly once, at its real path.
 */
describe('Fs walkers do not follow directory symlinks', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-symlink-walk-'));
    // real/a.txt — the one real file the walk should find.
    await fs.mkdir(path.join(root, 'real'));
    await fs.writeFile(path.join(root, 'real', 'a.txt'), 'needle-content\n');
    // real/loop -> . : the ancestor-pointing link (the observed workspace litter shape). A
    // follower walks real/loop/loop/loop/... until path-length limits or the heap dies.
    await fs.symlink('.', path.join(root, 'real', 'loop'));
    // shortcut -> real : the finite multiplication shape (workspace shortcut farms). A
    // follower reports every real file a second time under the shortcut path.
    await fs.symlink(path.join(root, 'real'), path.join(root, 'shortcut'));
  });

  afterEach(async () => {
    if (root) {
      await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('getFilePathsMatchingGlob returns each real file exactly once', async () => {
    const matches = await Fs.getFilePathsMatchingGlob(root, '**/*.txt');
    expect(matches).toEqual([path.join(root, 'real', 'a.txt')]);
  });

  it('getFilePaths returns each real file exactly once', async () => {
    const paths = await Fs.getFilePaths(root + path.sep);
    expect(paths.filter((p) => p.endsWith('a.txt'))).toEqual([path.join(root, 'real', 'a.txt')]);
  });

  it('grep reports each real match exactly once', async () => {
    const { stdout } = await Fs.grep({ pattern: 'needle-content', dir: root });
    const matchLines = stdout.split('\n').filter((l) => l.includes('needle-content'));
    expect(matchLines).toHaveLength(1);
    expect(matchLines[0]).toContain(`real${path.sep}a.txt`);
  });
});
