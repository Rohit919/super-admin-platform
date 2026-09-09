import { Type, type Static } from "@sinclair/typebox";
import { DataEnvelope } from "./common.js";
import { AppBranding } from "./branding.js";

/**
 * Platform → Tenant control-plane contracts (Phase 21).
 *
 * The Super Admin Platform manages a tenant's PERSISTED branding and inspects
 * its runtime through the Platform API, which in turn calls the Tenant API over
 * authenticated server-to-server (S2S). These DTOs are the Platform-facing wire
 * shapes; the branding shape is the SAME shared AppBranding contract used
 * everywhere so the two applications can never drift (§30).
 */

/**
 * Partial branding update accepted from the Super Admin UI. Every field is
 * optional; omitted fields leave the persisted tenant value unchanged. `colors`
 * and `metadata`, when supplied, replace that whole sub-object (not deep
 * merged) — mirrors the Tenant API's UpdateBrandingBody semantics.
 */
export const UpdateTenantBrandingBody = Type.Partial(AppBranding);
export type UpdateTenantBrandingBody = Static<typeof UpdateTenantBrandingBody>;

/** `{ data: AppBranding }` — the canonical tenant branding returned to the UI. */
export const TenantBrandingResponse = DataEnvelope(AppBranding);
export type TenantBrandingResponse = Static<typeof TenantBrandingResponse>;

/**
 * Connection/runtime status the Platform shows for a tenant runtime. Reflects
 * the result of reaching the Tenant API over S2S. `reachable=false` means the
 * Platform could not talk to the Tenant API (§47 — never silently "healthy").
 */
export const TenantConnectionStatus = Type.Object({
  tenantId: Type.String(),
  /** Whether the Platform successfully reached the Tenant API. */
  reachable: Type.Boolean(),
  /** Tenant-reported coarse runtime status, when reachable. */
  status: Type.Optional(
    Type.Union([Type.Literal("ready"), Type.Literal("degraded")]),
  ),
  environment: Type.Optional(Type.String()),
  version: Type.Optional(Type.String()),
  /** Non-sensitive reason when unreachable (e.g. "connection failed"). */
  detail: Type.Optional(Type.String()),
});
export type TenantConnectionStatus = Static<typeof TenantConnectionStatus>;

export const TenantConnectionStatusResponse = DataEnvelope(
  TenantConnectionStatus,
);
export type TenantConnectionStatusResponse = Static<
  typeof TenantConnectionStatusResponse
>;

/**
 * Runtime metadata the Tenant API reports over S2S (mirror of the Tenant API's
 * PlatformRuntime contract). Defined here because the Platform and Tenant apps
 * have SEPARATE api-contracts packages; this is the Platform-side view of the
 * tenant's wire shape. Keep the two in sync (documented in the Phase 21 report).
 */
export const TenantRuntimeInfo = Type.Object({
  tenantId: Type.String(),
  status: Type.Union([Type.Literal("ready"), Type.Literal("degraded")]),
  environment: Type.String(),
  version: Type.Optional(Type.String()),
});
export type TenantRuntimeInfo = Static<typeof TenantRuntimeInfo>;

/**
 * The Tenant API's internal platform endpoint PATHS, as the Platform must call
 * them. Mirror of the Tenant repo's PLATFORM_INTERNAL_ENDPOINTS. These are
 * appended to the configured Tenant API base URL by the TenantPlatformClient.
 */
export const TENANT_INTERNAL_ENDPOINTS = {
  HEALTH: "/api/v1/internal/platform/health",
  RUNTIME: "/api/v1/internal/platform/runtime",
  BRANDING_GET: "/api/v1/internal/platform/branding",
  BRANDING_UPDATE: "/api/v1/internal/platform/branding",
} as const;
