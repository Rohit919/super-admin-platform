# Requirements: Production Hardening

## Overview

This spec covers the full hardening of the Fastify Gold Standard Starter from its current
development-ready state to a production-grade API. The work is organized into 7 phases
ordered by risk — Phase 0 must be completed before any deployment.

Source of truth for technical detail: `docs/PRODUCTION_PLAN.md`

---

## Requirements

### Phase 0 — Immediate Blockers

#### REQ-001: Graceful Shutdown

**User story:** As an operator, I need the server to drain in-flight requests before
exiting so that active users do not get connection resets during deployments or restarts.

**Acceptance criteria:**

- When SIGTERM is received, the server stops accepting new connections
- In-flight requests are allowed to complete before the process exits
- `app.close()` is always called on SIGTERM/SIGINT so `onClose` hooks fire
- `prisma.$disconnect()` runs before process exit
- A hard 10-second deadline forces exit if drain hangs
- Process exits 0 on clean shutdown, 1 on timeout or error
- All shutdown events are logged with the signal name

#### REQ-002: Secret File Exclusion

**User story:** As a developer, I need `.env` files excluded from git and Docker images
so that credentials are never accidentally leaked.

**Acceptance criteria:**

- `.gitignore` excludes `.env`, `.env.*`, `dist/`, `coverage/`, and build artifacts
- `.dockerignore` excludes `.env`, `.git`, `node_modules`, `coverage/`, and test files
- `docker build` produces an image where `cat .env` inside the container returns "no such file"
- Docker build context is under 5 MB

#### REQ-003: Environment Contract

**User story:** As a new engineer, I need a `.env.example` file so I know exactly which
environment variables are required and what format they take.

**Acceptance criteria:**

- `.env.example` exists at project root and is committed to git
- Every variable accepted by `src/plugins/env.ts` is documented in `.env.example`
- Required variables are clearly marked as `<required>`
- The file contains no real credentials — only placeholder values

---

### Phase 1 — Security Hardening

#### REQ-004: JWT Secret Strength Enforcement

**User story:** As a security engineer, I need the JWT signing secret to meet a minimum
strength requirement so that tokens cannot be brute-forced.

**Acceptance criteria:**

- `JWT_SECRET` with fewer than 32 characters causes the server to fail at startup with a clear error message
- The error message includes the current length and a command to generate a valid secret (`openssl rand -hex 32`)
- JWT tokens are signed and verified with `algorithms: ['HS256']` explicitly — the `alg: none` attack is blocked
- The env schema enforces `minLength: 32` on `JWT_SECRET`

#### REQ-005: Auth Endpoint Rate Limiting

**User story:** As a security engineer, I need tight rate limits on authentication
endpoints so that credential stuffing and brute-force attacks are not viable.

**Acceptance criteria:**

- `POST /api/v1/auth/login` allows at most 5 attempts per 15 minutes, keyed by email address
- `POST /api/v1/auth/register` allows at most 3 attempts per hour, keyed by IP address
- `POST /api/v1/auth/refresh` allows at most 10 attempts per minute, keyed by the token prefix
- Rate limit error responses include a `retryAfter` field in seconds
- Health check and metrics endpoints are excluded from the global rate limit counter
- Rate limit error responses match the `{ success: false, error: { message, statusCode, retryAfter } }` envelope

#### REQ-006: Account Lockout

**User story:** As a security engineer, I need accounts to be temporarily locked after
repeated failed login attempts so that distributed brute-force attacks cannot succeed
even when bypassing rate limits.

**Acceptance criteria:**

- After 5 consecutive failed login attempts, the account is locked for 15 minutes
- Locked accounts return HTTP 429 with a `retryAfter` field
- The `retryAfter` value is accurate (seconds until lockout expires)
- Successful login resets the failure counter and clears any lockout
- The "user not found" path takes the same time as a "wrong password" path (timing-safe)
- The `User` model has `failedLoginAttempts`, `lockedUntil`, and `lastLoginAt` fields
- A Prisma migration is created for the new fields

#### REQ-007: Metrics Endpoint Protection

**User story:** As a security engineer, I need the `/metrics` endpoint protected so that
internal performance data and route structure are not publicly accessible.

**Acceptance criteria:**

- When `METRICS_TOKEN` env var is set, `/metrics` requires `Authorization: Bearer <token>`
- Requests without a valid token return HTTP 401
- When `METRICS_TOKEN` is not set, the endpoint is accessible (backwards compatible for local dev)
- The Prometheus scrape config supports the bearer token via `authorization.credentials`
- `METRICS_TOKEN` is documented in `.env.example` with a minimum length recommendation

#### REQ-008: Swagger Disabled in Production by Default

**User story:** As an operator, I need Swagger UI disabled by default so that the full
API schema is not publicly exposed unless explicitly enabled.

**Acceptance criteria:**

