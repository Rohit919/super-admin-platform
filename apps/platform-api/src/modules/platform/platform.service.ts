import type { Prisma, PrismaClient, TenantStatus } from "@prisma/client";
import {
  TENANT_PERMISSION_KEYS,
  SystemRoles,
  PAGINATION_DEFAULTS,
  type CreateTenantBody,
  type UpdateTenantBody,
  type UpdateTenantOrganizationBody,
  type TenantOrganizationDto,
  type PlatformTenantDto,
  type PlatformTenantOverviewDto,
  type PlatformTenantListQuery,
  type PlatformTenantPageResponse,
  type PlatformDashboardStats,
  type PlatformUserDto,
  type PlatformAuditLogDto,
  type PlatformAuditLogQuery,
} from "@app/api-contracts";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@core/errors/index.js";
import {
  AuditService,
  AuditActions,
  type AuditEntry,
} from "@core/audit/index.js";
import { hashPassword } from "../auth/operations/index.js";

/** A page of tenants + offset pagination metadata (contract-shaped, minus `success`). */
type TenantPage = Pick<PlatformTenantPageResponse, "data" | "meta">;

/** Request-scoped audit fields, passed from the route via AuditService.contextFrom. */
export type AuditContext = Pick<
  AuditEntry,
  "actorId" | "requestId" | "ip" | "userAgent"
>;

