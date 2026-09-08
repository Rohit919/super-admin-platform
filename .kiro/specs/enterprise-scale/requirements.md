# Requirements: Enterprise-Scale Production

## Relationship to existing spec

The `production-hardening` spec covers single-instance correctness: graceful shutdown,
secret hygiene, auth security, CI/CD, and observability foundations.

This spec covers what breaks when you run **multiple instances** of that hardened
application: race conditions on shared state, stateful in-process assumptions that
don't survive horizontal scaling, and architectural patterns required for enterprise
SLOs (99.9%+ uptime, sub-100ms P99, zero-downtime deploys).

**Complete `production-hardening` first. This spec builds on it.**

---

## Gap Analysis: What the Other AI Identified vs What We Already Cover

| Concern                                | In `production-hardening`? | In this spec? |
| -------------------------------------- | -------------------------- | ------------- |
| Graceful shutdown                      | ✅ TASK-004                | —             |
| JWT secret strength                    | ✅ TASK-005                | —             |
| Per-route rate limiting                | ✅ TASK-010                | —             |
| Redis-backed distributed rate limiting | ❌                         | ✅ REQ-101    |
| BullMQ async task queue                | ❌                         | ✅ REQ-102    |
| Circuit breakers on external calls     | ❌                         | ✅ REQ-103    |
| PgBouncer connection pooling           | ❌                         | ✅ REQ-104    |
| Expand/Contract migration pattern      | ❌                         | ✅ REQ-105    |
| pg_stat_statements / N+1 detection     | ❌                         | ✅ REQ-106    |
| HTTP-only cookie refresh tokens        | ❌                         | ✅ REQ-107    |
| Centralized RBAC/ABAC                  | ❌                         | ✅ REQ-108    |
| TypeBox additionalProperties: false    | ❌                         | ✅ REQ-109    |
| External secrets manager               | ❌                         | ✅ REQ-110    |
| OpenTelemetry (foundations)            | ✅ TASK-022–024            | —             |
| OTel propagation to workers & queues   | ❌                         | ✅ REQ-111    |
| Alertmanager + business SLO alerts     | ❌                         | ✅ REQ-112    |
| Event loop lag monitoring              | ❌                         | ✅ REQ-113    |
| Distroless Docker image                | ❌                         | ✅ REQ-114    |
| Readiness probe includes Redis         | ❌                         | ✅ REQ-115    |
| HPA / autoscaling configuration        | ❌                         | ✅ REQ-116    |

---

## Requirements

---

### Phase 1 — Horizontal Scalability

#### REQ-101: Redis-Backed Distributed Rate Limiting

**User story:** As a platform engineer, I need rate limits enforced globally across all
API replicas so that a user cannot bypass per-email or per-IP limits by routing requests
through different instances.

**Problem with current state:** `@fastify/rate-limit` without a store uses in-memory
counters. With 3 replicas, each instance allows 5 login attempts — giving an attacker
15 attempts before any limit fires globally. Every horizontal scale-out multiplies the
effective rate limit.

**Acceptance criteria:**

- `@fastify/rate-limit` is configured with a Redis store (`@fastify/rate-limit` supports
  `ioredis` as the store via the `store` option)
- A single Redis connection is shared across the rate limiter and any other Redis clients
  in the app (not one connection per plugin)
- Rate limit counters are consistent across all running replicas — 5 failed logins from
  different instances against the same email still triggers lockout after 5 total
- Redis connection failure does not crash the API (fail-open behavior with a logged warning)
- A `src/plugins/redis.ts` Fastify plugin manages the connection lifecycle, decorated as
  `fastify.redis`

#### REQ-102: Async Task Queue with BullMQ

**User story:** As a backend engineer, I need non-critical background work (email delivery,
analytics events, document processing, webhook dispatch) executed outside the HTTP request
loop so that slow I/O cannot degrade API response times.

**Problem with current state:** The Golden Orchestrator runs all pipeline stages — including
`notify-creation` (currently mocked) — synchronously inside the HTTP request. Any stage
marked `critical: false` still adds its latency to the response. As integrations grow
(email via SendGrid, Slack webhooks, S3 uploads), this pattern makes HTTP latency
unpredictable.

**Acceptance criteria:**

