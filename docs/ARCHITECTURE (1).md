# ARCHITECTURE.md

# Fastify-MasterApp Architecture

**Project:** Fastify-MasterApp  
**Architecture style:** TypeScript monorepo + modular monolith API + React Admin SPA  
**Primary backend:** Fastify  
**Database:** PostgreSQL + Prisma  
**Contracts:** TypeBox shared schemas  
**Authentication:** JWT access/refresh token model  
**Authorization:** RBAC  
**Observability:** Pino + Prometheus + Grafana, with OpenTelemetry as the evolution path  
**Status:** Target architecture and implementation guide

---

# 1. Purpose

This document defines the architecture of Fastify-MasterApp.

It explains:

- what the major components are
- why they exist
- how they communicate
- where business logic belongs
- how authentication and authorization work
- how the Admin frontend communicates with the API
- how persistence is isolated
- how shared contracts are used
- how background processing can be introduced
- how observability fits into the system
- how the system should evolve without unnecessary complexity

The central architectural objective is:

> **Keep the application modular, strongly typed, secure, observable, and easy to evolve while preserving the simplicity of a modular monolith.**

---

# 2. Architecture Summary

Fastify-MasterApp should be treated as a **modular monolith with a separate Admin frontend**.

At a high level:

```text
                         ┌─────────────────────┐
                         │      Browser        │
                         │                     │
                         │ React Admin SPA     │
                         └──────────┬──────────┘
                                    │ HTTPS
                                    ▼
                         ┌─────────────────────┐
                         │     Fastify API    │
                         │                     │
                         │ Routes              │
                         │ Validation          │
                         │ Auth                │
                         │ RBAC                │
                         │ Services            │
                         │ Orchestrators       │
                         │ Repositories        │
                         └──────────┬──────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  ▼                 ▼                 ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
          │ PostgreSQL   │  │ Redis        │  │ External     │
          │ + Prisma     │  │ optional     │  │ Services     │
          └──────────────┘  └──────┬───────┘  └──────────────┘
                                   │
                                   ▼
                           ┌──────────────┐
                           │ Background   │
                           │ Workers      │
                           └──────────────┘

Observability:

API ─────────► Pino logs
API ─────────► Prometheus metrics
API ─────────► OpenTelemetry traces
Admin ───────► frontend telemetry
                     │
                     ▼
              Grafana / telemetry
```

---

# 3. Core Architectural Decision

## 3.1 Modular monolith

The backend should remain a modular monolith until there is a demonstrated reason to split services.

This means:

```text
One deployable API
        +
Clear internal modules
        +
Explicit boundaries
        +
Shared database
```

rather than:

```text
20 microservices
20 deployments
20 CI pipelines
20 sets of logs
20 network boundaries
```

The modular monolith gives the project:

- lower operational complexity
- easier local development
- simpler transactions
- simpler debugging
- easier testing
- lower infrastructure cost
- clear future extraction boundaries

---

# 4. Why Not Microservices First?

Microservices solve specific organizational and scaling problems.

They also introduce:

```text
network failures
service discovery
distributed tracing
deployment coordination
data ownership problems
eventual consistency
more infrastructure
more operational burden
```

Fastify-MasterApp should first prove:

```text
business boundaries
traffic patterns
team boundaries
scaling requirements
dependency boundaries
```

before extracting services.

---

# 5. Architecture Principles

The project follows these principles:

```text
1. Explicit boundaries
2. Strong typing
3. Secure by default
4. Validate at boundaries
5. Business logic outside routes
6. Persistence behind repositories
7. Authentication separate from authorization
8. Shared API contracts
9. Observable production behavior
10. Prefer simple infrastructure
11. Test critical paths
12. Design for future extraction without prematurely extracting
```

---

# 6. Repository Structure

Recommended repository structure:

```text
Fastify-MasterApp/
│
├── apps/
│   ├── api/
│   │   └── src/
│   │
│   └── admin/
│       └── src/
│
├── packages/
│   └── api-contracts/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│
├── docker/
│
├── k8s/
│
├── docs/
│
├── scripts/
│
├── .github/
│
├── .kiro/
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

# 7. Monorepo Responsibilities

| Area                     | Responsibility                             |
| ------------------------ | ------------------------------------------ |
| `apps/api`               | Fastify backend                            |
| `apps/super-admin`       | React Super Admin frontend                 |
| `packages/api-contracts` | Shared API schemas/types                   |
| `prisma`                 | Database schema/migrations                 |
| `docker`                 | Local/container infrastructure             |
| `k8s`                    | Kubernetes deployment resources            |
| `docs`                   | Architecture and operational documentation |
| `scripts`                | Developer/CI automation                    |
| `.kiro`                  | Development specifications/plans           |

---

# 8. Dependency Direction

Dependencies should generally flow inward toward stable abstractions.

Preferred:

```text
HTTP
 ↓
Route
 ↓
Service / Orchestrator
 ↓
Repository
 ↓
Prisma
 ↓
PostgreSQL
```

Contracts sit at the API boundary:

```text
Route
  ↕
