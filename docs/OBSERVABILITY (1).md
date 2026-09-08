# OBSERVABILITY.md

# Fastify-MasterApp Observability Standard

This document defines the observability architecture for Fastify-MasterApp.

Observability answers three questions:

1. **What is happening?**
2. **Why is it happening?**
3. **Which users, requests, services, or resources are affected?**

Fastify-MasterApp should treat observability as a production capability rather than a collection of dashboards.

The target model is:

```text
Logs
  +
Metrics
  +
Traces
  +
Health Signals
  +
Audit Events
       |
       v
Observability Platform
       |
       v
Detection
       |
       v
Diagnosis
       |
       v
Recovery
```

---

# 1. Core Principles

Fastify-MasterApp follows these observability principles:

1. **Instrument important boundaries.**
2. **Prefer structured telemetry over free-form logs.**
3. **Every request should be traceable.**
4. **Metrics should answer operational questions.**
5. **Logs should explain individual events.**
6. **Traces should explain distributed request flow.**
7. **Health checks should represent actual service state.**
8. **Audit logs are distinct from operational logs.**
9. **Never put secrets or sensitive data into telemetry.**
10. **Avoid high-cardinality metric labels.**
11. **Do not collect telemetry merely because it is possible.**
12. **Every alert should have an owner and an action.**
13. **Observability must work during incidents.**
14. **Telemetry failures should not normally take down the application.**
15. **Production observability must be tested before launch.**

---

# 2. Observability Model

Fastify-MasterApp uses five primary telemetry categories:

```text
1. Logs
2. Metrics
3. Traces
4. Health / Readiness
5. Audit Events
```

Each serves a different purpose.

| Signal     | Best for                         |
| ---------- | -------------------------------- |
| Logs       | detailed events                  |
| Metrics    | trends and alerting              |
| Traces     | request/dependency flow          |
| Health     | service availability             |
| Audit logs | security/business accountability |

Do not attempt to replace all signals with logs.

---

# 3. Target Architecture

```text
                         ┌────────────────────┐
                         │   React Admin      │
                         └─────────┬──────────┘
                                   │
                                   v
                         ┌────────────────────┐
                         │ Fastify API        │
                         │                    │
                         │ Request ID         │
                         │ Metrics            │
                         │ Logs               │
                         │ Tracing            │
                         └─────────┬──────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                v                  v                  v
        ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
        │ PostgreSQL   │   │ Redis        │   │ External APIs│
        └──────────────┘   └──────────────┘   └──────────────┘
                │                  │                  │
                └──────────────────┼──────────────────┘
                                   v
                         ┌────────────────────┐
                         │ Telemetry Pipeline │
                         └─────────┬──────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                v                  v                  v
        ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
        │ Log Store    │   │ Metrics      │   │ Trace Store  │
        └──────────────┘   └──────────────┘   └──────────────┘
                │                  │                  │
                └──────────────────┼──────────────────┘
                                   v
                         ┌────────────────────┐
                         │ Dashboards / Alerts│
                         └────────────────────┘
```

---

# 4. The Three Pillars

## 4.1 Logs

Logs answer:

```text
What happened?
```

Example:

```text
User update failed because database rejected a unique value.
```

---

## 4.2 Metrics

Metrics answer:

```text
How often is it happening?
```

Example:

```text
5xx error rate increased from 0.2% to 8%.
```

---

## 4.3 Traces

Traces answer:

```text
Where did the request spend time or fail?
```

Example:

```text
HTTP request
  |
  +--> authorization
  |
  +--> user service
  |
  +--> PostgreSQL
  |
  +--> email provider
```

---

# 5. Health Signals

Health endpoints answer a different question:

```text
Can this process receive traffic?
```

Recommended endpoints:

```text
GET /health
GET /ready
```

The exact existing endpoint paths should remain consistent with the API contract.

---

# 6. Liveness vs Readiness

## Liveness

Liveness should answer:

```text
Is the application process alive?
```

It should not depend on every external dependency.

A temporary database failure should not necessarily cause the process to be considered dead.

---

## Readiness

Readiness should answer:

```text
Can this instance safely receive production traffic?
```

Readiness may verify critical dependencies such as:

```text
PostgreSQL
Redis
required configuration
critical initialization
```

Do not include optional dependencies if their failure does not prevent serving requests.

---

# 7. Health Endpoint Design

A healthy response might be:

```json
{
  "status": "ok"
}
```

A richer internal/readiness response can include component status:

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

Do not expose unnecessary internal infrastructure details publicly.

---

# 8. Health Check Security

Health endpoints should not reveal:

```text
database hostname
database username
Redis connection string
environment secrets
internal IPs
stack traces
dependency credentials
```

If detailed diagnostics are required, expose them through an authenticated operational endpoint or internal monitoring channel.

---

# 9. Structured Logging

Fastify-MasterApp uses structured logging with Pino.

Prefer:

```json
{
  "level": 30,
  "time": 1770000000000,
  "requestId": "req_123",
  "method": "GET",
  "route": "/api/v1/users/:id",
  "statusCode": 200,
  "durationMs": 31,
  "message": "request completed"
}
```

over:

```text
GET /api/v1/users/123 completed successfully in 31ms
```

Structured fields make logs searchable and aggregatable.

---

# 10. Required Request Fields

For HTTP request logs, capture useful fields such as:

```text
requestId
method
route
statusCode
durationMs
userId when safely available
errorCode when applicable
```

Depending on the deployment environment, also consider:

```text
service
environment
instance
version
traceId
```

---

# 11. Request ID

Every request should have a request/correlation ID.

Flow:

```text
Incoming request
       |
       v
requestId
       |
       +--> route
       +--> service
       +--> repository
       +--> dependency calls
       +--> error
       +--> response
```

The request ID should be included in error responses where appropriate.

Example:

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

# 12. Trace ID vs Request ID

These concepts are related but different.

## Request ID

Identifies an application request.

```text
req_123
```

## Trace ID

Identifies an end-to-end distributed operation.

