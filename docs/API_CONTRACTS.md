# API Contracts

## Fastify-MasterApp — Centralized API Contract Architecture

> **Status:** Proposed / Target Architecture  
> **Scope:** `apps/api`, `apps/admin`, `packages/api-contracts`, tests, and OpenAPI  
> **Primary principle:** The API contract is defined once at the shared boundary and consumed by every application that produces, consumes, documents, or tests the API.

---

## 1. Purpose

Fastify-MasterApp should not define the same API information independently in the backend, Admin frontend, tests, and documentation.

The following should have one canonical source:

- HTTP method
- URL path
- API version
- path parameters
- query parameters
- request body
- response body
- common response envelopes
- validation rules
- stable error codes
- authentication requirement
- permission metadata
- OpenAPI metadata
- pagination conventions
- filtering and sorting conventions
- endpoint deprecation metadata

The canonical source belongs in:

```text
packages/api-contracts/
```

The backend owns implementation.

The Admin frontend owns presentation and user interaction.

The database owns persistence.

The shared contract package owns the API boundary.

---

# 2. The Core Rule

Use this dependency direction:

```text
                    ┌─────────────────────────┐
                    │   packages/api-contracts│
                    │                         │
                    │ Paths                   │
                    │ Methods                 │
                    │ Request schemas         │
                    │ Response schemas        │
                    │ Error contracts         │
                    │ Auth metadata           │
                    │ Permission metadata     │
                    │ OpenAPI metadata        │
                    └────────────┬────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │   Fastify    │ │ React Admin  │ │    Tests     │
        │     API      │ │   Frontend   │ │              │
        └──────┬───────┘ └──────────────┘ └──────────────┘
               │
               ▼
        ┌──────────────┐
        │   Services   │
        │ Orchestrators│
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │ Repositories │
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │ Prisma / DB  │
        └──────────────┘
```

The shared contract package must **not** depend on:

- Fastify
- React
- React Admin
- Prisma
- database clients
- repositories
- service implementations
- environment-specific configuration
- server runtime state

---

# 3. What "Centralized API" Means

There are two levels of centralization.

## Level 1 — Centralized endpoint paths

Example:

```ts
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/api/v1/auth/login",
    LOGOUT: "/api/v1/auth/logout",
    REFRESH: "/api/v1/auth/refresh",
  },
};
```

This prevents duplicated URL strings.

Useful, but incomplete.

## Level 2 — Centralized API contracts

The stronger architecture centralizes the complete public API definition:

```text
Endpoint
├── method
├── path
├── path parameters
├── query parameters
├── request body
├── response schema
├── error schema
├── authentication requirement
├── permission requirement
├── pagination behavior
├── deprecation metadata
└── OpenAPI metadata
```

This document defines **Level 2**.

---

# 4. Goals

The centralized API contract architecture should provide:

1. One API definition.
2. Strong TypeScript typing.
3. Runtime validation through TypeBox.
4. Backend/frontend consistency.
5. Consistent errors.
6. Consistent authentication metadata.
7. Consistent authorization metadata.
8. OpenAPI generation from the same source.
9. Contract tests.
10. Less API drift.
11. Easier API versioning.
12. Easier Admin development.
13. Safer refactoring.
14. Better generated documentation.
15. Better developer experience.

---

# 5. Non-Goals

The shared contract package must not become the entire application.

Do not put these inside `packages/api-contracts`:

- business logic
- database queries
- Prisma models
- Fastify plugins
- Fastify request decorators
- service implementations
- repository implementations
- React components
- React hooks
- Zustand stores
- UI state
- database transactions
- external provider SDKs
- environment variables
- secrets
- runtime application state

The contract package describes **what the API looks like**, not **how the application implements it**.

---

# 6. Recommended Package Structure

Recommended target:

```text
packages/
└── api-contracts/
    ├── src/
    │   ├── api/
    │   │   ├── common/
    │   │   │   ├── api-version.ts
    │   │   │   ├── pagination.ts
    │   │   │   ├── sorting.ts
    │   │   │   ├── filtering.ts
    │   │   │   ├── errors.ts
    │   │   │   └── metadata.ts
    │   │   │
    │   │   ├── endpoints/
    │   │   │   ├── auth.ts
    │   │   │   ├── users.ts
    │   │   │   ├── roles.ts
    │   │   │   ├── permissions.ts
    │   │   │   ├── audit.ts
    │   │   │   ├── todos.ts
    │   │   │   ├── examples.ts
    │   │   │   ├── files.ts
    │   │   │   ├── jobs.ts
    │   │   │   ├── integrations.ts
    │   │   │   ├── feature-flags.ts
    │   │   │   ├── tenants.ts
    │   │   │   └── health.ts
    │   │   │
    │   │   ├── schemas/
    │   │   │   ├── auth.ts
    │   │   │   ├── users.ts
    │   │   │   ├── roles.ts
    │   │   │   ├── permissions.ts
    │   │   │   └── ...
    │   │   │
    │   │   ├── responses/
    │   │   │   ├── common.ts
    │   │   │   ├── auth.ts
    │   │   │   ├── users.ts
    │   │   │   └── ...
    │   │   │
    │   │   ├── errors/
    │   │   │   ├── codes.ts
    │   │   │   └── schemas.ts
    │   │   │
    │   │   ├── permissions/
    │   │   │   └── registry.ts
    │   │   │
    │   │   ├── metadata/
    │   │   │   └── openapi.ts
    │   │   │
    │   │   └── index.ts
    │   │
    │   └── index.ts
    │
    ├── package.json
    ├── tsconfig.json
    └── README.md
```

A smaller project can start with fewer files. The architectural boundary is more important than the exact folder count.

---

# 7. Canonical Ownership

| Concern                      | Owner                                 |
| ---------------------------- | ------------------------------------- |
| API path                     | `packages/api-contracts`              |
| HTTP method                  | `packages/api-contracts`              |
| Request schema               | `packages/api-contracts`              |
| Response schema              | `packages/api-contracts`              |
| Error code                   | `packages/api-contracts`              |
| Auth requirement metadata    | `packages/api-contracts`              |
| Permission metadata          | `packages/api-contracts`              |
| OpenAPI metadata             | `packages/api-contracts`              |
| Fastify route registration   | `apps/api`                            |
| Request handling             | `apps/api`                            |
| Business logic               | `apps/api`                            |
| Repository                   | `apps/api`                            |
| Prisma                       | `apps/api`                            |
| Database                     | PostgreSQL                            |
| UI behavior                  | `apps/admin`                          |
| UI routing                   | `apps/admin`                          |
| Server-state cache           | `apps/admin`                          |
| API transport implementation | `apps/admin`                          |
| Contract tests               | shared contract + test infrastructure |
| E2E tests                    | test application                      |

---

# 8. Why the Backend Must Consume the Contract

A common anti-pattern is:

```ts
fastify.post(
  "/api/v1/auth/login",
  {
    schema: {
      body: LoginBodySchema,
      response: {
        200: LoginResponseSchema,
      },
    },
  },
  loginHandler,
);
```

while the Admin separately has:

```ts
api.post("/api/v1/auth/login", payload);
```

and tests have:

```ts
app.inject({
  method: "POST",
  url: "/api/v1/auth/login",
});
```

The same API information is repeated three times.

The centralized design becomes:

```ts
const endpoint = AUTH_ENDPOINTS.LOGIN;

fastify.route({
  method: endpoint.method,
  url: endpoint.path,
  schema: endpoint.schema,
  handler: loginHandler,
});
```

The Admin consumes:

```ts
api.post(AUTH_ENDPOINTS.LOGIN.path, payload);
```

Tests consume:

```ts
app.inject({
  method: AUTH_ENDPOINTS.LOGIN.method,
  url: AUTH_ENDPOINTS.LOGIN.path,
});
```

Now the contract is defined once.

---

# 9. HTTP Method Definition

Use a small shared method type.

```ts
export const HttpMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];
```

Do not allow arbitrary method strings throughout the application.

---

# 10. API Version

The version should be centralized.

```ts
export const API_VERSION = "v1";

export const API_PREFIX = `/api/${API_VERSION}`;
```

Endpoints should not independently write:

```text
/api/v1
```

throughout the repository.

Prefer:

```ts
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: `${API_PREFIX}/auth/login`,
  },
};
```

or, preferably, endpoint objects:

```ts
export const AUTH_ENDPOINTS = {
  LOGIN: {
    method: "POST",
    path: `${API_PREFIX}/auth/login`,
  },
} as const;
```

---

# 11. Path Parameters

Path parameters are part of the contract.

Example:

```text
GET /api/v1/users/:userId
```

Contract:

```ts
export const USER_ENDPOINTS = {
  GET_BY_ID: {
    method: "GET",
    path: `${API_PREFIX}/users/:userId`,
    params: UserIdParamsSchema,
  },
};
```

The path and parameter schema must remain synchronized.

Do not hide path parameter requirements inside handler code.

---

# 12. Query Parameters

Query parameters should have an explicit schema.

Example:

```ts
export const UserListQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
    }),
  ),
  search: Type.Optional(Type.String({ minLength: 1 })),
});
```

The endpoint references the schema:

```ts
GET_BY_LIST: {
  method: "GET",
  path: `${API_PREFIX}/users`,
  query: UserListQuerySchema,
}
```

Do not parse arbitrary query strings manually in every route.

---

# 13. Request Body

Request bodies must be shared.

Example:

```ts
export const LoginBodySchema = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String({ minLength: 8 }),
});
```

The backend uses the schema for validation.

The Admin uses the TypeScript type derived from the schema.

Tests use the same contract to create valid and invalid payloads.

---

