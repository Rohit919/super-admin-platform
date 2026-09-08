import { isTenantOwnedModel } from "./tenant-models.js";

/**
 * Development/test guard that DETECTS missing tenant scope on tenant-owned
 * Prisma operations. It never modifies queries and never runs in production —
 * it exists to catch a developer forgetting to go through the tenant-scoped
 * accessor (MULTI-TENANT-ARCHITECTURE §21, §59).
 *
 * Philosophy: explicit, not magic. In production the app relies on the
 * tenant-scoped accessor + tests, NOT on implicit filtering.
 */

// Operations whose args carry a filter `where` that must include tenantId.
const WHERE_SCOPED_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

// Unique-selector operations that CANNOT be safely tenant-scoped (the unique
// `where` is an id or composite that may not include tenantId). Callers must
// use the findFirst/updateMany equivalents with tenantId instead (§21).
const UNSAFE_UNIQUE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
]);

function hasTenantId(obj: unknown): boolean {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "tenantId" in obj &&
    (obj as { tenantId?: unknown }).tenantId != null
  );
}

/**
 * Throws a descriptive error when a tenant-owned model operation lacks tenant
 * scope. Returns silently for platform models, unscoped-safe ops, and correctly
 * scoped operations. Intended to be called ONLY in development/test.
 */
export function assertTenantScoped(
  model: string | undefined,
  operation: string,
  args: unknown,
): void {
  if (model === undefined || !isTenantOwnedModel(model)) return;
  assertTenantScopedFor(model, operation, args);
}

/**
 * Same checks as {@link assertTenantScoped} but assumes `model` is already known
 * to be tenant-owned. Exposed so the operation-shape logic can be unit-tested
 * independently of the live TENANT_OWNED_MODELS allow-list.
 */
export function assertTenantScopedFor(
  model: string,
  operation: string,
  args: unknown,
): void {
  const a = (args ?? {}) as Record<string, unknown>;

  // create: data.tenantId required.
  if (operation === "create") {
    if (!hasTenantId(a.data)) {
      throw new Error(
        tenantScopeError(model, operation, "data.tenantId is missing"),
      );
    }
    return;
  }

  // createMany: every row must carry tenantId.
  if (operation === "createMany") {
    const data = a.data;
    const rows = Array.isArray(data) ? data : [data];
    if (!rows.every((row) => hasTenantId(row))) {
      throw new Error(
        tenantScopeError(
          model,
          operation,
          "every data row must include tenantId",
        ),
      );
    }
    return;
  }

  // upsert: the created row must carry tenantId, and the filter must too.
  if (operation === "upsert") {
    if (!hasTenantId(a.create) || !hasTenantId(a.where)) {
      throw new Error(
        tenantScopeError(
          model,
          operation,
          "both where.tenantId and create.tenantId are required",
        ),
      );
    }
    return;
  }

  // where-scoped ops: where.tenantId required.
  if (WHERE_SCOPED_OPS.has(operation)) {
    if (!hasTenantId(a.where)) {
      throw new Error(
        tenantScopeError(model, operation, "where.tenantId is missing"),
      );
    }
    return;
  }

  // Unique-selector ops cannot be tenant-scoped safely — steer to findFirst.
  if (UNSAFE_UNIQUE_OPS.has(operation)) {
    throw new Error(
      tenantScopeError(
        model,
        operation,
        `use the tenant-scoped accessor (findFirst/updateMany with tenantId) instead of ${operation} by unique id — a unique lookup can leak across tenants (§21)`,
      ),
    );
  }

  // Any other operation on a tenant-owned model is unexpected — surface it.
  throw new Error(
    tenantScopeError(
      model,
      operation,
      "operation is not recognised as tenant-scoped",
    ),
  );
}

function tenantScopeError(
  model: string,
  operation: string,
  detail: string,
): string {
  return (
    `Tenant-scope violation: ${model}.${operation} — ${detail}. ` +
    `Tenant-owned models must be accessed through the tenant-scoped accessor ` +
    `(request.tenantDb / getTenantDb). This check runs in development/test only.`
  );
}
