# OBSERVABILITY.md

## Fastify-MasterApp Observability Architecture & Implementation Plan

**Project:** Fastify-MasterApp  
**Scope:** API, Admin Frontend, PostgreSQL/Prisma, background workers, infrastructure, CI/CD  
**Status:** Planned / Progressive Implementation  
**Primary Goal:** Make production behavior measurable, diagnosable, and actionable without turning the application into an observability-heavy platform before it needs one.

---

## 1. Purpose

Observability answers three operational questions:

1. **What is happening?**
2. **Why is it happening?**
3. **Which user, request, dependency, or deployment caused it?**

Fastify-MasterApp should implement observability as a layered system:

```text
                    ┌──────────────────────────┐
                    │       Admin Frontend     │
                    │ errors / latency / UX    │
                    └────────────┬─────────────┘
                                 │
                                 ▼
┌───────────────┐      ┌──────────────────────────┐
│ Load Balancer │ ───► │       Fastify API        │
└───────────────┘      │ logs / metrics / traces  │
                       └───────┬─────────┬────────┘
                               │         │
                    ┌──────────┘         └───────────┐
                    ▼                                ▼
             ┌─────────────┐                  ┌─────────────┐
             │ PostgreSQL  │                  │ Redis/Jobs  │
             │ DB metrics  │                  │ worker      │
             └─────────────┘                  └─────────────┘

                 ┌─────────────────────────────────┐
                 │       Observability Stack       │
                 │ logs + metrics + traces + alert │
                 └─────────────────────────────────┘
```

The application should use the three traditional telemetry pillars:

- **Logs** — discrete events and diagnostic context.
- **Metrics** — aggregated measurements and trends.
- **Traces** — request/dependency timelines and causality.

A fourth operational layer is required:

- **Alerts** — actionable notifications derived from telemetry.

---

# 2. Observability Principles

## 2.1 Measure user-impacting behavior first

Prioritize signals that answer:

- Is the API available?
- Are requests succeeding?
- Are requests getting slower?
- Which endpoints are failing?
- Are database queries becoming slow?
- Are background jobs failing?
- Is authentication being attacked?
- Is the admin application broken?

Avoid collecting telemetry merely because it is technically possible.

---

## 2.2 Structured telemetry only

Production logs must be machine-readable.

Prefer:

```json
{
  "level": "info",
  "event": "request.completed",
  "requestId": "req_123",
  "method": "GET",
  "route": "/api/v1/users/:id",
  "statusCode": 200,
  "durationMs": 42
}
```

Avoid:

```text
User request GET /users/123 finished successfully in 42ms
```

Structured logs make filtering, aggregation, alerting, and incident investigation much easier.

---

## 2.3 Correlation everywhere

A request should be traceable across:

```text
Browser
  ↓
API gateway/load balancer
  ↓
Fastify request
  ↓
Service/orchestrator
  ↓
Database
  ↓
External API
  ↓
Background job
```

Every boundary should preserve an appropriate correlation or trace context.

---

## 2.4 Never log secrets

Never log:

- passwords
- password reset tokens
- JWT access tokens
- refresh tokens
- API keys
- database credentials
- session cookies
- authorization headers
- full payment credentials
- sensitive personal data unless explicitly justified

Use redaction at the logger boundary rather than relying only on developer discipline.

---

## 2.5 Metrics must have bounded cardinality

Do not create metric labels from arbitrary user-controlled values.

Bad:

```text
http_requests_total{userId="123456"}
```

Bad:

```text
http_requests_total{email="someone@example.com"}
```

Good:

```text
http_requests_total{
  method="GET",
  route="/api/v1/users/:id",
  status_class="2xx"
}
```

Route templates should be used instead of raw URLs.

---

## 2.6 Alerts should be actionable

An alert should answer:

> "What needs attention right now?"

Avoid alerts for every small error.

Prefer:

```text
API 5xx rate > 5% for 10 minutes
```

over:

```text
A request returned 500
```

---

# 3. Observability Architecture

## 3.1 Logical architecture

```text
                 ┌──────────────────────┐
                 │    Admin Frontend     │
                 │ browser telemetry    │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │      Fastify API     │
                 │                      │
                 │ Pino ───────► Logs   │
                 │ Metrics ─────► Prom  │
                 │ Tracing ─────► OTEL  │
                 └───────┬──────┬───────┘
                         │      │
                  ┌──────┘      └──────────┐
                  ▼                        ▼
             PostgreSQL               Workers
                  │                        │
                  └──────────┬─────────────┘
                             ▼
                  ┌─────────────────────┐
                  │ Telemetry Backend   │
                  │                     │
                  │ Logs                │
                  │ Metrics             │
                  │ Traces              │
                  └─────────┬───────────┘
                            ▼
                  ┌─────────────────────┐
                  │ Dashboards + Alerts │
                  └─────────────────────┘
```

---

# 4. Observability Stack

The project already has a natural foundation around:

- Fastify
- Pino
- Prometheus
- Grafana
- health/readiness endpoints

The recommended progression is:

### Phase 1

```text
Pino
Prometheus
Grafana
Health checks
Request IDs
```

### Phase 2

```text
OpenTelemetry
Distributed tracing
Trace/log correlation
```

### Phase 3

```text
Centralized log storage
Alert manager
Error tracking
Browser telemetry
```

### Phase 4

```text
Advanced SLOs
Dependency dashboards
Continuous profiling if needed
Capacity planning
```

Do not introduce every component simultaneously.

---

# 5. Logging Architecture

## 5.1 Logger

Use the existing Pino-based logging architecture.

Development:

```text
human-readable logs
```

Production:

```text
JSON logs
```

The logger should support:

- log levels
- structured fields
- request IDs
- trace IDs when tracing is enabled
- error serialization
- redaction
- environment metadata
- service metadata

---

# 6. Log Levels

Use levels consistently.

| Level | Meaning                                   | Example                             |
| ----- | ----------------------------------------- | ----------------------------------- |
| trace | Extremely detailed diagnostic information | internal execution detail           |
| debug | Developer diagnostics                     | query parameters after sanitization |
| info  | Normal important event                    | request completed                   |
| warn  | Unexpected but recoverable condition      | retry occurred                      |
| error | Operation failed                          | database operation failed           |
| fatal | Process cannot safely continue            | startup configuration failure       |

