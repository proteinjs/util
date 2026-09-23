import { createHash } from 'crypto';
import { RequestDigests } from '../src/RequestDigests';

/**
 * The keyed digests a server writes on its log lines in place of identities: the account digest
 * (a keyed hash of the lowercased address of an account), the address digest (the same hash under
 * its own label, for a bare recipient address) and the coarse IP hash. Each is stable for one key
 * (so an operator can say "one account, one recipient, one device" across lines, pods and
 * restarts) and useless without it (never the address, never a plain hash a list of addresses
 * could reverse).
 */
describe('RequestDigests', () => {
  const digests = new RequestDigests({ secret: 'test-session-secret' });

  it('the account digest is stable for one address whatever its case or surrounding spaces', () => {
    const digest = digests.account('Ada.Lovelace@Example.com');

    expect(digest).toMatch(/^[0-9a-f]{16}$/);
    expect(digests.account('ada.lovelace@example.com')).toBe(digest);
    expect(digests.account('  ADA.LOVELACE@EXAMPLE.COM ')).toBe(digest);
    expect(digests.account('ada.lovelace@example.org')).not.toBe(digest);
  });

  it('the account digest is keyed: another key gives another digest, and it is no plain hash of the address', () => {
    const address = 'ada.lovelace@example.com';
    const digest = digests.account(address);

    expect(new RequestDigests({ secret: 'another-secret' }).account(address)).not.toBe(digest);
    expect(createHash('sha256').update(address).digest('hex')).not.toContain(digest);
    expect(digest).not.toContain('ada');
  });

  it('the address digest is stable for one address whatever its case or surrounding spaces, keyed, and no plain hash', () => {
    const digest = digests.address('Invitee@Example.invalid');

    expect(digest).toMatch(/^[0-9a-f]{16}$/);
    expect(digests.address('  invitee@example.INVALID ')).toBe(digest);
    expect(digests.address('invitee@example.test')).not.toBe(digest);
    expect(new RequestDigests({ secret: 'another-secret' }).address('invitee@example.invalid')).not.toBe(digest);
    expect(createHash('sha256').update('invitee@example.invalid').digest('hex')).not.toContain(digest);
  });

  it('the three digests are separate: one value never reads as another', () => {
    expect(digests.account('203.0.113.7')).not.toBe(digests.coarseIp('203.0.113.7'));
    expect(digests.account('ada.lovelace@example.com')).not.toBe(digests.address('ada.lovelace@example.com'));
    expect(digests.address('203.0.113.7')).not.toBe(digests.coarseIp('203.0.113.7'));
  });

  it('the coarse IP hash is stable for one IPv4 address and differs for the next', () => {
    const hash = digests.coarseIp('203.0.113.7');

    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(digests.coarseIp('203.0.113.7')).toBe(hash);
    expect(digests.coarseIp('::ffff:203.0.113.7')).toBe(hash);
    expect(digests.coarseIp('203.0.113.8')).not.toBe(hash);
  });

  it('IPv6 is coarsened to its /64 — one device rotates freely inside its own /64', () => {
    const hash = digests.coarseIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd');

    expect(digests.coarseIp('2001:db8:1:2::1')).toBe(hash);
    expect(digests.coarseIp('2001:0db8:0001:0002:ffff:0:0:1')).toBe(hash);
    expect(digests.coarseIp('2001:db8:1:3::1')).not.toBe(hash);
  });

  it('with no key configured the digests refuse to run — never a plain hash, never a key of their own', () => {
    const original = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      expect(() => new RequestDigests().account('ada.lovelace@example.com')).toThrow(/SESSION_SECRET/);
      expect(() => new RequestDigests().address('ada.lovelace@example.com')).toThrow(/SESSION_SECRET/);
      expect(() => new RequestDigests({ secret: '' }).coarseIp('203.0.113.7')).toThrow(/SESSION_SECRET/);
    } finally {
      if (original !== undefined) {
        process.env.SESSION_SECRET = original;
      }
    }
  });

  it('reads the key the deployment configures (SESSION_SECRET) when none is passed', () => {
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'test-session-secret';
    try {
      expect(new RequestDigests().account('ada.lovelace@example.com')).toBe(
        digests.account('ada.lovelace@example.com')
      );
      expect(new RequestDigests().address('ada.lovelace@example.com')).toBe(
        digests.address('ada.lovelace@example.com')
      );
    } finally {
      if (original === undefined) {
        delete process.env.SESSION_SECRET;
      } else {
        process.env.SESSION_SECRET = original;
      }
    }
  });
});
