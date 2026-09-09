# Phase 20.1 — UI Reconciliation Report

**Phase:** 20.1 (reconciliation & verification)
**Scope:** Confirm the Phase 20 Tenant Organization Profile is reachable and
functional in the active Super Admin UI; fix the smallest broken layer only.

---

## 1. Initial UI issue

Reported symptom: the completed Phase 20 Organization functionality was "not
visible / not reflected" in the running Super Admin UI, despite backend, contracts,
frontend code, tests, and build all reported green.

## 2. Active Tenant Control Center identified

There is exactly **one** tenant detail implementation — no second/stale Control
Center exists. The active chain, verified against the repository:

```
router.tsx  →  path "/tenants/:id"  →  TenantDetailPage
  (apps/super-admin/src/pages/tenant-detail-page.tsx)
    →  tabs[] (useMemo)  →  { value: "organization", label: "Organization" }
      →  tab === "organization"  →  <OrganizationPanel tenantId={id} canEdit={canUpdate} />
        →  platformApi.tenantOrganization / updateTenantOrganization
          →  GET/PATCH /api/v1/platform/tenants/:id/organization
```

## 3. Root cause

The source, contracts, running database, and production bundle are **fully
consistent** — the Organization feature is present and correctly wired at every
layer. The reported "not visible" state could not be reproduced from the code
because there is no code/route/tab/API/DB gap. The remaining explanation is a
**Category B runtime gap** — a stale Vite dev server or cached browser bundle
predating the Phase 20 changes. No running dev server exists in this environment
to reproduce, so the fix for that class of issue is operational (restart the
`apps/super-admin` dev server / hard-refresh), documented under Known Limitations.

During inspection one **real defect** was found and fixed (Category A):
`OrganizationPanel` was not keyed by tenant id, so switching tenants while
mid-edit could retain the previous tenant's edit draft (cross-tenant edit-state
bleed). See §11.

## 4. Files changed

- `apps/super-admin/src/pages/tenant-detail-page.tsx` — keyed the Organization
  panel by tenant id (`<OrganizationPanel key={id} … />`).
- `apps/super-admin/src/pages/tenant-detail-page.test.tsx` — added a cross-tenant
  isolation test.

No backend, contract, migration, or permission changes were required.

## 5. Organization tab status

Registered and rendered. Visible to any operator with `platform.tenant.view`
(the permission already required to load the tenant page). Positioned after
Overview: Overview · **Organization** · Lifecycle · Plan · Entitlements ·
Credentials · Security · Audit.

## 6. API wiring status

Centralized only. The panel calls `platformApi.tenantOrganization(id)` and
`platformApi.updateTenantOrganization(id, body)`, which resolve to
`GET`/`PATCH /api/v1/platform/tenants/:id/organization` through the shared
contract-driven client. No `fetch`/`axios`/hardcoded URLs in the component. The
built bundle contains `ROUTE_TENANT_ORGANIZATION` and the panel labels.

## 7. Permission status

Read gated by `platform.tenant.view`; edit gated by `platform.tenant.update`
(the "Edit organization" action only renders with that permission). No new
permissions introduced.

## 8. Database verification

`prisma migrate status` → up to date (13 migrations). The running `tenants` table
contains all 15 organization columns (`legalName, website, industry, description,
timeZone, locale, addressLine1, addressLine2, city, region, postalCode, country,
contactName, contactEmail, contactPhone`). Existing tenants have these fields
`null` (honest empty state, no fabricated data). Migration matches the DB.

## 9. Save / update verification

Backend route + service tests confirm: partial update (only provided keys),
empty-string clears to NULL, server-side validation of website/email/country,
and 200/404/403/400 paths. Frontend tests confirm the edit form sends only
changed fields and refreshes the query on success.

## 10. Audit verification

`updateTenantOrganization` records `TENANT_ORGANIZATION_UPDATED` with the changed
field NAMES only (no values), surfaced by the existing Audit tab. Covered by the
backend test asserting the action + `metadata.changed`.

## 11. Tenant switching verification

Query key is tenant-scoped: `["platform","tenant",tenantId,"organization"]`, so
Tenant A and Tenant B never share a cache entry. **Fix applied:** the panel is
now keyed by `id`, forcing a full remount (and edit-draft reset) on tenant change.
New test `loads the correct tenant's organization (cross-tenant isolation)`
renders `/tenants/t2` and asserts t2's data renders, t1's does not, and the API
was called with `t2` (never `t1`).

## 12. Error-state verification

The panel renders a loading skeleton, an `ErrorState` (with request id + retry)
on failure, and an honest empty view when no fields are set. A frontend test
confirms an invalid website blocks save client-side; backend tests confirm the
server rejects invalid website/email and returns 403/404 appropriately.

