import { InspectOptions } from 'util';
import { LogLevel } from './LogLevel';
import { getDefaultLogWriter, DefaultLogWriter } from './DefaultLogWriter';
import { DevLogWriter } from './DevLogWriter';

type LoggerParams = { name?: string; logLevel?: LogLevel; logWriter?: DefaultLogWriter };
type Log = { message?: string; obj?: any; inspectOptions?: InspectOptions };
type ErrorLog = Log & { error?: Error };

export class Logger {
  private name?: string;
  private logLevel: LogLevel;
  private logWriter?: DefaultLogWriter;

  constructor({ name, logLevel, logWriter }: LoggerParams = {}) {
    if (name) {
      this.name = name;
    }
    this.logLevel = logLevel ?? 'info';
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
      message,
      obj,
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
      message,
      obj,
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
      message,
      obj,
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
      message,
      obj,
      inspectOptions,
    });
  }

  error({ message, obj, inspectOptions, error }: ErrorLog) {
    this.getLogWriter().write({
      loggerName: this.name,
      logLevel: 'error',
      timestamp: new Date(),
      message,
      obj,
      inspectOptions,
      error,
    });
  }
}
