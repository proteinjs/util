import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { PackageUtil } from '../src/PackageUtil';

/**
 * Regression tests for path-keyed package identity (metarepo issue #75).
 *
 * Every workspace root in the metarepo is named `root` — the metarepo root, the app root, and
 * each nested lerna root (proteinjs, util, build, ...). Package IDENTITY must therefore be the
 * package.json path, never the name: a name-keyed discovery map silently drops all but one of
 * the same-named packages, and closure computation seeded from a shared name-keyed graph node
 * conflates their dependencies.
 *
 * Live failure this reproduces: the app root (named `root`, declaring a registry dep on
 * @proteinjs/build) collided with the metarepo root in the name-keyed packageMap and was
 * additionally skipped by symlink-workspace's `root` skip — so its node_modules kept a STALE
 * REGISTRY copy of @proteinjs/build (carrying an old @proteinjs/util-node) indefinitely, and
 * the dev-server OOM persisted after the workspace fix had shipped.
 *
 * Fixture shape (mirrors the metarepo): two packages BOTH named `root` with DIFFERENT deps,
 * plus regular workspace packages. Each root's closure and symlinks must derive from its OWN
 * declarations.
 */
describe('PackageUtil — path-keyed package identity (same-named packages)', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pkg-identity-'));
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {
        /* ignore */
      });
    }
  });

  /** Write a package.json and return its absolute file path. */
  const writePackageJson = async (
    relDir: string,
    name: string,
    deps: Record<string, string> = {},
    devDeps: Record<string, string> = {}
  ): Promise<string> => {
    const dir = path.join(workspaceRoot, relDir);
    await fs.mkdir(dir, { recursive: true });
    const pkgPath = path.join(dir, 'package.json');
    await fs.writeFile(
      pkgPath,
      JSON.stringify({ name, version: '1.0.0', dependencies: deps, devDependencies: devDeps }, null, 2)
    );
    return pkgPath;
  };

  /**
   * The metarepo shape: metarepo root and app root are BOTH named `root`, with different
   * workspace deps. `@test/build` itself depends on `@test/util-node` (the live transitive
   * chain that carried the stale code).
   */
  const writeMetarepoFixture = async () => {
    const metarepoRootPath = await writePackageJson('.', 'root', {}, { '@test/build': '^1.0.0' });
    const appRootPath = await writePackageJson('packages/app', 'root', {}, { '@test/app-lib': '^1.0.0' });
    const buildPath = await writePackageJson('packages/tools/build', '@test/build', {
      '@test/util-node': '^1.0.0',
    });
    const utilNodePath = await writePackageJson('packages/tools/util-node', '@test/util-node');
    const appLibPath = await writePackageJson('packages/app/packages/app-lib', '@test/app-lib');
    return { metarepoRootPath, appRootPath, buildPath, utilNodePath, appLibPath };
  };

  test('discovery retains every same-named package, path-keyed', async () => {
    const { metarepoRootPath, appRootPath } = await writeMetarepoFixture();

    const packagePathMap = await PackageUtil.getLocalPackagePathMap(workspaceRoot);

    // Both `root`-named packages are distinct entries under their own package.json paths.
    expect(packagePathMap[metarepoRootPath]?.name).toBe('root');
    expect(packagePathMap[appRootPath]?.name).toBe('root');
    expect(Object.keys(packagePathMap)).toHaveLength(5);

    // Workspace metadata carries the same collision-free map; the name-keyed index still
    // resolves real (unique) dependency names.
    const metadata = await PackageUtil.getWorkspaceMetadata(workspaceRoot);
    expect(Object.keys(metadata.packagePathMap)).toHaveLength(5);
    expect(metadata.packageMap['@test/build'].filePath).toBe(
      path.join(workspaceRoot, 'packages/tools/build/package.json')
    );
  });

  test('transitive closure derives from the given package instance, not a shared name-keyed node', async () => {
    const { metarepoRootPath, appRootPath } = await writeMetarepoFixture();
    const packageMap = await PackageUtil.getLocalPackageMap(workspaceRoot);

    // Construct the LocalPackage records from disk truth (discovery may or may not retain
    // both same-named packages in a name-keyed map — closure must be correct regardless of
    // which instance we hand it).
    const metarepoRoot = {
      name: 'root',
      filePath: metarepoRootPath,
      packageJson: JSON.parse(await fs.readFile(metarepoRootPath, 'utf-8')),
    };
    const appRoot = {
      name: 'root',
      filePath: appRootPath,
      packageJson: JSON.parse(await fs.readFile(appRootPath, 'utf-8')),
    };

    const metarepoClosure = await PackageUtil.getTransitiveWorkspaceDependencies(metarepoRoot, packageMap);
    const appClosure = await PackageUtil.getTransitiveWorkspaceDependencies(appRoot, packageMap);

    // The metarepo root declares @test/build (which pulls @test/util-node) — and nothing else.
    expect(metarepoClosure.sort()).toEqual(['@test/build', '@test/util-node']);
    // The app root declares @test/app-lib — and nothing else. A name-keyed traversal seeded
    // from the shared `root` node returns the OTHER root's deps here.
    expect(appClosure.sort()).toEqual(['@test/app-lib']);
  });

  test('symlinkDependencies links each same-named consumer to ITS OWN workspace closure', async () => {
    const { metarepoRootPath, appRootPath } = await writeMetarepoFixture();
    const packageMap = await PackageUtil.getLocalPackageMap(workspaceRoot);
    const metarepoRoot = {
      name: 'root',
      filePath: metarepoRootPath,
      packageJson: JSON.parse(await fs.readFile(metarepoRootPath, 'utf-8')),
    };
    const appRoot = {
      name: 'root',
      filePath: appRootPath,
      packageJson: JSON.parse(await fs.readFile(appRootPath, 'utf-8')),
    };

    await PackageUtil.symlinkDependencies(metarepoRoot, packageMap);
    await PackageUtil.symlinkDependencies(appRoot, packageMap);

    // Metarepo root gets its own closure: build + util-node, NOT app-lib.
    const metarepoNodeModules = path.join(workspaceRoot, 'node_modules');
    await expectSymlinkTo(
      path.join(metarepoNodeModules, '@test/build'),
      path.join(workspaceRoot, 'packages/tools/build')
    );
    await expectSymlinkTo(
      path.join(metarepoNodeModules, '@test/util-node'),
      path.join(workspaceRoot, 'packages/tools/util-node')
    );
    await expectAbsent(path.join(metarepoNodeModules, '@test/app-lib'));

    // App root gets ITS closure: app-lib only, NOT the metarepo root's build chain.
    const appNodeModules = path.join(workspaceRoot, 'packages/app/node_modules');
    await expectSymlinkTo(
      path.join(appNodeModules, '@test/app-lib'),
      path.join(workspaceRoot, 'packages/app/packages/app-lib')
    );
    await expectAbsent(path.join(appNodeModules, '@test/build'));
  });

  const expectSymlinkTo = async (linkPath: string, expectedTargetDir: string) => {
    const stat = await fs.lstat(linkPath).catch(() => undefined);
    expect(stat?.isSymbolicLink() ?? false).toBe(true);
    const resolved = await fs.realpath(linkPath);
    expect(resolved).toBe(await fs.realpath(expectedTargetDir));
  };

  const expectAbsent = async (linkPath: string) => {
    const stat = await fs.lstat(linkPath).catch(() => undefined);
    expect(stat).toBeUndefined();
  };
});
