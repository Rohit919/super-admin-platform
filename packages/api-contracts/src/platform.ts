import { Type, type Static } from "@sinclair/typebox";
import { TenantStatus } from "./tenants.js";
import { OffsetPageMeta, PAGINATION_DEFAULTS } from "./common.js";

/**
 * Platform (Super Admin) contracts — shared between the Fastify API and the
 * Super Admin app (apps/super-admin). These govern the PLATFORM itself, not any
 * single tenant. Every platform endpoint is gated by an ACTIVE PlatformMembership
 * + a platform.* permission (MULTI-TENANT-ARCHITECTURE §57, §113).
 */

// ── Tenant (platform view) ───────────────────────────────────────────────────
// Richer than the tenant-facing TenantDto: the platform sees operational
// metadata like member count and timestamps.
export const PlatformTenantDto = Type.Object({
  id: Type.String(),
  name: Type.String(),
  slug: Type.String(),
  status: TenantStatus,
  memberCount: Type.Integer({ minimum: 0 }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type PlatformTenantDto = Static<typeof PlatformTenantDto>;

export const PlatformTenantResponse = Type.Object({
  success: Type.Literal(true),
  data: PlatformTenantDto,
});
export type PlatformTenantResponse = Static<typeof PlatformTenantResponse>;

// ── Tenant Control Center overview (platform.tenant.view) ─────────────────────
// A deep, REAL aggregate for the Super Admin Tenant Control Center. Every field
// is derived from existing tables (Tenant, TenantMembership → User,
// TenantApiCredential, TenantPlan → Plan, TenantEntitlementOverride). It does
// NOT invent usage/metering/branding/integration/provisioning data — those are
// documented capability gaps (docs/PHASE-19-TENANT-CONTROL-CENTER.md), not faked
// here. Loading this is a separate call from the lean tenant list so the list
// stays fast; the detail page fetches it once.

/** The tenant's primary administrator (oldest ACTIVE membership), if any. */
export const TenantPrimaryAdminDto = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
  // ISO timestamp the admin joined the tenant (membership.createdAt).
  since: Type.String(),
});
export type TenantPrimaryAdminDto = Static<typeof TenantPrimaryAdminDto>;

/** Real member counts by membership status. */
export const TenantMemberBreakdown = Type.Object({
  total: Type.Integer({ minimum: 0 }),
  active: Type.Integer({ minimum: 0 }),
  invited: Type.Integer({ minimum: 0 }),
  suspended: Type.Integer({ minimum: 0 }),
});
export type TenantMemberBreakdown = Static<typeof TenantMemberBreakdown>;

/**
 * Real credential health. `expired` counts ACTIVE credentials whose expiresAt is
 * in the past (an operational signal, computed server-side against `now`).
 */
export const TenantCredentialBreakdown = Type.Object({
  total: Type.Integer({ minimum: 0 }),
  active: Type.Integer({ minimum: 0 }),
  revoked: Type.Integer({ minimum: 0 }),
  expired: Type.Integer({ minimum: 0 }),
});
export type TenantCredentialBreakdown = Static<
  typeof TenantCredentialBreakdown
>;

/** The tenant's plan summary + entitlement/override counts (real). */
export const TenantPlanSummary = Type.Object({
  key: Type.String(),
  name: Type.String(),
  assignedAt: Type.String(),
  // Number of entitlements resolved for the tenant (plan + overrides).
  entitlementCount: Type.Integer({ minimum: 0 }),
  // Number of per-tenant overrides in effect.
  overrideCount: Type.Integer({ minimum: 0 }),
});
export type TenantPlanSummary = Static<typeof TenantPlanSummary>;

/**
 * Deep tenant overview aggregate for the Control Center. All fields are REAL.
 * `plan` and `primaryAdmin` are null when the tenant has none.
 */
export const PlatformTenantOverviewDto = Type.Object({
  id: Type.String(),
  name: Type.String(),
  slug: Type.String(),
  status: TenantStatus,
  createdAt: Type.String(),
  updatedAt: Type.String(),
  primaryAdmin: Type.Union([TenantPrimaryAdminDto, Type.Null()]),
  members: TenantMemberBreakdown,
  credentials: TenantCredentialBreakdown,
  plan: Type.Union([TenantPlanSummary, Type.Null()]),
});
export type PlatformTenantOverviewDto = Static<
  typeof PlatformTenantOverviewDto
>;

export const PlatformTenantOverviewResponse = Type.Object({
  success: Type.Literal(true),
  data: PlatformTenantOverviewDto,
});
export type PlatformTenantOverviewResponse = Static<
  typeof PlatformTenantOverviewResponse
>;

/**
 * Tenant list query. `status` filters by lifecycle state; `q` is a
 * case-insensitive substring match against tenant name OR slug; `page`/
 * `pageSize` drive backend (authoritative) offset pagination. All optional —
 * an empty query returns the first page of all tenants (back-compatible).
 */
export const PlatformTenantListQuery = Type.Object({
  status: Type.Optional(TenantStatus),
  q: Type.Optional(Type.String({ maxLength: 120 })),
  page: Type.Optional(
    Type.Integer({ minimum: 1, default: PAGINATION_DEFAULTS.page }),
  ),
  pageSize: Type.Optional(
    Type.Integer({
      minimum: PAGINATION_DEFAULTS.minPageSize,
      maximum: PAGINATION_DEFAULTS.maxPageSize,
      default: PAGINATION_DEFAULTS.pageSize,
    }),
  ),
});
export type PlatformTenantListQuery = Static<typeof PlatformTenantListQuery>;

/**
 * Paginated tenant list. Keeps the legacy `{ success, data }` envelope for
 * consistency with the other platform collections, and adds offset pagination
 * `meta` so the client can render a pager. Backend pagination is authoritative
 * (no client-side loading of the entire population).
 */
export const PlatformTenantPageResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Array(PlatformTenantDto),
  meta: OffsetPageMeta,
});
export type PlatformTenantPageResponse = Static<
  typeof PlatformTenantPageResponse
