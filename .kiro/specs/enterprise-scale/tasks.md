# Tasks: Enterprise Scale

## Prerequisites

All tasks in `.kiro/specs/production-hardening/tasks.md` must be complete before
starting this spec. In particular:

- TASK-004 (graceful shutdown) must be done — workers extend the same pattern
- TASK-022–024 (OpenTelemetry) must be done — trace propagation builds on it
- TASK-030 (migrate service) must be done — PgBouncer changes the migration setup

---

## Phase 1 — Horizontal Scalability

### 1A — Redis Infrastructure

- [ ] **TASK-101** — Install Redis dependencies
  - Files: `package.json`
  - Run: `npm install ioredis @types/ioredis`
  - Run: `npm install --save-dev @types/ioredis`
  - Note: BullMQ bundles its own ioredis — install the standalone version too for
    shared connection management
  - Verify: `npm ls ioredis` shows installed

- [ ] **TASK-102** — Add Redis to docker-compose
  - Files: `docker/docker-compose.yml`
  - Add Redis 7 service:
    ```yaml
    redis:
      image: redis:7.2-alpine
      container_name: fastify_redis
      ports:
        - "6379:6379"
      volumes:
        - redis_data:/data
      command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
      restart: unless-stopped
      healthcheck:
        test: ["CMD", "redis-cli", "ping"]
        interval: 10s
        timeout: 5s
        retries: 5
    ```
  - Add `redis_data` to volumes section
  - Add `REDIS_URL=redis://localhost:6379` to `.env` and `.env.example`
  - Verify: `docker compose up redis` → `docker exec fastify_redis redis-cli ping` returns PONG

- [ ] **TASK-103** — Create Redis Fastify plugin
  - Files: `src/plugins/redis.ts` (new), `src/plugins/env.ts`, `src/app.ts`
  - Add `REDIS_URL: Type.String({ default: 'redis://localhost:6379' })` to env schema
  - Create `src/plugins/redis.ts`:
    - Import `Redis` from `ioredis`
    - Create Redis client, register `onClose` that calls `redis.disconnect()`
    - Decorate fastify as `fastify.redis`
    - On connection error: log `warn` (do NOT throw — fail-open)
    - On ready: log `info`
  - Add module augmentation: `FastifyInstance { redis: Redis }`
  - Register in `src/app.ts` BEFORE `authPlugin` and `rateLimitPlugin`
  - Verify: server starts, logs "Redis connected"

- [ ] **TASK-104** — Switch rate limiting to Redis store
  - Requirements: REQ-101
  - Design: DD-101
  - Files: `src/app.ts`
  - Update `@fastify/rate-limit` registration to pass the Redis store:
    ```typescript
    await app.register(rateLimitPlugin.default, {
      max: app.config.RATE_LIMIT_MAX,
      timeWindow: app.config.RATE_LIMIT_TIME_WINDOW,
      redis: app.redis,   // uses ioredis instance
      skip: ...,
    });
    ```
  - Add fallback: if `app.redis` is not connected, omit the `redis` option
    (falls back to memory store with a logged warning)
  - Verify: start two app instances on different ports, make 6 login attempts split across
    both — the 6th attempt is blocked by the shared Redis counter

---

### 1B — BullMQ Task Queue

- [ ] **TASK-105** — Install BullMQ
  - Files: `package.json`
  - Run: `npm install bullmq`
  - Verify: `npm ls bullmq` shows installed

- [ ] **TASK-106** — Define queue types and constants
  - Requirements: REQ-102
  - Files: `src/queue/types.ts` (new), `src/queue/index.ts` (new)
  - `src/queue/types.ts` — define job data interfaces:
    ```typescript
    export interface NotificationJobData {
      todoId: string;
      userId: string;
      title: string;
      _otelContext?: Record<string, string>; // W3C traceparent
    }
    // Add more job types as integrations grow
    export type QueueJobData = NotificationJobData; // union as queues grow
    ```
  - `src/queue/index.ts` — define queue names and default job options:
    ```typescript
    export const QUEUE_NAMES = { NOTIFICATIONS: "notifications" } as const;
    export const DEFAULT_JOB_OPTIONS = {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: false,
    };
    ```
  - Verify: `npm run typecheck` passes

