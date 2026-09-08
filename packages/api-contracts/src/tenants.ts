import { Type, type Static } from "@sinclair/typebox";

/**
 * Tenant contracts — shared between the Fastify API and the React Admin.
 *
 * A Tenant is an independent customer organization. A user has one identity and
 * may belong to many tenants via memberships. These DTOs describe only what is
 * safe to expose to the client; tenant isolation is enforced server-side
 * (MULTI-TENANT-ARCHITECTURE §31, §32).
 */

// Mirror of the Prisma enums (kept here so the Admin doesn't import server code).
export const TenantStatus = Type.Union([
  Type.Literal("TRIAL"),
  Type.Literal("ACTIVE"),
  Type.Literal("SUSPENDED"),
  Type.Literal("ARCHIVED"),
]);
export type TenantStatus = Static<typeof TenantStatus>;

export const MembershipStatus = Type.Union([
  Type.Literal("INVITED"),
  Type.Literal("ACTIVE"),
  Type.Literal("SUSPENDED"),
  Type.Literal("REMOVED"),
]);
export type MembershipStatus = Static<typeof MembershipStatus>;

/** Public tenant identity. Internal fields are never exposed. */
export const TenantDto = Type.Object({
  id: Type.String(),
  name: Type.String(),
  slug: Type.String(),
  status: TenantStatus,
});
export type TenantDto = Static<typeof TenantDto>;

/**
 * A tenant the current user belongs to, with the user's membership status.
 * Used to populate the Admin tenant switcher.
 */
export const TenantMembershipDto = Type.Object({
  tenant: TenantDto,
  membershipStatus: MembershipStatus,
});
export type TenantMembershipDto = Static<typeof TenantMembershipDto>;

// ── Response envelopes (legacy `{ success, data }` to match auth/users) ────────

export const CurrentTenantResponse = Type.Object({
  success: Type.Literal(true),
  data: TenantDto,
});
export type CurrentTenantResponse = Static<typeof CurrentTenantResponse>;

export const TenantMembershipsResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Array(TenantMembershipDto),
});
export type TenantMembershipsResponse = Static<
  typeof TenantMembershipsResponse
>;

// ── Tenant switch ──────────────────────────────────────────────────────────────

/**
 * Request to switch the active tenant. The server validates the user has an
 * ACTIVE membership in an ACTIVE tenant with this id, then issues a new access
 * token scoped to it (the client never asserts tenant access — §7.2, §29).
 */
export const SwitchTenantBody = Type.Object({
  tenantId: Type.String({ minLength: 1, maxLength: 64 }),
});
export type SwitchTenantBody = Static<typeof SwitchTenantBody>;

export const SwitchTenantResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Object({
    accessToken: Type.String(),
    tenant: TenantDto,
  }),
});
export type SwitchTenantResponse = Static<typeof SwitchTenantResponse>;
