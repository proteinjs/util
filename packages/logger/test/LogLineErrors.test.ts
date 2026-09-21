/**
 * Errors that never print their own text (`LogLineErrors`).
 *
 * An error worded by a system outside the process can quote the data the failing call carried.
 * Its catcher marks it; from then on every `Logger` line carries a printed stand-in — the
 * catcher's code and sentence, the original's name and stack frames — wherever the error rides:
 * as the line's `error`, inside its `obj`, as another error's `cause`, among its `errors`.
 *
 * Judged at the log WRITER, as the text a writer would print: an error's message and stack, its
 * `util.inspect` rendering (stock, and with hidden properties shown), its serialized form. The
 * marked error itself is never changed — what a caller catches is what it always caught.
 */

import { inspect } from 'util';
import { Logger } from '../src/Logger';
import { Log, DefaultLogWriter } from '../src/DefaultLogWriter';
import { DevLogWriter } from '../src/DevLogWriter';
import { ErrorLine, LogLineErrors } from '../src/LogLineErrors';

// A fixture value shaped like row content (not a real credential).
const VALUE = 'rst_5d41402abc4b2a76b9719d911017c592';
const SENTENCE = 'Failed when executing dml (INVALID_ARGUMENT, code 3) on INSERT ledger: the database rejected a value';
const LINE: ErrorLine = { code: 'INVALID_ARGUMENT', sentence: SENTENCE, facts: { operation: 'dml' } };

const vendorError = (message = `3 INVALID_ARGUMENT: Could not parse ${VALUE} as a TIMESTAMP`) =>
  Object.assign(new Error(message), { code: 3, details: message });

/** Everything a writer could print of a captured line. */
const printedLine = (log: Log): string => {
  const everyWay = (value: unknown) =>
    [
      inspect(value, { depth: 12, maxStringLength: null }),
      inspect(value, { depth: 12, maxStringLength: null, showHidden: true, getters: true }),
      JSON.stringify(value, (_key, member) => (typeof member === 'bigint' ? String(member) : member)) ?? '',
    ].join('\n');
  const error = log.error as { message?: unknown; stack?: unknown } | undefined;
  return [log.message ?? '', everyWay(log.obj), everyWay({ error }), String(error?.message), String(error?.stack)].join(
    '\n'
  );
};

const capture = () => {
  const entries: Log[] = [];
  const logWriter = { write: (log: Log) => entries.push(log) } as unknown as DefaultLogWriter;
  return { entries, logger: new Logger({ name: 'test', logLevel: 'debug', logWriter }) };
};

describe('a marked error as the `error` of a line', () => {
  it('reaches the writer as its stand-in: the sentence, the code, the facts, the name, the frames — never its own text', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    error.name = 'VendorError';
    LogLineErrors.mark(error, () => LINE);

    logger.error({ message: 'Failed when executing dml', error });

    const written = entries[0].error as Error & { code?: unknown; operation?: unknown };
    expect(written).not.toBe(error);
    expect(written).toBeInstanceOf(Error);
    expect(written.message).toBe(SENTENCE);
    expect(written.name).toBe('VendorError');
    expect(written.code).toBe('INVALID_ARGUMENT');
    expect(written.operation).toBe('dml');
    const stackLines = String(written.stack).split('\n');
    expect(stackLines[0]).toBe(`VendorError: ${SENTENCE}`);
    expect(stackLines.length).toBeGreaterThan(1);
    expect(stackLines.slice(1)).toEqual(
      String(error.stack)
        .split('\n')
        .filter((each) => /^\s+at /.test(each))
    );
    expect(printedLine(entries[0])).not.toContain(VALUE);
    expect(printedLine(entries[0])).not.toContain('TIMESTAMP');
  });

  it('is printed by the default dev writer without its own text', () => {
    const printed: string[] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
      printed.push(parts.map(String).join(' '));
    });
    try {
      const error = vendorError();
      LogLineErrors.mark(error, () => LINE);

      new Logger({ name: 'test', logWriter: new DevLogWriter() as unknown as DefaultLogWriter }).error({
        message: 'Failed when executing dml',
        error,
        obj: { caught: error },
      });
    } finally {
      spy.mockRestore();
    }

    expect(printed.join('\n')).toContain(SENTENCE);
    expect(printed.join('\n')).not.toContain(VALUE);
  });

  it('keeps only FRAMES of the stack: a message on many lines, one of them worded like a place, is gone whole', () => {
    const { entries, logger } = capture();
    const error = vendorError(`3 INVALID_ARGUMENT: could not parse\n    at ${VALUE}\nmore of ${VALUE}`);
    LogLineErrors.mark(error, () => LINE);

    logger.error({ error });

    expect(printedLine(entries[0])).not.toContain(VALUE);
    expect(String((entries[0].error as Error).stack).split('\n').length).toBeGreaterThan(1);
  });

  it('whose message was rewritten after it was made (the stack still opens with the first wording) prints neither wording', () => {
    const { entries, logger } = capture();
    const error = vendorError(`Duplicate entry '${VALUE}' for key 'PRIMARY'`);
    error.message = `insert into t values ('${VALUE}') - ${error.message}`;
    LogLineErrors.mark(error, () => LINE);

    logger.error({ error });

    expect(printedLine(entries[0])).not.toContain(VALUE);
  });
});