- [ ] **TASK-107** — Create queue producer
  - Requirements: REQ-102
  - Design: DD-102
  - Files: `src/queue/producer.ts` (new)
  - Create `QueueProducer` class or module-level functions:
    ```typescript
    export async function enqueueNotification(
      queue: Queue,
      data: NotificationJobData,
    ): Promise<Job>;
    ```
  - Inject W3C trace context into `data._otelContext` using `@opentelemetry/api`
    `propagation.inject(context.active(), carrier)`
  - Verify: `npm run typecheck` passes

- [ ] **TASK-108** — Create BullMQ Fastify plugin
  - Files: `src/plugins/queue.ts` (new), `src/app.ts`
  - Create plugin that:
    - Creates a `Queue` instance using `fastify.redis`
    - Decorates `fastify.queue` with the Queue instance
    - Adds `onClose` hook that calls `fastify.queue.close()`
  - Register in `src/app.ts` after `redisPlugin`
  - Add module augmentation: `FastifyInstance { queue: Queue }`
  - Verify: server starts, queue is available

- [ ] **TASK-109** — Update notify-creation operation to enqueue
  - Requirements: REQ-102
  - Files: `src/services/todo/operations/notify-creation.ts`
  - Change `TodoPipelineContext` to include `queue?: Queue`
  - Update `CreateTodoOrchestrator.initializeContext` to include `fastify.queue`
  - Update `notifyCreation` operation to call `enqueueNotification()` instead of
    simulating inline — must complete in < 5ms
  - Verify: create a todo → response time does not include notification delay

- [ ] **TASK-110** — Create notification worker process
  - Requirements: REQ-102
  - Design: DD-102
  - Files: `src/workers/notification.worker.ts` (new), `src/workers/index.ts` (new)
  - `notification.worker.ts` — Worker that:
    - Extracts OTel context from `job.data._otelContext`
    - Restores trace context using `context.with(parentContext, ...)`
    - Processes the notification (log for now — real implementation uses SendGrid/etc.)
    - Logs success with `traceId` included in log fields
  - `src/workers/index.ts` — entry point:
    - Calls `loadSecrets()` (if implemented)
    - Creates ioredis connection
    - Starts worker
    - Handles SIGTERM: calls `worker.close()`
  - Add to `package.json`: `"worker": "tsx src/workers/index.ts"`
  - Verify: `npm run worker` starts, picks up jobs from the queue

- [ ] **TASK-111** — Expose queue metrics to Prometheus
  - Requirements: REQ-102
  - Files: `src/workers/worker-metrics.ts` (new)
  - Create Prometheus gauges: `bullmq_waiting_jobs`, `bullmq_active_jobs`,
    `bullmq_completed_jobs`, `bullmq_failed_jobs`, all labeled by `queue`
  - Poll queue counts every 15 seconds via `setInterval`
  - Expose metrics on the same Prometheus registry used by the API
  - Verify: `curl /metrics` includes `bullmq_waiting_jobs` after enqueueing a job

---

### 1C — Circuit Breakers

- [ ] **TASK-112** — Install opossum
  - Files: `package.json`
  - Run: `npm install opossum @types/opossum`
  - Verify: `npm ls opossum` shows installed

- [ ] **TASK-113** — Create circuit breaker utility
  - Requirements: REQ-103
  - Design: DD-103
  - Files: `src/core/circuit-breaker.ts` (new)
  - Implement `withCircuitBreaker<TInput, TOutput>(fn, input, options)`:
    - Creates `opossum` breaker wrapping the async function
    - Passes `AbortSignal` to the wrapped function
    - Registers Prometheus gauges for circuit state on `open/close/halfOpen` events
    - Throws `CircuitOpenError` (custom error class) when circuit is open
  - Add `CircuitOpenError extends AppError` to `src/utils/errors.ts`
  - Verify: `npm run typecheck` passes

- [ ] **TASK-114** — Document circuit breaker usage pattern
  - Files: `docs/CIRCUIT_BREAKERS.md` (new)
  - Document:
    - When to use (any outbound HTTP, gRPC, or RPC call)
    - How to configure thresholds for different service SLAs
    - How to test circuit open behavior in integration tests
    - Example usage in an orchestrator stage

---

## Phase 2 — Database Architecture

