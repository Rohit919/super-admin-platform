# PHASE 21 — Super Admin ↔ Tenant Platform Integration — Report

Status legend: **IMPLEMENTED** · **DEFERRED** · **BLOCKED** · **N/A**

## Executive Summary

Phase 21 establishes a secure, production-shaped server-to-server (S2S)
control-plane connection from the **Super Admin Platform** to a **Tenant
runtime** (`Fastify-MasterApp`), with **branding synchronization** as the
first-class capability. The Super Admin manages the tenant's persisted branding
and inspects its runtime through the Platform API, which calls the Tenant API
over authenticated S2S. The Tenant API remains the only boundary into the tenant
runtime; the Tenant Admin remains independently deployable and keeps reading its
own `GET /api/v1/branding` with `DEFAULT_BRANDING` fallback intact.

Branding is **IMPLEMENTED** end-to-end. Provisioning, lifecycle, and entitlement
sync are **DEFERRED/BLOCKED** because the tenant runtime has no corresponding
domain — per the Phase 21 stop conditions, these were not invented.

All work is verified: **516 tests pass** across the three packages (Tenant 203,
Platform API 266, Super Admin 47), both repos build, lint (0 errors), typecheck,
boundary, and API-drift checks pass.

## Repository Inspection — IMPLEMENTED

Both repositories are local and were inspected before any change:

- **Super Admin Platform** — `/Users/mac/Backend/Super-Admin-Platform`
- **Tenant** — `/Users/mac/Backend/Fastify-Master` (remote
  `Rohit919/Fastify-MasterApp`, branch `connec-with-super-admin`).

Both are Fastify + TypeBox + Prisma + a shared `@app/api-contracts` package
(separate per repo). The Platform is a mature control plane (Tenant model,
`TenantApiCredential`, `platform.*` RBAC, audit, SSRF + circuit-breaker
utilities). The Tenant is essentially a single-tenant reference app.

## Existing Tenant Architecture — IMPLEMENTED (findings)

- Modules are vertical slices (`<name>.routes.ts` FastifyPluginAsyncTypebox);
  `health`/`branding` self-declare full paths under the `/api/v1` wrapper.
- Auth is **user-JWT only** (HS256). **No S2S / API-key / HMAC** system existed.
- **Single-tenant**: no `Tenant` model, no `tenantId`, no tenant resolution.
- **No** Plan/Subscription/Entitlement/Quota models; **no** lifecycle status
  enum; **no** provisioning domain.

## Existing Branding Architecture — IMPLEMENTED (findings)

- `GET /api/v1/branding` was **static/env-based** (`BRAND_*`), read-only, with
  **no persistence and no write endpoint**.
- Admin frontend `apps/admin/src/branding/*` uses the shared `AppBranding`
  contract, `DEFAULT_BRANDING` fallback, `validateBranding`, and localStorage
  caching. `branding.utils.test.ts` continues to pass.

## Architecture Decision — IMPLEMENTED

- **Source of truth:** the Tenant runtime becomes the persisted owner of
  branding (new `TenantBranding` row). Platform manages it via the Tenant API.
  No duplicate Platform branding store.
- **S2S:** new shared-secret bearer scheme on the tenant side (fail-closed,
  constant-time, scoped), with a configured tenant identity.
- The public `GET /api/v1/branding` now serves persisted branding, falling back
  to env/`DEFAULT_BRANDING`.

## S2S Authentication — IMPLEMENTED

`apps/api/src/modules/platform-integration/platform.auth.ts`:
`requirePlatformService(scope)` — bearer verified with `timingSafeEqual`,
fail-closed when `PLATFORM_S2S_SECRET` unset, scope enforced, tenant identity
validated. Platform presents the secret from env via `TenantPlatformClient`.

## Service Credentials — IMPLEMENTED

Shared secret provisioned out-of-band on both sides (`PLATFORM_S2S_SECRET` /
`TENANT_API_S2S_SECRET`, ≥32 chars). Never stored in the Platform DB, never sent
to the browser, never logged. Distinct from the existing customer-facing
`TenantApiCredential` (inbound tenant→platform) primitive.

## Scopes — IMPLEMENTED

`platform.health.read`, `platform.runtime.read`, `platform.branding.read`,
`platform.branding.write`. Missing scope ⇒ 403. Configured via
`PLATFORM_S2S_SCOPES`.

## Tenant Isolation — IMPLEMENTED

`x-platform-tenant-id` is validated against the runtime's `PLATFORM_TENANT_ID`;
a mismatched tenant is rejected with 403. Covered by cross-tenant tests.

## Internal API — IMPLEMENTED

`/api/v1/internal/platform/{health,runtime,branding}` — S2S-guarded,
backend-to-backend only, documented via Swagger schema metadata.

## Health — IMPLEMENTED

`GET /internal/platform/health` → `{ status: "ok" }` (authenticated, minimal).

## Runtime — IMPLEMENTED

