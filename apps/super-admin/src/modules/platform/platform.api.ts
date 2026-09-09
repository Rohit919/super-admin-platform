import { apiClient } from "@/lib/api-client";
import {
  API_CONTRACTS,
  type PlatformDashboardResponse,
  type PlatformDashboardStats,
  type PlatformTenantPageResponse,
  type PlatformTenantListQuery,
  type PlatformTenantResponse,
  type PlatformTenantDto,
  type PlatformTenantOverviewResponse,
  type PlatformTenantOverviewDto,
  type TenantOrganizationResponse,
  type TenantOrganizationDto,
  type UpdateTenantOrganizationBody,
  type PlatformUserListResponse,
  type PlatformUserDto,
  type CreateTenantBody,
  type UpdateTenantBody,
  type TenantStatus,
  type TenantApiCredentialListResponse,
  type TenantApiCredentialDto,
  type TenantApiCredentialResponse,
  type CreatedTenantApiCredentialResponse,
  type CreateTenantApiCredentialBody,
  type PlatformAuditLogListResponse,
  type PlatformAuditLogDto,
  type PlatformAuditLogQuery,
  type PlanDto,
  type PlanListResponse,
  type TenantEntitlementsResponse,
  type AppBranding,
  type UpdateTenantBrandingBody,
  type TenantConnectionStatus,
  type TenantBrandingResponse,
  type TenantConnectionStatusResponse,
} from "@app/api-contracts";

/** Credential DTO plus the one-time plaintext secret (create/rotate only). */
export type CreatedCredential = CreatedTenantApiCredentialResponse["data"];

/** A tenant's resolved plan + effective entitlements. */
export type TenantEntitlements = TenantEntitlementsResponse["data"];

/** A page of tenants + offset pagination metadata. */
export type TenantPage = Pick<PlatformTenantPageResponse, "data" | "meta">;

/**
 * Platform (Super Admin) API service — contract-driven calls to /platform/*.
 * Every call is gated server-side by an ACTIVE PlatformMembership + platform.*
 * permission; a non-platform user gets 403 PLATFORM_ACCESS_DENIED.
 */
