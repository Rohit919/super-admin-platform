# Queue Architecture

> Production-grade architecture and implementation guidance for asynchronous work in **Fastify-MasterApp**.

---

## 1. Purpose

This document defines how background work should be modeled, queued, processed, observed, secured, tested, and operated in Fastify-MasterApp.

The queue architecture is designed for workloads that should not execute inside the synchronous HTTP request lifecycle, including:

- Email delivery
- Notifications
- Webhook delivery
- Report generation
- CSV/Excel imports and exports
- File processing
- Image/document processing
- Search indexing
- Audit-event fan-out
- External API synchronization
- Scheduled maintenance
- Long-running business workflows
- Administrative bulk operations
- Retryable integration work

The architecture intentionally uses a **modular monolith with asynchronous workers** rather than treating every worker as an independent microservice.

### Core principle

> **PostgreSQL owns durable business truth. Redis coordinates asynchronous processing. Workers execute idempotent jobs.**

A queue is not the source of truth for business state.

---

# 2. Architectural Goals

The queue subsystem should provide:

1. Reliable asynchronous execution.
2. Explicit job contracts.
3. Safe retries.
4. Idempotent handlers.
5. Dead-letter handling.
6. Visibility into failures and backlog.
7. Controlled concurrency.
8. Backpressure.
9. Graceful shutdown.
10. Security boundaries.
11. Transactional consistency where required.
12. Operational recovery.
13. Testability.
14. Horizontal worker scaling.
15. Version-compatible job payloads.

---

# 3. Non-Goals

The queue system should not become:

- A second database.
- A replacement for PostgreSQL.
- A generic event bus for every application event.
- A mechanism for hiding poor synchronous architecture.
- A place to store large files.
- A reason to introduce microservices prematurely.
- An excuse to make business operations eventually consistent without documenting it.

For durable business state, use PostgreSQL.

For large binary data, use object storage.

For distributed coordination and queue delivery, use Redis/BullMQ.

---

# 4. Target Architecture

```text
                         ┌─────────────────────┐
                         │       Admin SPA      │
                         │ React + TanStack     │
                         └──────────┬──────────┘
                                    │
                                    │ HTTPS
                                    ▼
                         ┌─────────────────────┐
                         │     Fastify API     │
                         │ Auth / RBAC / HTTP  │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┼────────────────┐
                    │               │                │
                    ▼               ▼                ▼
              PostgreSQL         Redis          External APIs
             source of truth    queue/cache       integrations
                    │               │
                    │               ▼
                    │       ┌────────────────┐
                    │       │    BullMQ      │
                    │       │ queues/jobs    │
                    │       └───────┬────────┘
                    │               │
                    │        ┌──────┴──────┐
                    │        ▼             ▼
                    │   Worker Pool A  Worker Pool B
                    │   email/jobs     reports/sync
                    │        │             │
                    └────────┴─────────────┘
                             │
                             ▼
                       Metrics / Logs
                    Prometheus / Grafana
```

---

# 5. Queue Technology

The recommended implementation is:

- **Redis** for queue coordination.
- **BullMQ** for job queues and workers.
- **PostgreSQL** for durable application state.
- **Pino** for structured logs.
- **Prometheus** for metrics.
- **Grafana** for dashboards.

BullMQ should be treated as the queue execution layer, not the business-domain layer.

Application code should interact with typed queue producers and job handlers rather than scattering raw queue operations throughout route handlers.

---

# 6. Repository Placement

Recommended structure:

```text
apps/
  api/
    src/
      queues/
        index.ts
        queue-names.ts
        queue-options.ts
        registry.ts

        contracts/
          email.job.ts
          webhook.job.ts
          report.job.ts
          import.job.ts
          notification.job.ts

        producers/
          email.producer.ts
          webhook.producer.ts
          report.producer.ts
          import.producer.ts

        workers/
          email.worker.ts
          webhook.worker.ts
          report.worker.ts
          import.worker.ts

        handlers/
          email.handler.ts
          webhook.handler.ts
          report.handler.ts
          import.handler.ts

        middleware/
          job-context.ts

        utils/
          idempotency.ts
          backoff.ts
          job-errors.ts

      modules/
        users/
        auth/
        todos/
        examples/
        orders/
        audit/

      services/
      repositories/
      plugins/

    worker.ts

packages/
  api-contracts/
    src/
      jobs/

prisma/
  schema.prisma
  migrations/
```

The exact layout can evolve, but the separation should remain:

```text
Job Contract
     ↓
Producer
     ↓
Queue
     ↓
Worker
     ↓
Handler
     ↓
Service / Repository
     ↓
PostgreSQL / External Service
```

---

# 7. API Process vs Worker Process

The API process and worker process have different responsibilities.

## API process

Responsible for:

- HTTP requests
- Authentication
- Authorization
- Validation
- Synchronous business operations
- Creating jobs
- Returning job identifiers/status where appropriate

The API should not perform long-running work directly.

## Worker process

Responsible for:

- Fetching jobs
- Executing handlers
- Retryable operations
- External integrations
- Long-running tasks
- Job-specific observability
- Failure classification
- Graceful shutdown

Example:

```text
POST /api/v1/reports/export
        │
        ▼
Validate request
        │
        ▼
Authorize user
        │
        ▼
Create export record
        │
        ▼
Enqueue report.export
        │
        ▼
HTTP 202 Accepted
        │
        └──────────────► Worker
                           │
                           ▼
                     Generate report
                           │
                           ▼
                     Store file
                           │
                           ▼
                     Update export
                           │
                           ▼
                    Notify user
```

---

# 8. When Should Work Become a Job?

Use a background job when:

- The operation may take longer than the HTTP latency budget.
- The operation can safely happen after the request completes.
- The operation needs retries.
- The operation depends on an unreliable external service.
- The operation can generate significant CPU or I/O load.
- The operation is scheduled for later.
- The operation is naturally asynchronous.
- The operation is a bulk task.
- The operation must be independently monitored.

Examples:

| Operation                         |     Queue? | Reason                                 |
| --------------------------------- | ---------: | -------------------------------------- |
| Create user                       |         No | Fast transactional request             |
| Update profile                    |         No | Immediate response expected            |
| Send welcome email                |        Yes | External I/O                           |
| Generate PDF report               |        Yes | Potentially expensive                  |
| Export 500k records               |        Yes | Long-running                           |
| Send webhook                      |        Yes | Retryable external operation           |
| Resize image                      |        Yes | CPU/I/O intensive                      |
| Check authorization               |         No | Request-path operation                 |
| Record critical business mutation | Usually no | Must remain transactionally consistent |
| Fan out audit notification        |        Yes | Can happen asynchronously              |
| Password verification             |         No | Authentication path                    |
| Database migration                |         No | Deployment operation                   |

---

# 9. Queue Taxonomy

Do not create a queue for every individual job type.

Prefer queues based on operational characteristics.

Example:

```text
critical
default
email
webhooks
reports
imports
exports
notifications
maintenance
```

A queue should represent a workload class with meaningful operational controls.

Bad:

```text
user-created-queue
user-updated-queue
user-deleted-queue
todo-created-queue
todo-updated-queue
```

Better:

```text
default
notifications
webhooks
reports
imports
```

---

# 10. Queue Naming

Use stable, lowercase, domain-oriented names.

Recommended:

