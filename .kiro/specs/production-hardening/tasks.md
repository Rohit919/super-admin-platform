# Tasks: Production Hardening

## Instructions

Work through tasks in phase order. Each task references the requirement (REQ-XXX) and
design decision (DD-XXX) that govern it. Mark tasks complete as you finish them.

A task is done when:

1. The code change is made
2. `npm run typecheck` passes
3. `npm run lint` passes
4. Relevant tests pass (`npm test -- --run`)

---

## Phase 0 — Immediate Blockers

- [ ] **TASK-001** — Fix `.gitignore` to exclude secrets and build artifacts
  - Requirements: REQ-002
  - Files: `.gitignore`
  - Replace the current single-line `node_modules` gitignore with the full version from
    `docs/PRODUCTION_PLAN.md` section 0.1
  - Run `git status` and confirm `.env` is now untracked
  - Run `git rm --cached .env` if `.env` was previously tracked

- [ ] **TASK-002** — Create `.dockerignore`
  - Requirements: REQ-002
  - Files: `.dockerignore` (new file)
  - Create the file from `docs/PRODUCTION_PLAN.md` section 0.4
  - Verify: `docker build -t test-ignore .` — build context size logged by Docker should be < 5 MB

- [ ] **TASK-003** — Create `.env.example`
  - Requirements: REQ-003
  - Files: `.env.example` (new file)
  - Create from `docs/PRODUCTION_PLAN.md` section 0.2
  - Every variable in `src/plugins/env.ts` envSchema must appear in the file
  - Commit `.env.example` to git

- [ ] **TASK-004** — Fix graceful shutdown in `src/server.ts`
  - Requirements: REQ-001
  - Design: DD-001
  - Files: `src/server.ts`
  - Replace both `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)` handlers
    with the `shutdown(signal)` function from `docs/PRODUCTION_PLAN.md` section 0.3
  - Add the 10-second hard deadline with `.unref()`
  - Move `buildApp()` call to module level so the `app` variable is accessible in shutdown
  - Verify: start server, run `kill -SIGTERM $(pgrep -f "tsx.*server")`, observe logs show
    "draining connections" → "Server closed cleanly"

---

## Phase 1 — Security Hardening

- [ ] **TASK-005** — Enforce minimum JWT secret length
  - Requirements: REQ-004
  - Design: DD-004
  - Files: `src/plugins/env.ts`, `src/plugins/auth.ts`
  - Add `minLength: 32` to `JWT_SECRET` in the TypeBox env schema
  - Add startup assertion in `auth.ts` with descriptive error message
  - Add `algorithms: ['HS256']` to the `@fastify/jwt` verify config
  - Verify: set `JWT_SECRET=short` in `.env`, start server → expect startup failure with clear message

- [ ] **TASK-006** — Disable Swagger in production by default
  - Requirements: REQ-008
  - Files: `src/plugins/env.ts`, `src/plugins/swagger.ts`
  - Change `SWAGGER_ENABLED` default from `true` to `false`
  - Add production warning log in `swagger.ts` when `SWAGGER_ENABLED=true` and `NODE_ENV=production`
  - Update `.env.example` to document this
  - Verify: start server without setting `SWAGGER_ENABLED` → `GET /documentation` returns 404

- [ ] **TASK-007** — Enable Content Security Policy
  - Requirements: REQ-009
  - Files: `src/app.ts`
  - Replace `contentSecurityPolicy: false` with the CSP directives from
    `docs/PRODUCTION_PLAN.md` section 1.6
  - Add HSTS with `maxAge: 31536000; includeSubDomains; preload`
  - Verify: `curl -I http://localhost:3000` includes `Content-Security-Policy` header

- [ ] **TASK-008** — Add METRICS_TOKEN env variable
  - Requirements: REQ-007
  - Files: `src/plugins/env.ts`
  - Add `METRICS_TOKEN: Type.Optional(Type.String({ minLength: 20 }))` to env schema
  - Add `Env` type will auto-update via Static inference — no manual type change needed
  - Update `.env.example` with `METRICS_TOKEN=` placeholder

