import { InspectOptions } from 'util';
import { LogLevel } from './LogLevel';
import { getDefaultLogWriter, DefaultLogWriter } from './DefaultLogWriter';
import { DevLogWriter } from './DevLogWriter';
import { LogLineErrors } from './LogLineErrors';

type LoggerParams = { name?: string; logLevel?: LogLevel; logWriter?: DefaultLogWriter };
type Log = { message?: string; obj?: any; inspectOptions?: InspectOptions };
type ErrorLog = Log & { error?: any };

export class Logger {
  private name?: string;
  private logLevel: LogLevel;
  private logWriter?: DefaultLogWriter;

  constructor({ name, logLevel, logWriter }: LoggerParams = {}) {
    if (name) {
      this.name = name;
    }
    this.logLevel = logLevel ?? Logger.envLogLevel() ?? 'info';
    this.logWriter = logWriter;
  }

  log({ message, obj, inspectOptions }: Log) {
    this.write('info', { message, obj, inspectOptions });
  }

  debug({ message, obj, inspectOptions }: Log) {
    if (this.logLevel == 'info' || this.logLevel == 'warn' || this.logLevel == 'error') {
      return;
    }

    this.write('debug', { message, obj, inspectOptions });
  }

  info({ message, obj, inspectOptions }: Log) {
    if (this.logLevel == 'warn' || this.logLevel == 'error') {
      return;
    }

    this.write('info', { message, obj, inspectOptions });
  }

  warn({ message, obj, inspectOptions }: Log) {
    if (this.logLevel == 'error') {
      return;
    }

    this.write('warn', { message, obj, inspectOptions });
  }

  error({ message, obj, inspectOptions, error }: ErrorLog) {
    this.write('error', { message, obj, inspectOptions, error });
  }

  /**
   * The ONE door to the log writer. What a line carries passes through `LogLineErrors.forLine`
   * first, so an error marked as never printing its own text reaches every writer — the default
   * one, a consumer's structured one — as its printed stand-in, at every level, as the line's
   * `error` or anywhere inside its `obj`.
   */
  private write(logLevel: LogLevel, { message, obj, inspectOptions, error }: ErrorLog) {
    this.getLogWriter().write({
      loggerName: this.name,
      logLevel,
      timestamp: new Date(),
      message,
      obj: LogLineErrors.forLine(obj),
      inspectOptions,
      ...(logLevel === 'error' ? { error: LogLineErrors.forLine(error) } : {}),
    });
  }

  private getLogWriter() {
    if (!this.logWriter) {
      this.logWriter = getDefaultLogWriter() ?? new DevLogWriter();
    }

    return this.logWriter;
  }

  /**
   * Process-wide log level override: `LOG_LEVEL` (debug|info|warn|error) applies to every
   * `Logger` constructed without an explicit `logLevel`. An explicit constructor `logLevel`
   * wins over the env; an unset or unrecognized `LOG_LEVEL` defers to the default ('info').
   */
  private static envLogLevel(): LogLevel | undefined {
    const value = typeof process !== 'undefined' && process.env ? process.env.LOG_LEVEL : undefined;
    return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : undefined;
  }
}