```text
email
notifications
webhooks
reports
imports
exports
maintenance
```

Avoid names tied to implementation details:

```text
bull-email-v2
redis-worker-1
fastify-background-stuff
```

The queue name is an operational contract.

---

# 11. Job Naming

Use explicit dot-separated names.

Examples:

```text
email.send
email.verify
email.password-reset

notification.send

webhook.deliver

report.generate
report.export

import.users
import.orders

search.reindex

audit.publish
```

Job names should communicate:

```text
domain.action
```

For more complex systems:

```text
domain.resource.action
```

Example:

```text
orders.invoice.generate
users.import.validate
```

---

# 12. Job Contract

Every job should have a defined payload.

Example:

```ts
type SendEmailJob = {
  template: "welcome" | "password-reset" | "verification";
  recipientUserId: string;
  correlationId: string;
};
```

Do not pass arbitrary objects:

```ts
queue.add("email", req.body as any);
```

Instead:

```ts
await emailQueue.add("email.send", {
  template: "welcome",
  recipientUserId: user.id,
  correlationId: request.id,
});
```

---

# 13. Job Payload Rules

Job payloads should be:

- Small.
- JSON serializable.
- Versionable.
- Non-sensitive where possible.
- Explicitly typed.
- Self-contained enough to execute safely.
- Free of unnecessary database records.

Prefer IDs:

```ts
{
  userId: "usr_123";
}
```

Instead of entire objects:

```ts
{
  user: {
    id: "usr_123",
    email: "...",
    profile: {...},
    permissions: [...]
  }
}
```

Workers should normally reload current authoritative state from PostgreSQL.

---

# 14. Do Not Put Secrets in Jobs

Never place these in job payloads:

- Passwords
- JWTs
- Refresh tokens
- API keys
- Database credentials
- Private keys
- Session cookies
- Encryption keys

If an external provider requires a credential, resolve it securely from configuration/secret management at worker runtime.

---

# 15. Payload Versioning

Jobs can outlive the deployment that created them.

Therefore payload compatibility matters.

Example:

```ts
type EmailJobV1 = {
  version: 1;
  userId: string;
  template: string;
};
```

Future:

```ts
type EmailJobV2 = {
  version: 2;
  userId: string;
  template: string;
  locale: string;
};
```

The worker can temporarily support both:

```text
V1 ──┐
     ├──► normalize() ──► handler
V2 ──┘
```

Never deploy a worker that immediately rejects every existing queued payload after a producer deployment.

---

# 16. Producer Architecture

Producers should be thin.

Example:

```ts
export async function enqueueWelcomeEmail(input: {
  userId: string;
  correlationId: string;
}) {
  return emailQueue.add(
    "email.send",
    {
      version: 1,
      template: "welcome",
      recipientUserId: input.userId,
      correlationId: input.correlationId,
    },
    {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  );
}
```

Business services decide **when** work should happen.

Queue producers decide **how** work enters the queue.

---

# 17. Handler Architecture

A worker should not contain the entire business domain.

Avoid:

```text
worker
 ├── database queries
 ├── email rendering
 ├── authorization logic
 ├── billing logic
 ├── retry logic
 ├── logging
 └── external HTTP calls
```

Prefer:

```text
Worker
  ↓
Job validation/context
  ↓
Handler
  ↓
Domain service
  ↓
Repository / integration
```

Example:

```ts
async function handleSendWelcomeEmail(job: Job<SendEmailJob>) {
  const user = await userService.getById(job.data.recipientUserId);

  await emailService.sendTemplate({
    template: job.data.template,
    recipient: user.email,
  });
}
```

---

# 18. Worker Responsibilities

Workers should:

1. Validate the job payload.
2. Establish job context.
3. Log job start.
4. Execute the handler.
5. Record metrics.
6. Classify failures.
7. Allow BullMQ retry behavior to operate.
8. Log completion/failure.
9. Avoid leaking sensitive payload data.

---

# 19. Worker Lifecycle

```text
START
  │
  ▼
Load configuration
  │
  ▼
Connect Redis
  │
  ▼
Connect required dependencies
  │
  ▼
Register workers
  │
  ▼
Ready
  │
  ▼
Process jobs
  │
  ▼
Receive shutdown signal
  │
  ▼
Stop accepting new jobs
  │
  ▼
Wait for active jobs
  │
  ├── completed
  └── timeout
  │
  ▼
Close workers
  │
  ▼
Close Redis/database
  │
  ▼
EXIT
```

---

# 20. Graceful Shutdown

Workers must not be killed abruptly during deployment.

On `SIGTERM`:

1. Stop accepting new jobs.
2. Allow active jobs to finish where possible.
3. Respect a shutdown deadline.
4. Close worker connections.
5. Close Redis connections.
6. Exit cleanly.

If a process terminates while a job is active, BullMQ's lock/recovery behavior should allow the job to become available again according to its configuration.

Handlers must therefore be safe to retry.

---

# 21. Idempotency

Idempotency is the most important property of a reliable job handler.

A job may execute:

- Once.
- More than once.
- After a timeout.
- After partial success.
- After a worker crash.

Therefore:

> Assume every job can run more than once.

Bad:

```ts
await chargeCard();
```

without any idempotency protection.

Better:

```text
job
 ↓
idempotency key
 ↓
check durable state
 ↓
perform operation once
 ↓
record completion
```

---

# 22. Idempotency Strategies

Possible strategies include:

### Database uniqueness

```text
UNIQUE(order_id, operation_type)
```

### State transition

```text
PENDING → PROCESSING → COMPLETED
```

### Idempotency table

```text
job_id
operation_key
status
created_at
completed_at
```

### Provider idempotency key

For external APIs:

```text
Idempotency-Key: order_123_invoice_1
```

The correct strategy depends on the operation.

---

# 23. Job IDs vs Business Idempotency Keys

Do not assume the BullMQ job ID is always the correct idempotency key.

Example:

```text
job A: email.send
jobId = 123
```

A producer may accidentally enqueue the same business operation again:

```text
job B: email.send
jobId = 456
```

Business identity may be:

```text
welcome-email:user_123
```

Use the business operation identity where duplicate execution would be harmful.

---

# 24. Retry Policy

Retries should be deliberate.

Recommended classification:

```text
Transient failure
    ↓
Retry

Permanent failure
    ↓
Fail immediately

Unknown failure
    ↓
Limited retry + investigation
```

Examples of transient failures:

- Network timeout
- HTTP 502
- HTTP 503
- Temporary database connection failure
- Redis connection interruption
- Provider rate limit

Examples of permanent failures:

- Invalid email address
- Missing required record
- Invalid payload
- Unsupported job version
- Authorization/business rule rejection

---

# 25. Exponential Backoff

For transient failures, use exponential backoff.

Conceptually:

```text
attempt 1 → 1s
attempt 2 → 2s
attempt 3 → 4s
attempt 4 → 8s
attempt 5 → 16s
```

Add jitter where large worker fleets could otherwise retry simultaneously.

---

# 26. Retry Storm Prevention

Avoid this:

```text
10,000 jobs fail
       ↓
10,000 retries immediately
       ↓
external provider overloaded
       ↓
10,000 more failures
```

Use:

- Exponential backoff.
- Jitter.
- Concurrency limits.
- Provider-specific queues.
- Rate limits.
- Circuit breakers.
- Bulkhead isolation.

