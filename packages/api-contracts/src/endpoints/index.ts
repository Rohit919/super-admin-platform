/**
 * Centralized API endpoint registry (API_ENDPOINTS.md).
 *
 * ONE source of truth for API URL paths, shared by the Fastify API, the Admin
 * client, and tests. The registry owns paths only — not hosts, query params,
 * HTTP methods, authorization, or business logic.
 *
 * Values are ABSOLUTE (include the `/api/v1` prefix) so the Admin (with an
 * absolute base URL) and integration tests (app.inject) can use them directly.
 * `ROUTE_*` entries are Fastify route templates (`:param`) for backend use.
 */
export * from "./common.js";
export { AUTH_ENDPOINTS } from "./auth.js";
export { USER_ENDPOINTS, USER_ROUTES } from "./users.js";
export {
  ADMIN_ENDPOINTS,
  ROLE_ENDPOINTS,
  PERMISSION_ENDPOINTS,
  USER_ROLE_ENDPOINTS,
} from "./admin.js";
export { HEALTH_ENDPOINTS } from "./health.js";
export { BRANDING_ENDPOINTS } from "./branding.js";
export { TENANT_ENDPOINTS, TENANT_ROUTES } from "./tenants.js";
export { PLATFORM_ENDPOINTS, PLATFORM_ROUTES } from "./platform.js";

import { AUTH_ENDPOINTS } from "./auth.js";
import { USER_ENDPOINTS } from "./users.js";
import {
  ADMIN_ENDPOINTS,
  ROLE_ENDPOINTS,
  PERMISSION_ENDPOINTS,
  USER_ROLE_ENDPOINTS,
} from "./admin.js";
import { HEALTH_ENDPOINTS } from "./health.js";
import { BRANDING_ENDPOINTS } from "./branding.js";
import { TENANT_ENDPOINTS } from "./tenants.js";
import { PLATFORM_ENDPOINTS } from "./platform.js";

/** Aggregate registry — the public entry point consumers should use. */
export const API_ENDPOINTS = {
  AUTH: AUTH_ENDPOINTS,
  USERS: USER_ENDPOINTS,
  ADMIN: ADMIN_ENDPOINTS,
  ROLES: ROLE_ENDPOINTS,
  PERMISSIONS: PERMISSION_ENDPOINTS,
  USER_ROLES: USER_ROLE_ENDPOINTS,
  HEALTH: HEALTH_ENDPOINTS,
  BRANDING: BRANDING_ENDPOINTS,
  TENANTS: TENANT_ENDPOINTS,
  PLATFORM: PLATFORM_ENDPOINTS,
} as const;
