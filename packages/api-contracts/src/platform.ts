import { Type, type Static } from "@sinclair/typebox";
import { TenantStatus } from "./tenants.js";

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

export const PlatformTenantListResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Array(PlatformTenantDto),
});
export type PlatformTenantListResponse = Static<
  typeof PlatformTenantListResponse
>;

export const PlatformTenantResponse = Type.Object({
  success: Type.Literal(true),
  data: PlatformTenantDto,
});
export type PlatformTenantResponse = Static<typeof PlatformTenantResponse>;

/** Optional status filter for the tenant list. */
export const PlatformTenantListQuery = Type.Object({
  status: Type.Optional(TenantStatus),
});
export type PlatformTenantListQuery = Static<typeof PlatformTenantListQuery>;

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
export const PlatformDashboardStats = Type.Object({
  totalTenants: Type.Integer({ minimum: 0 }),
  activeTenants: Type.Integer({ minimum: 0 }),
  trialTenants: Type.Integer({ minimum: 0 }),
  suspendedTenants: Type.Integer({ minimum: 0 }),
  archivedTenants: Type.Integer({ minimum: 0 }),
  totalUsers: Type.Integer({ minimum: 0 }),
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
