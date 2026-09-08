# Design: Enterprise Scale

## Architecture Overview

This document describes the technical design for transforming the hardened single-instance
API into a horizontally scalable enterprise system. Each section covers the architectural
decision, alternatives considered, failure modes, and exact implementation approach.

---

## Phase 1 — Horizontal Scalability

---

### DD-101: Redis Plugin Architecture (REQ-101)

**The shared infrastructure problem:**

Three features need Redis independently: distributed rate limiting, BullMQ queues, and
session/revocation state. The naive approach is three separate `ioredis` connections —
one per feature. This is wasteful (each `ioredis` connection holds a TCP socket + buffers)
and makes connection lifecycle management fragmented.

**Chosen approach: single Redis plugin, shared connection**

```
src/plugins/redis.ts
  ↓ decorates fastify.redis (ioredis instance)
  ↓ registered before any plugin that needs Redis
  ↓ onClose hook: fastify.redis.disconnect()

src/plugins/rate-limit.ts  ← imports fastify.redis
src/queue/producer.ts      ← imports fastify.redis
src/plugins/auth.ts        ← (future) token revocation blacklist
```

**Why `ioredis` over `node-redis`?**

- BullMQ is built on `ioredis` internally — using the same library avoids two Redis
  client implementations
- `ioredis` has built-in cluster support, Sentinel failover, and Lua scripting support
- `@fastify/rate-limit` supports `ioredis` natively via its `store` option

**Fail-open design for rate limiting:**

If Redis is unavailable, `@fastify/rate-limit` should fall back to in-memory limiting
(fail-open), not reject all requests (fail-closed). The consequence of fail-open is
degraded rate limit enforcement — acceptable. The consequence of fail-closed is a complete
outage whenever Redis is briefly unavailable — not acceptable.

```typescript
// Configured via allowDeny option or a custom store that gracefully degrades
const store = redis ? new RedisStore({ client: redis }) : undefined; // falls back to memory store automatically
```

**Plugin registration order:**

```
envPlugin → redisPlugin → prismaPlugin → authPlugin → rateLimitPlugin → ...
```

`redisPlugin` must be registered before `authPlugin` (future token revocation) and
`rateLimitPlugin`.

**Files:**

- `src/plugins/redis.ts` — new
- `src/app.ts` — add redisPlugin registration
- `docker/docker-compose.yml` — add Redis service

---

### DD-102: BullMQ Queue Architecture (REQ-102)

**The core problem:**

The `notify-creation` stage in `CreateTodoOrchestrator` is `critical: false` — if it
fails, the todo is still created. But it still runs inside the HTTP request loop. As
integrations grow, this becomes:

```
HTTP request (target: < 50ms)
  → validate (1ms)
  → create todo in DB (5ms)
  → send email via SendGrid (200-500ms)  ← kills your P99
  → POST to Slack webhook (100-300ms)    ← doubles it again
```

**Queue design principles:**

1. **Enqueue is synchronous, execute is asynchronous.** The HTTP handler enqueues a job
   (< 5ms Redis write) and returns. The worker picks it up in a separate process.

2. **Jobs are serializable.** Job data contains only primitives and IDs — no Prisma
   objects, no class instances, no circular references.

3. **Workers are independent processes.** `npm run worker` starts workers separately from
   `npm run dev`. In Docker, `app` and `worker` are separate containers from the same image.

4. **Dead-letter queue (DLQ) for failed jobs.** After `maxAttempts` retries, jobs move
   to a separate `failed-notifications` queue. An alert fires when the DLQ has jobs.

**Directory structure:**

```
src/
  queue/
    index.ts          ← queue definitions (names, default options)
    producer.ts       ← enqueue helpers (type-safe job factories)
    types.ts          ← JobData interfaces (shared between producer and worker)
  workers/
    index.ts          ← worker process entry point (mirrors server.ts)
    notification.worker.ts ← processes NotificationJob
    worker-metrics.ts ← Prometheus gauges for queue depths
```

**Trace context propagation:**

