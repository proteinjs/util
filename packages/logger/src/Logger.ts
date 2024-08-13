import { InspectOptions } from 'util';
import { LogLevel } from './LogLevel';
import { LogWriter } from './LogWriter';
import { DevLogWriter } from './DevLogWriter';

type LoggerParams = { name?: string; logLevel?: LogLevel; logWriter?: LogWriter };
type Log = { message?: string; obj?: any; inspectOptions?: InspectOptions };
type ErrorLog = Log & { error?: Error };

export class Logger {
  private name?: string;
  private logLevel: LogLevel;
  private logWriter: LogWriter;

  constructor({ name, logLevel, logWriter }: LoggerParams = {}) {
    if (name) {
      this.name = name;
    }
    this.logLevel = logLevel ?? 'info';
    this.logWriter = logWriter ?? new DevLogWriter();
  }

  log({ message, obj, inspectOptions }: Log) {
    this.logWriter.write({
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

    this.logWriter.write({
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

    this.logWriter.write({
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

    this.logWriter.write({
      loggerName: this.name,
      logLevel: 'warn',
      timestamp: new Date(),
      message,
      obj,
      inspectOptions,
    });
  }

  error({ message, obj, inspectOptions, error }: ErrorLog) {
    this.logWriter.write({
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
