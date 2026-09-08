/**
 * Level 2 API contracts (API_CONTRACTS.md §70).
 *
 * Endpoint CONTRACT objects bundle method + path + auth + permission +
 * request/response schemas + error codes + OpenAPI metadata. Consumed by the
 * Fastify API (route registration), the Admin client (typed requests), and
 * tests — one authoritative definition per endpoint.
 *
 * This is the richer companion to the Level 1 path registry in ../endpoints.
 */
export * from "./http.js";
export * from "./endpoint.js";
export * from "./params.js";
export { AUTH_CONTRACTS } from "./auth.js";
export { USER_CONTRACTS } from "./users.js";
export {
  ROLE_CONTRACTS,
  PERMISSION_CONTRACTS,
  USER_ROLE_CONTRACTS,
} from "./rbac.js";
export { DASHBOARD_CONTRACTS } from "./dashboard.js";
export { BRANDING_CONTRACTS } from "./branding.js";
export { TENANT_CONTRACTS } from "./tenants.js";
export { PLATFORM_CONTRACTS } from "./platform.js";

import { AUTH_CONTRACTS } from "./auth.js";
import { USER_CONTRACTS } from "./users.js";
import {
  ROLE_CONTRACTS,
  PERMISSION_CONTRACTS,
  USER_ROLE_CONTRACTS,
} from "./rbac.js";
import { DASHBOARD_CONTRACTS } from "./dashboard.js";
import { BRANDING_CONTRACTS } from "./branding.js";
import { TENANT_CONTRACTS } from "./tenants.js";
import { PLATFORM_CONTRACTS } from "./platform.js";

/** Aggregate contract registry — one root object for tooling. */
export const API_CONTRACTS = {
  AUTH: AUTH_CONTRACTS,
  USERS: USER_CONTRACTS,
  ROLES: ROLE_CONTRACTS,
  PERMISSIONS: PERMISSION_CONTRACTS,
  USER_ROLES: USER_ROLE_CONTRACTS,
  DASHBOARD: DASHBOARD_CONTRACTS,
  BRANDING: BRANDING_CONTRACTS,
  TENANTS: TENANT_CONTRACTS,
  PLATFORM: PLATFORM_CONTRACTS,
} as const;