>;

// ── Tenant metadata edit (platform.tenant.update) ─────────────────────────────
// Edit platform-level tenant METADATA only. The slug is the tenant's stable,
// externally-referenced identity and is intentionally NOT editable here to avoid
// breaking existing references (MULTI-TENANT-ARCHITECTURE §133). Lifecycle status
// is changed via the dedicated status endpoint, not this one.
export const UpdateTenantBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
});
export type UpdateTenantBody = Static<typeof UpdateTenantBody>;

// ── Tenant organization profile (Phase 20) ───────────────────────────────────
// Platform-level tenant METADATA: organization identity, registered/billing
// address, and a business contact. Every field is nullable — a tenant may have
// none set. This is NOT tenant operational data (no logistics/warehouse/delivery
// locations). Read is gated by platform.tenant.view; edit by platform.tenant.update.
// The canonical id and stable slug are NOT part of this profile (identity is
// immutable / edited elsewhere), so they cannot be changed via this surface.
export const TenantOrganizationDto = Type.Object({
  // Echoed for context; not editable through the organization endpoint.
  id: Type.String(),
  name: Type.String(),
  slug: Type.String(),

  // Organization identity.
  legalName: Type.Union([Type.String(), Type.Null()]),
  website: Type.Union([Type.String(), Type.Null()]),
  industry: Type.Union([Type.String(), Type.Null()]),
  description: Type.Union([Type.String(), Type.Null()]),
  timeZone: Type.Union([Type.String(), Type.Null()]),
  locale: Type.Union([Type.String(), Type.Null()]),

  // Registered / billing address (NOT an operational location).
  addressLine1: Type.Union([Type.String(), Type.Null()]),
  addressLine2: Type.Union([Type.String(), Type.Null()]),
  city: Type.Union([Type.String(), Type.Null()]),
  region: Type.Union([Type.String(), Type.Null()]),
  postalCode: Type.Union([Type.String(), Type.Null()]),
  country: Type.Union([Type.String(), Type.Null()]),

  // Business contact (distinct from the tenant's platform admin identity).
  contactName: Type.Union([Type.String(), Type.Null()]),
  contactEmail: Type.Union([Type.String(), Type.Null()]),
  contactPhone: Type.Union([Type.String(), Type.Null()]),
});
export type TenantOrganizationDto = Static<typeof TenantOrganizationDto>;

