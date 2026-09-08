# API Conventions

## Fastify-MasterApp — API Design & Implementation Standard

**Status:** Proposed standard  
**Priority:** P0 — Core Architecture  
**Scope:** `apps/api` + `packages/api-contracts` + Admin consumers

---

## 1. Purpose

This document defines the conventions for designing, implementing, documenting, testing, and consuming APIs in Fastify-MasterApp.

The goal is to make every API module:

- predictable;
- type-safe;
- consistently validated;
- consistently documented;
- secure by default;
- easy to consume from the Admin frontend;
- easy to test;
- easy to extend without creating incompatible patterns.

A developer adding a new module should be able to follow this document without inventing a new API style.

---

# 2. API Architecture

The API should follow this general flow:

```text
HTTP Request
     ↓
Fastify Route
     ↓
Request Validation
     ↓
Authentication
     ↓
Authorization
     ↓
Feature/Application Logic
     ↓
Repository / Prisma
     ↓
Response Mapping
     ↓
HTTP Response
```

For complex workflows:

```text
Route
  ↓
Validation
  ↓
Authentication
  ↓
Authorization
  ↓
Orchestrator / Application Service
  ↓
Operations
  ↓
Repository
  ↓
Database
```

For simple CRUD:

```text
Route
  ↓
Validation
  ↓
Authentication
  ↓
Authorization
  ↓
Service / Repository
  ↓
Database
```

Do not force every endpoint through an orchestrator.

---

# 3. API Design Principles

Follow these principles:

1. Use resource-oriented HTTP APIs.
2. Use standard HTTP methods.
3. Validate every external input.
4. Return consistent response shapes.
5. Return consistent error shapes.
6. Keep authentication separate from authorization.
7. Keep authorization separate from business rules.
8. Never trust client-provided identity or permissions.
9. Keep database models separate from API response models.
10. Use shared TypeBox contracts.
11. Keep routes thin.
12. Keep business logic out of route definitions.
13. Use transactions for multi-step mutations.
14. Use pagination for potentially large collections.
15. Document every public endpoint.
16. Make behavior observable through request IDs and structured logs.
17. Prefer explicit behavior over framework magic.
18. Avoid breaking API changes without versioning or migration planning.

---

# 4. Base URL

Use a predictable API base path.

Recommended:

```text
/api
```

Example:

```text
GET /api/users
POST /api/users
GET /api/users/:id
PATCH /api/users/:id
DELETE /api/users/:id
```

If API versioning is required, prefer:

```text
/api/v1/users
```

Do not introduce versioning merely for the sake of having `/v1`.

Version when there is a genuine compatibility boundary.

---

# 5. Resource Naming

Use plural nouns.

Good:

```text
/users
/orders
/roles
/permissions
/audit-logs
/settings
```

Avoid:

```text
/getUsers
/createUser
/userList
/deleteUser
```

HTTP methods already communicate the operation.

---

# 6. HTTP Methods

Use:

```text
GET
POST
PUT
PATCH
DELETE
```

### GET

Read resources.

```http
GET /api/users
GET /api/users/123
```

### POST

Create resources or trigger a non-idempotent action.

```http
POST /api/users
```

### PUT

Replace a resource or replace a complete relationship collection.

Example:

```http
PUT /api/users/123/roles
```

meaning:

> Replace the user's complete role assignment set.

### PATCH

Partially update a resource.

```http
PATCH /api/users/123
```

### DELETE

Delete or remove a resource.

```http
DELETE /api/users/123
```

---

# 7. Endpoint Naming

Recommended:

```text
GET    /users
POST   /users
GET    /users/:id
PATCH  /users/:id
DELETE /users/:id
```

Nested resources are appropriate when the relationship is meaningful.

Example:

```text
GET /users/:id/roles
PUT /users/:id/roles
```

Avoid deeply nested paths such as:

```text
/users/:userId/orders/:orderId/items/:itemId/history
```

Prefer a dedicated resource when the relationship becomes complex.

---

# 8. HTTP Status Codes

Use standard status codes consistently.

## Success

### 200 OK

Successful read or update.

```text
GET
PATCH
```

### 201 Created

Successful resource creation.

```text
POST /users
```

### 204 No Content

Successful operation with no response body.

Common for:

```text
DELETE
```

Use it only when the client does not need a response payload.

---

## Client errors

### 400 Bad Request

Malformed request or invalid general request.

### 401 Unauthorized

No valid authentication.

Examples:

```text
Missing token
Invalid token
Expired session
```

### 403 Forbidden

Authenticated but not authorized.

Example:

```text
Missing users.delete permission
```

### 404 Not Found

Requested resource does not exist or is intentionally hidden.

### 409 Conflict

Request conflicts with current resource state.

Examples:

```text
Duplicate email
Duplicate role name
Concurrent state conflict
```

### 422 Unprocessable Entity

