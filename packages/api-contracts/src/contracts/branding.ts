import { HttpMethod } from "./http.js";
import type { ApiEndpoint } from "./endpoint.js";
import { BRANDING_ENDPOINTS } from "../endpoints/branding.js";
import { ErrorCode } from "../common.js";
import { AppBrandingResponse } from "../branding.js";

/**
 * Branding endpoint contract (Level 2). Public, read-only tenant branding for
 * the Admin's white-label bootstrap. Cacheable; the backend resolves the tenant
 * (host/session) and returns that tenant's branding — the client only renders
 * what it is given (WHITE-LABEL-ARCHITECTURE.md, security boundaries).
 */
export const BRANDING_CONTRACTS = {
  GET: {
    method: HttpMethod.GET,
    path: BRANDING_ENDPOINTS.GET,
    auth: "public",
    response: { 200: AppBrandingResponse },
    errors: [ErrorCode.SERVICE_UNAVAILABLE],
    operationId: "config.branding",
    summary: "Resolved white-label branding for the current tenant",
    description:
      "Returns the branding configuration (name, assets, colors) the Admin " +
      "applies at runtime. Public so it can be used on the login screen. The " +
      "tenant is resolved server-side; the client never chooses it.",
    tags: ["Config"],
  },
} satisfies Record<string, ApiEndpoint>;
