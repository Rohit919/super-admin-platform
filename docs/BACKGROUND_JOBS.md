# BACKGROUND_JOBS.md

## Fastify-MasterApp — Background Jobs, Workers, Queues & Async Processing

> Production-grade guidance for introducing reliable asynchronous work into Fastify-MasterApp without turning the application into an unnecessarily complex distributed system.

---

## Table of Contents

1. [Purpose](#purpose)
2. [Core Principles](#core-principles)
3. [When to Use a Background Job](#when-to-use-a-background-job)
4. [When Not to Use a Background Job](#when-not-to-use-a-background-job)
5. [Target Architecture](#target-architecture)
6. [Job Lifecycle](#job-lifecycle)
7. [Queue Architecture](#queue-architecture)
8. [Recommended Technology](#recommended-technology)
9. [Repository Structure](#repository-structure)
10. [Job Contracts](#job-contracts)
11. [Job Producers](#job-producers)
12. [Worker Consumers](#worker-consumers)
13. [Idempotency](#idempotency)
14. [Retries and Backoff](#retries-and-backoff)
15. [Dead-Letter Handling](#dead-letter-handling)
16. [Failure Classification](#failure-classification)
17. [Concurrency](#concurrency)
18. [Ordering](#ordering)
19. [Priority](#priority)
20. [Delayed and Scheduled Jobs](#delayed-and-scheduled-jobs)
21. [Job Deduplication](#job-deduplication)
22. [Transactions and Database Consistency](#transactions-and-database-consistency)
23. [Outbox Pattern](#outbox-pattern)
24. [External APIs](#external-apis)
25. [Email Jobs](#email-jobs)
26. [Notifications](#notifications)
27. [File Processing](#file-processing)
28. [Report Generation](#report-generation)
29. [Data Imports and Exports](#data-imports-and-exports)
30. [Admin Operations](#admin-operations)
31. [Authentication-Related Jobs](#authentication-related-jobs)
32. [Audit Events](#audit-events)
33. [Redis Architecture](#redis-architecture)
34. [Worker Deployment](#worker-deployment)
35. [Graceful Shutdown](#graceful-shutdown)
36. [Health and Readiness](#health-and-readiness)
37. [Observability](#observability)
38. [Metrics](#metrics)
39. [Logging](#logging)
40. [Tracing](#tracing)
41. [Security](#security)
42. [Secrets](#secrets)
43. [Payload Design](#payload-design)
44. [Data Retention](#data-retention)
45. [Operational Controls](#operational-controls)
46. [Testing Strategy](#testing-strategy)
47. [Local Development](#local-development)
48. [Docker](#docker)
49. [CI/CD](#cicd)
50. [Production Deployment](#production-deployment)
51. [Scaling](#scaling)
52. [Performance](#performance)
53. [Troubleshooting](#troubleshooting)
54. [Common Anti-Patterns](#common-anti-patterns)
55. [Implementation Roadmap](#implementation-roadmap)
56. [Definition of Done](#definition-of-done)
57. [Operational Checklist](#operational-checklist)
58. [Golden Rules](#golden-rules)

---

# Purpose

Background jobs allow Fastify-MasterApp to move slow, expensive, failure-prone, or independently retryable work outside the HTTP request lifecycle.

The API should respond quickly when the user's request does not require the work to finish before a response can be returned.

Examples:

- sending email
- sending notifications
- generating reports
- processing uploaded files
- importing large datasets
- exporting large datasets
- synchronizing external systems
- refreshing derived data
- cleanup
- scheduled maintenance
- webhook delivery
- long-running administrative operations

The target architecture is a **modular monolith with independently deployable worker processes**.

The application does not need to become a collection of microservices merely because it has asynchronous work.

---

# Core Principles

## 1. HTTP should stay fast

Do not make users wait for work that can safely happen asynchronously.

Bad:

```text
POST /reports
    |
    +-- generate 200 MB report
    +-- upload report
    +-- send email
    |
    +-- response after 90 seconds
```

Better:

```text
POST /reports
    |
    +-- create report record
    +-- enqueue job
    |
    +-- 202 Accepted
```

Then:

```text
Worker
    |
    +-- generate report
    +-- upload/store report
    +-- update report status
    +-- notify user
```

---

## 2. Jobs must be safe to retry

A worker can crash after completing an external operation but before recording success.

Therefore:

> Assume every job can execute more than once.

Exactly-once execution should not be assumed.

Design for:

- at-least-once delivery
- idempotent processing
- safe retries
- deduplication where useful

---

## 3. The queue is not the source of truth

A queue should coordinate work.

Business state should remain in PostgreSQL.

For example:

```text
PostgreSQL
    Report.status = "PROCESSING"

Queue
    generate-report job
```

The queue should not be the only place where report state exists.

---

## 4. Keep job payloads small

Prefer IDs over large objects.

Good:

```json
{
  "reportId": "report_123"
}
```

Avoid:

```json
{
  "report": {
    "hundredsOfFields": "...",
    "largeDataSet": "..."
  }
}
```

Large payloads increase:

- Redis memory
- serialization cost
- network traffic
- retry cost
- operational complexity

---

## 5. Separate business logic from job transport

A worker should not contain the entire business domain.

Prefer:

```text
Worker
  ↓
Job Handler
  ↓
Service / Orchestrator
  ↓
Repository
  ↓
Prisma
```

The same service can then be used from:

- HTTP routes
- jobs
- CLI commands
- tests

---

# When to Use a Background Job

Use asynchronous processing when one or more of these are true.

## Slow

The work can take more than a normal API request should reasonably take.

Examples:

- PDF generation
- CSV export
- image processing
- large imports

## Retryable

Temporary failures should be retried.

Examples:

- email provider unavailable
- third-party API timeout
- transient database connection problem

## Independent

The request does not need the final result immediately.

Example:

```text
Create account
    |
    +-- return account
    |
    +-- send welcome email asynchronously
```

## Bursty

Work arrives in spikes.

Queues absorb bursts and allow workers to process at a controlled rate.

## Scheduled

Work should happen later.

Examples:

- cleanup expired records
- daily reports
- subscription reminders
- periodic synchronization

---

# When Not to Use a Background Job

Do not enqueue work merely because queues exist.

Keep work synchronous when:

- the API response depends on the result
- the operation is extremely fast
- consistency requires immediate completion
- adding a queue would make the operation harder to reason about
- the operation has no retry value
- operational complexity outweighs the benefit

Example:

```text
GET /users/me
```

Reading the current user from PostgreSQL should remain synchronous.

---

# Target Architecture

Recommended production topology:

```text
                       ┌──────────────────┐
                       │     Admin SPA    │
                       └────────┬─────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Load Balancer  │
                       └────────┬─────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
        ┌───────────────┐               ┌───────────────┐
        │   API Pod 1   │               │   API Pod N   │
        └───────┬───────┘               └───────┬───────┘
                │                               │
                └───────────────┬───────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   PostgreSQL     │
                       └──────────────────┘

                API
                 │
                 ▼
          ┌───────────────┐
          │ Redis / Queue │
          └───────┬───────┘
                  │
          ┌───────┴────────┐
          │                │
          ▼                ▼
   ┌──────────────┐ ┌──────────────┐
   │ Worker Pool  │ │ Worker Pool  │
   │    Email     │ │   Reports    │
   └──────────────┘ └──────────────┘
```

The API and workers can share:

- TypeScript types
- contracts
- services
- repositories
- configuration
- logging utilities
- observability utilities

They should differ primarily in their runtime entry points.

---

# Job Lifecycle

A normal job lifecycle:

```text
Created
  ↓
Queued
  ↓
Waiting
  ↓
Active
  ↓
Succeeded
```

Failure path:

```text
Active
  ↓
Failed
  ↓
Retry scheduled
  ↓
Active
  ↓
...
  ↓
Dead Letter / Failed permanently
```

Application-level state should usually be represented independently:

```text
PENDING
PROCESSING
COMPLETED
FAILED
CANCELLED
```

Do not expose queue-internal states directly as your business API contract unless there is a deliberate reason.

---

# Queue Architecture

Recommended conceptual queues:

```text
email
notifications
reports
imports
exports
webhooks
maintenance
```

Do not create a queue for every tiny function.

Queue boundaries should represent meaningful operational characteristics.

For example:

```text
email
```

may require:

- low concurrency
- provider rate limits
- retry/backoff

while:

```text
reports
```

may require:

- high CPU
- low concurrency
- longer job timeout

Different workloads deserve different worker policies.

---

# Recommended Technology

For the planned Fastify-MasterApp architecture:

- Redis for queue infrastructure
- BullMQ for queue/worker orchestration
- PostgreSQL for durable business state
- Prisma for database access
- Pino for structured logs
- Prometheus for metrics
- Grafana for dashboards

BullMQ should be introduced only after the application has a genuine asynchronous workload.

Do not introduce Redis merely because it is popular.

---

# Repository Structure

Recommended structure:

```text
apps/
  api/
    src/
      jobs/
        producers/
        handlers/
        queues/
        workers/
        scheduler/
        types/
      modules/
        users/
        reports/
        notifications/

packages/
  api-contracts/
  config/
  shared/
```

A more detailed example:

```text
apps/api/src/jobs/

queues/
  email.queue.ts
  report.queue.ts
  webhook.queue.ts

producers/
  enqueue-email.ts
  enqueue-report.ts
  enqueue-webhook.ts

handlers/
  send-email.handler.ts
  generate-report.handler.ts
  deliver-webhook.handler.ts

workers/
  email.worker.ts
  report.worker.ts
  webhook.worker.ts

types/
  email-job.ts
  report-job.ts
  webhook-job.ts
```

For larger deployments, workers can have their own application entry point:

```text
apps/
  api/
  worker/
  admin/
```

The business modules can still be shared.

---

# Job Contracts

Every job should have an explicit contract.

Example:

```ts
export interface GenerateReportJob {
  reportId: string;
  requestedByUserId: string;
}
```

Avoid:

```ts
any;
```

Avoid undocumented payloads.

A job contract should define:

- job name
- payload
- version if necessary
- required identifiers
- optional parameters
- retry expectations
- timeout expectations

Example:

```text
Job:
generate-report

Payload:
{
  reportId: string
  requestedByUserId: string
}

Expected:
- report exists
- requester is authorized
- report is not already completed

Retry:
3 attempts

Backoff:
exponential

Timeout:
10 minutes
```

---

# Job Versioning

Jobs can remain in queues while application code is deployed.

Therefore a new application version may receive an old payload.

Avoid breaking job contracts casually.

Bad:

```ts
{
  userId: string;
}
```

changed to:

```ts
{
  accountId: string;
}
```

without compatibility planning.

Safer:

```ts
{
  version: 2,
  accountId: string
}
```

For important jobs, include an explicit version:

```json
{
  "version": 1,
  "reportId": "report_123"
}
```

---

# Job Producers

Producers create queue jobs.

Example flow:

```text
HTTP route
    ↓
Service
    ↓
Database transaction
    ↓
Enqueue job
```

The producer should not contain worker logic.

Example:

```ts
await reportQueue.add(
  "generate-report",
  {
    reportId,
    requestedByUserId,
  },
  {
    jobId: `report:${reportId}`,
  },
);
```

The exact queue options should be centralized rather than duplicated across routes.

---

# Worker Consumers

Workers consume jobs and invoke application services.

Conceptually:

```ts
const worker = new Worker("reports", async (job) => {
  return reportService.generate(job.data.reportId);
});
```

The worker should:

1. validate job payload
2. load durable state
3. check authorization/business invariants as appropriate
4. perform the operation
5. update durable state
6. emit useful logs/metrics
7. throw only when a retry is appropriate

---

# Idempotency

Idempotency is one of the most important requirements for background jobs.

Suppose:

```text
Job starts
    ↓
Email sent
    ↓
Worker crashes
    ↓
Job retried
    ↓
Email sent again
```

A retry can create duplicate side effects.

Solutions depend on the operation.

## Database state check

Before processing:

```text
if report.status == COMPLETED:
    return
```

## Idempotency key

Store a durable operation key:

```text
operation:
  key = report:123:generate
  status = completed
```

## Unique database constraint

For operations that should exist only once:

```text
UNIQUE(report_id, operation_type)
```

## Provider-supported idempotency

If an external API supports idempotency keys, use them.

---

# Idempotency Rule

Every job handler should answer:

> What happens if this exact job executes twice?

If the answer is unclear, the job is not production-ready.

---

# Retries and Backoff

Retries should be intentional.

Typical retryable errors:

- timeout
- temporary network error
- HTTP 429
- HTTP 502
- HTTP 503
- temporary database connectivity issue

Usually non-retryable:

- invalid payload
- missing required business record
- authorization failure
- malformed data
- unsupported operation
- permanent provider rejection

Use exponential backoff where appropriate:

```text
Attempt 1 → immediate
Attempt 2 → short delay
Attempt 3 → longer delay
Attempt 4 → longer delay
```

Add jitter where many workers could otherwise retry simultaneously.

---

# Retry Limits

Do not retry forever.

Example policy:

```text
Email:
  attempts = 5

Webhook:
  attempts = 8

Report:
  attempts = 2

Maintenance:
  attempts = 3
```

The correct number depends on the workload.

Retries should consider:

- failure type
- business value
- provider behavior
- job duration
- operational cost

---

# Dead-Letter Handling

After retries are exhausted, a job should become visible as permanently failed.

Conceptually:

```text
Queue
  ↓
Retry
  ↓
Retry
  ↓
Retry
  ↓
Failed
  ↓
Dead Letter
```

Dead-letter handling should provide:

- job ID
- job name
- payload reference
- failure reason
- attempt count
- first failure time
- last failure time
- stack/error information
- correlation/request ID if available

Do not silently discard permanently failed jobs.

---

# Failure Classification

Use explicit failure categories.

```ts
type JobFailureCategory =
  | "TRANSIENT"
  | "PERMANENT"
  | "VALIDATION"
  | "AUTHORIZATION"
  | "DEPENDENCY"
  | "UNKNOWN";
```

The worker can then decide:

```text
TRANSIENT
  → retry

DEPENDENCY
  → retry

VALIDATION
  → fail permanently

AUTHORIZATION
  → fail permanently

PERMANENT
  → dead letter
```

---

# Concurrency

Concurrency controls how many jobs a worker processes simultaneously.

Example:

```text
Email worker:
concurrency = 10

Report worker:
concurrency = 2

CPU-heavy worker:
concurrency = 1
```

Higher concurrency is not always faster.

Watch:

- CPU
- memory
- PostgreSQL connections
- Redis load
- external provider rate limits

---

# Database Connection Limits

A worker pool can accidentally exhaust PostgreSQL connections.

For example:

```text
10 worker replicas
×
20 concurrent jobs
=
potentially 200 concurrent DB operations
```

This must be considered alongside API traffic.

Control:

- worker concurrency
- replica count
- Prisma connection pool size
- transaction duration

---

# Ordering

Do not assume queue order is equivalent to business correctness.

If order matters, encode that requirement explicitly.

Example:

```text
Order created
Order paid
Order shipped
```

A worker processing `shipped` before `paid` could be invalid.

Use durable state validation:

```text
if order.status !== "PAID":
    reject/defer shipment
```

Do not rely only on arrival order.

---

# Priority

Priority should be used sparingly.

Possible examples:

```text
High:
password/security notifications

Normal:
welcome emails

Low:
analytics exports
```

Do not allow Admin users to arbitrarily assign extreme priorities unless this is a deliberate feature.

Priority systems can create starvation if misconfigured.

---

# Delayed and Scheduled Jobs

Useful for:

- reminders
- retry windows
- cleanup
- scheduled reports
- deferred notifications

Examples:

```text
Password reset cleanup
    → delayed cleanup

Subscription reminder
    → scheduled job

Daily metrics aggregation
    → scheduled job
```

For recurring jobs:

- make the job idempotent
- prevent duplicate schedulers
- monitor scheduler health
- ensure timezone behavior is explicit

---

# Timezones

Never leave scheduled business operations ambiguous.

Bad:

```text
send reminder at 9
```

Good:

```text
09:00
America/Los_Angeles
```

For user-specific scheduling, store an IANA timezone when required:

```text
America/Los_Angeles
Asia/Kolkata
Europe/London
```

Do not rely on server-local timezone.

---

# Job Deduplication

Deduplicate jobs when duplicate enqueue operations are common.

Example:

```text
report:123:generate
```

could be used as a deterministic job ID.

Potential rule:

```text
One active generation job per report.
```

Deduplication should complement idempotency, not replace it.

Even with deduplication:

> Assume duplicate execution is possible.

---

# Transactions and Database Consistency

One of the hardest problems is:

```text
Database update
+
Queue enqueue
```

These are two separate systems.

Example:

```text
BEGIN
  create order
COMMIT

enqueue order-created job
```

If the process crashes between `COMMIT` and `enqueue`, the database says the order exists but the job does not.

The reverse problem is also possible.

This is why important workflows should consider the outbox pattern.

---

# Outbox Pattern

The outbox pattern stores an event/job intent inside PostgreSQL in the same transaction as the business change.

Example:

```text
BEGIN

  INSERT order

  INSERT outbox_event
    type = "ORDER_CREATED"
    aggregate_id = order.id

COMMIT
```

Then a dispatcher publishes the outbox event:

```text
PostgreSQL outbox
      ↓
Dispatcher
      ↓
Redis/BullMQ
      ↓
Worker
```

This creates much stronger consistency guarantees.

---

# Outbox Table

Conceptual structure:

```text
OutboxEvent
-----------
id
eventType
aggregateType
aggregateId
payload
status
attempts
availableAt
processedAt
createdAt
lastError
```

Possible statuses:

```text
PENDING
PROCESSING
PUBLISHED
FAILED
```

Use indexes for:

```text
status
availableAt
createdAt
```

depending on the dispatcher query pattern.

---

# Outbox vs Direct Queue

Use direct queue publishing for low-risk operations where occasional missed work can be recovered easily.

Use an outbox when:

- the event is business-critical
- the DB mutation and async work must remain consistent
- losing an event is unacceptable
- auditing/replay is important
- external side effects depend on the event

Do not implement an outbox for every small feature automatically.

---

# External APIs

External services are unreliable.

Worker code should handle:

```text
timeout
rate limit
temporary server failure
invalid credentials
permanent rejection
schema changes
partial success
```

Always set reasonable timeouts.

Never allow a worker to hang forever.

---

# External API Retry Policy

Example:

```text
429
  → retry with provider-aware delay

502/503
  → retry

timeout
  → retry

400 validation
  → permanent failure

401 credentials
  → alert + permanent/dependency failure
```

Be careful with non-idempotent APIs.

A network timeout does not prove that the external operation failed.

---

# Email Jobs

Email is a classic background workload.

Flow:

```text
Application
  ↓
Create email intent
  ↓
Queue
  ↓
Email worker
  ↓
Provider
  ↓
Record result
```

Email jobs should contain:

```text
template
recipient reference
template variables
correlation ID
```

Avoid putting sensitive data into queue payloads.

Prefer IDs and fetch required data when processing.

---

# Email Idempotency

Use a deterministic operation key when duplicate emails would be harmful.

Examples:

```text
welcome:user_123
password-reset:token_456
invoice:invoice_123
```

Be especially careful with:

- password reset emails
- payment emails
- billing notices
- account security notifications

---

# Notifications

Notifications may include:

- in-app
- email
- push
- SMS through an approved provider

Keep notification generation separate from delivery.

```text
Business event
   ↓
Notification service
   ↓
Queue
   ↓
Channel worker
```

This allows channel-specific retry and rate-limit policies.

---

# File Processing

Large file processing should usually happen asynchronously.

Example:

```text
Upload
  ↓
Store object
  ↓
Create file record
  ↓
Queue processing job
  ↓
Worker
  ↓
Validate
  ↓
Transform
  ↓
Persist result
```

Never put a large file itself into Redis.

Store it in durable object/file storage and pass:

```text
fileId
objectKey
```

to the worker.

---

# Report Generation

Recommended flow:

```text
POST /reports
  ↓
Create report record
  status = PENDING
  ↓
Queue report job
  ↓
202 Accepted

Worker
  ↓
status = PROCESSING
  ↓
Generate report
  ↓
Store result
  ↓
status = COMPLETED
```

On failure:

```text
status = FAILED
errorCode = REPORT_GENERATION_FAILED
```

The Admin UI can poll or subscribe to status.

---

# Data Imports

Imports should be treated as long-running jobs.

Example:

```text
Upload CSV
  ↓
Create import
  ↓
Queue import
  ↓
Worker
  ↓
Parse
  ↓
Validate
  ↓
Process batches
  ↓
Record progress
```

Store progress durably:

```text
totalRows
processedRows
successfulRows
failedRows
```

Do not rely on worker memory for progress.

---

# Batch Processing

Large imports should be processed in batches.

Example:

```text
100,000 rows

Batch 1: 1–1,000
Batch 2: 1,001–2,000
...
```

Benefits:

- lower memory use
- better retry behavior
- better progress tracking
- controlled DB load

Each batch should have clear idempotency semantics.

---

# Data Exports

Exports can follow:

```text
POST /exports
  ↓
Create export record
  ↓
Queue export
  ↓
Worker generates file
  ↓
Store file
  ↓
Mark complete
```

The Admin UI can show:

```text
Preparing...
Generating...
Ready
Failed
Expired
```

Generated files should have controlled retention.

---

# Admin Operations

Admin-triggered asynchronous actions should be auditable.

Example:

```text
Admin
  ↓
"Export users"
  ↓
POST /admin/exports
  ↓
Authorization
  ↓
Audit event
  ↓
Create export
  ↓
Queue job
```

The audit record should identify:

- actor
- action
- target
- timestamp
- request/correlation ID
- outcome where known

---

# Authentication-Related Jobs

Potential asynchronous authentication workloads:

- email verification
- password reset email
- suspicious-login notification
- session cleanup
- expired-token cleanup

Security-critical state changes should remain synchronous where necessary.

For example:

```text
Password change
```

should complete before the API reports success.

Sending a notification about that change can be asynchronous.

---

# Audit Events

Audit logging should not disappear because work is asynchronous.

For example:

```text
Admin starts export
    ↓
audit: EXPORT_STARTED

worker succeeds
    ↓
audit: EXPORT_COMPLETED
```

For critical operations, distinguish:

```text
requested
started
completed
failed
```

Do not claim an operation completed merely because a job was queued.

---

# Redis Architecture

Redis may serve several roles:

```text
Redis
 ├── BullMQ queues
 ├── job metadata
 ├── rate limiting
 └── optional caching
```

Keep these concerns logically separate.

A Redis outage should not accidentally corrupt PostgreSQL business state.

---

# Redis Durability

Understand what Redis is responsible for.

If Redis only contains ephemeral queues, recovery strategy differs from a system where Redis contains critical durable state.

For business-critical events:

```text
PostgreSQL
```

should remain the durable source of truth.

Redis should coordinate processing.

---

# Redis Failure

Plan for:

```text
Redis unavailable
```

Possible consequences:

- jobs cannot be enqueued
- workers cannot consume
- rate limiting may degrade
- cache misses increase

The API should fail predictably.

Do not silently tell users an operation was queued if queue submission failed.

---

# Queue Submission Failure

If an API creates business state but cannot enqueue a required job, choose a deliberate strategy.

Options:

### Outbox

Preferred for critical workflows.

### Transactional status

Store:

```text
status = QUEUE_PENDING
```

and let a recovery process enqueue it later.

### Synchronous fallback

Only for carefully selected non-critical workloads.

Never hide the failure.

---

# Worker Deployment

Workers should run as separate processes from the HTTP server.

Recommended:

```text
API deployment
Worker deployment
```

This prevents CPU-heavy jobs from starving HTTP requests.

---

# Worker Runtime

Worker startup should perform:

1. configuration validation
2. Redis connection
3. database connection if needed
4. queue registration
5. metrics initialization
6. signal handling

Worker startup failure should be visible and should fail fast.

---

# Graceful Shutdown

Workers must stop accepting new jobs before shutdown.

Conceptually:

```text
SIGTERM
  ↓
stop accepting new jobs
  ↓
wait for active jobs
  ↓
close queue connections
  ↓
close Prisma
  ↓
exit
```

Do not abruptly terminate active jobs unless the platform forces termination.

Configure deployment termination windows accordingly.

---

# Job Timeouts

Every long-running job should have an expected upper bound.

Examples:

```text
email: 30 seconds
webhook: 60 seconds
report: 10 minutes
large import: 30 minutes
```

Timeouts should be based on workload reality.

A timeout should not automatically mean the external operation did not happen.

---

# Health and Readiness

Workers need operational health checks.

Useful signals:

```text
Redis connected
Database connected
Worker process alive
Queue polling active
No catastrophic error state
```

Readiness should indicate whether the worker can accept work.

Liveness should indicate whether the process itself is functioning.

---

# Observability

Every job should be observable.

Minimum fields:

```text
job.name
job.id
queue.name
attempt
worker.id
duration_ms
status
error.category
```

Where available:

```text
request.id
trace.id
user.id
```

Do not log secrets or sensitive payloads.

---

# Metrics

Recommended metrics:

```text
jobs_started_total
jobs_completed_total
jobs_failed_total
jobs_retried_total
jobs_dead_lettered_total
job_duration_seconds
job_queue_wait_seconds
jobs_active
jobs_waiting
```

Per queue:

```text
queue_depth
queue_oldest_job_age
worker_concurrency
worker_utilization
```

---

# Important Alerts

Alert on:

- sustained queue growth
- oldest job age above threshold
- high failure rate
- repeated dead-letter jobs
- worker count unexpectedly zero
- Redis unavailable
- database connection exhaustion
- unusually long processing times
- provider rate-limit spikes

A queue with thousands of waiting jobs is not necessarily healthy simply because workers are technically running.

---

# Logging

Use structured Pino logs.

Example conceptual event:

```json
{
  "level": "info",
  "event": "job.completed",
  "queue": "reports",
  "jobName": "generate-report",
  "jobId": "123",
  "durationMs": 4210
}
```

Do not log:

- passwords
- JWTs
- refresh tokens
- API keys
- complete authorization headers
- sensitive personal data
- large payloads

---

# Correlation IDs

When a request creates a job:

```text
HTTP request
  requestId = abc123
       ↓
queue job
  correlationId = abc123
```

This allows operators to connect:

```text
HTTP request
→ database mutation
→ queue
→ worker
→ external API
```

Use correlation IDs for troubleshooting, not as secrets.

---

# Tracing

If distributed tracing is introduced:

```text
HTTP span
  ↓
enqueue span
  ↓
worker span
  ↓
database span
  ↓
external API span
```

Be careful about propagating trace context through queue payloads.

Use tracing metadata rather than copying request data.

---

# Security

Background workers have significant privileges.

Treat workers as trusted application components.

Security requirements include:

- least privilege
- secure Redis access
- secure database credentials
- restricted network access
- validated job payloads
- no arbitrary code execution from payloads
- no unsafe shell execution
- no untrusted URLs without SSRF controls
- no secrets in logs
- authenticated external API clients

---

# Authorization

Do not assume that because a job is internal, every operation is authorized.

At enqueue time:

```text
Admin requests export
  ↓
authorize admin
  ↓
enqueue
```

At processing time, validate durable business state.

Do not blindly trust:

```text
requestedByUserId
```

from an old job.

The worker should enforce current business invariants.

---

# SSRF in Workers

Workers often call URLs supplied by data.

This creates SSRF risk.

Do not allow arbitrary internal URLs.

Validate:

- scheme
- hostname
- allowed domains
- private IP ranges
- redirect behavior
- DNS rebinding concerns
- timeout
- response size

Use allowlists where possible.

---

# Secrets

Never place secrets directly into job payloads.

Bad:

```json
{
  "apiKey": "secret-value"
}
```

Better:

```json
{
  "integrationId": "integration_123"
}
```

Worker loads credentials from secure configuration/storage.

---

# Payload Design

Good payload:

```json
{
  "version": 1,
  "userId": "user_123",
  "reportId": "report_456"
}
```

Bad payload:

```json
{
  "password": "...",
  "accessToken": "...",
  "entireUserObject": {},
  "entireDatabaseRecord": {}
}
```

Prefer stable identifiers.

---

# Data Retention

Queues and job metadata should not grow forever.

Define retention for:

- completed jobs
- failed jobs
- dead-letter jobs
- outbox records
- generated files
- temporary files

Example policy:

```text
Completed job metadata:
7 days

Failed jobs:
30 days

Dead-letter:
90 days

Generated exports:
24–72 hours
```

Actual retention should reflect operational and compliance requirements.

---

# Operational Controls

Production systems should support controlled operations such as:

```text
pause queue
resume queue
inspect queue
retry failed job
move job to dead letter
remove obsolete job
drain workers
```

These controls should require appropriate administrative privileges.

---

# Job Cancellation

Cancellation is harder than it looks.

A queued job can usually be removed before execution.

An active job may already be:

- executing SQL
- calling an external provider
- writing a file
- sending an email

Design cancellation as cooperative where possible.

Example:

```text
Job
  ↓
check cancellation state
  ↓
process batch
  ↓
check cancellation state
  ↓
process next batch
```

Do not claim cancellation guarantees if the underlying operation cannot be interrupted.

---

# Progress Tracking

For long-running jobs, store progress durably.

Example:

```text
status = PROCESSING
processed = 4500
total = 10000
percentage = 45
```

The Admin UI can then display:

```text
Importing users...
45%
```

Do not update progress on every single row if it creates excessive database writes.

Batch updates are usually better.

---

# Testing Strategy

Background jobs require several testing layers.

## Unit Tests

Test:

- payload validation
- business rules
- retry classification
- idempotency
- state transitions
- failure handling

## Integration Tests

Test:

```text
Producer
  ↓
Queue
  ↓
Worker
  ↓
Database
```

Use real PostgreSQL/Redis in appropriate integration environments.

## Contract Tests

Verify job payload compatibility.

## End-to-End Tests

Test user-visible workflows:

```text
Admin requests export
  ↓
API responds
  ↓
job processes
  ↓
export becomes available
```

## Failure Tests

Test:

- Redis outage
- database failure
- external provider timeout
- provider 500
- provider 429
- malformed payload
- worker crash
- duplicate execution
- retry exhaustion

---

# Testing Idempotency

A useful integration test:

```text
enqueue same job twice
        ↓
worker executes twice
        ↓
assert business side effect happened once
```

This is one of the highest-value background-job tests.

---

# Testing Retry Behavior

Test that:

```text
Transient error
    ↓
retry
```

and:

```text
Permanent error
    ↓
no unnecessary retry
```

Also verify:

```text
max attempts respected
```

and:

```text
dead-letter behavior
```

---

# Testing Shutdown

Integration tests should verify:

```text
worker receives SIGTERM
  ↓
active job completes
  ↓
new jobs are not accepted
  ↓
connections close
```

This is especially important during Kubernetes rolling deployments.

---

# Local Development

A simple local setup:

```text
PostgreSQL
Redis
API
Worker
Admin
```

Docker Compose can provide:

```text
postgres
redis
```

Run:

```text
API
Worker
Admin
```

locally with development scripts.

---

# Local Development Without Redis

If background processing is optional during early development, the application may support a development-only synchronous adapter.

Example:

```text
QUEUE_DRIVER=memory
```

or:

```text
QUEUE_DRIVER=sync
```

Do not use the synchronous adapter to represent production behavior.

It exists only to reduce local friction.

---

# Docker

Recommended container separation:

```text
Docker image
  ├── API command
  └── Worker command
```

The same image can often be reused with different entry commands.

Example:

```text
API:
node dist/apps/api/server.js

Worker:
node dist/apps/api/worker.js
```

This reduces image drift.

---

# Worker Container Security

Workers should:

- run as non-root
- use minimal images
- have read-only filesystem where practical
- avoid unnecessary Linux capabilities
- avoid privileged mode
- have bounded memory/CPU
- receive only required secrets

CPU-heavy workers may need different resource limits from API workers.

---

# CI/CD

CI should verify:

```text
lint
typecheck
unit tests
integration tests
contract tests
build
Docker build
security scanning
```

Worker-specific tests should run before production deployment.

---

# Migration Compatibility

Deploying new worker code can interact with old queued jobs.

Use backward-compatible migrations.

Safer sequence:

```text
1. Add new DB fields
2. Deploy compatible application
3. Deploy worker changes
4. Backfill
5. Remove old fields later
```

Avoid destructive migrations while old jobs may still exist.

---

# Production Deployment

A production release may contain:

```text
API version N
Worker version N
Admin version N
```

Coordinate changes carefully.

A worker can process jobs produced by an older API version.

Therefore:

> Queue compatibility is part of deployment compatibility.

---

# Rolling Deployments

During a rolling deployment:

```text
Old workers
    ↓
New workers
    ↓
Old jobs + new jobs
```

Both versions may temporarily coexist.

Job contracts must therefore be compatible.

---

# Worker Scaling

Workers can scale horizontally:

```text
worker-1
worker-2
worker-3
worker-4
```

Queue systems distribute work.

Scale based on:

- queue depth
- oldest job age
- processing latency
- CPU
- memory
- database pressure

Do not scale only on CPU.

A worker may be CPU-idle while waiting on a provider.

---

# Autoscaling

A useful signal is queue lag.

Example:

```text
queue depth ↑
oldest job age ↑
    ↓
worker replicas ↑
```

Scale down gradually.

Avoid aggressive oscillation:

```text
workers 2 → 20 → 2 → 20
```

Use stabilization windows and sensible min/max bounds.

---

# Separate Worker Pools

Do not necessarily put every job in one worker pool.

Example:

```text
General workers
    email
    webhooks

Heavy workers
    reports
    imports

Maintenance workers
    cleanup
```

This prevents heavy work from starving latency-sensitive jobs.

---

# Performance

Measure:

```text
enqueue latency
queue wait time
processing time
end-to-end latency
retry rate
failure rate
```

For a job:

```text
total latency
=
queue wait
+
processing
+
retry delays
```

Reducing worker execution time does not help if jobs spend 20 minutes waiting in the queue.

---

# Database Performance

Workers can create database load spikes.

Avoid:

```text
for each row:
  query database
```

Prefer:

```text
batch read
batch process
batch write
```

Use:

- appropriate indexes
- bulk operations
- bounded concurrency
- transactions where needed
- pagination/cursors

---

# Backpressure

Workers must not overwhelm dependencies.

Example:

```text
Queue:
50,000 emails

Provider:
100 requests/minute
```

Do not simply increase concurrency to clear the queue faster.

Implement:

```text
provider rate limit
+
worker concurrency
+
backoff
```

Backpressure protects the whole system.

---

# Troubleshooting

## Queue is growing

Check:

1. worker count
2. worker health
3. Redis health
4. processing duration
5. database latency
6. external provider latency
7. retry storms
8. concurrency settings

---

## Jobs are repeatedly failing

Check:

1. failure category
2. recent deployment
3. external provider status
4. database changes
5. job payload version
6. configuration/secrets
7. code exceptions

Do not blindly retry permanently invalid jobs.

---

## Duplicate side effects

Check:

1. idempotency key
2. durable operation state
3. database uniqueness
4. external provider idempotency
5. worker crash timing
6. retry behavior

---

## Worker is consuming too much memory

Check:

- payload size
- file buffering
- batch size
- concurrency
- unbounded arrays
- report generation
- response buffering

For large files, stream where possible.

---

## Worker cannot connect to PostgreSQL

Check:

- DATABASE_URL
- DNS/network policy
- credentials
- TLS configuration
- connection pool
- database availability
- Kubernetes service configuration

---

## Worker cannot connect to Redis

Check:

- Redis URL
- credentials
- TLS
- network policy
- Redis availability
- DNS
- connection limits

---

# Common Anti-Patterns

## Anti-pattern 1: Queue everything

Queues are not automatically better.

---

## Anti-pattern 2: Put business logic in workers

Bad:

```text
worker.ts
  1000 lines of business logic
```

Better:

```text
worker
  ↓
service
  ↓
repository
```

---

## Anti-pattern 3: Assume exactly-once execution

Always design for duplicate execution.

---

## Anti-pattern 4: Store huge payloads in Redis

Store data durably elsewhere and pass IDs.

---

## Anti-pattern 5: Retry everything

Some failures are permanent.

---

## Anti-pattern 6: Infinite retries

Every retry consumes resources and can hide defects.

---

## Anti-pattern 7: Ignore queue lag

A healthy worker process does not mean the system is healthy.

---

## Anti-pattern 8: No dead-letter strategy

Permanent failures must remain inspectable.

---

## Anti-pattern 9: Put secrets in jobs

Queue payloads are infrastructure data and may be retained or inspected.

---

## Anti-pattern 10: Couple deployment to queue internals

Use stable application-level job contracts.

---

## Anti-pattern 11: Use Redis as business truth

PostgreSQL should own durable business state.

---

## Anti-pattern 12: Spawn arbitrary shell commands

Never allow user-controlled job data to become shell commands.

---

## Anti-pattern 13: No shutdown handling

Workers can lose active work during deployments.

---

# Implementation Roadmap

## Phase 1 — Keep It Simple

Start with:

```text
PostgreSQL
Fastify API
```

Only introduce background jobs when a real workload exists.

---

## Phase 2 — Introduce Redis

Add:

```text
Redis
```

with secure local and production configuration.

---

## Phase 3 — Introduce BullMQ

Add:

```text
Queue
Worker
Producer
```

for one concrete use case.

Recommended first candidate:

```text
email
```

or:

```text
report generation
```

---

## Phase 4 — Add Observability

Add:

- job metrics
- queue depth
- job duration
- retry counts
- dead-letter alerts
- structured logs

---

## Phase 5 — Add Idempotency

For every production job:

```text
duplicate execution test
```

and:

```text
durable idempotency strategy
```

---

## Phase 6 — Add Dead-Letter Operations

Provide a controlled way to:

- inspect
- retry
- discard
- diagnose

failed jobs.

---

## Phase 7 — Add Outbox

Introduce the outbox pattern for business-critical asynchronous events.

Do not add it to every operation without need.

---

## Phase 8 — Scale Worker Pools

Separate workloads when evidence shows that one pool is insufficient.

---

## Phase 9 — Add Scheduled Work

Introduce recurring/scheduled jobs after the core queue system is stable.

---

## Phase 10 — Advanced Reliability

Potential additions:

- queue autoscaling
- distributed tracing
- advanced rate limiting
- job cancellation
- workflow orchestration
- replayable events
- multi-region recovery

Only introduce these when justified by real operational requirements.

---

# Suggested Initial Queues

For Fastify-MasterApp, a reasonable future set is:

```text
email
notifications
reports
imports
exports
webhooks
maintenance
```

But implementation should begin with the smallest useful subset.

---

# Suggested Initial Jobs

## Email

```text
send-welcome-email
send-password-reset-email
send-security-alert
```

## Reports

```text
generate-report
```

## Exports

```text
export-users
export-audit-logs
```

## Maintenance

```text
cleanup-expired-sessions
cleanup-temporary-files
```

---

# Example End-to-End Flow

Consider an Admin user exporting users.

```text
Admin SPA
   |
   | POST /admin/exports
   ▼
Fastify Route
   |
   | authenticate
   | authorize
   ▼
Export Service
   |
   | create Export record
   ▼
PostgreSQL
   |
   | enqueue
   ▼
BullMQ / Redis
   |
   ▼
Export Worker
   |
   | load export
   | validate state
   | query users
   | generate CSV
   | upload/store file
   | update Export
   ▼
PostgreSQL
   |
   ▼
Admin SPA
   |
   | GET /admin/exports/:id
   ▼
COMPLETED
```

---

# Example State Machine

```text
PENDING
  |
  v
QUEUED
  |
  v
PROCESSING
  |
  +-----------> FAILED
  |                |
  |                v
  |             RETRYING
  |                |
  |                v
  +------------ PROCESSING
  |
  v
COMPLETED
```

Cancellation:

```text
PENDING / QUEUED
      |
      v
CANCELLED
```

---

# Job Design Checklist

Before adding a job, answer:

### Business

- Why must this be asynchronous?
- Does the user need the result immediately?
- What happens if the job never runs?

### Reliability

- Can it run twice?
- Is it idempotent?
- What is retryable?
- What is permanent?
- What happens after retries?

### Data

- What is the source of truth?
- What IDs belong in the payload?
- Is an outbox required?
- What database state transitions exist?

### Security

- Does the payload contain secrets?
- Is authorization still valid?
- Could this trigger SSRF?
- Does the worker need elevated privileges?

### Operations

- How is it monitored?
- How is it retried manually?
- What alerts exist?
- How long is metadata retained?

### Deployment

- Can old jobs run on new code?
- Are job contracts backward compatible?
- What happens during worker shutdown?

---

# Definition of Done

A background job is production-ready when:

- [ ] Its business purpose is documented.
- [ ] Its job payload has a typed contract.
- [ ] Payloads contain identifiers rather than unnecessary large objects.
- [ ] The handler is idempotent or has a documented duplicate-execution strategy.
- [ ] Retryable and permanent failures are classified.
- [ ] Maximum retry count is defined.
- [ ] Backoff is configured where appropriate.
- [ ] Dead-letter behavior exists.
- [ ] Durable business state is stored in PostgreSQL.
- [ ] Transaction/queue consistency has been considered.
- [ ] Outbox is used when the workflow requires atomic DB/event publication.
- [ ] Secrets are excluded from job payloads.
- [ ] External calls have timeouts.
- [ ] External rate limits are respected.
- [ ] Worker concurrency is bounded.
- [ ] Database connection pressure is understood.
- [ ] Graceful shutdown is implemented.
- [ ] Queue depth is observable.
- [ ] Job latency is observable.
- [ ] Failures are observable.
- [ ] Dead-letter jobs are observable.
- [ ] Structured logs exist.
- [ ] Unit tests exist.
- [ ] Integration tests exist.
- [ ] Duplicate execution is tested.
- [ ] Retry behavior is tested.
- [ ] Permanent failure behavior is tested.
- [ ] Deployment compatibility has been verified.
- [ ] Operational retry/recovery procedures are documented.

---

# Operational Checklist

## Before Production

- [ ] Redis production configuration validated.
- [ ] Worker deployment created.
- [ ] Worker resource limits configured.
- [ ] Worker autoscaling strategy defined if needed.
- [ ] Queue metrics available.
- [ ] Alerts configured.
- [ ] Dead-letter process documented.
- [ ] Secrets configured securely.
- [ ] Job retention configured.
- [ ] Graceful shutdown tested.
- [ ] Rollback tested.
- [ ] Database migrations tested.
- [ ] Old job compatibility verified.

## During Deployment

- [ ] Deploy compatible schema first.
- [ ] Deploy API.
- [ ] Deploy workers.
- [ ] Monitor queue depth.
- [ ] Monitor failure rate.
- [ ] Monitor database load.
- [ ] Monitor Redis.
- [ ] Verify critical jobs complete.

## After Deployment

- [ ] Queue depth normal.
- [ ] Oldest job age normal.
- [ ] Error rate normal.
- [ ] Worker replicas healthy.
- [ ] No unexpected retry storm.
- [ ] No dead-letter spike.
- [ ] External provider error rates normal.

---

# Golden Rules

## Rule 1

**A job may execute more than once.**

Design accordingly.

## Rule 2

**PostgreSQL owns business truth.**

The queue coordinates work.

## Rule 3

**Keep job payloads small.**

Pass identifiers, not entire objects.

## Rule 4

**Do not retry permanent failures.**

Retries are a reliability mechanism, not an error suppression mechanism.

## Rule 5

**Every important job needs observability.**

If operators cannot tell what is happening, the job is not production-ready.

## Rule 6

**Workers must shut down gracefully.**

Deployments should not casually interrupt active work.

## Rule 7

**Do not let background work starve the API.**

Use separate worker processes and bounded concurrency.

## Rule 8

**Use outbox only when the consistency requirement justifies it.**

Do not build distributed infrastructure for hypothetical problems.

## Rule 9

**Queue compatibility is part of API compatibility.**

Old jobs can outlive the code that created them.

## Rule 10

**Start with one useful job.**

Prove the operational model before adding many queues.

---

# Final Architecture Principle

Fastify-MasterApp should remain a **modular monolith with asynchronous worker capabilities**, not become a distributed system by default.

The preferred evolution is:

```text
Simple API
   ↓
Reliable application architecture
   ↓
One real background job
   ↓
Redis + BullMQ
   ↓
Idempotent workers
   ↓
Retries + dead letters
   ↓
Observability
   ↓
Outbox where required
   ↓
Separate worker pools
   ↓
Horizontal scaling
```

The goal is not to maximize infrastructure.

The goal is to make asynchronous work:

- reliable
- observable
- retryable
- secure
- idempotent
- operationally understandable
- independently scalable

That keeps Fastify-MasterApp simple enough to develop while giving it a clear path toward production-grade asynchronous processing.
