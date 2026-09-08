# Design: Production Hardening

## Overview

This document describes the technical design decisions for each requirement in the
production hardening spec. It records _why_ each approach was chosen over alternatives,
the exact files affected, and any cross-cutting concerns.

---

## Design Decisions by Phase

---

### Phase 0 — Immediate Blockers

---

#### DD-001: Graceful Shutdown Architecture (REQ-001)

**Problem framing:**

The current `server.ts` registers `SIGTERM`/`SIGINT` handlers that call `process.exit(0)`
directly. `dumb-init` in the Dockerfile correctly forwards `SIGTERM` to the Node process,
but the Node process then immediately kills itself. The `onClose` hook in `prisma.ts` (which
calls `prisma.$disconnect()`) is registered on Fastify, not on `process` — it only runs when
`app.close()` is called.

**Chosen approach:**

```
SIGTERM/SIGINT
  → shutdown(signal) function
    → setTimeout(forceExit, 10_000).unref()   ← hard deadline, doesn't keep event loop alive
    → await app.close()                        ← drains HTTP, fires onClose hooks
      → prisma.$disconnect()                   ← runs via onClose hook in prisma.ts
      → logger.info('Server closed cleanly')
    → process.exit(0)
```

The `.unref()` on the force-exit timer is critical: it prevents the timer from keeping the
Node event loop alive if `app.close()` returns quickly. Without `.unref()`, a fast shutdown
would still wait 10 seconds before exiting.

**Why 10 seconds?** Kubernetes default `terminationGracePeriodSeconds` is 30 seconds. Fly.io
and Railway both send SIGTERM and wait ~30 seconds before SIGKILL. Ten seconds gives in-flight
requests plenty of time to complete while still leaving headroom before the platform force-kills.

**Files changed:**

- `src/server.ts` — replace both signal handlers, restructure startup

**Rejected alternative:** Using `process.on('exit', ...)` to call `prisma.$disconnect()`.
The `exit` event is synchronous — async cleanup code is ignored. Only `app.close()` in the
signal handler guarantees the async `onClose` hooks fire.

---

#### DD-002: `.gitignore` and `.dockerignore` Strategy (REQ-002)

**Problem framing:**

The `.gitignore` currently only excludes `node_modules`. The `.env` file is untracked in
the working directory but not in the gitignore, which means `git add .` will stage it.
There is no `.dockerignore`, so `COPY . .` in the Dockerfile sends everything including
`.env`, `.git` (history, potential secrets in old commits), and `node_modules` (redundant,
wastes bandwidth).

**Chosen approach for `.gitignore`:** Broad exclusions covering all env files, build
outputs, test artifacts, and editor files. The `.env.example` is explicitly kept via
`!.env.example` to make the exception visible.

**Chosen approach for `.dockerignore`:** Excludes everything that isn't needed to build
the application. The multi-stage Dockerfile already runs `npm ci` from scratch in the
builder stage — `node_modules` from the host is irrelevant. Only source code, prisma
schema, and package files are needed.

**Files changed:**

- `.gitignore` — rewrite
- `.dockerignore` — create new

---

### Phase 1 — Security Hardening

---

#### DD-004: JWT Secret Enforcement (REQ-004)

**Two-layer defence:**

1. **TypeBox schema layer:** `Type.String({ minLength: 32 })` in `env.ts` — the app
   refuses to start if `@fastify/env` validation fails. This catches misconfiguration
   immediately at boot, before any plugins load.

2. **Plugin-level assertion:** An explicit `if` check in `auth.ts` with a descriptive
   error message. This is belt-and-suspenders — if the TypeBox validation somehow passes
   a short string (e.g., due to a custom AJV config), the auth plugin catches it.

**Algorithm pinning:** `@fastify/jwt` defaults to reading the `alg` header from the
incoming token. The `alg: none` attack exploits libraries that accept this. Pinning
`algorithms: ['HS256']` in the `verify` config makes the library reject any token that
doesn't use HS256, regardless of what the token's header claims.

**Files changed:**

- `src/plugins/env.ts` — add `minLength: 32` to `JWT_SECRET`
- `src/plugins/auth.ts` — add startup assertion, add `algorithms: ['HS256']` to verify config

