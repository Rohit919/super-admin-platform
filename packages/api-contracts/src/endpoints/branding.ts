import { API_VERSION } from "./common.js";

/**
 * White-label branding endpoint path.
 *
 * Public (no auth) so branding can be applied on the login screen and during
 * bootstrap before a session exists. The backend remains authoritative for
 * WHICH tenant's branding is returned (resolved from host/session), never the
 * browser — see WHITE-LABEL-RUNTIME-CONFIG.md.
 */
export const BRANDING_ENDPOINTS = {
  GET: `${API_VERSION}/branding`,
} as const;