```text
trace_abc
```

A trace can contain multiple spans:

```text
Trace
 |
 +-- HTTP
 |
 +-- Auth
 |
 +-- PostgreSQL
 |
 +-- Redis
 |
 +-- External API
```

Where tracing is enabled, logs should include trace context.

---

# 13. Log Levels

Recommended levels:

```text
trace
debug
info
warn
error
fatal
```

Use them intentionally.

| Level | Use                                  |
| ----- | ------------------------------------ |
| trace | extremely detailed diagnostics       |
| debug | development/troubleshooting          |
| info  | normal operational events            |
| warn  | unusual but recoverable condition    |
| error | failed operation requiring attention |
| fatal | process cannot safely continue       |

---

# 14. What to Log at Info

Examples:

```text
server started
server stopped
deployment version initialized
background job completed
configuration loaded
scheduled job started
important administrative operation completed
```

Do not log every low-level database operation at `info`.

---

# 15. What to Log at Warn

Examples:

```text
dependency approaching timeout
rate limit exceeded
retry scheduled
unexpected but recoverable condition
authentication anomaly
degraded dependency
```

Warnings should be actionable or useful.

---

# 16. What to Log at Error

Examples:

```text
database unavailable
unexpected exception
external dependency failure
background job permanently failed
transaction failure
critical startup failure
```

Do not use `error` for every normal `404`.

---

# 17. What to Log at Fatal

Use `fatal` sparingly.

Examples:

```text
required configuration missing
process cannot initialize
critical invariant prevents safe startup
```

Fatal should generally be associated with process termination.

---

# 18. Sensitive Data Rules

Never log:

```text
passwords
password hashes
JWTs
access tokens
refresh tokens
API keys
private keys
database passwords
session secrets
authorization headers
cookie values
credit card numbers
CVV
```

Avoid unnecessary sensitive personal data.

---

# 19. Authentication Logging

Useful authentication events include:

```text
login succeeded
login failed
refresh succeeded
refresh failed
logout
session revoked
password changed
password reset requested
password reset completed
MFA challenge failed
```

Do not log:

```text
password
raw refresh token
raw JWT
```

For failed login events, avoid storing unnecessary user-provided secrets.

---

# 20. Authentication Log Example

Good:

```json
{
  "level": "warn",
  "event": "auth.login_failed",
  "requestId": "req_123",
  "reason": "invalid_credentials"
}
```

Avoid:

```json
{
  "email": "person@example.com",
  "password": "..."
}
```

Use a safe identifier only when operationally justified.

---

# 21. Authorization Logging

Authorization denials can be useful telemetry.

Example:

```json
{
  "level": "warn",
  "event": "authorization.denied",
  "requestId": "req_123",
  "userId": "usr_123",
  "permission": "users.delete",
  "resourceType": "user"
}
```

Be careful with high-volume permission denials.

They may indicate:

```text
frontend bug
RBAC misconfiguration
attack
user confusion
```

---

# 22. Audit Logs vs Operational Logs

Do not treat them as the same system.

## Operational log

Used by engineers:

```text
request failed
database timeout
worker retry
```

## Audit event

Used to answer:

```text
Who performed what action, on which resource, and when?
```

Example:

```text
Admin usr_123 changed user usr_456 role from viewer to admin.
```

Audit logs should have stronger retention and integrity requirements.

---

# 23. Audit Event Fields

A typical audit event may contain:

```text
eventId
timestamp
actorId
action
resourceType
resourceId
result
requestId
metadata
```

Avoid placing raw secrets or unnecessary personal information in audit records.

---

# 24. Important Audit Events

Examples:

```text
user.created
user.updated
user.deleted
user.deactivated
role.created
role.updated
role.deleted
permission.assigned
permission.revoked
session.revoked
password.changed
password.reset
MFA.enabled
MFA.disabled
admin.action
```

The exact event catalog should evolve with product requirements.

---

# 25. HTTP Request Metrics

At minimum, track:

```text
request count
request duration
response status
error count
```

A useful conceptual metric:

```text
http_requests_total
```

with low-cardinality dimensions such as:

```text
method
route
status_code
```

---

# 26. Avoid High Cardinality

Never create metric labels from arbitrary request data.

Bad:

```text
user_id
email
request_id
full_url
search_query
```

Good:

```text
method=GET
route=/api/v1/users/:id
status_code=404
```

High-cardinality metrics can become expensive and difficult to operate.

---

# 27. Request Duration

Track latency distributions rather than only averages.

Useful percentiles:

```text
p50
p90
p95
p99
```

Example:

```text
p95 API latency = 220ms
p99 API latency = 840ms
```

Averages can hide tail latency.

---

# 28. RED Method

For API services, use the RED model:

```text
Rate
Errors
Duration
```

## Rate

How many requests?

```text
requests/sec
```

## Errors

How many failed?

```text
5xx rate
```

## Duration

How long do requests take?

```text
p95 latency
p99 latency
```

This should form the foundation of the API dashboard.

---

# 29. USE Method

For infrastructure, use:

```text
Utilization
Saturation
Errors
```

Examples:

```text
CPU utilization
memory utilization
connection pool utilization
database saturation
queue depth
Redis memory
disk usage
```

---

# 30. Database Metrics

Important PostgreSQL signals include:

```text
connection count
connection pool usage
query duration
transaction duration
errors
locks
deadlocks
slow queries
database availability
```

Do not expose raw SQL statements as metric labels.

---

# 31. Prisma Observability

Prisma/database operations should be observable without generating excessive telemetry.

Useful information:

```text
operation type
duration
success/failure
model where safely available
```

Avoid:

```text
raw query parameters
password values
tokens
large result payloads
```

---

# 32. Database Connection Pool

Monitor:

```text
active connections
idle connections
waiting connections
pool exhaustion
connection errors
```

A connection pool problem often appears before complete database failure.

---

# 33. Slow Query Monitoring

Define an operational threshold.

For example:

```text
slow query > agreed threshold
```

