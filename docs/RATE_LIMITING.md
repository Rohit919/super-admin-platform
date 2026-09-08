# Rate Limiting

## Fastify-MasterApp

> Production-grade rate limiting strategy for the Fastify API, authentication endpoints, Admin frontend, public APIs, protected resources, background jobs, and distributed deployments.

---

## 1. Purpose

Rate limiting controls how frequently clients can perform operations within a defined period.

Fastify-MasterApp should use rate limiting to protect:

- authentication endpoints
- password and account recovery flows
- public APIs
- expensive endpoints
- administrative operations
- resource-intensive searches
- file uploads
- external integrations
- background-job producers
- infrastructure dependencies

The primary goals are:

1. Prevent abuse.
2. Reduce brute-force attacks.
3. Protect database capacity.
4. Protect external dependencies.
5. Prevent accidental traffic spikes.
6. Improve availability.
7. Provide predictable API behavior.
8. Make limits observable and configurable.

The central principle is:

> Rate limiting is a capacity and security control, not a substitute for authentication or authorization.

---

# 2. Core Principles

## 2.1 Default deny for dangerous operations

Sensitive operations should have explicit limits.

Examples:

```text
login
password reset
refresh token
email verification
MFA verification
file upload
bulk mutation
```

Do not assume that a global API limit is sufficient.

---

## 2.2 Limits should reflect cost

Not every endpoint costs the same.

For example:

```text
GET /api/v1/users/me
```

may be inexpensive.

Whereas:

```text
POST /api/v1/reports/export
```

may trigger:

- database scans
- file generation
- background jobs
- object storage
- email
- CPU-heavy processing

These should not necessarily share the same limit.

---

## 2.3 Authentication and authorization remain separate

Rate limiting does not answer:

> "Is this user allowed to perform this action?"

RBAC answers that.

Rate limiting answers:

> "How frequently should this client be allowed to perform this action?"

Both controls are required.

---

## 2.4 Distributed deployments require shared state

A local in-memory counter is insufficient when:

```text
             Load Balancer
                  │
        ┌─────────┼─────────┐
        │         │         │
       API-1     API-2     API-3
        │         │         │
        └─────────┼─────────┘
                  │
                Redis
```

Without shared state, a client can effectively multiply its limit by the number of API instances.

For production horizontal scaling, use a shared rate-limit store such as Redis.

---

# 3. Threat Model

Rate limiting should address:

- brute-force login attempts
- credential stuffing
- password-reset abuse
- token-refresh abuse
- account enumeration attempts
- scraping
- API flooding
- expensive-query abuse
- file-upload abuse
- bulk-operation abuse
- accidental client retry storms
- malicious automation
- resource exhaustion

It does not fully prevent:

- distributed attacks
- application vulnerabilities
- stolen credentials
- privilege escalation
- SQL injection
- XSS
- CSRF
- compromised administrator accounts

Use rate limiting as one layer of defense-in-depth.

---

# 4. Rate-Limiting Dimensions

A useful implementation can apply limits using multiple dimensions.

## 4.1 IP address

Example:

```text
203.0.113.10
```

Useful for:

- anonymous requests
- login protection
- abuse detection

Weakness:

- many legitimate users may share one IP
- attackers may rotate IP addresses

---

## 4.2 User ID

After authentication:

```text
user:{userId}
```

Useful for:

- authenticated API limits
- expensive operations
- preventing one account from consuming all capacity

---

## 4.3 API key

For machine-to-machine clients:

```text
api-key:{keyId}
```

This is generally preferable to IP-only limiting for trusted integrations.

---

## 4.4 Route

Example:

```text
route:POST:/api/v1/auth/login
```

Useful for protecting individual endpoints.

---

## 4.5 Tenant

If multi-tenancy is introduced:

```text
tenant:{tenantId}
```

Tenant-level limits prevent one customer from consuming shared infrastructure capacity.

---

## 4.6 Composite keys

Production systems often use combinations:

```text
IP + route
User + route
Tenant + route
API key + route
```

Example:

```text
login:
    IP limit
    +
    account limit
```

This provides stronger protection than either dimension alone.

---

# 5. Anonymous vs Authenticated Limits

Anonymous clients:

```text
IP-based
```

Authenticated clients:

```text
user-based
+
IP-based where useful
```

Machine clients:

```text
API-key-based
```

Multi-tenant systems:

```text
user
+
tenant
+
route
```

Do not rely only on user IDs because attackers can create many accounts.

Do not rely only on IP addresses because legitimate users can share networks.

---

# 6. Limit Categories

Recommended categories:

| Category       | Example              |
| -------------- | -------------------- |
| Global         | All API requests     |
| Public         | Unauthenticated APIs |
| Authentication | Login/register       |
| Recovery       | Password reset       |
| Token          | Refresh              |
| Admin          | Administrative APIs  |
| Expensive      | Reports/search       |
| Mutation       | Writes               |
| Upload         | File uploads         |
| Bulk           | Bulk actions         |
| Integration    | API keys/webhooks    |

---

# 7. Recommended Initial Policy

The exact values should be configurable.

Example starting policy:

| Endpoint category         | Suggested limit |
| ------------------------- | --------------: |
| Global authenticated API  |    300/min/user |
| Public API                |      120/min/IP |
| Login                     |       10/min/IP |
| Login per account         |   5/min/account |
| Registration              |       5/hour/IP |
| Password reset request    |       5/hour/IP |
| Password reset completion |      10/hour/IP |
| Refresh token             |  60/min/session |
| Email verification        |      10/hour/IP |
| Admin mutations           |    120/min/user |
| File uploads              |     20/min/user |
| Expensive reports         |     10/min/user |
| Bulk operations           |     20/min/user |

These are starting values, not universal production defaults.

Tune them using observed traffic and capacity.

---

# 8. Global Rate Limit

A global limit protects the entire API.

Example:

```text
All requests
      ↓
Global limiter
      ↓
Route-specific limiter
      ↓
Authentication
      ↓
Authorization
      ↓
Handler
```

The global limit should be high enough not to interfere with ordinary traffic.

It primarily protects against unexpected spikes.

---

# 9. Route-Specific Limits

Sensitive routes should have explicit limits.

Example:

```text
POST /api/v1/auth/login
POST /api/v1/auth/register
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/password-reset
POST /api/v1/auth/verify-email
```

Do not depend only on the global API limit.

---

# 10. Authentication Rate Limiting

Authentication endpoints are high-value attack targets.

Protect:

- login
- registration
- password reset
- email verification
- refresh
- MFA
- session creation

Use multiple dimensions where appropriate.

Example:

```text
Login request
    │
    ├── IP limit
    │
    ├── account identifier limit
    │
    └── global authentication limit
```

---

# 11. Login Protection

A login request can be keyed by:

```text
IP
+
normalized account identifier
```

Example:

```text
login:ip:203.0.113.10
login:account:user@example.com
```

This prevents an attacker from repeatedly targeting one account while also protecting against attacks distributed across many accounts.

---

# 12. Account Enumeration

Rate limiting should not create a new account-enumeration signal.

Avoid responses such as:

```text
Account has been rate limited
```

for only existing users.

Prefer generic authentication responses where appropriate.

For example:

```text
Invalid credentials
```

rather than:

```text
User exists but is temporarily blocked
```

Security-sensitive differences should not be exposed unnecessarily.

---

# 13. Registration Limiting

Registration abuse can cause:

- spam accounts
- database growth
- email-provider costs
- verification-email abuse
- fraudulent activity

Use limits such as:

```text
IP + registration route
```

and potentially:

```text
device/fingerprint signals
```

where legally and technically appropriate.

