# ERROR_HANDLING.md

## Fastify-MasterApp Error Handling Standard

This document defines how Fastify-MasterApp detects, represents, logs, tests, and exposes errors across the API, shared contracts, database layer, background jobs, and React Admin frontend.

The goal is not to eliminate errors. The goal is to make failures:

- predictable
- safe
- actionable
- observable
- testable
- consistent across modules
- useful to clients without leaking internal details

---

## 1. Core Principles

Fastify-MasterApp follows these principles:

1. **Fail safely.**
2. **Return consistent API error responses.**
3. **Never expose secrets or internal implementation details.**
4. **Use HTTP status codes according to meaning, not convenience.**
5. **Separate authentication from authorization failures.**
6. **Validate input at the API boundary.**
7. **Treat expected business failures differently from unexpected programming failures.**
8. **Log unexpected failures with enough context to investigate.**
9. **Preserve request/correlation IDs across logs and downstream operations.**
10. **Do not log passwords, tokens, secrets, or sensitive personal data.**
11. **Make errors easy for the Admin frontend to consume.**
12. **Test both success paths and failure paths.**
13. **Prefer typed/domain errors over scattered string comparisons.**
14. **Do not use exceptions as normal control flow when a simpler result is clearer.**
15. **Never silently swallow an error.**

---

# 2. Error Handling Architecture

The preferred dependency flow is:

```text
HTTP Request
    |
    v
Fastify Route
    |
    v
Validation / Authentication
    |
    v
Service / Orchestrator
    |
    v
Repository
    |
    v
Prisma
    |
    v
PostgreSQL
```

Errors can originate at any layer.

The responsibility of each layer is different.

| Layer          | Responsibility                            |
| -------------- | ----------------------------------------- |
| Fastify        | HTTP-level error translation              |
| Route          | Request-specific handling                 |
| Validation     | Reject malformed input                    |
| Authentication | Reject invalid identity credentials       |
| Authorization  | Reject insufficient permissions           |
| Service        | Detect business-rule failures             |
| Orchestrator   | Coordinate multi-step failures            |
| Repository     | Translate persistence failures            |
| Prisma         | Database interaction errors               |
| PostgreSQL     | Constraint/connectivity/database failures |
| Worker         | Job execution/retry/failure handling      |
| Admin          | Display actionable user-facing errors     |

A lower layer should not know unnecessary details about a higher layer.

For example, a repository should not decide whether a failure should become a `403` or `404` HTTP response.

---

# 3. Error Categories

Errors should generally fall into one of these categories:

```text
Client Input Error
Authentication Error
Authorization Error
Resource Error
Business Rule Error
Conflict Error
Dependency Error
Infrastructure Error
Unexpected Error
```

## 3.1 Client Input Error

The client sent invalid or incomplete input.

Examples:

- malformed email
- missing required field
- invalid UUID
- invalid enum
- invalid query parameter
- invalid pagination value

Typical status:

```text
400 Bad Request
422 Unprocessable Content
```

Use the project's established convention consistently.

---

## 3.2 Authentication Error

The request cannot be associated with a valid authenticated identity.

Examples:

- missing access token
- invalid JWT
- expired access token
- revoked session
- invalid refresh token

Typical status:

```text
401 Unauthorized
```

Do not use `403` for missing or invalid authentication.

---

## 3.3 Authorization Error

The user is authenticated but does not have permission.

Examples:

- regular user attempting an admin action
- user lacking `users:delete`
- accessing a protected administrative resource

Typical status:

```text
403 Forbidden
```

---

## 3.4 Resource Error

The requested resource does not exist or should not be revealed.

Typical status:

```text
404 Not Found
```

For security-sensitive resources, the application may intentionally return `404` rather than revealing that a resource exists.

---

## 3.5 Business Rule Error

The request is syntactically valid but violates application rules.

Examples:

- attempting to deactivate the last active administrator
- attempting an invalid state transition
- trying to perform an operation before prerequisites are satisfied

Typical status:

```text
400 Bad Request
409 Conflict
422 Unprocessable Content
```

Choose based on the semantics of the specific rule.

---

## 3.6 Conflict Error

The requested operation conflicts with current state.

Examples:

- duplicate unique value
- optimistic concurrency conflict
- resource already exists
- idempotency conflict
- stale update

Typical status:

```text
409 Conflict
```

---

## 3.7 Dependency Error

An external dependency failed.

Examples:

- payment provider unavailable
- email provider timeout
- external API returned an invalid response
- Redis unavailable

Typical status:

```text
502 Bad Gateway
503 Service Unavailable
504 Gateway Timeout
```

Do not expose provider internals to clients.

---

## 3.8 Infrastructure Error

The application infrastructure cannot safely complete the request.

Examples:

- database unavailable
- connection pool exhausted
- Redis unavailable
- filesystem failure
- startup configuration failure

Typical status:

```text
500 Internal Server Error
503 Service Unavailable
```

---

## 3.9 Unexpected Error

A bug or unforeseen failure occurred.

Examples:

- null dereference
- unexpected Prisma exception
- programming error
- invariant violation

Typical status:

```text
500 Internal Server Error
```

The client should receive a safe generic message.

The server should log the full diagnostic context.

---

# 4. Standard API Error Response

Fastify-MasterApp should use one predictable error envelope.

Recommended structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "requestId": "req_01HXYZ...",
    "details": [
      {
        "field": "email",
        "code": "INVALID_FORMAT",
        "message": "Enter a valid email address."
      }
    ]
  }
}
```

For errors without field-level details:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "requestId": "req_01HXYZ..."
  }
}
```

---

# 5. Error Response Fields

## 5.1 `code`

Machine-readable stable identifier.

Examples:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
RATE_LIMITED
INTERNAL_ERROR
SERVICE_UNAVAILABLE
```

Clients should branch on `code`, not on human-readable `message`.

---

## 5.2 `message`

Human-readable safe explanation.

Messages must never contain:

- passwords
- access tokens
- refresh tokens
- JWT contents
- API keys
- database connection strings
- stack traces
- SQL statements
- filesystem paths
- internal service credentials

---

## 5.3 `requestId`

Every API error should expose a request/correlation identifier when available.

Example:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred.",
    "requestId": "req_abc123"
  }
}
```

This lets an Admin user provide support with a safe identifier while the server uses the same ID to locate logs.

---

## 5.4 `details`

Optional structured metadata.

Use details for information that helps the client fix the request.

Good:

```json
{
  "field": "name",
  "code": "REQUIRED",
  "message": "Name is required."
}
```

Avoid returning raw internal exception objects.

---

# 6. HTTP Status Code Standard

Use status codes consistently.

| Status | Meaning                    | Example                               |
| ------ | -------------------------- | ------------------------------------- |
| 400    | Invalid request            | malformed request                     |
| 401    | Not authenticated          | missing/invalid JWT                   |
| 403    | Not authorized             | insufficient permission               |
| 404    | Resource unavailable       | user not found                        |
| 405    | Method unsupported         | wrong HTTP method                     |
| 409    | State conflict             | duplicate email                       |
| 413    | Payload too large          | oversized upload                      |
| 415    | Unsupported media type     | wrong content type                    |
| 422    | Semantically invalid input | invalid business input                |
| 429    | Rate limited               | too many requests                     |
| 500    | Unexpected server error    | programming failure                   |
| 502    | Bad upstream response      | dependency failure                    |
| 503    | Service unavailable        | dependency/infrastructure unavailable |
| 504    | Upstream timeout           | dependency timeout                    |

Do not return `200` with an embedded error for failed operations.

Bad:

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

with HTTP `200`.

Prefer:

```text
HTTP 401
```

with the standard error envelope.

---

# 7. Error Codes

Error codes are part of the API contract.

Use stable uppercase identifiers.

Recommended initial catalog:

```text
VALIDATION_ERROR

UNAUTHORIZED
INVALID_CREDENTIALS
TOKEN_EXPIRED
TOKEN_INVALID
REFRESH_TOKEN_INVALID
SESSION_REVOKED

FORBIDDEN
PERMISSION_DENIED

NOT_FOUND
USER_NOT_FOUND
TODO_NOT_FOUND
EXAMPLE_NOT_FOUND

CONFLICT
DUPLICATE_RESOURCE
CONCURRENT_UPDATE

BUSINESS_RULE_VIOLATION
INVALID_STATE_TRANSITION

RATE_LIMITED

DEPENDENCY_ERROR
SERVICE_UNAVAILABLE
UPSTREAM_TIMEOUT

DATABASE_ERROR

INTERNAL_ERROR
```

Do not create a new error code for every sentence.

Error codes should describe categories of behavior.

---

# 8. Domain Errors

Business logic should use domain-oriented errors.

Conceptually:

```ts
class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}
```

Specific errors can extend the base type:

```ts
class UserNotFoundError extends DomainError {
  constructor() {
    super("USER_NOT_FOUND", "User was not found.", 404);
  }
}
```

The exact implementation can evolve, but the principle should remain:

```text
Business meaning
        |
        v
Typed error
        |
        v
HTTP translation
```

Avoid:

```ts
throw new Error("user missing");
```

when callers need to distinguish a known domain failure from an unexpected failure.

---

# 9. Error Translation Boundary

HTTP concerns belong at the HTTP boundary.

Example:

```text
Repository
    |
    | Prisma error
    v
Service
    |
    | Domain error
    v
Route / error handler
    |
    | HTTP response
    v
Client
```

A service should not need to know about:

```ts
reply.code(404);
```

A repository should not need to know about:

```text
HTTP 409
```

The route/error handler translates application errors into HTTP responses.

---

# 10. Fastify Global Error Handler

Fastify-MasterApp should have a centralized error handler.

Conceptually:

```ts
fastify.setErrorHandler((error, request, reply) => {
  // classify error
  // log safely
  // map to status code
  // return standard error envelope
});
```

The global handler should:

1. identify the error category
2. determine HTTP status
3. select stable error code
4. sanitize the message
5. attach request ID
6. include safe details when appropriate
7. log the appropriate information
8. send the response

---

# 11. Error Handler Decision Tree

Recommended decision order:

```text
Did validation fail?
       |
       +-- yes --> 400/422

Is authentication invalid?
       |
       +-- yes --> 401

Is authorization denied?
       |
       +-- yes --> 403

Is resource missing?
       |
       +-- yes --> 404

Is there a state/uniqueness conflict?
       |
       +-- yes --> 409

Is the client rate limited?
       |
       +-- yes --> 429

Did an external dependency fail?
       |
       +-- yes --> 502/503/504

Did an infrastructure failure occur?
       |
       +-- yes --> 500/503

Otherwise
       |
       +-- 500 INTERNAL_ERROR
```

---

# 12. Validation Errors

TypeBox schemas define the API boundary.

Validation should happen before business logic.

Example:

```ts
const CreateUserSchema = Type.Object({
  email: Type.String({ format: "email" }),
  name: Type.String({ minLength: 1 }),
});
```

Invalid input should produce structured information.

Example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "requestId": "req_123",
    "details": [
      {
        "field": "email",
        "code": "INVALID_FORMAT",
        "message": "Enter a valid email address."
      }
    ]
  }
}
```

Do not expose raw JSON Schema validator internals if they are difficult for clients to consume.

---

# 13. Request Validation Responsibilities

Validate:

- body
- query parameters
- path parameters
- headers where necessary
- content type
- pagination
- filters
- sorting
- enum values
- identifiers
- file metadata

Never trust data simply because it came from the Admin frontend.

The API is the security boundary.

---

# 14. Authentication Errors

Authentication failures should be intentionally generic.

For login:

Bad:

```text
Email does not exist.
```

This can enable account enumeration.

Prefer:

```text
Invalid email or password.
```

For protected endpoints:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication is required.",
    "requestId": "req_123"
  }
}
```

Do not tell attackers:

```text
JWT signature was valid but the user was revoked.
```

unless there is a strong product reason to expose that distinction.

---

# 15. Authorization Errors

Authorization happens after authentication.

A user can be:

```text
Authenticated
    +
Not Authorized
```

Return:

```text
403 Forbidden
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

Avoid revealing hidden permissions or policy implementation details.

---

# 16. Resource Not Found

Use resource-specific codes where useful:

```text
USER_NOT_FOUND
ROLE_NOT_FOUND
TODO_NOT_FOUND
```

The message should remain safe:

```text
User was not found.
```

For object-level authorization, consider whether `404` is preferable to `403` to avoid exposing resource existence.

Example:

```text
GET /users/{id}
```

If the caller has no permission to know whether the user exists:

```text
404 Not Found
```

may be safer than:

```text
403 Forbidden
```

The policy should be deliberate and consistent.

---

# 17. Duplicate Resource Errors

Unique constraints should become stable conflict errors.

Example:

```text
POST /users
```

with an existing email:

```http
409 Conflict
```

Response:

```json
{
  "error": {
    "code": "DUPLICATE_RESOURCE",
    "message": "A user with that email already exists.",
    "requestId": "req_123"
  }
}
```

Do not expose raw Prisma/PostgreSQL constraint names.

---

# 18. Prisma Error Translation

Prisma errors should be translated at the repository/service boundary.

Do not return raw Prisma exceptions to the API.

Conceptually:

```text
Prisma unique constraint
        |
        v