W3C `traceparent` is a string like `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`.
It is serialized into job data:

```typescript
interface NotificationJobData {
  todoId: string;
  userId: string;
  traceparent?: string; // W3C trace context from the HTTP request
}
```

In the worker, the `traceparent` is extracted and used to create a child span:

```typescript
const parentContext = propagation.extract(context.active(), { traceparent: job.data.traceparent });
return context.with(parentContext, () => tracer.startActiveSpan('worker.notify', span => { ... }));
```

**Retry configuration:**

```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,  // 1s, 5s, 25s
  },
  removeOnComplete: { count: 1000 },  // keep last 1000 for debugging
  removeOnFail: false,                 // keep all failed for DLQ alerting
}
```

**Files:**

- `src/queue/index.ts`, `src/queue/producer.ts`, `src/queue/types.ts` — new
- `src/workers/index.ts`, `src/workers/notification.worker.ts` — new
- `src/services/todo/operations/notify-creation.ts` — updated to enqueue instead of execute
- `package.json` — add `"worker": "tsx src/workers/index.ts"` script
- `docker/docker-compose.yml` — add worker service

---

### DD-103: Circuit Breaker Implementation (REQ-103)

**The failure cascade problem:**

Without circuit breakers, a degraded external service causes:

1. Stage calls external API → hangs for 30s (default TCP timeout)
2. All orchestrator pipelines that call this stage are stuck
3. Fastify thread pool exhausts
4. All API endpoints become unresponsive
5. Health check fails
6. Load balancer routes traffic to this instance AND marks it as down simultaneously

Circuit breakers add a state machine in front of the call:

```
CLOSED  →  (failure threshold reached)  →  OPEN
OPEN    →  (reset timeout elapsed)       →  HALF-OPEN
HALF-OPEN  →  (probe succeeds)           →  CLOSED
HALF-OPEN  →  (probe fails)              →  OPEN
```

When the circuit is OPEN, calls fail immediately without a network attempt — the caller
gets a `CircuitOpenError` in < 1ms rather than waiting 30s.

**Why `opossum` over rolling your own?**

- Battle-tested with correct half-open probe behavior
- Emits events (`open`, `close`, `halfOpen`, `fallback`, `success`, `failure`) — easy
  to hook Prometheus metrics onto
- Supports `AbortController` signal injection for request cancellation
- 5KB, zero dependencies

**Generic wrapper design:**

```typescript
// src/core/circuit-breaker.ts

interface CircuitBreakerOptions {
  timeout: number; // ms — AbortController fires after this
  errorThresholdPercentage: number; // 50 = open after 50% failures
  resetTimeout: number; // ms — how long to stay open before half-open
  name: string; // for metrics labels
}

async function withCircuitBreaker<TInput, TOutput>(
  fn: (input: TInput, signal: AbortSignal) => Promise<TOutput>,
  input: TInput,
  options: CircuitBreakerOptions,
): Promise<TOutput>;
```

The `AbortSignal` is passed into `fn` so the caller can pass it to `fetch()`, `axios`,
or any other cancellable async operation. When the circuit breaker times out, the signal
fires and the underlying call cancels.

**Prometheus integration:**

```typescript
breaker.on("open", () => circuitState.labels({ name, state: "open" }).set(1));
breaker.on("close", () =>
  circuitState.labels({ name, state: "closed" }).set(1),
);
breaker.on("halfOpen", () =>
  circuitState.labels({ name, state: "half_open" }).set(1),
);
```

**Files:**

- `src/core/circuit-breaker.ts` — new
- `src/core/orchestration/base-orchestrator.ts` — document usage pattern

---

## Phase 2 — Database Architecture

---

### DD-104: PgBouncer Architecture (REQ-104)

**Connection math:**

| Scenario                                                       | Connections    |
| -------------------------------------------------------------- | -------------- |
| 1 instance, Prisma default (4 vCPU)                            | 9 connections  |
| 10 instances, Prisma default                                   | 90 connections |
| 10 instances + Prisma `connection_limit=1` + PgBouncer pool=20 | 20 connections |