The exact threshold should be environment and workload dependent.

Slow queries should be investigated for:

```text
missing indexes
N+1 queries
large scans
poor pagination
unbounded result sets
locking
```

---

# 34. Redis Metrics

When Redis is introduced, monitor:

```text
availability
latency
memory
evictions
connection errors
command failures
cache hit rate
cache miss rate
```

If Redis supports rate limiting, also monitor:

```text
rate-limit operations
Redis failures
fallback behavior
```

---

# 35. Cache Observability

A cache should not be considered healthy only because Redis is reachable.

Monitor:

```text
hit ratio
miss ratio
stale data incidents
invalidation failures
serialization failures
```

A cache that always misses may be technically healthy but operationally ineffective.

---

# 36. Background Job Metrics

For BullMQ or other workers, monitor:

```text
jobs added
jobs completed
jobs failed
jobs retried
jobs delayed
queue depth
processing duration
oldest waiting job
dead-letter/failed jobs
```

Important:

```text
queue depth increasing continuously
```

is a common indicator that worker capacity is insufficient.

---

# 37. Worker Health

Worker health should consider:

```text
process alive
queue connection healthy
jobs being processed
failure rate acceptable
```

A worker process that is alive but not consuming jobs is not operationally healthy.

---

# 38. External Dependency Metrics

For each critical dependency, track:

```text
request rate
success rate
error rate
latency
timeout rate
retry count
```

Examples:

```text
email provider
payment provider
identity provider
object storage
third-party API
```

---

# 39. Dependency Circuit Breakers

If a circuit breaker is introduced, observe:

```text
closed
open
half-open
```

Track:

```text
circuit opens
circuit rejections
recovery attempts
successful recovery
```

A permanently open circuit requires operator attention.

---

# 40. Error Metrics

Track errors by stable code where useful:

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

Do not put raw error messages into metric labels.

---

# 41. 5xx Monitoring

The most important API reliability metric is often the server-error rate.

Monitor:

```text
5xx / total requests
```

Break down by:

```text
route
service version
deployment
instance
```

only where dimensions remain operationally manageable.

---

# 42. 4xx Monitoring

4xx errors are not necessarily application failures.

However, unexpected changes matter.

For example:

```text
401 spike
```

may indicate authentication problems.

```text
403 spike
```

may indicate RBAC problems.

```text
429 spike
```

may indicate attack traffic or client retry loops.

---

# 43. Availability

Define availability explicitly.

Example:

```text
successful eligible requests
--------------------------------
total eligible requests
```

Do not automatically count expected:

```text
400
401
403
404
```

as service availability failures.

The exact SLI should match product requirements.

---

# 44. Service Level Indicators

Recommended initial SLIs:

```text
API availability
API latency
API 5xx rate
authentication success rate
database availability
queue processing latency
critical dependency availability
```

---

# 45. Service Level Objectives

Example starting targets:

```text
API availability: >= 99.9%
p95 API latency: agreed target
p99 API latency: agreed target
5xx rate: < agreed threshold
critical worker success: >= agreed target
```

These are examples, not universal requirements.

Set targets based on actual product expectations and infrastructure.

---

# 46. Alerting Philosophy

An alert should mean:

```text
Someone needs to do something.
```

Do not alert on every warning.

Good alert:

```text
5xx rate above critical threshold for sustained period.
```

Bad alert:

```text
One 404 occurred.
```

---

# 47. Alert Severity

Recommended:

## Critical

Immediate response.

Examples:

```text
API unavailable
database unavailable
authentication broken globally
severe 5xx spike
data integrity issue
```

## Warning

Investigate during normal operational hours.

Examples:

```text
latency degradation
queue growth
increasing dependency failures
disk usage approaching threshold
```

---

# 48. Alert Design

Every alert should specify:

```text
condition
severity
owner
runbook
dashboard
expected action
```

Example:

```text
Alert:
API 5xx rate > threshold

Owner:
API/platform team

Dashboard:
API Overview

Runbook:
Production API Incident

First actions:
Check recent deployment,
database health,
dependency failures,
and error-code distribution.
```

---

# 49. Avoid Alert Fatigue

If an alert fires constantly:

```text
fix the system
OR
fix the alert
```

Do not normalize permanent alerts.

Repeated non-actionable alerts reduce the chance of responding to real incidents.

---

# 50. Recommended API Dashboard

Create an API overview dashboard with:

```text
Requests/sec
5xx rate
4xx rate
p50 latency
p95 latency
p99 latency
top failing routes
top slow routes
authentication failures
rate-limit responses
database errors
dependency errors
```

---

# 51. Recommended Database Dashboard

Include:

```text
database availability
connections
pool saturation
query latency
slow queries
transaction failures
deadlocks
locks
CPU
memory
storage
```

---

# 52. Recommended Worker Dashboard

Include:

```text
queue depth
active jobs
completed jobs
failed jobs
retry count
processing latency
oldest waiting job
dead-letter/failed jobs
worker health
```

---

# 53. Recommended Security Dashboard

Include:

```text
failed logins
successful logins
refresh-token failures
session revocations
403 responses
429 responses
suspicious authentication patterns
administrative audit events
```

Security dashboards should use aggregated information and avoid exposing secrets.

---

# 54. Prometheus Integration

Fastify-MasterApp already targets Prometheus-compatible metrics.

The API should expose the configured metrics endpoint consistently.

The metrics endpoint should:

- use Prometheus-compatible exposition
- avoid sensitive labels
- avoid unbounded cardinality
- remain lightweight
- be protected appropriately according to deployment architecture

---

# 55. Grafana Integration

Grafana should consume Prometheus metrics for operational dashboards.

Recommended dashboards:

```text
Fastify API Overview
Database
Authentication & Security
Background Jobs
Dependencies
Infrastructure
```

Dashboards should be version-controlled where practical.

---

# 56. Dashboard Naming

Use predictable names:

