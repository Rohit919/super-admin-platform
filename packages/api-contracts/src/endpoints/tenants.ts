import { API_VERSION } from "./common.js";

/**
 * Tenant endpoint paths. Mirrors routes registered under `/api/v1/tenants`.
 *
 * CURRENT  — the active tenant for the session.
 * MINE     — the tenants the authenticated user belongs to (switcher source).
 * SWITCH   — change the active tenant (issues a new access token).
 *
 * ROUTE_*  — Fastify route templates (relative to the `/tenants` module prefix).
 */
const TENANTS_BASE = `${API_VERSION}/tenants`;

export const TENANT_ENDPOINTS = {
  CURRENT: `${TENANTS_BASE}/current`,
  MINE: TENANTS_BASE,
  SWITCH: `${TENANTS_BASE}/switch`,
} as const;

/** Sub-paths RELATIVE to the module registration prefix (`/tenants`). */
export const TENANT_ROUTES = {
  CURRENT: "/current",
  MINE: "/",
  SWITCH: "/switch",
} as const;
