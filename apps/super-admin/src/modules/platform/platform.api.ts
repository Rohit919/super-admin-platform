import { apiClient } from "@/lib/api-client";
import {
  API_CONTRACTS,
  type PlatformDashboardResponse,
  type PlatformDashboardStats,
  type PlatformTenantListResponse,
  type PlatformTenantResponse,
  type PlatformTenantDto,
  type PlatformUserListResponse,
  type PlatformUserDto,
  type CreateTenantBody,
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
} from "@app/api-contracts";

/** Credential DTO plus the one-time plaintext secret (create/rotate only). */
export type CreatedCredential = CreatedTenantApiCredentialResponse["data"];

/** A tenant's resolved plan + effective entitlements. */
export type TenantEntitlements = TenantEntitlementsResponse["data"];

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

  tenants: async (status?: TenantStatus): Promise<PlatformTenantDto[]> => {
    const res = await apiClient.request<PlatformTenantListResponse>(
      API_CONTRACTS.PLATFORM.TENANTS_LIST,
      {
        query: status ? { status } : {},
      },
    );
    return res.data;
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

  createTenant: async (body: CreateTenantBody): Promise<PlatformTenantDto> => {
    const res = await apiClient.request<PlatformTenantResponse>(
      API_CONTRACTS.PLATFORM.TENANT_CREATE,
      {
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
};