describe('a marked error anywhere else on a line, at every level', () => {
  const levels = ['debug', 'info', 'warn', 'error', 'log'] as const;

  it.each(levels)('%s: inside obj — a member, inside an array, deep inside', (level) => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const obj = { rollbackError: error, list: [1, error], deep: { deeper: { deepest: [{ error }] } }, kept: 'as is' };

    logger[level]({ message: 'a line', obj });

    expect(entries).toHaveLength(1);
    expect(printedLine(entries[0])).not.toContain(VALUE);
    expect(entries[0].obj.rollbackError.message).toBe(SENTENCE);
    expect(entries[0].obj.list[1].message).toBe(SENTENCE);
    expect(entries[0].obj.deep.deeper.deepest[0].error.message).toBe(SENTENCE);
    expect(entries[0].obj.kept).toBe('as is');
    // What the caller passed in is what it was.
    expect(obj.rollbackError).toBe(error);
    expect(obj.list[1]).toBe(error);
  });

  it('as the `cause` of an unmarked error, and among its `errors` — neither enumerates', () => {
    const { entries, logger } = capture();
    const inner = vendorError();
    LogLineErrors.mark(inner, () => LINE);
    const outer = new Error('The retry budget ran out');
    Object.defineProperty(outer, 'cause', { value: inner, enumerable: false });
    Object.defineProperty(outer, 'errors', { value: [inner], enumerable: false });

    logger.error({ message: 'a line', error: outer, obj: { outer } });

    const written = entries[0].error as Error & { cause: Error; errors: Error[] };
    expect(printedLine(entries[0])).not.toContain(VALUE);
    expect(written).not.toBe(outer);
    expect(written).toBeInstanceOf(Error);
    expect(written.message).toBe('The retry budget ran out');
    expect(written.stack).toBe(outer.stack);
    expect(written.cause.message).toBe(SENTENCE);
    expect(written.errors[0].message).toBe(SENTENCE);
    expect(Object.getOwnPropertyDescriptor(written, 'cause')?.enumerable).toBe(false);
    expect((outer as Error & { cause: unknown }).cause).toBe(inner);
  });

  it('in a value that holds itself: the copy closes on the copy, and nothing of the original is reachable', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const obj: { [key: string]: unknown } = { error };
    obj.self = obj;
    obj.child = { parent: obj };

    logger.warn({ message: 'a line', obj });

    expect(entries[0].obj.self).toBe(entries[0].obj);
    expect(entries[0].obj.child.parent).toBe(entries[0].obj);
    expect(inspect(entries[0].obj, { depth: 12 })).not.toContain(VALUE);
  });
});

