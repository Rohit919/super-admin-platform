/**
 * Multi-tenancy backfill — STAGED DATA MIGRATION (review before running).
 *
 * This script assigns all existing tenant-owned rows to a single default
 * "primary" tenant, so the nullable tenantId columns added by the
 * 20260908130000_add_multi_tenancy migration can later be made NOT NULL.
 *
 * It is IDEMPOTENT and NON-DESTRUCTIVE:
 *   - creates (or reuses) one default Tenant;
 *   - creates an ACTIVE TenantMembership for every existing user;
 *   - stamps existing Todo / UserRole / AuditLog rows with the default tenantId
 *     ONLY where tenantId IS NULL;
 *   - leaves platform/system Roles (SUPER_ADMIN etc.) as platform roles
 *     (tenantId stays NULL) — they are intentionally NOT tenant-scoped.
 *
 * Design decision (see MULTI-TENANT-ARCHITECTURE §93): existing users are all
 * placed in ONE default tenant. We do NOT invent multiple tenants from data we
 * cannot infer. Adjust DEFAULT_TENANT_* via env before running.
 *
 * Roles decision (§94): existing custom (non-system) roles are moved INTO the
 * default tenant so they keep working under tenant-scoped RBAC. System roles
 * remain platform roles. Existing UserRole assignments are stamped with the
 * default tenantId so users keep their permissions inside the default tenant.
 *
 * Usage:
 *   DEFAULT_TENANT_NAME='Primary' DEFAULT_TENANT_SLUG='primary' \
 *   npx tsx prisma/backfill-multi-tenancy.ts
 *
 * Run this AFTER the additive migration and BEFORE the "make required" migration.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TENANT_NAME = process.env.DEFAULT_TENANT_NAME ?? "Primary";
const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG ?? "primary")
  .trim()
  .toLowerCase();

async function main(): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && process.env.BACKFILL_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      "Refusing to backfill in production. Set BACKFILL_ALLOW_PRODUCTION=true to override.",
    );
  }

  // 1) Default tenant (idempotent by slug).
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: {},
    create: {
      name: DEFAULT_TENANT_NAME,
      slug: DEFAULT_TENANT_SLUG,
      status: "ACTIVE",
    },
  });
  console.log(
    `✓ Default tenant: ${tenant.name} (${tenant.slug}) [${tenant.id}]`,
  );

  // 2) Membership for every existing user (ACTIVE), idempotent.
  const users = await prisma.user.findMany({ select: { id: true } });
  let membershipsCreated = 0;
  for (const u of users) {
    const res = await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: u.id } },
      update: {},
      create: { tenantId: tenant.id, userId: u.id, status: "ACTIVE" },
    });
    if (res.createdAt.getTime() === res.updatedAt.getTime())
      membershipsCreated += 1;
  }
  console.log(
    `✓ Memberships ensured for ${users.length} users (${membershipsCreated} new)`,
  );

  // 3) Move existing NON-system roles into the default tenant.
  //    System roles remain platform roles (tenantId NULL).
  const movedRoles = await prisma.role.updateMany({
    where: { isSystem: false, tenantId: null },
    data: { tenantId: tenant.id },
  });
  console.log(
    `✓ Non-system roles moved into default tenant: ${movedRoles.count}`,
  );

  // 4) Stamp existing UserRole assignments with the default tenant where NULL.
  //    Platform SUPER_ADMIN assignments should stay platform-level; we detect
  //    those by the role still being a platform (tenantId NULL) system role and
  //    skip them.
  const platformRoleIds = (
    await prisma.role.findMany({
      where: { tenantId: null },
      select: { id: true },
    })
  ).map((r) => r.id);

  const stampedUserRoles = await prisma.userRole.updateMany({
    where: { tenantId: null, roleId: { notIn: platformRoleIds } },
    data: { tenantId: tenant.id },
  });
  console.log(
    `✓ Tenant-role assignments stamped: ${stampedUserRoles.count} (platform assignments left as-is)`,
  );

  // 5) Stamp existing Todo + AuditLog rows.
  const todos = await prisma.todo.updateMany({
    where: { tenantId: null },
    data: { tenantId: tenant.id },
  });
  console.log(`✓ Todos stamped: ${todos.count}`);

  const audits = await prisma.auditLog.updateMany({
    where: { tenantId: null },
    data: { tenantId: tenant.id },
  });
  console.log(`✓ Audit logs stamped: ${audits.count}`);

  // 6) Platform layer backfill: grant an ACTIVE PlatformMembership to every
  //    existing SUPER_ADMIN so they retain access to the Super Admin app after
  //    the platform gate is introduced. New platform.* permissions are attached
  //    to the SUPER_ADMIN role by the idempotent seed (npm run db:seed).
  const superAdminRole = await prisma.role.findFirst({
    where: { name: "SUPER_ADMIN", tenantId: null },
    select: { id: true },
  });
  if (superAdminRole) {
    const superAdmins = await prisma.userRole.findMany({
      where: { roleId: superAdminRole.id },
      select: { userId: true },
    });
    let platformMembers = 0;
    for (const { userId } of superAdmins) {
      await prisma.platformMembership.upsert({
        where: { userId },
        update: {},
        create: { userId, status: "ACTIVE" },
      });
      platformMembers += 1;
    }
    console.log(
      `✓ Platform memberships ensured for ${platformMembers} SUPER_ADMIN user(s)`,
    );
  }

  console.log(
    '✓ Backfill complete. Verify counts, then run the "make required" migration.',
  );
  console.log(
    "  Reminder: run `npm run db:seed` to attach the new platform.* permissions to SUPER_ADMIN.",
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