- `SWAGGER_ENABLED` defaults to `false` (changed from `true`)
- A warning is logged if `SWAGGER_ENABLED=true` and `NODE_ENV=production`
- `/documentation` returns 404 when `SWAGGER_ENABLED=false`

#### REQ-009: Content Security Policy

**User story:** As a security engineer, I need proper CSP headers on all responses so that
the Swagger UI and any future HTML pages are protected against XSS injection.

**Acceptance criteria:**

- `Content-Security-Policy` header is present on all responses
- CSP allows inline scripts and styles required by Swagger UI
- `object-src` is set to `'none'`
- `upgrade-insecure-requests` is included
- `Strict-Transport-Security` is set with `max-age=31536000; includeSubDomains; preload`

#### REQ-010: Refresh Token Family Detection

**User story:** As a security engineer, I need stolen refresh token reuse to be detected
and all sessions for the affected user to be invalidated immediately.

**Acceptance criteria:**

- Each login session is assigned a `family` UUID stored on the `RefreshToken` record
- Refreshing a token continues the same family; new logins start a new family
- If a revoked token is presented to `POST /refresh`, all tokens in that family are immediately revoked
- The security event is logged at `warn` level with `userId` and `family`
- The response is HTTP 401 with a message indicating suspicious activity
- A Prisma migration adds the `family` column and index to `refresh_tokens`

---

### Phase 2 — Resilience & Reliability

#### REQ-011: Structured Error Handling

**User story:** As a developer, I need the global error handler to distinguish operational
errors from programming errors and include validation details in 4xx responses.

**Acceptance criteria:**

- Programming errors (non-`AppError` instances) are logged at `fatal` level
- Operational errors (`AppError` subclasses with `isOperational: true`) are logged at `warn` level
- 5xx responses in production never include the raw error message (replaced with "Internal Server Error")
- 4xx responses include the `details` field from `AppError` when present
- The `formatErrorResponse` utility from `src/utils/errors.ts` is used by the global handler

#### REQ-012: User Context in Logs

**User story:** As a support engineer, I need authenticated requests to include the user ID
in all log lines so I can trace all activity for a given user.

**Acceptance criteria:**

- All log lines for authenticated requests include `userId` and `userRole` fields
- The fields are added via a `preHandler` hook, not manually in each route
- Unauthenticated request logs are unchanged (no `userId` field)

#### REQ-013: Prisma Query Timeouts and Slow Query Logging

**User story:** As an engineer, I need database queries to time out after a configurable
period and slow queries to be logged so that DB performance regressions are detectable.

**Acceptance criteria:**

- Any Prisma query that takes longer than 10 seconds throws a timeout error
- Any Prisma query that takes longer than 500ms logs a `warn` with the model, operation, and duration
- The timeout is implemented via `$extends` query middleware, not at the route level
- No changes are needed to individual route or orchestrator code

#### REQ-014: Structured Logging in BaseOrchestrator

**User story:** As a developer, I need orchestrator errors and warnings to appear in the
structured Pino log output rather than as raw `console.error` calls.

**Acceptance criteria:**

- `BaseOrchestrator` accepts an optional `Logger` parameter in its constructor
- All `console.error` calls are replaced with `this.log.error`
- All `console.warn` calls are replaced with `this.log.warn`
- Log entries include the orchestrator name and stage name as fields
- When called from a route handler, the logger passed is `request.log` (carries `requestId` and `userId`)
- When no logger is provided, falls back to the module-level Pino logger

#### REQ-015: High-Resolution Metrics Timing

**User story:** As an SRE, I need HTTP duration metrics measured at nanosecond resolution
so that sub-millisecond response times are accurately represented in Prometheus histograms.

**Acceptance criteria:**

- `onRequest` hook stores `process.hrtime.bigint()` instead of `Date.now()`
- `onResponse` hook computes duration as nanoseconds converted to seconds (divide by 1e9)
- `http_request_duration_seconds` histogram values accurately represent responses < 1ms

#### REQ-016: Improved Dockerfile Healthcheck

**User story:** As an operator, I need the Docker HEALTHCHECK to verify database
connectivity — not just process liveness — so that containers with broken DB connections
are correctly marked as unhealthy.

**Acceptance criteria:**

- HEALTHCHECK hits `/api/v1/ready` (readiness) not `/api/v1/health` (liveness)
- `--start-period` is at least 30 seconds
- `wget` is used instead of `node -e` for the check command
- `wget` is installed in the production stage of the Dockerfile

---

### Phase 3 — Observability

#### REQ-017: Distributed Tracing

**User story:** As a developer, I need distributed traces that show exactly where time is
spent within each request so I can debug performance issues without adding temporary logs.

**Acceptance criteria:**

- Every HTTP request produces a trace with spans for route handling, middleware, and DB queries
- Prisma queries appear as child spans within their parent request trace
- `traceId` and `spanId` are included in Pino log lines for correlation
- Traces are exported to a local Jaeger instance in development
- The OTLP endpoint is configurable via `OTEL_EXPORTER_OTLP_ENDPOINT` env var
- `src/telemetry.ts` is the first import in `src/server.ts`