Production defaults should normally avoid `debug` and `trace` unless temporarily enabled for controlled diagnostics.

---

# 7. Standard Log Fields

Every important application log should use a consistent vocabulary.

Recommended fields:

```text
timestamp
level
service
environment
version
event
requestId
traceId
spanId
method
route
statusCode
durationMs
userId
actorId
resourceType
resourceId
errorCode
errorName
```

Not every event requires every field.

---

# 8. Request Logging

Every API request should produce enough information to answer:

- when it happened
- which route handled it
- whether it succeeded
- how long it took
- which request initiated it
- which authenticated actor performed it, when appropriate

Recommended event:

```json
{
  "event": "request.completed",
  "requestId": "req_123",
  "method": "POST",
  "route": "/api/v1/users",
  "statusCode": 201,
  "durationMs": 87
}
```

For failures:

```json
{
  "event": "request.failed",
  "requestId": "req_124",
  "method": "POST",
  "route": "/api/v1/users",
  "statusCode": 409,
  "errorCode": "USER_ALREADY_EXISTS",
  "durationMs": 31
}
```

---

# 9. Request ID

Every incoming request should receive a request identifier.

Preferred behavior:

```text
Incoming request
      │
      ├── trusted existing request ID → validate/use
      │
      └── missing/invalid → generate new ID
```

The request ID should appear in:

- request logs
- error responses where appropriate
- audit events
- traces
- support/debugging information

Example:

```json
{
  "requestId": "req_01H..."
}
```

Never expose internal infrastructure details merely to provide correlation.

---

# 10. Request ID vs Trace ID

These serve related but different purposes.

### Request ID

Application-level correlation.

```text
req_123
```

### Trace ID

Distributed execution correlation.

```text
4bf92f3577b34da6a3ce929d0e0e4736
```

A mature system can expose both:

```text
requestId = req_123
traceId   = 4bf92f...
```

---

# 11. Error Logging

Errors should contain structured information.

Recommended:

```json
{
  "event": "database.operation.failed",
  "errorCode": "DB_QUERY_FAILED",
  "operation": "user.findById",
  "requestId": "req_123",
  "durationMs": 83
}
```

Do not log:

```text
password=...
authorization=Bearer ...
refreshToken=...
```

---

# 12. Error Classification

Errors should be categorized.

```text
CLIENT_ERROR
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
VALIDATION_ERROR
NOT_FOUND
CONFLICT
RATE_LIMITED
DATABASE_ERROR
EXTERNAL_SERVICE_ERROR
INTERNAL_ERROR
TIMEOUT
```

This classification should be consistent with `API_CONVENTIONS.md`.

---

# 13. Authentication Logging

Security-sensitive events should be observable.

Recommended events:

```text
auth.login.success
auth.login.failed
auth.logout
auth.refresh.success
auth.refresh.failed
auth.refresh.reuse_detected
auth.password.changed
auth.password.reset.requested
auth.password.reset.completed
auth.account.locked
auth.mfa.challenge_failed
```

Do not log credentials or tokens.

Example:

```json
{
  "event": "auth.login.failed",
  "reason": "INVALID_CREDENTIALS",
  "requestId": "req_123",
  "ipHash": "..."
}
```

If IP addresses are collected, define retention and privacy rules.

---

# 14. Authorization / RBAC Logging

Important authorization events should be observable.

Examples:

```text
authorization.denied
authorization.role_changed
authorization.permission_granted
authorization.permission_revoked
authorization.policy_changed
```

Example:

```json
{
  "event": "authorization.denied",
  "actorId": "user_123",
  "resourceType": "user",
  "resourceId": "user_456",
  "action": "delete",
  "requestId": "req_123"
}
```

Do not log unnecessary sensitive resource data.

---

# 15. Audit Logs vs Application Logs

These are different systems.

### Application log

Used by engineers to diagnose runtime behavior.

```text
database.operation.failed
```

### Audit event

Used to establish who did what and when.

```text
admin.role.updated
```

Audit records should generally be:

- durable
- structured
- queryable
- access-controlled
- tamper-resistant
- retained according to policy

Do not use normal application logs as the authoritative audit trail.

---

# 16. Metrics Architecture

Prometheus should collect application metrics.

Primary metric groups:

```text
HTTP
Authentication
Authorization
Database
Background jobs
External dependencies
Runtime
Business
Infrastructure
```

---

# 17. HTTP Metrics

Minimum recommended metrics:

```text
http_requests_total
http_request_duration_seconds
http_requests_in_flight
http_response_size_bytes
```

Labels:

```text
method
route
status_class
```

Avoid raw URL labels.

---

# 18. HTTP Request Rate

Conceptually:

```text
requests / second
```

Useful dashboard:

```text
Requests per second
├── 2xx
├── 3xx
├── 4xx
└── 5xx
```

This reveals traffic changes and failures quickly.

---

# 19. HTTP Error Rate

Track:

```text
4xx rate
5xx rate
```

Distinguish them.

A spike in `4xx` may indicate:

- client bug
- frontend deployment problem
- invalid API usage
- authentication expiration
- attack traffic

A spike in `5xx` usually indicates server-side failure.

---

# 20. Latency Metrics

Track latency distribution rather than only average latency.

Recommended percentiles:

```text
p50
p90
p95
p99
```

Example:

```text
GET /users
p50 = 35ms
p95 = 180ms
p99 = 640ms
```

The average could hide the p99 problem.

---

# 21. Latency Buckets

Prometheus histogram buckets should reflect actual application behavior.

Example:

```text
0.005
0.01
0.025
0.05
0.1
0.25
0.5
1
2.5
5
10
```

Adjust after observing real traffic.

---

# 22. Database Metrics

Monitor:

```text
query duration
query count
query errors
connection pool usage
connection acquisition latency
transaction duration
transaction failures
```

If PostgreSQL monitoring is available, also track:

```text
active connections
idle connections
locks
deadlocks
cache hit ratio
database CPU
database memory
storage
```

---

# 23. Prisma Observability

Prisma should be instrumented carefully.

Useful information:

```text
operation
model
duration
success/failure
```

Do not blindly log every SQL query in production.