describe('what a mark never does', () => {
  it('changes nothing of the error a caller catches — a frozen one included', () => {
    const error = Object.freeze(vendorError());
    const before = {
      descriptors: inspect(Object.getOwnPropertyDescriptors(error), { depth: 4 }),
      symbols: Object.getOwnPropertySymbols(error).length,
      prototype: Object.getPrototypeOf(error),
      message: error.message,
      stack: error.stack,
    };
    const { entries, logger } = capture();

    LogLineErrors.mark(error, () => LINE);
    logger.error({ error, obj: { error } });

    expect(LogLineErrors.isMarked(error)).toBe(true);
    expect(inspect(Object.getOwnPropertyDescriptors(error), { depth: 4 })).toBe(before.descriptors);
    expect(Object.getOwnPropertySymbols(error).length).toBe(before.symbols);
    expect(Object.getPrototypeOf(error)).toBe(before.prototype);
    expect(error.message).toBe(before.message);
    expect(error.stack).toBe(before.stack);
    expect(printedLine(entries[0])).not.toContain(VALUE);
  });

  it('touches a line that holds no marked error: the writer receives the very same values', () => {
    const { entries, logger } = capture();
    LogLineErrors.mark(vendorError(), () => LINE); // something in the process is marked
    const error = new Error('an ordinary failure');
    const obj = { list: [1, 2], nested: { error }, when: new Date(0) };

    logger.error({ message: 'a line', error, obj });

    expect(entries[0].error).toBe(error);
    expect(entries[0].obj).toBe(obj);
  });

  it('throws: what cannot be marked (a string, nothing) is ignored', () => {
    expect(() => LogLineErrors.mark('a thrown string', () => LINE)).not.toThrow();
    expect(() => LogLineErrors.mark(undefined, () => LINE)).not.toThrow();
    expect(LogLineErrors.isMarked('a thrown string')).toBe(false);
  });
});

describe('the line is its owner`s answer, asked at each write', () => {
  it('`undefined` prints the error as it is — the owner`s development switch — and the next write asks again', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    let open = true;
    LogLineErrors.mark(error, () => (open ? undefined : LINE));

    logger.error({ error });
    open = false;
    logger.error({ error });

    expect(entries[0].error).toBe(error);
    expect((entries[1].error as Error).message).toBe(SENTENCE);
    expect(printedLine(entries[1])).not.toContain(VALUE);
  });

  it.each([
    [
      'throws',
      () => {
        throw new Error(`cannot build ${VALUE}`);
      },
    ],
    ['answers no sentence', () => ({ code: 3 }) as unknown as ErrorLine],
  ])('a line that %s is not a reason to print the error: one fixed sentence', (_name, line) => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, line);

    logger.error({ error });

    expect((entries[0].error as Error).message).toBe('An error whose log line could not be built');
    expect(printedLine(entries[0])).not.toContain(VALUE);
  });

  it('a container that refuses to be read is carried as one fixed phrase — that container alone, the rest of the line stands', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const refusing = new Proxy(
      {},
      {
        getPrototypeOf: () => Object.prototype,
        ownKeys: () => {
          throw new Error('not readable');
        },
      }
    );

    logger.info({ message: 'a line', obj: { refusing, kept: { as: 'it is' }, error } });

    expect(entries[0].obj.refusing).toBe('(a value that could not be read for a log line)');
    expect(entries[0].obj.kept).toEqual({ as: 'it is' });
    expect(entries[0].obj.error.message).toBe(SENTENCE);
  });
});

