export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private name?: string;
  private logLevel: LogLevel;
  private limit: number;

  constructor(name?: string, logLevel: LogLevel = 'info', limit: number = 250) {
    this.name = name;
    this.logLevel = logLevel;
    this.limit = limit;
  }

  private prefix() {
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    const namePrefix = this.name ? ` [${this.name}]` : '';
    return `${timestamp}${namePrefix}`;
  }

  log(message: string, limit?: number) {
    console.log(`${this.prefix()} ${this.limitMessageLength(message, limit)}`);
  }

  debug(message: string, ignoreLimitMessageLength: boolean = false) {
    if (this.logLevel == 'info' || this.logLevel == 'warn' || this.logLevel == 'error') {
      return;
    }

    if (!ignoreLimitMessageLength) {
      message = this.limitMessageLength(message);
    }

    console.debug(`${this.prefix()} ${message}`);
  }

  info(message: string, limit?: number) {
    if (this.logLevel == 'warn' || this.logLevel == 'error') {
      return;
    }

    console.info(`${this.prefix()} ${this.limitMessageLength(message, limit)}`);
  }

  warn(message: string, limit?: number) {
    if (this.logLevel == 'error') {
      return;
    }

    console.warn(`${this.prefix()} ${this.limitMessageLength(message, limit)}`);
  }

  error(message: string, error?: Error) {
    console.error(`${this.prefix()} ${message}`, error);
  }

  private limitMessageLength(message: string, limit?: number) {
    const resolvedLimit = typeof limit !== 'undefined' ? limit : this.limit;
    if (message.length > resolvedLimit) {
      return message.slice(0, resolvedLimit) + '...';
    }

    return message;
  }
}
