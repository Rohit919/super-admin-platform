import type { PrismaClient } from "@prisma/client";
import {
  TenantAccessDeniedError,
  TenantSuspendedError,
  TenantMembershipInactiveError,
} from "@core/errors/index.js";
import type { TenantContext } from "./tenant.types.js";

/**
 * TenantService — the single place that turns a *candidate* tenant id into a
 * validated {@link TenantContext} for a user, or refuses.
 *
 * Security model (MULTI-TENANT-ARCHITECTURE §7, §16, §25, §46):
 *   - The candidate tenant id may come from the JWT claim or a switch request.
 *     It is a HINT — this service re-validates it against the database every
 *     time. The client is never trusted to assert tenant access.
 *   - Access requires an ACTIVE membership in an ACTIVE tenant. A suspended
 *     tenant or an inactive membership is refused even if a valid token exists.
 */
export class TenantService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Validate that `userId` may operate within `tenantId` and return the
   * resolved context. Throws a tenant error otherwise.
   *
   * `allowSuspendedForPlatformAdmin` lets an explicitly-authorized platform
   * operation inspect a suspended tenant (§16); ordinary requests must pass
   * false. Even then, membership is still validated unless the caller is a
   * platform admin operating cross-tenant (handled by the caller, not here).
   */
  async resolveForUser(
    userId: string,
    tenantId: string,
    opts: { allowSuspended?: boolean } = {},
  ): Promise<TenantContext> {
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        status: true,
        tenant: { select: { id: true, slug: true, status: true } },
      },
    });

    // No membership (or tenant row missing) → treat as access denied. We do NOT
    // distinguish "tenant doesn't exist" from "you're not a member" to avoid
    // tenant enumeration (§28).
    if (!membership || !membership.tenant) {
      throw new TenantAccessDeniedError();
    }

    const { tenant } = membership;

    if (tenant.status === "SUSPENDED" || tenant.status === "ARCHIVED") {
      if (!opts.allowSuspended) throw new TenantSuspendedError();
    }

    if (membership.status !== "ACTIVE") {
      throw new TenantMembershipInactiveError();
    }

    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      status: tenant.status,
      membershipStatus: membership.status,
    };
  }
}