- [ ] **TASK-115** — Add PgBouncer to docker-compose
  - Requirements: REQ-104
  - Design: DD-104
  - Files: `docker/docker-compose.yml`, `docker/pgbouncer/pgbouncer.ini` (new),
    `docker/pgbouncer/userlist.txt` (new)
  - Add PgBouncer 1.22 service in transaction-pooling mode
  - Update `DATABASE_URL` in `.env` to point to PgBouncer (port 5432 on pgbouncer host)
  - Add `DATABASE_DIRECT_URL` to `.env` pointing directly to PostgreSQL
  - Verify: app connects through PgBouncer, `SHOW POOLS;` in pgbouncer admin shows connections

- [ ] **TASK-116** — Update prisma/schema.prisma to use directUrl
  - Requirements: REQ-104
  - Files: `prisma/schema.prisma`, `src/plugins/env.ts`, `.env.example`
  - Add `DATABASE_DIRECT_URL: Type.Optional(Type.String())` to env schema
  - Add to `prisma/schema.prisma`:
    ```prisma
    datasource db {
      provider  = "postgresql"
      url       = env("DATABASE_URL")
      directUrl = env("DATABASE_DIRECT_URL")
    }
    ```
  - Update `src/plugins/prisma.ts`: update connection string to include
    `connection_limit=1` when `DATABASE_URL` contains pgbouncer
  - Verify: `npx prisma migrate dev` uses direct URL; app traffic goes through PgBouncer

- [ ] **TASK-117** — Enable pg_stat_statements
  - Requirements: REQ-106
  - Design: DD-106
  - Files: `docker/init.sql`
  - Add `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` to `init.sql`
  - Note: requires PostgreSQL restart after adding to `shared_preload_libraries` —
    rebuild the postgres container: `docker compose down postgres && docker compose up postgres`
  - Verify: `SELECT * FROM pg_stat_statements LIMIT 5;` returns rows after making queries

- [ ] **TASK-118** — Enable Prisma metrics preview feature
  - Requirements: REQ-106
  - Files: `prisma/schema.prisma`
  - Add `"metrics"` to `previewFeatures` alongside `"tracing"`:
    ```prisma
    previewFeatures = ["metrics", "tracing"]
    ```
  - Run `npx prisma generate`
  - Verify: `npm run typecheck` passes

- [ ] **TASK-119** — Add admin DB metrics route
  - Requirements: REQ-106
  - Files: `src/routes/` (add admin route file)
  - Create `GET /api/v1/admin/db-metrics` protected by `authorize(['admin'])`
  - Returns: `await fastify.prisma.$metrics.json()`
  - Verify: admin user can access; regular user gets 403

- [ ] **TASK-120** — Create Expand/Contract migration documentation
  - Requirements: REQ-105
  - Design: DD-105
  - Files: `docs/MIGRATIONS.md` (new), `.github/pull_request_template.md` (new)
  - Document the pattern with a worked column-rename example showing all 3 phases
  - Add migration checklist to PR template
  - Verify: files committed to git

---

## Phase 3 — Security Architecture

- [ ] **TASK-121** — Install and register @fastify/cookie
  - Requirements: REQ-107
  - Files: `package.json`, `src/app.ts`, `src/utils/test-app.ts`
  - Run: `npm install @fastify/cookie`
  - Register `@fastify/cookie` in `src/app.ts` before auth routes
  - Register in `buildTestApp()` in `src/utils/test-app.ts`
  - Verify: `npm run typecheck` passes

- [ ] **TASK-122** — Migrate refresh tokens to HTTP-only cookies
  - Requirements: REQ-107
  - Design: DD-107
  - Files: `src/routes/auth/index.ts`, `src/plugins/env.ts`
  - Add `HTTPS_ONLY: Type.Boolean({ default: false })` to env schema
  - Update `/login` and `/register`:
    - Call `reply.setCookie('refreshToken', token, { httpOnly, secure, sameSite, path, maxAge })`
    - Remove `refreshToken` from the JSON response body
    - Update response TypeBox schema (remove refreshToken field)
  - Update `/refresh`:
    - Read from `request.cookies.refreshToken` instead of `request.body.refreshToken`
    - Update body schema (remove refreshToken from body)
  - Update `/logout`:
    - Call `reply.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' })`
    - Keep body schema (no body needed — cookie is implicit)
  - Update integration tests:
    - Check `Set-Cookie` header in login/register responses
    - Pass cookie in refresh/logout test requests using `headers: { cookie: '...' }`
  - Verify: login response has `Set-Cookie: refreshToken=...; HttpOnly; SameSite=Strict`