# 14. Response Schema

Every important endpoint should define its successful response.

Example:

```ts
export const LoginResponseSchema = Type.Object({
  user: UserSummarySchema,
  accessToken: Type.String(),
  expiresIn: Type.Integer(),
});
```

The endpoint contract references it.

This prevents the backend from returning one shape while the frontend expects another.

---

# 15. Never Put Secrets in Shared Response Contracts

Do not expose sensitive fields merely because they exist in the database.

Never share:

```ts
passwordHash;
refreshTokenHash;
resetTokenHash;
otpSecret;
internalSecurityMetadata;
```

unless a specific secure administrative contract explicitly requires a safe representation.

Prefer separate schemas:

```text
UserDatabaseModel
UserInternalModel
UserSummaryResponse
UserAdminResponse
```

Database models and API models are not the same thing.

---

# 16. Standard Response Envelope

If the API uses a response envelope, centralize it.

Example:

```ts
export const ApiSuccessSchema = <TSchema extends TSchema>(
  dataSchema: TSchema,
) =>
  Type.Object({
    success: Type.Literal(true),
    data: dataSchema,
    requestId: Type.String(),
  });
```

Example response:

```json
{
  "success": true,
  "data": {
    "id": "user_123"
  },
  "requestId": "req_abc"
}
```

If the project intentionally uses direct resource responses instead, document that decision and apply it consistently.

Do not mix response conventions randomly.

---

# 17. Error Contract

Errors are part of the API contract.

Example:

```ts
export const ApiErrorSchema = Type.Object({
  success: Type.Literal(false),
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    details: Type.Optional(Type.Unknown()),
  }),
  requestId: Type.String(),
});
```

Stable error codes should be centralized.

Example:

```ts
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  OTP_INVALID: "OTP_INVALID",
  OTP_EXPIRED: "OTP_EXPIRED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_REVOKED: "TOKEN_REVOKED",
} as const;
```

The frontend should branch on stable codes, not fragile message strings.

Bad:

```ts
if (error.message === "User already exists") {
}
```

Good:

```ts
if (error.code === "CONFLICT") {
}
```

---

# 18. Authentication Metadata

The API contract should describe whether an endpoint requires authentication.

Example:

```ts
auth: "public";
```

or:

```ts
auth: "required";
```

For example:

```ts
LOGIN: {
  method: "POST",
  path: `${API_PREFIX}/auth/login`,
  auth: "public",
  body: LoginBodySchema,
  response: LoginResponseSchema,
}
```

Protected endpoint:

```ts
GET_ME: {
  method: "GET",
  path: `${API_PREFIX}/users/me`,
  auth: "required",
  response: CurrentUserResponseSchema,
}
```

The metadata informs tooling and documentation.

Actual authentication enforcement remains in the API.

---

# 19. Permission Metadata

Permission metadata can also be centralized.

Example:

```ts
permission: "users.read";
```

or:

```ts
permission: "users.update";
```

Example:

```ts
UPDATE_USER: {
  method: "PATCH",
  path: `${API_PREFIX}/users/:userId`,
  auth: "required",
  permission: "users.update",
  params: UserIdParamsSchema,
  body: UpdateUserBodySchema,
  response: UserResponseSchema,
}
```

Important:

> Permission metadata does not replace runtime authorization.

The Fastify application must still evaluate the authenticated user's actual permissions and resource scope.

---

# 20. Permission Registry

Permissions should have one canonical registry.

Example:

```ts
export const PERMISSIONS = {
  USERS_READ: "users.read",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",

  ROLES_READ: "roles.read",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",

  AUDIT_READ: "audit.read",
} as const;
```

Then endpoint metadata references the registry:

```ts
permission: PERMISSIONS.USERS_UPDATE;
```

This prevents spelling drift.

---

# 21. Authentication Is Not Authorization

Do not confuse:

```text
auth: "required"
```

with:

```text
permission: "users.update"
```

Authentication answers:

> Who is this caller?

Authorization answers:

> Is this caller allowed to perform this operation?

Resource authorization may additionally answer:

> Is this caller allowed to operate on this particular resource?

---

# 22. Example Complete Endpoint Contract

A practical endpoint definition can look like:

```ts
export const UPDATE_USER = {
  method: "PATCH",
  path: `${API_PREFIX}/users/:userId`,

  auth: "required",

  permission: PERMISSIONS.USERS_UPDATE,

  params: UserIdParamsSchema,

  body: UpdateUserBodySchema,

  response: {
    200: UserResponseSchema,
  },

  errors: [
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.VALIDATION_ERROR,
  ],

  summary: "Update a user",

  tags: ["Users"],
} as const;
```

This becomes the central description of the endpoint.

---

# 23. Endpoint Contract Type

Avoid excessive generic abstraction at first.

A simple type is enough:

```ts
import type { TSchema } from "@sinclair/typebox";

export type ApiEndpoint = {
  method: HttpMethod;
  path: string;

  auth: "public" | "required";

  permission?: string;

  params?: TSchema;
  query?: TSchema;
  body?: TSchema;

  response?: Record<number, TSchema>;

  errors?: readonly string[];

  summary?: string;
  description?: string;
  tags?: readonly string[];

  deprecated?: boolean;
};
```

This can evolve as the application grows.

Do not build a framework inside the contract package before the application needs it.

---

# 24. Endpoint Definitions Should Be Readable

Prefer:

```ts
export const AUTH_ENDPOINTS = {
  REGISTER: {
    method: "POST",
    path: `${API_PREFIX}/auth/register`,
    auth: "public",
    body: RegisterBodySchema,
    response: {
      201: RegisterResponseSchema,
    },
    tags: ["Authentication"],
  },

  LOGIN: {
    method: "POST",
    path: `${API_PREFIX}/auth/login`,
    auth: "public",
    body: LoginBodySchema,
    response: {
      200: LoginResponseSchema,
    },
    tags: ["Authentication"],
  },

  REFRESH: {
    method: "POST",
    path: `${API_PREFIX}/auth/refresh`,
    auth: "public",
    body: RefreshTokenBodySchema,
    response: {
      200: RefreshResponseSchema,
    },
    tags: ["Authentication"],
  },
} as const;
```

Readable contracts are easier to review than highly abstract DSLs.

---

# 25. Fastify Route Adapter

The Fastify layer should consume the shared contract.

Conceptually:

```ts
import { AUTH_ENDPOINTS } from "@fastify-masterapp/api-contracts";

fastify.route({
  method: AUTH_ENDPOINTS.LOGIN.method,
  url: AUTH_ENDPOINTS.LOGIN.path,
  schema: {
    body: AUTH_ENDPOINTS.LOGIN.body,
    response: AUTH_ENDPOINTS.LOGIN.response,
  },
  handler: loginHandler,
});
```

The route remains an adapter.

It connects:

```text
HTTP contract
      ↓
Fastify
      ↓
handler
      ↓
service
```

---

# 26. What the Route Still Owns

The route implementation may own:

- Fastify-specific registration
- handler binding
- request context extraction
- Fastify decorators
- authentication hooks
- authorization middleware integration
- request logging context
- Fastify-specific serialization configuration

The route must not duplicate:

- path
- request schema
- response schema
- error definitions

when those already exist in the shared contract.

---

# 27. Handler Responsibilities

A handler should translate HTTP into application operations.

Example:

```text
Fastify request
      ↓
validate using contract
      ↓
authenticate
      ↓
authorize
      ↓
extract input
      ↓
call service
      ↓
map result
      ↓
return contract response
```

Handlers should remain thin.

Do not move business logic into the shared package.

---

# 28. Service Responsibilities

Services own application behavior.

Example:

```ts
userService.updateUser({
  actorId,
  userId,
  input,
});
```

The service can:

- enforce business rules
- call repositories
- execute transactions
- publish events
- create audit events
- call integrations
- schedule background jobs

The contract package does none of these.

---

# 29. Repository Responsibilities

Repositories own persistence access.

Example:

```text
UserService
    ↓
UserRepository
    ↓
Prisma
    ↓
PostgreSQL
```

The repository should not determine the public HTTP path.

---

# 30. Admin Frontend Consumption

The React Admin application should import the same contract.

Example:

```ts
import { USER_ENDPOINTS } from "@fastify-masterapp/api-contracts";
```

Then:

```ts
api.get(USER_ENDPOINTS.GET_ME.path);
```

The Admin should not contain:

```ts
"/api/v1/users/me";
```

when that path already exists in the contract package.

---

# 31. Typed Admin API Client

Build a thin client around the contract.

Conceptually:

```ts
export async function getCurrentUser() {
  return apiClient.request(USER_ENDPOINTS.GET_ME);
}
```

The API client can eventually infer:

- method
- path
- request types
- response types
- errors

The goal is:

```text
Admin feature
      ↓
typed API client
      ↓
shared API contract
      ↓
HTTP
      ↓
Fastify API
```

---

# 32. Do Not Put React Logic in Contracts

Bad:

```ts
export const USERS_PAGE_ENDPOINT = {
  path: "/api/v1/users",
  component: UsersPage,
};
```

Do not do this.

The contract package should remain framework-neutral.

Good:

```ts
export const USER_ENDPOINTS = {
  LIST: {
    method: "GET",
    path: "/api/v1/users",
    query: UserListQuerySchema,
  },
};
```

---

# 33. OpenAPI

OpenAPI should be generated from the same API contract whenever practical.

The goal is:

```text
Central Contract
      ├── Fastify
      ├── Admin Client
      ├── Tests
      └── OpenAPI / Swagger
```

Do not maintain a completely separate OpenAPI specification manually if it can be derived from the actual TypeBox contracts.

---