Do not rely on CAPTCHA as the only protection.

---

# 14. Password Reset Limiting

Password reset requests should be strongly limited.

Example:

```text
POST /api/v1/auth/password-reset
```

Potential limits:

```text
IP: 5/hour
Account/email: low threshold
```

The response should not reveal whether the account exists.

Example:

```text
If the account is eligible, a reset message will be sent.
```

---

# 15. Email Verification Limiting

Verification-email resend endpoints can be abused to generate provider costs.

Limit:

```text
resend verification
```

by:

- user
- IP
- account
- time window

Also impose a cooldown.

Example:

```text
minimum resend interval = 60 seconds
```

---

# 16. Refresh Token Limiting

Refresh endpoints should be limited.

Example:

```text
POST /api/v1/auth/refresh
```

Potential dimensions:

```text
session
+
user
+
IP
```

A refresh-token client should not repeatedly refresh in a tight loop.

The Admin frontend should avoid refresh storms by implementing single-flight refresh behavior.

---

# 17. Logout Limiting

Logout generally needs a less restrictive limit.

However, a malicious client should not be able to flood session-revocation operations.

Use a reasonable authenticated-user limit.

---

# 18. MFA Rate Limiting

If MFA is implemented, verification attempts require strict limits.

Example:

```text
MFA verification
    ↓
IP limit
+
user/session limit
+
attempt counter
```

MFA brute-force protection should be stronger than ordinary API protection.

---

# 19. Admin Rate Limiting

Administrators can perform expensive operations.

Do not exempt Admin users from all limits.

For example:

```text
Admin
    ↓
120 requests/minute
```

rather than:

```text
Admin
    ↓
unlimited
```

Privileged users should often have **higher but still finite** limits.

---

# 20. Bulk Operations

Bulk endpoints can be expensive.

Examples:

```text
POST /users/bulk-delete
POST /orders/bulk-update
POST /exports
```

Rate limit:

- number of requests
- number of records per request
- total processing cost

Example:

```text
20 bulk operations/minute
+
maximum 100 records/request
```

Rate limiting request count alone is not sufficient when request sizes vary greatly.

---

# 21. Cost-Based Limiting

For highly variable requests, assign cost units.

Example:

```text
simple read = 1 unit
filtered search = 2 units
large export = 20 units
bulk mutation = 10 units
```

Then:

```text
User budget = 300 units/minute
```

This more accurately represents resource consumption.

Use this only where the additional complexity is justified.

---

# 22. Pagination and Rate Limits

Pagination limits should work together with rate limits.

Prevent:

```text
?page=1&limit=1000000
```

through schema validation.

Use:

```text
limit <= 100
```

for ordinary endpoints.

Then rate limiting protects request frequency while pagination limits protect per-request cost.

---

# 23. Search Rate Limiting

Search endpoints can generate expensive database queries.

Protect:

```text
GET /users?search=...
GET /orders?search=...
```

with:

- pagination
- query length limits
- indexed fields
- query complexity limits
- rate limiting
- caching where appropriate

Do not solve poor database indexing with increasingly aggressive rate limits.

---

# 24. File Upload Limits

Uploads need several protections:

```text
requests/minute
+
file size
+
files/request
+
total bytes/minute
```

Example:

```text
20 uploads/minute
10 MB/file
5 files/request
```

Also validate:

- MIME type
- extension
- content
- storage destination
- filename
- authorization

Rate limiting is only one upload control.

---

# 25. Webhook Rate Limiting

Inbound webhooks should be protected carefully.

Use:

- signature verification
- timestamp validation
- replay protection
- idempotency
- reasonable rate limits

Do not rate-limit legitimate provider retries so aggressively that valid events are permanently rejected.

Prefer returning an appropriate retryable response when temporary capacity is unavailable.

---

# 26. API Key Rate Limiting

For future API-key clients:

```text
api-key:{keyId}
```

should generally be the primary identity.

Support:

- per-key limits
- endpoint-specific limits
- tenant-level limits
- burst capacity
- quotas

API keys should never be exposed in logs.

---

# 27. Quotas vs Rate Limits

These are different.

### Rate limit

Controls:

```text
requests per time window
```

Example:

```text
100 requests/minute
```

### Quota

Controls:

```text
total usage over a longer period
```

Example:

```text
100,000 requests/month
```

Use quotas for product/billing limits.

Use rate limits for protection and traffic shaping.

---

# 28. Burst Handling

A strict fixed window can cause undesirable boundary behavior.

Example:

```text
09:59:59 → 100 requests
10:00:00 → 100 requests
```

A client may effectively send 200 requests in two seconds.

Depending on requirements, consider:

- token bucket
- leaky bucket
- sliding window
- sliding-window counter

---

# 29. Algorithm Selection

## Fixed Window

Simple:

```text
100 requests / minute
```

Pros:

- easy
- inexpensive

Cons:

- boundary bursts

---

## Sliding Window

Tracks requests more smoothly.

Pros:

- better fairness

Cons:

- more state/complexity

---

## Token Bucket

Tokens refill continuously.

Example:

```text
Bucket = 100 tokens
Refill = 10/sec
```

Pros:

- handles bursts
- intuitive
- flexible

Cons:

- implementation complexity

---

## Leaky Bucket

Smooths traffic.

Useful for:

- downstream APIs
- strict processing rates

For Fastify-MasterApp, start with the framework/plugin-supported approach and move to more advanced algorithms only when requirements justify them.

---

# 30. Fastify Integration

Rate limiting should be implemented at the Fastify boundary.

Conceptually:

```text
Request
  ↓
Request ID
  ↓
Rate limiter
  ↓
Authentication
  ↓
Authorization
  ↓
Validation
  ↓
Route handler
```

The exact hook order should be verified against the Fastify/plugin configuration used by the application.

---

# 31. Plugin Configuration

Fastify's ecosystem provides rate-limiting support.

A typical configuration should make limits explicit and environment-driven.

Conceptual example:

```ts
await app.register(rateLimit, {
  max: config.rateLimit.max,
  timeWindow: config.rateLimit.timeWindow,
});
```

For distributed deployments, configure a shared store rather than relying on process-local memory.

Keep production configuration outside source code.

---

# 32. Configuration

Existing configuration should expose rate-limit settings.

Example:

```text
RATE_LIMIT_MAX
RATE_LIMIT_TIME_WINDOW
```

More advanced configuration may include:

```text
RATE_LIMIT_AUTH_MAX
RATE_LIMIT_AUTH_TIME_WINDOW
RATE_LIMIT_ADMIN_MAX
RATE_LIMIT_UPLOAD_MAX
RATE_LIMIT_BULK_MAX
RATE_LIMIT_REDIS_URL
```

Avoid creating dozens of environment variables before there is a real need.

Prefer centralized typed configuration.

---

# 33. Configuration Validation

Validate:

- maximum requests
- time window
- Redis URL when distributed limiting is enabled
- environment-specific overrides

Fail fast on invalid values.

Example invalid configuration:

```text
RATE_LIMIT_MAX=-10
```

should prevent startup rather than silently disabling protection.

---

# 34. Development Environment

Development should remain convenient.

Possible policy:

```text
development:
    generous limits
```

rather than:

```text
development:
    unlimited
```

Keeping limits enabled in development helps expose client retry bugs.

---

# 35. Test Environment

Tests should be deterministic.

Options:

- configure very high limits
- disable rate limiting for specific isolated tests
- use a test-specific store
- explicitly test rate limiting with low thresholds

Do not allow tests to share production Redis.

---

# 36. Redis Architecture

For distributed rate limiting:

```text
API-1 ─┐
API-2 ─┼── Redis
API-3 ─┘
```

