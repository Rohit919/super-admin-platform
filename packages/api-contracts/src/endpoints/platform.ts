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
  TENANT_OVERVIEW: (id: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(id)}/overview`,
  TENANT_ORGANIZATION: (id: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(id)}/organization`,
  TENANT_STATUS: (id: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(id)}/status`,

  USERS: `${PLATFORM_BASE}/users`,

  AUDIT: `${PLATFORM_BASE}/audit`,

  // Plans & entitlements (Phase 19.6).
  PLANS: `${PLATFORM_BASE}/plans`,
  TENANT_PLAN: (id: string) => `${PLATFORM_BASE}/tenants/${encodeId(id)}/plan`,
  TENANT_ENTITLEMENTS: (id: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(id)}/entitlements`,
  TENANT_ENTITLEMENT_OVERRIDE: (id: string, key: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(id)}/entitlements/${encodeId(key)}`,

  // Tenant API credentials (client-facing builders).
  TENANT_CREDENTIALS: (tenantId: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(tenantId)}/credentials`,
  TENANT_CREDENTIAL_ROTATE: (tenantId: string, credentialId: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(tenantId)}/credentials/${encodeId(credentialId)}/rotate`,
  TENANT_CREDENTIAL_REVOKE: (tenantId: string, credentialId: string) =>
    `${PLATFORM_BASE}/tenants/${encodeId(tenantId)}/credentials/${encodeId(credentialId)}/revoke`,

  // Fastify route templates (relative registration handled in the module).
  ROUTE_TENANT_BY_ID: `${PLATFORM_BASE}/tenants/:id`,
  ROUTE_TENANT_OVERVIEW: `${PLATFORM_BASE}/tenants/:id/overview`,
  ROUTE_TENANT_ORGANIZATION: `${PLATFORM_BASE}/tenants/:id/organization`,
  ROUTE_TENANT_STATUS: `${PLATFORM_BASE}/tenants/:id/status`,
  ROUTE_TENANT_CREDENTIALS: `${PLATFORM_BASE}/tenants/:tenantId/credentials`,
  ROUTE_TENANT_CREDENTIAL_ROTATE: `${PLATFORM_BASE}/tenants/:tenantId/credentials/:credentialId/rotate`,
  ROUTE_TENANT_CREDENTIAL_REVOKE: `${PLATFORM_BASE}/tenants/:tenantId/credentials/:credentialId/revoke`,
  ROUTE_PLANS: `${PLATFORM_BASE}/plans`,
  ROUTE_TENANT_PLAN: `${PLATFORM_BASE}/tenants/:id/plan`,
  ROUTE_TENANT_ENTITLEMENTS: `${PLATFORM_BASE}/tenants/:id/entitlements`,
  ROUTE_TENANT_ENTITLEMENT_OVERRIDE: `${PLATFORM_BASE}/tenants/:id/entitlements/:key`,
} as const;

/** Sub-paths RELATIVE to the module registration prefix (`/platform`). */
export const PLATFORM_ROUTES = {
  DASHBOARD: "/dashboard",
  TENANTS: "/tenants",
  TENANT_BY_ID: "/tenants/:id",
  TENANT_STATUS: "/tenants/:id/status",
  USERS: "/users",
} as const;
