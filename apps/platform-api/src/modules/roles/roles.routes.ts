import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  ROLE_CONTRACTS,
  PERMISSION_CONTRACTS,
  USER_ROLE_CONTRACTS,
} from "@app/api-contracts";
import type { PermissionKey } from "@app/api-contracts";
import { requirePermission } from "@core/authorization/index.js";
import { AuditService } from "@core/audit/index.js";
import { RolesService } from "./roles.service.js";

/**
 * Admin RBAC management — consumes the shared Level 2 contracts
 * (API_CONTRACTS §80). Permission gates, schemas, tags, summaries and
 * operationIds all come from ROLE_CONTRACTS / PERMISSION_CONTRACTS /
 * USER_ROLE_CONTRACTS. Registration paths are relative to the `/admin` prefix,
 * while the contracts carry the absolute path for the Admin/tests.
 */
const rolesRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = new RolesService(fastify.prisma);

  // ── GET /roles ──────────────────────────────────────────────────────────────
  fastify.get(
    "/roles",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(ROLE_CONTRACTS.LIST.permission as PermissionKey),
      ],
      schema: {
        summary: ROLE_CONTRACTS.LIST.summary,
        tags: ROLE_CONTRACTS.LIST.tags,
        operationId: ROLE_CONTRACTS.LIST.operationId,
        security: [{ bearerAuth: [] }],
        response: ROLE_CONTRACTS.LIST.response,
      },
    },
    async (_request, reply) => {
      const data = await service.listRoles();
      return reply.send({ success: true, data });
    },
  );

  // ── POST /roles ─────────────────────────────────────────────────────────────
  fastify.post(
    "/roles",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(ROLE_CONTRACTS.CREATE.permission as PermissionKey),
      ],
      schema: {
        summary: ROLE_CONTRACTS.CREATE.summary,
        tags: ROLE_CONTRACTS.CREATE.tags,
        operationId: ROLE_CONTRACTS.CREATE.operationId,
        security: [{ bearerAuth: [] }],
        body: ROLE_CONTRACTS.CREATE.body,
        response: { 201: ROLE_CONTRACTS.CREATE.response![201] },
      },
    },
    async (request, reply) => {
      const isSuperAdmin = await fastify.authorization.isSuperAdmin(
        request.user.id,
      );
      const data = await service.createRole(
        request.body,
        { userId: request.user.id, isSuperAdmin },
        AuditService.contextFrom(request),
      );
      return reply.status(201).send({ success: true, data });
    },
  );

  // ── GET /roles/:id ──────────────────────────────────────────────────────────
  fastify.get(
    "/roles/:id",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(ROLE_CONTRACTS.GET_BY_ID.permission as PermissionKey),
      ],
      schema: {
        summary: ROLE_CONTRACTS.GET_BY_ID.summary,
        tags: ROLE_CONTRACTS.GET_BY_ID.tags,
        operationId: ROLE_CONTRACTS.GET_BY_ID.operationId,
        security: [{ bearerAuth: [] }],
        params: ROLE_CONTRACTS.GET_BY_ID.params,
        response: ROLE_CONTRACTS.GET_BY_ID.response,
      },
    },
    async (request, reply) => {
      const data = await service.getRole(request.params.id);
      return reply.send({ success: true, data });
    },
  );

  // ── PATCH /roles/:id ──────────────────────────────────────────────────────────
  fastify.patch(
    "/roles/:id",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(ROLE_CONTRACTS.UPDATE.permission as PermissionKey),
      ],
      schema: {
        summary: ROLE_CONTRACTS.UPDATE.summary,
        tags: ROLE_CONTRACTS.UPDATE.tags,
        operationId: ROLE_CONTRACTS.UPDATE.operationId,
        security: [{ bearerAuth: [] }],
        params: ROLE_CONTRACTS.UPDATE.params,
        body: ROLE_CONTRACTS.UPDATE.body,
        response: ROLE_CONTRACTS.UPDATE.response,
      },
    },
    async (request, reply) => {
      const isSuperAdmin = await fastify.authorization.isSuperAdmin(
        request.user.id,
      );
      const data = await service.updateRole(
        request.params.id,
        request.body,
        { userId: request.user.id, isSuperAdmin },
        AuditService.contextFrom(request),
      );
      return reply.send({ success: true, data });
    },
  );

  // ── PUT /roles/:id/permissions ────────────────────────────────────────────────
  fastify.put(
    "/roles/:id/permissions",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(
          ROLE_CONTRACTS.SET_PERMISSIONS.permission as PermissionKey,
        ),
      ],
      schema: {
        summary: ROLE_CONTRACTS.SET_PERMISSIONS.summary,
        tags: ROLE_CONTRACTS.SET_PERMISSIONS.tags,
        operationId: ROLE_CONTRACTS.SET_PERMISSIONS.operationId,
        security: [{ bearerAuth: [] }],
        params: ROLE_CONTRACTS.SET_PERMISSIONS.params,
        body: ROLE_CONTRACTS.SET_PERMISSIONS.body,
        response: ROLE_CONTRACTS.SET_PERMISSIONS.response,
      },
    },
    async (request, reply) => {
      const isSuperAdmin = await fastify.authorization.isSuperAdmin(
        request.user.id,
      );
      const data = await service.setRolePermissions(
        request.params.id,
        request.body.permissions,
        { userId: request.user.id, isSuperAdmin },
        AuditService.contextFrom(request),
      );
      return reply.send({ success: true, data });
    },
  );

  // ── DELETE /roles/:id ───────────────────────────────────────────────────────
  fastify.delete(
    "/roles/:id",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(ROLE_CONTRACTS.DELETE.permission as PermissionKey),
      ],
      schema: {
        summary: ROLE_CONTRACTS.DELETE.summary,
        tags: ROLE_CONTRACTS.DELETE.tags,
        operationId: ROLE_CONTRACTS.DELETE.operationId,
        security: [{ bearerAuth: [] }],
        params: ROLE_CONTRACTS.DELETE.params,
        response: ROLE_CONTRACTS.DELETE.response,
      },
    },
    async (request, reply) => {
      await service.deleteRole(
        request.params.id,
        AuditService.contextFrom(request),
      );
      return reply.send({ success: true, data: { message: "Role deleted" } });
    },
  );

  // ── GET /permissions ──────────────────────────────────────────────────────────
  fastify.get(
    "/permissions",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(
          PERMISSION_CONTRACTS.LIST.permission as PermissionKey,
        ),
      ],
      schema: {
        summary: PERMISSION_CONTRACTS.LIST.summary,
        tags: PERMISSION_CONTRACTS.LIST.tags,
        operationId: PERMISSION_CONTRACTS.LIST.operationId,
        security: [{ bearerAuth: [] }],
        response: PERMISSION_CONTRACTS.LIST.response,
      },
    },
    async (_request, reply) => {
      const perms = await service.listPermissions();
      return reply.send({
        success: true,
        data: perms.map((p) => ({
          id: p.id,
          key: p.key,
          description: p.description,
        })),
      });
    },
  );

  // ── GET /users/:id/roles ──────────────────────────────────────────────────────
  fastify.get(
    "/users/:id/roles",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(USER_ROLE_CONTRACTS.GET.permission as PermissionKey),
      ],
      schema: {
        summary: USER_ROLE_CONTRACTS.GET.summary,
        tags: USER_ROLE_CONTRACTS.GET.tags,
        operationId: USER_ROLE_CONTRACTS.GET.operationId,
        security: [{ bearerAuth: [] }],
        params: USER_ROLE_CONTRACTS.GET.params,
        response: USER_ROLE_CONTRACTS.GET.response,
      },
    },
    async (request, reply) => {
      const roles = await service.getUserRoles(request.params.id);
      return reply.send({
        success: true,
        data: { userId: request.params.id, roles },
      });
    },
  );

  // ── PUT /users/:id/roles ──────────────────────────────────────────────────────
  fastify.put(
    "/users/:id/roles",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(USER_ROLE_CONTRACTS.SET.permission as PermissionKey),
      ],
      schema: {
        summary: USER_ROLE_CONTRACTS.SET.summary,
        tags: USER_ROLE_CONTRACTS.SET.tags,
        operationId: USER_ROLE_CONTRACTS.SET.operationId,
        security: [{ bearerAuth: [] }],
        params: USER_ROLE_CONTRACTS.SET.params,
        body: USER_ROLE_CONTRACTS.SET.body,
        response: USER_ROLE_CONTRACTS.SET.response,
      },
    },
    async (request, reply) => {
      const isSuperAdmin = await fastify.authorization.isSuperAdmin(
        request.user.id,
      );
      const roles = await service.setUserRoles(
        request.params.id,
        request.body.roles,
        { userId: request.user.id, isSuperAdmin },
        AuditService.contextFrom(request),
      );
      return reply.send({
        success: true,
        data: { userId: request.params.id, roles },
      });
    },
  );
};

export default rolesRoutes;
