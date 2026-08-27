/**
 * Log level resolution: `LOG_LEVEL` (debug|info|warn|error) is the process-wide override for
 * every `Logger` constructed without an explicit `logLevel`. Before this existed, `Logger`
 * hard-defaulted to 'info' with no env override — so nothing below info could ever be turned
 * on (or above info turned down) without a code change. Precedence under test:
 *
 *   explicit constructor `logLevel`  >  LOG_LEVEL env  >  'info' default
 */

import { Logger } from '../src/Logger';
import { Log, DefaultLogWriter } from '../src/DefaultLogWriter';

const createCapturingWriter = () => {
  const entries: Log[] = [];
  const logWriter = { write: (log: Log) => entries.push(log) } as unknown as DefaultLogWriter;
  return { logWriter, entries };
};

const originalLogLevel = process.env.LOG_LEVEL;

afterEach(() => {
  if (originalLogLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = originalLogLevel;
  }
});

describe('default (LOG_LEVEL unset): info', () => {
  beforeEach(() => {
    delete process.env.LOG_LEVEL;
  });

  it('suppresses debug, writes info', () => {
    const { logWriter, entries } = createCapturingWriter();
    const logger = new Logger({ name: 'test', logWriter });
    logger.debug({ message: 'debug line' });
    logger.info({ message: 'info line' });
    expect(entries.map((e) => e.logLevel)).toEqual(['info']);
  });
});

describe('LOG_LEVEL env override', () => {
  it('LOG_LEVEL=debug: default-constructed loggers write debug', () => {
    process.env.LOG_LEVEL = 'debug';
    const { logWriter, entries } = createCapturingWriter();
    const logger = new Logger({ name: 'test', logWriter });
    logger.debug({ message: 'debug line' });
    logger.info({ message: 'info line' });
    expect(entries.map((e) => e.logLevel)).toEqual(['debug', 'info']);
  });

  it('LOG_LEVEL=warn: info is suppressed, warn and error write', () => {
    process.env.LOG_LEVEL = 'warn';
    const { logWriter, entries } = createCapturingWriter();
    const logger = new Logger({ name: 'test', logWriter });
    logger.info({ message: 'info line' });
    logger.warn({ message: 'warn line' });
    logger.error({ message: 'error line' });
    expect(entries.map((e) => e.logLevel)).toEqual(['warn', 'error']);
  });

  it('an unrecognized LOG_LEVEL defers to the info default', () => {
    process.env.LOG_LEVEL = 'verbose';
    const { logWriter, entries } = createCapturingWriter();
    const logger = new Logger({ name: 'test', logWriter });
    logger.debug({ message: 'debug line' });
    logger.info({ message: 'info line' });
    expect(entries.map((e) => e.logLevel)).toEqual(['info']);
  });
});

describe('explicit constructor logLevel wins over the env', () => {
  it('explicit debug beats LOG_LEVEL=warn', () => {
    process.env.LOG_LEVEL = 'warn';
    const { logWriter, entries } = createCapturingWriter();
    const logger = new Logger({ name: 'test', logLevel: 'debug', logWriter });
    logger.debug({ message: 'debug line' });
    logger.info({ message: 'info line' });
    expect(entries.map((e) => e.logLevel)).toEqual(['debug', 'info']);
  });

  it('explicit warn beats LOG_LEVEL=debug', () => {
    process.env.LOG_LEVEL = 'debug';
    const { logWriter, entries } = createCapturingWriter();
    const logger = new Logger({ name: 'test', logLevel: 'warn', logWriter });
    logger.debug({ message: 'debug line' });
    logger.info({ message: 'info line' });
    logger.warn({ message: 'warn line' });
    expect(entries.map((e) => e.logLevel)).toEqual(['warn']);
  });
});
