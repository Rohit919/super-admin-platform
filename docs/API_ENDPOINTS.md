# Centralized API Endpoints

## Fastify-MasterApp

> Production-grade implementation guide for centralizing API endpoint paths across the Fastify API, React Admin frontend, shared TypeBox contracts, tests, and OpenAPI documentation.

---

## 1. Purpose

Fastify-MasterApp should have one canonical source of truth for API endpoint paths.

Avoid scattering strings such as:

```ts
api.get("/api/v1/users");
api.get(`/api/v1/users/${id}`);
api.post("/api/v1/auth/login");
```

throughout the repository.

Instead use:

```ts
api.get(API_ENDPOINTS.USERS.ROOT);
api.get(API_ENDPOINTS.USERS.BY_ID(id));
api.post(API_ENDPOINTS.AUTH.LOGIN, payload);
```

The endpoint registry owns URL paths. It does **not** own business logic, database queries, authorization decisions, or React routes.

---

# 2. Architecture

Recommended dependency flow:

```text
packages/api-contracts
        |
        +-- endpoints
        +-- TypeBox schemas
        +-- API errors
        |
        +--------------------+
        |                    |
        v                    v
     apps/api          apps/super-admin
        |                    |
   Fastify routes        API client
        |                    |
        +---------+----------+
                  |
                  v
           Same API contract
```

The canonical endpoint location should be:

```text
packages/api-contracts/src/endpoints/
```

---

# 3. Recommended Structure

```text
packages/
└── api-contracts/
    └── src/
        ├── endpoints/
        │   ├── common.ts
        │   ├── auth.ts
        │   ├── users.ts
        │   ├── roles.ts
        │   ├── permissions.ts
        │   ├── audit.ts
        │   ├── health.ts
        │   ├── files.ts
        │   ├── jobs.ts
        │   ├── integrations.ts
        │   ├── feature-flags.ts
        │   ├── tenants.ts
        │   ├── webhooks.ts
        │   └── index.ts
        │
        ├── schemas/
        ├── errors/
        └── index.ts
```

Only create resource modules when those resources actually exist.

---

# 4. Single Source of Truth

Correct:

```ts
export const AUTH_ENDPOINTS = {
  LOGIN: "/api/v1/auth/login",
} as const;
```

Every consumer imports this value.

Avoid duplicate definitions:

```text
apps/api/auth.ts
apps/super-admin/auth.ts
tests/auth.ts
```

all containing their own copy of:

```text
/api/v1/auth/login
```

---

# 5. API Version

Centralize the API version.

```ts
export const API_PREFIX = "/api";
export const API_VERSION = `${API_PREFIX}/v1`;
```

Then:

```ts
const AUTH_BASE = `${API_VERSION}/auth`;
```

This makes future version migrations easier.

---

# 6. Base URL vs Endpoint Path

The endpoint registry should contain the **path**, not the environment-specific host.

Good:

```ts
AUTH_LOGIN: "/api/v1/auth/login";
```

API client:

```text
baseURL = https://api.example.com
```

Final request:

```text
https://api.example.com/api/v1/auth/login
```

Do not put:

```text
https://api.example.com
```

inside `API_ENDPOINTS`.

Environment configuration belongs to the API client.

---

# 7. Authentication Endpoints

Recommended:

```ts
import { API_VERSION } from "./common";

const AUTH_BASE = `${API_VERSION}/auth`;

export const AUTH_ENDPOINTS = {
  REGISTER: `${AUTH_BASE}/register`,
  LOGIN: `${AUTH_BASE}/login`,
  LOGOUT: `${AUTH_BASE}/logout`,
  LOGOUT_ALL: `${AUTH_BASE}/logout-all`,
  REFRESH: `${AUTH_BASE}/refresh`,
  ME: `${AUTH_BASE}/me`,

  VERIFY_EMAIL: `${AUTH_BASE}/verify-email`,
  RESEND_VERIFICATION: `${AUTH_BASE}/resend-verification`,

  FORGOT_PASSWORD: `${AUTH_BASE}/forgot-password`,
  VERIFY_RESET_OTP: `${AUTH_BASE}/password-reset/verify`,
  RESET_PASSWORD: `${AUTH_BASE}/password-reset/confirm`,

  CHANGE_PASSWORD: `${AUTH_BASE}/change-password`,

  SESSIONS: `${AUTH_BASE}/sessions`,

  SESSION: (sessionId: string) =>
    `${AUTH_BASE}/sessions/${encodeURIComponent(sessionId)}`,
} as const;
```

This includes the complete authentication flow:

```text
register
login
logout
refresh
email verification
OTP
forgot password
password reset
change password
session management
```

---

# 8. User Endpoints

```ts
import { API_VERSION } from "./common";

const USERS_BASE = `${API_VERSION}/users`;

export const USER_ENDPOINTS = {
  ROOT: USERS_BASE,

  BY_ID: (userId: string) => `${USERS_BASE}/${encodeURIComponent(userId)}`,

  SESSIONS: (userId: string) =>
    `${USERS_BASE}/${encodeURIComponent(userId)}/sessions`,
} as const;
```

The same `BY_ID()` path can be used for:

```ts
GET;
PATCH;
DELETE;
```

The HTTP method remains the responsibility of the caller.

---

# 9. Role Endpoints

