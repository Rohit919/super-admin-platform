/**
 * Roles module schemas — re-exported from the shared contract package so the
 * API and admin frontend can never diverge on RBAC shapes.
 */
export {
  RoleDto,
  RoleListResponse,
  RoleResponse,
  PermissionDto,
  PermissionListResponse,
  CreateRoleBody,
  UpdateRoleBody,
  UpdateRolePermissionsBody,
  SetUserRolesBody,
  UserRolesResponse,
} from "@app/api-contracts";