```text
API / Overview
API / Errors
API / Latency
Database / PostgreSQL
Auth / Authentication
Workers / BullMQ
Dependencies / External Services
Infrastructure / Kubernetes
```

---

# 57. Dashboard Variables

Use low-cardinality variables where useful:

```text
environment
service
instance
route
```

Avoid variables based on arbitrary user identifiers.

---

# 58. Tracing Strategy

Distributed tracing should be introduced when the system has enough dependency complexity to justify it.

Good trace boundaries:

```text
HTTP request
authentication
service operation
database query
Redis operation
external HTTP call
background job
```

Do not trace every tiny internal function.

---

# 59. Trace Sampling

Tracing every request may be unnecessary at scale.

Possible strategy:

```text
normal traffic:
sample

errors:
higher sampling

critical operations:
higher sampling
```

Sampling rules should be documented and monitored.

---

# 60. Trace Attributes

Useful attributes:

```text
service.name
service.version
deployment.environment
http.request.method
http.route
http.response.status_code
db.system
error.type
```

Do not attach:

```text
password
JWT
refresh token
secret
raw authorization header
```

---

# 61. Trace Privacy

Traces can accidentally contain sensitive information.

Review:

```text
HTTP headers
query parameters
request bodies
database parameters
user metadata
```

Do not automatically capture entire request/response bodies.

---

# 62. Error Spans

When an operation fails, the trace should indicate:

```text
error status
error type
safe error code
duration
```

The detailed stack trace should remain in controlled logs rather than being blindly exposed everywhere.

---

# 63. Frontend Observability

React Admin should have lightweight client-side observability.

Useful signals:

```text
JavaScript errors
API request failures
route/navigation failures
slow API requests
authentication refresh failures
critical UI errors
```

Do not capture sensitive form fields.

---

# 64. Frontend Error Reporting

When reporting a frontend exception, include:

```text
application version
browser/runtime information where appropriate
route
request ID if related to API call
error category
safe stack trace
```

Do not include:

```text
password
access token
refresh token
form contents
private user data
```

unless explicitly justified and protected.

---

# 65. Frontend Performance

Useful measurements:

```text
initial load
route transition
API latency
large table rendering
dashboard load
```

Optimize actual user-impacting performance rather than collecting every browser metric by default.

---

# 66. Request-to-Frontend Correlation

When an Admin API call fails:

```text
Admin
  |
  | request
  v
API
  |
  +--> requestId
  |
  +--> logs
  |
  +--> metrics
  |
  +--> trace
```

The Admin can show:

```text
Request ID: req_123
```

when support diagnostics are useful.

---

# 67. Deployment Version

Every production instance should expose its application version internally.

Useful metadata:

```text
service
version
commit SHA
environment
deployment timestamp
```

This helps answer:

```text
Did this failure start after deployment X?
```

---

# 68. Version Correlation

Metrics and logs should allow operators to compare:

```text
version A
vs
version B
```

This is especially useful during:

```text
canary deployments
rolling deployments
rollback
```

---

# 69. Kubernetes Observability

If deployed to Kubernetes, monitor:

```text
pod restarts
CPU
memory
readiness
liveness
replica count
pending pods
deployment status
node health
```

Application metrics should complement Kubernetes metrics.

---

# 70. Container Observability

Containers should provide:

```text
stdout/stderr logs
health endpoint
metrics endpoint
version metadata
```

Do not write operational logs only to container-local files unless there is a specific collection strategy.

---

# 71. Log Aggregation

Production logs should be collected centrally.

Conceptual flow:

```text
Container stdout
       |
       v
Log collector
       |
       v
Central log store
       |
       v
Search / dashboards / alerts
```

Do not rely on one machine's local filesystem for production diagnostics.

---

# 72. Log Retention

Retention should be based on:

```text
operational need
security requirements
audit requirements
privacy
cost
compliance
```

Operational logs generally need shorter retention than required audit records.

---

# 73. Audit Retention

Audit records may require longer retention than operational logs.

Define:

```text
retention period
access controls
immutability expectations
deletion rules
privacy requirements
```

Do not keep personal data indefinitely without a reason.

---

# 74. Log Rotation

For local development and non-centralized environments, configure log rotation where needed.

Avoid:

```text
unbounded log files
```

Monitor disk usage.

---

# 75. Log Cost Control

Telemetry can become expensive.

Control cost by:

```text
sampling debug logs
reducing noisy logs
avoiding duplicate events
avoiding huge payloads
avoiding high-cardinality fields
retaining only useful data
```

Do not solve cost problems by removing critical incident telemetry.

---

# 76. Observability Failure Handling

Telemetry systems can fail.

The application should normally continue serving requests if:

```text
metrics backend unavailable
log collector temporarily unavailable
trace exporter unavailable
```

Telemetry should be designed with buffering and graceful degradation where supported.

Critical application behavior should not depend on an external telemetry vendor.

---

# 77. Backpressure

Telemetry pipelines can experience backpressure.

Protect the application from:

```text
unbounded telemetry queues
memory growth
blocking request threads
CPU exhaustion
```

Prefer bounded buffers and controlled dropping for non-critical telemetry.

---

# 78. Observability Security

Protect observability infrastructure.

Restrict access to:

```text
logs
metrics
traces
audit events
Grafana
Prometheus
alert configuration
```

Observability data can contain sensitive operational information.

---

# 79. Metrics Endpoint Security

If `/metrics` is exposed publicly, it may reveal:

```text
route names
traffic volume
error patterns
dependency information
internal component names
```

Prefer internal-only access where possible.

---

# 80. Grafana Security

Use:

```text
authentication
role-based access
least privilege
secure cookies
HTTPS
auditability
```

Do not share admin credentials.

---

# 81. Prometheus Security

Protect:

```text
Prometheus UI
configuration
targets
service discovery
remote write credentials
```

Prometheus should not be casually exposed to the public internet.

---

# 82. Observability for Authentication

Important authentication SLIs:

```text
login success rate
login failure rate
refresh success rate
refresh failure rate
session revocation rate
password reset success/failure
MFA success/failure
```

