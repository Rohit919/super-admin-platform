import type { PrismaClient } from "@prisma/client";
import type {
  AppBranding,
  TenantConnectionStatus,
  UpdateTenantBrandingBody,
} from "@app/api-contracts";
import { NotFoundError, AppError, ErrorCode } from "@core/errors/index.js";
import { AuditService, AuditActions } from "@core/audit/index.js";
import type { Env } from "../../config/env.js";
import type { AuditContext } from "./platform.service.js";
import {
  TenantPlatformClient,
  TenantUnreachableError,
  type TenantPlatformConnection,
} from "./tenant-platform.client.js";

/**
 * TenantPlatformService — the Platform-side orchestration for the Phase 21
 * control-plane connection. It:
 *   - validates the tenant exists (platform is the authorized cross-tenant
 *     surface; a missing tenant is a 404),
 *   - resolves the S2S connection for that tenant from config (secret from env,
 *     never the DB / browser),
 *   - delegates to the TenantPlatformClient,
 *   - audits branding writes (changed field NAMES only — never values/secrets).
 *
 * Connection resolution: this reference deployment models ONE tenant runtime
 * via TENANT_API_* env. `resolveConnection` maps any platform tenantId to that
 * single connection. A multi-runtime deployment would look up a per-tenant
 * base URL + secret from the secrets provider here — the call sites do not
 * change. When the connection is unconfigured the service returns
 * SERVICE_UNAVAILABLE rather than faking success (§47).
 */
export class TenantPlatformService {
  private readonly audit: AuditService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {
    this.audit = new AuditService(prisma);
  }

  /** Assert the tenant exists (404 otherwise). Platform-authorized lookup. */
  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundError("Tenant not found");
  }

  /**
   * Resolve the S2S connection for a tenant. Throws SERVICE_UNAVAILABLE when the
   * Tenant API connection is not configured (integration disabled).
   */
  private resolveConnection(_tenantId: string): TenantPlatformConnection {
    const baseUrl = this.env.TENANT_API_BASE_URL;
    const secret = this.env.TENANT_API_S2S_SECRET;
    if (!baseUrl || !secret) {
      throw new AppError(
        "Tenant API connection is not configured.",
        503,
        true,
        undefined,
        ErrorCode.SERVICE_UNAVAILABLE,
      );
    }
    return {
      baseUrl,
      secret,
      timeoutMs: this.env.TENANT_API_TIMEOUT_MS,
      allowHttp: this.env.TENANT_API_ALLOW_HTTP,
    };
  }

  private client(tenantId: string): TenantPlatformClient {
    return new TenantPlatformClient(this.resolveConnection(tenantId));
  }

  /**
   * Report the tenant runtime's connection status. NEVER throws on an
   * unreachable tenant — it returns `reachable:false` with a safe detail so the
   * UI shows a clear connection failure (§47). A missing tenant is still a 404,
   * and an unconfigured connection is still SERVICE_UNAVAILABLE.
   */
  async getConnectionStatus(
    tenantId: string,
    requestId?: string,
  ): Promise<TenantConnectionStatus> {
    await this.assertTenantExists(tenantId);
    const client = this.client(tenantId);
    try {
      const runtime = await client.runtime({ tenantId, requestId });
      return {
        tenantId,
        reachable: true,
        status: runtime.status,
        environment: runtime.environment,
        ...(runtime.version ? { version: runtime.version } : {}),
      };
    } catch (err) {
      if (err instanceof TenantUnreachableError) {
        return {
          tenantId,
          reachable: false,
          detail: "The Tenant API could not be reached.",
        };
      }
      throw err;
    }
  }

  /** Read the tenant's persisted branding via the Tenant API. */
  async getBranding(
    tenantId: string,
    requestId?: string,
  ): Promise<AppBranding> {
    await this.assertTenantExists(tenantId);
    return this.client(tenantId).getBranding({ tenantId, requestId });
  }

  /**
   * Update the tenant's branding via the Tenant API (partial), then audit.
   * The Platform validated the body at the contract boundary; the Tenant API
   * re-validates and is the authority for its own persisted state (§24).
   */
  async updateBranding(
    tenantId: string,
    patch: UpdateTenantBrandingBody,
    auditCtx: AuditContext,
    requestId?: string,
  ): Promise<AppBranding> {
    await this.assertTenantExists(tenantId);
    const branding = await this.client(tenantId).updateBranding(
      { tenantId, requestId },
      patch,
    );

    await this.audit.record({
      ...auditCtx,
      action: AuditActions.TenantBrandingUpdated,
      tenantId,
      targetType: "TENANT_BRANDING",
      targetId: tenantId,
      // Changed field NAMES only — never values (may be large) or secrets (§32).
      metadata: { changedFields: Object.keys(patch) },
    });

    return branding;
  }
}