API Contract
```

The Admin frontend consumes the same contract definitions where practical.

---

# 9. Backend Layering

The API should use the following conceptual layers:

```text
┌──────────────────────────────┐
│ HTTP / Fastify Routes        │
├──────────────────────────────┤
│ Validation / Serialization   │
├──────────────────────────────┤
│ Authentication / RBAC        │
├──────────────────────────────┤
│ Services / Orchestrators     │
├──────────────────────────────┤
│ Domain Rules                 │
├──────────────────────────────┤
│ Repositories                │
├──────────────────────────────┤
│ Prisma                       │
├──────────────────────────────┤
│ PostgreSQL                   │
└──────────────────────────────┘
```

---

# 10. Route Layer

Routes are responsible for HTTP concerns.

Routes should handle:

```text
method
URL
schemas
authentication hooks
authorization hooks
request extraction
response serialization
HTTP status codes
```

Routes should not contain complex business workflows.

Bad:

```text
route handler
    ↓
validate
    ↓
query database
    ↓
calculate business rules
    ↓
send email
    ↓
write audit log
    ↓
return response
```

Preferred:

```text
route
  ↓
service/orchestrator
  ↓
repositories/dependencies
```

---

# 11. Validation Layer

External data must be validated before entering business logic.

Sources include:

```text
request body
path parameters
query parameters
headers
external API responses where required
```

TypeBox is the preferred contract/validation mechanism.

---

# 12. Serialization

Responses should use explicit schemas.

Do not return arbitrary database objects directly.

Example:

```text
Prisma User
    ↓
Service
    ↓
Response DTO
    ↓
TypeBox response schema
    ↓
JSON
```

This prevents accidental exposure of:

```text
password hashes
internal metadata
security fields
tokens
private columns
```

---

# 13. Service Layer

Services contain reusable business operations.

Examples:

```text
UserService
AuthService
TodoService
RoleService
PermissionService
AuditService
```

Services should be usable from:

```text
HTTP routes
background jobs
internal workflows
future event consumers
```

without depending on Fastify request/response objects.

---

# 14. Orchestrator Layer

The Golden Orchestrator pattern should coordinate multi-step workflows.

Example:

```text
CreateUserOrchestrator

1. Validate business rules
2. Check authorization
3. Check uniqueness
4. Create user
5. Assign default role
6. Create audit event
7. Trigger optional async work
8. Return result
```

The orchestrator should coordinate.

It should not become a giant god object.

---

# 15. Service vs Orchestrator

Use a **service** when the operation is focused:

```text
user.findById
user.update
role.find
permission.list
```

Use an **orchestrator** when multiple operations form a workflow:

```text
user.createWithRole
order.complete
password.reset
admin.bulkDisableUsers
```

---

# 16. Repository Layer

Repositories isolate persistence operations.

Examples:

```text
UserRepository
RoleRepository
PermissionRepository
TodoRepository
AuditRepository
```

Repositories should know about:

```text
Prisma
database queries
transactions where appropriate
query composition
persistence errors
```

Repositories should not know about:

```text
HTTP
Fastify
UI
cookies
React
HTTP status codes
```

---

# 17. Prisma Boundary

Prisma should remain primarily behind the repository/data-access boundary.

Preferred:

```text
Service
   ↓
Repository
   ↓
Prisma
```

Avoid allowing every module to directly call Prisma everywhere.

This makes:

- testing easier
- persistence behavior more consistent
- future database changes safer
- query optimization easier
- transaction boundaries clearer

---

# 18. Database Ownership

The PostgreSQL database is shared by the modular monolith.

Logical ownership should still exist.

Example:

```text
Auth module
  └── authentication/session tables

User module
  └── user tables

RBAC module
  └── roles/permissions

Audit module
  └── audit events

Business module
  └── domain tables
```

Modules should not casually modify tables owned by other modules.

---

# 19. Module Structure

Recommended backend module pattern:

```text
modules/
├── auth/
│   ├── auth.routes.ts
│   ├── auth.service.ts
│   ├── auth.schemas.ts
│   ├── auth.types.ts
│   └── auth.repository.ts
│
├── users/
│   ├── users.routes.ts
│   ├── users.service.ts
│   ├── users.schemas.ts
│   ├── users.types.ts
│   └── users.repository.ts
│
├── rbac/
│   ├── rbac.routes.ts
│   ├── rbac.service.ts
│   ├── rbac.schemas.ts
│   ├── rbac.types.ts
│   └── rbac.repository.ts
│
└── audit/
    ├── audit.routes.ts
    ├── audit.service.ts
    ├── audit.schemas.ts
    └── audit.repository.ts
```

Exact naming can evolve with project conventions.

---

# 20. Module Boundaries

A module should expose a small public surface.

For example:

```text
users/
    public:
        createUser()
        getUser()
        updateUser()

    internal:
        query construction
        persistence details
        mapping
```

Other modules should not depend on internal implementation details.

---

# 21. Cross-Module Communication

Preferred:

```text
Module A
   ↓
Module B public service
```

Avoid:

```text
Module A
   ↓
Module B repository internals
```

This keeps boundaries meaningful.

---

# 22. Circular Dependencies

Avoid:

```text
User → Role → User
```

at the code/module level.

If two modules need each other heavily, reconsider the boundary.

Possible solutions:

```text
shared domain abstraction
orchestrator
domain event
interface
```

---

# 23. Dependency Injection

Dependencies should be explicit.

Conceptually:

```text
UserService(
    userRepository,
    roleService,
    auditService
)
```

rather than hidden global state.

Benefits:

```text
testability
clarity
replaceability
```

---

# 24. Fastify Plugin Architecture

Fastify plugins should be used for infrastructure concerns.

Examples:

```text
logger
database
JWT
authentication
metrics
Swagger
CORS
security headers
rate limiting
request context
```

Plugins should initialize dependencies before modules use them.

---

# 25. Plugin Registration Order

Conceptually:

```text
environment/config
        ↓
