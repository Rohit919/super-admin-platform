import { HttpMethod } from "./http.js";
import type { ApiEndpoint } from "./endpoint.js";
import { IdParams } from "./params.js";
import {
  ROLE_ENDPOINTS,
  PERMISSION_ENDPOINTS,
  USER_ROLE_ENDPOINTS,
} from "../endpoints/admin.js";
import { ErrorCode } from "../common.js";
import { PermissionKeys } from "../rbac.js";
import {
  RoleListResponse,
  RoleResponse,
  PermissionListResponse,
  CreateRoleBody,
  UpdateRoleBody,
  UpdateRolePermissionsBody,
  SetUserRolesBody,
  UserRolesResponse,
} from "../rbac.js";
import { MessageResponse } from "../auth-otp.js";

/**
 * RBAC endpoint contracts (Level 2 — API_CONTRACTS §45). All mounted under
 * `/api/v1/admin`. Permissions are descriptive; the API enforces them at
 * runtime via requirePermission.
 */
export const ROLE_CONTRACTS = {
  LIST: {
    method: HttpMethod.GET,
    path: ROLE_ENDPOINTS.ROOT,
    auth: "required",
    permission: PermissionKeys.RolesRead,
    response: { 200: RoleListResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN],
    operationId: "roles.list",
    summary: "List roles with their permission keys",
    tags: ["Roles"],
  },

  CREATE: {
    method: HttpMethod.POST,
    path: ROLE_ENDPOINTS.ROOT,
    auth: "required",
    permission: PermissionKeys.RolesCreate,
    body: CreateRoleBody,
    response: { 201: RoleResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.FORBIDDEN,
      ErrorCode.CONFLICT,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "roles.create",
    summary: "Create a role",
    tags: ["Roles"],
  },

  GET_BY_ID: {
    method: HttpMethod.GET,
    path: ROLE_ENDPOINTS.ROUTE_BY_ID,
    auth: "required",
    permission: PermissionKeys.RolesRead,
    params: IdParams,
    response: { 200: RoleResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN, ErrorCode.NOT_FOUND],
    operationId: "roles.get",
    summary: "Get a role by id",
    tags: ["Roles"],
  },

  UPDATE: {
    method: HttpMethod.PATCH,
    path: ROLE_ENDPOINTS.ROUTE_BY_ID,
    auth: "required",
    permission: PermissionKeys.RolesUpdate,
    params: IdParams,
    body: UpdateRoleBody,
    response: { 200: RoleResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.FORBIDDEN,
      ErrorCode.NOT_FOUND,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "roles.update",
    summary: "Update a role",
    tags: ["Roles"],
  },

  SET_PERMISSIONS: {
    method: HttpMethod.PUT,
    path: ROLE_ENDPOINTS.ROUTE_PERMISSIONS,
    auth: "required",
    permission: PermissionKeys.RolesUpdate,
    params: IdParams,
    body: UpdateRolePermissionsBody,
    response: { 200: RoleResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.FORBIDDEN,
      ErrorCode.NOT_FOUND,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "roles.setPermissions",
    summary: "Replace a role's permission set",
    tags: ["Roles"],
  },

  DELETE: {
    method: HttpMethod.DELETE,
    path: ROLE_ENDPOINTS.ROUTE_BY_ID,
    auth: "required",
    permission: PermissionKeys.RolesDelete,
    params: IdParams,
    response: { 200: MessageResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.FORBIDDEN,
      ErrorCode.NOT_FOUND,
      ErrorCode.CONFLICT,
    ],
    operationId: "roles.delete",
    summary: "Delete a role",
    tags: ["Roles"],
  },
} satisfies Record<string, ApiEndpoint>;

export const PERMISSION_CONTRACTS = {
  LIST: {
    method: HttpMethod.GET,
    path: PERMISSION_ENDPOINTS.ROOT,
    auth: "required",
    permission: PermissionKeys.PermissionsRead,
    response: { 200: PermissionListResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN],
    operationId: "permissions.list",
    summary: "List all known permissions",
    tags: ["Permissions"],
  },
} satisfies Record<string, ApiEndpoint>;

export const USER_ROLE_CONTRACTS = {
  GET: {
    method: HttpMethod.GET,
    path: USER_ROLE_ENDPOINTS.ROUTE_BY_USER,
    auth: "required",
    permission: PermissionKeys.UsersRolesRead,
    params: IdParams,
    response: { 200: UserRolesResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN, ErrorCode.NOT_FOUND],
    operationId: "userRoles.get",
    summary: "Get a user's role assignments",
    tags: ["Roles"],
  },

  SET: {
    method: HttpMethod.PUT,
    path: USER_ROLE_ENDPOINTS.ROUTE_BY_USER,
    auth: "required",
    permission: PermissionKeys.UsersRolesUpdate,
    params: IdParams,
    body: SetUserRolesBody,
    response: { 200: UserRolesResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.FORBIDDEN,
      ErrorCode.NOT_FOUND,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "userRoles.set",
    summary: "Replace a user's role assignments",
    tags: ["Roles"],
  },
} satisfies Record<string, ApiEndpoint>;
