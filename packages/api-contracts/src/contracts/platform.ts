import { Type } from "@sinclair/typebox";
import { HttpMethod } from "./http.js";
import type { ApiEndpoint } from "./endpoint.js";
import { IdParams, IdSchema } from "./params.js";
import { PLATFORM_ENDPOINTS } from "../endpoints/platform.js";
import { ErrorCode } from "../common.js";
import { PermissionKeys } from "../rbac.js";
import {
  PlatformDashboardResponse,
  PlatformTenantPageResponse,
  PlatformTenantListQuery,
  PlatformTenantResponse,
  PlatformTenantOverviewResponse,
  TenantOrganizationResponse,
  UpdateTenantOrganizationBody,
  CreateTenantBody,
  UpdateTenantBody,
  UpdateTenantStatusBody,
  PlatformUserListResponse,
  TenantApiCredentialListResponse,
  CreateTenantApiCredentialBody,
  CreatedTenantApiCredentialResponse,
  TenantApiCredentialResponse,
  PlatformAuditLogListResponse,
  PlatformAuditLogQuery,
  PlanListResponse,
  AssignTenantPlanBody,
  TenantEntitlementsResponse,
  SetTenantEntitlementOverrideBody,
} from "../platform.js";

/** Path params for credential routes. */
const TenantIdParams = Type.Object({ tenantId: IdSchema });
/** Path params for a tenant entitlement override (tenant id + entitlement key). */
const EntitlementKeyParams = Type.Object({ id: IdSchema, key: Type.String() });
const CredentialParams = Type.Object({
  tenantId: IdSchema,
  credentialId: IdSchema,
});

/**
 * Platform (Super Admin) endpoint contracts (Level 2). Every endpoint requires
 * auth + a platform.* permission (enforced at runtime by requirePlatformPermission,
 * which also checks the PlatformMembership gate). PLATFORM_ACCESS_DENIED (403)
 * is the uniform failure for missing membership OR permission.
 */