Redis stores counters or rate-limit state.

Use a dedicated namespace:

```text
ratelimit:
```

Example conceptual key:

```text
ratelimit:login:ip:203.0.113.10
```

Do not mix rate-limit keys with unrelated application state without a clear namespace strategy.

---

# 37. Redis Failure

Rate limiting must define what happens when Redis is unavailable.

Possible policies:

### Fail closed

Reject requests when rate-limit state cannot be checked.

Pros:

- stronger protection

Cons:

- Redis outage can become API outage

### Fail open

Allow requests when rate-limit state cannot be checked.

Pros:

- application remains available

Cons:

- protection temporarily weakens

### Hybrid

For ordinary endpoints:

```text
fail open
```

For security-sensitive endpoints:

```text
fail closed or apply local emergency protection
```

Choose deliberately.

---

# 38. Recommended Redis Failure Policy

For Fastify-MasterApp:

```text
Normal API:
    prefer availability with bounded fallback

Authentication:
    stronger protection

Security-critical operations:
    conservative behavior
```

The exact policy should be documented and tested before production.

---

# 39. Local Fallback

If distributed rate limiting fails, a local in-memory emergency limiter can provide limited protection.

However:

```text
API-1 local limiter
API-2 local limiter
API-3 local limiter
```

does not provide globally consistent limits.

Treat it as a safety fallback, not the primary distributed strategy.

---

# 40. Trusted Proxy Configuration

IP-based limiting is only as correct as the client's IP information.

If the application is behind:

- load balancer
- reverse proxy
- ingress
- CDN

configure trusted proxy behavior correctly.

Never blindly trust arbitrary client-supplied headers such as:

```text
X-Forwarded-For
```

unless the network topology makes the proxy trustworthy.

Otherwise attackers may spoof IPs and bypass limits.

---

# 41. IP Extraction

The system should define one authoritative client-IP strategy.

Example:

```text
Client
  ↓
Trusted CDN
  ↓
Load Balancer
  ↓
Ingress
  ↓
Fastify
```

Fastify should receive the correct client address based on trusted proxy configuration.

Test this explicitly.

---

# 42. IPv4 and IPv6

Handle:

- IPv4
- IPv6
- IPv4-mapped IPv6
- proxy-normalized addresses

Avoid assuming all clients use IPv4.

Normalize keys consistently.

---

# 43. NAT and Shared IPs

Many users may share an IP:

```text
University
Office
Mobile carrier
Public Wi-Fi
```

IP-only limits can therefore punish legitimate traffic.

Use user/account-based limits after authentication where appropriate.

---

# 44. Mobile Clients

Mobile users may change IP addresses frequently.

Avoid making IP the only identity for authenticated clients.

Use:

```text
user/session
+
IP signals
```

instead.

---

# 45. Rate Limit Response

When a request is rejected, return:

```http
429 Too Many Requests
```

Use the standard API error envelope.

Example:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "requestId": "req_123"
  }
}
```

Do not reveal internal limiter implementation details.

---

# 46. Retry-After

Where appropriate, include:

```http
Retry-After: 30
```

This tells clients when they should retry.

The exact value should represent the expected retry delay.

---

# 47. Rate-Limit Headers

If exposed, headers may include:

```http
RateLimit-Limit
RateLimit-Remaining
RateLimit-Reset
```

Use a consistent format across the API.

Do not expose internal infrastructure details unnecessarily.

---

# 48. Client Behavior

The Admin frontend should respond intelligently to `429`.

It should:

- stop immediate retries
- respect `Retry-After`
- show a user-friendly message
- avoid retry storms
- use exponential backoff where appropriate

Bad behavior:

```text
429
 ↓
retry immediately
 ↓
429
 ↓
retry immediately
```

This creates a feedback loop.

---

# 49. TanStack Query Retry Policy

Automatic retries should be selective.

Do not blindly retry:

```text
429
401
403
400
```

Retrying a rate-limited request immediately makes the problem worse.

Prefer:

```text
429 → wait according to server guidance
```

and only retry when appropriate.

---

# 50. Authentication Refresh Storm

A common Admin failure mode:

```text
50 API requests
       ↓
50 × 401
       ↓
50 refresh requests
       ↓
rate limit exceeded
```

Prevent this using a single-flight refresh mechanism:

```text
Request A ─┐
Request B ─┼── one refresh request
Request C ─┤
Request D ─┘
             ↓
        new access token
             ↓
        retry requests
```

This is both a client-performance and rate-limiting concern.

---

# 51. Rate Limiting and CORS

CORS does not prevent server-to-server abuse.

Do not treat:

```text
CORS
```

as a rate-limit mechanism.

Rate limiting must occur independently.

---

# 52. Rate Limiting and CSRF

CSRF protection prevents unauthorized browser actions.

Rate limiting limits request frequency.

They solve different problems.

Use both where applicable.

---

# 53. Rate Limiting and Authentication

Unauthenticated rate limits should not replace authentication.

Example:

```text
GET /admin/users
```

must still require authorization even if the request is below the rate limit.

Correct sequence:

```text
Rate limit
+
Authenticate
+
Authorize
```

---

# 54. Rate Limiting and RBAC

Do not give unlimited capacity to administrators.

Possible policy:

```text
normal user:
    300/min

admin:
    600/min
```

But still enforce:

```text
permission check
```

on every protected operation.

---

# 55. Sensitive Endpoint Protection

Recommended high-priority limits:

```text
login
register
password reset
email verification
MFA
refresh
API key creation
role assignment
permission changes
bulk operations
file upload
exports
```

---

# 56. API Key Creation

Creating API keys is a sensitive operation.

Protect it with:

- authentication
- RBAC
- re-authentication where appropriate
- rate limiting
- audit logging

Example:

```text
POST /api/v1/api-keys
```

should not be callable repeatedly without controls.

---

# 57. Role and Permission Changes

Privileged operations should have conservative limits.

Examples:

```text
POST /roles
PATCH /roles/:id
POST /permissions
POST /users/:id/roles
```

Also generate audit events.

Rate limiting does not replace authorization.

---

# 58. Export Endpoints

Exports can be expensive.

Prefer:

```text
POST /exports
```

which creates a background job.

Then:

```text
GET /exports/:id
```

checks status.

Rate-limit export creation rather than forcing large synchronous requests through the API.

---

# 59. Background Jobs

Rate limiting also applies to job producers.

Example:

```text
Admin requests export
      ↓
API rate limit
      ↓
Create job
      ↓
Queue
```

Without producer limits, a user can enqueue thousands of jobs even if worker concurrency is controlled.

---

# 60. Queue Backpressure

Use multiple controls:

```text
API rate limit
+
request size limit
+
queue limit
+
worker concurrency
+
job deduplication
```

This prevents overload from moving from HTTP into Redis.

---

# 61. External APIs

Protect third-party APIs from accidental exhaustion.

Example:

```text
Fastify
  ↓
internal limiter
  ↓
External provider
```

Use provider-specific concurrency/rate limits.

Do not simply retry until the external provider accepts the request.

---

# 62. Retry + Rate Limit Interaction

Poor combination:

```text
request
 ↓
429
 ↓
retry
 ↓
429
 ↓
retry
```

Good combination:

```text
request
 ↓
429
 ↓
Retry-After
 ↓
backoff
 ↓
retry once appropriate
```

Retries must be bounded.

---

# 63. Distributed Rate-Limit Consistency

When using Redis, understand that distributed rate limiting is still subject to:

- network latency
- Redis availability
- clock behavior
- race conditions
- replication/failover behavior

Use atomic operations supported by the chosen implementation.

Do not implement counters with:

```text
GET
+
increment
+
SET
```

if concurrent requests can race.

Prefer atomic Redis operations or a well-tested rate-limit library.

---

# 64. Redis Key Expiration

Rate-limit state should expire automatically.

Example:

```text
counter created
      ↓