# 34. OpenAPI Metadata

Endpoint metadata can contain:

```ts
summary: "List users",
description: "Returns a paginated list of users",
tags: ["Users"],
```

Additional OpenAPI-specific metadata can be kept in a dedicated field if needed.

Avoid polluting business logic with documentation concerns.

---

# 35. Swagger Route

The existing API documentation route can continue exposing:

```text
/api/v1/...
```

through Swagger/OpenAPI.

The important architectural rule is:

```text
Contract → OpenAPI
```

rather than:

```text
Fastify route → manually copied documentation
```

where possible.

---

# 36. Request Schema Composition

Use shared common schemas.

Example:

```ts
export const UUIDSchema = Type.String({
  format: "uuid",
});
```

Then:

```ts
export const UserIdParamsSchema = Type.Object({
  userId: UUIDSchema,
});
```

Avoid redefining the same primitive constraints everywhere.

---

# 37. Pagination Contract

Pagination should be centralized.

Example:

```ts
export const PaginationQuerySchema = Type.Object({
  page: Type.Optional(
    Type.Integer({
      minimum: 1,
      default: 1,
    }),
  ),

  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      default: 25,
    }),
  ),
});
```

Response:

```ts
export const PaginationMetaSchema = Type.Object({
  page: Type.Integer(),
  limit: Type.Integer(),
  total: Type.Integer(),
  totalPages: Type.Integer(),
});
```

---

# 38. Cursor Pagination

For large datasets, define a separate contract.

```ts
export const CursorPaginationQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String()),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
    }),
  ),
});
```

Do not mix page and cursor semantics in an undocumented way.

---

# 39. Sorting

Centralize sort conventions.

Example:

```ts
export const SortDirectionSchema = Type.Union([
  Type.Literal("asc"),
  Type.Literal("desc"),
]);
```

A resource can then define allowed fields.

Do not accept arbitrary database column names from clients.

---

# 40. Filtering

Filters should be explicitly defined.

Bad:

```text
?sort=DROP TABLE
```

or generic unrestricted field access.

Good:

```ts
export const UserListQuerySchema = Type.Object({
  search: Type.Optional(Type.String()),
  status: Type.Optional(UserStatusSchema),
  sortBy: Type.Optional(
    Type.Union([
      Type.Literal("createdAt"),
      Type.Literal("email"),
      Type.Literal("name"),
    ]),
  ),
  sortDirection: Type.Optional(SortDirectionSchema),
});
```

The API contract defines the public filter surface.

---

# 41. Bulk Operations

Bulk endpoints require explicit contracts.

Example:

```text
POST /api/v1/users/bulk-delete
```

Contract:

```ts
export const BulkDeleteUsersBodySchema = Type.Object({
  userIds: Type.Array(UserIdSchema, {
    minItems: 1,
    maxItems: 100,
  }),
});
```

The Admin can consume exactly the same limit.

---

# 42. State Transition Endpoints

Business actions should be explicit.

Instead of:

```text
PATCH /orders/:id
{
  "status": "approved"
}
```

consider:

```text
POST /orders/:id/approve
```

when approval is a meaningful business operation.

The contract makes this distinction visible.

---

# 43. Authentication Contract Surface

Authentication endpoints should be grouped.

Recommended:

```text
auth/
├── register
├── verify-email
├── resend-verification
├── login
├── refresh
├── logout
├── logout-all
├── forgot-password
├── verify-reset-otp
├── reset-password
├── change-password
├── change-email
└── verify-otp
```

Each endpoint has its own request and response contract.

Do not create one enormous generic authentication schema.

---

# 44. User Contracts

Recommended:

```text
users/
├── list
├── get-by-id
├── me
├── create
├── update
├── delete
├── activate
└── deactivate
```

Each endpoint should explicitly define:

- input
- output
- authorization
- errors

---

# 45. Role Contracts

Recommended:

```text
roles/
├── list
├── get-by-id
├── create
├── update
├── delete
├── assign
└── revoke
```

Permissions should be referenced from the centralized permission registry.

---

# 46. Audit Contracts

Audit endpoints should define:

```text
audit/
├── list
├── get-by-id
└── export
```

The response should never expose sensitive internal metadata accidentally.

---

# 47. Health Contracts

Health endpoints are special but should still have explicit response contracts.

Examples:

```text
GET /health
GET /ready
GET /metrics
```

Health/readiness responses should remain stable enough for deployment tooling and monitoring.

---

# 48. External Integration Contracts

For integrations, distinguish:

```text
Internal API Contract
        ↓
Integration Service
        ↓
Provider Adapter
        ↓
External API
```

Do not put provider-specific API definitions into the core application contract unless the provider API is intentionally exposed publicly.

---

# 49. Webhook Contracts

Inbound webhooks should have versioned contracts.

Example:

```text
POST /api/v1/webhooks/payment-provider
```

The webhook request schema belongs to the integration boundary.

It should include:

- provider event type
- event ID
- payload
- signature metadata where appropriate
- version
- timestamp if supplied

Signature verification remains backend implementation.

---

# 50. Background Job Contracts

Internal queue jobs are not HTTP endpoints.

Do not force them into the HTTP API contract.

However, they should use a similar contract discipline:

```text
Job name
Version
Payload
Result
Error classification
Idempotency key
```

Keep queue contracts separate:

```text
packages/
├── api-contracts/
└── job-contracts/
```

if job volume and complexity justify it.

---

# 51. Event Contracts

Domain/integration events should also be separate from HTTP contracts.

Example:

```text
UserRegistered
PasswordResetRequested
RoleAssigned
AuditEventCreated
```

Recommended separation:

```text
API Contract
    = HTTP boundary

Job Contract
    = asynchronous work boundary

Event Contract
    = durable fact/event boundary
```

Do not combine all three into one giant abstraction.

---

# 52. Error Mapping

The backend may have internal errors:

```ts
UserNotFoundError;
PermissionDeniedError;
InvalidOtpError;
PrismaUniqueConstraintError;
```

These are implementation details.

They should be mapped to stable API error codes:

```text
UserNotFoundError
        ↓
NOT_FOUND

PermissionDeniedError
        ↓
FORBIDDEN

InvalidOtpError
        ↓
OTP_INVALID
```

The frontend receives the stable contract.

---

# 53. Validation

TypeBox should define runtime request validation.

Conceptually:

```text
Client request
      ↓
Fastify
      ↓
TypeBox validation
      ↓
Handler
      ↓
Service
```

The same schema produces TypeScript types for the application.

This reduces divergence between compile-time and runtime expectations.

---

# 54. Schema Type Inference

Example:

```ts
export const CreateUserBodySchema = Type.Object({
  email: Type.String({ format: "email" }),
  name: Type.String({ minLength: 1 }),
});

export type CreateUserBody = Static<typeof CreateUserBodySchema>;
```

The contract becomes both:

```text
runtime validation
```

and:

```text
compile-time type information
```

---

# 55. Request vs Response Types

Keep request and response schemas separate.

Bad:

```ts
UserSchema;
```

used everywhere.

Good:

```text
CreateUserBodySchema
UpdateUserBodySchema
UserParamsSchema
UserListQuerySchema
UserResponseSchema
UserListResponseSchema
```

Different API operations often have different security and validation requirements.

---

# 56. PATCH Semantics

PATCH schemas should explicitly define optional fields.

Example:

```ts
export const UpdateUserBodySchema = Type.Object({
  name: Type.Optional(Type.String()),
  status: Type.Optional(UserStatusSchema),
});
```

Do not accidentally make every field required.

PATCH semantics should be documented.

---

# 57. PUT Semantics

If PUT is supported, define replacement semantics clearly.

Do not let PUT silently behave like PATCH.

The contract should communicate the intended semantics.

---

# 58. DELETE Semantics

Define whether DELETE means:

- hard delete
- soft delete
- archive
- deactivate

Do not make clients infer this from the HTTP method.

---

# 59. Status Codes

Status codes are part of the contract.

Examples:

```text
200 OK
201 Created
202 Accepted
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
503 Service Unavailable
```

The contract should document expected successful responses and important error classes.

---

# 60. Authentication Status Codes

Recommended:

```text
401
```

when authentication is missing or invalid.

```text
403
```

when the caller is authenticated but lacks authorization.

Do not use `403` for every authentication failure.

---

# 61. Rate Limiting Contract

Rate-limited endpoints should expose a consistent contract.

Expected:

```text
429 Too Many Requests
```

with appropriate:

```text
Retry-After
```

when available.

The frontend should recognize `429` as a rate-limit condition rather than an authentication failure.

---

# 62. Request IDs

A request ID should be represented consistently.

Example response:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action."
  },
  "requestId": "req_123"
}
```

This allows:

```text
Admin
  ↓
requestId
  ↓
support / logs / tracing
```

The request ID is not a secret.

---

# 63. Correlation Metadata

Where appropriate, the contract can document headers such as:

```text
X-Request-ID
```

or equivalent infrastructure conventions.

Do not expose internal tracing details unnecessarily.

---

# 64. Content Types

Define expected content types.

Typical JSON:

```text
application/json
```

File upload:

```text
multipart/form-data
```

Downloads may use:

```text
application/octet-stream
```

or a specific MIME type.

The contract should make content handling explicit.

---

# 65. File Upload Contracts

File upload APIs should explicitly define:

- upload mode
- filename
- size
- content type
- purpose
- related resource
- upload ID

For signed-upload architectures, separate:

```text
Create upload intent
      ↓
Client uploads directly
      ↓
Finalize upload
      ↓