PgBouncer in **transaction-pooling mode** means a database connection is only held for
the duration of a single transaction (or a single non-transactional query). Between
transactions, the connection returns to the pool. This is the most efficient mode.

**The `directUrl` requirement:**

Prisma migrations (`migrate dev`, `migrate deploy`) and some schema introspection commands
require a direct PostgreSQL connection — they use `SET search_path`, advisory locks, and
other session-level commands that don't work through transaction-pooling mode.

Prisma 4.10+ supports `directUrl` in the datasource block:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        // → PgBouncer (app traffic)
  directUrl = env("DATABASE_DIRECT_URL") // → PostgreSQL (migrations only)
}
```

**Connection string parameters:**

```
# App traffic via PgBouncer
DATABASE_URL=postgresql://user:pass@pgbouncer:5432/db?connection_limit=1&pool_timeout=10

# Migrations direct to Postgres
DATABASE_DIRECT_URL=postgresql://user:pass@postgres:5432/db?sslmode=require
```

The `connection_limit=1` on `DATABASE_URL` is intentional: PgBouncer IS the pool.
Prisma having its own pool on top of PgBouncer creates a "pool of pools" that wastes
connections without benefit.

**PgBouncer config (`docker/pgbouncer/pgbouncer.ini`):**

```ini
[databases]
fastify_starter = host=postgres port=5432 dbname=fastify_starter

[pgbouncer]
pool_mode = transaction
max_client_conn = 200
default_pool_size = 20
reserve_pool_size = 5
server_idle_timeout = 600
log_connections = 0
log_disconnections = 0
```

**Files:**

- `docker/docker-compose.yml` — add pgbouncer service
- `docker/pgbouncer/pgbouncer.ini` — new
- `docker/pgbouncer/userlist.txt` — new (PgBouncer auth)
- `prisma/schema.prisma` — add `directUrl`
- `.env.example` — add `DATABASE_DIRECT_URL`

---

### DD-105: Expand/Contract Pattern (REQ-105)

**Why standard migrations break rolling deploys:**

In a rolling deploy, Kubernetes replaces pods one-by-one. During the transition:

- Some pods run version N (old code)
- Some pods run version N+1 (new code)
- The database is at version N+1 schema (migration ran before new pods started)

If the migration **renamed a column** (`user_name` → `username`):

- Old pods write to `user_name` (column no longer exists) → crashes
- New pods write to `username` → works

**The three phases of Expand/Contract:**

**Expand (deploy 1):**

```sql
-- Add new column alongside old one
ALTER TABLE users ADD COLUMN username VARCHAR(100);
-- New code writes to BOTH columns; old code only writes to user_name
```

**Migrate (backfill job):**

```sql
-- Run as a migration or one-off script
UPDATE users SET username = user_name WHERE username IS NULL;
```

**Contract (deploy 2, separate PR, after all instances run new code):**

```sql
-- Only safe once NO instances are running code that uses user_name
ALTER TABLE users DROP COLUMN user_name;
```

**Enforcement mechanism:**

A PR checklist in `.github/pull_request_template.md`:

```markdown
## Migration Checklist

If this PR includes a Prisma migration, confirm:

- [ ] Migration is backward compatible with the previous version of the app
- [ ] OR this PR follows the Expand phase (additive only)
- [ ] OR this is the Contract phase (removing old columns) and all instances
      have been running the Expand code for at least one release
```

**Files:**

- `docs/MIGRATIONS.md` — new, documents the pattern with worked examples
- `.github/pull_request_template.md` — new

---

### DD-106: Query Observability (REQ-106)

**Two separate concerns:**

1. **Development visibility:** See slow queries as they happen during local dev
2. **Staging analysis:** Identify patterns (N+1, missing indexes) before prod

**pg_stat_statements setup (`docker/init.sql`):**

```sql
-- Enable pg_stat_statements extension at cluster init
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';
```

Note: `shared_preload_libraries` requires a PostgreSQL restart. The init.sql in Docker
runs on first container start — the extension is available from the start.

**Prisma metrics (requires `previewFeatures = ["metrics"]` in schema.prisma):**

```typescript
const metrics = await prisma.$metrics.json();
// Returns pool stats: active connections, idle connections, wait time
```

This is different from the `tracing` preview feature (also needed). Both can be enabled:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["metrics", "tracing"]
}
```