- BullMQ is installed and configured with a Redis connection
- A `src/queue/` directory contains queue definitions, worker definitions, and a producer
  helper
- A `NotificationWorker` processes `notify-creation` jobs asynchronously outside the HTTP
  request cycle
- The `notify-creation` orchestrator stage enqueues a BullMQ job and returns immediately
  (< 5ms) rather than executing the notification inline
- Workers have retry logic: 3 attempts with exponential backoff (1s, 5s, 25s)
- Failed jobs (after all retries) are moved to a dead-letter queue and logged at `error`
- Worker processes are observable: job counts (waiting, active, completed, failed) are
  exposed as Prometheus gauges
- A `src/workers/` directory contains worker processes that can be run independently from
  the API server (`npm run worker`)
- Trace context (W3C `traceparent`) is propagated from the HTTP request through to the
  queue job and the worker's OTel spans

#### REQ-103: Circuit Breakers on External Calls

**User story:** As a reliability engineer, I need all external HTTP and RPC calls wrapped
in circuit breakers so that a failing third-party service causes degraded behavior rather
than cascading failures that take down the entire API.

**Problem with current state:** No external HTTP calls exist yet — but as integrations
are added, they will be made directly from orchestrator stages. A stage that calls a
slow external API with no timeout will hold a Fastify worker thread indefinitely.

**Acceptance criteria:**

- `opossum` (circuit breaker library) is installed
- A `src/core/circuit-breaker.ts` utility wraps async functions with a circuit breaker
  and `AbortController`-based timeout
- The utility is typed generically: `withCircuitBreaker<TInput, TOutput>(fn, options)`
- Circuit breaker states (closed/open/half-open) are exposed as Prometheus gauges with
  `service` and `state` labels
- When a circuit is open, the wrapped call throws `CircuitOpenError` immediately (no
  network call)
- Circuit breaker configuration (timeout, error threshold, reset timeout) is injectable
  so different external services can have different tolerances
- A `README` section documents how to wrap a new external call

---

### Phase 2 — Database Architecture

#### REQ-104: PgBouncer Connection Pooling

**User story:** As a DBA, I need a connection pooler in front of PostgreSQL so that
horizontal scaling of the API does not exhaust PostgreSQL's `max_connections` limit.

**Problem with current state:** Prisma's built-in connection pool defaults to
`(num_physical_cpus * 2) + 1` connections per process instance. With 10 replicas on
2-vCPU containers, that's 50 connections. A managed PostgreSQL instance on a small tier
has `max_connections = 25`. The app will fail to start its 3rd replica.

**Acceptance criteria:**

- PgBouncer is added to `docker/docker-compose.yml` in transaction-pooling mode
- Application `DATABASE_URL` points to PgBouncer, not PostgreSQL directly
- A separate `DATABASE_DIRECT_URL` points directly to PostgreSQL (used only for
  `prisma migrate deploy` — migrations require direct connections, not pooled)