export const platformApi = {
  dashboard: async (): Promise<PlatformDashboardStats> => {
    const res = await apiClient.request<PlatformDashboardResponse>(
      API_CONTRACTS.PLATFORM.DASHBOARD,
    );
    return res.data;
  },

  /**
   * List tenants with backend-authoritative pagination + optional status
   * filter and name/slug search. Returns the page plus pagination meta.
   */
  tenants: async (query: PlatformTenantListQuery = {}): Promise<TenantPage> => {
    const res = await apiClient.request<PlatformTenantPageResponse>(
      API_CONTRACTS.PLATFORM.TENANTS_LIST,
      {
        query: query as Record<string, string | number | undefined>,
      },
    );
    return { data: res.data, meta: res.meta };
  },

  tenant: async (id: string): Promise<PlatformTenantDto> => {
    const res = await apiClient.request<PlatformTenantResponse>(
      API_CONTRACTS.PLATFORM.TENANT_GET,
      {
        params: { id },
      },
    );
    return res.data;
  },

  /**
   * Deep tenant overview aggregate for the Control Center (identity, primary
   * admin, member/credential breakdowns, plan summary). All real data.
   */
  tenantOverview: async (id: string): Promise<PlatformTenantOverviewDto> => {
    const res = await apiClient.request<PlatformTenantOverviewResponse>(
      API_CONTRACTS.PLATFORM.TENANT_OVERVIEW,
      {
        params: { id },
      },
    );
    return res.data;
  },

  /**
   * Tenant organization profile (identity echo + organization/address/contact).
   * Real, nullable platform metadata. Requires platform.tenant.view.
   */
  tenantOrganization: async (id: string): Promise<TenantOrganizationDto> => {
    const res = await apiClient.request<TenantOrganizationResponse>(
      API_CONTRACTS.PLATFORM.TENANT_ORGANIZATION_GET,
      { params: { id } },
    );
    return res.data;
  },

  /**
   * Partial update of the organization profile. Only provided keys change; an
   * empty string clears a field. Requires platform.tenant.update.
   */
  updateTenantOrganization: async (
    id: string,
    body: UpdateTenantOrganizationBody,
  ): Promise<TenantOrganizationDto> => {
    const res = await apiClient.request<TenantOrganizationResponse>(
      API_CONTRACTS.PLATFORM.TENANT_ORGANIZATION_UPDATE,
      { params: { id }, body },
    );
    return res.data;
  },

  // ── Tenant platform connection & branding (Phase 21) ─────────────────────────
  /**
   * Runtime connection status for a tenant, resolved by the Platform API
   * calling the Tenant API over S2S. `reachable:false` means the Tenant API
   * could not be reached (never a false "healthy"). Requires platform.tenant.view.
   */
  tenantConnection: async (id: string): Promise<TenantConnectionStatus> => {
    const res = await apiClient.request<TenantConnectionStatusResponse>(
      API_CONTRACTS.TENANT_PLATFORM.TENANT_CONNECTION_GET,
      { params: { id } },
    );
    return res.data;
  },

  /**
   * Read the tenant's persisted branding via the Tenant API. Requires
   * platform.tenant.view. The Super Admin UI NEVER calls the Tenant API
   * directly — this proxies through the Platform API (Phase 21 §12/§29/§31).
   */
  tenantBranding: async (id: string): Promise<AppBranding> => {
    const res = await apiClient.request<TenantBrandingResponse>(
      API_CONTRACTS.TENANT_PLATFORM.TENANT_BRANDING_GET,
      { params: { id } },
    );
    return res.data;
  },

  /**
   * Partial branding update pushed to the Tenant API. Only provided keys
   * change. Requires platform.tenant.update. Audited server-side.
   */
  updateTenantBranding: async (
    id: string,
    body: UpdateTenantBrandingBody,
  ): Promise<AppBranding> => {
    const res = await apiClient.request<TenantBrandingResponse>(
      API_CONTRACTS.TENANT_PLATFORM.TENANT_BRANDING_UPDATE,
      { params: { id }, body },
    );
    return res.data;
  },

  createTenant: async (body: CreateTenantBody): Promise<PlatformTenantDto> => {
    const res = await apiClient.request<PlatformTenantResponse>(
      API_CONTRACTS.PLATFORM.TENANT_CREATE,
      {
        body,
      },
    );
    return res.data;
  },

  /** Update platform-level tenant metadata (name). Requires platform.tenant.update. */
  updateTenant: async (
    id: string,
    body: UpdateTenantBody,
  ): Promise<PlatformTenantDto> => {
    const res = await apiClient.request<PlatformTenantResponse>(
      API_CONTRACTS.PLATFORM.TENANT_UPDATE,
      {
        params: { id },
        body,
      },
    );
    return res.data;
  },

  setTenantStatus: async (
    id: string,
    status: TenantStatus,
  ): Promise<PlatformTenantDto> => {
    const res = await apiClient.request<PlatformTenantResponse>(
      API_CONTRACTS.PLATFORM.TENANT_STATUS,
      {
        params: { id },
        body: { status },
      },
    );
    return res.data;
  },

  users: async (): Promise<PlatformUserDto[]> => {
    const res = await apiClient.request<PlatformUserListResponse>(
      API_CONTRACTS.PLATFORM.USERS_LIST,
    );
    return res.data;
  },

  // ── Tenant API credentials ──────────────────────────────────────────────────
  listCredentials: async (
    tenantId: string,
  ): Promise<TenantApiCredentialDto[]> => {
    const res = await apiClient.request<TenantApiCredentialListResponse>(
      API_CONTRACTS.PLATFORM.TENANT_CREDENTIALS_LIST,
      { params: { tenantId } },
    );
    return res.data;
  },

  /** Returns the plaintext secret ONCE — display it, never persist it. */
  createCredential: async (
    tenantId: string,
    body: CreateTenantApiCredentialBody,
  ): Promise<CreatedCredential> => {
    const res = await apiClient.request<CreatedTenantApiCredentialResponse>(
      API_CONTRACTS.PLATFORM.TENANT_CREDENTIAL_CREATE,
      { params: { tenantId }, body },
    );
    return res.data;
  },

  /** Returns the NEW plaintext secret ONCE; the previous credential is revoked. */
  rotateCredential: async (
    tenantId: string,
    credentialId: string,
  ): Promise<CreatedCredential> => {
    const res = await apiClient.request<CreatedTenantApiCredentialResponse>(
      API_CONTRACTS.PLATFORM.TENANT_CREDENTIAL_ROTATE,
      { params: { tenantId, credentialId } },
    );
    return res.data;
  },

  revokeCredential: async (
    tenantId: string,
    credentialId: string,
  ): Promise<TenantApiCredentialDto> => {
    const res = await apiClient.request<TenantApiCredentialResponse>(
      API_CONTRACTS.PLATFORM.TENANT_CREDENTIAL_REVOKE,
      { params: { tenantId, credentialId } },
    );
    return res.data;
  },

  // ── Audit log ────────────────────────────────────────────────────────────────
  auditLogs: async (
    query: PlatformAuditLogQuery = {},
  ): Promise<PlatformAuditLogDto[]> => {
    const res = await apiClient.request<PlatformAuditLogListResponse>(
      API_CONTRACTS.PLATFORM.AUDIT_LIST,
      { query: query as Record<string, string | number | undefined> },
    );
    return res.data;
  },

  // ── Plans & entitlements ───────────────────────────────────────────────────
  plans: async (): Promise<PlanDto[]> => {
    const res = await apiClient.request<PlanListResponse>(
      API_CONTRACTS.PLANS.PLANS_LIST,
    );
    return res.data;
  },

  tenantEntitlements: async (tenantId: string): Promise<TenantEntitlements> => {
    const res = await apiClient.request<TenantEntitlementsResponse>(
      API_CONTRACTS.PLANS.TENANT_ENTITLEMENTS_GET,
      { params: { id: tenantId } },
    );
    return res.data;
  },

  assignTenantPlan: async (
    tenantId: string,
    planKey: string,
  ): Promise<TenantEntitlements> => {
    const res = await apiClient.request<TenantEntitlementsResponse>(
      API_CONTRACTS.PLANS.TENANT_PLAN_ASSIGN,
      { params: { id: tenantId }, body: { planKey } },
    );
    return res.data;
  },

  /**
   * Set (string value) or clear (null) a per-tenant entitlement override.
   * Requires platform.entitlement.manage. Returns the tenant's resolved
   * entitlements after the change.
   */
  setTenantEntitlementOverride: async (
    tenantId: string,
    entitlementKey: string,
    value: string | null,
  ): Promise<TenantEntitlements> => {
    const res = await apiClient.request<TenantEntitlementsResponse>(
      API_CONTRACTS.PLANS.TENANT_ENTITLEMENT_OVERRIDE_SET,
      { params: { id: tenantId, key: entitlementKey }, body: { value } },
    );
    return res.data;
  },
};