Repository translation
        |
        v
Domain conflict
        |
        v
HTTP 409
```

Examples of database conditions:

| Database condition    | Application result               |
| --------------------- | -------------------------------- |
| Unique violation      | `DUPLICATE_RESOURCE`             |
| Record not found      | domain-specific not-found error  |
| Foreign-key violation | business/conflict error          |
| Connection failure    | infrastructure/dependency error  |
| Transaction failure   | transaction/infrastructure error |
| Unknown Prisma error  | internal error                   |

Do not blindly convert every Prisma error to `500`.

Some errors have meaningful client-facing semantics.

---

# 19. Database Error Security

Never return:

```text
PrismaClientKnownRequestError: Invalid `prisma.user.create()` invocation...
```

Never return:

```text
relation "users" does not exist
```

Never return SQL:

```sql
INSERT INTO users ...
```

Never return database hostnames, usernames, passwords, or connection strings.

The client should see a safe error.

The server logs should contain enough sanitized diagnostic information for engineers.

---

# 20. Transaction Errors

Transactions should have clear failure semantics.

Example:

```text
Create order
   |
Create order items
   |
Update inventory
   |
Write audit event
```

If a transaction fails:

```text
Rollback
   |
Return appropriate error
```

Do not return success if only part of a required atomic operation succeeded.

If the operation intentionally uses eventual consistency, document that explicitly.

---

# 21. Concurrency Errors

Concurrent writes can create stale-state failures.

Example:

```text
Admin A reads user
Admin B updates user
Admin A submits stale update
```

If optimistic concurrency is implemented:

```text
409 CONCURRENT_UPDATE
```

Example:

```json
{
  "error": {
    "code": "CONCURRENT_UPDATE",
    "message": "The resource changed before your update was applied.",
    "requestId": "req_123"
  }
}
```

The Admin should refresh and retry with current data.

---

# 22. Rate Limit Errors

Rate limiting should return:

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

Where appropriate, provide:

```text
Retry-After
```

Do not reveal internal rate-limit algorithms.

---

# 23. External Dependency Errors

External systems can fail in many ways:

```text
timeout
connection failure
invalid response
5xx
rate limit
authentication failure
```

Translate them into stable application errors.

Example:

```text
External Email Provider
        |
        v
DependencyError
        |
        v
503 SERVICE_UNAVAILABLE
```

Do not return:

```text
Stripe API returned 502 from eu-west-1 endpoint...
```

unless exposing that information is explicitly safe and useful.

---

# 24. Timeout Handling

Timeouts must not hang requests indefinitely.

Use explicit timeouts for external dependencies.

When a dependency times out:

```text
504 Gateway Timeout
```

may be appropriate when the upstream dependency failed to respond in time.

If the application itself is temporarily unavailable:

```text
503 Service Unavailable
```

may be more appropriate.

---

# 25. Retry Safety

Never blindly retry every error.

Usually retryable:

```text
temporary network failure
timeout
503
transient database connectivity failure
```

Usually not retryable:

```text
400
401
403
404
validation errors
business rule failures
```

For write operations, retries require idempotency analysis.

A retry can accidentally create duplicate records.

---

# 26. Idempotency and Errors

For important write operations, consider idempotency keys.

Example:

```http
Idempotency-Key: 01HXYZ...
```

If the same request is submitted twice:

```text
First request:
    execute

Second request:
    return original result
```

Do not accidentally perform the operation twice.

If the same idempotency key is reused with a different payload, return a conflict.

Example:

```text
409 CONFLICT
```

with:

```text
CONFLICT
```

or a dedicated:

```text
IDEMPOTENCY_KEY_REUSED
```

if the application needs that distinction.

---

# 27. Error Logging

Not every error deserves the same log level.

Recommended model:

| Error                     | Level       |
| ------------------------- | ----------- |
| validation failure        | debug/info  |
| authentication failure    | info/warn   |
| authorization denial      | info/warn   |
| expected business failure | info        |
| dependency failure        | warn/error  |
| database outage           | error       |
| unexpected exception      | error       |
| security incident         | warn/error  |
| startup failure           | fatal/error |

Avoid logging every expected `404` as an error.

---

# 28. Structured Logging

Use structured Pino logs.

Example conceptual event:

```json
{
  "level": "error",
  "requestId": "req_123",
  "errorCode": "DATABASE_ERROR",
  "route": "POST /api/v1/users",
  "method": "POST",
  "statusCode": 500,
  "durationMs": 42,
  "message": "Database operation failed"
}
```

For unexpected exceptions, include the structured error object internally.

Do not expose that object to the client.

---

# 29. What Must Never Be Logged

Never log:

```text
password
password hash
access token
refresh token
JWT
API key
secret
DATABASE_URL
private key
session secret
credit card number
CVV
authentication headers
raw authorization headers
```

Also avoid unnecessary sensitive personal information.

Use identifiers instead.

Good:

```text
userId=usr_123
```

Bad:

```text
password=...
```

---

# 30. Request IDs

Every request should have a correlation/request ID.

Flow:

```text
Client
  |
  | X-Request-ID / generated ID
  v
Fastify
  |
  +--> route logs
  |
  +--> service logs
  |
  +--> repository logs
  |
  +--> dependency logs
```

The same ID should make a request traceable through the application.

If a trusted upstream request ID is accepted, validate and normalize it rather than blindly trusting arbitrary unbounded input.

---

# 31. Error Response Headers

Depending on the error, the API may return:

```text
Content-Type: application/json
X-Request-ID: req_123
Retry-After: 60
```

Do not expose internal infrastructure headers unnecessarily.

---

# 32. Error Handling in Routes

Routes should remain thin.

Avoid:

```ts
fastify.post("/users", async (request, reply) => {
  try {
    // 100 lines of business logic
    // database calls
    // permission checks
    // error mapping
  } catch (error) {
    // custom logic
  }
});
```

Prefer:

```ts
fastify.post("/users", async (request) => {
  return userService.create(request.user, request.body);
});
```

The centralized error handler translates expected domain errors.

---

# 33. Route-Level Error Handling

A route may handle an error locally when it genuinely needs HTTP-specific behavior.

Examples:

- streaming response
- file upload
- special third-party callback
- protocol-specific response

Even then, the response should follow the standard error contract when possible.

Avoid creating route-specific error formats without a strong reason.

---

# 34. Service-Level Errors

Services should express business failures.

Example:

```ts
if (!user) {
  throw new UserNotFoundError();
}