logger
        ↓
core Fastify plugins
        ↓
database
        ↓
security
        ↓
JWT/auth
        ↓
metrics
        ↓
Swagger
        ↓
application modules
        ↓
server start
```

Actual ordering should follow dependency requirements.

---

# 26. Configuration Architecture

Configuration should be centralized.

Conceptually:

```text
Environment
    ↓
Config parser
    ↓
Validation
    ↓
Typed config object
    ↓
Application
```

Avoid reading `process.env` throughout business code.

---

# 27. Configuration Rules

Business code should prefer:

```text
config.jwt.secret
```

over:

```text
process.env.JWT_SECRET
```

This gives:

- centralized validation
- easier testing
- predictable startup behavior
- fewer configuration surprises

---

# 28. Authentication Architecture

Authentication establishes identity.

Flow:

```text
Client
  ↓
POST /auth/login
  ↓
Validate credentials
  ↓
Load user
  ↓
Verify password
  ↓
Create access token
  ↓
Create/rotate refresh token
  ↓
Return session
```

---

# 29. Access Token

Access tokens should be:

```text
short-lived
signed
validated on every protected request
```

They should contain only claims required for authentication/authorization decisions.

Avoid putting sensitive application data into JWT payloads.

---

# 30. Refresh Token

Refresh tokens should support:

```text
rotation
expiration
revocation
reuse detection
```

Flow:

```text
Refresh token
      ↓
validate
      ↓
check session/revocation
      ↓
rotate
      ↓
new access token
      ↓
new refresh token
```

---

# 31. Authentication vs Authorization

These must remain separate.

Authentication:

```text
Who is this?
```

Authorization:

```text
What may this identity do?
```

Architecture:

```text
Request
  ↓
Authenticate
  ↓
Identify actor
  ↓
Authorize
  ↓
Execute business operation
```

---

# 32. RBAC Architecture

RBAC is based on:

```text
User
  ↓
Role
  ↓
Permission
```

Example:

```text
User: Alice
Role: Admin
Permissions:
    users.read
    users.create
    users.update
    users.delete
    roles.update
```

---

# 33. RBAC Enforcement

Authorization must be enforced on the API.

Example:

```text
DELETE /api/v1/users/:id
        ↓
authenticate
        ↓
require users.delete
        ↓
check resource scope
        ↓
service
```

Frontend permission checks are only UX controls.

---

# 34. Resource Authorization

Permission alone may not always be sufficient.

Example:

```text
users.update
```

may allow updating users only within a tenant, organization, or ownership scope.

Authorization can therefore become:

```text
identity
+
permission
+
resource scope
+
business policy
```

---

# 35. Default Deny

The authorization system should use:

```text
No explicit permission
        ↓
DENY
```

not:

```text
No rule
        ↓
ALLOW
```

---

# 36. API Architecture

API routes should follow:

```text
/api/v1/<resource>
```

Examples:

```text
GET    /api/v1/users
GET    /api/v1/users/:id
POST   /api/v1/users
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id
```

Follow `API_CONVENTIONS.md` for detailed naming/status/pagination/error rules.

---

# 37. API Response Architecture

Successful responses should be consistent.

Conceptual:

```json
{
  "data": {
    "id": "user_123"
  }
}
```

Collection:

```json
{
  "data": [],
  "meta": {
    "nextCursor": "..."
  }
}
```

Errors:

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found",
    "requestId": "req_123"
  }
}
```

Exact response envelopes must follow `API_CONVENTIONS.md`.

---

# 38. Error Architecture

Errors should flow:

```text
Database/Dependency error
        ↓
Repository
        ↓
Service
        ↓
Domain/application error
        ↓
Fastify error handler
        ↓
Safe API response
```

Do not expose:

```text
stack traces
SQL
database connection details
internal file paths
secrets
```

in normal production responses.

---

# 39. Error Codes

Use stable machine-readable error codes.

Examples:

```text
AUTH_INVALID_CREDENTIALS
AUTH_TOKEN_EXPIRED
AUTH_REFRESH_REUSE_DETECTED
FORBIDDEN
USER_NOT_FOUND
USER_ALREADY_EXISTS
VALIDATION_ERROR
RATE_LIMITED
INTERNAL_ERROR
```

The exact catalog should be maintained consistently.

---

# 40. Request Lifecycle

A protected API request should conceptually follow:

```text
Incoming HTTP request
        ↓
Request ID
        ↓
Logging context
        ↓
CORS/security checks
        ↓
Rate limiting
        ↓
Authentication
        ↓
Validation
        ↓
Authorization
        ↓
Route handler
        ↓
Service/orchestrator
        ↓
Repository
        ↓
Prisma
        ↓
PostgreSQL
        ↓
Domain result
        ↓
Response schema
        ↓
HTTP response
        ↓
Metrics/logging
```

