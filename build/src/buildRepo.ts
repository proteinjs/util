import * as path from 'path'
const graphlib = require('@dagrejs/graphlib')
import { PackageUtil, cmd } from '@proteinjs/util-node'
import { Logger } from '@proteinjs/util'

export const buildRepo = async () => {
  const logger = new Logger('buildRepo');
  const repoPath = path.resolve(__dirname, '..'); // __dirname: build
  logger.info(`> Building proteinjs workspace (${repoPath})`);
  const packageMap = await PackageUtil.getLocalPackageMap(repoPath);
  logger.debug(`packageMap:\n${JSON.stringify(packageMap, null, 2)}`, true);
  const packageGraph = await PackageUtil.getPackageDependencyGraph(Object.values(packageMap).map(localPackage => localPackage.packageJson));
  const sortedPackageNames: string[] = graphlib.alg.topsort(packageGraph).reverse();
  logger.debug(`sortedPackageNames:\n${JSON.stringify(sortedPackageNames, null, 2)}`, true);

  logger.info(`> Installing and building packages`);
  for (let packageName of sortedPackageNames) {
    const localPackage = packageMap[packageName];
    if (!localPackage)
      continue;

    const packageDir = path.dirname(localPackage.filePath);
    await cmd('npm', ['install'], { cwd: packageDir });
    logger.info(`Installed ${packageName} (${packageDir})`);

    if (localPackage.packageJson.scripts?.build && packageName != 'typescript-parser') {
      await cmd('npm', ['run', 'build'], { cwd: packageDir });
      logger.info(`Built ${packageName} (${packageDir})`);
    }
  }

  logger.info(`> Built proteinjs workspace (${repoPath})`);
}