---

#### DD-005: Per-Route Rate Limiting Design (REQ-005)

**Why email-keying for login?**

IP-keyed rate limiting is trivially bypassed using:

- Residential proxy networks (millions of unique IPs)
- Carrier-grade NAT (thousands of users share one IP)
- Cloud VPNs

Email-keyed limits mean 5 wrong passwords from 5,000 different IPs still locks out the
attempt against a single account. The attacker must succeed within 5 tries per email — which
is what matters.

**Why NOT email-key the global rate limit?**

The global 100 req/min limit stays IP-keyed because it covers all routes including public
ones where there is no email in the request body.

**Implementation approach:** `@fastify/rate-limit` supports per-route config via the
`config.rateLimit` key on route options. This is the documented pattern from the
`@fastify/rate-limit` README and doesn't require any plugin changes.

```
route config.rateLimit → overrides global rate limit for that route
```

**Key normalization:** `body?.email?.toLowerCase()` before keying prevents
`User@Example.com` and `user@example.com` from being treated as different accounts.

**Files changed:**

- `src/routes/auth/index.ts` — add per-route rateLimit config to login, register, refresh
- `src/app.ts` — add `skip` function to global rate limit

---

#### DD-006: Account Lockout Design (REQ-006)

**Data model approach:**

Adding `failedLoginAttempts`, `lockedUntil`, and `lastLoginAt` directly to the `User` model
rather than a separate `LoginAttempt` table. Rationale:

- A separate table requires a JOIN on every login — one extra query on the hot path
- We only need the current state (counter + lockout time), not audit history
- The fields are small integers/timestamps — negligible storage impact

**Timing-safe "user not found" path:**

Without this, an attacker can distinguish "email not registered" from "wrong password" based
on response time:

- "Email not found" → fast (no bcrypt, just DB miss → ~2ms)
- "Wrong password" → slow (bcrypt verify → ~80ms at cost 10)

The fix: if the user is not found, still run `bcrypt.compare(password, fakehash)` to consume
the same ~80ms. This leaks no information about whether the email exists.

**The fake hash must be valid bcrypt format** — `bcrypt.compare` against an invalid string
may throw or return immediately, defeating the timing safety. Use a pre-computed valid hash
of a dummy string.

**Lockout check placement:** Lockout is checked BEFORE calling `bcrypt.compare`. This is
intentional: if the account is locked, we skip the expensive bcrypt operation entirely.
The lockout is triggered by the stored failure count, not by the current request's password —
so there's no information gain from skipping the compare.

**Files changed:**

- `prisma/schema.prisma` — add fields to `User` model
- `src/routes/auth/index.ts` — update login handler
- New Prisma migration

---

#### DD-007: Metrics Endpoint Protection (REQ-007)

**Why bearer token rather than IP allowlist?**

IP allowlisting is fragile in cloud environments where:

- Prometheus runs in a Docker network with an internal IP that changes on rebuild
- Cloud-to-cloud scraping uses IPs from a large dynamic range
- Adding a new scraper means an infra change to add its IP

Bearer token is portable: Prometheus includes the token in the `Authorization` header,
and the token can be rotated by updating the env var on both sides.

**Why optional (not required)?**

Making `METRICS_TOKEN` optional preserves backwards compatibility for local development
where running without a token is acceptable. The env schema uses `Type.Optional(...)` so
the server starts without it.

**Files changed:**

- `src/plugins/env.ts` — add optional `METRICS_TOKEN`
- `src/plugins/metrics.ts` — add auth gate
- `docker/prometheus/prometheus.yml` — add authorization config

---

#### DD-010: Refresh Token Family Detection Design (REQ-010)

**The security model:**

Standard rotation (current state): revoke old token on use, issue new token.

- Problem: if attacker steals token A and uses it first, they get token B.
- The legitimate user's client then tries to use token A → gets 401.
- The attacker holds token B and is silently authenticated.

Family-based rotation adds: if a revoked token is presented, revoke ALL tokens in the family.

- Attacker uses token A → gets token B.
- Legitimate user uses token A → detects reuse → revokes token B.
- Attacker's token B is now invalid. Session is broken for both parties.
- User is forced to re-login, notified of suspicious activity.