**Files:**

- `docker/init.sql` — add pg_stat_statements
- `prisma/schema.prisma` — add metrics previewFeature
- `src/routes/` — add admin metrics route
- `scripts/analyze-queries.ts` — new

---

## Phase 3 — Security Architecture

---

### DD-107: HTTP-Only Cookie Architecture (REQ-107)

**Why cookies over response body for refresh tokens:**

| Attack vector                         | Response body  | HTTP-only cookie               |
| ------------------------------------- | -------------- | ------------------------------ |
| XSS reads token via `document.cookie` | Token exposed  | ❌ Not accessible              |
| XSS reads token from `localStorage`   | Token exposed  | ❌ Not in storage              |
| XSS reads from `fetch` response       | Token exposed  | ❌ Not in response             |
| CSRF forces a refresh → token rotated | Not applicable | Mitigated by `SameSite=Strict` |

`SameSite=Strict` is the key CSRF mitigation. The browser will not send the cookie on
cross-origin requests, so a CSRF attack cannot trigger a token refresh on behalf of the user.

**`Path=/api/v1/auth/refresh` scoping:**

Without path scoping, the browser sends the `refreshToken` cookie on EVERY request to
the API (including `GET /todos`, `POST /todos`). This is unnecessary exposure. With
`Path=/api/v1/auth/refresh`, the cookie is only sent to the exact refresh endpoint.

**Development (HTTP) vs Production (HTTPS):**

The `Secure` flag prevents the cookie from being sent over HTTP. In development (localhost
HTTP), this would break the entire flow. Control via env:

```typescript
const isSecure =
  fastify.config.NODE_ENV === "production" ||
  fastify.config.HTTPS_ONLY === true;
reply.setCookie("refreshToken", token, {
  httpOnly: true,
  secure: isSecure,
  sameSite: "strict",
  path: "/api/v1/auth/refresh",
  maxAge: parseDurationMs(fastify.config.REFRESH_TOKEN_EXPIRES_IN) / 1000, // seconds
});
```

**Logout cookie clearing:**

```typescript
reply.clearCookie("refreshToken", { path: "/api/v1/auth/refresh" });
```

Note: `clearCookie` sets `maxAge=0` and `expires=past` — the browser deletes it.

**Files:**

- `package.json` — add `@fastify/cookie`
- `src/app.ts` — register cookie plugin
- `src/routes/auth/index.ts` — update login, register, refresh, logout
- `src/utils/test-app.ts` — add cookie plugin to test app

---

### DD-108: Centralized RBAC Design (REQ-108)

**Permission matrix approach:**

Rather than `if (user.role === 'admin' || user.id === resource.userId)` scattered
throughout handlers, define all permissions in one place:

```typescript
// src/core/authorization/permissions.ts

export const PERMISSIONS = {
  todo: {
    create: ["user", "admin"],
    read: ["user", "admin"], // with ownership check for 'user'
    update: ["user", "admin"], // with ownership check for 'user'
    delete: ["user", "admin"], // with ownership check for 'user'
    readAll: ["admin"], // admin can list all users' todos
  },
  user: {
    read: ["user", "admin"], // users can read themselves; admin reads anyone
    update: ["user", "admin"], // with ownership check for 'user'
    delete: ["admin"],
    list: ["admin"],
  },
} as const;
```

**Two-layer check:**

1. **Role check (`requirePermission`):** Does this role have access to this action at all?
   If `user` is not in `permissions.todo.readAll`, a user role gets 403 immediately.

