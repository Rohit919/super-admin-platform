import {
  createHmac,
  createHash,
  randomInt,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { PrismaClient, OtpPurpose } from "@prisma/client";

/**
 * OTP service.
 *
 * Responsibilities:
 *  - generate a cryptographically-random 6-digit code
 *  - store only an HMAC of the code (never the plaintext)
 *  - enforce single active challenge per (destination, purpose)
 *  - verify with attempt limits and expiry
 *  - issue / verify single-use password-reset tokens (SHA-256 hashed)
 *
 * The code is returned to the caller ONLY from `generate` so it can be emailed.
 * It is never persisted or logged in plaintext.
 */

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Cryptographically-random 6-digit numeric code, zero-padded. */
function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * HMAC-SHA256 of the code, keyed by the app secret. Keying (rather than a plain
 * hash) means a leaked database alone cannot be brute-forced offline without
 * also having the secret.
 */
function hashCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time hex-string comparison. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface OtpServiceDeps {
  prisma: PrismaClient;
  secret: string;
}

export class OtpService {
  constructor(private readonly deps: OtpServiceDeps) {}

  /**
   * Create a new OTP challenge. Invalidates any prior active challenge for the
   * same (destination, purpose) so only the latest code is valid.
   * Returns the plaintext code for delivery by the caller.
   */
  async generate(input: {
    destination: string;
    purpose: OtpPurpose;
    userId?: string | null;
  }): Promise<{ code: string; expiresAt: Date }> {
    const { prisma, secret } = this.deps;
    const destination = input.destination.trim().toLowerCase();

    // Invalidate previous active challenges (mark consumed).
    await prisma.otpChallenge.updateMany({
      where: { destination, purpose: input.purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.otpChallenge.create({
      data: {
        destination,
        purpose: input.purpose,
        userId: input.userId ?? null,
        codeHash: hashCode(code, secret),
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt,
      },
    });

    return { code, expiresAt };
  }

  /**
   * Verify a submitted code against the active challenge.
   * Returns the resolved userId (if the challenge carried one) on success.
   *
   * Failure modes are deliberately uniform ('invalid') to avoid leaking whether
   * a challenge exists, is expired, or was simply wrong.
   */
  async verify(input: {
    destination: string;
    purpose: OtpPurpose;
    code: string;
  }): Promise<{ ok: true; userId: string | null } | { ok: false }> {
    const { prisma, secret } = this.deps;
    const destination = input.destination.trim().toLowerCase();

    const challenge = await prisma.otpChallenge.findFirst({
      where: { destination, purpose: input.purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) return { ok: false };

    if (challenge.expiresAt < new Date()) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return { ok: false };
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return { ok: false };
    }

    const matches = safeEqualHex(
      challenge.codeHash,
      hashCode(input.code, secret),
    );

    if (!matches) {
      const attempts = challenge.attempts + 1;
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          // Burn the challenge once attempts are exhausted.
          ...(attempts >= challenge.maxAttempts
            ? { consumedAt: new Date() }
            : {}),
        },
      });
      return { ok: false };
    }

    // Success — consume the challenge so the code cannot be reused.
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    return { ok: true, userId: challenge.userId };
  }

  /**
   * Issue a single-use password-reset token for a user. Returns the plaintext
   * token (stored only as a SHA-256 hash).
   */
  async issueResetToken(
    userId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const { prisma } = this.deps;
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await prisma.passwordResetToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    });

    return { token, expiresAt };
  }

  /**
   * Consume a password-reset token. Returns the userId on success.
   * The token is marked consumed atomically so it cannot be replayed.
   */
  async consumeResetToken(
    token: string,
  ): Promise<{ ok: true; userId: string } | { ok: false }> {
    const { prisma } = this.deps;
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!record) return { ok: false };
    if (record.consumedAt) return { ok: false };
    if (record.expiresAt < new Date()) return { ok: false };

    await prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    return { ok: true, userId: record.userId };
  }
}