- [ ] **TASK-009** — Protect `/metrics` endpoint with bearer token
  - Requirements: REQ-007
  - Design: DD-007
  - Files: `src/plugins/metrics.ts`
  - Wrap the metrics route handler with bearer token auth when `METRICS_TOKEN` is set
  - Return 401 for missing or invalid tokens
  - Update `docker/prometheus/prometheus.yml` to support authorization header
  - Verify: set `METRICS_TOKEN=testtoken12345678901` → `curl /metrics` returns 401;
    `curl -H "Authorization: Bearer testtoken12345678901" /metrics` returns 200

- [ ] **TASK-010** — Add per-route rate limits on auth endpoints
  - Requirements: REQ-005
  - Design: DD-005
  - Files: `src/routes/auth/index.ts`, `src/app.ts`
  - Add `config.rateLimit` to `/login` (5/15min, email-keyed)
  - Add `config.rateLimit` to `/register` (3/hr, IP-keyed)
  - Add `config.rateLimit` to `/refresh` (10/min, token-prefix-keyed)
  - Add `skip` function to global rate limit to exclude health and metrics endpoints
  - Verify: call `/login` with wrong password 6 times → 6th returns 429 with `retryAfter`

- [ ] **TASK-011** — Add User model fields for account lockout
  - Requirements: REQ-006
  - Design: DD-006
  - Files: `prisma/schema.prisma`
  - Add `failedLoginAttempts Int @default(0)` to User model
  - Add `lockedUntil DateTime?` to User model
  - Add `lastLoginAt DateTime?` to User model
  - Run `npx prisma migrate dev --name add_account_lockout`
  - Verify: `npx prisma studio` shows new columns on users table

- [ ] **TASK-012** — Implement account lockout in login handler
  - Requirements: REQ-006
  - Design: DD-006
  - Files: `src/routes/auth/index.ts`
  - Add timing-safe "user not found" path using a fake bcrypt compare
  - Add lockout check before bcrypt compare (for performance on locked accounts)
  - Increment `failedLoginAttempts` and set `lockedUntil` on failed login
  - Reset counters on successful login
  - Return 429 with `retryAfter` for locked accounts
  - Add integration tests in `src/routes/__tests__/auth.test.ts` for:
    - Account locked after 5 failures
    - Locked account returns 429 with `retryAfter`
    - Successful login resets counter
  - Verify: 5 wrong passwords → account locked; 6th attempt returns 429

- [ ] **TASK-013** — Add family field to RefreshToken model
  - Requirements: REQ-010
  - Design: DD-010
  - Files: `prisma/schema.prisma`
  - Add `family String` field to `RefreshToken` model
  - Add `@@index([family])` to `RefreshToken`
  - Run `npx prisma migrate dev --name add_refresh_token_family`
  - Verify migration applies cleanly

- [ ] **TASK-014** — Implement refresh token family detection
  - Requirements: REQ-010
  - Design: DD-010
  - Files: `src/routes/auth/index.ts`
  - Update `createRefreshToken` helper to accept and store `family` parameter
  - Login generates a new `family` UUID per session
  - Refresh handler continues the existing family
  - If a revoked token is presented: revoke entire family, log `warn`, return 401
  - Add integration tests for stolen token detection:
    - Use token A → get token B
    - Try to use token A again → entire family revoked
    - Token B no longer works
  - Verify: use a refresh token, then try to use it again → 401 + family revoked

- [ ] **TASK-015** — Add maxLength to all user-input string fields
  - Requirements: REQ-010 (security hardening, same phase)
  - Files: `src/routes/auth/index.ts`
  - Add `maxLength: 254` to email (RFC 5321 limit)
  - Change password `minLength` from 6 to 8 (NIST SP 800-63B recommendation)
  - Add `maxLength: 128` to password
  - Add `maxLength: 100` to name

---

## Phase 2 — Resilience & Reliability

- [ ] **TASK-016** — Rewrite global error handler to use AppError correctly
  - Requirements: REQ-011
  - Design: DD-011
  - Files: `src/app.ts`
  - Replace inline error handler with one that:
    - Checks `error instanceof AppError && error.isOperational` for log level
    - Hides 5xx messages in production
    - Includes `details` from AppError in 4xx responses
  - Add import for `AppError` from `utils/errors.ts`
  - Verify: throw `new ValidationError('test', { field: 'email' })` → 400 response includes `details`
  - Verify: throw `new Error('internal')` → 500 in production returns "Internal Server Error"