---

# 27. Dead-Letter Jobs

Jobs that cannot succeed after the retry policy should become operationally visible.

Conceptually:

```text
Queue
  │
  ▼
Attempt
  │
  ├── success → completed
  │
  └── failure
        │
        ▼
      retry
        │
        ▼
   max attempts
        │
        ▼
   dead-letter
```

Dead-letter jobs should contain enough metadata for investigation without exposing secrets.

---

# 28. Dead-Letter Metadata

Useful fields:

```text
jobId
queue
jobName
attempts
failedAt
errorCode
errorMessage
correlationId
createdAt
lastAttemptAt
```

Do not store raw credentials or sensitive payloads.

---

# 29. Dead-Letter Operations

Administrators should eventually be able to:

- View failed jobs.
- Inspect safe metadata.
- Retry a job.
- Remove a job.
- Pause a queue.
- Resume a queue.

Dangerous operations should require appropriate RBAC permissions.

Example:

```text
queues.read
queues.retry
queues.remove
queues.pause
queues.resume
```

Every administrative queue action should be audited.

---

# 30. Queue Pause Strategy

Queues may need to be paused during incidents.

Examples:

- External provider outage.
- Bad deployment.
- Unexpected data mutation.
- Database incident.
- Third-party API rate-limit event.

Pausing processing can prevent an incident from becoming larger.

Do not delete queued jobs simply because processing is temporarily broken.

---

# 31. Concurrency

Worker concurrency must reflect the workload.

CPU-heavy:

```text
low concurrency
```

I/O-heavy:

```text
higher concurrency
```

External provider:

```text
provider-specific limit
```

Database-heavy:

```text
protect PostgreSQL connection pool
```

Concurrency should never be selected only because "more workers is faster."

---

# 32. Database Connection Pool Protection

If a worker runs:

```text
50 concurrent jobs
```

and every job opens multiple database operations, the worker fleet can overwhelm PostgreSQL.

Example:

```text
10 workers × 20 concurrency
        =
200 concurrent jobs
```

That does not automatically mean the database can handle 200 concurrent queries.

Capacity must be evaluated across:

- API processes.
- Worker processes.
- Admin traffic.
- Background jobs.
- Maintenance tasks.
- Migration operations.

---

# 33. Queue Isolation

Different workloads should not block each other.

Bad:

```text
default queue
 ├── email
 ├── report generation
 ├── imports
 ├── webhooks
 └── image processing
```

If report generation consumes all workers, email can stop.

Better:

```text
email queue
reports queue
imports queue
webhooks queue
```

Each workload gets independent concurrency and operational controls.

---

# 34. Priority

Use priority sparingly.

Example:

```text
critical notification
normal notification
bulk notification
```

Priority should not become a substitute for proper queue separation.

If two workloads have fundamentally different resource profiles, use separate queues.

---

# 35. Backpressure

Backpressure prevents producers from overwhelming workers.

Signals include:

- Queue depth.
- Processing latency.
- Retry count.
- Worker saturation.
- External provider throttling.
- Database utilization.

Possible controls:

```text
Producer
  ↓
Rate limit
  ↓
Queue
  ↓
Concurrency limit
  ↓
External provider
```

---

# 36. Queue Capacity Planning

Track:

```text
arrival rate
processing rate
average job duration
concurrency
queue depth
failure rate
retry rate
```

If:

```text
arrival rate > processing rate
```

the backlog grows.

Increasing concurrency is only useful if the downstream dependency can support it.

---

# 37. Queue Lag

Queue lag is the time between:

```text
job created
```

and:

```text
job started
```

Example:

```text
job.createdAt = 10:00:00
job.startedAt = 10:00:07

lag = 7 seconds
```

Track lag by queue.

A growing queue with growing lag is a stronger signal than queue depth alone.

---

# 38. Job Duration

Track:

```text
job duration
```

with percentile metrics:

```text
p50
p95
p99
```

Example:

```text
email.send
p50 = 120ms
p95 = 600ms
p99 = 2.4s
```

Unexpected increases may indicate:

- Provider latency.
- Database degradation.
- Network problems.
- Worker CPU pressure.
- Code regressions.

---

# 39. Job Observability

Every job should have:

- Queue name.
- Job name.
- Job ID.
- Correlation ID.
- Attempt number.
- Start timestamp.
- Completion timestamp.
- Duration.
- Outcome.

Example structured log:

```json
{
  "level": "info",
  "event": "job.completed",
  "queue": "email",
  "jobName": "email.send",
  "jobId": "12345",
  "attempt": 1,
  "durationMs": 240,
  "correlationId": "req_abc"
}
```

---

# 40. Correlation IDs

HTTP request:

```text
requestId = req_123
```

Job:

```text
correlationId = req_123
```

Worker logs:

```text
req_123
```

This creates:

```text
HTTP request
   ↓
database mutation
   ↓
job enqueue
   ↓
worker
   ↓
external API
```

as one traceable workflow.

---

# 41. Trace Context

If distributed tracing is enabled, propagate trace context where practical.

At minimum:

```text
traceId
spanId
correlationId
```

Do not place sensitive authentication credentials into tracing metadata.

---

# 42. Metrics

Recommended queue metrics:

```text
queue_jobs_added_total
queue_jobs_completed_total
queue_jobs_failed_total
queue_jobs_retried_total
queue_jobs_dead_letter_total

queue_depth
queue_lag_seconds

job_duration_seconds
job_attempts

worker_active_jobs
worker_concurrency

external_provider_failures_total
```

Metrics should include controlled labels.

Avoid unbounded labels such as:

```text
userId
email
jobId
requestId
```

---

# 43. Recommended Grafana Panels

Create dashboards for:

### Queue overview

- Queue depth.
- Queue lag.
- Jobs completed.
- Jobs failed.
- Retry rate.
- Dead-letter count.

### Worker overview

- Active workers.
- Active jobs.
- Concurrency.
- CPU.
- Memory.
- Event-loop lag.

### External dependencies

- Provider latency.
- Provider error rate.
- Provider rate limits.
- Timeout count.

### Reliability

- Failure rate.
- Retry rate.
- Long-running jobs.
- Stuck jobs.
- Dead-letter growth.

---

# 44. Alerting

Potential alerts:

### Critical

```text
critical queue backlog rapidly increasing
```

### Warning

```text
queue lag exceeds threshold
```

### Critical

```text
dead-letter rate unexpectedly increases
```

### Warning

```text
worker availability drops
```

### Critical

```text
job failure rate exceeds SLO
```

Thresholds should be based on real workload behavior rather than arbitrary numbers.

---

# 45. Job Status Model

For business-visible asynchronous operations, do not expose BullMQ internals directly.

Instead create an application-level status.

Example:

```text
PENDING
RUNNING
COMPLETED
FAILED
CANCELLED
```

Database:

```text
exports
  id
  requested_by
  status
  progress
  file_url
  error_code
  created_at
  started_at
  completed_at
```

The queue is an execution mechanism.

The application record is the business state.

---

# 46. Async API Pattern

For long-running operations:

```http
POST /api/v1/exports
```

Return:

```http
202 Accepted
```

Example:

```json
{
  "data": {
    "id": "exp_123",
    "status": "PENDING"
  }
}
```

Then:

```http
GET /api/v1/exports/exp_123
```

