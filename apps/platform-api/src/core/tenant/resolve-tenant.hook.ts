import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { TenantService } from "./tenant.service.js";
import { getTenantDb, type TenantDb } from "./tenant-db.js";
import { TenantRequiredError } from "@core/errors/index.js";
// Side-effect import: brings the `request.tenant` module augmentation into scope.
import "./tenant.types.js";

/**
 * Header a client may send to operate within (or switch to) a specific tenant.
 * It is ALWAYS validated against the user's membership — it is not an
 * authorization mechanism, only a selection hint (MULTI-TENANT §7.2, §29, §30).
 */
export const TENANT_HEADER = "x-tenant-id";

/**
 * Registers a global preHandler that resolves and validates the active tenant
 * for authenticated requests, attaching `request.tenant`.
 *
 * Resolution precedence for the *candidate* tenant id:
 *   1. `X-Tenant-Id` request header (an explicit switch), else
 *   2. the `tenantId` claim carried in the JWT.
 * The candidate is then validated by TenantService against the user's
 * membership + tenant status. Invalid candidates throw a tenant error.
 *
 * This hook is intentionally NON-REQUIRING: a request with no candidate tenant
 * (platform-only identity, or a route that doesn't need a tenant) simply gets
 * no `request.tenant`. Routes that require one use {@link requireTenant}.
 *
 * Runs AFTER authentication (so `request.user` and its claim are available) and
 * BEFORE route handlers/permission guards (so RBAC in Phase 5 can scope to the
 * resolved tenant).
 */
export function registerTenantResolutionHook(app: FastifyInstance): void {
  const tenantService = new TenantService(app.prisma);

  app.addHook("preHandler", async (request) => {
    // Unauthenticated requests carry no tenant context.
    if (!request.user?.id) return;

    const headerValue = request.headers[TENANT_HEADER];
    const headerTenant = Array.isArray(headerValue)
      ? headerValue[0]
      : headerValue;
    const candidate =
      (headerTenant?.trim() || request.user.tenantId) ?? undefined;

    // No candidate → no tenant context. Not an error here; requireTenant decides.
    if (!candidate) return;

    // Validates membership + tenant status; throws a tenant error on failure.
    request.tenant = await tenantService.resolveForUser(
      request.user.id,
      candidate,
    );

    // Attach the explicit tenant-scoped DB accessor for tenant-owned data.
    // Platform operations continue to use the raw prisma client directly.
    request.tenantDb = getTenantDb(app.prisma, request.tenant.tenantId);

    // Enrich the request logger with the resolved tenant for traceability (§80).
    request.log = request.log.child({ tenantId: request.tenant.tenantId });
  });
}

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Explicit tenant-scoped DB accessor for the active tenant, or undefined
     * for platform-only / no-tenant requests. Use this for ALL tenant-owned
     * reads/writes; use `server.prisma` directly only for platform operations.
     */
    tenantDb?: TenantDb;
  }
}

/**
 * Route guard: require a resolved tenant context. Use as a preHandler on routes
 * that operate on tenant-owned resources.
 *
 *   preValidation: [fastify.authenticate],
 *   preHandler: [requireTenant],
 *
 * Throws TenantRequiredError (400) when no active tenant is present — e.g. a
 * platform-only user with no membership hitting a tenant-scoped route.
 */
export async function requireTenant(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!request.tenant) {
    throw new TenantRequiredError();
  }
}
