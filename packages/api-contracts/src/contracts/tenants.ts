import { HttpMethod } from "./http.js";
import type { ApiEndpoint } from "./endpoint.js";
import { TENANT_ENDPOINTS } from "../endpoints/tenants.js";
import { ErrorCode } from "../common.js";
import {
  CurrentTenantResponse,
  TenantMembershipsResponse,
  SwitchTenantBody,
  SwitchTenantResponse,
} from "../tenants.js";

/**
 * Tenant endpoint contracts (Level 2). All require authentication; tenant
 * membership + status is validated server-side (MULTI-TENANT §32, §34).
 */
export const TENANT_CONTRACTS = {
  CURRENT: {
    method: HttpMethod.GET,
    path: TENANT_ENDPOINTS.CURRENT,
    auth: "required",
    response: { 200: CurrentTenantResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.TENANT_REQUIRED,
      ErrorCode.TENANT_ACCESS_DENIED,
      ErrorCode.TENANT_SUSPENDED,
    ],
    operationId: "tenants.current",
    summary: "Get the active tenant for the session",
    tags: ["Tenants"],
  },

  MINE: {
    method: HttpMethod.GET,
    path: TENANT_ENDPOINTS.MINE,
    auth: "required",
    response: { 200: TenantMembershipsResponse },
    errors: [ErrorCode.UNAUTHORIZED],
    operationId: "tenants.mine",
    summary: "List the tenants the authenticated user belongs to",
    description:
      "Returns the caller's tenant memberships (active tenant switcher source). " +
      "Only the user's own memberships are ever returned.",
    tags: ["Tenants"],
  },

  SWITCH: {
    method: HttpMethod.POST,
    path: TENANT_ENDPOINTS.SWITCH,
    auth: "required",
    body: SwitchTenantBody,
    response: { 200: SwitchTenantResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.VALIDATION_ERROR,
      ErrorCode.TENANT_ACCESS_DENIED,
      ErrorCode.TENANT_SUSPENDED,
      ErrorCode.TENANT_MEMBERSHIP_INACTIVE,
    ],
    operationId: "tenants.switch",
    summary: "Switch the active tenant (issues a new access token)",
    description:
      "Validates the user has an ACTIVE membership in the target ACTIVE tenant, " +
      "then returns a new access token scoped to it. The client never asserts " +
      "tenant access; the server is authoritative.",
    tags: ["Tenants"],
  },
} satisfies Record<string, ApiEndpoint>;
