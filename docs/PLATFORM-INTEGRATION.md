# Platform ↔ Tenant Integration (Phase 21)

This document describes the server-to-server (S2S) control-plane connection
between the **Super Admin Platform** and a **Tenant runtime** (the
`Fastify-MasterApp` Tenant API). It is the authoritative reference for the
integration's architecture, security model, endpoints, and operations.

## 1. Ownership model

```
                 SUPER ADMIN (browser)
                        │
                        ▼
                  PLATFORM API  (apps/platform-api)
                        │
                        │  TenantPlatformClient — HTTPS + S2S bearer
                        ▼
                  TENANT API  (Fastify-MasterApp / apps/api)
                        │
                        ▼
                  Tenant DB / Tenant configuration
```

- **Super Admin manages the tenant relationship** (branding, connection/runtime
  status). It never touches the tenant database directly.
- **The Tenant API is the only boundary into the tenant runtime.** No shared
  Prisma client, no shared DB credentials, no Tenant service imports on the
  Platform side.
- **Tenant Admin stays independent.** It keeps reading its own public
  `GET /api/v1/branding` and works even when the Platform is unavailable.

The two applications remain separate. This is a control-plane integration, not
a merge.

## 2. Server-to-server authentication

The Tenant API authenticates the Platform with a **shared bearer secret**
(distinct from user JWTs and from customer-facing API keys):

```
Authorization: Bearer <PLATFORM_S2S_SECRET>
```

Tenant side (`apps/api/src/modules/platform-integration/platform.auth.ts`):

- **Fail-closed:** when `PLATFORM_S2S_SECRET` is unset, every internal endpoint
  is rejected (401). The integration is disabled rather than open.
- **Constant-time comparison** (`crypto.timingSafeEqual`) defeats timing oracles.
- **Explicit scopes** — a credential does not automatically get full access.

Platform side (`apps/platform-api`): the secret is read from env
(`TENANT_API_S2S_SECRET`) and presented by the `TenantPlatformClient`. It is
**never stored in the Platform database** and **never exposed to the browser**.

## 3. Scopes

Granted to the Platform credential via `PLATFORM_S2S_SCOPES` (comma-separated):

| Scope                     | Grants                            |
| ------------------------- | --------------------------------- |
| `platform.health.read`    | `GET /internal/platform/health`   |
| `platform.runtime.read`   | `GET /internal/platform/runtime`  |
| `platform.branding.read`  | `GET /internal/platform/branding` |
| `platform.branding.write` | `PUT /internal/platform/branding` |

A request missing the required scope is rejected with **403**.

## 4. Tenant identity & isolation

The tenant runtime is single-tenant; it is configured with the platform tenant
id it represents (`PLATFORM_TENANT_ID`). The Platform sends the target tenant in
`x-platform-tenant-id`. The Tenant API validates it:

```
credential → tenant T001, request header → T001  ⇒ ALLOW
credential → tenant T001, request header → T002  ⇒ 403 REJECT
```

A caller-supplied tenant id is never trusted without validation against the
runtime's own identity.

## 5. Internal Tenant endpoints (`/api/v1/internal/platform/*`)

Backend-to-backend only. Never reachable from browser code. Prefer restricting
them to a private network in production (authentication remains mandatory even
so).

| Method | Path                                 | Scope                     |
| ------ | ------------------------------------ | ------------------------- |
| GET    | `/api/v1/internal/platform/health`   | `platform.health.read`    |
| GET    | `/api/v1/internal/platform/runtime`  | `platform.runtime.read`   |
| GET    | `/api/v1/internal/platform/branding` | `platform.branding.read`  |
| PUT    | `/api/v1/internal/platform/branding` | `platform.branding.write` |

- **Health** returns a minimal `{ "status": "ok" }` — no secrets.
- **Runtime** returns `{ tenantId, status, environment, version? }` — no
  connection strings, secrets, or internal hostnames. A failing DB probe yields
  `status: "degraded"` rather than a false `ready`.
- **Branding** persists and returns the canonical `AppBranding` document.

## 6. Platform routes (`/api/v1/platform/tenants/:id/*`)

The Super Admin surface, gated by platform RBAC:

| Method | Path                                      | Permission               |
| ------ | ----------------------------------------- | ------------------------ |
| GET    | `/api/v1/platform/tenants/:id/connection` | `platform.tenant.view`   |
| GET    | `/api/v1/platform/tenants/:id/branding`   | `platform.tenant.view`   |
| PATCH  | `/api/v1/platform/tenants/:id/branding`   | `platform.tenant.update` |