if (!canDeactivateUser(actor, user)) {
  throw new PermissionDeniedError();
}
```

This is better than:

```ts
throw new Error("403");
```

or:

```ts
return { error: "forbidden" };
```

Services should not construct Fastify replies.

---

# 35. Repository-Level Errors

Repositories should translate persistence details.

Example:

```text
Prisma unique constraint
        |
        v
Repository
        |
        v
DuplicateResourceError
```

Repositories should not leak ORM-specific exceptions through the entire application.

---

# 36. Error Wrapping

When wrapping an underlying error, preserve the cause internally where supported.

Conceptually:

```ts
throw new DatabaseError("Database operation failed.", { cause: error });
```

This allows logs and diagnostics to retain the original cause without exposing it to clients.

Do not stringify arbitrary errors into client responses.

---

# 37. Unknown Errors

Every unknown error should eventually reach the centralized error handler.

Fallback:

```http
500 Internal Server Error
```

Response:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred.",
    "requestId": "req_123"
  }
}
```

The server logs the real exception.

The client does not.

---

# 38. Production vs Development

Development can expose more diagnostics to local developers, but production must remain safe.

Development may optionally provide:

```text
stack
validation internals
debug metadata
```

Production should return only the public error contract.

Do not rely on environment-specific behavior as a security control.

The safest approach is to keep sensitive information out of public error objects entirely.

---

# 39. Admin Frontend Error Handling

The React Admin frontend should consume the standard error format.

The API client should normalize errors into a predictable client-side shape.

Conceptually:

```ts
type ApiError = {
  code: string;
  message: string;
  requestId?: string;
  details?: ApiErrorDetail[];
};
```

The UI should not inspect raw Axios/fetch/TanStack Query errors everywhere.

Instead:

```text
API client
    |
    v
Normalized ApiError
    |
    +--> page
    +--> form
    +--> toast
    +--> modal
```

---

# 40. Admin Error Presentation

Use the appropriate UI for the error.

| Error           | UI                         |
| --------------- | -------------------------- |
| validation      | field-level messages       |
| login failure   | inline form message        |
| 401             | refresh/re-authenticate    |
| 403             | permission message         |
| 404             | not-found state            |
| 409             | conflict message           |
| 429             | retry guidance             |
| 500             | generic error + request ID |
| network failure | connectivity message       |
| timeout         | retry action               |

Do not show raw server errors in toast notifications.

---

# 41. Form Validation

Prefer field-level errors.

Example:

```text
Email
[invalid-email@example]
"Enter a valid email address."
```

If multiple fields fail:

```text
Name
"Name is required."

Email
"Enter a valid email address."
```

The API remains the authoritative validation layer.

Client validation improves UX but does not replace server validation.

---

# 42. Authentication Error UX

When an Admin API call returns:

```text
401
```

the client should:

1. determine whether the access token can be refreshed
2. perform refresh using the established session mechanism
3. retry the original request once when safe
4. avoid infinite refresh loops
5. clear the session if refresh fails
6. redirect to login
7. preserve safe navigation context if appropriate

Do not retry indefinitely.

---

# 43. Permission Error UX

For:

```text
403 PERMISSION_DENIED
```

the Admin should show:

```text
You do not have permission to perform this action.
```

If the UI can hide unauthorized actions ahead of time, do so.

But the backend must still enforce authorization.

---

# 44. Conflict UX

For:

```text
409 CONFLICT
```

the Admin should explain what happened.

Example:

```text
This user was updated by someone else.
Refresh the page and try again.
```

For duplicate email:

```text
A user with this email already exists.
```

Avoid generic:

```text
Something went wrong.
```

when the conflict is safely actionable.

---

# 45. Retry UX

Retry buttons should be used for errors likely to succeed later.

Good candidates:

```text
503
504
network failure
temporary timeout
```

Do not offer "Retry" as the only response for:

```text
403
invalid input
duplicate resource
```

unless retrying after user correction makes sense.

---

# 46. Avoid Retry Storms

If many clients receive `503`, automatically retrying immediately can make the outage worse.

Use:

```text
exponential backoff
jitter
retry limits
```

For browser requests, generally keep automatic retries conservative.

For background workers, use queue-specific retry policies.

---

# 47. Background Job Errors

Background jobs should distinguish:

```text
retryable failure
permanent failure
unknown failure
```

Example:

```text
Email delivery timeout
    |
    +--> retry

Invalid recipient
    |
    +--> permanent failure

Unexpected exception
    |
    +--> retry with limit
```

After maximum retries:

```text
dead-letter / failed job state
```

The system should preserve enough metadata for diagnosis.

---

# 48. Worker Error Logging

Worker logs should include:

```text
job ID
job type
attempt number
request/correlation ID when available
safe entity ID
error code
duration
```

Never log credentials or tokens contained in job payloads.

---

# 49. Scheduled Jobs

Scheduled jobs must not fail silently.

If a scheduled task fails:

```text
job failure
   |
   +--> structured log
   +--> metric
   +--> alert when appropriate
```

For important jobs, monitor:

```text
last successful execution
failure count
duration
queue depth
retry count
```

---

# 50. Error Metrics

Track useful aggregate metrics.

Examples:

```text
http_requests_total{status_code="500"}
http_requests_total{error_code="VALIDATION_ERROR"}
http_requests_total{error_code="FORBIDDEN"}
http_requests_total{error_code="RATE_LIMITED"}
```

Avoid high-cardinality labels.

Do not use:

```text
user_email
request_id
raw_url_with_ids
```

as metric labels.

---

# 51. Error Rate Alerts

Production should monitor:

```text
5xx rate
401 spikes
403 spikes
429 spikes
database errors
dependency failures
job failures
```

A sudden increase in `401` may indicate:

- token expiry configuration problem
- signing-key problem
- client deployment issue
- authentication attack

A sudden increase in `403` may indicate:

- RBAC deployment bug
- permission migration issue
- frontend/backend version mismatch
- attack probing

---

