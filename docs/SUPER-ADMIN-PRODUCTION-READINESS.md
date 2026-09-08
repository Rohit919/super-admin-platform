**# PRODUCTION\_READINESS.md**

**# Fastify-MasterApp Production Readiness Plan**

\*\*Project:\*\* Fastify-MasterApp

\*\*Scope:\*\* API, Super Admin Frontend, PostgreSQL/Prisma, authentication, RBAC, workers, observability, infrastructure, CI/CD, security, backup/recovery

\*\*Status:\*\* Production-readiness blueprint

\*\*Priority model:\*\* P0 = release blocker, P1 = important before serious production traffic, P2 = scale/hardening, P3 = advanced maturity

\---

**## 1. Purpose**

Production readiness is not a single feature.

A system is production-ready when it can be:

\- deployed predictably

\- configured safely

\- authenticated securely

\- authorized correctly

\- observed during normal operation

\- diagnosed during failures

\- recovered after incidents

\- upgraded without unnecessary downtime

\- tested against critical failure modes

\- operated by people other than the original developer

This document defines the target production-readiness standard for the Super Admin Platform / SaaS Control Plane.

The goal is to move the project from:

\`\`\`text

Works locally

     ↓

Works in CI

     ↓

Works in staging

     ↓

Safe to deploy

     ↓

Observable in production

     ↓

Recoverable in production

     ↓

Scalable in production

\`\`\`

\---

**# 2. Production Readiness Philosophy**

The project should optimize for:

\`\`\`text

Correctness

Security

Reliability

Observability

Recoverability

Maintainability

Operational simplicity

\`\`\`

Do not optimize for:

\`\`\`text

maximum infrastructure

premature microservices

maximum cloud services

maximum Kubernetes complexity

maximum telemetry

\`\`\`

A modular monolith with strong boundaries is preferable to distributed complexity that the team cannot operate confidently.

\---

**# 3. Release Gates**

Every production release must pass these gates:

\`\`\`text

1\. Code quality

2\. Type checking

3\. Unit tests

4\. Integration tests

5\. Contract/API validation

6\. Security checks

7\. Database migration validation

8\. Build validation

9\. Container validation

10\. Staging validation

11\. Observability validation

12\. Rollback readiness

13\. Backup/recovery readiness

14\. Deployment approval

\`\`\`

P0 failures should block production deployment.

\---

**# 4. Production Readiness Scorecard**

Use this high-level scorecard before a release.

\| Area | P0 | P1 | Status |

\|---|---:|---:|---|

\| Application build | Required | Required | ☐ |

\| Configuration | Required | Required | ☐ |

\| Authentication | Required | Required | ☐ |

\| Authorization/RBAC | Required | Required | ☐ |

\| Input validation | Required | Required | ☐ |

\| Database | Required | Required | ☐ |

\| API reliability | Required | Required | ☐ |

\| Super Admin frontend | Required | Required | ☐ |

\| Logging | Required | Required | ☐ |

\| Metrics | Required | Required | ☐ |

\| Health checks | Required | Required | ☐ |

\| Alerts | Required | Required | ☐ |

\| Security | Required | Required | ☐ |

\| CI/CD | Required | Required | ☐ |

\| Backups | Required | Required | ☐ |

\| Restore test | — | Required | ☐ |

\| Load testing | — | Recommended | ☐ |

\| Distributed tracing | — | Recommended | ☐ |

\| Advanced scaling | — | Later | ☐ |

\---

**# 5. Definition of Production Ready**

Fastify-MasterApp is production-ready when:

\`\`\`text

A release can be deployed safely,

the service can be monitored,

failures can be diagnosed,

security controls are enforced,

data can be recovered,

and the team knows how to roll back.

\`\`\`

\---

**# 6. P0 vs P1 vs P2 vs P3**

**## P0 — Release Blocker**

Must be complete before real production traffic.

Examples:

\`\`\`text

authentication

authorization

input validation

secure secrets

database migrations

health checks

structured logging

basic metrics

critical alerts

backup

rollback

CI checks

HTTPS

CORS configuration

rate limiting

security headers

\`\`\`

\---

**## P1 — Strongly Recommended**

Should be complete before significant production usage.

Examples:

\`\`\`text

RBAC administration

audit logs

centralized logs

database dashboards

staging environment

restore testing

load testing

dependency monitoring

runbooks

deployment tracking

\`\`\`

\---

**## P2 — Scale and Maturity**

Implement when usage requires it.

Examples:

\`\`\`text

Redis

BullMQ

distributed tracing

advanced caching

autoscaling

advanced SLOs

multi-instance workers

\`\`\`

\---

**## P3 — Advanced**

Only implement when justified.

Examples:

\`\`\`text

continuous profiling

advanced anomaly detection

multi-region deployment

complex service decomposition

advanced policy engines

\`\`\`

\---

**# 7. Repository Production Baseline**

Expected high-level structure:

\`\`\`text

super-admin-platform/

├── apps/

│ ├── platform-api/

│ └── super-admin/

├── packages/

│ └── api-contracts/

├── prisma/

├── docker/

├── docs/

├── k8s/

├── scripts/

├── .github/

├── package.json

├── pnpm-workspace.yaml

└── README.md

\`\`\`

Production readiness must preserve clear ownership between:

\`\`\`text

Platform API

Super Admin

Shared contracts

Database

Infrastructure

Documentation

Automation

\`\`\`

\---

**# 8. Environment Strategy**

Minimum environments:

\`\`\`text

local

test

staging

production

\`\`\`

Recommended flow:

\`\`\`text

Developer

↓

Local

↓

CI

↓

Staging

↓

Production

\`\`\`

Do not treat production as the first environment where deployment behavior is discovered.

\---

**# 9. Environment Isolation**

Each environment should have isolated:

\`\`\`text

database

credentials

JWT secrets

cookies/session configuration

external service credentials

observability destinations

storage

queues

\`\`\`

Never reuse production secrets in development.

Never point local development at the production database.

\---

**# 10. Configuration Management**

All runtime configuration should come from environment/configuration management.

Examples:

\`\`\`text

NODE\_ENV

PORT

HOST

DATABASE\_URL

JWT\_SECRET

JWT\_EXPIRATION

REFRESH\_TOKEN\_EXPIRATION

API\_PREFIX

API\_VERSION

CORS\_ORIGINS

RATE\_LIMIT\_MAX

RATE\_LIMIT\_WINDOW

METRICS\_ENABLED

SWAGGER\_ENABLED

LOG\_LEVEL

\`\`\`

Only variables actually supported by the application should be introduced.

\---

**# 11. Configuration Validation**

Fail fast at startup when required configuration is invalid.

Example:

\`\`\`text

DATABASE\_URL missing

        ↓

startup fails

JWT\_SECRET too short

        ↓

startup fails

invalid PORT

        ↓

startup fails

\`\`\`

Do not allow invalid production configuration to produce a partially working application.

\---

**# 12. Secrets Management**

Production secrets must not live in:

\`\`\`text

source code

Git history

README files

Docker images

public frontend bundles

logs

\`\`\`

Use a secret-management mechanism appropriate to the deployment environment.

Examples:

\`\`\`text

cloud secret manager

Kubernetes Secret + external secret manager

CI/CD secret store

\`\`\`

\---

**# 13. Secret Rotation**

Plan rotation for:

\`\`\`text

JWT signing secrets

refresh-token signing secrets

database credentials

API keys

third-party credentials

encryption keys

\`\`\`

Rotation should not require emergency source-code changes.

\---

**# 14. Frontend Secret Rule**

The Super Super Admin frontend is a public client.

Never put secrets into:

\`\`\`text

VITE\_\*

\`\`\`

or equivalent browser-exposed environment variables.

Anything bundled into the frontend must be considered public.

\---

**# 15. Node.js Runtime**

Production must use a supported Node.js LTS release.

Pin the expected runtime through:

\`\`\`text

package.json

.nvmrc

mise/asdf

Dockerfile

CI configuration

\`\`\`

The exact mechanism should be standardized across development and deployment.

\---

**# 16. Package Manager**

The project should pin the package manager version.

For pnpm:

\`\`\`text

packageManager

\`\`\`

should identify the expected version.

CI and production builds should use the same package manager version.

\---

**# 17. Dependency Management**

Production dependencies should be:

\`\`\`text

known

reviewed

lockfile-pinned

auditable

regularly updated

\`\`\`

Use the lockfile consistently.

Do not deploy with an unexpected dependency graph.

\---

**# 18. Dependency Security**

CI should check for:

\`\`\`text

known vulnerabilities

malicious packages

outdated critical dependencies

license concerns where relevant

\`\`\`

High-risk vulnerabilities should have a documented decision:

\`\`\`text

fix

upgrade

mitigate

accept temporarily

\`\`\`

\---

**# 19. Type Safety**

The API should pass:

\`\`\`bash

pnpm typecheck

\`\`\`

before deployment.

The Super Super Admin frontend should also pass type checking.

No production release should knowingly contain unresolved TypeScript errors.

\---

**# 20. Linting and Formatting**

CI should enforce:

\`\`\`text

lint

format

typecheck

\`\`\`

The exact commands should follow the repository's package scripts.

Avoid allowing local-only formatting standards that differ from CI.

\---

**# 21. Build Reproducibility**

A production build should be reproducible from:

\`\`\`text

Git commit

lockfile

runtime version

build configuration

\`\`\`

Build artifacts should be traceable to a commit SHA.

\---

**# 22. API Build**

The API build must verify:

\`\`\`text

TypeScript compilation

runtime dependencies

environment handling

generated Prisma client

route registration

startup behavior

\`\`\`

The final container should contain only what is required to run the application.

\---

**# 23. Admin Build**

The Super Admin build must verify:

\`\`\`text

TypeScript

bundling

routing

API configuration

asset generation

environment variables

\`\`\`

The frontend must not accidentally contain:

\`\`\`text

database credentials

JWT secrets

server-only API keys

private infrastructure values

\`\`\`

\---

**# 24. Database Production Readiness**

The database is a critical production dependency.

Requirements:

\`\`\`text

migration strategy

connection management

indexes

constraints

backup

restore

monitoring

capacity planning

\`\`\`

\---

**# 25. Prisma Migration Policy**

Production database changes must use controlled migrations.

Do not use ad-hoc production schema edits.

Migration flow:

\`\`\`text

schema change

    ↓

migration generated

    ↓

migration reviewed

    ↓

CI validation

    ↓

staging

    ↓

production

\`\`\`

\---

**# 26. Migration Safety**

Before production:

\`\`\`text

Does the migration lock a large table?

Does it rewrite existing rows?

Does it require downtime?

Does it require backfill?

Is rollback possible?

\`\`\`

Large changes should use staged migrations.

\---

**# 27. Expand-and-Contract Migration Pattern**

For risky schema changes:

\`\`\`text

Phase A:

Add new column/table

Phase B:

Application supports old + new

Phase C:

Backfill data

Phase D:

Switch reads/writes

Phase E:

Remove old structure

\`\`\`

Avoid destructive one-step migrations for critical data.

\---

**# 28. Database Connection Management**

Production should use bounded connection pools.

Monitor:

\`\`\`text

active connections

idle connections

waiting connections

connection acquisition time

query latency

\`\`\`

Avoid creating a new database connection for every request.

\---

**# 29. Database Indexes**

Indexes should support actual access patterns.

Review:

\`\`\`text

foreign keys

unique lookups

frequent filters

sorting

pagination

RBAC queries

audit log queries

\`\`\`

Avoid indexing every column.

\---

**# 30. Database Constraints**

Use database constraints for important invariants:

\`\`\`text

PRIMARY KEY

UNIQUE

FOREIGN KEY

NOT NULL

CHECK where appropriate

\`\`\`

Application validation is not a substitute for database integrity.

\---

**# 31. Transactions**

Use transactions when multiple changes must succeed or fail together.

Example:

\`\`\`text

Create user

    \+

Assign default role

    \+

Create audit event

\`\`\`

If these form one atomic business operation, transaction boundaries should be explicit.

\---

**# 32. Authentication Readiness**

Authentication must cover:

\`\`\`text

registration

login

access token

refresh token

logout

refresh rotation

revocation

password security

session handling

\`\`\`

\---

**# 33. Password Security**

Passwords must:

\`\`\`text

never be stored plaintext

never be logged

use a strong password hashing algorithm

have controlled reset flows

\`\`\`

Do not invent custom cryptography.

\---

**# 34. JWT Security**

JWT implementation must define:

\`\`\`text

issuer

audience

algorithm

expiration

key/secret management

revocation strategy

refresh rotation

\`\`\`

Validate claims explicitly.

Do not accept arbitrary signing algorithms.

\---

**# 35. Refresh Token Security**

Refresh tokens should support:

\`\`\`text

rotation

reuse detection

revocation

expiration

secure storage

\`\`\`

A detected reuse event should produce a security signal.

\---

**# 36. Authentication Rate Limits**

Protect:

\`\`\`text

login

registration

password reset

refresh

verification

\`\`\`

from automated abuse.

Use appropriate limits and avoid making legitimate users unable to recover accounts.

\---

**# 37. Authorization Readiness**

Authentication answers:

_> Who are you?_

Authorization answers:

_> What are you allowed to do?_

Production readiness requires both.

\---

**# 38. RBAC**

RBAC should enforce:

\`\`\`text

user

role

permission

resource

action

\`\`\`

Example:

\`\`\`text

platform.user.read

platform.user.create

platform.user.update

platform.user.disable

platform.role.read

platform.role.manage

platform.audit.read

\`\`\`

The final permission vocabulary must match the project's RBAC design.

\---

**# 39. Default Deny**

Authorization should follow:

\`\`\`text

No explicit permission

        ↓

Denied

\`\`\`

Never:

\`\`\`text

No permission rule found

        ↓

Allow

\`\`\`

\---

**# 40. IDOR Protection**

Never authorize solely because a user is authenticated.

Bad:

\`\`\`text

GET /users/\:id

\`\`\`

with only:

\`\`\`text

request.user exists

\`\`\`

Correct:

\`\`\`text

request.user

↓

permission

↓

resource ownership/scope

↓

allow/deny

\`\`\`

\---

**# 41. Admin Security**

Super Super Admin routes are high-value targets.

Protect:

\`\`\`text

user management

role management

permission management

audit logs

settings

bulk actions

system operations

\`\`\`

Consider stronger controls for highly privileged actions:

\`\`\`text

MFA

re-authentication

shorter sessions

audit events

IP/device controls where appropriate

\`\`\`

\---

**# 42. Input Validation**

Every external input must be validated.

Validate:

\`\`\`text

body

params

query

headers where necessary

\`\`\`

Use the project's TypeBox/shared-contract architecture.

\---

**# 43. Output Validation**

Sensitive internal fields should never accidentally appear in API responses.

Explicit response schemas should define:

\`\`\`text

allowed fields

types

nullable behavior

\`\`\`

Do not serialize raw Prisma entities blindly.

\---

**# 44. SQL Injection**

Use Prisma parameterized queries.

Do not construct SQL from untrusted strings.

If raw SQL is necessary:

\`\`\`text

review

parameterize

test

restrict permissions

\`\`\`

\---

**# 45. XSS**

Protect both:

\`\`\`text

API

Super Admin frontend

\`\`\`

Controls include:

\`\`\`text

output encoding

safe React rendering

content security policy

input validation

sanitized rich text where required

\`\`\`

Do not render arbitrary HTML by default.

\---

**# 46. Security Headers**

Production API/frontend delivery should use appropriate security headers.

Review:

\`\`\`text

Content-Security-Policy

Strict-Transport-Security

X-Content-Type-Options

Referrer-Policy

Permissions-Policy

Frame protections

\`\`\`

Exact headers depend on deployment architecture.

\---

**# 47. CORS**

Production CORS must use explicit allowed origins.

Avoid:

\`\`\`text

Access-Control-Allow-Origin: \*

\`\`\`

for authenticated browser applications unless there is a deliberate reason and credentials are not involved.

\---

**# 48. HTTPS**

Production traffic must use HTTPS.

Requirements:

\`\`\`text

TLS certificate

HTTP → HTTPS redirect where appropriate

HSTS

secure cookies

\`\`\`

Do not send credentials over plaintext HTTP.

\---

**# 49. Cookies**

If cookies are used for authentication/session material, review:

\`\`\`text

Secure

HttpOnly

SameSite

Domain

Path

Expiration

\`\`\`

Do not expose sensitive cookies to JavaScript unnecessarily.

\---

**# 50. CSRF**

If browser authentication uses cookies, explicitly assess CSRF.

Controls may include:

\`\`\`text

SameSite cookies

CSRF tokens

origin checks

strict CORS

\`\`\`

Do not assume JWT automatically eliminates CSRF.

\---

**# 51. Rate Limiting**

Rate limiting should protect:

\`\`\`text

public endpoints

authentication

sensitive operations

expensive queries

admin operations

\`\`\`

Production deployments with multiple instances should eventually use a shared rate-limit mechanism such as Redis when local in-memory limits are insufficient.

\---

**# 52. Request Size Limits**

Configure limits for:

\`\`\`text

body

headers

URLs

uploads

JSON payloads

\`\`\`

Do not allow unlimited request bodies.

\---

**# 53. File Uploads**

If file uploads are introduced:

\`\`\`text

size limit

type validation

content inspection

safe filename handling

storage isolation

malware scanning where required

download authorization

\`\`\`

Never trust only the client-provided MIME type.

\---

**# 54. API Reliability**

Production API behavior should define:

\`\`\`text

timeouts

error handling

retries

idempotency

transactions

concurrency

dependency failure behavior

\`\`\`

\---

**# 55. Timeouts**

Every external dependency should have a timeout.

Never allow:

\`\`\`text

external request

     ↓

wait indefinitely

     ↓

worker/request pool exhausted

\`\`\`

\---

**# 56. Retries**

Retries should be:

\`\`\`text

bounded

selective

observable

backoff-based

\`\`\`

Do not retry non-idempotent operations blindly.

\---

**# 57. Idempotency**

Critical write operations should support idempotency where duplicate requests are possible.

Example:

\`\`\`text

POST /payments

Idempotency-Key: abc123

\`\`\`

The exact set of idempotent operations depends on business requirements.

\---

**# 58. Graceful Shutdown**

The API must handle termination signals.

Shutdown sequence:

\`\`\`text

receive SIGTERM

    ↓

stop accepting new traffic

    ↓

drain active requests

    ↓

stop workers

    ↓

close database/Redis connections

    ↓

flush logs/telemetry

    ↓

exit

\`\`\`

\---

**# 59. Health and Readiness**

Required endpoints:

\`\`\`text

GET /health

GET /ready

\`\`\`

\`/health\`:

\`\`\`text

process is alive

\`\`\`

\`/ready\`:

\`\`\`text

instance is able to receive traffic

\`\`\`

Do not expose sensitive dependency information.

\---

**# 60. Startup Validation**

Startup should verify:

\`\`\`text

configuration

database connectivity where appropriate

required dependencies

migrations policy

telemetry configuration

\`\`\`

Do not silently start with a broken critical dependency.

\---

**# 61. Observability Baseline**

Production requires:

\`\`\`text

structured logs

request IDs

error logs

metrics

health checks

deployment/version metadata

\`\`\`

Refer to \`OBSERVABILITY.md\` for the complete observability architecture.

\---

**# 62. Logging Requirements**

Production logs must:

\- be structured

\- include timestamps

\- include service/version metadata

\- include request IDs

\- serialize errors consistently

\- redact secrets

\- avoid unnecessary PII

Never log:

\`\`\`text

password

JWT

refresh token

session cookie

API secret

database password

\`\`\`

\---

**# 63. Metrics Requirements**

At minimum:

\`\`\`text

request rate

5xx rate

4xx rate

latency

active requests

process health

database health

\`\`\`

Use bounded metric cardinality.

\---

**# 64. Alert Requirements**

At minimum:

\`\`\`text

API unavailable

high 5xx rate

high latency

database unavailable

critical memory/CPU saturation

\`\`\`

Each critical alert should have:

\`\`\`text

owner

dashboard

runbook

severity

response expectations

\`\`\`

\---

**# 65. Distributed Tracing**

Tracing is recommended once the application has meaningful distributed workflows.

Introduce OpenTelemetry for:

\`\`\`text

Fastify

database

Redis

workers

external services

\`\`\`

Do not block the first production deployment solely on advanced tracing if logs and metrics are already sufficient.

\---

**# 66. Error Tracking**

An error tracking system can be added for:

\`\`\`text

unexpected backend exceptions

frontend JavaScript exceptions

release regressions

stack traces

\`\`\`

Ensure sensitive payloads are filtered before transmission.

\---

**# 67. Audit Logging**

Important administrative/security events should be durable and queryable.

Examples:

\`\`\`text

role changed

permission changed

user disabled

user deleted

password reset

MFA changed

security setting changed

bulk admin action

\`\`\`

Audit logs are not the same as normal application logs.

\---

**# 68. Super Admin Frontend Readiness**

The Super Super Admin frontend must have:

\`\`\`text

authentication

authorization-aware navigation

permission-aware actions

loading states

empty states

error states

form validation

pagination

safe destructive-action confirmation

global error boundary

\`\`\`

\---

**# 69. Admin Authentication**

The frontend must handle:

\`\`\`text

login

session restoration

access-token expiration

refresh

logout

unauthorized response

forbidden response

\`\`\`

Avoid infinite refresh loops.

\---

**# 70. Admin Authorization**

UI permissions improve UX but do not replace API authorization.

Example:

\`\`\`text

Delete button hidden

\`\`\`

does not mean:

\`\`\`text

DELETE /users/\:id

\`\`\`

is secure.

The backend must enforce permissions independently.

\---

**# 71. Admin Destructive Actions**

For dangerous actions:

\`\`\`text

delete

disable

role change

permission change

bulk operation

\`\`\`

require appropriate confirmation.

For especially dangerous actions, consider:

\`\`\`text

re-authentication

typed confirmation

MFA

\`\`\`

\---

**# 72. Admin Error Handling**

The UI should distinguish:

\`\`\`text

400 validation

401 unauthenticated

403 forbidden

404 not found

409 conflict

429 rate limited

500 server error

503 unavailable

\`\`\`

Do not show raw backend stack traces.

\---

**# 73. API Documentation**

Swagger/OpenAPI should accurately represent production APIs.

Documentation should include:

\`\`\`text

authentication

schemas

responses

errors

pagination

authorization expectations

examples

\`\`\`

Do not expose private internal endpoints unintentionally.

\---

**# 74. API Versioning**

Production API routes should use a stable version strategy.

Example:

\`\`\`text

/api/v1

\`\`\`

Breaking changes should not silently change existing contracts.

\---

**# 75. Backward Compatibility**

Before changing an API:

\`\`\`text

Who consumes it?

Is the change breaking?

Can it be additive?

Does Admin depend on it?

Are clients deployed independently?

\`\`\`

Prefer additive changes when practical.

\---

**# 76. Contract Validation**

Shared TypeBox contracts should be tested.

Verify:

\`\`\`text

request schema

response schema

error schema

pagination schema

Admin API client

\`\`\`

Contract drift should fail CI.

\---

**# 77. Testing Pyramid**

Production readiness should use:

\`\`\`text

             E2E

            /   \\

       Integration

          /       \\

       Unit Tests

\`\`\`

Do not rely entirely on E2E tests.

\---

**# 78. Unit Tests**

Cover:

\`\`\`text

business rules

authorization logic

validation

utility functions

error mapping

token logic

\`\`\`

\---

**# 79. Integration Tests**

Cover:

\`\`\`text

Fastify routes

database interaction

authentication

RBAC

transactions

error handling

\`\`\`

The existing integration-test harness should be expanded around production-critical paths.

\---

**# 80. E2E Tests**

Critical Admin flows should include:

\`\`\`text

login

logout

session restoration

user creation

user editing

role assignment

permission denial

audit-log access

critical platform workflow (tenant lifecycle/provisioning)

\`\`\`

\---

**# 81. Security Tests**

At minimum test:

\`\`\`text

unauthenticated access

unauthorized access

IDOR

role escalation

permission bypass

rate limiting

input validation

secret exposure

CORS

security headers

JWT validation

refresh token reuse

\`\`\`

\---

**# 82. RBAC Matrix Tests**

Maintain a matrix:

\| Role | platform.user.read | platform.user.create | platform.user.update | platform.user.disable | platform.role.manage | platform.audit.read |

\|---|---:|---:|---:|---:|---:|---:|

\| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

\| Manager | ✓ | ✓ | ✓ | — | — | ✓ |

\| Operator | ✓ | ✓ | ✓ | — | — | — |

\| Viewer | ✓ | — | — | — | — | — |

The actual roles/permissions must match the project's RBAC specification.

\---

**# 83. Load Testing**

Before meaningful public traffic, load test:

\`\`\`text

authentication

common GET endpoints

common POST endpoints

database-heavy queries

Super Admin workloads

\`\`\`

Measure:

\`\`\`text

RPS

p50

p95

p99

CPU

memory

DB connections

DB latency

error rate

\`\`\`

\---

**# 84. Capacity Planning**

Document approximate limits for:

\`\`\`text

API instances

database connections

database CPU

database storage

Redis memory

queue throughput

worker concurrency

\`\`\`

Capacity numbers should come from testing rather than guesses.

\---

**# 85. Performance Budgets**

Define practical targets.

Example starting targets:

\`\`\`text

simple API p95 < 300–500ms

simple API p99 < 1s

database queries normally < 100–200ms

health check < 100ms

\`\`\`

These are starting targets, not universal requirements.

\---

**# 86. N+1 Detection**

Review common ORM access patterns.

Watch for:

\`\`\`text

fetch users

↓

query roles per user

↓

query permissions per role

\`\`\`

Prefer appropriate:

\`\`\`text

joins

includes

batch queries

preloading

\`\`\`

\---

**# 87. Caching**

Do not introduce caching simply because it sounds faster.

First measure:

\`\`\`text

database bottleneck

latency

traffic

query frequency

\`\`\`

Then cache stable, high-value data.

\---

**# 88. Redis Readiness**

When Redis becomes necessary, define:

\`\`\`text

purpose

key naming

TTL

eviction policy

failure behavior

connection management

security

monitoring

\`\`\`

Possible uses:

\`\`\`text

rate limiting

caching

sessions

BullMQ

distributed locks

\`\`\`

Do not use Redis as an unstructured global data store.

\---

**# 89. Background Worker Readiness**

For asynchronous work define:

\`\`\`text

queue

job type

payload

retry policy

backoff

dead-letter strategy

idempotency

observability

\`\`\`

\---

**# 90. Worker Failure Handling**

Workers must handle:

\`\`\`text

process crash

job timeout

duplicate delivery

retry exhaustion

poison messages

dependency failure

shutdown

\`\`\`

\---

**# 91. Deployment Strategy**

Recommended initial strategy:

\`\`\`text

build

↓

test

↓

push immutable artifact

↓

deploy staging

↓

smoke test

↓

approval

↓

production

↓

health validation

\`\`\`

\---

**# 92. Immutable Artifacts**

Production should deploy a specific build artifact/container image.

Prefer:

\`\`\`text

image: app\@sha256:...

\`\`\`

or an equivalent immutable identifier.

Avoid:

\`\`\`text

latest

\`\`\`

for production deployment references.

\---

**# 93. Container Requirements**

Production containers should:

\- use a minimal base image where practical

\- run as non-root

\- contain no development secrets

\- have predictable startup behavior

\- have health checks

\- use a fixed runtime version

\- avoid unnecessary packages

\---

**# 94. Dockerfile Security**

Review:

\`\`\`text

USER

COPY scope

dependency installation

lockfile use

build cache

runtime image

exposed ports

environment variables

\`\`\`

Do not copy:

\`\`\`text

.git

.env

node\_modules from host

development secrets

test artifacts

\`\`\`

unless explicitly required.

\---

**# 95. Kubernetes Readiness**

If Kubernetes is used, validate:

\`\`\`text

Deployment

Service

Ingress

ConfigMap

Secrets

readinessProbe

livenessProbe

resources

PodDisruptionBudget where needed

NetworkPolicy where needed

\`\`\`

Do not introduce Kubernetes complexity if the deployment platform already provides sufficient managed capabilities.

\---

**# 96. Resource Requests and Limits**

Define realistic:

\`\`\`text

CPU request

CPU limit

memory request

memory limit

\`\`\`

based on load testing.

Memory limits should not be so low that normal GC causes OOM kills.

\---

**# 97. Autoscaling**

Only introduce HPA after measuring:

\`\`\`text

CPU

memory

RPS

latency

queue depth

\`\`\`

For worker processes, queue depth may be more useful than CPU alone.

\---

**# 98. Zero-Downtime Deployment**

If required by the production environment:

\`\`\`text

old instances

     \+

new instances

     ↓

readiness passes

     ↓

traffic shifts

     ↓

old instances drain

\`\`\`

Database migrations must be compatible with mixed application versions during rollout.

\---

**# 99. Rollback Strategy**

Every deployment needs a rollback path.

Possible rollback:

\`\`\`text

deploy previous immutable image

\`\`\`

Do not assume:

\`\`\`text

git revert

\`\`\`

is sufficient for a production incident.

\---

**# 100. Database Rollback**

Application rollback and database rollback are different.

Avoid destructive migrations that make application rollback impossible.

Prefer:

\`\`\`text

expand

deploy

migrate data

switch

contract later

\`\`\`

\---

**# 101. Deployment Smoke Tests**

After deployment verify:

\`\`\`text

/health

/ready

authentication

one protected API endpoint

database interaction

Super Admin login

critical Super Admin route

metrics

logs

\`\`\`

\---

**# 102. Post-Deployment Validation**

Watch:

\`\`\`text

5xx

latency

authentication failures

database errors

resource utilization

worker failures

browser errors

\`\`\`

Compare against the previous release.

\---

**# 103. Deployment Observability**

Record:

\`\`\`text

deployment ID

version

commit SHA

environment

start time

end time

result

\`\`\`

This should appear in observability dashboards.

\---

**# 104. CI/CD Pipeline**

Recommended pipeline:

\`\`\`text

Install

↓

Lint

↓

Typecheck

↓

Unit tests

↓

Integration tests

↓

Contract tests

↓

Security scan

↓

Build API

↓

Build Admin

↓

Build container

↓

Container scan

↓

Publish artifact

↓

Deploy staging

↓

Smoke tests

↓

Production approval

↓

Deploy production

↓

Post-deploy checks

\`\`\`

\---

**# 105. CI Security**

CI should include:

\`\`\`text

secret scanning

dependency scanning

SAST where practical

container scanning

lockfile validation

permissions review

\`\`\`

CI tokens should use least privilege.

\---

**# 106. GitHub Actions Security**

If GitHub Actions is used:

\`\`\`text

pin important third-party actions appropriately

minimize permissions

avoid exposing secrets to pull requests

separate untrusted code from privileged deployment jobs

protect production environments

\`\`\`

\---

**# 107. Branch Protection**

Production repositories should protect the primary branch.

Recommended:

\`\`\`text

required CI

pull request review

no direct push

status checks

\`\`\`

Exact policy depends on team size.

\---

**# 108. Release Process**

A release should include:

\`\`\`text

version

commit

changes

migration notes

risk notes

rollback plan

deployment owner

validation checklist

\`\`\`

\---

**# 109. Changelog**

Maintain meaningful release notes.

Include:

\`\`\`text

features

bug fixes

security fixes

breaking changes

migration requirements

operational changes

\`\`\`

\---

**# 110. Backups**

Production database backups are mandatory.

Define:

\`\`\`text

frequency

retention

encryption

storage location

access control

restore procedure

\`\`\`

\---

**# 111. Backup Monitoring**

Monitor:

\`\`\`text

last successful backup

backup age

backup failure

backup duration

backup storage

\`\`\`

An unmonitored backup system can fail silently.

\---

**# 112. Restore Testing**

A backup is not proven until restored.

Test periodically:

\`\`\`text

backup

↓

restore into isolated environment

↓

run integrity checks

↓

run application smoke tests

\`\`\`

\---

**# 113. RPO and RTO**

Define:

**### RPO**

How much data loss is acceptable?

\`\`\`text

RPO = 15 minutes

\`\`\`

means the organization can tolerate losing up to approximately 15 minutes of data in the defined disaster scenario.

**### RTO**

How quickly must service recover?

\`\`\`text

RTO = 1 hour

\`\`\`

These are examples only.

\---

**# 114. Disaster Recovery**

Document:

\`\`\`text

database loss

region/provider outage

credential compromise

container image compromise

accidental data deletion

bad migration

\`\`\`

For each scenario define:

\`\`\`text

detection

mitigation

recovery

validation

communication

\`\`\`

\---

**# 115. Data Deletion Safety**

Destructive operations should consider:

\`\`\`text

soft delete

retention

audit

backup

authorization

recovery

\`\`\`

Permanent deletion should be deliberate.

\---

**# 116. Operational Runbooks**

Create:

\`\`\`text

docs/runbooks/

├── deployment.md

├── rollback.md

├── api-high-error-rate.md

├── api-high-latency.md

├── database-outage.md

├── database-connection-exhaustion.md

├── migration-failure.md

├── authentication-outage.md

├── redis-outage.md

├── worker-failure.md

├── backup-restore.md

└── security-incident.md

\`\`\`

\---

**# 117. Incident Response**

Incident lifecycle:

\`\`\`text

Detect

↓

Acknowledge

↓

Assess

↓

Mitigate

↓

Recover

↓

Validate

↓

Communicate

↓

Postmortem

\`\`\`

\---

**# 118. Incident Severity**

Example:

**### SEV-1**

\`\`\`text

service unavailable

major security incident

significant data integrity issue

\`\`\`

**### SEV-2**

\`\`\`text

major feature degraded

high error rate

serious performance degradation

\`\`\`

**### SEV-3**

\`\`\`text

limited feature failure

minor degradation

\`\`\`

Actual definitions should be adapted to business impact.

\---

**# 119. Postmortems**

For meaningful incidents document:

\`\`\`text

summary

impact

timeline

root cause

detection

mitigation

resolution

what went well

what went poorly

action items

owners

deadlines

\`\`\`

Avoid blame.

\---

**# 120. Operational Ownership**

Every production-critical component should have an owner.

Examples:

\`\`\`text

Platform API

Super Admin

Database

Authentication

RBAC

Observability

CI/CD

Infrastructure

\`\`\`

\---

**# 121. On-Call Readiness**

The on-call engineer should have access to:

\`\`\`text

dashboards

logs

alerts

runbooks

deployment controls

rollback procedure

database recovery procedure

incident communication channel

\`\`\`

\---

**# 122. Documentation Readiness**

At minimum, maintain:

\`\`\`text

README.md

ARCHITECTURE.md

API\_CONVENTIONS.md

SECURITY.md

RBAC.md

ADMIN\_FRONTEND.md

OBSERVABILITY.md

ROADMAP.md

PRODUCTION\_READINESS.md

\`\`\`

Recommended operational docs:

\`\`\`text

DEPLOYMENT.md

DATABASE.md

TESTING.md

INCIDENT\_RESPONSE.md

\`\`\`

\---

**# 123. README Production Section**

The README should clearly explain:

\`\`\`text

how to run locally

how to test

how to build

how to configure

how to deploy

where health checks live

where metrics live

where Swagger lives

\`\`\`

Avoid undocumented operational knowledge.

\---

**# 124. Production Checklist — Application**

\- [ ] Build succeeds.

\- [ ] Typecheck succeeds.

\- [ ] Lint succeeds.

\- [ ] Unit tests pass.

\- [ ] Integration tests pass.

\- [ ] Contract tests pass.

\- [ ] Critical E2E tests pass.

\- [ ] No debug mode enabled.

\- [ ] No development credentials configured.

\- [ ] Configuration validation works.

\- [ ] Graceful shutdown works.

\---

**# 125. Production Checklist — Security**

\- [ ] HTTPS enabled.

\- [ ] Secrets stored securely.

\- [ ] JWT configuration reviewed.

\- [ ] Refresh rotation enabled.

\- [ ] Password hashing verified.

\- [ ] RBAC enforced server-side.

\- [ ] IDOR tests pass.

\- [ ] CORS restricted.

\- [ ] Security headers enabled.

\- [ ] Rate limits configured.

\- [ ] Request size limits configured.

\- [ ] Sensitive logs redacted.

\- [ ] Super Admin operations audited.

\---

**# 126. Production Checklist — Database**

\- [ ] Production database isolated.

\- [ ] Migrations tested.

\- [ ] Migration compatibility reviewed.

\- [ ] Indexes reviewed.

\- [ ] Constraints reviewed.

\- [ ] Connection pool configured.

\- [ ] Slow queries monitored.

\- [ ] Backups enabled.

\- [ ] Backup monitoring enabled.

\- [ ] Restore test completed.

\---

**# 127. Production Checklist — Observability**

\- [ ] Structured logs enabled.

\- [ ] Request IDs enabled.

\- [ ] Metrics enabled.

\- [ ] Health endpoint works.

\- [ ] Readiness endpoint works.

\- [ ] API dashboard exists.

\- [ ] Database dashboard exists.

\- [ ] Critical alerts exist.

\- [ ] Alerts have runbooks.

\- [ ] Deployment version is visible.

\- [ ] Secrets are absent from telemetry.

\---

**# 128. Production Checklist — Admin**

\- [ ] Super Admin login works.

\- [ ] Session restoration works.

\- [ ] Logout works.

\- [ ] Unauthorized users are redirected safely.

\- [ ] Forbidden actions are handled.

\- [ ] RBAC-aware navigation works.

\- [ ] Destructive actions require confirmation.

\- [ ] Global error boundary exists.

\- [ ] Production API URL is correct.

\- [ ] No secrets are bundled into the frontend.

\---

**# 129. Production Checklist — Deployment**

\- [ ] CI passes.

\- [ ] Production artifact is immutable.

\- [ ] Image is scanned.

\- [ ] Staging deployment succeeds.

\- [ ] Smoke tests pass.

\- [ ] Migration plan approved.

\- [ ] Rollback plan documented.

\- [ ] Production deployment approved.

\- [ ] Post-deployment checks pass.

\---

**# 130. Production Checklist — Recovery**

\- [ ] Backup exists.

\- [ ] Backup is recent.

\- [ ] Backup is monitored.

\- [ ] Restore procedure is documented.

\- [ ] Restore has been tested.

\- [ ] RPO is defined.

\- [ ] RTO is defined.

\- [ ] Disaster recovery owner exists.

\---

**# 131. Pre-Production Test Matrix**

\| Test | Local | CI | Staging | Production |

\|---|---:|---:|---:|---:|

\| Typecheck | ✓ | ✓ | — | — |

\| Lint | ✓ | ✓ | — | — |

\| Unit | ✓ | ✓ | — | — |

\| Integration | ✓ | ✓ | ✓ | — |

\| E2E | Optional | ✓ | ✓ | Smoke only |

\| Security | Optional | ✓ | ✓ | Monitoring |

\| Migration | ✓ | ✓ | ✓ | Controlled |

\| Load test | — | — | ✓ | Monitoring |

\| Backup restore | — | — | ✓ | Periodic |

\| Health | ✓ | ✓ | ✓ | ✓ |

\---

**# 132. Staging Environment**

Staging should resemble production enough to catch:

\`\`\`text

configuration errors

migration errors

container errors

routing errors

authentication errors

Super Admin/API integration errors

resource issues

\`\`\`

It does not need to be identical in scale.

\---

**# 133. Staging Data**

Prefer:

\`\`\`text

synthetic data

anonymized data

purpose-built test fixtures

\`\`\`

Do not copy production personal data into staging unless there is a documented, controlled reason.

\---

**# 134. Production Data Access**

Developers should not automatically have unrestricted production database access.

Prefer:

\`\`\`text

least privilege

read-only where possible

audited access

temporary elevation

break-glass procedures

\`\`\`

\---

**# 135. Production Debugging**

When debugging production:

Prefer:

\`\`\`text

logs

metrics

traces

read-only diagnostics

safe feature flags

\`\`\`

Avoid:

\`\`\`text

editing database rows manually

enabling verbose secrets logging

disabling security controls

running arbitrary scripts

\`\`\`

\---

**# 136. Feature Flags**

Feature flags can reduce release risk.

Useful for:

\`\`\`text

new Admin features

new business workflows

migration transitions

experimental behavior

gradual rollout

\`\`\`

Flags must have:

\`\`\`text

owner

default

scope

expiration/review date

\`\`\`

Avoid permanent flag accumulation.

\---

**# 137. Canary Releases**

For higher-risk releases:

\`\`\`text

deploy small percentage

      ↓

observe

      ↓

increase traffic

      ↓

complete rollout

\`\`\`

Use when operational scale justifies it.

\---

**# 138. Blue/Green Deployment**

For high availability requirements:

\`\`\`text

Blue = current

Green = new

validate Green

      ↓

switch traffic

      ↓

monitor

      ↓

rollback to Blue if needed

\`\`\`

This adds infrastructure complexity and should be introduced only when justified.

\---

**# 139. Security Incident Readiness**

Prepare for:

\`\`\`text

credential leak

account takeover

JWT compromise

admin compromise

database exposure

dependency compromise

malicious deployment

\`\`\`

Define:

\`\`\`text

who responds

how credentials are revoked

how sessions are invalidated

how affected users are identified

how evidence is preserved

\`\`\`

\---

**# 140. Credential Compromise Procedure**

Example:

\`\`\`text

1\. Confirm compromise.

2\. Rotate affected credential.

3\. Revoke impacted sessions/tokens.

4\. Identify affected resources.

5\. Inspect audit logs.

6\. Inspect deployments.

7\. Validate new credentials.

8\. Document incident.

\`\`\`

\---

**# 141. JWT Secret Compromise**

If JWT signing credentials are compromised:

\`\`\`text

1\. Rotate signing material.

2\. Decide token invalidation strategy.

3\. Force reauthentication if necessary.

4\. Revoke refresh tokens as appropriate.

5\. Inspect suspicious activity.

6\. Deploy updated configuration.

\`\`\`

Do not treat JWT secret rotation as an ordinary application restart.

\---

**# 142. Dependency Failure Strategy**

For each critical dependency decide:

\`\`\`text

fail open?

fail closed?

retry?

queue?

fallback?

degrade feature?

return 503?

\`\`\`

Example:

\`\`\`text

Analytics unavailable

        ↓

queue analytics event

        ↓

continue core request

\`\`\`

versus:

\`\`\`text

Authorization service unavailable

        ↓

deny protected operation

\`\`\`

The correct behavior depends on security and business impact.

\---

**# 143. Failure Mode Review**

For every critical subsystem ask:

\`\`\`text

What if it is slow?

What if it is unavailable?

What if it returns invalid data?

What if it times out?

What if it returns duplicate data?

What if it crashes?

What if it is compromised?

\`\`\`

Document expected behavior.

\---

**# 144. Production Readiness Review Meeting**

Before first production launch, review:

\`\`\`text

Architecture

Security

Database

Authentication

RBAC

Admin

Observability

Deployment

Backup

Recovery

Incident response

\`\`\`

The review should end with:

\`\`\`text

GO

GO WITH CONDITIONS

NO-GO

\`\`\`

\---

**# 145. Launch Criteria**

A launch should be \*\*NO-GO\*\* if any of these are unresolved:

\`\`\`text

critical authentication vulnerability

critical authorization bypass

known destructive migration problem

no production backup

no rollback path

no health checks

no critical error visibility

unvalidated production secrets

known severe data integrity issue

\`\`\`

\---

**# 146. Launch Criteria — Conditional**

A launch may be allowed with documented conditions for:

\`\`\`text

advanced tracing

advanced caching

large-scale autoscaling

non-critical UI polish

advanced profiling

non-critical analytics

\`\`\`

These should not block a small initial deployment unless requirements demand them.

\---

**# 147. First Production Launch Plan**

Recommended sequence:

\`\`\`text

1\. Freeze release candidate.

2\. Run full CI.

3\. Deploy staging.

4\. Run migrations in staging.

5\. Run smoke/E2E tests.

6\. Validate dashboards.

7\. Validate alerts.

8\. Validate backup.

9\. Verify rollback artifact.

10\. Approve release.

11\. Deploy production.

12\. Run health checks.

13\. Run smoke tests.

14\. Monitor closely.

15\. Record release result.

\`\`\`

\---

**# 148. First 24 Hours**

After initial launch, monitor more closely.

Watch:

\`\`\`text

5xx

p95/p99 latency

database connections

CPU

memory

authentication failures

RBAC denials

rate limits

Admin errors

worker failures

\`\`\`

Avoid unrelated infrastructure changes during the initial observation period.

\---

**# 149. First Week**

Review:

\`\`\`text

top endpoints

top errors

slowest queries

authentication failures

Admin errors

resource utilization

traffic patterns

alert quality

\`\`\`

Use actual production data to tune thresholds.

\---

**# 150. First Month**

Review:

\`\`\`text

SLO candidates

capacity

database indexes

slow queries

cache opportunities

worker throughput

security events

backup/restore

operational pain points

\`\`\`

Convert recurring manual work into automation where valuable.

\---

**# 151. Production Maturity Levels**

**## Level 0 — Local**

\`\`\`text

runs locally

basic tests

\`\`\`

**## Level 1 — Deployable**

\`\`\`text

CI

build

configuration

container

staging

\`\`\`

**## Level 2 — Production Safe**

\`\`\`text

security

health

logs

metrics

backup

rollback

\`\`\`

**## Level 3 — Production Operable**

\`\`\`text

dashboards

alerts

runbooks

audit

incident response

restore testing

\`\`\`

**## Level 4 — Scalable**

\`\`\`text

Redis

workers

tracing

autoscaling

capacity planning

SLOs

\`\`\`

**## Level 5 — Mature Platform**

\`\`\`text

advanced reliability

multi-region where justified

advanced security controls

automated recovery

continuous optimization

\`\`\`

\---

**# 152. Recommended Roadmap Alignment**

Production readiness should follow the project's existing roadmap:

\`\`\`text

Foundation

↓

API conventions

↓

Configuration

↓

Database

↓

Authentication

↓

Security baseline

↓

RBAC

↓

Admin foundation

↓

Audit logs

↓

Testing

↓

Observability

↓

Deployment

↓

Backup/recovery

↓

Redis/workers

↓

Scaling

\`\`\`

Do not implement scale infrastructure before the security and correctness foundations are stable.

\---

**# 153. Production Architecture Target**

\`\`\`text

                         INTERNET

                            │

                            ▼

                    ┌───────────────┐

                    │ Load Balancer │

                    │ TLS / WAF     │

                    └───────┬───────┘

                            │

                ┌───────────┴───────────┐

                ▼                       ▼

        ┌───────────────┐       ┌───────────────┐

        │ Fastify API   │       │ Fastify API   │

        │ instance 1    │       │ instance 2    │

        └───────┬───────┘       └───────┬───────┘

                │                       │

                └───────────┬───────────┘

                            ▼

                    ┌───────────────┐

                    │ PostgreSQL    │

                    │ managed/HA    │

                    └───────────────┘

                    Optional later:

                    ┌───────────────┐

                    │ Redis         │

                    └───────┬───────┘

                            │

                    ┌───────┴───────┐

                    ▼               ▼

                 Worker 1        Worker 2

Observability:

API ───────► Logs

API ───────► Metrics ─────► Prometheus/Grafana

API ───────► Traces

Admin ─────► Error telemetry

Security:

secrets ───► Secret Manager

CI ────────► Security scanning

Audit ─────► Durable audit store

\`\`\`

\---

**# 154. Minimal Production Architecture**

For an initial deployment, the architecture can remain simpler:

\`\`\`text

Internet

↓

HTTPS / Load Balancer

↓

Fastify API

↓

PostgreSQL

Super Admin Frontend

↓

Fastify API

Observability

├── logs

├── metrics

└── dashboards

Backup

↓

isolated backup storage

\`\`\`

Do not require Redis, workers, Kubernetes, or distributed tracing until their value is demonstrated.

\---

**# 155. Recommended Technology Progression**

\`\`\`text

Stage 1

Fastify

PostgreSQL

Prisma

Pino

Prometheus

Grafana

React Admin

Stage 2

Redis

BullMQ

centralized logs

alerts

Stage 3

OpenTelemetry

distributed tracing

advanced dashboards

Stage 4

autoscaling

advanced caching

capacity management

Stage 5

multi-region / service decomposition

only if business scale requires it

\`\`\`

\---

**# 156. What Not to Do**

Avoid:

\`\`\`text

Deploying without rollback

Deploying without backups

Using latest container tags

Logging JWTs

Putting secrets in frontend environment variables

Allowing frontend-only RBAC

Running destructive migrations without a plan

Using production DB for development

Making every dependency mandatory for readiness

Adding unlimited metric labels

Alerting on every error

Building microservices prematurely

\`\`\`

\---

**# 157. Final Production Readiness Checklist**

**## Application**

\- [ ] Build reproducible.

\- [ ] Type-safe.

\- [ ] Lint clean.

\- [ ] Tests pass.

\- [ ] Graceful shutdown implemented.

\- [ ] Timeouts configured.

\- [ ] Errors standardized.

**## Security**

\- [ ] HTTPS.

\- [ ] Secure secrets.

\- [ ] Authentication secure.

\- [ ] Refresh rotation.

\- [ ] RBAC enforced.

\- [ ] IDOR protected.

\- [ ] CORS restricted.

\- [ ] Security headers.

\- [ ] Rate limiting.

\- [ ] Request limits.

\- [ ] Logs redacted.

**## Database**

\- [ ] Migrations reviewed.

\- [ ] Constraints verified.

\- [ ] Indexes reviewed.

\- [ ] Pool configured.

\- [ ] Backups enabled.

\- [ ] Restore tested.

\- [ ] Monitoring enabled.

**## Admin**

\- [ ] Login.

\- [ ] Logout.

\- [ ] Session restoration.

\- [ ] RBAC UI.

\- [ ] Error handling.

\- [ ] Destructive confirmations.

\- [ ] No secrets in bundle.

**## Observability**

\- [ ] Structured logs.

\- [ ] Request IDs.

\- [ ] Metrics.

\- [ ] Health.

\- [ ] Readiness.

\- [ ] Dashboards.

\- [ ] Alerts.

\- [ ] Runbooks.

\- [ ] Deployment correlation.

**## Deployment**

\- [ ] CI.

\- [ ] Security scans.

\- [ ] Immutable artifact.

\- [ ] Staging.

\- [ ] Smoke tests.

\- [ ] Rollback.

\- [ ] Post-deploy validation.

**## Recovery**

\- [ ] Backup.

\- [ ] Backup monitoring.

\- [ ] Restore test.

\- [ ] RPO.

\- [ ] RTO.

\- [ ] Disaster recovery plan.

\---

**# 158. Final Definition of Done**

Fastify-MasterApp should not be considered production-ready merely because:

\`\`\`text

the API works

\`\`\`

It should be considered production-ready when:

\`\`\`text

                 ┌────────────────────┐

                 │     CORRECT        │

                 └─────────┬──────────┘

                           ↓

                 ┌────────────────────┐

                 │      SECURE        │

                 └─────────┬──────────┘

                           ↓

                 ┌────────────────────┐

                 │     TESTED         │

                 └─────────┬──────────┘

                           ↓

                 ┌────────────────────┐

                 │    OBSERVABLE      │

                 └─────────┬──────────┘

                           ↓

                 ┌────────────────────┐

                 │    DEPLOYABLE      │

                 └─────────┬──────────┘

                           ↓

                 ┌────────────────────┐

                 │   RECOVERABLE      │

                 └─────────┬──────────┘

                           ↓

                 ┌────────────────────┐

                 │    OPERABLE        │

                 └─────────┬──────────┘

                           ↓

                 ┌────────────────────┐

                 │     SCALABLE       │

                 └────────────────────┘

\`\`\`

The core production principle is:

_> \*\*Do not make production the environment where the team discovers how the system behaves.\*\*_

A strong Fastify-MasterApp production deployment should make the important paths predictable, the dangerous paths protected, failures visible, releases reversible, and data recoverable.

Build the platform in this order:

\`\`\`text

Correctness

    ↓

Security

    ↓

Authorization

    ↓

Testing

    ↓

Observability

    ↓

Deployment

    ↓

Recovery

    ↓

Scale

\`\`\`

This order keeps Fastify-MasterApp operationally simple while creating a foundation capable of growing into a serious production application.

---

# 150. Super Admin Product Boundary — Authoritative

## 150.1 Product identity

This document is for the **Super Admin SaaS Control Plane**, not the Logistics
Tenant Admin / operational application.

The Super Admin platform manages the SaaS itself:

```text
Super Admin
    ↓
