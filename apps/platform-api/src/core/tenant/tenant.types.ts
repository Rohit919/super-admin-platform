import type { TenantStatus, MembershipStatus } from "@prisma/client";

/**
 * Resolved tenant context for a request. Attached to `request.tenant` by the
 * tenant-resolution hook AFTER authentication and membership validation.
 *
 * Presence of this object means: the authenticated user has an ACTIVE
 * membership in an ACTIVE tenant, and `tenantId` is safe to use as the
 * authoritative tenant scope for the request. It is NEVER derived from an
 * untrusted client value without membership validation (MULTI-TENANT §7.2, §29).
 */
export interface TenantContext {
  tenantId: string;
  slug: string;
  status: TenantStatus;
  /** The caller's membership status in this tenant (always ACTIVE when set). */
  membershipStatus: MembershipStatus;
}

declare module "fastify" {
  interface FastifyRequest {
    /**
     * The validated active tenant for this request, or undefined for
     * platform-only / public / no-tenant requests. Populated by the
     * tenant-resolution hook.
     */
    tenant?: TenantContext;
  }
}