# 52. Error Budgets and Reliability

Errors should be viewed in terms of user impact.

A useful reliability model:

```text
Availability
+
Correctness
+
Latency
+
Recoverability
```

A request returning `500` is an availability failure.

A request returning `200` with incorrect data is also a correctness failure.

Do not optimize only for status-code success.

---

# 53. Security Considerations

Error handling is part of the security boundary.

Attackers can use errors to discover:

```text
valid users
database schema
internal services
file paths
framework versions
permissions
resource existence
```

Therefore:

- keep public messages minimal
- avoid stack traces
- avoid SQL details
- avoid dependency internals
- avoid user enumeration
- avoid permission leakage
- use generic authentication errors
- log diagnostics privately

---

# 54. Error Message Guidelines

Good:

```text
Invalid email or password.
```

Good:

```text
You do not have permission to perform this action.
```

Good:

```text
The requested user was not found.
```

Bad:

```text
Prisma query failed because PostgreSQL constraint users_email_key rejected value...
```

Bad:

```text
JWT_SECRET is invalid.
```

Bad:

```text
User roh***@example.com exists but password hash did not match.
```

---

# 55. Error Message Style

Messages should be:

- concise
- grammatical
- actionable when possible
- safe
- stable enough for UI presentation

Avoid:

```text
Oops!!!
```

Avoid:

```text
Error occurred.
```

Avoid overly technical messages for end users.

---

# 56. Localization

If localization is introduced later, error codes should remain stable.

Instead of clients depending on:

```text
"User was not found."
```

they should depend on:

```text
USER_NOT_FOUND
```

The frontend can map codes to localized messages when necessary.

The API can continue providing a default safe message.

---

# 57. API Contract for Errors

Error schemas should live alongside other shared API contracts where appropriate.

Conceptually:

```text
packages/api-contracts
    |
    +-- common
    |    +-- error.ts
    |    +-- pagination.ts
    |
    +-- auth
    +-- users
    +-- todos
```

Example TypeBox contract:

```ts
export const ApiErrorDetailSchema = Type.Object({
  field: Type.Optional(Type.String()),
  code: Type.String(),
  message: Type.String(),
});

export const ApiErrorSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    requestId: Type.Optional(Type.String()),
    details: Type.Optional(Type.Array(ApiErrorDetailSchema)),
  }),
});
```

The exact schema should match the actual implementation.

---

# 58. Swagger/OpenAPI Documentation

Document important error responses for every endpoint.

Example:

```text
POST /users

201 Created
400 Validation Error
401 Unauthorized
403 Forbidden
409 Conflict
429 Rate Limited
500 Internal Error
```

Swagger should make failure behavior visible to API consumers.

Do not document every theoretical internal exception.

Document meaningful public contract behavior.

---

# 59. Endpoint Error Matrix

Every endpoint should have an error matrix.

Example:

| Endpoint          | 400 | 401 | 403 | 404 | 409 | 429 | 500 |
| ----------------- | --: | --: | --: | --: | --: | --: | --: |
| POST /users       |   ✓ |   ✓ |   ✓ |   - |   ✓ |   ✓ |   ✓ |
| GET /users/:id    |   - |   ✓ |   ✓ |   ✓ |   - |   ✓ |   ✓ |
| PATCH /users/:id  |   ✓ |   ✓ |   ✓ |   ✓ |   ✓ |   ✓ |   ✓ |
| DELETE /users/:id |   - |   ✓ |   ✓ |   ✓ |   ✓ |   ✓ |   ✓ |

This matrix should be reviewed when adding endpoints.

---

# 60. Error Handling and Audit Logs

Security-sensitive failures may require audit events.

Examples:

```text
repeated failed login
permission denied on admin action
role assignment denied
session revocation
password reset
MFA failure
```

Do not create audit records for every ordinary validation error unless the product requires it.

Audit events should be structured and privacy-aware.

---

# 61. Error Handling and Security Alerts

Some failures deserve security monitoring.

Examples:

```text
many failed logins
many refresh-token failures
many forbidden admin operations
suspicious request patterns
unexpected credential failures
```

The error response remains safe while security systems receive richer telemetry.

---

# 62. Startup Errors

Configuration errors should fail fast.

Examples:

```text
missing DATABASE_URL
missing JWT_SECRET
invalid PORT
invalid CORS configuration
invalid production settings
```

The application should refuse to start when required configuration is invalid.

Startup errors should be visible in deployment logs.

Do not start in a partially configured insecure state.

---

# 63. Health and Readiness Errors

Health endpoints should communicate infrastructure state clearly.

Recommended distinction:

```text
/health
```

answers:

```text
Is the process alive?
```

while:

```text
/ready
```

answers:

```text
Can this instance safely receive traffic?
```

A database dependency failure may make readiness fail even if the process itself is alive.

---

# 64. Graceful Shutdown

During shutdown:

```text
stop accepting new work
        |
finish safe in-flight work
        |
close workers
        |
close database
        |
exit
```

New requests during shutdown should not be left hanging indefinitely.

Deployment systems should be able to distinguish terminating instances from healthy instances.

---

# 65. Error Handling During Shutdown

Avoid starting new work after shutdown begins.

Handle:

```text
SIGTERM
SIGINT
```

cleanly.

If an in-flight operation cannot complete safely, fail it explicitly and let the client retry when appropriate.

---

# 66. Network Errors

The Admin should distinguish:

```text
No response
HTTP error response
Malformed API response
Timeout
```

For example:

```text
Network unavailable
```

is different from:

```text
403 Permission denied
```

Do not display every failed request as "Network error."

---

# 67. Malformed Server Responses

If the API client receives an unexpected response:

```text
HTTP 500
Content-Type text/html
```

when JSON was expected, normalize it to:

```text
INTERNAL_ERROR
```

rather than crashing the Admin UI.

The client should remain resilient to malformed upstream responses.

---

# 68. Frontend Error Boundary

React Admin should have an application-level error boundary.

It should prevent one component failure from blanking the entire application.

The error boundary should provide:

```text
safe fallback UI
retry/reload option
request/session context when available
error reporting hook
```

Never display internal stack traces to ordinary users.

---

# 69. Query and Mutation Errors

TanStack Query failures should be handled consistently.

Avoid duplicating:

```ts
onError(...)
```

logic across every component.

Prefer shared error normalization and reusable UI patterns.

Examples:

```text
QueryErrorState
MutationErrorMessage
ApiErrorToast
PermissionDenied
NotFoundState
```