SaaS / Platform Control Plane
    ↓
Platform API
    ↓
Platform DB

    ├── Tenants
    ├── Tenant lifecycle
    ├── Provisioning
    ├── Plans
    ├── Entitlements
    ├── Feature Flags
    ├── Platform Users
    ├── Platform Roles
    ├── Platform Permissions
    ├── Credentials
    ├── Audit
    ├── Security
    ├── Integrations
    └── Platform Settings
```

## 150.2 Operational-plane exclusion

The Super Admin production-readiness scope must not introduce or directly
operate:

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
Logistics operational reports
```

Those belong to the separate Logistics/Tenant Admin platform.

## 150.3 Tenant boundary

Super Admin may manage a tenant's **platform metadata and lifecycle**:

```text
Tenant
├── Overview
├── Lifecycle
├── Plan & Entitlements
├── Provisioning
├── Configuration
├── Branding
├── API Credentials
├── Integrations
├── Usage
├── Security
└── Audit
```

It must not become a tenant's operational dashboard.

## 150.4 Platform RBAC

Authorization must follow:

```text
Platform User
    ↓
Platform Membership
    ↓
Platform Role
    ↓
Platform Permissions
    ↓
Allowed Platform Action
```

Platform permissions should use an explicit namespace such as:

```text
platform.dashboard.read

platform.tenant.read
platform.tenant.create
platform.tenant.update
platform.tenant.activate
platform.tenant.suspend
platform.tenant.archive

platform.user.read
platform.user.create
platform.user.update
platform.user.disable

platform.role.read
platform.role.manage

platform.permission.read

platform.audit.read
platform.security.read

platform.settings.read
platform.settings.update

platform.feature_flag.manage
platform.entitlement.manage
platform.credentials.manage
```