describe('whatever holds a marked error', () => {
  class Outcome {
    constructor(
      readonly failure: unknown,
      readonly note = 'kept'
    ) {}
    describe() {
      return 'an outcome';
    }
  }

  it('a class instance: the copy is of the same class, with the stand-in in place', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const outcome = new Outcome(error);

    logger.warn({ message: 'a line', obj: { outcome } });

    expect(printedLine(entries[0])).not.toContain(VALUE);
    expect(entries[0].obj.outcome).toBeInstanceOf(Outcome);
    expect(entries[0].obj.outcome.failure.message).toBe(SENTENCE);
    expect(entries[0].obj.outcome.note).toBe('kept');
    expect(entries[0].obj.outcome.describe()).toBe('an outcome');
    expect(outcome.failure).toBe(error);
  });

  // Each holder rides a line of its own: a holder copied for one marked error has every member
  // looked at, which would hide a member the walk itself never read.
  it('a Map, as a value', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const byName = new Map<unknown, unknown>([
      ['failed', error],
      ['kept', 1],
    ]);

    logger.error({ message: 'a line', obj: { byName } });

    expect(printedLine(entries[0])).not.toContain(VALUE);
    const written = entries[0].obj.byName as Map<unknown, unknown>;
    expect(written).toBeInstanceOf(Map);
    expect((written.get('failed') as Error).message).toBe(SENTENCE);
    expect(written.get('kept')).toBe(1);
    expect(byName.get('failed')).toBe(error);
  });

  it('a Map, as a key', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const notes = new Map<unknown, unknown>([
      ['kept', 1],
      [error, 'a note'],
    ]);

    logger.error({ message: 'a line', obj: { notes } });

    expect(printedLine(entries[0])).not.toContain(VALUE);
    const keys = [...(entries[0].obj.notes as Map<unknown, unknown>).keys()];
    expect(keys.map((key) => (key instanceof Error ? key.message : key))).toEqual(['kept', SENTENCE]);
    expect(notes.has(error)).toBe(true);
  });

  it('a Set', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const failures = new Set<unknown>([error, 'kept']);

    logger.error({ message: 'a line', obj: { failures } });

    expect(printedLine(entries[0])).not.toContain(VALUE);
    const written = entries[0].obj.failures as Set<unknown>;
    expect(written).toBeInstanceOf(Set);
    expect([...written].map((each) => (each instanceof Error ? each.message : each))).toEqual([SENTENCE, 'kept']);
    expect(failures.has(error)).toBe(true);
  });

  it('a symbol key', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const key = Symbol('failure');

    logger.info({ message: 'a line', obj: { [key]: error, kept: 1 } });

    expect(printedLine(entries[0])).not.toContain(VALUE);
    expect(entries[0].obj[key].message).toBe(SENTENCE);
    expect(entries[0].obj.kept).toBe(1);
  });

  it('a property that does not enumerate', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const obj = Object.defineProperty({ kept: 1 }, 'hidden', { value: error, enumerable: false });

    logger.info({ message: 'a line', obj });

    expect(printedLine(entries[0])).not.toContain(VALUE);
    expect(entries[0].obj.hidden.message).toBe(SENTENCE);
    expect(Object.getOwnPropertyDescriptor(entries[0].obj, 'hidden')?.enumerable).toBe(false);
  });

  it('never runs a getter or a toJSON on the way: a copy carries the accessor itself', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const ran: string[] = [];
    const obj = {
      error,
      get computed() {
        ran.push('getter');
        return 1;
      },
      nested: {
        toJSON() {
          ran.push('toJSON');
          return {};
        },
        get deep() {
          ran.push('nested getter');
          return 1;
        },
      },
    };

    logger.error({ message: 'a line', obj });

    expect(ran).toEqual([]);
    expect(entries[0].obj.error.message).toBe(SENTENCE);
    expect(typeof Object.getOwnPropertyDescriptor(entries[0].obj, 'computed')?.get).toBe('function');
    expect(entries[0].obj.nested).toBe(obj.nested);
  });

  it('only the containers on the way to it are copied: everything beside it is the very same value', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const rows = [{ id: 1 }, { id: 2 }];
    const beside = { rows };
    const obj = { beside, holder: { error } };

    logger.error({ message: 'a line', obj });

    expect(entries[0].obj).not.toBe(obj);
    expect(entries[0].obj.holder).not.toBe(obj.holder);
    expect(entries[0].obj.beside).toBe(beside);
    expect(entries[0].obj.beside.rows).toBe(rows);
  });
});