/** True if a string is a well-formed http(s) URL. */
function isValidWebsite(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Pragmatic email check (mirrors the tenant/user email validation elsewhere). */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** ISO-3166 alpha-2: exactly two ASCII letters. */
function isValidCountryCode(value: string): boolean {
  return /^[A-Za-z]{2}$/.test(value);
}

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
  /**
   * List tenants with AUTHORITATIVE backend pagination + optional status filter
   * and case-insensitive name/slug search. Never loads the whole population:
   * the page is bounded by pageSize (contract-capped 1–100) and the total count
   * is queried alongside the page so the client can render a pager.
   */
  async listTenants(query: PlatformTenantListQuery = {}): Promise<TenantPage> {
    const page = Math.max(1, query.page ?? PAGINATION_DEFAULTS.page);
    const pageSize = Math.min(
      PAGINATION_DEFAULTS.maxPageSize,
      Math.max(
        PAGINATION_DEFAULTS.minPageSize,
        query.pageSize ?? PAGINATION_DEFAULTS.pageSize,
      ),
    );

    const q = query.q?.trim();
    const where: Prisma.TenantWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, tenants] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { memberships: true } },
        },
      }),
    ]);

    return {
      data: tenants.map((t) => this.toTenantDto(t, t._count.memberships)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Update platform-level tenant METADATA (currently just the display name).
   * The slug is stable external identity and is not editable here; lifecycle
   * status has its own dedicated endpoint. Audited as TENANT_UPDATED.
   */
  async updateTenant(
    id: string,
    input: UpdateTenantBody,
    auditCtx?: AuditContext,
  ): Promise<PlatformTenantDto> {
    const existing = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundError("Tenant not found");

    const name = input.name.trim();
    await this.prisma.tenant.update({ where: { id }, data: { name } });

    await this.audit.record({
      ...auditCtx,
      action: AuditActions.TenantUpdated,
      tenantId: id,
      targetType: "TENANT",
      targetId: id,
      // Record the changed field only (no secrets). Previous → new name.
      metadata: { from: { name: existing.name }, to: { name } },
    });

    return this.getTenant(id);
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

  // ── Tenant organization profile (Phase 20) ─────────────────────────────────────
  /**
   * The columns that make up the editable organization profile. Kept in one
   * place so read, write, and audit stay in sync when the field set changes.
   */
  private static readonly ORG_FIELDS = [
    "legalName",
    "website",
    "industry",
    "description",
    "timeZone",
    "locale",
    "addressLine1",
    "addressLine2",
    "city",
    "region",
    "postalCode",
    "country",
    "contactName",
    "contactEmail",
    "contactPhone",
  ] as const;

  /**
   * Read a tenant's organization profile (identity echo + org/address/contact).
   * All profile fields are nullable — a tenant may have none set. 404 if unknown.
   */
  async getTenantOrganization(id: string): Promise<TenantOrganizationDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        legalName: true,
        website: true,
        industry: true,
        description: true,
        timeZone: true,
        locale: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        region: true,
        postalCode: true,
        country: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
      },
    });
    if (!tenant) throw new NotFoundError("Tenant not found");
    return tenant;
  }

  /**
   * Partial update of the organization profile (platform.tenant.update).
   *
   * Semantics: only KEYS PRESENT in the body are touched. A present key whose
   * (trimmed) value is empty CLEARS the column (stored as NULL); a non-empty
   * value is trimmed and stored. Omitted keys are left unchanged. Identity
   * (id/slug/name) is not editable here.
   *
   * Validation beyond the contract's length caps: `website` must be http(s),
   * `contactEmail` must look like an email, `country` must be a 2-letter code —
   * so a malformed value can never be persisted. Audited as
   * TENANT_ORGANIZATION_UPDATED with the set of changed keys (no values that
   * could be sensitive beyond what an operator typed; emails/addresses are
   * business metadata, but we record only the changed KEY NAMES to stay minimal).
   */
  async updateTenantOrganization(
    id: string,
    input: UpdateTenantOrganizationBody,
    auditCtx?: AuditContext,
  ): Promise<TenantOrganizationDto> {
    const existing = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("Tenant not found");

    // Normalize: trim strings; empty → null (clear). Only provided keys apply.
    const data: Record<string, string | null> = {};
    const changedKeys: string[] = [];
    for (const key of PlatformService.ORG_FIELDS) {
      const raw = (input as Record<string, string | undefined>)[key];
      if (raw === undefined) continue; // key not provided → leave unchanged
      const trimmed = raw.trim();
      data[key] = trimmed === "" ? null : trimmed;
      changedKeys.push(key);
    }

    if (changedKeys.length === 0) {
      // Nothing to change — return the current profile without an audit no-op.
      return this.getTenantOrganization(id);
    }

    // Field-level validation for the formats we constrain.
    if (typeof data.website === "string" && !isValidWebsite(data.website)) {
      throw new ValidationError("Website must be a valid http(s) URL.", {
        fields: { website: "Must start with http:// or https://" },
      });
    }
    if (
      typeof data.contactEmail === "string" &&
      !isValidEmail(data.contactEmail)
    ) {
      throw new ValidationError("Contact email is not a valid email address.", {
        fields: { contactEmail: "Must be a valid email address" },
      });
    }
    if (typeof data.country === "string" && !isValidCountryCode(data.country)) {
      throw new ValidationError("Country must be a 2-letter ISO-3166 code.", {
        fields: { country: "Use a 2-letter country code, e.g. US" },
      });
    }
    // Normalize country to uppercase when present.
    if (typeof data.country === "string")
      data.country = data.country.toUpperCase();

    await this.prisma.tenant.update({ where: { id }, data });

    await this.audit.record({
      ...auditCtx,
      action: AuditActions.TenantOrganizationUpdated,
      tenantId: id,
      targetType: "TENANT",
      targetId: id,
      // Record only which fields changed — not their values (business metadata
      // kept out of the audit trail to stay minimal; never any secret).
      metadata: { changed: changedKeys },
    });

    return this.getTenantOrganization(id);
  }

  // ── Tenant Control Center overview ─────────────────────────────────────────────
  /**
   * Deep, REAL tenant overview aggregate for the Super Admin Control Center.
   * Every field is derived from existing tables — no usage/branding/integration
   * metering is invented (documented gaps live in
   * docs/PHASE-19-TENANT-CONTROL-CENTER.md). Kept as a SEPARATE call from the
   * lean tenant list so the list stays fast; the detail page fetches this once.
   *
   * Primary administrator = the oldest ACTIVE membership's user (the account
   * created first for the tenant during provisioning, in practice its admin).
   */
  async getTenantOverview(id: string): Promise<PlatformTenantOverviewDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!tenant) throw new NotFoundError("Tenant not found");

    const now = new Date();

    const [
      membersTotal,
      membersActive,
      membersInvited,
      membersSuspended,
      credTotal,
      credActive,
      credRevoked,
      credExpired,
      primaryMembership,
      tenantPlan,
      overrideCount,
    ] = await Promise.all([
      this.prisma.tenantMembership.count({ where: { tenantId: id } }),
      this.prisma.tenantMembership.count({
        where: { tenantId: id, status: "ACTIVE" },
      }),
      this.prisma.tenantMembership.count({
        where: { tenantId: id, status: "INVITED" },
      }),
      this.prisma.tenantMembership.count({
        where: { tenantId: id, status: "SUSPENDED" },
      }),
      this.prisma.tenantApiCredential.count({ where: { tenantId: id } }),
      this.prisma.tenantApiCredential.count({
        where: { tenantId: id, status: "ACTIVE" },
      }),
      this.prisma.tenantApiCredential.count({
        where: { tenantId: id, status: "REVOKED" },
      }),
      // Expired = still ACTIVE but past its expiry (an operational health signal).
      this.prisma.tenantApiCredential.count({
        where: { tenantId: id, status: "ACTIVE", expiresAt: { lt: now } },
      }),
      // Oldest ACTIVE membership → the tenant's primary administrator.
      this.prisma.tenantMembership.findFirst({
        where: { tenantId: id, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.tenantPlan.findUnique({
        where: { tenantId: id },
        select: {
          assignedAt: true,
          plan: {
            select: {
              key: true,
              name: true,
              _count: { select: { entitlements: true } },
            },
          },
        },
      }),
      this.prisma.tenantEntitlementOverride.count({ where: { tenantId: id } }),
    ]);

    // Effective entitlement count = plan entitlements plus overrides that are
    // NOT already part of the plan. We approximate the union count precisely by
    // resolving distinct keys only when a plan exists; without a plan, the
    // effective set is exactly the overrides.
    let entitlementCount = overrideCount;
    if (tenantPlan) {
      const [planKeys, overrideKeys] = await Promise.all([
        this.prisma.planEntitlement.findMany({
          where: { plan: { key: tenantPlan.plan.key } },
          select: { entitlement: { select: { key: true } } },
        }),
        this.prisma.tenantEntitlementOverride.findMany({
          where: { tenantId: id },
          select: { entitlement: { select: { key: true } } },
        }),
      ]);
      const union = new Set<string>();
      for (const pe of planKeys) union.add(pe.entitlement.key);
      for (const ov of overrideKeys) union.add(ov.entitlement.key);
      entitlementCount = union.size;
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
      primaryAdmin: primaryMembership
        ? {
            id: primaryMembership.user.id,
            name: primaryMembership.user.name,
            email: primaryMembership.user.email,
            since: primaryMembership.createdAt.toISOString(),
          }
        : null,
      members: {
        total: membersTotal,
        active: membersActive,
        invited: membersInvited,
        suspended: membersSuspended,
      },
      credentials: {
        total: credTotal,
        active: credActive,
        revoked: credRevoked,
        expired: credExpired,
      },
      plan: tenantPlan
        ? {
            key: tenantPlan.plan.key,
            name: tenantPlan.plan.name,
            assignedAt: tenantPlan.assignedAt.toISOString(),
            entitlementCount,
            overrideCount,
          }
        : null,
    };
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