Watch for sudden changes.

---

# 83. Observability for RBAC

Track:

```text
403 rate
permission-denied events
role changes
permission changes
admin actions
```

A sudden 403 increase after a deployment may indicate a permission migration or policy bug.

---

# 84. Observability for API Contracts

Monitor:

```text
validation failures
unknown error rates
contract-related errors
response serialization failures
```

A sudden increase in validation errors may indicate:

```text
Admin/API version mismatch
frontend deployment bug
contract change
client integration problem
```

---

# 85. Observability for Database Migrations

During migrations, monitor:

```text
migration duration
database locks
connection pool pressure
error rate
application readiness
query latency
```

For large migrations, use an explicit migration observability plan.

---

# 86. Observability for Deployments

Every deployment should be observable.

Before deployment:

```text
baseline metrics
```

During deployment:

```text
5xx
latency
readiness
restart rate
database errors
```

After deployment:

```text
compare against baseline
```

---

# 87. Canary Deployment Signals

If canary deployments are introduced, compare:

```text
canary error rate
stable error rate
canary latency
stable latency
canary resource usage
stable resource usage
```

Automatically rolling back based only on CPU is insufficient.

---

# 88. Rollback Observability

After rollback, verify:

```text
5xx returns to baseline
latency returns to baseline
dependency errors decrease
queue recovers
readiness healthy
```

A successful deployment command does not necessarily mean the system recovered.

---

# 89. Incident Workflow

During an incident:

```text
1. Detect
2. Confirm
3. Scope
4. Correlate
5. Mitigate
6. Verify
7. Recover
8. Document
```

Use:

```text
metrics -> identify symptom
logs -> identify event
traces -> identify path
audit -> identify actor/action
deployment metadata -> identify change
```

---

# 90. Incident Triage

Start with:

```text
When did it start?
What changed?
Which routes are affected?
Which users are affected?
Is it global or partial?
Is there a common error code?
Is a dependency failing?
Is latency increasing?
```

Avoid immediately changing production configuration without evidence.

---

# 91. Recent Deployment Check

When an incident starts suddenly, compare:

```text
incident start
vs
deployment time
```

If strongly correlated:

```text
inspect deployment
compare version metrics
consider rollback
```

---

# 92. Dependency Triage

For dependency failures, determine:

```text
application problem
network problem
provider problem
credential problem
rate-limit problem
timeout problem
```

Use dependency-specific dashboards and logs.

---

# 93. Database Triage

For database problems, inspect:

```text
availability
connections
pool saturation
query latency
locks
deadlocks
storage
CPU
memory
recent migration
```

Do not immediately restart application instances if the database is the actual bottleneck.

---

# 94. Queue Triage

For worker problems, inspect:

```text
queue depth
active workers
failed jobs
retry count
processing duration
oldest job age
dependency failures
```

A growing queue usually requires identifying why processing capacity or success rate changed.

---

# 95. Observability Testing

Observability itself must be tested.

Test:

```text
request ID propagation
error logging
metrics emission
health endpoints
readiness failures
trace propagation
redaction
alert rules
dashboard queries
worker telemetry
```

---

# 96. Log Redaction Tests

Automated tests should verify telemetry does not contain:

```text
password
Authorization header
JWT
refresh token
DATABASE_URL
private keys
```

This is particularly important after logging changes.

---

# 97. Metrics Tests

Verify:

```text
request metric emitted
status code captured
route normalized
duration recorded
error metric emitted
```

Also verify labels remain bounded.

---

# 98. Health Check Tests

Test:

```text
healthy database
database unavailable
Redis unavailable when required
application startup incomplete
shutdown
```

Verify `/health` and `/ready` have intentionally different semantics.

---

# 99. Trace Tests

If tracing is enabled, test:

```text
incoming trace context
new trace generation
child spans
database spans
external HTTP spans
error status
trace/log correlation
```

Do not require tracing infrastructure to be available for ordinary local unit tests unless specifically testing telemetry integration.

---

# 100. Local Development

Local development should provide useful observability without overwhelming the terminal.

Recommended:

```text
pretty logs
debug level
request IDs
Swagger
/health
/ready
/metrics
```

Use more verbose logs locally when useful.

---

# 101. Test Environment

Test telemetry should be predictable.

Avoid sending test telemetry to production monitoring.

Use:

```text
test environment
separate metrics
separate log destination
separate trace project
```

where external observability infrastructure is used.

---

# 102. CI Observability Checks

CI should validate:

```text
log redaction
metrics registration
health endpoints
error response format
structured logging
```

If dashboards/alert definitions are version-controlled, validate their configuration too.

---

# 103. Production Smoke Checks

After deployment:

```text
GET /health
GET /ready
GET /metrics
authenticated API request
Admin login
critical API operation
```

Then verify telemetry appears.

---

# 104. Observability Runbooks

Important alerts should have runbooks.

Recommended runbooks:

```text
API 5xx Spike
API Latency Spike
Database Unavailable
Database Pool Exhaustion
Redis Unavailable
Worker Queue Growth
Authentication Failure Spike
Rate Limit Spike
Kubernetes Pod Restart Spike
```

Each runbook should contain:

```text
symptoms
likely causes
first checks
mitigation
rollback guidance
escalation
recovery verification
```

---

# 105. Documentation

Keep observability documentation close to the repository.

Recommended structure:

```text
docs/
├── observability/
│   ├── dashboards.md
│   ├── alerts.md
│   ├── runbooks.md
│   ├── logging.md
│   └── tracing.md
```

The exact location can evolve.

---

# 106. Configuration

Observability configuration should be environment-aware.

Examples:

```text
LOG_LEVEL
METRICS_ENABLED
TRACING_ENABLED
TRACE_SAMPLE_RATE
OTEL_EXPORTER_ENDPOINT
```

Names should match the actual implementation.

Never store credentials directly in source code.

---

# 107. Development Defaults

Local defaults should favor developer usability.

Example:

```text
LOG_LEVEL=debug
METRICS_ENABLED=true
TRACING_ENABLED=false
```

These are illustrative defaults.

Production settings should be explicitly configured.

---

# 108. Production Defaults

Production should favor:

```text
structured logs
appropriate info level
metrics enabled
controlled tracing
centralized collection
secure telemetry transport
```

Do not enable unrestricted debug logging in production.

---

# 109. Versioned Telemetry

When changing metric names or log event names:

1. document the change
2. update dashboards
3. update alerts
4. update runbooks
5. consider compatibility
6. remove obsolete telemetry only after consumers migrate

Telemetry schemas are operational interfaces.

---

# 110. Naming Conventions

Use consistent metric names.

Conceptually:

```text
http_requests_total
http_request_duration_seconds
database_connections
database_query_duration_seconds
worker_jobs_total
worker_job_duration_seconds
```

Use one naming convention throughout the repository.

---

# 111. Event Naming

Use hierarchical event names:

```text
auth.login_success
auth.login_failed
auth.refresh_failed
user.created
user.updated
authorization.denied
worker.job_failed
database.connection_failed
```

This makes event filtering easier.

---

# 112. Resource Attributes

Where supported, standardize:

```text
service.name
service.version
environment
instance
region
```

This allows common dashboards across deployments.

---

# 113. Cardinality Review

Before adding a metric label, ask:

```text
How many unique values can this field have?
```

Safe:

```text
GET
POST
PUT
DELETE
```

Potentially unsafe:

```text
user ID
request ID
email
URL with resource ID
```

If thousands or millions of values are possible, it probably does not belong in a metric label.

---

# 114. Sampling Review

Before collecting every trace/log event, ask:

```text
Will this help answer an operational question?
```

If not:

```text
do not collect it
```

Telemetry should have a purpose.

---

# 115. Data Minimization

Collect the minimum data necessary.

Especially avoid collecting:

```text
request bodies
response bodies
authentication credentials
personal data
payment data
```

unless there is a documented and protected reason.

---

# 116. Privacy

Observability systems should follow the same privacy principles as application data.

Consider:

```text
access control
retention
deletion
redaction
encryption
data residency where relevant
```

Logs are data stores.

Treat them accordingly.

---

# 117. Encryption

Telemetry should use secure transport in production.

Examples:

```text
HTTPS
TLS
secure agent transport
```

Protect credentials used to send telemetry.

---

# 118. Access Control

Only authorized operators should access:

```text
production logs
traces
metrics
audit logs
Grafana
Prometheus
alerting
```

Use least privilege.

---

# 119. Observability and Secrets

Never use observability systems as a secret store.

Bad:

```text
log environment object
```

Bad:

```text
log request headers
```

Bad:

```text
log DATABASE_URL
```

Good:

```text
database connection failed
```

---

# 120. Observability and Error Handling

Error handling and observability are tightly connected.

The error layer should provide:

```text
error code
status
request ID
safe message
```

The observability layer should provide:

```text
full internal context
stack/cause where safe
dependency context
timing
version
trace
```

The two layers should complement each other.

---

# 121. Observability and Performance

Telemetry has a cost.

Monitor the overhead of:

```text
logging
metrics
tracing
serialization
export
```

Avoid expensive synchronous logging on hot paths.

Do not perform expensive diagnostic work for every request unless justified.

---

# 122. Logging Hot Paths

For high-volume endpoints:

```text
GET /health
GET /metrics
frequent polling
```

avoid excessive verbose logging.

Otherwise observability can become the bottleneck.

---

# 123. Sampling Health Checks

Health checks may generate large request volumes in Kubernetes.

Consider:

```text
reduced logging
dedicated route handling
aggregated metrics
```

while preserving useful health metrics.

---

# 124. Metrics Scraping

Prometheus scraping should not create unnecessary application noise.

Metrics collection should be cheap and predictable.

Avoid doing expensive database queries every time `/metrics` is scraped.

Prefer maintained counters/gauges/histograms.

---

# 125. Runtime Resource Monitoring

Monitor:

```text
CPU
memory
heap
event-loop lag
open connections
file descriptors
GC behavior where relevant
```

These can reveal Node.js runtime issues before complete failure.

---

# 126. Node.js Event Loop

For a Fastify application, event-loop health matters.

Monitor event-loop delay where practical.

A growing event-loop delay can indicate:

```text
CPU-heavy code
synchronous filesystem operations
large JSON processing
inefficient loops
blocking libraries
```

---

# 127. Memory Monitoring

Monitor:

```text
RSS
heap used
heap total
heap limit
GC pressure
container memory
```

Watch for:

```text
steady memory growth
```

which may indicate leaks.

---

# 128. CPU Monitoring

High CPU may come from:

```text
JSON serialization
cryptographic work
large data processing
compression
synchronous operations
infinite/expensive loops
```

Correlate CPU spikes with request routes and deployment versions.

---

# 129. Container Restart Monitoring

Track:

```text
restart count
OOMKilled
exit codes
crash loops
startup failures
```

A process repeatedly restarting can look like intermittent availability rather than an obvious outage.

---

# 130. Dependency Health Matrix

Maintain a dependency matrix:

| Dependency   | Critical? | Health            | Metric         | Alert           |
| ------------ | --------: | ----------------- | -------------- | --------------- |
| PostgreSQL   |       Yes | readiness         | latency/errors | Yes             |
| Redis        |   Depends | health            | errors/latency | Yes if critical |
| Email        |   Depends | dependency metric | failures       | Yes             |
| External API |   Depends | dependency metric | latency/errors | Yes             |

The exact criticality depends on the feature.

---

# 131. Operational SLO Example

For a critical API:

```text
SLI:
successful requests / eligible requests

SLO:
99.9% monthly availability

Alert:
fast-burn + slow-burn error-budget alerts
```

The exact alert strategy should be introduced when traffic and reliability requirements justify it.

---

# 132. Error Budget

An SLO implies an error budget.

For:

```text
99.9%
```

