import { createHmac } from 'crypto';

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
 */
export class RequestDigests {
  /** Hex characters kept from the HMAC: 64 bits. */
  private static readonly DIGEST_HEX_LENGTH = 16;

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
}