TTL set
      ↓
window expires
      ↓
key removed
```

Do not create permanent counters for every client.

---

# 65. Memory Protection

Poor key design can create Redis memory growth.

Avoid unbounded dimensions such as arbitrary user input.

Never use raw request bodies as rate-limit keys.

Bad:

```text
ratelimit:{entire-request-body}
```

Good:

```text
ratelimit:user:{userId}:route:{route}
```

---

# 66. Key Cardinality

Monitor the number of active rate-limit keys.

High cardinality can result from:

- spoofed IPs
- arbitrary API keys
- malformed identifiers
- attack traffic

Use bounded key dimensions.

---

# 67. Authentication Identifier Normalization

If using email/account identifiers for login limiting:

Normalize consistently.

Example:

```text
USER@EXAMPLE.COM
user@example.com
```

should not create completely separate protection keys if the application's account identity treats them as equivalent.

Use the same normalization rules as authentication.

---

# 68. User Identifier Privacy

Avoid putting raw emails or other sensitive identifiers directly into Redis keys.

Prefer:

```text
hash(normalizedAccountIdentifier)
```

or an internal stable identifier when available.

This reduces accidental exposure in operational tooling.

---

# 69. Logging

Log rate-limit events carefully.

Useful fields:

```text
requestId
route
method
statusCode
limit category
client classification
userId where available
retryAfter
```

Avoid logging:

- passwords
- access tokens
- refresh tokens
- API keys
- raw sensitive identifiers

---

# 70. Security Logging

A rate-limit event may indicate an attack.

Potential signals:

```text
many login 429s
many password reset requests
many IPs targeting one account
one IP targeting many accounts
many 403s followed by expensive requests
```

Correlate with authentication and audit logs.

---

# 71. Metrics

Expose metrics such as:

```text
http_rate_limit_rejections_total
http_rate_limit_requests_total
http_rate_limit_fallback_total
http_rate_limit_redis_errors_total
```

Useful labels:

```text
route
method
category
status
```

Avoid unbounded labels such as:

```text
userId
IP
email
requestId
```

Prometheus cardinality can become a production problem.

---

# 72. Dashboard

Create a dashboard showing:

- requests/sec
- 429 rate
- rate-limit rejection rate
- authentication rejection rate
- top limited routes
- Redis health
- Redis latency
- API latency
- database load
- queue depth

A sudden rise in `429` should be distinguishable from ordinary traffic growth.

---

# 73. Alerts

Potential alerts:

### High 429 rate

```text
rate_limit_rejections / requests > threshold
```

### Authentication abuse

```text
login rate-limit rejections unusually high
```

### Redis failure

```text
rate-limit store unavailable
```

### Fallback activated

```text
distributed limiter falling back to local protection
```

Alert thresholds should be based on baseline behavior.

---

# 74. Avoid Alert Noise

Do not alert on every individual `429`.

One legitimate client may hit a limit occasionally.

Alert on:

- sustained rate
- percentage of traffic
- unusual patterns
- security-sensitive endpoints

---

# 75. Rate Limiting and Availability

Overly strict limits can become a self-inflicted outage.

Example:

```text
Normal traffic = 100 req/min
Configured limit = 50 req/min
```

The application will reject healthy users.

Limits should be based on:

- observed traffic
- capacity
- dependency constraints
- security risk
- business requirements

---

# 76. Capacity-Based Limits

Use load testing to estimate safe limits.

Example:

```text
Database safe throughput = 1,000 req/sec
API average cost = X
```

Then establish:

```text
global capacity threshold
```

with headroom.

Do not set arbitrary limits without understanding the protected resource.

---

# 77. Endpoint Cost Classification

Classify endpoints:

### Low

- health
- simple reads
- current-user lookup

### Medium

- filtered lists
- ordinary mutations

### High

- exports
- reports
- large searches
- bulk mutations

### Critical

- login
- password reset
- MFA
- API-key creation
- privilege changes

Use different protection strategies.

---

# 78. Health Endpoints

Health checks need special treatment.

Load balancers may generate frequent:

```text
GET /health
GET /ready
```

Do not accidentally rate-limit infrastructure health checks so aggressively that the load balancer declares the service unhealthy.

Options:

- exempt trusted internal health checks
- use separate limits
- authenticate internal probes
- allow sufficient volume

Do not make public health endpoints leak sensitive infrastructure details.

---

# 79. Metrics Endpoint

Prometheus may scrape:

```text
GET /metrics
```

Ensure monitoring traffic is not unintentionally blocked.

Possible approach:

```text
internal trusted scraper
```

with a separate policy.

---

# 80. Swagger/Documentation

Development documentation endpoints may not need the same restrictions as public APIs.

In production:

- restrict access where appropriate
- avoid exposing internal schemas unintentionally
- rate-limit if publicly accessible

Rate limiting is not a substitute for access control.

---

# 81. WebSocket / Streaming

If real-time transport is introduced, request-per-minute limits may not be enough.

Use:

- connection limits
- messages/second
- subscription limits
- payload-size limits
- connection lifetime
- per-user limits

Example:

```text
max 5 connections/user
max 20 messages/sec/connection
```

---

# 82. Server-Sent Events

For SSE:

```text
connection count
+
subscription count
+
message rate
```

may be more meaningful than ordinary HTTP request limits.

---

# 83. Long-Running Requests

Do not use rate limiting to solve long-running request problems.

Also use:

- request timeouts
- query timeouts
- job queues
- concurrency limits

Example:

```text
POST /exports
```

should create a job instead of holding a request open for minutes.

---

# 84. Concurrency Limits

Rate limiting controls frequency.

Concurrency limiting controls simultaneous work.

Example:

```text
100 requests/minute
```

does not prevent:

```text
100 expensive requests
```

from running simultaneously.

Use:

```text
rate limit
+
concurrency limit
```

for expensive resources.

---

# 85. Database Protection

Rate limiting should protect PostgreSQL from abusive traffic.

But also use:

- indexes
- connection pooling
- query timeouts
- pagination
- transaction boundaries
- slow-query monitoring
- N+1 prevention

Rate limiting cannot repair inefficient SQL.

---

# 86. Cache Interaction

Caching can reduce rate-limit pressure on dependencies.

Example:

```text
Client
  ↓
Rate limit
  ↓
Cache
  ↓
PostgreSQL
```

Still rate-limit the request itself.

Otherwise an attacker can abuse:

- CPU
- network
- cache memory
- application workers

even if the database is protected.

---

# 87. Rate Limiting Order

A recommended conceptual request flow:

```text
Incoming request
       ↓
Trusted proxy / client IP
       ↓
Request ID
       ↓
Global rate limit
       ↓
Route-specific rate limit
       ↓
Authentication
       ↓
User/session rate limit
       ↓
TypeBox validation
       ↓
Authorization / RBAC
       ↓
Service
       ↓
Repository
       ↓
