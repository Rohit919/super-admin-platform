-- ── Tenant API credentials (additive, non-destructive) ───────────────────────
-- Platform-managed API credentials issued to a Tenant. Owned by the platform
-- control plane. Secrets are stored ONLY as a one-way SHA-256 hash; the public
-- key is not secret. See docs/TENANT-API-CREDENTIALS.md.
--
-- NOTE: This migration is authored but intentionally NOT executed as part of
-- Phase 9. Apply it deliberately (never automatically) after verifying
-- DATABASE_URL points at the Platform DB.

-- ── Enum ──────────────────────────────────────────────────────────────────────
CREATE TYPE "credential_status" AS ENUM ('ACTIVE', 'REVOKED');

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE "tenant_api_credentials" (
  "id"            TEXT                NOT NULL,
  "tenantId"      TEXT                NOT NULL,
  "name"          TEXT,
  "publicKey"     TEXT                NOT NULL,
  "secretKeyHash" TEXT                NOT NULL,
  "status"        "credential_status" NOT NULL DEFAULT 'ACTIVE',
  "lastUsedAt"    TIMESTAMP(3),
  "expiresAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"     TIMESTAMP(3),

  CONSTRAINT "tenant_api_credentials_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "tenant_api_credentials_publicKey_key" ON "tenant_api_credentials"("publicKey");
CREATE INDEX "tenant_api_credentials_tenantId_idx" ON "tenant_api_credentials"("tenantId");
CREATE INDEX "tenant_api_credentials_tenantId_status_idx" ON "tenant_api_credentials"("tenantId", "status");
CREATE INDEX "tenant_api_credentials_publicKey_idx" ON "tenant_api_credentials"("publicKey");

-- ── Foreign key ───────────────────────────────────────────────────────────────
ALTER TABLE "tenant_api_credentials"
  ADD CONSTRAINT "tenant_api_credentials_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
