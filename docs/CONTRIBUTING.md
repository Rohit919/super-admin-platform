# Contributing to Fastify-MasterApp

Thank you for contributing to **Fastify-MasterApp**.

This repository is designed as a production-oriented Fastify + TypeScript monorepo with a React Admin application, shared API contracts, Prisma/PostgreSQL, authentication, RBAC, testing, observability, and deployment tooling.

The goal of this guide is to keep contributions **predictable, secure, reviewable, and consistent with the architecture**.

---

## Table of Contents

1. [Contribution Principles](#1-contribution-principles)
2. [Repository Structure](#2-repository-structure)
3. [Before You Start](#3-before-you-start)
4. [Development Environment](#4-development-environment)
5. [Local Development Workflow](#5-local-development-workflow)
6. [Branching Strategy](#6-branching-strategy)
7. [Commit Conventions](#7-commit-conventions)
8. [Pull Request Workflow](#8-pull-request-workflow)
9. [Code Organization](#9-code-organization)
10. [TypeScript Guidelines](#10-typescript-guidelines)
11. [Fastify API Guidelines](#11-fastify-api-guidelines)
12. [API Contract Guidelines](#12-api-contract-guidelines)
13. [Service and Business Logic Guidelines](#13-service-and-business-logic-guidelines)
14. [Repository and Database Guidelines](#14-repository-and-database-guidelines)
15. [Authentication and Security Changes](#15-authentication-and-security-changes)
16. [RBAC and Authorization Changes](#16-rbac-and-authorization-changes)
17. [Admin Frontend Contributions](#17-admin-frontend-contributions)
18. [Validation and Error Handling](#18-validation-and-error-handling)
19. [Testing Requirements](#19-testing-requirements)
20. [Observability](#20-observability)
21. [Background Jobs](#21-background-jobs)
22. [Configuration and Environment Variables](#22-configuration-and-environment-variables)
23. [Documentation](#23-documentation)
24. [Dependencies](#24-dependencies)
25. [Security and Secrets](#25-security-and-secrets)
26. [Performance](#26-performance)
27. [Backward Compatibility](#27-backward-compatibility)
28. [Code Review Checklist](#28-code-review-checklist)
29. [Definition of Done](#29-definition-of-done)
30. [Common Anti-Patterns](#30-common-anti-patterns)
31. [When to Ask for an Architecture Review](#31-when-to-ask-for-an-architecture-review)
32. [Contribution Examples](#32-contribution-examples)
33. [Final Checklist](#33-final-checklist)

---

# 1. Contribution Principles

Contributions should follow these principles:

### 1.1 Prefer simple architecture

Fastify-MasterApp follows a **modular monolith** approach.

Do not introduce microservices, message brokers, distributed infrastructure, or additional deployment complexity unless there is a concrete requirement.

Prefer:

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

over putting business logic directly into route handlers.

---

### 1.2 Security is a feature

Every contribution should consider:

- Authentication
- Authorization
- Input validation
- Sensitive data exposure
- Injection risks
- Rate limiting
- CSRF/XSS considerations
- Secrets
- Logging
- Auditability
- Dependency security

Security-sensitive changes require additional tests.

See:

- `SECURITY.md`
- `RBAC.md`
- `AUTHENTICATION.md` when available
- `API_CONVENTIONS.md`

---

### 1.3 Contracts are boundaries

Shared API contracts are part of the architecture.

If an API response or request changes, update the appropriate TypeBox contract and affected consumers.

Do not duplicate API schemas independently across the backend and Admin frontend.

---

### 1.4 Test behavior, not implementation details

Prefer tests that verify externally observable behavior.

Good:

```text
Given an authenticated user,
when the user requests another user's resource,
then the API returns the appropriate authorization error.
```

Less useful:

```text
The private helper function `checkUserOwner()` was called once.
```

---

### 1.5 Keep pull requests focused

A pull request should ideally solve one coherent problem.

Avoid mixing:

- Feature work
- Large refactors
- Dependency upgrades
- Formatting changes
- Unrelated bug fixes

unless they are directly required.

---

# 2. Repository Structure

The repository is organized as a monorepo.

Typical structure:

```text
Fastify-MasterApp/
├── apps/
│   ├── api/
│   └── admin/
│
├── packages/
│   └── api-contracts/
│
├── prisma/
├── docker/
├── k8s/
├── docs/
├── scripts/
├── .kiro/
├── package.json
├── README.md
├── ARCHITECTURE.md
├── API_CONVENTIONS.md
├── SECURITY.md
├── RBAC.md
├── ADMIN_FRONTEND.md
├── TESTING.md
├── PRODUCTION_READINESS.md
└── ROADMAP.md
```

### Responsibilities

| Area                     | Responsibility                       |
| ------------------------ | ------------------------------------ |
| `apps/api`               | Fastify API and backend modules      |
| `apps/super-admin`       | React Super Admin application        |
| `packages/api-contracts` | Shared TypeBox API contracts         |
| `prisma`                 | Database schema and migrations       |
| `docker`                 | Container/development infrastructure |
| `k8s`                    | Kubernetes deployment configuration  |
| `scripts`                | Development/automation scripts       |
| `docs`                   | Supporting technical documentation   |

---

# 3. Before You Start

Before implementing a change:

1. Read the relevant documentation.
2. Search the existing code for similar behavior.
3. Understand the affected module.
4. Determine whether the change affects API contracts.
5. Determine whether the change affects authentication or authorization.
6. Determine whether a database migration is required.
7. Determine which tests need to be added or changed.
8. Check whether the change affects the Admin application.
9. Consider backward compatibility.
10. Check whether documentation needs updating.

For larger changes, create or update a design proposal before implementation.

---

# 4. Development Environment

Recommended tooling:

- Node.js
- npm/pnpm/yarn according to the repository's package-manager configuration
- TypeScript
- Docker
- PostgreSQL
- Git
- A modern IDE such as VS Code

Check the repository's root `package.json` and lockfile for the authoritative package-manager and script configuration.

Do not introduce a second package manager casually.

---

## 4.1 Environment Variables

Never commit real secrets.

Use environment examples such as:

```text
.env.example
```

or the repository's documented environment template.

Typical configuration includes:

```text
NODE_ENV
PORT
HOST
DATABASE_URL
JWT_SECRET
JWT_ACCESS_EXPIRES_IN
JWT_REFRESH_EXPIRES_IN
API_PREFIX
API_VERSION
CORS_ORIGIN
RATE_LIMIT_MAX
RATE_LIMIT_TIME_WINDOW
METRICS_ENABLED
SWAGGER_ENABLED
```

The actual supported variables must be determined from the application configuration.

---

## 4.2 Database

Local development should use the project's documented PostgreSQL setup.

For database changes:

1. Update the Prisma schema.
2. Generate a migration.
3. Review the migration.
4. Apply it locally.
5. Regenerate Prisma client if required.
6. Run relevant tests.
7. Confirm rollback/recovery implications for production.

Never manually edit a generated migration without understanding the resulting SQL.

---

# 5. Local Development Workflow

A normal workflow should look like:

```text
1. Pull latest changes
2. Create a feature branch
3. Install dependencies
4. Start required infrastructure
5. Configure environment variables
6. Run the API/Admin locally
7. Implement the change
8. Add/update tests
9. Run lint/typecheck
10. Run the relevant test suite
11. Review the diff
12. Update documentation
13. Commit
14. Push branch
15. Open pull request
```

Before opening a PR, run the repository's available quality commands, typically including:

```bash
npm run lint
npm run typecheck
npm test
```

Use the actual scripts defined in the repository rather than assuming these exact commands exist.

---

# 6. Branching Strategy

Use short-lived branches.

Recommended naming:

```text
feature/<short-description>
fix/<short-description>
refactor/<short-description>
docs/<short-description>
test/<short-description>
chore/<short-description>
security/<short-description>
perf/<short-description>
```

Examples:

```text
feature/user-management
feature/rbac-role-editor
fix/refresh-token-rotation
security/harden-admin-routes
docs/api-conventions
test/user-service-integration
refactor/auth-service
```

Avoid:

```text
my-branch
test
changes
new
final
final-v2
```

---

# 7. Commit Conventions

Use clear, atomic commits.

Recommended format:

```text
<type>: <short description>
```

Examples:

```text
feat: add user role management
fix: reject expired refresh tokens
refactor: extract user repository
test: cover admin authorization
docs: document API pagination
security: harden refresh token rotation
perf: add user listing index
chore: update dependencies
```

Keep commits focused.

Avoid commits such as:

```text
fix everything
changes
update
work
misc
```

---

## 7.1 Atomic Commits

Prefer:

```text
feat: add role repository
feat: add role service
feat: add role API contracts
test: cover role authorization
```

over:

```text
feat: implement entire RBAC system and refactor API
```

Large feature branches may still be represented by several focused commits.

---

# 8. Pull Request Workflow

A good PR should answer:

1. What changed?
2. Why was it needed?
3. How was it implemented?
4. What tests were added?
5. Does it change an API contract?
6. Does it require a database migration?
7. Does it change security behavior?
8. Does it change Admin UI behavior?
9. Are there deployment considerations?
10. Are there documentation updates?

---

## 8.1 PR Title

Use a concise title.

Examples:

```text
feat: add RBAC role management
fix: prevent cross-user todo access
security: strengthen refresh token rotation
docs: add database contribution guide
```

---

## 8.2 PR Description

Recommended structure:

```markdown
## Summary

Brief description of the change.

## Why

Why this change is required.

## Changes

- Change 1
- Change 2
- Change 3

## Testing

- Unit tests
- Integration tests
- E2E tests

## Database

- [ ] No migration
- [ ] Migration included

## API Contract

- [ ] No contract change
- [ ] Contract changed

## Security

- [ ] No security impact
- [ ] Security behavior changed

## Admin

- [ ] No Admin changes
- [ ] Admin updated

## Checklist

- [ ] Tests pass
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Documentation updated
```

---

# 9. Code Organization

Backend code should respect architectural boundaries.

Recommended:

```text
Route
  ↓
Service / Orchestrator
  ↓
Repository
  ↓
Prisma
```

### Route

Responsible for:

- HTTP method
- URL
- request validation
- authentication hooks
- authorization hooks/checks
- calling application logic
- response status
- response serialization

Routes should remain thin.

---

### Service

Responsible for:

- Business rules
- Use cases
- Business validation
- Coordination
- Transaction boundaries where appropriate
- Calling repositories
- Calling external services where appropriate

---

### Repository

Responsible for:

- Persistence
- Prisma queries
- Database-specific operations
- Query composition
- Persistence mapping

The repository should not become a second business-logic layer.

---

# 10. TypeScript Guidelines

Use TypeScript strictly.

Prefer explicit types at important boundaries.

Good:

```ts
async function getUserById(id: string): Promise<User | null> {
  // ...
}
```

Avoid unnecessary:

```ts
const data: any = something;
```

---

## 10.1 Avoid `any`

Do not introduce `any` unless there is a strong technical reason.

Prefer:

```ts
unknown;
```

with proper narrowing.

---

## 10.2 Avoid Type Assertions

Avoid unnecessary:

```ts
const user = data as User;
```

Prefer runtime validation when data comes from:

- HTTP requests
- external APIs
- environment variables
- queues
- files
- user input

---

## 10.3 Null and Undefined

Use the repository's established conventions consistently.

Do not randomly switch between:

```ts
null;
```

and:

```ts
undefined;
```

for API semantics.

API behavior should follow `API_CONVENTIONS.md`.

---

# 11. Fastify API Guidelines

Fastify route handlers should be small.

Preferred:

```ts
fastify.get(
  "/users/:id",
  {
    schema: getUserSchema,
    preHandler: [authenticate],
  },
  async (request, reply) => {
    const user = await userService.getUser({
      actor: request.user,
      userId: request.params.id,
    });

    return reply.send(user);
  },
);
```

Avoid putting all business logic inside the route.

Bad:

```ts
fastify.post("/users", async (request, reply) => {
  // validate fields
  // hash password
  // check duplicates
  // create role
  // write audit event
  // send email
  // construct response
  // ...
});
```

Move this behavior into appropriate application services/orchestrators.

---

## 11.1 Route Naming

Follow REST-oriented naming.

Prefer:

```text
GET    /users
GET    /users/:id
POST   /users
PATCH  /users/:id
DELETE /users/:id
```

Avoid inconsistent naming such as:

```text
GET /getUsers
POST /createUser
POST /deleteUser
```

Action endpoints may be appropriate for explicit state transitions or operations that do not map cleanly to CRUD.

---

## 11.2 Versioning

API endpoints should follow the established versioning convention:

```text
/api/v1/...
```

Do not silently introduce a second versioning strategy.

---

# 12. API Contract Guidelines

API contracts are shared between backend and Admin frontend.

Use the shared contracts package where appropriate:

```text
packages/api-contracts
```

Contracts should define:

- Request parameters
- Query parameters
- Request bodies
- Response bodies
- Error structures
- Pagination
- Enums
- Shared primitives

---

## 12.1 Contract Change Workflow

When changing an API:

```text
1. Update TypeBox contract
2. Update backend route
3. Update service if required
4. Update Admin API client
5. Update affected UI
6. Update tests
7. Update Swagger/OpenAPI output if applicable
8. Check backward compatibility
9. Update documentation
```

---

## 12.2 Do Not Leak Internal Models

Do not expose raw Prisma objects directly when doing so would expose:

- Password hashes
- Refresh token hashes
- Internal security fields
- Sensitive metadata
- Internal database fields
- Private administrative information

Map persistence models to API response models.

---

# 13. Service and Business Logic Guidelines

Services should represent meaningful business operations.

Examples:

```text
registerUser
authenticateUser
refreshSession
revokeSession
createTodo
updateUser
assignRole
removeRole
listUsers
```

Avoid generic services with unrelated responsibilities.

Bad:

```text
UserService
 ├── users
 ├── billing
 ├── email
 ├── reports
 └── system configuration
```

Prefer module boundaries.

---

## 13.1 Golden Orchestrator Pattern

When a use case coordinates multiple operations, use the project's orchestrator pattern.

Example:

```text
CreateUserOrchestrator
 ├── validate input
 ├── check authorization
 ├── create user
 ├── assign default role
 ├── write audit event
 └── return response
```

The orchestrator should coordinate.

It should not become a giant replacement for every layer.

---

# 14. Repository and Database Guidelines

Prisma access should remain behind the persistence boundary where practical.

Avoid scattering raw Prisma calls throughout routes.

Bad:

```ts
fastify.get("/users", async () => {
  return prisma.user.findMany();
});
```

Prefer:

```text
Route
 ↓
UserService
 ↓
UserRepository
 ↓
Prisma
```

---

## 14.1 Database Changes

Every schema change should consider:

- Migration safety
- Existing data
- Indexes
- Foreign keys
- Unique constraints
- Nullability
- Query performance
- Transaction behavior
- Rollback strategy
- Production deployment order

---

## 14.2 Indexes

Add indexes based on actual query patterns.

Common candidates:

- Foreign keys
- Unique identifiers
- Frequently filtered columns
- Frequently sorted columns
- Composite query patterns

Do not add indexes blindly.

Every index has:

- Storage cost
- Write cost
- Maintenance cost

---

## 14.3 Transactions

Use transactions when multiple writes must succeed or fail together.

Example:

```text
Create user
+
Assign role
+
Create audit event
```

If these operations form one atomic business operation, consider whether they should share a transaction.

Do not make every database call transactional by default.

---

## 14.4 Migrations

Never modify an already-applied production migration to "fix" history.

Create a new migration.

---

# 15. Authentication and Security Changes

Authentication changes are high-risk.

Before modifying:

- Login
- Registration
- Access tokens
- Refresh tokens
- Token rotation
- Logout
- Session revocation
- Password reset
- Email verification
- MFA
- Authentication middleware

read the security documentation.

---

## 15.1 Access Tokens

Access tokens should:

- Be short-lived
- Contain only necessary claims
- Be cryptographically signed
- Be validated on protected requests

Never store sensitive information inside JWT claims unnecessarily.

---

## 15.2 Refresh Tokens

Refresh-token flows must consider:

- Rotation
- Replay detection
- Revocation
- Expiration
- Secure storage
- Token family/session handling
- Logout behavior

Never log raw refresh tokens.

---

## 15.3 Passwords

Never:

- Log passwords
- Store plaintext passwords
- Return password hashes
- Include password fields in normal API responses

Use the project's approved password hashing implementation.

---

# 16. RBAC and Authorization Changes

Authorization must follow **default deny**.

The basic model is:

```text
Authentication
      ↓
Who is the caller?
      ↓
Authorization
      ↓
What may the caller do?
```

Never treat authentication as authorization.

---

## 16.1 Permission Checks

A permission should represent a meaningful capability.

Examples:

```text
users:read
users:create
users:update
users:delete

roles:read
roles:update

audit_logs:read
```

Avoid overly broad permissions such as:

```text
admin:everything
```

unless there is a deliberate super-admin model.

---

## 16.2 Object-Level Authorization

Checking:

```text
user has todos:read
```

may not be enough.

Also check:

```text
user may access THIS todo
```

This prevents IDOR vulnerabilities.

---

## 16.3 RBAC Changes Must Include Tests

At minimum, test:

```text
Unauthenticated
      ↓
Denied

Authenticated but no permission
      ↓
Denied

Authenticated + permission
      ↓
Allowed

Permission + wrong resource owner
      ↓
Denied
```

Also test privilege escalation scenarios.

---

# 17. Admin Frontend Contributions

The Admin frontend should consume the API through the established API client and shared contracts.

Avoid scattering direct `fetch()` calls throughout components.

Prefer:

```text
Component
 ↓
Hook
 ↓
API Client
 ↓
API
```

---

## 17.1 Data Fetching

Use the project's TanStack Query patterns.

Keep server state separate from local UI state.

Use:

- TanStack Query for server state
- Zustand where appropriate for client/application state
- React Router for routing

Do not duplicate server data in global state unnecessarily.

---

## 17.2 Permissions in the UI

The frontend may hide unavailable actions for usability.

However:

> UI permission checks are not security boundaries.

The API must enforce authorization independently.

Never rely on:

```ts
if (canDeleteUser) {
  // security decision
}
```

The backend must perform the actual authorization check.

---

## 17.3 Forms

Forms should have:

- Client-side validation
- Server-side validation
- Clear errors
- Loading state
- Success feedback
- Accessible labels
- Keyboard support

Client validation improves UX; it does not replace server validation.

---

## 17.4 Tables

Admin tables should consider:

- Pagination
- Sorting
- Filtering
- Search
- Loading state
- Empty state
- Error state
- Row-level actions
- Bulk actions where appropriate
- Permission-aware actions

Avoid fetching the entire dataset just to display a paginated table.

---

# 18. Validation and Error Handling

Validate all external input.

External input includes:

- HTTP params
- Query strings
- Request bodies
- Headers
- Cookies
- Environment variables
- Queue payloads
- Webhook payloads
- External API responses

---

## 18.1 Error Responses

Use the project's standardized error envelope.

Do not return inconsistent ad-hoc shapes such as:

```json
{
  "error": "something went wrong"
}
```

from one endpoint and:

```json
{
  "message": "failure"
}
```

from another.

Follow `API_CONVENTIONS.md`.

---

## 18.2 Error Information

Do not expose:

- Stack traces
- SQL queries
- Internal filesystem paths
- Secrets
- JWTs
- Password hashes
- Internal implementation details

in production API responses.

Detailed information belongs in controlled logs.

---

# 19. Testing Requirements

Every behavior change should have appropriate tests.

Testing layers include:

```text
Unit
 ↓
Integration
 ↓
Contract
 ↓
E2E
 ↓
Security
 ↓
Performance / smoke
```

Not every change needs every layer.

---

## 19.1 Minimum Expectations

### Bug fix

Add a regression test.

### New service

Add unit/integration coverage appropriate to its behavior.

### New API endpoint

Test:

- Success
- Validation failure
- Authentication
- Authorization
- Error behavior
- Important edge cases

### Authentication change

Test:

- Valid credentials
- Invalid credentials
- Expiration
- Revocation
- Rotation
- Replay behavior where applicable

### RBAC change

Test:

- Allowed permission
- Missing permission
- Wrong role
- Wrong resource
- Privilege escalation

### Database change

Test:

- Migration
- Relevant queries
- Constraints
- Important production-like behavior

### Admin UI change

Test:

- Rendering
- User interactions
- Loading/error/empty states
- Permission-aware behavior
- API integration where appropriate

See `TESTING.md` for the complete testing strategy.

---

# 20. Observability

New backend behavior should be observable when appropriate.

Consider:

- Structured logs
- Request IDs
- Metrics
- Error counts
- Latency
- Authentication failures
- Authorization failures
- Background job failures
- External service failures

Do not add noisy logging merely for visibility.

---

## 20.1 Sensitive Data in Logs

Never log:

```text
password
access token
refresh token
authorization header
session secret
database password
API key
```

Redact sensitive fields.

---

# 21. Background Jobs

Background work should not block HTTP requests unnecessarily.

Examples:

```text
HTTP request
   ↓
Create job
   ↓
Queue
   ↓
Worker
   ↓
External operation
```

Use the project's planned BullMQ/Redis architecture when background processing is required.

Jobs should consider:

- Retry behavior
- Idempotency
- Dead-letter handling
- Timeouts
- Observability
- Failure handling
- Duplicate execution

Do not introduce a queue for a task that can safely and cheaply execute synchronously.

---

# 22. Configuration and Environment Variables

Configuration should be centralized.

Prefer:

```text
Environment
 ↓
Configuration loader
 ↓
Validated application config
 ↓
Application
```

Avoid repeatedly reading:

```ts
process.env.SOMETHING;
```

throughout the codebase.

---

## 22.1 Startup Validation

Required configuration should fail fast.

Examples:

```text
Missing DATABASE_URL
Missing JWT_SECRET
Invalid PORT
Invalid CORS configuration
```

should be detected during startup rather than causing an obscure runtime failure.

---

## 22.2 Adding a New Variable

When adding an environment variable:

1. Add it to configuration validation.
2. Document it.
3. Update `.env.example` if applicable.
4. Define safe development behavior.
5. Consider production requirements.
6. Add tests where useful.

Never commit the actual secret value.

---

# 23. Documentation

Documentation is part of the implementation.

Update documentation when changing:

- Public APIs
- Authentication
- Authorization
- Database architecture
- Environment variables
- Deployment
- Operational behavior
- Admin workflows
- Security behavior
- Architecture
- Development commands

Relevant documents include:

```text
README.md
ARCHITECTURE.md
API_CONVENTIONS.md
SECURITY.md
RBAC.md
ADMIN_FRONTEND.md
TESTING.md
PRODUCTION_READINESS.md
ROADMAP.md
```

---

## 23.1 Documentation Quality

Prefer:

```text
What
Why
How
Example
Failure cases
Security implications
Testing
```

over documentation that only describes file names.

---

# 24. Dependencies

Before adding a dependency, ask:

1. Is it actually required?
2. Does the platform/framework already provide this capability?
3. Is the dependency maintained?
4. Is it compatible with the project's license?
5. Does it increase bundle size?
6. Does it introduce security risk?
7. Does it duplicate existing functionality?
8. Does it complicate deployment?

Avoid dependencies for trivial functionality.

---

## 24.1 Dependency Updates

Dependency upgrades should include:

- Changelog review
- Breaking-change review
- Test execution
- Typecheck
- Security review when relevant

Avoid combining large dependency upgrades with unrelated feature work.

---

# 25. Security and Secrets

Never commit:

```text
.env
private keys
JWT secrets
database passwords
API keys
cloud credentials
access tokens
refresh tokens
service-account credentials
```

If a secret is accidentally committed:

1. Treat it as compromised.
2. Rotate/revoke it.
3. Remove it from the repository.
4. Check repository history where appropriate.
5. Investigate whether it was accessed.
6. Document the incident if required.

Deleting the file from the latest commit is not enough if the secret remains in Git history.

---

## 25.1 Security Reporting

Do not publish sensitive security vulnerabilities as ordinary issue discussions before they can be responsibly assessed.

Use the repository's configured private security-reporting mechanism when available.

---

# 26. Performance

Performance changes should be evidence-driven.

Before optimizing:

```text
Measure
 ↓
Identify bottleneck
 ↓
Change
 ↓
Measure again
```

Consider:

- Database query count
- N+1 queries
- Query plans
- Indexes
- Payload size
- Serialization
- Cache behavior
- Network latency
- CPU
- Memory
- Connection pools

Do not optimize code merely because it "looks slow."

---

## 26.1 Admin Performance

Avoid:

```text
Fetch 100,000 users
 ↓
Filter in browser
 ↓
Display 20 users
```

Prefer:

```text
Browser
 ↓
API query/filter/pagination
 ↓
Database
 ↓
20 users
```

---

# 27. Backward Compatibility

Before changing an API, database model, or shared contract, determine whether existing clients depend on the current behavior.

Potentially breaking changes include:

- Removing fields
- Renaming fields
- Changing field types
- Changing status codes
- Changing authentication behavior
- Removing endpoints
- Changing required fields
- Changing enum values
- Changing pagination semantics

Prefer additive changes where possible.

---

## 27.1 Safe Evolution

Prefer:

```text
Old field remains
+
New field added
+
Clients migrate
+
Old field deprecated
+
Old field eventually removed
```

over immediate breaking changes.

---

# 28. Code Review Checklist

Reviewers should consider the following.

## Architecture

- [ ] Does the change respect module boundaries?
- [ ] Is business logic outside routes?
- [ ] Is persistence isolated?
- [ ] Are dependencies flowing in the correct direction?
- [ ] Does the change unnecessarily increase architectural complexity?

## API

- [ ] Is the endpoint naming consistent?
- [ ] Are HTTP methods/status codes appropriate?
- [ ] Are request inputs validated?
- [ ] Is the response contract defined?
- [ ] Is sensitive data excluded?
- [ ] Is pagination/filtering handled correctly?

## Authentication

- [ ] Is authentication required?
- [ ] Is token handling secure?
- [ ] Are sessions/revocation handled correctly?
- [ ] Are secrets protected?

## Authorization

- [ ] Is permission checking explicit?
- [ ] Is default deny maintained?
- [ ] Is resource ownership checked?
- [ ] Are privilege escalation paths considered?

## Database

- [ ] Is a migration required?
- [ ] Is the migration safe?
- [ ] Are constraints correct?
- [ ] Are indexes appropriate?
- [ ] Are transactions required?

## Testing

- [ ] Are tests included?
- [ ] Is there a regression test for bug fixes?
- [ ] Are negative paths tested?
- [ ] Are authorization failures tested?
- [ ] Are important edge cases covered?

## Frontend

- [ ] Does the Admin use the shared API client?
- [ ] Are loading/error/empty states handled?
- [ ] Are permissions reflected in the UI?
- [ ] Is backend authorization still enforced?

## Security

- [ ] Could user input reach an injection sink?
- [ ] Could sensitive data leak?
- [ ] Are logs safe?
- [ ] Are new endpoints rate-limited where appropriate?
- [ ] Are security headers/CORS implications understood?

## Operations

- [ ] Are logs/metrics needed?
- [ ] Are new environment variables documented?
- [ ] Are deployment changes documented?
- [ ] Are rollback implications understood?

## Documentation

- [ ] Is the README affected?
- [ ] Are relevant architecture docs updated?
- [ ] Are API docs updated?
- [ ] Are environment variables documented?

---

# 29. Definition of Done

A contribution is considered complete when applicable items are satisfied.

## Code

- [ ] Implementation is complete.
- [ ] Code follows existing conventions.
- [ ] No unnecessary duplication was introduced.
- [ ] No debugging code remains.
- [ ] No secrets are committed.

## API

- [ ] Request validation exists.
- [ ] Response contract exists.
- [ ] Error behavior is consistent.
- [ ] Authentication is correct.
- [ ] Authorization is correct.
- [ ] Sensitive fields are protected.

## Database

- [ ] Schema changes are reviewed.
- [ ] Migration exists if required.
- [ ] Indexes/constraints are appropriate.
- [ ] Data migration concerns are addressed.

## Frontend

- [ ] UI behavior is complete.
- [ ] API integration is correct.
- [ ] Loading/error/empty states are handled.
- [ ] Permission-aware UI is implemented where applicable.
- [ ] Accessibility is considered.

## Tests

- [ ] Relevant tests pass.
- [ ] New behavior has coverage.
- [ ] Regression tests exist for bug fixes.
- [ ] Security-sensitive behavior is tested.

## Quality

- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Formatting is correct.
- [ ] Build passes where applicable.

## Documentation

- [ ] Relevant documentation is updated.
- [ ] API changes are documented.
- [ ] Configuration changes are documented.
- [ ] Operational/security implications are documented.

## Review

- [ ] PR description is complete.
- [ ] Changes are focused.
- [ ] Review comments are resolved.
- [ ] CI passes.

---

# 30. Common Anti-Patterns

Avoid these patterns.

## 30.1 Fat Route Handlers

Bad:

```text
Route
 ├── validation
 ├── business rules
 ├── Prisma
 ├── authorization
 ├── email
 ├── audit
 └── response mapping
```

Prefer:

```text
Route
 ↓
Service / Orchestrator
 ↓
Repository
```

---

## 30.2 Raw Prisma Everywhere

Avoid:

```text
Route → Prisma
Controller → Prisma
Utility → Prisma
Admin helper → Prisma
```

Prefer a consistent persistence boundary.

---

## 30.3 Frontend-Only Authorization

Bad:

```text
Hide Delete button
```

and assume the user cannot delete.

Correct:

```text
Hide Delete button
+
API permission check
+
Resource authorization
```

---

## 30.4 Trusting Client Input

Never assume the Admin UI is trusted.

A malicious user can call the API directly.

The server must validate and authorize independently.

---

## 30.5 Returning Database Models Directly

Avoid exposing persistence models directly.

Use explicit API response contracts.

---

## 30.6 Logging Secrets

Never log:

```text
Authorization
Cookie
Password
JWT
Refresh Token
API Key
```

---

## 30.7 Giant Refactors in Feature PRs

Avoid:

```text
Add user feature
+
rewrite entire repository layer
+
rename every file
+
change linting
+
upgrade framework
```

Separate unrelated refactors.

---

## 30.8 Premature Infrastructure

Do not introduce:

```text
Kubernetes
Redis
Kafka
multiple services
distributed tracing
service mesh
```

simply because the project might need them someday.

Introduce infrastructure when there is a demonstrated requirement.

---

# 31. When to Ask for an Architecture Review

Request additional architecture review when a change affects:

### Public API

- New API version
- Breaking contract change
- Major authentication changes
- New pagination strategy

### Security

- Authentication
- JWT lifecycle
- Passwords
- MFA
- Authorization
- RBAC
- Secrets
- Session management

### Database

- Large schema changes
- Data migrations
- New persistence strategy
- High-volume tables
- Partitioning
- Major indexing strategy

### Infrastructure

- Redis
- Queues
- Workers
- Kubernetes
- Cloud architecture
- Service extraction

### Cross-cutting concerns

- Observability
- Caching
- Rate limiting
- Feature flags
- Multi-tenancy
- Distributed transactions

When in doubt, prefer a short design discussion before implementation rather than discovering architectural problems during review.

---

# 32. Contribution Examples

## Example A: Add a User Endpoint

Requirement:

```text
GET /api/v1/users/:id
```

Workflow:

```text
1. Define request/response contract
2. Add route
3. Add authentication
4. Add authorization
5. Add service method
6. Add repository query
7. Map Prisma model to API response
8. Add tests
9. Update Swagger/docs
10. Update Admin client if needed
```

---

## Example B: Add a User Role

Requirement:

```text
Allow administrators to assign roles.
```

Workflow:

```text
1. Review RBAC model
2. Update database schema if necessary
3. Create migration
4. Define role contracts
5. Add repository methods
6. Add authorization rules
7. Implement service/orchestrator
8. Add API endpoints
9. Add Admin UI
10. Add authorization tests
11. Add audit logging
12. Update documentation
```

---

## Example C: Fix an Authorization Bug

Requirement:

```text
A user can access another user's todo.
```

Workflow:

```text
1. Reproduce vulnerability
2. Add failing regression test
3. Identify authorization boundary
4. Implement object-level authorization
5. Add negative tests
6. Review similar endpoints
7. Verify logs do not expose sensitive information
8. Document security impact if appropriate
9. Run full security-relevant test suite
```

Do not fix only the single observed endpoint if the same vulnerability pattern exists elsewhere.

---

## Example D: Add a Database Field

Requirement:

```text
Add `displayName` to users.
```

Workflow:

```text
1. Update Prisma schema
2. Decide nullability/default
3. Create migration
4. Review migration SQL
5. Update API contract
6. Update response mapping
7. Update Admin form/table if applicable
8. Add tests
9. Update documentation
10. Verify backward compatibility
```

---

# 33. Final Checklist

Before submitting a contribution:

```text
[ ] I understand the existing architecture.
[ ] I checked for existing implementations.
[ ] I kept the change focused.
[ ] I followed TypeScript conventions.
[ ] I kept route handlers thin.
[ ] I respected service/repository boundaries.
[ ] I updated shared API contracts when needed.
[ ] I validated external input.
[ ] I checked authentication requirements.
[ ] I checked authorization requirements.
[ ] I considered object-level authorization.
[ ] I protected sensitive data.
[ ] I reviewed database/migration implications.
[ ] I added or updated tests.
[ ] I considered Admin frontend impact.
[ ] I considered observability.
[ ] I updated environment documentation if needed.
[ ] I updated relevant documentation.
[ ] I did not commit secrets.
[ ] I ran lint.
[ ] I ran typecheck.
[ ] I ran relevant tests.
[ ] I reviewed the final Git diff.
[ ] I wrote a clear PR description.
```

---

# Contribution Philosophy

Fastify-MasterApp should remain:

```text
Simple
   ↓
Structured
   ↓
Secure
   ↓
Typed
   ↓
Tested
   ↓
Observable
   ↓
Deployable
   ↓
Scalable
```

Contributions should strengthen this progression rather than bypass it.

The best contribution is not necessarily the one with the most code. It is the one that solves the problem **with the smallest clear change while preserving the architecture, security, maintainability, and developer experience of the project**.
