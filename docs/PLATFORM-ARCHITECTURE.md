# Platform Architecture

**Phase 18 — Documentation** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §23).

The top-level architecture of the Super Admin Platform. It ties together the
per-area docs and describes the system as it is **actually implemented** — not
aspirational features. Where the master plan assumed a topology this repo does
not have (a separate logistics system / second database), that divergence is
stated plainly.

---

## 1. What this system is

The **Super Admin Platform** is a control plane: a small set of platform
operators manage tenants, platform users, RBAC, tenant API credentials, and
audit — over a single owned database, behind a permission-gated API.

```text
                 PLATFORM CONTROL PLANE

  super-admin (React SPA)
        │  authenticated HTTPS (Bearer), no X-Tenant-Id
        ▼
  platform-api (Fastify)
        │  Prisma (owner)
        ▼
  Platform DB (single PostgreSQL)
        owns: tenants, tenant memberships, platform users,
              platform RBAC, tenant API credentials, platform audit
```

There is **no** separate logistics/business plane in this repository. The
tenant/business "plane" is represented as tenant **metadata** + tenant-scoped
RBAC in the same database; there is no second database and no outbound
integration (`docs/PLATFORM-LOGISTICS-INTEGRATION.md`,
`docs/PLATFORM-DATABASE.md`).

## 2. Components

| Component            | Path                                    | Role                                                            |
| -------------------- | --------------------------------------- | --------------------------------------------------------------- |
| Platform API         | `apps/platform-api` (`@app/api`)        | Fastify backend; the only DB owner; the authorization boundary. |
| Super Admin frontend | `apps/super-admin` (`@app/super-admin`) | React + Vite SPA; UX only, backend is authoritative.            |
| Shared contracts     | `packages/api-contracts`                | TypeBox schemas + endpoint/permission registry shared by both.  |
| Platform DB          | `prisma/` (single datasource)           | Postgres; schema owned by `platform-api`.                       |

Monorepo layout and the `apps/api → apps/platform-api` rename are documented in
`docs/TARGET-STRUCTURE.md`; the full component classification is in
`docs/CONVERSION-INVENTORY.md`.

## 3. Request & authorization flow

```text
Credentials → /auth/login → access token (JWT) + HTTP-only refresh cookie
      │
      ▼  Authorization: Bearer <token>
platform-api  /api/v1/platform/*
      │  authenticate (JWT, HS256)
      ▼
Platform Membership gate   (ACTIVE PlatformMembership, else 403)
      ▼
Platform permission        (platform.* resolved with NO tenant scope)
      ▼
Handler → Platform DB (raw Prisma, explicit cross-tenant)
```

- **Authentication** is a general identity boundary (`docs/PLATFORM-AUTHENTICATION.md`).
- **Authorization** is permission-based; platform permissions resolve with no
  tenant scope so tenant roles can never grant platform access, and a role
  _name_ is never an access condition (`docs/SUPER-ADMIN-PLATFORM-RBAC.md`).
- Platform routes never fall back to tenant context
  (`docs/PLATFORM-API.md`).

## 4. Domains

| Domain                                       | Doc                                      |
| -------------------------------------------- | ---------------------------------------- |
| Database ownership & model inventory         | `docs/PLATFORM-DATABASE.md`              |
| Authentication & session lifecycle           | `docs/PLATFORM-AUTHENTICATION.md`        |
| RBAC (platform.* permissions, guards)        | `docs/SUPER-ADMIN-PLATFORM-RBAC.md`      |
| API surface (`/api/v1/platform/*`)           | `docs/PLATFORM-API.md`                   |
| Tenant lifecycle (status state machine)      | `docs/TENANT-LIFECYCLE.md`               |
| Tenant provisioning (transactional)          | `docs/TENANT-PROVISIONING.md`            |
| Tenant API credentials (SHA-256, show-once)  | `docs/TENANT-API-CREDENTIALS.md`         |
| Platform audit (events, no secrets)          | `docs/PLATFORM-AUDIT.md`                 |
| Platform ↔ Logistics (none; future contract) | `docs/PLATFORM-LOGISTICS-INTEGRATION.md` |
| Frontend security (not the boundary)         | `docs/PLATFORM-SECURITY.md`              |
| Environment & independent deployment         | `docs/PLATFORM-DEPLOYMENT.md`            |
| Testing (§21 coverage map)                   | `docs/PLATFORM-TESTING.md`               |

## 5. Cross-cutting infrastructure (reused)

Fastify plugins (env, cors, redis, queue, db, auth, authorization, platform,
metrics, swagger, csrf, helmet, rate-limit); core libraries (errors + canonical
envelope, hooks, orchestration, security guards, tenant scoping, audit, circuit
breaker); Prometheus metrics; optional OpenTelemetry; BullMQ worker. These are
generic and were preserved from the source starter (`docs/CONVERSION-INVENTORY.md`).

## 6. Key architectural decisions (and honest divergences)

1. **Single database, not two.** The plan targeted separate `platform_db` /
   `logistics_db`. This repo has one DB and no logistics system; the logical
   platform/tenant ownership boundary is enforced in code (platform uses the raw
   client; tenant data uses an explicit `tenantId`-injecting accessor). A future
   physical split is specified but deferred (`docs/PLATFORM-DATABASE.md` §9–§14).
2. **No Platform → Logistics boundary.** Nothing to integrate with; the future
   contract is documented, not built (`docs/PLATFORM-LOGISTICS-INTEGRATION.md`).
3. **Directory rename, package name kept.** `apps/api → apps/platform-api`; the
   npm package remains `@app/api` to avoid churn (`docs/TARGET-STRUCTURE.md`).
4. **Demo modules removed.** `todos`/`example`/`orders` and the `Todo`/`Example`
   models were removed; the drop migration is authored but **not executed**
   (`docs/CONVERSION-INVENTORY.md`, `docs/TARGET-STRUCTURE.md`).
5. **Two migrations pending.** `add_tenant_api_credentials` and
   `remove_demo_models` are authored, not applied (`docs/PLATFORM-DEPLOYMENT.md`).
6. **Tenant Admin frontend removed.** An earlier session's rename step removed
   `apps/admin`; the repo is now a platform-only monorepo
   (`docs/CONVERSION-INVENTORY.md`).

## 7. Independent deployability

`platform-api` and `super-admin` build independently (sharing only
`api-contracts`); the API image is self-contained; infra/CI are platform-only;
platform deployment needs no other system's build or migrations
(`docs/PLATFORM-DEPLOYMENT.md` §4).

---

## Gate

This document gives the implemented top-level architecture of the Super Admin
Platform, links the per-domain docs, and records the honest divergences from the
master plan (single DB, no logistics integration, pending migrations, removed
demo/tenant-admin). It describes actual implementation, not unimplemented future
features.