#### REQ-018: Prometheus Alert Rules

**User story:** As an SRE, I need Prometheus alerting rules so that production anomalies
trigger alerts rather than waiting to be discovered in dashboards.

**Acceptance criteria:**

- Alert fires when 5xx error rate exceeds 5% for 2 consecutive minutes
- Alert fires when P99 latency exceeds 1 second for 5 consecutive minutes
- Alert fires when the Fastify service is unreachable for 1 minute
- Alert fires when active orchestrator operations exceed 50 for 2 minutes
- Rules are in `docker/prometheus/alert_rules.yml`
- Prometheus config references the rules file

#### REQ-019: Test Coverage Thresholds

**User story:** As a tech lead, I need automated coverage thresholds to prevent regressions
in test coverage from being merged without explicit acknowledgment.

**Acceptance criteria:**

- `npm run test:coverage` exits non-zero if line coverage drops below 80%
- `npm run test:coverage` exits non-zero if function coverage drops below 80%
- `npm run test:coverage` exits non-zero if branch coverage drops below 75%
- Coverage reports include `lcov` format for CI upload
- The test helper (`src/utils/test-app.ts`) is excluded from coverage measurement

---

### Phase 4 — CI/CD Pipeline

#### REQ-020: GitHub Actions CI Workflow

**User story:** As a developer, I need automated CI checks on every PR so that broken
code, failing tests, and security vulnerabilities cannot be merged.

**Acceptance criteria:**

- `.github/workflows/ci.yml` exists and runs on push to `main`/`develop` and all PRs
- CI pipeline runs: typecheck → lint → format check → tests with coverage → build → Docker build
- Tests run against a real PostgreSQL service container with migrations applied
- `npm audit --audit-level=high` fails the build on high/critical CVEs
- TruffleHog scans for accidentally committed secrets
- All jobs must pass before a PR can be merged

#### REQ-021: Docker Image Build and Push

**User story:** As a DevOps engineer, I need Docker images automatically built, tagged,
and pushed to a registry on every merge to main.

**Acceptance criteria:**

- `.github/workflows/deploy.yml` builds and pushes to GitHub Container Registry (GHCR)
- Images are tagged with git SHA, branch name, and semver tag (when present)
- Docker layer caching is used (GitHub Actions cache)
- The deploy workflow only runs after CI passes

---

### Phase 5 — Database Production Readiness

#### REQ-022: Migration Safety for Multi-Instance Deploys

**User story:** As a DevOps engineer, I need database migrations to run exactly once per
deploy — not once per container instance — so that concurrent startups don't race.

**Acceptance criteria:**

- A dedicated `migrate` service in `docker-compose.yml` runs `prisma migrate deploy`
- The `app` service depends on `migrate` with `condition: service_completed_successfully`
- The `app` service command does NOT include `prisma migrate deploy`
- For Kubernetes, an initContainer spec is documented

#### REQ-023: Expired Token Cleanup

**User story:** As a DBA, I need expired and revoked refresh tokens automatically purged
from the database so that the `refresh_tokens` table does not grow unboundedly.

**Acceptance criteria:**

- On server startup, all expired tokens and revoked tokens older than 7 days are deleted
- Cleanup runs every 24 hours while the server is running
- The cleanup query is logged with the count of deleted rows (at `info` level if count > 0)
- Cleanup errors are logged at `warn` level and do not crash the server
- The interval is cleared in the `onClose` hook

#### REQ-024: Database SSL Enforcement

**User story:** As a security engineer, I need database connections in production to use
SSL so that credentials and data are not transmitted in plaintext.

**Acceptance criteria:**

- If `NODE_ENV=production` and `DATABASE_URL` lacks `sslmode=require`, a warning is logged at startup
- `.env.example` documents the SSL connection string format
- The Prisma plugin logs the warning once at startup, not per-query

---

### Phase 6 — Infrastructure

#### REQ-025: Docker Compose Hardening

**User story:** As a DevOps engineer, I need the Docker Compose configuration to be
production-safe with no hardcoded secrets, pinned image versions, and automatic restarts.

**Acceptance criteria:**

- No service uses `latest` image tag — all images are pinned to specific versions
- Grafana admin credentials are read from environment variables with `:?` required syntax
- All services have `restart: unless-stopped`
- Postgres has `deploy.resources.limits` for memory and CPU
- No credentials are hardcoded in the compose file
- `GRAFANA_ADMIN_PASSWORD` is documented in `.env.example`

---

## Out of Scope (Phase 7 — Future)

The following are captured in `docs/PRODUCTION_PLAN.md` Phase 7 but are not part of this
spec due to their architectural scope:

- JWKS/RS256 JWT rotation (requires key management infrastructure)
- Read replica support (requires infrastructure change)
- API versioning header strategy
- Request ID propagation to outbound HTTP calls
- WebSocket support and connection draining