Use only if the API deliberately adopts 422 for semantically invalid input.

Do not randomly mix 400 and 422 across modules.

### 429 Too Many Requests

Rate limit exceeded.

---

## Server errors

### 500 Internal Server Error

Unexpected server-side failure.

Never expose:

```text
stack traces
Prisma internals
database connection strings
secrets
internal implementation details
```

---

# 9. Response Format

Use consistent response structures.

For a single resource:

```json
{
  "data": {
    "id": "123",
    "name": "Rohit"
  }
}
```

For collections:

```json
{
  "data": [
    {
      "id": "123",
      "name": "Rohit"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 100,
    "totalPages": 4
  }
}
```

The exact wrapper should be standardized across the API.

Do not have one module return:

```json
{
  "users": []
}
```

while another returns:

```json
{
  "data": []
}
```

unless there is a strong domain-specific reason.

---

# 10. Single Resource Response

Recommended:

```json
{
  "data": {
    "id": "usr_123",
    "email": "user@example.com",
    "name": "Rohit"
  }
}
```

For creation:

```http
POST /api/users
```

Response:

```http
201 Created
```

```json
{
  "data": {
    "id": "usr_123",
    "email": "user@example.com",
    "name": "Rohit"
  }
}
```

---

# 11. Collection Response

Recommended:

```json
{
  "data": [
    {
      "id": "usr_1",
      "name": "Alice"
    },
    {
      "id": "usr_2",
      "name": "Bob"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 240,
    "totalPages": 10
  }
}
```

Keep metadata predictable.

---

# 12. Pagination

All potentially large collections must support server-side pagination.

Recommended query parameters:

```text
?page=1&pageSize=25
```

Example:

```http
GET /api/users?page=2&pageSize=25
```

Defaults:

```text
page = 1
pageSize = 25
```

Recommended limits:

```text
minimum pageSize = 1
maximum pageSize = 100
```

The exact limits can be configured centrally.

Never allow unlimited collection queries on production endpoints unless the dataset is guaranteed to remain tiny.

---

# 13. Pagination Validation

Reject invalid values.

Examples:

```text
page=0
page=-1
pageSize=0
pageSize=-10
pageSize=1000000
```

Do not silently accept dangerous values.

Normalize or reject according to the API's global validation policy.

---

# 14. Cursor Pagination

Use cursor pagination when offset pagination becomes inefficient.

Example:

```http
GET /api/orders?limit=25&cursor=eyJpZCI6...
```

Response:

```json
{
  "data": [],
  "meta": {
    "nextCursor": "eyJpZCI6..."
  }
}
```

Use cursor pagination for:

- very large datasets;
- infinite scrolling;
- activity feeds;
- high-volume event data.

Do not introduce cursor pagination everywhere if standard pagination is sufficient.

---

# 15. Filtering

Use query parameters.

Example:

```http
GET /api/users?status=active&role=ADMIN
```

Multiple filters:

```text
/users
  ?status=active
  &role=ADMIN
  &createdAfter=2026-01-01
```

Validate every filter.

Do not accept arbitrary SQL-like filter expressions from clients.

---

# 16. Search

Use:

```text
search
```

for general textual search.

Example:

```http
GET /api/users?search=rohit
```

Define searchable fields explicitly.

For example:

```text
users.search
→ name
→ email
```

Do not automatically search every database column.

---

# 17. Sorting

Use explicit query parameters.

Recommended:

```text
sortBy=createdAt
sortOrder=desc
```

Example:

```http
GET /api/users?sortBy=createdAt&sortOrder=desc
```

Whitelist sortable fields.

Never pass arbitrary client-provided column names directly into database queries without validation.

---

# 18. Filtering + Pagination + Sorting

Standard list request:

```http
GET /api/users
  ?page=1
  &pageSize=25
  &search=rohit
  &status=active
  &sortBy=createdAt
  &sortOrder=desc
```

Every list endpoint should define:

```text
Supported filters
Supported sort fields
Default sort
Pagination behavior
Maximum page size
```

---

# 19. Request Validation

Every external input must be validated.

Validate:

```text
Path params
Query params
Request body
Headers when application-specific
```

Use TypeBox schemas.

Example:

```ts
const CreateUserSchema = Type.Object({
  email: Type.String({ format: "email" }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
});
```

Do not rely only on TypeScript types.

TypeScript disappears at runtime.

---

# 20. Shared Contracts

Keep reusable API contracts in:

```text
packages/api-contracts
```

Recommended structure:

```text
packages/api-contracts/
├── common/
│   ├── pagination.ts
│   ├── errors.ts
│   └── responses.ts
│
├── auth/
├── users/
├── roles/
├── permissions/
├── orders/
└── audit/
```

The API and Admin should consume the same schemas/types where appropriate.

---

# 21. Request vs Response Schemas

