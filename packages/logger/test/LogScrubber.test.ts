/**
 * The categorical ciphertext stray-catcher (TRUST_AND_COMPLIANCE Firmed-up §2.0): any
 * `pjenc:1:` envelope that reaches a log line — obj graph, message template, error message —
 * logs as its `[encrypted len=N]` size marker, through the ONE Logger seam, with inputs
 * never mutated and clean payloads passed through by reference.
 */

import { Logger } from '../src/Logger';
import { LogScrubber } from '../src/LogScrubber';
import { Log, DefaultLogWriter } from '../src/DefaultLogWriter';

// A shape-realistic envelope for an 11-byte plaintext: AES-GCM preserves length, so the
// ciphertext payload is 11 + 12 (IV) + 16 (tag) = 39 bytes = 52 base64url chars. The marker
// carries the PLAINTEXT BYTE length, computed key-free from the payload alone.
const ENVELOPE = `pjenc:1:user-1:1:${'A'.repeat(52)}`;
const MARKER = '[encrypted len=11]';

const createCapturingWriter = () => {
  const entries: Log[] = [];
  const logWriter = { write: (log: Log) => entries.push(log) } as unknown as DefaultLogWriter;
  return { logWriter, entries };
};

describe('LogScrubber', () => {
  test('an envelope string value logs as its size marker', () => {
    expect(LogScrubber.scrub(ENVELOPE)).toBe(MARKER);
  });

  test('an envelope embedded mid-string (template literals) is replaced in place', () => {
    expect(LogScrubber.scrub(`stored value was ${ENVELOPE} for row r1`)).toBe(`stored value was ${MARKER} for row r1`);
  });

  test('envelopes nested in object graphs and arrays are replaced; the input is NOT mutated', () => {
    const payload = { rows: [{ id: 'r1', body: ENVELOPE }], note: 'clean' };
    const scrubbed = LogScrubber.scrub(payload) as typeof payload;
    expect(scrubbed.rows[0].body).toBe(MARKER);
    expect(scrubbed.note).toBe('clean');
    expect(payload.rows[0].body).toBe(ENVELOPE); // caller's object untouched
  });

  test('a clean payload passes through by reference (no copy, no cost)', () => {
    const payload = { id: 'r1', count: 3, nested: { name: 'metadata' } };
    expect(LogScrubber.scrub(payload)).toBe(payload);
  });

  test('an Error whose message carries an envelope is scrubbed; clean errors pass by reference', () => {
    const dirty = new Error(`decrypt failed for ${ENVELOPE}`);
    const scrubbed = LogScrubber.scrub(dirty) as { message: string; stack?: string };
    expect(scrubbed.message).toBe(`decrypt failed for ${MARKER}`);
    expect(scrubbed.stack ?? '').not.toContain('pjenc:1:');

    const clean = new Error('plain failure');
    expect(LogScrubber.scrub(clean)).toBe(clean);
  });

  test('cyclic object graphs do not hang the scrub', () => {
    const payload: any = { name: 'metadata' };
    payload.self = payload;
    expect(() => LogScrubber.scrub(payload)).not.toThrow();
  });
});

describe('Logger seam integration', () => {
  test('every level scrubs obj, message, and error before the writer sees them', () => {
    const { logWriter, entries } = createCapturingWriter();
    const logger = new Logger({ name: 'scrub-test', logLevel: 'debug', logWriter });

    logger.debug({ message: `debug ${ENVELOPE}`, obj: { value: ENVELOPE } });
    logger.info({ obj: { value: ENVELOPE } });
    logger.warn({ obj: { value: ENVELOPE } });
    logger.error({ obj: { value: ENVELOPE }, error: new Error(`boom ${ENVELOPE}`) });

    expect(entries).toHaveLength(4);
    for (const entry of entries) {
      expect(JSON.stringify(entry)).not.toContain('pjenc:1:');
    }
    expect(entries[0].message).toBe(`debug ${MARKER}`);
    expect((entries[3] as any).error.message).toBe(`boom ${MARKER}`);
  });
});
