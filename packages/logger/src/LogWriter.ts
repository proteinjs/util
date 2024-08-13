import { Loadable, SourceRepository } from '@proteinjs/reflection';
import { LogLevel } from './LogLevel';
import { InspectOptions } from 'util';

export const getLogWriter = () => SourceRepository.get().object<LogWriter>('@proteinjs/logger/LogWriter');

export type Log = {
  /** The name of the logger creating this log */
  loggerName?: string;
  /** The log level of this log */
  logLevel: LogLevel;
  /** The time the log was created */
  timestamp: Date;
  /** The log message */
  message?: string;
  /** The object being logged */
  obj?: any;
  /** The error being logged */
  error?: Error;
  /** Object formatting options */
  inspectOptions?: InspectOptions;
};

export interface LogWriter extends Loadable {
  write(log: Log): void;
}