```ts
const ROLES_BASE = `${API_VERSION}/roles`;

export const ROLE_ENDPOINTS = {
  ROOT: ROLES_BASE,

  BY_ID: (roleId: string) => `${ROLES_BASE}/${encodeURIComponent(roleId)}`,

  PERMISSIONS: (roleId: string) =>
    `${ROLES_BASE}/${encodeURIComponent(roleId)}/permissions`,
} as const;
```

---

# 10. Permission Endpoints

```ts
const PERMISSIONS_BASE = `${API_VERSION}/permissions`;

export const PERMISSION_ENDPOINTS = {
  ROOT: PERMISSIONS_BASE,

  BY_ID: (permissionId: string) =>
    `${PERMISSIONS_BASE}/${encodeURIComponent(permissionId)}`,
} as const;
```

---

# 11. Audit Endpoints

```ts
const AUDIT_BASE = `${API_VERSION}/audit-logs`;

export const AUDIT_ENDPOINTS = {
  ROOT: AUDIT_BASE,

  BY_ID: (auditId: string) => `${AUDIT_BASE}/${encodeURIComponent(auditId)}`,
} as const;
```

---

# 12. Health Endpoints

Health endpoints can remain outside the versioned business API:

```ts
export const HEALTH_ENDPOINTS = {
  API_ROOT: "/api/v1",
  HEALTH: "/health",
  READY: "/ready",
  METRICS: "/metrics",
  DOCUMENTATION: "/documentation",
} as const;
```

If the repository intentionally uses different locations, keep those paths centralized as well.

---

# 13. Files

When file APIs are introduced:

```ts
const FILES_BASE = `${API_VERSION}/files`;

export const FILE_ENDPOINTS = {
  ROOT: FILES_BASE,

  UPLOAD_INTENT: `${FILES_BASE}/upload-intent`,

  BY_ID: (fileId: string) => `${FILES_BASE}/${encodeURIComponent(fileId)}`,

  DOWNLOAD: (fileId: string) =>
    `${FILES_BASE}/${encodeURIComponent(fileId)}/download`,
} as const;
```

Signed object-storage URLs are not internal API endpoints and should not be hardcoded here.

---

# 14. Background Jobs

```ts
const JOBS_BASE = `${API_VERSION}/jobs`;

export const JOB_ENDPOINTS = {
  ROOT: JOBS_BASE,

  BY_ID: (jobId: string) => `${JOBS_BASE}/${encodeURIComponent(jobId)}`,

  RETRY: (jobId: string) => `${JOBS_BASE}/${encodeURIComponent(jobId)}/retry`,

  CANCEL: (jobId: string) => `${JOBS_BASE}/${encodeURIComponent(jobId)}/cancel`,
} as const;
```

---

# 15. Integrations

```ts
const INTEGRATIONS_BASE = `${API_VERSION}/integrations`;

export const INTEGRATION_ENDPOINTS = {
  ROOT: INTEGRATIONS_BASE,

  BY_ID: (integrationId: string) =>
    `${INTEGRATIONS_BASE}/${encodeURIComponent(integrationId)}`,

  HEALTH: (integrationId: string) =>
    `${INTEGRATIONS_BASE}/${encodeURIComponent(integrationId)}/health`,
} as const;
```

Third-party provider URLs themselves belong to integration adapters, not this registry.

---

# 16. Feature Flags

```ts
const FLAGS_BASE = `${API_VERSION}/feature-flags`;

export const FEATURE_FLAG_ENDPOINTS = {
  ROOT: FLAGS_BASE,

  BY_KEY: (key: string) => `${FLAGS_BASE}/${encodeURIComponent(key)}`,

  EVALUATE: (key: string) =>
    `${FLAGS_BASE}/${encodeURIComponent(key)}/evaluate`,
} as const;
```

---

# 17. Tenants

When multi-tenancy is implemented:

```ts
const TENANTS_BASE = `${API_VERSION}/tenants`;

export const TENANT_ENDPOINTS = {
  ROOT: TENANTS_BASE,

  BY_ID: (tenantId: string) =>
    `${TENANTS_BASE}/${encodeURIComponent(tenantId)}`,

  MEMBERS: (tenantId: string) =>
    `${TENANTS_BASE}/${encodeURIComponent(tenantId)}/members`,
} as const;
```

---

# 18. Webhooks

Inbound webhooks are also HTTP contracts:

```ts
const WEBHOOK_BASE = `${API_VERSION}/webhooks`;

export const WEBHOOK_ENDPOINTS = {
  PAYMENT_PROVIDER: `${WEBHOOK_BASE}/payment-provider`,

  EMAIL_PROVIDER: `${WEBHOOK_BASE}/email-provider`,
} as const;
```

Webhook secrets and signature verification remain in the webhook implementation.

---

# 19. Aggregate Registry

Create one public registry:

```ts
import { AUTH_ENDPOINTS } from "./auth";
import { USER_ENDPOINTS } from "./users";
import { ROLE_ENDPOINTS } from "./roles";
import { PERMISSION_ENDPOINTS } from "./permissions";
import { AUDIT_ENDPOINTS } from "./audit";
import { HEALTH_ENDPOINTS } from "./health";

export const API_ENDPOINTS = {
  AUTH: AUTH_ENDPOINTS,
  USERS: USER_ENDPOINTS,
  ROLES: ROLE_ENDPOINTS,
  PERMISSIONS: PERMISSION_ENDPOINTS,
  AUDIT: AUDIT_ENDPOINTS,
  HEALTH: HEALTH_ENDPOINTS,
} as const;
```