**This is a one-way detection trap**, not perfect prevention. The attacker wins only if
they use the token before the legitimate user does (which is a race condition). But once
detected, the attacker loses the session.

**`family` UUID generation:**

- New login → `crypto.randomUUID()` → new family
- Refresh → keep same family as the token being exchanged

**Files changed:**

- `prisma/schema.prisma` — add `family` column and index to `RefreshToken`
- `src/routes/auth/index.ts` — update `createRefreshToken` helper and refresh handler
- New Prisma migration

---

### Phase 2 — Resilience & Reliability

---

#### DD-011: Error Handler Redesign (REQ-011)

**Current problem:** The global error handler builds its own response shape, ignoring the
`formatErrorResponse` utility. The `AppError.details` field (which carries validation error
details like which field failed) is silently dropped. In production, a 5xx error returns
the raw internal error message.

**Design decision — progressive information disclosure:**

```
statusCode < 500  →  include message + details  (client errors, safe to expose)
statusCode >= 500 + production  →  "Internal Server Error"  (hide internals)
statusCode >= 500 + development  →  include message  (useful for debugging)
```

**Operational vs programming errors:**

`AppError` has `isOperational: boolean`. Programming errors (unexpected `TypeError`,
unhandled `null` access, etc.) are NOT `AppError` instances — they fall through as
`isOperational = false`. These should be logged at `fatal` level and trigger an alert.

Operational errors (`ValidationError`, `UnauthorizedError`, etc.) are expected and
logged at `warn` level — they don't need to wake anyone up.

**Files changed:**

- `src/app.ts` — rewrite `setErrorHandler`

---

#### DD-012: User Context in Logs (REQ-012)

**Approach: `preHandler` hook on the app level**

Fastify's hook execution order: `onRequest → preParsing → preValidation → preHandler → handler`

The `preValidation` hook runs `fastify.authenticate` (which calls `request.jwtVerify()`).
By the time `preHandler` runs, `request.user` is populated for authenticated routes.

The hook uses `request.log = request.log.child({ userId, userRole })`. Pino child loggers
are lightweight — they inherit all parent properties and merge the new fields. All subsequent
`request.log.*` calls throughout the request lifecycle (including inside orchestrators, if
the logger is passed through) will include the user context.

**Why not use a hook in the auth plugin?** The auth plugin only runs `authenticate` when
routes have `preValidation: [fastify.authenticate]`. A global `preHandler` hook runs for
ALL requests — those without auth will have `request.user` as `undefined` and the hook
is a no-op. This is cleaner than trying to detect "was this route authenticated?"

**Files changed:**

- `src/app.ts` — add `preHandler` hook after plugin registrations

---

#### DD-013: Prisma `$extends` for Timeouts (REQ-013)

**Why `$extends` over intercepting at the route level?**

Alternatives considered:

1. `Promise.race` in each route/orchestrator — requires modifying every query call
2. `pg` connection timeout in `DATABASE_URL` — network-level timeout, doesn't help for
   slow queries that successfully connect but take long to return results
3. `statement_timeout` in PostgreSQL — requires database config, not app code

`$extends` with a `query.$allOperations` middleware intercepts every single Prisma query
at the client level, with zero changes to calling code. It's the right abstraction.

**Timeout value: 10 seconds**

This is a server-level safety net for runaway queries, not a normal operation timeout.
Individual orchestrator stages have their own timeouts (e.g., `create-todo` has 2000ms).
The 10-second Prisma timeout catches cases where no stage timeout is configured.

**Slow query threshold: 500ms**

A query taking > 500ms is almost certainly missing an index or doing a sequential scan.
This threshold generates warnings without being too noisy for normal operations.

**Files changed:**

- `src/plugins/prisma.ts` — rewrite with `$extends` and logging

---

#### DD-014: Logger Injection into BaseOrchestrator (REQ-014)

**Why constructor injection rather than a global logger?**

The orchestrator is called from HTTP route handlers. Those handlers have `request.log`,
which already has `requestId`, `userId`, `traceId` attached. If we inject `request.log`
into the orchestrator, all orchestrator log lines automatically correlate with the request
they belong to in the log aggregator.