export const PLATFORM_CONTRACTS = {
  DASHBOARD: {
    method: HttpMethod.GET,
    path: PLATFORM_ENDPOINTS.DASHBOARD,
    auth: "required",
    permission: PermissionKeys.PlatformDashboardView,
    response: { 200: PlatformDashboardResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.PLATFORM_ACCESS_DENIED],
    operationId: "platform.dashboard",
    summary: "Platform dashboard statistics",
    tags: ["Platform"],
  },

  TENANTS_LIST: {
    method: HttpMethod.GET,
    path: PLATFORM_ENDPOINTS.TENANTS,
    auth: "required",
    permission: PermissionKeys.PlatformTenantView,
    query: PlatformTenantListQuery,
    response: { 200: PlatformTenantPageResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.PLATFORM_ACCESS_DENIED],
    operationId: "platform.tenants.list",
    summary:
      "List tenants (optional status filter + name/slug search, paginated)",
    tags: ["Platform"],
  },

  TENANT_CREATE: {
    method: HttpMethod.POST,
    path: PLATFORM_ENDPOINTS.TENANTS,
    auth: "required",
    permission: PermissionKeys.PlatformTenantCreate,
    body: CreateTenantBody,
    response: { 201: PlatformTenantResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.VALIDATION_ERROR,
      ErrorCode.CONFLICT,
    ],
    operationId: "platform.tenants.create",
    summary: "Provision a new tenant (creates tenant + admin + default roles)",
    tags: ["Platform"],
  },

  TENANT_GET: {
    method: HttpMethod.GET,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_BY_ID,
    auth: "required",
    permission: PermissionKeys.PlatformTenantView,
    params: IdParams,
    response: { 200: PlatformTenantResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
    ],
    operationId: "platform.tenants.get",
    summary: "Get a tenant by id",
    tags: ["Platform"],
  },

  TENANT_OVERVIEW: {
    method: HttpMethod.GET,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_OVERVIEW,
    auth: "required",
    permission: PermissionKeys.PlatformTenantView,
    params: IdParams,
    response: { 200: PlatformTenantOverviewResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
    ],
    operationId: "platform.tenants.overview",
    summary:
      "Deep tenant overview aggregate (identity, admin, members, credentials, plan)",
    tags: ["Platform"],
  },

  TENANT_UPDATE: {
    method: HttpMethod.PATCH,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_BY_ID,
    auth: "required",
    permission: PermissionKeys.PlatformTenantUpdate,
    params: IdParams,
    body: UpdateTenantBody,
    response: { 200: PlatformTenantResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "platform.tenants.update",
    summary: "Update a tenant's platform metadata (name)",
    tags: ["Platform"],
  },

  TENANT_ORGANIZATION_GET: {
    method: HttpMethod.GET,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_ORGANIZATION,
    auth: "required",
    permission: PermissionKeys.PlatformTenantView,
    params: IdParams,
    response: { 200: TenantOrganizationResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
    ],
    operationId: "platform.tenants.organization.get",
    summary: "Get a tenant's organization profile (identity, address, contact)",
    tags: ["Platform"],
  },

  TENANT_ORGANIZATION_UPDATE: {
    method: HttpMethod.PATCH,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_ORGANIZATION,
    auth: "required",
    permission: PermissionKeys.PlatformTenantUpdate,
    params: IdParams,
    body: UpdateTenantOrganizationBody,
    response: { 200: TenantOrganizationResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "platform.tenants.organization.update",
    summary: "Update a tenant's organization profile (partial)",
    tags: ["Platform"],
  },

  TENANT_STATUS: {
    method: HttpMethod.PATCH,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_STATUS,
    auth: "required",
    // suspend/reactivate use platform.tenant.suspend; archive uses
    // platform.tenant.archive. The route requires suspend and additionally
    // checks archive when transitioning to ARCHIVED (documented in the route).
    permission: PermissionKeys.PlatformTenantSuspend,
    params: IdParams,
    body: UpdateTenantStatusBody,
    response: { 200: PlatformTenantResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
      ErrorCode.VALIDATION_ERROR,
      // Illegal lifecycle transition (e.g. any change out of ARCHIVED, or a
      // no-op same-status change) — see TENANT_STATUS_TRANSITIONS.
      ErrorCode.CONFLICT,
    ],
    operationId: "platform.tenants.setStatus",
    summary: "Change a tenant's status (suspend / reactivate / archive)",
    tags: ["Platform"],
  },

  USERS_LIST: {
    method: HttpMethod.GET,
    path: PLATFORM_ENDPOINTS.USERS,
    auth: "required",
    permission: PermissionKeys.PlatformUserView,
    response: { 200: PlatformUserListResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.PLATFORM_ACCESS_DENIED],
    operationId: "platform.users.list",
    summary: "List platform users (users with a platform membership)",
    tags: ["Platform"],
  },

  // ── Tenant API credentials ──────────────────────────────────────────────────
  TENANT_CREDENTIALS_LIST: {
    method: HttpMethod.GET,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_CREDENTIALS,
    auth: "required",
    permission: PermissionKeys.PlatformCredentialRead,
    params: TenantIdParams,
    response: { 200: TenantApiCredentialListResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
    ],
    operationId: "platform.tenants.credentials.list",
    summary: "List a tenant's API credentials (never returns secrets)",
    tags: ["Platform"],
  },

  TENANT_CREDENTIAL_CREATE: {
    method: HttpMethod.POST,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_CREDENTIALS,
    auth: "required",
    permission: PermissionKeys.PlatformCredentialCreate,
    params: TenantIdParams,
    body: CreateTenantApiCredentialBody,
    // 201 returns the plaintext secret ONCE.
    response: { 201: CreatedTenantApiCredentialResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "platform.tenants.credentials.create",
    summary: "Create a tenant API credential (returns the secret once)",
    tags: ["Platform"],
  },

  TENANT_CREDENTIAL_ROTATE: {
    method: HttpMethod.POST,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_CREDENTIAL_ROTATE,
    auth: "required",
    permission: PermissionKeys.PlatformCredentialRotate,
    params: CredentialParams,
    // 200 returns the NEW plaintext secret ONCE; the previous credential is revoked.
    response: { 200: CreatedTenantApiCredentialResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
      ErrorCode.CONFLICT,
    ],
    operationId: "platform.tenants.credentials.rotate",
    summary:
      "Rotate a tenant API credential (new secret once; old one revoked)",
    tags: ["Platform"],
  },

  TENANT_CREDENTIAL_REVOKE: {
    method: HttpMethod.POST,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_CREDENTIAL_REVOKE,
    auth: "required",
    permission: PermissionKeys.PlatformCredentialRevoke,
    params: CredentialParams,
    response: { 200: TenantApiCredentialResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
      ErrorCode.CONFLICT,
    ],
    operationId: "platform.tenants.credentials.revoke",
    summary: "Revoke a tenant API credential (auditable)",
    tags: ["Platform"],
  },

  // ── Platform audit ──────────────────────────────────────────────────────────
  AUDIT_LIST: {
    method: HttpMethod.GET,
    path: PLATFORM_ENDPOINTS.AUDIT,
    auth: "required",
    permission: PermissionKeys.PlatformAuditView,
    query: PlatformAuditLogQuery,
    response: { 200: PlatformAuditLogListResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.PLATFORM_ACCESS_DENIED],
    operationId: "platform.audit.list",
    summary: "List platform audit events (metadata never contains secrets)",
    tags: ["Platform"],
  },
} satisfies Record<string, ApiEndpoint>;

/**
 * Plans & Entitlements contracts (Phase 19.6). Non-commercial capability model;
 * every endpoint is platform-guarded. Viewing uses platform.plan.view /
 * platform.entitlement.view; mutations use platform.plan.manage /
 * platform.entitlement.manage.
 */
export const PLAN_CONTRACTS = {
  PLANS_LIST: {
    method: HttpMethod.GET,
    path: PLATFORM_ENDPOINTS.PLANS,
    auth: "required",
    permission: PermissionKeys.PlatformPlanView,
    response: { 200: PlanListResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.PLATFORM_ACCESS_DENIED],
    operationId: "platform.plans.list",
    summary: "List plans and their entitlement values",
    tags: ["Platform"],
  },

  TENANT_PLAN_ASSIGN: {
    method: HttpMethod.PUT,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_PLAN,
    auth: "required",
    permission: PermissionKeys.PlatformPlanManage,
    params: IdParams,
    body: AssignTenantPlanBody,
    response: { 200: TenantEntitlementsResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "platform.tenants.plan.assign",
    summary: "Assign a plan to a tenant",
    tags: ["Platform"],
  },

  TENANT_ENTITLEMENTS_GET: {
    method: HttpMethod.GET,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_ENTITLEMENTS,
    auth: "required",
    permission: PermissionKeys.PlatformEntitlementView,
    params: IdParams,
    response: { 200: TenantEntitlementsResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
    ],
    operationId: "platform.tenants.entitlements.get",
    summary: "Get a tenant's effective entitlements (plan + overrides)",
    tags: ["Platform"],
  },

  TENANT_ENTITLEMENT_OVERRIDE_SET: {
    method: HttpMethod.PUT,
    path: PLATFORM_ENDPOINTS.ROUTE_TENANT_ENTITLEMENT_OVERRIDE,
    auth: "required",
    permission: PermissionKeys.PlatformEntitlementManage,
    params: EntitlementKeyParams,
    body: SetTenantEntitlementOverrideBody,
    response: { 200: TenantEntitlementsResponse },
    errors: [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.PLATFORM_ACCESS_DENIED,
      ErrorCode.NOT_FOUND,
      ErrorCode.VALIDATION_ERROR,
    ],
    operationId: "platform.tenants.entitlements.override",
    summary: "Set or clear a per-tenant entitlement override",
    tags: ["Platform"],
  },
} satisfies Record<string, ApiEndpoint>;
