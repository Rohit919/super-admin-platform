# Platform API

**Phase 6 — Platform API** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §11).

This documents the **implemented** platform (Super Admin) HTTP surface under
`/api/v1/platform/*`: how it is registered, the per-endpoint auth + permission
contract, the response/error envelope, the guarantee that platform routes never
fall back to tenant context, and an honest map of which plan-listed endpoints
exist today vs are deferred to later phases. Verification + documentation only —
no schema, migration, or database command changes.

---

## 1. Base path & registration

All platform routes live under:

```text
/api/v1/platform/*
```

Registration (`apps/platform-api/src/app.ts`): `platformRoutes` is registered
with prefix `/platform` inside the versioned group whose prefix is
`${API_PREFIX}/${API_VERSION}` (`/api` + `/v1`). Routes are defined in
`modules/platform/platform.routes.ts`; business logic is in
`modules/platform/platform.service.ts`. Contracts (paths, params, bodies,
responses, permissions) come from `@app/api-contracts`
(`PLATFORM_CONTRACTS`, `PLATFORM_ENDPOINTS`) so the API, the Super Admin client,
and tests share one source of truth.

## 2. Per-endpoint contract

Every platform route applies the same two-stage gate:

```text
preValidation: [authenticate]                     → identity (JWT verified)
preHandler:    [requirePlatformPermission(key)]   → ACTIVE PlatformMembership
                                                    + platform.* permission
```

Request flow:

```text
Authentication
      ↓
Platform Membership   (ACTIVE, else 403 PLATFORM_ACCESS_DENIED)
      ↓
Platform Permission   (platform.* resolved with NO tenant scope)
      ↓
Handler
      ↓
Platform DB           (raw Prisma client, explicit cross-tenant)
```

Every endpoint therefore has **explicit authentication and authorization
requirements** (plan §16). There is no unauthenticated or unauthorized platform
route.

## 3. Implemented endpoints

| Method | Path                                  | Permission                | Success | Notes                                                                                                          |
| ------ | ------------------------------------- | ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/platform/dashboard`          | `platform.dashboard.view` | 200     | Tenant + user counts (total/active/trial/suspended/archived/users).                                            |
| GET    | `/api/v1/platform/tenants`            | `platform.tenant.view`    | 200     | Optional `?status=TRIAL\|ACTIVE\|SUSPENDED\|ARCHIVED`.                                                         |
| POST   | `/api/v1/platform/tenants`            | `platform.tenant.create`  | 201     | Provisions tenant + admin user + membership + default tenant role (one transaction).                           |
| GET    | `/api/v1/platform/tenants/:id`        | `platform.tenant.view`    | 200     | Single tenant with member count.                                                                               |
| PATCH  | `/api/v1/platform/tenants/:id/status` | `platform.tenant.suspend` | 200     | suspend/reactivate. Transition to `ARCHIVED` additionally requires `platform.tenant.archive` (checked inline). |
| GET    | `/api/v1/platform/users`              | `platform.user.view`      | 200     | Users holding a `PlatformMembership`, with platform roles + membership status.                                 |

### 3.1 Response envelope

Success responses use the canonical envelope:

```json
{ "success": true, "data": {/* DTO or array */} }
```

### 3.2 Error codes

Failures flow through the global error handler into the standard error envelope.
Platform endpoints document these codes (per contract):

- `UNAUTHORIZED` (401) — missing/invalid token.
- `PLATFORM_ACCESS_DENIED` (403) — no membership, inactive membership, or missing
  `platform.*` permission (uniform, non-enumerating).
- `NOT_FOUND` (404) — e.g. unknown tenant id.
- `VALIDATION_ERROR` (400) — schema violations.
- `CONFLICT` (409) — e.g. duplicate tenant slug on provisioning.

## 4. No silent tenant fallback (guarantee)

Platform routes are the **authorized cross-tenant surface** and must never be
silently tenant-scoped (plan §11: "Platform routes must not silently fall back
to tenant context"). Verified in code:

- `modules/platform/*` contains **no** reference to `requireTenant`,
  `request.tenant`, `tenantDb`, or `getTenantDb`.
- `PlatformService` uses the **raw** Prisma client directly and explicitly;
  cross-tenant reads/writes (e.g. counting all tenants, listing all platform
  users) are intentional, not accidental.
- Platform permission resolution uses **no** `tenantId`, so the active-tenant
  context (if any) cannot influence platform authorization.

A platform operator typically has **no** active tenant at all; the platform
surface does not require or assume one.

## 5. Plan §11 endpoint map — implemented vs deferred

| Plan §11 module                              | Status                     | Notes                                                                                                                                              |
| -------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/platform/dashboard`                        | ✅ Implemented             | §3                                                                                                                                                 |
| `/platform/tenants`, `/platform/tenants/:id` | ✅ Implemented             | list/create/get/status (§3)                                                                                                                        |
| `/platform/tenants/:tenantId/credentials`    | ⏳ Deferred → **Phase 9**  | No routes yet; `TenantApiCredential` model does not exist yet (do not add now).                                                                    |
| `/platform/users`                            | ✅ Implemented (read)      | List only. Create/update/suspend are deferred (registry keys `platform.user.create/update/suspend` exist).                                         |
| `/platform/roles`, `/platform/permissions`   | ⏳ Deferred                | Registry keys (`platform.role.*`, `platform.permission.view`) exist; no platform-scoped routes yet. General RBAC admin lives under `/admin` today. |
| `/platform/audit`                            | ⏳ Deferred → **Phase 10** | `AuditLog` model + `AuditService` exist; no `/platform/audit` read route yet (`platform.audit.view` key reserved).                                 |

**Deferred endpoints are intentionally not stubbed.** Per the operating rules,
routes are added only when their concrete feature (and any required model) is
built in the owning phase — no placeholder handlers, no invented persistence.

## 6. Module structure

```text
apps/platform-api/src/modules/platform/
├── platform.routes.ts     # route definitions + guards + schemas (contract-driven)
├── platform.service.ts    # PlatformService: dashboard, tenant list/get/status, provisioning, platform users
└── __tests__/platform.test.ts
```

Supporting pieces (shared, outside the module):

- `core/platform/require-platform.ts` — `requirePlatform`, `requirePlatformPermission`.
- `core/platform/platform.service.ts` — the membership-gate service (`fastify.platform`).
- `core/authorization/*` — the RBAC engine used by the permission check.

> Naming note: there are two `PlatformService` classes with distinct roles — the
> **module** service (`modules/platform/platform.service.ts`, business
> operations) and the **core gate** service (`core/platform/platform.service.ts`,
> `isActivePlatformMember`). This is pre-existing; documented here to avoid
> confusion.

## 7. Test coverage (existing)

`modules/platform/__tests__/platform.test.ts` exercises the surface end-to-end
via the mock-based harness: the auth/permission gate on `/dashboard`,
provisioning (`POST /tenants`) including the full transaction and duplicate-slug
`409`, and status transitions including the archive privilege check. Combined
with the RBAC tests (`modules/roles/__tests__`), the platform API's security
properties are covered without a live database.

---

## Gate

Phase 6 verifies and documents the `/api/v1/platform/*` surface: base path and
registration, the uniform authenticate + `requirePlatformPermission` contract on
every endpoint, the canonical success/error envelopes, the no-silent-tenant-
fallback guarantee (platform ops use the raw client explicitly), and an honest
map of implemented vs deferred plan endpoints (credentials → Phase 9, audit →
Phase 10, platform roles/permissions and user mutations reserved). No new API
code, schema, migration, or database command was required; existing tests pass.
