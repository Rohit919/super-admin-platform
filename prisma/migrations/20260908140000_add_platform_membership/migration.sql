-- ── Platform layer: PlatformMembership (additive, non-destructive) ────────────
-- Gate for platform (Super Admin) operations. A user with an ACTIVE row here
-- may perform /api/v1/platform/* operations; their platform permissions still
-- come from a platform Role assigned via user_roles (tenantId NULL).
--
-- Reuses the existing "membership_status" enum created by the multi-tenancy
-- migration (INVITED | ACTIVE | SUSPENDED | REMOVED).

CREATE TABLE "platform_memberships" (
  "userId"    TEXT                NOT NULL,
  "status"    "membership_status" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)        NOT NULL,

  CONSTRAINT "platform_memberships_pkey"      PRIMARY KEY ("userId"),
  CONSTRAINT "platform_memberships_userId_fk" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "platform_memberships_status_idx" ON "platform_memberships"("status");