Not every endpoint requires every step in exactly this order.

---

# 41. Admin Frontend Architecture

The Admin frontend is a separate React application.

Conceptually:

```text
React Router
     ↓
Page
     ↓
Feature
     ↓
TanStack Query
     ↓
Typed API Client
     ↓
Fastify API
```

Supporting concerns:

```text
Zustand
forms
validation
RBAC UI
error boundaries
telemetry
```

---

# 42. Admin Folder Structure

Recommended:

```text
apps/admin/src/
├── app/
│   ├── router/
│   ├── providers/
│   └── layout/
│
├── components/
│
├── features/
│   ├── auth/
│   ├── users/
│   ├── roles/
│   ├── permissions/
│   ├── audit/
│   └── dashboard/
│
├── lib/
│   ├── api/
│   ├── auth/
│   ├── permissions/
│   ├── errors/
│   └── telemetry/
│
├── hooks/
├── stores/
├── routes/
└── main.tsx
```

---

# 43. Admin State Management

Use the right tool for the right state.

### TanStack Query

For:

```text
server state
API data
caching
refetching
mutation state
```

### Zustand

For:

```text
UI state
local preferences
navigation state
temporary client state
```

Avoid duplicating server data into global client state unnecessarily.

---

# 44. Admin API Client

The Admin frontend should use a centralized typed API client.

Responsibilities:

```text
base URL
authentication
request headers
request IDs
error mapping
response parsing
refresh handling
```

Feature components should not independently construct raw `fetch()` requests everywhere.

---

# 45. Shared API Contracts

`packages/api-contracts` should define shared API boundaries.

Conceptually:

```text
TypeBox schema
      ↓
API validation
      +
API response serialization
      +
Admin TypeScript types
```

This reduces contract drift.

---

# 46. Contract Ownership

Contracts describe the external API.

They should not become a dumping ground for:

```text
database models
internal service types
business implementation details
```

Keep API DTOs separate from persistence entities.

---

# 47. DTO vs Database Model

Do not assume:

```text
Prisma User = API User
```

Instead:

```text
Prisma model
    ↓
Domain/service representation
    ↓
API DTO
```

This protects the API from database implementation changes.

---

# 48. Database Architecture

PostgreSQL is the source of truth for transactional application data.

Prisma provides:

```text
schema modeling
querying
migrations
type-safe database access
```

The database provides:

```text
durability
transactions
constraints
indexes
consistency
```

---

# 49. Transaction Boundaries

Transactions should be owned by the business operation.

Example:

```text
Create user transaction
├── insert user
├── assign role
└── write audit event
```

The service/orchestrator should define the atomic boundary.

---

# 50. Concurrency

Production code should consider:

```text
duplicate requests
race conditions
unique constraints
optimistic concurrency
pessimistic locking where necessary
idempotency
```

Database constraints should remain the final integrity boundary.

---

# 51. Pagination

Collection APIs should support a consistent pagination strategy.

Preferred for large/dynamic datasets:

```text
cursor pagination
```

Example:

```text
GET /users?limit=50&cursor=...
```

Offset pagination can be acceptable for small/static datasets.

---

# 52. Filtering and Sorting

Filtering should be explicit.

Example:

```text
GET /users?
    status=active
    &role=admin
    &sort=-createdAt
    &limit=50
```

Do not pass arbitrary database field names directly into queries.

Allowlist sortable/filterable fields.

---

# 53. Bulk Operations

Admin APIs may require:

```text
bulk activate
bulk disable
bulk delete
bulk role assignment
```

Bulk operations should:

```text
validate input
authorize operation
limit batch size
be observable
be auditable
handle partial failure deliberately
```

---

# 54. Background Processing

The application can introduce Redis + BullMQ when asynchronous processing is required.

Architecture:

```text
API
 ↓
enqueue job
 ↓
Redis
 ↓
BullMQ
 ↓
Worker
 ↓
external service / database
```

Use workers for:

```text
email
notifications
heavy processing
exports
imports
scheduled tasks
retryable external operations
```

---

# 55. Job Idempotency

A worker must tolerate duplicate execution where possible.

Example:

```text
job received
   ↓
check idempotency key
   ↓
already processed?
   ├── yes → exit safely
   └── no  → process
```

---

# 56. Worker Shutdown

Workers should support graceful shutdown:

```text
stop accepting new jobs
        ↓
finish safe active jobs
        ↓
close Redis
        ↓
flush telemetry
        ↓
exit
```

---

# 57. Redis Architecture

Redis should have a clearly defined purpose.

Potential uses:

```text
distributed rate limiting
cache
BullMQ
short-lived coordination
distributed locks where justified
```

Avoid storing authoritative business data in Redis unless the architecture explicitly requires it.

---

# 58. External Services

External APIs should be accessed through dedicated clients/adapters.

Example:

```text
PaymentService
    ↓
PaymentProviderClient
```

Business logic should not directly construct HTTP calls throughout the codebase.

---

# 59. External Dependency Resilience

Every important external dependency should define:

```text
timeout
retry policy
failure behavior
observability
circuit breaker if appropriate
```

---

# 60. Observability Architecture

Observability is a cross-cutting architectural concern.

Three primary pillars:

```text
Logs
Metrics
Traces
```

Plus:

```text
Alerts
Dashboards
Runbooks
```

