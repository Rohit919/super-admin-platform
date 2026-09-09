# Phase 19 — Tenant Control Center: Capability Matrix & Gap Analysis

This document records what tenant-level information the platform **actually**
exposes today, and — critically — what it does **not**. The Tenant Control
Center (Super Admin `/tenants/:id`) is built strictly on real, existing data.
Where the prompt's vision asks for information that has no backing model,
service, or endpoint, the gap is documented here rather than faked in the UI.

> Guiding rule (prompt §34): **Deep real data, not fake deep UI.** No
> decorative metrics, no invented usage series, no placeholder integrations.

## Capability matrix

Legend: ✓ present · ✗ absent · ➖ derivable from existing data

| Domain                                                                                          | Database                                         | Backend service                                        | API contract                               | API route                                     | Frontend                            | Status                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------ | --------------------------------------------- | ----------------------------------- | ------------------------------ |
| Identity (name, slug, id, status, created, updated)                                             | ✓ `Tenant`                                       | ✓ `PlatformService.getTenant`                          | ✓ `PlatformTenantDto`                      | ✓ `GET /platform/tenants/:id`                 | ✓ enriched                          | **Shipped**                    |
| Primary administrator                                                                           | ✓ `TenantMembership`→`User`                      | ✓ `getTenantOverview`                                  | ✓ `PlatformTenantOverviewDto`              | ✓ `GET /platform/tenants/:id/overview`        | ✓                                   | **Shipped (Phase 19)**         |
| Lifecycle status                                                                                | ✓ `Tenant.status`                                | ✓ state machine `TENANT_STATUS_TRANSITIONS`            | ✓                                          | ✓ `PATCH .../status`                          | ✓                                   | **Shipped**                    |
| Lifecycle history / timeline                                                                    | ➖ `AuditLog` rows only                          | ✓ `listAuditLogs`                                      | ✓ `PlatformAuditLogDto`                    | ✓ `GET /platform/audit?tenantId`              | ✓ timeline reconstructed from audit | **Shipped (from audit)**       |
| Provisioning multi-step status                                                                  | ✗                                                | ✗ (single-transaction, no tracking)                    | ✗                                          | ✗                                             | Documented gap                      | **Gap**                        |
| Plan                                                                                            | ✓ `TenantPlan`→`Plan`                            | ✓ `PlanService`                                        | ✓ `PlanDto` / `TenantEntitlementsResponse` | ✓ `GET .../entitlements`, `PUT .../plan`      | ✓                                   | **Shipped**                    |
| Entitlements (plan + override, effective + source)                                              | ✓ `PlanEntitlement`, `TenantEntitlementOverride` | ✓ `getTenantEntitlements`                              | ✓ `TenantEntitlementDto`                   | ✓                                             | ✓                                   | **Shipped**                    |
| Organization profile (legal name, website, industry, description, tz, locale, address, contact) | ✓ `Tenant` cols                                  | ✓ `getTenantOrganization` / `updateTenantOrganization` | ✓ `TenantOrganizationDto`                  | ✓ `GET`/`PATCH .../organization`              | ✓ Organization tab                  | **Shipped (Phase 20)**         |
| Configuration / settings (typed platform settings)                                              | ✗ (no tenant settings model)                     | ✗                                                      | ✗                                          | ✗                                             | Documented gap                      | **Gap**                        |
| Branding (logo, theme, favicon)                                                                 | ✗                                                | ✗                                                      | ✗                                          | ✗                                             | Documented gap                      | **Gap**                        |
| API credentials                                                                                 | ✓ `TenantApiCredential`                          | ✓ `CredentialService`                                  | ✓ `TenantApiCredentialDto`                 | ✓ `GET/POST .../credentials` (+rotate/revoke) | ✓                                   | **Shipped**                    |
| Credential health summary (counts by status)                                                    | ➖ from `TenantApiCredential`                    | ✓ `getTenantOverview`                                  | ✓                                          | ✓ `.../overview`                              | ✓                                   | **Shipped (Phase 19)**         |
| Integrations                                                                                    | ✗ (no integration model)                         | ✗                                                      | ✗                                          | ✗                                             | Documented gap                      | **Gap**                        |
| Usage — API request counts                                                                      | ✗ (no metering)                                  | ✗                                                      | ✗                                          | ✗                                             | Documented gap                      | **Gap**                        |
| Usage — storage                                                                                 | ✗                                                | ✗                                                      | ✗                                          | ✗                                             | Documented gap                      | **Gap**                        |
| Usage — members / users                                                                         | ✓ `TenantMembership` count                       | ✓ `memberCount`, overview breakdown                    | ✓                                          | ✓                                             | ✓                                   | **Shipped (real)**             |
| Credential `lastUsedAt`                                                                         | ✓ field exists                                   | ✗ never written (no usage tracking)                    | ✓ nullable                                 | ✓                                             | ✓ shown as "—" when null            | **Field present, unpopulated** |
| Security (platform access + credential health)                                                  | ➖ from status + credentials                     | ✓ derived in overview                                  | ✓                                          | ✓                                             | ✓ real subset only                  | **Shipped (real subset)**      |
| Security — auth events / suspicious activity per tenant                                         | ✗ (no tenant-scoped auth event store)            | ✗                                                      | ✗                                          | ✗                                             | Documented gap                      | **Gap**                        |
| Audit                                                                                           | ✓ `AuditLog`                                     | ✓ `listAuditLogs`                                      | ✓                                          | ✓ (limit-only)                                | ✓                                   | **Shipped**                    |

## Documented gaps (do not fabricate)

These capabilities appear in the Phase 19 vision but have **no** backing data.
The Control Center surfaces them as honest "not tracked yet" notes so a Super
Admin knows the platform does not measure them — it never shows invented values.

1. **Provisioning status/steps** — `provisionTenant` runs as a single Prisma
   transaction. There is no `ProvisioningStatus` model, no per-step tracking, no
   async workflow. The Overview shows the real provisioning outcome (tenant +
   admin + membership + default role exist) derived from data that was created,
   not a fake progress checklist.
2. **Configuration / settings** — no tenant settings model exists.
3. **Branding** — no logo/theme/favicon model exists. The deterministic
   initials avatar is a UI affordance, not stored branding.
4. **Integrations** — no integration model or service exists.
5. **Usage metering (API requests, storage)** — nothing meters per-tenant API
   requests or storage. `TenantApiCredential.lastUsedAt` exists in the schema
   but is never written, so it is always null; the UI renders "—".
6. **Tenant-scoped security events** — there is no per-tenant authentication or
   suspicious-activity event store. Security is limited to the real, derivable
   signals: platform access state (lifecycle status) and credential health
   (active vs revoked/expired counts).

## What Phase 19 added (all real)

- `GET /platform/tenants/:id/overview` (`platform.tenant.view`) returning a
  `PlatformTenantOverviewDto`: identity, primary administrator (from the oldest
  ACTIVE membership), member status breakdown, credential counts by state, plan
  summary + entitlement/override counts, and lifecycle timestamps — every field
  aggregated from existing tables.
- A deep, tabbed Control Center UI: Overview, Lifecycle, Plan, Entitlements,
  Credentials, Security, Audit — each answering one operational question, with
  loading/empty/error states and permission gating that mirrors the backend.
- Tenant list enrichment: plan and active-credential columns backed by the real
  overview aggregate (fetched lazily; the list stays paginated and fast).

## Contract-first flow (unchanged discipline)

```
@app/api-contracts  →  Platform API route  →  PlatformService  →
platformApi (central service)  →  TanStack Query  →  UI
```

No component calls `fetch()` directly; no endpoint strings live in components.
