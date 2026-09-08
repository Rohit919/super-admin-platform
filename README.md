# 🚀 Super Admin Platform — Monorepo

Platform control-plane monorepo: a **Platform API** (`platform-api`) and a **Super Admin frontend** (`super-admin`), sharing type-safe **TypeBox API contracts**, built on Prisma, Docker, Prometheus, and the Golden Orchestrator pattern.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📦 Monorepo Layout

This is an **npm-workspaces** monorepo with three workspaces plus root-level Prisma and infra.

```
super-admin-platform/
├── apps/
│   ├── platform-api/               # Platform API — control plane (@app/api)
│   │   ├── src/
│   │   │   ├── app.ts              # Plugin + module composition
│   │   │   ├── server.ts           # Process lifecycle / graceful shutdown
│   │   │   ├── config/             # env schema + derived config
│   │   │   ├── core/               # errors, hooks, orchestration, utils, testing
│   │   │   ├── plugins/            # db, auth, cors, env, metrics, swagger
│   │   │   └── modules/            # vertical slices (see below)
│   │   ├── tsconfig.json  tsup.config.ts  vitest.config.ts
│   │   └── Dockerfile
│   │
│   └── super-admin/                # Super Admin SPA — the platform frontend (@app/super-admin)
│       ├── src/                    # app, layouts, pages, modules, stores, lib
│       ├── vite.config.ts          # dev on :5174, proxy /api → :3000
│       └── index.html
│
├── packages/
│   └── api-contracts/              # Shared TypeBox schemas (@app/api-contracts)
│       └── src/                    # common, auth, users, index
│
├── prisma/                         # schema + migrations (shared)
├── docker/                         # postgres, prometheus, grafana
├── docs/                           # architecture + guides
├── .kiro/                          # specs (production-hardening, enterprise-scale)
└── package.json                    # workspace manager
```

### API module structure (vertical slices)

Each domain owns its full lifecycle in one folder:

```
apps/platform-api/src/modules/
├── api-index/    # GET /api/v1 — version + endpoint catalog
├── health/       # liveness + readiness
├── auth/         # login, register, refresh, logout, verify
│   ├── auth.routes.ts  auth.schemas.ts  auth.orchestrator.ts
│   ├── operations/     # hash-password, verify-password (pure fns)
│   ├── repositories/   # data access (adopt when needed)
│   └── __tests__/
├── users/        # profile
├── todos/        # reference Golden Orchestrator implementation
├── orders/       # scaffolded skeleton (no model yet)
└── example/      # direct-Prisma CRUD (contrast to orchestrator)
```

---

## ✨ Features

### Platform API (`apps/platform-api`)

- **Fastify + TypeScript** — strict mode, native performance
- **Prisma + PostgreSQL** — type-safe ORM with migrations
- **Golden Orchestrator pattern** — pipeline-based business logic with per-stage metrics
- **JWT auth** — access + refresh tokens with rotation
- **TypeBox validation** — request/response schemas shared with the frontend
- **Prometheus metrics** at `/metrics`, **Swagger** at `/documentation`
- **Health/readiness probes**, graceful shutdown, structured Pino logging
- **41 integration tests** with a mock-based test harness (no DB needed)

### Super Admin (`apps/super-admin`)

- **React + Vite + TypeScript** — fast SPA, no SSR overhead, route-level code-splitting
- **TanStack Query** for server state, **Zustand** for client/UI state
- **React Router** with auth guards + permission-aware route/nav authorization
- **Typed API client** with silent `401 → refresh → retry` handling — no raw `fetch()` in components
- **RBAC UI** driven by `/users/me`, with the API as the security boundary
- Consumes the **same TypeBox contracts** the API validates against
- 📖 See [`docs/SUPER-ADMIN-FRONTEND.md`](docs/SUPER-ADMIN-FRONTEND.md) for frontend ownership, the Platform API relationship, and deployment responsibility

### Shared (`packages/api-contracts`)

- Single source of truth for request/response shapes
- The API and the Super Admin frontend import the exact same schemas — **contract drift is impossible**

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ LTS
- Docker & Docker Compose

### 1. Install (all workspaces)

```bash
npm install
```

### 2. Start the database & run migrations

```bash
npm run docker:up          # starts postgres (+ prometheus, grafana)
npm run db:migrate         # applies Prisma migrations
```

