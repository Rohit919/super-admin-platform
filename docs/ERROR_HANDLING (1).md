# ERROR_HANDLING.md

# Fastify-MasterApp — Error Handling & Failure Architecture

> Production-grade error-handling conventions for the Fastify API, Admin frontend, background workers, database layer, authentication, authorization, and external integrations.

---

## Table of Contents

1. [Purpose](#purpose)
2. [Core Principles](#core-principles)
3. [Errors vs Failures](#errors-vs-failures)
4. [Error Architecture](#error-architecture)
5. [Error Flow](#error-flow)
6. [Error Categories](#error-categories)
7. [HTTP Status Codes](#http-status-codes)
8. [API Error Envelope](#api-error-envelope)
9. [Error Codes](#error-codes)
10. [Public Error Messages](#public-error-messages)
11. [Internal Error Details](#internal-error-details)
12. [Fastify Error Handling](#fastify-error-handling)
13. [Custom Application Errors](#custom-application-errors)
14. [Validation Errors](#validation-errors)
15. [Authentication Errors](#authentication-errors)
16. [Authorization Errors](#authorization-errors)
17. [Resource Not Found](#resource-not-found)
18. [Conflict Errors](#conflict-errors)
19. [Business Rule Errors](#business-rule-errors)
20. [Database Errors](#database-errors)
21. [Prisma Errors](#prisma-errors)
22. [Transaction Failures](#transaction-failures)
23. [External Service Errors](#external-service-errors)
24. [Timeouts](#timeouts)
25. [Rate Limiting Errors](#rate-limiting-errors)
26. [File Upload Errors](#file-upload-errors)
27. [Background Job Errors](#background-job-errors)
28. [Admin Frontend Errors](#admin-frontend-errors)
29. [API Client Errors](#api-client-errors)
30. [Authentication Refresh Failures](#authentication-refresh-failures)
31. [Network Errors](#network-errors)
32. [Retry Strategy](#retry-strategy)
33. [Idempotency](#idempotency)
34. [Error Logging](#error-logging)
35. [Request IDs](#request-ids)
36. [Correlation IDs](#correlation-ids)
37. [Audit Logging](#audit-logging)
38. [Metrics](#metrics)
39. [Alerting](#alerting)
40. [Security](#security)
41. [Information Disclosure](#information-disclosure)
42. [Stack Traces](#stack-traces)
43. [PII and Sensitive Data](#pii-and-sensitive-data)
44. [Error Serialization](#error-serialization)
45. [Error Handling Middleware](#error-handling-middleware)
46. [Route-Level Handling](#route-level-handling)
47. [Service-Level Handling](#service-level-handling)
48. [Repository-Level Handling](#repository-level-handling)
49. [Orchestrator-Level Handling](#orchestrator-level-handling)
50. [Background Worker Handling](#background-worker-handling)
51. [External API Mapping](#external-api-mapping)
52. [Database Constraint Mapping](#database-constraint-mapping)
53. [Error Boundaries](#error-boundaries)
54. [React Admin Error States](#react-admin-error-states)
55. [Loading, Empty, Error](#loading-empty-error)
56. [Form Errors](#form-errors)
57. [Global Error Handling](#global-error-handling)
58. [User-Friendly Messages](#user-friendly-messages)
59. [Development Behavior](#development-behavior)
60. [Production Behavior](#production-behavior)
61. [Testing](#testing)
62. [Unit Tests](#unit-tests)
63. [Integration Tests](#integration-tests)
64. [E2E Tests](#e2e-tests)
65. [Security Testing](#security-testing)
66. [Failure Injection](#failure-injection)
67. [Observability Testing](#observability-testing)
68. [Common Anti-Patterns](#common-anti-patterns)
69. [Troubleshooting](#troubleshooting)
70. [Implementation Roadmap](#implementation-roadmap)
71. [Definition of Done](#definition-of-done)
72. [Error Handling Checklist](#error-handling-checklist)
73. [Golden Rules](#golden-rules)

---

# Purpose

Errors are an expected part of a production system.

Fastify-MasterApp should handle failures in a way that is:

- predictable
- secure
- observable
- consistent
- actionable
- friendly to API consumers
- useful to developers
- safe for production

A good error system should answer two different questions:

### For the client

> What happened, and what can I do about it?

### For the operator

> What actually failed, where did it fail, and how can I diagnose it?

These should not be the same message.

---

# Core Principles

## 1. Errors are part of the API contract

Clients should receive predictable status codes and structured error responses.

---

## 2. Never expose internal errors directly

Do not return:

```text
PrismaClientKnownRequestError: Unique constraint failed...
```

to a normal API consumer.

Map internal failures to safe application errors.

---

## 3. Every unexpected error should be observable

Unexpected failures should produce:

- structured logs
- metrics where appropriate
- request/correlation identifiers

---

## 4. Do not catch errors without a reason

Bad:

```ts
try {
  await service.execute();
} catch {
  return null;
}
```

This hides failures.

---

## 5. Catch errors at meaningful boundaries

Good boundaries include:

```text
HTTP
service/orchestrator
database
external dependency
worker
frontend API client
```

---

## 6. Preserve the original cause internally

When wrapping an error, preserve its cause where the runtime supports it.

Conceptually:

```ts
throw new AppError("REPORT_GENERATION_FAILED", {
  cause: error,
});
```

The public response should remain safe.

---

## 7. Do not use exceptions for normal control flow

Expected business outcomes should be represented clearly.

However, invalid requests and violated business rules can still use structured application errors when that matches the service architecture.

---

# Errors vs Failures

Not every failure should be treated identically.

Examples:

```text
400 invalid input
401 unauthenticated
403 unauthorized
404 resource missing
409 conflict
422 business rule violation
429 rate limited
500 unexpected application failure
502 external dependency failure
503 temporary service unavailable
504 dependency timeout
```

The goal is not to maximize status-code variety.

The goal is to communicate meaningful categories consistently.

---

# Error Architecture

Recommended flow:

```text
Route
  ↓
Service / Orchestrator
  ↓
Repository / External Client
  ↓
Error occurs
  ↓
Map to known application error
  ↓
Fastify error handler
  ↓
Structured API response
  +
Structured log
  +
Metrics where appropriate
```

---

# Error Flow

Example:

```text
PATCH /users/123
      |
      v
TypeBox validation
      |
      v
Authentication
      |
      v
Authorization
      |
      v
UserService
      |
      v
Prisma
      |
      X
Unique constraint violation
      |
      v
Repository maps known DB failure
      |
      v
ConflictError
      |
      v
Fastify error handler
      |
      v
409 Conflict
```

---

# Error Categories

Recommended application-level categories:

```ts
type ErrorCategory =
  | "VALIDATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_RULE"
  | "RATE_LIMIT"
  | "DEPENDENCY"
  | "TIMEOUT"
  | "DATABASE"
  | "INTERNAL";
```

These categories are for internal classification and observability.

---

# HTTP Status Codes

Use a small, consistent set.

| Status | Meaning               | Typical use                                    |
| ------ | --------------------- | ---------------------------------------------- |
| 400    | Bad Request           | malformed request                              |
| 401    | Unauthorized          | missing/invalid authentication                 |
| 403    | Forbidden             | authenticated but not allowed                  |
| 404    | Not Found             | resource unavailable                           |
| 409    | Conflict              | duplicate/state conflict                       |
| 422    | Unprocessable Entity  | valid structure but invalid business operation |
| 429    | Too Many Requests     | rate limit                                     |
| 500    | Internal Server Error | unexpected application failure                 |
| 502    | Bad Gateway           | upstream dependency failure                    |
| 503    | Service Unavailable   | temporary dependency/service outage            |
| 504    | Gateway Timeout       | dependency timeout                             |

Do not use `500` for every error.

---

# 400 vs 422

Use `400` for malformed or invalid request syntax.

Example:

```json
{
  "email": "not-an-email"
}
```

Use `422` for a structurally valid request that violates a business rule.

Example:

```text
Cannot cancel an order that has already shipped.
```

The exact convention should remain consistent across the API.

---

# 401 vs 403

Use `401` when the caller is not successfully authenticated.

Examples:

```text
missing access token
invalid access token
expired access token
```

Use `403` when the caller is authenticated but lacks permission.

Example:

```text
User is authenticated.
User does not have users.delete.
```

---

# 404 and Resource Enumeration

Be careful with resource existence.

For security-sensitive resources, returning `404` rather than revealing authorization state may prevent enumeration.

Example:

```text
GET /users/123
```

If the caller is not allowed to know whether user `123` exists, a `404` response may be preferable to revealing existence.

This should be a deliberate resource-authorization policy.

---

# API Error Envelope

Recommended response:

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found",
    "requestId": "req_123"
  }
}
```

For validation:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "requestId": "req_123",
    "details": [
      {
        "field": "email",
        "message": "Invalid email address"
      }
    ]
  }
}
```

---

# Error Envelope Rules

The envelope should be:

- stable
- documented
- machine-readable
- safe
- concise

Avoid returning arbitrary internal objects.

---

# Error Codes

Use stable application error codes.

Examples:

```text
VALIDATION_ERROR
AUTHENTICATION_REQUIRED
INVALID_CREDENTIALS
TOKEN_EXPIRED
TOKEN_REVOKED
FORBIDDEN
USER_NOT_FOUND
ROLE_NOT_FOUND
DUPLICATE_EMAIL
RESOURCE_CONFLICT
INVALID_STATE_TRANSITION
RATE_LIMITED
DEPENDENCY_UNAVAILABLE
DEPENDENCY_TIMEOUT
INTERNAL_ERROR
```

Clients should branch on:

```text
error.code
```

rather than parsing:

```text
error.message
```

---

# Error Code Naming

Use:

```text
UPPER_SNAKE_CASE
```

Example:

```text
USER_NOT_FOUND
INVALID_CREDENTIALS
PERMISSION_DENIED
```

Do not expose raw database/provider error names as public error codes.

---

# Error Code Stability

Once clients depend on an error code, changing it can become a compatibility break.

Document important codes.

Avoid changing:

```text
USER_NOT_FOUND
```

to:

```text
USER_MISSING
```

without a migration strategy.

---

# Public Error Messages

Messages should be understandable.

Good:

```text
User not found.
```

Good:

```text
You do not have permission to perform this action.
```

Bad:

```text
Prisma query failed in UserRepository.findUnique().
```

Bad:

```text
JWT verification failed because secret index 2 was unavailable.
```

---

# Internal Error Details

Internal logs may contain:

```text
stack trace
database error
provider response
query context
deployment version
```

But only when safe and useful.

Never assume internal logs are automatically safe.

---

# Fastify Error Handling

Fastify should have a centralized error handler.

Conceptually:

```ts
fastify.setErrorHandler((error, request, reply) => {
  // classify
  // log
  // map status
  // return safe response
});
```

The handler should be the final HTTP boundary.

---

# Fastify Error Handler Responsibilities

It should:

1. identify known application errors
2. handle validation failures
3. map status codes
4. sanitize messages
5. attach request ID
6. log unexpected errors
7. avoid duplicate logging
8. return the standard envelope

---

# Custom Application Errors

Create a base application error.

Example:

```ts
class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
```

Specific errors can extend it:

```ts
class NotFoundError extends AppError {}
class ConflictError extends AppError {}
class ForbiddenError extends AppError {}
```

The exact implementation can vary.

---

# Error Metadata

Internally, an error may contain:

```text
category
code
statusCode
details
cause
retryable
```

Example:

```ts
{
  code: "DEPENDENCY_TIMEOUT",
  statusCode: 504,
  retryable: true
}
```

Do not automatically expose every property to the client.

---

# Retryable Errors

Internal classification can include:

```ts
retryable: true;
```

Examples:

```text
temporary database connection failure
provider timeout
provider 503
Redis unavailable
```

Usually not retryable:

```text
invalid input
permission denied
resource not found
duplicate business operation
```

---

# Validation Errors

TypeBox should validate request boundaries.

Validation errors should identify:

- field
- location
- safe reason

Example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Expected a valid email"
      }
    ]
  }
}
```

Do not return internal schema implementation details unnecessarily.

---

# Validation Locations

Potential locations:

```text
params
query
headers
body
```

The response can expose:

```json
{
  "location": "body",
  "field": "email"
}
```

Keep the representation consistent.

---

# Authentication Errors

Authentication errors include:

```text
missing credentials
invalid credentials
expired token
revoked token
invalid refresh token
refresh token reuse
```

Public messages should not expose sensitive details.

For login:

```text
Invalid email or password.
```

is generally safer than:

```text
Email exists but password is wrong.
```

---

# Authentication Error Codes

Possible codes:

```text
AUTHENTICATION_REQUIRED
INVALID_CREDENTIALS
TOKEN_INVALID
TOKEN_EXPIRED
TOKEN_REVOKED
REFRESH_TOKEN_INVALID
SESSION_REVOKED
```

For security events, also emit appropriate audit/security telemetry.

---

# Authorization Errors

Use:

```text
FORBIDDEN
PERMISSION_DENIED
```

Example:

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You do not have permission to perform this action.",
    "requestId": "req_123"
  }
}
```

Do not tell an attacker exactly which permission is missing unless there is a legitimate UX reason.

---

# Resource Not Found

Use a predictable error:

```text
USER_NOT_FOUND
```

or:

```text
RESOURCE_NOT_FOUND
```

The repository should not leak raw database details.

---

# Conflict Errors

Use `409` when the request conflicts with current resource state.

Examples:

```text
email already exists
role already assigned
resource already processed
duplicate idempotency key
state transition conflict
```

Example:

```json
{
  "error": {
    "code": "DUPLICATE_EMAIL",
    "message": "An account with this email already exists.",
    "requestId": "req_123"
  }
}
```

---

# Business Rule Errors

Use a dedicated business error when the request is structurally valid but not allowed by domain rules.

Example:

```text
INVALID_STATE_TRANSITION
```

Message:

```text
A completed order cannot be cancelled.
```

Business errors should be generated by the domain/service layer, not the HTTP layer.

---

# Database Errors

Database errors should be translated at the persistence boundary where possible.

Do not allow:

```text
Prisma error
```

to become the public API contract.

---

# Prisma Errors

Common classes of database failures include:

```text
unique constraint
foreign key constraint
record not found
transaction failure
connection failure
timeout
```

Map known conditions to application errors.

Example:

```text
P2002
  ↓
409 Conflict
```

The exact mapping should be maintained centrally and tested.

---

# Unknown Database Errors

If a database failure cannot be safely classified:

```text
500 INTERNAL_ERROR
```

Log:

- error class
- sanitized database context
- request ID
- correlation ID
- stack trace

Do not return SQL details.

---

# Transaction Failures

Transactions can fail because of:

- serialization conflicts
- deadlocks
- connection loss
- constraint violations
- timeout
- application exceptions

Only retry transaction failures known to be transient.

Never blindly retry an entire business workflow.

---

# Transaction Retry

If a database transaction is safely retryable:

```text
attempt 1
   ↓
serialization conflict
   ↓
backoff
   ↓
attempt 2
```

The transaction must be idempotent and free of unsafe external side effects.

Do not send an email inside a transaction and assume retrying the transaction is safe.

---

# External Service Errors

External dependencies should be wrapped behind clients.

Example:

```text
PaymentClient
EmailClient
StorageClient
WebhookClient
```

The client should translate provider-specific errors into internal categories.

---

# External Error Mapping

Example:

```text
Provider 429
   ↓
DEPENDENCY_RATE_LIMITED

Provider 503
   ↓
DEPENDENCY_UNAVAILABLE

Timeout
   ↓
DEPENDENCY_TIMEOUT

Invalid provider request
   ↓
DEPENDENCY_REJECTED
```

Avoid leaking provider-specific details unless they are safe and useful.

---

# Timeouts

Every external call should have a timeout.

A timeout should map to something like:

```text
504 DEPENDENCY_TIMEOUT
```

when the API itself is waiting on an upstream service.

For background jobs, the timeout may instead produce a retryable worker failure.

---

# Timeout Budget

Avoid stacking unlimited timeouts.

Example:

```text
HTTP request budget: 5 seconds

External service:
  timeout = 2 seconds

Database:
  timeout = 1 second
```

The total dependency budget must fit inside the API request budget.

---

# Rate Limiting Errors

Use:

```text
429 Too Many Requests
```

Example:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later.",
    "requestId": "req_123"
  }
}
```

If appropriate, return:

```text
Retry-After
```

with a safe value.

---

# File Upload Errors

Possible errors:

```text
FILE_TOO_LARGE
UNSUPPORTED_FILE_TYPE
INVALID_FILE
FILE_SCAN_FAILED
UPLOAD_FAILED
```

Do not trust client-provided MIME types alone.

Validate:

- size
- extension
- content signature where appropriate
- storage constraints
- malware scanning requirements

---

# Background Job Errors

Workers need a different error policy than HTTP.

Example:

```text
Job
  ↓
Transient failure
  ↓
Retry
```

Permanent:

```text
Job
  ↓
Validation/business failure
  ↓
Dead letter
```

See `BACKGROUND_JOBS.md` for the full job architecture.

---

# Job Error Categories

Recommended:

```text
TRANSIENT
PERMANENT
VALIDATION
DEPENDENCY
TIMEOUT
AUTHORIZATION
UNKNOWN
```

Workers should not retry everything.

---

# Job Error Observability

Record:

```text
queue
job name
job ID
attempt
error code/category
duration
correlation ID
```

Never log sensitive job payloads.

---

# Admin Frontend Errors

The React Admin application should distinguish:

```text
loading
success
empty
error
```

Do not show a blank screen for an API failure.

---

# API Client Errors

The typed API client should normalize server errors.

Conceptually:

```ts
class ApiError extends Error {
  code: string;
  status: number;
  requestId?: string;
  details?: unknown;
}
```

Components should not parse raw `fetch` responses individually.

---

# Error Handling Boundary

Recommended:

```text
fetch()
  ↓
API client
  ↓
ApiError
  ↓
TanStack Query
  ↓
UI
```

This keeps API behavior consistent.

---

# Authentication Refresh Failures

When an access token expires:

```text
API
  ↓
401
  ↓
API client attempts refresh
  ↓
new access token
  ↓
retry original request
```

If refresh fails:

```text
clear authenticated session
redirect to login
```

Avoid infinite refresh loops.

---

# Single-Flight Refresh

If several requests receive `401` simultaneously:

```text
Request A ─┐
Request B ─┼──> one refresh operation
Request C ─┘
```

Do not start three independent refresh requests.

Use a single-flight refresh mechanism.

---

# Refresh Failure UX

The Admin should:

- clear invalid session state
- avoid showing multiple error notifications
- redirect to login
- preserve a safe explanation

Example:

```text
Your session has expired. Please sign in again.
```

---

# Network Errors

Network errors may include:

```text
offline
DNS failure
connection reset
TLS failure
proxy failure
```

The Admin should distinguish these from normal API errors where practical.

Example:

```text
Unable to reach the server. Check your connection and try again.
```

Do not tell the user:

```text
TypeError: Failed to fetch
```

as the primary UX.

---

# Retry Strategy

Retries should be deliberate.

### Usually safe to retry

```text
GET
safe reads
idempotent operations
transient dependency failures
```

### Dangerous to blindly retry

```text
POST
payment
email
external side effect
non-idempotent mutation
```

Use idempotency keys when necessary.

---

# Client Retry

TanStack Query can retry appropriate queries.

Avoid retrying:

```text
401
403
404
422
```

by default.

Potentially retry:

```text
408
429
502
503
504
```

with controlled limits.

---

# Server Retry

Server-side retry should happen only when:

- the dependency is known to be transient
- operation is safe
- retry budget exists
- timeout budget permits it

Never use retries to hide persistent defects.

---

# Idempotency

For mutation endpoints where duplicate requests can cause side effects, support idempotency where appropriate.

Example:

```text
POST /payments
Idempotency-Key: ...
```

The server should store the result associated with the key.

Duplicate requests should not create duplicate side effects.

---

# Error Logging

Use structured Pino logs.

Example:

```json
{
  "level": "error",
  "event": "request.failed",
  "errorCode": "INTERNAL_ERROR",
  "statusCode": 500,
  "requestId": "req_123"
}
```

For unexpected errors:

```text
stack trace
```

should normally be included in internal logs.

---

# Avoid Duplicate Logging

Do not log the same error independently at every layer.

Bad:

```text
repository logs
service logs
route logs
global handler logs
```

all producing four identical stack traces.

Prefer:

```text
lower layer adds context
top-level boundary logs unexpected error
```

---

# Logging Known Errors

Known client errors do not necessarily need `error` severity.

For example:

```text
401
403
404
422
```

may be:

```text
debug
info
warn
```

depending on operational importance.

Security events may still require dedicated logging/metrics.

---

# Request IDs

Every API request should have a request ID.

Return it in the error response:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred.",
    "requestId": "req_123"
  }
}
```

This lets support and developers locate the corresponding server logs.

---

# Correlation IDs

For workflows spanning multiple components:

```text
request
  ↓
service
  ↓
queue
  ↓
worker
  ↓
external API
```

propagate a correlation ID.

This is especially useful for:

- background jobs
- webhooks
- asynchronous exports
- report generation

---

# Audit Logging

Important failures may need audit events.

Examples:

```text
auth.login_failed
auth.refresh_reuse_detected
user.role_change_failed
admin.export_failed
```

Do not audit every technical exception.

Audit meaningful security/business outcomes.

See `AUDIT_LOGGING.md`.

---

# Metrics

Useful API metrics:

```text
http_requests_total
http_errors_total
http_request_duration_seconds
```

Useful error metrics:

```text
errors_total{code,category}
dependency_errors_total
validation_errors_total
authorization_denied_total
```

Avoid high-cardinality labels such as:

```text
userId
requestId
full error message
```

in Prometheus labels.

---

# Alerting

Alert on:

- unexpected 5xx spikes
- database failure spikes
- dependency failures
- authentication anomaly
- authorization denial anomalies
- queue failures
- repeated timeout spikes

Do not page operators for every `404`.

---

# Security

Error handling is part of the security boundary.

Attackers can use errors to discover:

- usernames
- database structure
- internal services
- file paths
- framework versions
- SQL details
- authorization rules

Public responses should reveal only what is necessary.

---

# Information Disclosure

Never return:

```text
/Users/server/project/src/services/user.service.ts
```

or:

```text
SELECT * FROM users WHERE ...
```

or:

```text
postgresql://user:password@...
```

or:

```text
JWT secret
```

---

# Stack Traces

Development:

```text
stack traces may be visible to developers
```

Production:

```text
stack traces stay server-side
```

The public response should remain:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred.",
    "requestId": "req_123"
  }
}
```

---

# PII and Sensitive Data

Error messages should not accidentally contain:

```text
password
token
credit card information
session cookie
private key
secret
```

Be careful when logging:

```text
request body
query parameters
headers
provider responses
database records
```

---

# Error Serialization

Never blindly serialize an arbitrary error:

```ts
JSON.stringify(error);
```

This may expose:

- stack
- internal properties
- request data
- provider data
- credentials

Use explicit serialization.

---

# Safe Error Serializer

Conceptually:

```ts
function serializeError(error: unknown) {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.publicMessage,
      details: error.safeDetails,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  };
}
```

The serializer should be the only place that decides what crosses the HTTP boundary.

---

# Error Handling Middleware

The global Fastify error handler should:

```text
1. receive error
2. classify error
3. map status
4. map public code/message
5. attach request ID
6. log unexpected failure
7. emit metrics
8. return standard response
```

Keep this code small and heavily tested.

---

# Route-Level Handling

Routes should focus on HTTP concerns:

```text
params
query
body
authentication
authorization
response
```

Avoid large `try/catch` blocks around every route.

Bad:

```ts
try {
  ...
} catch (error) {
  return reply.status(500).send(...)
}
```

unless the route has a specific recovery requirement.

Let the global handler handle ordinary failures.

---

# Service-Level Handling

Services should create domain/application errors.

Example:

```ts
if (!user) {
  throw new NotFoundError("USER_NOT_FOUND", "User not found");
}
```

The service should not know about Fastify's `reply`.

Avoid:

```ts
return reply.status(404)...
```

inside business logic.

---

# Repository-Level Handling

Repositories should:

- execute database operations
- map known persistence failures
- preserve useful causes
- avoid HTTP concepts

Example:

```text
unique constraint
   ↓
ConflictError
```

The repository should not return:

```text
HTTP 409
```

---

# Orchestrator-Level Handling

Orchestrators coordinate multiple operations.

They should distinguish:

```text
business failure
dependency failure
transaction failure
```

If compensation is required, the orchestrator owns that workflow.

---

# External Client Handling

External clients should normalize provider failures.

Example:

```ts
throw new DependencyError({
  code: "EMAIL_PROVIDER_UNAVAILABLE",
  retryable: true,
  cause: error,
});
```

The rest of the application should not need to understand every provider's error format.

---

# Database Constraint Mapping

Maintain a documented mapping.

Example:

```text
Unique constraint
    → 409 Conflict

Foreign key violation
    → 409 Conflict or 422 Business Rule

Record not found
    → 404 Not Found

Connection failure
    → 503/500 depending on context

Transaction timeout
    → 503/504 depending on boundary
```

Mappings must be tested.

---

# Error Boundaries

Errors should stop at deliberate boundaries.

```text
Repository
  ↓
Service
  ↓
Route
  ↓
HTTP error handler
```

and:

```text
Worker handler
  ↓
Queue framework
```

and:

```text
API client
  ↓
React UI error boundary
```

---

# React Error Boundaries

Use React error boundaries for unexpected rendering failures.

They should:

- prevent the entire application from becoming unusable
- show a safe fallback
- provide a retry/reload option
- log diagnostic information
- avoid exposing stack traces to users

---

# Loading, Empty, Error

Do not confuse:

```text
empty
```

with:

```text
error
```

Example:

```text
Loading users...
```

Then:

```text
No users found.
```

versus:

```text
Unable to load users.
```

These are different states.

---

# Form Errors

Validation errors should be attached to fields when possible.

Example:

```text
Email
[ invalid-email@example ]
Please enter a valid email address.
```

Server-side validation remains authoritative.

Never rely solely on frontend validation.

---

# Global Error Handling

The Admin should have:

- query error handling
- mutation error handling
- session error handling
- network error handling
- unexpected error boundary

Avoid displaying multiple identical notifications for one failure.

---

# User-Friendly Messages

Good:

```text
Unable to save the user. Please try again.
```

Better when actionable:

```text
This email address is already in use.
```

Avoid:

```text
HTTP 409
```

as the only user-facing message.

---

# Error Message Design

A useful message should answer:

```text
What happened?
Can the user fix it?
Should they retry?
```

Examples:

### User action

```text
This email address is already in use.
```

### Retry

```text
The service is temporarily unavailable. Please try again.
```

### Permission

```text
You do not have permission to perform this action.
```

### Unexpected

```text
Something went wrong. Please try again or contact support with request ID req_123.
```

---

# Development Behavior

Development environments may include:

- stack traces in server logs
- detailed debug logging
- verbose dependency information
- local error overlays

However, even development code should avoid teaching developers to expose secrets.

---

# Production Behavior

Production should:

- hide stack traces
- hide infrastructure details
- use stable error codes
- return request IDs
- log full diagnostic information internally
- emit relevant metrics
- avoid sensitive metadata

---

# Testing

Error handling must be tested as seriously as success paths.

Test:

```text
validation
authentication
authorization
not found
conflict
business rules
database failures
dependency failures
timeouts
rate limiting
unexpected errors
```

---

# Unit Tests

Test application error classes:

```text
code
status
message
category
retryable
cause
```

Test mapping logic independently.

---

# Integration Tests

Example:

```text
POST /users
duplicate email
    ↓
409
DUPLICATE_EMAIL
requestId present
```

Test the complete HTTP envelope.

---

# Authentication Integration Tests

Test:

```text
missing token
invalid token
expired token
revoked token
invalid refresh token
refresh reuse
```

Verify safe public responses.

---

# Authorization Integration Tests

Test:

```text
authenticated but missing permission
```

Expected:

```text
403
PERMISSION_DENIED
```

Also test IDOR/resource-level authorization.

---

# Database Failure Tests

Inject:

```text
unique constraint
foreign key violation
connection failure
timeout
transaction conflict
```

Verify correct mapping.

---

# External Dependency Tests

Simulate:

```text
429
500
502
503
timeout
malformed response
network failure
```

Verify:

```text
correct classification
correct retry behavior
safe response
```

---

# E2E Tests

Test user-visible behavior:

```text
Admin submits form
  ↓
API fails
  ↓
field/global error appears
```

and:

```text
session expires
  ↓
refresh fails
  ↓
Admin returns to login
```

---

# Security Testing

Test for information leakage.

Search responses for:

```text
password
token
secret
SQL
stack trace
file path
database URL
internal hostname
```

Production-style tests should assert these are absent.

---

# Failure Injection

Useful failure scenarios:

```text
PostgreSQL unavailable
Redis unavailable
external API unavailable
external API timeout
invalid environment configuration
worker crash
disk/storage failure
```

The system should fail predictably.

---

# Observability Testing

When an unexpected error occurs, verify:

```text
request ID exists
structured log exists
error metric increments
public response is safe
```

This proves the operational path works, not just the HTTP response.

---

# Error Response Contract Tests

Shared TypeBox contracts should define the standard error envelope.

For example:

```ts
const ErrorResponse = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    requestId: Type.Optional(Type.String()),
    details: Type.Optional(Type.Array(Type.Unknown())),
  }),
});
```

The exact schema should match the project's contract conventions.

---

# Error Documentation

Swagger/OpenAPI should document common error responses.

For example:

```text
400 ValidationError
401 AuthenticationRequired
403 PermissionDenied
404 UserNotFound
409 Conflict
429 RateLimited
500 InternalError
503 DependencyUnavailable
```

Do not document every obscure internal exception.

---

# Error Versioning

Error response changes should be backward-compatible where possible.

Adding:

```text
requestId
```

is generally safe.

Changing:

```text
code
```

may break clients.

Changing the meaning of an existing code is especially dangerous.

---

# Client Compatibility

Admin API client should not depend on:

```text
exact message text
```

Use:

```text
status
error.code
details
```

for behavior.

Messages are for humans.

Codes are for machines.

---

# Localization

If localization is introduced, error codes should remain stable.

Example:

```text
USER_NOT_FOUND
```

can map to different messages:

```text
English:
User not found.

Hindi:
उपयोगकर्ता नहीं मिला।
```

The machine-readable code remains unchanged.

---

# Error Handling and Caching

Do not cache sensitive error responses unintentionally.

Authentication and authorization errors should have appropriate cache behavior.

Do not allow a personalized error response to become a shared proxy/cache response.

---

# Error Handling and CORS

CORS behavior should remain consistent for error responses.

An error response should not unexpectedly omit required CORS headers and become unreadable to the Admin frontend.

---

# Error Handling and Rate Limits

Rate-limited responses should be lightweight.

Avoid expensive operations before returning `429`.

Do not expose internal rate-limit implementation details.

---

# Error Handling and Health Endpoints

Health endpoints should use their own deliberate failure contract.

For example:

```text
/health
```

may report process health.

```text
/ready
```

may report dependency readiness.

Do not return an enormous application error object from health checks.

---

# Error Handling and Metrics Endpoint

`/metrics` should not return normal API error envelopes if the monitoring integration requires a different format.

Keep operational endpoints distinct from application APIs.

---

# Troubleshooting

## Users receive 500

Check:

1. application logs
2. request ID
3. error code
4. stack trace
5. database
6. external dependencies
7. recent deployment

---

## Error response has no request ID

Check:

- Fastify request ID configuration
- global error handler
- proxy/load-balancer headers
- response serializer

---

## Admin shows generic error for everything

Check:

- API client error parser
- error envelope
- TanStack Query error handling
- mutation error UI
- server error code

---

## Infinite retry loop

Check:

- query retry policy
- mutation retry policy
- token refresh logic
- `401` handling
- recursive request interception

---

## Database error leaks to client

Check:

- Prisma error handling
- global Fastify error handler
- custom serializer
- route-level catch blocks

Search for:

```ts
reply.send(error);
```

and:

```ts
JSON.stringify(error);
```

---

## Duplicate error logs

Check:

- repository logging
- service logging
- route logging
- global handler

Centralize unexpected-error logging.

---

## Users cannot distinguish permission from server failure

Check:

```text
403 mapping
PERMISSION_DENIED
```

and Admin UI handling.

---

# Common Anti-Patterns

## 1. Returning 500 for Everything

This destroys useful API semantics.

---

## 2. Exposing Raw Errors

Never return raw Prisma, Node, provider, or filesystem errors.

---

## 3. Parsing Error Messages in the Frontend

Do not write:

```ts
if (error.message.includes("already exists"))
```

Use stable error codes.

---

## 4. Catching and Ignoring

Bad:

```ts
catch {
  return;
}
```

---

## 5. Logging Secrets

Never log:

```text
JWT
password
refresh token
API key
cookie
```

---

## 6. Retrying Non-Idempotent Mutations

This can create duplicate side effects.

---

## 7. Infinite Retries

Always have a retry budget.

---

## 8. One Giant Error Class

Do not turn every failure into:

```text
AppError
```

with no meaningful classification.

---

## 9. HTTP Logic in Services

Services should not depend on:

```text
reply.status()
```

---

## 10. Database Logic in Routes

Routes should not contain Prisma-specific error handling everywhere.

---

## 11. Returning Different Error Shapes Per Endpoint

Consistency is more valuable than endpoint-specific creativity.

---

## 12. Exposing Resource Existence Unnecessarily

Authorization-sensitive resources may require careful `404` behavior.

---

## 13. Logging Every Expected Error as Critical

This creates alert fatigue.

---

## 14. No Error Contract in Swagger

Clients need to understand predictable failure responses.

---

# Implementation Roadmap

## Phase 1 — Standard Error Envelope

Implement:

```text
error.code
error.message
error.requestId
error.details
```

---

# Phase 2 — Application Error Classes

Create:

```text
ValidationError
AuthenticationError
AuthorizationError
NotFoundError
ConflictError
BusinessRuleError
DependencyError
TimeoutError
```

---

# Phase 3 — Global Fastify Handler

Centralize:

- classification
- mapping
- logging
- metrics
- serialization

---

# Phase 4 — Database Mapping

Map common Prisma/database failures to stable application codes.

---

# Phase 5 — External Client Mapping

Normalize provider failures.

---

# Phase 6 — Admin API Client

Create:

```text
ApiError
```

and standard error handling.

---

# Phase 7 — Admin UX

Implement:

- field errors
- global errors
- retry actions
- session expiry handling
- error boundary

---

# Phase 8 — Observability

Add:

- error metrics
- structured error logs
- request IDs
- correlation IDs
- alerts

---

# Phase 9 — Failure Testing

Add integration tests for:

```text
database
Redis
external APIs
timeouts
auth
RBAC
unexpected exceptions
```

---

# Phase 10 — Production Hardening

Verify:

- no stack traces exposed
- no secrets logged
- stable error codes
- retry policies
- OpenAPI documentation
- incident troubleshooting
- monitoring

---

# Suggested Error Module Structure

```text
apps/api/src/shared/errors/

app-error.ts
error-codes.ts
error-categories.ts
error-handler.ts
error-mapper.ts
error-serializer.ts
prisma-error-mapper.ts
dependency-error.ts
validation-error.ts
```

A module can be smaller initially.

Avoid over-engineering before the application needs it.

---

# Example Error Codes

```ts
export const ErrorCode = {
  ValidationError: "VALIDATION_ERROR",

  AuthenticationRequired: "AUTHENTICATION_REQUIRED",
  InvalidCredentials: "INVALID_CREDENTIALS",
  TokenExpired: "TOKEN_EXPIRED",
  TokenInvalid: "TOKEN_INVALID",

  PermissionDenied: "PERMISSION_DENIED",

  UserNotFound: "USER_NOT_FOUND",
  RoleNotFound: "ROLE_NOT_FOUND",

  DuplicateEmail: "DUPLICATE_EMAIL",
  ResourceConflict: "RESOURCE_CONFLICT",

  InvalidStateTransition: "INVALID_STATE_TRANSITION",

  RateLimited: "RATE_LIMITED",

  DependencyUnavailable: "DEPENDENCY_UNAVAILABLE",
  DependencyTimeout: "DEPENDENCY_TIMEOUT",

  InternalError: "INTERNAL_ERROR",
} as const;
```

---

# Example Error Factory

Conceptually:

```ts
export function userNotFound() {
  return new AppError({
    code: ErrorCode.UserNotFound,
    statusCode: 404,
    message: "User not found.",
    category: "NOT_FOUND",
  });
}
```

Factories can make frequently used errors consistent.

---

# Example Global Response

For an unexpected error:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred.",
    "requestId": "req_01J..."
  }
}
```

Internal log:

```json
{
  "level": "error",
  "event": "request.failed",
  "errorCode": "INTERNAL_ERROR",
  "requestId": "req_01J...",
  "stack": "..."
}
```

The two representations intentionally differ.

---

# Error Review Checklist

Before merging error-handling changes:

### API

- [ ] Correct HTTP status.
- [ ] Stable error code.
- [ ] Standard error envelope.
- [ ] Request ID included.
- [ ] Safe public message.
- [ ] Details contain no secrets.

### Backend

- [ ] Business errors originate in appropriate service/domain layer.
- [ ] Repository maps known persistence errors.
- [ ] External clients normalize provider errors.
- [ ] Unexpected errors reach global handler.
- [ ] Original cause is preserved internally.

### Security

- [ ] No passwords.
- [ ] No tokens.
- [ ] No secrets.
- [ ] No SQL.
- [ ] No filesystem paths.
- [ ] No unnecessary account enumeration.
- [ ] Authorization errors are safe.

### Admin

- [ ] Error parsed centrally.
- [ ] No message-string parsing.
- [ ] Correct field/global error.
- [ ] Retry behavior is appropriate.
- [ ] Session failures handled.
- [ ] No duplicate notifications.

### Observability

- [ ] Structured log.
- [ ] Request ID.
- [ ] Correlation ID where needed.
- [ ] Metrics where useful.
- [ ] Alerting for unexpected failures.

### Testing

- [ ] Unit test.
- [ ] Integration test.
- [ ] E2E test where user-visible.
- [ ] Security test where relevant.
- [ ] Failure-path test.

---

# Definition of Done

Error handling is production-ready when:

- [ ] All API errors use a standard envelope.
- [ ] Stable error codes exist.
- [ ] HTTP status codes are consistent.
- [ ] Validation errors are structured.
- [ ] Authentication errors are safe.
- [ ] Authorization errors are safe.
- [ ] Not-found behavior is deliberate.
- [ ] Conflict errors are mapped.
- [ ] Business rule errors are represented.
- [ ] Prisma errors are mapped.
- [ ] External dependency errors are normalized.
- [ ] Timeouts are bounded.
- [ ] Retry behavior is deliberate.
- [ ] Idempotency is considered for side effects.
- [ ] Global Fastify error handling exists.
- [ ] Unexpected errors are logged.
- [ ] Request IDs are returned.
- [ ] Correlation IDs are propagated where useful.
- [ ] Sensitive data is never exposed.
- [ ] Stack traces stay server-side in production.
- [ ] Admin API errors are normalized.
- [ ] React error boundaries exist.
- [ ] Form errors are supported.
- [ ] Error states are tested.
- [ ] Security leakage tests exist.
- [ ] Metrics exist for important failure classes.
- [ ] Production alerts exist for critical failures.
- [ ] Swagger documents important error responses.
- [ ] Troubleshooting procedures are documented.

---

# Error Handling Checklist

Before adding a new endpoint:

- [ ] What validation can fail?
- [ ] What authentication can fail?
- [ ] What authorization can fail?
- [ ] What resources can be missing?
- [ ] What conflicts can occur?
- [ ] What business rules can fail?
- [ ] What database constraints can fail?
- [ ] What external dependencies can fail?
- [ ] Which failures are retryable?
- [ ] Can the operation be safely retried?
- [ ] Could an error reveal sensitive information?
- [ ] What should the Admin display?
- [ ] What should be logged?
- [ ] What should be audited?
- [ ] What metrics should exist?
- [ ] What should trigger an alert?
- [ ] What tests cover each failure path?

---

# Golden Rules

## Rule 1

**Errors are part of the API contract.**

## Rule 2

**Use stable error codes for machines and clear messages for humans.**

## Rule 3

**Never expose raw internal errors.**

## Rule 4

**Return the request ID with meaningful API failures.**

## Rule 5

**Authentication and authorization failures must not leak sensitive information.**

## Rule 6

**Retry only when the failure is transient and the operation is safe.**

## Rule 7

**Never blindly retry non-idempotent side effects.**

## Rule 8

**Preserve internal error causes for diagnosis.**

## Rule 9

**Keep HTTP concerns at the HTTP boundary.**

## Rule 10

**Keep database/provider-specific errors out of the public API contract.**

## Rule 11

**Unexpected failures must be observable.**

## Rule 12

**Do not confuse empty, loading, and error states in the Admin UI.**

## Rule 13

**Do not log secrets while trying to diagnose failures.**

## Rule 14

**Test failure paths as seriously as success paths.**

## Rule 15

**A generic 500 is better than a detailed security leak.**

---

# Final Error Architecture

Fastify-MasterApp should use the following overall model:

```text
                     HTTP Request
                          |
                          v
                 +------------------+
                 | Fastify Boundary |
                 +--------+---------+
                          |
                  Validation/Auth
                          |
                          v
                 +------------------+
                 | Route            |
                 +--------+---------+
                          |
                          v
              +------------------------+
              | Service / Orchestrator |
              +-----------+------------+
                          |
              +-----------+------------+
              |                        |
              v                        v
       Repository                 External Client
              |                        |
              v                        v
          PostgreSQL              Provider
              |                        |
              +-----------+------------+
                          |
                     Error / Result
                          |
                          v
                 Error Classification
                          |
                          v
                 Global Error Handler
                    /            \
                   /              \
                  v                v
          Safe API Response    Observability
                               |
                         +-----+-----+
                         |           |
                         v           v
                       Logs       Metrics
                         |
                         v
                       Alerts
```

For the Admin:

```text
API
 ↓
Typed API Client
 ↓
ApiError
 ↓
TanStack Query
 ↓
Page / Form / Error Boundary
 ↓
User-friendly recovery
```

For background workers:

```text
Queue
 ↓
Worker
 ↓
Job Handler
 ↓
Service
 ↓
Failure Classification
 ↓
Retry OR Dead Letter
 ↓
Logs + Metrics + Audit where appropriate
```

The goal is not to eliminate failures.

The goal is to make failures:

- predictable
- safe
- diagnosable
- recoverable
- observable
- consistent

A production system is not one that never fails.

A production system is one where failures are **contained, correctly classified, safely communicated, and operationally recoverable**.
