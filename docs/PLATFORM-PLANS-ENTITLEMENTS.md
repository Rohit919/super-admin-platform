# Platform Plans & Entitlements

A **non-commercial**, capability-based plan model owned by the platform control
plane (Phase 19.6). There is intentionally **no price, billing, currency, or
invoicing** here — commercial packaging is a separate product/business decision
and is deliberately out of scope.

## Model

```
Plan ── PlanEntitlement ── Entitlement          (a plan's capability bundle)
Tenant ── TenantPlan ── Plan                     (the tenant's active plan)
Tenant ── TenantEntitlementOverride ── Entitlement (controlled per-tenant override)
```

- **Plan** — a named bundle (`key`, `name`, `description`, `isSystem`).
- **Entitlement** — a capability keyed by `key`, with a `valueType`
  (`BOOLEAN` / `NUMERIC` / `STRING`). Values are stored as strings and
  interpreted per `valueType`.
- **PlanEntitlement** — the value a plan assigns to an entitlement.
- **TenantPlan** — a tenant's single active plan (`tenantId` is the PK, so
  assigning a plan replaces the previous one).
- **TenantEntitlementOverride** — a controlled per-tenant override that **wins**
  over the plan value when resolving effective entitlements.

Prisma models are in `prisma/schema.prisma`; migration
`20260911000000_add_plans_and_entitlements` (additive/non-destructive).

## Effective entitlements

A tenant's effective entitlements = the assigned plan's values, then any
per-tenant overrides applied on top. Each resolved entitlement reports its
`source` as `PLAN` or `OVERRIDE`.

## API (all under `/api/v1/platform`, platform-guarded)

| Method | Path                             | Permission                    |
| ------ | -------------------------------- | ----------------------------- |
| GET    | `/plans`                         | `platform.plan.view`          |
| GET    | `/tenants/:id/entitlements`      | `platform.entitlement.view`   |
| PUT    | `/tenants/:id/plan`              | `platform.plan.manage`        |
| PUT    | `/tenants/:id/entitlements/:key` | `platform.entitlement.manage` |

Every endpoint requires an ACTIVE `PlatformMembership` + the listed permission
(uniform `403 PLATFORM_ACCESS_DENIED` on failure). Assigning a plan and setting
or clearing an override are **audited** (`TENANT_PLAN_ASSIGNED`,
`TENANT_ENTITLEMENT_OVERRIDE_SET`, `TENANT_ENTITLEMENT_OVERRIDE_CLEARED`).

## Seeded baseline (non-commercial)

Entitlements: `max_users`, `audit_retention_days`, `feature.custom_branding`,
`feature.api_access`. Plans: `starter`, `growth`, `enterprise` (limits differ;
no pricing). See `prisma/seed.ts`.

## Frontend

The Super Admin tenant detail page shows the active plan, effective entitlements
(with PLAN/OVERRIDE source), and — for `platform.plan.manage` — a plan
assignment control. Permission checks in the UI are UX-only; the API is the
authoritative boundary.

## Out of scope (future / product decision)

Pricing, billing, quotas enforcement at runtime, entitlement-driven feature
gating in tenant apps, and self-service plan changes. Add these deliberately
when the product requires them.
