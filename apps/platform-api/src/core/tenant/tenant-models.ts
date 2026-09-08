/**
 * Allow-list of TENANT-OWNED Prisma models (by Prisma model name).
 *
 * Only models listed here are subject to tenant-scoping expectations. This is
 * an explicit allow-list — NOT "every model is tenant-owned" — because most
 * models are platform-owned or identity-layer (User, RefreshToken, Permission,
 * Tenant, TenantMembership, …) and must NOT be tenant-filtered
 * (MULTI-TENANT-ARCHITECTURE §18-19).
 *
 * Add a model here deliberately when it gains a `tenantId` column and is meant
 * to be isolated per tenant.
 *
 * NOTE on RBAC models: Role / UserRole also carry tenantId, but their tenant
 * scoping is enforced explicitly in AuthorizationService (RBAC plane), not via
 * the data-plane accessor below. They are intentionally NOT in this list so the
 * dev assertion doesn't fire on the authorization service's own OR-scoped
 * queries.
 */
// NOTE: AuditLog is intentionally NOT here. Audit events legitimately span both
// platform-level (tenantId null, e.g. tenant provisioning) and tenant-level
// events (§41), so tenantId is OPTIONAL on audit writes and enforcing it would
// be wrong. Audit tenant-scoping is applied explicitly where a tenant context
// exists (via AuditService), not by this data-plane assertion.
// Currently EMPTY: no tenant-owned data-plane model exists yet. Tenant-owned
// models are added here deliberately as they are introduced — at which point
// the dev assertion and tenant-scoped accessor begin enforcing them.
//
// The tenant-scoping infrastructure (getTenantDb accessor, assertTenantScoped
// dev guard, assertSameTenant relationship guard) is fully implemented and
// unit-tested; this list is the single switch that opts a model into it.
export const TENANT_OWNED_MODELS = [] as const satisfies readonly string[];

export type TenantOwnedModel = (typeof TENANT_OWNED_MODELS)[number];

const TENANT_OWNED_SET: ReadonlySet<string> = new Set(TENANT_OWNED_MODELS);

/** True if the given Prisma model name is a tenant-owned model. */
export function isTenantOwnedModel(model: string | undefined): boolean {
  return model !== undefined && TENANT_OWNED_SET.has(model);
}