export const TenantOrganizationResponse = Type.Object({
  success: Type.Literal(true),
  data: TenantOrganizationDto,
});
export type TenantOrganizationResponse = Static<
  typeof TenantOrganizationResponse
>;

/**
 * Update the tenant organization profile (platform.tenant.update). Every field
 * is OPTIONAL — only provided keys are updated (partial update). A key set to an
 * empty string is treated as "clear" (stored as NULL); an omitted key is left
 * unchanged. `website` and `country` are format-constrained so a malformed value
 * cannot be persisted. No identity fields (id/slug/name) are editable here — the
 * display name has its own dedicated endpoint (`PATCH /tenants/:id`).
 */
export const UpdateTenantOrganizationBody = Type.Object({
  legalName: Type.Optional(Type.String({ maxLength: 200 })),
  // Permissive but bounded; the service further validates it is http(s) when set.
  website: Type.Optional(Type.String({ maxLength: 255 })),
  industry: Type.Optional(Type.String({ maxLength: 120 })),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  // IANA tz id / BCP-47 locale — bounded strings; the client offers safe pickers.
  timeZone: Type.Optional(Type.String({ maxLength: 64 })),
  locale: Type.Optional(Type.String({ maxLength: 35 })),

  addressLine1: Type.Optional(Type.String({ maxLength: 200 })),
  addressLine2: Type.Optional(Type.String({ maxLength: 200 })),
  city: Type.Optional(Type.String({ maxLength: 120 })),
  region: Type.Optional(Type.String({ maxLength: 120 })),
  postalCode: Type.Optional(Type.String({ maxLength: 32 })),
  // ISO-3166 alpha-2 (2 letters) or empty to clear.
  country: Type.Optional(Type.String({ maxLength: 2 })),

  contactName: Type.Optional(Type.String({ maxLength: 120 })),
  // Bounded; the service validates it is a well-formed email when non-empty.
  contactEmail: Type.Optional(Type.String({ maxLength: 255 })),
  contactPhone: Type.Optional(Type.String({ maxLength: 40 })),
});
export type UpdateTenantOrganizationBody = Static<
  typeof UpdateTenantOrganizationBody
>;

// ── Tenant provisioning ──────────────────────────────────────────────────────
// One controlled workflow: create the tenant + its first admin user +
// membership + default tenant roles (MULTI-TENANT-ARCHITECTURE §43).
export const CreateTenantBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  slug: Type.String({
    minLength: 2,
    maxLength: 64,
    // URL-safe slug: lowercase letters, digits, hyphens.
    pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  }),
  adminEmail: Type.String({ format: "email", maxLength: 255 }),
  adminName: Type.String({ minLength: 1, maxLength: 120 }),
  adminPassword: Type.String({ minLength: 12, maxLength: 200 }),
});
export type CreateTenantBody = Static<typeof CreateTenantBody>;

// ── Tenant status change (suspend / reactivate / archive) ─────────────────────
export const UpdateTenantStatusBody = Type.Object({
  status: TenantStatus,
});
export type UpdateTenantStatusBody = Static<typeof UpdateTenantStatusBody>;

