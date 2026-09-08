-- ── Authorization cache/stale-token control ──────────────────────────────────
-- Bumped whenever a user's effective permissions change so cached/token-carried
-- permission sets with an older version are re-resolved.
ALTER TABLE "users" ADD COLUMN "permissionVersion" INTEGER NOT NULL DEFAULT 0;

-- ── Roles ─────────────────────────────────────────────────────────────────────
CREATE TABLE "roles" (
  "id"          TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "isSystem"    BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "roles_pkey"     PRIMARY KEY ("id"),
  CONSTRAINT "roles_name_key" UNIQUE ("name")
);

-- ── Permissions ───────────────────────────────────────────────────────────────
CREATE TABLE "permissions" (
  "id"          TEXT         NOT NULL,
  "key"         TEXT         NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "permissions_pkey"    PRIMARY KEY ("id"),
  CONSTRAINT "permissions_key_key" UNIQUE ("key")
);

-- ── User ↔ Role ─────────────────────────────────────────────────────────────
CREATE TABLE "user_roles" (
  "userId"     TEXT         NOT NULL,
  "roleId"     TEXT         NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedBy" TEXT,

  CONSTRAINT "user_roles_pkey"      PRIMARY KEY ("userId", "roleId"),
  CONSTRAINT "user_roles_userId_fk" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_roles_roleId_fk" FOREIGN KEY ("roleId")
    REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- ── Role ↔ Permission ───────────────────────────────────────────────────────
CREATE TABLE "role_permissions" (
  "roleId"       TEXT         NOT NULL,
  "permissionId" TEXT         NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "role_permissions_pkey"           PRIMARY KEY ("roleId", "permissionId"),
  CONSTRAINT "role_permissions_roleId_fk"       FOREIGN KEY ("roleId")
    REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_permissionId_fk" FOREIGN KEY ("permissionId")
    REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- ── Audit log ─────────────────────────────────────────────────────────────────
CREATE TABLE "audit_logs" (
  "id"         TEXT         NOT NULL,
  "action"     TEXT         NOT NULL,
  "actorId"    TEXT,
  "targetType" TEXT,
  "targetId"   TEXT,
  "metadata"   JSONB,
  "requestId"  TEXT,
  "ip"         TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actorId_idx"             ON "audit_logs"("actorId");
CREATE INDEX "audit_logs_action_idx"              ON "audit_logs"("action");
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");
CREATE INDEX "audit_logs_createdAt_idx"           ON "audit_logs"("createdAt");
