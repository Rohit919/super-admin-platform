import type { PrismaClient, Prisma } from "@prisma/client";
import type { FastifyRequest } from "fastify";

/**
 * Audit actions for authorization-relevant changes. Stable string constants so
 * downstream consumers (SIEM, reports) can filter reliably.
 */
export const AuditActions = {
  RoleCreated: "ROLE_CREATED",
  RoleUpdated: "ROLE_UPDATED",
  RoleDeleted: "ROLE_DELETED",
  RoleAssigned: "ROLE_ASSIGNED",
  RoleRemoved: "ROLE_REMOVED",
  RolePermissionsUpdated: "ROLE_PERMISSIONS_UPDATED",
  UserCreated: "USER_CREATED",
  UserUpdated: "USER_UPDATED",
  UserDeleted: "USER_DELETED",
  ProfileUpdated: "PROFILE_UPDATED",

  // ── Platform (Super Admin) actions ──────────────────────────────────────────
  TenantProvisioned: "TENANT_PROVISIONED",
  TenantUpdated: "TENANT_UPDATED",
  TenantOrganizationUpdated: "TENANT_ORGANIZATION_UPDATED",
  TenantSuspended: "TENANT_SUSPENDED",
  TenantActivated: "TENANT_ACTIVATED",
  TenantArchived: "TENANT_ARCHIVED",
  TenantCredentialCreated: "TENANT_CREDENTIAL_CREATED",
  TenantCredentialRotated: "TENANT_CREDENTIAL_ROTATED",
  TenantCredentialRevoked: "TENANT_CREDENTIAL_REVOKED",
  TenantPlanAssigned: "TENANT_PLAN_ASSIGNED",
  TenantEntitlementOverrideSet: "TENANT_ENTITLEMENT_OVERRIDE_SET",
  TenantEntitlementOverrideCleared: "TENANT_ENTITLEMENT_OVERRIDE_CLEARED",
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

export interface AuditEntry {
  action: AuditAction | string;
  /**
   * Tenant the event belongs to, or null/omitted for platform-level events.
   * Optional and additive — existing callers that don't set it are unchanged.
   */
  tenantId?: string | null;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Records high-value authorization changes. Never store secrets in metadata.
 *
 * `record` accepts an optional Prisma transaction client so an audit row can be
 * written in the SAME transaction as the change it describes — the audit record
 * and the mutation commit or roll back together.
 */
export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(
    entry: AuditEntry,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        action: entry.action,
        tenantId: entry.tenantId ?? null,
        actorId: entry.actorId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? undefined) as
          Prisma.InputJsonValue | undefined,
        requestId: entry.requestId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }

  /** Pull the request-scoped audit fields (actor, requestId, ip, userAgent). */
  static contextFrom(
    request: FastifyRequest,
  ): Pick<AuditEntry, "actorId" | "requestId" | "ip" | "userAgent"> {
    return {
      actorId: request.user?.id ?? null,
      requestId: request.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    };
  }
}
