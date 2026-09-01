import { InspectOptions } from 'util';
import { LogLevel } from './LogLevel';
import { getDefaultLogWriter, DefaultLogWriter } from './DefaultLogWriter';
import { DevLogWriter } from './DevLogWriter';
import { LogScrubber } from './LogScrubber';

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

  private getLogWriter() {
    if (!this.logWriter) {
      this.logWriter = getDefaultLogWriter() ?? new DevLogWriter();
    }

    return this.logWriter;
  }

  log({ message, obj, inspectOptions }: Log) {
    this.getLogWriter().write({
      loggerName: this.name,
      logLevel: 'info',
      timestamp: new Date(),
      // The one categorical seam every log line passes: stray ciphertext envelopes become
      // size markers here, whichever writer serializes them (see LogScrubber).
      message: LogScrubber.scrub(message),
      obj: LogScrubber.scrub(obj),
      inspectOptions,
    });
  }

  debug({ message, obj, inspectOptions }: Log) {
    if (this.logLevel == 'info' || this.logLevel == 'warn' || this.logLevel == 'error') {
      return;
    }

    this.getLogWriter().write({
      loggerName: this.name,
      logLevel: 'debug',
      timestamp: new Date(),
      message: LogScrubber.scrub(message),
      obj: LogScrubber.scrub(obj),
      inspectOptions,
    });
  }

  info({ message, obj, inspectOptions }: Log) {
    if (this.logLevel == 'warn' || this.logLevel == 'error') {
      return;
    }

    this.getLogWriter().write({
      loggerName: this.name,
      logLevel: 'info',
      timestamp: new Date(),
      message: LogScrubber.scrub(message),
      obj: LogScrubber.scrub(obj),
      inspectOptions,
    });
  }

  warn({ message, obj, inspectOptions }: Log) {
    if (this.logLevel == 'error') {
      return;
    }

    this.getLogWriter().write({
      loggerName: this.name,
      logLevel: 'warn',
      timestamp: new Date(),
      message: LogScrubber.scrub(message),
      obj: LogScrubber.scrub(obj),
      inspectOptions,
    });
  }

  error({ message, obj, inspectOptions, error }: ErrorLog) {
    this.getLogWriter().write({
      loggerName: this.name,
      logLevel: 'error',
      timestamp: new Date(),
      message: LogScrubber.scrub(message),
      obj: LogScrubber.scrub(obj),
      inspectOptions,
      error: LogScrubber.scrub(error),
    });
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