- [ ] **TASK-017** — Add user context to request logs
  - Requirements: REQ-012
  - Design: DD-012
  - Files: `src/app.ts`
  - Add `preHandler` hook that calls `request.log.child({ userId, userRole })`
    when `request.user` is set
  - Verify: make authenticated request, check server logs include `userId` field

- [ ] **TASK-018** — Add Prisma query timeouts and slow-query logging
  - Requirements: REQ-013
  - Design: DD-013
  - Files: `src/plugins/prisma.ts`
  - Rewrite plugin to use `$extends` with `query.$allOperations` middleware
  - Add 10-second hard timeout via `Promise.race`
  - Log warn for queries > 500ms with model, operation, duration fields
  - Handle the TypeScript type change: extract `createExtendedPrismaClient` function,
    update the `FastifyInstance.prisma` type declaration
  - Run `npm run typecheck` — fix any type errors from the extended client type
  - Verify: `npm run typecheck` passes

- [ ] **TASK-019** — Replace console calls in BaseOrchestrator with Pino logger
  - Requirements: REQ-014
  - Design: DD-014
  - Files: `src/core/orchestration/base-orchestrator.ts`, `src/services/todo/index.ts`,
    `src/routes/todos/index.ts`
  - Add optional `log?: Logger` parameter to `BaseOrchestrator` constructor
  - Add `import type { Logger } from 'pino'`
  - Replace `console.error` on line 109 with `this.log.error({ err: error }, '...')`
  - Replace `console.warn` on line 202 with `this.log.warn({ err: error, stage }, '...')`
  - Update `TodoService.createTodo` to accept and forward `log` parameter
  - Update `src/routes/todos/index.ts` to pass `request.log` to `todoService.createTodo`
  - Verify: create a todo with an invalid title → no `console.error` output, Pino JSON log appears

- [ ] **TASK-020** — Switch metrics timing to process.hrtime.bigint()
  - Requirements: REQ-015
  - Files: `src/plugins/metrics.ts`
  - Replace `request.startTime?: number` with `request.startHrTime: bigint` on the
    `FastifyRequest` module augmentation
  - Update `onRequest` hook to store `process.hrtime.bigint()`
  - Update `onResponse` hook to compute `Number(process.hrtime.bigint() - request.startHrTime) / 1e9`
  - Verify: `curl /metrics` → `http_request_duration_seconds_bucket` has non-zero values
    in small buckets (< 0.001)

- [ ] **TASK-021** — Fix Dockerfile HEALTHCHECK to use /ready and wget
  - Requirements: REQ-016
  - Files: `Dockerfile`
  - Install `wget` in the production stage (`apk add --no-cache dumb-init openssl wget`)
  - Replace the HEALTHCHECK command with:
    `CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/v1/ready || exit 1`
  - Change `--start-period=5s` to `--start-period=30s`
  - Change `--timeout=3s` to `--timeout=10s`
  - Verify: `docker build -t test-health .` then `docker inspect test-health` shows new healthcheck

---

## Phase 3 — Observability

- [ ] **TASK-022** — Install OpenTelemetry dependencies
  - Requirements: REQ-017
  - Files: `package.json`
  - Run:
    ```bash
    npm install @opentelemetry/sdk-node \
      @opentelemetry/exporter-trace-otlp-http \
      @opentelemetry/instrumentation-http \
      @opentelemetry/instrumentation-fastify \
      @prisma/instrumentation \
      @opentelemetry/resources \
      @opentelemetry/semantic-conventions
    ```
  - Verify: `npm ls @opentelemetry/sdk-node` shows installed version

- [ ] **TASK-023** — Create src/telemetry.ts
  - Requirements: REQ-017
  - Design: DD-017
  - Files: `src/telemetry.ts` (new file)
  - Implement `NodeSDK` setup with Fastify and Prisma instrumentations
  - Use `OTEL_EXPORTER_OTLP_ENDPOINT` env var for the exporter URL
  - Include resource attributes for service name and git SHA
  - Register `sdk.shutdown()` on `beforeExit`
  - Add `OTEL_EXPORTER_OTLP_ENDPOINT` to `src/plugins/env.ts` as optional
  - Add to `.env.example`

