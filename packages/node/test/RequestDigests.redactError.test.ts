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

  it('a field named by an address — a per-recipient map, an own field — is renamed to the digest', () => {
    const error = Object.assign(new Error('some recipients failed'), {
      failed: { 'Ada@Example.com': 'mailbox full', 'grace@example.org': { reason: 'unknown user' } },
      'ada@example.com': 'own field named by the address',
    });

    const redacted = digests.redactError(error) as Error & { failed: Record<string, unknown> };

    expect(redacted.failed).toEqual({
      [digests.address('ada@example.com')]: 'mailbox full',
      [digests.address('grace@example.org')]: { reason: 'unknown user' },
    });
    expect(Object.keys(redacted).sort()).toEqual([digests.address('ada@example.com'), 'failed']);
    expect(addressesIn(inspect(redacted, { depth: null }))).toEqual([]);
    expect(Object.keys(error.failed)).toEqual(['Ada@Example.com', 'grace@example.org']);
  });

  it('bytes are dropped, never carried unread: a response body whose bytes spell an address', () => {
    const body = Buffer.from('550 <ada@example.com> rejected');
    const error = Object.assign(new Error('the server answered'), { body, raw: new Uint8Array([1, 2, 3]) });

    const redacted = digests.redactError(error) as Error & { body: unknown; raw: unknown };

    expect(redacted.body).toBe(`[dropped: binary, ${body.byteLength} bytes]`);
    expect(redacted.raw).toBe('[dropped: binary, 3 bytes]');
    expect(addressesIn(String(redacted.body))).toEqual([]);
    expect(addressesIn(JSON.stringify(redacted))).toEqual([]);
    expect(String(error.body)).toContain('ada@example.com');
  });

  it('never throws on its way to a log: a field that throws when read, an object whose fields cannot be listed', () => {
    const error = new Error('the write failed for ada@example.com') as Error & { detail?: unknown; opaque?: unknown };
    error.detail = Object.defineProperty({ kept: 'grace@example.org' }, 'boom', {
      get() {
        throw new Error('not now');
      },
      enumerable: true,
    });
    error.opaque = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('no keys');
        },
      }
    );

    const redacted = digests.redactError(error);

    expect(redacted.message).toBe(`the write failed for ${digests.address('ada@example.com')}`);
    expect(redacted.detail).toEqual({ kept: digests.address('grace@example.org'), boom: '[dropped: unreadable]' });
    expect(redacted.opaque).toBe('[dropped: unreadable]');
  });

  it("an error whose name, message and code live behind its class's getters (as a DOMException keeps them) still reads and prints as itself", () => {
    // The shape of Node's DOMException — the error a fetch abort or timeout throws: the fields live
    // in a slot keyed by the instance, and each getter refuses any other `this`. (A same-realm
    // stand-in: the test runner's DOMException comes from another realm.)
    const slots = new WeakMap<object, { name: string; message: string; code: number }>();
    class SlotError extends Error {
      constructor(message: string, name: string, code: number) {
        super();
        Object.setPrototypeOf(this, SlotError.prototype);
        slots.set(this, { name, message, code });
      }
      private get slot() {
        const slot = slots.get(this);
        if (!slot) {
          throw new TypeError('Value of "this" must be of SlotError');
        }
        return slot;
      }
      get name() {
        return this.slot.name;
      }
      get message() {
        return this.slot.message;
      }
      get code() {
        return this.slot.code;
      }
    }
    const error = new SlotError('The operation was aborted for ada@example.com', 'AbortError', 20);

    const redacted = digests.redactError(error);

    expect(redacted).toBeInstanceOf(SlotError);
    expect(redacted.name).toBe('AbortError');
    expect(redacted.message).toBe(`The operation was aborted for ${digests.address('ada@example.com')}`);
    expect(redacted.code).toBe(20);
    expect(redacted.stack?.split('\n').slice(1)).toEqual(error.stack?.split('\n').slice(1));
    expect(addressesIn(inspect(redacted))).toEqual([]);
    expect(
      addressesIn(JSON.stringify({ name: redacted.name, message: redacted.message, stack: redacted.stack }))
    ).toEqual([]);
    expect(error.message).toContain('ada@example.com');
  });
});
