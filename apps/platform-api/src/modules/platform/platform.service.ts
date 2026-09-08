import type { PrismaClient, TenantStatus } from "@prisma/client";
import {
  TENANT_PERMISSION_KEYS,
  SystemRoles,
  type CreateTenantBody,
  type PlatformTenantDto,
  type PlatformDashboardStats,
  type PlatformUserDto,
  type PlatformAuditLogDto,
  type PlatformAuditLogQuery,
} from "@app/api-contracts";
import { ConflictError, NotFoundError } from "@core/errors/index.js";
import {
  AuditService,
  AuditActions,
  type AuditEntry,
} from "@core/audit/index.js";
import { hashPassword } from "../auth/operations/index.js";

/** Request-scoped audit fields, passed from the route via AuditService.contextFrom. */
export type AuditContext = Pick<
  AuditEntry,
  "actorId" | "requestId" | "ip" | "userAgent"
>;

/** Map a target tenant status to its lifecycle audit action. */
function statusAuditAction(status: TenantStatus): string {
  switch (status) {
    case "SUSPENDED":
      return AuditActions.TenantSuspended;
    case "ACTIVE":
      return AuditActions.TenantActivated;
    case "ARCHIVED":
      return AuditActions.TenantArchived;
    default:
      return AuditActions.TenantActivated;
  }
}

/**
 * Explicit tenant lifecycle state machine (plan §12). A status change is only
 * allowed if the target is in the current status's allowed-transition set.
 *
 *   TRIAL     → ACTIVE | SUSPENDED | ARCHIVED
 *   ACTIVE    → SUSPENDED | ARCHIVED
 *   SUSPENDED → ACTIVE | ARCHIVED
 *   ARCHIVED  → (terminal — no transitions out)
 *
 * Same-status "transitions" are rejected as no-ops so every accepted change is
 * a real, auditable state change. ARCHIVED is terminal: an archived tenant can
 * never be reactivated, so it can never be silently treated as active.
 */