As features are implemented:

```ts
API_ENDPOINTS.FILES;
API_ENDPOINTS.JOBS;
API_ENDPOINTS.INTEGRATIONS;
API_ENDPOINTS.FEATURE_FLAGS;
API_ENDPOINTS.TENANTS;
```

can be added.

---

# 20. Public Package Export

`packages/api-contracts/src/index.ts`:

```ts
export * from "./endpoints";
export * from "./schemas";
export * from "./errors";
```

`packages/api-contracts/src/endpoints/index.ts`:

```ts
export * from "./common";
export * from "./auth";
export * from "./users";
export * from "./roles";
export * from "./permissions";
export * from "./audit";
export * from "./health";
```

Consumers should import from the package public API:

```ts
import { API_ENDPOINTS } from "@fastify-masterapp/api-contracts";
```

Use the actual package name configured in the repository.

---

# 21. Dynamic Path Parameters

Fastify's route syntax and a client URL are different.

Backend route:

```text
/api/v1/users/:userId
```

Client URL:

```text
/api/v1/users/123
```

Therefore use two concepts when necessary:

```ts
export const USER_ENDPOINTS = {
  ROUTE_BY_ID: `${USERS_BASE}/:userId`,

  BY_ID: (userId: string) => `${USERS_BASE}/${encodeURIComponent(userId)}`,
} as const;
```

Backend:

```ts
fastify.get(USER_ENDPOINTS.ROUTE_BY_ID, handler);
```

Admin:

```ts
api.get(USER_ENDPOINTS.BY_ID(userId));
```

---

# 22. Path Parameter Encoding

Always safely construct dynamic paths:

```ts
BY_ID: (id: string) => `${BASE}/${encodeURIComponent(id)}`;
```

Do not blindly concatenate untrusted values.

---

# 23. Resource Naming

Use lowercase, plural resource paths:

```text
/api/v1/users
/api/v1/roles
/api/v1/permissions
/api/v1/audit-logs
/api/v1/files
```

Avoid:

```text
/api/v1/getUsers
/api/v1/createUser
/api/v1/User
```

Actions may use verbs when they represent non-CRUD operations:

```text
/auth/login
/users/:userId/suspend
/jobs/:jobId/retry
```

---

# 24. ROOT vs LIST

Prefer a single collection path:

```ts
USERS.ROOT;
```

Then:

```ts
GET  API_ENDPOINTS.USERS.ROOT
POST API_ENDPOINTS.USERS.ROOT
```

Avoid unnecessary duplication:

```ts
LIST: "/api/v1/users",
CREATE: "/api/v1/users",
```

unless separate names provide meaningful value.

---

# 25. BY_ID Reuse

If these operations share the same path:

```text
GET    /users/:userId
PATCH  /users/:userId
DELETE /users/:userId
```

define:

```ts
USERS.BY_ID(userId);
```

and let the method communicate the operation.

---

# 26. Query Parameters

Do not put query parameters into endpoint constants.

Bad:

```ts
USERS: "/api/v1/users?page=1&limit=20";
```

Good:

```ts
USERS.ROOT;
```

Then:

```ts
api.get(API_ENDPOINTS.USERS.ROOT, {
  params: {
    page: 1,
    limit: 20,
  },
});
```

The endpoint registry owns the path; the request layer owns query parameters.

---

# 27. Filtering

Use the same endpoint:

```ts
API_ENDPOINTS.USERS.ROOT;
```

with:

```ts
params: {
  status: "active",
}
```

Do not create:

```text
USERS.ACTIVE
USERS.DISABLED
USERS.SEARCH
```

unless those are genuinely different HTTP resources.

---

# 28. Pagination

Use:

```ts
API_ENDPOINTS.USERS.ROOT;
```

with:

```ts
params: {
  cursor,
  limit,
}
```

or:

```ts
params: {
  page,
  limit,
}
```

depending on the API convention.

---

# 29. Search

Use:

```ts
API_ENDPOINTS.USERS.ROOT;
```

with:

```ts
params: {
  search: "john",
}
```

---

# 30. Sorting

Use:

```ts
API_ENDPOINTS.USERS.ROOT;
```

with:

```ts
params: {
  sortBy: "createdAt",
  sortOrder: "desc",
}
```

---

# 31. HTTP Methods

The endpoint registry should generally contain paths only.

Example:

```ts
api.get(API_ENDPOINTS.USERS.BY_ID(id));

api.patch(API_ENDPOINTS.USERS.BY_ID(id), payload);

api.delete(API_ENDPOINTS.USERS.BY_ID(id));
```

Do not force methods into simple constants unless a generated client specifically requires method metadata.

---

# 32. Fastify Backend Usage

Routes should consume endpoint constants.

Example:

```ts
fastify.post(
  API_ENDPOINTS.AUTH.LOGIN,
  {
    schema: {
      body: loginSchema,
      response: {
        200: loginResponseSchema,
      },
    },
  },
  loginHandler,
);
```