2. **Ownership check (`requireOwnership`):** For resources where `user` has access, do they
   own THIS specific resource? Ownership check is a database lookup — lazy (only runs after
   role check passes).

```typescript
// src/routes/todos/index.ts — updated
fastify.get(
  "/:id",
  {
    preHandler: [
      fastify.authenticate,
      requirePermission("todo", "read"),
      requireOwnership(async (req) => {
        const todo = await fastify.prisma.todo.findUnique({
          where: { id: req.params.id },
        });
        return todo?.userId; // returns the owner's userId
      }),
    ],
  },
  handler,
);
```

**Admin bypass:**

`requireOwnership` checks role first. If `request.user.role === 'admin'`, ownership is
not checked — admins can access any resource.

**Files:**

- `src/core/authorization/permissions.ts` — new
- `src/core/authorization/authorize.ts` — new
- `src/core/authorization/ownership.ts` — new
- `src/routes/todos/index.ts` — updated to use new preHandlers
- `src/routes/users/index.ts` — updated

---

### DD-109: TypeBox additionalProperties Configuration (REQ-109)

**The mass-assignment attack:**

Without `removeAdditional: true`:

```json
POST /auth/register
{ "email": "hacker@evil.com", "password": "pass123", "name": "Hacker", "role": "admin" }
```

If the handler does:

```typescript
const user = await prisma.user.create({ data: request.body });
// Creates user with role: 'admin' !
```

With `removeAdditional: true`, `request.body` has the `role` field stripped before
the handler runs. Even with explicit field selection in the Prisma call (which we already
do), stripping at the validation layer is belt-and-suspenders.

**Fastify AJV configuration:**

```typescript
// src/app.ts — pass ajv config to Fastify constructor
const app = Fastify({
  ajv: {
    customOptions: {
      removeAdditional: true, // strips unknown properties from request bodies
      useDefaults: true, // fills in schema defaults
      coerceTypes: "array", // coerces query string values to declared types
    },
  },
  // ... rest of options
}).withTypeProvider<TypeBoxTypeProvider>();
```

**Note on TypeBox and `additionalProperties`:**

TypeBox `Type.Object({...})` compiles to `{ type: 'object', properties: {...}, additionalProperties: false }`
by default. So TypeBox already sets `additionalProperties: false` in the schema. But this
only causes AJV to REJECT the request — it doesn't strip the field. `removeAdditional: true`
in the AJV config changes the behavior from "reject if extra fields present" to "silently
remove extra fields". This is the desired behavior for defense-in-depth.

**Files:**

- `src/app.ts` — add `ajv.customOptions` to Fastify constructor

---

### DD-110: External Secrets Architecture (REQ-110)

**The environment variable problem:**

`.env` files solve the "no hardcoded secrets in code" problem but introduce new problems:

- `.env` must be distributed to every engineer and every deployment environment
- Rotating a secret requires updating `.env` everywhere simultaneously
- No audit log of who accessed or changed a secret
- No expiration or automatic rotation

**Layered secrets architecture:**

```
loadSecrets()
  ├── SECRETS_PROVIDER=env (development)
  │     → reads from process.env / .env file
  │     → no external calls
  │
  ├── SECRETS_PROVIDER=aws (production on AWS)
  │     → calls AWS Secrets Manager GetSecretValue
  │     → merges into process.env before buildApp()
  │
  ├── SECRETS_PROVIDER=vault (production with HashiCorp)
  │     → authenticates with VAULT_TOKEN or k8s auth
  │     → reads from Vault KV store
  │
  └── SECRETS_PROVIDER=doppler (any environment)
        → reads from Doppler CLI or API
        → doppler run -- node dist/server.js (wraps the process)
```

**Secret masking in logs:**

Known secret env var names are masked:

```typescript
const SECRET_KEYS = [
  "JWT_SECRET",
  "DATABASE_URL",
  "METRICS_TOKEN",
  "GRAFANA_ADMIN_PASSWORD",
];
// Before logging any env-related debug output, redact these keys
```

**Fail-fast design:**

