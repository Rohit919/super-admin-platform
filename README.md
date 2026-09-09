# 🏋️ Gym Platform API

The centralized backend API for the Gym SaaS Platform. A multi-tenant Fastify
service — authentication, authorization, tenant isolation, and (incrementally)
the gym domain — built on Prisma, PostgreSQL, Redis, and the Golden Orchestrator
pattern. It is the single source of truth for business rules and data access;
all client applications (super-admin, tenant-web, native mobile) consume it.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📦 Repository Layout

This is an **npm-workspaces** monorepo: the API app, a shared contracts package,
and root-level Prisma and infrastructure.

```
gym-platform-api/
├── apps/
│   └── platform-api/               # The API — control plane (@app/api)
│       ├── src/
│       │   ├── app.ts              # Plugin + module composition
│       │   ├── server.ts           # Process lifecycle / graceful shutdown
│       │   ├── config/             # env schema + derived config
│       │   ├── core/               # errors, tenant, authorization, audit, security, observability
│       │   ├── plugins/            # db, auth, cors, env, metrics, swagger, csrf
│       │   ├── modules/            # vertical slices (see below)
│       │   ├── queue/  workers/    # BullMQ background jobs
│       ├── tsconfig.json  tsup.config.ts  vitest.config.ts
│       └── Dockerfile
│
├── packages/
│   └── api-contracts/              # Shared TypeBox schemas (@app/api-contracts)
│
├── prisma/                         # schema.prisma + migrations + seed
├── docker/                         # postgres, prometheus, grafana
├── k8s/                            # deployment manifests
├── docs/                           # architecture + guides
└── package.json                    # workspace manager
```

### API module structure (vertical slices)

Each domain owns its full lifecycle in one folder:

```
apps/platform-api/src/modules/
├── api-index/    # GET /api/v1 — version + endpoint catalog
├── health/       # liveness + readiness
├── auth/         # login, register, refresh, logout, verify, OTP, password reset
├── users/        # user profile + management
├── roles/        # RBAC role administration
├── tenants/      # caller-scoped tenant operations
├── platform/     # platform (super-admin) control plane — tenant lifecycle, plans, audit
├── branding/     # tenant branding
└── admin/        # operational diagnostics dashboard
```

The gym domain (members, trainers, workouts, memberships, payments, etc.) is
being added incrementally on top of this multi-tenant foundation.

---

## ✨ Features

- **Fastify + TypeScript** — strict mode, native performance
- **Prisma + PostgreSQL** — type-safe ORM with migrations
- **Multi-tenancy** — explicit, row-level `tenantId` scoping enforced in application code (no hidden middleware)
- **RBAC** — permission-based authorization; tenant roles and platform roles
- **Auth** — access + refresh tokens with rotation, OTP, password reset, account lockout
- **Golden Orchestrator pattern** — pipeline-based business logic with per-stage metrics
- **TypeBox validation** — request/response schemas shared via `@app/api-contracts`
- **Prometheus metrics** at `/metrics`, **Swagger** at `/documentation`
- **Health/readiness probes**, graceful shutdown, structured Pino logging
- **BullMQ workers** for background jobs
- **Audit logging** for high-value authorization changes

### Shared contracts (`packages/api-contracts`)

Single source of truth for request/response shapes. The API and every client
import the exact same TypeBox schemas — contract drift is impossible.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 22+ LTS
- Docker & Docker Compose

### 1. Install

```bash
npm install
```

### 2. Start the database & run migrations

```bash
npm run docker:up          # starts postgres (+ prometheus, grafana)
npm run db:migrate         # applies Prisma migrations
npm run db:seed            # seeds RBAC + an initial admin (see below)
```