This removes hardcoded endpoint strings from route registration.

---

# 33. Route Parameters in Fastify

Example:

```ts
fastify.get(
  USER_ENDPOINTS.ROUTE_BY_ID,
  {
    schema: {
      params: userParamsSchema,
    },
  },
  getUserHandler,
);
```

The endpoint registry provides the path.

TypeBox defines the parameter contract.

The handler implements behavior.

---

# 34. API Client Usage

Recommended Super Admin structure:

```text
apps/super-admin/src/api/
├── client.ts
├── auth.ts
├── users.ts
├── roles.ts
├── permissions.ts
└── audit.ts
```

Example:

```ts
export const usersApi = {
  list: (params?: UserListParams) =>
    api.get(API_ENDPOINTS.USERS.ROOT, {
      params,
    }),

  getById: (userId: string) => api.get(API_ENDPOINTS.USERS.BY_ID(userId)),

  create: (payload: CreateUserRequest) =>
    api.post(API_ENDPOINTS.USERS.ROOT, payload),

  update: (userId: string, payload: UpdateUserRequest) =>
    api.patch(API_ENDPOINTS.USERS.BY_ID(userId), payload),

  remove: (userId: string) => api.delete(API_ENDPOINTS.USERS.BY_ID(userId)),
};
```

---

# 35. React Components

React components should not know API URLs.

Bad:

```tsx
fetch(`/api/v1/users/${id}`);
```

Good:

```tsx
usersApi.getById(id);
```

Better:

```tsx
useUser(id);
```

The final flow becomes:

```text
React component
    ↓
TanStack Query hook
    ↓
usersApi
    ↓
API client
    ↓
API_ENDPOINTS
    ↓
Fastify
```

---

# 36. Authentication Client

Example:

```ts
export const authApi = {
  login: (payload: LoginRequest) => api.post(API_ENDPOINTS.AUTH.LOGIN, payload),

  logout: () => api.post(API_ENDPOINTS.AUTH.LOGOUT),

  refresh: () => api.post(API_ENDPOINTS.AUTH.REFRESH),

  me: () => api.get(API_ENDPOINTS.AUTH.ME),

  forgotPassword: (payload: ForgotPasswordRequest) =>
    api.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, payload),

  verifyResetOtp: (payload: VerifyResetOtpRequest) =>
    api.post(API_ENDPOINTS.AUTH.VERIFY_RESET_OTP, payload),

  resetPassword: (payload: ResetPasswordRequest) =>
    api.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, payload),
};
```

---

# 37. Authentication Flow

The centralized paths support the complete flow:

```text
REGISTER
   ↓
VERIFY_EMAIL
   ↓
LOGIN
   ↓
ACCESS TOKEN
   ↓
REFRESH
   ↓
LOGOUT
```

Recovery:

```text
FORGOT_PASSWORD
   ↓
VERIFY_RESET_OTP
   ↓
RESET_PASSWORD
   ↓
LOGIN
```

---

# 38. TanStack Query

Endpoint paths and query keys should remain separate.

Example:

```ts
export const userQueryKeys = {
  all: ["users"] as const,

  list: (filters: UserListParams) => ["users", "list", filters] as const,

  detail: (id: string) => ["users", "detail", id] as const,
};
```

Request:

```ts
usersApi.getById(id);
```

Do not make the complete URL the query key by default.

---

# 39. Frontend Routes Are Separate

Do not confuse:

```text
API_ENDPOINTS
```

with:

```text
APP_ROUTES
```

Example:

```ts
export const APP_ROUTES = {
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  USERS: "/users",
  USER: (id: string) => `/users/${id}`,
} as const;
```

While:

```ts
API_ENDPOINTS.USERS.BY_ID(id);
```

could produce:

```text
/api/v1/users/123
```

They are different contracts.

---

# 40. TypeBox Contracts

Endpoints and schemas should be related but separate.

Endpoint:

```ts
API_ENDPOINTS.AUTH.LOGIN;
```

Request:

```ts
LoginRequestSchema;
```

Response:

```ts
LoginResponseSchema;
```

The endpoint registry owns the URL.

TypeBox owns the request/response contract.

---

# 41. Authorization

Do not encode authorization into endpoint constants.

Bad:

```ts
USERS.DELETE_FOR_SUPER_ADMIN;
```

Good:

```ts
API_ENDPOINTS.USERS.BY_ID(userId);
```

Authorization remains server-side:

```text
authenticate()
    ↓
requirePermission("users.delete")
    ↓
resource authorization
    ↓
handler
```

---

# 42. Authentication

Likewise, endpoint centralization does not secure endpoints.

Protected routes still require:

```text
JWT/session validation
RBAC
resource authorization
rate limiting where appropriate
```

---

# 43. Rate Limiting

Rate limits belong to Fastify route configuration.

Example:

```ts
fastify.post(
  API_ENDPOINTS.AUTH.LOGIN,
  {
    config: {
      rateLimit: loginRateLimit,
    },
  },
  loginHandler,
);
```

Do not hide rate-limit behavior inside URL constants.

---

# 44. Audit Logging

Audit behavior belongs to the service/security layer.

For example:

```text
AUTH.LOGIN
   ↓
AuthenticationService
   ↓
AUTH_LOGIN_SUCCESS
```