// ── Platform dashboard stats ─────────────────────────────────────────────────
// A SaaS control-plane overview. Every field is derived from existing platform
// tables (tenants, users, platform memberships, tenant API credentials) — no
// fabricated or tenant-operational (logistics) data. Capabilities that don't
// exist yet (plans, entitlements, feature flags, provisioning status, dedicated
// security events) are intentionally absent until their features land.
export const PlatformDashboardStats = Type.Object({
  totalTenants: Type.Integer({ minimum: 0 }),
  activeTenants: Type.Integer({ minimum: 0 }),
  trialTenants: Type.Integer({ minimum: 0 }),
  suspendedTenants: Type.Integer({ minimum: 0 }),
  archivedTenants: Type.Integer({ minimum: 0 }),
  // Every user identity on the platform.
  totalUsers: Type.Integer({ minimum: 0 }),
  // Users with a platform membership (Super Admin operators), distinct from the
  // total identity count above.
  platformUsers: Type.Integer({ minimum: 0 }),
  // Tenant API credentials currently in the ACTIVE state.
  activeApiCredentials: Type.Integer({ minimum: 0 }),
  // The most recently created tenants (compact), for an at-a-glance activity
  // sense on the control-center overview.
  recentTenants: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      slug: Type.String(),
      status: TenantStatus,
      createdAt: Type.String(),
    }),
  ),
});
export type PlatformDashboardStats = Static<typeof PlatformDashboardStats>;

export const PlatformDashboardResponse = Type.Object({
  success: Type.Literal(true),
  data: PlatformDashboardStats,
});
export type PlatformDashboardResponse = Static<
  typeof PlatformDashboardResponse
>;

// ── Platform users (users with a platform membership) ─────────────────────────
export const PlatformUserDto = Type.Object({
  id: Type.String(),
  email: Type.String(),
  name: Type.String(),
  membershipStatus: Type.Union([
    Type.Literal("INVITED"),
    Type.Literal("ACTIVE"),
    Type.Literal("SUSPENDED"),
    Type.Literal("REMOVED"),
  ]),
  roles: Type.Array(Type.String()),
  createdAt: Type.String(),
});
export type PlatformUserDto = Static<typeof PlatformUserDto>;

export const PlatformUserListResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Array(PlatformUserDto),
});
export type PlatformUserListResponse = Static<typeof PlatformUserListResponse>;

// ── Tenant API credentials ────────────────────────────────────────────────────
// Platform-managed credentials issued to a tenant. The SECRET is never present
// in these DTOs except in the one-time creation/rotation response below.
export const CredentialStatus = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("REVOKED"),
]);
export type CredentialStatus = Static<typeof CredentialStatus>;

/** Safe credential view — NEVER includes the secret. Used by list/get. */
export const TenantApiCredentialDto = Type.Object({
  id: Type.String(),
  tenantId: Type.String(),
  name: Type.Union([Type.String(), Type.Null()]),
  publicKey: Type.String(),
  status: CredentialStatus,
  lastUsedAt: Type.Union([Type.String(), Type.Null()]),
  expiresAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  revokedAt: Type.Union([Type.String(), Type.Null()]),
});
export type TenantApiCredentialDto = Static<typeof TenantApiCredentialDto>;

export const TenantApiCredentialListResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Array(TenantApiCredentialDto),
});
export type TenantApiCredentialListResponse = Static<
  typeof TenantApiCredentialListResponse
>;

/**
 * One-time creation/rotation response. This is the ONLY place the plaintext
 * `secretKey` is ever returned — it cannot be retrieved again afterward.
 */
export const CreatedTenantApiCredentialResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Intersect([
    TenantApiCredentialDto,
    Type.Object({
      // Plaintext secret — shown once. Store it securely now; it is not recoverable.
      secretKey: Type.String(),
    }),
  ]),
});
export type CreatedTenantApiCredentialResponse = Static<
  typeof CreatedTenantApiCredentialResponse
>;

/** Optional label + expiry for a new credential. */
export const CreateTenantApiCredentialBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  // ISO date-time; when present the credential is considered expired afterward.
  expiresAt: Type.Optional(Type.String({ format: "date-time" })),
});
export type CreateTenantApiCredentialBody = Static<
  typeof CreateTenantApiCredentialBody
>;

