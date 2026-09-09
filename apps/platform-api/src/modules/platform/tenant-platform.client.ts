import {
  TENANT_INTERNAL_ENDPOINTS,
  type AppBranding,
  type TenantRuntimeInfo,
  type UpdateTenantBrandingBody,
} from "@app/api-contracts";
import { AppError, ErrorCode } from "@core/errors/index.js";
import { assertSafeUrl } from "@core/security/ssrf.js";
import { withCircuitBreaker } from "@core/circuit-breaker.js";
import { CircuitOpenError } from "@core/errors/index.js";

/**
 * TenantPlatformClient — the outbound server-to-server (S2S) client the
 * Platform uses to reach a Tenant runtime's Tenant API (Phase 21 §11).
 *
 * Security & resilience (reuses existing platform building blocks):
 *   - assertSafeUrl (SSRF): the configured Tenant API base URL is validated
 *     before every call, defeating SSRF/DNS-rebinding to internal addresses.
 *   - withCircuitBreaker: outbound calls run through a per-service opossum
 *     breaker with an explicit AbortSignal timeout (§35). When the tenant is
 *     unreachable or the breaker is OPEN, the call fails fast.
 *   - The S2S secret is presented as a bearer token and NEVER logged or
 *     returned. The Platform is the CONSUMER of this secret (read from env).
 *   - Propagates the Platform request id as `x-request-id` for correlation (§34).
 *
 * The tenant identity is sent in `x-platform-tenant-id`; the Tenant API
 * validates it against the runtime's own identity and rejects cross-tenant
 * requests (§15). GET/PUT branding are idempotent/retry-safe (§33, §36).
 */

export interface TenantPlatformConnection {
  /** Tenant API base URL, e.g. "https://tenant.example.com". */
  baseUrl: string;
  /** Shared S2S bearer secret the Platform presents. */
  secret: string;
  /** Per-request timeout in ms. */
  timeoutMs: number;
  /** Allow http:// base URLs (local dev only). */
  allowHttp: boolean;
}

export interface TenantPlatformRequestContext {
  /** Platform tenant id this call targets (sent + validated by the tenant). */
  tenantId: string;
  /** Platform request id for cross-service correlation. */
  requestId?: string;
}

/** A 503 surfaced to the Platform caller when the Tenant API is unreachable. */
export class TenantUnreachableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 503, true, details, ErrorCode.SERVICE_UNAVAILABLE);
    this.name = "TenantUnreachableError";
  }
}

export class TenantPlatformClient {
  constructor(private readonly conn: TenantPlatformConnection) {}

  /** GET /internal/platform/health — throws TenantUnreachableError on failure. */
  async health(ctx: TenantPlatformRequestContext): Promise<{ status: "ok" }> {
    return this.request<{ status: "ok" }>(
      "GET",
      TENANT_INTERNAL_ENDPOINTS.HEALTH,
      ctx,
    );
  }

  /** GET /internal/platform/runtime. */
  async runtime(ctx: TenantPlatformRequestContext): Promise<TenantRuntimeInfo> {
    return this.request<TenantRuntimeInfo>(
      "GET",
      TENANT_INTERNAL_ENDPOINTS.RUNTIME,
      ctx,
    );
  }

  /** GET /internal/platform/branding — the tenant's canonical branding. */
  async getBranding(ctx: TenantPlatformRequestContext): Promise<AppBranding> {
    return this.request<AppBranding>(
      "GET",
      TENANT_INTERNAL_ENDPOINTS.BRANDING_GET,
      ctx,
    );
  }

  /** PUT /internal/platform/branding — partial update, returns canonical branding. */
  async updateBranding(
    ctx: TenantPlatformRequestContext,
    patch: UpdateTenantBrandingBody,
  ): Promise<AppBranding> {
    return this.request<AppBranding>(
      "PUT",
      TENANT_INTERNAL_ENDPOINTS.BRANDING_UPDATE,
      ctx,
      patch,
    );
  }

  /**
   * Perform an authenticated S2S request and unwrap the `{ data }` envelope.
   * Non-2xx tenant responses and transport failures are normalized:
   *   - connection/timeout/circuit-open → TenantUnreachableError (503)
   *   - tenant 4xx/5xx → AppError carrying the tenant's status + a safe message
   */
  private async request<T>(
    method: "GET" | "PUT",
    path: string,
    ctx: TenantPlatformRequestContext,
    body?: unknown,
  ): Promise<T> {
    const url = this.joinUrl(path);

    // SSRF validation before every outbound call. Allow http only in dev.
    await assertSafeUrl(url, {
      allowedProtocols: this.conn.allowHttp ? ["https:", "http:"] : ["https:"],
    });

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.conn.secret}`,
      "x-platform-tenant-id": ctx.tenantId,
      accept: "application/json",
    };
    if (ctx.requestId) headers["x-request-id"] = ctx.requestId;
    if (body !== undefined) headers["content-type"] = "application/json";

    // Route through the shared circuit breaker (now safe for parameterized
    // operations — it carries only circuit STATE, and the current request is
    // passed per call). The breaker enforces an explicit timeout via the
    // AbortSignal (§35). When OPEN, calls fail fast. Idempotent/retry-safe
    // (§33/§36). One breaker per Tenant API host so a failing tenant trips only
    // its own circuit.
    const service = `tenant-api:${this.conn.baseUrl}`;

    let response: { status: number; text: string };
    try {
      response = await withCircuitBreaker(
        service,
        async (signal) => {
          const res = await fetch(url, {
            method,
            headers,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            signal,
          });
          const text = await res.text();
          return { status: res.status, text };
        },
        { timeout: this.conn.timeoutMs },
      );
    } catch (err) {
      // Circuit open, timeout/abort, DNS/connection failure — the tenant is
      // unreachable. Never surface as a false success (§47).
      const detail =
        err instanceof CircuitOpenError
          ? "circuit open"
          : (err as Error)?.message;
      throw new TenantUnreachableError("The Tenant API could not be reached.", {
        cause: detail,
      });
    }

    if (response.status < 200 || response.status >= 300) {
      // Map the tenant's failure to a Platform-facing error. Auth/scope/tenant
      // failures from the tenant become a 502-class problem for the operator
      // (misconfiguration), reported as SERVICE_UNAVAILABLE rather than
      // leaking the tenant's raw error shape.
      throw new AppError(
        `Tenant API returned ${response.status}.`,
        response.status === 400 ? 400 : 502,
        true,
        undefined,
        response.status === 400
          ? ErrorCode.VALIDATION_ERROR
          : ErrorCode.SERVICE_UNAVAILABLE,
      );
    }

    const parsed = this.parseEnvelope<T>(response.text);
    return parsed;
  }

  private parseEnvelope<T>(text: string): T {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new TenantUnreachableError(
        "The Tenant API returned a non-JSON response.",
      );
    }
    if (
      typeof json === "object" &&
      json !== null &&
      "data" in (json as Record<string, unknown>)
    ) {
      return (json as { data: T }).data;
    }
    throw new TenantUnreachableError(
      "The Tenant API response was missing the expected envelope.",
    );
  }

  /** Join the base URL and an absolute API path without duplicate slashes. */
  private joinUrl(path: string): string {
    const base = this.conn.baseUrl.replace(/\/+$/, "");
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
  }
}
