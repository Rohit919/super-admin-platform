/**
 * Cryptographic helpers.
 * Thin wrappers over the Node.js Web Crypto API so call sites read clearly
 * and can be swapped/mocked in one place.
 */

/** Generate a random opaque token (UUID v4). Used for refresh tokens. */
export function randomToken(): string {
  return crypto.randomUUID();
}