---

# 61. Logging

Pino should provide structured production logs.

Every important request should be correlated with:

```text
requestId
```

When tracing is enabled:

```text
traceId
spanId
```

Sensitive fields must be redacted.

---

# 62. Metrics

Prometheus should collect bounded metrics.

Core metrics:

```text
request rate
error rate
latency
active requests
runtime
database
workers
dependencies
```

Never use arbitrary:

```text
userId
email
requestId
```

as high-cardinality metric labels.

---

# 63. Health Architecture

Two core concepts:

```text
/health
    ↓
process is alive

/ready
    ↓
instance can receive traffic
```

Health checks should not leak infrastructure secrets.

---

# 64. Tracing

OpenTelemetry should be introduced as distributed workflows grow.

Example:

```text
HTTP request
   ↓
service
   ↓
database
   ↓
Redis
   ↓
external API
```

Trace context should propagate across these boundaries.

---

# 65. Security Architecture

Security follows defense in depth:

```text
TLS
 ↓
network controls
 ↓
security headers
 ↓
CORS
 ↓
rate limiting
 ↓
authentication
 ↓
authorization
 ↓
validation
 ↓
database constraints
 ↓
audit
 ↓
observability
```

No single layer should be considered sufficient.

---

# 66. Trust Boundaries

Important trust boundaries:

```text
Browser → API
API → database
API → Redis
API → external services
CI/CD → deployment platform
Admin → privileged APIs
Worker → external services
```

Each boundary needs appropriate validation and authentication.

---

# 67. Data Classification

Conceptually classify data as:

```text
Public
Internal
Sensitive
Highly sensitive
```

Telemetry, API responses, logs, and database access should respect classification.

---

# 68. Sensitive Data

Never expose sensitive data through:

```text
frontend bundle
logs
metrics
errors
Swagger examples
API responses
```

unless explicitly required and protected.

---

# 69. Audit Architecture

Audit logs should capture high-value administrative/security events.

Example:

```text
actor
action
resource
resourceId
timestamp
requestId
result
```

Example:

```json
{
  "actorId": "user_123",
  "action": "role.updated",
  "resourceType": "user",
  "resourceId": "user_456",
  "requestId": "req_123"
}
```

---

# 70. Audit vs Logs

Application logs:

```text
diagnostic
```

Audit events:

```text
durable accountability
```

They should not be treated as interchangeable.

---

# 71. API Security Boundary

The API must assume:

```text
client can be modified
frontend can be bypassed
requests can be forged
headers can be manipulated
URLs can be changed
```

Therefore:

```text
all authorization must be server-side
all external input must be validated
```

---

# 72. Admin Security Boundary

The Admin UI should assume users may attempt:

```text
direct API requests
browser manipulation
hidden-route access
modified frontend state
```

Therefore:

```text
UI restrictions = usability
API restrictions = security
```

---

# 73. Deployment Architecture

Initial production architecture can remain simple:

```text
                    Internet
                       │
                       ▼
                HTTPS / Load Balancer
                       │
                       ▼
                ┌───────────────┐
                │ Fastify API   │
                └───────┬───────┘
                        │
                        ▼
                 ┌─────────────┐
                 │ PostgreSQL  │
                 └─────────────┘
```

Add:

```text
Redis
workers
autoscaling
tracing
```

as requirements emerge.

---

# 74. Container Architecture

The API should run as an immutable container.

Requirements:

```text
non-root user
minimal runtime image
pinned dependencies
no secrets in image
health checks
graceful shutdown
```

---

# 75. Kubernetes Architecture

If Kubernetes is used:

```text
Ingress
   ↓
Service
   ↓
Deployment
   ↓
API Pods
   ↓
PostgreSQL
```

Use:

```text
readinessProbe
livenessProbe
resources
secrets
network policies
```

where appropriate.

---

# 76. CI/CD Architecture

CI should validate:

```text
code
types
tests
contracts
security
build
container
```

CD should handle:

```text
artifact
staging
smoke test
approval
production
post-deploy validation
```

---

# 77. Immutable Deployment

Every production deployment should identify:

```text
version
commit SHA
artifact/image
environment
```

Never depend on an ambiguous mutable artifact such as:

```text
latest
```

---

# 78. Deployment Flow

```text
Git commit
   ↓
CI
   ├── lint
   ├── typecheck
   ├── tests
   ├── security
   └── build
        ↓
Immutable artifact
        ↓
Staging
        ↓
Smoke tests
        ↓
Approval
        ↓
Production
        ↓
Health checks
        ↓
Monitoring
```

---

# 79. Database Migration Deployment

Application and schema compatibility must be considered together.

Preferred:

```text
expand
  ↓
deploy compatible application
  ↓
backfill
  ↓
switch behavior
  ↓
contract
```

Avoid destructive migrations that prevent rollback.

---

# 80. Backup Architecture

Production PostgreSQL should have:

```text
automated backups
retention
encryption
monitoring
restore testing
```

Backups should be isolated from the primary environment.

---

# 81. Disaster Recovery

Recovery architecture should define:

```text
RPO
RTO
backup location
restore process
database recovery
application redeployment
DNS/traffic recovery
credential recovery
```

---

# 82. Scalability Strategy

Scale in this order:

```text
1. Optimize code
2. Optimize database queries
3. Add indexes
4. Add API replicas
5. Add caching
6. Add background workers
7. Add Redis where useful
8. Add autoscaling
9. Split services only when justified
```

---

# 83. Horizontal API Scaling

Fastify API instances should ideally be stateless.

Shared state should move to:

```text
PostgreSQL
Redis
external storage
```

rather than local process memory.

---

# 84. Stateless Authentication Considerations

If access tokens are stateless, multiple API instances can validate them independently.

Refresh sessions/revocation may still require shared persistence.

This enables:

```text
API instance 1
API instance 2
API instance 3
```

without sticky sessions.

---

# 85. Caching Strategy

Caching should be introduced only after identifying:

```text
high-read workload
expensive query
stable data
acceptable staleness
```

Cache entries require:

```text
key
TTL
invalidation strategy
failure behavior
```

---

# 86. Performance Architecture

Performance should be measured across:

```text
browser
network
Fastify
business logic
database
external services
workers
```

Do not optimize only one layer.

---

# 87. N+1 Prevention

Watch ORM patterns such as:

```text
query users
for each user:
    query role
```

Prefer:

```text
batch query
include
join
preload
```

when appropriate.

---

# 88. API Performance

Keep route handlers lightweight.

Preferred:

```text
parse
validate
authorize
delegate
serialize
```

Avoid large synchronous CPU work in request handlers.

---

# 89. Event Loop Safety

Node.js performance depends on keeping the event loop responsive.

Avoid:

```text
large synchronous loops
synchronous filesystem operations
CPU-heavy encryption in request path
huge JSON processing
```

Move expensive work to workers when necessary.

---

# 90. Business Events

When useful, the architecture can emit domain events.

Example:

```text
user.created
order.completed
role.changed
```

These events can eventually feed:

```text
notifications
analytics
audit processing
workers
integration systems
```

Do not introduce an event bus for every operation.

---

# 91. Eventual Consistency

Asynchronous processing introduces eventual consistency.

For example:

```text
Create order
   ↓
transaction commits
   ↓
job queued
   ↓
notification sent later
```

The API should clearly define what is synchronous and what is asynchronous.

---

# 92. Consistency Boundaries

Use PostgreSQL transactions for operations requiring strong consistency.

Use background jobs for operations where delayed completion is acceptable.

Example:

```text
Create user → synchronous
Send welcome email → asynchronous
```

---

# 93. Testing Architecture

Testing should exist at multiple levels.

```text
Unit
  ↓
Integration
  ↓
Contract
  ↓
E2E
  ↓
Load
  ↓
Security
```

---

# 94. Unit Testing

Test:

```text
business rules
authorization policies
services
utility functions
mapping
validation rules
```

---

# 95. Integration Testing

Test:

```text
Fastify routes
database
authentication
RBAC
transactions
error handling
```

Use a controlled test database or suitable integration harness.

---

# 96. Contract Testing

Verify:

```text
API schema
request schema
response schema
Admin API client
error formats
pagination
```

Contract drift should fail CI.

---

# 97. E2E Testing

Critical flows:

```text
login
logout
user management
role assignment
permission denial
audit log
core business workflow
```

---

# 98. Security Testing

Test:

```text
authentication bypass
authorization bypass
IDOR
RBAC escalation
JWT validation
refresh reuse
rate limiting
input injection
secret exposure
CORS
headers
```

---

# 99. Architecture Testing

Consider automated checks for:

```text
route → service
service → repository
repository → Prisma
```

and prevent:

```text
UI → Prisma
route → arbitrary DB logic
module → another module's repository internals
```

---

# 100. Dependency Rules

Recommended:

```text
Route
  may depend on:
    service
    contract
    auth infrastructure

Service
  may depend on:
    repository
    other public services
    domain utilities

Repository
  may depend on:
    Prisma

Domain/business logic
  must not depend on:
    React
    Fastify response objects
    HTTP status codes
```

---

# 101. Shared Package Rules

`packages/api-contracts` should contain:

```text
TypeBox schemas
API DTO types
shared enums
API-specific contract helpers
```

It should not contain:

```text
database access
Fastify plugins
React components
business services
secrets
```

---

# 102. Admin/API Coupling

The Admin frontend is allowed to depend on API contracts.

The API must not depend on Admin implementation.

Correct:

```text
Admin ───────► API contract
API ─────────► API contract
```

Avoid:

```text
API ───────► Admin component
```

---

# 103. Versioned Contracts

If API breaking changes become necessary:

```text
v1
 ↓
v2
```

rather than silently changing v1 behavior.

The shared contract package should evolve with API versions.

---

# 104. API Versioning Strategy

Initial:

```text
/api/v1
```

Future:

```text
/api/v2
```

A version should represent a stable external contract, not every internal implementation change.

---

# 105. Documentation Architecture

Architecture documentation should be divided by concern:

```text
ARCHITECTURE.md
API_CONVENTIONS.md
SECURITY.md
RBAC.md
ADMIN_FRONTEND.md
OBSERVABILITY.md
PRODUCTION_READINESS.md
ROADMAP.md
```

Operational procedures should eventually move into:

```text
docs/runbooks/
```

---

# 106. Documentation Ownership

Each major architecture document should have an owner.

Recommended:

```text
Architecture → backend/platform owner
Security → security/platform owner
RBAC → backend/product owner
Admin → frontend owner
Observability → platform/operations owner
Production readiness → engineering owner
```

---

# 107. Architectural Decision Records

For important decisions, maintain ADRs.

Suggested:

```text
docs/adr/
├── 001-modular-monolith.md
├── 002-fastify.md
├── 003-prisma-postgresql.md
├── 004-rbac.md
├── 005-jwt-refresh-rotation.md
├── 006-shared-typebox-contracts.md
└── 007-background-jobs.md
```

ADRs should explain:

```text
context
decision
alternatives
tradeoffs
consequences
```

---

# 108. Architecture Evolution

The architecture should evolve based on evidence.

Signals for change include:

```text
database bottleneck
API CPU saturation
worker backlog
team ownership conflicts
deployment frequency
security requirements
large domain boundaries
independent scaling requirements
```

Do not refactor based solely on architectural fashion.

---

# 109. When to Extract a Service

Consider service extraction when several conditions are true:

```text
independent scaling required
independent deployment required
clear data ownership
clear API boundary
high operational value
team ownership exists
failure isolation is valuable
```

One reason alone is usually insufficient.

---

# 110. Service Extraction Example

Potential future:

```text
Main API
   │
   ├── User domain
   ├── RBAC domain
   └── Business domain

Later:

Main API ─────► Notification Service
Main API ─────► Reporting Service
Main API ─────► Search Service
```

Extraction should follow proven boundaries.

---

# 111. Multi-Tenancy Evolution

If multi-tenancy becomes necessary:

```text
request
  ↓
identify tenant
  ↓
authenticate
  ↓
authorize within tenant
  ↓
query tenant-scoped data
```

Every tenant-owned resource should have an explicit scope.

Do not retrofit tenant isolation casually after data has accumulated.

---

# 112. Feature Flags

Feature flags can control:

```text
new Admin screens
new API behavior
migration transitions
gradual rollouts
experimental workflows
```

Flags should have:

```text
owner
purpose
default
scope
cleanup date
```

---

# 113. Configuration vs Feature Flags

Use configuration for:

```text
environment behavior
infrastructure
credentials
runtime settings
```

Use feature flags for:

```text
product behavior
gradual rollout
experimentation
```

Do not use environment variables as a substitute for every feature flag.

---

# 114. Architecture Security Review

Before major architectural changes ask:

```text
Does this create a new trust boundary?
Does this introduce secrets?
Does this change authorization?
Does this expose new data?
Does this create a new network path?
Does this change audit requirements?
```

---

# 115. Architecture Performance Review

Before adding infrastructure ask:

```text
What is slow?
What is the measured bottleneck?
What is the expected improvement?
What is the operational cost?
What happens if the new dependency fails?
```

---

# 116. Architecture Reliability Review

For every new dependency:

```text
What if it is unavailable?
What if it is slow?
What if it returns invalid data?
What if it is duplicated?
What if credentials expire?
What if the dependency is compromised?
```

---

# 117. Production Target Architecture

The mature but intentionally simple target is:

```text
                         ┌───────────────────┐
                         │   Admin Browser   │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ HTTPS / Gateway   │
                         └─────────┬─────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
             ┌───────────────┐             ┌───────────────┐
             │ Fastify API 1 │             │ Fastify API 2 │
             └───────┬───────┘             └───────┬───────┘
                     │                             │
                     └──────────────┬──────────────┘
                                    ▼
                            ┌───────────────┐
                            │  PostgreSQL   │
                            └───────────────┘
                                    │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                    ┌─────────┐          ┌──────────┐
                    │ Redis   │          │ External │
                    └────┬────┘          │ Services │
                         │               └──────────┘
                         ▼
                    ┌─────────┐
                    │ Workers │
                    └─────────┘

Observability:
API ──► Logs
API ──► Metrics
API ──► Traces
Admin ─► Frontend telemetry
                │
                ▼
        Grafana / Telemetry

Security:
CI ──► scanning
Secrets ──► secret manager
Audit ──► durable storage
```

---

# 118. Minimal First Production Architecture

The project does not need every component on day one.

A reasonable first production architecture is:

```text
Admin SPA
    │
    ▼
HTTPS
    │
    ▼
Fastify API
    │
    ▼
PostgreSQL

Plus:
    Pino
    Prometheus
    Grafana
    backups
    CI/CD
```

Then add:

```text
Redis
workers
centralized logs
OpenTelemetry
autoscaling
```

based on real requirements.

---

# 119. Architecture Decision Matrix

| Decision                  | Current Recommendation | Future Trigger                     |
| ------------------------- | ---------------------- | ---------------------------------- |
| Monolith vs microservices | Modular monolith       | independent scaling/ownership      |
| PostgreSQL                | Yes                    | extreme scale/specialized workload |
| Prisma                    | Yes                    | persistence requirements change    |
| Redis                     | Optional               | shared rate limiting/cache/jobs    |
| BullMQ                    | Optional               | asynchronous workloads             |
| Kubernetes                | Optional               | operational scale requires it      |
| OpenTelemetry             | Progressive            | distributed complexity             |
| Multi-region              | No initially           | availability/business requirement  |
| Service extraction        | No initially           | proven bounded domain              |

---

# 120. Recommended Implementation Order

