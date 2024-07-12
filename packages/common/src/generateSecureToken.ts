import crypto from 'crypto';

/**
 * Generates a cryptographically secure random token.
 *
 * This function uses Node.js's crypto.randomBytes to generate a secure random token.
 * The token is returned as a hexadecimal string, which is safe for use in URLs and databases.
 *
 * @param {number} [bytes=32] - The number of bytes to generate. Default is 32, which results in a 64-character hex string.
 *
 * @returns {string} A cryptographically secure random token as a hexadecimal string.
 *
 * @example
 * // Generate a 128-character token
 * const longToken = generateSecureToken(64);
 */
export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
