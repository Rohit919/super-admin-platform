import argon2 from "argon2";
import bcrypt from "bcryptjs";

/**
 * Pure operation: compare a plaintext password against a stored hash.
 *
 * Supports both the current Argon2id hashes and legacy bcrypt hashes so that
 * existing accounts keep working during the migration (SECURITY.md §7 —
 * hash-upgrade support). The stored hash's own prefix selects the algorithm;
 * we never trust caller-supplied metadata.
 *
 * Returns true on match, false otherwise. Never throws for a bad password —
 * malformed/unknown hashes simply fail closed (return false).
 */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  if (!hash) return false;

  // Legacy bcrypt hashes: $2a$ / $2b$ / $2y$
  if (hash.startsWith("$2")) {
    return bcrypt.compare(plaintext, hash);
  }

  // Argon2 hashes: $argon2id$ / $argon2i$ / $argon2d$
  if (hash.startsWith("$argon2")) {
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      return false;
    }
  }

  return false; // unknown format → fail closed
}