Development query logging can be verbose.

Production should prefer aggregated metrics and controlled slow-query diagnostics.

---

# 24. Slow Query Detection

Define a threshold.

Example:

```text
slow query > 500ms
```

A slow query event might contain:

```json
{
  "event": "database.query.slow",
  "operation": "user.findMany",
  "durationMs": 742
}
```

Do not include sensitive query parameters.

---

# 25. Connection Pool Monitoring

Connection exhaustion can cause cascading API failure.

Track:

```text
pool.size
pool.active
pool.idle
pool.waiting
```

Alert when the pool is consistently near capacity.

---

# 26. Transaction Metrics

Monitor:

```text
transaction.count
transaction.duration
transaction.failure_count
transaction.rollback_count
```

Long-running transactions should be investigated because they can contribute to lock contention.

---

# 27. Background Job Metrics

When BullMQ/workers are introduced, track:

```text
jobs_enqueued_total
jobs_completed_total
jobs_failed_total
jobs_retried_total
job_duration_seconds
jobs_waiting
jobs_active
jobs_delayed
jobs_stalled
```

Group by bounded dimensions:

```text
queue
job_type
status
```

---

# 28. Queue Health Dashboard

Example:

```text
Queue Health
────────────────────────────
Waiting        12
Active          4
Delayed         7
Failed         18
Stalled         0

Throughput
Completed/min  42

Latency
p50            210ms
p95            820ms
```

---

# 29. External Dependency Metrics

For every important external service:

```text
request count
success count
failure count
timeout count
latency
retry count
circuit breaker state
```

Example:

```text
external_requests_total{
  service="payment-provider",
  operation="charge",
  status="success"
}
```

---

# 30. Circuit Breaker Observability

If circuit breakers are introduced, expose:

```text
closed
open
half_open
```

Also track:

```text
failure count
success count
rejected requests
recovery time
```

A circuit breaker opening should normally produce a warning or alert depending on impact.

---

# 31. Runtime Metrics

Node.js runtime metrics should include:

```text
heap used
heap total
external memory
RSS
event loop delay
GC activity
CPU
process uptime
```

Useful indicators:

```text
memory growth
event loop blocking
CPU saturation
frequent garbage collection
```

---

# 32. Event Loop Monitoring

A Fastify application can appear healthy while the Node.js event loop is blocked.

Track event loop delay.

Investigate:

```text
high CPU
large synchronous operations
CPU-heavy serialization
large JSON processing
synchronous filesystem operations
poorly designed loops
```

---

# 33. Process Metrics

Track:

```text
process_start_time
process_uptime
process_restarts
open_file_descriptors
CPU utilization
memory utilization
```

Frequent restarts can indicate:

- crashes
- OOM
- deployment instability
- health-check failures

---

# 34. Business Metrics

Technical metrics are not enough.

Add business-level metrics where useful.

Examples:

```text
users_registered_total
users_active
todos_created_total
orders_created_total
orders_completed_total
orders_cancelled_total
```

For the Admin application:

```text
admin_logins_total
admin_actions_total
bulk_operations_total
```

Business metrics must not expose sensitive user information.

---

# 35. Business Metric Naming

Prefer explicit names:

```text
users_registered_total
orders_created_total
```

Avoid ambiguous names:

```text
users
orders_count
stuff_created
```

Metric names should communicate:

- subject
- action
- unit/type

---

# 36. Metrics Cardinality Rules

Safe labels:

```text
method
route
status_class
queue
job_type
service
environment
```

Potentially dangerous:

```text
userId
email
orderId
requestId
IP
searchTerm
arbitrary error message
```

High-cardinality dimensions belong in logs/traces, not normal Prometheus labels.

---

# 37. Health Checks

The API should expose:

```text
GET /health
GET /ready
```

These have different responsibilities.

### `/health`

Answers:

> Is the process alive?

Should remain lightweight.

### `/ready`

Answers:

> Can this instance receive production traffic?

May check critical dependencies.

---

# 38. Health Response

Example:

```json
{
  "status": "ok",
  "service": "api",
  "version": "1.0.0"
}
```

Readiness can expose dependency state without leaking internal details:

```json
{
  "status": "ready"
}
```

Do not expose:

```text
database password
connection strings
internal hostnames
stack traces
```

---

# 39. Dependency Health

Readiness may evaluate:

```text
database
redis
critical configuration
required external dependency
```

Do not make every optional dependency a hard readiness dependency.

For example:

```text
Analytics provider DOWN
        ↓
API can still serve normal requests
        ↓
Do not necessarily mark API unready
```

---

# 40. Startup and Shutdown Observability

Startup events:

```text
application.starting
configuration.validated
database.connected
plugins.registered
server.started
```

Shutdown events:

```text
application.shutdown_requested
server.draining
connections.closed
workers.stopped
database.disconnected
application.stopped
```

This makes deployment and crash investigation much easier.

---

# 41. Graceful Shutdown Metrics

During shutdown:

```text
active_requests
active_jobs
open_connections
drain_duration
```

The application should finish or safely terminate in-flight work according to its shutdown policy.

---

# 42. Distributed Tracing

OpenTelemetry should be introduced when the system has enough distributed behavior to justify it.

Tracing becomes particularly valuable when the architecture includes:

```text
API
  ↓
database
  ↓
Redis
  ↓
worker
  ↓
external service
```

---

# 43. Trace Structure

Example:

```text
Trace: POST /orders

├── HTTP POST /orders          420ms
│
├── authorization.check          4ms
│
├── order.create                380ms
│   ├── postgres.insert          72ms
│   ├── payment.authorize       240ms
│   └── event.publish            18ms
│
└── response.serialize            8ms
```

This immediately identifies where latency originates.

---

# 44. Trace Attributes

Useful bounded attributes:

```text
http.request.method
http.route
http.response.status_code
server.address
service.name
deployment.environment
db.system
db.operation.name
messaging.system
```

Avoid arbitrary personal data.

---

# 45. Trace Sampling

Do not necessarily retain 100% of all traces forever.

Potential policy:

```text
normal successful traffic → sampled
slow requests             → retained
5xx requests              → retained
critical operations       → higher sampling
```

Sampling should be configurable.

---

