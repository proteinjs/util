export type ArgsMap = {
  [key: string]: string | boolean;
};

export const parseArgsMap = (rawArgs: string[]): ArgsMap => {
  const args: ArgsMap = {};
  rawArgs.forEach((arg) => {
    if (!arg.startsWith('--')) {
      return;
    }

    // Split on the FIRST '=' only — values legitimately contain '=' (e.g. --note=port=9040)
    // and must be preserved in full.
    const keyValue = arg.slice(2);
    const separatorIndex = keyValue.indexOf('=');
    if (separatorIndex >= 0) {
      args[keyValue.slice(0, separatorIndex)] = keyValue.slice(separatorIndex + 1);
    } else {
      args[keyValue] = true;
    }
  });
  return args;
};
