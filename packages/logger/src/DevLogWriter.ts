import { inspect, InspectOptions } from 'util';
import { LogLevel } from './LogLevel';
import { Log } from './LogWriter';

export class DevLogWriter {
  private static COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
  };

  write({ loggerName, logLevel, timestamp, message, obj, inspectOptions, error }: Log): void {
    let formattedMessage: string | undefined;
    if (message) {
      const prefixedMessage = `${this.prefix(timestamp, loggerName)} ${message}`;
      formattedMessage = this.colorMessage(prefixedMessage, logLevel);
    }

    const defaultInspectOptions: InspectOptions = {
      depth: 10,
      colors: true,
      compact: false,
      breakLength: 80,
      maxStringLength: 1000,
    };

    const formatObj = (o: any) => inspect(o, { ...defaultInspectOptions, ...inspectOptions });

    const logParts = [formattedMessage, obj && formatObj(obj), error && formatObj({ error })].filter(Boolean);

    switch (logLevel) {
      case 'info':
        console.info(...logParts);
        break;
      case 'warn':
        console.warn(...logParts);
        break;
      case 'error':
        console.error(...logParts);
        break;
      default:
        console.log(...logParts);
    }
  }

  private prefix(timestamp: Date, loggerName?: string) {
    const formattedTimestamp = this.formatDate(timestamp);
    const namePrefix = loggerName ? ` [${loggerName}]` : '';
    return `${formattedTimestamp}${namePrefix}`;
  }

  private formatDate(date: Date) {
    const pad = (num: number) => num.toString().padStart(2, '0');
    const padMs = (num: number) => num.toString().padStart(3, '0');

    const hours = date.getHours();
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    const milliseconds = padMs(date.getMilliseconds());
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12; // Convert to 12-hour format

    return `${formattedHours}:${minutes}:${seconds}.${milliseconds} ${ampm}`;
  }

  private colorMessage(message: string, logLevel: LogLevel) {
    if (logLevel === 'info') {
      return message;
    }

    const color = DevLogWriter.COLORS[logLevel === 'error' ? 'red' : logLevel === 'warn' ? 'yellow' : 'green'];
    return `${color}${message}${DevLogWriter.COLORS.reset}`;
  }
}