# 46. Trace and Log Correlation

When tracing is enabled, logs should include:

```text
traceId
spanId
requestId
```

This enables:

```text
Grafana trace
     ↓
trace ID
     ↓
application logs
     ↓
database/external dependency
```

---

# 47. Frontend Observability

The Admin frontend should capture operationally useful browser information.

Recommended:

```text
JavaScript errors
API failures
route/navigation failures
slow API requests
authentication failures
build/version identifier
browser/runtime information
```

Do not capture:

```text
passwords
access tokens
refresh tokens
form secrets
full sensitive payloads
```

---

# 48. Admin API Error Correlation

When an API call fails, the Admin UI should be able to display a safe support reference:

```text
Something went wrong.

Request ID:
req_123...
```

Avoid displaying stack traces.

---

# 49. Frontend Performance

Measure where useful:

```text
initial page load
route transition
API latency
largest contentful paint
interaction latency
```

Do not optimize every browser metric before real user impact exists.

---

# 50. Version Tracking

Every deployed API and Admin build should expose a version identifier.

Recommended metadata:

```text
service
version
commitSha
environment
buildTime
```

Example:

```json
{
  "service": "api",
  "version": "1.8.0",
  "commit": "abc123"
}
```

This is extremely useful when investigating regressions after deployment.

---

# 51. Deployment Correlation

Every deployment should be observable.

Record:

```text
deployment started
deployment completed
deployment failed
version
commit SHA
environment
```

Dashboards should allow operators to correlate:

```text
deployment
   ↓
latency increase
   ↓
5xx increase
   ↓
rollback
```

---

# 52. SLOs

Service Level Objectives should be introduced once production traffic and reliability expectations are understood.

Initial examples:

### Availability

```text
99.9% successful availability
```

### API success

```text
99.5% of eligible requests succeed
```

### Latency

```text
95% of normal API requests < 500ms
```

These are examples, not mandatory targets.

Targets should be based on actual requirements.

---

# 53. SLIs

Possible Service Level Indicators:

```text
availability
successful request ratio
latency
error ratio
job completion ratio
queue latency
```

---

# 54. Error Budget

If an SLO is:

```text
99.9% availability
```

then the error budget is:

```text
0.1%
```

The team should use the budget to balance:

```text
feature velocity
vs
reliability work
```

Do not define SLOs merely for documentation. Use them to influence engineering decisions.

---

# 55. Alerting Strategy

Alerts should be divided into:

### Critical

Immediate response required.

Examples:

```text
API unavailable
database unavailable
massive 5xx spike
critical authentication outage
```

### Warning

Needs investigation but may not require immediate intervention.

Examples:

```text
latency increasing
disk usage high
queue backlog growing
dependency error rate increasing
```

### Informational

Dashboard/event only.

Examples:

```text
deployment completed
worker restarted
certificate nearing renewal
```

---

# 56. Recommended Initial Alerts

Start small.

### API availability

```text
health checks failing
```

### API 5xx

```text
5xx ratio > threshold for sustained period
```

### Latency

```text
p95 latency > threshold for sustained period
```

### Database

```text
connection exhaustion
database unavailable
```

### Resource saturation

```text
memory critically high
CPU critically high
disk critically high
```

### Queue

```text
queue backlog growing
job failures sustained
stalled jobs
```

---

# 57. Alert Quality

Every alert should have:

```text
name
severity
condition
duration
owner/team
runbook
dashboard
expected action
```

Example:

```text
Alert: APIHighErrorRate

Severity:
Critical

Condition:
5xx ratio > 5% for 10 minutes

Dashboard:
API Overview

Runbook:
API Error Investigation
```

---

# 58. Dashboards

The first dashboards should be operationally focused.

Recommended dashboards:

```text
1. API Overview
2. API Endpoint Performance
3. Database
4. Authentication & Security
5. Background Jobs
6. External Dependencies
7. Runtime
8. Infrastructure
9. Admin Frontend
10. Business KPIs
```

---

# 59. API Overview Dashboard

Include:

```text
Request rate
5xx rate
4xx rate
p50 latency
p95 latency
p99 latency
active requests
CPU
memory
```

Example:

```text
┌─────────────────────────────────────────┐
│ API OVERVIEW                            │
├───────────┬───────────┬─────────────────┤
│ RPS       │ 5xx       │ p95             │
│ 184       │ 0.2%      │ 182ms           │
├───────────┴───────────┴─────────────────┤
│ Request Rate                            │
│ █████████████████████                   │
├─────────────────────────────────────────┤
│ Latency                                 │
│ p50 42ms   p95 182ms   p99 410ms        │
└─────────────────────────────────────────┘
```

---

# 60. Endpoint Performance Dashboard

Group by route template.

Example:

```text
Route                         RPS    p95     5xx
GET /users                    42     120ms   0.1%
POST /users                   12     180ms   0.3%
GET /todos                    65      80ms   0.0%
POST /todos                   18     140ms   0.1%
```

This should make problematic endpoints immediately visible.

---

# 61. Database Dashboard

Include:

```text
connection usage
query rate
query latency
slow queries
errors
deadlocks
locks
CPU
memory
storage
```

---

# 62. Authentication Dashboard

Useful metrics:

```text
login success rate
login failure rate
refresh success/failure
refresh reuse detections
logout events
password reset requests
account lockouts
MFA failures
```

This can reveal both operational and security problems.

---

# 63. Security Dashboard

Recommended:

```text
authorization denials
rate-limit events
authentication failures
suspicious login patterns
refresh-token reuse detection
blocked requests
webhook signature failures
```

Security telemetry must be access-controlled.

---

# 64. Worker Dashboard

When workers exist:

```text
queue depth
job throughput
job latency
job failure rate
retry rate
stalled jobs
worker count
worker CPU/memory
```

---

# 65. External Dependency Dashboard

For each critical dependency:

```text
availability
request rate
error rate
timeout rate
latency
retries
circuit state
```

---

# 66. Runtime Dashboard

Include:

```text
CPU
RSS
heap
GC
event loop delay
process uptime
restarts
```

---

# 67. Infrastructure Dashboard

Depending on deployment environment:

```text
instance/pod count
CPU
memory
network
disk
container restarts
load balancer health
database resources
Redis resources
```