Build architecture in this sequence:

```text
1. Repository structure
        ↓
2. Configuration
        ↓
3. Fastify plugin foundation
        ↓
4. Prisma/PostgreSQL
        ↓
5. API contracts
        ↓
6. Route/service/repository boundaries
        ↓
7. Authentication
        ↓
8. RBAC
        ↓
9. Admin frontend
        ↓
10. Audit logging
        ↓
11. Testing
        ↓
12. Observability
        ↓
13. Production deployment
        ↓
14. Redis/workers
        ↓
15. Advanced scaling
```

---

# 121. Architecture Review Checklist

Before merging a significant feature, ask:

## Structure

- [ ] Is the feature in the correct module?
- [ ] Are boundaries clear?
- [ ] Are dependencies flowing in the correct direction?

## API

- [ ] Is the route REST-consistent?
- [ ] Is the contract defined?
- [ ] Are inputs validated?
- [ ] Is the response schema explicit?

## Business Logic

- [ ] Is logic outside the route?
- [ ] Does the operation belong in a service?
- [ ] Does it require an orchestrator?

## Persistence

- [ ] Is database access behind the repository boundary?
- [ ] Are transactions explicit?
- [ ] Are indexes/constraints correct?

## Security

- [ ] Is authentication required?
- [ ] Is authorization enforced?
- [ ] Is resource scope checked?
- [ ] Could this create IDOR or privilege escalation?

## Observability

- [ ] Are important failures logged?
- [ ] Are metrics needed?
- [ ] Is the operation auditable?

## Testing

- [ ] Unit test?
- [ ] Integration test?
- [ ] Contract test?
- [ ] E2E/security test where necessary?

---

# 122. Definition of Done

A feature is architecturally complete when:

```text
Correct module
    +
Correct API contract
    +
Validation
    +
Authorization
    +
Business logic
    +
Persistence
    +
Error handling
    +
Observability
    +
Tests
    +
Documentation
```

are all considered.

---

# 123. Anti-Patterns

Avoid:

## God Route

```text
one route contains the entire business workflow
```

---

## God Service

```text
one service handles every domain
```

---

## God Repository

```text
one repository contains every query
```

---

## Direct Prisma Everywhere

```text
route → Prisma
service → Prisma
worker → Prisma
utility → Prisma
```

This destroys persistence boundaries.

---

## Frontend Authorization Only

```text
hide button
      ↓
assume secure
```

Incorrect.

---

## Shared Mutable Global State

Avoid process-global state for user/session/business data.

---

## Generic Utility Dump

Avoid:

```text
utils/
  everything.ts
```

Prefer domain-specific utilities.

---

## Premature Microservices

Do not split modules into services without an operational reason.

---

# 124. Architectural Tradeoffs

## Modular Monolith

### Advantages

```text
simple deployment
simple transactions
easy local development
low latency internal calls
easy debugging
```

### Disadvantages

```text
shared runtime
shared database
requires discipline around boundaries
```

---

## Shared API Contracts

### Advantages

```text
less contract drift
strong TypeScript experience
faster Admin development
```

### Disadvantages

```text
frontend/backend release coupling can increase
contracts can become bloated if unmanaged
```

---

## Prisma

### Advantages

```text
type safety
developer productivity
migration tooling
```

### Disadvantages

```text
ORM abstraction
query tuning may still be necessary
complex SQL can require specialized handling
```

---

# 125. Long-Term Architecture

The long-term direction should be:

```text
                    Fastify-MasterApp
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
          Admin          API          Workers
             │             │             │
             │        ┌────┴────┐        │
             │        ▼         ▼        │
             │    Services    RBAC       │
             │        │         │        │
             │        └────┬────┘        │
             │             ▼             │
             │        Repositories       │
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                       PostgreSQL
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
                Redis           External APIs

Cross-cutting:
security
logging
metrics
tracing
audit
configuration
testing
CI/CD
```

The architecture should remain understandable even as capabilities grow.

---

# 126. Final Architectural Principle

Fastify-MasterApp should evolve through **strong boundaries before distributed infrastructure**.

The desired progression is:

```text
Simple
  ↓
Structured
  ↓
Modular
  ↓
Secure
  ↓
Observable
  ↓
Tested
  ↓
Production-ready
  ↓
Scalable
  ↓
Distributed only when justified
```

The most important architectural rule is:

> **Keep HTTP, business logic, persistence, security, and UI concerns separate while keeping the deployment model simple.**

If those boundaries remain strong, Fastify-MasterApp can start as a straightforward modular monolith and later evolve toward Redis, workers, advanced observability, multi-instance deployment, and eventually independently deployed services without requiring a complete rewrite.

---

# 127. Architecture Reference

This document should be read together with:

```text
API_CONVENTIONS.md
SECURITY.md
RBAC.md
ADMIN_FRONTEND.md
OBSERVABILITY.md
PRODUCTION_READINESS.md
ROADMAP.md
```

Together they define:

```text
ARCHITECTURE
    ↓
API behavior
    ↓
SECURITY
    ↓
AUTHORIZATION
    ↓
ADMIN UX
    ↓
OBSERVABILITY
    ↓
PRODUCTION OPERATIONS
    ↓
IMPLEMENTATION ROADMAP
```

This is the architectural foundation for Fastify-MasterApp.