Tenant-operational permissions such as `shipment.read`, `driver.update`, or
`dispatch.manage` are outside the Super Admin authorization surface.

## 150.5 Platform API boundary

The canonical platform API namespace is:

```text
/api/v1/platform/*
```

Production tests must verify that platform endpoints enforce platform
permissions server-side.

The frontend is not a security boundary.

## 150.6 Platform security priorities

Production hardening should prioritize:

1. Super Admin authentication
2. Platform RBAC
3. Tenant lifecycle safety
4. Provisioning reliability
5. Credential protection
6. Audit integrity
7. Feature-flag and entitlement safety
8. Platform configuration safety
9. Observability
10. Disaster recovery

High-risk control-plane actions should be auditable, including:

```text
Tenant creation
Tenant suspension
Tenant archival
Tenant provisioning
Platform user disablement
Platform role/permission changes
Credential creation
Credential rotation
Credential revocation
Feature flag changes
Entitlement changes
Security setting changes
Platform configuration changes
```

## 150.7 Database boundary

The current database is the **Platform DB**.

Do not create a second Logistics DB merely to satisfy this production-readiness
document.

Do not introduce:

```text
Platform API
    ↓
Logistics Prisma Client
```

or:

```text
Platform API
    ↓
Logistics DB
```

A future Platform → Logistics interaction must use a separately authenticated
API/service boundary once the Logistics Platform actually exists.