Do not automatically reuse the same schema for input and output.

For example:

```text
CreateUser
UpdateUser
UserResponse
UserListItem
```

A database record may contain:

```text
passwordHash
internalFlags
deletedAt
```

but the API response should not.

Define explicit response schemas.

---

# 22. Sensitive Fields

Never expose:

```text
passwordHash
refreshToken
accessToken
API secrets
private encryption keys
internal credentials
```

Even if they exist on a Prisma model.

Create an API-safe representation.

Example:

```ts
const UserResponseSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  name: Type.String(),
  status: Type.String(),
});
```

---

# 23. PATCH Semantics

PATCH should mean partial update.

Example:

```json
{
  "name": "New Name"
}
```

The API should update only the supplied fields.

Do not make PATCH unexpectedly replace the entire resource.

---

# 24. PUT Semantics

Use PUT when replacing a complete representation or relationship set.

Example:

```http
PUT /api/users/123/roles
```

Body:

```json
{
  "roleIds": ["role_admin", "role_support"]
}
```

Meaning:

> The user's role assignments are now exactly this set.

This is especially useful for RBAC.

---

# 25. DELETE Semantics

Use DELETE for resource removal.

Example:

```http
DELETE /api/users/123
```

If deletion is soft-delete, document it clearly.

Example:

```text
DELETE /users/:id
→ marks deletedAt
```

Do not make clients guess whether deletion is permanent.

---

# 26. Soft Delete

Use soft deletion only when the domain requires recovery, history, or referential integrity.

Example:

```text
deletedAt
deletedBy
```

If a resource is soft-deleted:

```text
GET /users
```

should normally exclude it.

Administrative recovery can use a separate endpoint if required:

```text
POST /users/:id/restore
```

Do not hide soft-delete semantics from API consumers.

---

# 27. Authentication

Authentication answers:

> Who is this caller?

Use the existing authentication mechanism consistently.

Protected routes should follow:

```text
authenticate
    ↓
request.user
```

Never trust:

```json
{
  "userId": "someone-else"
}
```

as the caller identity.

The authenticated identity must come from the trusted authentication mechanism.

---

# 28. Authorization

Authorization answers:

> Is this caller allowed to do this?

For Fastify-MasterApp:

```text
authenticate
    ↓
requirePermission("users.update")
```

Example:

```ts
preHandler: [authenticate, requirePermission("users.update")];
```

Keep permission checks close to route definitions.

---

# 29. Resource Authorization

RBAC may not be sufficient.

Example:

```text
orders.update
```

means the user can update orders.

But business rules may additionally require:

```text
Can this user update THIS order?
```

Use separate resource authorization:

```text
Permission check
    ↓
Resource policy
    ↓
Business operation
```

Do not overload generic RBAC middleware with domain-specific rules.

---

# 30. Route Organization

Keep route registration close to the feature.

Example:

```text
modules/users/
├── users.routes.ts
├── users.schemas.ts
├── users.service.ts
├── users.repository.ts
└── __tests__/
```

The route file should primarily define:

```text
HTTP method
URL
schemas
hooks
handler
```

Avoid large blocks of business logic in route callbacks.

---

# 31. Route Example

Conceptual:

```ts
fastify.get(
  "/users",
  {
    preHandler: [authenticate, requirePermission("users.read")],
    schema: {
      querystring: ListUsersQuerySchema,
      response: {
        200: ListUsersResponseSchema,
      },
    },
  },
  async (request, reply) => {
    const result = await usersService.list(request.query);

    return reply.code(200).send({
      data: result.items,
      meta: result.meta,
    });
  },
);
```

Keep it readable.

---

# 32. Service Layer

Use a service/application layer when business logic exists.

Example:

```text
users.service.ts
```

Responsibilities:

```text
Business rules
Transaction coordination
Calling repositories
Calling external services
Mapping domain operations
```

It should not be responsible for:

```text
HTTP headers
Fastify reply objects
HTTP routing
```

---

# 33. Repository Layer

Repositories should handle persistence concerns.

Example:

```text
users.repository.ts
```

Responsibilities:

```text
Prisma queries
Database-specific operations
Persistence mapping
```

Avoid putting HTTP concepts into repositories.

Bad:

```ts
repository.createUser(reply, request);
```

Good:

```ts
repository.createUser(data);
```

---

# 34. Prisma Boundary

Keep Prisma models internal to the API.

Do not expose raw Prisma objects directly.

Bad:

```ts
return prisma.user.findMany();
```

if this directly exposes internal database fields.

Better:

```text
Prisma
  ↓
Mapper
  ↓
API response
```

This gives the API freedom to change its database schema later.

---

# 35. Transactions

Use transactions when multiple writes must succeed or fail together.

Example:

```text
Create order
  ↓
Create order items
  ↓
Update inventory
  ↓
Write audit event
```

If these operations must be atomic:

