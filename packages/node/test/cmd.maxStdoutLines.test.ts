import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { cmd } from '../src/cmd';

/**
 * `cmd`'s bounded read (ask 1553, finding 2): `maxStdoutLines` ends the child once that many lines
 * of stdout have arrived and resolves with exactly those lines, code 0 — the ended child is not an
 * error. Spawned `detached`, the child is its own process group, so the end reaches a shell AND the
 * pipeline it runs (grep | cut under `Fs.grep`).
 *
 * The oracle: a shell that writes its pid, prints 300 lines, then sleeps 30 s holding stdout open.
 * `cmd` resolves only when stdout closes, so resolving within the test's 10 s proves the bound ended
 * the shell and its sleep before the sleep could end on its own; the pid it wrote is gone after.
 * RED at the base: the call resolves after the full 30 s — jest's 10 s timeout. The fixture ends
 * itself either way; nothing is left running.
 */
describe('cmd — maxStdoutLines ends the child at the bound', () => {
  let root: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmd-bound-'));
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('resolves with exactly the bound’s lines, code 0, the child’s pid gone', async () => {
    const pidFile = path.join(root, 'pid');
    const script = 'echo $$ > "$1"; for i in $(seq 1 300); do echo needle; done; sleep 30';
    const logOptions = { maxStdoutLines: 200, omitLogs: { stdout: { omit: true }, stderr: { omit: true } } };
    const res = await cmd('bash', ['-c', script, '_', pidFile], { detached: true }, logOptions);
    expect(res.code).toBe(0);
    const lines = res.stdout.split('\n').filter((line) => line.length > 0);
    expect(lines).toHaveLength(200);
    expect(lines.every((line) => line === 'needle')).toBe(true);

    const pid = Number((await fs.readFile(pidFile, 'utf8')).trim());
    expect(pid).toBeGreaterThan(0);
    // kill(pid, 0) throws ESRCH when no such process remains.
    expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
  }, 10_000);
});
