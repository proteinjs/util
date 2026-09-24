import { createHmac } from 'crypto';
import { types } from 'util';

/**
 * The keyed digests a server writes on its log lines — and keys its throttle windows on — in place
 * of the identities they stand for. No log line carries an e-mail address; it carries one of these:
 * - `account(email)` — the ACCOUNT DIGEST: a keyed hash of the trimmed, lowercased address of an
 *   account (or of the address a sign-in or reset door was asked about). One address gives one
 *   digest however it was typed, on every replica and across restarts, so an operator can say
 *   "one account" across lines without the address.
 * - `address(email)` — the ADDRESS DIGEST: the same hash under its own label, for a bare address
 *   that names no account — a mail recipient, an invitee — so an operator can say "one recipient"
 *   across lines without the address. A log line that names a recipient may add the address's
 *   DOMAIN beside it (`example.invalid`): a domain is not an identity.
 * - `coarseIp(address)` — the COARSE IP HASH: a keyed hash of the client address at the grain
 *   one device holds (an IPv4 address; an IPv6 /64, inside which a device rotates freely), so
 *   an operator can say "one device" and a throttle cannot be dodged by rotating inside a /64.
 *
 * Keyed with HMAC-SHA256 under a key DERIVED from the session secret — the one secret every
 * replica already shares; derived per label, never used raw, so no digest weakens the session's
 * own use of it, and no two digests collide in meaning. Truncated to 64 bits: enough to tell
 * accounts, recipients and devices apart, useless to anyone without the key — never the address,
 * never a plain hash a list of addresses could reverse.
 *
 * The key is the deployment's `SESSION_SECRET` unless the constructor is given one (the tests).
 * Without either the digests refuse to run: a server with no `SESSION_SECRET` has no sessions
 * either (the session middleware refuses to start), so nothing ever runs unkeyed — never a plain
 * hash a list of addresses could reverse, never a per-process key that quietly stops matching
 * across replicas.
 *
 * An error is the one thing a log line carries whose words the server did not write: a database's
 * unique-index violation names the key it refused, a mail server's reply names the recipient it
 * refused. `redactError(error)` is the door every such error passes through on its way to a log.
 */
export class RequestDigests {
  /** Hex characters kept from the HMAC: 64 bits. */
  private static readonly DIGEST_HEX_LENGTH = 16;
  /**
   * An e-mail address as it shows up in text: bare, or URL-encoded (`%40` for the `@`) as a request
   * path or a query string carries it.
   */
  private static readonly ADDRESS_SHAPE = /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  /** How deep `redactError` follows nested objects; anything deeper is dropped, never passed through. */
  private static readonly MAX_ERROR_DEPTH = 10;
  /** What stands in for a value nested deeper than `MAX_ERROR_DEPTH`. */
  private static readonly TOO_DEEP = '[dropped: nested too deep]';
  /** What stands in for a field that cannot be read (a getter that throws) or an object that refuses to list its fields. */
  private static readonly UNREADABLE = '[dropped: unreadable]';

  constructor(private readonly options?: { secret?: string }) {}

  /** The account digest of an address, however it was typed. */
  account(email: string): string {
    return this.digest('account-digest', email.trim().toLowerCase());
  }

  /** The address digest of a bare address (a recipient, an invitee), however it was typed. */
  address(email: string): string {
    return this.digest('address-digest', email.trim().toLowerCase());
  }

  /** The coarse IP hash of a client address. */
  coarseIp(address: string): string {
    return this.digest('coarse-ip', this.coarsen(address.trim().toLowerCase()));
  }

  /**
   * A copy of `error` a log line may carry: every e-mail address in it — bare or URL-encoded —
   * swapped for its address digest, wherever it sits: the message, the stack, a `cause`, an
   * aggregate's `errors`, a `rejected` list, any string property at any depth. The stack is kept
   * as it is except for the addresses in it; the copy keeps the error's class (so it still reads
   * and prints as that error) and every other word of it. The original is never touched — the
   * caller still holds and throws the real error.
   *
   * Anything that is not an error passes through the same way (a string, a list, an object), so a
   * caller never has to know what it caught. Something nested deeper than any error carries is
   * dropped rather than passed through unread.
   */
  redactError<T>(error: T): T {
    return this.redacted(error, new Map<object, unknown>(), 0) as T;
  }