returns:

```json
{
  "data": {
    "id": "exp_123",
    "status": "COMPLETED",
    "downloadUrl": "..."
  }
}
```

This keeps the API contract independent of BullMQ.

---

# 47. Cancellation

Cancellation requires explicit semantics.

Possible states:

```text
PENDING → CANCELLED
```

For an active job:

```text
RUNNING → CANCELLING → CANCELLED
```

Not every job can be safely cancelled.

Examples:

- PDF generation: usually cancellable.
- Email already accepted by provider: usually not cancellable.
- Financial transaction: should not be casually cancellable.

Cancellation must be domain-specific.

---

# 48. Progress Tracking

For long jobs:

```text
0%
25%
50%
75%
100%
```

Persist meaningful progress in the business record.

Do not update PostgreSQL thousands of times per second.

Prefer coarse milestones:

```text
VALIDATING
PROCESSING
FINALIZING
COMPLETED
```

or bounded progress updates.

---

# 49. Transactional Consistency Problem

Consider:

```text
BEGIN
  create order
  enqueue order.confirmation
COMMIT
```

If queue enqueue succeeds but database commit fails, the worker could process an order that does not exist.

The opposite problem is also possible:

```text
BEGIN
  create order
COMMIT

enqueue job fails
```

Now the business record exists but the asynchronous operation never runs.

This is the **dual-write problem**.

---

# 50. Outbox Pattern

For critical workflows, use an outbox.

```text
BEGIN TRANSACTION
  business mutation
  create outbox event
COMMIT
       │
       ▼
Outbox publisher
       │
       ▼
BullMQ
       │
       ▼
Worker
```

PostgreSQL guarantees the business mutation and outbox record commit together.

A publisher later delivers the outbox record to Redis/BullMQ.

---

# 51. Outbox Table

Example conceptual schema:

```text
outbox_events
--------------
id
event_type
aggregate_type
aggregate_id
payload
status
attempts
available_at
processed_at
created_at
```

Possible states:

```text
PENDING
PROCESSING
PUBLISHED
FAILED
```

The outbox itself becomes a durable bridge between PostgreSQL and asynchronous processing.

---

# 52. When to Use the Outbox

Strong candidates:

- Order creation + event publication.
- Payment state changes + downstream processing.
- User creation + required side effects.
- Audit events requiring guaranteed delivery.
- Integration synchronization.
- Business events that must not be silently lost.

For low-value best-effort work, direct queueing may be sufficient.

---

# 53. Queue vs Outbox

| Requirement                        | Direct Queue |      Outbox |
| ---------------------------------- | -----------: | ----------: |
| Best-effort email                  |         Good |    Optional |
| Critical business event            |        Risky | Recommended |
| Guaranteed DB + event relationship |           No |         Yes |
| Simple notification                |         Good |    Optional |
| High-integrity workflow            |      Limited |      Strong |
| Extra DB complexity                |          Low |      Higher |

---

# 54. Duplicate Delivery

The outbox pattern does not magically guarantee exactly-once processing.

It provides durable intent.

The system should still assume:

```text
at-least-once delivery
```

Therefore:

```text
Outbox
  ↓
Queue
  ↓
Idempotent worker
```

is the reliable design.

---

# 55. Exactly-Once Myth

Avoid designing around the assumption that distributed systems can simply guarantee:

```text
exactly once
```

Instead design for:

```text
at least once + idempotency
```

This is simpler and more resilient.

---

# 56. External API Calls

External integrations should use:

- Timeouts.
- Retry classification.
- Exponential backoff.
- Rate limiting.
- Idempotency keys where supported.
- Circuit breakers where appropriate.
- Structured errors.
- Provider-specific metrics.

Example:

```text
Worker
  ↓
HTTP client timeout
  ↓
Provider response
  ├── 2xx → success
  ├── 429 → retry later
  ├── 502 → retry
  ├── 400 → permanent failure
  └── timeout → retry
```

---

# 57. SSRF Protection

If jobs process user-supplied URLs, protect workers from SSRF.

Do not blindly:

```ts
fetch(userProvidedUrl);
```

Validate:

- Scheme.
- Host.
- DNS resolution.
- Private IP ranges.
- Link-local ranges.
- Loopback.
- Cloud metadata endpoints.
- Redirect targets.

Prefer allowlists for known integrations.

Workers often have network access that makes SSRF especially dangerous.

---

# 58. Webhook Jobs

Webhook delivery should generally be asynchronous.

Flow:

```text
business mutation
   ↓
create webhook delivery record
   ↓
enqueue
   ↓
worker
   ↓
HTTP POST
   ↓
success / retry / dead-letter
```

Store:

```text
endpoint
event type
delivery ID
attempt count
status
last error
next retry time
```

Do not rely exclusively on queue state for webhook history.

---

# 59. Webhook Security

Outbound webhook systems should support:

- Signing.
- Timestamp.
- Replay protection.
- Unique delivery ID.
- HTTPS.
- Timeout.
- Retry policy.
- Endpoint allowlists where applicable.

Example conceptual signature:

```text
signature =
HMAC(secret, timestamp + "." + payload)
```

Secrets must never be written to logs.

---

# 60. Email Jobs

Email is a natural asynchronous workload.

Flow:

```text
API
 ↓
business event
 ↓
email.send
 ↓
worker
 ↓
email provider
```

Do not send email synchronously inside the main request unless the product explicitly requires it.

Track:

```text
provider message ID
template
recipient user ID
status
attempts
last error
```

---

# 61. Notification Jobs

Notification jobs can support:

- Email.
- In-app notifications.
- Push notifications.
- SMS through a provider.

Separate channel-specific logic:

```text
notification service
       │
       ├── email
       ├── push
       └── sms
```

Do not duplicate business rules in every worker.

---

# 62. Report Generation

Reports should normally be asynchronous.

Flow:

```text
POST /reports
       ↓
create report record
       ↓
enqueue report.generate
       ↓
202 Accepted
       ↓
worker generates report
       ↓
store artifact
       ↓
update report
```

Generated files should live in object storage rather than Redis.

---

# 63. Imports

Large imports should be jobs.

Recommended stages:

```text
UPLOAD
  ↓
VALIDATE
  ↓
PARSE
  ↓
PROCESS
  ↓
FINALIZE
```

Persist:

```text
total
processed
succeeded
failed
status
error summary
```

Avoid loading enormous files entirely into worker memory.

---

# 64. Exports

Exports should:

- Validate authorization at request time.
- Store a durable export record.
- Capture a safe snapshot/query definition.
- Execute asynchronously.
- Write output to object storage.
- Expire download links.
- Record completion/failure.

Authorization should not be assumed from the fact that the job was previously created.

---

# 65. Search Indexing

Search indexing can be asynchronous:

```text
PostgreSQL
   ↓
business mutation
   ↓
outbox
   ↓
search.index
   ↓
worker
   ↓
search provider
```

The search index is derived state.

PostgreSQL remains authoritative.

---

# 66. Audit Event Processing

Critical audit records should be written transactionally with the business operation when required.

Secondary processing can be asynchronous:

```text
transaction
  ├── business mutation
  └── audit record
          ↓
       outbox
          ↓
       queue
          ↓
   notification/archive
```

Do not make security-critical audit persistence dependent solely on a best-effort queue call.

