-- ── User verification / password-change tracking ────────────────────────────
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt"   TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- ── OTP purpose enum ──────────────────────────────────────────────────────────
CREATE TYPE "otp_purpose" AS ENUM (
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'LOGIN_VERIFICATION'
);

-- ── OTP challenges ────────────────────────────────────────────────────────────
-- Stores a HMAC-SHA256 of the 6-digit code, never the plaintext.
-- destination = normalised email; userId nullable (unknown at forgot-password request time).
CREATE TABLE "otp_challenges" (
  "id"          TEXT        NOT NULL,
  "userId"      TEXT,
  "destination" TEXT        NOT NULL,
  "purpose"     "otp_purpose" NOT NULL,
  "codeHash"    TEXT        NOT NULL,
  "attempts"    INTEGER     NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER     NOT NULL DEFAULT 5,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "consumedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "otp_challenges_userId_purpose_idx"      ON "otp_challenges"("userId", "purpose");
CREATE INDEX "otp_challenges_destination_purpose_idx" ON "otp_challenges"("destination", "purpose");
CREATE INDEX "otp_challenges_expiresAt_idx"           ON "otp_challenges"("expiresAt");

-- ── Password reset tokens ─────────────────────────────────────────────────────
-- Short-lived token issued after OTP verification; authorises one password-reset
-- submission. tokenHash = SHA-256 of the opaque random token (never stored plain).
CREATE TABLE "password_reset_tokens" (
  "id"         TEXT        NOT NULL,
  "userId"     TEXT        NOT NULL,
  "tokenHash"  TEXT        NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_tokens_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_hash_key"  UNIQUE ("tokenHash"),
  CONSTRAINT "password_reset_tokens_userId_fk" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