Ensure a `.env` exists at the repo root (see [Environment](#-environment)).

### 3. Run the apps

```bash
# terminal 1 — API on :3000
npm run dev:api

# terminal 2 — Super Admin on :5174 (proxies /api to :3000)
npm run dev:super-admin
```

Then open:

- **Super Admin UI**: http://localhost:5174 (login: `demo@example.com` / `password123` if seeded)
- **API index**: http://localhost:3000/api/v1 (version + endpoint catalog)
- **Swagger**: http://localhost:3000/documentation
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001

---

## 🛠️ Scripts (run from repo root)

| Script                              | What it does                                  |
| ----------------------------------- | --------------------------------------------- |
| `npm run dev:api`                   | Start the Fastify API (tsx watch)             |
| `npm run dev:super-admin`           | Start the React Super Admin frontend (Vite)   |
| `npm run build`                     | Build contracts → api → super-admin, in order |
| `npm run build:contracts`           | Build the shared contracts package            |
| `npm run build:api`                 | Build the API only                            |
| `npm run build:super-admin`         | Build the Super Admin frontend only           |
| `npm run test`                      | Run the API test suite                        |
| `npm run typecheck`                 | Typecheck every workspace                     |
| `npm run db:migrate`                | Prisma migrate (dev)                          |
| `npm run db:studio`                 | Open Prisma Studio                            |
| `npm run docker:up` / `docker:down` | Start / stop infra containers                 |

Per-workspace scripts run with `npm run <script> --workspace @app/<name>`.

---

## 🎯 API Endpoints

`GET /api/v1` returns a live catalog. Current surface:

**Public**

- `GET /api/v1` — API index (version + endpoints)
- `GET /api/v1/health` — liveness
- `GET /api/v1/ready` — readiness (DB check)
- `POST /api/v1/auth/register` — create account
- `POST /api/v1/auth/login` — log in (returns access + refresh tokens)
- `POST /api/v1/auth/refresh` — rotate refresh token
- `POST /api/v1/auth/logout` — revoke refresh token

**Protected (Bearer token)**

- `GET /api/v1/auth/verify` — verify access token
- `GET /api/v1/users/me` — current user profile
- `GET /api/v1/todos` — list todos
- `POST /api/v1/todos` — **create todo (Golden Orchestrator) ⭐**
- `GET /api/v1/examples` — list examples (direct Prisma)
- `POST /api/v1/examples` — create example (direct Prisma)

---

## 🏗️ Golden Orchestrator Pattern

Structured, observable business logic through pipelines. See **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** for the deep dive.

```typescript
class CreateTodoOrchestrator extends BaseOrchestrator<
  TodoPipelineContext,
  Todo,
  CreateTodoInput
> {
  protected getPipeline(): PipelineStage<TodoPipelineContext>[] {
    return [
      { name: "validate-input", operation: validateInput, critical: true },
      { name: "create-todo", operation: createTodo, critical: true },
      { name: "notify-creation", operation: notifyCreation, critical: false },
    ];
  }
}
```

**Benefits:** pure testable operations, automatic per-stage performance tracking,
composability, critical vs non-critical stages, clean separation of concerns.

**When to use it:** multi-step logic, per-operation metrics, independent failure modes.
**When to use direct Prisma access:** simple single-query CRUD (see the `example` module).

---

## 🔗 Shared Contracts

The `packages/api-contracts` package holds TypeBox schemas consumed by both apps:

```
              @app/api-contracts
               /              \
              ↓                ↓
     apps/platform-api          apps/super-admin
     (Fastify schemas)          (typed API client)
```

This prevents mismatches like backend `"cancelled"` vs frontend `"cancel"`. Change a
contract once; both sides get the new type immediately. During dev the package resolves
to source via path aliases (tsconfig / vite / vitest / tsup), so there's no build step in
the inner loop.

---

## 🧪 Testing

```bash
npm run test                         # API suite (41 tests)
npm run test:coverage --workspace @app/api
```

Tests use `apps/platform-api/src/core/testing/test-app.ts` — a `buildTestApp()` factory that
injects mock Prisma and env, so tests need **no database and no `.env`**. Tests are
co-located inside each module's `__tests__/`.

---

## 📊 Monitoring & Observability

- **Prometheus** — HTTP metrics + orchestrator pipeline/stage metrics at `/metrics`
- **Grafana** — system overview + auto-generated per-service dashboards
- **Health checks** — `/api/v1/health` (liveness), `/api/v1/ready` (DB readiness)
- **Structured logging** — Pino, with request IDs and authenticated-user context

Generate dashboards from orchestrator code:

```bash
npm run generate:dashboards   # (run within apps/platform-api if wired there)
```

---

## 🔒 Environment

Root `.env` (validated at startup by `@fastify/env`):

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fastify_starter
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

The Super Admin frontend reads `VITE_API_BASE_URL` (defaults to `/api/v1`, proxied to the API in dev).

---

## 🔐 Security

- JWT auth with refresh-token rotation
- Rate limiting, Helmet security headers, configurable CORS
- TypeBox input validation, Prisma-parameterized queries
- Startup env validation (fail fast on missing config)

Further hardening and scale work is planned in the specs under
**`.kiro/specs/production-hardening`** and **`.kiro/specs/enterprise-scale`**
(RBAC, audit logging, Redis-backed rate limiting, BullMQ workers, distributed tracing, etc.).

---

## 📚 Documentation

- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Golden Orchestrator pattern
- **[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)** — setup & first service
- **[docs/PRODUCTION_PLAN.md](./docs/PRODUCTION_PLAN.md)** — production hardening plan
- **[DEPLOY.md](./DEPLOY.md)** — deployment options

---

## 📝 License

MIT — see [LICENSE](LICENSE).

Built with ❤️ using Fastify, Prisma, React, and TypeBox.

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

- Each service name gets its own breaker (state persists across calls).
- The `AbortSignal` cancels the underlying request when the timeout elapses.
- State is exported to Prometheus as `circuit_breaker_state{service,state}`
  (`closed` / `open` / `half_open`, 1 = current).
- An open circuit throws `CircuitOpenError` (503) with no network attempt.

Different services can have different tolerances — tune `timeout`,
`errorThresholdPercentage`, and `resetTimeout` per call site.

## ⚙️ Background workers

Non-critical work (notifications, emails, webhooks) runs off the HTTP path via
BullMQ. The API enqueues a job and returns immediately; a separate worker
process consumes it.

```bash
npm run dev:api      # API (enqueues jobs)
npm run worker --workspace @app/api   # worker (processes jobs)
```

Jobs retry 3× with exponential backoff; exhausted jobs remain in the failed set
(dead-letter) and are logged at `error`. Queue depth is exported as
`bullmq_jobs{queue,state}` on the worker's metrics port (`9101`).
