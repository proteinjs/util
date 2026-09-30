import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Fs } from '../src/Fs';

/**
 * Two findings on `Fs.grep` from the sandbox's grep door (capability-agent's
 * `DevelopmentWorkspace.grep`, ask 1553):
 *
 * (1) Given a FILE as its path it used the path as the child's cwd, and the model read
 *     "spawn ENOTDIR". The law: a path that is a file searches that file (rows relative to it,
 *     `name:line:text`); a directory is searched as before (`./rel:line:text`); a path that is
 *     neither a file nor a directory rejects with the tool's own words,
 *     `no such file or directory: <path>` — never a spawn error.
 * (2) It read every hit into memory before the consumer paged — no bound on the work. The law:
 *     `maxLines` ends the child at the bound; the result holds exactly that many lines and the
 *     ended child is not an error, so the page bound a consumer sets is also the work bound.
 *
 * RED at the base: (1) the file path and the missing path both reject with
 * "spawn error for 'bash -lc …'"; (2) the 100,000-hit flood comes back whole for maxLines 200.
 */
describe('Fs.grep — a file path searches the file; a missing path is named; maxLines bounds the work', () => {
  let root: string;
  const rows = (stdout: string) => stdout.split('\n').filter((line) => line.length > 0);

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-grep-'));
    await fs.mkdir(path.join(root, 'dir'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'dir', 'one.ts'),
      Array.from({ length: 3 }, (_, i) => `const a${i} = 'needle';`).join('\n') + '\n'
    );
    await fs.writeFile(path.join(root, 'dir', 'two.ts'), "const b = 'needle';\n");
    // 100 files × 1,000 matching lines = 100,000 hits.
    await fs.mkdir(path.join(root, 'flood'));
    const body = Array.from({ length: 1_000 }, (_, i) => `line ${i} flood-needle`).join('\n') + '\n';
    for (let f = 0; f < 100; f++) {
      await fs.writeFile(path.join(root, 'flood', `f${f}.txt`), body);
    }
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('searches the one file when the path is a file — its rows, never a spawn error', async () => {
    const { code, stdout } = await Fs.grep({ pattern: 'needle', dir: path.join(root, 'dir', 'one.ts') });
    expect(code).toBe(0);
    expect(rows(stdout)).toEqual([
      "one.ts:1:const a0 = 'needle';",
      "one.ts:2:const a1 = 'needle';",
      "one.ts:3:const a2 = 'needle';",
    ]);
  });

  it('searches a directory recursively as before — rows relative to it', async () => {
    const { code, stdout } = await Fs.grep({ pattern: 'needle', dir: path.join(root, 'dir') });
    expect(code).toBe(0);
    expect(rows(stdout).sort()).toEqual([
      "./one.ts:1:const a0 = 'needle';",
      "./one.ts:2:const a1 = 'needle';",
      "./one.ts:3:const a2 = 'needle';",
      "./two.ts:1:const b = 'needle';",
    ]);
  });

  it('names a path that is neither a file nor a directory in its own words', async () => {
    const missing = path.join(root, 'nope', 'gone.ts');
    await expect(Fs.grep({ pattern: 'needle', dir: missing })).rejects.toThrow(`no such file or directory: ${missing}`);
  });

  it('maxLines ends the child at the bound — exactly maxLines of the 100,000 hits, code 0', async () => {
    const params = { pattern: 'flood-needle', dir: path.join(root, 'flood'), maxLines: 200 };
    const { code, stdout } = await Fs.grep(params);
    expect(code).toBe(0);
    const lines = rows(stdout);
    expect(lines).toHaveLength(200);
    expect(lines.every((line) => /^\.\/f\d+\.txt:\d+:line \d+ flood-needle$/.test(line))).toBe(true);
  });
});
