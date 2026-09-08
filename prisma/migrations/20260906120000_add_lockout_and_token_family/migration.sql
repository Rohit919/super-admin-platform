-- ── Account lockout fields on users ─────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- ── Refresh token family (reuse detection) ──────────────────────────────────
-- Add nullable first, backfill existing rows (each token gets its own family),
-- then enforce NOT NULL.
ALTER TABLE "refresh_tokens" ADD COLUMN "family" TEXT;
UPDATE "refresh_tokens" SET "family" = "id" WHERE "family" IS NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "family" SET NOT NULL;

CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");
