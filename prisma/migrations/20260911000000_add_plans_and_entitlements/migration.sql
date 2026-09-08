-- ── Plans & Entitlements (Phase 19.6, additive/non-destructive) ──────────────
-- Capability-based, NON-COMMERCIAL plan model owned by the platform control
-- plane. No pricing/billing. Plan → PlanEntitlement → Entitlement; Tenant →
-- TenantPlan → Plan; Tenant → TenantEntitlementOverride → Entitlement.

-- CreateEnum
CREATE TYPE "entitlement_value_type" AS ENUM ('BOOLEAN', 'NUMERIC', 'STRING');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valueType" "entitlement_value_type" NOT NULL DEFAULT 'BOOLEAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlements" (
    "planId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("planId","entitlementId")
);

-- CreateTable
CREATE TABLE "tenant_plans" (
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    CONSTRAINT "tenant_plans_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "tenant_entitlement_overrides" (
    "tenantId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_entitlement_overrides_pkey" PRIMARY KEY ("tenantId","entitlementId")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_key_key" ON "entitlements"("key");

-- CreateIndex
CREATE INDEX "plan_entitlements_entitlementId_idx" ON "plan_entitlements"("entitlementId");

-- CreateIndex
CREATE INDEX "tenant_plans_planId_idx" ON "tenant_plans"("planId");

-- CreateIndex
CREATE INDEX "tenant_entitlement_overrides_entitlementId_idx" ON "tenant_entitlement_overrides"("entitlementId");

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "entitlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_plans" ADD CONSTRAINT "tenant_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_plans" ADD CONSTRAINT "tenant_plans_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_entitlement_overrides" ADD CONSTRAINT "tenant_entitlement_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_entitlement_overrides" ADD CONSTRAINT "tenant_entitlement_overrides_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "entitlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
