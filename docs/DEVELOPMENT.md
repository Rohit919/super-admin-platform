# Development Guide

This document explains how to set up, run, test, debug, and extend **Fastify-MasterApp** locally.

Fastify-MasterApp is a production-oriented TypeScript monorepo containing:

- A Fastify API
- A React/Vite Admin frontend
- Shared TypeBox API contracts
- Prisma and PostgreSQL
- Authentication and authorization
- Docker-based infrastructure
- Observability tooling
- Integration and end-to-end testing
- Optional Redis/background-worker infrastructure as the platform evolves

The objective of local development is to reproduce the application's important production boundaries without introducing unnecessary complexity.

---

## Table of Contents

1. [Development Principles](#1-development-principles)
2. [Prerequisites](#2-prerequisites)
3. [Repository Structure](#3-repository-structure)
4. [Getting the Repository](#4-getting-the-repository)
5. [Installing Dependencies](#5-installing-dependencies)
6. [Environment Configuration](#6-environment-configuration)
7. [Local PostgreSQL](#7-local-postgresql)
8. [Prisma Setup](#8-prisma-setup)
9. [Running the API](#9-running-the-api)
10. [Running the Admin Frontend](#10-running-the-admin-frontend)
11. [Running the Complete Stack](#11-running-the-complete-stack)
12. [Development Commands](#12-development-commands)
13. [API Development](#13-api-development)
14. [Admin Development](#14-admin-development)
15. [Shared API Contracts](#15-shared-api-contracts)
16. [Database Development](#16-database-development)
17. [Authentication Development](#17-authentication-development)
18. [RBAC Development](#18-rbac-development)
19. [Testing During Development](#19-testing-during-development)
20. [Swagger and API Exploration](#20-swagger-and-api-exploration)
21. [Health and Readiness](#21-health-and-readiness)
22. [Logging and Debugging](#22-logging-and-debugging)
23. [Metrics and Observability](#23-metrics-and-observability)
24. [Docker Development](#24-docker-development)
25. [Redis and Background Workers](#25-redis-and-background-workers)
26. [Common Development Workflows](#26-common-development-workflows)
27. [Adding a New API Module](#27-adding-a-new-api-module)
28. [Adding a New Admin Feature](#28-adding-a-new-admin-feature)
29. [Adding a Database Model](#29-adding-a-database-model)
30. [Changing an API Contract](#30-changing-an-api-contract)
31. [Working with Authentication](#31-working-with-authentication)
32. [Working with Authorization](#32-working-with-authorization)
33. [Debugging Database Problems](#33-debugging-database-problems)
34. [Debugging API Problems](#34-debugging-api-problems)
35. [Debugging Admin Problems](#35-debugging-admin-problems)
36. [Resetting Local Development State](#36-resetting-local-development-state)
37. [Code Quality](#37-code-quality)
38. [Git Workflow](#38-git-workflow)
39. [Development Security](#39-development-security)
40. [Performance During Development](#40-performance-during-development)
41. [Troubleshooting](#41-troubleshooting)
42. [Recommended Development Sequence](#42-recommended-development-sequence)
43. [Developer Checklist](#43-developer-checklist)
44. [Definition of Done](#44-definition-of-done)

---

# 1. Development Principles

Development should preserve the same architectural boundaries used by production.

The preferred flow is:

```text
Browser
   ↓
Admin React application
   ↓
Typed API client
   ↓
Fastify HTTP layer
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

For background processing:

```text
API
 ↓
Queue
 ↓
Worker
 ↓
External service / database
```

Do not bypass these boundaries simply because local development makes it convenient.

---

## 1.1 Local Development Goals

A good local environment should allow a developer to:

- Start the API quickly
- Start the Admin frontend quickly
- Run PostgreSQL locally
- Run Prisma migrations
- Inspect API requests
- Inspect API documentation
- Run tests
- Debug authentication
- Test authorization
- Verify database behavior
- Inspect logs
- Verify health/readiness
- Run Docker-based infrastructure when needed

---

## 1.2 Keep Development Reproducible

Do not depend on undocumented local machine state.

Avoid:

```text
"It works because I installed X globally."
```

Prefer:

```text
Repository configuration
+
Documented dependencies
+
Docker infrastructure where appropriate
+
Validated environment variables
```

---

# 2. Prerequisites

Install the tools required by the repository.

Typical requirements:

| Tool                | Purpose                       |
| ------------------- | ----------------------------- |
| Git                 | Source control                |
| Node.js             | JavaScript/TypeScript runtime |
| Package manager     | Dependency management         |
| Docker              | Local infrastructure          |
| PostgreSQL          | Application database          |
| IDE                 | Development/debugging         |
| curl or HTTP client | API testing                   |

Optional tools:

- Prisma Studio
- Postman
- Insomnia
- HTTPie
- `jq`
- Kubernetes tooling
- Redis CLI

Use the versions specified by repository configuration when available.

---

## 2.1 Check Installed Versions

Examples:

```bash
node --version
npm --version
git --version
docker --version
docker compose version
```

If the repository specifies a Node version through files such as:

```text
.nvmrc
.volta
package.json
```

follow that version.

---

# 3. Repository Structure

The main application areas are:

```text
Fastify-MasterApp/
├── apps/
│   ├── api/
│   │   └── ...
│   │
│   └── admin/
│       └── ...
│
├── packages/
│   └── api-contracts/
│       └── ...
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── docker/
├── k8s/
├── docs/
├── scripts/
├── .kiro/
│
├── package.json
├── README.md
├── ARCHITECTURE.md
├── API_CONVENTIONS.md
├── SECURITY.md
├── RBAC.md
├── ADMIN_FRONTEND.md
├── TESTING.md
├── CONTRIBUTING.md
├── PRODUCTION_READINESS.md
└── ROADMAP.md
```

---

## 3.1 Application Boundaries

### `apps/api`

Contains:

- Fastify bootstrap
- Routes
- Plugins
- Authentication
- Authorization
- Services
- Orchestrators
- Repositories
- Error handling
- Logging
- Metrics
- API configuration

### `apps/super-admin`

Contains:

- React application
- Routing
- Pages
- Components
- Hooks
- API client integration
- Authentication state
- Permission-aware UI
- Platform (Super Admin) workflows

### `packages/api-contracts`

Contains shared API contracts.

The package should remain independent of React-specific implementation details.

### `prisma`

Contains database schema and migrations.

---

# 4. Getting the Repository

Clone the repository:

```bash
git clone https://github.com/OWNER/super-admin-platform.git
cd super-admin-platform
```

Check the current branch:

```bash
git branch --show-current
```

Check repository status:

```bash
git status
```

---

## 4.1 Start From a Clean Working Tree

Before beginning work:

```bash
git status
```

Ideally:

```text
nothing to commit, working tree clean
```

If you have existing work, understand it before running commands that may modify files.

---

# 5. Installing Dependencies

Install dependencies using the package manager and lockfile configured by the repository.

For npm:

```bash
npm install
```

For CI or deterministic installation:

```bash
npm ci
```

Use the repository's actual package-manager convention.

Do not delete the lockfile to resolve an ordinary dependency problem.

---

## 5.1 After Installation

Run the project's available validation commands.

Typical examples:

```bash
npm run typecheck
npm run lint
npm test
```

If scripts differ, inspect:

```bash
cat package.json
```

or:

```bash
npm run
```

---

# 6. Environment Configuration

Local development should use a dedicated environment configuration.

Typical file:

```text
.env
```

Do not commit it if it contains secrets.

Use:

```text
.env.example
```

as the source of documented variable names.

---

## 6.1 Typical Variables

Fastify-MasterApp may use variables similar to:

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

DATABASE_URL=postgresql://...

JWT_SECRET=...
JWT_ACCESS_EXPIRES_IN=...
JWT_REFRESH_EXPIRES_IN=...

API_PREFIX=/api
API_VERSION=v1

CORS_ORIGIN=http://localhost:5173

RATE_LIMIT_MAX=...
RATE_LIMIT_TIME_WINDOW=...

METRICS_ENABLED=true
SWAGGER_ENABLED=true
```

The application's configuration loader is authoritative.

Do not invent new variable names when an existing configuration abstraction already supports the required behavior.

---

## 6.2 Local Secrets

Development secrets may be generated locally.

Example:

```bash
openssl rand -base64 48
```

Use the generated value only for local development.

Never reuse:

- Production JWT secrets
- Production database passwords
- Cloud credentials
- Real user passwords
- Real API keys

---

## 6.3 Environment Validation

The application should fail early when required configuration is missing or invalid.

Typical startup failures include:

```text
DATABASE_URL is missing
JWT_SECRET is missing
PORT is invalid
CORS_ORIGIN is invalid
```

A clear startup error is preferable to an obscure runtime failure.

---

# 7. Local PostgreSQL

PostgreSQL is the primary application database.

There are two common development approaches.

### Option A: Docker

Recommended when you want an isolated environment:

```text
Application
   ↓
Docker PostgreSQL
```

### Option B: Native PostgreSQL

Useful if PostgreSQL is already installed locally.

---

## 7.1 Verify PostgreSQL

Example:

```bash
psql --version
```

Check connectivity:

```bash
psql "$DATABASE_URL"
```

If `DATABASE_URL` is not exported, use the connection string configured for local development.

---

## 7.2 Recommended Local Database

Use a database dedicated to this project.

For example:

```text
fastify_masterapp_dev
```

Do not develop against a production database.

---

# 8. Prisma Setup

Prisma provides the database access layer.

Important files typically include:

```text
prisma/schema.prisma
prisma/migrations/
```

---

## 8.1 Generate Prisma Client

When required:

```bash
npx prisma generate
```

Run this after dependency installation if the repository requires it.

---

## 8.2 Apply Existing Migrations

For a development database:

```bash
npx prisma migrate dev
```

This can:

- Apply migrations
- Create new migrations when schema changes exist
- Regenerate Prisma Client where appropriate

Use the project's established migration workflow.

---

## 8.3 Inspect Database

Prisma Studio can be useful during local development:

```bash
npx prisma studio
```

Use it carefully.

Do not manually alter important data without understanding its impact on tests and local application state.

---

## 8.4 Prisma Workflow

Recommended:

```text
Change schema.prisma
       ↓
Create migration
       ↓
Review migration
       ↓
Apply locally
       ↓
Generate client
       ↓
Run tests
```

---

# 9. Running the API

Start the Fastify API using the repository's development script.

Typical example:

```bash
npm run dev
```

If the monorepo exposes an app-specific script, use that script instead.

The API should normally expose:

```text
http://localhost:<PORT>
```

The exact port comes from configuration.

---

## 9.1 Verify the API

Check the root API endpoint:

```bash
curl http://localhost:3000/api/v1
```

Check health:

```bash
curl http://localhost:3000/health
```

Check readiness:

```bash
curl http://localhost:3000/ready
```

Use the actual configured prefix/port if different.

---

# 10. Running the Admin Frontend

The Admin frontend is a React/Vite application.

A typical development command is:

```bash
npm run dev
```

The actual command may be exposed at the workspace or root level.

The Vite development server commonly runs on:

```text
http://localhost:5173
```

Use the port printed by the development server.

---

## 10.1 Admin → API

The Admin application should communicate with the API through its configured API client.

Typical local flow:

```text
Browser
 ↓
localhost:5173
 ↓
API client
 ↓
localhost:3000/api/v1
```

Make sure CORS and API base URL configuration allow local development.

---

# 11. Running the Complete Stack

A complete local environment may contain:

```text
┌──────────────┐
│ Admin        │
│ React/Vite   │
└──────┬───────┘
       │ HTTP
       ↓
┌──────────────┐
│ Fastify API  │
└──────┬───────┘
       │ Prisma
       ↓
┌──────────────┐
│ PostgreSQL   │
└──────────────┘
```

Optional infrastructure:

```text
Fastify
   │
   ├── Redis
   │
   ├── Worker
   │
   └── Prometheus → Grafana
```

Only run optional infrastructure when the feature being developed requires it.

---

# 12. Development Commands

The exact commands are defined by the repository's `package.json`.

Common categories include:

```bash
# Development
npm run dev

# Build
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint

# Tests
npm test

# Formatting
npm run format

# Prisma
npx prisma generate
npx prisma migrate dev
npx prisma studio
```

Run:

```bash
npm run
```

to inspect available scripts.

---

## 12.1 Do Not Assume Root Scripts

In a monorepo, a command may belong to:

```text
root
apps/api
apps/super-admin
packages/api-contracts
```

Before running a command, confirm which workspace owns it.

---

# 13. API Development

A typical backend module should follow:

```text
module/
├── routes/
├── schemas/
├── services/
├── repositories/
├── types/
└── tests/
```

The exact structure should follow the existing API implementation.

---

## 13.1 Route Responsibilities

Routes should handle:

- HTTP configuration
- Schema validation
- Authentication hooks
- Authorization checks
- Request extraction
- Service invocation
- Response status

Avoid large business workflows in routes.

---

## 13.2 Service Responsibilities

Services should handle:

- Business rules
- Use cases
- Coordination
- Transactions where required
- Calling repositories
- External integrations

---

## 13.3 Repository Responsibilities

Repositories should handle:

- Prisma queries
- Persistence
- Database-specific operations

---

# 14. Admin Development

The Admin frontend should follow a layered UI architecture.

Preferred:

```text
Page
 ↓
Feature component
 ↓
Hook
 ↓
API client
 ↓
API contract
```

---

## 14.1 Pages

Pages should compose features rather than contain every implementation detail.

Example:

```text
UsersPage
 ├── UserFilters
 ├── UserTable
 ├── UserPagination
 └── UserActions
```

---

## 14.2 Hooks

Hooks should encapsulate reusable behavior.

Examples:

```text
useUsers()
useUser()
useCreateUser()
useUpdateUser()
usePermissions()
useCurrentUser()
```

---

## 14.3 Server State

Use the established TanStack Query architecture for server state.

Avoid copying query results into Zustand unless there is a real application-state requirement.

---

# 15. Shared API Contracts

The shared contracts package creates a consistent boundary between API and Admin.

Conceptually:

```text
                 ┌─────────────────────┐
                 │ api-contracts       │
                 │ TypeBox schemas     │
                 └──────────┬──────────┘
                            │
                ┌───────────┴───────────┐
                ↓                       ↓
          Fastify API               Admin UI
```

---

## 15.1 Contract Ownership

The API contract describes the public interface.

It should not expose internal implementation details.

---

## 15.2 Contract Change

When changing:

```json
{
  "name": "Rohit"
}
```

to:

```json
{
  "displayName": "Rohit"
}
```

do not update only the frontend or backend.

Update:

```text
Contract
 ↓
API
 ↓
API client
 ↓
Admin
 ↓
Tests
 ↓
Documentation
```

---

# 16. Database Development

Database changes should be deliberate.

Before adding a field, ask:

```text
Is it nullable?
Is there a default?
Is it indexed?
Is it unique?
Does existing data need migration?
Will it affect API contracts?
Will it affect queries?
```

---

## 16.1 Safe Schema Evolution

Prefer additive changes.

Example:

```text
Release 1:
add nullable display_name

Release 2:
backfill values

Release 3:
make required if appropriate
```

Avoid immediate destructive changes when existing application versions may still depend on the old schema.

---

## 16.2 Query Performance

When adding a query, consider:

- Number of rows
- Filters
- Sort order
- Pagination
- Indexes
- Joins/relations
- N+1 behavior

Use realistic local data when testing performance-sensitive code.

---

# 17. Authentication Development

Authentication flow should be understood before modifying auth code.

Typical flow:

```text
Register/Login
      ↓
Credentials validated
      ↓
Access token issued
      ↓
Refresh token issued
      ↓
Protected API request
      ↓
Access token validated
```

Refresh:

```text
Refresh token
      ↓
Validate
      ↓
Rotate
      ↓
Issue new token pair
      ↓
Invalidate/revoke previous token as appropriate
```

---

## 17.1 Development Authentication Checklist

When working on authentication verify:

```text
[ ] Valid credentials work
[ ] Invalid credentials fail
[ ] Expired access tokens fail
[ ] Invalid refresh tokens fail
[ ] Refresh rotation works
[ ] Logout/revocation works
[ ] Protected routes require authentication
[ ] Sensitive values are not logged
```

---

# 18. RBAC Development

Authorization follows:

```text
Authentication
      ↓
Identify actor
      ↓
Determine roles
      ↓
Resolve permissions
      ↓
Check requested capability
      ↓
Check resource access
      ↓
Allow / Deny
```

---

## 18.1 Default Deny

If no authorization rule explicitly permits an operation:

```text
DENY
```

Do not implement:

```text
if user is not explicitly blocked:
    allow
```

---

## 18.2 Test RBAC Locally

Create representative users:

```text
Super Admin
Admin
Manager
Operator
Read-only user
No-role user
```

Then verify expected permissions.

Example:

| Action       | Admin | Manager | Read-only |
| ------------ | ----: | ------: | --------: |
| View users   |   Yes |     Yes |       Yes |
| Create users |   Yes |   Maybe |        No |
| Delete users |   Yes |      No |        No |
| Manage roles |   Yes |      No |        No |

The exact permission matrix belongs to the application's RBAC design.

---

# 19. Testing During Development

Do not wait until the end of a feature to run tests.

Recommended loop:

```text
Small change
 ↓
Run focused test
 ↓
Continue
 ↓
Run integration tests
 ↓
Run full suite
```

---

## 19.1 API Testing

Test:

- Request validation
- Authentication
- Authorization
- Business behavior
- Database behavior
- Response contract
- Error responses

---

## 19.2 Admin Testing

Test:

- Rendering
- User interaction
- Query states
- Form validation
- Permission-aware UI
- API failures
- Navigation

---

## 19.3 Security Testing

For security-sensitive changes, test negative cases first.

Example:

```text
User A
 ↓
Attempts User B's resource
 ↓
403 / appropriate denial
```

---

# 20. Swagger and API Exploration

The API provides Swagger/OpenAPI documentation when enabled.

The documented endpoint is typically:

```text
/documentation
```

or a configured equivalent.

Use Swagger to:

- Inspect routes
- Inspect request schemas
- Inspect response schemas
- Try endpoints
- Understand authentication requirements

---

## 20.1 Swagger Is Not a Security Boundary

Swagger should not be considered an authorization mechanism.

Protected endpoints must enforce authentication and authorization regardless of whether Swagger is enabled.

---

# 21. Health and Readiness

The application distinguishes operational health from readiness.

Typical endpoints:

```text
GET /health
GET /ready
```

Conceptually:

```text
/health
    ↓
Is the process alive?

/ready
    ↓
Can the application serve traffic?
```

Readiness may depend on:

- Database connectivity
- Required infrastructure
- Initialization state

Do not make health checks perform expensive business operations.

---

# 22. Logging and Debugging

Fastify uses structured logging through Pino.

Development logs should help answer:

```text
What happened?
When?
Which request?
Which user/session?
Which operation?
Did it succeed?
How long did it take?
```

---

## 22.1 Request IDs

Use request IDs to correlate:

```text
Browser request
 ↓
Fastify
 ↓
Service
 ↓
Database/external operation
```

This becomes especially important when debugging asynchronous or distributed workflows.

---

## 22.2 Never Log Secrets

Do not log:

```text
passwords
JWTs
refresh tokens
cookies
authorization headers
API keys
database credentials
private keys
```

Even during local development.

---

# 23. Metrics and Observability

When metrics are enabled, the API exposes Prometheus-compatible metrics.

Typical endpoint:

```text
/metrics
```

Useful development metrics include:

- Request count
- Request duration
- Error count
- Database latency
- Authentication failures
- Authorization failures
- Queue failures
- Worker duration

---

## 23.1 Debugging With Metrics

If an endpoint feels slow:

```text
Request latency
       ↓
Application processing
       ↓
Database latency
       ↓
External service latency
```

Measure before optimizing.

---

# 24. Docker Development

Docker provides reproducible local infrastructure.

Typical services may include:

```text
PostgreSQL
Redis
Prometheus
Grafana
API
Admin
Worker
```

Do not assume every service must run for every development task.

---

## 24.1 Start Infrastructure

Use the repository's Docker Compose configuration.

Typical pattern:

```bash
docker compose up -d
```

Check:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```

Stop:

```bash
docker compose down
```

Use the actual Compose file/configuration included by the repository.

---

## 24.2 Rebuild Containers

After changing containerized application code or dependencies:

```bash
docker compose build
```

or:

```bash
docker compose up --build
```

---

## 24.3 Persistent Volumes

If PostgreSQL data is stored in a Docker volume,:

```bash
docker compose down
```

does not necessarily remove the data.

To intentionally remove local database state, use the repository's documented volume-reset procedure.

Do not delete volumes accidentally.

---

# 25. Redis and Background Workers

Redis and BullMQ are optional infrastructure in the platform's evolution.

Use them when developing:

- Background jobs
- Retry workflows
- Asynchronous notifications
- Scheduled jobs
- Distributed rate limiting
- Caching

Typical flow:

```text
API
 ↓
BullMQ Queue
 ↓
Redis
 ↓
Worker
 ↓
Job Processor
```

---

## 25.1 Local Worker Development

A worker should be independently observable.

Verify:

```text
Job added
 ↓
Job received
 ↓
Job processed
 ↓
Success/failure recorded
```

Test retries and duplicate execution for important jobs.

---

# 26. Common Development Workflows

## 26.1 New Feature

```text
1. Read relevant docs
2. Inspect existing module
3. Create branch
4. Define contract
5. Implement backend
6. Implement database changes
7. Implement Admin
8. Add tests
9. Run quality checks
10. Update documentation
11. Review diff
12. Open PR
```

---

## 26.2 Bug Fix

```text
1. Reproduce bug
2. Identify boundary
3. Write regression test
4. Fix root cause
5. Run focused tests
6. Run broader tests
7. Check similar code paths
8. Update documentation if necessary
```

---

## 26.3 Security Fix

```text
1. Reproduce safely
2. Assess scope
3. Add failing security test
4. Fix vulnerability
5. Test related endpoints
6. Review logs
7. Review authorization boundaries
8. Run security suite
9. Document impact/remediation
```

---

## 26.4 Refactoring

Before refactoring:

```text
1. Establish test coverage
2. Define desired boundary
3. Make small changes
4. Keep behavior stable
5. Run tests frequently
```

Avoid combining large refactors with unrelated features.

---

# 27. Adding a New API Module

Example:

```text
orders
```

Recommended process:

### Step 1 — Define domain

Identify:

```text
Order
OrderItem
OrderStatus
```

### Step 2 — Database

Update:

```text
prisma/schema.prisma
```

and create a migration if needed.

### Step 3 — Contracts

Add:

```text
CreateOrderRequest
OrderResponse
ListOrdersQuery
ListOrdersResponse
```

### Step 4 — Repository

Implement persistence operations.

### Step 5 — Service

Implement business behavior.

### Step 6 — Routes

Add:

```text
GET /orders
GET /orders/:id
POST /orders
PATCH /orders/:id
```

### Step 7 — Security

Define:

```text
orders:read
orders:create
orders:update
orders:delete
```

and resource-level authorization where required.

### Step 8 — Tests

Add:

```text
Unit
Integration
Contract
Authorization
```

### Step 9 — Admin

Add the corresponding UI if the module is Admin-facing.

### Step 10 — Documentation

Update:

```text
API docs
README if necessary
RBAC docs
Architecture docs if necessary
```

---

# 28. Adding a New Admin Feature

Example:

```text
User management
```

Recommended:

```text
Route
 ↓
Page
 ↓
Feature components
 ↓
Query/mutation hooks
 ↓
API client
 ↓
Shared contract
 ↓
API
```

Consider:

- Permissions
- Loading
- Empty states
- Error states
- Form validation
- Pagination
- Search
- Accessibility
- Responsive behavior

---

# 29. Adding a Database Model

Suppose you add:

```text
AuditLog
```

Process:

```text
1. Define domain purpose
2. Update Prisma schema
3. Define relations
4. Define indexes
5. Create migration
6. Review SQL
7. Implement repository
8. Implement service
9. Define API contract if exposed
10. Add tests
11. Update documentation
```

Questions to ask:

```text
Who can read it?
Who can write it?
Should it be immutable?
How long is it retained?
Does it contain sensitive data?
How large can the table become?
What indexes will queries require?
```

---

# 30. Changing an API Contract

Treat API contract changes as cross-application changes.

Process:

```text
Contract
 ↓
Backend implementation
 ↓
Backend tests
 ↓
Admin API client
 ↓
Admin UI
 ↓
Frontend tests
 ↓
Documentation
```

---

## 30.1 Additive Changes

Usually safer:

```json
{
  "id": "123",
  "name": "Rohit",
  "displayName": "Rohit"
}
```

than removing:

```text
name
```

immediately.

---

## 30.2 Breaking Changes

Before making a breaking change, identify:

- Existing clients
- Admin usage
- Tests
- Documentation
- Integrations
- Deployment ordering

Use API versioning or a deprecation period when appropriate.

---

# 31. Working With Authentication

For local testing, use dedicated development accounts.

Example conceptual users:

```text
admin@example.local
manager@example.local
readonly@example.local
```

Never use real personal credentials for testing.

---

## 31.1 Authentication Debugging

If login fails:

```text
Check request body
 ↓
Check validation
 ↓
Check user lookup
 ↓
Check password verification
 ↓
Check account status
 ↓
Check token creation
 ↓
Check response
```

If a protected request fails:

```text
Check token exists
 ↓
Check token format
 ↓
Check signature
 ↓
Check expiration
 ↓
Check authentication hook
 ↓
Check authorization
```

---

# 32. Working With Authorization

If an Admin action does not appear:

```text
Check current user
 ↓
Check roles
 ↓
Check resolved permissions
 ↓
Check frontend permission helper
 ↓
Check route navigation guard
```

If an API returns authorization failure:

```text
Check authentication
 ↓
Check required permission
 ↓
Check user's roles
 ↓
Check resource ownership
 ↓
Check policy implementation
```

Remember:

> A hidden Admin button does not grant permission.

The API remains authoritative.

---

# 33. Debugging Database Problems

When database operations fail, check in this order:

```text
1. DATABASE_URL
2. PostgreSQL running
3. Network/host/port
4. Database exists
5. Credentials
6. Prisma client generated
7. Migrations applied
8. Schema matches expected version
9. Query
10. Constraints/indexes
```

---

## 33.1 Check Migration State

Use Prisma's migration tooling to inspect local migration state.

If the schema and database are inconsistent, do not immediately delete migration history.

Understand the mismatch first.

---

## 33.2 Constraint Errors

Common causes:

```text
Unique constraint
Foreign key constraint
Required field missing
Invalid enum
Nullability mismatch
```

Fix the domain/data issue rather than weakening database constraints just to make a test pass.

---

# 34. Debugging API Problems

Use this sequence:

```text
Request
 ↓
Route exists?
 ↓
HTTP method correct?
 ↓
Validation?
 ↓
Authentication?
 ↓
Authorization?
 ↓
Service?
 ↓
Repository?
 ↓
Database?
 ↓
Response serialization?
```

---

## 34.1 400 Errors

Usually investigate:

- Request body
- Query parameters
- Path parameters
- TypeBox schema
- Content type

---

## 34.2 401 Errors

Usually investigate:

- Missing token
- Invalid token
- Expired token
- Authentication hook
- Session state

---

## 34.3 403 Errors

Usually investigate:

- Permission
- Role
- Resource ownership
- Authorization policy

---

## 34.4 404 Errors

Determine whether:

```text
Route does not exist
```

or:

```text
Resource does not exist
```

Do not accidentally expose resource existence when security policy requires a generic response.

---

## 34.5 409 Errors

Usually indicates a conflict such as:

```text
Duplicate resource
Invalid state transition
Concurrency conflict
```

---

## 34.6 500 Errors

Investigate:

```text
Application logs
 ↓
Request ID
 ↓
Stack trace in controlled development logs
 ↓
Service
 ↓
Database/external dependency
```

Never expose internal stack traces to API consumers in production.

---

# 35. Debugging Admin Problems

When the Admin UI is broken:

```text
Browser console
 ↓
Network request
 ↓
API response
 ↓
API contract
 ↓
Query/mutation state
 ↓
Component
```

---

## 35.1 Blank Page

Check:

```text
JavaScript runtime error
Router configuration
Environment variables
Build errors
Import errors
```

---

## 35.2 API Request Fails

Inspect browser Network tools:

```text
Request URL
Method
Headers
Cookies/tokens
Request body
Status code
Response body
```

Then debug the API separately.

---

## 35.3 Data Not Updating

Check:

```text
Mutation succeeded?
 ↓
Query invalidated?
 ↓
Query key correct?
 ↓
API returned expected shape?
 ↓
Component consuming correct field?
```

---

# 36. Resetting Local Development State

Sometimes local state becomes inconsistent.

Possible reset levels:

```text
Level 1:
Restart API/Admin

Level 2:
Restart Docker services

Level 3:
Regenerate Prisma Client

Level 4:
Reset local database

Level 5:
Reinstall dependencies
```

Use the smallest reset that solves the problem.

---

## 36.1 Avoid Destructive Resets

Before deleting:

```text
database
Docker volumes
node_modules
lockfiles
```

understand what state will be lost.

Never use destructive database commands against production.

---

# 37. Code Quality

Every contribution should maintain:

```text
Type safety
Readable code
Consistent naming
Small functions
Clear boundaries
Useful tests
Useful errors
Secure defaults
```

---

## 37.1 Typecheck

Run the project's typecheck command.

Type errors should not be ignored.

Avoid:

```ts
// @ts-ignore
```

unless there is a documented, unavoidable reason.

---

## 37.2 Lint

Run lint before committing.

Fix the underlying issue rather than disabling the lint rule locally.

---

## 37.3 Formatting

Use the repository's configured formatter.

Do not introduce a second formatting system.

---

# 38. Git Workflow

Start by synchronizing with the main branch according to the repository workflow.

Example:

```bash
git fetch origin
git status
```

Create a branch:

```bash
git checkout -b feature/my-change
```

Review changes:

```bash
git diff
git status
```

Commit focused work:

```bash
git add .
git commit -m "feat: add my change"
```

Push:

```bash
git push -u origin feature/my-change
```

---

## 38.1 Review Before Commit

Check:

```bash
git diff --cached
```

Look for:

- Secrets
- Debugging code
- Generated files
- Accidental formatting
- Unrelated changes
- Local configuration
- Large binaries

---

# 39. Development Security

Local development is not exempt from security practices.

### Never commit:

```text
.env
credentials
private keys
production data
production tokens
customer data
```

### Never use:

```text
Production database
Production JWT secret
Production API credentials
```

for ordinary local development.

---

## 39.1 Test Data

Use synthetic data.

Good:

```text
admin@example.local
test-user-001
Demo Organization
```

Avoid importing real customer/user data into local development unless there is an explicitly approved, sanitized process.

---

## 39.2 Localhost Is Not Automatically Safe

Be careful when binding services to:

```text
0.0.0.0
```

A service bound to all interfaces may become reachable from other devices on the network.

Use the minimum exposure required for the development task.

---

# 40. Performance During Development

Do not optimize prematurely.

When performance matters:

```text
Measure
 ↓
Find bottleneck
 ↓
Form hypothesis
 ↓
Change
 ↓
Measure again
```

Useful areas:

- API latency
- Database query count
- Database query duration
- N+1 queries
- Large payloads
- React rendering
- Bundle size
- Memory
- CPU
- Connection pool behavior

---

## 40.1 Development Data Volume

A database with ten records may hide performance problems.

For performance-sensitive features, test with realistic volumes.

Example:

```text
10 users
100 users
10,000 users
100,000 users
```

The appropriate scale depends on the feature.

---

# 41. Troubleshooting

## Problem: Dependencies fail to install

Check:

```text
Node version
Package manager
Lockfile
Registry configuration
Network
Native dependencies
```

Do not immediately delete the lockfile.

---

## Problem: API cannot connect to PostgreSQL

Check:

```text
PostgreSQL running?
DATABASE_URL correct?
Port available?
Database exists?
Credentials correct?
Docker network correct?
```

---

## Problem: Prisma errors after pulling changes

Try:

```bash
npx prisma generate
```

Then inspect migration state.

---

## Problem: API returns CORS error

Check:

```text
Admin origin
CORS configuration
API origin
Browser request
Preflight OPTIONS response
```

Do not solve CORS by allowing every origin unless that is an intentional local-only configuration.

---

## Problem: Admin cannot authenticate

Check:

```text
API running
API base URL
CORS
Login endpoint
Request payload
Response
Token/session handling
Browser storage/cookies
```

---

## Problem: Protected route returns 401

Check:

```text
Token exists
Token sent
Token format
Signature
Expiration
Authentication hook
```

---

## Problem: Protected route returns 403

Check:

```text
User identity
Role
Permission
Resource ownership
Authorization policy
```

---

## Problem: Tests pass locally but fail in CI

Check:

```text
Environment variables
Node version
Database setup
Timing assumptions
Test isolation
File-system assumptions
Timezone
Randomness
Parallel execution
```

Never assume CI has the same state as your machine.

---

## Problem: Docker service keeps restarting

Inspect:

```bash
docker compose ps
docker compose logs <service>
```

Then check:

```text
Environment
Dependencies
Ports
Health checks
Startup order
Configuration
```

---

# 42. Recommended Development Sequence

For a new feature, use this sequence:

```text
1. Understand requirement
        ↓
2. Read architecture/API/security docs
        ↓
3. Inspect existing implementation
        ↓
4. Define data model if needed
        ↓
5. Define API contract
        ↓
6. Implement repository
        ↓
7. Implement service/orchestrator
        ↓
8. Implement route
        ↓
9. Add authorization
        ↓
10. Add tests
        ↓
11. Implement Admin UI
        ↓
12. Connect API client
        ↓
13. Test end-to-end
        ↓
14. Update documentation
        ↓
15. Run quality checks
        ↓
16. Review Git diff
        ↓
17. Open PR
```

---

# 43. Developer Checklist

Before starting:

```text
[ ] Repository is up to date
[ ] Working tree is clean
[ ] Relevant documentation read
[ ] Existing implementation inspected
[ ] Requirements understood
```

During development:

```text
[ ] Correct architectural layer selected
[ ] API contract updated if needed
[ ] Input validation added
[ ] Authentication considered
[ ] Authorization considered
[ ] Database impact considered
[ ] Tests added
[ ] Admin impact considered
[ ] Security impact considered
```

Before PR:

```text
[ ] Typecheck passes
[ ] Lint passes
[ ] Tests pass
[ ] Build passes where applicable
[ ] Migration reviewed
[ ] API contract reviewed
[ ] Documentation updated
[ ] No secrets committed
[ ] Git diff reviewed
[ ] PR description prepared
```

---

# 44. Definition of Done

A development task is complete when:

## Environment

- [ ] Required local services run successfully.
- [ ] Configuration is documented.
- [ ] No production secrets are required.

## Backend

- [ ] Routes follow API conventions.
- [ ] Business logic is in the correct layer.
- [ ] Persistence is isolated appropriately.
- [ ] Input is validated.
- [ ] Errors are consistent.
- [ ] Authentication is correct.
- [ ] Authorization is correct.

## Database

- [ ] Schema is correct.
- [ ] Migration exists when required.
- [ ] Constraints are intentional.
- [ ] Indexes are appropriate.
- [ ] Existing data is considered.

## Frontend

- [ ] Admin UI follows established architecture.
- [ ] API integration uses the typed client.
- [ ] Loading/error/empty states exist.
- [ ] Permissions are reflected in UX.
- [ ] Accessibility is considered.

## Testing

- [ ] Relevant unit tests exist.
- [ ] Integration tests exist where appropriate.
- [ ] Contract behavior is covered.
- [ ] Security behavior is covered.
- [ ] Regression tests exist for bugs.

## Operations

- [ ] Logs are useful.
- [ ] Sensitive data is not logged.
- [ ] Metrics are added where appropriate.
- [ ] Health/readiness behavior is preserved.

## Quality

- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Formatting passes.
- [ ] Build passes where applicable.
- [ ] No unrelated changes remain.

## Documentation

- [ ] Relevant documentation is updated.
- [ ] New environment variables are documented.
- [ ] API changes are documented.
- [ ] Security implications are documented when relevant.

---

# Development Golden Rules

Keep these rules in mind while working on the project:

```text
1. Read before changing.
2. Reuse before creating.
3. Validate at boundaries.
4. Keep routes thin.
5. Keep business logic in services/orchestrators.
6. Keep persistence behind repositories.
7. Treat API contracts as public boundaries.
8. Never trust the frontend for authorization.
9. Default to deny.
10. Never commit secrets.
11. Test failure paths, not only success paths.
12. Prefer additive API changes.
13. Use migrations for database changes.
14. Measure before optimizing.
15. Keep pull requests focused.
16. Document behavior that future developers need to know.
17. Prefer simple infrastructure until scale requires more.
18. Keep local development reproducible.
```

---

# Final Development Model

Fastify-MasterApp should be easy for a new developer to understand:

```text
                    Developer
                        │
                        ▼
                ┌───────────────┐
                │ Documentation │
                └───────┬───────┘
                        │
                        ▼
              ┌───────────────────┐
              │ Local Environment │
              └─────────┬─────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
       Admin          API          Database
          │             │             │
          └──────┬──────┘             │
                 ▼                    │
          Shared Contracts            │
                 │                    │
                 └──────────┬─────────┘
                            ▼
                         Testing
                            │
                            ▼
                       Pull Request
                            │
                            ▼
                            CI
                            │
                            ▼
                       Production
```

The development environment should mirror the important production boundaries while remaining fast and simple enough for everyday engineering.

**Simple locally. Structured internally. Secure by default. Production-oriented.**