- `prisma/schema.prisma` uses `directUrl = env("DATABASE_DIRECT_URL")` for migrations
- PgBouncer pool size is documented with a sizing formula in `.env.example`
- Prisma's own connection pool is reduced to `connection_limit=1` when using PgBouncer
  in transaction mode (Prisma's pool becomes redundant — PgBouncer is the pool)

#### REQ-105: Expand/Contract Migration Pattern

**User story:** As a DevOps engineer, I need database schema changes to be backward
compatible with the currently-running version of the application so that zero-downtime
rolling deployments are possible.

**Problem with current state:** A migration that renames a column, drops a column, or
changes a column type will break the old version of the application that is still running
during a rolling deploy. The migration runs before the new code deploys — old pods crash.

**Acceptance criteria:**

- A `docs/MIGRATIONS.md` file documents the Expand/Contract pattern with worked examples
- The pattern is enforced as a PR checklist item in `.github/pull_request_template.md`
- **Expand phase:** New column/table added alongside old one; old code continues working;
  new code writes to both
- **Migrate phase:** Backfill data from old column/table to new
- **Contract phase:** Remove old column/table in a separate deploy after all instances
  run the new code
- Breaking migration types (column rename, type change, NOT NULL without default) are
  documented as requiring the Expand/Contract pattern
- A migration lint script (or comment convention) marks migrations as
  `-- BREAKING: requires Expand/Contract` when applicable

#### REQ-106: Query Observability and N+1 Detection

**User story:** As a backend engineer, I need visibility into slow queries and N+1 patterns
in staging so that performance regressions are caught before they reach production.

**Acceptance criteria:**

- `pg_stat_statements` extension is enabled in the development/staging PostgreSQL instance
  (via `docker/init.sql`)
- Prisma `metrics` preview feature is enabled in `prisma/schema.prisma`
- A `GET /api/v1/admin/db-metrics` route (admin-only, protected by `authorize(['admin'])`)
  returns Prisma client metrics: connection pool size, active connections, idle connections,
  total queries, slow queries
- Prisma query events in development log queries exceeding 100ms with the full query string
- A `scripts/analyze-queries.ts` script queries `pg_stat_statements` and reports the top 10
  queries by total time and by call count

---

### Phase 3 — Security Architecture

#### REQ-107: HTTP-Only Cookie Refresh Token Delivery

**User story:** As a security engineer, I need refresh tokens delivered via HTTP-only
cookies rather than response bodies so that they are inaccessible to JavaScript and
protected against XSS attacks.

**Problem with current state:** Refresh tokens are returned in the JSON response body.
Any XSS vulnerability — in the frontend, a browser extension, or a dependency — can
read the refresh token from JS and exfiltrate it to an attacker's server.

**Acceptance criteria:**

- `POST /auth/login` and `POST /auth/register` set a `refreshToken` HTTP-only, Secure,
  `SameSite=Strict` cookie with `Path=/api/v1/auth/refresh`
- The refresh token is NOT included in the JSON response body (remove from schema)
- `POST /auth/refresh` reads the refresh token from the cookie, not the request body
- `POST /auth/logout` clears the cookie by setting it with `maxAge=0`
- `HTTPS_ONLY` env var controls whether the `Secure` flag is set (allows dev HTTP testing)
- `@fastify/cookie` is installed and registered
- The cookie `Path` is scoped to `/api/v1/auth/refresh` so it is NOT sent on every request
  (minimizes exposure)
- Integration tests verify the Set-Cookie header is present with correct attributes

#### REQ-108: Centralized RBAC with Fastify preHandler Hooks

**User story:** As a product engineer, I need a centralized permissions system that
enforces role-based access control before requests reach orchestrators so that
authorization logic is not scattered across route handlers.

**Problem with current state:** The `fastify.authorize(roles[])` decorator exists but
is applied inconsistently — some routes use it, most don't. There is no concept of
resource ownership (user can only delete their own todos, not anyone else's).

**Acceptance criteria:**

- A `src/core/authorization/` directory contains:
  - `permissions.ts` — defines the permission matrix: `{ resource: action: roles[] }`
  - `authorize.ts` — a reusable Fastify preHandler factory: `requirePermission(resource, action)`
  - `ownership.ts` — an ownership check factory: `requireOwnership(getResourceUserId)`
- The permission matrix covers all current resources: `users`, `todos`
- Permissions are checked via `requirePermission('todo', 'create')` preHandler, not via
  inline role checks in handlers
- Ownership checks are separate from role checks: a `user` role can create todos but can
  only read/update/delete their OWN todos
- An `admin` role can operate on any resource
- The `authorize` decorator on `fastify` remains for backwards compatibility but internally
  delegates to `requirePermission`
- Tests cover: user accessing own resource (allowed), user accessing other user's resource
  (403), admin accessing any resource (allowed)

#### REQ-109: TypeBox additionalProperties: false

**User story:** As a security engineer, I need request bodies to strip unexpected
properties so that mass-assignment attacks cannot inject fields not defined in the schema.

**Problem with current state:** TypeBox schemas define expected fields, but AJV (which
Fastify uses for validation) passes through additional properties by default. A request
body `{ "email": "x@x.com", "password": "pass", "role": "admin" }` on `/register` will
include `role` in `request.body` even though it's not in the schema — and a naive handler
spreading `request.body` into a Prisma create could set the role.

**Acceptance criteria:**

- Fastify's AJV compiler is configured with `removeAdditional: true` globally
- This means TypeBox schemas automatically strip undeclared properties from request bodies
- The Prisma `user.create` call in `/register` uses explicit field selection, not
  `...request.body` spread — this is belt-and-suspenders regardless of AJV config
- A test verifies: sending `{ email, password, name, role: 'admin' }` to `/register`
  creates a user with `role: 'user'` (the default), not `role: 'admin'`

#### REQ-110: External Secrets Manager Integration

**User story:** As a DevOps engineer, I need secrets injected into the application at
runtime from an external provider so that credentials are never stored in environment
files, CI/CD pipelines, or container images.

**Acceptance criteria:**

- A `src/secrets.ts` module provides a `loadSecrets()` function that:
  - In development/test: reads from environment variables / `.env` (current behavior)
  - In production: fetches from AWS Secrets Manager, HashiCorp Vault, or Doppler
    depending on `SECRETS_PROVIDER` env var
- `loadSecrets()` is called in `src/server.ts` before `buildApp()` and merges secrets
  into `process.env`
- The secrets module is the ONLY place that reads from an external provider — not spread
  across plugins
- `SECRETS_PROVIDER` is documented in `.env.example` with values: `env` (default), `aws`,
  `vault`, `doppler`
- If secret fetching fails at startup, the server exits 1 with a clear error message
- Secrets are never logged (the module filters them from any debug output)

---

### Phase 4 — Advanced Observability

#### REQ-111: Trace Context Propagation Across Queue Workers

**User story:** As a developer, I need distributed traces to span from an HTTP request
through to the BullMQ worker that processes its queued jobs so that I can see the full
execution path of a user action.

**Acceptance criteria:**

- When enqueueing a BullMQ job, the W3C `traceparent` header from the active span is
  serialized into the job data
- The BullMQ worker deserializes the `traceparent` and creates a child span under the
  original HTTP trace
- Jaeger (or Tempo) shows a single trace with spans: HTTP handler → queue enqueue → worker
  process → downstream operations
- The `traceId` appears in all log lines across both the HTTP process and the worker process
  for the same user request

#### REQ-112: Alertmanager + SLO-Based Alerting

**User story:** As an SRE, I need alerts configured against business SLOs — not just
infrastructure metrics — so that on-call engineers are notified of user-impacting issues,
not just resource saturation.

**Acceptance criteria:**

- Alertmanager is added to `docker/docker-compose.yml`
- An `docker/prometheus/alertmanager.yml` config is created with at least one receiver
  (webhook, Slack, or PagerDuty — configurable via env)
- SLO-based alert rules in `docker/prometheus/alert_rules.yml`:
  - **Availability SLO:** 5xx error rate > 1% over a 5-minute window (severity: critical)
  - **Latency SLO:** P99 response time > 500ms over a 5-minute window (severity: warning)
  - **Latency SLO breach:** P99 response time > 1000ms over a 5-minute window (severity: critical)
  - **Saturation:** Database pool utilization > 80% (severity: warning)
  - **Saturation:** Active BullMQ jobs > queue capacity threshold (severity: warning)
- Alert annotations include runbook URLs (even if the runbook is a placeholder)

#### REQ-113: Event Loop Lag and Node.js Runtime Metrics

**User story:** As an SRE, I need event loop lag monitored and alerted on so that CPU
starvation or blocking operations are detected before they cause timeouts.

**Problem with current state:** `prom-client`'s `collectDefaultMetrics` captures
`nodejs_eventloop_lag_seconds` — but it's not surfaced in dashboards or alerts. Event
loop lag > 50ms means the server is under severe stress but may still pass health checks.

**Acceptance criteria:**

- A `nodejs_eventloop_lag_seconds` Prometheus gauge is captured (already collected by
  `collectDefaultMetrics` — just needs to be used)
- A Grafana panel shows event loop lag over time
- A Prometheus alert fires when P99 event loop lag exceeds 50ms for 2 consecutive minutes
- A `GET /api/v1/ready` check includes event loop lag: returns 503 if lag > 200ms
  (the server is still alive but unable to serve requests promptly)
- Active handles and active requests (`nodejs_active_handles`, `nodejs_active_requests`)
  are included in the readiness check

---

### Phase 5 — Container & Cloud Infrastructure

#### REQ-114: Distroless or Hardened Docker Image

**User story:** As a security engineer, I need the production Docker image to have the
minimum possible attack surface so that a container escape or RCE does not give an
attacker useful tools.

**Problem with current state:** `node:20-alpine` includes `sh`, `ash`, `apk`, `wget`,
`curl`, and other tools that make post-exploit lateral movement easier.

**Acceptance criteria:**

- Production stage uses `gcr.io/distroless/nodejs20-debian12` as the base image
  OR `node:20-alpine` with `dumb-init` as the only addition (current) — both are acceptable;
  distroless is preferred
- If using distroless: `dumb-init` binary is copied from the builder stage
  (`COPY --from=builder /usr/bin/dumb-init /usr/bin/dumb-init`)
- The final image contains no shell (`sh`, `bash`, `ash`) — verified by
  `docker run --rm <image> sh` returning a non-zero exit code
- Image is scanned with `trivy` in CI: `trivy image --exit-code 1 --severity HIGH,CRITICAL`
- Image size is documented and tracked; regressions > 20MB trigger a review
- The Dockerfile uses `--platform=linux/amd64` in the FROM line for deterministic builds
  on Apple Silicon

#### REQ-115: Readiness Probe Includes Redis and Queue Worker Health

**User story:** As a platform engineer, I need the `/ready` endpoint to check all
critical dependencies — including Redis — so that Kubernetes/load balancers do not
route traffic to instances that are degraded.

**Problem with current state:** `/ready` only checks PostgreSQL. An instance with a broken
Redis connection will still be marked ready — but its rate limiting, session cache, and
job queue are all broken.

**Acceptance criteria:**

- `GET /api/v1/ready` checks: PostgreSQL (existing), Redis (new)
- Each service returns `{ healthy: boolean, latencyMs: number }` in the response
- The overall status is `ready` only if ALL services are healthy
- Status is `degraded` if Redis is down (service continues without distributed rate limiting)
- Status is `not_ready` if PostgreSQL is down (service cannot function)
- Individual service health is reported in the response:
  ```json
  {
    "status": "degraded",
    "services": {
      "database": { "healthy": true, "latencyMs": 2 },
      "redis": { "healthy": false, "latencyMs": null, "error": "ECONNREFUSED" }
    }
  }
  ```
- Response code: 200 for `ready`, 200 for `degraded`, 503 for `not_ready`

#### REQ-116: Kubernetes Manifests and Autoscaling Configuration

**User story:** As a platform engineer, I need Kubernetes manifests with a Horizontal Pod
Autoscaler configured on request concurrency so that the system scales out under load
rather than degrading.

**Acceptance criteria:**

- A `k8s/` directory contains:
  - `deployment.yaml` — Fastify API deployment with liveness and readiness probes
  - `service.yaml` — ClusterIP service
  - `hpa.yaml` — HPA targeting 70 concurrent requests per replica
  - `pdb.yaml` — PodDisruptionBudget with `minAvailable: 1` for zero-downtime deploys
  - `secret.yaml` — ExternalSecret or placeholder pointing to secrets manager
  - `migrate-job.yaml` — Kubernetes Job for running migrations (replaces compose migrate service)
- The HPA uses KEDA or Kubernetes custom metrics for queue-depth-based scaling
  (scales up when BullMQ waiting jobs exceed threshold)
- `terminationGracePeriodSeconds: 30` in the deployment spec
- Resource requests and limits are defined (requests: 100m CPU, 128Mi memory;
  limits: 500m CPU, 512Mi memory)
- Liveness probe targets `/api/v1/health` with `initialDelaySeconds: 10`
- Readiness probe targets `/api/v1/ready` with `initialDelaySeconds: 15`

---

## Out of Scope

The following are known enterprise concerns not covered in this spec due to their
organizational or infrastructure scope beyond a single service:

- **Service mesh (Istio/Linkerd):** mTLS between services, traffic shaping, retries at
  the mesh layer. Out of scope for a single-service starter.
- **Multi-region active-active:** Requires global load balancing, CockroachDB or Vitess,
  and conflict-free data replication. Out of scope.
- **API Gateway (Kong, AWS API GW):** Centralized auth, request transformation, and
  API product management. A future concern once multiple services exist.
- **SIEM and compliance logging:** SOC2/HIPAA audit log streams. Out of scope for this
  starter but the structured Pino logs are the foundation.