```ts
await prisma.$transaction(...)
```

Do not use transactions indiscriminately for every read.

---

# 36. Idempotency

Use idempotency keys for operations where duplicate requests could cause harmful side effects.

Examples:

```text
Payment creation
Order submission
External webhook processing
Important job submission
```

Example:

```http
POST /api/orders
Idempotency-Key: 4b6f...
```

The server must define how long keys remain valid and what happens when the same key is reused with different payloads.

Do not add idempotency complexity to ordinary CRUD without a reason.

---

# 37. Concurrency

Consider concurrent updates for sensitive resources.

Possible strategies:

```text
Optimistic locking
Version field
UpdatedAt checks
Database constraints
Transactions
```

Example:

```text
Client reads version 4
Client updates version 4
Server sees current version 5
→ 409 Conflict
```

Use this where lost updates are a realistic problem.

---

# 38. Database Constraints

Do not rely solely on application checks.

Example:

```text
Check email exists
    ↓
Create user
```

Two requests can still race.

Use database uniqueness:

```text
@unique
```

and translate constraint failures into:

```text
409 Conflict
```

when appropriate.

---

# 39. Error Model

Use one API-wide error structure.

Recommended:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": {}
  }
}
```

Potential codes:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
RATE_LIMITED
INTERNAL_ERROR
```

Feature-specific codes are allowed when they provide useful client behavior.

Examples:

```text
USER_EMAIL_ALREADY_EXISTS
ROLE_CANNOT_BE_DELETED
LAST_ADMIN_PROTECTED
```

Keep codes stable.

Messages may evolve.

---

# 40. Validation Errors

For field validation, provide machine-readable details.

Example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": {
      "fields": {
        "email": "Must be a valid email address.",
        "name": "Name is required."
      }
    }
  }
}
```

The Admin frontend can use this to display field-level errors.

Do not require the frontend to parse human-readable error strings.

---

# 41. Error Mapping

Create a centralized error mapping strategy.

Conceptually:

```text
Domain error
    ↓
Known API error
    ↓
HTTP status
    ↓
Standard response
```

Examples:

```text
NotFoundError → 404
ForbiddenError → 403
ConflictError → 409
ValidationError → 400/422
Unknown error → 500
```

Do not expose arbitrary exception messages.

---

# 42. Not Found vs Authorization

Be deliberate about information leakage.

For sensitive resources, the API may intentionally return:

```text
404 Not Found
```

instead of:

```text
403 Forbidden
```

when revealing that the resource exists would expose information.

Document this behavior where used.

---

# 43. Request IDs

Every request should have a request/correlation ID.

Example:

```text
X-Request-ID: req_abc123
```

The ID should appear in:

```text
Logs
Error responses where appropriate
Tracing
Audit events
```

This lets operators correlate:

```text
Admin error
    ↓
API request ID
    ↓
Pino log
    ↓