`GET /internal/platform/runtime` → `{ tenantId, status, environment, version? }`.
DB probe failure yields `degraded`. No secrets in the payload (asserted in tests).

## Branding Synchronization — IMPLEMENTED

`PUT /internal/platform/branding` persists a partial update (re-validated,
sanitized) and returns the canonical `AppBranding`. Platform `PATCH
/platform/tenants/:id/branding` proxies it. Tenant Admin then reads the updated
branding via `GET /api/v1/branding`. Full data-flow test exercises persisted →
public read.

## Provisioning — BLOCKED

No provisioning domain exists in the tenant runtime. Not implemented (not
invented). Recommended next step: define a tenant provisioning workflow in the
Tenant app first, then add `POST /internal/platform/provision`.

## Lifecycle — BLOCKED

The tenant runtime is single-tenant with no lifecycle state
(ACTIVE/SUSPENDED/PENDING). Activate/suspend have no meaning there. Not
implemented. (Note: the _Platform's own_ `Tenant.status` lifecycle already
exists at the platform level and is unchanged.)

## Entitlements — BLOCKED

No plan/subscription/entitlement/quota model exists in the tenant runtime.
Entitlement sync was not implemented. Recommended next step: introduce an
entitlement enforcement model in the Tenant app, then add
`POST /internal/platform/entitlements/sync`.

## Idempotency — IMPLEMENTED

Branding GET/PUT are idempotent and retry-safe (partial replacement keyed by
tenant identity; retries converge to the same state).

## Request Correlation — IMPLEMENTED

Platform `request.id` is propagated to the Tenant API as `x-request-id`.

## Audit — IMPLEMENTED

Branding writes audited on both sides with **changed field names only** — no
values, no secrets. Platform `TENANT_BRANDING_UPDATED`, tenant
`PLATFORM_BRANDING_UPDATED`.

## Security — IMPLEMENTED

Fail-closed S2S, constant-time secret compare, explicit scopes, tenant-identity
validation, SSRF-validated outbound URLs (https-only in prod), explicit
timeouts, no secrets in logs/audit/frontend, internal endpoints separated from
public customer APIs. Recommended: place `/internal/platform/*` on a private
network in production.

## Frontend Integration — IMPLEMENTED

Tenant Control Center **Branding** tab
(`apps/super-admin/src/pages/tenant-detail-page.tsx`) + `platformApi`
methods, all via the central API client and shared contracts (no hardcoded
URLs; API-drift check passes). Connection status card shows reachable/
unreachable truthfully. Edit gated on `platform.tenant.update`.

## Database Changes — IMPLEMENTED (migration authored; apply pending)

