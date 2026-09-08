import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { hashPassword, needsRehash } from "../hash-password.js";
import { verifyPassword } from "../verify-password.js";

/**
 * Password hashing (SECURITY.md §7). Verifies Argon2id hashing, backward
 * compatibility with legacy bcrypt hashes, and transparent rehash detection.
 */
describe("password hashing", () => {
  it("hashes with Argon2id", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies a correct Argon2id password and rejects a wrong one", async () => {
    const hash = await hashPassword("s3cret-passphrase");
    expect(await verifyPassword("s3cret-passphrase", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("still verifies legacy bcrypt hashes (migration path)", async () => {
    const legacy = await bcrypt.hash("legacy-pass", 10);
    expect(await verifyPassword("legacy-pass", legacy)).toBe(true);
    expect(await verifyPassword("nope", legacy)).toBe(false);
  });

  it("flags legacy bcrypt hashes for rehash and fresh argon2 hashes as current", async () => {
    const legacy = await bcrypt.hash("legacy-pass", 10);
    expect(needsRehash(legacy)).toBe(true);

    const fresh = await hashPassword("fresh-pass");
    expect(needsRehash(fresh)).toBe(false);
  });

  it("fails closed on unknown hash formats", async () => {
    expect(await verifyPassword("anything", "not-a-real-hash")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});