Database/external operation
```

---

# 44. Structured Logging

Use structured logs.

Good:

```json
{
  "level": "info",
  "requestId": "req_123",
  "method": "PATCH",
  "route": "/users/:id",
  "statusCode": 200,
  "durationMs": 43
}
```

Avoid:

```text
User updated somehow!!!
```

Do not log:

```text
Passwords
Tokens
Authorization headers
Secrets
Sensitive request bodies
```

---

# 45. Audit Logging

Audit logging is different from ordinary application logs.

Application log:

```text
Request completed
```

Audit event:

```text
ADMIN_ROLE_ASSIGNED
```

Audit events should be durable and queryable.

Recommended fields:

```text
actorId
action
targetType
targetId
metadata
requestId
ip
userAgent
createdAt
```

---

# 46. Rate Limiting

Apply rate limits according to endpoint sensitivity.

Higher sensitivity:

```text
/login
/auth/refresh
/password operations
/admin mutations
```

Potentially lower sensitivity:

```text
health
public read endpoints
```

Do not use one arbitrary global rate limit for every endpoint without considering workload and security.

If a distributed deployment requires shared rate limits, Redis-backed rate limiting can be introduced.

---

# 47. CORS

Configure CORS explicitly.

Production should not blindly use:

```text
origin: "*"
```

for authenticated Admin APIs.

Prefer configured origins:

```text
https://admin.example.com
```

Allow only the methods and headers required by the application.

---

# 48. Security Headers

Use appropriate security headers through the existing Fastify security setup.

Do not disable security headers merely to fix a frontend integration problem without understanding the consequence.

---

# 49. Content Types

Use JSON for normal API requests and responses:

```text
application/json
```

Document exceptions such as:

```text
multipart/form-data
text/csv
application/octet-stream
```

Do not make different modules use different conventions for equivalent operations.

---

# 50. File Uploads

For file uploads:

```text
POST /files
```

or a domain-specific endpoint.

Define:

```text
Maximum size
Allowed MIME types
Allowed extensions
Storage destination
Virus/malware scanning requirements
Authentication
Authorization
Retention
```

Never trust the client-provided MIME type alone.

---

# 51. Date and Time

Use ISO 8601 timestamps.

Example:

```text
2026-09-06T18:30:00.000Z
```

Store timestamps in UTC where practical.

The API should not return ambiguous values such as:

```text
09/06/26 6:30 PM
```

Presentation/localization belongs to the frontend.

---

# 52. IDs

Use a consistent identifier strategy.

If the project uses CUID/UUID/string IDs, keep that convention consistent.

Do not expose database-specific auto-increment assumptions if the API contract does not need them.

Validate path IDs before database calls.

---

# 53. Enum Values

Use stable machine-readable enum values.

Example:

```text
ACTIVE
INACTIVE
SUSPENDED
```

Do not return display labels as the API contract:

```text
"Active User"
```

The Admin frontend can localize/display labels.

---

# 54. Boolean Fields

Use actual JSON booleans:

```json
{
  "active": true
}
```

Do not use:

```json
{
  "active": "true"
}
```

Validate query-string booleans explicitly because query parameters arrive as strings.

---

# 55. Null vs Missing

Define whether fields can be:

```text
missing
null
```

Example PATCH:

```json
{
  "displayName": null
}
```

could mean:

> Clear display name.

Whereas:

```json
{}
```

means:

> Do not change display name.

This distinction should be explicit in schemas.

---

# 56. API Versioning

Avoid unnecessary versions.

Use:

```text
/api/v1
```

when breaking compatibility is required.

Breaking changes include:

```text
Removing fields
Changing field meaning
Changing types
Changing authorization semantics
Changing pagination contract
Changing error contract
```

Additive changes are generally safer:

```text
Add optional response field
Add optional query parameter
Add new endpoint
```

Still evaluate client impact.

---

# 57. Deprecation

When deprecating an endpoint:

```text
1. Announce deprecation.
2. Document replacement.
3. Keep compatibility during migration.
4. Monitor usage.
5. Remove only after consumers migrate.
```

Where useful, communicate deprecation through HTTP headers and documentation.

---

# 58. Swagger / OpenAPI

Every public API endpoint should be represented in OpenAPI.

Document:

```text
Summary
Description
Parameters
Request body
Responses
Authentication
Authorization requirements
Examples
```

Example:

```text
GET /users
```

should clearly describe:

```text
Permission: users.read
Pagination
Filters
Sorting
200 response
401 response
403 response
```

The OpenAPI specification should be generated from or kept aligned with the actual Fastify schemas.

---

# 59. Schema-First Discipline

The Fastify route schema should be authoritative for runtime validation.

Recommended flow:

```text
TypeBox schema
     ↓
Fastify validation
     ↓
OpenAPI documentation
     ↓
Shared contract
     ↓
Admin TypeScript usage
```

Avoid maintaining separate definitions for:

```text
Runtime schema
Swagger schema
Frontend interface
```

when they describe the same contract.

---

# 60. API Contract Changes

Before changing an API contract, check:

```text
API
Admin
Tests
OpenAPI
Shared contracts
Other consumers
```

Do not change a response shape because it is convenient for one frontend component.

If a frontend needs a different view, consider:

```text
response mapper
dedicated endpoint
query parameter
view model
```

rather than leaking UI-specific concerns into domain models.

---

# 61. Admin-Oriented API Design

The Admin frontend is an important API consumer.

Admin endpoints should support:

```text
Pagination
Filtering
Sorting
Search
Bulk operations where justified
Permission metadata
Useful summaries
```

But do not create endpoints solely around individual UI components.

Bad:

```text
GET /dashboard-card-1
GET /dashboard-card-2
GET /user-table-row
```

Prefer domain-oriented APIs.

---

# 62. Dashboard API

Prefer aggregated endpoints when a page requires multiple related metrics.

Example:

```http
GET /api/admin/dashboard
```

Response:

```json
{
  "data": {
    "users": {
      "total": 1200,
      "active": 1100
    },
    "orders": {
      "total": 5400,
      "pending": 43
    }
  }
}
```

The API can optimize the underlying queries.

---

# 63. Bulk Operations

Use bulk endpoints when an operation is genuinely repeated and operationally useful.

Example:

```http
POST /api/users/bulk-status
```

Request:

```json
{
  "userIds": ["1", "2", "3"],
  "status": "ACTIVE"
}
```

Bulk operations must:

```text
Validate all input
Authorize the operation
Handle partial failures deliberately
Audit the operation
Avoid unbounded payload sizes
```

Do not create bulk endpoints for every CRUD operation by default.

---

# 64. Bulk Operation Response

For operations where partial success is possible:

```json
{
  "data": {
    "succeeded": ["1", "2"],
    "failed": [
      {
        "id": "3",
        "code": "USER_SUSPENDED",
        "message": "User cannot be updated."
      }
    ]
  }
}
```

Document whether the operation is:

```text
all-or-nothing
```

or:

```text
partial success
```

---

# 65. Business Actions

Not every action needs to look like CRUD.

Examples:

```text
POST /orders/:id/cancel
POST /users/:id/restore
POST /users/:id/activate
POST /users/:id/deactivate
```

These are appropriate when the action represents a meaningful domain transition.

Avoid RPC-style naming everywhere.

---

# 66. State Transitions

For stateful resources, validate transitions.

Example:

```text
PENDING
  ↓