Worker scans/processes
```

The API contract should represent these steps explicitly.

---

# 66. Security Rules for Contracts

Never include secrets in:

- request examples
- response examples
- test fixtures committed to source
- OpenAPI examples
- generated documentation

Use placeholders such as:

```text
example-token
```

rather than real credentials.

---

# 67. Contract and RBAC

The contract may say:

```ts
permission: PERMISSIONS.USERS_UPDATE;
```

but authorization remains runtime behavior.

The server must verify:

```text
authenticated identity
        ↓
active account
        ↓
roles
        ↓
permissions
        ↓
tenant scope
        ↓
resource ownership/access
        ↓
operation allowed
```

The contract is descriptive.

The security layer is authoritative.

---

# 68. Resource-Level Authorization

A permission like:

```text
users.update
```

does not automatically mean the caller can update every user.

The API may additionally require:

```text
tenant membership
resource scope
ownership
organizational boundary
```

This logic belongs in the API authorization/service layer.

---

# 69. API Contract Does Not Replace RBAC

Do not implement:

```ts
if (endpoint.permission === user.permission) {
  allow();
}
```

inside the shared package.

The shared package has no authenticated user context.

The backend authorization layer owns the decision.

---

# 70. Endpoint Registry

A central registry can aggregate endpoint definitions.

Example:

```ts
export const API_CONTRACTS = {
  AUTH: AUTH_ENDPOINTS,
  USERS: USER_ENDPOINTS,
  ROLES: ROLE_ENDPOINTS,
  PERMISSIONS: PERMISSION_ENDPOINTS,
  AUDIT: AUDIT_ENDPOINTS,
  HEALTH: HEALTH_ENDPOINTS,
} as const;
```

This gives tooling one root object without forcing every module into one file.

---

# 71. Why Not One Huge File?

Avoid:

```text
api-contracts.ts
```

containing thousands of lines.

Prefer:

```text
endpoints/
├── auth.ts
├── users.ts
├── roles.ts
├── permissions.ts
└── audit.ts
```

and aggregate them:

```ts
export const API_CONTRACTS = {
  AUTH: AUTH_ENDPOINTS,
  USERS: USER_ENDPOINTS,
  ROLES: ROLE_ENDPOINTS,
  PERMISSIONS: PERMISSION_ENDPOINTS,
  AUDIT: AUDIT_ENDPOINTS,
};
```

Centralized does not mean physically one file.

It means one authoritative package.

---

# 72. Centralized Does Not Mean Coupled

The goal is:

```text
Centralized contract
```

not:

```text
Centralized application implementation
```

Good:

```text
Shared contract
   ├── API
   ├── Admin
   ├── tests
   └── OpenAPI
```

Bad:

```text
Shared package
   ├── Fastify
   ├── Prisma
   ├── React
   ├── business logic
   └── database
```

---

# 73. Package Boundary

`packages/api-contracts/package.json` should remain lightweight.

Conceptually:

```json
{
  "name": "@fastify-masterapp/api-contracts",
  "private": true,
  "dependencies": {
    "@sinclair/typebox": "..."
  }
}
```

Avoid adding:

```text
fastify
prisma
react
react-router
zustand
```

just to define API contracts.

---

# 74. Import Direction

Recommended:

```text
apps/api
    └── depends on api-contracts

apps/admin
    └── depends on api-contracts
```

Not:

```text
api-contracts
    └── depends on apps/api
```

and not:

```text
api-contracts
    └── depends on apps/admin
```

Shared packages must sit below applications in the dependency graph.

---

# 75. Avoid Circular Dependencies

Never create:

```text
api-contracts
   ↓
api
   ↓
api-contracts
```

If the API needs something from the contract package, it should import it directly.

The contract package must remain independent.

---

# 76. Contract Export Strategy

Use explicit exports.

Example:

```ts
// src/api/index.ts

export * from "./common/api-version";
export * from "./common/pagination";
export * from "./common/errors";

export * from "./endpoints/auth";
export * from "./endpoints/users";
export * from "./endpoints/roles";
export * from "./endpoints/permissions";
export * from "./endpoints/audit";
```

Root:

```ts
// src/index.ts

export * from "./api";
```

Consumers can then use:

```ts
import {
  AUTH_ENDPOINTS,
  USER_ENDPOINTS,
  PERMISSIONS,
} from "@fastify-masterapp/api-contracts";
```

---

# 77. Naming Conventions

Use:

```text
AUTH_ENDPOINTS
USER_ENDPOINTS
ROLE_ENDPOINTS
PERMISSION_ENDPOINTS
AUDIT_ENDPOINTS
```

Schemas:

```text
LoginBodySchema
LoginResponseSchema
UserResponseSchema
UserListQuerySchema
```

Types:

```text
LoginBody
LoginResponse
UserResponse
UserListQuery
```

Permissions:

```text
USERS_READ
USERS_UPDATE
ROLES_MANAGE
```

Error codes:

```text
INVALID_CREDENTIALS
TOKEN_EXPIRED
FORBIDDEN
NOT_FOUND
```

---

# 78. Example Authentication Contract

```ts
export const AUTH_ENDPOINTS = {
  LOGIN: {
    method: "POST",
    path: `${API_PREFIX}/auth/login`,
    auth: "public",

    body: LoginBodySchema,

    response: {
      200: LoginResponseSchema,
    },

    errors: [
      ErrorCode.INVALID_CREDENTIALS,
      ErrorCode.ACCOUNT_DISABLED,
      ErrorCode.RATE_LIMITED,
    ],

    tags: ["Authentication"],
  },

  REFRESH: {
    method: "POST",
    path: `${API_PREFIX}/auth/refresh`,
    auth: "public",

    body: RefreshTokenBodySchema,

    response: {
      200: RefreshResponseSchema,
    },

    errors: [ErrorCode.TOKEN_EXPIRED, ErrorCode.TOKEN_REVOKED],

    tags: ["Authentication"],
  },

  LOGOUT: {
    method: "POST",
    path: `${API_PREFIX}/auth/logout`,
    auth: "required",

    response: {
      204: Type.Never(),
    },

    tags: ["Authentication"],
  },
} as const;
```

---

# 79. Example User Contract

```ts
export const USER_ENDPOINTS = {
  LIST: {
    method: "GET",
    path: `${API_PREFIX}/users`,
    auth: "required",
    permission: PERMISSIONS.USERS_READ,

    query: UserListQuerySchema,

    response: {
      200: UserListResponseSchema,
    },

    tags: ["Users"],
  },

  GET_BY_ID: {
    method: "GET",
    path: `${API_PREFIX}/users/:userId`,
    auth: "required",
    permission: PERMISSIONS.USERS_READ,

    params: UserIdParamsSchema,

    response: {
      200: UserResponseSchema,
    },

    tags: ["Users"],
  },

  UPDATE: {
    method: "PATCH",
    path: `${API_PREFIX}/users/:userId`,
    auth: "required",
    permission: PERMISSIONS.USERS_UPDATE,

    params: UserIdParamsSchema,
    body: UpdateUserBodySchema,

    response: {
      200: UserResponseSchema,
    },

    tags: ["Users"],
  },
} as const;
```

---

# 80. Backend Route Registration Pattern

A route file should look conceptually like:

```ts
import { USER_ENDPOINTS } from "@fastify-masterapp/api-contracts";

export async function userRoutes(fastify: FastifyInstance) {
  fastify.route({
    method: USER_ENDPOINTS.LIST.method,
    url: USER_ENDPOINTS.LIST.path,

    schema: {
      querystring: USER_ENDPOINTS.LIST.query,
      response: USER_ENDPOINTS.LIST.response,
    },

    handler: listUsersHandler,
  });
}
```

The route should not redefine the path.

---

# 81. Admin API Pattern

A typed client can expose:

```ts
export const usersApi = {
  list: (query: UserListQuery) => request(USER_ENDPOINTS.LIST, { query }),

  getById: (userId: string) =>
    request(USER_ENDPOINTS.GET_BY_ID, {
      params: { userId },
    }),

  update: (userId: string, body: UpdateUserBody) =>
    request(USER_ENDPOINTS.UPDATE, {
      params: { userId },
      body,
    }),
};
```

This creates a clean Admin API boundary.

---

# 82. TanStack Query Integration

TanStack Query should use the typed API client.

Example:

```ts
export function useUsers(query: UserListQuery) {
  return useQuery({
    queryKey: ["users", query],
    queryFn: () => usersApi.list(query),
  });
}
```

The query hook should not contain hardcoded URLs.

Dependency flow:

```text
React component
      ↓
TanStack Query hook
      ↓
Admin API client
      ↓
API contract
```

---

# 83. API Contract and Cache Keys

The API contract should not own TanStack Query cache keys.

This belongs to the Admin application.

Why?

Because:

```text
HTTP contract
```

and:

```text
client cache policy
```

are different concerns.

---

# 84. API Contract and React Router

Do not put Admin UI routes in `api-contracts`.

These are different:

```text
API:
GET /api/v1/users
```

versus:

```text
Admin:
 /users
```

Keep them separate.

---

# 85. Contract Testing

The contract package enables stronger tests.

Test:

```text
Request matches schema
Response matches schema
Error matches schema
Endpoint path is registered
HTTP method is correct
Auth metadata is correct
Permission metadata is correct
```

---

# 86. Backend Contract Test

A test can use:

```ts
const endpoint = USER_ENDPOINTS.GET_BY_ID;
```

instead of:

```ts
const url = "/api/v1/users/test-id";
```

This reduces path drift.

---

# 87. Runtime Response Validation

For especially important APIs, validate returned responses against the contract in tests.

Conceptually:

```text
API response
      ↓
TypeBox response schema
      ↓
validation
      ↓
