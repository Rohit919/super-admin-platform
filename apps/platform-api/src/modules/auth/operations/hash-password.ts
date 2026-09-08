import argon2 from "argon2";

/**
 * Argon2id parameters (SECURITY.md §7 — modern password hashing with a unique
 * salt and an appropriate work factor). These follow current OWASP guidance for
 * Argon2id; tune `memoryCost`/`timeCost` to the deployment's hardware budget.
 *
 * argon2 generates a cryptographically random salt per hash automatically and
 * encodes all parameters into the output string, so verification and future
 * rehash decisions are self-describing.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/**
 * Pure operation: hash a plaintext password with Argon2id.
 * Kept as a standalone function so it can be unit-tested and reused across the
 * auth flows and any admin user-creation path.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

/**
 * True if a stored hash should be re-hashed with the current parameters — i.e.
 * it is a legacy bcrypt hash or an Argon2 hash produced with weaker options.
 * Call after a successful login to transparently upgrade the stored hash.
 */
export function needsRehash(storedHash: string): boolean {
  // Legacy bcrypt hashes ($2a$/$2b$/$2y$) must be upgraded to Argon2id.
  if (storedHash.startsWith("$2")) return true;
  try {
    return argon2.needsRehash(storedHash, ARGON2_OPTIONS);
  } catch {
    // Unrecognized format → force a rehash on next successful auth.
    return true;
  }
}