PROCESSING
  ↓
COMPLETED
```

Do not allow:

```text
COMPLETED
  ↓
PENDING
```

unless the domain explicitly permits it.

The API must enforce state transitions.

The frontend should not be the only place that disables invalid actions.

---

# 67. Business Rule Location

Business rules belong in the API/domain layer.

Example:

```text
An order cannot be cancelled after shipment.
```

This must be enforced server-side.

Not only:

```tsx
if (order.status !== "SHIPPED") {
  showCancelButton();
}
```

The UI can improve the experience, but the API must enforce the rule.

---

# 68. External Services

When an endpoint calls external services:

```text
API
 ↓
Application service
 ↓
External service
```

Handle:

```text
Timeout
Retry
Circuit breaker
Failure mapping
Observability
Idempotency
```

Do not allow an external service's raw error to become the API response.

---

# 69. Background Jobs

Long-running work should not block HTTP requests unnecessarily.

Example:

```text
POST /reports
    ↓
create job
    ↓
202 Accepted
    ↓
worker
    ↓
process report
```

Response:

```json
{
  "data": {
    "jobId": "job_123",
    "status": "QUEUED"
  }
}
```

Use BullMQ or another queue when the workload justifies it.

Do not introduce background workers for simple synchronous operations.

---

# 70. 202 Accepted

Use:

```text
202 Accepted
```

when work has been accepted but is not complete.

Example:

```text
POST /exports
→ 202
```

with a job identifier.

Do not return 200 and pretend a long-running operation is complete.

---

# 71. Health Endpoints

Keep infrastructure endpoints separate from business APIs.

Examples:

```text
/health
/health/live
/health/ready
```

Liveness should answer:

> Is the process alive?

Readiness should answer:

> Can this instance accept traffic?

Do not make liveness depend on external databases if that would cause unnecessary restarts.

---

# 72. Metrics

Expose metrics separately:

```text
/metrics
```

Useful metrics:

```text
HTTP request count
HTTP latency
HTTP error count
Database latency
Queue depth
Worker failures
Authorization denials
```

Avoid high-cardinality labels such as raw user IDs.

---

# 73. API Performance

Before optimizing:

```text
Measure
  ↓
Identify bottleneck
  ↓
Optimize
  ↓
Measure again
```

Common problems:

```text
N+1 queries
Missing database indexes
Huge responses
Unbounded queries
Repeated permission lookups
Repeated external API calls
```

Use pagination and explicit selects.

---

# 74. Prisma Query Rules

Prefer selecting only fields needed by the API response.

Avoid blindly returning complete database records.

Example:

```ts
select: {
  id: true,
  name: true,
  email: true,
}
```

Use `include` deliberately.

Be careful with nested relationships that can create large payloads.

---

# 75. N+1 Prevention

Do not do:

```text
Get 100 users
  ↓
query roles for user 1
query roles for user 2
...
query roles for user 100
```

Prefer:

```text
Get users + required role data
```

or batched queries.

Measure before optimizing, but treat obvious N+1 patterns as defects.

---

# 76. API Security Checklist

Every protected endpoint should answer:

```text
[ ] Is authentication required?
[ ] Is authorization required?
[ ] Which permission is required?
[ ] Are all inputs validated?
[ ] Can the client influence identity?
[ ] Can the client influence authorization?
[ ] Are sensitive fields excluded?
[ ] Are resource-level rules enforced?
[ ] Are mutations audited where necessary?
[ ] Are rate limits appropriate?
[ ] Are errors safe?
```

---

# 77. API Testing Standard

Every endpoint should have tests for at least:

```text
Happy path
Validation failure
Authentication failure
Authorization failure
Not found
Conflict where applicable
Database/business failure
```

For list endpoints:

```text
Pagination
Filtering
Sorting
Search
```

For mutations:

```text
Valid mutation
Invalid input
Duplicate/conflict
Unauthorized user
Forbidden user
```

---

# 78. Contract Tests

Shared API contracts should be tested.

Verify:

```text
API response matches schema
Admin expectations match schema
```

This prevents accidental contract drift.

---

# 79. Integration Tests

Use the existing Fastify test harness for fast integration coverage.

Also maintain a smaller set of tests against real infrastructure where important.

Recommended:

```text
Fast tests
    ↓
