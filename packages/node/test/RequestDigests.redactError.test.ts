import { inspect, types } from 'util';
import { RequestDigests } from '../src/RequestDigests';

/**
 * The door an error passes through on its way to a log line: a copy with every e-mail address in
 * it swapped for its address digest — the words the server did not write (a database's refusal,
 * a mail server's reply) are exactly where an address hides.
 */
describe('RequestDigests.redactError', () => {
  const digests = new RequestDigests({ secret: 'test-session-secret' });
  const ADDRESS_SHAPE = /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const addressesIn = (text: string) => text.match(ADDRESS_SHAPE) ?? [];

  /** A database driver's error, as a unique-index refusal reaches a catch block. */
  class DriverError extends Error {
    constructor(
      message: string,
      readonly code: number,
      readonly details: string
    ) {
      super(message);
      // An ES5 build of an Error subclass loses its prototype; the driver's own classes keep theirs.
      Object.setPrototypeOf(this, DriverError.prototype);
      this.name = 'DriverError';
    }
  }

  const violation = () =>
    new DriverError(
      '6 ALREADY_EXISTS: Unique index violation on index user_email_unique at index key [Ada.Lovelace@Example.com,7f3e]',
      6,
      'Unique index violation on index user_email_unique at index key [Ada.Lovelace@Example.com,7f3e]'
    );

  it('a unique-index violation naming an address logs its digest instead — message, stack and every field', () => {
    const error = violation();
    const redacted = digests.redactError(error);
    const digest = digests.address('ada.lovelace@example.com');

    expect(redacted.message).toBe(
      `6 ALREADY_EXISTS: Unique index violation on index user_email_unique at index key [${digest},7f3e]`
    );
    expect(redacted.details).toContain(`[${digest},7f3e]`);
    expect(redacted.stack).toContain(digest);
    expect(addressesIn(redacted.stack ?? '')).toEqual([]);
    expect(addressesIn(inspect(redacted, { depth: null }))).toEqual([]);
    expect(addressesIn(JSON.stringify(redacted))).toEqual([]);
  });

  it('the copy is still the same error: its class, its name, its code, its stack frames', () => {
    const error = violation();
    const redacted = digests.redactError(error);

    expect(redacted).toBeInstanceOf(DriverError);
    expect(redacted).toBeInstanceOf(Error);
    expect(redacted.name).toBe('DriverError');
    expect(redacted.code).toBe(6);
    expect(redacted.stack?.split('\n').slice(1)).toEqual(error.stack?.split('\n').slice(1));
    // A real error to every printer: a log writer that inspects it prints its stack, as it would the original's.
    expect(types.isNativeError(redacted)).toBe(true);
    expect(inspect(redacted)).toContain('DriverError: 6 ALREADY_EXISTS: Unique index violation');
    expect(inspect(redacted)).toContain(error.stack?.split('\n')[1].trim());
    // Visibility kept: an error's message and stack stay out of its enumerable fields, as they were.
    expect(Object.keys(redacted).sort()).toEqual(Object.keys(error).sort());
  });

  it('the original error is never touched — the caller still holds and throws the real one', () => {
    const error = violation();
    const message = error.message;
    const stack = error.stack;

    digests.redactError(error);

    expect(error.message).toBe(message);
    expect(error.stack).toBe(stack);
    expect(error.details).toContain('Ada.Lovelace@Example.com');
  });

  it('an address inside a cause, an aggregate, a rejected list or a nested field is swapped too', () => {
    const cause = new Error('refused: grace@example.org');
    // As `new Error(message, { cause })` and `new AggregateError(errors, message)` leave them: own,
    // non-enumerable fields — the ones a copy made from the enumerable fields alone would drop.
    const wrapper = Object.defineProperty(new Error('the write failed'), 'cause', { value: cause, enumerable: false });
    const aggregate = Object.defineProperty(new Error('several'), 'errors', {
      value: [new Error('one: ada@example.com'), 'two: grace@example.org'],
      enumerable: false,
    });
    // A mail transport's refusal: the reply and the rejected list both repeat the recipient.
    const refused = Object.assign(new Error("Can't send mail - all recipients were rejected: 550 <ada@example.com>"), {
      response: '550 5.1.1 <ada@example.com>: Recipient address rejected',
      rejected: ['ada@example.com'],
      rejectedErrors: [
        Object.assign(new Error('Recipient command failed: 550 <ada@example.com>'), { recipient: 'ada@example.com' }),
      ],
      envelope: { from: 'Sender <sender@example.net>', to: ['ada@example.com'] },
    });

    for (const error of [wrapper, aggregate, refused]) {
      const redacted = digests.redactError(error);
      expect(addressesIn(inspect(redacted, { depth: null, showHidden: true }))).toEqual([]);
      expect(addressesIn(JSON.stringify(redacted))).toEqual([]);
    }
    const fieldOf = (error: Error, name: string) => (error as unknown as Record<string, unknown>)[name];
    expect((fieldOf(digests.redactError(wrapper), 'cause') as Error).message).toBe(
      `refused: ${digests.address('grace@example.org')}`
    );
    expect((fieldOf(digests.redactError(aggregate), 'errors') as unknown[])[1]).toBe(
      `two: ${digests.address('grace@example.org')}`
    );
    expect(digests.redactError(refused).rejected).toEqual([digests.address('ada@example.com')]);
  });

  it('a URL-encoded address digests to the same digest as the bare one, whatever its case', () => {
    const error = new Error('GET /dev/login?email=Ada%2BLane%40Example.com failed; ada+lane@example.com has no row');
    const digest = digests.address('ada+lane@example.com');

    expect(digests.redactError(error).message).toBe(`GET /dev/login?email=${digest} failed; ${digest} has no row`);
  });

  it('whatever was caught passes through the same door: a string, a plain object, a list', () => {
    const digest = digests.address('ada@example.com');

    expect(digests.redactError('no account for ada@example.com')).toBe(`no account for ${digest}`);
    expect(digests.redactError({ reason: 'exists', key: ['ada@example.com', 7] })).toEqual({
      reason: 'exists',
      key: [digest, 7],
    });
    expect(digests.redactError(undefined)).toBeUndefined();
    expect(digests.redactError(42)).toBe(42);
  });

  it('a cycle closes on the copy, and a value nested deeper than any error carries is dropped, never passed through', () => {
    const error = new Error('outer: ada@example.com') as Error & { self?: unknown; deep?: unknown };
    error.self = error;
    let deep: Record<string, unknown> = { leaf: { text: 'grace@example.org' } };
    for (let i = 0; i < 20; i++) {
      deep = { deeper: deep };
    }
    error.deep = deep;

    const redacted = digests.redactError(error);

    expect(redacted.self).toBe(redacted);
    expect(addressesIn(inspect(redacted, { depth: null }))).toEqual([]);
    expect(inspect(redacted, { depth: null })).toContain('[dropped: nested too deep]');
  });

  it('text without an address is left exactly as it was', () => {
    const error = new Error('Session ID unknown (code 1) at 10:42 — retry later');

    expect(digests.redactError(error).message).toBe('Session ID unknown (code 1) at 10:42 — retry later');
  });
});
