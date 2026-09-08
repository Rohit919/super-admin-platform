-- ── Multi-tenancy (additive, non-destructive) ────────────────────────────────
-- Adds Tenant + TenantMembership and nullable tenantId columns to tenant-owned
-- tables. tenantId is intentionally NULLABLE here: existing rows are backfilled
-- by a separate, reviewable data migration, and only then made required in a
-- follow-up migration (MULTI-TENANT-ARCHITECTURE §92).

-- ── Enums ─────────────────────────────────────────────────────────────────────
CREATE TYPE "tenant_status" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "membership_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- ── Tenants ───────────────────────────────────────────────────────────────────
CREATE TABLE "tenants" (
  "id"        TEXT            NOT NULL,
  "name"      TEXT            NOT NULL,
  "slug"      TEXT            NOT NULL,
  "status"    "tenant_status" NOT NULL DEFAULT 'TRIAL',
  "createdAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)    NOT NULL,

  CONSTRAINT "tenants_pkey"     PRIMARY KEY ("id"),
  CONSTRAINT "tenants_slug_key" UNIQUE ("slug")
);

CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- ── Tenant memberships ─────────────────────────────────────────────────────────
CREATE TABLE "tenant_memberships" (
  "tenantId"  TEXT                NOT NULL,
  "userId"    TEXT                NOT NULL,
  "status"    "membership_status" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)        NOT NULL,

  CONSTRAINT "tenant_memberships_pkey"     PRIMARY KEY ("tenantId", "userId"),
  CONSTRAINT "tenant_memberships_tenantId_fk" FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_memberships_userId_fk"   FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "tenant_memberships_userId_idx"          ON "tenant_memberships"("userId");
CREATE INDEX "tenant_memberships_tenantId_status_idx" ON "tenant_memberships"("tenantId", "status");

-- ── Todo → tenant ───────────────────────────────────────────────────────────
ALTER TABLE "todos" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "todos_tenantId_idx" ON "todos"("tenantId");

-- ── Role → tenant (scoped uniqueness) ─────────────────────────────────────────
ALTER TABLE "roles" ADD COLUMN "tenantId" TEXT;

-- Replace the global name unique with a tenant-scoped composite unique. In
-- Postgres, NULLs are distinct in a multi-column UNIQUE, so platform roles
-- (tenantId IS NULL) are NOT deduplicated by this constraint at the DB level;
-- platform roles are instead kept unique by the idempotent seed (upsert by
-- name) and by application-level checks. This matches Prisma's declarative
-- @@unique([tenantId, name]) so the schema and migration stay in sync.
ALTER TABLE "roles" DROP CONSTRAINT "roles_name_key";
CREATE UNIQUE INDEX "roles_tenantId_name_key" ON "roles"("tenantId", "name");
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");

ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fk" FOREIGN KEY ("tenantId")
  REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── UserRole → tenant (RBAC scoping join) ─────────────────────────────────────
ALTER TABLE "user_roles" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "user_roles_tenantId_idx"        ON "user_roles"("tenantId");
CREATE INDEX "user_roles_userId_tenantId_idx" ON "user_roles"("userId", "tenantId");

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenantId_fk" FOREIGN KEY ("tenantId")
  REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── AuditLog → tenant ─────────────────────────────────────────────────────────
ALTER TABLE "audit_logs" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "audit_logs_tenantId_idx"           ON "audit_logs"("tenantId");
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");
