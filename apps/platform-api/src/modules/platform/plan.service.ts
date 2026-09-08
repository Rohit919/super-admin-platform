import type { PrismaClient } from "@prisma/client";
import type {
  PlanDto,
  TenantEntitlementDto,
  TenantEntitlementsResponse,
} from "@app/api-contracts";
import { NotFoundError } from "@core/errors/index.js";
import { AuditService, AuditActions } from "@core/audit/index.js";
import type { AuditContext } from "./platform.service.js";

type TenantEntitlements = TenantEntitlementsResponse["data"];

/**
 * PlanService — platform-managed plans & entitlements (Phase 19.6).
 *
 * Non-commercial capability model: a Plan is a named bundle of entitlement
 * values; a Tenant has at most one active plan; per-tenant overrides take
 * precedence over the plan value. No pricing/billing (plan §11/§20).
 *
 * Uses the raw Prisma client directly — platform is the authorized cross-tenant
 * surface and must never be silently tenant-filtered.
 */
export class PlanService {
  private readonly audit: AuditService;

  constructor(private readonly prisma: PrismaClient) {
    this.audit = new AuditService(prisma);
  }

  // ── read: plans ───────────────────────────────────────────────────────────
  async listPlans(): Promise<PlanDto[]> {
    const plans = await this.prisma.plan.findMany({
      orderBy: { key: "asc" },
      include: {
        entitlements: { include: { entitlement: true } },
      },
    });

    return plans.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      isSystem: p.isSystem,
      entitlements: p.entitlements.map((pe) => ({
        key: pe.entitlement.key,
        name: pe.entitlement.name,
        valueType: pe.entitlement.valueType,
        value: pe.value,
      })),
      createdAt: p.createdAt.toISOString(),
    }));
  }

  // ── read: a tenant's effective entitlements ─────────────────────────────────
  /**
   * Resolve a tenant's EFFECTIVE entitlements: start from the assigned plan's
   * values, then apply any per-tenant overrides (which win). Returns the active
   * plan summary (or null) and the resolved entitlement list.
   */
  async getTenantEntitlements(tenantId: string): Promise<TenantEntitlements> {
    await this.assertTenantExists(tenantId);

    const [tenantPlan, overrides] = await Promise.all([
      this.prisma.tenantPlan.findUnique({
        where: { tenantId },
        include: {
          plan: {
            include: { entitlements: { include: { entitlement: true } } },
          },
        },
      }),
      this.prisma.tenantEntitlementOverride.findMany({
        where: { tenantId },
        include: { entitlement: true },
      }),
    ]);

    const byKey = new Map<string, TenantEntitlementDto>();

    if (tenantPlan) {
      for (const pe of tenantPlan.plan.entitlements) {
        byKey.set(pe.entitlement.key, {
          key: pe.entitlement.key,
          name: pe.entitlement.name,
          valueType: pe.entitlement.valueType,
          value: pe.value,
          source: "PLAN",
        });
      }
    }

    for (const ov of overrides) {
      byKey.set(ov.entitlement.key, {
        key: ov.entitlement.key,
        name: ov.entitlement.name,
        valueType: ov.entitlement.valueType,
        value: ov.value,
        source: "OVERRIDE",
      });
    }

    return {
      tenantId,
      plan: tenantPlan
        ? { key: tenantPlan.plan.key, name: tenantPlan.plan.name }
        : null,
      entitlements: [...byKey.values()].sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
    };
  }

  // ── mutate: assign a plan to a tenant ───────────────────────────────────────
  async assignTenantPlan(
    tenantId: string,
    planKey: string,
    auditCtx?: AuditContext,
  ): Promise<TenantEntitlements> {
    await this.assertTenantExists(tenantId);

    const plan = await this.prisma.plan.findUnique({
      where: { key: planKey },
      select: { id: true, key: true },
    });
    if (!plan) throw new NotFoundError("Plan not found");

    await this.prisma.tenantPlan.upsert({
      where: { tenantId },
      update: { planId: plan.id, assignedBy: auditCtx?.actorId ?? null },
      create: {
        tenantId,
        planId: plan.id,
        assignedBy: auditCtx?.actorId ?? null,
      },
    });

    await this.audit.record({
      ...auditCtx,
      action: AuditActions.TenantPlanAssigned,
      tenantId,
      targetType: "TENANT_PLAN",
      targetId: tenantId,
      metadata: { planKey: plan.key },
    });

    return this.getTenantEntitlements(tenantId);
  }

  // ── mutate: set / clear a per-tenant entitlement override ───────────────────
  async setEntitlementOverride(
    tenantId: string,
    entitlementKey: string,
    value: string | null,
    auditCtx?: AuditContext,
  ): Promise<TenantEntitlements> {
    await this.assertTenantExists(tenantId);

    const entitlement = await this.prisma.entitlement.findUnique({
      where: { key: entitlementKey },
      select: { id: true, key: true },
    });
    if (!entitlement) throw new NotFoundError("Entitlement not found");

    if (value === null) {
      // Clear the override (no-op if none existed).
      await this.prisma.tenantEntitlementOverride.deleteMany({
        where: { tenantId, entitlementId: entitlement.id },
      });
      await this.audit.record({
        ...auditCtx,
        action: AuditActions.TenantEntitlementOverrideCleared,
        tenantId,
        targetType: "TENANT_ENTITLEMENT_OVERRIDE",
        targetId: tenantId,
        metadata: { entitlementKey: entitlement.key },
      });
    } else {
      await this.prisma.tenantEntitlementOverride.upsert({
        where: {
          tenantId_entitlementId: {
            tenantId,
            entitlementId: entitlement.id,
          },
        },
        update: { value },
        create: { tenantId, entitlementId: entitlement.id, value },
      });
      await this.audit.record({
        ...auditCtx,
        action: AuditActions.TenantEntitlementOverrideSet,
        tenantId,
        targetType: "TENANT_ENTITLEMENT_OVERRIDE",
        targetId: tenantId,
        // Value is not a secret, but keep metadata minimal + explicit.
        metadata: { entitlementKey: entitlement.key, value },
      });
    }

    return this.getTenantEntitlements(tenantId);
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundError("Tenant not found");
  }
}
