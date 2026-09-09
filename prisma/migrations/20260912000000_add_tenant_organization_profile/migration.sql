-- ── Tenant organization profile (Phase 20, additive/non-destructive) ─────────
-- Platform-level tenant METADATA managed by Super Admin: organization identity,
-- registered/billing address, and a business contact. Every column is NULLABLE
-- and back-compatible (no backfill, no data change). These describe the customer
-- ORGANIZATION — they are NOT tenant operational data.

-- AlterTable
ALTER TABLE "tenants"
    ADD COLUMN "legalName" TEXT,
    ADD COLUMN "website" TEXT,
    ADD COLUMN "industry" TEXT,
    ADD COLUMN "description" TEXT,
    ADD COLUMN "timeZone" TEXT,
    ADD COLUMN "locale" TEXT,
    ADD COLUMN "addressLine1" TEXT,
    ADD COLUMN "addressLine2" TEXT,
    ADD COLUMN "city" TEXT,
    ADD COLUMN "region" TEXT,
    ADD COLUMN "postalCode" TEXT,
    ADD COLUMN "country" TEXT,
    ADD COLUMN "contactName" TEXT,
    ADD COLUMN "contactEmail" TEXT,
    ADD COLUMN "contactPhone" TEXT;