- [ ] **TASK-024** — Wire telemetry into server startup
  - Requirements: REQ-017
  - Design: DD-017
  - Files: `src/server.ts`, `src/app.ts`, `prisma/schema.prisma`
  - Add `import './telemetry.js'` as the VERY FIRST import in `src/server.ts`
  - Add `previewFeatures = ["tracing"]` to generator block in `prisma/schema.prisma`
  - Run `npx prisma generate` after schema change
  - Add OTel trace context hook to `src/app.ts` that attaches `traceId`/`spanId` to `request.log`
  - Verify: `import './telemetry.js'` is before any other import in `src/server.ts`

- [ ] **TASK-025** — Add Jaeger to docker-compose for local tracing
  - Requirements: REQ-017
  - Files: `docker/docker-compose.yml`
  - Add Jaeger `all-in-one:1.57` service with ports 16686 (UI) and 4318 (OTLP HTTP)
  - Add `COLLECTOR_OTLP_ENABLED=true` env var
  - Add `restart: unless-stopped`
  - Verify: `docker compose up jaeger` → `http://localhost:16686` loads Jaeger UI

- [ ] **TASK-026** — Create Prometheus alert rules
  - Requirements: REQ-018
  - Files: `docker/prometheus/alert_rules.yml` (new file), `docker/prometheus/prometheus.yml`
  - Create alert rules from `docs/PRODUCTION_PLAN.md` section 3.2:
    - `HighErrorRate` — 5xx > 5% for 2m
    - `HighLatencyP99` — P99 > 1s for 5m
    - `ServiceDown` — target unreachable for 1m
    - `OrchestratorOverload` — active ops > 50 for 2m
    - `DatabaseErrors` — pipeline error rate > 0.1 for 1m
  - Add `rule_files: ['alert_rules.yml']` to prometheus.yml
  - Verify: `docker compose up prometheus` → `http://localhost:9090/alerts` shows rules

- [ ] **TASK-027** — Add Vitest coverage thresholds
  - Requirements: REQ-019
  - Files: `vitest.config.ts`
  - Add `thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 }`
  - Add `lcov` to reporter list: `reporter: ['text', 'json', 'html', 'lcov']`
  - Add `src/utils/test-app.ts` to the coverage exclude list
  - Verify: `npm run test:coverage` passes with current test suite

---

## Phase 4 — CI/CD

- [ ] **TASK-028** — Create GitHub Actions CI workflow
  - Requirements: REQ-020
  - Design: DD-020
  - Files: `.github/workflows/ci.yml` (new file + directory)
  - Create the workflow from `docs/PRODUCTION_PLAN.md` section 4.1
  - Four jobs: `quality`, `test`, `build`, `security`
  - `test` job uses PostgreSQL service container with migrations
  - `build` job depends on `quality` and `test` both passing
  - Verify: push a branch to GitHub → Actions tab shows CI running

- [ ] **TASK-029** — Create GitHub Actions deploy workflow
  - Requirements: REQ-021
  - Files: `.github/workflows/deploy.yml` (new file)
  - Create the workflow from `docs/PRODUCTION_PLAN.md` section 4.2
  - Build and push to GHCR on merge to `main`
  - Tag images with SHA, branch, and semver
  - Only runs after CI passes (via `needs` dependency)
  - Verify: add workflow file → confirm it appears in GitHub Actions tab

---

## Phase 5 — Database Production Readiness

- [ ] **TASK-030** — Add migrate service to docker-compose
  - Requirements: REQ-022
  - Design: DD-022
  - Files: `docker/docker-compose.yml`
  - Add `migrate` service that runs `npx prisma migrate deploy` and exits
  - Update `app` service to depend on `migrate` with `condition: service_completed_successfully`
  - Remove migration from `app` start command (use `node dist/server.js` directly)
  - Update `package.json` start script to just `node dist/server.js`
  - Verify: `docker compose up` → migrate service runs first, exits 0, then app starts

- [ ] **TASK-031** — Implement expired refresh token cleanup
  - Requirements: REQ-023
  - Design: DD-023
  - Files: `src/plugins/prisma.ts`
  - Add `cleanupExpiredTokens` function that deletes tokens where `expiresAt < now()` or
    `revokedAt < (now() - 7 days)`
  - Call cleanup on startup (after `$connect`)
  - Schedule cleanup every 24 hours with `setInterval`
  - Clear interval in `onClose` hook
  - Add index `@@index([expiresAt])` to `RefreshToken` in schema for cleanup query performance
  - Run `npx prisma migrate dev --name add_refresh_token_expires_index`
  - Verify: manually insert expired tokens, restart server, confirm they are deleted

