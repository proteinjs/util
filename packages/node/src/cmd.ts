import * as ChildProcess from 'child_process';

export type LogOptions = {
  logPrefix?: string,
  omitLogs?: {
    stdout?: {
      omit?: boolean,
      shouldOmit?: () => boolean,
      filter?: (log: string) => string|undefined,
    },
    stderr?: {
      omit?: boolean,
      shouldOmit?: () => boolean,
      filter?: (log: string) => string|undefined,
    },
  },
}

export async function cmd(command: string, args?: readonly string[], options: ChildProcess.SpawnOptionsWithoutStdio|ChildProcess.SpawnOptionsWithStdioTuple<ChildProcess.StdioPipe|ChildProcess.StdioNull, ChildProcess.StdioPipe|ChildProcess.StdioNull, ChildProcess.StdioPipe|ChildProcess.StdioNull> = {}, logOptions?: LogOptions) {
  let p = ChildProcess.spawn(command, args ? args : [], Object.assign({
    cwd: process.cwd()
  }, options));
  return new Promise((resolve, reject) => {
    p.stdout?.on('data', (x: any) => {
      if (logOptions?.omitLogs?.stdout?.omit || (logOptions?.omitLogs?.stdout?.shouldOmit && logOptions.omitLogs.stdout.shouldOmit()))
        return;

      const rawLog = x.toString();
      const filteredLog = logOptions?.omitLogs?.stdout?.filter ? logOptions.omitLogs.stdout.filter(rawLog) : rawLog;
      if (!filteredLog)
        return;

      process.stdout.write(prefixLog(filteredLog, logOptions?.logPrefix));
    });
    p.stderr?.on('data', (x) => {
      if (logOptions?.omitLogs?.stderr?.omit || (logOptions?.omitLogs?.stderr?.shouldOmit && logOptions.omitLogs.stderr.shouldOmit()))
        return;

      const rawLog = x.toString();
      const filteredLog = logOptions?.omitLogs?.stderr?.filter ? logOptions.omitLogs.stderr.filter(rawLog) : rawLog;
      if (!filteredLog)
        return;
    
      process.stderr.write(prefixLog(filteredLog, logOptions?.logPrefix));
    });
    p.on('error', (error) => {
      if (logOptions?.omitLogs?.stderr?.omit || (logOptions?.omitLogs?.stderr?.shouldOmit && logOptions.omitLogs.stderr.shouldOmit()))
        return;

      const rawLog = error.toString();
      const filteredLog = logOptions?.omitLogs?.stderr?.filter ? logOptions.omitLogs.stderr.filter(rawLog) : rawLog;
      if (!filteredLog)
        return;
    
      process.stderr.write(prefixLog(filteredLog, logOptions?.logPrefix));
    });
    p.on('exit', (code) => {
      const logCode = `child process '${command} ${args ? args.join(' ') : ''}' exited with code: ${code}`;
      if (code === 0)
        resolve(code);
      else
        reject(logCode);
    });
  });
}

function prefixLog(log: string, prefix?: string) {
  if (prefix)
    return `${prefix}${log.replace(/\n/g, `\n${prefix}`)}`;

  return log;
}