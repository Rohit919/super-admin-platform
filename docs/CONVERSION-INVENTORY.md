# Conversion Inventory

**Phase 0 — Repository Discovery** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §5).

This document inventories the copied repository _before_ schema/database work
begins, and classifies every component so later phases have a grounded map of
what to keep, adapt, or remove.

> **Status update (post-Phase 3):** Two structural changes have occurred since
> this inventory was first written:
>
> 1. `apps/api` was renamed to **`apps/platform-api`** (npm package still
>    `@app/api`). Path references below reflect the new location.
> 2. The tenant Admin frontend **`apps/admin` has been removed**, and the repo
>    is now a **platform-only monorepo** (`platform-api` + `super-admin` +
>    `packages/api-contracts`). Rows below that reference `apps/admin` are
>    **historical** — that app and its workspace wiring (scripts, eslint glob,
>    lockfile entry, drift-scan dir) no longer exist. The shared authentication
>    endpoints remain a general identity boundary (see
>    `docs/PLATFORM-AUTHENTICATION.md`).

---

## 0. Executive Summary — how reality differs from the plan

The conversion plan (§2, §3, §8, §16) assumes a raw copy of a **logistics**
application that must be split into two independently deployable systems with
**two separate databases** (`platform_db` vs `logistics_db`) and a strict
Platform-API → Logistics-API HTTP boundary.

The repository as it actually exists is **already much further along and
architected differently**:

1. **No logistics domain is present.** There are no `Shipment`, `Order`,
   `Driver`, `Vehicle`, `Warehouse`, or `Route` models or modules. The only
   business-ish models are `Todo` and `Example`, which are _reference/demo_
   implementations (Golden Orchestrator sample + direct-Prisma sample), not a
   logistics business plane.
2. **It is one control-plane application, not two systems.** Platform (Super
   Admin) and tenant concerns live in a single Fastify API + single Prisma
   schema + single Postgres database. The platform layer is implemented as an
   **authorized cross-tenant surface** (documented intentionally in
   `docs/super-admin/MULTI-TENANT-ARCHITECTURE.md`), not as a service that calls
   a separate logistics API.
3. **The platform vertical is substantially built.** Platform membership gate,
   permission-based platform RBAC, `/api/v1/platform/*` routes, tenant
   lifecycle (list/create/get/status), tenant provisioning in a transaction, a
   dedicated `apps/super-admin` React frontend, shared contracts, and passing
   boundary tests all exist today.

**Consequences for later phases:**

- The two-database split (plan §8) and the Platform→Logistics API integration
  (plan §16) describe a _different target topology_ than this repo implements.
  They should not be executed blindly. If a genuinely separate logistics system
  exists elsewhere, integration is a net-new build; if not, the "business plane"
  here is the tenant-scoped layer inside the same app. This needs an explicit
  decision from the maintainer before Phases 8/11 (see §7 Open Questions).
- `TenantApiCredential` (plan §9/§14) does **not** exist yet — it is net-new
  work, not an adaptation.
- Repository identity (plan §6) is the most clearly actionable near-term gap:
  names/titles still say "Fastify … Monorepo" / "Logistics".

The classifications below reflect the code that is actually present.

---

## 1. Entry points & bootstrap

| Component            | Path                                                                          | Classification              | Notes                                                                                     |
| -------------------- | ----------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| API server bootstrap | `apps/platform-api/src/server.ts`, `telemetry.ts`, `secrets.ts`               | KEEP · REUSE PATTERN        | Process lifecycle, OTel, secrets loading. Generic infra.                                  |
| App composition      | `apps/platform-api/src/app.ts`                                                | KEEP · ADAPT                | Fastify instance + plugin/module registration. Adapt only when modules are added/removed. |
| Super Admin entry    | `apps/super-admin/src/main.tsx`, `app/{providers,router,protected-route}.tsx` | KEEP · PLATFORM-ONLY        | Independent React app already scaffolded.                                                 |
| Tenant Admin entry   | `apps/admin/src/main.tsx`, `app/*`                                            | KEEP · not part of platform | Separate tenant-facing app; leave unchanged unless a phase requires it.                   |

---

## 2. Workspace & build configuration