Database
```

The exact Fastify hook order should be implemented consistently with the framework's lifecycle.

---

# 88. Error Handling

Rate-limit failures should integrate with the standard `ERROR_HANDLING.md` contract.

Use a stable code:

```text
RATE_LIMIT_EXCEEDED
```

Avoid:

```text
TOO_FAST
TRY_AGAIN
LIMIT
```

as inconsistent application-specific codes.

---

# 89. HTTP Status

Use:

```http
429 Too Many Requests
```

for requests rejected because of rate limiting.

Do not use:

```http
403
```

just because the client is rate limited.

`403` should remain primarily an authorization decision.

---

# 90. Rate Limit vs Lockout

Rate limiting and account lockout are related but different.

### Rate limit

Controls request frequency.

### Lockout

Changes account authentication state.

Avoid permanent or overly aggressive lockouts that allow attackers to deny service to legitimate users.

Prefer layered controls:

```text
IP rate limit
+
account attempt controls
+
risk detection
```

---

# 91. Distributed Attack Protection

An attacker can rotate IP addresses.

Mitigations include:

- account-based limits
- API-key limits
- tenant limits
- global capacity limits
- WAF/CDN controls
- bot detection where justified
- upstream protection

Application-level rate limiting should not be expected to stop massive volumetric attacks by itself.

---

# 92. CDN/WAF Layer

For public-facing deployments, rate limiting can exist at multiple layers:

```text
Internet
   ↓
CDN/WAF
   ↓
Load Balancer
   ↓
Fastify
   ↓
Redis
```

Edge limits handle broad traffic.

Application limits understand:

- user identity
- route
- RBAC
- business operation
- tenant

Use both where appropriate.

---

# 93. WAF vs Application Rate Limiting

### WAF/edge

Best for:

- volumetric abuse
- IP reputation
- bot traffic
- broad attack patterns

### Application

Best for:

- user-based limits
- endpoint-specific limits
- business operations
- API keys
- tenants
- authenticated sessions

Neither completely replaces the other.

---

# 94. Tenant Rate Limiting

If multi-tenancy is introduced:

```text
tenant:{tenantId}
```

can enforce fair resource allocation.

Example:

```text
Tenant A → 1,000 req/min
Tenant B → 1,000 req/min
```

This prevents one tenant from consuming shared capacity.

Tenant limits should be independent of individual user limits.

---

# 95. Tenant Fairness

A good hierarchy:

```text
Global platform limit
       ↓
Tenant limit
       ↓
User limit
       ↓
Route limit
```

This creates multiple protection layers.

---

# 96. API Client Identification

For trusted machine clients, use:

- API keys
- OAuth client identity
- service identity

rather than attempting to infer identity from:

```text
User-Agent
```

User-Agent is not an authentication mechanism.

---

# 97. User-Agent

User-Agent may be useful for analytics and abuse signals but should not be the primary rate-limit identity.

Attackers can modify it easily.

---

# 98. Device Signals

Device/browser fingerprinting can be controversial and privacy-sensitive.

Do not introduce it by default.

If business requirements justify it:

- document the purpose
- minimize collection
- assess privacy impact
- secure the data
- provide appropriate user disclosures

---

# 99. Privacy

Rate-limit data may include:

- IP addresses
- account identifiers
- user IDs
- timestamps

Treat this as operational/security data.

Define:

- retention
- access
- logging
- deletion
- aggregation

Do not retain detailed rate-limit records indefinitely without a reason.

---

# 100. Rate Limit Data Retention

The Redis counter itself should generally be short-lived.

Security analytics may be retained longer, but should be aggregated where possible.

Example:

```text
Redis counter:
minutes/hours

Aggregated security metrics:
weeks/months
```

Follow applicable privacy and compliance requirements.

---

# 101. Testing Strategy

Rate limiting requires multiple test layers.

### Unit tests

Test:

- key generation
- configuration
- policy selection
- limit calculations

### Integration tests

Test:

- Fastify
- Redis
- 429 response
- headers
- expiration

### Security tests

Test:

- brute-force login
- IP rotation
- account targeting
- authenticated limits
- admin limits
- bypass attempts

### Load tests

Test:

- high concurrency
- Redis latency
- API latency
- limiter throughput

---

# 102. Rate Limit Unit Test Example

Conceptual:

```ts
describe("rate limit policy", () => {
  it("uses stricter limits for login", () => {
    expect(getPolicy("POST /auth/login").max).toBeLessThan(
      getPolicy("GET /users/me").max,
    );
  });
});
```

The actual implementation should use the project's existing testing conventions.

---

# 103. Integration Test

Test:

```text
Request 1 → 200
Request 2 → 200
...
Request N → 429
```

Then:

```text
wait for window
```

and verify:

```text
next request → allowed
```

Do not make tests depend on long real-world windows.

Use short test-specific windows.

---

# 104. Redis Integration Test

Verify:

- counter creation
- TTL
- increment
- expiration
- multiple API instances sharing state
- Redis restart behavior

The distributed behavior is particularly important.

---

# 105. Multi-Instance Test

Start:

```text
API-1
API-2
```

Send requests alternately.

Verify that the client cannot obtain:

```text
2 × configured limit
```

by switching instances.

---

# 106. Proxy/IP Test

Test:

```text
client
 ↓
proxy
 ↓
Fastify
```

and verify the intended IP is used.

Also test malicious headers.

Example:

```text
X-Forwarded-For: fake-ip
```

must not allow arbitrary bypass when the sender is not trusted.

---

# 107. Authentication Abuse Tests

Test:

```text
many failed logins
```

Verify:

- `429`
- correct headers
- generic authentication response
- audit/security logging
- no account enumeration
- legitimate user recovery path

---

# 108. Rate Limit Bypass Tests

Attempt bypasses through:

- trailing slashes
- route aliases
- HTTP methods
- case differences where applicable
- alternate IP headers
- multiple API instances
- authentication state changes
- multiple sessions
- query-string variations

The policy should operate on the intended canonical route/resource.

---

# 109. Admin Abuse Tests

Verify an Admin user cannot bypass all protection.

Test:

```text
bulk operation
export
role changes
user mutations
```

against configured limits.

---

# 110. Background Job Tests

Verify:

```text
rate limit API
   ↓
job creation
   ↓
queue
```

does not allow unlimited queue growth.

Test:

- producer limits
- duplicate jobs
- queue backpressure
- worker recovery

---

# 111. External Provider Tests

If the application calls external APIs:

- simulate provider `429`
- verify backoff
- verify bounded retries
- verify queue behavior
- verify no retry storm

An external provider's rate limit must propagate into the application's control strategy.

---

# 112. Load Testing

Measure:

- requests/sec
- p50 latency
- p95 latency
- p99 latency
- 429 rate
- Redis CPU
- Redis memory
- Redis latency
- API CPU
- API memory
- PostgreSQL CPU
- PostgreSQL connections

Do not evaluate rate limiting using only request rejection counts.

---

# 113. Performance Considerations

Every request may interact with the rate limiter.

Therefore:

- keep Redis operations efficient
- use atomic operations
- minimize network round trips
- use appropriate connection pooling
- avoid unnecessary key generation
- avoid high-cardinality logging

Rate limiting itself must not become the bottleneck.

---

# 114. Redis Latency

Monitor:

```text
rate-limit Redis latency
```

If Redis becomes slow:

```text
API latency
    ↓
increases
```

Potential controls:

- Redis sizing
- connection pool tuning
- key design
- command efficiency
- local emergency fallback
- separate Redis resources

---

# 115. Dedicated Redis

For high-scale systems, consider separating:

```text
Application cache
```

from:

```text
Rate limiting
```

and:

```text
BullMQ
```

This reduces noisy-neighbor effects.

Do not introduce multiple Redis clusters prematurely.

---

# 116. Rate Limiting During Redis Maintenance

Before planned Redis maintenance:

- understand fallback behavior
- lower operational risk
- monitor API traffic
- ensure authentication protection remains adequate
- test recovery after Redis returns

Never discover fail-open behavior during a production incident.

---

# 117. Graceful Degradation

If rate-limit infrastructure fails:

```text
Redis unavailable
       ↓