---

# 67. Scheduled Jobs

Scheduled work may include:

- Cleanup.
- Token/session maintenance.
- Expired file removal.
- Report generation.
- Retry maintenance.
- Data synchronization.

Use scheduler capabilities carefully.

Every scheduled operation must be safe if triggered more than once.

---

# 68. Distributed Scheduling

If multiple workers run scheduling logic, prevent duplicate execution.

Use one of:

- BullMQ repeatable/scheduled jobs.
- Distributed locking.
- A dedicated scheduler.
- Database-based coordination.

Never assume only one application instance exists in production.

---

# 69. Queue Configuration

Keep queue configuration centralized.

Example:

```ts
const defaultJobOptions = {
  attempts: 5,
  removeOnComplete: {
    age: 24 * 60 * 60,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
  },
};
```

Exact retention should depend on operational requirements.

Do not retain unlimited completed jobs.

---

# 70. Job Retention

Retention should balance:

- Debugging.
- Auditability.
- Redis memory.
- Operational visibility.

Queue history is not a replacement for application records.

If business history matters, store it in PostgreSQL.

---

# 71. Redis Architecture

Redis may serve multiple roles:

```text
Redis
 ├── Queue state
 ├── Cache
 ├── Rate limiting
 └── Distributed coordination
```

These workloads can interfere with each other.

Where scale or reliability requires it, separate infrastructure:

```text
Redis Queue
Redis Cache
```

or separate logical instances/databases according to operational constraints.

Queue stability should not depend on a cache eviction event.

---

# 72. Redis Persistence

Production Redis configuration should be chosen based on queue durability requirements.

Consider:

- AOF.
- RDB.
- Replication.
- Managed Redis.
- Persistence window.
- Failover behavior.

However, Redis persistence should not replace PostgreSQL durability.

A lost queue should be recoverable from durable business state/outbox when the workflow requires guaranteed delivery.

---

# 73. Redis Failure

Define explicit behavior.

If Redis is unavailable:

### API

For non-critical asynchronous operations:

```text
503 / appropriate application error
```

or record durable intent through an outbox.

### Worker

Worker should:

- Log connection failure.
- Expose unhealthy status.
- Retry connection according to safe limits.
- Avoid tight reconnect loops.

---

# 74. API Queue Failure Policy

Do not silently pretend a job was queued.

Bad:

```ts
try {
  await queue.add(...);
} catch {
  return { status: "accepted" };
}
```

if the application cannot guarantee eventual processing.

Better:

```text
Either:
  durable outbox
or:
  explicit enqueue failure
```

The API contract must accurately represent what happened.

---

# 75. Authentication and Authorization

Workers do not have a browser user session.

Never copy an access token into a job merely to identify the actor.

Instead persist:

```text
actorUserId
```

and relevant authorization context if required.

The worker should use service-level permissions.

For sensitive operations:

```text
requestedBy
authorizedAt
resourceId
operation
```

can be recorded in durable application/audit state.

---

# 76. Worker Service Identity

Workers should have explicit service identity.

Conceptually:

```text
service = worker
role = background_processor
```

Do not grant workers unrestricted database privileges if they only need limited access.

Use least privilege.

---

# 77. Admin Queue Controls

If queue administration is exposed through the Admin SPA, separate permissions.

Example:

```text
queues.read
queues.retry
queues.pause
queues.resume
queues.remove
```

Dangerous actions should require elevated roles.

Examples:

```text
Retry dead-letter job
Pause webhook processing
Delete thousands of failed jobs
```

must be audited.

---

# 78. Job Data Privacy

Job payloads can appear in:

- Redis.
- Logs.
- Error reports.
- Monitoring dashboards.
- Debug tooling.

Therefore:

> Treat job payloads as potentially observable operational data.

Do not put unnecessary personal or sensitive information in payloads.

Prefer IDs and fetch current state.

---

# 79. Logging Rules

Good:

```text
jobName=email.send
userId=usr_123
status=failed
errorCode=EMAIL_PROVIDER_TIMEOUT
```

Bad:

```text
password=...
refreshToken=...
authorization=Bearer ...
apiKey=...
full-email-body=...
```

Use structured redaction.

---

# 80. Worker Error Model

Create application-level error categories.

Example:

```ts
class RetryableJobError extends Error {}

class PermanentJobError extends Error {}

class ExternalProviderError extends Error {}
```

Then classify:

```text
RetryableJobError
    ↓
retry

PermanentJobError
    ↓
fail

Unknown error
    ↓
limited retry + alert
```

Do not retry every exception.

---

# 81. Timeout Rules

Every external operation should have a timeout.

Bad:

```ts
await fetch(url);
```

Better:

```text
request
  ↓
timeout
  ↓
failure classification
```

A worker waiting forever can consume concurrency indefinitely.

---

# 82. Stuck Jobs

Monitor for:

- Jobs running far longer than expected.
- Worker heartbeat problems.
- Increasing active-job count.
- No completion/failure events.
- Queue lag growth.

Long-running jobs should have an expected duration.

Unexpectedly long execution should be observable.

---

# 83. Poison Jobs

A poison job is a job that repeatedly fails and consumes worker capacity.

Examples:

```text
invalid payload
bad migration assumption
unreachable resource
unsupported version
permanent provider rejection
```

Protect the system using:

- Validation.
- Failure classification.
- Retry limits.
- Dead-letter handling.
- Alerts.

---

# 84. Bulkhead Isolation

One failing workload should not take down all background processing.

Example:

```text
email workers
webhook workers
report workers
import workers
```

Each can have:

- Separate queue.
- Concurrency.
- Retry policy.
- Rate limit.
- Alerting.

---

# 85. Worker Scaling

Scale based on workload metrics.

Useful signals:

```text
queue depth
queue lag
processing rate
CPU
memory
job duration
external provider limits
```

Do not scale solely from CPU.

A worker may be mostly idle on CPU while waiting for a queue or external provider.

---

# 86. Horizontal Scaling

Example:

```text
          Redis
            │
     ┌──────┼──────┐
     ▼      ▼      ▼
 Worker   Worker   Worker
   1        2        3
```

Workers should be stateless where possible.

Shared durable state belongs in:

- PostgreSQL.
- Object storage.
- Redis coordination.

---

# 87. Kubernetes

If deployed to Kubernetes:

```text
Deployment: api
Deployment: worker-email
Deployment: worker-reports
Deployment: worker-default
```

Possible autoscaling signals:

```text
queue depth
queue lag
CPU
memory
```

Kubernetes readiness should reflect whether the worker can accept/process jobs.

Liveness should detect genuinely stuck processes, not transient dependency outages.

---

# 88. Worker Resources

Set:

- CPU requests.
- CPU limits.
- Memory requests.
- Memory limits.

CPU-heavy jobs should be isolated from latency-sensitive workers.

Example:

```text
worker-default
worker-reports
worker-imports
```

may have different resource profiles.

---

# 89. Deployment Strategy

Recommended:

```text
build
 ↓
test
 ↓
build immutable image
 ↓
deploy worker
 ↓
verify health
 ↓
monitor queue
 ↓
scale/rollback if needed
```

For job schema changes:

```text
Producer backward compatible
        ↓
Deploy worker supporting old + new
        ↓
Deploy producer
        ↓
Drain old jobs
        ↓
Remove old support later
```

