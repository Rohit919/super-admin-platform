// ── Permission-based (DB-backed) RBAC — the primary authorization boundary ────
export { AuthorizationService } from "./authorization.service.js";
export type {
  AuthorizationContext,
  PermissionKey,
} from "./authorization.types.js";
export {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
} from "./require-permission.js";
