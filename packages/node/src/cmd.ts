import * as ChildProcess from 'child_process';

export type LogOptions = {
  /** Prefix each printed line with this string (cosmetic only). */
  logPrefix?: string;
  /** Optional data to write to the child process stdin, then end() it. */
  stdin?: string | Buffer;
  /**
   * Stop reading stdout past this many lines: the child is ended (SIGTERM — its whole process group
   * when spawned `detached`, so a shell's pipeline ends with it), nothing past the bound is read, and
   * the call resolves with exactly the first `maxStdoutLines` lines and code 0 — the ended child is
   * not an error. A bound the caller sets on what it reads is then also a bound on the child's work
   * (`Fs.grep`'s `maxLines`, ask 1553).
   */
  maxStdoutLines?: number;
  omitLogs?: {
    stdout?: {
      omit?: boolean;
      shouldOmit?: () => boolean;
      filter?: (log: string) => string | undefined;
    };
    stderr?: {
      omit?: boolean;
      shouldOmit?: () => boolean;
      filter?: (log: string) => string | undefined;
    };
  };
};

export type CmdResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export async function cmd(
  command: string,
  args: readonly string[] = [],
  options:
    | ChildProcess.SpawnOptionsWithoutStdio
    | ChildProcess.SpawnOptionsWithStdioTuple<
        ChildProcess.StdioPipe | ChildProcess.StdioNull,
        ChildProcess.StdioPipe | ChildProcess.StdioNull,
        ChildProcess.StdioPipe | ChildProcess.StdioNull
      > = {},
  logOptions?: LogOptions
): Promise<CmdResult> {
  const proc = ChildProcess.spawn(command, [...args], {
    cwd: process.cwd(),
    ...options,
  });

  // Use Uint8Array[] to satisfy Buffer.concat's typings across Node versions.
  const stdoutChunks: Uint8Array[] = [];
  const stderrChunks: Uint8Array[] = [];

  const omitStdout = () =>
    !!(
      logOptions?.omitLogs?.stdout?.omit ||
      (logOptions?.omitLogs?.stdout?.shouldOmit && logOptions.omitLogs.stdout.shouldOmit())
    );

  const omitStderr = () =>
    !!(
      logOptions?.omitLogs?.stderr?.omit ||
      (logOptions?.omitLogs?.stderr?.shouldOmit && logOptions.omitLogs.stderr.shouldOmit())
    );

  // If caller provided stdin data, write it immediately then end().
  if (logOptions?.stdin !== undefined && proc.stdin) {
    proc.stdin.write(logOptions.stdin);
    proc.stdin.end();
  }

  // The stdout line bound (`maxStdoutLines`): lines counted as chunks arrive; at the bound the child
  // is ended and `endedAt` holds the bound — nothing past it is read, and `close` resolves with
  // exactly that many lines.
  const lineBound =
    typeof logOptions?.maxStdoutLines === 'number' && logOptions.maxStdoutLines > 0
      ? logOptions.maxStdoutLines
      : undefined;
  let stdoutLines = 0;
  let endedAt: number | undefined;

  // Ends the child — its whole process group when spawned `detached` (a shell's pipeline ends with
  // it). The child may have exited on its own between its last chunk and this call: ESRCH then,
  // and nothing left to end.
  const endChild = () => {
    if (!proc.pid) {
      return;
    }
    try {
      if (options.detached) {
        process.kill(-proc.pid, 'SIGTERM');
      } else {
        proc.kill('SIGTERM');
      }
    } catch {
      // ESRCH: the child already exited.
    }
  };

  proc.stdout?.on('data', (chunk: Uint8Array) => {
    if (endedAt !== undefined) {
      return;
    }
    stdoutChunks.push(chunk);
    if (lineBound !== undefined) {
      stdoutLines += countNewlines(chunk);
      if (stdoutLines >= lineBound) {
        endedAt = lineBound;
        endChild();
      }
    }
    if (omitStdout()) {
      return;
    }
    const raw = Buffer.from(chunk).toString();
    const filtered = logOptions?.omitLogs?.stdout?.filter ? logOptions.omitLogs.stdout.filter(raw) : raw;
    if (filtered) {
      process.stdout.write(prefixLog(filtered, logOptions?.logPrefix));
    }
  });

  proc.stderr?.on('data', (chunk: Uint8Array) => {
    stderrChunks.push(chunk);
    if (omitStderr()) {
      return;
    }
    const raw = Buffer.from(chunk).toString();
    const filtered = logOptions?.omitLogs?.stderr?.filter ? logOptions.omitLogs.stderr.filter(raw) : raw;
    if (filtered) {
      process.stderr.write(prefixLog(filtered, logOptions?.logPrefix));
    }
  });

  return await new Promise<CmdResult>((resolve, reject) => {
    proc.once('error', (err) => {
      const stderr = Buffer.concat(stderrChunks as readonly Uint8Array[]).toString();
      const stdout = Buffer.concat(stdoutChunks as readonly Uint8Array[]).toString();
      const e = new Error(`spawn error for '${command} ${args.join(' ')}': ${String(err)}`) as Error & {
        stdout?: string;
        stderr?: string;
      };
      e.stdout = stdout;
      e.stderr = stderr;
      reject(e);
    });

    // Use 'close' to ensure stdio is flushed
    proc.once('close', (code, signal) => {
      const stdout = Buffer.concat(stdoutChunks as readonly Uint8Array[]).toString();
      const stderr = Buffer.concat(stderrChunks as readonly Uint8Array[]).toString();
      const exitCode = typeof code === 'number' ? code : -1;

      // Ended at the bound: exactly the bound's lines, and the end is not an error.
      if (endedAt !== undefined) {
        resolve({ code: 0, stdout: firstLines(stdout, endedAt), stderr });
        return;
      }

      if (exitCode === 0) {
        resolve({ code: exitCode, stdout, stderr });
      } else {
        const msg = signal
          ? `process '${command} ${args.join(' ')}' terminated by signal: ${signal}`
          : `process '${command} ${args.join(' ')}' exited with code: ${exitCode}`;
        const err = new Error(msg) as Error & { code: number; stdout: string; stderr: string };
        err.code = exitCode;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

function prefixLog(log: string, prefix?: string) {
  if (prefix) {
    return `${prefix}${log.replace(/\n(?!$)/g, `\n${prefix}`)}`;
  }

  return log;
}

function countNewlines(chunk: Uint8Array) {
  let count = 0;
  for (let i = 0; i < chunk.length; i++) {
    if (chunk[i] === 0x0a) {
      count++;
    }
  }
  return count;
}

/** The first `n` newline-terminated lines of `text`. */
function firstLines(text: string, n: number) {
  return text.split('\n').slice(0, n).join('\n') + '\n';
}