test passes/fails
```

This catches accidental response changes.

---

# 88. Contract Drift

Contract drift happens when:

```text
Backend:
POST /api/v1/auth/login

Frontend:
POST /api/v1/auth/signin
```

or:

```text
Backend:
{
  accessToken
}

Frontend:
{
  token
}
```

Centralization reduces this class of failure.

---

# 89. CI Contract Drift Checks

CI should eventually verify:

1. Every API route references a shared endpoint.
2. No production route hardcodes `/api/v1`.
3. No Admin API client hardcodes API paths.
4. Contract schemas compile.
5. OpenAPI generation succeeds.
6. Contract tests pass.
7. Breaking changes are reviewed.
8. Deprecated endpoints are tracked.

---

# 90. Hardcoded URL Detection

A future CI check can search for:

```text
"/api/v1/
```

outside:

```text
packages/api-contracts
```

Allowed exceptions:

- tests intentionally testing invalid paths
- external provider URLs
- documentation examples
- migration tooling

Such exceptions should be explicit.

---

# 91. API Versioning

For v2:

```text
/api/v1/users
/api/v2/users
```

Do not change the existing v1 contract silently.

Create a new version where necessary.

Recommended:

```text
api/
├── v1/
│   ├── endpoints/
│   └── schemas/
└── v2/
    ├── endpoints/
    └── schemas/
```

Business logic can often remain shared.

---

# 92. Versioning Principle

Version the public contract, not every internal service.

Good:

```text
v1 contract
    ↓
shared service

v2 contract
    ↓
shared service
```

Avoid:

```text
v1 service
v2 service
v3 service
```

unless behavior genuinely differs.

---

# 93. Backward Compatibility

Prefer non-breaking changes:

- add optional response fields
- add optional request fields
- add new endpoints
- add new enum values only when clients tolerate them
- add new filters carefully

Potential breaking changes:

- remove fields
- rename fields
- change types
- make optional fields required
- change status codes
- change authentication semantics
- change error codes
- change pagination behavior

---

# 94. Deprecation Metadata

Endpoints may declare:

```ts
deprecated: true;
```

Additional metadata can include:

```ts
sunsetDate: "2027-01-01";
```

if useful.

Deprecation should be accompanied by:

- documentation
- migration path
- usage monitoring
- removal date
- release notes

---

# 95. OpenAPI and Deprecation

Deprecated contracts should appear as deprecated in generated documentation.

This gives Admin and external consumers visibility.

---

# 96. Error Compatibility

Do not casually change:

```text
INVALID_CREDENTIALS
```

to:

```text
AUTH_FAILED
```

if clients already depend on the original stable code.

Treat error codes as public API.

---

# 97. Enum Compatibility

Enums require special care.

For example:

```ts
Type.Union([Type.Literal("ACTIVE"), Type.Literal("DISABLED")]);
```

Adding:

```text
SUSPENDED
```

may affect clients that assume only the original values exist.

Frontend code should use defensive handling.

---

# 98. Contract Documentation

Every important endpoint should document:

- purpose
- authentication
- permission
- request
- response
- errors
- side effects
- pagination if applicable
- idempotency if applicable
- deprecation state

OpenAPI should expose this information where practical.

---

# 99. Idempotency

Commands that may be retried should explicitly document idempotency.

Examples:

```text
POST /payments
POST /exports
POST /imports
POST /webhooks/replay
```

A contract may define:

```text
Idempotency-Key
```

as a required header.

The actual idempotency implementation belongs in the backend.

---

# 100. Asynchronous Responses

If an operation schedules background work, the contract should communicate that.

Example:

```text
202 Accepted
```

response:

```json
{
  "jobId": "job_123",
  "status": "queued"
}
```

The job implementation remains outside `api-contracts`.

---

# 101. File Download Contracts

A download endpoint may return binary data rather than JSON.

Document:

```text
Content-Type
Content-Disposition
```

and authorization requirements.

Do not force binary responses into a JSON envelope.

---

# 102. Streaming Contracts

Streaming endpoints should be explicitly documented.

Examples:

```text
text/event-stream
application/x-ndjson
```

Do not pretend a streaming endpoint is a normal JSON response.

---

# 103. WebSocket / Realtime APIs

If the application later introduces WebSockets, keep their contracts conceptually separate from REST endpoint definitions.

Example:

```text
packages/
├── api-contracts/
└── realtime-contracts/
```

Shared principles still apply:

- typed messages
- versions
- stable event names
- validation
- authorization

---

# 104. Contract Metadata and Business Rules

Do not put business rules such as:

```ts
minimumOrderValue: 5000;
```

into generic API metadata unless that value is genuinely part of the public contract.

Business rules should live in services/domain logic.

Schemas may enforce input constraints that are explicitly part of the API boundary.

---

# 105. Contract Metadata and Environment

Do not make endpoint paths environment-dependent.

Bad:

```ts
path: process.env.API_URL + "/users";
```

The contract should define relative API paths.

Base URL belongs to runtime configuration.

---

# 106. Base URL

Keep:

```text
API_BASE_URL
```

outside the endpoint contract.

For example:

```text
API_BASE_URL = https://api.example.com
```

Endpoint:

```text
/api/v1/users
```

The client combines them.

This keeps the contract portable between:

```text
local
development
staging
production
```

---

# 107. External URLs

External provider URLs should not be placed in internal API endpoint constants.

Example:

```text
Stripe API
S3
OAuth provider
email provider
```

These belong to integration adapters/configuration.

---

# 108. Tenant-Aware Contracts

If multi-tenancy is introduced, contracts can describe tenant-related inputs.

For example:

```text
X-Tenant-ID
```

or a route such as:

```text
/tenants/:tenantId/users
```

However, tenant authorization must always be enforced server-side.

Never trust a tenant ID supplied by a client merely because the schema validates it.

---

# 109. Tenant Scope and Response Contracts

Responses should not accidentally return resources across tenants.

The backend query layer must apply tenant scope.

Contract centralization does not replace database-level or service-level isolation.

---

# 110. API Contract Security

The shared contract package is public-facing design metadata.

Do not put:

- database credentials
- JWT secrets
- internal hostnames
- Redis credentials
- provider secrets
- private keys

into it.

OpenAPI itself may be safe to expose only when the deployment intentionally permits it.

---

# 111. Authentication Tokens

Token shapes can be described by the contract, but signing and verification belong to the backend.

Do not place:

```text
JWT_SECRET
```

or signing implementation in shared code.

---

# 112. Refresh Token Contracts

A refresh endpoint should have explicit request/response semantics.

For cookie-based refresh:

```text
POST /auth/refresh
```

may have no body.

The browser sends the refresh cookie.

The contract can still describe:

```text
auth: "public"
```

in the sense that no access-token authentication is required, while backend session validation remains mandatory.

---

# 113. Cookie Semantics

Cookie configuration belongs to backend infrastructure:

- HttpOnly
- Secure
- SameSite
- domain
- path
- expiration

Do not put runtime cookie secrets or environment configuration in contracts.

Document only the API behavior that consumers need to understand.

---

# 114. OTP Contracts

OTP endpoints should define:

```text
purpose
challenge
code
```

where appropriate.

Never return the actual OTP from production API responses.

Development-only shortcuts must not leak into production contracts.

---

# 115. Password Reset Contracts

Recommended conceptual flow:

```text
POST /forgot-password
        ↓
OTP sent

POST /verify-reset-otp
        ↓
reset token/challenge

POST /reset-password
        ↓
password changed
```

Each operation gets its own contract.

---

# 116. Audit Metadata

For important administrative endpoints, contract metadata may identify that the endpoint creates an audit event.

For example:

```ts
audit: "required";
```

This is useful documentation.

The actual audit transaction belongs to the backend service.

---

# 117. Observability Metadata

Useful metadata can include:

```ts
operationId: "users.update";
```

This can help:

- metrics
- tracing
- logs
- dashboards
- OpenAPI
- incident investigation

Prefer stable operation IDs.

---

# 118. Recommended Operation IDs

Examples:

```text
auth.login
auth.refresh
auth.logout

users.list
users.get
users.create
users.update
users.delete

roles.list
roles.create
roles.update
roles.delete

audit.list
audit.get
```

These should be stable even if implementation filenames change.

---

# 119. Metrics

The API can emit metrics using operation IDs.

Example:

```text
http_requests_total{
  operation="users.update"
}
```

This is more useful than relying only on raw URL strings.

---

# 120. Logging

Structured logs can include:

```text
operation
method
route
status
requestId
userId
tenantId
duration
```

Do not log:

- passwords
- OTPs
- refresh tokens
- reset tokens
- authorization headers

---

# 121. API Contract and Rate Limiting

Rate-limit policy may be associated with endpoint metadata:

```ts
rateLimit: {
  bucket: "auth.login",
}
```

However, actual distributed rate-limit enforcement belongs in the API/infrastructure layer.

Do not implement Redis logic in the contract package.

---

# 122. API Contract and CORS

CORS is deployment/server policy.

Do not put runtime CORS configuration into endpoint definitions.

The contract describes API behavior, not browser infrastructure configuration.

---

# 123. API Contract and CSRF

CSRF protection belongs to the authentication/session architecture.

The contract may document whether cookies are used, but protection belongs to the backend and browser security model.

---

# 124. API Contract and Caching

Cache behavior may be documented:

```ts
cache: "private";
```

or:

```ts
cache: "no-store";
```

where that metadata is valuable.

But Redis/TanStack Query cache implementations remain outside the contract package.

---

# 125. ETags

If an endpoint supports conditional requests:

```text
ETag
If-None-Match
304 Not Modified
```

the behavior should be documented.

Implementation remains in the API layer.

---

# 126. API Contract and Background Jobs

When an endpoint creates a job:

```text
POST /exports
```

the API contract should expose the job identifier.

Example:

```ts
ExportAcceptedResponseSchema;
```

Then:

```text
Admin
  ↓