fallback policy
       ↓
application continues/restricts
       ↓
monitor
       ↓
restore Redis
       ↓
normal policy
```

The fallback must be intentional.

---

# 118. Security of Rate-Limit Store

Redis should not be publicly exposed.

Use:

- private networking
- authentication
- TLS where appropriate
- firewall/security groups
- least-privilege access
- secret management

Rate-limit state is operationally important even if it is not business data.

---

# 119. Redis Namespace

Use a clear prefix:

```text
fastify-masterapp:ratelimit:
```

or equivalent.

This prevents collisions with:

```text
cache:
bull:
session:
```

---

# 120. Operational Controls

Document:

- how to inspect limits
- how to clear a key
- how to change policies
- how to disable a limiter safely
- how to recover Redis
- how to identify abuse

Avoid giving broad Redis access to ordinary developers.

---

# 121. Emergency Rate-Limit Override

Emergency overrides may be useful.

Example:

```text
Global limit:
300/min → 150/min
```

during a severe attack.

Overrides must be:

- authorized
- logged
- time-bounded
- reversible

Avoid permanent manual overrides.

---

# 122. Feature Flags

If using feature flags:

```text
rateLimit.strictMode
```

can support controlled rollout.

Do not use feature flags to permanently disable security controls.

---

# 123. Configuration Rollout

When changing limits:

```text
development
   ↓
test
   ↓
staging
   ↓
small production exposure
   ↓
observe
   ↓
full rollout
```

Monitor:

- 429 rate
- latency
- support issues
- authentication failures
- infrastructure load

---

# 124. Dynamic Limits

Dynamic limits may eventually depend on:

- user plan
- tenant plan
- endpoint
- role
- API key
- system load

Example:

```text
Free tenant:
100/min

Enterprise tenant:
2,000/min
```

Keep policy evaluation centralized.

---

# 125. Avoid Role-Only Trust

Do not implement:

```ts
if (user.role === "admin") {
  disableRateLimit();
}
```

This creates an unnecessary abuse path.

Use explicit policies.

---

# 126. Rate Limit Policy Object

A centralized policy model may look conceptually like:

```ts
type RateLimitPolicy = {
  name: string;
  max: number;
  timeWindowMs: number;
  keyStrategy: "ip" | "user" | "apiKey" | "tenant" | "composite";
};
```

Route configuration should reference policies rather than duplicating values.

---

# 127. Policy Naming

Use clear names:

```text
global-api
public-api
auth-login
auth-register
auth-refresh
auth-password-reset
admin-api
file-upload
bulk-operation
expensive-query
```

Avoid names such as:

```text
limit1
special
fast
new
```

---

# 128. Route Policy Mapping

Conceptual:

```ts
rateLimit: {
  policy: "auth-login",
}
```

This makes policy review easier.

---

# 129. Type Safety

Rate-limit configuration should be validated with the application's typed configuration system.

Avoid:

```ts
Number(process.env.RATE_LIMIT_MAX);
```

spread throughout the codebase.

Prefer:

```text
environment
   ↓
configuration parser
   ↓
validated config
   ↓
rate-limit plugin/policies
```

---

# 130. Environment Overrides

Example:

```text
development:
  global = 10000/min

test:
  global = 100/min

staging:
  production-like

production:
  capacity/security-based
```

Keep staging close enough to production to detect policy bugs.

---

# 131. API Contract

Rate limiting is part of the API behavior.

Document:

```text
429
RATE_LIMIT_EXCEEDED
Retry-After
```

in Swagger/OpenAPI where appropriate.

Consumers should know how to respond.

---

# 132. Swagger Documentation

For protected routes, document:

```http
429 Too Many Requests
```

alongside other expected responses.

Do not document internal Redis implementation details.

---

# 133. Versioning

Rate-limit behavior can change without changing API version if the contract remains compatible.

However, significant changes should be communicated to API consumers.

Examples:

```text
300/min → 50/min
```

may break clients even though the route is unchanged.

Treat rate-limit policy as an operational compatibility concern.

---

# 134. API Consumer Guidance

Document that clients should:

- respect `429`
- respect `Retry-After`
- use exponential backoff
- avoid aggressive polling
- use pagination
- use background exports
- cache where appropriate
- avoid unnecessary retries

---

# 135. Polling

Avoid Admin clients polling aggressively.

Bad:

```text
GET /orders
every 100ms
```

Better:

```text
reasonable polling interval
```

or use:

- WebSockets
- SSE
- background jobs
- event-driven updates

where justified.

---

# 136. Retry Policy

A general client retry strategy:

```text
400 → no retry
401 → refresh/auth flow
403 → no retry
404 → no retry
409 → application-specific
429 → backoff
500 → bounded retry
502/503/504 → bounded retry
```

The exact policy belongs in the shared API client.

---

# 137. Idempotency

Rate limiting and idempotency work together.

For mutations:

```text
POST
  ↓
idempotency key
  ↓
rate limit
  ↓
business operation
```

or the reverse depending on desired accounting semantics.

The important requirement is to prevent retries from creating duplicate side effects.

---

# 138. Rate Limiting and Transactions

Rate-limit state should not normally participate in business database transactions.

Do not make:

```text
rate-limit counter
+
business transaction
```

a single transactional dependency.

Keep infrastructure controls independent.

---

# 139. Rate Limiting and Audit Logging

Not every `429` needs a full audit event.

However, repeated security-sensitive rate-limit violations may warrant security logging or audit events.

Example:

```text
many failed login attempts
```

should be correlated with authentication security events.

Avoid filling the audit database with millions of ordinary `429` records.

---

# 140. Rate Limit Event Sampling

For high-volume rejection events:

- metrics for all events
- logs for selected events
- audit events for meaningful security actions

This balances observability and cost.

---

# 141. Abuse Detection

Rate limiting can feed an abuse-detection layer.

Signals:

```text
high 429 count
+
many accounts targeted
+
many failed logins
+
rapid IP rotation
```

Possible response:

```text
increase restrictions
challenge
block upstream
notify security
```

Keep automated blocking conservative to avoid false positives.

---

# 142. Temporary Blocks

Temporary blocks can be useful for obvious abuse.

If implemented:

- short duration
- clear reason
- centralized storage
- auditability
- automatic expiration

Avoid permanent blocks based on a single signal.

---

# 143. CAPTCHA

CAPTCHA may be introduced for suspicious activity.

Do not make CAPTCHA the default solution for every rate-limit event.

Potential flow:

```text
normal request
      ↓
rate threshold
      ↓
additional challenge
      ↓
successful challenge
      ↓
continue with controlled limit
```

This can preserve legitimate access better than immediate indefinite blocking.

---

# 144. Account Lockout Warning

Avoid attacker-controlled lockout.

Bad:

```text
Attacker repeatedly fails login
        ↓