Never make incompatible producer/worker changes simultaneously without a migration strategy.

---

# 90. Queue Schema Compatibility

The database schema and job payload schema can evolve independently.

Example:

```text
Release 1
  worker understands V1

Release 2
  worker understands V1 + V2

Release 3
  producer emits V2

Release 4
  V1 support removed after queue drain
```

This is safer than:

```text
deploy producer V2
deploy worker V2
hope no V1 jobs remain
```

---

# 91. Blue/Green and Canary Workers

For critical workloads:

```text
old worker
   +
new worker
```

can run concurrently if both support compatible job contracts.

Canary strategy:

```text
small worker capacity
       ↓
observe
       ↓
increase capacity
       ↓
full rollout
```

This is especially useful for high-volume jobs.

---

# 92. Testing Strategy

Queue architecture requires more than unit tests.

Test:

- Producer behavior.
- Job contract validation.
- Handler success.
- Handler failure.
- Retry behavior.
- Idempotency.
- Dead-letter behavior.
- Timeout behavior.
- Concurrency limits.
- Cancellation.
- Outbox publication.
- Worker shutdown.
- Redis failure.
- External API failure.
- Payload version compatibility.

---

# 93. Unit Testing Producers

Verify:

```text
producer
  ↓
correct queue
  ↓
correct job name
  ↓
correct payload
  ↓
correct options
```

Example:

```ts
expect(queue.add).toHaveBeenCalledWith(
  "email.send",
  expect.objectContaining({
    userId: "usr_123",
  }),
  expect.any(Object),
);
```

---

# 94. Handler Testing

Handlers should be testable independently from BullMQ.

Example:

```ts
await handleSendEmail({
  userId: "usr_123",
});
```

Mock:

- Email provider.
- Repository.
- External HTTP calls.

Verify:

```text
success
retryable error
permanent error
idempotent re-run
```

---

# 95. Integration Testing

Use real infrastructure where behavior depends on it.

Recommended:

```text
Test
 ↓
Fastify
 ↓
PostgreSQL
 ↓
Redis
 ↓
Worker
```

This validates:

- Queue registration.
- Redis integration.
- Job serialization.
- Worker execution.
- Database interaction.

---

# 96. End-to-End Testing

Example:

```text
Admin
  ↓
POST export
  ↓
202
  ↓
worker
  ↓
export completed
  ↓
GET export
  ↓
COMPLETED
```

E2E tests should validate the entire asynchronous workflow.

---

# 97. Idempotency Test

Execute the same logical job twice:

```text
job A
job A duplicate
```

Expected:

```text
business side effect happens once
```

This test is mandatory for high-impact operations.

---

# 98. Retry Test

Simulate:

```text
attempt 1 → timeout
attempt 2 → timeout
attempt 3 → success
```

Verify:

- Correct attempt count.
- Correct backoff configuration.
- Final state is successful.
- No duplicate business effect.

---

# 99. Dead-Letter Test

Simulate permanent failure:

```text
attempt 1 → fail
attempt 2 → fail
...
max attempts → dead-letter
```

Verify:

- No infinite retry.
- Failure metadata exists.
- Alerting/metrics are generated.
- Admin can eventually inspect/retry according to permissions.

---

# 100. Outbox Test

Test:

```text
business transaction succeeds
outbox record created
```

and:

```text
business transaction fails
outbox record not committed
```

Then test publisher recovery:

```text
outbox pending
 ↓
publisher crashes
 ↓
publisher restarts
 ↓
event published
```

---

# 101. Redis Failure Test

Simulate:

```text
Redis unavailable
```

Verify:

- API does not falsely report success.
- Worker reports unhealthy.
- Reconnection is bounded.
- No tight retry loop.
- Durable outbox workflows remain recoverable.

---

# 102. Worker Shutdown Test

Start a job:

```text
RUNNING
```

Send:

```text
SIGTERM
```

Verify:

- New jobs stop being accepted by that worker.
- Active work is handled safely.
- Process exits within deadline.
- Job can recover/retry if interrupted.

---

# 103. Load Testing

Queue load tests should model:

```text
producer rate
worker capacity
external dependency rate
database capacity
```

Test:

- Normal load.
- Sustained load.
- Spike load.
- Dependency slowdown.
- Dependency outage.
- Retry storm.
- Worker loss.

---

# 104. Queue SLOs

Define SLOs per queue.

Example:

```text
email:
99% start within 30 seconds

webhooks:
99% successful delivery within 5 minutes

reports:
95% completed within 2 minutes
```

These are examples only.

Production values should come from product requirements and measured capacity.

---

# 105. Operational Runbook

For a growing queue:

1. Check queue depth.
2. Check queue lag.
3. Check worker count.
4. Check worker errors.
5. Check job duration.
6. Check retries.
7. Check external providers.
8. Check PostgreSQL.
9. Check Redis.
10. Determine whether to scale, pause, or mitigate.

Do not immediately increase concurrency without checking the bottleneck.

---

# 106. External Provider Outage

If provider is failing:

```text
provider outage
      ↓
failure rate increases
      ↓
pause or throttle queue
      ↓
backoff retries
      ↓
monitor provider
      ↓
resume gradually
```

This prevents a recovery storm.

---

# 107. Database Incident

If PostgreSQL is degraded:

- Reduce worker concurrency.
- Pause non-critical queues.
- Preserve critical business processing.
- Avoid aggressive retries.
- Monitor connection pools.

A queue can amplify database pressure dramatically.

---

# 108. Redis Incident

If Redis is degraded:

- Determine whether cache and queue share infrastructure.
- Protect queue workloads.
- Disable non-critical cache churn if possible.
- Use durable outbox for critical business events.
- Monitor worker recovery.

Avoid treating Redis as the authoritative business database.

---

# 109. Security Checklist

Before production:

- [ ] Redis is private.
- [ ] Redis credentials are secret-managed.
- [ ] Worker network access is restricted.
- [ ] Job payloads contain no credentials.
- [ ] External URLs are validated.
- [ ] SSRF controls exist where needed.
- [ ] Worker service identity uses least privilege.
- [ ] Admin queue controls use RBAC.
- [ ] Queue actions are audited.
- [ ] Logs redact sensitive data.
- [ ] Dead-letter data is access-controlled.
- [ ] Redis TLS is enabled where required.
- [ ] Worker images are scanned.
- [ ] Dependencies are scanned.
- [ ] Shutdown behavior is tested.

---

# 110. Performance Checklist

- [ ] Queue depth is monitored.
- [ ] Queue lag is monitored.
- [ ] Job duration is measured.
- [ ] Worker concurrency is bounded.
- [ ] Database connection pools are protected.
- [ ] External APIs have timeouts.
- [ ] Retry policies use backoff.
- [ ] Retry storms are prevented.
- [ ] Large payloads are avoided.
- [ ] Large files use object storage.
- [ ] Long jobs are isolated.
- [ ] Completed jobs have retention policies.
- [ ] Dead-letter jobs are bounded.
- [ ] Autoscaling uses queue-aware signals.

---

# 111. Reliability Checklist

