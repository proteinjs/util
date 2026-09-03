import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Fs } from '../src/Fs';

/**
 * Regression tests for the `Fs` glob helpers: the ignore patterns must PRUNE excluded
 * directories, not merely filter them out of the results.
 *
 * `Fs` used to fold the base directory into one absolute pattern (`<dir>/<glob>`) and hand
 * fast-glob the ignore list, which fast-glob then matched against the ABSOLUTE entry path. A
 * globstar does not cross a dot-segment, so whenever the base path itself contained a
 * dot-directory (`~/.n3xa/workspaces/<name>` — the default local workspaces root — or a
 * `.scratch` estate) the ignore list matched nothing: the walk entered every node_modules/dist
 * and followed the workspace symlinks inside them. On a materialized metarepo (70+
 * node_modules trees) that is millions of entries held in fast-glob's unique-index, and the
 * dev-skill Glob of every package.json exhausted a 12G heap three times running (2026-09-02).
 * Matching relative to `cwd` keeps the ignore list and the entry paths in the same frame, so
 * the prune holds under any base path.
 *
 * The oracle: an unreadable directory inside node_modules, under a dot-directory base path.
 * A walk that enters node_modules hits EACCES, which fast-glob treats as fatal, and the call
 * rejects; a pruned walk never sees it and resolves.
 */
describe('Fs glob helpers prune ignored directories under a dot-directory base path', () => {
  const IGNORE = ['**/node_modules/**', '**/dist/**'];
  let root: string;
  let locked: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), '.fs-glob-prune-'));
    locked = path.join(root, 'node_modules', 'dep', 'locked');
    await fs.mkdir(locked, { recursive: true });
    await fs.mkdir(path.join(root, 'packages', 'pkg', 'src'), { recursive: true });
    await fs.mkdir(path.join(root, 'dist'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), '{}');
    await fs.writeFile(path.join(root, 'packages', 'pkg', 'package.json'), '{}');
    await fs.writeFile(path.join(root, 'packages', 'pkg', 'src', 'b.ts'), '');
    await fs.writeFile(path.join(root, 'node_modules', 'dep', 'package.json'), '{}');
    await fs.writeFile(path.join(root, 'dist', 'out.js'), '');
    await fs.chmod(locked, 0o000);
  });

  afterEach(async () => {
    await fs.chmod(locked, 0o755).catch(() => undefined);
    await fs.rm(root, { recursive: true, force: true });
  });

  const relative = (paths: string[]) => paths.map((p) => path.relative(root, p)).sort();

  // chmod 000 does not stop root; the oracle is meaningless there.
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const it = asRoot ? test.skip : test;

  it('getFilePathsMatchingGlob never enters node_modules, returns absolute paths', async () => {
    const out = await Fs.getFilePathsMatchingGlob(root, '**/package.json', IGNORE);
    expect(out.every((p) => path.isAbsolute(p))).toBe(true);
    expect(relative(out)).toEqual(['package.json', 'packages/pkg/package.json']);
  });

  it('getFilePathsMatchingGlob: a trailing separator on the directory changes nothing', async () => {
    const out = await Fs.getFilePathsMatchingGlob(root + path.sep, '**/package.json', IGNORE);
    expect(relative(out)).toEqual(['package.json', 'packages/pkg/package.json']);
  });

  it('getFilePaths walks the whole tree except the ignored directories', async () => {
    const out = await Fs.getFilePaths(root, IGNORE);
    expect(relative(out)).toEqual(['package.json', 'packages/pkg/package.json', 'packages/pkg/src/b.ts']);
  });
});