---

# 68. Business Dashboard

Business dashboards should be separate from infrastructure dashboards.

Examples:

```text
new users
active users
orders
conversion
failed payments
completed jobs
```

Business dashboards should use aggregated data.

---

# 69. Grafana Organization

Recommended folder structure:

```text
Grafana/
├── API
├── Database
├── Security
├── Workers
├── Dependencies
├── Infrastructure
├── Admin
└── Business
```

Dashboards should have:

- owner
- description
- refresh interval
- useful time ranges
- links to related dashboards
- links to runbooks

---

# 70. Log Retention

Retention should be based on:

```text
operational needs
security requirements
compliance requirements
storage cost
```

A possible starting policy:

```text
hot searchable logs: 7–30 days
aggregated metrics: 30–180+ days
audit logs: policy-driven
```

These are examples and must be adjusted to actual requirements.

---

# 71. Sensitive Data Retention

Telemetry often becomes a secondary data store.

Therefore:

```text
collect less
retain less
restrict access
delete predictably
```

Do not retain sensitive information simply because the logging platform can store it.

---

# 72. Log Redaction

Configure logger-level redaction for:

```text
authorization
cookie
set-cookie
password
token
refreshToken
accessToken
clientSecret
apiKey
database URL
```

Example conceptual configuration:

```text
redact:
  - req.headers.authorization
  - req.headers.cookie
  - password
  - refreshToken
  - accessToken
```

Field names should match the application's actual structures.

---

# 73. PII Policy

Before adding a field to logs ask:

```text
Is it necessary?
Can we use an ID instead?
Can we hash it?
Can we aggregate it?
How long must it exist?
Who can access it?
```

Prefer:

```text
userId=user_123
```

over:

```text
email=rohit@example.com
```

when the email is not required.

---

# 74. Incident Investigation Workflow

When an incident occurs:

```text
1. Detect
2. Confirm
3. Scope
4. Correlate
5. Identify change
6. Mitigate
7. Recover
8. Validate
9. Document
10. Prevent recurrence
```

---

# 75. Incident Triage

Start with:

```text
Is the service up?
       ↓
Are requests succeeding?
       ↓
Which endpoint?
       ↓
When did it start?
       ↓
What changed?
       ↓
Is a dependency failing?
       ↓
Is resource saturation involved?
```

---

# 76. Correlation Workflow

Example:

```text
User reports:
"Creating a user failed."

        ↓

Admin shows requestId:
req_123

        ↓

API log:
POST /users → 500

        ↓

Trace:
user.create → database.insert

        ↓

Database:
unique constraint violation

        ↓

Root cause:
deployment changed uniqueness behavior
```

Observability should make this workflow fast.

---

# 77. Deployment Investigation

When an incident starts after deployment:

```text
Compare:
previous version
current version
```

Look at:

```text
5xx
latency
database errors
authentication failures
queue failures
resource usage
```

If the regression clearly correlates with deployment, rollback may be safer than debugging live under pressure.

---

# 78. Runbooks

Every critical alert should eventually have a runbook.

Recommended files:

```text
docs/runbooks/
├── api-high-error-rate.md
├── api-high-latency.md
├── database-unavailable.md
├── database-connection-exhaustion.md
├── redis-unavailable.md
├── queue-backlog.md
├── worker-failures.md
├── authentication-outage.md
├── deployment-rollback.md
└── security-incident.md
```

---

# 79. API High Error Rate Runbook

Minimum procedure:

```text
1. Open API Overview dashboard.
2. Identify affected routes.
3. Determine first occurrence.
4. Check recent deployments.
5. Inspect representative request IDs.
6. Inspect traces if available.
7. Check database/dependency health.
8. Check CPU/memory.
9. Roll back if deployment-related and impact is high.
10. Validate recovery.
```

---

# 80. API High Latency Runbook

Check:

```text
1. Which endpoints?
2. p50 vs p95 vs p99?
3. API CPU?
4. Event loop delay?
5. Database latency?
6. External dependency latency?
7. Connection pool?
8. Recent deployment?
9. Traffic spike?
```

---

# 81. Database Incident Runbook

Check:

```text
database availability
connections
locks
deadlocks
slow queries
CPU
memory
storage
recent migrations
```

Avoid immediately restarting infrastructure without understanding whether it will make the incident worse.

---

# 82. Security Incident Runbook

Check:

```text
authentication failures
authorization denials
rate limiting
suspicious request patterns
refresh-token reuse
admin activity
recent permission changes
recent deployments
```

Follow the project's security incident response policy.

---

# 83. Observability Testing

Telemetry itself must be tested.

Test:

```text
request logs exist
request ID propagation works
errors are structured
secrets are redacted
metrics increment correctly
route labels use templates
health checks behave correctly
trace context propagates
alerts fire under controlled conditions
```

---

# 84. Logging Tests

Examples:

```text
Given request
When request completes
Then request.completed is emitted

Given invalid authentication
When login fails
Then auth.login.failed is emitted
And password is not logged
```

---

# 85. Metrics Tests

Verify:

```text
request counter increments
duration histogram records
5xx metrics increment
authentication metrics increment
queue metrics increment
```

Avoid brittle tests that depend on exact internal metric implementation unless necessary.

---

# 86. Redaction Tests

Security regression test:

```text
Generate request containing:
Authorization header
password
refresh token

Capture log output

Assert:
secret values are absent
```

This should be part of automated testing.

---

# 87. Health Check Tests

Test:

```text
/health
```

when:

```text
application healthy
```

and:

```text
/ready
```

under:

```text
database available
database unavailable
critical dependency unavailable
```

Ensure health behavior matches deployment expectations.

---

# 88. Alert Testing

Alerts should be tested periodically.

A good alert is not useful if:

```text
its query is broken
its notification channel is broken
nobody owns it
the threshold is unrealistic
the runbook is missing
```

---

# 89. Observability Development Environment

Local development should provide:

```text
API logs
/metrics
/health
/ready
Swagger
optional Grafana
optional Prometheus
```

Docker Compose can provide the optional observability stack.

Example:

```text
docker compose
├── postgres
├── prometheus
└── grafana
```

Tracing/log aggregation can be added later.

---

# 90. Local Developer Workflow

