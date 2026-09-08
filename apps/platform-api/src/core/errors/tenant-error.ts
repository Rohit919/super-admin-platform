import { AppError } from "./app-error.js";
import { ErrorCode } from "./error-codes.js";

/**
 * Tenant-boundary errors (MULTI-TENANT-ARCHITECTURE §50).
 *
 * These describe why the current session cannot operate in a tenant context —
 * NOT the existence of another tenant's resource. To avoid tenant enumeration
 * (§28), never use these to signal that a resource owned by another tenant
 * exists; return NotFoundError for that case instead.
 *
 * All flow through the canonical error envelope via the global error handler.
 */

/** No tenant context is present but the route requires one. */
export class TenantRequiredError extends AppError {
  constructor(
    message: string = "A tenant context is required for this operation.",
  ) {
    super(message, 400, true, undefined, ErrorCode.TENANT_REQUIRED);
    this.name = "TenantRequiredError";
  }
}

/** The referenced tenant does not exist. */
export class TenantNotFoundError extends AppError {
  constructor(message: string = "Tenant not found.") {
    super(message, 404, true, undefined, ErrorCode.TENANT_NOT_FOUND);
    this.name = "TenantNotFoundError";
  }
}

/**
 * The authenticated user is not permitted to operate within the requested
 * tenant (no membership, or a switch to a tenant they don't belong to).
 * 403 — the caller is authenticated but lacks access to this tenant.
 */
export class TenantAccessDeniedError extends AppError {
  constructor(message: string = "You do not have access to this tenant.") {
    super(message, 403, true, undefined, ErrorCode.TENANT_ACCESS_DENIED);
    this.name = "TenantAccessDeniedError";
  }
}

/** The tenant exists but is suspended/archived and cannot be operated on. */
export class TenantSuspendedError extends AppError {
  constructor(message: string = "This tenant is currently suspended.") {
    super(message, 403, true, undefined, ErrorCode.TENANT_SUSPENDED);
    this.name = "TenantSuspendedError";
  }
}

/** The user's membership in the tenant is not ACTIVE (invited/suspended/removed). */
export class TenantMembershipInactiveError extends AppError {
  constructor(
    message: string = "Your membership in this tenant is not active.",
  ) {
    super(message, 403, true, undefined, ErrorCode.TENANT_MEMBERSHIP_INACTIVE);
    this.name = "TenantMembershipInactiveError";
  }
}