The endpoint constant should remain only a path.

---

# 45. OpenAPI

OpenAPI should document:

```text
path
method
parameters
request body
responses
authentication
permissions
errors
```

The centralized endpoint registry helps prevent path drift.

Do not put real secrets into Swagger examples.

---

# 46. API Versioning

Current:

```text
/api/v1
```

Future:

```text
/api/v2
```

If both versions must coexist, use separate registries:

```text
endpoints/
├── v1/
│   ├── auth.ts
│   ├── users.ts
│   └── index.ts
│
└── v2/
    ├── auth.ts
    ├── users.ts
    └── index.ts
```

Only do this when multiple versions genuinely coexist.

---

# 47. Versioning Rule

Do not create:

```text
ServiceV1
ServiceV2
```

just because the external API uses:

```text
/api/v1
/api/v2
```

Version the HTTP contract at the API boundary.

Reuse business services where possible.

---

# 48. Deprecation

When an endpoint is deprecated:

```text
1. Mark it deprecated.
2. Document the replacement.
3. Measure usage.
4. Migrate clients.
5. Maintain compatibility.
6. Remove it deliberately.
```

Do not remove a path just because the registry was reorganized.

---

# 49. External URLs

Keep these separate from internal API endpoints:

```text
Stripe URLs
OAuth provider URLs
email provider URLs
object storage URLs
CDN URLs
database URLs
Redis URLs
```

Those belong to configuration or integration adapters.

---

# 50. Internal Service Calls

The endpoint registry is for HTTP contracts.

Inside the modular monolith, prefer:

```text
Service A
   ↓
Service B
```

instead of:

```text
Service A
   ↓
HTTP request
   ↓
Fastify route
   ↓
Service B
```

unless there is a genuine architectural reason.

---

# 51. Webhooks

Webhooks are HTTP contracts and should be centralized:

```ts
WEBHOOK_ENDPOINTS.PAYMENT_PROVIDER;
```

But provider-specific signatures, secrets, and validation remain in the integration layer.

---

# 52. Endpoint Governance

Every new endpoint should answer:

```text
Where is its endpoint constant?
Which resource owns it?
What HTTP method is used?
What request schema exists?
What response schema exists?
What permission protects it?
What tests cover it?
Is it in OpenAPI?
Does it require audit logging?
Does it require rate limiting?
```

---

# 53. New Endpoint Workflow

Use this sequence:

```text
1. Decide resource/action.
2. Define endpoint constant.
3. Define TypeBox request schema.
4. Define response schema.
5. Register Fastify route.
6. Implement service.
7. Implement repository if needed.
8. Add authentication/authorization.
9. Add Admin API method if required.
10. Add TanStack Query hook if required.
11. Add tests.
12. Add OpenAPI documentation.
13. Add audit event if required.
14. Review naming.
```

---

# 54. Example: New User Endpoint

Requirement:

```text
GET /api/v1/users/:userId
```

Define:

```ts
BY_ID: (userId: string) => `${USERS_BASE}/${encodeURIComponent(userId)}`;
```

Fastify route template:

```ts
ROUTE_BY_ID: `${USERS_BASE}/:userId`;
```

Admin:

```ts
usersApi.getById(userId);
```

Test:

```ts
app.inject({
  method: "GET",
  url: API_ENDPOINTS.USERS.BY_ID(userId),
});
```

---

# 55. Example: Password Reset

Define:

```ts
AUTH_ENDPOINTS.FORGOT_PASSWORD;
AUTH_ENDPOINTS.VERIFY_RESET_OTP;
AUTH_ENDPOINTS.RESET_PASSWORD;
```

Then:

```text
React
 ↓
authApi
 ↓
API client
 ↓
API_ENDPOINTS.AUTH
 ↓
Fastify
 ↓
PasswordResetService
```

No React component needs to know the actual API path.

---

# 56. Example: User Detail

One URL builder:

```ts
const path = API_ENDPOINTS.USERS.BY_ID(userId);
```

GET:

```ts
api.get(path);
```

PATCH:

```ts
api.patch(path, payload);
```

DELETE:

```ts
api.delete(path);
```

No duplicate URL strings.

---

# 57. CI Validation

As the project grows, add a CI check that compares:

```text
Central endpoint registry
        ↓
Fastify registered routes
        ↓
OpenAPI paths
```

Detect:

```text
missing registry entry
duplicate path
wrong version
route drift
unexpected hardcoded route
```

---

# 58. Hardcoded URL Detection

Search for:

```text
"/api/v1/
fetch(
axios.get(
axios.post(
api.get(
api.post(
api.patch(
api.put(
api.delete(
```

outside approved locations.

A lint/CI rule can eventually prevent endpoint strings from being added to React components or random services.

---

# 59. Exceptions

Not every URL should be centralized in `API_ENDPOINTS`.

Legitimate exceptions:

```text
third-party provider URLs
static asset URLs
browser URLs
external OAuth URLs
object-storage signed URLs
test fixtures
```

Document exceptions rather than blindly banning every string.

---

# 60. Migration Strategy

For the existing Fastify-MasterApp codebase:

### Phase 1 — Inventory

Find:

```text
all Fastify routes
all Admin API calls
all tests
all OpenAPI paths
all /api/v1 strings
```

### Phase 2 — Create registry

Start with:

```text
common.ts
auth.ts
users.ts
roles.ts
permissions.ts
audit.ts
health.ts
index.ts
```

### Phase 3 — Migrate backend

Replace hardcoded route paths.

### Phase 4 — Migrate Admin

Replace hardcoded API URLs.

### Phase 5 — Migrate tests

Use centralized paths for direct API tests.

### Phase 6 — Enforce

Add lint/CI checks.

---

# 61. Migration Example

Before:

```ts
api.post("/api/v1/auth/login", payload);
```

After:

```ts
api.post(API_ENDPOINTS.AUTH.LOGIN, payload);
```

Before:

```ts
api.get(`/api/v1/users/${id}`);
```

After:

```ts
api.get(API_ENDPOINTS.USERS.BY_ID(id));
```

---

# 62. API Client Responsibility

The API client owns:

```text
base URL
authentication headers
cookies
serialization
timeouts
retry behavior
401 handling
refresh behavior
error normalization
```

The endpoint registry owns:

```text
paths
```

Keep these responsibilities separate.

---

# 63. Endpoint Registry Responsibility

The registry owns:

```text
API version
resource paths
action paths
dynamic path builders
```

It does not own:

```text
database
services
controllers
authorization
authentication state
React
environment variables
provider credentials
```

---

# 64. Endpoint Registry and Security

Centralization improves consistency but is not a security mechanism.

For every protected endpoint:

```text
endpoint
 ↓
authenticate
 ↓
authorize
 ↓
validate resource scope
 ↓
service
```

Never assume:

```text
"Because the endpoint is hidden in the Admin UI, it is secure."
```

The backend must enforce authorization.

---

# 65. Endpoint Registry and Database

Never do this:

```text
endpoint constant
    ↓
Prisma query
```

Use:

```text
endpoint
    ↓
route
    ↓
service
    ↓
repository
    ↓
Prisma
```

---

# 66. Endpoint Registry and Error Handling

The endpoint constant does not define errors.

Errors belong to the API contract:

```text
INVALID_CREDENTIALS
NOT_FOUND
FORBIDDEN
VALIDATION_ERROR
RATE_LIMITED
```

The endpoint registry only identifies where the request is sent.

---

# 67. Endpoint Registry and Background Jobs

Workers should generally call services directly.

Use the endpoint registry only if the worker genuinely communicates with an HTTP API.

Do not create unnecessary internal HTTP requests.

---

# 68. Endpoint Registry and Caching

Cache keys should not simply become endpoint URLs.

For example:

```text
users:list:filters
users:detail:userId
```

are application cache keys.

They are separate from:

```ts
API_ENDPOINTS.USERS.ROOT;
```

---

# 69. Endpoint Registry and Feature Flags

Do not scatter:

```ts
flag ? "/api/v2/users" : "/api/v1/users";
```

through components.

Version/compatibility decisions belong at the API/client boundary.

---

# 70. Endpoint Registry and Multi-Tenancy

Do not manually construct tenant URLs throughout the application.

Use centralized endpoint builders if tenant IDs are part of the public path.

However, tenant authorization must always be enforced server-side.

---

# 71. Endpoint Registry and Files

Centralize API paths:

```text
/files
/files/:fileId
/files/:fileId/download
```

Do not centralize temporary signed storage URLs because those are generated dynamically by the storage provider.

---

# 72. Endpoint Registry and Jobs

Centralize:

```text
/jobs
/jobs/:jobId
/jobs/:jobId/retry
```

but keep BullMQ queue names separate from HTTP paths.

---

# 73. Endpoint Registry and Integrations

Centralize internal integration management API paths:

```text
/integrations
/integrations/:integrationId
```

Keep provider endpoints inside provider adapters.

---

# 74. Endpoint Registry and Audit

Centralize:

```text
/audit-logs
/audit-logs/:auditId
```

but keep audit event names separate:

```text
AUTH_LOGIN_SUCCESS
USER_UPDATED
ROLE_CHANGED
```

---

# 75. Endpoint Registry and OpenAPI

The endpoint registry should reduce drift, but OpenAPI remains the complete HTTP documentation source.

For each route verify:

```text
same path
same method
same parameters
same request schema
same response schema
same security requirements
```

---

# 76. Testing Endpoint Builders

Test parameterized builders:

```ts
expect(API_ENDPOINTS.USERS.BY_ID("123")).toBe("/api/v1/users/123");
```

Test encoding:

```ts
expect(API_ENDPOINTS.USERS.BY_ID("a/b")).toBe("/api/v1/users/a%2Fb");
```

---

# 77. Integration Tests

Example:

```ts
const response = await app.inject({
  method: "GET",
  url: API_ENDPOINTS.USERS.BY_ID(userId),
});
```

This ensures tests use the same public path definitions.

Do not let centralization hide whether Fastify actually registered the intended route.

---

# 78. Endpoint Inventory

Maintain an inventory conceptually like:

```text
AUTH
├── register
├── login
├── logout
├── logout-all
├── refresh
├── me
├── verify-email
├── resend-verification
├── forgot-password
├── verify-reset-otp
├── reset-password
├── change-password
└── sessions

USERS
├── root
├── by-id
└── sessions

ROLES
├── root
├── by-id
└── permissions

PERMISSIONS
├── root
└── by-id

AUDIT
├── root
└── by-id
```

