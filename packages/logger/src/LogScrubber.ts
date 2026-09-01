/**
 * The categorical ciphertext stray-catcher (TRUST_AND_COMPLIANCE Firmed-up §2.0):
 * encrypted database values are self-identifying envelopes (`pjenc:1:<owner>:<version>:<payload>`),
 * so any one of them that reaches a log line — through an error context, a third-party
 * serializer, a template string, any path at all — is replaced by a compact size marker
 * (`[encrypted len=N]`) at the Logger seam, with no per-site work anywhere. Size metadata is
 * kept deliberately (sizes are worth tracking); the ciphertext bytes are pure log-volume
 * waste that would couple retained logs to stored ciphertext.
 *
 * The prefix literal is duplicated from @proteinjs/db's `EncryptionEnvelope.PREFIX` by
 * design: the logger sits below the db package in the layer graph, and the self-identifying
 * envelope format IS the cross-layer contract (the db package's envelope test pins it).
 *
 * Copy-on-hit: inputs are never mutated, and when a payload contains no envelope it is
 * passed through by reference — the scrub costs one prefix scan per string.
 */
export class LogScrubber {
  private static readonly ENVELOPE_MARK = 'pjenc:1:';
  private static readonly ENVELOPE_PATTERN = /pjenc:1:[^:\s"'`]+:\d+:[A-Za-z0-9_-]*/g;
  private static readonly MAX_DEPTH = 8;

  /** Scrub one value (string, array, object graph, Error). Returns the input unchanged when clean. */
  static scrub<T>(value: T): T {
    return LogScrubber.scrubValue(value, 0, new WeakSet()) as T;
  }

  private static scrubValue(value: any, depth: number, seen: WeakSet<object>): any {
    if (typeof value === 'string') {
      return LogScrubber.scrubString(value);
    }

    if (!value || typeof value !== 'object' || depth >= LogScrubber.MAX_DEPTH) {
      return value;
    }

    if (seen.has(value)) {
      return value; // cycle — leave the reference; the first visit decided its shape
    }
    seen.add(value);

    if (value instanceof Error) {
      const message = LogScrubber.scrubString(value.message);
      const stack = typeof value.stack === 'string' ? LogScrubber.scrubString(value.stack) : value.stack;
      if (message === value.message && stack === value.stack) {
        return value;
      }
      // Copy-on-hit: a plain shape carrying what log writers consume (name/message/stack).
      return { name: value.name, message, stack };
    }

    if (Array.isArray(value)) {
      let changed = false;
      const scrubbed = value.map((item) => {
        const result = LogScrubber.scrubValue(item, depth + 1, seen);
        changed = changed || result !== item;
        return result;
      });
      return changed ? scrubbed : value;
    }

    let changed = false;
    const copy: { [key: string]: any } = {};
    for (const key of Object.keys(value)) {
      const item = value[key];
      const result = LogScrubber.scrubValue(item, depth + 1, seen);
      copy[key] = result;
      changed = changed || result !== item;
    }
    return changed ? copy : value;
  }

  private static scrubString(value: string): string {
    if (value.indexOf(LogScrubber.ENVELOPE_MARK) === -1) {
      return value;
    }

    return value.replace(LogScrubber.ENVELOPE_PATTERN, (envelope) => LogScrubber.marker(envelope));
  }

  /**
   * `[encrypted len=N]` with N = the PLAINTEXT BYTE length, computable key-free: AES-GCM
   * preserves length, so decoding the base64url payload (×3/4) and subtracting the IV (12)
   * + auth tag (16) yields the plaintext bytes. Bytes deliberately — one unit with the
   * service seam's byte sizes; a char count would require decrypting. The formula mirrors
   * @proteinjs/db `EncryptionEnvelope.logMarker` (the envelope format's owner); publishing
   * the exact byte length is a small, accepted metadata disclosure — a decision, not an
   * accident.
   */
  private static marker(envelope: string): string {
    const payloadStart = envelope.lastIndexOf(':') + 1;
    const payloadLength = envelope.length - payloadStart;
    const plaintextBytes = Math.max(0, Math.floor((payloadLength * 3) / 4) - 28);
    return `[encrypted len=${plaintextBytes}]`;
  }
}