---

# 70. Error Recovery

Every important error should have an intended recovery strategy.

| Error      | Recovery             |
| ---------- | -------------------- |
| Validation | correct input        |
| 401        | refresh/login        |
| 403        | request permission   |
| 404        | navigate back/search |
| 409        | refresh/reconcile    |
| 429        | wait/retry           |
| 503        | retry later          |
| 504        | retry                |
| 500        | report/request ID    |
| DB outage  | operator recovery    |

---

# 71. Do Not Swallow Errors

Bad:

```ts
try {
  await saveUser();
} catch {
  // ignore
}
```

This can cause:

- inconsistent state
- silent failures
- missing audit records
- incorrect success responses
- difficult debugging

If an error is intentionally ignored, document why.

---

# 72. Partial Failure

Distributed or multi-step workflows can partially fail.

Example:

```text
Create user
   |
Create profile
   |
Send email
```

If sending the email fails, the user may still exist.

Do not pretend the entire operation failed if the transaction intentionally allows partial completion.

Instead:

```text
database transaction succeeds
email becomes background job
```

This is often more reliable.

---

# 73. Golden Orchestrator Error Handling

Fastify-MasterApp uses the Golden Orchestrator pattern to coordinate business workflows.

The orchestrator should:

1. validate prerequisites
2. call required services
3. maintain workflow invariants
4. handle expected domain failures
5. preserve transaction boundaries
6. avoid swallowing unexpected failures
7. emit appropriate events/jobs when necessary

Conceptually:

```text
Route
  |
  v
Golden Orchestrator
  |
  +--> Authorization
  +--> Service A
  +--> Service B
  +--> Repository
  +--> Audit event
  +--> Background job
```

An orchestrator should not become a generic error-catching layer.

---

# 74. Error Handling and Transactions

Decide explicitly whether an operation is:

```text
atomic
```

or:

```text
eventually consistent
```

Atomic:

```text
all changes succeed
OR
all changes rollback
```

Eventually consistent:

```text
core transaction succeeds
        |
        v
background work retries independently
```

Document this for important workflows.

---

# 75. Error Handling and Caching

Cache failures should not always fail the entire request.

For non-critical cache reads:

```text
cache unavailable
      |
      v
query database
```

For required coordination data:

```text
Redis unavailable
      |
      v
503
```

The decision depends on the role of the cache/dependency.

Never hide critical consistency failures.

---

# 76. Error Handling and Rate Limiting

Rate limiting errors should not cause noisy application logs at error level for every rejected request.

Track them through:

```text
metrics
structured logs where useful
security monitoring
```

High-volume expected rejections should not overwhelm error logs.

---

# 77. Error Handling and CORS

CORS failures may be generated by browser policy before application JavaScript can inspect the response.

Ensure legitimate Admin origins are configured correctly.

Do not use:

```text
Access-Control-Allow-Origin: *
```

for authenticated administrative APIs unless the architecture explicitly requires it and credentials are not involved.

---

# 78. Error Handling and CSRF

If authentication uses browser cookies, CSRF protections must be considered.

A CSRF failure should have a stable safe error.

Example:

```text
403 CSRF_VALIDATION_FAILED
```

Do not reveal secret token values.

---

# 79. File Upload Errors

File upload failures should cover:

```text
invalid content type
payload too large
invalid file extension
invalid file signature
malware/security rejection
storage failure
```

Possible responses:

```text
400
413
415
422
500
503
```

Never trust a filename or extension alone.

Never expose temporary server filesystem paths.

---

# 80. Path and Filesystem Errors

Never return:

```text
ENOENT: /var/app/uploads/secret/file.txt
```

Instead:

```text
The requested file was not found.
```

Internal logs may retain sanitized diagnostic information.

---

# 81. Serialization Errors

If an object cannot be serialized for an API response:

```text
500 INTERNAL_ERROR
```

Do not attempt to stringify sensitive objects into the response.

Keep response schemas explicit to reduce accidental serialization of internal fields.

---

# 82. Sensitive Field Leakage

Use response schemas to control output.

Never return the database model blindly.

Bad:

```ts
return prisma.user.findUnique(...)
```

if the model contains:

```text
passwordHash
refreshTokenHash
resetTokenHash
internalFlags
```

Prefer explicit public response schemas.

---

# 83. Error Object Leakage

Never return:

```ts
reply.send(error);
```

for arbitrary exceptions.

Error objects can contain:

- stack
- cause
- request data
- database metadata
- credentials
- internal paths

Always translate them into the public error contract.

---

# 84. Dependency Version Errors

Unexpected dependency exceptions should be captured and logged.

Do not make the public API contract dependent on the exact wording of:

```text
Fastify
Prisma
TypeBox
Node.js
Redis
```

errors.

Dependency upgrades should not require clients to understand vendor exception strings.

---

# 85. Error Code Versioning

Error codes should be treated as stable API identifiers.

Avoid renaming:

```text
USER_NOT_FOUND
```

to:

```text
RESOURCE_MISSING
```

without considering client compatibility.

If a code must change:

1. document the change
2. update shared contracts
3. update Admin behavior
4. update tests
5. update API documentation
6. consider a compatibility period

---

# 86. Error Contract Backward Compatibility

Adding optional fields is generally safer than removing or renaming fields.