export const TenantApiCredentialResponse = Type.Object({
  success: Type.Literal(true),
  data: TenantApiCredentialDto,
});
export type TenantApiCredentialResponse = Static<
  typeof TenantApiCredentialResponse
>;

// ── Platform audit log ────────────────────────────────────────────────────────
// Read-only view of platform audit events. Metadata never contains secrets.
export const PlatformAuditLogDto = Type.Object({
  id: Type.String(),
  action: Type.String(),
  tenantId: Type.Union([Type.String(), Type.Null()]),
  actorId: Type.Union([Type.String(), Type.Null()]),
  targetType: Type.Union([Type.String(), Type.Null()]),
  targetId: Type.Union([Type.String(), Type.Null()]),
  metadata: Type.Union([
    Type.Record(Type.String(), Type.Unknown()),
    Type.Null(),
  ]),
  requestId: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
});
export type PlatformAuditLogDto = Static<typeof PlatformAuditLogDto>;

export const PlatformAuditLogListResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Array(PlatformAuditLogDto),
});
export type PlatformAuditLogListResponse = Static<
  typeof PlatformAuditLogListResponse
>;

/** Optional filters for the audit list (tenant, action, page size). */
export const PlatformAuditLogQuery = Type.Object({
  tenantId: Type.Optional(Type.String()),
  action: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
});
export type PlatformAuditLogQuery = Static<typeof PlatformAuditLogQuery>;

// ── Plans & Entitlements (Phase 19.6) ─────────────────────────────────────────
// Non-commercial capability model. No pricing/billing fields — a Plan is a named
// bundle of entitlement values; a Tenant has at most one active plan plus
// optional per-tenant overrides.
export const EntitlementValueType = Type.Union([
  Type.Literal("BOOLEAN"),
  Type.Literal("NUMERIC"),
  Type.Literal("STRING"),
]);
export type EntitlementValueType = Static<typeof EntitlementValueType>;

/** One entitlement value within a plan. */
export const PlanEntitlementDto = Type.Object({
  key: Type.String(),
  name: Type.String(),
  valueType: EntitlementValueType,
  value: Type.String(),
});
export type PlanEntitlementDto = Static<typeof PlanEntitlementDto>;

export const PlanDto = Type.Object({
  id: Type.String(),
  key: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  isSystem: Type.Boolean(),
  entitlements: Type.Array(PlanEntitlementDto),
  createdAt: Type.String(),
});
export type PlanDto = Static<typeof PlanDto>;

export const PlanListResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Array(PlanDto),
});
export type PlanListResponse = Static<typeof PlanListResponse>;

/** Assign an existing plan to a tenant (by plan key). */
export const AssignTenantPlanBody = Type.Object({
  planKey: Type.String({ minLength: 1, maxLength: 64 }),
});
export type AssignTenantPlanBody = Static<typeof AssignTenantPlanBody>;

/**
 * A tenant's EFFECTIVE entitlement: the plan value, optionally replaced by a
 * per-tenant override. `source` tells the operator where the value came from.
 */
export const TenantEntitlementDto = Type.Object({
  key: Type.String(),
  name: Type.String(),
  valueType: EntitlementValueType,
  value: Type.String(),
  source: Type.Union([Type.Literal("PLAN"), Type.Literal("OVERRIDE")]),
});
export type TenantEntitlementDto = Static<typeof TenantEntitlementDto>;

export const TenantEntitlementsResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Object({
    tenantId: Type.String(),
    plan: Type.Union([
      Type.Object({ key: Type.String(), name: Type.String() }),
      Type.Null(),
    ]),
    entitlements: Type.Array(TenantEntitlementDto),
  }),
});
export type TenantEntitlementsResponse = Static<
  typeof TenantEntitlementsResponse
>;

/**
 * Set or clear a per-tenant override for one entitlement. `value: null` clears
 * the override (falls back to the plan value).
 */
export const SetTenantEntitlementOverrideBody = Type.Object({
  value: Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
});
export type SetTenantEntitlementOverrideBody = Static<
  typeof SetTenantEntitlementOverrideBody
>;