| Component                 | Path                                                         | Classification       | Notes                                                                                                                                |
| ------------------------- | ------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Root workspace manifest   | `package.json` (`fastify-admin-monorepo`)                    | ADAPT                | npm workspaces + scripts are good; **name/identity** needs updating (Phase 1). Has `dev:/build:/typecheck` for all three workspaces. |
| API package               | `apps/platform-api/package.json` (`@app/api`)                | KEEP · REUSE PATTERN | tsup build, vitest, tsx dev.                                                                                                         |
| Super Admin package       | `apps/super-admin/package.json` (`@app/super-admin`)         | KEEP · PLATFORM-ONLY | React 18 + Vite + TanStack Query + Zustand.                                                                                          |
| Contracts package         | `packages/api-contracts/package.json` (`@app/api-contracts`) | KEEP · REUSE PATTERN | Shared TypeBox contracts; consumed by all apps via path alias.                                                                       |
| ESLint / Prettier / Husky | `eslint.config.js`, `.husky/*`, `lint-staged`                | KEEP                 | Engineering conventions worth preserving (plan §2).                                                                                  |
| Vite configs              | `apps/*/vite.config.ts`                                      | KEEP                 | super-admin on :5174, admin on :5173; both proxy `/api` → :3000.                                                                     |

---

## 3. Fastify plugins (infrastructure)

| Plugin          | Path                                   | Classification           | Notes                                                                                                                              |
| --------------- | -------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `env`           | `apps/platform-api/src/plugins/env.ts` | KEEP · ADAPT             | `@fastify/env` schema. Env prefixes/branding to review in Phase 1/15.                                                              |
| `cors`          | `plugins/cors.ts`                      | KEEP                     | Origin allowlist.                                                                                                                  |
| `redis`         | `plugins/redis.ts`                     | KEEP · REUSE PATTERN     | Rate-limit store + BullMQ. Fails open.                                                                                             |
| `queue`         | `plugins/queue.ts`                     | KEEP · REUSE PATTERN     | BullMQ. Currently no platform jobs.                                                                                                |
| `db`            | `plugins/db.ts`                        | KEEP                     | Prisma client decorator.                                                                                                           |
| `auth`          | `plugins/auth.ts`                      | KEEP · REUSE PATTERN     | JWT (HS256, `alg:none` blocked), `authenticate`/`authorize` decorators, `JWTPayload` (id/email/role/tenantId?/permissionVersion?). |
| `authorization` | `plugins/authorization.ts`             | KEEP · PLATFORM-RELEVANT | Decorates `fastify.authorization` (RBAC engine).                                                                                   |
| `platform`      | `plugins/platform.ts`                  | KEEP · PLATFORM-ONLY     | Decorates `fastify.platform` (membership gate service).                                                                            |
| `metrics`       | `plugins/metrics.ts`                   | KEEP                     | Prometheus.                                                                                                                        |
| `swagger`       | `plugins/swagger.ts`                   | KEEP · ADAPT             | OpenAPI metadata to rebrand (Phase 1).                                                                                             |
| `csrf`          | `plugins/csrf.ts`                      | KEEP                     | Origin-based CSRF for cookie state changes.                                                                                        |

---

## 4. Core libraries (`apps/platform-api/src/core`)

| Module                  | Path                                                         | Classification           | Notes                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform gate           | `core/platform/{platform.service,require-platform,index}.ts` | KEEP · PLATFORM-ONLY     | `isActivePlatformMember`, `requirePlatform`, `requirePlatformPermission`. Central platform authorization.                                                                                 |
| Authorization / RBAC    | `core/authorization/*`                                       | KEEP · PLATFORM-RELEVANT | `AuthorizationService` resolves effective permissions; platform perms resolve with **no tenant scope** (tenantId null). `requirePermission`, ownership helpers. Default-deny hardening.   |
| Tenant context          | `core/tenant/*`                                              | KEEP · ADAPT             | `TenantService` (validates membership + status), `tenant-db` explicit scoping, `resolve-tenant.hook`, relationship guards. This is the tenant/business-plane scoping inside the same app. |
| Errors                  | `core/errors/*`                                              | KEEP · PLATFORM-RELEVANT | Canonical `AppError` envelope; includes `PlatformAccessDeniedError` + `PLATFORM_ACCESS_DENIED`, tenant errors, Prisma error mapping.                                                      |
| Audit                   | `core/audit/*`                                               | KEEP · ADAPT             | Generic `AuditService.record()` (tx-aware). **Platform audit events are NOT yet emitted** by the platform module — wiring is Phase 10 work.                                               |
| Security                | `core/security/*`                                            | KEEP                     | SSRF guard, path traversal, file validation. Reusable.                                                                                                                                    |
| Orchestration           | `core/orchestration/*`                                       | KEEP · REUSE PATTERN     | Golden Orchestrator + per-stage metrics. Used by `todos`.                                                                                                                                 |
| Circuit breaker         | `core/circuit-breaker.ts`                                    | KEEP · REUSE PATTERN     | For future outbound calls (would apply to any external API integration).                                                                                                                  |
| Hooks / utils / testing | `core/{hooks,utils,testing}/*`                               | KEEP                     | Global hooks, logger, `buildTestApp()` mock harness (no DB needed).                                                                                                                       |