the system can tolerate a limited amount of unavailability during the measurement window.

Use the budget to balance:

```text
feature delivery
vs
reliability work
```

---

# 133. Burn Rate

For mature production operations, monitor error-budget burn rate.

This detects:

```text
large incidents quickly
```

while also detecting:

```text
slow reliability degradation
```

Do not introduce complex SLO alerting until the underlying metrics are trustworthy.

---

# 134. Observability Maturity Levels

## Level 1 — Basic

```text
Pino logs
request IDs
health
readiness
Prometheus metrics
```

## Level 2 — Operational

```text
Grafana
dashboards
alerts
centralized logs
runbooks
```

## Level 3 — Distributed

```text
OpenTelemetry
traces
dependency spans
trace/log correlation
```

## Level 4 — Reliability Engineering

```text
SLIs
SLOs
error budgets
burn-rate alerts
automated rollback signals
```

Fastify-MasterApp should progress through these levels rather than implementing everything at once.

---

# 135. Recommended Implementation Order

```text
Phase 1
  |
  +--> structured Pino logging
  +--> request IDs
  +--> health/readiness
  +--> Prometheus metrics
  |
Phase 2
  |
  +--> Grafana dashboards
  +--> centralized log collection
  +--> alerts
  +--> runbooks
  |
Phase 3
  |
  +--> OpenTelemetry
  +--> distributed traces
  +--> trace/log correlation
  |
Phase 4
  |
  +--> SLI/SLO
  +--> error budgets
  +--> advanced alerting
```

---

# 136. Recommended Initial Metrics

Start with a small useful set:

```text
http_requests_total
http_request_duration_seconds
http_requests_errors_total

process_cpu
process_memory
event_loop_lag

database_connection_errors_total
database_query_duration_seconds

worker_jobs_total
worker_job_duration_seconds
worker_queue_depth
```

Names should be aligned with the actual metrics implementation.

---

# 137. Recommended Initial Logs

At minimum:

```text
server.start
server.ready
server.shutdown
request.completed
request.failed
auth.login_failed
auth.login_success
auth.refresh_failed
authorization.denied
database.error
dependency.error
worker.job_failed
```

Avoid logging both a low-level exception and the same error repeatedly at every layer.

---

# 138. Duplicate Logging

Bad:

```text
Repository logs error
Service logs same error
Route logs same error
Global handler logs same error
```

This creates four events for one failure.

Prefer one authoritative error log plus contextual logs where necessary.

---

# 139. Context Propagation

When passing work across boundaries, preserve:

```text
requestId
trace context
safe actor ID
```

For background jobs, include a correlation ID when useful.

Example:

```text
HTTP request
  |
  +--> enqueue job
         |
         +--> correlationId
```

This lets operators connect the original request to later asynchronous work.

---

# 140. Background Job Correlation

Example:

```text
POST /orders
requestId=req_123
        |
        v
jobId=job_456
        |
        v
worker
        |
        v
payment provider
```

The operator should be able to move between these records.

---

# 141. Async Error Investigation

When an asynchronous workflow fails, inspect:

```text
request ID
job ID
actor/resource ID
job type
attempt
dependency
error code
version
```

This is more useful than a generic:

```text
Job failed
```

---

# 142. Audit and Trace Correlation

For sensitive administrative operations:

```text
auditEventId
requestId
traceId
actorId
```

can provide strong investigative correlation.

Do not expose internal trace IDs unnecessarily to users.

---

# 143. Alert Testing

Alerts must be tested.

Possible methods:

```text
synthetic test
temporary threshold
controlled failure
alert rule unit test
```

Verify:

```text
alert fires
notification arrives
runbook is accessible
alert resolves
```

An untested alert is not a reliable control.

---

# 144. Dashboard Testing

Dashboards should be reviewed after metric changes.

Check:

```text
panels load
queries return data
labels are correct
time ranges work
deployment versions appear
alerts match panels
```

---

# 145. Synthetic Monitoring

For critical production flows, consider synthetic checks:

```text
health
readiness
login
critical read operation
critical write operation
```

Synthetic checks should use dedicated test accounts/data where appropriate.

Never use real customer credentials.

---

# 146. Synthetic Check Safety

Synthetic checks must not:

```text
create uncontrolled data
send real emails
charge real payment methods
modify real customer accounts
trigger expensive workflows
```

Use isolated test resources.

---

# 147. External Uptime Monitoring

If external uptime monitoring is introduced, monitor:

```text
public API availability
critical public route
Admin availability
```

Keep internal infrastructure monitoring separate.

---

# 148. Observability During Outages

During an outage, the monitoring stack must remain usable.

Avoid architectures where:

```text
API outage
    |
    v
same API hosts monitoring
    |
    v
no diagnostics
```

Prefer independent observability infrastructure.

---

# 149. Monitoring the Monitoring

Track:

```text
metrics scrape failures
log ingestion failures
trace export failures
dashboard availability
alert delivery failures
```

A silent monitoring failure is dangerous.

---

# 150. Alert Delivery

For critical alerts, verify delivery channels.

Examples:

```text
incident platform
email
Slack
pager
```

The actual channel depends on the deployment environment.

---

# 151. On-Call Readiness

An on-call engineer should be able to answer:

```text
What broke?
When?
How many users?
Which version?
Which endpoint?
Which dependency?
What is the mitigation?
```

within minutes, not hours.

---

# 152. Production Readiness Checklist

## Logs

- [ ] structured Pino logging
- [ ] request IDs
- [ ] appropriate log levels
- [ ] secrets redacted
- [ ] centralized collection
- [ ] retention defined

## Metrics

- [ ] request rate
- [ ] error rate
- [ ] latency
- [ ] process health
- [ ] database health
- [ ] worker health
- [ ] dependency health
- [ ] cardinality reviewed

## Health

- [ ] `/health`
- [ ] `/ready`
- [ ] dependency semantics defined
- [ ] no sensitive details exposed

## Tracing