mocked dependencies

Integration tests
    ↓
real PostgreSQL
```

Real database tests are especially useful for:

```text
Transactions
Unique constraints
Foreign keys
Prisma behavior
Migrations
```

---

# 80. Test Naming

Use behavior-oriented test names.

Good:

```text
returns 403 when user lacks users.delete permission
```

Good:

```text
returns 409 when email already exists
```

Avoid:

```text
test1
works
should pass
```

---

# 81. API Module Template

Recommended module:

```text
modules/users/
├── users.routes.ts
├── users.schemas.ts
├── users.service.ts
├── users.repository.ts
├── users.mapper.ts
├── users.types.ts
└── __tests__/
    ├── users.routes.test.ts
    └── users.service.test.ts
```

Not every module needs every file.

Use the smallest structure that keeps responsibilities clear.

---

# 82. Simple CRUD Module

For simple modules:

```text
modules/example/
├── example.routes.ts
├── example.schemas.ts
├── example.repository.ts
└── __tests__/
```

Do not create:

```text
controller
service
orchestrator
factory
manager
processor
handler
adapter
```

just because the folder exists in another module.

---

# 83. Complex Workflow Module

For complex business processes:

```text
modules/orders/
├── orders.routes.ts
├── orders.schemas.ts
├── orders.orchestrator.ts
├── operations/
│   ├── validate-order.ts
│   ├── reserve-inventory.ts
│   ├── create-order.ts
│   └── notify-customer.ts
├── orders.repository.ts
└── __tests__/
```

Use orchestration when the workflow has real multi-step semantics.

---

# 84. API Naming Conventions

Use consistent names.

Recommended:

```text
createUser
getUser
listUsers
updateUser
deleteUser
assignRoles
removeRole
```

Avoid mixing:

```text
createUser
fetchUserData
getAllUsers
modifyUserRecord
removeUserById
```

Consistency matters more than the exact naming choice.

---

# 85. File Naming

Use kebab-case or the repository's established convention consistently.

Example:

```text
users.routes.ts
users.schemas.ts
users.service.ts
users.repository.ts
users.mapper.ts
```

Do not mix:

```text
userService.ts
users_service.ts
UsersRepository.ts
```

within the same project.

---

# 86. Type Naming

Use explicit names.

Examples:

```ts
CreateUserInput;
UpdateUserInput;
UserResponse;
UserListItem;
ListUsersQuery;
ListUsersResponse;
```

Avoid generic:

```ts
Data;
Payload;
Response;
Result;
```

when the type's domain can be named.

---

# 87. API Contract Constants

Use shared constants for stable values.

Example:

```ts
export const PermissionKeys = {
  UsersRead: "users.read",
  UsersCreate: "users.create",
  UsersUpdate: "users.update",
  UsersDelete: "users.delete",
} as const;
```

Avoid duplicated raw strings throughout the codebase.

---

# 88. API Documentation

Each module should document:

```text
Purpose
Endpoints
Authentication
Permissions
Request examples
Response examples
Errors
Pagination
Filtering
Sorting
```

A developer should not need to read implementation code to understand how to consume an endpoint.

---

# 89. Changelog Discipline

When an API contract changes, document it.

Examples:

```text
Added users.status
Deprecated users.legacyStatus
Changed pagination metadata
Added roles endpoint
```

For breaking changes, include migration instructions.

---

# 90. Backward Compatibility

Prefer additive changes.

Safe examples:

```text
Add optional field
Add endpoint
Add optional query filter
Add new enum value only when clients tolerate unknown values
```

Potentially breaking:

```text
Remove field
Rename field
Change type
Change semantics
Make optional field required
Change error codes
Change pagination behavior
```

Review these carefully.

---

# 91. API Review Checklist

Before merging a new endpoint:

```text
Architecture
[ ] Correct module
[ ] Route is thin
[ ] Business logic is in the appropriate layer

Contract
[ ] TypeBox request schema
[ ] TypeBox response schema
[ ] Shared contract updated
[ ] OpenAPI documented

Security
[ ] Authentication
[ ] Authorization
[ ] Input validation
[ ] Sensitive data protected
[ ] Resource authorization where needed

Behavior
[ ] Correct HTTP method
[ ] Correct status codes
[ ] Consistent errors
[ ] Pagination for collections
[ ] Filters/sorting validated

Reliability
[ ] Transactions where needed
[ ] Idempotency where needed
[ ] External failures handled
[ ] Audit logging where required

Testing
[ ] Happy path
[ ] Validation
[ ] 401
[ ] 403
[ ] 404
[ ] 409 where applicable
[ ] Business-rule failures
[ ] Contract coverage
```

---

# 92. Recommended Implementation Workflow

When adding a new resource:

```text
1. Define domain/resource requirements
        ↓
2. Define permission requirements
        ↓
