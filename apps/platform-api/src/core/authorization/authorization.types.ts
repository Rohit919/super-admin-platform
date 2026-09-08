import type { PermissionKey } from "@app/api-contracts";

/**
 * Runtime authorization context for a request.
 * Built by the AuthorizationService from the authenticated user id, resolving
 * effective permissions (the union across all assigned roles).
 */
export interface AuthorizationContext {
  userId: string;
  /**
   * The tenant this context was resolved for, or undefined for a platform-only
   * resolution (no active tenant). Effective permissions are the union of the
   * user's platform roles (tenantId null) and their roles WITHIN this tenant.
   */
  tenantId?: string;
  roles: string[];
  permissions: PermissionKey[];
}

export type { PermissionKey };