If `SECRETS_PROVIDER=aws` and the AWS call fails (permissions error, network issue,
secret doesn't exist), `loadSecrets()` throws and the server exits 1 before `buildApp()`
is called. This prevents the server from starting in a misconfigured state.

**Files:**

- `src/secrets.ts` — new
- `src/server.ts` — call `loadSecrets()` before `buildApp()`

---

## Phase 4 — Advanced Observability

---

### DD-111: Trace Propagation to Workers (REQ-111)

**The context boundary problem:**

OpenTelemetry context propagation works automatically within a single Node.js process
via `AsyncLocalStorage`. But when a job is serialized to Redis and picked up by a
worker in a different process (or different machine), the OTel context is lost.

**Solution: serialize context into job data**

```typescript
// Producer (in HTTP process):
import { propagation, context } from "@opentelemetry/api";

const carrier: Record<string, string> = {};
propagation.inject(context.active(), carrier);
// carrier is now: { traceparent: '00-abc123...', tracestate: '' }

await queue.add("notify", {
  todoId: todo.id,
  userId: user.id,
  _otelContext: carrier, // W3C trace context serialized as plain object
});

// Worker (in worker process):
import { propagation, context, trace } from "@opentelemetry/api";

const parentContext = propagation.extract(
  context.active(),
  job.data._otelContext ?? {},
);
const tracer = trace.getTracer("notification-worker");

await context.with(parentContext, async () => {
  const span = tracer.startSpan("worker.process-notification");
  // all operations inside this context are children of the HTTP span
  span.end();
});
```

**This produces a single trace in Jaeger:**

```
HTTP POST /todos (5ms)
  └─ Prisma: todo.create (3ms)
  └─ BullMQ: enqueue notify-creation (1ms)
     └─ [worker] notify-creation (150ms)    ← linked via traceparent
          └─ HTTP: POST /email-service (120ms)
```

**Files:**

- `src/queue/producer.ts` — inject OTel context into job data
- `src/workers/notification.worker.ts` — extract and restore OTel context

---

### DD-113: Event Loop Lag Detection (REQ-113)

**Why event loop lag matters more than CPU:**

Node.js is single-threaded. CPU usage shows how busy the process is; event loop lag shows
how BLOCKED it is. A synchronous operation (JSON parsing a 10MB response, bcrypt with
high cost, tight loop) can bring CPU to 100% for 500ms — every other request queued
during those 500ms experiences that 500ms as latency.

`prom-client`'s `collectDefaultMetrics` already tracks this via `nodejs_eventloop_lag_seconds`
using the `perf_hooks` event loop delay API. It checks every 10 seconds (configurable).

**Readiness probe integration:**

Adding event loop lag to the `/ready` check provides a critical signal to Kubernetes:

```
event loop lag > 200ms → return 503 from /ready
```

This causes Kubernetes to:

1. Stop routing NEW requests to this pod (readiness probe fails)
2. Keep the pod alive (liveness probe passes)
3. Wait for the lag to recover

This is the correct behavior — the pod isn't dead, just overloaded. Don't restart it,
just stop sending it new traffic until it recovers.

**Files:**

- `src/routes/health/index.ts` — update `/ready` to include event loop lag check

---

## Phase 5 — Container & Cloud Infrastructure

---

### DD-114: Distroless Docker Image (REQ-114)

**Alpine vs Distroless comparison:**

|                 | `node:20-alpine`     | `gcr.io/distroless/nodejs20-debian12` |
| --------------- | -------------------- | ------------------------------------- |
| Shell           | `/bin/ash`           | None                                  |
| Package manager | `apk`                | None                                  |
| Standard utils  | `ls`, `cat`, `wget`  | None                                  |
| Size            | ~170MB               | ~110MB                                |
| CVEs (typical)  | 5-15 low/medium      | 0-3 low                               |
| Debuggability   | Easy (exec into pod) | Hard (no shell)                       |

For debugging distroless in production, use an ephemeral debug container:

```bash
kubectl debug -it <pod> --image=busybox --target=app-container
```

**dumb-init in distroless:**

Distroless has no shell, so `apk add dumb-init` doesn't work. Copy the binary from
the builder stage:

```dockerfile
# Builder stage (alpine)
FROM node:20-alpine AS builder
RUN apk add --no-cache dumb-init
# ... build steps

# Production stage (distroless)
FROM gcr.io/distroless/nodejs20-debian12
COPY --from=builder /usr/bin/dumb-init /usr/bin/dumb-init
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist
# ...
USER nonroot  # distroless has nonroot (65532) built in
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]
```

**`trivy` scanning in CI:**

```yaml
- name: Scan image for vulnerabilities
  run: |
    docker run --rm \
      -v /var/run/docker.sock:/var/run/docker.sock \
      aquasec/trivy:latest image \
      --exit-code 1 \
      --severity HIGH,CRITICAL \
      --no-progress \
      fastify-starter:${{ github.sha }}
```

**Files:**

- `Dockerfile` — update production stage to distroless

---

### DD-116: Kubernetes Manifests Design (REQ-116)

**HPA metric choice: concurrency over CPU**

CPU-based HPA has a fundamental problem for Node.js: the event loop is single-threaded.
A Node.js process can handle 200 req/s at 15% CPU while still having a P99 latency of
500ms due to event loop queuing. Scaling on CPU won't help — you need more instances.

Concurrency-based HPA (via KEDA or custom metrics from `http_requests_in_progress`) scales
on how many requests are being handled simultaneously, which is a direct signal of whether
the instances need help.

**Target: 70 concurrent requests per replica**

At 100ms average response time, 70 concurrent = 700 req/s per replica. A 3-replica
deployment handles 2100 req/s. Scale-out triggers at ~50 concurrent (71% utilization),
giving time for new pods to start before the current pods are overwhelmed.

**PodDisruptionBudget:**

```yaml
spec:
  minAvailable: 1
```

This ensures at least 1 replica is always available during:

- Kubernetes node maintenance (`kubectl drain`)
- Rolling deployments
- Cluster upgrades

Without this, Kubernetes can evict all pods simultaneously, causing a complete outage.

**Migration Job vs Init Container:**

For Kubernetes, a `Job` is better than an `initContainer` for migrations:

|                       | `Job`          | `initContainer`      |
| --------------------- | -------------- | -------------------- |
| Runs once per deploy  | ✅             | ❌ Runs once per pod |
| Failure blocks deploy | ✅             | ✅                   |
| Visible in kubectl    | ✅             | ❌                   |
| Can be parallelized   | No (1 replica) | N/A                  |

**Files:**

- `k8s/deployment.yaml` — new
- `k8s/service.yaml` — new
- `k8s/hpa.yaml` — new
- `k8s/pdb.yaml` — new
- `k8s/migrate-job.yaml` — new

---

## Cross-Cutting Concerns

### Redis Dependency on Worker and API

Both the API process and worker processes need Redis. Extract the Redis connection
factory into a shared utility (`src/utils/redis-client.ts`) that both `src/plugins/redis.ts`
and `src/workers/index.ts` can import.

### Type Safety Across Queue Boundaries

Job data crosses a process boundary via Redis serialization. Define all job data interfaces
in `src/queue/types.ts` and import from both the producer and the worker. Never use `any`
in job data — if it can't be serialized to JSON, it doesn't belong in a job.

### Database Migrations with PgBouncer

The `migrate-job.yaml` (Kubernetes) and the `migrate` compose service MUST use
`DATABASE_DIRECT_URL` (bypasses PgBouncer), not `DATABASE_URL` (goes through PgBouncer).
Prisma migrations use session-level commands that are incompatible with transaction pooling.

### Cookie Testing

`@fastify/cookie` must be registered in `buildTestApp()` in `src/utils/test-app.ts`.
Without it, `reply.setCookie` will throw in integration tests. The `app.inject()` method
in tests handles cookies correctly when the plugin is registered.
