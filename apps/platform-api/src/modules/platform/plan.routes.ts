import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  PLAN_CONTRACTS,
  PermissionKeys,
  type AssignTenantPlanBody,
  type SetTenantEntitlementOverrideBody,
} from "@app/api-contracts";
import { requirePlatformPermission } from "@core/platform/index.js";
import { AuditService } from "@core/audit/index.js";
import { PlanService } from "./plan.service.js";

/**
 * Plans & Entitlements routes — registered under `/platform`. Every route is
 * gated by authenticate + a platform.plan.* / platform.entitlement.* permission.
 * Non-commercial capability model (no pricing).
 */
const planRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = new PlanService(fastify.prisma);

  // ── GET /platform/plans ───────────────────────────────────────────────────
  fastify.get(
    "/plans",
    {
      preValidation: [fastify.authenticate],
      preHandler: [requirePlatformPermission(PermissionKeys.PlatformPlanView)],
      schema: {
        summary: PLAN_CONTRACTS.PLANS_LIST.summary,
        tags: PLAN_CONTRACTS.PLANS_LIST.tags,
        operationId: PLAN_CONTRACTS.PLANS_LIST.operationId,
        security: [{ bearerAuth: [] }],
        response: PLAN_CONTRACTS.PLANS_LIST.response,
      },
    },
    async (_request, reply) => {
      const data = await service.listPlans();
      return reply.send({ success: true, data });
    },
  );

  // ── GET /platform/tenants/:id/entitlements ────────────────────────────────
  fastify.get(
    "/tenants/:id/entitlements",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformEntitlementView),
      ],
      schema: {
        summary: PLAN_CONTRACTS.TENANT_ENTITLEMENTS_GET.summary,
        tags: PLAN_CONTRACTS.TENANT_ENTITLEMENTS_GET.tags,
        operationId: PLAN_CONTRACTS.TENANT_ENTITLEMENTS_GET.operationId,
        security: [{ bearerAuth: [] }],
        params: PLAN_CONTRACTS.TENANT_ENTITLEMENTS_GET.params,
        response: PLAN_CONTRACTS.TENANT_ENTITLEMENTS_GET.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await service.getTenantEntitlements(id);
      return reply.send({ success: true, data });
    },
  );

  // ── PUT /platform/tenants/:id/plan ─────────────────────────────────────────
  fastify.put(
    "/tenants/:id/plan",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformPlanManage),
      ],
      schema: {
        summary: PLAN_CONTRACTS.TENANT_PLAN_ASSIGN.summary,
        tags: PLAN_CONTRACTS.TENANT_PLAN_ASSIGN.tags,
        operationId: PLAN_CONTRACTS.TENANT_PLAN_ASSIGN.operationId,
        security: [{ bearerAuth: [] }],
        params: PLAN_CONTRACTS.TENANT_PLAN_ASSIGN.params,
        body: PLAN_CONTRACTS.TENANT_PLAN_ASSIGN.body,
        response: PLAN_CONTRACTS.TENANT_PLAN_ASSIGN.response,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { planKey } = request.body as AssignTenantPlanBody;
      const data = await service.assignTenantPlan(
        id,
        planKey,
        AuditService.contextFrom(request),
      );
      return reply.send({ success: true, data });
    },
  );

  // ── PUT /platform/tenants/:id/entitlements/:key ────────────────────────────
  fastify.put(
    "/tenants/:id/entitlements/:key",
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePlatformPermission(PermissionKeys.PlatformEntitlementManage),
      ],
      schema: {
        summary: PLAN_CONTRACTS.TENANT_ENTITLEMENT_OVERRIDE_SET.summary,
        tags: PLAN_CONTRACTS.TENANT_ENTITLEMENT_OVERRIDE_SET.tags,
        operationId: PLAN_CONTRACTS.TENANT_ENTITLEMENT_OVERRIDE_SET.operationId,
        security: [{ bearerAuth: [] }],
        params: PLAN_CONTRACTS.TENANT_ENTITLEMENT_OVERRIDE_SET.params,
        body: PLAN_CONTRACTS.TENANT_ENTITLEMENT_OVERRIDE_SET.body,
        response: PLAN_CONTRACTS.TENANT_ENTITLEMENT_OVERRIDE_SET.response,
      },
    },
    async (request, reply) => {
      const { id, key } = request.params as { id: string; key: string };
      const { value } = request.body as SetTenantEntitlementOverrideBody;
      const data = await service.setEntitlementOverride(
        id,
        key,
        value,
        AuditService.contextFrom(request),
      );
      return reply.send({ success: true, data });
    },
  );
};

export default planRoutes;