---

# 79. Recommended Initial Implementation

For Fastify-MasterApp, immediately create:

```text
packages/api-contracts/src/endpoints/
├── common.ts
├── auth.ts
├── users.ts
├── roles.ts
├── permissions.ts
├── audit.ts
├── health.ts
└── index.ts
```

Then expand as actual features are implemented.

---

# 80. Complete Example

```ts
// common.ts

export const API_PREFIX = "/api";
export const API_VERSION = `${API_PREFIX}/v1`;
```

```ts
// auth.ts

import { API_VERSION } from "./common";

const BASE = `${API_VERSION}/auth`;

export const AUTH_ENDPOINTS = {
  REGISTER: `${BASE}/register`,
  LOGIN: `${BASE}/login`,
  LOGOUT: `${BASE}/logout`,
  LOGOUT_ALL: `${BASE}/logout-all`,
  REFRESH: `${BASE}/refresh`,
  ME: `${BASE}/me`,

  VERIFY_EMAIL: `${BASE}/verify-email`,
  RESEND_VERIFICATION: `${BASE}/resend-verification`,

  FORGOT_PASSWORD: `${BASE}/forgot-password`,
  VERIFY_RESET_OTP: `${BASE}/password-reset/verify`,
  RESET_PASSWORD: `${BASE}/password-reset/confirm`,

  CHANGE_PASSWORD: `${BASE}/change-password`,

  SESSIONS: `${BASE}/sessions`,

  SESSION: (sessionId: string) =>
    `${BASE}/sessions/${encodeURIComponent(sessionId)}`,
} as const;
```

```ts
// users.ts

import { API_VERSION } from "./common";

const BASE = `${API_VERSION}/users`;

export const USER_ENDPOINTS = {
  ROOT: BASE,

  ROUTE_BY_ID: `${BASE}/:userId`,

  BY_ID: (userId: string) => `${BASE}/${encodeURIComponent(userId)}`,

  SESSIONS: (userId: string) =>
    `${BASE}/${encodeURIComponent(userId)}/sessions`,
} as const;
```

```ts
// index.ts

export * from "./common";
export * from "./auth";
export * from "./users";
export * from "./roles";
export * from "./permissions";
export * from "./audit";
export * from "./health";
```

```ts
// public API

export const API_ENDPOINTS = {
  AUTH: AUTH_ENDPOINTS,
  USERS: USER_ENDPOINTS,
  ROLES: ROLE_ENDPOINTS,
  PERMISSIONS: PERMISSION_ENDPOINTS,
  AUDIT: AUDIT_ENDPOINTS,
  HEALTH: HEALTH_ENDPOINTS,
} as const;
```

---

# 81. Desired Developer Experience

Backend:

```ts
fastify.post(API_ENDPOINTS.AUTH.LOGIN, loginHandler);
```

Admin:

```ts
api.post(API_ENDPOINTS.AUTH.LOGIN, payload);
```

Users:

```ts
api.get(API_ENDPOINTS.USERS.BY_ID(userId));
```

Tests:

```ts
app.inject({
  method: "POST",
  url: API_ENDPOINTS.AUTH.LOGIN,
  payload,
});
```

React:

```ts
useUser(userId);
```

The React component does not know the URL.

---

# 82. Definition of Done

```text
[ ] One canonical endpoint registry exists.
[ ] Registry lives in shared api-contracts.
[ ] API version is centralized.
[ ] Auth endpoints are centralized.
[ ] User endpoints are centralized.
[ ] Role endpoints are centralized.
[ ] Permission endpoints are centralized.
[ ] Audit endpoints are centralized.
[ ] Health endpoints are centralized.
[ ] Dynamic paths use builders.
[ ] Dynamic parameters are encoded.
[ ] Fastify routes consume the registry.
[ ] Admin API modules consume the registry.
[ ] React components do not hardcode API paths.
[ ] Tests use centralized paths where appropriate.
[ ] API client owns the base URL.
[ ] Query parameters remain request-layer concerns.
[ ] Frontend routes remain separate.
[ ] External provider URLs remain separate.
[ ] Authorization remains server-side.
[ ] TypeBox contracts remain separate.
[ ] OpenAPI is synchronized.
[ ] API versioning is documented.
[ ] Hardcoded endpoint detection exists or is planned.
[ ] Route drift detection exists or is planned.
[ ] New endpoint workflow is documented.
```

---

# 83. Golden Rules

1. One API endpoint has one canonical path definition.
2. Put shared endpoint definitions in `packages/api-contracts`.
3. Centralize the API version.
4. Keep API host/base URL separate from endpoint paths.
5. Use resource-specific endpoint modules.
6. Use builders for dynamic path parameters.
7. Encode dynamic path parameters.
8. Keep query parameters out of endpoint constants.
9. Let HTTP methods remain request/route concerns.
10. Do not put business logic into endpoint definitions.
11. Do not put database logic into endpoint definitions.
12. Do not put authorization logic into endpoint definitions.
13. Keep frontend routes separate from API routes.
14. Keep third-party provider URLs separate.
15. Use the same endpoint definitions in Fastify and Admin.
16. Use them in API tests where appropriate.
17. Keep TypeBox schemas separate from URL definitions.
18. Never maintain duplicate endpoint registries.
19. Do not hardcode API paths inside React components.
20. Do not put environment-specific hosts into endpoint constants.
21. Use consistent plural resource names.
22. Use explicit action paths for non-CRUD operations.
23. Prefer one `BY_ID()` builder for GET/PATCH/DELETE when the path is identical.
24. Version the external HTTP contract, not internal services.
25. Detect endpoint drift with CI as the project grows.
26. Keep the registry simple.
27. Do not build a custom API framework unnecessarily.
28. Centralization improves consistency; it does not replace authentication or authorization.
29. Treat endpoint paths as part of the public API contract.
30. Review every new endpoint for naming, security, contracts, tests, and documentation.