Victim account permanently locked
```

Prefer:

```text
rate limiting
+
risk controls
+
temporary restrictions
```

while preserving a legitimate recovery path.

---

# 145. Monitoring Security Signals

Track:

- failed login rate
- password reset rate
- MFA failures
- 429s
- 403s
- suspicious IP concentration
- account targeting
- API-key abuse

Correlate these signals rather than relying on a single metric.

---

# 146. Operational Troubleshooting

## Symptom: All users receive 429

Check:

1. Global limit configuration
2. Redis state
3. proxy IP extraction
4. policy deployment
5. recent configuration change
6. clock/time-window behavior
7. API instance synchronization

---

## Symptom: Only one user receives 429

Check:

1. user-level limit
2. client retry loop
3. browser polling
4. Admin query behavior
5. background refresh
6. shared session behavior

---

## Symptom: Limits reset unexpectedly

Check:

- Redis restart
- TTL configuration
- key namespace
- Redis failover
- local fallback
- clock behavior

---

# 147. Troubleshooting Redis

Check:

```text
Redis connectivity
Redis latency
memory
evictions
connections
command errors
TTL behavior
```

Also verify that the rate-limit store is not competing with BullMQ or cache traffic.

---

# 148. Troubleshooting Proxy IP

If every client appears to come from one IP:

```text
load balancer IP
```

then IP-based limiting may throttle everyone together.

Verify:

- proxy configuration
- Fastify trust-proxy configuration
- ingress headers
- load-balancer behavior

Do not blindly trust all forwarded headers.

---

# 149. Troubleshooting Retry Storms

Symptoms:

```text
429 increases
API traffic increases
client CPU/network increases
```

Check:

- TanStack Query retry configuration
- API client retry logic
- token refresh flow
- polling intervals
- background workers
- frontend effects

Often the problem is a client loop rather than an insufficient server limit.

---

# 150. Troubleshooting False Positives

If legitimate users are rate limited:

- inspect traffic distribution
- identify shared IPs
- inspect route costs
- increase user-level limit if safe
- separate authentication from ordinary API limits
- reduce client polling
- improve caching
- optimize expensive endpoints

Do not simply disable rate limiting.

---

# 151. Incident Response

During a rate-limit-related incident:

```text
Detect
 ↓
Identify affected route
 ↓
Determine attack vs configuration error
 ↓
Protect infrastructure
 ↓
Adjust policy if necessary
 ↓
Monitor
 ↓
Restore normal policy
 ↓
Investigate root cause
```

All emergency changes should be recorded.

---

# 152. Emergency Attack Mode

For severe abuse:

```text
Normal
  ↓
Elevated protection
  ↓
Edge/WAF controls
  ↓
Application strict limits
  ↓
Temporary endpoint restriction
```

Use the least disruptive control that protects the system.

---

# 153. Recovery

After an incident:

- restore intended limits
- remove temporary blocks
- verify Redis state
- review logs
- review metrics
- check for compromised credentials
- inspect authentication events
- update thresholds
- document lessons learned

---

# 154. Rate Limiting Runbook

## Before changing a limit

Check:

- current traffic
- 429 rate
- route latency
- database load
- Redis health
- business impact

## During change

- make one controlled change
- record old value
- record new value
- monitor

## After change

- verify requests
- verify 429 rate
- verify latency
- verify Redis
- document outcome

---

# 155. Recommended Fastify-MasterApp Policy

A practical starting structure:

```text
GLOBAL
  authenticated: 300/min/user
  public:         120/min/IP

AUTH
  login:            10/min/IP
  account login:     5/min/account
  register:          5/hour/IP
  reset request:     5/hour/IP
  verify email:     10/hour/IP
  refresh:          60/min/session

ADMIN
  ordinary:         300/min/user
  sensitive:        120/min/user

EXPENSIVE
  reports:           10/min/user
  exports:            5/min/user

BULK
  operations:        20/min/user

UPLOAD
  requests:          20/min/user
```

These values should be validated against real application traffic before production enforcement.

---

# 156. Recommended Key Strategy

Conceptually:

```text
Public request:
    ip + route

Authenticated request:
    userId + route

Login:
    ip + route
    +
    normalized account identifier

API key:
    apiKeyId + route

Tenant:
    tenantId + route

Expensive operation:
    userId + operation
```

Use a combination where security and capacity requirements justify it.

---

# 157. Implementation Structure

A maintainable implementation might be organized as:

```text
apps/api/src/
  plugins/
    rate-limit.ts

  config/
    rate-limit.ts

  security/
    rate-limit/
      policies.ts
      keys.ts
      types.ts
      helpers.ts

  routes/
    auth/
    users/
    admin/