## 13. Browser / network verification

Not reproducible headlessly (no browser/dev server in this environment). Static
verification instead: Vite proxies `/api` → `http://localhost:3000`,
`VITE_API_BASE_URL` defaults to `/api/v1`, and the client attaches the platform
bearer token with no `X-Tenant-Id` header — so the browser talks only to the
Platform API. No direct Tenant API call path exists in the component.

## 14. Test results

- Super Admin: **43 passed** (7 files), incl. the new cross-tenant isolation test.
- Platform API: **257 passed** (27 files).

## 15. Typecheck

`contracts` PASS · `platform-api` PASS · `super-admin` PASS.

## 16. Lint

0 errors (2 pre-existing warnings in unrelated auth files; not introduced here).

## 17. Build

Full build succeeds (contracts + platform-api + super-admin). Fresh bundle
(`index-BraaeK7Y.js`) contains the Organization implementation; no test files
shipped in either `dist`.

## 18. Boundary tests

API-drift PASS (no hardcoded `/api/v1` paths in components). Boundary PASS (no
admin app, no logistics modules/dependencies/DB models). `super-admin →
platform-api → Platform DB` boundary intact; no Logistics DB access.

## 19. Known limitations

- The original "not visible" symptom is consistent with a **stale dev server or
  cached browser bundle**, which cannot be reproduced in this headless
  environment. Operational fix: restart the `apps/super-admin` dev server and
  hard-refresh the browser; the source/bundle already contain the feature.
- `prisma migrate dev` still trips on the pre-existing unrelated shadow-DB issue
  in `20260908085130_sync_schema` (not touched here). The Phase 20 migration was
  applied and is recorded as applied; `migrate status` is clean.

## 20. Deferred work

Unchanged from Phase 20 and NOT implemented here: logo/branding storage,
integrations, usage metering, security-event store, tax/registration id,
currency, custom domain. No scope expansion occurred.

## 21. Final Phase 21 readiness

```
✓ Super Admin UI reflects Phase 20 (Organization tab wired end-to-end)
✓ Organization data is real (Platform DB columns, honest nulls)
✓ Organization CRUD works (read + partial update, validated + audited)
✓ Audit works (TENANT_ORGANIZATION_UPDATED)
✓ Platform DB is authoritative
✓ Tenant Control Center remains platform-level
✓ No Logistics operational UI leakage
✓ No direct Tenant DB access
```

---

## Source vs Runtime reconciliation

| Capability           | Source Code |  Route Registered  |         UI Wired          |        API Called        |   DB Data    | Verified |
| -------------------- | :---------: | :----------------: | :-----------------------: | :----------------------: | :----------: | :------: |
| Organization tab     |      ✓      | ✓ (`/tenants/:id`) |             ✓             |            —             |      —       |    ✓     |
| Organization read    |      ✓      |         ✓          |             ✓             |  `GET .../organization`  | ✓ cols exist |    ✓     |
| Organization edit    |      ✓      |         ✓          | ✓ (gated `tenant.update`) | `PATCH .../organization` |      ✓       |    ✓     |
| Organization address |      ✓      |         ✓          |             ✓             |     via read/update      |    ✓ cols    |    ✓     |
| Business contact     |      ✓      |         ✓          |             ✓             |     via read/update      |    ✓ cols    |    ✓     |
| Audit event          |      ✓      |         ✓          |       ✓ (Audit tab)       |      server-emitted      |  ✓ AuditLog  |    ✓     |

## Per-issue log

**Issue: cross-tenant edit-state bleed in the Organization panel**

- Problem: switching tenants mid-edit could keep the prior tenant's draft (panel
  local state not reset on `tenantId` change).
- Root cause: `<OrganizationPanel>` rendered without a React `key`, so React
  reused the instance across tenant navigations.
- Fix: key the panel by tenant id (`key={id}`) so it remounts and resets edit
  state — matching the existing `EditTenantDialog` keying pattern.
- Validation: new frontend test renders `/tenants/t2`, asserts t2 data renders,
  t1 data absent, and `tenantOrganization` called with `t2` not `t1`; full suite
  green (43 FE / 257 BE), typecheck/lint/build/boundary/drift pass.

**Issue: reported "Organization not visible" in the running UI**

- Problem: feature appeared absent in the browser.
- Root cause: not a code gap — source, contracts, DB, and production bundle all
  contain the feature and are consistent. Consistent with a stale dev server /
  cached bundle (Category B), unreproducible headlessly.
- Fix: none in code required; operational (restart dev server / hard refresh).
- Validation: confirmed the built bundle contains the Organization endpoints and
  labels; confirmed DB columns exist; confirmed the single active route chain.