POST /exports
  ↓
202
  ↓
jobId
  ↓
GET /jobs/:jobId
```

Both endpoints use centralized contracts.

---

# 127. API Contract and Events

An endpoint may cause events:

```text
POST /users
        ↓
UserCreated
```

This side effect is useful documentation, but event implementation belongs to the application.

Do not couple the HTTP schema to event transport internals.

---

# 128. Transaction Boundaries

A contract does not define database transactions.

Example:

```text
PATCH /users/:id
```

may internally execute:

```text
BEGIN
update user
create audit event
create outbox event
COMMIT
```

The public contract remains:

```text
request
response
errors
```

---

# 129. API Contract and Prisma

Do not import Prisma generated types into:

```text
packages/api-contracts
```

Avoid:

```ts
import { User } from "@prisma/client";
```

inside shared API contracts.

Prisma represents persistence.

API schemas represent public transport.

They should be deliberately separated.

---

# 130. Mapping Database Models to API Models

Recommended:

```text
Prisma User
      ↓
Repository
      ↓
Service
      ↓
Mapper
      ↓
UserResponseSchema
      ↓
HTTP response
```

This protects the API from accidental database schema exposure.

---

# 131. API Contract and Domain Models

Domain types can be shared separately if truly needed.

Do not automatically equate:

```text
Domain User
```

with:

```text
HTTP UserResponse
```

They have different responsibilities.

---

# 132. Generated Client Possibility

Once the contract is stable, the project can optionally generate a typed client.

Possible flow:

```text
TypeBox contracts
      ↓
OpenAPI
      ↓
generated client
      ↓
Admin
```

However, do not add code generation merely for its own sake.

Start with direct TypeScript contract consumption.

---

# 133. Generated Types vs Runtime Schemas

Prefer retaining runtime schemas.

TypeScript alone cannot validate incoming JSON at runtime.

TypeBox provides:

```text
runtime validation
+
static type inference
```

This is valuable for Fastify APIs.

---

# 134. Contract Build

The shared package should compile independently.

Example:

```bash
pnpm --filter @fastify-masterapp/api-contracts build
```

The package should not require:

```text
PostgreSQL
Redis
Fastify server
browser
```

just to compile.

---

# 135. Contract Tests Without Database

Most schema tests should run without PostgreSQL.

Example:

```text
Contract package
      ↓
TypeBox validation
      ↓
unit test
```

This makes contract tests fast.

---

# 136. Integration Tests

API integration tests should verify that the Fastify implementation actually matches the contract.

Example:

```text
contract
   ↓
Fastify route
   ↓
request
   ↓
response
   ↓
schema validation
```

---

# 137. End-to-End Tests

E2E tests should exercise the actual user flow:

```text
Admin
 ↓
API client
 ↓
Fastify
 ↓
auth
 ↓
RBAC
 ↓
service
 ↓
Prisma
 ↓
PostgreSQL
```

The shared contract should still be the source of API paths and schemas.

---

# 138. Contract Tests for Errors

Test at least:

```text
400 validation
401 unauthenticated
403 unauthorized
404 missing resource
409 conflict
422 semantic validation
429 rate limit
500 unexpected error
503 dependency unavailable
```

Not every endpoint needs every status, but important behavior should be tested.

---

# 139. Contract Tests for Authentication

For protected endpoints verify:

```text
no token → 401
invalid token → 401
expired token → 401
revoked token → 401
valid token + missing permission → 403
valid token + permission → success
```

---

# 140. Contract Tests for IDOR

For resource endpoints verify:

```text
User A requests User B resource
        ↓
authorization
        ↓
must not receive User B data
```

A valid schema does not make a request authorized.

---

# 141. Contract Tests for Tenant Isolation

If multi-tenancy is enabled:

```text
Tenant A token
     ↓
Tenant B resource
     ↓
must be rejected
```

This belongs in integration/security tests.

---

# 142. Contract Documentation Review

When adding an endpoint, reviewers should ask:

- Is the endpoint necessary?
- Is the path REST-consistent?
- Is the method correct?
- Is the API version correct?
- Is request validation defined?
- Is response validation defined?
- Are errors defined?
- Is authentication explicit?
- Is permission metadata explicit?
- Is resource authorization required?
- Is pagination defined?
- Is idempotency required?
- Is OpenAPI metadata present?
- Are tests present?

---

# 143. New Endpoint Workflow

Use this process:

```text
1. Define use case
        ↓
2. Define endpoint path
        ↓
3. Define request schema
        ↓
4. Define response schema
        ↓
5. Define error codes
        ↓
6. Define auth requirement
        ↓
7. Define permission
        ↓
8. Define OpenAPI metadata
        ↓
9. Export contract
        ↓
10. Implement Fastify route
        ↓
11. Implement service
        ↓
12. Implement repository if needed
        ↓
13. Implement Admin API call
        ↓
14. Add tests
        ↓
15. Update generated documentation
```

---

# 144. Example New Endpoint

Requirement:

> Admin users can deactivate a user.

Contract:

```ts
DEACTIVATE: {
  method: "POST",
  path: `${API_PREFIX}/users/:userId/deactivate`,

  auth: "required",

  permission: PERMISSIONS.USERS_UPDATE,

  params: UserIdParamsSchema,

  response: {
    200: UserResponseSchema,
  },

  errors: [
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
  ],

  operationId: "users.deactivate",

  summary: "Deactivate a user",

  tags: ["Users"],
}
```

Backend:

```text
route
 ↓
authorize
 ↓
userService.deactivate()
 ↓
transaction
 ↓
audit
 ↓
event/outbox
```

Admin:

```text
usersApi.deactivate(userId)
```

Everything shares the same contract.

---

# 145. Centralization of Query Names

If the project has standard query parameters, centralize schemas.

For example:

```text
page
limit
cursor
search
sortBy
sortDirection
```

But do not force every resource to support every query.

Use composition:

```ts
const UserListQuerySchema = Type.Intersect([
  PaginationQuerySchema,
  UserFilterSchema,
  UserSortSchema,
]);
```

---

# 146. Standard Headers

Where appropriate, document common headers:

```text
Authorization
Content-Type
X-Request-ID
Idempotency-Key
X-Tenant-ID
```

Do not hardcode secrets or runtime infrastructure values.

---

# 147. Header Schemas

Header validation should be used when the application requires it.

Example:

```ts
export const IdempotencyHeadersSchema = Type.Object({
  "idempotency-key": Type.String({ minLength: 1 }),
});
```

Whether headers are case-normalized depends on the HTTP framework/runtime.

The Fastify implementation must account for actual header behavior.

---

# 148. API Contract and Cookies

Cookie-based APIs should document:

```text
which endpoints require cookies
```

but cookie parsing remains a backend responsibility.

---

# 149. API Contract and CSRF-Safe Authentication

If refresh tokens use cookies, state-changing endpoints should follow the project's CSRF strategy.

The contract should not falsely imply:

```text
cookie = automatically secure
```

Security enforcement remains backend infrastructure.

---

# 150. Public vs Internal APIs

Not every internal route must be public.

Classify endpoints where useful:

```text
public
admin
internal
service
webhook
```

Do not expose internal endpoints simply because they exist in the server.

---

# 151. Internal Service Endpoints

If an internal service endpoint exists, its contract should still be explicit.

For example:

```text
POST /internal/v1/reconcile
```

Authentication may use a service identity rather than an end-user JWT.

The contract can describe the boundary without exposing implementation details.

---

# 152. Admin Endpoints

Admin APIs should use the same contract architecture.

Example:

```text
/admin/users
```

is a UI route.

The API may remain:

```text
/api/v1/users
```

Do not couple the API path to the React Admin route.

---

# 153. Permission-Aware Admin UI

The Admin can use permission metadata to improve UX.

For example:

```ts
USER_ENDPOINTS.DELETE.permission;
```

can inform navigation/button configuration.

However, UI hiding is not authorization.

The server remains authoritative.

---

# 154. UI Permission Checks

Use:

```text
permission-aware UI
```

for usability.

Use:

```text
server-side authorization
```

for security.

Both are required.

---

# 155. API Contract and Feature Flags

Feature flags should not become hidden API authorization.

Avoid:

```ts
if (featureFlag("deleteUsers")) {
  authorize();
}
```

Feature flags control release/availability.

RBAC controls authorization.

Keep them separate.

---

# 156. API Contract and Rate Limits

Rate limits should not be hardcoded into every endpoint schema unless the metadata provides real operational value.

Actual limits can vary by:

- user
- IP
- tenant
- role
- endpoint
- environment

Enforcement remains infrastructure/backend logic.

---

# 157. API Contract and Caching

The contract can define cache semantics where they are public behavior.

Examples:

```text
Cache-Control
ETag
304
```

Redis caching is implementation detail unless the cache itself is externally observable.

---

# 158. API Contract and Performance

Avoid adding performance implementation into the contract.

The contract should not say:

```ts
useRedis: true;
```

because that is an implementation detail.

It may say:

```ts
operationId: "users.list";
```

so performance telemetry can consistently identify the operation.

---

# 159. API Contract and Observability

Stable operation IDs provide a strong link between:

```text
contract
 ↓
route
 ↓
logs
 ↓
metrics
 ↓
traces
 ↓