  private digest(purpose: string, value: string): string {
    return createHmac('sha256', `${purpose}:${this.secret()}`)
      .update(value)
      .digest('hex')
      .slice(0, RequestDigests.DIGEST_HEX_LENGTH);
  }

  private secret(): string {
    const configured = this.options?.secret ?? process.env.SESSION_SECRET;
    if (!configured) {
      throw new Error(
        'SESSION_SECRET is not set: the account digest, the address digest and the coarse IP hash need the key every replica shares'
      );
    }
    return configured;
  }

  /** An IPv4 address as itself (an IPv4-mapped IPv6 address as its IPv4); an IPv6 address as its /64. */
  private coarsen(address: string): string {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
    if (mapped) {
      return mapped[1];
    }
    if (!address.includes(':')) {
      return address;
    }
    const groups = this.ipv6Groups(address.split('%')[0]);
    return groups ? `${groups.slice(0, 4).join(':')}::/64` : address;
  }

  /** The first four groups (the /64) of an IPv6 address, each without leading zeros; undefined when it does not parse. */
  private ipv6Groups(address: string): string[] | undefined {
    const halves = address.split('::');
    if (halves.length > 2) {
      return undefined;
    }
    const parts = (half: string | undefined) => (half ? half.split(':') : []);
    const head = parts(halves[0]);
    const tail = parts(halves[1]);
    // A trailing dotted IPv4 part stands for two groups.
    const groupsIn = (list: string[]) => list.reduce((count, part) => count + (part.includes('.') ? 2 : 1), 0);
    const missing = 8 - groupsIn(head) - groupsIn(tail);
    if (missing < 0 || (halves.length === 1 && missing !== 0)) {
      return undefined;
    }
    const zeros: string[] = [];
    for (let i = 0; i < missing; i++) {
      zeros.push('0');
    }
    const groups = head.concat(zeros, tail).slice(0, 4);
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
      return undefined;
    }
    return groups.map((group) => parseInt(group, 16).toString(16));
  }

  /**
   * `value` with every address swapped (`redactError`'s walk). `seen` maps each object already
   * copied to its copy, so a cycle (an error whose cause points back at it) closes on the copy.
   */
  private redacted(value: unknown, seen: Map<object, unknown>, depth: number): unknown {
    if (typeof value === 'string') {
      return this.redactedText(value);
    }
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (seen.has(value)) {
      return seen.get(value);
    }
    if (value instanceof Date || value instanceof RegExp) {
      return value;
    }
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      // Bytes are words nobody has read — a reply's body spells whatever the server sent. Dropped, never carried.
      return `[dropped: binary, ${value.byteLength} bytes]`;
    }
    if (depth >= RequestDigests.MAX_ERROR_DEPTH) {
      return RequestDigests.TOO_DEEP;
    }
    if (Array.isArray(value)) {
      const copy: unknown[] = [];
      seen.set(value, copy);
      value.forEach((entry) => copy.push(this.redacted(entry, seen, depth + 1)));
      return copy;
    }
    if (value instanceof Map) {
      const copy = new Map<unknown, unknown>();
      seen.set(value, copy);
      value.forEach((entry, key) =>
        copy.set(this.redacted(key, seen, depth + 1), this.redacted(entry, seen, depth + 1))
      );
      return copy;
    }
    if (value instanceof Set) {
      const copy = new Set<unknown>();
      seen.set(value, copy);
      value.forEach((entry) => copy.add(this.redacted(entry, seen, depth + 1)));
      return copy;
    }
    // An error of another realm (a vm context's) is not `instanceof` this one's Error; it is still a native error.
    if (value instanceof Error || types.isNativeError(value)) {
      return this.redactedErrorObject(value, seen, depth);
    }
    // Any other object reads as its own fields: a class instance's methods are not what a log line
    // prints, and a copy that kept its class could not run them without the original's internals.
    // A field's NAME is text too (a per-recipient map keys its entries by the address).
    const keys = this.keysOf(value);
    if (!keys) {
      return RequestDigests.UNREADABLE;
    }
    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    for (const key of keys) {
      copy[this.redactedText(key)] = this.redacted(this.fieldOf(value, key), seen, depth + 1);
    }
    return copy;
  }

  /**
   * An error's copy: a native error (so every printer treats it as one — a stack, a cause) of the
   * same class, holding every property the error holds itself — the non-enumerable ones included
   * (`message`, `stack`, a `cause`, an aggregate's `errors`), each with the same visibility it had,
   * so the copy prints and serializes as the original did. A field the error's class keeps behind a
   * getter (a DOMException's name, message and code live in internal slots no copy can have) is
   * carried as what the getter answered, so the copy reads as the original did instead of throwing.
   */
  private redactedErrorObject(error: Error, seen: Map<object, unknown>, depth: number): Error {
    const copy = new Error();
    Object.setPrototypeOf(copy, Object.getPrototypeOf(error));
    seen.set(error, copy);
    const own = Object.getOwnPropertyNames(error);
    // The fresh error's own stack (captured here) is not the original's: only the original's fields stay.
    for (const key of Object.getOwnPropertyNames(copy)) {
      if (own.indexOf(key) < 0) {
        delete (copy as unknown as Record<string, unknown>)[key];
      }
    }
    for (const key of own) {
      const descriptor = Object.getOwnPropertyDescriptor(error, key);
      this.defineField(
        copy,
        this.redactedText(key),
        this.redacted(this.fieldOf(error, key), seen, depth + 1),
        descriptor
      );
    }
    this.inheritedGetters(error).forEach((descriptor, key) => {
      if (own.indexOf(key) < 0) {
        this.defineField(copy, key, this.redacted(this.fieldOf(error, key), seen, depth + 1), descriptor);
      }
    });
    return copy;
  }

  /** The accessor fields the error's own classes declare — between the error and `Error.prototype` — nearest class first. */
  private inheritedGetters(error: Error): Map<string, PropertyDescriptor> {
    const getters = new Map<string, PropertyDescriptor>();
    for (
      let prototype = Object.getPrototypeOf(error);
      prototype && prototype !== Error.prototype && prototype !== Object.prototype;
      prototype = Object.getPrototypeOf(prototype)
    ) {
      for (const key of Object.getOwnPropertyNames(prototype)) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
        if (descriptor?.get && !getters.has(key)) {
          getters.set(key, descriptor);
        }
      }
    }
    return getters;
  }

  /** A data field on the copy with the visibility the original's field had. */
  private defineField(target: object, key: string, value: unknown, descriptor: PropertyDescriptor | undefined): void {
    Object.defineProperty(target, key, {
      value,
      enumerable: descriptor?.enumerable ?? false,
      writable: true,
      configurable: true,
    });
  }

  /** An object's own enumerable field names, or `undefined` when it refuses to list them (a proxy that throws). */
  private keysOf(value: object): string[] | undefined {
    try {
      return Object.keys(value);
    } catch {
      return undefined;
    }
  }

  /** `value[key]`, or the unreadable marker when the read itself throws (a getter that throws). */
  private fieldOf(value: object, key: string): unknown {
    try {
      return (value as Record<string, unknown>)[key];
    } catch {
      return RequestDigests.UNREADABLE;
    }
  }

  /** A text with every address in it — bare or URL-encoded — replaced by its address digest. */
  private redactedText(text: string): string {
    return text.replace(RequestDigests.ADDRESS_SHAPE, (match) => this.address(this.decoded(match)));
  }

  /** A URL-encoded address as the address it stands for (`ada%2Blane%40example.com` → `ada+lane@example.com`). */
  private decoded(match: string): string {
    try {
      return decodeURIComponent(match);
    } catch {
      return match;
    }
  }
}