```

Keep policy decisions centralized.

Avoid embedding unrelated limiter logic inside every route.

---

# 158. Responsibility Boundaries

### Fastify plugin

Owns:

- limiter registration
- global defaults
- store configuration

### Policy layer

Owns:

- endpoint categories
- limits
- key strategies

### Route

Owns:

- selecting appropriate policy

### Service

Owns:

- business logic

### Redis

Owns:

- distributed rate-limit state

### Admin frontend

Owns:

- handling `429`
- retry/backoff behavior
- user-facing messaging

---

# 159. Anti-Pattern: Rate Limit in Every Service

Avoid:

```text
UserService → rate limiter
OrderService → rate limiter
RoleService → rate limiter
```

unless a specific internal operation needs independent throttling.

HTTP/API rate limiting belongs primarily at the boundary.

---

# 160. Anti-Pattern: In-Memory Production Limiter

Avoid relying solely on:

```ts
const counters = new Map();
```

in a horizontally scaled production environment.

It is acceptable for:

- local development
- isolated tests
- emergency fallback

but not as the primary distributed policy.

---

# 161. Anti-Pattern: IP Only

Avoid:

```text
all limits = IP
```

because:

- NAT creates false positives
- attackers rotate IPs
- authenticated identity is ignored

Use appropriate identity dimensions.

---

# 162. Anti-Pattern: User Only

Avoid:

```text
all limits = user ID
```

because:

- unauthenticated traffic remains unprotected
- account creation can bypass limits
- compromised users can consume capacity

Use layered controls.

---

# 163. Anti-Pattern: Unlimited Admin

Avoid:

```text
if admin → no rate limit
```

Privileged users still need protection.

---

# 164. Anti-Pattern: Huge Limits

A limit such as:

```text
100,000 requests/minute
```

may technically exist but provide little protection.

Choose limits based on capacity and threat model.

---

# 165. Anti-Pattern: Tiny Limits

A limit such as:

```text
10 requests/minute
```

for every API endpoint creates poor UX.

Do not use the same value everywhere.

---

# 166. Anti-Pattern: Retry on Every 429

Clients that automatically retry immediately can turn a rate limit into a traffic amplifier.

Always use backoff.

---

# 167. Anti-Pattern: Rate Limit Instead of Optimization

If:

```text
GET /orders
```

takes 2 seconds because of an N+1 query, reducing the limit does not fix the query.

Fix the bottleneck.

---

# 168. Anti-Pattern: Logging Every IP as a Metric Label

Bad:

```text
rate_limit_rejections{ip="..."}
```

This creates high Prometheus cardinality.

Prefer aggregated labels.

---

# 169. Anti-Pattern: Sensitive Redis Keys

Avoid:

```text
ratelimit:email:user@example.com
```

when a hashed or internal identifier can be used.

Operational stores should minimize sensitive data exposure.

---

# 170. Security Review Checklist

- [ ] Global limits exist
- [ ] Public limits exist
- [ ] Login is protected
- [ ] Password reset is protected
- [ ] Registration is protected
- [ ] Refresh is protected
- [ ] MFA is protected
- [ ] Admin operations are protected
- [ ] Bulk operations are protected
- [ ] Uploads are protected
- [ ] IP extraction is trusted correctly
- [ ] Distributed store is secured
- [ ] Redis failure behavior is defined
- [ ] 429 behavior is safe
- [ ] retry behavior is bounded
- [ ] no unlimited admin bypass exists

---

# 171. Performance Checklist

- [ ] Redis operations are atomic
- [ ] TTL is configured
- [ ] key cardinality is bounded
- [ ] Redis latency is monitored
- [ ] connection pooling is configured
- [ ] rate limiter does not add excessive latency
- [ ] expensive endpoints have stricter controls
- [ ] concurrency limits exist where needed
- [ ] load testing completed

---

# 172. API Checklist

- [ ] `429` is documented
- [ ] stable `RATE_LIMIT_EXCEEDED` error code exists
- [ ] `Retry-After` is returned where appropriate
- [ ] headers are consistent
- [ ] API client handles 429
- [ ] Swagger documents rate-limit behavior
- [ ] versioning impact is understood

---

# 173. Admin Checklist

- [ ] Admin handles 429 gracefully
- [ ] no aggressive polling
- [ ] TanStack Query retry behavior is safe
- [ ] token refresh is single-flight
- [ ] bulk actions are limited
- [ ] exports are asynchronous where appropriate
- [ ] user-facing error messages are clear

---

# 174. Operations Checklist

- [ ] Redis health monitored
- [ ] 429 metrics available
- [ ] rate-limit alerts configured
- [ ] emergency override procedure documented
- [ ] policy changes audited
- [ ] incident runbook exists
- [ ] rate-limit configuration is version controlled
- [ ] production values are documented

---

# 175. Testing Checklist

- [ ] unit tests
- [ ] integration tests
- [ ] Redis tests
- [ ] multi-instance tests
- [ ] authentication abuse tests
- [ ] proxy/IP tests
- [ ] bypass tests
- [ ] 429 contract tests
- [ ] retry behavior tests
- [ ] load tests
- [ ] Redis failure tests
- [ ] Admin behavior tests

---

# 176. Deployment Checklist

Before production:

- [ ] Redis is available
- [ ] production limits configured
- [ ] configuration validated
- [ ] trusted proxy configuration verified
- [ ] 429 response tested
- [ ] dashboards available
- [ ] alerts available
- [ ] fallback behavior tested
- [ ] rollback tested

---

# 177. Definition of Done

Rate limiting is production-ready when:

### Architecture

- [ ] global protection exists
- [ ] route-specific policies exist
- [ ] authenticated and anonymous clients are handled appropriately
- [ ] distributed deployments use shared state

### Security

- [ ] authentication endpoints have stronger controls
- [ ] account enumeration is minimized
- [ ] admin users are not unlimited
- [ ] IP handling is trusted and tested
- [ ] Redis is secured
- [ ] sensitive identifiers are protected

### Reliability

- [ ] Redis failure behavior is defined
- [ ] fallback behavior is tested
- [ ] rate limiting does not become a single point of failure
- [ ] recovery procedure exists

### Performance

- [ ] Redis latency is monitored
- [ ] limits reflect endpoint cost
- [ ] expensive endpoints have stricter policies
- [ ] load tests have been completed

### API

- [ ] `429` contract is standardized
- [ ] `Retry-After` is supported where appropriate
- [ ] Swagger documents expected behavior
- [ ] clients implement safe backoff

### Admin

- [ ] Admin handles 429
- [ ] polling is controlled
- [ ] refresh storms are prevented
- [ ] bulk operations are protected

### Operations

- [ ] metrics exist
- [ ] dashboards exist
- [ ] alerts exist
- [ ] emergency policy changes are documented
- [ ] owners are assigned

### Testing

- [ ] unit tests pass
- [ ] integration tests pass
- [ ] distributed tests pass
- [ ] abuse tests pass
- [ ] load tests pass
- [ ] failure-mode tests pass

---

# 178. Implementation Roadmap

## Phase 1 — Baseline

Implement:

- global rate limiting
- configuration
- `429` error contract
- basic metrics

---

## Phase 2 — Authentication Protection

Add dedicated policies for:

- login
- registration
- password reset
- refresh
- email verification

---

## Phase 3 — Redis

Move distributed rate-limit state to Redis.

Validate:

- atomicity
- TTL
- multi-instance behavior
- failure handling

---

## Phase 4 — Sensitive Operations

Add policies for:

- Admin mutations
- bulk operations
- exports
- uploads
- API-key creation
- privilege changes

---

## Phase 5 — Client Behavior

Update the Admin/API client to:

- handle `429`
- honor `Retry-After`
- implement backoff
- prevent refresh storms
- reduce polling

---

## Phase 6 — Observability

Add:

- metrics
- dashboards
- alerts
- security correlation
- operational runbooks

---

## Phase 7 — Load and Security Testing

Run:

- load tests
- brute-force simulations
- distributed-instance tests
- Redis failure tests
- proxy/IP tests
- bypass tests

---

## Phase 8 — Advanced Controls

Only when justified:

- cost-based limits
- tenant quotas
- API-key quotas
- dynamic policies
- WAF integration
- adaptive abuse detection

---

# 179. Final Rate-Limit Architecture

The target architecture:

```text
                         Internet
                            │
                     ┌──────▼──────┐
                     │ CDN / WAF   │
                     └──────┬──────┘
                            │
                     ┌──────▼──────┐
                     │ Load Balancer│
                     └──────┬──────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
        ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
        │ API-1   │    │ API-2   │    │ API-3   │
        └────┬────┘    └────┬────┘    └────┬────┘
             │              │              │
             └──────────────┼──────────────┘
                            │
                      ┌─────▼─────┐
                      │   Redis   │
                      │ Rate Limit│
                      └───────────┘

API request flow:

Request
  ↓
Trusted client IP
  ↓
Global limiter
  ↓
Route limiter
  ↓
Authentication
  ↓
User/session limiter
  ↓
RBAC
  ↓
Validation
  ↓
Service
  ↓
Repository
  ↓
PostgreSQL
```

---

# 180. Golden Rules

1. **Rate-limit at the API boundary.**
2. **Use stronger limits for authentication and security-sensitive operations.**
3. **Do not rely only on IP addresses.**
4. **Do not rely only on authenticated user IDs.**
5. **Use Redis/shared state for horizontally scaled production instances.**
6. **Treat Redis failure behavior as an explicit design decision.**
7. **Never blindly trust forwarded IP headers.**
8. **Return `429 Too Many Requests` for rate-limit violations.**
9. **Use a stable `RATE_LIMIT_EXCEEDED` error code.**
10. **Respect `Retry-After`.**
11. **Prevent frontend retry storms.**
12. **Do not exempt administrators from protection.**
13. **Protect expensive operations separately.**
14. **Combine rate limits with concurrency limits where necessary.**
15. **Do not use rate limiting to hide inefficient database queries.**
16. **Keep rate-limit keys bounded and privacy-conscious.**
17. **Do not put secrets or sensitive data into logs or Redis keys unnecessarily.**
18. **Monitor both rejected traffic and infrastructure health.**
19. **Test distributed behavior across multiple API instances.**
20. **Test Redis failure and fallback behavior.**
21. **Tune limits from real traffic and capacity measurements.**
22. **Use edge/WAF protection for large-scale public abuse.**
23. **Keep security-sensitive rate limits separate from ordinary API limits.**
24. **Make emergency overrides temporary, authorized, and auditable.**
25. **Treat rate limiting as defense-in-depth, not authorization.**

---

# 181. Final Principle

The objective is not:

```text
"Reject as many requests as possible."
```

The objective is:

```text
Allow legitimate traffic
        +
protect critical resources
        +
slow abusive behavior
        +
preserve availability
        +
remain observable
        +
fail safely
```

For Fastify-MasterApp, the preferred progression is:

```text
Global limits
      ↓
Authentication-specific limits
      ↓
Redis-backed distributed limits
      ↓
Sensitive/expensive endpoint policies
      ↓
Admin and background-job protection
      ↓
Observability
      ↓
Load/security testing
      ↓
Advanced tenant/API-key/WAF controls
```

Start with simple, explicit policies. Measure real traffic. Protect the highest-risk operations first. Add complexity only when evidence requires it.
