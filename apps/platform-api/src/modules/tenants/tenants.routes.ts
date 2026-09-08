import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { TENANT_CONTRACTS, type SwitchTenantBody } from "@app/api-contracts";
import { TenantService } from "@core/tenant/index.js";
import { buildTokenPayload } from "../auth/operations/index.js";
import { UnauthorizedError } from "@core/errors/index.js";

/**
 * Tenant module routes (MULTI-TENANT-ARCHITECTURE §32, §34, §52).
 *
 * Registered under the `/tenants` prefix. Everything here is authenticated and
 * scoped to the CALLER: a user only ever sees their own memberships and can
 * only switch to a tenant they belong to (validated server-side).
 */
const tenantsRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const tenantService = new TenantService(fastify.prisma);

  // ── GET /tenants/current ─────────────────────────────────────────────────────
  // The active tenant for the session (resolved + validated by the tenant hook).
  fastify.get(
    "/current",
    {
      preValidation: [fastify.authenticate],
      schema: {
        summary: TENANT_CONTRACTS.CURRENT.summary,
        tags: TENANT_CONTRACTS.CURRENT.tags,
        operationId: TENANT_CONTRACTS.CURRENT.operationId,
        security: [{ bearerAuth: [] }],
        response: TENANT_CONTRACTS.CURRENT.response,
      },
    },
    async (request, reply) => {
      // request.tenant is set by the tenant-resolution hook when a valid active
      // tenant exists. If not, the user has no active tenant context.
      if (!request.tenant) {
        // Reuse the canonical tenant error via the service for consistency: a
        // user with no membership gets TENANT_ACCESS_DENIED; here we simply
        // surface "no current tenant" as access denied to avoid enumeration.
        throw new UnauthorizedError("No active tenant for this session.");
      }

      // name isn't on TenantContext; fetch minimal identity for the DTO.
      const identity = await currentTenantIdentity(
        fastify,
        request.tenant.tenantId,
      );

      return reply.send({
        success: true,
        data: {
          id: request.tenant.tenantId,
          name: identity.name,
          slug: request.tenant.slug,
          status: request.tenant.status,
        },
      });
    },
  );

  // ── GET /tenants ─────────────────────────────────────────────────────────────
  // The tenants the authenticated user belongs to (tenant switcher source).
  fastify.get(
    "/",
    {
      preValidation: [fastify.authenticate],
      schema: {
        summary: TENANT_CONTRACTS.MINE.summary,
        description: TENANT_CONTRACTS.MINE.description,
        tags: TENANT_CONTRACTS.MINE.tags,
        operationId: TENANT_CONTRACTS.MINE.operationId,
        security: [{ bearerAuth: [] }],
        response: TENANT_CONTRACTS.MINE.response,
      },
    },
    async (request, reply) => {
      // Only the caller's own memberships are ever returned. We exclude REMOVED
      // memberships; INVITED/SUSPENDED are surfaced so the UI can reflect state.
      const memberships = await fastify.prisma.tenantMembership.findMany({
        where: { userId: request.user.id, status: { not: "REMOVED" } },
        select: {
          status: true,
          tenant: {
            select: { id: true, name: true, slug: true, status: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return reply.send({
        success: true,
        data: memberships.map((m) => ({
          tenant: {
            id: m.tenant.id,
            name: m.tenant.name,
            slug: m.tenant.slug,
            status: m.tenant.status,
          },
          membershipStatus: m.status,
        })),
      });
    },
  );

  // ── POST /tenants/switch ─────────────────────────────────────────────────────
  // Switch the active tenant: validate membership, then issue a new access
  // token scoped to the target tenant. The refresh session is unchanged (it is
  // tied to the user identity; a refresh re-resolves the active tenant anyway).
  fastify.post(
    "/switch",
    {
      preValidation: [fastify.authenticate],
      schema: {
        summary: TENANT_CONTRACTS.SWITCH.summary,
        description: TENANT_CONTRACTS.SWITCH.description,
        tags: TENANT_CONTRACTS.SWITCH.tags,
        operationId: TENANT_CONTRACTS.SWITCH.operationId,
        security: [{ bearerAuth: [] }],
        body: TENANT_CONTRACTS.SWITCH.body,
        response: TENANT_CONTRACTS.SWITCH.response,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.body as SwitchTenantBody;

      // Authoritative validation: throws TENANT_* on any failure (no membership,
      // suspended tenant, inactive membership). The client can NOT bypass this.
      const tenant = await tenantService.resolveForUser(
        request.user.id,
        tenantId,
      );

      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { id: true, email: true, role: true, permissionVersion: true },
      });
      if (!user) throw new UnauthorizedError("User not found");

      // Re-sign the access token with the new active tenant + current version.
      const accessToken = fastify.jwt.sign(
        await buildTokenPayload(fastify.prisma, user, tenant.tenantId),
      );

      const identity = await currentTenantIdentity(fastify, tenant.tenantId);

      return reply.send({
        success: true,
        data: {
          accessToken,
          tenant: {
            id: tenant.tenantId,
            name: identity.name,
            slug: tenant.slug,
            status: tenant.status,
          },
        },
      });
    },
  );
};

/** Fetch the tenant's display name for the current-tenant DTO. */
async function currentTenantIdentity(
  fastify: Parameters<FastifyPluginAsyncTypebox>[0],
  tenantId: string,
): Promise<{ name: string }> {
  const tenant = await fastify.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return { name: tenant?.name ?? "" };
}

export default tenantsRoutes;
