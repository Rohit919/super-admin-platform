import type { PrismaClient, Prisma } from "@prisma/client";

/**
 * Explicit tenant-scoped database accessor (MULTI-TENANT-ARCHITECTURE §24, §59).
 *
 * This is the ONLY sanctioned way to read/write tenant-owned data. It threads
 * the active `tenantId` into every query so a developer cannot forget it, and —
 * critically — it does so EXPLICITLY (no hidden Prisma middleware rewriting
 * queries). Platform / Super-Admin operations deliberately bypass this and use
 * the raw `prisma` client directly, so they are never silently tenant-filtered.
 *
 * Usage:
 *   const db = getTenantDb(fastify.prisma, request.tenant.tenantId);
 *   await db.auditLog.findMany();                 // auto-scoped to the tenant
 *   await db.auditLog.create({ action, actorId }); // tenantId injected
 *
 * Design: rather than a generic proxy, we expose a small, typed surface per
 * tenant-owned model. Add a model here when it becomes tenant-owned. The
 * explicitness is the point — each method shows exactly how tenantId is applied.
 */
export interface TenantDb {
  readonly tenantId: string;
  readonly auditLog: TenantAuditLogAccessor;
}

interface TenantAuditLogAccessor {
  findMany(
    args?: Omit<Prisma.AuditLogFindManyArgs, "where"> & {
      where?: Prisma.AuditLogWhereInput;
    },
  ): Promise<unknown[]>;
  create(
    data: Omit<Prisma.AuditLogUncheckedCreateInput, "tenantId">,
  ): Promise<unknown>;
  count(where?: Prisma.AuditLogWhereInput): Promise<number>;
}

/**
 * Build a tenant-scoped accessor bound to a single tenant. The returned object
 * applies `tenantId` to every where-clause and create payload.
 */
export function getTenantDb(prisma: PrismaClient, tenantId: string): TenantDb {
  const scope = { tenantId };

  return {
    tenantId,

    auditLog: {
      findMany: (args = {}) =>
        prisma.auditLog.findMany({
          ...args,
          where: { ...args.where, ...scope },
        }),
      create: (data) => prisma.auditLog.create({ data: { ...data, ...scope } }),
      count: (where = {}) =>
        prisma.auditLog.count({ where: { ...where, ...scope } }),
    },
  };
}