If we use the module-level logger as a fallback, unit tests and non-HTTP callers still
work without needing to set up a full Fastify instance.

**The logger parameter is optional** — existing code that doesn't pass a logger continues
to work. This is a backward-compatible change.

**Files changed:**

- `src/core/orchestration/base-orchestrator.ts` — add `log?: Logger` parameter, replace console calls
- `src/services/todo/index.ts` — accept and pass `log` parameter
- `src/routes/todos/index.ts` — pass `request.log` to service

---

### Phase 3 — Observability

---

#### DD-017: OpenTelemetry Architecture (REQ-017)

**Why OTel and not a vendor-specific SDK?**

OpenTelemetry is the CNCF standard. Writing to the OTLP protocol means traces can be
sent to Jaeger (local dev), Grafana Tempo (self-hosted), Honeycomb, Datadog, or any other
backend by changing one env var. Vendor-specific SDKs create lock-in.

**Why must `telemetry.ts` be imported first?**

OTel instruments Node.js core modules (http, https, net) at load time using module
patching. If `http` is imported before the instrumentation is set up, the instrumentation
misses it. The `import './telemetry.js'` line in `server.ts` must be first so the SDK
patches modules before anything else loads them.

**Prisma instrumentation note:**

`@prisma/instrumentation` requires `previewFeatures = ["tracing"]` in `prisma/schema.prisma`.
This is a Prisma preview feature as of Prisma 5 — stable in Prisma 5.2+. It adds spans
for every Prisma operation with the model name, operation type, and duration.

**Trace → log correlation:**

The `active span` from the OTel context is read in an `onRequest` hook and its `traceId`/`spanId`
are added to `request.log` as a child. This means every log line has a `traceId` field.
In Grafana, you can pivot from a Loki log line to the corresponding Jaeger trace.

**Files changed:**

- `src/telemetry.ts` — new file
- `src/server.ts` — add telemetry import at top
- `src/app.ts` — add trace context hook
- `docker/docker-compose.yml` — add Jaeger service
- `prisma/schema.prisma` — add `previewFeatures = ["tracing"]`

---

### Phase 4 — CI/CD

---

#### DD-020: CI Workflow Design (REQ-020)

**Job parallelism:**

```
quality (typecheck + lint + format)
test (unit + integration + coverage)    ← runs in parallel with quality
                                         ↓ both must pass
build (npm build + docker build)        ← runs after quality + test
security (npm audit + trufflehog)       ← runs independently
```

Tests run against a real PostgreSQL service container rather than mocks. This tests the
full migration path and real query behavior. The test env uses `METRICS_ENABLED=false` and
`SWAGGER_ENABLED=false` to avoid prom-client singleton issues and unnecessary plugin load.

**TruffleHog configuration:**

`--only-verified` means TruffleHog only reports secrets that it can verify are real
credentials (by making API calls to check). This dramatically reduces false positives while
still catching committed `.env` files, API keys, etc.

**Docker build in CI:**

The Docker build in CI doesn't push to a registry — it just verifies the image builds
successfully. Actual pushes happen in the deploy workflow, which only runs on merge to `main`.

---

### Phase 5 — Database

---

#### DD-022: Migration Init Service Pattern (REQ-022)

**Why a separate service rather than the app running migrations?**

Three scenarios where the current "app runs migrations" pattern fails:

1. **Horizontal scaling:** Two instances start simultaneously → both try to run migrations → one
   succeeds, one may fail or hang waiting for Prisma's advisory lock
2. **Rolled deployments:** Old version is still running while new version starts → new
   version runs a migration that the old version doesn't understand → old version crashes
3. **Failed migration:** Migration fails, but the app continues starting up → app code
   assumes migrated schema, gets DB errors

The init service pattern (or init container in Kubernetes) runs the migration as a separate
job that must complete successfully before any app instances start. If migration fails, no
app instances start — the cluster stays on the old version.

**`service_completed_successfully` condition:**

Docker Compose v2 supports `condition: service_completed_successfully` — the dependent
service only starts if the dependency exited with code 0. This is the correct condition for
one-shot jobs like migrations.