- [ ] **TASK-123** — Configure AJV additionalProperties: false
  - Requirements: REQ-109
  - Design: DD-109
  - Files: `src/app.ts`
  - Add `ajv: { customOptions: { removeAdditional: true, useDefaults: true } }` to
    Fastify constructor options
  - Add integration test: send `{ email, password, name, role: 'admin' }` to `/register`
    → created user has `role: 'user'`
  - Verify: `npm test -- --run` passes

- [ ] **TASK-124** — Create centralized authorization module
  - Requirements: REQ-108
  - Design: DD-108
  - Files: `src/core/authorization/permissions.ts` (new),
    `src/core/authorization/authorize.ts` (new),
    `src/core/authorization/ownership.ts` (new)
  - Implement permission matrix for `todo` and `user` resources
  - Implement `requirePermission(resource, action)` preHandler factory
  - Implement `requireOwnership(getOwnerId)` preHandler factory with admin bypass
  - Add integration tests:
    - User A cannot access User B's todo (403)
    - Admin can access any todo (200)
    - User can access their own todo (200)
  - Verify: all existing route tests still pass

- [ ] **TASK-125** — Apply RBAC to todo and user routes
  - Requirements: REQ-108
  - Files: `src/routes/todos/index.ts`, `src/routes/users/index.ts`
  - Replace `preValidation: [fastify.authenticate]` with explicit `preHandler` using
    `requirePermission` and `requireOwnership` where applicable
  - Verify: `npm test -- --run` passes

- [ ] **TASK-126** — Create secrets loader module
  - Requirements: REQ-110
  - Design: DD-110
  - Files: `src/secrets.ts` (new), `src/server.ts`, `src/plugins/env.ts`
  - Add `SECRETS_PROVIDER: Type.String({ default: 'env' })` to env schema
  - Implement `loadSecrets()` in `src/secrets.ts`:
    - `env`: no-op (process.env is already set by dotenv)
    - `aws`: stub that logs "AWS Secrets Manager not yet configured" — leave real impl
      for when AWS credentials are available
    - `vault`: stub
    - `doppler`: stub
  - Call `await loadSecrets()` in `src/server.ts` before `buildApp()`
  - Verify: server starts with `SECRETS_PROVIDER=env` (current behavior unchanged)

---

## Phase 4 — Advanced Observability

- [ ] **TASK-127** — Add event loop lag to readiness probe
  - Requirements: REQ-113
  - Design: DD-113
  - Files: `src/routes/health/index.ts`
  - Read `nodejs_eventloop_lag_seconds_p99` from prom-client registry
    OR use `perf_hooks.monitorEventLoopDelay()` directly
  - If P99 event loop lag > 200ms → include in response and return 503
  - Update readiness response schema to include `eventLoopLag: number` field
  - Update integration tests for the `/ready` endpoint
  - Verify: in normal operation, `/ready` includes eventLoopLag < 10ms

- [ ] **TASK-128** — Add queue depth to readiness probe
  - Requirements: REQ-115
  - Files: `src/routes/health/index.ts`
  - Add Redis ping check to `/ready`: `await fastify.redis.ping()`
  - Measure ping latency via `Date.now()`
  - Return `degraded` (200) if Redis is unavailable, `not_ready` (503) only if DB is down
  - Update response schema to include Redis service status
  - Update integration tests
  - Verify: stop Redis → `/ready` returns 200 with `status: degraded`

- [ ] **TASK-129** — Add Alertmanager to docker-compose
  - Requirements: REQ-112
  - Files: `docker/docker-compose.yml`, `docker/prometheus/alertmanager.yml` (new)
  - Add Alertmanager 0.27 service
  - Create `alertmanager.yml` with webhook receiver (placeholder URL configurable via env)
  - Update `docker/prometheus/prometheus.yml` to configure `alertmanager`
  - Verify: `http://localhost:9093` loads Alertmanager UI

- [ ] **TASK-130** — Update alert rules to SLO thresholds
  - Requirements: REQ-112
  - Files: `docker/prometheus/alert_rules.yml`
  - Update/add rules from `docs/PRODUCTION_PLAN.md` with SLO-based thresholds:
    - 5xx error rate > 1% for 5min (was 5%)
    - P99 latency > 500ms for 5min (new warning level)
    - P99 latency > 1000ms for 5min (critical)
    - DB pool utilization > 80%
    - BullMQ failed jobs > 0 (alert on DLQ items)
    - Event loop lag P99 > 50ms for 2min
  - Add `runbook_url` annotation to each alert (placeholder URL)
  - Verify: `http://localhost:9090/alerts` shows rules

