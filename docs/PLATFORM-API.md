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

| Method | Path                                  | Permission                | Success | Notes                                                                                                                                                            |
| ------ | ------------------------------------- | ------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/platform/dashboard`          | `platform.dashboard.view` | 200     | Tenant + user counts (total/active/trial/suspended/archived/users).                                                                                              |
| GET    | `/api/v1/platform/tenants`            | `platform.tenant.view`    | 200     | Paginated. Optional `?status=TRIAL\|ACTIVE\|SUSPENDED\|ARCHIVED`, `?q=` (name/slug search), `?page=`/`?pageSize=`. Returns `{ data, meta }` (offset pagination). |
| POST   | `/api/v1/platform/tenants`            | `platform.tenant.create`  | 201     | Provisions tenant + admin user + membership + default tenant role (one transaction).                                                                             |
| GET    | `/api/v1/platform/tenants/:id`        | `platform.tenant.view`    | 200     | Single tenant with member count.                                                                                                                                 |
| PATCH  | `/api/v1/platform/tenants/:id`        | `platform.tenant.update`  | 200     | Update platform metadata (`{ name }`). `slug` is immutable. Audited `TENANT_UPDATED`.                                                                            |
| PATCH  | `/api/v1/platform/tenants/:id/status` | `platform.tenant.suspend` | 200     | suspend/reactivate. Transition to `ARCHIVED` additionally requires `platform.tenant.archive` (checked inline).                                                   |
| GET    | `/api/v1/platform/users`              | `platform.user.view`      | 200     | Users holding a `PlatformMembership`, with platform roles + membership status.                                                                                   |

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

## 5. Platform API surface — current status (Phase 20.2 updated)

| Endpoint group                               | Status                     | Notes                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/platform/dashboard`                        | ✅ Implemented             | Live.                                                                                                                                                                                                                                                                                   |
| `/platform/tenants`, `/platform/tenants/:id` | ✅ Implemented             | List, create, get, status, overview, organization.                                                                                                                                                                                                                                      |
| `/platform/tenants/:tenantId/credentials`    | ✅ Implemented             | Create/list/rotate/revoke; `TenantApiCredential` table exists.                                                                                                                                                                                                                          |
| `/platform/audit`                            | ✅ Implemented             | `GET /platform/audit` with filters; `platform.audit.view` permission.                                                                                                                                                                                                                   |
| `/platform/users`                            | ✅ Implemented (read)      | List platform users.                                                                                                                                                                                                                                                                    |
| `/platform/roles`                            | ⏭ **Out of current scope** | Platform RBAC _enforcement_ is active (`requirePlatformPermission`). A CRUD UI for managing roles is intentionally outside the current Super Admin product scope (Phase 20.2). Registry keys exist; no routes are planned until a future phase explicitly approves RBAC administration. |
| `/platform/permissions`                      | ⏭ **Out of current scope** | Same as roles — permissions work as authorization controls. No management endpoint is required or planned.                                                                                                                                                                              |
| `/platform/settings`                         | ⏸ **Deferred**             | No approved settings domain, persistence model, API, or authorization model exists. Do not build a placeholder.                                                                                                                                                                         |

Platform RBAC _enforcement_ (`requirePlatformPermission`, `PlatformMembership` gate, `platform.*` permission resolution) remains fully active and is **not** affected by the absence of CRUD screens.

**No deferred endpoints are stubbed.** Routes are added only when a concrete feature, model, and product approval exist.

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

Phase 6 verified the `/api/v1/platform/*` surface. Phase 20.2 updated §5 to reflect the current implementation state (credentials and audit are implemented; platform roles/permissions administration is intentionally out of current scope, not merely deferred; settings is deferred pending a real settings domain). Platform RBAC enforcement remains fully intact.