- [ ] Jobs are idempotent.
- [ ] Retryable failures are classified.
- [ ] Permanent failures are not retried forever.
- [ ] Dead-letter handling exists.
- [ ] Outbox exists for critical dual writes.
- [ ] Worker shutdown is graceful.
- [ ] Job versions are compatible.
- [ ] Redis failure behavior is documented.
- [ ] External provider outages are handled.
- [ ] Poison jobs cannot consume unlimited capacity.
- [ ] Queue pause/resume operations are available where required.
- [ ] Recovery procedures are tested.

---

# 112. API Checklist

For every asynchronous endpoint:

- [ ] Request is validated.
- [ ] Authorization happens before enqueueing.
- [ ] Durable business record exists when required.
- [ ] Queue failure is represented correctly.
- [ ] `202 Accepted` is used when appropriate.
- [ ] Job/business status can be queried.
- [ ] Sensitive data is excluded from responses.
- [ ] Request ID/correlation ID is propagated.
- [ ] Error behavior is documented.
- [ ] OpenAPI documentation exists.

---

# 113. Developer Checklist

When adding a new job:

### Contract

- [ ] Job name defined.
- [ ] Payload type defined.
- [ ] Version defined if needed.
- [ ] Payload is small.
- [ ] No secrets.

### Producer

- [ ] Producer function created.
- [ ] Queue selected intentionally.
- [ ] Retry policy selected.
- [ ] Idempotency considered.

### Handler

- [ ] Handler isolated from BullMQ.
- [ ] Business logic delegated to services.
- [ ] Errors classified.
- [ ] External calls have timeouts.
- [ ] Logs contain correlation context.

### Reliability

- [ ] Duplicate execution is safe.
- [ ] Dead-letter behavior defined.
- [ ] Shutdown tested.
- [ ] Recovery tested.

### Observability

- [ ] Metrics exist.
- [ ] Failure logs exist.
- [ ] Queue lag is measurable.
- [ ] Job duration is measurable.

### Security

- [ ] Authorization is enforced at request time.
- [ ] Worker uses least privilege.
- [ ] Payload is redacted where necessary.
- [ ] SSRF protections exist for URL-based jobs.

---

# 114. Recommended Implementation Phases

## Phase 1 — Foundation

Implement:

- Redis connection.
- BullMQ dependency.
- Queue registry.
- Worker process.
- Graceful shutdown.
- Basic metrics/logging.

## Phase 2 — First Queue

Implement:

```text
email
```

with:

- Typed job.
- Producer.
- Worker.
- Handler.
- Retry.
- Failure logging.

## Phase 3 — Reliability

Add:

- Idempotency.
- Dead-letter handling.
- Job retention.
- Queue metrics.
- Operational dashboard.

## Phase 4 — Durable Events

Add:

- Outbox table.
- Outbox publisher.
- Recovery process.

## Phase 5 — Workload Isolation

Add:

- Reports.
- Webhooks.
- Imports.
- Separate worker pools.

## Phase 6 — Scale

Add:

- Queue-aware autoscaling.
- Capacity testing.
- Backpressure.
- Provider-specific rate limits.

## Phase 7 — Advanced Operations

Add:

- Admin queue controls.
- Job cancellation.
- Progress reporting.
- Advanced retry controls.
- Replay tooling.

---

# 115. Suggested Initial Queue Set

For Fastify-MasterApp, start small:

```text
default
email
webhooks
reports
```

Add more queues only when workload characteristics justify them.

Potential future queues:

```text
imports
exports
notifications
search
maintenance
integrations
```

---

# 116. Suggested Worker Set

Initial deployment:

```text
API
Worker
```

The worker can process several queues with controlled concurrency.

As traffic grows:

```text
API

Worker Default
Worker Email
Worker Webhooks
Worker Reports
```

Do not split workers prematurely.

---

# 117. Queue Registry

Centralize queue creation.

Conceptual:

```ts
export const queues = {
  default: createQueue("default"),
  email: createQueue("email"),
  webhooks: createQueue("webhooks"),
  reports: createQueue("reports"),
};
```

This prevents different modules from creating inconsistent Redis connections and options.

---

# 118. Worker Registry

Centralize worker registration.

Conceptual:

```ts
registerEmailWorker();
registerWebhookWorker();
registerReportWorker();
```

Worker startup should be deterministic and observable.

Log:

```text
worker.started
queue=email
concurrency=10
```

---

# 119. Service Boundaries

Queue handlers should call application services.

Example:

```text
email.worker.ts
       ↓
email.handler.ts
       ↓
email.service.ts
       ↓
email.provider.ts
```

Database:

```text
service
  ↓
repository
  ↓
Prisma
  ↓
PostgreSQL
```

This preserves the architecture used by the synchronous API.

---

# 120. Avoid Queue-Centric Business Logic

Bad:

```text
route
  ↓
queue
  ↓
worker
  ↓
1000 lines of business logic
```

Better:

```text
route ─────────────┐
                   ▼
              domain service
                   ▲
                   │
worker → handler ──┘
```

Both synchronous and asynchronous entry points should reuse business services where appropriate.

---

# 121. Job Contract Location

If a job payload crosses application boundaries or is consumed by multiple packages, place its contract in:

```text
packages/api-contracts
```

If it is purely internal to one worker module, keeping the type near the queue module may be sufficient.

The decision should follow ownership rather than a blanket rule.

---

# 122. TypeBox Job Contracts

Where TypeBox is already used for runtime validation, use it for job payload validation where practical.

Conceptual:

```ts
const SendEmailJobSchema = Type.Object({
  version: Type.Literal(1),
  userId: Type.String(),
  template: Type.Union([Type.Literal("welcome"), Type.Literal("reset")]),
  correlationId: Type.String(),
});
```

Then validate before handler execution.

This prevents malformed jobs from reaching business logic.

---

# 123. Queue Error Contract

Define stable internal error codes.

Examples:

```text
JOB_INVALID_PAYLOAD
JOB_UNSUPPORTED_VERSION
EMAIL_PROVIDER_TIMEOUT
EMAIL_PROVIDER_RATE_LIMITED
WEBHOOK_ENDPOINT_UNAVAILABLE
REPORT_GENERATION_FAILED
IMPORT_VALIDATION_FAILED
```

Use codes for operational decisions.

Do not make retry behavior depend on parsing arbitrary error strings.

---

# 124. Retry Matrix

Maintain a documented matrix.

| Error                              |      Retry | Backoff        |
| ---------------------------------- | ---------: | -------------- |
| Timeout                            |        Yes | Exponential    |
| HTTP 429                           |        Yes | Provider-aware |
| HTTP 502                           |        Yes | Exponential    |
| HTTP 503                           |        Yes | Exponential    |
| Invalid request                    |         No | None           |
| Missing required record            | Usually no | None           |
| Unsupported job version            |         No | Alert          |
| Database transient failure         |        Yes | Exponential    |
| Database constraint violation      | Usually no | None           |
| Authentication failure to provider | Usually no | Alert          |
| Unknown exception                  |    Limited | Exponential    |

Exact behavior should be implemented per integration.

---

# 125. Queue Governance

Every queue should have an owner.

Document:

```text
Queue:
Owner:
Purpose:
Expected throughput:
Concurrency:
Retry policy:
Retention:
SLO:
Dependencies:
Failure mode:
Runbook:
```

Example:

```text
Queue: webhooks
Owner: Integrations
Purpose: Deliver outbound webhooks
Concurrency: 20
Retries: 8
SLO: 99% within 5 minutes
Dependencies: PostgreSQL, external endpoints
```