- [ ] tracing strategy documented
- [ ] sampling strategy defined
- [ ] trace/log correlation
- [ ] sensitive data excluded

## Dashboards

- [ ] API dashboard
- [ ] database dashboard
- [ ] worker dashboard
- [ ] security dashboard
- [ ] infrastructure dashboard

## Alerts

- [ ] 5xx alert
- [ ] latency alert
- [ ] database alert
- [ ] dependency alert
- [ ] queue alert
- [ ] authentication anomaly alert
- [ ] alert owners
- [ ] runbooks

## Security

- [ ] telemetry access controlled
- [ ] metrics endpoint protected
- [ ] no secrets in telemetry
- [ ] audit logs protected
- [ ] retention defined

## Testing

- [ ] logging tests
- [ ] redaction tests
- [ ] metrics tests
- [ ] health tests
- [ ] readiness failure tests
- [ ] alert tests
- [ ] deployment smoke tests

---

# 153. Definition of Done — Observability

A production feature is observability-complete when:

- [ ] important operations emit structured logs
- [ ] request IDs are available
- [ ] errors have stable codes
- [ ] critical metrics exist
- [ ] latency can be measured
- [ ] dependency failures are visible
- [ ] sensitive data is redacted
- [ ] relevant audit events are defined
- [ ] background jobs are observable
- [ ] dashboards cover critical behavior
- [ ] important alerts have runbooks
- [ ] tests verify telemetry behavior
- [ ] deployment version can be identified
- [ ] operators can correlate a user-visible error with internal diagnostics

---

# 154. Observability Review Checklist

Before merging an operationally significant feature, ask:

### Logs

- What important events occur?
- Are they structured?
- Are errors logged exactly once?
- Are secrets excluded?

### Metrics

- What should we measure?
- Is the metric low-cardinality?
- Can we alert on it?
- Does it have a useful dashboard?

### Traces

- Is there a meaningful cross-service boundary?
- Should this operation create a span?
- Are sensitive attributes excluded?

### Health

- Does this dependency affect readiness?
- What happens when it is unavailable?

### Security

- Could telemetry expose credentials?
- Could it expose sensitive personal data?
- Who can access the telemetry?

### Operations

- What alert should fire?
- Who owns it?
- What is the recovery procedure?

---

# 155. Anti-Patterns

## Logging Secrets

Never.

```text
logger.info({ token }, "request")
```

---

## Logging Entire Requests

Avoid:

```text
logger.info({ request }, "incoming request")
```

This can capture:

```text
headers
cookies
body
credentials
```

---

## High-Cardinality Metrics

Avoid:

```text
http_requests_total{user_id="..."}
```

---

## Alert on Every Error

Avoid alerting on every:

```text
404
400
401
```

unless the aggregate behavior indicates a real issue.

---

## No Request Correlation

Without request IDs:

```text
Admin sees error
       |
       v
Engineer cannot find event
```

This creates unnecessary incident friction.

---

## Monitoring Only Infrastructure

CPU and memory do not tell you whether:

```text
users can log in
users can create records
permissions work
database queries are correct
```

Monitor user-facing behavior too.

---

## Too Much Telemetry

More data does not automatically mean better observability.

Prefer:

```text
useful + safe + searchable
```

over:

```text
everything
```

---

# 156. Example Incident

Suppose Admin users report:

```text
User management is failing.
```

The investigation should proceed:

```text
1. Check API 5xx rate
       |
       v
2. Check user endpoint errors
       |
       v
3. Identify error code
       |
       v
4. Find request ID from Admin
       |
       v
5. Search logs
       |
       v
6. Inspect trace
       |
       v
7. Check PostgreSQL
       |
       v
8. Check recent deployment
       |
       v
9. Mitigate
       |
       v
10. Verify recovery
```

Observability should reduce this from hours to minutes.

---

# 157. Example Failure Correlation

```text
Admin
  |
  | POST /users
  | requestId=req_123
  v
Fastify
  |
  | traceId=trace_abc
  v
User Service
  |
  v
Repository
  |
  v
PostgreSQL
  |
  X unique constraint
  |
  v
DuplicateResourceError
  |
  +--> HTTP 409
  +--> Pino event
  +--> request metric
  +--> trace error
```

The user receives:

```text
A user with that email already exists.
```

The operator sees the underlying diagnostic context.

---

# 158. Example Unexpected Failure

```text
Admin request
      |
      v
Fastify
      |
      v
Service
      |
      X unexpected exception
      |
      v
Global error handler
      |
      +--> HTTP 500
      +--> INTERNAL_ERROR
      +--> requestId
      |
      +--> structured error log
      +--> metric
      +--> trace error
```

The public response remains safe.

The internal telemetry remains diagnostic.

---

# 159. Final Target Architecture

The target production architecture is:

```text
                         ┌─────────────────────┐
                         │     React Admin     │
                         └──────────┬──────────┘
                                    │
                                    v
                         ┌─────────────────────┐
                         │      Fastify API    │
                         │                     │
                         │ Request ID          │
                         │ Pino                │
                         │ Prometheus          │
                         │ OpenTelemetry       │
                         └──────────┬──────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             v                      v                      v
      ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
      │ PostgreSQL  │       │ Redis       │       │ External API│
      └─────────────┘       └─────────────┘       └─────────────┘
             │                      │                      │
             └──────────────────────┼──────────────────────┘
                                    v
                         ┌─────────────────────┐
                         │ Telemetry Pipeline  │
                         └──────────┬──────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             v                      v                      v
      ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
      │ Log Store   │       │ Prometheus  │       │ Trace Store │
      └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
             │                     │                      │
             └─────────────────────┼──────────────────────┘
                                   v
                         ┌─────────────────────┐
                         │ Grafana / Alerts    │
                         │ Runbooks / Incidents│
                         └─────────────────────┘
```

The central principle is:

> **Logs explain events, metrics expose system behavior, traces connect distributed work, health checks establish service state, and audit events establish accountability.**

Together they make Fastify-MasterApp diagnosable, secure, and operable in production.
