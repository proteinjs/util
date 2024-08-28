import { Loadable, SourceRepository } from '@proteinjs/reflection';
import { LogLevel } from './LogLevel';
import { InspectOptions } from 'util';

export const getDefaultLogWriter = () =>
  SourceRepository.get().object<DefaultLogWriter>('@proteinjs/logger/DefaultLogWriter');

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
  error?: any;
  /** Object formatting options */
  inspectOptions?: InspectOptions;
};

/**
 * Every `Logger` instance will use the implementation of `DefaultLogWriter` unless
 * a log writer is explicitly passed in when instantiating `Logger`.
 *
 * If this is not implemented, and no `LogWriter` is passed into `Logger`, `Logger`
 * will default to using `DevLogWriter`.
 *
 * Note: this should only be implemented once. If there are multiple implementations,
 * `Logger` will choose the first one that shows up in the package dependency tree.
 * */
export interface DefaultLogWriter extends Loadable {
  write(log: Log): void;
}
