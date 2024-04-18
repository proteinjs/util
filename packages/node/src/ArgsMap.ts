export type ArgsMap = {
  [key: string]: string | boolean;
}

export const parseArgsMap = (rawArgs: string[]): ArgsMap => {
  const args: ArgsMap = {};
  rawArgs.forEach((arg) => {
    if (!arg.startsWith('--'))
      return;

    const keyValue = arg.slice(2).split('=');
    if (keyValue.length > 1)
      args[keyValue[0]] = keyValue[1];
    else
      args[keyValue[0]] = true;
  });
  return args;
}