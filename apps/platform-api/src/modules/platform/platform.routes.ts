import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  PLATFORM_CONTRACTS,
  PermissionKeys,
  type CreateTenantBody,
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
      const { status } = request.query as PlatformTenantListQuery;
      const data = await service.listTenants(
        status as TenantStatus | undefined,
      );
      return reply.send({ success: true, data });
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