These proxy to the Tenant API via `TenantPlatformClient`. The Super Admin
frontend calls only these Platform routes through the central API client — it
never calls the Tenant API directly.

## 7. Idempotency & retries

Branding GET/PUT are idempotent and retry-safe: re-sending the same update
yields the same persisted state. The tenant `PUT` is a partial replacement keyed
by the tenant identity, so retries do not create duplicate state.

## 8. Request correlation

The Platform propagates its request id to the Tenant API as `x-request-id`
(consumed by Fastify's `requestIdHeader`), so a single operation can be traced
across both services and their audit logs.

## 9. Timeouts & failure behavior

- The `TenantPlatformClient` uses an explicit per-request timeout
  (`TENANT_API_TIMEOUT_MS`, via `AbortController`).
- On timeout / connection failure the client raises `TenantUnreachableError`
  (surfaced as `503 SERVICE_UNAVAILABLE`).
- `GET .../connection` never throws on an unreachable tenant — it returns
  `{ reachable: false, detail }` so the UI shows a clear connection failure and
  never a false "healthy" (§47).
- All outbound URLs are validated with the SSRF guard (`assertSafeUrl`) before
  each call; production requires `https` (http only when `TENANT_API_ALLOW_HTTP`
  is enabled for local dev).

## 10. Audit

Branding writes are audited on both sides. Audit records carry **changed field
names only** — never field values (which may include large asset URLs) and never
secrets.

- Platform: `AuditActions.TenantBrandingUpdated` = `TENANT_BRANDING_UPDATED`
  (`tenantId`, `actorId`, `changedFields`, `requestId`, timestamp).
- Tenant: `AuditActions.PlatformBrandingUpdated` = `PLATFORM_BRANDING_UPDATED`.

## 11. Configuration

**Tenant runtime** (`Fastify-Master/.env`):

```
PLATFORM_S2S_SECRET=<openssl rand -hex 32>   # unset ⇒ integration disabled
PLATFORM_TENANT_ID=<the platform tenant id this runtime serves>
PLATFORM_S2S_SCOPES=platform.health.read,platform.runtime.read,platform.branding.read,platform.branding.write
```

**Platform** (`Super-Admin-Platform/.env`):

```
TENANT_API_BASE_URL=https://tenant.example.com
TENANT_API_S2S_SECRET=<must match the tenant's PLATFORM_S2S_SECRET>
TENANT_API_TIMEOUT_MS=5000
TENANT_API_ALLOW_HTTP=false   # true for local http dev only
```

When `TENANT_API_BASE_URL`/`TENANT_API_S2S_SECRET` are unset, the Platform's
branding/connection routes return `503` (integration disabled).

## 12. Database

The tenant persists branding in a new `TenantBranding` model
(`prisma/schema.prisma`, table `tenant_branding`). The SQL migration is
**authored and committed** at
`prisma/migrations/20260909000000_add_tenant_branding/migration.sql` (its DDL was
verified to match Prisma's canonical output via `prisma migrate diff`). Apply it
in a database environment:

```
# local dev
npx prisma migrate dev
# production
npx prisma migrate deploy
# verify
npx prisma migrate status
```

Then confirm: the `tenant_branding` table exists, migration history is clean,
the Tenant API starts, and `GET /api/v1/branding` returns persisted branding
when present and the env/`DEFAULT_BRANDING` fallback otherwise.

The Platform stores **no** branding — the tenant runtime is the persisted owner.

## 13. Multi-runtime note

This reference models one tenant runtime (one Tenant API base URL + secret in
env). To support many runtimes, `TenantPlatformService.resolveConnection` should
look up a per-tenant base URL + secret from the secrets provider keyed by
`tenantId`; the call sites do not change.

## 14. Contract synchronization

The Platform and Tenant apps have **separate** `@app/api-contracts` packages.
The tenant internal endpoint paths and the runtime shape are mirrored on the
Platform side (`TENANT_INTERNAL_ENDPOINTS`, `TenantRuntimeInfo` in
`packages/api-contracts/src/tenant-platform.ts`). Keep them in sync with the
tenant's `PLATFORM_INTERNAL_ENDPOINTS` / `PlatformRuntime`. The `AppBranding`
shape is identical on both sides and is the single wire contract for branding.

## 15. Deferred / not applicable

Provisioning, lifecycle (activate/suspend), and entitlement synchronization are
**not implemented** because the tenant runtime has no corresponding domain (no
provisioning workflow, no lifecycle state, no plan/entitlement model). Per the
Phase 21 stop conditions these were not invented. See the Phase 21 report.