3. Define API request/response contracts
        ↓
4. Add TypeBox schemas
        ↓
5. Add database/repository operations
        ↓
6. Add business/application logic
        ↓
7. Add routes
        ↓
8. Add authentication/authorization
        ↓
9. Add OpenAPI documentation
        ↓
10. Add tests
        ↓
11. Add Admin API integration
        ↓
12. Review security + performance
```

Do not start by writing route handlers without defining the contract.

---

# 93. Example: Users API

## List

```http
GET /api/users?page=1&pageSize=25
```

Permission:

```text
users.read
```

Response:

```json
{
  "data": [
    {
      "id": "usr_123",
      "name": "Rohit",
      "email": "user@example.com",
      "status": "ACTIVE"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## Create

```http
POST /api/users
```

Permission:

```text
users.create
```

Request:

```json
{
  "name": "Rohit",
  "email": "user@example.com"
}
```

Response:

```http
201 Created
```

---

## Update

```http
PATCH /api/users/usr_123
```

Permission:

```text
users.update
```

Request:

```json
{
  "name": "New Name"
}
```

Response:

```http
200 OK
```

---

## Delete

```http
DELETE /api/users/usr_123
```

Permission:

```text
users.delete
```

Response:

```http
204 No Content
```

---

# 94. Example: RBAC API

Recommended:

```text
GET    /api/roles
POST   /api/roles
GET    /api/roles/:id
PATCH  /api/roles/:id
DELETE /api/roles/:id

GET    /api/permissions

GET    /api/users/:id/roles
PUT    /api/users/:id/roles
```

Permissions:

```text
roles.read
roles.create
roles.update
roles.delete
permissions.read
users.roles.read
users.roles.update
```

The API must prevent privilege escalation.

---

# 95. Example: Error Handling

Duplicate email:

```http
409 Conflict
```

```json
{
  "error": {
    "code": "USER_EMAIL_ALREADY_EXISTS",
    "message": "A user with this email already exists."
  }
}
```

Missing permission:

```http
403 Forbidden
```

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action."
  }
}
```

Invalid input:

```http
400 Bad Request
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": {
      "fields": {
        "email": "Must be a valid email address."
      }
    }
  }
}
```

---

# 96. What Not to Do

Avoid:

```text
POST /getUsers
POST /deleteUser
POST /updateUser
```

Avoid:

```text
return prisma.user.findMany()
```

when it exposes internal fields.

Avoid:

```text
if (user.role === "ADMIN")
```

everywhere.

Prefer permission-based authorization.

Avoid:

```text
frontend hides button → therefore operation is secure
```

The API must enforce authorization.

Avoid:

```text
GET /users
```

with no pagination for potentially large datasets.

Avoid arbitrary:

```text
sortBy=<client input>
```

without a whitelist.

Avoid exposing:

```text
stack trace
Prisma error
SQL
internal service URL
```

to API consumers.

---

# 97. Definition of Done

The API convention is successfully adopted when:

- [ ] Resources use consistent REST-oriented naming.
- [ ] HTTP methods are used correctly.
- [ ] Status codes are standardized.
- [ ] Response envelopes are consistent.
- [ ] Error envelopes are consistent.
- [ ] Pagination is standardized.
- [ ] Filtering is standardized.
- [ ] Sorting is validated.
- [ ] Search is standardized.
- [ ] TypeBox validates runtime input.
- [ ] Shared contracts are maintained.
- [ ] Prisma models are not directly exposed.
- [ ] Authentication is centralized.
- [ ] Authorization is centralized.
- [ ] RBAC uses permissions.
- [ ] Resource-level rules remain separate.
- [ ] Request IDs are available.
- [ ] Structured logging is used.
- [ ] Audit logging exists for sensitive operations.
- [ ] Swagger/OpenAPI is accurate.
- [ ] Critical endpoints have 401/403 tests.
- [ ] Real database integration tests cover important persistence behavior.
- [ ] Breaking changes follow a documented process.

---

# 98. Final Standard

Every API endpoint should be understandable through this model:

```text
                    REQUEST
                       │
                       ↓
                 Route Definition
                       │
                       ↓
                Schema Validation
                       │
                       ↓
                 Authentication
                       │
                       ↓
                 Authorization
                       │
                       ↓
              Business/Application Logic
                       │
                       ↓
                    Repository
                       │
                       ↓
                   PostgreSQL
                       │
                       ↓
                 Response Mapper
                       │
                       ↓
                  API Contract
                       │
                       ↓
                    RESPONSE
```

The key architectural rule is:

> **Routes describe HTTP. Services/orchestrators implement behavior. Repositories handle persistence. Contracts define the API boundary. Authentication identifies the caller. Authorization determines what the caller may do.**

If a new API feature follows these boundaries, it should fit naturally into Fastify-MasterApp without introducing a second architectural style.