Tenant: new `TenantBranding` model (table `tenant_branding`). `prisma generate`
was run AND the SQL migration is committed at
`prisma/migrations/20260909000000_add_tenant_branding/migration.sql` — its DDL
was verified to match Prisma's canonical output (`prisma migrate diff
--from-empty`). It still must be **applied** against a live DB
(`prisma migrate deploy` in prod / `migrate dev` locally) — no DB was reachable
in the implementation environment. Platform: **no** schema change (branding not
stored on the Platform).

## Environment Variables — IMPLEMENTED

- Tenant: `PLATFORM_S2S_SECRET` (optional, fail-closed), `PLATFORM_TENANT_ID`,
  `PLATFORM_S2S_SCOPES`. Added to `.env.example`.
- Platform: `TENANT_API_BASE_URL`, `TENANT_API_S2S_SECRET`,
  `TENANT_API_TIMEOUT_MS`, `TENANT_API_ALLOW_HTTP`. Added to `.env.example`.

## Tests — IMPLEMENTED

- Tenant `platform-integration` (16): S2S valid/missing/invalid/disabled, scope
  enforcement, tenant isolation (match/mismatch), runtime (no secrets), branding
  get/update/partial/invalid, public fallback. Branding suite (2) unchanged.
  Full suite: **203 pass**.
- Platform `tenant-platform` (9): authz (no membership / no perm / view-only
  can't update), branding read+update proxy (bearer + tenant-id + request-id
  headers asserted), audit (changed fields, no secret), connection reachable/
  unreachable, integration-disabled 503, unknown-tenant 404. Full suite:
  **266 pass**.
- Super Admin branding panel (3): shows branding + connection, submits
  only-changed partial body, hides edit without update permission. Full suite:
  **47 pass**.

## Files Changed

**Tenant (`Fastify-Master`)**

- `packages/api-contracts/src/branding.ts` (+`UpdateBrandingBody`)
- `packages/api-contracts/src/platform-internal.ts` (new)
- `packages/api-contracts/src/endpoints/platform-internal.ts` (new)
- `packages/api-contracts/src/contracts/platform-internal.ts` (new)
- barrels: `index.ts`, `endpoints/index.ts`, `contracts/index.ts`
- `prisma/schema.prisma` (+`TenantBranding`)
- `apps/api/src/config/env.ts` (+`PLATFORM_S2S_*`, `PLATFORM_TENANT_ID`)
- `apps/api/src/core/audit/audit.service.ts` (+`PlatformBrandingUpdated`)
- `apps/api/src/modules/platform-integration/{platform.auth,branding.store,platform.routes}.ts` (new)
- `apps/api/src/modules/branding/{branding.env.ts (new),branding.routes.ts}`
- `apps/api/src/app.ts`, `apps/api/src/core/testing/test-app.ts`
- `apps/api/src/modules/platform-integration/__tests__/platform-integration.test.ts` (new)
- `.env.example`

**Platform (`Super-Admin-Platform`)**

- `packages/api-contracts/src/tenant-platform.ts` (new)
- `packages/api-contracts/src/endpoints/platform.ts`, `contracts/platform.ts`
- barrels: `index.ts`, `contracts/index.ts`
- `apps/platform-api/src/config/env.ts` (+`TENANT_API_*`)
- `apps/platform-api/src/core/audit/audit.service.ts` (+`TenantBrandingUpdated`)
- `apps/platform-api/src/modules/platform/{tenant-platform.client,tenant-platform.service,tenant-platform.routes}.ts` (new)
- `apps/platform-api/src/app.ts`, `apps/platform-api/src/core/testing/test-app.ts`
- `apps/platform-api/src/modules/platform/__tests__/tenant-platform.test.ts` (new)
- `apps/super-admin/src/modules/platform/platform.api.ts`
- `apps/super-admin/src/pages/tenant-detail-page.tsx`
- `apps/super-admin/src/pages/tenant-branding-panel.test.tsx` (new)
- `.env.example`
- `docs/PLATFORM-INTEGRATION.md`, `docs/BRANDING-INTEGRATION.md` (new)

## Deployment Requirements

1. Generate/apply the `TenantBranding` migration on the tenant DB.
2. Set `PLATFORM_S2S_SECRET` + `PLATFORM_TENANT_ID` on the tenant runtime.
3. Set `TENANT_API_BASE_URL` + `TENANT_API_S2S_SECRET` (matching) on the
   Platform; keep `TENANT_API_ALLOW_HTTP=false` (https) in production.
4. Restrict `/api/v1/internal/platform/*` to a private network where possible.

## Deferred Items

- Provisioning, lifecycle activate/suspend, entitlement sync (no tenant domain).
- Binary asset (logo/favicon) upload/storage — currently URL references only.
- Multi-runtime per-tenant connection resolution from a secrets store.
- SQL migration file generation (requires DB access).

## Blocked Items

- Same three domains above are blocked on missing tenant-side domains, not on
  the integration itself. Each has a documented recommended next step.

## Risks

- **Contract drift:** the two repos have separate `@app/api-contracts`; the
  mirrored `TENANT_INTERNAL_ENDPOINTS` / `TenantRuntimeInfo` must be kept in sync
  with the tenant's `PLATFORM_INTERNAL_ENDPOINTS` / `PlatformRuntime`.
- **Secret management:** S2S secret lives in env; rotate by updating both sides.
- **Migration:** running the app against the tenant DB requires the
  `TenantBranding` migration first.

## Post-review hardening

- **Circuit breaker fixed properly.** `core/circuit-breaker.ts` previously cached
  one action per service name and replayed the first call's closure/arguments.
  It now caches only circuit STATE: the breaker action is a generic thunk-runner
  and the current operation is passed per call via `fire(thunk)`. The
  `TenantPlatformClient` was routed back through `withCircuitBreaker` (one
  breaker per Tenant API host; `CircuitOpenError` → `TenantUnreachableError`),
  keeping the explicit AbortSignal timeout. Regression test added
  (`core/__tests__/circuit-breaker.test.ts`, 3 tests) proving the current
  operation runs, arguments are not replayed, and the abort signal fires.
- **Migration authored** (see Database Changes).
- **E2E script committed:** `scripts/phase21-e2e.mjs` runs the real S2S flow +
  security cases against a live Tenant API (see Final Verification).

## Final Verification

- Tenant: 203 tests, build OK, lint 0 errors, api-drift OK, tsc OK.
- Platform API: **269 tests** (266 + 3 circuit-breaker), build OK, lint 0
  errors, boundary OK, api-drift OK, tsc OK.
- Super Admin: 47 tests, vite build OK, tsc OK.
- **Live two-server E2E: pending environment.** No running DB / deployed tenant
  was available in the implementation environment, so a live run was not
  performed and is not claimed. A runnable script — `scripts/phase21-e2e.mjs` —
  is committed and exercises the real path against a running Tenant API:
  functional (health, runtime, get/partial-update branding, public-branding
  reflects the update) and security (missing secret → 401, wrong secret → 401,
  wrong tenant → 403, invalid payload → 400). Run it with `TENANT_API_BASE_URL`,
  `PLATFORM_S2S_SECRET`, `PLATFORM_TENANT_ID` set once both servers are up, then
  do the manual UI-through-Platform check it prints.