## 150.8 Super Admin production Definition of Done

The platform is production-ready when:

- [ ] Platform authentication is secure and rate-limited.
- [ ] Password reset and OTP flows are protected.
- [ ] Refresh-token rotation/revocation behavior is tested.
- [ ] Platform RBAC is permission-based and default-deny.
- [ ] PlatformMembership is enforced as an access gate.
- [ ] Tenant operational permissions cannot grant platform permissions.
- [ ] Sensitive platform actions are audited.
- [ ] Tenant lifecycle operations are idempotent where required.
- [ ] Provisioning failures are observable and recoverable.
- [ ] Platform API secrets are never exposed to the browser.
- [ ] Tenant API credentials are protected and audited.
- [ ] `/api/v1/platform/*` contracts are validated in CI.
- [ ] Platform DB migrations are reviewed and deployable safely.
- [ ] Platform health/readiness checks are available.
- [ ] Metrics, structured logs, alerts, and traces provide control-plane visibility.
- [ ] Super Admin frontend contains no database/server secrets.
- [ ] CI builds both `platform-api` and `super-admin`.
- [ ] Production artifacts are immutable.
- [ ] Backup and restore procedures are tested.
- [ ] Rollback procedures are documented.
- [ ] No direct Platform API → Logistics DB dependency exists.
- [ ] No logistics operational modules are introduced into Super Admin.

## 150.9 Scope-control rule

Production-readiness work may improve reliability, security, testing,
observability, deployment, recovery, and maintainability of the Super Admin
control plane.

It must not silently expand product scope into the Logistics operational plane,
replace the Platform DB with an artificial second database, or introduce
cross-platform coupling without explicit architectural approval.
