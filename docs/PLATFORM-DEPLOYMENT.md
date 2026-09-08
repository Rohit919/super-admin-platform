# Platform Deployment & Environment

**Phase 15 — Environment Separation** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §20),
with forward notes toward independent deployment (§22).

The Super Admin Platform's environment configuration is **independent**: it
configures only the platform control plane (`platform-api` + `super-admin`) and
its own database, and must never carry another system's production secrets.

---

## 1. Environment variables (platform control plane)

Source of truth: root `.env` (validated at boot by `@fastify/env`;
`.env.example` documents every key). The Platform API (`apps/platform-api`) loads
the root `.env`; the Super Admin frontend reads `VITE_*` vars.

| Group            | Keys                                                                                  | Notes                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Server           | `NODE_ENV`, `PORT`, `HOST`, `LOG_LEVEL`                                               |                                                                                                                    |
| **Database**     | `DATABASE_URL`, `DATABASE_DIRECT_URL`                                                 | **Must point at the Platform DB** (`docs/PLATFORM-DATABASE.md`). Direct URL is for `prisma migrate`/introspection. |
| Redis            | `REDIS_URL`                                                                           | Rate-limit store + BullMQ; fails open.                                                                             |
| Auth             | `JWT_SECRET` (≥32), `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`, `HTTPS_ONLY`        | Platform's own signing secret.                                                                                     |
| Secrets provider | `SECRETS_PROVIDER` (`env`/`aws`/`vault`/`doppler`)                                    | Where `loadSecrets()` fetches at boot.                                                                             |
| API              | `API_PREFIX`, `API_VERSION`                                                           | `/api` + `v1`.                                                                                                     |
| Rate limiting    | `RATE_LIMIT_MAX`, `RATE_LIMIT_TIME_WINDOW`                                            |                                                                                                                    |
| CORS             | `CORS_ORIGIN`, `CORS_CREDENTIALS`                                                     | Allowlist the Super Admin origin(s).                                                                               |
| Monitoring       | `METRICS_ENABLED`, `METRICS_PATH`, `METRICS_TOKEN`                                    | Prometheus.                                                                                                        |
| Docs             | `SWAGGER_ENABLED`, `SWAGGER_PATH`                                                     | Off by default; keep off in prod.                                                                                  |
| Tracing          | `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME=platform-api`       | Opt-in.                                                                                                            |
| Branding         | `BRAND_*`                                                                             | Platform branding for `GET /api/v1/branding`.                                                                      |
| Frontend         | `VITE_API_BASE_URL`                                                                   | Super Admin's API base (dev: `/api/v1`, proxied).                                                                  |
| Alerting         | `ALERTMANAGER_WEBHOOK_URL`, `ALERTMANAGER_CRITICAL_WEBHOOK_URL`                       | Override in prod.                                                                                                  |
| Seed             | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `SEED_ALLOW_PRODUCTION` | Initial platform admin; no default password; refuses prod without opt-in.                                          |

### 1.1 What is intentionally NOT here

There are **no** `LOGISTICS_API_URL`, `LOGISTICS_DB`, or
`LOGISTICS_SERVICE_AUTH_SECRET` variables — there is no logistics/business system
to integrate with (`docs/PLATFORM-LOGISTICS-INTEGRATION.md`). If a future
integration is built, those would be **added** at that time; they do not exist
now.

## 2. Environment separation rules (plan §20)

- **Platform env is self-contained.** It configures only `platform-api` +
  `super-admin` + the Platform DB.