---

## 5. API modules (vertical slices)

| Module                          | Path                                | Classification                 | Notes                                                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`                      | `modules/platform/*`                | KEEP · PLATFORM-ONLY           | `/platform/dashboard`, `/tenants` (list/create/get), `/tenants/:id/status`, `/users`. Provisioning transaction. Boundary tests present. **Gaps vs plan:** no credentials, roles, permissions, audit, or settings endpoints yet. |
| `tenants`                       | `modules/tenants/*`                 | KEEP · ADAPT                   | Caller-scoped `/tenants/current`, `/tenants`, `/tenants/switch`. Tenant-facing (business plane), not platform admin.                                                                                                            |
| `auth` + `auth-recovery`        | `modules/auth/*`                    | KEEP · REUSE PATTERN           | login/register/refresh/logout/verify/logout-all/change-password + OTP recovery. Shared by both frontends; **authentication is shared, authorization is not**.                                                                   |
| `users`                         | `modules/users/*`                   | KEEP · REUSE PATTERN           | `/users/me` drives platform bootstrap on the frontend.                                                                                                                                                                          |
| `roles`                         | `modules/roles/*`                   | KEEP · PLATFORM-RELEVANT       | RBAC admin endpoints. Basis for future platform role management.                                                                                                                                                                |
| `admin`                         | `modules/admin/*`                   | KEEP · ADAPT                   | Diagnostics + aggregated dashboard metrics (`metrics.read`). Not the platform dashboard.                                                                                                                                        |
| `branding`                      | `modules/branding/*`                | ADAPT                          | Public white-label branding from env (`BRAND_*`). Reusable but currently logistics-branded.                                                                                                                                     |
| `health` / `api-index` / `root` | `modules/{health,api-index,root}/*` | KEEP                           | Liveness/readiness, endpoint catalog, landing page.                                                                                                                                                                             |
| `todos`                         | `modules/todos/*`                   | REMOVE candidate (demo)        | Golden Orchestrator reference. Not platform domain. Keep only as a pattern reference; remove from the platform product surface (Phase 14/25).                                                                                   |
| `example`                       | `modules/example/*`                 | REMOVE candidate (demo)        | Direct-Prisma CRUD sample. Same disposition as `todos`.                                                                                                                                                                         |
| `orders`                        | `modules/orders/*`                  | REMOVE candidate (placeholder) | Skeleton only, **not registered** in `app.ts`, no model. Closest thing to a "logistics" leftover; safe to remove.                                                                                                               |

---

## 6. Prisma schema, migrations, seed

Single shared Postgres DB (`DATABASE_URL`), single schema at repo root.

| Model                                                                       | Ownership                           | Classification                         | Notes                                                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `User`, `RefreshToken`, `OtpChallenge`, `PasswordResetToken`                | PLATFORM (no tenantId)              | KEEP                                   | Identity + auth. Shared across platform and tenants (one identity, many memberships).                 |
| `Permission`, platform `Role` (tenantId null), `UserRole`, `RolePermission` | PLATFORM / shared RBAC              | KEEP · PLATFORM-RELEVANT               | RBAC engine tables. Platform roles are `tenantId = null`.                                             |
| `PlatformMembership`                                                        | PLATFORM                            | KEEP · PLATFORM-ONLY                   | The Super Admin access gate.                                                                          |
| `Tenant`, `TenantMembership`, tenant `Role`                                 | TENANT                              | KEEP · ADAPT                           | Tenant lifecycle metadata + tenant RBAC. Matches plan's "Platform DB owns tenant lifecycle metadata". |
| `AuditLog`                                                                  | PLATFORM/TENANT (nullable tenantId) | KEEP · ADAPT                           | Generic audit table; platform events not yet written.                                                 |
| `Todo`                                                                      | TENANT (demo)                       | REMOVE candidate                       | Reference model.                                                                                      |
| `Example`                                                                   | none (demo)                         | REMOVE candidate                       | Reference model.                                                                                      |
| `TenantApiCredential`                                                       | —                                   | **MISSING — net-new (REWRITE/create)** | Required by plan §9/§14; does not exist.                                                              |

| Artifact   | Path                                                   | Classification           | Notes                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations | `prisma/migrations/*` (init → add_platform_membership) | KEEP · ADAPT             | History reflects this app's own evolution, **not** an old logistics schema, so the plan's "prefer a clean history" caveat (§24) largely does not apply. Do **not** run migrations automatically (plan §13/§14). |
| Seed       | `prisma/seed.ts`                                       | KEEP · PLATFORM-RELEVANT | Seeds permission catalog (incl `platform.*`), system roles, initial admin + `SUPER_ADMIN` role + ACTIVE `PlatformMembership`. Refuses to run in prod without opt-in; no default password.                       |
| Backfill   | `prisma/backfill-multi-tenancy.ts`                     | KEEP                     | One-off multi-tenancy backfill.                                                                                                                                                                                 |

---

## 7. Shared contracts (`packages/api-contracts`)

| Component                                                      | Path                                                                       | Classification           | Notes                                                                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| RBAC catalog                                                   | `src/rbac.ts`                                                              | KEEP · PLATFORM-RELEVANT | `PermissionKeys` incl full `platform.*` set; `PLATFORM_PERMISSION_KEYS` / `TENANT_PERMISSION_KEYS` splitters; `SystemRoles`. Single source of truth. |
| Platform DTOs                                                  | `src/platform.ts`                                                          | KEEP · PLATFORM-ONLY     | Tenant/dashboard/user DTOs, create/status bodies.                                                                                                    |
| Platform endpoint contracts                                    | `src/contracts/platform.ts`, `src/endpoints/platform.ts`                   | KEEP · PLATFORM-ONLY     | Level-2 contracts + path registry for `/platform/*`.                                                                                                 |
| Auth / users / tenants / rbac / dashboard / branding contracts | `src/{auth,auth-otp,users,tenants,rbac,dashboard,branding}.ts` + endpoints | KEEP                     | Shared, in use.                                                                                                                                      |
| `todos` / `examples` / `orders` contracts                      | `src/{todos,examples}.ts`, `endpoints/{todos,orders}.ts`                   | REMOVE candidate         | Match the demo/placeholder modules.                                                                                                                  |

---

## 8. Frontends

### `apps/super-admin` (PLATFORM-ONLY — KEEP)

| Component                             | Path                                                             | Notes                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router / protected route              | `src/app/*`                                                      | Auth-gated; backend is authoritative for platform access.                                                                                                                                                                                                                                                                                                   |
| Layout                                | `src/layouts/platform-layout.tsx`                                | Permission-aware nav (`can()`), separate `super-admin-auth` persist key.                                                                                                                                                                                                                                                                                    |
| Pages                                 | `src/pages/{login,dashboard,tenants,platform-users}-page.tsx`    | Implemented.                                                                                                                                                                                                                                                                                                                                                |
| Auth module                           | `src/modules/auth/*`                                             | Shared `/auth/login`; `usePlatformBootstrap` reads `/users/me`.                                                                                                                                                                                                                                                                                             |
| Platform API                          | `src/modules/platform/platform.api.ts`                           | Contract-driven; never sends `X-Tenant-Id`.                                                                                                                                                                                                                                                                                                                 |
| API client / store / UI               | `src/lib/*`, `src/stores/auth.store.ts`, `src/components/ui.tsx` | 401→refresh→retry; minimal UI primitives.                                                                                                                                                                                                                                                                                                                   |
| **Screen scope (Phase 20.2 updated)** | —                                                                | Tenant **Detail** (Overview/Organization/Status/Credentials) and **Audit Logs** are implemented. Platform **Roles** and **Permissions** administration UI are **intentionally out of current scope** (Platform RBAC enforcement remains active). Platform **Settings** is **deferred** pending a real settings domain. These are not missing functionality. |

### `apps/admin` (tenant admin — KEEP, out of platform scope)

Full tenant-facing admin (auth, dashboard, users, roles, permissions, settings,
tenants, errors, i18n, themes). Not part of the Super Admin surface; leave
unchanged unless a specific phase requires it.

---

## 9. Infra, CI/CD, deployment, docs

| Component                    | Path                                                                      | Classification    | Notes                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker                       | `Dockerfile`, `apps/platform-api/Dockerfile`, `docker/`, `.dockerignore`  | KEEP · ADAPT      | Rebrand image/service names in Phase 1/17.                                                                                                                                                                                                                |
| CI/CD                        | `.github/workflows/{ci,deploy}.yml`                                       | KEEP · ADAPT      | Should build/deploy super-admin + api independently (Phase 17).                                                                                                                                                                                           |
| Deploy targets               | `fly.toml`, `railway.json`, `render.yaml`, `k8s/`, `Makefile`, `setup.sh` | KEEP · ADAPT      | Independent platform deployment (Phase 17).                                                                                                                                                                                                               |
| Design doc (authoritative)   | `docs/super-admin/MULTI-TENANT-ARCHITECTURE.md`                           | KEEP              | Heavily referenced by code via `§` numbers.                                                                                                                                                                                                               |
| Existing docs                | `docs/*.md`                                                               | KEEP              | Architecture/auth/RBAC/etc. Some duplicates (`… (1).md`).                                                                                                                                                                                                 |
| **Missing plan-target docs** | —                                                                         | CREATE (Phase 18) | `PLATFORM-ARCHITECTURE`, `PLATFORM-AUTHENTICATION`, `PLATFORM-RBAC`, `PLATFORM-API`, `TENANT-LIFECYCLE`, `TENANT-PROVISIONING`, `TENANT-API-CREDENTIALS`, `PLATFORM-AUDIT`, `PLATFORM-LOGISTICS-INTEGRATION`, `PLATFORM-SECURITY`, `PLATFORM-DEPLOYMENT`. |

---

## 10. Repository identity gaps (Phase 1 input)

Names/titles that still describe the source project rather than the platform:

- Root `package.json` name: `fastify-admin-monorepo`.
- `README.md` title: "Fastify Gold Standard — Monorepo".
- `.env.example`: `BRAND_APP_NAME="Admin · Logistics"`, DB name `fastify_starter`,
  `OTEL_SERVICE_NAME=fastify-api`.
- Swagger/OpenAPI metadata (via `swagger` plugin) — review for platform naming.

No runtime package currently _falsely_ claims to be a logistics application, but
several cosmetic identifiers still reflect the generic starter.

---

## 11. Tests (baseline)

- `npm run test --workspace @app/api` → **234 passing / 26 files** at inventory
  time (mock-based `buildTestApp()`, no DB required).
- Platform boundary coverage exists in
  `apps/platform-api/src/modules/platform/__tests__/platform.test.ts`: no-membership 403,
  missing-permission 403, inactive-membership 403, permitted 200, provisioning
  transaction, duplicate-slug 409, archive requires higher permission.

---

## 12. Open questions for the maintainer (block Phases 8 & 11)

1. **Is there a separate logistics system to integrate with?** The plan's
   two-database split and Platform→Logistics API boundary assume one exists.
   This repo does not contain it. Decide: (a) integrate with an external
   logistics API (net-new Phase 11 build), or (b) treat the tenant-scoped layer
   in this same app as the business plane and drop the two-DB requirement.
2. **`TenantApiCredential`** is net-new. Confirm the storage/rotation policy
   (one-way hash vs recoverable) before Phase 9.
3. **Demo modules** (`todos`, `example`, `orders`): confirm removal so they
   don't ship in the platform product (Phases 14/25).

---

## Gate

Per plan §5, schema/database work should not begin until discovery is complete.
This inventory completes discovery. The **next actionable phase without new
decisions is Phase 1 (Repository Identity)**; Phases 8 and 11 require answers to
§12 above before proceeding.