---

# 126. Dependency Map

Document queue dependencies.

Example:

```text
reports
 ├── PostgreSQL
 ├── object storage
 └── PDF renderer

webhooks
 ├── PostgreSQL
 └── external HTTP

email
 ├── PostgreSQL
 └── email provider
```

This makes incident diagnosis faster.

---

# 127. Queue Runbook Template

For every important queue:

```markdown
# Queue Runbook

## Purpose

## Owner

## Dependencies

## Normal Throughput

## Expected Lag

## Concurrency

## Retry Policy

## Failure Modes

## How to Pause

## How to Resume

## How to Inspect Failures

## How to Retry Dead-Letter Jobs

## Scaling Guidance

## Incident Alerts

## Rollback Procedure
```

---

# 128. Anti-Patterns

## Anti-pattern 1: Fire-and-forget promises

```ts
doSomethingAsync();
return reply.send(...);
```

This is not durable background processing.

---

## Anti-pattern 2: Queueing raw request bodies

```ts
queue.add("job", request.body);
```

Request bodies may contain:

- Secrets.
- Unnecessary data.
- Unversioned structures.
- Sensitive personal information.

Use explicit contracts.

---

## Anti-pattern 3: Giant job payloads

```text
10 MB JSON payload
```

Do not use Redis as object storage.

---

## Anti-pattern 4: Retry everything

This causes retry storms and hides permanent failures.

---

## Anti-pattern 5: No idempotency

A worker crash can duplicate business side effects.

---

## Anti-pattern 6: One queue for everything

One workload can starve every other workload.

---

## Anti-pattern 7: Queue as source of truth

If Redis disappears, the application should not lose business state.

---

## Anti-pattern 8: Synchronous long-running operations

```text
HTTP request
  ↓
generate 500MB export
  ↓
wait 90 seconds
```

Use asynchronous processing.

---

## Anti-pattern 9: Logging entire payloads

This can leak secrets and personal data.

---

## Anti-pattern 10: Unbounded concurrency

This can overload:

- PostgreSQL.
- Redis.
- External providers.
- Worker memory.
- CPU.

---

# 129. Architecture Decision Records

Important queue decisions should be recorded as ADRs.

Recommended ADRs:

```text
ADR-001 Queue technology: BullMQ
ADR-002 Redis role separation
ADR-003 At-least-once processing
ADR-004 Idempotency strategy
ADR-005 Outbox strategy
ADR-006 Worker deployment model
ADR-007 Queue naming conventions
ADR-008 Job payload versioning
ADR-009 Dead-letter policy
ADR-010 Queue autoscaling
```

---

# 130. Definition of Done

A production-ready job is not complete until:

### Contract

- [ ] Payload is explicitly typed.
- [ ] Runtime validation exists where appropriate.
- [ ] Version compatibility is considered.
- [ ] Payload contains no secrets.

### Producer

- [ ] Producer is isolated.
- [ ] Queue is intentionally selected.
- [ ] Retry policy is defined.
- [ ] Idempotency is defined.

### Worker

- [ ] Worker is independently testable.
- [ ] Handler delegates business logic.
- [ ] Errors are classified.
- [ ] Timeouts exist for external operations.
- [ ] Graceful shutdown works.

### Reliability

- [ ] Duplicate execution is safe.
- [ ] Dead-letter handling exists.
- [ ] Recovery is documented.
- [ ] Critical dual writes use outbox where required.

### Observability

- [ ] Logs exist.
- [ ] Metrics exist.
- [ ] Queue lag is visible.
- [ ] Job duration is visible.
- [ ] Alerts exist for critical queues.

### Security

- [ ] Worker uses least privilege.
- [ ] Sensitive payload data is minimized.
- [ ] Logs are redacted.
- [ ] SSRF is addressed where relevant.
- [ ] Admin operations are RBAC protected and audited.

### Testing

- [ ] Unit tests.
- [ ] Integration tests.
- [ ] Failure/retry tests.
- [ ] Idempotency tests.
- [ ] Recovery tests.
- [ ] E2E test for critical workflows.

---

# 131. Target Architecture Summary

The final Fastify-MasterApp asynchronous architecture should look like:

```text
                         ┌─────────────────┐
                         │   React Admin    │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   Fastify API   │
                         └───────┬─────────┘
                                 │
             ┌───────────────────┼────────────────────┐
             │                   │                    │
             ▼                   ▼                    ▼
        PostgreSQL           Outbox               Direct Queue
       source of truth     critical events       best-effort work
             │                   │                    │
             │                   ▼                    │
             │               Publisher                │
             │                   │                    │
             └───────────────────┼────────────────────┘
                                 ▼
                              Redis
                                 │
              ┌──────────────────┼─────────────────┐
              ▼                  ▼                 ▼
           Email              Webhooks          Reports
           Worker              Worker            Worker
              │                  │                 │
              ▼                  ▼                 ▼
          Provider           External API      Object Storage
                                 │
                                 ▼
                           PostgreSQL state

                  ┌─────────────────────────────┐
                  │ Observability                │
                  │ Pino / Prometheus / Grafana │
                  └─────────────────────────────┘
```

---

# 132. Golden Rules

1. **PostgreSQL is the source of truth.**
2. **Redis is coordination infrastructure, not business storage.**
3. **Assume jobs execute at least once.**
4. **Make important handlers idempotent.**
5. **Never retry blindly.**
6. **Use exponential backoff and jitter for transient failures.**
7. **Dead-letter jobs that cannot recover automatically.**
8. **Keep job payloads small and versionable.**
9. **Never put secrets into job payloads.**
10. **Use timeouts for external calls.**
11. **Protect PostgreSQL from worker concurrency.**
12. **Isolate workloads that have different operational characteristics.**
13. **Use the outbox pattern for critical database + queue dual writes.**
14. **Treat queue state and business state as different things.**
15. **Propagate correlation IDs.**
16. **Monitor queue lag, not just queue depth.**
17. **Make worker shutdown graceful.**
18. **Design producer and worker deployments for compatibility.**
19. **Audit dangerous administrative queue operations.**
20. **Scale based on measured bottlenecks, not assumptions.**
21. **Test failure and recovery paths, not only successful execution.**
22. **Keep asynchronous business logic inside reusable application services.**
23. **Do not introduce microservices merely because workers exist.**
24. **Prefer simple, observable, recoverable asynchronous workflows.**

---

# 133. Final Recommendation

Fastify-MasterApp should evolve toward a **modular monolith with a dedicated worker runtime**.

The recommended progression is:

```text
Fastify API
   ↓
Typed queue producers
   ↓
Redis + BullMQ
   ↓
Dedicated worker process
   ↓
Reusable application services
   ↓
PostgreSQL / external providers
```

Then add reliability capabilities in this order:

```text
1. Queue foundation
2. Typed job contracts
3. Worker runtime
4. Retry policies
5. Idempotency
6. Observability
7. Dead-letter handling
8. Outbox for critical workflows
9. Workload isolation
10. Queue-aware scaling
11. Admin operations
12. Advanced scheduling/cancellation
```

Do not begin with distributed microservices.

First make asynchronous processing:

```text
structured
secure
idempotent
observable
recoverable
testable
```

Only extract workers into independent services when measured operational, ownership, scaling, or deployment requirements justify that complexity.