Recommended:

```bash
pnpm dev
```

Then inspect:

```text
API logs
GET /health
GET /ready
GET /metrics
Swagger
```

Optional:

```text
Prometheus → query metrics
Grafana → inspect dashboards
```

---

# 91. Environment Configuration

Observability configuration should be environment-driven.

Examples:

```text
LOG_LEVEL
LOG_PRETTY
METRICS_ENABLED
METRICS_PATH
TRACING_ENABLED
OTEL_EXPORTER_OTLP_ENDPOINT
OTEL_SERVICE_NAME
TRACE_SAMPLE_RATE
SENTRY_ENABLED
```

Only include variables actually supported by the application.

Never enable production debugging accidentally.

---

# 92. Configuration Validation

Startup validation should verify observability settings.

Examples:

```text
TRACE_SAMPLE_RATE ∈ [0,1]
LOG_LEVEL is valid
OTLP endpoint is valid when tracing is enabled
metrics configuration is internally consistent
```

---

# 93. Service Metadata

Telemetry should identify:

```text
service.name
service.version
deployment.environment
service.instance.id
git.commit
```

Recommended:

```text
api
admin
worker
```

as separate service identities.

---

# 94. Monorepo Observability

The monorepo should not make every package responsible for telemetry.

Recommended ownership:

```text
apps/api
    request telemetry
    API metrics
    tracing

apps/admin
    browser errors
    frontend performance

workers
    queue/job telemetry

packages/api-contracts
    no runtime telemetry
```

Shared packages should remain lightweight.

---

# 95. API Layer Responsibilities

Routes should emit or expose context for:

```text
HTTP metrics
request IDs
trace context
status codes
latency
```

Business services should emit meaningful domain events when necessary.

Repositories should not independently create noisy application logs for every successful query.

---

# 96. Service Layer Responsibilities

Services/orchestrators may emit events such as:

```text
user.created
order.completed
permission.changed
```

Only emit domain-level events when they provide operational or business value.

---

# 97. Repository Layer Responsibilities

Repositories should generally:

```text
return data
throw typed/domain-appropriate errors
expose query timing through instrumentation
```

Avoid:

```text
console.log("querying user")
console.log("query complete")
```

throughout the codebase.

---

# 98. Background Worker Responsibilities

Workers should record:

```text
job received
job started
job completed
job failed
job retried
job abandoned
```

Include:

```text
queue
jobType
duration
attempt
```

Never log complete job payloads if they contain sensitive information.

---

# 99. External Service Instrumentation

Wrap external calls with consistent instrumentation.

Conceptual:

```text
external.call
├── service
├── operation
├── duration
├── status
├── timeout
└── retry
```

This should integrate with tracing when available.

---

# 100. Retries and Observability

Retries can hide failures.

Always monitor:

```text
initial failure
retry count
final outcome
```

Example:

```text
payment.authorize
  attempt 1 → timeout
  attempt 2 → timeout
  attempt 3 → success
```

The final success should not erase the fact that the dependency is unhealthy.

---

# 101. Rate Limiting Metrics

Track:

```text
rate_limit_allowed_total
rate_limit_blocked_total
```

Bound labels by:

```text
route
rule
status
```

Avoid labeling metrics by IP address or user ID.

---

# 102. Cache Metrics

When caching is introduced:

```text
cache_hits_total
cache_misses_total
cache_errors_total
cache_operation_duration
```

Track hit ratio:

```text
hits / (hits + misses)
```

---

# 103. Redis Metrics

If Redis is introduced, monitor:

```text
availability
command latency
memory
connections
evictions
errors
queue health
```

Redis should not become an invisible dependency.

---

# 104. PostgreSQL Backup Observability

Backup systems need telemetry too.

Track:

```text
backup success
backup failure
backup duration
backup age
backup size
restore test success
```

A backup that has never been restored successfully should not be considered fully trustworthy.

---

# 105. Disaster Recovery Metrics

Track:

```text
last successful backup
last successful restore test
RPO
RTO
```

The roadmap should include periodic recovery testing.

---

# 106. Kubernetes Observability

When Kubernetes is used, monitor:

```text
pod availability
restart count
CPU
memory
readiness
liveness
deployment status
HPA activity
```

Important distinction:

```text
liveness failure → restart
readiness failure → remove from traffic
```

Do not configure probes so aggressively that temporary dependency issues cause restart storms.

---

# 107. Container Observability

Monitor:

```text
CPU throttling
memory limit
OOM kills
restart count
filesystem usage
network
```

A container hitting its memory limit is an operational signal even if application logs look normal.

---

# 108. Observability and Security

Telemetry is part of the security boundary.

Protect:

```text
Grafana
Prometheus
log search
trace backend
audit logs
metrics endpoints
```

Do not expose internal observability systems publicly without strong access controls.

---

# 109. `/metrics` Security

If `/metrics` is publicly reachable, it can expose operational information.

Preferred production options:

```text
private network
service-to-service access
network policy
authentication where appropriate
```

Do not expose sensitive application data through custom metrics.

---

# 110. Observability Access Roles

Recommended:

```text
Developer
    application logs
    limited dashboards

Operator
    infrastructure
    logs
    dashboards
    alerts

Security
    security telemetry
    audit logs

Administrator
    broad operational access
```

Least privilege applies to observability systems too.

---

# 111. Cost Control

Telemetry can become expensive.

Control cost through:

```text
sampling
aggregation
retention
cardinality limits
log levels
payload filtering
```

The highest-cost telemetry should provide the highest operational value.

---

# 112. Common Anti-Patterns

## Anti-pattern 1: Logging everything

Result:

```text
too much noise
higher cost
harder debugging
```

---

## Anti-pattern 2: Logging secrets

Result:

```text
security incident
credential exposure
compliance risk
```

---

## Anti-pattern 3: User IDs as metric labels

Result:

```text
metric cardinality explosion
```

---

## Anti-pattern 4: Only monitoring uptime

A service can be:

```text
UP
```

while returning:

```text
90% 500s
```

Availability checks alone are insufficient.

---

## Anti-pattern 5: Average latency only

Averages hide tail latency.

Use:

```text
p50
p95
p99
```

---

## Anti-pattern 6: No deployment correlation

