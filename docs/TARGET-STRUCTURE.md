# Target Structure & Platform Boundary

**Phase 2 — Target Structure** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §7).

This document is the inspection + mapping deliverable for Phase 2. It records the
current repository layout, the target layout, exactly which directories move vs
remain, the import/dependency changes any move would require, which modules are
platform-owned vs demo/placeholder, and the risks. It also states which safe
structural changes are made in this phase and which are deliberately deferred.

> **No database, migration, schema, or demo-removal work is part of Phase 2.**

---

## 0. Summary decision

The current structure is a standard npm-workspaces monorepo (`apps/*` +
`packages/*`) that is **already independently deployable**: the backend has its
own Dockerfile and build, and each frontend builds independently. The target
architecture from the plan (§7) is:

```text
super-admin-platform/
├── platform-api/
├── super-admin/
├── prisma/
├── packages/
├── docs/
└── package.json
```

Three of the six target entries already exist verbatim at the repository root
(`prisma/`, `packages/`, `docs/`, `package.json`). The remaining two —
`platform-api/` and `super-admin/` — correspond to `apps/api/` and
`apps/super-admin/` today.

> **Update (post-decision):** The maintainer chose to keep the `apps/*`
> monorepo convention and to perform the directory rename now. Accordingly,
> `apps/api` has been renamed to **`apps/platform-api`** (the frontend was
> already `apps/super-admin`). Because both apps stay two levels deep under
> `apps/`, the `../../packages/api-contracts` alias depth is preserved, so this
> was a low-risk rename rather than the higher-risk move-to-root originally
> analysed. All path references (workspaces, Dockerfiles, CI/CD, k8s, tooling,
> docs) were updated and the full validation suite re-run. The npm **package
> name** remains `@app/api` (directory-only rename) to avoid churning every
> `--workspace @app/api` reference; renaming the package to `@app/platform-api`
> is a separate, optional follow-up.

The analysis below is retained for the record. The original recommendation to
_defer_ the rename applied to moving the apps to the **repo root**
(`platform-api/`, `super-admin/`), which would have broken the alias depth. The
maintainer's chosen layout keeps them under `apps/`, which is why the rename was
safe to execute now.

---

## 1. Current structure

```text
super-admin-platform/                 # repo root (package.json: "super-admin-platform")
├── apps/
│   ├── platform-api/                 # @app/api   — Platform API (control plane)  [PLATFORM]
│   │   ├── src/{app,config,core,modules,plugins,queue,workers}
│   │   ├── Dockerfile  tsconfig.json  tsup.config.ts  vitest.config.ts
│   ├── admin/                        # @app/admin  — tenant Admin frontend       [TENANT]
│   │   └── src/{app,branding,components,config,hooks,i18n,layouts,lib,modules,stores,styles,test}
│   └── super-admin/                  # @app/super-admin — Super Admin frontend    [PLATFORM]
│       └── src/{app,components,config,layouts,lib,modules,pages,stores,styles}
├── packages/
│   └── api-contracts/                # @app/api-contracts — shared TypeBox contracts
├── prisma/                           # schema.prisma + migrations/ + seed.ts + backfill
├── docs/
├── docker/  k8s/  .github/workflows/ # infra + CI/CD
├── Dockerfile  Makefile  setup.sh  plopfile.js  eslint.config.js
└── package.json                      # npm workspaces root
```

## 2. Target structure (plan §7) and mapping

