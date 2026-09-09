import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  TENANT_PLATFORM_CONTRACTS,
  PermissionKeys,
  type UpdateTenantBrandingBody,
} from "@app/api-contracts";
import { requirePlatformPermission } from "@core/platform/index.js";
import { AuditService } from "@core/audit/index.js";
import { TenantPlatformService } from "./tenant-platform.service.js";

/**
 * Tenant platform connection routes (Phase 21) — registered under `/platform`.
 *
 * The Super Admin surface for managing a tenant's platform relationship via the
 * Tenant API over S2S: connection status + branding. Every route is gated by
 * authenticate + a platform.* permission (view for reads, update for the
 * branding write). Branding writes are audited (in the service).
 *
 * These are the ONLY branding entry points the Super Admin frontend calls; the
 * frontend never talks to the Tenant API directly (§12, §29, §31).
 */
const tenantPlatformRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = new TenantPlatformService(fastify.prisma, fastify.config);

  // ── GET /platform/tenants/:id/connection ───────────────────────────────────
  fastify.get(
    "/tenants/:id/connection",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantView),
      ],
      schema: {
        summary: TENANT_PLATFORM_CONTRACTS.TENANT_CONNECTION_GET.summary,
        tags: TENANT_PLATFORM_CONTRACTS.TENANT_CONNECTION_GET.tags,
        operationId:
          TENANT_PLATFORM_CONTRACTS.TENANT_CONNECTION_GET.operationId,
        security: [{ bearerAuth: [] }],
        params: TENANT_PLATFORM_CONTRACTS.TENANT_CONNECTION_GET.params,
        response: TENANT_PLATFORM_CONTRACTS.TENANT_CONNECTION_GET.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await service.getConnectionStatus(id, request.id);
      return reply.send({ data });
    },
  );

  // ── GET /platform/tenants/:id/branding ──────────────────────────────────────
  fastify.get(
    "/tenants/:id/branding",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantView),
      ],
      schema: {
        summary: TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_GET.summary,
        tags: TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_GET.tags,
        operationId: TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_GET.operationId,
        security: [{ bearerAuth: [] }],
        params: TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_GET.params,
        response: TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_GET.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await service.getBranding(id, request.id);
      return reply.send({ data });
    },
  );

  // ── PATCH /platform/tenants/:id/branding ────────────────────────────────────
  fastify.patch(
    "/tenants/:id/branding",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantUpdate),
      ],
      schema: {
        summary: TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_UPDATE.summary,
        tags: TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_UPDATE.tags,
        operationId:
          TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_UPDATE.operationId,
        security: [{ bearerAuth: [] }],
        params: TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_UPDATE.params,
        body: TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_UPDATE.body,
        response: TENANT_PLATFORM_CONTRACTS.TENANT_BRANDING_UPDATE.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await service.updateBranding(
        id,
        request.body as UpdateTenantBrandingBody,
        AuditService.contextFrom(request),
        request.id,
      );
      return reply.send({ data });
    },
  );
};

export default tenantPlatformRoutes;