incident response
```

Recommended.

---

# 160. API Contract and Audit Logging

Audit behavior should be documented for sensitive operations.

For example:

```ts
audit: {
  required: true,
  action: "USER_UPDATED",
}
```

This metadata is optional and should not replace the audit service.

---

# 161. Contract Metadata Should Stay Stable

Do not use metadata as a dumping ground for every implementation setting.

Good metadata:

```text
operationId
summary
tags
auth
permission
deprecated
```

Potentially useful:

```text
audit
idempotency
rateLimitBucket
```

Avoid:

```text
databaseTable
redisKey
prismaQuery
workerClass
```

---

# 162. API Contract Version Control

Treat changes to:

```text
packages/api-contracts
```

as API changes.

Review them carefully.

A small schema change can be a breaking change for Admin clients or external consumers.

---

# 163. Pull Request Rule

Any PR changing:

```text
packages/api-contracts
```

should answer:

```text
Is this change backward compatible?
```

If not:

```text
Is a new API version required?
```

---

# 164. Breaking Change Checklist

Before removing/changing a field:

1. Search Admin usage.
2. Search tests.
3. Search external clients if known.
4. Check OpenAPI.
5. Check metrics.
6. Check deprecation state.
7. Announce migration.
8. Provide compatibility period where needed.
9. Version if necessary.

---

# 165. API Contract Changelog

Maintain contract changes in release notes or API changelog.

Example:

```text
2026-09-07
- Added POST /api/v1/users/:userId/deactivate
- Added users.deactivate permission

2026-10-01
- Deprecated legacy endpoint
```

This improves consumer visibility.

---

# 166. Contract Ownership

Each endpoint should have an owning team/module.

Possible metadata:

```ts
owner: "identity";
```

or:

```ts
owner: "users";
```

This can help large teams.

Do not make ownership required if the project is still small.

---

# 167. Contract Risk Classification

Sensitive endpoints may be classified:

```text
low
medium
high
critical
```

Examples:

```text
GET /users
```

may be lower risk.

```text
POST /roles/:id/permissions
```

is higher risk.

```text
POST /auth/reset-password
```

is security-critical.

Risk metadata can improve review workflows.

---

# 168. Avoid Overengineering

Do not start with:

```text
automatic code generation
custom DSL
custom API compiler
custom schema language
custom route framework
```

Start with:

```text
TypeBox
typed endpoint objects
shared exports
Fastify adapters
typed Admin client
tests
```

This is enough to get most of the value.

---

# 169. Recommended Initial Implementation

Phase 1:

```text
API_VERSION
API_PREFIX
HTTP methods
endpoint objects
request schemas
response schemas
error codes
permissions
```

Phase 2:

```text
Fastify route adapters
typed Admin API client
contract tests
OpenAPI integration
```

Phase 3:

```text
operation IDs
deprecation metadata
automated drift detection
generated clients if justified
```

---

# 170. Migration Strategy

Do not rewrite every route simultaneously.

Use incremental migration.

Start with:

```text
auth
users
roles
permissions
audit
```

Then migrate:

```text
todos
examples
files
jobs
integrations
feature-flags
tenants
```

---

# 171. Migration Pattern

Before:

```ts
fastify.get("/api/v1/users", handler);
```

After:

```ts
fastify.get(
  USER_ENDPOINTS.LIST.path,
  {
    schema: {
      querystring: USER_ENDPOINTS.LIST.query,
      response: USER_ENDPOINTS.LIST.response,
    },
  },
  handler,
);
```

Then migrate Admin:

Before:

```ts
api.get("/api/v1/users");
```

After:

```ts
api.get(USER_ENDPOINTS.LIST.path);
```

Then migrate tests.

---

# 172. Do Not Break Existing Behavior During Migration

The first migration goal is:

```text
same API behavior
+
centralized definition
```

Do not simultaneously change:

- endpoint paths
- response envelopes
- authentication
- database schema
- RBAC semantics

unless required.

Small migrations are safer.

---

# 173. Recommended Directory Migration

If the existing package already has:

```text
packages/api-contracts/src/endpoints/
```

retain it.

Expand around it:

```text
src/
├── endpoints/
├── schemas/
├── errors/
├── permissions/
├── common/
└── index.ts
```

Do not create unnecessary nested layers if the current package is small.

---

# 174. Practical Minimal Structure

A good immediate structure is:

```text
packages/api-contracts/
└── src/
    ├── common/
    │   ├── version.ts
    │   ├── errors.ts
    │   └── pagination.ts
    │
    ├── endpoints/
    │   ├── auth.ts
    │   ├── users.ts
    │   ├── roles.ts
    │   ├── permissions.ts
    │   └── audit.ts
    │
    ├── schemas/
    │   ├── auth.ts
    │   ├── users.ts
    │   ├── roles.ts
    │   ├── permissions.ts
    │   └── audit.ts
    │
    ├── permissions/
    │   └── registry.ts
    │
    └── index.ts
```

This is the recommended starting point for Fastify-MasterApp.

---

# 175. Example Index

```ts
export * from "./common/version";
export * from "./common/errors";
export * from "./common/pagination";

export * from "./endpoints/auth";
export * from "./endpoints/users";
export * from "./endpoints/roles";
export * from "./endpoints/permissions";
export * from "./endpoints/audit";

export * from "./schemas/auth";
export * from "./schemas/users";
export * from "./schemas/roles";
export * from "./schemas/permissions";
export * from "./schemas/audit";

export * from "./permissions/registry";
```

---

# 176. Central API Contract Registry

Eventually:

```ts
export const API_CONTRACTS = {
  auth: AUTH_ENDPOINTS,
  users: USER_ENDPOINTS,
  roles: ROLE_ENDPOINTS,
  permissions: PERMISSION_ENDPOINTS,
  audit: AUDIT_ENDPOINTS,
};
```

This can be consumed by tooling.

---

# 177. Route Registration Registry

The API application may have:

```text
apps/api/src/routes/
├── auth.ts
├── users.ts
├── roles.ts
├── permissions.ts
└── audit.ts
```

Each route module imports contracts.

The route module remains responsible for implementation.

---

# 178. Example Full Request Lifecycle

For:

```text
PATCH /api/v1/users/:userId
```

the architecture is:

```text
React Admin
    │
    │ UpdateUserBody
    ▼
Typed API Client
    │
    │ USER_ENDPOINTS.UPDATE
    ▼
HTTP
    │
    ▼
Fastify
    │
    ├── path validation
    ├── body validation
    ├── authentication
    ├── authorization
    └── request context
    │
    ▼
User Handler
    │
    ▼
User Service
    │
    ├── business rules
    ├── transaction
    ├── audit
    └── events
    │
    ▼
User Repository
    │
    ▼
Prisma
    │
    ▼
PostgreSQL
```

The contract is the shared boundary connecting both sides.

---

# 179. Response Lifecycle

```text
PostgreSQL
    ↓
Repository
    ↓
Service
    ↓
Response mapper
    ↓
UserResponseSchema
    ↓
Fastify serializer
    ↓
HTTP
    ↓
Admin API client
    ↓
TanStack Query
    ↓
React UI
```

---

# 180. Failure Lifecycle

```text
Database/service failure
        ↓
internal error
        ↓
error mapper
        ↓
stable API error code
        ↓
central error response schema
        ↓
Admin error handling
```

The client never needs to understand Prisma internals.

---

# 181. Why This Architecture Fits Fastify-MasterApp

Fastify-MasterApp already has:

- Fastify
- TypeScript
- TypeBox
- React Admin
- TanStack Query
- Prisma
- PostgreSQL
- JWT authentication
- RBAC
- centralized API endpoint work
- Swagger/OpenAPI
- structured error handling
- testing infrastructure

A centralized API contract is therefore a natural consolidation point.

It prevents the API boundary from becoming duplicated across the monorepo.

---

# 182. Relationship to Existing API_ENDPOINTS.md

`API_ENDPOINTS.md` defines the centralized endpoint path strategy.

This document expands that strategy.

The intended relationship is:

```text
API_ENDPOINTS
      ↓
part of
      ↓
API CONTRACTS
```

In other words:

> Endpoint paths should be centralized, but the long-term architecture should centralize the complete API contract, not merely URL strings.

---

# 183. Relationship to API_CONVENTIONS.md

`API_CONVENTIONS.md` defines rules such as:

- REST naming
- HTTP methods
- status codes
- response envelopes
- pagination
- authentication
- authorization
- errors
- versioning
- testing

This document defines where those rules become executable/shared artifacts.

Relationship:

```text
API_CONVENTIONS.md
       ↓
rules
       ↓
API_CONTRACTS
       ↓
Fastify + Admin + Tests + OpenAPI
```

---

# 184. Relationship to RBAC.md

`RBAC.md` defines authorization architecture.

This document exposes the public permission metadata:

```ts
permission: PERMISSIONS.USERS_UPDATE;
```

RBAC implementation remains in the API.

Relationship:

```text
API Contract
    ↓
declares required permission

RBAC service
    ↓
evaluates actual authorization
```

---

# 185. Relationship to AUTHENTICATION.md

Authentication architecture defines:

- login
- refresh
- logout
- sessions
- password reset
- OTP
- access tokens

The contract package defines the HTTP boundary for those operations.

Relationship:

```text
Authentication architecture
       ↓
endpoint + schema contracts
       ↓