Without version metadata, it is harder to answer:

> "What changed?"

---

## Anti-pattern 7: Alerts without runbooks

Alerts without response instructions create operational confusion.

---

## Anti-pattern 8: Treating logs as audit logs

Operational logs are not automatically a durable audit trail.

---

# 113. Initial Implementation Priority

## P0 — Required

Implement:

```text
Pino structured logging
request IDs
error logging
secret redaction
/health
/ready
/metrics
HTTP request metrics
basic Grafana dashboards
deployment version metadata
```

---

## P1 — High Value

Implement:

```text
database metrics
authentication metrics
RBAC denial metrics
slow query detection
runtime metrics
alerting
runbooks
```

---

## P2 — Scale / Distributed Systems

Implement:

```text
OpenTelemetry
distributed tracing
trace/log correlation
worker metrics
external dependency metrics
Redis metrics
centralized logs
```

---

## P3 — Advanced

Implement:

```text
SLOs
error budgets
advanced frontend telemetry
continuous profiling
capacity forecasting
automated anomaly detection
```

---

# 114. Suggested Implementation Phases

## Phase 1 — Logging Foundation

Deliver:

- Pino configuration
- JSON production logs
- development pretty logs
- request ID
- structured request completion events
- error serialization
- secret redaction

Definition of Done:

```text
Every production request is diagnosable through structured logs.
No authentication secrets appear in logs.
```

---

## Phase 2 — Metrics

Deliver:

- `/metrics`
- HTTP counters
- HTTP duration histogram
- active request gauge
- runtime metrics
- authentication metrics

Definition of Done:

```text
Traffic, failures, and latency are visible without reading raw logs.
```

---

## Phase 3 — Dashboards

Deliver:

- API Overview
- Endpoint Performance
- Runtime
- Authentication
- Database

Definition of Done:

```text
An engineer can determine service health from dashboards within minutes.
```

---

## Phase 4 — Alerts

Deliver:

- API unavailable
- API 5xx
- API latency
- database unavailable
- resource saturation

Definition of Done:

```text
Critical failure conditions produce actionable alerts.
```

---

## Phase 5 — Database and Dependencies

Deliver:

- DB metrics
- slow query diagnostics
- connection pool metrics
- external service metrics

Definition of Done:

```text
The team can distinguish application failure from dependency failure.
```

---

## Phase 6 — Distributed Tracing

Deliver:

- OpenTelemetry SDK
- Fastify instrumentation
- database instrumentation
- external service spans
- trace/log correlation

Definition of Done:

```text
A slow request can be followed across major system boundaries.
```

---

## Phase 7 — Workers

Deliver:

- queue metrics
- job metrics
- worker health
- retry/stall monitoring
- queue dashboards

Definition of Done:

```text
Background processing is operationally visible.
```

---

## Phase 8 — SLOs and Reliability

Deliver:

- SLIs
- SLOs
- error budgets
- reliability dashboards
- incident review process

Definition of Done:

```text
Reliability is managed quantitatively rather than by intuition alone.
```

---

# 115. Recommended Metric Inventory

Initial application metrics:

```text
http_requests_total
http_request_duration_seconds
http_requests_in_flight

auth_login_attempts_total
auth_login_failures_total
auth_refresh_attempts_total
auth_refresh_failures_total
auth_refresh_reuse_detected_total

authorization_denied_total

database_operations_total
database_operation_duration_seconds
database_operation_errors_total
database_pool_usage

process_cpu
process_memory
process_heap
process_event_loop_delay
process_uptime

external_requests_total
external_request_duration_seconds
external_request_errors_total
external_request_timeouts_total
```

Exact names may be adapted to the chosen instrumentation library and conventions.

---

# 116. Recommended Event Inventory

Application events:

```text
application.starting
application.started
application.shutdown_requested
application.stopped

request.completed
request.failed

auth.login.success
auth.login.failed
auth.logout
auth.refresh.success
auth.refresh.failed
auth.refresh.reuse_detected

authorization.denied

database.query.slow
database.operation.failed

external.request.failed
external.request.timeout
external.circuit_opened

job.started
job.completed
job.failed
job.retried
job.stalled

deployment.started
deployment.completed
deployment.failed
```

---

# 117. Observability Naming Conventions

Use consistent names.

### Events

```text
<domain>.<action>.<result>
```

Examples:

```text
auth.login.failed
job.completed
database.query.slow
```

### Metrics

Prefer:

```text
<subject>_<action>_<unit>
```

Examples:

```text
http_requests_total
http_request_duration_seconds
```

### Logs

Use:

```text
event
```

as the primary semantic identifier.

---

# 118. Observability Code Organization

Suggested API structure:

```text
apps/api/src/
├── config/
├── plugins/
│   ├── logger.ts
│   ├── request-context.ts
│   ├── metrics.ts
│   └── tracing.ts
├── observability/
│   ├── events/
│   ├── metrics/
│   ├── tracing/
│   ├── redaction/
│   └── health/
├── modules/
└── server.ts
```

Keep telemetry infrastructure separate from business logic where possible.

---

# 119. Observability Utility Design

Avoid scattered:

```text
console.log(...)
```

Instead:

```text
request.log.info(...)
```

or an application logger abstraction where appropriate.

Avoid building a giant custom telemetry framework.

Use mature libraries for:

```text
logging
metrics
OpenTelemetry
```

and keep project-specific code focused on conventions.

---

# 120. Golden Orchestrator Observability

The Golden Orchestrator pattern should produce useful spans/logs around major workflow boundaries.

Example:

```text
workflow.order.create
    │
    ├── validate
    ├── authorize
    ├── persist
    ├── external call
    └── publish event
```

Do not create dozens of telemetry events for trivial internal function calls.

Instrument meaningful operations.

---

# 121. Admin Frontend Observability Architecture

Suggested:

```text
apps/admin/src/
├── lib/
│   ├── api/
│   ├── telemetry/
│   └── errors/
├── components/
├── routes/
└── features/
```

Telemetry should integrate with:

```text
API request client
global error boundary
authentication state
routing
```

---

# 122. Admin Error Boundary

The React application should have a top-level error boundary.

When an unexpected rendering error occurs:

```text
capture safe diagnostic information
generate/display support reference
show recovery UI
```

