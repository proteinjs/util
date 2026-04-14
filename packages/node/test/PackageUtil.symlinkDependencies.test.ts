import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { PackageUtil, LocalPackage, LocalPackageMap } from '../src/PackageUtil';

/**
 * Regression tests for PackageUtil.symlinkDependencies.
 *
 * The important property: the symlinks it creates must use RELATIVE targets
 * so the workspace is portable across mount points. If absolute paths slip
 * back in, a symlinked workspace breaks whenever its root directory moves
 * (developer laptop vs CI container vs sandbox vs coworker's checkout), and
 * every environment change requires re-running `symlink-workspace`.
 */
describe('PackageUtil.symlinkDependencies — relative link targets', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'symlink-rel-'));
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {
        /* ignore — directory may have already been moved */
      });
    }
  });

  /**
   * Create a package.json on disk and return the `LocalPackage` record that
   * `symlinkDependencies` expects.
   */
  const writePackage = async (
    relPath: string,
    name: string,
    deps: Record<string, string> = {}
  ): Promise<LocalPackage> => {
    const dir = path.join(workspaceRoot, relPath);
    await fs.mkdir(dir, { recursive: true });
    const pkgPath = path.join(dir, 'package.json');
    const packageJson = { name, version: '1.0.0', dependencies: deps };
    await fs.writeFile(pkgPath, JSON.stringify(packageJson, null, 2));
    return { name, filePath: pkgPath, packageJson };
  };

  test('created symlink target is relative, not absolute', async () => {
    const depPkg = await writePackage('packages/dep', '@scope/dep');
    const consumerPkg = await writePackage('packages/consumer', '@scope/consumer', {
      '@scope/dep': '^1.0.0',
    });
    const packageMap: LocalPackageMap = {
      '@scope/dep': depPkg,
      '@scope/consumer': consumerPkg,
    };

    await PackageUtil.symlinkDependencies(consumerPkg, packageMap);

    const symlinkPath = path.join(workspaceRoot, 'packages/consumer/node_modules/@scope/dep');
    const linkTarget = await fs.readlink(symlinkPath);

    expect(path.isAbsolute(linkTarget)).toBe(false);
    // From .../packages/consumer/node_modules/@scope up to .../packages, then down to dep.
    expect(linkTarget).toBe(path.join('..', '..', '..', 'dep'));
  });

  test('symlink still resolves after the workspace is moved to a new root', async () => {
    const depPkg = await writePackage('packages/dep', '@scope/dep');
    const consumerPkg = await writePackage('packages/consumer', '@scope/consumer', {
      '@scope/dep': '^1.0.0',
    });
    const packageMap: LocalPackageMap = {
      '@scope/dep': depPkg,
      '@scope/consumer': consumerPkg,
    };

    // Drop a marker file inside the dep package so we can verify the symlink
    // resolves into it by path after the move.
    const markerRelativePath = path.join('packages/consumer/node_modules/@scope/dep/marker.txt');
    await fs.writeFile(path.join(workspaceRoot, 'packages/dep/marker.txt'), 'hello');

    await PackageUtil.symlinkDependencies(consumerPkg, packageMap);

    // Move the entire workspace to a new absolute path. If the symlink target
    // were absolute (pointing at the old workspaceRoot), every resolution
    // through it would now fail. With a relative target it continues to work.
    const movedRoot = workspaceRoot + '-moved';
    await fs.rename(workspaceRoot, movedRoot);
    const prevRoot = workspaceRoot;
    workspaceRoot = movedRoot; // redirect afterEach cleanup at the new location

    const markerThroughSymlink = path.join(movedRoot, markerRelativePath);
    const content = await fs.readFile(markerThroughSymlink, 'utf8');
    expect(content).toBe('hello');

    // Sanity check: confirm the old absolute path really is gone, so we know
    // the move happened and we're not accidentally resolving through the
    // original location via some leftover absolute link.
    await expect(fs.stat(prevRoot)).rejects.toThrow();
  });

  test('replaces a pre-existing BROKEN symlink (prior run pointed at a now-missing path)', async () => {
    // Regression test for the Fs.exists-vs-broken-symlink bug.
    //
    // `Fs.exists` is stat-backed: it follows symlinks and throws on a
    // broken target, so broken symlinks read as "doesn't exist". If
    // symlinkDependencies relied on Fs.exists alone to decide whether to
    // pre-delete, a broken symlink from a prior run (e.g. a sandbox with
    // a different mount point, a cross-machine checkout, a moved tree)
    // would survive the pre-delete step and cause `ln -s` to fail with
    // "File exists".
    const depPkg = await writePackage('packages/dep', '@scope/dep');
    const consumerPkg = await writePackage('packages/consumer', '@scope/consumer', {
      '@scope/dep': '^1.0.0',
    });
    const packageMap: LocalPackageMap = {
      '@scope/dep': depPkg,
      '@scope/consumer': consumerPkg,
    };

    // Manually plant a broken symlink where the dep link would go,
    // simulating the "ran symlink-workspace in a different environment
    // earlier" state.
    const symlinkDir = path.join(workspaceRoot, 'packages/consumer/node_modules/@scope');
    await fs.mkdir(symlinkDir, { recursive: true });
    const symlinkPath = path.join(symlinkDir, 'dep');
    await fs.symlink('/nonexistent/absolute/path/that/cannot/resolve', symlinkPath);

    // Confirm the broken state before we invoke symlinkDependencies.
    await expect(fs.stat(symlinkPath)).rejects.toMatchObject({ code: 'ENOENT' });
    // lstat succeeds because it doesn't follow the link.
    const brokenStat = await fs.lstat(symlinkPath);
    expect(brokenStat.isSymbolicLink()).toBe(true);

    // This must NOT throw "File exists" — it should overwrite the broken link.
    await PackageUtil.symlinkDependencies(consumerPkg, packageMap);

    // Fresh symlink with a relative target.
    const newTarget = await fs.readlink(symlinkPath);
    expect(path.isAbsolute(newTarget)).toBe(false);
    expect(newTarget).toBe(path.join('..', '..', '..', 'dep'));

    // And it resolves — the dep directory exists.
    const resolvedStat = await fs.stat(symlinkPath);
    expect(resolvedStat.isDirectory()).toBe(true);
  });

  test('creates node_modules/.bin shims for deps that declare a `bin` field (object form)', async () => {
    // Regression test for the missing-.bin-shim bug. `npm install`
    // normally writes `node_modules/.bin/<name>` shims for every `bin` a
    // dependency declares, and npm prepends `./node_modules/.bin` to PATH
    // when running lifecycle scripts. If `symlink-workspace` doesn't
    // create these shims itself, running `npm run watch` in a consumer
    // package fails with `command not found` as soon as the shim from a
    // prior `npm install` gets cleaned up (or the tree is freshly cloned).
    const toolPkg = await writePackage('packages/tool', '@scope/tool');
    // Populate a bin script in the tool's dist so the shim has something
    // to resolve to.
    const runBuildPath = path.join(workspaceRoot, 'packages/tool/dist/bin/run-build.js');
    const runWatchPath = path.join(workspaceRoot, 'packages/tool/dist/bin/run-watch.js');
    await fs.mkdir(path.dirname(runBuildPath), { recursive: true });
    await fs.writeFile(runBuildPath, '#!/usr/bin/env node\nconsole.log("build");\n');
    await fs.writeFile(runWatchPath, '#!/usr/bin/env node\nconsole.log("watch");\n');
    // Re-write the tool's package.json with a `bin` entry.
    toolPkg.packageJson.bin = {
      'tool-build': 'dist/bin/run-build.js',
      'tool-watch': 'dist/bin/run-watch.js',
    };
    await fs.writeFile(toolPkg.filePath, JSON.stringify(toolPkg.packageJson, null, 2));

    const consumerPkg = await writePackage('packages/consumer', 'consumer', {
      '@scope/tool': '^1.0.0',
    });
    const packageMap: LocalPackageMap = {
      '@scope/tool': toolPkg,
      consumer: consumerPkg,
    };

    await PackageUtil.symlinkDependencies(consumerPkg, packageMap);

    const binDir = path.join(workspaceRoot, 'packages/consumer/node_modules/.bin');
    const buildShim = path.join(binDir, 'tool-build');
    const watchShim = path.join(binDir, 'tool-watch');

    // Both shims exist as symlinks.
    expect((await fs.lstat(buildShim)).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(watchShim)).isSymbolicLink()).toBe(true);

    // Shim targets are relative.
    const buildTarget = await fs.readlink(buildShim);
    const watchTarget = await fs.readlink(watchShim);
    expect(path.isAbsolute(buildTarget)).toBe(false);
    expect(path.isAbsolute(watchTarget)).toBe(false);

    // Shims resolve end-to-end — readFile through the shim returns the
    // actual script contents, which means the whole chain
    // (`.bin/name` → `../@scope/tool/dist/bin/...`) is intact.
    const buildScript = await fs.readFile(buildShim, 'utf8');
    const watchScript = await fs.readFile(watchShim, 'utf8');
    expect(buildScript).toContain('console.log("build")');
    expect(watchScript).toContain('console.log("watch")');
  });

  test('creates `.bin` shim for bin-as-string shorthand using the bare package name', async () => {
    const toolPkg = await writePackage('packages/tool', '@scope/only-tool');
    const onlyScriptPath = path.join(workspaceRoot, 'packages/tool/bin.js');
    await fs.writeFile(onlyScriptPath, '#!/usr/bin/env node\nconsole.log("only");\n');
    toolPkg.packageJson.bin = './bin.js';
    await fs.writeFile(toolPkg.filePath, JSON.stringify(toolPkg.packageJson, null, 2));

    const consumerPkg = await writePackage('packages/consumer', 'consumer', {
      '@scope/only-tool': '^1.0.0',
    });
    const packageMap: LocalPackageMap = {
      '@scope/only-tool': toolPkg,
      consumer: consumerPkg,
    };

    await PackageUtil.symlinkDependencies(consumerPkg, packageMap);

    // Bare name — scope stripped — just like npm.
    const shim = path.join(workspaceRoot, 'packages/consumer/node_modules/.bin/only-tool');
    expect((await fs.lstat(shim)).isSymbolicLink()).toBe(true);
    const content = await fs.readFile(shim, 'utf8');
    expect(content).toContain('console.log("only")');
  });

  test('handles scoped and unscoped dependencies uniformly', async () => {
    const scopedDep = await writePackage('packages/scoped', '@scope/foo');
    const unscopedDep = await writePackage('packages/unscoped', 'bar');
    const consumerPkg = await writePackage('packages/consumer', 'consumer', {
      '@scope/foo': '^1.0.0',
      bar: '^1.0.0',
    });
    const packageMap: LocalPackageMap = {
      '@scope/foo': scopedDep,
      bar: unscopedDep,
      consumer: consumerPkg,
    };

    await PackageUtil.symlinkDependencies(consumerPkg, packageMap);

    const scopedLink = await fs.readlink(
      path.join(workspaceRoot, 'packages/consumer/node_modules/@scope/foo')
    );
    const unscopedLink = await fs.readlink(path.join(workspaceRoot, 'packages/consumer/node_modules/bar'));

    expect(path.isAbsolute(scopedLink)).toBe(false);
    expect(path.isAbsolute(unscopedLink)).toBe(false);

    // Scoped packages are nested one level deeper under node_modules/@scope,
    // so the relative target has one extra `..`.
    expect(scopedLink).toBe(path.join('..', '..', '..', 'scoped'));
    expect(unscopedLink).toBe(path.join('..', '..', 'unscoped'));
  });
});