**Files changed:**

- `docker/docker-compose.yml` — add `migrate` service, update `app` depends_on

---

#### DD-023: Refresh Token Cleanup Design (REQ-023)

**Why in-process rather than a separate cron job?**

Simplicity. This is a maintenance operation that doesn't need to be a separate process.
Using `setInterval` in the Prisma plugin means:

- No additional infrastructure (no cron container, no k8s CronJob)
- Cleanup runs even in local dev (keeps dev DB tidy)
- The interval is cleared in `onClose` so it doesn't prevent graceful shutdown

**Delete criteria:**

1. `expiresAt < now()` — token is past its expiry date, cannot be used legitimately
2. `revokedAt < (now() - 7 days)` — token was revoked over a week ago; keeping for 7 days
   after revocation allows forensic queries ("what sessions existed on date X")

**Not using soft delete:** Refresh tokens are low-value records. Hard delete is correct —
there's no reason to keep expired tokens beyond the 7-day forensic window.

---

### Phase 6 — Infrastructure

---

#### DD-025: Docker Compose Hardening (REQ-025)

**Image version pinning strategy:**

Use semver tags (e.g., `postgres:16.3-alpine`, `grafana/grafana:10.4.2`) rather than
digest pinning (`@sha256:abc...`). Digests are immutable but unreadable — you can't tell
what version you're running. Semver tags are stable within a patch version and human-readable.

**`:?` required env var syntax:**

`${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD must be set}` is bash/docker-compose
expansion syntax that fails with a clear error if the variable is empty or unset. This
prevents the compose stack from starting with a default insecure password if the operator
forgot to set the variable.

**Resource limits rationale:**

Postgres `memory: 512M` is conservative for a development/staging stack. Production Postgres
would need tuning based on `shared_buffers` and `work_mem`. The limit prevents a runaway
Postgres from consuming all host memory in a dev environment.

---

## Cross-Cutting Concerns

### TypeScript Strict Mode Compatibility

All new code must satisfy the existing strict TypeScript config:

- `noUnusedLocals: true` — no unused variables
- `noUnusedParameters: true` — no unused function params (use `_param` prefix to suppress)
- `noImplicitReturns: true` — all code paths must return
- `noUncheckedIndexedAccess: true` — array/object access returns `T | undefined`

The `$extends` Prisma pattern returns a different type than `PrismaClient`. The type
annotation for `fastify.prisma` may need updating — test with `npm run typecheck`.

### Prisma Client Type After `$extends`

`$extends` returns a type that is NOT `PrismaClient`. The Fastify decoration currently uses:

```typescript
declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
```

After adding `$extends`, this needs to become:

```typescript
type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;

declare module "fastify" {
  interface FastifyInstance {
    prisma: ExtendedPrismaClient;
  }
}
```

Where `createExtendedPrismaClient` is a function that creates the extended client so the
return type can be inferred.

### Test Infrastructure Impact

The `buildTestApp` factory in `src/utils/test-app.ts` injects a mock Prisma. After adding
`$extends`, the mock type needs to match `ExtendedPrismaClient` rather than `PrismaClient`.
Since the mock uses `as unknown as PrismaClient`, this cast should continue to work — but
verify with `npm run typecheck` after the Prisma changes.

### Migration Sequencing

New Prisma migrations must be created for:

1. REQ-006: `failedLoginAttempts`, `lockedUntil`, `lastLoginAt` on `User`
2. REQ-010: `family` column and index on `RefreshToken`
3. REQ-013 (optional): `expires_at` index on `RefreshToken` for cleanup query performance

Run `npx prisma migrate dev --name <description>` for each, and commit the generated SQL.

### Environment Variable Additions

New env vars introduced in this spec:

| Variable                      | Phase   | Default                           | Required in prod?                 |
| ----------------------------- | ------- | --------------------------------- | --------------------------------- |
| `METRICS_TOKEN`               | Phase 1 | none (optional)                   | Recommended                       |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Phase 3 | `http://localhost:4318/v1/traces` | Yes (set to your tracing backend) |

All must be added to `.env.example` with documentation.