- [ ] **TASK-032** — Enforce database SSL in production
  - Requirements: REQ-024
  - Files: `src/plugins/prisma.ts`, `.env.example`
  - Add SSL check in prisma plugin: log `warn` if `NODE_ENV=production` and
    `DATABASE_URL` lacks `sslmode=require`
  - Update `.env.example` to include SSL connection string format for production
  - Verify: set `NODE_ENV=production` without sslmode in DATABASE_URL → warning logged

---

## Phase 6 — Infrastructure Hardening

- [ ] **TASK-033** — Pin Docker image versions in docker-compose
  - Requirements: REQ-025
  - Files: `docker/docker-compose.yml`
  - Replace `latest` tags:
    - `postgres:16-alpine` → `postgres:16.3-alpine`
    - `prom/prometheus:latest` → `prom/prometheus:v2.51.2`
    - `grafana/grafana:latest` → `grafana/grafana:10.4.2`
  - Verify: `grep "latest" docker/docker-compose.yml` returns no matches

- [ ] **TASK-034** — Remove hardcoded Grafana credentials from docker-compose
  - Requirements: REQ-025
  - Files: `docker/docker-compose.yml`, `.env.example`
  - Replace hardcoded `admin/admin` with env var references using `:?` required syntax
  - Add `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` to `.env.example`
  - Verify: `docker compose up grafana` without setting the vars → compose fails with
    clear error "GRAFANA_ADMIN_PASSWORD must be set"

- [ ] **TASK-035** — Add restart policies and resource limits to docker-compose
  - Requirements: REQ-025
  - Files: `docker/docker-compose.yml`
  - Add `restart: unless-stopped` to all services
  - Add `deploy.resources.limits` to postgres (`memory: 512M, cpus: '0.5'`)
  - Verify: `docker compose config` validates without errors

---

## Dependency Cleanup (runs alongside any phase)

- [ ] **TASK-036** — Align Prisma CLI and client versions
  - Files: `package.json`
  - Change `@prisma/client` to `"5.22.0"` (exact, not range)
  - Change `prisma` devDep to `"5.22.0"` (remove RC version)
  - Run `npm install`
  - Verify: `npm ls prisma @prisma/client` — both show `5.22.0`

- [ ] **TASK-037** — Move pino-pretty to devDependencies
  - Files: `package.json`
  - Move `pino-pretty` from `dependencies` to `devDependencies`
  - Run `npm install`
  - Verify: production Docker image doesn't include `pino-pretty` in `node_modules`
    (it's only needed at dev time; the production Pino transport is `undefined`)

- [ ] **TASK-038** — Remove unused @fastify/autoload dependency
  - Files: `package.json`
  - Run `npm uninstall @fastify/autoload`
  - Run `npm run typecheck` — confirm nothing breaks
  - Verify: `npm ls @fastify/autoload` shows it is not installed

---

## Completion Checklist

Before declaring this spec complete, confirm:

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run test:coverage` passes all thresholds (80% lines/functions, 75% branches)
- [ ] `npm run build` produces `dist/server.js`
- [ ] `docker build .` succeeds and image is < 200 MB
- [ ] `docker compose -f docker/docker-compose.yml up` starts all services without errors
- [ ] `curl http://localhost:3000/api/v1/health` returns `{ "status": "ok" }`
- [ ] `curl http://localhost:3000/api/v1/ready` returns `{ "status": "ready" }`
- [ ] `kill -SIGTERM <pid>` triggers graceful shutdown with drain log
- [ ] 6 login attempts with wrong password → 429 on attempt 6
- [ ] `JWT_SECRET=short` → server refuses to start
- [ ] `/metrics` returns 401 without token when `METRICS_TOKEN` is configured
- [ ] `/documentation` returns 404 when `SWAGGER_ENABLED` is not set
- [ ] GitHub Actions CI passes on a test PR
- [ ] No `latest` image tags in `docker-compose.yml`
- [ ] No credentials in `docker-compose.yml`
- [ ] `.env` is not tracked by git (`git status` shows it as untracked or ignored)