- **Never copy another system's production secrets** into this repo's env.
- **`DATABASE_URL` must target the Platform DB.** Verify this before running any
  migration. The `.env.example` default DB name is `platform_db` to make the
  intent explicit (it's an example — set your real value in `.env`).
- **Secrets are provided via env / a secrets provider** (`SECRETS_PROVIDER`),
  never committed. `.env` is git-ignored; `.env.example` holds only placeholders.
- **The frontend gets only `VITE_*`** — never server secrets. The refresh secret
  stays an HTTP-only cookie; no secret is exposed to browser code
  (`docs/PLATFORM-SECURITY.md`).

## 3. Migration safety (env-related)

- Migrations are applied **deliberately**, never automatically. Verify
  `DATABASE_URL` → Platform DB first.
- Two migrations are currently **authored but not executed** (apply with
  `prisma migrate deploy` when ready):
  - `20260909000000_add_tenant_api_credentials` (adds `tenant_api_credentials`)
  - `20260910000000_remove_demo_models` (drops the demo `todos`/`examples` tables — **destructive**)
- Never run `prisma migrate dev/deploy`, `db push`, `reset`, or `db seed`
  against a database without confirming the target.

## 4. Independent build & deployment (Phase 17 — verified)

The platform builds and deploys independently of any other system. Verified:

### 4.1 Independent builds

Each app builds on its own; the only shared dependency is the in-repo
`@app/api-contracts` package (built first). No app build depends on another app.

```bash
npm run build:contracts     # @app/api-contracts (tsc)  — shared types
npm run build:api           # @app/api → platform-api    (tsup → dist/server.js)
npm run build:super-admin   # @app/super-admin           (vite → static assets)
```

All three succeed independently (verified this phase). `npm run build` runs them
in order for convenience, but `build:api` and `build:super-admin` each work
alone once contracts are built.

### 4.2 API image is self-contained

`apps/platform-api/Dockerfile` (root build context) copies **only**
`apps/platform-api`, `packages/api-contracts`, and `prisma` — **no other app**.
Verified the COPY set contains no `apps/admin` / logistics paths. Result: the
`platform-api` image builds with nothing from any other system.

```bash
docker build -f apps/platform-api/Dockerfile -t platform-api .
```

(The root `Dockerfile` is an equivalent self-contained build; both reference only
`apps/platform-api`.)

### 4.3 Frontend deploys as static assets

`apps/super-admin` builds to static files (`dist/`) served by any static host /
CDN, pointing at the Platform API via `VITE_API_BASE_URL`. No server runtime.

### 4.4 Infra manifests are platform-only

`k8s/`, `render.yaml`, `fly.toml`, `docker/docker-compose.yml` reference only
platform-named services (`platform-api`, `platform-worker`, namespace
`platform`, image `.../super-admin-platform/platform-api`). A scan found **no**
admin/logistics/shipment/orders references in any infra manifest.

### 4.5 CI/CD is platform-only

- `.github/workflows/ci.yml`: typecheck all workspaces → generate Prisma client →
  test (`@app/api` against a real Postgres) → build (contracts → api →
  super-admin) → build the `platform-api` Docker image.
- `.github/workflows/deploy.yml`: build & push the `platform-api` image
  (`ghcr.io/<owner>/api`) from `apps/platform-api/Dockerfile`.
- Neither builds, tests, nor migrates any other system.

### 4.6 Guarantee

**Platform deployment requires no other system's build, image, or migrations.**
It needs only: the `platform-api` image, the built `super-admin` static assets,
the Platform DB (with the platform migrations applied), Redis, and the platform
env (§1). There is no build-time or deploy-time dependency on a tenant/logistics
system (none exists — `docs/PLATFORM-LOGISTICS-INTEGRATION.md`).

---

## Gate

**Phase 15** confirmed the platform environment configuration is independent and
platform-only: `DATABASE_URL` targets the Platform DB (example aligned to
`platform_db`), no logistics/business env keys exist, no foreign production
secrets, the frontend receives only `VITE_*`, and migrations are applied
deliberately with the target verified.

**Phase 17** verified independent build & deployment: `platform-api` and
`super-admin` build on their own (only sharing `api-contracts`), the API image
is self-contained (no other app in its build context), infra manifests and CI/CD
are platform-only, and platform deployment requires no other system's build,
image, or migrations. No runtime code, schema, or database command changed in
these phases.