Safer:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "requestId": "...",
    "details": [...]
  }
}
```

Do not suddenly remove:

```text
requestId
```

if clients depend on it.

---

# 87. API Versioning

When introducing a breaking error-contract change, use the established API versioning strategy.

For example:

```text
/api/v1
/api/v2
```

Do not silently change error semantics for existing consumers.

---

# 88. Testing Strategy

Every meaningful error category should be tested.

At minimum:

```text
validation
401
403
404
409
429
500
dependency failure
database failure
timeout
malformed response
```

Tests should verify:

- HTTP status
- error code
- safe message
- request ID
- details when applicable
- absence of sensitive information

---

# 89. Authentication Error Tests

Test:

```text
missing token
malformed token
expired token
wrong signing secret
revoked session
invalid refresh token
refresh-token replay
invalid credentials
```

Verify that sensitive token information is never returned.

---

# 90. Authorization Error Tests

Test:

```text
unauthenticated user
authenticated user without permission
wrong role
revoked permission
resource ownership failure
cross-user access
admin-only endpoint
```

Verify default-deny behavior.

---

# 91. Validation Error Tests

Test:

```text
missing field
wrong type
invalid format
invalid enum
empty string
too long
too short
invalid identifier
unexpected property
invalid pagination
```

Verify the API returns structured validation errors.

---

# 92. Database Error Tests

Use controlled test conditions for:

```text
unique violation
foreign key violation
transaction failure
connection failure
timeout
```

Verify that raw Prisma/database internals are not returned.

---

# 93. Error Contract Tests

Every API module should verify the shared error envelope.

Example assertion:

```ts
expect(response.body).toMatchObject({
  error: {
    code: expect.any(String),
    message: expect.any(String),
  },
});
```

Where applicable:

```ts
expect(response.body.error.requestId).toBeDefined();
```

---

# 94. Security Error Tests

Scan error responses for forbidden content:

```text
JWT
Bearer
password
secret
DATABASE_URL
postgres://
private key
stack trace
filesystem path
SQL
```

This can be implemented as reusable integration-test assertions.

---

# 95. Admin Error Tests

Test:

```text
401 refresh flow
refresh failure
403 permission UI
404 page
409 conflict
429 retry state
500 fallback
network offline
malformed API response
```

Verify that one failed request does not break unrelated application state.

---

# 96. E2E Error Scenarios

Important end-to-end scenarios:

### Authentication

```text
login failure
session expiration
refresh failure
logout
```

### Authorization

```text
restricted page
restricted action
direct API request without permission
```

### CRUD

```text
duplicate create
update stale resource
delete missing resource
invalid form
```

### Infrastructure

```text
API unavailable
database unavailable
slow API
```

---

# 97. Load Testing Error Behavior

Load tests should observe:

```text
5xx rate
429 rate
latency
timeouts
connection exhaustion
database saturation
```

A system that returns fast `500`s under load is still unhealthy.

---

# 98. Error Handling During Deployments

During deployment, validate:

```text
new API + old Admin
old API + new Admin
migration compatibility
new error codes
new response schema
```

Do not deploy a frontend that requires an error code unavailable from the currently deployed API unless deployment ordering guarantees it.

---

# 99. Observability Correlation

An error should be traceable:

```text
User sees requestId
        |
        v
API log
        |
        v
Service log
        |
        v
Database/dependency log
        |
        v
Metric/trace
```

This dramatically reduces incident investigation time.

---

# 100. Incident Response

When investigating an error:

1. obtain request ID
2. identify timestamp
3. identify endpoint
4. inspect structured logs
5. inspect error code
6. inspect dependency/database health
7. inspect recent deployment
8. inspect metrics
9. determine blast radius
10. mitigate
11. verify recovery
12. document root cause

Never ask users for passwords or tokens during debugging.

---

# 101. Error Severity

Recommended severity model:

## P0

Examples:

```text
all requests failing
authentication broken globally
data corruption
security breach
```

Immediate response.

## P1

Examples:

```text
major admin feature unavailable
database instability
high 5xx rate
critical dependency unavailable
```

Urgent response.

## P2

Examples:

```text
single feature broken
intermittent non-critical failures
minor UX issue
```

Normal incident workflow.

## P3

Examples:

```text
rare edge-case
cosmetic error message
documentation mismatch
```

Normal backlog.

---

# 102. Common Anti-Patterns

## Anti-pattern 1: Catch Everything and Return 500

```ts
try {
  ...
} catch {
  throw new Error("Something went wrong");
}
```

Problem:

- destroys useful error classification
- hides expected business failures
- makes debugging harder

---

## Anti-pattern 2: Return Raw Exceptions

```ts
reply.send(error);
```

Problem:

- leaks internals
- inconsistent response format
- security risk

---

## Anti-pattern 3: HTTP Logic in Repository

```ts
throw new HttpError(404);
```

Problem:

- couples persistence to HTTP
- makes reuse harder

---

## Anti-pattern 4: String Matching Errors

```ts
if (error.message.includes("Unique constraint")) {
  ...
}
```

Problem:

- brittle
- dependency-version sensitive

Prefer typed error classification.

---

## Anti-pattern 5: Error Messages as API Contracts

Bad client code:

```ts
if (message === "User was not found.") {
  ...
}
```

Use:

```ts
if (code === "USER_NOT_FOUND") {
  ...
}
```

---

## Anti-pattern 6: Log Everything at Error Level

This causes:

- noisy logs
- alert fatigue
- expensive logging
- hidden real incidents

Use appropriate levels.

---

## Anti-pattern 7: Ignore Errors

```ts
catch {}
```

Silent failures are difficult to diagnose and can corrupt workflows.

---

## Anti-pattern 8: Retry Everything

Retrying:

```text
400
403
409
```

usually makes no sense.

Retries must be based on failure semantics.

---

## Anti-pattern 9: Leak User Existence

Avoid login responses such as:

```text
No account exists.
```

when the same endpoint can be used for account enumeration.

---

## Anti-pattern 10: Return 200 for Errors

Do not encode application failure inside successful HTTP responses.

---

# 103. Recommended Error Module Structure

A possible backend structure:

```text
apps/api/src/
├── errors/
│   ├── domain-error.ts
│   ├── error-codes.ts
│   ├── error-handler.ts
│   ├── error-mapper.ts
│   ├── validation-error.ts
│   ├── auth-errors.ts
│   ├── authorization-errors.ts
│   ├── resource-errors.ts
│   ├── conflict-errors.ts
│   ├── dependency-errors.ts
│   └── index.ts
```

The exact file structure can differ, but error ownership should remain centralized and discoverable.

---

# 104. Error Code Ownership

Prefer a central registry:

```ts
export const ErrorCode = {
  Validation: "VALIDATION_ERROR",
  Unauthorized: "UNAUTHORIZED",
  Forbidden: "FORBIDDEN",
  NotFound: "NOT_FOUND",
  Conflict: "CONFLICT",
  RateLimited: "RATE_LIMITED",
  Internal: "INTERNAL_ERROR",
} as const;
```

Domain modules can add specific codes where necessary.

Avoid uncontrolled error-code proliferation.

---

# 105. Domain Error Example

Conceptual implementation:

```ts
export class UserNotFoundError extends DomainError {
  constructor() {
    super({
      code: "USER_NOT_FOUND",
      message: "User was not found.",
      statusCode: 404,
    });
  }
}
```

Then:

```ts
const user = await userRepository.findById(id);

