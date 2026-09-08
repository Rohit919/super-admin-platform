/**
 * Tenant resolution & context — barrel.
 * Import from '@core/tenant' anywhere in the codebase.
 */
export { TenantService } from "./tenant.service.js";
export {
  registerTenantResolutionHook,
  requireTenant,
  TENANT_HEADER,
} from "./resolve-tenant.hook.js";
export { getTenantDb, type TenantDb } from "./tenant-db.js";
export {
  TENANT_OWNED_MODELS,
  isTenantOwnedModel,
  type TenantOwnedModel,
} from "./tenant-models.js";
export {
  assertTenantScoped,
  assertTenantScopedFor,
} from "./tenant-scope-assertion.js";
export {
  assertSameTenant,
  type TenantOwnedRef,
} from "./tenant-relationship-guard.js";
export type { TenantContext } from "./tenant.types.js";
