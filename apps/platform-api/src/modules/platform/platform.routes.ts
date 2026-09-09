import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  PLATFORM_CONTRACTS,
  PermissionKeys,
  type CreateTenantBody,
  type UpdateTenantBody,
  type UpdateTenantOrganizationBody,
  type UpdateTenantStatusBody,
  type PlatformTenantListQuery,
  type PlatformAuditLogQuery,
} from "@app/api-contracts";
import type { TenantStatus } from "@prisma/client";
import { requirePlatformPermission } from "@core/platform/index.js";
import { PlatformAccessDeniedError } from "@core/errors/index.js";
import { AuditService } from "@core/audit/index.js";
import { PlatformService } from "./platform.service.js";

/**
 * Platform (Super Admin) routes — registered under `/platform`. Every route:
 *   preValidation: [authenticate]  → identity
 *   preHandler:    [requirePlatformPermission(key)] → ACTIVE platform membership
 *                                     + the platform.* permission
 * A tenant user (no platform membership) receives a uniform 403.
 */
const platformRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = new PlatformService(fastify.prisma);

  // ── GET /platform/dashboard ──────────────────────────────────────────────────
  fastify.get(
    "/dashboard",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformDashboardView),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.DASHBOARD.summary,
        tags: PLATFORM_CONTRACTS.DASHBOARD.tags,
        operationId: PLATFORM_CONTRACTS.DASHBOARD.operationId,
        security: [{ bearerAuth: [] }],
        response: PLATFORM_CONTRACTS.DASHBOARD.response,
      },
    },
    async (_request, reply) => {
      const data = await service.dashboardStats();
      return reply.send({ success: true, data });
    },
  );

  // ── GET /platform/tenants ────────────────────────────────────────────────────
  fastify.get(
    "/tenants",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantView),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANTS_LIST.summary,
        tags: PLATFORM_CONTRACTS.TENANTS_LIST.tags,
        operationId: PLATFORM_CONTRACTS.TENANTS_LIST.operationId,
        security: [{ bearerAuth: [] }],
        querystring: PLATFORM_CONTRACTS.TENANTS_LIST.query,
        response: PLATFORM_CONTRACTS.TENANTS_LIST.response,
      },
    },
    async (request, reply) => {
      const { data, meta } = await service.listTenants(
        request.query as PlatformTenantListQuery,
      );
      return reply.send({ success: true, data, meta });
    },
  );

  // ── POST /platform/tenants (provision) ───────────────────────────────────────
  fastify.post(
    "/tenants",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantCreate),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_CREATE.summary,
        tags: PLATFORM_CONTRACTS.TENANT_CREATE.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_CREATE.operationId,
        security: [{ bearerAuth: [] }],
        body: PLATFORM_CONTRACTS.TENANT_CREATE.body,
        response: { 201: PLATFORM_CONTRACTS.TENANT_CREATE.response![201] },
      },
    },
    async (request, reply) => {
      const data = await service.provisionTenant(
        request.body as CreateTenantBody,
        AuditService.contextFrom(request),
      );
      return reply.status(201).send({ success: true, data });
    },
  );

  // ── GET /platform/tenants/:id ────────────────────────────────────────────────
  fastify.get(
    "/tenants/:id",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantView),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_GET.summary,
        tags: PLATFORM_CONTRACTS.TENANT_GET.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_GET.operationId,
        security: [{ bearerAuth: [] }],
        params: PLATFORM_CONTRACTS.TENANT_GET.params,
        response: PLATFORM_CONTRACTS.TENANT_GET.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await service.getTenant(id);
      return reply.send({ success: true, data });
    },
  );

  // ── GET /platform/tenants/:id/overview ───────────────────────────────────────
  // Deep, real tenant aggregate for the Control Center (identity, primary admin,
  // member + credential breakdowns, plan summary). Separate from the lean list.
  fastify.get(
    "/tenants/:id/overview",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantView),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_OVERVIEW.summary,
        tags: PLATFORM_CONTRACTS.TENANT_OVERVIEW.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_OVERVIEW.operationId,
        security: [{ bearerAuth: [] }],
        params: PLATFORM_CONTRACTS.TENANT_OVERVIEW.params,
        response: PLATFORM_CONTRACTS.TENANT_OVERVIEW.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await service.getTenantOverview(id);
      return reply.send({ success: true, data });
    },
  );

  // ── GET /platform/tenants/:id/organization ───────────────────────────────────
  // Organization profile (identity echo + org/address/contact). Real, nullable
  // metadata; no operational/logistics data. Requires platform.tenant.view.
  fastify.get(
    "/tenants/:id/organization",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantView),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_GET.summary,
        tags: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_GET.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_GET.operationId,
        security: [{ bearerAuth: [] }],
        params: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_GET.params,
        response: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_GET.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await service.getTenantOrganization(id);
      return reply.send({ success: true, data });
    },
  );

  // ── PATCH /platform/tenants/:id/organization ─────────────────────────────────
  // Partial update of the organization profile. Requires platform.tenant.update.
  // Audited as TENANT_ORGANIZATION_UPDATED (records changed field names only).
  fastify.patch(
    "/tenants/:id/organization",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantUpdate),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_UPDATE.summary,
        tags: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_UPDATE.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_UPDATE.operationId,
        security: [{ bearerAuth: [] }],
        params: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_UPDATE.params,
        body: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_UPDATE.body,
        response: PLATFORM_CONTRACTS.TENANT_ORGANIZATION_UPDATE.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await service.updateTenantOrganization(
        id,
        request.body as UpdateTenantOrganizationBody,
        AuditService.contextFrom(request),
      );
      return reply.send({ success: true, data });
    },
  );

  // ── PATCH /platform/tenants/:id (metadata) ───────────────────────────────────
  // Edit platform-level tenant metadata (name). Distinct from the status route:
  // lifecycle changes are gated separately. Requires platform.tenant.update.
  fastify.patch(
    "/tenants/:id",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantUpdate),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_UPDATE.summary,
        tags: PLATFORM_CONTRACTS.TENANT_UPDATE.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_UPDATE.operationId,
        security: [{ bearerAuth: [] }],
        params: PLATFORM_CONTRACTS.TENANT_UPDATE.params,
        body: PLATFORM_CONTRACTS.TENANT_UPDATE.body,
        response: PLATFORM_CONTRACTS.TENANT_UPDATE.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await service.updateTenant(
        id,
        request.body as UpdateTenantBody,
        AuditService.contextFrom(request),
      );
      return reply.send({ success: true, data });
    },
  );

  // ── PATCH /platform/tenants/:id/status ───────────────────────────────────────
  // Base guard requires platform.tenant.suspend (suspend/reactivate). Archiving
  // additionally requires platform.tenant.archive (checked inline).
  fastify.patch(
    "/tenants/:id/status",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformTenantSuspend),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_STATUS.summary,
        tags: PLATFORM_CONTRACTS.TENANT_STATUS.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_STATUS.operationId,
        security: [{ bearerAuth: [] }],
        params: PLATFORM_CONTRACTS.TENANT_STATUS.params,
        body: PLATFORM_CONTRACTS.TENANT_STATUS.body,
        response: PLATFORM_CONTRACTS.TENANT_STATUS.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { status } = request.body as UpdateTenantStatusBody;

      // Archiving is a higher-privilege action than suspend/reactivate.
      if (status === "ARCHIVED") {
        const canArchive = await fastify.authorization.hasPermission(
          request.user.id,
          PermissionKeys.PlatformTenantArchive,
        );
        if (!canArchive) throw new PlatformAccessDeniedError();
      }

      const data = await service.setTenantStatus(
        id,
        status as TenantStatus,
        AuditService.contextFrom(request),
      );
      return reply.send({ success: true, data });
    },
  );

  // ── GET /platform/users ──────────────────────────────────────────────────────
  fastify.get(
    "/users",
    {
      preValidation: [fastify.authenticate],
      preHandler: [requirePlatformPermission(PermissionKeys.PlatformUserView)],
      schema: {
        summary: PLATFORM_CONTRACTS.USERS_LIST.summary,
        tags: PLATFORM_CONTRACTS.USERS_LIST.tags,
        operationId: PLATFORM_CONTRACTS.USERS_LIST.operationId,
        security: [{ bearerAuth: [] }],
        response: PLATFORM_CONTRACTS.USERS_LIST.response,
      },
    },
    async (_request, reply) => {
      const data = await service.listPlatformUsers();
      return reply.send({ success: true, data });
    },
  );

  // ── GET /platform/audit ──────────────────────────────────────────────────────
  fastify.get(
    "/audit",
    {
      preValidation: [fastify.authenticate],
      preHandler: [requirePlatformPermission(PermissionKeys.PlatformAuditView)],
      schema: {
        summary: PLATFORM_CONTRACTS.AUDIT_LIST.summary,
        tags: PLATFORM_CONTRACTS.AUDIT_LIST.tags,
        operationId: PLATFORM_CONTRACTS.AUDIT_LIST.operationId,
        security: [{ bearerAuth: [] }],
        querystring: PLATFORM_CONTRACTS.AUDIT_LIST.query,
        response: PLATFORM_CONTRACTS.AUDIT_LIST.response,
      },
    },
    async (request, reply) => {
      const data = await service.listAuditLogs(
        request.query as PlatformAuditLogQuery,
      );
      return reply.send({ success: true, data });
    },
  );
};

export default platformRoutes;
