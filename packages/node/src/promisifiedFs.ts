import * as fsNative from 'fs';
import * as util from 'util';

export const promisifiedFs = {
  exists: util.promisify(fsNative.exists),
  readFile: util.promisify(fsNative.readFile),
  writeFile: util.promisify(fsNative.writeFile),
  mkdir: util.promisify(fsNative.mkdir),
};
