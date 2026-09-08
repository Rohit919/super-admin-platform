import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  PLATFORM_CONTRACTS,
  PermissionKeys,
  type CreateTenantApiCredentialBody,
} from "@app/api-contracts";
import { requirePlatformPermission } from "@core/platform/index.js";
import { AuditService } from "@core/audit/index.js";
import { CredentialService } from "./credential.service.js";

/**
 * Tenant API credential routes — registered under `/platform`. Every route is
 * gated by authenticate + a platform.credential.* permission. Secrets are
 * returned ONLY by create/rotate (201/200), never by list.
 */
const credentialRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = new CredentialService(fastify.prisma);

  // ── GET /platform/tenants/:tenantId/credentials ──────────────────────────────
  fastify.get(
    "/tenants/:tenantId/credentials",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformCredentialRead),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_CREDENTIALS_LIST.summary,
        tags: PLATFORM_CONTRACTS.TENANT_CREDENTIALS_LIST.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_CREDENTIALS_LIST.operationId,
        security: [{ bearerAuth: [] }],
        params: PLATFORM_CONTRACTS.TENANT_CREDENTIALS_LIST.params,
        response: PLATFORM_CONTRACTS.TENANT_CREDENTIALS_LIST.response,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      const data = await service.listForTenant(tenantId);
      return reply.send({ success: true, data });
    },
  );

  // ── POST /platform/tenants/:tenantId/credentials ─────────────────────────────
  fastify.post(
    "/tenants/:tenantId/credentials",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformCredentialCreate),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_CREATE.summary,
        tags: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_CREATE.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_CREATE.operationId,
        security: [{ bearerAuth: [] }],
        params: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_CREATE.params,
        body: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_CREATE.body,
        response: {
          201: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_CREATE.response![201],
        },
      },
    },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      const data = await service.create(
        tenantId,
        request.body as CreateTenantApiCredentialBody,
        AuditService.contextFrom(request),
      );
      return reply.status(201).send({ success: true, data });
    },
  );

  // ── POST /platform/tenants/:tenantId/credentials/:credentialId/rotate ────────
  fastify.post(
    "/tenants/:tenantId/credentials/:credentialId/rotate",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformCredentialRotate),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_ROTATE.summary,
        tags: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_ROTATE.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_ROTATE.operationId,
        security: [{ bearerAuth: [] }],
        params: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_ROTATE.params,
        response: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_ROTATE.response,
      },
    },
    async (request, reply) => {
      const { tenantId, credentialId } = request.params as {
        tenantId: string;
        credentialId: string;
      };
      const data = await service.rotate(
        tenantId,
        credentialId,
        AuditService.contextFrom(request),
      );
      return reply.send({ success: true, data });
    },
  );

  // ── POST /platform/tenants/:tenantId/credentials/:credentialId/revoke ────────
  fastify.post(
    "/tenants/:tenantId/credentials/:credentialId/revoke",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformCredentialRevoke),
      ],
      schema: {
        summary: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_REVOKE.summary,
        tags: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_REVOKE.tags,
        operationId: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_REVOKE.operationId,
        security: [{ bearerAuth: [] }],
        params: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_REVOKE.params,
        response: PLATFORM_CONTRACTS.TENANT_CREDENTIAL_REVOKE.response,
      },
    },
    async (request, reply) => {
      const { tenantId, credentialId } = request.params as {
        tenantId: string;
        credentialId: string;
      };
      const data = await service.revoke(
        tenantId,
        credentialId,
        AuditService.contextFrom(request),
      );
      return reply.send({ success: true, data });
    },
  );
};

export default credentialRoutes;
