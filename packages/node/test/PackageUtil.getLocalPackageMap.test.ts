import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { PackageUtil } from '../src/PackageUtil';

/**
 * Regression tests for PackageUtil.getLocalPackageMap — workspace package discovery.
 *
 * The important property: discovery is a BOUNDED walk. It must not descend into
 * hidden (dot-prefixed) directories, `node_modules`, or `dist`, and must never
 * follow symlinks. The prior glob-based implementation violated all three at
 * once in one spot: micromatch's default `dot: false` makes a leading `**` in
 * an ignore pattern refuse to cross dot-segments, so beneath a hidden directory
 * (e.g. a `.scratch/` full of throwaway checkouts) the
 * `['**\/node_modules/**', '**\/dist/**']` ignores matched nothing while the
 * walker still descended and followed symlinks — an unbounded traversal that
 * OOMed every workspace command regardless of heap size.
 */
describe('PackageUtil.getLocalPackageMap — bounded discovery', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pkg-discovery-'));
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {
        /* ignore */
      });
    }
  });

  const writePackageJson = async (relDir: string, name: string) => {
    const dir = path.join(workspaceRoot, relDir);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }, null, 2));
  };

  /**
   * The incident signature, compressed: a hidden directory containing a
   * checkout whose `node_modules` holds symlinks back to the checkout root.
   * The old glob walker descended into `.scratch` (hidden dirs were not
   * pruned), its node_modules ignore was dead under the dot-segment
   * (micromatch `dot: false`), and it followed the symlinks — several cycle
   * links give the expansion a branching factor, so the path space grows
   * combinatorially (`loopN/node_modules/loopM/...`) and the walk allocates
   * unboundedly, exactly the OOM every workspace command hit. Bounded
   * discovery never enters `.scratch` at all, so this returns instantly.
   */
  it('does not descend into hidden directories (unbounded-traversal incident repro)', async () => {
    await writePackageJson('.', 'root');
    await writePackageJson('packages/a', '@test/a');
    await writePackageJson('.scratch/checkout/packages/b', '@test/b');
    const checkoutDir = path.join(workspaceRoot, '.scratch', 'checkout');
    await fs.mkdir(path.join(checkoutDir, 'node_modules'), { recursive: true });
    for (let i = 0; i < 4; i++) {
      await fs.symlink(checkoutDir, path.join(checkoutDir, 'node_modules', `loop${i}`));
    }

    const packageMap = await PackageUtil.getLocalPackageMap(workspaceRoot);

    expect(Object.keys(packageMap).sort()).toEqual(['@test/a', 'root']);
  }, 10000);

  it('does not follow symlinked directories', async () => {
    await writePackageJson('packages/a', '@test/a');
    // A package OUTSIDE the workspace, reachable only via symlink — the old
    // walker followed the link and admitted @test/outside as a member.
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pkg-outside-'));
    try {
      await fs.mkdir(path.join(outsideDir, 'c'), { recursive: true });
      await fs.writeFile(
        path.join(outsideDir, 'c', 'package.json'),
        JSON.stringify({ name: '@test/outside', version: '1.0.0' })
      );
      await fs.symlink(path.join(outsideDir, 'c'), path.join(workspaceRoot, 'packages', 'linked'));

      const packageMap = await PackageUtil.getLocalPackageMap(workspaceRoot);

      expect(Object.keys(packageMap)).toEqual(['@test/a']);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('does not descend into node_modules or dist', async () => {
    await writePackageJson('packages/a', '@test/a');
    await writePackageJson('packages/a/node_modules/dep', '@test/dep');
    await writePackageJson('packages/a/dist', '@test/dist-artifact');

    const packageMap = await PackageUtil.getLocalPackageMap(workspaceRoot);

    expect(Object.keys(packageMap)).toEqual(['@test/a']);
  });

  it('survives a symlink cycle in the open (non-hidden) tree', async () => {
    await writePackageJson('packages/a', '@test/a');
    // Symlink from inside a package back to the workspace root — a cycle the
    // old walker expanded path-by-path until the kernel refused to resolve it.
    await fs.symlink(workspaceRoot, path.join(workspaceRoot, 'packages', 'a', 'back-to-root'));

    const packageMap = await PackageUtil.getLocalPackageMap(workspaceRoot);

    expect(Object.keys(packageMap)).toEqual(['@test/a']);
  });
});