describe('the walk is bounded: what lies beyond is left as it is, never replaced', () => {
  const nestedUnder = (levels: number, leaf: unknown) => {
    let value: unknown = leaf;
    for (let level = 0; level < levels; level++) {
      value = { value };
    }
    return value as { [key: string]: unknown };
  };

  it(`a marked error held ${LogLineErrors.WALK_DEPTH} containers down is swapped; one container deeper, the line is the very same value`, () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const within = nestedUnder(LogLineErrors.WALK_DEPTH, { error });
    const beyond = nestedUnder(LogLineErrors.WALK_DEPTH + 1, { error });

    logger.info({ message: 'within', obj: within });
    logger.info({ message: 'beyond', obj: beyond });

    expect(inspect(entries[0].obj, { depth: null })).not.toContain(VALUE);
    expect(inspect(entries[0].obj, { depth: null })).toContain(SENTENCE);
    expect(entries[1].obj).toBe(beyond);
  });

  it('reads the same number of values however long the line: a million-element array, a 20,000-row list', () => {
    LogLineErrors.mark(vendorError(), () => LINE); // something in the process is marked
    let reads = 0;
    const counted = <T extends object>(target: T): T =>
      new Proxy(target, {
        getOwnPropertyDescriptor: (inner, key) => {
          reads++;
          return Reflect.getOwnPropertyDescriptor(inner, key);
        },
      });
    const numbers = counted(new Array(1_000_000).fill(7));
    const rows = counted(Array.from({ length: 20_000 }, (_each, id) => counted({ id, tags: ['a', 'b'] })));

    expect(LogLineErrors.forLine({ numbers })).toEqual({ numbers });
    expect(reads).toBeLessThanOrEqual(LogLineErrors.WALK_VALUES);
    reads = 0;
    const line = { rows };
    expect(LogLineErrors.forLine(line)).toBe(line);
    expect(reads).toBeLessThanOrEqual(LogLineErrors.WALK_VALUES);
  });

  it('nearest first: a marked error BESIDE a list longer than the budget is found, and the list rides along untouched', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const rows = Array.from({ length: LogLineErrors.WALK_VALUES * 4 }, (_each, id) => ({ id, meta: { tags: ['a'] } }));

    logger.error({ message: 'a line', obj: { rows, error } });

    expect(entries[0].obj.error.message).toBe(SENTENCE);
    expect(entries[0].obj.rows).toBe(rows);
  });

  it('a marked error past the budget, deep in a long list, is left as it is — and so is every row of the line', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const rows: { [key: string]: unknown }[] = Array.from({ length: LogLineErrors.WALK_VALUES * 2 }, (_each, id) => ({
      id,
    }));
    rows[rows.length - 1].error = error;
    const obj = { rows };

    logger.info({ message: 'a line', obj });

    expect(entries[0].obj).toBe(obj);
  });

  it('a marked error the walk never reached is still swapped when its holder is copied for another', () => {
    const { entries, logger } = capture();
    const [early, late] = [vendorError(), vendorError()];
    [early, late].forEach((each) => LogLineErrors.mark(each, () => LINE));
    const results: unknown[] = new Array(LogLineErrors.WALK_VALUES * 2).fill(0);
    results[0] = early;
    results[results.length - 1] = late;

    logger.warn({ message: 'a line', obj: { results } });

    expect(entries[0].obj.results[0].message).toBe(SENTENCE);
    expect(entries[0].obj.results[results.length - 1].message).toBe(SENTENCE);
    expect(entries[0].obj.results).toHaveLength(results.length);
  });

  it('a typed array is not read into: its bytes spend none of the budget', () => {
    const { entries, logger } = capture();
    const error = vendorError();
    LogLineErrors.mark(error, () => LINE);
    const bytes = Buffer.alloc(LogLineErrors.WALK_VALUES * 2);

    logger.error({ message: 'a line', obj: { bytes, holder: { error } } });

    expect(entries[0].obj.holder.error.message).toBe(SENTENCE);
    expect(entries[0].obj.bytes).toBe(bytes);
  });
});

describe('every copy of this package in a process reads the same marks', () => {
  it('an error marked through one copy is swapped by a logger of another', () => {
    let otherCopy: typeof import('../src/LogLineErrors') | undefined;
    jest.isolateModules(() => {
      otherCopy = require('../src/LogLineErrors');
    });
    const { entries, logger } = capture();
    const error = vendorError();

    expect(otherCopy?.LogLineErrors).not.toBe(LogLineErrors);
    otherCopy?.LogLineErrors.mark(error, () => LINE);
    logger.error({ error });

    expect((entries[0].error as Error).message).toBe(SENTENCE);
  });
});