Ensure a `.env` exists at the repo root (see [Environment](#-environment)).

The seed requires admin credentials via environment variables (there is no
default password, and it refuses to run in production without an explicit
opt-in):

```bash
SEED_ADMIN_EMAIL=admin@example.com \
SEED_ADMIN_PASSWORD='a-strong-password-min-12-chars' \
SEED_ADMIN_NAME='Platform Admin' \
npm run db:seed
```

### 3. Run the API

```bash
npm run dev:api            # API on :3000
npm run worker --workspace @app/api   # background job worker (optional)
```

Then open:

- **API index**: http://localhost:3000/api/v1 (version + endpoint catalog)
- **Swagger**: http://localhost:3000/documentation
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001

---

## 🛠️ Scripts (run from repo root)

| Script                              | What it does                         |
| ----------------------------------- | ------------------------------------ |
| `npm run dev:api`                   | Start the Fastify API (tsx watch)    |
| `npm run build`                     | Build contracts → api, in order      |
| `npm run build:contracts`           | Build the shared contracts package   |
| `npm run build:api`                 | Build the API only                   |
| `npm run test`                      | Run the API test suite               |
| `npm run typecheck`                 | Typecheck every workspace            |
| `npm run lint`                      | ESLint (flat config)                 |
| `npm run check:api-drift`           | Fail on hardcoded `/api/v1` paths    |
| `npm run check:boundary`            | Enforce platform boundary guardrails |
| `npm run db:migrate`                | Prisma migrate (dev)                 |
| `npm run db:seed`                   | Seed RBAC + initial admin            |
| `npm run db:studio`                 | Open Prisma Studio                   |
| `npm run docker:up` / `docker:down` | Start / stop infra containers        |

Per-workspace scripts run with `npm run <script> --workspace @app/<name>`.

---

## 🎯 API Endpoints

`GET /api/v1` returns a live catalog. A sample of the current surface:

**Public**

- `GET /api/v1` — API index (version + endpoints)
- `GET /api/v1/health` — liveness
- `GET /api/v1/ready` — readiness (DB check)
- `POST /api/v1/auth/register` — create account
- `POST /api/v1/auth/login` — log in (returns access + refresh tokens)
- `POST /api/v1/auth/refresh` — rotate refresh token

**Protected (Bearer token)**

- `GET /api/v1/auth/verify` — verify access token
- `GET /api/v1/users/me` — current user profile
- `GET /api/v1/platform/*` — platform control-plane (tenant lifecycle, plans, audit)

See [docs/API_ENDPOINTS.md](./docs/API_ENDPOINTS.md) for the full surface.

---

## 🏗️ Golden Orchestrator Pattern

Structured, observable business logic through pipelines. See
**[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** for the deep dive.

```typescript
class CreateMemberOrchestrator extends BaseOrchestrator<
  MemberPipelineContext,
  Member,
  CreateMemberInput
> {
  protected getPipeline(): PipelineStage<MemberPipelineContext>[] {
    return [
      { name: "validate-input", operation: validateInput, critical: true },
      { name: "create-member", operation: createMember, critical: true },
      { name: "notify-creation", operation: notifyCreation, critical: false },
    ];
  }
}
```

**Benefits:** pure testable operations, automatic per-stage performance tracking,
composability, critical vs non-critical stages, clean separation of concerns.

**When to use it:** multi-step logic, per-operation metrics, independent failure modes.
**When to use direct Prisma access:** simple single-query CRUD.

---

## 🏢 Multi-Tenancy & Isolation

Tenant isolation is a server-side security boundary. Tenant-owned records carry
`tenantId`, and every tenant-scoped query is filtered explicitly through the
`getTenantDb(prisma, tenantId)` accessor — there is no hidden Prisma middleware
rewriting queries. Client-supplied tenant hints (e.g. `X-Tenant-Id`) are never
trusted; the active tenant is resolved from an authenticated `TenantMembership`.

Platform (super-admin) operations deliberately bypass tenant scoping and use the
raw Prisma client, gated behind an `PlatformMembership` + `platform.*` RBAC
permission. See [docs/super-admin/MULTI-TENANT-ARCHITECTURE.md](./docs/super-admin/MULTI-TENANT-ARCHITECTURE.md).

---

## 🧪 Testing

```bash
npm run test                         # API suite
npm run test:coverage --workspace @app/api
```

Tests use `apps/platform-api/src/core/testing/test-app.ts` — a `buildTestApp()`
factory that injects mock Prisma and env, so tests need **no database and no
`.env`**. Tests are co-located inside each module's `__tests__/`.

---

## 📊 Monitoring & Observability

- **Prometheus** — HTTP metrics + orchestrator pipeline/stage metrics at `/metrics`
- **Grafana** — system overview + auto-generated per-service dashboards
- **Health checks** — `/api/v1/health` (liveness), `/api/v1/ready` (DB readiness)
- **Structured logging** — Pino, with request IDs and authenticated-user context

---

## 🔒 Environment

Root `.env` (validated at startup by `@fastify/env`). See `.env.example` for the
full list. Core values:

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gym_platform
DATABASE_DIRECT_URL=postgresql://postgres:postgres@localhost:5432/gym_platform
JWT_SECRET=change-me-to-at-least-32-characters-long
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
API_PREFIX=/api
API_VERSION=v1
RATE_LIMIT_MAX=100
RATE_LIMIT_TIME_WINDOW=60000
CORS_ORIGIN=http://localhost:5173
METRICS_ENABLED=true
SWAGGER_ENABLED=true
```

Never commit real secrets. Production secrets must be supplied through a
secret-management system, not the repository.

---

## 🔐 Security

- JWT auth with refresh-token rotation and family reuse detection
- Permission-based RBAC; tenant isolation enforced server-side
- Rate limiting, Helmet security headers, configurable CORS, origin-based CSRF
- TypeBox input validation, Prisma-parameterized queries
- Startup env validation (fail fast on missing config)
- Audit logging for authorization changes

---

## 🔌 Circuit Breakers (outbound calls)

Wrap any call to an external service (HTTP/RPC) so a failing dependency degrades
gracefully instead of cascading. When failures exceed the threshold the circuit
opens and calls fail fast with `CircuitOpenError` (HTTP 503) until it recovers.

```ts
import { withCircuitBreaker } from "@core/circuit-breaker.js";

const data = await withCircuitBreaker(
  "sendgrid", // service name (also the metric label)
  (signal) => fetch(url, { signal }), // signal fires on timeout — pass it through
  { timeout: 3000, errorThresholdPercentage: 50, resetTimeout: 30000 },
);
```

State is exported to Prometheus as `circuit_breaker_state{service,state}`.

---

## ⚙️ Background workers

Non-critical work (notifications, emails, webhooks) runs off the HTTP path via
BullMQ. The API enqueues a job and returns immediately; a separate worker
process consumes it.

```bash
npm run dev:api                        # API (enqueues jobs)
npm run worker --workspace @app/api    # worker (processes jobs)
```

Jobs retry 3× with exponential backoff; exhausted jobs remain in the failed set
(dead-letter) and are logged at `error`. Queue depth is exported as
`bullmq_jobs{queue,state}` on the worker's metrics port (`9101`).

---

## 📚 Documentation

- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — architecture & orchestrator pattern
- **[docs/MULTI_TENANT_ARCHITECTURE.md](./docs/MULTI_TENANT_ARCHITECTURE.md)** — multi-tenant model & isolation
- **[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)** — setup & first service
- **[DEPLOY.md](./DEPLOY.md)** — deployment options

---

## 📝 License

MIT — see [LICENSE](LICENSE).

Built with Fastify, Prisma, and TypeBox.