| Target entry         | Current location                                  | Action                                                                        |
| -------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/platform-api/` | `apps/api/` → **renamed to `apps/platform-api/`** | **DONE** — directory renamed; kept under `apps/` per maintainer's convention. |
| `apps/super-admin/`  | `apps/super-admin/`                               | **REMAIN** — already correctly named.                                         |
| `prisma/`            | `prisma/`                                         | **REMAIN** — already at root.                                                 |
| `packages/`          | `packages/`                                       | **REMAIN** — already at root.                                                 |
| `docs/`              | `docs/`                                           | **REMAIN** — already at root.                                                 |
| `package.json`       | `package.json`                                    | **REMAIN** — already the workspace root.                                      |
| (not in target tree) | `apps/admin/`                                     | **REMAIN** — tenant Admin; preserved (Phase 1 approved).                      |

The plan's target tree also shows nested `src/{app,modules,...}` layouts inside
`platform-api/` and `super-admin/`. Those internal layouts **already match**
(`apps/platform-api/src/{app,config,plugins,modules,...}`, `apps/super-admin/src/{app,
components,layouts,pages,modules,...}`), so no internal restructuring is needed.

### 2.1 Backend module map (plan §7 `platform-api/src/modules/*`)

| Plan module                               | Current                                                                              | Classification                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `auth/`                                   | `modules/auth/` (+ `auth-recovery`)                                                  | PLATFORM-owned (shared auth) — KEEP                      |
| `users/`                                  | `modules/users/`                                                                     | PLATFORM-relevant — KEEP                                 |
| `roles/`                                  | `modules/roles/`                                                                     | PLATFORM-relevant (RBAC admin) — KEEP                    |
| `permissions/`                            | in `modules/roles/` + `packages/api-contracts` registry                              | KEEP (no separate module needed yet)                     |
| `tenants/`                                | `modules/tenants/` (caller-scoped) + `modules/platform/` (platform tenant lifecycle) | KEEP                                                     |
| `credentials/`                            | —                                                                                    | **MISSING — deferred to its own phase** (do NOT add now) |
| `audit/`                                  | `core/audit/` (service)                                                              | KEEP; platform audit wiring is a later phase             |
| `dashboard/`                              | `modules/platform` (`/platform/dashboard`) + `modules/admin` (diagnostics)           | KEEP                                                     |
| `platform/` (gate + routes)               | `modules/platform/` + `core/platform/`                                               | PLATFORM-owned — KEEP                                    |
| `health`, `api-index`, `root`, `branding` | same                                                                                 | Infra — KEEP                                             |
| `todos/`, `example/`                      | same                                                                                 | **DEMO** — keep for now (removal is a later phase)       |
| `orders/`                                 | `modules/orders/`                                                                    | **PLACEHOLDER** — unregistered skeleton; removal later   |

### 2.2 Frontend map (plan §17 `super-admin/`)

`apps/super-admin` already implements Login, Dashboard, Tenants, Platform Users
with permission-aware nav. Missing plan screens (Tenant Detail/Credentials,
Roles, Permissions, Audit, Settings) are **feature work for later phases**, not
structural moves.

---

## 3. Import / dependency changes a physical rename WOULD require

Documented so the deferred rename (§7) can be executed safely later. **None of
these are applied in Phase 2.**

Renaming `apps/api` → `platform-api` and `apps/super-admin` → `super-admin`
(moving them up one level, out of `apps/`) would change each app's depth
relative to the root and therefore require updating:

1. **Root `package.json` `workspaces`** — `["packages/*", "apps/*"]` would need
   `platform-api`, `super-admin`, and (still) `apps/admin` entries.
2. **Contracts alias in every config** — all point to
   `../../packages/api-contracts/src/index.ts` (two levels up). Moving an app to
   the root (one level up) breaks the relative depth → becomes
   `../packages/...`. Affects:
   - `apps/api`: `tsconfig.json`, `vitest.config.ts`, `tsup.config.ts`
   - `apps/super-admin`: `tsconfig.json`, `vite.config.ts`
3. **Dockerfiles** — root `Dockerfile` and `apps/api/Dockerfile` `COPY apps/api/…`
   paths; the API Dockerfile's own location.
4. **CI/CD** — `.github/workflows/ci.yml` (`apps/api/dist/server.js`,
   `./apps/api/coverage/lcov.info`) and `deploy.yml` (`file: apps/api/Dockerfile`).
5. **Tooling** — `scripts/check-api-drift.mjs` `SCAN_DIRS` + `ALLOWED_FILES`;
   `eslint.config.js` file globs.
6. **Root scripts** — none reference the physical path (they use
   `--workspace @app/api`), so the npm **package names** (`@app/api`, etc.) can
   stay unchanged even after a physical dir rename.

Notably **unaffected** by a rename:

- `prisma/seed.ts`'s relative import `../packages/api-contracts/src/index.js`
  (it lives in `prisma/`, which does not move).
- All `@app/api-contracts` _package-name_ imports in app source (they resolve
  through the alias, whose target path is what changes, not the import string).

---

## 4. What stays platform-owned vs demo/placeholder

| Category                                 | Items                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Platform-owned (control plane)**       | `apps/super-admin` (whole app); backend `modules/platform`, `core/platform`; RBAC (`core/authorization`, `modules/roles`, contracts `rbac.ts`/`platform.ts`); `core/audit`; `PlatformMembership`/platform-role model usage; `modules/auth` (shared auth boundary). |
| **Tenant / business plane**              | `apps/admin` (tenant Admin); `modules/tenants`; `core/tenant`.                                                                                                                                                                                                     |
| **Infra (shared, keep)**                 | `plugins/*`, `core/{errors,hooks,orchestration,security,utils,testing}`, `core/circuit-breaker`, `modules/{health,api-index,root,branding}`, `queue/`, `workers/`.                                                                                                 |
| **Demo (keep now, remove later)**        | `modules/todos`, `modules/example`; contracts `todos.ts`/`examples.ts`; `Todo`/`Example` Prisma models.                                                                                                                                                            |
| **Placeholder (keep now, remove later)** | `modules/orders` (unregistered skeleton, no model).                                                                                                                                                                                                                |

Demo/placeholder removal is explicitly **out of scope for Phase 2**.

---

## 5. Platform boundary (Phase 2 clarification)

Per the phase instruction, **no Platform → Logistics API boundary is
introduced**, and **no separate Logistics Platform is assumed to exist**. The
platform boundary that exists today is the correct one for this codebase:

```text
super-admin (frontend)
      ↓  authenticated HTTPS, no X-Tenant-Id
platform-api  (apps/platform-api)
      ↓  authorized cross-tenant surface (PlatformMembership gate + platform.* RBAC)
one shared Postgres DB (control-plane + tenant metadata)
```

There is no second database and no outbound service call to a logistics system.
The `platform-api ≙ apps/platform-api` mapping and the existing
`requirePlatformPermission` gate remain the boundary of record until a later
phase explicitly introduces (a) a separate Platform DB and/or (b) a real
external integration — each gated on maintainer approval.

---

## 6. Structural changes applied

1. **`eslint.config.js`** — added an `apps/super-admin/**` block mirroring the
   existing `apps/admin` block (browser globals + React-hooks/refresh rules).
   The super-admin React app previously had **no** dedicated ESLint block.
2. **Package descriptions** — aligned `@app/api-contracts`'s description with
   the platform naming.
3. **Directory rename** — `apps/api` → **`apps/platform-api`** (kept under
   `apps/` per the maintainer's monorepo convention). Because the depth is
   unchanged, no intra-app alias edits were needed. Updated every external path
   reference (see §7). npm package name kept as `@app/api`.

---

## 7. Directory rename — executed

The rename `apps/api → apps/platform-api` was performed and the following path
references were updated (validated by the full suite in §"Validation"):

- **Workspaces** — root `package.json` uses the `apps/*` glob, which
  auto-includes `apps/platform-api`; the `@app/api` symlink now resolves to
  `../../apps/platform-api` after `npm install`.
- **Intra-app configs** — `apps/platform-api/{tsconfig.json,tsup.config.ts,
vitest.config.ts}` unchanged: still `../../packages/api-contracts` (depth
  preserved by keeping the app under `apps/`).
- **Dockerfiles** — root `Dockerfile` (5 COPY paths + `CMD`) and
  `apps/platform-api/Dockerfile` (header comment + 3 COPY paths) + its
  `.dockerignore` comment.
- **CI/CD** — `.github/workflows/ci.yml` (`apps/platform-api/dist/server.js`,
  `./apps/platform-api/coverage/lcov.info`) and `deploy.yml`
  (`file: apps/platform-api/Dockerfile`).
- **k8s** — `worker-deployment.yaml` args → `/app/apps/platform-api/dist/workers/index.js`.
- **Tooling** — `scripts/check-api-drift.mjs` `SCAN_DIRS` + `ALLOWED_FILES`;
  `eslint.config.js` Node-globals glob.
- **Docs** — `README.md` layout tree/paths; this document.

**Not renamed:** the npm package name `@app/api` (directory-only rename).
Renaming it to `@app/platform-api` would touch every `--workspace @app/api`
reference in root scripts and CI; it is an optional follow-up, not required for
the target structure.

**If the apps are ever extracted to separate repositories** (`super-admin-api/`
holding `platform-api/`, `super-admin-web/` holding `super-admin/`), the
`apps/`-relative layout makes that a clean lift — the internal structure and
ownership boundaries do not change.

---

## 8. Risks

- **Rename risk (mitigated):** the fragile point was the relative
  contracts-alias depth. Keeping the app under `apps/` (not moving it to the
  repo root) preserved the `../../packages` depth, so no alias edits were
  needed. All ~8 external path touch-points were updated and the full suite
  re-run — build graph verified intact.
- **ESLint block addition:** mirrors the admin block (warnings, not errors);
  validated by `npm run lint` (0 new problems).
- **Naming ambiguity:** `apps/platform-api` is still the npm package `@app/api`.
  Mitigation: this document is the mapping of record; identity strings were
  aligned in Phase 1 (OpenAPI/branding/service names say "Platform API"). The
  package-name rename is an optional follow-up (§7).
- **Demo modules still present:** `todos`/`example`/`orders` remain in the
  platform surface until their removal phase; noted, not part of this work.

---

## Gate

The structural inspection, mapping, and the `apps/api → apps/platform-api`
rename are complete without touching the database, schema, migrations, or demo
modules. The repository remains independently deployable and the build graph is
verified intact. No second database and no Platform → Logistics API boundary
were introduced.