export const TENANT_STATUS_TRANSITIONS: Record<TenantStatus, TenantStatus[]> = {
  TRIAL: ["ACTIVE", "SUSPENDED", "ARCHIVED"],
  ACTIVE: ["SUSPENDED", "ARCHIVED"],
  SUSPENDED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

/** True if `to` is a legal next status from `from`. */
export function isValidTenantStatusTransition(
  from: TenantStatus,
  to: TenantStatus,
): boolean {
  return TENANT_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * PlatformService — platform (Super Admin) operations against platform-managed
 * resources (tenants, platform users, stats).
 *
 * Uses the raw Prisma client directly and EXPLICITLY: platform operations are
 * cross-tenant by nature and must never be silently tenant-filtered
 * (MULTI-TENANT-ARCHITECTURE §58, §59). Tenant-scoping the platform layer would
 * be wrong — this is the authorized cross-tenant surface.
 */
export class PlatformService {
  private readonly audit: AuditService;

  constructor(private readonly prisma: PrismaClient) {
    this.audit = new AuditService(prisma);
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────
  async dashboardStats(): Promise<PlatformDashboardStats> {
    const [
      totalTenants,
      active,
      trial,
      suspended,
      archived,
      totalUsers,
      platformUsers,
      activeApiCredentials,
      recent,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: "ACTIVE" } }),
      this.prisma.tenant.count({ where: { status: "TRIAL" } }),
      this.prisma.tenant.count({ where: { status: "SUSPENDED" } }),
      this.prisma.tenant.count({ where: { status: "ARCHIVED" } }),
      this.prisma.user.count(),
      this.prisma.platformMembership.count(),
      this.prisma.tenantApiCredential.count({ where: { status: "ACTIVE" } }),
      this.prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      totalTenants,
      activeTenants: active,
      trialTenants: trial,
      suspendedTenants: suspended,
      archivedTenants: archived,
      totalUsers,
      platformUsers,
      activeApiCredentials,
      recentTenants: recent.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  // ── Tenant listing / detail ───────────────────────────────────────────────────
  async listTenants(status?: TenantStatus): Promise<PlatformTenantDto[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { memberships: true } },
      },
    });

    return tenants.map((t) => this.toTenantDto(t, t._count.memberships));
  }

  async getTenant(id: string): Promise<PlatformTenantDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { memberships: true } },
      },
    });
    if (!tenant) throw new NotFoundError("Tenant not found");
    return this.toTenantDto(tenant, tenant._count.memberships);
  }

  // ── Tenant status change ───────────────────────────────────────────────────────
  /**
   * Change a tenant's lifecycle status, enforcing the explicit transition matrix
   * (plan §12). Rejects same-status no-ops and illegal transitions (e.g. any
   * transition out of ARCHIVED) with a 409 Conflict — the target status is
   * incompatible with the tenant's current state. Authorization for the action
   * (suspend vs archive) is enforced in the route guard, not here.
   */
  async setTenantStatus(
    id: string,
    status: TenantStatus,
    auditCtx?: AuditContext,
  ): Promise<PlatformTenantDto> {
    const existing = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundError("Tenant not found");

    if (existing.status === status) {
      throw new ConflictError(`Tenant is already ${status}.`, undefined);
    }

    if (!isValidTenantStatusTransition(existing.status, status)) {
      throw new ConflictError(
        `Invalid tenant status transition: ${existing.status} → ${status}.`,
        { from: existing.status, to: status },
      );
    }

    await this.prisma.tenant.update({ where: { id }, data: { status } });

    // Audit the lifecycle change (no secrets; records the from/to transition).
    await this.audit.record({
      ...auditCtx,
      action: statusAuditAction(status),
      tenantId: id,
      targetType: "TENANT",
      targetId: id,
      metadata: { from: existing.status, to: status },
    });

    return this.getTenant(id);
  }

  // ── Provisioning ───────────────────────────────────────────────────────────────
  /**
   * Provision a new tenant in ONE transaction (MULTI-TENANT-ARCHITECTURE §43):
   *   Tenant → admin User → TenantMembership (ACTIVE) → default tenant ADMIN
   *   role (scoped to the tenant, tenant permissions) → assign admin the role.
   * Intentionally LEAN: no settings/branding persistence yet (no storage).
   */
  async provisionTenant(
    input: CreateTenantBody,
    auditCtx?: AuditContext,
  ): Promise<PlatformTenantDto> {
    const slug = input.slug.trim().toLowerCase();
    const adminEmail = input.adminEmail.trim().toLowerCase();

    // Pre-checks (friendly errors before the transaction).
    const slugTaken = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (slugTaken)
      throw new ConflictError("A tenant with that slug already exists");

    const hashedPassword = await hashPassword(input.adminPassword);

    const tenantId = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: input.name.trim(), slug, status: "ACTIVE" },
        select: { id: true },
      });

      // Reuse an existing user identity by email, or create one. A person is a
      // single identity across the platform (MULTI-TENANT §11).
      let adminUser = await tx.user.findUnique({
        where: { email: adminEmail },
        select: { id: true },
      });
      if (!adminUser) {
        adminUser = await tx.user.create({
          data: {
            email: adminEmail,
            name: input.adminName.trim(),
            password: hashedPassword,
            role: "user",
            emailVerifiedAt: new Date(),
          },
          select: { id: true },
        });
      }

      // Membership: the admin belongs to the new tenant (ACTIVE).
      await tx.tenantMembership.create({
        data: { tenantId: tenant.id, userId: adminUser.id, status: "ACTIVE" },
      });

      // Default tenant ADMIN role (scoped to this tenant) with tenant permissions.
      const adminRole = await tx.role.create({
        data: {
          name: SystemRoles.Admin,
          tenantId: tenant.id,
          isSystem: true,
          description: "Tenant administrator (auto-provisioned).",
        },
        select: { id: true },
      });

      // Attach tenant (non-platform) permissions to the role.
      const permissions = await tx.permission.findMany({
        where: { key: { in: [...TENANT_PERMISSION_KEYS] } },
        select: { id: true },
      });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({
            roleId: adminRole.id,
            permissionId: p.id,
          })),
          skipDuplicates: true,
        });
      }

      // Assign the admin the tenant ADMIN role WITHIN the new tenant.
      await tx.userRole.create({
        data: {
          userId: adminUser.id,
          roleId: adminRole.id,
          tenantId: tenant.id,
          assignedBy: "platform-provisioning",
        },
      });

      return tenant.id;
    });

    // Audit the provisioning (no secrets — records tenant identity + admin email).
    await this.audit.record({
      ...auditCtx,
      action: AuditActions.TenantProvisioned,
      tenantId,
      targetType: "TENANT",
      targetId: tenantId,
      metadata: { slug, name: input.name.trim(), adminEmail },
    });

    return this.getTenant(tenantId);
  }

  // ── Platform users ───────────────────────────────────────────────────────────
  async listPlatformUsers(): Promise<PlatformUserDto[]> {
    const memberships = await this.prisma.platformMembership.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            // Platform roles are the user's roles with tenantId null.
            roles: {
              where: { tenantId: null },
              select: { role: { select: { name: true } } },
            },
          },
        },
      },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      membershipStatus: m.status,
      roles: m.user.roles.map((r) => r.role.name),
      createdAt: m.createdAt.toISOString(),
    }));
  }

  // ── Audit log (read) ───────────────────────────────────────────────────────────
  /**
   * List platform audit events, newest first, with optional tenant/action
   * filters. Read-only; audit metadata never contains secrets by construction.
   */
  async listAuditLogs(
    query: PlatformAuditLogQuery = {},
  ): Promise<PlatformAuditLogDto[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.action ? { action: query.action } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit ?? 100,
      select: {
        id: true,
        action: true,
        tenantId: true,
        actorId: true,
        targetType: true,
        targetId: true,
        metadata: true,
        requestId: true,
        createdAt: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      tenantId: r.tenantId,
      actorId: r.actorId,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: (r.metadata ?? null) as Record<string, unknown> | null,
      requestId: r.requestId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── helpers ────────────────────────────────────────────────────────────────────
  private toTenantDto(
    t: {
      id: string;
      name: string;
      slug: string;
      status: TenantStatus;
      createdAt: Date;
      updatedAt: Date;
    },
    memberCount: number,
  ): PlatformTenantDto {
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      memberCount,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
