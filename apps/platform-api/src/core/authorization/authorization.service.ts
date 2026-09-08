import type { PrismaClient } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import {
  isPermissionKey,
  SystemRoles,
  type PermissionKey,
} from "@app/api-contracts";
import type { AuthorizationContext } from "./authorization.types.js";

/**
 * AuthorizationService — the single place that resolves what an authenticated
 * user is allowed to do. Route handlers and preHandlers ask this service; they
 * never query roles/permissions directly.
 *
 * Resolution: user → user_roles → roles → role_permissions → permissions,
 * effective permissions = the union across all assigned roles.
 *
 * Caching: this implementation resolves from the database. A short-lived
 * per-REQUEST cache lives on `request` (see getContextForRequest) so a single
 * request that performs multiple checks hits the DB once. A distributed Redis
 * cache can be layered later behind this same interface; invalidation would key
 * off the user's permissionVersion.
 */
export class AuthorizationService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Resolve the full authorization context for a user WITHIN a tenant.
   *
   * Effective permissions = union of the user's role assignments that apply in
   * this context:
   *   - PLATFORM assignments (UserRole.tenantId IS NULL) — e.g. SUPER_ADMIN —
   *     apply in every tenant AND platform-only contexts;
   *   - TENANT assignments (UserRole.tenantId == tenantId) — apply only within
   *     that tenant.
   * A tenant role from ANOTHER tenant never contributes (this is what makes
   * RBAC tenant-isolated — MULTI-TENANT-ARCHITECTURE §26, §58).
   *
   * When `tenantId` is undefined (platform-only resolution), only platform
   * assignments are considered.
   */
  async getContext(
    userId: string,
    tenantId?: string,
  ): Promise<AuthorizationContext> {
    const rows = await this.prisma.userRole.findMany({
      where: {
        userId,
        // Platform assignments always apply; tenant assignments only for the
        // active tenant. Never pull another tenant's assignments.
        OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
      },
      select: {
        role: {
          select: {
            name: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });

    const roles: string[] = [];
    const permissionSet = new Set<PermissionKey>();

    for (const row of rows) {
      roles.push(row.role.name);
      for (const rp of row.role.permissions) {
        // Default-deny hardening: only surface keys that exist in the registry.
        // An unknown key in the DB never becomes an effective permission.
        if (isPermissionKey(rp.permission.key)) {
          permissionSet.add(rp.permission.key);
        }
      }
    }

    return {
      userId,
      ...(tenantId ? { tenantId } : {}),
      roles,
      permissions: [...permissionSet],
    };
  }

  /** True if the user holds the given permission in the tenant. Default-deny. */
  async hasPermission(
    userId: string,
    permission: PermissionKey,
    tenantId?: string,
  ): Promise<boolean> {
    const ctx = await this.getContext(userId, tenantId);
    return ctx.permissions.includes(permission);
  }

  /** True if the user holds ANY of the given permissions in the tenant. */
  async hasAnyPermission(
    userId: string,
    permissions: PermissionKey[],
    tenantId?: string,
  ): Promise<boolean> {
    const ctx = await this.getContext(userId, tenantId);
    return permissions.some((p) => ctx.permissions.includes(p));
  }

  /** True if the user holds ALL of the given permissions in the tenant. */
  async hasAllPermissions(
    userId: string,
    permissions: PermissionKey[],
    tenantId?: string,
  ): Promise<boolean> {
    const ctx = await this.getContext(userId, tenantId);
    return permissions.every((p) => ctx.permissions.includes(p));
  }

  /**
   * True if the user is assigned the platform break-glass SUPER_ADMIN role.
   * SUPER_ADMIN is a PLATFORM role (tenantId null), so it resolves regardless
   * of the active tenant.
   */
  async isSuperAdmin(userId: string, tenantId?: string): Promise<boolean> {
    const ctx = await this.getContext(userId, tenantId);
    return ctx.roles.includes(SystemRoles.SuperAdmin);
  }

  /**
   * Resolve (and memoize on the request) the authorization context for the
   * ACTIVE tenant. Multiple permission checks in one request share a single DB
   * lookup — but the memo is keyed on the resolved tenant, so if the active
   * tenant changes within a request lifecycle the context is re-resolved
   * (prevents a stale cross-tenant permission set).
   */
  async getContextForRequest(
    request: FastifyRequest,
  ): Promise<AuthorizationContext> {
    const userId = request.user?.id;
    if (!userId) {
      // No identity → empty context (default deny).
      return { userId: "", roles: [], permissions: [] };
    }

    const tenantId = request.tenant?.tenantId;

    // Reuse the memo only when it matches the current user AND active tenant.
    if (
      request.authz &&
      request.authz.userId === userId &&
      request.authz.tenantId === tenantId
    ) {
      return request.authz;
    }

    const ctx = await this.getContext(userId, tenantId);
    request.authz = ctx;
    return ctx;
  }
}

// Attach the resolved context to the request object for per-request memoization.
declare module "fastify" {
  interface FastifyRequest {
    authz?: AuthorizationContext;
  }
}