Do not show raw exception details to end users.

---

# 123. API Client Observability

The typed API client should preserve:

```text
request ID
status
safe error code
latency
```

For failures, it should expose enough context for UI error handling without leaking server internals.

---

# 124. Frontend Release Correlation

Admin telemetry should include:

```text
admin version
commit SHA
environment
route
```

This allows:

```text
Admin release 1.4.0
        ↓
API errors increase
        ↓
specific route affected
```

---

# 125. Observability Documentation

Maintain:

```text
docs/
├── observability/
│   ├── dashboards.md
│   ├── metrics.md
│   ├── logging.md
│   ├── tracing.md
│   └── alerts.md
└── runbooks/
```

This file defines architecture; detailed operational procedures can live in dedicated runbooks.

---

# 126. Definition of Done

Observability is considered production-ready when:

### Logging

- [ ] Production logs are structured JSON.
- [ ] Request IDs are present.
- [ ] Errors are structured.
- [ ] Secrets are redacted.
- [ ] Log levels are consistent.
- [ ] Sensitive data policy is documented.

### Metrics

- [ ] `/metrics` is available internally.
- [ ] Request rate is measurable.
- [ ] Error rate is measurable.
- [ ] p50/p95/p99 latency is measurable.
- [ ] Runtime health is measurable.
- [ ] Database health is measurable.

### Health

- [ ] `/health` represents process liveness.
- [ ] `/ready` represents traffic readiness.
- [ ] Health endpoints do not leak secrets.

### Dashboards

- [ ] API dashboard exists.
- [ ] Database dashboard exists.
- [ ] Runtime dashboard exists.
- [ ] Authentication/security dashboard exists.
- [ ] Worker dashboard exists once workers are deployed.

### Alerts

- [ ] Critical availability alert exists.
- [ ] 5xx alert exists.
- [ ] latency alert exists.
- [ ] database failure alert exists.
- [ ] resource saturation alerts exist.
- [ ] critical alerts have runbooks.

### Tracing

- [ ] Trace context propagates.
- [ ] Important dependencies are instrumented.
- [ ] Trace IDs correlate with logs.
- [ ] Sampling is configured.

### Security

- [ ] Telemetry systems are access-controlled.
- [ ] `/metrics` is not unintentionally public.
- [ ] Sensitive fields are redacted.
- [ ] Audit logs are separate from application logs.
- [ ] Retention policies exist.

---

# 127. Recommended Final Architecture

The target architecture is:

```text
                           USERS
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
        Admin Frontend                 API Clients
              │                             │
              └──────────────┬──────────────┘
                             ▼
                     ┌───────────────┐
                     │ Fastify API   │
                     ├───────────────┤
                     │ Request ID    │
                     │ Pino          │
                     │ Metrics       │
                     │ OpenTelemetry │
                     └───────┬───────┘
                             │
             ┌───────────────┼────────────────┐
             ▼               ▼                ▼
        PostgreSQL         Redis           External APIs
             │               │                │
             └───────────────┼────────────────┘
                             ▼
                       Background Jobs

Telemetry:
────────────────────────────────────────────────────────

 Pino logs ────────────────► Log storage
 Prometheus metrics ───────► Prometheus
 OpenTelemetry traces ─────► Trace backend
 Frontend errors ──────────► Error tracking

                         ↓
                 ┌───────────────┐
                 │    Grafana    │
                 ├───────────────┤
                 │ Dashboards    │
                 │ Exploration   │
                 │ Alerts        │
                 └───────────────┘
                         │
                         ▼
                    On-call team
```

---

# 128. Implementation Order

The recommended order for Fastify-MasterApp is:

```text
1. Structured Pino logging
        ↓
2. Request ID / correlation
        ↓
3. Secret redaction
        ↓
4. Health/readiness
        ↓
5. Prometheus HTTP metrics
        ↓
6. Runtime metrics
        ↓
7. Grafana API dashboard
        ↓
8. Database metrics
        ↓
9. Security/auth metrics
        ↓
10. Alerts + runbooks
        ↓
11. Worker metrics
        ↓
12. External dependency metrics
        ↓
13. OpenTelemetry tracing
        ↓
14. Frontend telemetry
        ↓
15. SLOs + error budgets
        ↓
16. Advanced profiling/capacity planning
```

---

# 129. What Not to Build First

Do not begin with:

```text
full distributed tracing
custom telemetry platform
complex anomaly detection
large log warehouse
continuous profiling
dozens of dashboards
hundreds of alerts
```

First establish:

```text
logs
metrics
health
correlation
basic dashboards
actionable alerts
```

Then add complexity when production behavior demonstrates the need.

---

# 130. Relationship to Other Architecture Documents

Observability depends on and supports several project documents.

### `API_CONVENTIONS.md`

Defines:

```text
request IDs
errors
HTTP behavior
API responses
```

Observability measures those behaviors.

### `SECURITY.md`

Defines:

```text
security events
redaction
audit requirements
authentication
authorization
```

Observability exposes security signals without leaking secrets.

### `RBAC.md`

Defines:

```text
roles
permissions
authorization decisions
```

Observability measures authorization failures and important privilege changes.

### `ADMIN_FRONTEND.md`

Defines:

```text
Admin UI
API client
error handling
RBAC UI
```

Observability provides frontend diagnostics and API correlation.

### `ROADMAP.md`

Defines implementation sequencing.

Observability should evolve along with:

```text
authentication
RBAC
Redis
workers
deployment
scaling
```

---

# 131. Final Principle

The goal is not to collect the maximum amount of telemetry.

The goal is to make important failures answerable.

For every production incident, the system should increasingly make it possible to answer:

```text
What failed?
When did it fail?
Who was affected?
Which request caused it?
Which endpoint was involved?
Which service/dependency was involved?
How slow was it?
What changed?
Is the problem still happening?
What should we do next?
```

The observability strategy for Fastify-MasterApp should therefore follow:

```text
VISIBLE
   ↓
CORRELATED
   ↓
MEASURABLE
   ↓
ACTIONABLE
   ↓
RELIABLE
```

Build observability incrementally, keep telemetry secure, keep cardinality bounded, and prioritize signals that shorten incident detection and resolution time.