Fastify implementation
```

---

# 186. Relationship to ERROR_HANDLING.md

`ERROR_HANDLING.md` defines the centralized error strategy.

The contract package should contain:

```text
stable error codes
error schemas
endpoint error metadata
```

The API owns:

```text
internal error classification
mapping
logging
metrics
```

---

# 187. Relationship to API_VERSIONING.md

Versioning rules should be enforced at the contract boundary.

The contract should make it clear whether an endpoint belongs to:

```text
v1
v2
```

and whether it is deprecated.

The implementation can reuse internal services.

---

# 188. Relationship to ADMIN_FRONTEND.md

Admin should consume:

```text
shared contracts
```

rather than independently recreating:

```text
paths
request shapes
response shapes
error assumptions
```

This makes Admin/API development safer.

---

# 189. Relationship to TESTING.md

Tests should consume endpoint contracts wherever appropriate.

This reduces duplicated literals and makes tests follow API changes intentionally.

---

# 190. Relationship to CACHING.md

The contract defines server-facing resource semantics.

Caching strategy remains separate.

For example:

```text
USER_ENDPOINTS.GET_BY_ID
```

does not define the TanStack Query key.

The Admin does.

---

# 191. Relationship to RATE_LIMITING.md

Rate-limit behavior is an API concern, but distributed enforcement is infrastructure.

The contract may document important rate-limited endpoints.

Redis implementation stays in:

```text
apps/api
```

or the infrastructure layer.

---

# 192. Relationship to EVENT_DRIVEN_ARCHITECTURE.md

HTTP contracts, event contracts, and job contracts are distinct.

Recommended:

```text
HTTP
  → api-contracts

Jobs
  → job-contracts

Events
  → event-contracts
```

They can share common primitive conventions but should not be forced into one abstraction.

---

# 193. Relationship to FILE_STORAGE.md

File APIs should use centralized request/response contracts.

Object-storage implementation stays in the storage abstraction.

The API contract should describe:

```text
upload intent
finalization
metadata
download
delete
```

not:

```text
S3 SDK calls
```

---

# 194. Relationship to INTEGRATIONS.md

Provider APIs are external contracts.

The internal API contract should not become coupled to provider SDKs.

Use:

```text
Internal API
    ↓
Integration service
    ↓
Provider adapter
```

---

# 195. Relationship to FEATURE_FLAGS.md

Feature flag APIs themselves should have centralized contracts.

But feature flag evaluation should remain a service.

The contract describes:

```text
GET /feature-flags
PATCH /feature-flags/:id
```

The evaluator decides:

```text
isFeatureEnabled(...)
```

---

# 196. Relationship to AUDIT_LOGGING.md

Sensitive endpoint actions should generate audit events.

The API contract can declare that audit behavior is expected.

The audit system remains backend infrastructure.

---

# 197. Relationship to BACKGROUND_JOBS.md

Endpoints that enqueue jobs should return stable job contracts.

For example:

```text
POST /exports
→ 202
→ jobId
```

The queue payload itself belongs to job contracts.

---

# 198. Recommended Architecture

The final target should look like:

```text
                         ┌──────────────────────────┐
                         │  packages/api-contracts  │
                         │                          │
                         │ API version              │
                         │ Endpoints                │
                         │ HTTP methods             │
                         │ Params                   │
                         │ Query schemas            │
                         │ Request schemas          │
                         │ Response schemas         │
                         │ Error codes              │
                         │ Auth metadata            │
                         │ Permission metadata      │
                         │ OpenAPI metadata          │
                         └────────────┬─────────────┘
                                      │
             ┌────────────────────────┼─────────────────────────┐
             │                        │                         │
             ▼                        ▼                         ▼
      ┌─────────────┐        ┌─────────────┐          ┌─────────────┐
      │  Fastify API│        │ React Admin │          │    Tests    │
      └──────┬──────┘        └──────┬──────┘          └──────┬──────┘
             │                      │                        │
             ▼                      ▼                        │
      ┌─────────────┐        ┌─────────────┐                │
      │  Services   │        │ API Client  │                │
      └──────┬──────┘        └──────┬──────┘                │
             │                      │                        │
             ▼                      ▼                        │
      ┌─────────────┐        ┌─────────────┐                │
      │ Repositories│        │ TanStack    │                │
      └──────┬──────┘        │ Query       │                │
             │               └─────────────┘                │
             ▼                                                │
      ┌─────────────┐                                         │
      │ Prisma / DB │                                         │
      └─────────────┘                                         │
                                                              │
                         ┌────────────────────────────────────┘
                         │
                         ▼
                    Contract Tests
```

---

# 199. Golden Rules

1. Define the API contract once.
2. Keep the canonical contract in `packages/api-contracts`.
3. Centralize endpoint paths.
4. Centralize HTTP methods.
5. Centralize request schemas.
6. Centralize response schemas.
7. Centralize stable error codes.
8. Centralize API versioning.
9. Centralize permission identifiers.
10. Centralize useful OpenAPI metadata.
11. Keep Fastify implementation outside the contract package.
12. Keep Prisma outside the contract package.
13. Keep business logic outside the contract package.
14. Keep React components outside the contract package.
15. Keep UI routes separate from API routes.
16. Keep base URLs out of endpoint definitions.
17. Keep secrets out of contracts.
18. Authenticate centrally in the API.
19. Authorize centrally in the API.
20. Never trust permission metadata as runtime authorization.
21. Keep resource authorization server-side.
22. Treat errors as public API contracts.
23. Treat status codes as public API behavior.
24. Treat response fields as compatibility-sensitive.
25. Prefer backward-compatible API changes.
26. Version breaking API changes.
27. Generate OpenAPI from the same contract where practical.
28. Use contracts in backend tests.
29. Use contracts in Admin API clients.
30. Prevent hardcoded API paths outside the contract package.
31. Keep HTTP, job, and event contracts conceptually separate.
32. Keep persistence models separate from API models.
33. Keep the shared package framework-light.
34. Prefer simple typed objects over an unnecessary custom DSL.
35. Migrate incrementally.
36. Review contract changes as API changes.
37. Keep the contract readable.
38. Keep endpoint ownership clear.
39. Use stable operation IDs for observability.
40. Make the shared contract the authoritative API boundary.

---

# 200. Implementation Checklist

## Package

- [ ] `packages/api-contracts` exists.
- [ ] TypeBox is available.
- [ ] API version is centralized.
- [ ] Common error schema exists.
- [ ] Common pagination schemas exist.
- [ ] Permission registry exists.
- [ ] Endpoint modules exist.
- [ ] Root exports are explicit.

## Endpoints

- [ ] Auth endpoints centralized.
- [ ] User endpoints centralized.
- [ ] Role endpoints centralized.
- [ ] Permission endpoints centralized.
- [ ] Audit endpoints centralized.
- [ ] Health endpoints centralized.
- [ ] Existing application endpoints migrated.
- [ ] No duplicated API path strings remain.

## Schemas

- [ ] Request bodies centralized.
- [ ] Path params centralized.
- [ ] Query params centralized.
- [ ] Responses centralized.
- [ ] Error codes centralized.
- [ ] Sensitive fields excluded.

## Backend

- [ ] Fastify routes consume contracts.
- [ ] Routes do not duplicate schemas.
- [ ] Authentication remains server-side.
- [ ] Authorization remains server-side.
- [ ] Services remain independent.
- [ ] Repositories remain independent.
- [ ] Prisma remains outside shared contracts.

## Admin

- [ ] Admin API client consumes contracts.
- [ ] No hardcoded API URLs.
- [ ] Request types are inferred from schemas.
- [ ] Response types are inferred from schemas.
- [ ] TanStack Query uses typed API client.
- [ ] UI permission checks remain separate from server authorization.

## Tests

- [ ] Contract tests exist.
- [ ] Request validation tested.
- [ ] Response validation tested.
- [ ] Error responses tested.
- [ ] Auth failures tested.
- [ ] RBAC failures tested.
- [ ] IDOR/resource authorization tested.
- [ ] Endpoint registration tested.
- [ ] Contract drift CI check planned.

## Documentation

- [ ] Swagger/OpenAPI generated from contracts.
- [ ] API conventions documented.
- [ ] API versioning documented.
- [ ] Deprecations documented.
- [ ] New endpoint workflow documented.

---

# 201. Definition of Done

The centralized API contract architecture is considered implemented when:

- [ ] API paths have one canonical source.
- [ ] HTTP methods have one canonical source.
- [ ] Request schemas have one canonical source.
- [ ] Response schemas have one canonical source.
- [ ] Error codes have one canonical source.
- [ ] Permission identifiers have one canonical source.
- [ ] Fastify routes consume shared contracts.
- [ ] Admin API clients consume shared contracts.
- [ ] Tests consume shared contracts where appropriate.
- [ ] OpenAPI documentation derives from or stays synchronized with the contracts.
- [ ] API versioning is explicit.
- [ ] Database models are not exposed as API contracts by default.
- [ ] Business logic is not placed in the shared package.
- [ ] Authentication remains backend-enforced.
- [ ] Authorization remains backend-enforced.
- [ ] Resource-level authorization remains backend-enforced.
- [ ] Sensitive values are excluded from public schemas.
- [ ] Contract changes are reviewed for compatibility.
- [ ] CI can detect significant contract drift.
- [ ] Developers can add a new endpoint without copying API definitions across applications.

---

# 202. Final Architecture Principle

The most important design decision is:

> **The API contract should be defined once, close to the shared boundary, and consumed by every application that needs to understand that API.**

For Fastify-MasterApp:

```text
                 API CONTRACT
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
     Fastify       React Admin     Tests
        │             │
        ▼             ▼
    Services       API Client
        │             │
        ▼             ▼
   PostgreSQL     TanStack Query
```

The shared package defines **what the API is**.

The Fastify application defines **how the API works**.

The Admin application defines **how users interact with it**.

The database defines **how data is persisted**.

That separation gives Fastify-MasterApp a centralized, typed, testable, versionable, and production-grade API boundary without turning the shared package into a monolithic application dependency.