if (!user) {
  throw new UserNotFoundError();
}
```

The HTTP layer handles translation.

---

# 106. Central Error Mapping

Conceptually:

```ts
function mapError(error: unknown): PublicError {
  if (error instanceof DomainError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
        },
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    },
  };
}
```

The production implementation should additionally account for Fastify validation errors, authentication errors, known database errors, rate limiting, and dependency failures.

---

# 107. Error Handler Checklist

The global handler should answer:

- Is the error expected?
- Is it safe to expose?
- What HTTP status applies?
- What stable code applies?
- Does the response need details?
- What request ID applies?
- What should be logged?
- At what log level?
- Does this trigger a metric?
- Does this trigger an audit event?
- Does this indicate a security event?
- Can the client retry?
- Is the operation idempotent?
- Is the failure recoverable?

---

# 108. Definition of Done — API Errors

An endpoint is not complete until:

- [ ] request validation is defined
- [ ] authentication behavior is defined
- [ ] authorization behavior is defined
- [ ] resource-not-found behavior is defined
- [ ] conflict behavior is defined
- [ ] dependency failures are considered
- [ ] unexpected errors reach the global handler
- [ ] response uses the standard error envelope
- [ ] error codes are stable
- [ ] request ID is available
- [ ] sensitive information is not exposed
- [ ] logs are structured
- [ ] appropriate metrics exist where needed
- [ ] tests cover expected failures
- [ ] Swagger documents meaningful errors
- [ ] Admin behavior is defined

---

# 109. Definition of Done — Admin Error UX

A frontend feature is complete when:

- [ ] validation errors are shown at the right fields
- [ ] authentication failures recover correctly
- [ ] permission failures are clear
- [ ] not-found states are handled
- [ ] conflicts provide recovery guidance
- [ ] network errors are distinguishable
- [ ] retry behavior is intentional
- [ ] raw API errors are never shown
- [ ] request IDs can be surfaced for support when useful
- [ ] unexpected UI errors are caught by an error boundary
- [ ] tests cover major failure states

---

# 110. Production Error Checklist

Before production:

## API

- [ ] global error handler configured
- [ ] standard error envelope implemented
- [ ] stable error codes
- [ ] validation errors normalized
- [ ] authentication errors normalized
- [ ] authorization errors normalized
- [ ] Prisma errors translated
- [ ] dependency errors translated
- [ ] unknown errors sanitized

## Security

- [ ] no stack traces in production
- [ ] no secrets in responses
- [ ] no tokens in logs
- [ ] no passwords in logs
- [ ] no database credentials in logs
- [ ] account enumeration reviewed
- [ ] resource existence leakage reviewed

## Observability

- [ ] request IDs
- [ ] structured logs
- [ ] 5xx metrics
- [ ] dependency metrics
- [ ] job failure metrics
- [ ] alerts for critical failures

## Admin

- [ ] 401 handling
- [ ] 403 handling
- [ ] 404 handling
- [ ] 409 handling
- [ ] 429 handling
- [ ] 5xx handling
- [ ] network handling
- [ ] error boundary

## Testing

- [ ] unit tests
- [ ] integration tests
- [ ] contract tests
- [ ] security tests
- [ ] E2E tests
- [ ] deployment smoke tests

---

# 111. Recommended Implementation Order

Implement error handling in this order:

```text
1. Define public error contract
        |
2. Define stable error codes
        |
3. Implement DomainError
        |
4. Implement Fastify global handler
        |
5. Normalize validation errors
        |
6. Normalize auth errors
        |
7. Normalize authorization errors
        |
8. Translate Prisma errors
        |
9. Add request IDs
        |
10. Add structured logging
        |
11. Add Admin error normalization
        |
12. Add error metrics
        |
13. Add integration/security tests
        |
14. Add E2E failure scenarios
```

---

# 112. Golden Rules

Keep these rules visible during development:

```text
1. Errors are part of the API contract.

2. HTTP status describes transport semantics.

3. Error code describes machine-readable meaning.

4. Message is for humans, not program logic.

5. Never return raw exceptions.

6. Never leak secrets.

7. Authenticate before authorizing.

8. Validate at the boundary.

9. Translate database errors before they reach HTTP.

10. Expected business failures are not programming bugs.

11. Unexpected errors must be observable.

12. Every important request should be traceable by request ID.

13. Retry only when failure semantics permit it.

14. Do not retry non-idempotent writes blindly.

15. Admin UX should provide recovery guidance.

16. Test failure paths as seriously as success paths.

17. Keep error handling centralized and predictable.

18. Prefer safe generic responses over useful-to-an-attacker details.

19. Preserve enough internal context for engineers to diagnose failures.

20. A consistent error system is a reliability and security feature.
```

---

# 113. Target Error Architecture

The final target architecture is:

```text
                         ┌─────────────────────┐
                         │       Client        │
                         │ React Admin / API   │
                         └──────────┬──────────┘
                                    │
                                    v
                         ┌─────────────────────┐
                         │   Fastify HTTP      │
                         │ validation/auth     │
                         └──────────┬──────────┘
                                    │
                                    v
                         ┌─────────────────────┐
                         │ Route               │
                         │ thin HTTP adapter   │
                         └──────────┬──────────┘
                                    │
                                    v
                         ┌─────────────────────┐
                         │ Service /           │
                         │ Golden Orchestrator │
                         └──────────┬──────────┘
                                    │
                         ┌──────────┴──────────┐
                         v                     v
                ┌─────────────────┐   ┌─────────────────┐
                │ Repository      │   │ External        │
                │ Prisma          │   │ Dependencies    │
                └────────┬────────┘   └────────┬────────┘
                         │                     │
                         v                     v
                ┌─────────────────┐   ┌─────────────────┐
                │ PostgreSQL      │   │ Redis / APIs /  │
                │                 │   │ Providers       │
                └─────────────────┘   └─────────────────┘

                         All failures
                               |
                               v
                     ┌───────────────────┐
                     │ Error Translation │
                     │ + Classification  │
                     └─────────┬─────────┘
                               |
                ┌──────────────┼──────────────┐
                v              v              v
        ┌──────────────┐ ┌────────────┐ ┌──────────────┐
        │ HTTP Response│ │ Pino Logs  │ │ Metrics      │
        │ Safe Public  │ │ Internal   │ │ Aggregated   │
        │ Contract     │ │ Diagnostics│ │ Telemetry    │
        └──────────────┘ └────────────┘ └──────────────┘
```

The central design principle is:

> **Translate errors at boundaries, expose only safe stable contracts, and preserve rich diagnostic context internally.**

This keeps Fastify-MasterApp predictable for API consumers, safe for production, and easy to debug.