---

# 84. Final Architecture Rule

The final dependency direction should be:

```text
                 packages/api-contracts
                         |
             +-----------+-----------+
             |                       |
         endpoints                schemas
             |                       |
             +-----------+-----------+
                         |
                +--------+--------+
                |                 |
                v                 v
             apps/api      apps/super-admin
                |                 |
            Fastify            API Client
             Routes               |
                |                 |
                +--------+--------+
                         |
                         v
                  Same API Contract
```

The target developer experience is:

```ts
API_ENDPOINTS.AUTH.LOGIN;
API_ENDPOINTS.AUTH.REFRESH;
API_ENDPOINTS.AUTH.RESET_PASSWORD;

API_ENDPOINTS.USERS.ROOT;
API_ENDPOINTS.USERS.BY_ID(userId);

API_ENDPOINTS.ROLES.BY_ID(roleId);
API_ENDPOINTS.AUDIT.BY_ID(auditId);
```

No duplicated API paths, no URL construction inside React components, and no disagreement between the Admin frontend, Fastify routes, and tests.

**Centralize the endpoint paths once, share them everywhere, and keep business logic, authorization, schemas, and transport configuration in their proper layers.**

---

## Endpoint Error Matrix

Which documented error statuses each endpoint can return (ERROR_HANDLING §59). This
table is **generated** from the shared contract registry (`API_CONTRACTS`) — every
endpoint's `errors` list is mapped to its HTTP status via `toFastifySchema`, so the
matrix always matches what the API actually serves and what Swagger documents.

Regenerate after changing any contract:

```bash
node packages/api-contracts/scripts/gen-error-matrix.mjs
```

Legend: `🔒` = authentication required, `—` = public, `✓` = documented for that status,
`·` = not applicable.

| Endpoint                              | Method | Auth | 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503 |
| ------------------------------------- | ------ | ---- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `/api/v1/auth/register`               | POST   | —    |  ✓  |  ·  |  ·  |  ·  |  ✓  |  ✓  |  ·  |  ·  |
| `/api/v1/auth/login`                  | POST   | —    |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ✓  |  ·  |  ·  |
| `/api/v1/auth/refresh`                | POST   | —    |  ·  |  ✓  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/auth/logout`                 | POST   | —    |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/auth/logout-all`             | POST   | 🔒   |  ·  |  ✓  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/auth/verify`                 | GET    | 🔒   |  ·  |  ✓  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/auth/change-password`        | POST   | 🔒   |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/auth/verify-email`           | POST   | —    |  ✓  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/auth/resend-verification`    | POST   | —    |  ·  |  ·  |  ·  |  ·  |  ·  |  ✓  |  ·  |  ·  |
| `/api/v1/auth/forgot-password`        | POST   | —    |  ·  |  ·  |  ·  |  ·  |  ·  |  ✓  |  ·  |  ·  |
| `/api/v1/auth/password-reset/verify`  | POST   | —    |  ✓  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/auth/password-reset/confirm` | POST   | —    |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/users`                       | GET    | 🔒   |  ✓  |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/users/me`                    | GET    | 🔒   |  ·  |  ✓  |  ·  |  ✓  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/admin/roles`                 | GET    | 🔒   |  ·  |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/admin/roles`                 | POST   | 🔒   |  ✓  |  ✓  |  ✓  |  ·  |  ✓  |  ·  |  ·  |  ·  |
| `/api/v1/admin/roles/:id`             | GET    | 🔒   |  ·  |  ✓  |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/admin/roles/:id`             | PATCH  | 🔒   |  ✓  |  ✓  |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/admin/roles/:id/permissions` | PUT    | 🔒   |  ✓  |  ✓  |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/admin/roles/:id`             | DELETE | 🔒   |  ·  |  ✓  |  ✓  |  ✓  |  ✓  |  ·  |  ·  |  ·  |
| `/api/v1/admin/permissions`           | GET    | 🔒   |  ·  |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/admin/users/:id/roles`       | GET    | 🔒   |  ·  |  ✓  |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ·  |
| `/api/v1/admin/users/:id/roles`       | PUT    | 🔒   |  ✓  |  ✓  |  ✓  |  ✓  |  ·  |  ·  |  ·  |  ·  |

> **Note on 500/503:** These are not listed per-endpoint because _every_ endpoint can
> return `500 INTERNAL_ERROR` (the global error handler guarantees a safe fallback) and
> may return `503 SERVICE_UNAVAILABLE` on dependency/infrastructure failure. The matrix
> documents each endpoint's **declared, expected** failures; the unexpected 500/503 path
> is universal and handled centrally.
