import { HttpMethod } from "./http.js";
import type { ApiEndpoint } from "./endpoint.js";
import { UserIdParams } from "./params.js";
import { USER_ENDPOINTS } from "../endpoints/users.js";
import { ErrorCode } from "../common.js";
import { PermissionKeys } from "../rbac.js";
import {
  ListUsersQuery,
  UsersListResponse,
  UserResponse,
  UserMessageResponse,
  CreateUserBody,
  UpdateUserBody,
  UpdateProfileBody,
} from "../users.js";
import { MeResponse } from "../rbac.js";

/**
 * User endpoint contracts (Level 2 — API_CONTRACTS §79).
 *
 * `permission` metadata is descriptive; the API still enforces it at runtime
 * via requirePermission (API_CONTRACTS §19, §67). Self-service endpoints
 * (UPDATE_ME) intentionally omit `permission` — they are scoped to the caller.
 */
export const USER_CONTRACTS = {
  LIST: {
    method: HttpMethod.GET,
    path: USER_ENDPOINTS.ROOT,
    auth: "required",
    permission: PermissionKeys.UsersRead,
    query: ListUsersQuery,
    response: { 200: UsersListResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.FORBIDDEN,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "users.list",
    summary: "List users (paginated)",
    description:
      "Server-side pagination (default 25, max 100), search, role filter, whitelisted sort.",
    tags: ["Users"],
  },

  ME: {
    method: HttpMethod.GET,
    path: USER_ENDPOINTS.ME,
    auth: "required",
    response: { 200: MeResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.NOT_FOUND],
    operationId: "users.me",
    summary: "Get the authenticated user profile with effective permissions",
    tags: ["Users"],
  },

  // ── Self profile update (self-scoped; no permission gate) ───────────────────
  UPDATE_ME: {
    method: HttpMethod.PATCH,
    path: USER_ENDPOINTS.ME,
    auth: "required",
    body: UpdateProfileBody,
    response: { 200: UserResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.NOT_FOUND,
      ErrorCode.CONFLICT,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "users.updateMe",
    summary: "Update the authenticated user profile (name/email)",
    tags: ["Users"],
  },

  // ── Admin-managed user CRUD ─────────────────────────────────────────────────
  CREATE: {
    method: HttpMethod.POST,
    path: USER_ENDPOINTS.ROOT,
    auth: "required",
    permission: PermissionKeys.UsersCreate,
    body: CreateUserBody,
    response: { 201: UserResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.FORBIDDEN,
      ErrorCode.CONFLICT,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "users.create",
    summary: "Create a user",
    tags: ["Users"],
  },

  GET_BY_ID: {
    method: HttpMethod.GET,
    path: USER_ENDPOINTS.ROUTE_BY_ID,
    auth: "required",
    permission: PermissionKeys.UsersRead,
    params: UserIdParams,
    response: { 200: UserResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN, ErrorCode.NOT_FOUND],
    operationId: "users.get",
    summary: "Get a user by id",
    tags: ["Users"],
  },

  UPDATE: {
    method: HttpMethod.PATCH,
    path: USER_ENDPOINTS.ROUTE_BY_ID,
    auth: "required",
    permission: PermissionKeys.UsersUpdate,
    params: UserIdParams,
    body: UpdateUserBody,
    response: { 200: UserResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.FORBIDDEN,
      ErrorCode.NOT_FOUND,
      ErrorCode.CONFLICT,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "users.update",
    summary: "Update a user",
    tags: ["Users"],
  },

  DELETE: {
    method: HttpMethod.DELETE,
    path: USER_ENDPOINTS.ROUTE_BY_ID,
    auth: "required",
    permission: PermissionKeys.UsersDelete,
    params: UserIdParams,
    response: { 200: UserMessageResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.FORBIDDEN,
      ErrorCode.NOT_FOUND,
      ErrorCode.CONFLICT,
    ],
    operationId: "users.delete",
    summary: "Delete a user",
    tags: ["Users"],
  },
} satisfies Record<string, ApiEndpoint>;
