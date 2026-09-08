**# Super Super Admin Platform — Production Engineering Plan**

**### Fastify Gold Standard Starter → Production-Grade Super Super Admin Platform API**

_> \*\*Document purpose:\*\* This is a complete engineering specification for hardening the Super Super Admin / SaaS control-plane codebase_

_> for production. Every section contains the exact problem, why it matters, the exact code_

_> change, and acceptance criteria. Work through phases in order — each phase builds on the last._

\---

**## Table of Contents**

1\. [Current State Assessment]\(#1-current-state-assessment)

2\. [Phase 0 — Immediate Blockers (do before any deploy)]\(#2-phase-0--immediate-blockers)

3\. [Phase 1 — Security Hardening]\(#3-phase-1--security-hardening)

4\. [Phase 2 — Resilience & Reliability]\(#4-phase-2--resilience--reliability)

5\. [Phase 3 — Observability]\(#5-phase-3--observability)

6\. [Phase 4 — CI/CD Pipeline]\(#6-phase-4--cicd-pipeline)

7\. [Phase 5 — Database Production Readiness]\(#7-phase-5--database-production-readiness)

8\. [Phase 6 — Infrastructure & Deployment]\(#8-phase-6--infrastructure--deployment)

9\. [Phase 7 — Scale & Advanced Concerns]\(#9-phase-7--scale--advanced-concerns)

10\. [Dependency Audit]\(#10-dependency-audit)

11\. [Acceptance Criteria Summary]\(#11-acceptance-criteria-summary)

\---

**## 1. Current State Assessment

### Super Admin platform scope

This production plan applies to the **SaaS Super Admin / Platform Control Plane**.

The production system is responsible for platform-level capabilities:

```text
Super Admin
    ↓
Platform API
    ↓
Platform DB
    ↓
Tenants / Provisioning / Plans / Entitlements
Platform Users / Platform RBAC
Credentials / Audit / Security
Feature Flags / Integrations / Settings
```

It is **not** the tenant logistics operational plane.

The Super Admin platform must not directly implement or access:

```text
Shipments
Orders
Drivers
Vehicles
Routes
Dispatch
Warehouses
Proof of Delivery
Driver tracking
Tenant operational workflows
```

Those capabilities belong to the separate Logistics/Tenant Admin platform.

### What works well

- Plugin architecture with `fastify-plugin` is correctly encapsulated
- TypeBox schemas provide compile-time + runtime type safety
- Orchestrator/service boundaries separate platform business logic
- JWT + refresh token rotation is implemented and tested
- Prisma migrations are tracked and versioned
- Multi-stage Dockerfile uses a non-root user and `dumb-init`
- Prometheus metrics are wired for API and platform operations
- Mock-based integration tests provide a database-independent test path

### Production-critical risks

| Issue                               | Risk                      | Super Admin impact                                                |
| ----------------------------------- | ------------------------- | ----------------------------------------------------------------- |
| Direct `process.exit(0)` on SIGTERM | 🔴 Data loss              | Tenant/provisioning/security operations can terminate mid-request |
| No `.dockerignore`                  | 🔴 Secret exposure        | Platform credentials may enter image/build layers                 |
| `.env` tracked by git               | 🔴 Secret leak            | Platform DB/JWT/API secrets exposed                               |
| Weak/global auth rate limits        | 🔴 Account takeover       | Super Admin accounts are high-value targets                       |
| Swagger enabled by default          | 🟠 Information disclosure | Exposes the platform API attack surface                           |
| Public `/metrics`                   | 🟠 Information disclosure | Reveals platform routes, timings, failures                        |
| No CI pipeline                      | 🟠 Broken deploys         | Unsafe control-plane changes can reach production                 |
| Migration race condition            | 🟠 Reliability            | Platform instances can start against inconsistent schema          |
| No DB pool tuning                   | 🟠 DB exhaustion          | Tenant/platform management load can exhaust connections           |
| No distributed tracing              | 🟡 Blind debugging        | Hard to trace provisioning/auth/RBAC failures                     |
| Direct console logging              | 🟡 Log loss               | Security and platform events lose structured context              |
| No alert rules                      | 🟡 Silent failures        | Tenant provisioning/security failures can go unnoticed            |
| No coverage thresholds              | 🟡 Regression             | Critical platform authorization code can regress silently         |

---|---|---|

\| \`process.exit(0)\` on SIGTERM bypasses \`app.close()\` | 🔴 Data loss | Every deployment, every container restart |

\| No \`.dockerignore\` | 🔴 Secrets in image | \`.env\` with DB credentials baked into Docker layers |

\| \`.env\` is tracked by git (only \`node\_modules\` in \`.gitignore\`) | 🔴 Secret leak | Everyone who can read the repo |

\| Global 100 req/min on \`/login\` | 🔴 Brute force | Account takeover in \~17 min |

\| \`SWAGGER\_ENABLED: true\` default | 🟠 Info disclosure | Full API schema + try-it-out in production |

\| \`/metrics\` unauthenticated | 🟠 Info disclosure | Internal timings, route names, error rates exposed |

\| No CI pipeline (\`.github/workflows/\` doesn't exist) | 🟠 Broken deploys | No automated verification before merge |

\| \`prisma migrate deploy\` race condition | 🟠 Data corruption | Multi-instance deployments |

\| No Prisma connection pool tuning | 🟠 DB exhaustion | Default pool too small for load |

\| No distributed tracing | 🟡 Blind debugging | Impossible to trace requests across restarts |

\| \`console.error/warn\` in BaseOrchestrator | 🟡 Log loss | Bypasses Pino, breaks log aggregation |

\| No alert rules | 🟡 Silent failures | Error spikes go undetected |

\| No coverage thresholds | 🟡 Regression | Tests can be deleted without breaking CI |

\---

**## 2. Phase 0 — Immediate Blockers**

_> These must be done before ANY deployment to ANY environment beyond local dev._

_> \*\*Estimated time: 2–3 hours.\*\*_

\---

**### 0.1 — Fix \`.gitignore\` to exclude \`.env\`**

\*\*Problem:\*\* The project's \`.gitignore\` only contains \`node\_modules\`. The \`.env\` file with

\`DATABASE\_URL\`, \`JWT\_SECRET\`, and other credentials is tracked by git. If this repo is ever

pushed to GitHub, those secrets are public.

\*\*Fix:\*\*

\`\`\`gitignore

_# .gitignore — replace entirely_

_# Dependencies_

node\_modules/

.npm/

_# Build output_

dist/

build/

_# Environment files — NEVER commit these_

.env

.env.\*

!.env.example # the example file IS committed

_# Prisma_

prisma/generated/

_# Test coverage_

coverage/

.nyc\_output/

_# Logs_

\*.log

logs/

_# OS / Editor_

.DS\_Store

.vscode/settings.json

\*.swp

\*.swo

_# TypeScript_

\*.tsbuildinfo

_# Docker_

docker/postgres-data/

\`\`\`

\*\*Acceptance criteria:\*\*

\- \`git status\` shows \`.env\` as untracked after this change

\- \`git log --all --full-history -- .env\` shows no commits containing \`.env\`

\- If \`.env\` was previously committed: run \`git rm --cached .env\` and create a new commit

\---

**### 0.2 — Create \`.env.example\`**

\*\*Problem:\*\* There is no \`.env.example\`. New developers have no way to know what variables are

required. A missing \`DATABASE\_URL\` or \`JWT\_SECRET\` causes a runtime crash, not a startup

validation error with a clear message.

\*\*Fix:\*\* Create \`.env.example\` — this IS committed to git and is the source of truth:

\`\`\`bash

_# .env.example_

_# Copy this to .env and fill in all values before running the server._

_# ALL values marked \<required> must be set — the server will not start without them._

_# ── Server ───────────────────────────────────────────────────────────────────_

NODE\_ENV=development _# development | production | test_

PORT=3000

HOST=0.0.0.0

LOG\_LEVEL=info _# trace | debug | info | warn | error | fatal_

_# ── Database ─────────────────────────────────────────────────────────────────_

_# \<required> Full PostgreSQL connection string_

DATABASE\_URL=postgresql://postgres\:postgres\@localhost:5432/fastify\_starter

_# ── Authentication ───────────────────────────────────────────────────────────_

_# \<required> Must be at least 32 characters — used to sign JWTs_

JWT\_SECRET=\<replace-with-32-char-minimum-random-secret>

JWT\_EXPIRES\_IN=15m _# Access token lifetime — keep short_

REFRESH\_TOKEN\_EXPIRES\_IN=7d _# Refresh token lifetime_

_# ── API ──────────────────────────────────────────────────────────────────────_

API\_PREFIX=/api

API\_VERSION=v1

_# ── Rate Limiting ────────────────────────────────────────────────────────────_

RATE\_LIMIT\_MAX=100 _# Global requests per window_

RATE\_LIMIT\_TIME\_WINDOW=60000 _# Window in milliseconds (60s)_

_# ── CORS ─────────────────────────────────────────────────────────────────────_

_# Comma-separated list of allowed origins — NO trailing slashes_

CORS\_ORIGIN=http\://localhost:3001,http\://localhost:3000

CORS\_CREDENTIALS=true

_# ── Monitoring ───────────────────────────────────────────────────────────────_

METRICS\_ENABLED=true

METRICS\_PATH=/metrics

_# Optional: bearer token to protect the /metrics endpoint_

METRICS\_TOKEN=

_# ── API Documentation ────────────────────────────────────────────────────────_

_# NEVER set to true in production — exposes full API schema_

SWAGGER\_ENABLED=true _# Set to false in production_

SWAGGER\_PATH=/documentation

\`\`\`

\---

**### 0.3 — Fix graceful shutdown (data loss bug)**

\*\*Problem:\*\* \`src/server.ts\` handles \`SIGTERM\` and \`SIGINT\` with direct \`process.exit(0)\` calls.

This is catastrophically wrong in production.

When \`process.exit(0)\` is called directly:

1\. In-flight HTTP requests are aborted mid-response

2\. \`app.close()\` is never called

3\. Fastify's \`onClose\` hooks never fire

4\. \`prisma.$disconnect()\` never runs — any open transactions or prepared statements are

abandoned on the DB side, potentially leaving locks

5\. Pino's async transport never flushes — last log lines are lost

\`dumb-init\` in the Dockerfile correctly forwards \`SIGTERM\` to the Node process — but the

Node process then immediately kills itself without cleanup.

\*\*Fix:\*\*

\`\`\`typescript

_// src/server.ts — complete replacement_

import { buildApp } from './app.js';

import { logger } from './utils/logger.js';

_// buildApp is called at module level so shutdown handlers can reference the instance_

const app = await buildApp().catch((err) => {

logger.error({ err }, 'Failed to build application');

process.exit(1);

});

const start = async () => {

try {

    await app.listen({

      port: app.config.PORT,

      host: app.config.HOST,

    });

    logger.info(\`Server ready — http\://${app.config.HOST}:${app.config.PORT}\`);

    logger.info(\`API: http\://${app.config.HOST}:${app.config.PORT}${app.config.API\_PREFIX}/${app.config.API\_VERSION}\`);

    if (app.config.SWAGGER\_ENABLED) {

      logger.info(\`Docs: http\://${app.config.HOST}:${app.config.PORT}${app.config.SWAGGER\_PATH}\`);

    }

    if (app.config.METRICS\_ENABLED) {

      logger.info(\`Metrics: http\://${app.config.HOST}:${app.config.PORT}${app.config.METRICS\_PATH}\`);

    }

} catch (err) {

    logger.error({ err }, 'Server startup failed');

    process.exit(1);

}

};

_// ── Graceful shutdown ─────────────────────────────────────────────────────────_

_// 1. Stop accepting new connections_

_// 2. Wait for in-flight requests to complete (Fastify handles this)_

_// 3. Fire all onClose hooks (Prisma disconnect, etc.)_

_// 4. Exit cleanly_

const shutdown = async (signal: string) => {

logger.info({ signal }, 'Shutdown signal received — draining connections');

_// Set a hard deadline: if shutdown takes longer than 10s, force exit._

_// This prevents a hung connection from blocking a deploy forever._

const forceExit = setTimeout(() => {

    logger.error('Graceful shutdown timed out after 10s — forcing exit');

    process.exit(1);

}, 10\_000);

_// Allow the timer to be garbage collected if shutdown completes in time_

forceExit.unref();

try {

    await app.close(); *// drains in-flight requests, fires onClose hooks*

    logger.info('Server closed cleanly');

    process.exit(0);

} catch (err) {

    logger.error({ err }, 'Error during shutdown');

    process.exit(1);

}

};

process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('SIGINT', () => shutdown('SIGINT'));

_// ── Unhandled errors ──────────────────────────────────────────────────────────_

_// These are programming errors, not operational errors._

_// Log them and exit — do NOT swallow them._

process.on('uncaughtException', (err) => {

logger.fatal({ err }, 'Uncaught exception — process will exit');

process.exit(1);

});

process.on('unhandledRejection', (reason, promise) => {

logger.fatal({ reason, promise: String(promise) }, 'Unhandled promise rejection — process will exit');

process.exit(1);

});

start();

\`\`\`

\*\*Why the 10-second hard deadline matters:\*\* Kubernetes and most PaaS platforms send SIGTERM

and then wait \`terminationGracePeriodSeconds\` (default 30s) before SIGKILL. If your app hangs

in \`app.close()\` (e.g., a websocket connection that never closes), you'll be killed anyway.

The explicit timeout makes your behaviour predictable and logs the reason.

\*\*Acceptance criteria:\*\*

\- \`kill -SIGTERM $(pgrep -f "node dist/server")\` → server logs "draining connections", waits

for any active requests, logs "Server closed cleanly", exits 0

\- \`curl -s http\://localhost:3000/api/v1/platform/tenants\` fired simultaneously with SIGTERM completes

with a valid response, not a connection reset

\---

**### 0.4 — Create \`.dockerignore\`**

\*\*Problem:\*\* No \`.dockerignore\` means the entire project directory — including \`.env\`,

\`.git\` (which may contain secrets in commit history), \`node\_modules\` (hundreds of MB),

\`coverage/\`, test files — gets sent as Docker build context and potentially ends up in

image layers.

\*\*Fix:\*\*

\`\`\`dockerignore

\# .dockerignore

\# Secrets — absolute must

.env

.env.\*

!.env.example

\# Git history

.git

.gitignore

\# Dependencies (installed fresh in builder stage)

node\_modules

\# Build artifacts (built in builder stage)

dist

build

\# Test artifacts

coverage

.nyc\_output

\# Development tooling

.husky

\*.log

\# Documentation (not needed in image)

docs

\*.md

!README.md

\# IDE

.vscode

.idea

\*.swp

\# Docker files themselves (avoid recursion confusion)

Dockerfile\*

docker/

\`\`\`

\*\*Acceptance criteria:\*\*

\- \`docker build -t test .\` — build context size < 5 MB

\- \`docker run --rm test sh -c "cat .env"\` → no such file or directory

\---

**## 3. Phase 1 — Security Hardening**

_> \*\*Estimated time: 1–2 days.\*\*_

\---

**### 1.1 — Enforce minimum JWT\_SECRET length**

\*\*Problem:\*\* \`JWT\_SECRET: Type.String()\` in \`env.ts\` accepts any non-empty string. A

\`JWT\_SECRET=secret\` (6 chars) is syntactically valid but cryptographically worthless for

HMAC-SHA256 — the security of HS256 degrades with short keys.

\*\*Fix in \`src/plugins/env.ts\`:\*\*

\`\`\`typescript

JWT\_SECRET: Type.String({

minLength: 32,

description: 'HMAC-SHA256 signing secret — must be at least 32 characters',

}),

\`\`\`

\*\*Add startup assertion in \`src/plugins/auth.ts\`:\*\*

\`\`\`typescript

const authPlugin: FastifyPluginAsync = async (fastify) => {

_// Fail fast — don't let a weak secret reach production silently_

if (fastify.config.JWT\_SECRET.length < 32) {

    throw new Error(

      \`JWT\_SECRET is too short (${fastify.config.JWT\_SECRET.length} chars). \` +

      'Minimum is 32 characters. Generate one with: openssl rand -hex 32'

    );

}

await fastify.register(fastifyJWT, {

    secret: fastify.config.JWT\_SECRET,

    sign: {

      algorithm: 'HS256',  *// pin the algorithm explicitly — never allow 'none'*

      expiresIn: fastify.config.JWT\_EXPIRES\_IN,

    },

    verify: {

      algorithms: ['HS256'], *// reject tokens signed with any other algorithm*

    },

});

_// ... rest unchanged_

};

\`\`\`

\*\*Why algorithm pinning matters:\*\* The \`alg: none\` attack allows forging JWTs without a

secret on libraries that don't pin the algorithm. Pinning \`algorithms: ['HS256']\` in the

verify config is a one-line defence with zero cost.

\---

**### 1.2 — Per-route rate limiting on auth endpoints**

\*\*Problem:\*\* The global 100 req/min limit means an attacker can try 100 password combinations

per minute against any account. At 6-character passwords using lowercase + digits (36 chars),

they can exhaust the top-100 most common passwords in under 2 minutes.

\*\*Architecture decision:\*\* Use \`@fastify/rate-limit\`'s per-route config. The key point is

the \`keyGenerator\` — use email address as the key for auth routes, not IP address. An

attacker behind a CDN or using residential proxies will rotate IPs; email-keyed limiting

stops credential stuffing regardless.

\*\*Fix in \`src/routes/auth/index.ts\`:\*\*

\`\`\`typescript

_// POST /login — tight limit, email-keyed_

fastify.post('/login', {

config: {

    rateLimit: {

      max: 5,

      timeWindow: '15 minutes',

_// Key by email so IP rotation doesn't help attackers_

      keyGenerator: (request) => {

        const body = request.body as { email?: string };

        return \`login:${body?.email?.toLowerCase() ?? request.ip}\`;

      },

      errorResponseBuilder: () => ({

        success: false,

        error: {

          message: 'Too many login attempts. Try again in 15 minutes.',

          statusCode: 429,

          retryAfter: 900,

        },

      }),

    },

},

schema: { ... },

}, handler);

_// POST /register — prevent account creation spam_

fastify.post('/register', {

config: {

    rateLimit: {

      max: 3,

      timeWindow: '1 hour',

      keyGenerator: (request) => \`register:${request.ip}\`,

    },

},

schema: { ... },

}, handler);

_// POST /refresh — per-token, not per-IP_

fastify.post('/refresh', {

config: {

    rateLimit: {

      max: 10,

      timeWindow: '1 minute',

      keyGenerator: (request) => {

        const body = request.body as { refreshToken?: string };

_// Rate limit per refresh token — prevents token grinding_

        return \`refresh:${body?.refreshToken?.slice(0, 8) ?? request.ip}\`;

      },

    },

},

schema: { ... },

}, handler);

\`\`\`

\*\*Also add to global config — skip health and metrics:\*\*

\`\`\`typescript

_// src/app.ts — update rate limit registration_

await app.register(rateLimitPlugin.default, {

max: app.config.RATE\_LIMIT\_MAX,

timeWindow: app.config.RATE\_LIMIT\_TIME\_WINDOW,

_// Don't count health checks or metrics scrapes against limits_

skipOnError: true,

skip: (request) =>

    request.url === '/api/v1/health' ||

    request.url === '/api/v1/ready' ||

    request.url === app.config.METRICS\_PATH,

});

\`\`\`

\---

**### 1.3 — Account lockout after failed login attempts**

\*\*Problem:\*\* Rate limiting slows brute force but doesn't stop a distributed attack where each

IP makes only 1–2 requests. Account lockout (also called credential stuffing protection)

complements rate limiting by tracking failures at the account level regardless of IP.

\*\*Step 1 — Add fields to User model in \`prisma/schema.prisma\`:\*\*

\`\`\`prisma

model User {

id String @id @default(cuid())

email String @unique

password String

name String

role String @default("user")

// Account lockout

failedLoginAttempts Int @default(0)

lockedUntil DateTime?

lastLoginAt DateTime?

createdAt DateTime @default(now())

updatedAt DateTime @updatedAt

refreshTokens RefreshToken[]

@@index([email])

@@map("users")

}

\`\`\`

\*\*Step 2 — Create migration:\*\*

\`\`\`bash

npx prisma migrate dev --name add\_account\_lockout

\`\`\`

\*\*Step 3 — Update login handler:\*\*

\`\`\`typescript

_// src/routes/auth/index.ts — updated login handler_

const MAX\_FAILED\_ATTEMPTS = 5;

const LOCKOUT\_DURATION\_MS = 15 \* 60 \* 1000; _// 15 minutes_

async (request, reply) => {

const { email, password } = request.body;

const user = await fastify.prisma.user.findUnique({ where: { email } });

_// Use a timing-safe "user not found" path that doesn't reveal existence_

if (!user) {

_// Still do a bcrypt compare to prevent timing attacks that reveal_

_// whether an email exists based on response time difference_

    await bcrypt.compare(password, '$2b$10$invalidhashpaddingtomatchbcryptlength.invalid');

    throw new UnauthorizedError('Invalid credentials');

}

_// Check lockout BEFORE comparing password (saves bcrypt time on locked accounts)_

if (user.lockedUntil && user.lockedUntil > new Date()) {

    const retryAfterSec = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);

    return reply.status(429).send({

      success: false,

      error: {

        message: 'Account temporarily locked due to too many failed attempts.',

        statusCode: 429,

        retryAfter: retryAfterSec,

      },

    });

}

const isValid = await bcrypt.compare(password, user.password);

if (!isValid) {

    const newAttempts = user.failedLoginAttempts + 1;

    const shouldLock = newAttempts >= MAX\_FAILED\_ATTEMPTS;

    await fastify.prisma.user.update({

      where: { id: user.id },

      data: {

        failedLoginAttempts: newAttempts,

        lockedUntil: shouldLock

          ? new Date(Date.now() + LOCKOUT\_DURATION\_MS)

          : undefined,

      },

    });

_// Always return the same message — don't tell attacker how many attempts remain_

    throw new UnauthorizedError('Invalid credentials');

}

_// Successful login — reset failure counters_

await fastify.prisma.user.update({

    where: { id: user.id },

    data: {

      failedLoginAttempts: 0,

      lockedUntil: null,

      lastLoginAt: new Date(),

    },

});

_// ... rest of login (sign tokens, return response)_

}

\`\`\`

\*\*Why the timing-safe "not found" path matters:\*\* Without the fake bcrypt compare, a

timing attack can distinguish "user not found" (fast response) from "wrong password"

(slow bcrypt response), leaking whether an email is registered.

\---

**### 1.4 — Protect \`/metrics\` endpoint**

\*\*Problem:\*\* The Prometheus metrics endpoint is completely public. It exposes:

\- All route paths (information useful for mapping the API)

\- Error rates per route (information about what's failing)

\- Active connection counts (information about load)

\- Orchestrator stage names (information about internal architecture)

\*\*Fix — Bearer token gate in \`src/plugins/metrics.ts\`:\*\*

\`\`\`typescript

_// Add METRICS\_TOKEN to env schema (src/plugins/env.ts):_

METRICS\_TOKEN: Type.Optional(Type.String({ minLength: 20 })),

_// In src/plugins/metrics.ts — protect the endpoint:_

if (fastify.config.METRICS\_ENABLED) {

fastify.get(

    fastify.config.METRICS\_PATH,

    {

_// Skip global rate limiting for the scrape endpoint_

      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },

    },

    async (request, reply) => {

_// If METRICS\_TOKEN is configured, require it_

      if (fastify.config.METRICS\_TOKEN) {

        const authHeader = request.headers.authorization;

        const token = authHeader?.startsWith('Bearer ')

          ? authHeader.slice(7)

          : null;

        if (!token || token !== fastify.config.METRICS\_TOKEN) {

          return reply.status(401).send({ error: 'Unauthorized' });

        }

      }

      const metrics = await register.metrics();

      return reply.type(register.contentType).send(metrics);

    }

);

}

\`\`\`

\*\*Update Prometheus scrape config to include the token:\*\*

\`\`\`yaml

_# docker/prometheus/prometheus.yml_

scrape\_configs:

\- job\_name: 'fastify'

    static\_configs:

      \- targets: ['host.docker.internal:3000']

    authorization:

      credentials: ${METRICS\_TOKEN}

\`\`\`

\---

**### 1.5 — Disable Swagger in production by default**

\*\*Problem:\*\* \`SWAGGER\_ENABLED: true\` is the default. If an operator forgets to set

\`SWAGGER\_ENABLED=false\`, the full interactive API documentation is public in production.

This gives attackers a complete attack surface map and a working client to test against.

\*\*Fix in \`src/plugins/env.ts\`:\*\*

\`\`\`typescript

SWAGGER\_ENABLED: Type.Boolean({ default: false }), _// was: true_

\`\`\`

\*\*Add a guard in \`src/plugins/swagger.ts\`:\*\*

\`\`\`typescript

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {

_// In production, double-check and warn loudly if Swagger is somehow enabled_

if (fastify.config.SWAGGER\_ENABLED && fastify.config.NODE\_ENV === 'production') {

    fastify.log.warn(

      'SWAGGER\_ENABLED=true in production. ' +

      'This exposes your full API schema. Disable unless intentional.'

    );

}

_// ... rest unchanged_

};

\`\`\`

\---

**### 1.6 — Implement Content Security Policy**

\*\*Problem:\*\* \`contentSecurityPolicy: false\` is hardcoded in \`src/app.ts\`. A CSP header is one

of the most effective defences against XSS — it tells the browser what sources are legitimate

for scripts, styles, and resources. While this API doesn't serve HTML, the Swagger UI does.

\*\*Fix in \`src/app.ts\`:\*\*

\`\`\`typescript

await app.register(helmetPlugin.default, {

contentSecurityPolicy: {

    directives: {

      defaultSrc:    ["'self'"],

      scriptSrc:     ["'self'", "'unsafe-inline'"],  *// Swagger UI requires inline scripts*

      styleSrc:      ["'self'", "'unsafe-inline'"],  *// Swagger UI requires inline styles*

      imgSrc:        ["'self'", 'data:', 'https:'],

      connectSrc:    ["'self'"],

      fontSrc:       ["'self'", 'https:'],

      objectSrc:     ["'none'"],

      upgradeInsecurityRequests: [],

    },

_// In development, report violations without blocking_

    reportOnly: process.env.NODE\_ENV !== 'production',

},

_// Explicitly configure other helmet directives_

crossOriginEmbedderPolicy: false, _// Needed for Swagger UI assets_

crossOriginOpenerPolicy: { policy: 'same-origin' },

crossOriginResourcePolicy: { policy: 'same-site' },

referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

hsts: {

    maxAge: 31536000,           *// 1 year*

    includeSubDomains: true,

    preload: true,

},

});

\`\`\`

\---

**### 1.7 — Refresh token family detection (stolen token defense)**

\*\*Problem:\*\* Current token rotation revokes a token on use and issues a new one. But if an

attacker steals a refresh token and uses it before the legitimate user's client does, the

legitimate user gets a "token revoked" error — and has no idea their session was compromised.

There is no detection; the attacker silently takes over the session.

\*\*The fix — token family tracking:\*\*

Each "login session" gets a \`family\` UUID. When a refresh token is used, the new token is

issued in the same family. If a token is presented that has already been revoked, it means

someone in the family used it — ALL tokens in that family are immediately revoked and the

user must re-login.

\*\*Step 1 — Update \`RefreshToken\` model:\*\*

\`\`\`prisma

model RefreshToken {

id String @id @default(cuid())

token String @unique

family String // Groups all rotations from one login session

userId String

user User @relation(fields: [userId], references: [id], onDelete: Cascade)

expiresAt DateTime

revokedAt DateTime?

createdAt DateTime @default(now())

@@index([userId])

@@index([token])

@@index([family]) // Fast family-wide revocation

@@map("refresh\_tokens")

}

\`\`\`

\*\*Step 2 — Update \`createRefreshToken\` helper:\*\*

\`\`\`typescript

async function createRefreshToken(

prisma: PrismaClient,

userId: string,

expiresIn: string,

family?: string _// if undefined, start a new family (new login)_

): Promise<{ token: string; family: string }> {

const token = crypto.randomUUID();

const tokenFamily = family ?? crypto.randomUUID(); _// new family on fresh login_

const expiresAt = new Date(Date.now() + parseDurationMs(expiresIn));

await prisma.refreshToken.create({

    data: { token, family: tokenFamily, userId, expiresAt },

});

return { token, family: tokenFamily };

}

\`\`\`

\*\*Step 3 — Update refresh handler:\*\*

\`\`\`typescript

_// POST /refresh handler_

const stored = await fastify.prisma.refreshToken.findUnique({

where: { token: refreshToken },

include: { user: true },

});

if (!stored) {

throw new UnauthorizedError('Invalid refresh token');

}

_// STOLEN TOKEN DETECTION: this token exists but was already revoked_

_// This means someone used a superseded token — compromise likely._

_// Revoke the entire family immediately._

if (stored.revokedAt) {

await fastify.prisma.refreshToken.updateMany({

    where: { family: stored.family, revokedAt: null },

    data: { revokedAt: new Date() },

});

fastify.log.warn(

    { userId: stored.userId, family: stored.family },

    'Refresh token reuse detected — entire session family revoked'

);

return reply.status(401).send({

    success: false,

    error: {

      message: 'Session invalidated due to suspicious activity. Please log in again.',

      statusCode: 401,

    },

});

}

if (stored.expiresAt < new Date()) {

return reply.status(401).send({

    success: false,

    error: { message: 'Refresh token expired', statusCode: 401 },

});

}

_// Revoke current token and issue new one in the same family_

await fastify.prisma.refreshToken.update({

where: { id: stored.id },

data: { revokedAt: new Date() },

});

const { user } = stored;

const newAccessToken = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role });

const { token: newRefreshToken } = await createRefreshToken(

fastify.prisma, user.id, fastify.config.REFRESH\_TOKEN\_EXPIRES\_IN,

stored.family _// continue the same family_

);

return reply.send({

success: true,

data: { accessToken: newAccessToken, refreshToken: newRefreshToken },

});

\`\`\`

\---

**### 1.8 — Add \`maxLength\` to all user-input string fields**

\*\*Problem:\*\* The \`name\` field on \`/register\` has \`minLength: 1\` but no \`maxLength\`. An

attacker can send a 10 MB string as the name, forcing the server to hash, validate, and

store it. Always bound string lengths.

\*\*Fix in \`src/routes/auth/index.ts\`:\*\*

\`\`\`typescript

_// register body schema_

body: Type.Object({

email: Type.String({ format: 'email', maxLength: 254 }), _// RFC 5321 max_

password: Type.String({ minLength: 8, maxLength: 128 }), _// Also raise min to 8_

name: Type.String({ minLength: 1, maxLength: 100 }),

}),

\`\`\`

\---

**## 4. Phase 2 — Resilience & Reliability**

_> \*\*Estimated time: 2–3 days.\*\*_

\---

**### 2.1 — Structured error handling throughout**

\*\*Problem:\*\* The global error handler in \`src/app.ts\` builds its own response shape inline,

ignoring the \`formatErrorResponse\` utility in \`src/utils/errors.ts\`. More critically, the

\`details\` field from \`AppError\` (validation errors carry extra context here) is silently

dropped — clients never see what field failed validation.

\*\*Fix in \`src/app.ts\` — use the utility and include details:\*\*

\`\`\`typescript

import { AppError, formatErrorResponse } from './utils/errors.js';

app.setErrorHandler((error, request, reply) => {

_// Distinguish operational errors (expected) from programming errors (bugs)_

const isOperational = error instanceof AppError && error.isOperational;

if (!isOperational) {

_// Programming error — log with full stack, alert on this_

    request.log.error({ err: error, requestId: request.id }, 'Unexpected error');

} else {

_// Operational error — just log at warn level (not an alert-worthy event)_

    request.log.warn({ err: error, requestId: request.id }, 'Operational error');

}

const statusCode = error.statusCode ?? 500;

_// In production, never expose internal error messages for 5xx errors_

const message = statusCode >= 500 && process.env.NODE\_ENV === 'production'

    ? 'Internal Server Error'

    : error.message ?? 'Internal Server Error';

return reply.status(statusCode).send({

    success: false,

    error: {

      message,

      statusCode,

      requestId: request.id,

      timestamp: new Date().toISOString(),

_// Include details for 4xx errors (validation failures, etc.)_

_// Never include details for 5xx (could leak internals)_

      ...(statusCode < 500 && error instanceof AppError && error.details

        ? { details: error.details }

        : {}),

    },

});

});

\`\`\`

\---

**### 2.2 — Wire user context into request logs**

\*\*Problem:\*\* Authenticated requests log \`requestId\` but not \`userId\`. When debugging a

production issue, "find all logs from user X" is impossible — you'd have to parse JWT

payloads from logs or correlate with auth logs separately.

\*\*Fix — add a \`preHandler\` hook to \`src/app.ts\`:\*\*

\`\`\`typescript

_// After plugin registrations, before routes_

app.addHook('preHandler', async (request) => {

_// If the request has been authenticated (user is populated), attach to logger_

if (request.user) {

_// Create a child logger with userId — all subsequent request.log calls_

_// will include this field automatically_

    request.log = request.log.child({

      userId: request.user.id,

      userRole: request.user.role,

    });

}

});

\`\`\`

\*\*This produces logs like:\*\*

\`\`\`json

{

"level": "INFO",

"requestId": "abc123",

"userId": "cmtpvvco00000ehrvp1gcp2gc",

"userRole": "user",

"method": "POST",

"url": "/api/v1/platform/tenants",

"statusCode": 201,

"responseTime": 23

}

\`\`\`

\---

**### 2.3 — Improve Prisma with query timeouts and slow-query logging**

\*\*Problem:\*\*

\- No query timeout — a slow DB query holds a Fastify worker thread indefinitely

\- No slow query logging in production — performance regressions are invisible

\- Default connection pool may be wrong size for containerized deployment

\*\*Fix in \`src/plugins/prisma.ts\`:\*\*

\`\`\`typescript

import fp from 'fastify-plugin';

import { PrismaClient } from '@prisma/client';

import type { FastifyPluginAsync } from 'fastify';

const SLOW\_QUERY\_THRESHOLD\_MS = 500;

const QUERY\_TIMEOUT\_MS = 10\_000;

const prismaPlugin: FastifyPluginAsync = async (fastify) => {

const prisma = new PrismaClient({

    log: fastify.config.NODE\_ENV === 'development'

      ? [

          { emit: 'event', level: 'query' },

          { emit: 'event', level: 'warn' },

          { emit: 'event', level: 'error' },

        ]

      : [{ emit: 'event', level: 'error' }],

}).$extends({

_// Query timeout middleware — prevents runaway queries_

    query: {

      $allOperations({ model, operation, args, query }) {

        return Promise.race([

          query(args),

          new Promise\<never>((\_, reject) =>

            setTimeout(

              () => reject(new Error(\`Prisma query timeout (${QUERY\_TIMEOUT\_MS}ms): ${model ?? 'raw'}.${operation}\`)),

              QUERY\_TIMEOUT\_MS

            )

          ),

        ]);

      },

    },

});

_// Log slow queries (both dev and prod — performance regressions matter everywhere)_

if (fastify.config.NODE\_ENV === 'development') {

_// @ts-expect-error — PrismaClient event typing_

    prisma.$on('query', (event: { query: string; duration: number }) => {

      if (event.duration > SLOW\_QUERY\_THRESHOLD\_MS) {

        fastify.log.warn(

          { query: event.query, durationMs: event.duration },

          'Slow Prisma query'

        );

      }

    });

}

await prisma.$connect();

fastify.decorate('prisma', prisma);

fastify.addHook('onClose', async () => {

    await prisma.$disconnect();

});

};

export default fp(prismaPlugin, { name: 'prisma' });

\`\`\`

\*\*Connection pool guidance (add to \`.env.example\`):\*\*

\`\`\`bash

_# For production, tune the connection pool:_

_# connection\_limit = (expected\_concurrent\_requests / avg\_query\_duration\_ratio)_

_# For a 1-vCPU container handling \~100 req/s with avg 5ms queries: \~10 connections_

DATABASE\_URL=postgresql://user\:pass\@host:5432/db?connection\_limit=10&pool\_timeout=10&connect\_timeout=10&sslmode=require

\`\`\`

\---

**### 2.4 — Replace \`console.error/warn\` in BaseOrchestrator**

\*\*Problem:\*\* \`src/core/orchestration/base-orchestrator.ts\` uses \`console.error\` and

\`console.warn\` directly. This:

\- Bypasses Pino entirely — these messages don't get structured JSON formatting

\- Don't include \`requestId\`, \`userId\`, or any context

\- Won't be picked up by log aggregation tools that parse Pino's JSON output

\- Mix into stdout unformatted, making log parsing brittle

\*\*Fix — inject a Pino-compatible logger:\*\*

\`\`\`typescript

_// src/core/orchestration/base-orchestrator.ts_

import type { Logger } from 'pino';

import { logger as defaultLogger } from '../../utils/logger.js'; _// fallback_

export abstract class BaseOrchestrator\<TContext, TResult, TInput = unknown> {

protected config: Required\<OrchestratorConfig>;

protected log: Logger;

constructor(config: OrchestratorConfig, log?: Logger) {

_this_.config = {

      name: config.name,

      timeout: config.timeout ?? 30000,

      enableMetrics: config.enableMetrics ?? true,

      logErrors: config.logErrors ?? true,

    };

_// Use injected logger or fall back to module-level logger_

_// The child logger includes the orchestrator name for easy filtering_

_this_.log = (log ?? defaultLogger).child({ orchestrator: _this_.config.name });

}

_// Replace all console.error with:_

_// this.log.error({ err: error }, \`Orchestration error in ${this.config.name}\`);_

_// Replace all console.warn with:_

_// this.log.warn({ err: error, stage: stage.name }, \`Non-critical stage failed\`);_

}

\`\`\`

\*\*Update \`PlatformTenantOrchestrator\` to pass request logger:\*\*

\`\`\`typescript

_// src/modules/platform/tenants/routes.ts — pass request.log to the service_

const result = await tenantService.createTenant({

title: request.body.title,

description: request.body.description,

userId: request.user.id,

}, request.log); _// pass logger with requestId and userId already attached_

_// src/modules/platform/tenants/service.ts_

import type { Logger } from 'pino';

export class PlatformTenantService {

constructor(private prisma: PrismaClient) {}

async createTenant(input: CreateTodoInput, log?: Logger) {

    const orchestrator = new PlatformTenantOrchestrator(*this*.prisma, log);

    return orchestrator.execute(input);

}

}

\`\`\`

\---

**### 2.5 — Fix the Dockerfile HEALTHCHECK**

\*\*Problem:\*\*

1\. The HEALTHCHECK hits \`/health\` (liveness) not \`/ready\` (readiness). Docker considers

the container healthy even if the database is down.

2\. \`--start-period=5s\` is too short. Prisma \`$connect()\` + migration check can easily

take 5–10 seconds on a cold container.

3\. Using \`node -e "require('http')..."\` adds \~150ms per health check due to Node startup.

\*\*Fix:\*\*

\`\`\`dockerfile

_# Install wget in the production stage (lighter than curl, no node startup overhead)_

RUN apk add --no-cache dumb-init openssl wget

HEALTHCHECK \\

\--interval=30s \\

\--timeout=10s \\

\--start-period=30s \\

\--retries=3 \\

CMD wget --no-verbose --tries=1 --spider \\

      http\://localhost:${PORT:-3000}/api/v1/ready || exit 1

\`\`\`

\---

**### 2.6 — Add \`nanosecond\` timing to metrics**

\*\*Problem:\*\* \`metrics.ts\` uses \`Date.now()\` which has 1ms resolution. For fast operations

(< 1ms responses, which Fastify handles routinely), this rounds everything to 0ms or 1ms —

completely useless for percentile histograms.

\*\*Fix in \`src/plugins/metrics.ts\`:\*\*

\`\`\`typescript

_// Extend FastifyRequest to store hrtime_

declare module 'fastify' {

interface FastifyRequest {

    startHrTime: bigint; *// nanoseconds — not startTime: number*

}

}

fastify.addHook('onRequest', async (request) => {

request.startHrTime = process.hrtime.bigint();

httpRequestsInProgress.labels({ method: request.method }).inc();

});

fastify.addHook('onResponse', async (request, reply) => {

_// Convert nanoseconds to seconds for Prometheus convention_

const durationSeconds = Number(process.hrtime.bigint() - request.startHrTime) / 1e9;

const route = request.routeOptions?.url ?? request.url;

const labels = {

    method: request.method,

    route,

    status\_code: reply.statusCode.toString(),

};

httpRequestDuration.labels(labels).observe(durationSeconds);

httpRequestsTotal.labels(labels).inc();

httpRequestsInProgress.labels({ method: request.method }).dec();

});

\`\`\`

\---

**## 5. Phase 3 — Observability**

_> \*\*Estimated time: 3–4 days.\*\*_

\---

**### 3.1 — OpenTelemetry distributed tracing**

\*\*Problem:\*\* When a request fails or is slow, you can see the HTTP duration in Prometheus

and the error in Pino logs — but you cannot see WHERE time was spent within the request

(Prisma query? bcrypt? JWT verification?). Without traces, debugging production issues

means adding temporary logs and redeploying.

\*\*Architecture:\*\* Use OpenTelemetry with OTLP export. Run Jaeger or Tempo locally,

connect to a managed service (Honeycomb, Grafana Cloud) in production.

\*\*Install:\*\*

\`\`\`bash

npm install @opentelemetry/sdk-node \\

@opentelemetry/exporter-trace-otlp-http \\

@opentelemetry/instrumentation-http \\

@opentelemetry/instrumentation-fastify \\

@prisma/instrumentation \\

@opentelemetry/resources \\

@opentelemetry/semantic-conventions

\`\`\`

\*\*Create \`src/telemetry.ts\` — must be imported FIRST in server.ts:\*\*

\`\`\`typescript

_// src/telemetry.ts_

import { NodeSDK } from '@opentelemetry/sdk-node';

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';

import { PrismaInstrumentation } from '@prisma/instrumentation';

import { Resource } from '@opentelemetry/resources';

import { SEMRESATTRS\_SERVICE\_NAME, SEMRESATTRS\_SERVICE\_VERSION } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({

resource: new Resource({

    [SEMRESATTRS\_SERVICE\_NAME]: 'platform-api',

    [SEMRESATTRS\_SERVICE\_VERSION]: process.env.COMMIT\_SHA ?? 'unknown',

}),

traceExporter: new OTLPTraceExporter({

    url: process.env.OTEL\_EXPORTER\_OTLP\_ENDPOINT ?? 'http\://localhost:4318/v1/traces',

}),

instrumentations: [

    new HttpInstrumentation(),

    new FastifyInstrumentation(),

    new PrismaInstrumentation(), *// automatically traces all DB queries*

],

});

_// Start before any other imports — instruments modules as they load_

sdk.start();

_// Flush traces on shutdown_

process.on('beforeExit', async () => {

await sdk.shutdown();

});

\`\`\`

\*\*Update \`src/server.ts\` to import telemetry first:\*\*

\`\`\`typescript

_// MUST be the very first import — instruments Node.js built-ins at load time_

import './telemetry.js';

import { buildApp } from './app.js';

import { logger } from './utils/logger.js';

_// ... rest unchanged_

\`\`\`

\*\*Add trace correlation to Pino logs:\*\*

\`\`\`typescript

_// src/app.ts — add hook to attach traceId to log context_

import { trace } from '@opentelemetry/api';

app.addHook('onRequest', async (request) => {

const span = trace.getActiveSpan();

if (span) {

    const ctx = span.spanContext();

    request.log = request.log.child({

      traceId: ctx.traceId,

      spanId: ctx.spanId,

    });

}

});

\`\`\`

\*\*Add Jaeger to \`docker/docker-compose.yml\`:\*\*

\`\`\`yaml

jaeger:

image: jaegertracing/all-in-one:1.57

container\_name: fastify\_jaeger

ports:

    \- "16686:16686"   *# Jaeger UI*

    \- "4318:4318"     *# OTLP HTTP*

environment:

    \- COLLECTOR\_OTLP\_ENABLED=true

restart: unless-stopped

\`\`\`

Add env var to \`.env.example\`:

\`\`\`bash

OTEL\_EXPORTER\_OTLP\_ENDPOINT=http\://localhost:4318/v1/traces

\`\`\`

\---

**### 3.2 — Prometheus alerting rules**

\*\*Problem:\*\* Prometheus is collecting metrics but there are no alerts. A 5x spike in

500 errors will show up in Grafana eventually — but only if someone is looking.

\*\*Create \`docker/prometheus/alert\_rules.yml\`:\*\*

\`\`\`yaml

groups:

\- name: api.rules

    rules:

_# High error rate — more than 5% of requests are 5xx for 2 minutes_

      \- alert: HighErrorRate

        expr: |

          sum(rate(http\_requests\_total{status\_code=\~"5.."}[5m]))

          /

          sum(rate(http\_requests\_total[5m])) > 0.05

        for: 2m

        labels:

          severity: critical

        annotations:

          summary: "High 5xx error rate"

          description: "{{ $value | humanizePercentage }} of requests are failing"

_# P99 latency above 1 second for 5 minutes_

      \- alert: HighLatencyP99

        expr: |

          histogram\_quantile(0.99,

            sum(rate(http\_request\_duration\_seconds\_bucket[5m])) by (le, route)

          ) > 1.0

        for: 5m

        labels:

          severity: warning

        annotations:

          summary: "High P99 latency on {{ $labels.route }}"

          description: "P99 latency is {{ $value | humanizeDuration }}"

_# Service is down_

      \- alert: ServiceDown

        expr: up{job="platform-api"} == 0

        for: 1m

        labels:

          severity: critical

        annotations:

          summary: "Super Super Admin Platform API is unreachable"

_# Too many active orchestrator operations (potential leak or slowdown)_

      \- alert: OrchestratorOverload

        expr: orchestrator\_active\_operations > 50

        for: 2m

        labels:

          severity: warning

        annotations:

          summary: "High number of concurrent orchestrator operations"

_# Database connection issues (Prisma errors increasing)_

      \- alert: DatabaseErrors

        expr: rate(orchestrator\_pipeline\_errors\_total[5m]) > 0.1

        for: 1m

        labels:

          severity: critical

        annotations:

          summary: "Orchestrator pipeline error rate elevated"

\`\`\`

\*\*Update \`docker/prometheus/prometheus.yml\`:\*\*

\`\`\`yaml

global:

scrape\_interval: 15s

evaluation\_interval: 15s

rule\_files:

\- 'alert\_rules.yml' _# ADD THIS_

scrape\_configs:

\- job\_name: 'fastify'

    static\_configs:

      \- targets: ['host.docker.internal:3000']

    authorization:

      credentials\_file: /etc/prometheus/metrics\_token  *# if METRICS\_TOKEN is set*

\`\`\`

\---

**### 3.3 — Add test coverage thresholds**

\*\*Problem:\*\* There are no coverage thresholds in \`vitest.config.ts\`. Tests can be deleted

or new code added without tests, and CI will still pass.

\*\*Fix in \`vitest.config.ts\`:\*\*

\`\`\`typescript

export default defineConfig({

test: {

    globals: true,

    environment: 'node',

    include: ['src/\*\*/\_\_tests\_\_/\*\*/\*.{test,spec}.ts'],

    coverage: {

      provider: 'v8',

      reporter: ['text', 'json', 'html', 'lcov'],  *// lcov for CI upload*

      exclude: [

        'node\_modules/',

        'dist/',

        '\*\*/\_\_tests\_\_/\*\*',

        '\*.config.ts',

        '\*\*/\*.d.ts',

        'src/utils/test-app.ts',   *// test helper, not app code*

      ],

_// These thresholds cause \`vitest run --coverage\` to exit non-zero_

_// if coverage drops below them — blocks CI merges_

      thresholds: {

        lines:      80,

        functions:  80,

        branches:   75,

        statements: 80,

      },

    },

},

_// ... resolve aliases unchanged_

});

\`\`\`

\---

**## 6. Phase 4 — CI/CD Pipeline**

_> \*\*Estimated time: 1–2 days.\*\*_

\---

**### 4.1 — GitHub Actions CI**

\*\*Problem:\*\* The README references \`.github/workflows/ci.yml\` but this file doesn't exist.

There is no automated verification before merges.

\*\*Create \`.github/workflows/ci.yml\`:\*\*

\`\`\`yaml

name: CI

on:

push:

    branches: [main, develop]

pull\_request:

    branches: [main, develop]

env:

NODE\_VERSION: '20'

jobs:

_# ── Code Quality ─────────────────────────────────────────────────────────────_

quality:

    name: Typecheck, Lint & Format

    runs-on: ubuntu-latest

    steps:

      \- uses: actions/checkout\@v4

      \- uses: actions/setup-node\@v4

        with:

          node-version: ${{ env.NODE\_VERSION }}

          cache: 'npm'

      \- run: npm ci --ignore-scripts

      \- run: npm run typecheck

      \- run: npm run lint

      \- run: npm run format\:check

_# ── Unit & Integration Tests ──────────────────────────────────────────────────_

test:

    name: Test Suite

    runs-on: ubuntu-latest

    services:

      postgres:

        image: postgres:16-alpine

        env:

          POSTGRES\_USER: test

          POSTGRES\_PASSWORD: test

          POSTGRES\_DB: fastify\_test

        ports:

          \- 5432:5432

        options: >-

          \--health-cmd pg\_isready

          \--health-interval 10s

          \--health-timeout 5s

          \--health-retries 5

    env:

      NODE\_ENV: test

      DATABASE\_URL: postgresql://test\:test\@localhost:5432/fastify\_test

      JWT\_SECRET: ci-test-secret-that-is-long-enough-for-hs256-32chars

      METRICS\_ENABLED: false

      SWAGGER\_ENABLED: false

    steps:

      \- uses: actions/checkout\@v4

      \- uses: actions/setup-node\@v4

        with:

          node-version: ${{ env.NODE\_VERSION }}

          cache: 'npm'

      \- run: npm ci

      \- run: npx prisma migrate deploy

      \- run: npm run test\:coverage

      \- name: Upload coverage to Codecov

        uses: codecov/codecov-action\@v4

        with:

          files: ./coverage/lcov.info

          fail\_ci\_if\_error: false  *# don't fail CI if Codecov is down*

_# ── Build Verification ────────────────────────────────────────────────────────_

build:

    name: Build & Docker

    runs-on: ubuntu-latest

    needs: [quality, test]

    steps:

      \- uses: actions/checkout\@v4

      \- uses: actions/setup-node\@v4

        with:

          node-version: ${{ env.NODE\_VERSION }}

          cache: 'npm'

      \- run: npm ci

      \- run: npm run build

      \- name: Verify dist output

        run: ls -la dist/ && test -f dist/server.js

_# Build Docker image and verify it runs_

      \- name: Build Docker image

        run: docker build -t fastify-starter:${{ github.sha }} .

      \- name: Test Docker image starts

        run: |

          docker run -d \\

            \--name test-container \\

            -e DATABASE\_URL=postgresql://x\:x\@localhost/x \\

            -e JWT\_SECRET=test-secret-at-least-32-characters-long \\

            -e NODE\_ENV=production \\

            fastify-starter:${{ github.sha }}

          sleep 3

          \# Should fail to start (no real DB) but not crash on startup code

          docker logs test-container

          docker rm -f test-container

_# ── Security Scanning ─────────────────────────────────────────────────────────_

security:

    name: Security Audit

    runs-on: ubuntu-latest

    steps:

      \- uses: actions/checkout\@v4

      \- uses: actions/setup-node\@v4

        with:

          node-version: ${{ env.NODE\_VERSION }}

          cache: 'npm'

      \- run: npm ci --ignore-scripts

_# Fail on high/critical vulnerabilities_

      \- run: npm audit --audit-level=high

_# Check for secrets accidentally committed_

      \- uses: trufflesecurity/trufflehog\@main

        with:

          path: ./

          base: ${{ github.event.repository.default\_branch }}

          extra\_args: --only-verified

\`\`\`

\---

**### 4.2 — Deployment workflow**

\*\*Create \`.github/workflows/deploy.yml\`:\*\*

\`\`\`yaml

name: Deploy

on:

push:

    branches: [main]

    tags: ['v\*.\*.\*']

jobs:

deploy:

    name: Build & Push Docker Image

    runs-on: ubuntu-latest

    permissions:

      contents: read

      packages: write

    steps:

      \- uses: actions/checkout\@v4

      \- name: Log in to GitHub Container Registry

        uses: docker/login-action\@v3

        with:

          registry: ghcr.io

          username: ${{ github.actor }}

          password: ${{ secrets.GITHUB\_TOKEN }}

      \- name: Extract metadata

        id: meta

        uses: docker/metadata-action\@v5

        with:

          images: ghcr.io/${{ github.repository }}

          tags: |

            type=ref,event=branch

            type=semver,pattern={{version}}

            type=sha,prefix=sha-

      \- name: Build and push

        uses: docker/build-push-action\@v5

        with:

          context: .

          push: true

          tags: ${{ steps.meta.outputs.tags }}

          labels: ${{ steps.meta.outputs.labels }}

          cache-from: type=gha

          cache-to: type=gha,mode=max

_# For Fly.io deployment (optional)_

      \- name: Deploy to Fly.io

        if: github.ref == 'refs/heads/main'

        uses: superfly/flyctl-actions/setup-flyctl\@master

      \- run: flyctl deploy --remote-only

        if: github.ref == 'refs/heads/main'

        env:

          FLY\_API\_TOKEN: ${{ secrets.FLY\_API\_TOKEN }}

\`\`\`

\---

**## 7. Phase 5 — Database Production Readiness**

_> \*\*Estimated time: 1–2 days.\*\*_

\---

**### 5.1 — Fix migration race condition for multi-instance deploys**

\*\*Problem:\*\* \`npm start\` = \`prisma migrate deploy && node dist/server.js\`. When two container

instances start simultaneously (rolling deploy, horizontal scaling), both try to run

migrations. Prisma uses an advisory lock internally for \`migrate deploy\`, so it won't corrupt

data — but one instance will hang waiting for the lock, potentially timing out the deploy.

\*\*Recommended pattern: separate migration job in \`docker-compose.yml\`:\*\*

\`\`\`yaml

_# docker/docker-compose.yml — add migrate service_

services:

migrate:

    image: ${APP\_IMAGE:-fastify-starter\:latest}

    command: npx prisma migrate deploy

    environment:

      DATABASE\_URL: ${DATABASE\_URL}

    depends\_on:

      postgres:

        condition: service\_healthy

    restart: "no"   *# Run once and exit*

app:

    image: ${APP\_IMAGE:-fastify-starter\:latest}

    command: node dist/server.js   *# No migration — handled by migrate service*

    depends\_on:

      migrate:

        condition: service\_completed\_successfully

      postgres:

        condition: service\_healthy

    environment:

      DATABASE\_URL: ${DATABASE\_URL}

      JWT\_SECRET: ${JWT\_SECRET}

      NODE\_ENV: production

      PORT: 3000

    ports:

      \- "3000:3000"

    restart: unless-stopped

    deploy:

      resources:

        limits:

          memory: 512M

          cpus: '1.0'

    healthcheck:

      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider",

             "http\://localhost:3000/api/v1/ready"]

      interval: 30s

      timeout: 10s

      start\_period: 30s

      retries: 3

\`\`\`

\*\*For Kubernetes:\*\* Use an \`initContainer\` for migrations:

\`\`\`yaml

initContainers:

\- name: migrate

    image: your-registry/platform-api\:latest

    command: ["npx", "prisma", "migrate", "deploy"]

    env:

      \- name: DATABASE\_URL

        valueFrom:

          secretKeyRef:

            name: app-secrets

            key: database-url

\`\`\`

\---

**### 5.2 — Add expired refresh token cleanup**

\*\*Problem:\*\* Refresh tokens accumulate in \`refresh\_tokens\` table indefinitely. Every login

creates a new row; tokens that expired 6 months ago are still in the table. At 1000 users

with 10 logins/day, this table has 1.8M rows per month — slowing down lookups even with

indexes.

\*\*Fix — scheduled cleanup in \`src/plugins/prisma.ts\`:\*\*

\`\`\`typescript

_// After prisma is connected and decorated_

_// Run cleanup immediately on startup, then every 24 hours_

const cleanupExpiredTokens = async () => {

try {

    const result = await prisma.refreshToken.deleteMany({

      where: {

        OR: [

          { expiresAt: { lt: new Date() } },           *// expired*

          {

            revokedAt: { lt: new Date(Date.now() - 7 \* 24 \* 60 \* 60 \* 1000) } *// revoked > 7 days ago*

          },

        ],

      },

    });

    if (result.count > 0) {

      fastify.log.info({ count: result.count }, 'Cleaned up expired/revoked refresh tokens');

    }

} catch (err) {

    fastify.log.error({ err }, 'Failed to clean up refresh tokens');

}

};

_// Initial cleanup on startup_

await cleanupExpiredTokens();

_// Schedule recurring cleanup_

const cleanupInterval = setInterval(cleanupExpiredTokens, 24 \* 60 \* 60 \* 1000);

fastify.addHook('onClose', async () => {

clearInterval(cleanupInterval);

await prisma.$disconnect();

});

\`\`\`

\---

**### 5.3 — Add missing indexes**

\*\*Problem:\*\* The \`Example\` model has no indexes. More importantly, for production query

patterns we should verify all common query shapes have covering indexes.

\`\`\`prisma

// Additional indexes to consider based on actual query patterns:

model RefreshToken {

// Existing: @@index([userId]), @@index([token])

// Add: composite for cleanup query

@@index([expiresAt]) // speeds up cleanup DELETE WHERE expiresAt < now()

@@index([family]) // speeds up family-wide revocation

}

model Todo {

// Existing: @@index([userId])

// Add: if listing incomplete todos is common

@@index([userId, completed])

@@index([createdAt]) // for time-based sorting

}

\`\`\`

\---

**### 5.4 — Enforce SSL for production database connections**

\*\*Problem:\*\* The \`DATABASE\_URL\` in \`.env.example\` doesn't include \`sslmode=require\`. In

production, connecting to a managed PostgreSQL service (RDS, Supabase, Neon) without SSL

sends credentials and data in plaintext.

\*\*Add to \`.env.example\`:\*\*

\`\`\`bash

_# Production database — always use SSL_

DATABASE\_URL=postgresql://user\:pass\@host:5432/db?sslmode=require&connection\_limit=10

\`\`\`

\*\*Add SSL enforcement in \`src/plugins/prisma.ts\`:\*\*

\`\`\`typescript

_// Warn loudly if SSL is not configured in production_

if (fastify.config.NODE\_ENV === 'production') {

const dbUrl = fastify.config.DATABASE\_URL;

if (!dbUrl.includes('sslmode=require') && !dbUrl.includes('ssl=true')) {

    fastify.log.warn(

      'DATABASE\_URL does not include sslmode=require. ' +

      'Database connections in production should use SSL.'

    );

}

}

\`\`\`

\---

**## 8. Phase 6 — Infrastructure & Deployment**

_> \*\*Estimated time: 2–3 days.\*\*_

\---

**### 6.1 — Pin Docker image versions**

\*\*Problem:\*\* \`prom/prometheus\:latest\` and \`grafana/grafana\:latest\` in \`docker-compose.yml\`

will silently upgrade on the next \`docker compose pull\`. A Grafana major version update can

break dashboards. A Prometheus update can change metric names.

\*\*Fix:\*\*

\`\`\`yaml

_# docker/docker-compose.yml — pin all image versions_

services:

postgres:

    image: postgres:16.3-alpine  *# explicit patch version*

prometheus:

    image: prom/prometheus\:v2.51.2

grafana:

    image: grafana/grafana:10.4.2

\`\`\`

Update these intentionally and document the upgrade in git history.

\---

**### 6.2 — Remove hardcoded Grafana credentials from docker-compose**

\*\*Problem:\*\* \`GF\_SECURITY\_ADMIN\_PASSWORD=admin\` is hardcoded in the compose file and

likely committed to git. This is a credential that should never be in source control.

\*\*Fix:\*\*

\`\`\`yaml

_# docker/docker-compose.yml_

grafana:

environment:

    \- GF\_SECURITY\_ADMIN\_USER=${GRAFANA\_ADMIN\_USER:-admin}

    \- GF\_SECURITY\_ADMIN\_PASSWORD=${GRAFANA\_ADMIN\_PASSWORD:?GRAFANA\_ADMIN\_PASSWORD must be set}

_# The :? syntax makes docker-compose fail with a clear error if the var is unset_

\`\`\`

Add to \`.env.example\`:

\`\`\`bash

GRAFANA\_ADMIN\_USER=admin

GRAFANA\_ADMIN\_PASSWORD=\<change-this-strong-password>

\`\`\`

\---

**### 6.3 — Add \`restart\` policies to all compose services**

\`\`\`yaml

services:

postgres:

    restart: unless-stopped

prometheus:

    restart: unless-stopped

grafana:

    restart: unless-stopped

app:

    restart: unless-stopped

_# Also add depends\_on so app restarts AFTER postgres is healthy_

    depends\_on:

      postgres:

        condition: service\_healthy

\`\`\`

\---

**### 6.4 — Production environment checklist**

Before any production deploy, verify these environment variables are explicitly set

(not relying on defaults):

\| Variable | Required | Default (safe?) | Production value |

\|---|---|---|---|

\| \`NODE\_ENV\` | ✓ | \`development\` ❌ | \`production\` |

\| \`JWT\_SECRET\` | ✓ | none | \`openssl rand -hex 32\` |

\| \`DATABASE\_URL\` | ✓ | none | Includes \`sslmode=require\` |

\| \`CORS\_ORIGIN\` | ✓ | localhost ❌ | Your actual domain(s) |

\| \`SWAGGER\_ENABLED\` | ✓ | \`false\` ✓ | \`false\` |

\| \`METRICS\_TOKEN\` | ✓ | none | \`openssl rand -hex 20\` |

\| \`LOG\_LEVEL\` | ✓ | \`info\` ✓ | \`warn\` or \`error\` |

\| \`RATE\_LIMIT\_MAX\` | — | \`100\` — tune | Based on load testing |

\---

**## 9. Phase 7 — Scale & Advanced Concerns**

_> These are important for growth but not blocking for initial production launch._

\---

**### 7.1 — JWKS / JWT key rotation**

\*\*Current limitation:\*\* The single \`JWT\_SECRET\` (symmetric HS256) cannot be rotated without

instantly invalidating all active sessions. For a user-facing product this means every

secret rotation is a forced logout of everyone.

\*\*Migration path to RS256 with JWKS:\*\*

1\. Generate an RSA key pair at startup (or load from secrets manager)

2\. Expose \`GET /.well-known/jwks.json\` returning public keys

3\. Sign tokens with the current private key, include \`kid\` (key ID) in header

4\. On rotation: add new key to JWKS, keep old key for verify-only until old tokens expire

5\. Third-party services can verify your JWTs without sharing your secret

\`\`\`typescript

_// This is a significant architectural change — plan for a 2-week sprint_

_// when session management becomes a priority._

\`\`\`

\---

**### 7.2 — API versioning strategy**

\*\*Current state:\*\* Routes are versioned as \`/api/v1/...\` at the URL level. There's no

version negotiation, no deprecation notices, no backward compatibility guarantees.

\*\*For production:\*\*

\- Add \`Sunset\` and \`Deprecation\` response headers on endpoints being phased out

\- Consider \`Accept-Version\` header-based versioning as an alternative to URL versioning

\- Add API version to all response envelopes for client diagnostics

\---

**### 7.3 — Request ID propagation**

\*\*Current state:\*\* Fastify reads \`x-request-id\` from incoming headers and uses it as the

request ID. This is correct for tracing requests across a load balancer. But the request ID

is not forwarded to outgoing HTTP calls or included in orchestrator metrics labels.

\*\*Fix:\*\*

\- When making outbound HTTP calls (if you add them), forward \`x-request-id\`

\- Include request ID in \`OrchestratorMetrics\` labels where relevant

\- Correlate Prometheus metrics with Pino log lines via \`requestId\`

\---

**### 7.4 — Read replica support**

Once database load grows, split reads from writes:

\`\`\`bash

DATABASE\_URL=postgresql://user\:pass\@primary:5432/db

DATABASE\_READ\_URL=postgresql://user\:pass\@replica:5432/db

\`\`\`

\`\`\`typescript

_// src/plugins/prisma.ts_

const readPrisma = new PrismaClient({

datasources: { db: { url: fastify.config.DATABASE\_READ\_URL ?? fastify.config.DATABASE\_URL } }

});

_// Expose both on fastify_

fastify.decorate('prisma', prisma); _// writes_

fastify.decorate('prismRead', readPrisma); _// reads_

\`\`\`

\---

**## 10. Dependency Audit**

**### Immediate actions**

\| Package | Issue | Action |

\|---|---|---|

\| \`prisma\` (devDep) | Version \`^8.0.0-rc.13\` (RC) conflicts with \`@prisma/client@^5.7.1\` | Align both to \`5.22.0\` |

\| \`@fastify/autoload\` | Dependency but never imported | Remove from \`package.json\` |

\| \`pino-pretty\` | In \`dependencies\`, not \`devDependencies\` | Move — never needed in production images |

\*\*Fix \`package.json\`:\*\*

\`\`\`json

{

"dependencies": {

    "@prisma/client": "5.22.0"

_// remove: pino-pretty, @fastify/autoload_

},

"devDependencies": {

    "prisma": "5.22.0",

    "pino-pretty": "^10.3.1"

}

}

\`\`\`

**### Regular hygiene**

\- Run \`npm audit\` in CI (see Phase 4.1 — it's in the CI workflow)

\- Pin exact versions for security-critical packages: \`bcryptjs\`, \`@fastify/jwt\`, \`@fastify/helmet\`

\- Set up Dependabot or Renovate for automated dependency PRs

\---

**## 11. Acceptance Criteria Summary**

Each phase is complete when all of its acceptance criteria pass:

**### Phase 0**

\- [ ] \`git status\` shows \`.env\` as untracked

\- [ ] Docker build context < 5 MB (\`docker build\` takes < 10s on warm cache)

\- [ ] \`kill -SIGTERM \<pid>\` → process logs "draining", waits for in-flight requests, exits 0

\- [ ] \`.env.example\` exists and is committed

**### Phase 1**

\- [ ] \`JWT\_SECRET=short\` → server fails to start with clear error

\- [ ] 6 login attempts in 1 minute → 429 on attempt 6

\- [ ] 5 failed logins → account locked, subsequent attempt returns "account locked" message

\- [ ] \`/metrics\` returns 401 without \`Authorization: Bearer \<METRICS\_TOKEN>\`

\- [ ] \`NODE\_ENV=production SWAGGER\_ENABLED\` not set → \`/documentation\` returns 404

\- [ ] \`curl -I http\://localhost:3000\` includes \`Content-Security-Policy\` header

**### Phase 2**

\- [ ] All request logs for authenticated routes include \`userId\`

\- [ ] Querying a non-existent route logs at \`warn\`, not \`error\`

\- [ ] Prisma query > 500ms logs a warn with query details

\- [ ] Orchestrator errors appear in Pino JSON output (not console.error)

\- [ ] \`GET /api/v1/ready\` returns 503 when database is unavailable

**### Phase 3**

\- [ ] \`npm run test\:coverage\` fails if coverage drops below 80% lines

\- [ ] Request traces visible in Jaeger UI at \`http\://localhost:16686\`

\- [ ] Each trace includes Prisma spans showing query duration

\- [ ] Prometheus alert fires when error rate > 5% for 2 minutes

**### Phase 4**

\- [ ] PRs to \`main\` trigger CI — typecheck, lint, tests, build all required green

\- [ ] Merges to \`main\` trigger Docker image build and push to registry

\- [ ] \`npm audit --audit-level=high\` passes in CI

**### Phase 5**

\- [ ] \`docker compose up\` starts migrate service, waits for it, then starts app

\- [ ] Two simultaneous app starts do NOT cause migration errors

\- [ ] Expired refresh tokens cleaned up on startup and daily

\- [ ] \`DATABASE\_URL\` without \`sslmode\` logs a production warning

**### Phase 6**

\- [ ] No \`latest\` tags in \`docker-compose.yml\`

\- [ ] No hardcoded credentials in \`docker-compose.yml\`

\- [ ] All services have \`restart: unless-stopped\`

\- [ ] Production checklist variables all explicitly set

\---

**## Estimated Timeline**

\| Phase | Work | Who | Days |

\|---|---|---|---|

\| Phase 0 | Immediate blockers | Any engineer | 0.5 |

\| Phase 1 | Security hardening | Backend engineer | 2 |

\| Phase 2 | Reliability | Backend engineer | 2 |

\| Phase 3 | Observability | DevOps or backend | 3 |

\| Phase 4 | CI/CD | DevOps | 1.5 |

\| Phase 5 | Database | Backend engineer | 1.5 |

\| Phase 6 | Infrastructure | DevOps | 1 |

\| Phase 7 | Scale concerns | Team decision | Ongoing |

\| \*\*Total\*\* | | | \*\*\~12 days\*\* |

_> \*\*Minimum viable production deployment:\*\* Phase 0 + Phase 1 + Phase 4 CI pipeline._

_> That's roughly 4 days of work and gets you to a state that is safe to ship._

---

# Super Admin Scope Guardrails — Authoritative

## A. Product boundary

This document is a production-engineering plan for the **Super Admin SaaS
Control Plane**.

```text
super-admin-platform
├── apps/
│   ├── platform-api/
│   └── super-admin/
├── packages/
│   └── api-contracts/
├── prisma/
├── docs/
└── scripts/
```

The production hardening work must preserve this boundary.

## B. Platform API boundary

All platform APIs use:

```text
/api/v1/platform/*
```

The API owns:

```text
Dashboard
Tenants
Platform Users
Platform Roles
Platform Permissions
Provisioning
Plans
Entitlements
Feature Flags
Credentials
Audit
Security
Integrations
Settings
```

## C. No direct Logistics coupling

Never introduce:

```text
Platform API
   ↓
Logistics Prisma Client
```

or:

```text
Platform API
   ↓
Logistics Database
```

or platform modules that directly implement logistics operations.

A future interaction with the Logistics Platform must cross an explicit,
authenticated service/API boundary.

## D. Super Admin security priority

Because this is a SaaS control plane, production hardening must prioritize:

1. Super Admin authentication security
2. Platform RBAC enforcement
3. Tenant lifecycle safety
4. Provisioning reliability
5. Credential protection
6. Audit integrity
7. Platform-wide feature/configuration safety
8. Observability and incident response

## E. High-risk actions

Production controls and audit coverage must explicitly account for:

```text
Tenant creation
Tenant suspension
Tenant archival
Tenant provisioning
Platform user suspension
Platform role/permission changes
SUPER_ADMIN delegation
Credential creation
Credential rotation
Credential revocation
Feature flag changes
Security setting changes
Platform configuration changes
```

## F. Frontend is not the security boundary

The Super Admin frontend may hide actions based on platform permissions, but
the backend must independently enforce every permission.

For example:

```text
platform.credential.rotate
```

must be checked by the Platform API even when the frontend hides the Rotate
button.

## G. Production Definition of Done

The Super Admin platform is production-ready only when:

- [ ] Secrets are excluded from source control and Docker build context.
- [ ] Environment variables are validated at startup.
- [ ] JWT signing/verification is securely pinned.
- [ ] Super Admin authentication is rate-limited and protected against abuse.
- [ ] Refresh-token reuse detection is implemented where required.
- [ ] Platform authorization is permission-based and default-deny.
- [ ] Tenant roles cannot grant `platform.*` permissions.
- [ ] PlatformMembership remains an access gate.
- [ ] Credential secrets are never exposed after creation/rotation.
- [ ] Graceful shutdown drains platform requests correctly.
- [ ] Prisma disconnects cleanly on shutdown.
- [ ] `/metrics` is protected.
- [ ] Swagger is disabled by default in production.
- [ ] CSP/security headers are configured appropriately.
- [ ] Structured logs contain request and platform-user context where safe.
- [ ] Trace IDs correlate logs, metrics, and traces.
- [ ] Platform-specific Prometheus alerts exist.
- [ ] CI validates typecheck, lint, tests, coverage, and builds.
- [ ] Database migrations are controlled and serialized in deployment.
- [ ] No direct Platform API → Logistics DB dependency exists.
- [ ] No logistics operational modules are introduced into Super Admin.
- [ ] Production deployment can be rolled back safely.
- [ ] Audit events exist for sensitive control-plane actions.

## H. Implementation rule

Do not use this production-hardening plan as a reason to introduce unrelated
product features.

Infrastructure/security changes are allowed when they improve the Super Admin
control plane.

Unrelated logistics functionality, tenant operational workflows, or a second
database/API boundary are outside this document unless separately approved.
