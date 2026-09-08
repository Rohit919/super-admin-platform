import { API_VERSION, encodeId } from "./common.js";

/**
 * Platform (Super Admin) endpoint paths. Mirrors routes registered under
 * `/api/v1/platform`. Consumed by the Fastify API, the Super Admin app, and
 * tests.
 */
const PLATFORM_BASE = `${API_VERSION}/platform`;

export const PLATFORM_ENDPOINTS = {
  DASHBOARD: `${PLATFORM_BASE}/dashboard`,

  TENANTS: `${PLATFORM_BASE}/tenants`,
  TENANT_BY_ID: (id: string) => `${PLATFORM_BASE}/tenants/${encodeId(id)}`,
  TENANT_STATUS: (id: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(id)}/status`,

  USERS: `${PLATFORM_BASE}/users`,

  AUDIT: `${PLATFORM_BASE}/audit`,

  // Tenant API credentials (client-facing builders).
  TENANT_CREDENTIALS: (tenantId: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(tenantId)}/credentials`,
  TENANT_CREDENTIAL_ROTATE: (tenantId: string, credentialId: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(tenantId)}/credentials/${encodeId(credentialId)}/rotate`,
  TENANT_CREDENTIAL_REVOKE: (tenantId: string, credentialId: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(tenantId)}/credentials/${encodeId(credentialId)}/revoke`,

  // Fastify route templates (relative registration handled in the module).
  ROUTE_TENANT_BY_ID: `${PLATFORM_BASE}/tenants/:id`,
  ROUTE_TENANT_STATUS: `${PLATFORM_BASE}/tenants/:id/status`,
  ROUTE_TENANT_CREDENTIALS: `${PLATFORM_BASE}/tenants/:tenantId/credentials`,
  ROUTE_TENANT_CREDENTIAL_ROTATE: `${PLATFORM_BASE}/tenants/:tenantId/credentials/:credentialId/rotate`,
  ROUTE_TENANT_CREDENTIAL_REVOKE: `${PLATFORM_BASE}/tenants/:tenantId/credentials/:credentialId/revoke`,
} as const;

/** Sub-paths RELATIVE to the module registration prefix (`/platform`). */
export const PLATFORM_ROUTES = {
  DASHBOARD: "/dashboard",
  TENANTS: "/tenants",
  TENANT_BY_ID: "/tenants/:id",
  TENANT_STATUS: "/tenants/:id/status",
  USERS: "/users",
} as const;