---

## Phase 5 — Container & Cloud Infrastructure

- [ ] **TASK-131** — Update Dockerfile to distroless
  - Requirements: REQ-114
  - Design: DD-114
  - Files: `Dockerfile`
  - Install `dumb-init` in builder stage
  - Change production stage FROM to `gcr.io/distroless/nodejs20-debian12`
  - Copy `dumb-init` from builder: `COPY --from=builder /usr/bin/dumb-init /usr/bin/dumb-init`
  - Change user to `nonroot` (distroless built-in, uid 65532)
  - Update HEALTHCHECK: distroless has no `wget` — use Node.js built-in:
    ```dockerfile
    HEALTHCHECK CMD node -e "require('http').get({hostname:'localhost',port:process.env.PORT||3000,path:'/api/v1/ready'},r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
    ```
  - Verify: `docker build -t test .` succeeds
  - Verify: `docker run --rm test sh` exits non-zero (no shell)

- [ ] **TASK-132** — Add trivy scanning to CI
  - Requirements: REQ-114
  - Files: `.github/workflows/ci.yml`
  - Add trivy scan step to the `build` job after Docker image is built:
    ```yaml
    - name: Scan image for vulnerabilities
      run: |
        docker run --rm \
          -v /var/run/docker.sock:/var/run/docker.sock \
          aquasec/trivy:latest image \
          --exit-code 1 --severity HIGH,CRITICAL --no-progress \
          fastify-starter:${{ github.sha }}
    ```
  - Verify: CI pipeline includes security scan step

- [ ] **TASK-133** — Create Kubernetes manifests
  - Requirements: REQ-116
  - Design: DD-116
  - Files: `k8s/` directory (new), all manifests listed in REQ-116
  - `deployment.yaml`:
    - 3 replicas
    - Resources: requests 100m/128Mi, limits 500m/512Mi
    - `terminationGracePeriodSeconds: 30`
    - Liveness: `GET /api/v1/health`, `initialDelaySeconds: 10`, `periodSeconds: 15`
    - Readiness: `GET /api/v1/ready`, `initialDelaySeconds: 15`, `periodSeconds: 10`
    - Env from `secretKeyRef` for `JWT_SECRET`, `DATABASE_URL`
  - `service.yaml`: ClusterIP on port 3000
  - `hpa.yaml`: `minReplicas: 2`, `maxReplicas: 10`, target 70 concurrent requests
    using custom metric `http_requests_in_progress`
  - `pdb.yaml`: `minAvailable: 1`
  - `migrate-job.yaml`: runs `npx prisma migrate deploy` with `DATABASE_DIRECT_URL`
  - Verify: `kubectl apply --dry-run=client -f k8s/` passes validation

---

## Completion Checklist

Before declaring this spec complete:

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test -- --run` passes all tests (new tests added for cookies, RBAC, AJV stripping)
- [ ] `npm run worker` starts and processes a test job
- [ ] Two API instances share rate limit counters via Redis
      (test: 6 login attempts split across two instances → 6th is blocked)
- [ ] Create a todo → job appears in BullMQ → worker processes it → trace spans linked in Jaeger
- [ ] `POST /register` with `{ ..., role: 'admin' }` creates user with `role: 'user'`
- [ ] `GET /api/v1/todos/:id` with another user's token → 403
- [ ] `GET /api/v1/todos/:id` with admin token → 200
- [ ] Login response has `Set-Cookie` header with `HttpOnly; SameSite=Strict`
- [ ] Refresh token not in JSON response body
- [ ] `docker run --rm <distroless-image> sh` → non-zero exit (no shell)
- [ ] `trivy` scan passes (no HIGH/CRITICAL CVEs)
- [ ] `kubectl apply --dry-run=client -f k8s/` passes all manifests
- [ ] `GET /api/v1/ready` includes Redis health status
- [ ] `docker compose up` starts: postgres, pgbouncer, redis, app, worker, prometheus,
      alertmanager, grafana, jaeger
- [ ] Alertmanager UI accessible at `http://localhost:9093`
- [ ] No `latest` image tags anywhere
