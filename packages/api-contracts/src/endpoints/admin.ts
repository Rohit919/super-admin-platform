import { API_VERSION, encodeId } from "./common.js";

/**
 * Admin-area endpoint paths (registered under `/api/v1/admin`).
 *
 * Both the RBAC roles/permissions routes and the ops db-metrics route mount
 * under `/admin` in the API (admin.routes.ts + roles.routes.ts).
 */
const ADMIN_BASE = `${API_VERSION}/admin`;
const ROLES_BASE = `${ADMIN_BASE}/roles`;

export const ADMIN_ENDPOINTS = {
  DB_METRICS: `${ADMIN_BASE}/db-metrics`,
  DASHBOARD: `${ADMIN_BASE}/dashboard`,
} as const;

export const ROLE_ENDPOINTS = {
  ROOT: ROLES_BASE,

  BY_ID: (roleId: string) => `${ROLES_BASE}/${encodeId(roleId)}`,
  PERMISSIONS: (roleId: string) =>
    `${ROLES_BASE}/${encodeId(roleId)}/permissions`,

  // Fastify route templates
  ROUTE_BY_ID: `${ROLES_BASE}/:id`,
  ROUTE_PERMISSIONS: `${ROLES_BASE}/:id/permissions`,
} as const;

export const PERMISSION_ENDPOINTS = {
  ROOT: `${ADMIN_BASE}/permissions`,
} as const;

/** User ↔ role assignment endpoints (nested under admin/users/:id/roles). */
export const USER_ROLE_ENDPOINTS = {
  BY_USER: (userId: string) => `${ADMIN_BASE}/users/${encodeId(userId)}/roles`,

  // Fastify route template
  ROUTE_BY_USER: `${ADMIN_BASE}/users/:id/roles`,
} as const;
