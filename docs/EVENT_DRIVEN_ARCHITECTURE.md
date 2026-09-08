# Event-Driven Architecture

> Production-grade event-driven architecture for **Fastify-MasterApp**, designed around a modular monolith, PostgreSQL, Redis/BullMQ, typed contracts, transactional outbox processing, and independently scalable workers.

---

## 1. Purpose

This document defines how Fastify-MasterApp should use events to decouple business operations from asynchronous side effects without turning the application into an unnecessarily distributed system.

The architecture supports:

- Domain events.
- Integration events.
- Transactional outbox.
- BullMQ consumers.
- Asynchronous workflows.
- Webhooks.
- Notifications.
- Search indexing.
- Audit processing.
- External integrations.
- Background jobs.
- Event versioning.
- Idempotent consumers.
- Retry and dead-letter handling.
- Event observability.
- Event security.
- Event testing.
- Event replay and recovery.

The central architectural principle is:

> **Business state lives in PostgreSQL. Events communicate durable facts about state changes. Redis/BullMQ transports asynchronous work. Consumers are idempotent and independently recoverable.**

---

# 2. Why Events?

A synchronous request can become tightly coupled when one operation performs every side effect itself.

Example:

```text
POST /users
   │
   ├── create user
   ├── send email
   ├── update analytics
   ├── update search
   ├── notify admin
   └── call external CRM
```

One slow or unavailable dependency can make the entire request slow or fail.

An event-driven design separates the durable business mutation from asynchronous consequences:

```text
POST /users
   │
   ▼
User Service
   │
   ├── PostgreSQL mutation
   └── Outbox event
          │
          ▼
       Publisher
          │
          ▼
        Queue
          │
    ┌─────┼──────┬──────────┐
    ▼     ▼      ▼          ▼
 Email  Search  Analytics  CRM
```

The request remains focused on the business operation.

---

# 3. Goals

The event architecture should provide:

1. Reliable event publication.
2. Explicit event contracts.
3. Loose coupling between producers and consumers.
4. Durable event intent.
5. At-least-once delivery.
6. Idempotent consumers.
7. Safe retries.
8. Dead-letter handling.
9. Event version compatibility.
10. Replay capability where appropriate.
11. Strong observability.
12. Clear ownership.
13. Security and data minimization.
14. Testability.
15. Controlled operational complexity.

---

# 4. Non-Goals

Do not use events to:

- Replace normal function calls inside one synchronous operation.
- Hide unclear business boundaries.
- Create microservices prematurely.
- Store authoritative business state.
- Avoid database transactions.
- Broadcast every database row change.
- Build an event bus without clear consumers.
- Make critical operations eventually consistent without explicit product requirements.

An event should exist because another component needs to react to a meaningful fact.

---

# 5. Architectural Model

Fastify-MasterApp should use a layered event architecture:

```text
                    HTTP / Admin
                         │
                         ▼
                Application Service
                         │
                         ▼
                  PostgreSQL TX
                   │          │
                   │          └── Outbox Event
                   │
                   ▼
              Business State
                         │
                         ▼
                 Outbox Publisher
                         │
                         ▼
                    Redis/BullMQ
                         │
          ┌──────────────┼───────────────┐
          ▼              ▼               ▼
       Consumer       Consumer        Consumer
          │              │               │
          ▼              ▼               ▼
       Email          Search          Webhooks
```

The database transaction establishes durable intent.

The queue provides asynchronous delivery.

---

# 6. Event Types

Use two primary event categories.

## Domain Events

Describe meaningful business facts inside the application.

Examples:

```text
UserRegistered
OrderCreated
OrderPaid
PasswordChanged
RoleAssigned
ExportCompleted
```

These represent business facts.

## Integration Events

Represent facts intended for another system or external boundary.

Examples:

```text
CustomerCreated
InvoiceIssued
OrderShipped
WebhookRequested
```

Integration events should have especially stable contracts.

---

# 7. Commands vs Events

A command asks for something to happen.

An event states that something happened.

### Command

```text
GenerateReport
```

Meaning:

> Please generate this report.

### Event

```text
ReportGenerated
```

Meaning:

> This report has been generated.

Do not name events like commands.

Bad:

```text
SendWelcomeEmail
```

Better:

```text
UserRegistered
```

The event should describe the fact, while consumers decide what to do about it.

---

# 8. Event Naming

Use past-tense business facts.

Recommended:

```text
UserRegistered
UserEmailVerified
PasswordChanged

RoleAssigned
RoleRemoved

OrderCreated
OrderPaid
OrderCancelled

ReportRequested
ReportCompleted
ReportFailed
```

Avoid:

```text
CreateUser
SendEmail
ProcessOrder
RunReport
```

Those are commands or operations.

---

# 9. Event Namespaces

For large domains, use a namespaced event type.

Example:

```text
users.registered
users.email_verified

orders.created
orders.paid
orders.cancelled

reports.completed
```

A stable naming convention should be chosen before event volume grows.

Recommended canonical format:

```text
<domain>.<resource>.<past-tense-action>
```

Examples:

```text
users.user.registered
orders.order.created
reports.report.completed
```

For simpler domains:

```text
users.registered
orders.created
```

Avoid changing event names after consumers depend on them.

---

# 10. Event Envelope

Events should have a consistent envelope.

Example:

```ts
type EventEnvelope<T> = {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  producer: string;
  correlationId?: string;
  causationId?: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: T;
};
```

Conceptually:

```json
{
  "id": "evt_123",
  "type": "users.registered",
  "version": 1,
  "occurredAt": "2026-09-07T10:00:00Z",
  "producer": "api",
  "correlationId": "req_123",
  "causationId": "cmd_456",
  "aggregateType": "user",
  "aggregateId": "usr_123",
  "payload": {
    "userId": "usr_123"
  }
}
```

---

# 11. Event ID

Every event needs a globally unique identifier.

Example:

```text
evt_01J...
```

The event ID is useful for:

- Deduplication.
- Tracing.
- Auditing.
- Debugging.
- Replay.
- Consumer processing records.

Do not rely only on queue job IDs.

---

# 12. Event Version

Every durable event contract should be versionable.

Example:

```text
users.registered v1
```

Later:

```text
users.registered v2
```

The event type remains stable while its schema evolves.

Consumers should explicitly understand supported versions.

---

# 13. Event Timestamp

Include:

```text
occurredAt
```

This represents when the business event occurred, not when a worker happened to process it.

Useful additional timestamps:

```text
publishedAt
processedAt
```

These allow latency analysis:

```text
business occurrence
       ↓
publish latency
       ↓
queue latency
       ↓
consumer processing
```

---

# 14. Correlation ID

Propagate the request correlation ID.

Example:

```text
HTTP request
requestId = req_123
       ↓
business operation
       ↓
event
correlationId = req_123
       ↓
queue job
       ↓
consumer logs
```

This makes asynchronous workflows traceable.

---

# 15. Causation ID

Where useful, record the event or command that directly caused another event.

Example:

```text
Command: create order
       ↓
Event: order.created
       ↓
Event: payment.requested
       ↓
Event: payment.completed
```

Conceptually:

```text
payment.completed.causationId
    = payment.requested event ID
```

This helps reconstruct event chains.

---

# 16. Aggregate Identity

Events should identify the business entity they concern.

Example:

```text
aggregateType = order
aggregateId   = ord_123
```

This helps:

- Partitioning.
- Debugging.
- Replay.
- Ordering analysis.
- Audit correlation.

---

# 17. Event Payload Design

Keep payloads:

- Small.
- Explicit.
- Versioned.
- Stable.
- JSON serializable.
- Free of secrets.

Prefer:

```json
{
  "userId": "usr_123"
}
```

rather than:

```json
{
  "user": {
    "passwordHash": "...",
    "permissions": [...],
    "profile": {...}
  }
}
```

Consumers can retrieve authoritative current state when appropriate.

---

# 18. Snapshot vs Reference Events

There are two common strategies.

## Reference Event

```json
{
  "userId": "usr_123"
}
```

Consumer loads current state.

### Advantages

- Small event.
- Less duplicated data.
- Less sensitive data.

### Disadvantages

- Consumer sees current state, not necessarily historical state.

## Snapshot Event

```json
{
  "userId": "usr_123",
  "email": "user@example.com",
  "displayName": "Rohit"
}
```

### Advantages

- Preserves event-time information.
- Consumer may not need a database lookup.

### Disadvantages

- Larger payload.
- More sensitive information.
- Schema evolution becomes harder.

Choose deliberately.

---

# 19. Do Not Put Secrets in Events

Never include:

- Passwords.
- Password reset tokens.
- Refresh tokens.
- Access tokens.
- API keys.
- Encryption keys.
- Session cookies.
- Database credentials.

Events may be persisted, retried, inspected, archived, or replayed.

---

# 20. Transactional Outbox

The transactional outbox is the recommended reliability mechanism for important business events.

Without an outbox:

```text
DB transaction
      +
queue publish
```

are separate operations.

This creates a dual-write problem.

With an outbox:

```text
BEGIN
  update business state
  insert outbox event
COMMIT
```

Then:

```text
outbox
  ↓
publisher
  ↓
queue
```

The database guarantees that the business mutation and event intent are committed together.

---

# 21. Outbox Flow

```text
Application Service
       │
       ▼
BEGIN TRANSACTION
       │
       ├── Business mutation
       │
       └── Outbox event
       │
       ▼
COMMIT
       │
       ▼
Outbox Publisher
       │
       ▼
BullMQ
       │
       ▼
Consumer
```

This is the preferred pattern for events whose loss would create business inconsistency.

---

# 22. Outbox Table

Conceptual schema:

```text
outbox_events
--------------
id
event_type
event_version
aggregate_type
aggregate_id
payload
status
attempts
available_at
published_at
last_error
created_at
updated_at
```

Potential statuses:

```text
PENDING
PROCESSING
PUBLISHED
FAILED
```

The exact schema should match the application's migration and operational requirements.

---

# 23. Outbox Publisher

The publisher should:

1. Find pending events.
2. Claim them safely.
3. Publish them to BullMQ.
4. Record publication state.
5. Retry failures.
6. Avoid unbounded concurrent publishing.
7. Emit metrics and logs.

Conceptually:

```text
PENDING
  ↓
claim
  ↓
publish
  ├── success → PUBLISHED
  └── failure → retry
```

---

# 24. Outbox Claiming

Multiple publisher instances may run simultaneously.

Use safe claiming mechanisms such as:

- Row locking.
- `FOR UPDATE SKIP LOCKED`.
- Lease timestamps.
- Ownership tokens.
- Status transitions.

Example:

```text
publisher A → event 1
publisher B → event 2
publisher C → event 3
```

Avoid two publishers processing the same row concurrently unless the operation is explicitly idempotent.

---

# 25. Outbox Publication Is At-Least-Once

The publisher can crash after:

```text
queue.add()
```

but before:

```text
outbox.status = PUBLISHED
```

The event may then be published again.

Therefore:

> **Outbox consumers must still be idempotent.**

The outbox solves durable intent, not exactly-once execution.

---

# 26. Event Delivery Model

Recommended default:

```text
at-least-once
```

This means consumers should assume:

```text
event may arrive more than once
```

Do not design critical workflows around exactly-once delivery.

---

# 27. Consumer Idempotency

A consumer should be safe to run repeatedly.

Example:

```text
users.registered
       ↓
send welcome email
```

If processing occurs twice, the system should avoid sending two emails when the business requirement is one email.

Possible strategies:

- Unique database key.
- Event-processing table.
- Business idempotency key.
- Provider idempotency key.
- State transition.

---

# 28. Processed Event Table

For important consumers:

```text
processed_events
----------------
event_id
consumer_name
processed_at
result
```

Unique constraint:

```text
UNIQUE(event_id, consumer_name)
```

This provides a durable deduplication boundary.

---

# 29. Idempotency Scope

Deduplication must account for the consumer.

The same event may legitimately be consumed by multiple consumers:

```text
evt_123
 ├── email consumer
 ├── search consumer
 └── analytics consumer
```

Therefore:

```text
(eventId, consumerName)
```

is generally more appropriate than only:

```text
eventId
```

---

# 30. Event Ordering

Do not assume global event ordering.

Distributed systems can produce:

```text
event A
event B
```

but consumers may receive:

```text
B
A
```

If ordering matters, define it explicitly.

Possible strategies:

- Aggregate-specific sequence numbers.
- Queue/job grouping.
- Partitioning.
- Database state validation.
- Version checks.

---

# 31. Aggregate Sequence

For ordering-sensitive domains:

```text
aggregateId = ord_123
sequence = 42
```

Consumer can detect:

```text
received 42
expected 41
```

and decide whether to:

- Delay.
- Retry.
- Fetch current state.
- Reconcile.

Do not add ordering machinery unless the domain actually requires it.

---

# 32. Eventual Consistency

Event-driven systems introduce eventual consistency.

Example:

```text
PostgreSQL user
    ↓
user.registered
    ↓
search index
```

The user may exist in PostgreSQL before appearing in search.

The product should explicitly tolerate this delay.

Do not hide eventual consistency from API or Admin UX.

---

# 33. User-Facing Async State

When eventual consistency affects users, expose meaningful status.

Example:

```text
Indexing...
Ready
Failed
```

Avoid exposing infrastructure terms:

```text
BullMQ pending
Redis waiting
consumer retry 3
```

Those are implementation details.

---

# 34. Event Consumers

A consumer should have one clear responsibility.

Examples:

```text
UserRegistered
 ├── WelcomeEmailConsumer
 ├── SearchIndexConsumer
 └── AnalyticsConsumer
```

Do not create a giant consumer:

```text
UserRegisteredConsumer
 ├── email
 ├── search
 ├── analytics
 ├── CRM
 ├── notifications
 └── billing
```

Independent consumers improve failure isolation.

---

# 35. Consumer Architecture

Recommended:

```text
Queue Job
   ↓
Event Validator
   ↓
Consumer
   ↓
Application Service
   ↓
Repository / Integration
```

The consumer is an adapter between event transport and application behavior.

---

# 36. Consumer Ownership

Every important consumer should have an owner.

Document:

```text
Event:
Consumer:
Owner:
Purpose:
Dependencies:
Retry policy:
SLO:
Failure mode:
Runbook:
```

This prevents "orphaned" event processing code.

---

# 37. Consumer Isolation

Different consumers may require different operational characteristics.

Example:

```text
email.consumer
search.consumer
webhook.consumer
report.consumer
```

They can use separate queues where needed.

A slow search provider should not block transactional email delivery.

---

# 38. Event Fan-Out

A single event may have many consumers.

```text
users.registered
       │
       ├── email
       ├── search
       ├── analytics
       └── CRM
```

Each consumer should have independent failure handling.

If CRM is down:

```text
email still succeeds
search still succeeds
CRM retries
```

This is one of the main benefits of event-driven architecture.

---

# 39. Event Chaining

Consumers may produce new events.

Example:

```text
order.created
     ↓
payment.requested
     ↓
payment.completed
     ↓
order.paid
     ↓
notification.requested
```

Event chains should be explicit and observable.

Avoid accidental event loops:

```text
A → B → C → A → B → C
```

---

# 40. Event Loop Protection

Every event-driven workflow should have protections against cycles.

Possible safeguards:

- Event type ownership.
- Causation chain.
- Maximum workflow depth.
- State transition validation.
- Idempotency keys.
- Explicit command/event separation.

If an event can cause another event of the same type, document why it is safe.

---

# 41. Domain Events in a Modular Monolith

Modules should own their domain events.

Example:

```text
modules/
  users/
    events/
      user-registered.ts

  orders/
    events/
      order-created.ts
      order-paid.ts
```

The users module should not know which external consumers react to its events.

This preserves module boundaries.

---

# 42. Module Event Boundary

Prefer:

```text
Users Module
     │
     ▼
UserRegistered
     │
     ├── Email consumer
     ├── Search consumer
     └── CRM consumer
```

Avoid:

```text
Users Module
 ├── sendEmail()
 ├── updateSearch()
 ├── callCRM()
 └── updateAnalytics()
```

The latter creates direct coupling.

---

# 43. Synchronous vs Event-Driven Calls

Use a synchronous function/service call when:

- The caller needs the result immediately.
- The operation is local.
- The operation is part of the same transaction.
- Failure must immediately fail the request.

Use an event when:

- A downstream action can happen asynchronously.
- The producer does not need an immediate result.
- Multiple consumers may react independently.
- Retryability is valuable.
- Failure should not necessarily fail the original operation.

---

# 44. Event vs Queue Job

Not every queue job needs to be an event.

### Event

```text
users.registered
```

Meaning:

> A fact occurred.

### Job/Command

```text
email.send
```

Meaning:

> Execute this operation.

A useful flow is:

```text
Domain Event
     ↓
Consumer
     ↓
Command/Job
     ↓
Worker
```

But for simple internal workflows, the event itself can be the queued work.

Choose the simplest model that preserves clarity.

---

# 45. Event-to-Job Example

```text
users.registered
       │
       ▼
WelcomeEmailConsumer
       │
       ▼
email.send job
       │
       ▼
Email Worker
       │
       ▼
Email Provider
```

This provides a clean separation between:

```text
business fact
```

and:

```text
execution mechanism
```

---

# 46. Integration Events

Integration events should avoid leaking internal implementation details.

Bad:

```json
{
  "prismaModel": "User",
  "databaseId": "...",
  "internalFlags": [...]
}
```

Better:

```json
{
  "customerId": "cus_123",
  "createdAt": "..."
}
```

An integration contract should be designed for the receiving boundary.

---

# 47. External Event Consumers

If Fastify-MasterApp eventually integrates with another event platform, keep the transport behind an adapter.

Conceptual:

```text
Domain Event
     ↓
Event Publisher Interface
     ├── BullMQ
     ├── Kafka
     └── SNS/SQS
```

Do not spread transport-specific code through domain modules.

---

# 48. Transport Abstraction

Do not over-abstract too early.

Bad:

```text
IUniversalEventBus
IEventTransportFactory
IEventDeliveryStrategy
IEventSerializationPipeline
```

when only BullMQ exists.

Start with a focused internal interface if it provides a real boundary:

```ts
interface EventPublisher {
  publish<T>(event: EventEnvelope<T>): Promise<void>;
}
```

Introduce broader abstraction only when multiple transports are genuinely required.

---

# 49. Event Serialization

Events should use stable JSON-compatible serialization.

Avoid serializing:

- Class instances.
- Functions.
- Streams.
- Database clients.
- Request objects.
- ORM objects with hidden state.

Use explicit DTOs.

---

# 50. Date and Time

Serialize timestamps as ISO 8601 strings.

Example:

```json
{
  "occurredAt": "2026-09-07T10:00:00.000Z"
}
```

Do not rely on worker/server local timezone.

---

# 51. IDs

Use stable application IDs.

Examples:

```text
usr_123
ord_123
evt_123
```

Avoid leaking database implementation details where the public contract does not require them.

---

# 52. Event Schema Validation

Every consumer should validate incoming event data.

Use the same TypeBox philosophy as the HTTP API where appropriate.

Conceptual:

```ts
const UserRegisteredEvent = Type.Object({
  id: Type.String(),
  type: Type.Literal("users.registered"),
  version: Type.Literal(1),
  occurredAt: Type.String(),
  payload: Type.Object({
    userId: Type.String(),
  }),
});
```

Validation should happen before business processing.

---

# 53. Invalid Events

If an event is structurally invalid:

```text
event
 ↓
validation
 ↓
invalid
```

Do not retry it forever.

Invalid schema is generally a permanent failure.

Recommended:

```text
invalid event
   ↓
dead-letter
   ↓
alert
   ↓
investigate producer/version
```

---

# 54. Unsupported Versions

If a consumer receives:

```text
version = 3
```

but only supports:

```text
v1, v2
```

do not silently process it incorrectly.

Options:

- Dead-letter.
- Route to compatibility handler.
- Delay until compatible deployment.
- Explicitly reject with an operational alert.

The choice should be documented.

---

# 55. Event Compatibility

Prefer additive changes.

Safe example:

```text
v1:
userId

v2:
userId
locale
```

Potentially breaking:

```text
userId
```

changed to:

```text
customerId
```

or:

```text
string
```

changed to:

```text
object
```

Breaking changes require a versioning strategy.

---

# 56. Event Version Migration

Recommended sequence:

```text
1. Add consumer support for V2
2. Keep V1 support
3. Deploy consumers
4. Start publishing V2
5. Monitor V1 backlog
6. Drain V1
7. Remove V1 support
```

Do not remove V1 support while old events may still exist.

---

# 57. Event Retention

Event retention depends on the architecture.

There are three separate concepts:

```text
Queue retention
Event history retention
Business audit retention
```

Do not confuse them.

BullMQ job retention may be short.

A durable event archive may be longer.

Audit events may have their own retention requirements.

---

# 58. Event Replay

Replay should be treated as an operational capability, not an automatic feature of every event.

Useful for:

- Rebuilding search indexes.
- Reprocessing failed integrations.
- Recovering derived state.
- Backfilling analytics.
- Migrating consumers.

Dangerous for:

- Sending emails twice.
- Repeating financial operations.
- Repeating irreversible external actions.

Consumers must declare whether replay is safe.

---

# 59. Replay Safety

Every consumer should have a classification:

```text
REPLAY_SAFE
REPLAY_SAFE_WITH_GUARDS
NOT_REPLAY_SAFE
```

Example:

```text
search.index       → REPLAY_SAFE
analytics.record   → REPLAY_SAFE_WITH_GUARDS
email.send         → NOT_REPLAY_SAFE
payment.charge     → NOT_REPLAY_SAFE
```

Replay tooling must respect these classifications.

---

# 60. Reprocessing Failed Events

For a dead-letter event:

```text
inspect
  ↓
fix underlying issue
  ↓
retry/requeue
  ↓
consumer
```

Do not blindly retry thousands of dead-letter events during an incident.

Use controlled batches.

---

# 61. Event Archive

If replay is a requirement, consider a durable event archive.

Possible storage:

- PostgreSQL.
- Object storage.
- Dedicated event store.
- External streaming platform.

Do not depend on short-lived Redis queue history for long-term replay.

---

# 62. Event Storage in PostgreSQL

For moderate event volumes, an event table may be sufficient:

```text
events
------
id
type
version
aggregate_type
aggregate_id
payload
occurred_at
created_at
```

This can support:

- Debugging.
- Replay.
- Auditing.
- Integration history.

However, do not automatically store every event forever.

---

# 63. Event Store vs Outbox

They are different concepts.

### Outbox

Stores events until they are successfully published.

### Event Store

Stores events as a durable historical record.

A simple application may only need:

```text
business tables
+
outbox
```

Do not introduce a full event store unless historical event replay is a real requirement.

---

# 64. Event Sourcing

Fastify-MasterApp should **not** use event sourcing by default.

Event sourcing means:

```text
events
   ↓
reconstruct current state
```

rather than:

```text
current state
+
events for communication
```

For this application, prefer:

```text
PostgreSQL current state
+
outbox events
```

unless future domain requirements strongly justify event sourcing.

---

# 65. CQRS

CQRS can be useful for:

- Complex reporting.
- Search projections.
- High-read derived models.
- Independent read scaling.

But it should not be introduced everywhere.

Start with:

```text
normal PostgreSQL read/write model
```

Add projections only when the read workload justifies them.

---

# 66. Read Models

An event consumer can maintain a derived read model.

Example:

```text
PostgreSQL
   │
   ▼
order.created
   │
   ▼
OrderProjectionConsumer
   │
   ▼
read model
```

The read model is disposable/rebuildable if the event history is durable.

---

# 67. Cache Invalidation

Events are useful for cache invalidation.

Example:

```text
user.updated
   ↓
cache invalidation
   ↓
Redis
```

But cache invalidation should not become the only record of a business mutation.

PostgreSQL remains authoritative.

---

# 68. Search Index Updates

Search indexes are classic event-driven projections.

```text
user.updated
   ↓
search.index-user
   ↓
worker
   ↓
search service
```

If indexing fails:

```text
retry
   ↓
dead-letter
```

The database record remains correct.

---

# 69. Webhook Integration

Business event:

```text
order.paid
```

can produce:

```text
webhook.delivery.requested
```

Then:

```text
Webhook Worker
   ↓
external endpoint
```

This isolates external delivery from the core transaction.

---

# 70. Notification Integration

Example:

```text
password.changed
       ↓
notification consumer
       ↓
email.send
```

The password change should not depend on the email provider being available unless the product explicitly requires synchronous notification confirmation.

---

# 71. Audit Integration

Security-sensitive events can be persisted as audit records.

Example:

```text
role.assigned
       ↓
audit record
```

For critical audit requirements, write the audit record transactionally with the business mutation.

Asynchronous consumers may perform secondary actions such as:

- Notifications.
- Archiving.
- Analytics.
- Alerting.

---

# 72. Authentication Events

Potential events:

```text
auth.login.succeeded
auth.login.failed
auth.logout
auth.password.changed
auth.refresh.reused
auth.account.locked
```

These can feed:

- Security monitoring.
- Audit.
- Notifications.
- Analytics.

Be careful not to include credentials or tokens.

---

# 73. Authorization Events

Examples:

```text
roles.assigned
roles.removed
permissions.changed
```

Consumers may invalidate authorization caches.

Example:

```text
role.assigned
   ↓
permission-cache.invalidate
```

Authorization decisions themselves should remain synchronous and fail-safe.

---

# 74. Admin Events

Administrative actions can emit events:

```text
user.suspended
user.deleted
role.updated
bulk-import.completed
report.generated
```

Admin UI can use durable application status records rather than depending directly on queue internals.

---

# 75. Event Security Model

Events cross trust boundaries even when they stay inside the same deployment.

Security requirements:

- Validate every event.
- Minimize payload data.
- Protect Redis.
- Protect event archives.
- Restrict worker permissions.
- Redact logs.
- Authenticate external event sources.
- Authorize administrative replay operations.

---

# 76. External Event Ingestion

If external systems send events to Fastify-MasterApp:

```text
External System
      ↓
HTTPS endpoint
      ↓
Authentication/signature validation
      ↓
Schema validation
      ↓
Deduplication
      ↓
Durable record
      ↓
Queue
      ↓
Consumer
```

Do not process arbitrary external events directly inside the HTTP handler.

---

# 77. External Event Authentication

Depending on the provider, use:

- HMAC signatures.
- mTLS.
- OAuth/service credentials.
- Signed JWTs.
- Provider-specific verification.

Always verify authenticity before enqueueing sensitive work.

---

# 78. Replay Attack Protection

For signed external events, include:

```text
event ID
timestamp
signature
```

Reject:

- Invalid signatures.
- Expired timestamps.
- Duplicate event IDs.

Persist processed external event IDs where necessary.

---

# 79. Event Rate Limiting

External event ingestion should be rate limited.

Protect:

- API.
- Redis.
- PostgreSQL.
- Workers.
- Downstream providers.

Rate limits should be applied before expensive processing.

---

# 80. Event Backpressure

If consumers cannot keep up:

```text
producer
   ↓
queue depth grows
   ↓
lag increases
```

Possible actions:

- Scale consumers.
- Reduce producer rate.
- Pause non-critical consumers.
- Increase batching.
- Reduce expensive work.
- Protect dependencies.

Backpressure is an operational feature, not an error condition by itself.

---

# 81. Batching

Batching can improve throughput for suitable workloads.

Examples:

```text
search indexing
analytics
bulk notifications
imports
```

But batching can increase:

- Latency.
- Failure complexity.
- Retry scope.

Use only when measured throughput requirements justify it.

---

# 82. Event Consumer Concurrency

Concurrency should be selected based on:

```text
consumer workload
database capacity
external provider capacity
memory
CPU
ordering requirements
```

High concurrency is not automatically better.

---

# 83. Consumer Retry Policy

Each consumer should have an explicit retry policy.

Example:

```text
transient provider timeout
    ↓
retry

permanent validation failure
    ↓
dead-letter

unknown exception
    ↓
limited retry + alert
```

Avoid a universal retry policy for every consumer.

---

# 84. Retry Jitter

When many events fail simultaneously:

```text
1000 events
   ↓
all retry after 10 seconds
```

This can create a thundering herd.

Use jitter:

```text
10s ± random jitter
```

especially for external services.

---

# 85. Dead-Letter Event Handling

Dead-letter handling should preserve:

```text
eventId
eventType
version
consumer
attempts
firstFailureAt
lastFailureAt
errorCode
correlationId
```

Payload access should be restricted if it contains sensitive business data.

---

# 86. Poison Event Detection

A poison event repeatedly fails and blocks progress.

Protect consumers with:

- Validation.
- Retry limits.
- Dead-letter queues.
- Error classification.
- Per-event timeouts.
- Operational alerts.

---

# 87. Consumer Timeouts

Every consumer must have bounded execution.

Examples:

```text
database query timeout
HTTP timeout
file processing timeout
provider timeout
```

An event should not consume a worker indefinitely.

---

# 88. Circuit Breakers

For unstable external providers:

```text
consumer
   ↓
circuit breaker
   ├── closed → request
   ├── open → fail fast/requeue
   └── half-open → test recovery
```

Circuit breakers are especially useful when repeated retries would worsen an outage.

---

# 89. Bulkhead Pattern

Separate unrelated consumers:

```text
email
webhooks
reports
search
```

so one dependency cannot consume all worker capacity.

---

# 90. Database Transactions and Events

Do not publish an event before the business transaction is durable when the event describes committed state.

Bad:

```text
publish UserRegistered
   ↓
database insert fails
```

The event describes something that did not actually happen.

Better:

```text
database transaction
  ├── user insert
  └── outbox event
```

---

# 91. State Transition Events

Emit events when meaningful business state transitions occur.

Example:

```text
PENDING → PAID
```

can produce:

```text
order.paid
```

Avoid emitting events for every internal field mutation.

Events should represent meaningful facts.

---

# 92. Event Granularity

Too coarse:

```text
user.changed
```

Consumers cannot understand what happened.

Too fine:

```text
user.first_name.changed
user.last_name.changed
user.phone.changed
```

This can create excessive event complexity.

Prefer business-level events:

```text
user.profile.updated
user.email.changed
user.suspended
```

---

# 93. Event Ownership

The module that owns the business state owns the event semantics.

Example:

```text
Orders module
  owns:
    order.created
    order.paid
    order.cancelled
```

Other modules consume these events but should not redefine their meaning.

---

# 94. Event Documentation

For every stable event, document:

```text
Event name
Version
Owner
Purpose
Producer
Consumers
Payload schema
Ordering requirements
Retry policy
Replay policy
Sensitive fields
Retention
SLO
```

This can eventually be maintained as an event catalog.

---

# 95. Event Catalog

Recommended structure:

```text
docs/events/
  README.md
  users.registered.md
  users.email-verified.md
  orders.created.md
  orders.paid.md
```

The catalog should be generated or validated against code where practical.

---

# 96. Event Contract Example

````markdown
# users.registered

## Version

1

## Producer

Users module

## Purpose

Indicates that a user registration transaction committed successfully.

## Payload

```json
{
  "userId": "usr_123"
}
```
````

## Consumers

- Welcome email
- Search indexing
- Analytics

## Delivery

At least once

## Ordering

No global ordering guarantee

## Replay

Safe for search and analytics; email requires deduplication.

## Sensitive Data

No credentials or tokens.

````

---

# 97. Event Registry

Centralize known event metadata.

Conceptually:

```ts
const eventRegistry = {
  "users.registered": {
    version: 1,
    owner: "users",
  },
  "orders.created": {
    version: 1,
    owner: "orders",
  },
};
````

This helps prevent accidental event-name drift.

---

# 98. Event Contract Package

Shared event contracts can live in:

```text
packages/api-contracts/src/events/
```

Example:

```text
events/
  users/
    registered.ts
    email-verified.ts

  orders/
    created.ts
    paid.ts
```

Do not make every internal event globally shared.

Share only contracts that cross module/package boundaries.

---

# 99. Event Contract Ownership

A shared contract should have a clear owner.

Avoid:

```text
everyone can edit every event
```

Prefer:

```text
Users module owns users.registered
Orders module owns orders.created
```

Changes should go through the owning team/module.

---

# 100. API and Event Contracts

API contracts and event contracts are related but different.

API:

```text
client ↔ server
```

Event:

```text
producer → consumer
```

Do not automatically reuse an HTTP response schema as an event schema.

They evolve under different compatibility requirements.

---

# 101. Event Versioning vs API Versioning

API:

```text
/api/v1
/api/v2
```

Events:

```text
users.registered v1
users.registered v2
```

Both need compatibility policies.

A new API version does not automatically imply a new event version.

---

# 102. Event Schema Evolution

Preferred changes:

- Add optional fields.
- Add new event types.
- Preserve existing meanings.
- Maintain compatibility during migration.

Risky changes:

- Rename fields.
- Change field types.
- Change event meaning.
- Remove required fields.
- Change ordering assumptions.

---

# 103. Event Semantics

An event's meaning must remain stable.

For example:

```text
order.paid
```

should consistently mean:

> The order reached the application's defined paid state.

Do not later reinterpret it as:

> A payment request was sent.

If the meaning changes, create a new event.

---

# 104. Event Delivery Guarantees

Document guarantees explicitly:

```text
Delivery: at least once
Ordering: per aggregate / none
Durability: outbox-backed
Retry: exponential
Dead-letter: enabled
Replay: consumer-specific
```

Never promise stronger guarantees than the architecture provides.

---

# 105. Event Processing Lifecycle

```text
RECEIVED
   ↓
VALIDATING
   ↓
PROCESSING
   ├── SUCCESS
   │
   └── FAILURE
        ├── RETRY
        └── DEAD_LETTER
```

For business records:

```text
PENDING
RUNNING
COMPLETED
FAILED
CANCELLED
```

Keep transport state separate from business state.

---

# 106. Event Processing Record

For important consumers, track:

```text
event_id
consumer_name
status
attempts
started_at
completed_at
last_error
created_at
```

This supports:

- Deduplication.
- Debugging.
- Operational visibility.
- Replay decisions.

---

# 107. Observability

Track event-level metrics:

```text
events_published_total
events_failed_total
events_retried_total
events_dead_letter_total

event_publish_latency_seconds
event_processing_latency_seconds

consumer_active_jobs
consumer_failures_total
consumer_retries_total
```

Use bounded labels:

```text
event_type
consumer
queue
outcome
```

Avoid high-cardinality labels:

```text
event_id
user_id
request_id
```

---

# 108. Logging

Useful event log:

```json
{
  "event": "event.processed",
  "eventType": "users.registered",
  "eventId": "evt_123",
  "consumer": "welcome-email",
  "attempt": 1,
  "durationMs": 180,
  "correlationId": "req_123"
}
```

Never log the entire payload by default.

---

# 109. Tracing

Recommended trace relationships:

```text
HTTP request
   ↓
DB transaction
   ↓
outbox event
   ↓
queue job
   ↓
consumer
   ↓
external HTTP call
```

Propagate trace/correlation context where supported.

---

# 110. Event SLOs

Define SLOs by event class.

Example:

```text
users.registered → welcome notification started within 30s

orders.paid → fulfillment workflow started within 10s

webhook delivery → 99% attempted within 60s
```

These are examples.

Production targets should be based on actual product requirements.

---

# 111. Alerting

Potential alerts:

- Event publication failures.
- Outbox backlog growth.
- Consumer failure rate increase.
- Consumer lag increase.
- Dead-letter growth.
- Unsupported event versions.
- Poison event detection.
- External provider failures.
- Queue saturation.

Alert on user/business impact, not every transient error.

---

# 112. Outbox Monitoring

Important metrics:

```text
outbox_pending_count
outbox_oldest_event_age
outbox_publish_failures
outbox_publish_latency
outbox_retry_count
```

The oldest pending event age is particularly useful.

A queue can have a modest count but severe latency if one event has been stuck for hours.

---

# 113. Event Lag

Measure:

```text
occurredAt
       ↓
publishedAt
       ↓
processingStartedAt
       ↓
processedAt
```

This allows diagnosis:

```text
high publish lag
    → outbox/publisher problem

high queue lag
    → worker capacity problem

high processing duration
    → consumer/dependency problem
```

---

# 114. Event Failure Budget

A healthy event system expects some transient failures.

Track:

```text
success rate
retry rate
dead-letter rate
processing latency
```

Do not treat every retry as a production incident.

Repeated or growing retries indicate a systemic problem.

---

# 115. Testing Event Producers

Verify:

- Correct event type.
- Correct version.
- Correct payload.
- Correct aggregate ID.
- Correlation ID propagation.
- Outbox record creation.
- Transactional behavior.

---

# 116. Testing Consumers

Test:

- Valid event.
- Invalid event.
- Unsupported version.
- Duplicate event.
- Retryable failure.
- Permanent failure.
- External timeout.
- Database failure.
- Successful processing.
- Side-effect idempotency.

---

# 117. Consumer Contract Tests

Each consumer should have contract tests against the event schema.

Example:

```text
Producer schema
      ↓
consumer validation
      ↓
compatible
```

Contract tests catch accidental breaking changes before deployment.

---

# 118. Event Integration Tests

Recommended infrastructure:

```text
Fastify
PostgreSQL
Redis
Outbox publisher
Worker
```

Test:

```text
business mutation
   ↓
outbox
   ↓
publisher
   ↓
queue
   ↓
consumer
   ↓
business side effect
```

This validates the real asynchronous boundary.

---

# 119. End-to-End Example

User registration:

```text
POST /api/v1/auth/register
        │
        ▼
Auth Service
        │
        ▼
BEGIN TX
        │
        ├── create user
        └── users.registered event
        │
        ▼
COMMIT
        │
        ▼
Outbox Publisher
        │
        ▼
Redis/BullMQ
        │
        ├── WelcomeEmailConsumer
        ├── SearchConsumer
        └── AnalyticsConsumer
```

The API can return immediately after the user transaction commits.

---

# 120. Failure Scenario: Email Provider Down

```text
users.registered
      ↓
email consumer
      ↓
provider timeout
      ↓
retry
      ↓
provider timeout
      ↓
retry
      ↓
success
```

The user registration remains successful.

Email delivery is eventually consistent.

---

# 121. Failure Scenario: Worker Crash

```text
consumer starts
      ↓
job running
      ↓
worker crashes
      ↓
job becomes recoverable
      ↓
another worker processes it
```

Because the handler is idempotent, duplicate execution is safe.

---

# 122. Failure Scenario: Publisher Crash

```text
outbox event exists
      ↓
publisher publishes
      ↓
publisher crashes before marking published
      ↓
event published again
      ↓
consumer deduplicates
```

This is why at-least-once + idempotency is the preferred design.

---

# 123. Failure Scenario: Consumer Deployment

Old events:

```text
users.registered v1
```

New consumer supports:

```text
v1 + v2
```

Deploy consumer first.

Then producer begins emitting:

```text
v2
```

After backlog drains, remove v1 support.

---

# 124. Failure Scenario: Database Down

If consumer needs PostgreSQL:

```text
consumer
   ↓
DB unavailable
   ↓
retryable error
   ↓
backoff
```

Do not retry aggressively.

Protect PostgreSQL from a retry storm.

---

# 125. Failure Scenario: External API Rate Limited

```text
HTTP 429
   ↓
respect Retry-After when appropriate
   ↓
backoff
   ↓
retry
```

If the provider remains unavailable:

```text
retry
   ↓
dead-letter
```

Operational intervention may be required.

---

# 126. Event-Driven Security Boundaries

Security-sensitive operations should remain protected by domain services.

A consumer receiving:

```text
user.suspend.requested
```

should not blindly perform the mutation unless the event was produced through an authorized workflow.

For administrative actions, preserve:

```text
actorUserId
authorization context
request/correlation ID
reason
```

when required for auditability.

---

# 127. Never Trust Event Payloads

Even internally generated events should be treated as untrusted at the consumer boundary.

Validate:

- Type.
- Version.
- Required fields.
- IDs.
- Allowed enum values.
- Data size.
- Business state.

For externally sourced events, additionally authenticate the sender.

---

# 128. Tenant Isolation

If Fastify-MasterApp becomes multi-tenant, events should carry tenant context where necessary.

Example:

```json
{
  "tenantId": "tenant_123",
  "aggregateId": "usr_456"
}
```

Consumers must enforce tenant boundaries.

Never allow:

```text
event tenant A
    ↓
consumer reads tenant B data
```

Use repository/service authorization and tenant-aware queries.

---

# 129. Event Payload and PII

Minimize personal data.

Prefer:

```json
{
  "userId": "usr_123"
}
```

over:

```json
{
  "name": "...",
  "email": "...",
  "phone": "...",
  "address": "..."
}
```

If a consumer needs the information, retrieve it securely from the source of truth.

---

# 130. Event Encryption

If sensitive event payloads must be transported or stored:

- Use encrypted Redis/network transport.
- Encrypt durable archives where required.
- Manage encryption keys through approved secret/key management.
- Restrict decryption permissions.
- Avoid unnecessary sensitive fields.

Encryption should complement data minimization.

---

# 131. Event Access Control

Operational tooling should enforce RBAC.

Example permissions:

```text
events.read
events.replay
events.retry
events.inspect
events.archive
```

Do not allow ordinary administrators to replay arbitrary events.

Replay can trigger real business side effects.

---

# 132. Replay Authorization

A replay action should record:

```text
actor
event ID
consumer
reason
timestamp
result
```

This should become an audit event.

---

# 133. Event Replay Safety Levels

Recommended classification:

```text
SAFE
GUARDED
UNSAFE
```

### SAFE

Derived-state rebuild.

### GUARDED

Consumer uses durable idempotency.

### UNSAFE

Irreversible side effect.

Replay tooling should refuse unsafe operations by default.

---

# 134. Event Archival and Compliance

Retention should follow:

- Product requirements.
- Security policy.
- Privacy requirements.
- Legal requirements.
- Operational needs.

Do not retain event payloads indefinitely simply because storage is cheap.

---

# 135. Data Deletion

Event systems complicate deletion because historical payloads may contain personal data.

Therefore:

- Minimize PII.
- Prefer IDs.
- Define retention.
- Support deletion/anonymization where required.
- Avoid copying personal data unnecessarily.
- Document immutable audit requirements separately.

---

# 136. Eventual Consistency in Admin UI

The Admin frontend should understand async workflows.

Example:

```text
User created
   ↓
User page shows:
Created ✓
Search indexing…
Email pending…
```

Use TanStack Query polling or appropriate refresh mechanisms for long-running status.

Do not expose queue internals.

---

# 137. Notifications to Admin Users

For important background operations, the backend may provide:

```text
GET /api/v1/jobs/:id
```

or domain-specific resources:

```text
GET /api/v1/exports/:id
```

Prefer domain-specific resources when the operation is business-visible.

---

# 138. Event-Driven Dashboard Metrics

Admin dashboard may show:

```text
Jobs pending
Jobs failed
Reports processing
Webhook failures
Import progress
```

These should be derived from application-level records and safe operational metrics.

Avoid making the Admin UI directly dependent on Redis internals.

---

# 139. Event-Driven Imports

Example:

```text
POST /imports
   ↓
Import record
   ↓
import.requested
   ↓
Import worker
   ↓
import.completed
```

Events can separate:

```text
upload
validation
processing
completion
notification
```

---

# 140. Event-Driven Exports

Example:

```text
POST /exports
   ↓
Export record
   ↓
export.requested
   ↓
Worker
   ↓
Object storage
   ↓
export.completed
```

The completion event can trigger:

```text
notification
audit
analytics
```

---

# 141. Event-Driven Webhooks

```text
order.paid
    ↓
Webhook consumer
    ↓
create delivery record
    ↓
webhook queue
    ↓
HTTP delivery
    ↓
success/retry/dead-letter
```

Keep webhook delivery state in PostgreSQL.

---

# 142. Event-Driven Search

```text
entity.updated
    ↓
search projection consumer
    ↓
search index
```

If the index becomes corrupted:

```text
replay events
    ↓
rebuild index
```

This is a strong use case for replayable events.

---

# 143. Event-Driven Analytics

Analytics events can be asynchronous:

```text
business event
    ↓
analytics consumer
    ↓
analytics store
```

Analytics failure should not normally block the business transaction.

---

# 144. Event-Driven Integrations

For CRM/payment/third-party systems:

```text
business event
      ↓
integration consumer
      ↓
external API
      ↓
success/retry/dead-letter
```

Use provider-specific:

- Authentication.
- Rate limits.
- Timeouts.
- Idempotency.
- Circuit breakers.

---

# 145. Event-Driven Cache Invalidation

Example:

```text
role.updated
   ↓
authorization cache invalidation
```

Security-sensitive cache invalidation should fail safe.

If invalidation cannot be guaranteed, authorization should not trust stale permissions indefinitely.

---

# 146. Event-Driven Configuration Changes

Configuration changes can produce:

```text
settings.updated
```

Consumers may invalidate cached configuration.

Do not put secrets into generic configuration events.

---

# 147. Event-Driven Feature Flags

Feature flag changes can produce:

```text
feature-flag.updated
```

Consumers can invalidate local caches.

But security-critical feature decisions should fail safely if the flag service becomes unavailable.

---

# 148. Event Storming as a Design Tool

Before adding many events, map the domain:

```text
Commands
   ↓
Business decisions
   ↓
Events
   ↓
Consumers
```

Example:

```text
Create Order
    ↓
Order Created
    ↓
Request Payment
    ↓
Payment Completed
    ↓
Order Paid
    ↓
Start Fulfillment
```

This helps distinguish actual domain facts from implementation details.

---

# 149. Event Catalog Governance

Every new event should answer:

1. Why does this event exist?
2. Who owns it?
3. Who consumes it?
4. What business fact does it represent?
5. What is its delivery guarantee?
6. Is it replayable?
7. Does it contain sensitive data?
8. How does it evolve?
9. What happens if consumers fail?

If these cannot be answered, the event may be premature.

---

# 150. Architecture Review Checklist

Before introducing an event:

### Business

- [ ] Represents a meaningful business fact.
- [ ] Consumer genuinely benefits from decoupling.
- [ ] Eventual consistency is acceptable.

### Reliability

- [ ] Delivery semantics are defined.
- [ ] Idempotency is defined.
- [ ] Retry policy exists.
- [ ] Dead-letter behavior exists.
- [ ] Outbox is used when required.

### Contract

- [ ] Event name is stable.
- [ ] Version is defined.
- [ ] Payload is explicit.
- [ ] Schema validation exists.
- [ ] Compatibility strategy exists.

### Security

- [ ] Payload is minimized.
- [ ] No secrets are included.
- [ ] PII is justified.
- [ ] Consumer access is controlled.
- [ ] Replay permissions are restricted.

### Operations

- [ ] Owner exists.
- [ ] Metrics exist.
- [ ] Logs exist.
- [ ] Alerts exist where needed.
- [ ] Runbook exists.

### Testing

- [ ] Producer tests.
- [ ] Consumer tests.
- [ ] Contract tests.
- [ ] Retry tests.
- [ ] Idempotency tests.
- [ ] Failure/recovery tests.

---

# 151. Implementation Roadmap

## Phase 1 — Event Foundation

Implement:

- Event envelope.
- Event naming convention.
- Event registry.
- Event validation.
- Correlation IDs.
- Basic publisher interface.

## Phase 2 — Outbox

Implement:

- `outbox_events`.
- Transactional creation.
- Publisher worker.
- Safe claiming.
- Retry.
- Metrics.

## Phase 3 — First Event

Implement:

```text
users.registered
```

Consumers:

```text
welcome email
```

## Phase 4 — Reliability

Add:

- Consumer idempotency.
- Processed-event records.
- Dead-letter handling.
- Retry classification.
- Operational dashboards.

## Phase 5 — More Consumers

Add:

```text
search
webhooks
analytics
notifications
```

only where useful.

## Phase 6 — Replay

Add:

- Durable event history if required.
- Replay-safe consumer classification.
- Controlled replay tooling.

## Phase 7 — Advanced Event Platform

Only if justified:

- Multiple event transports.
- Dedicated event streaming.
- Partitioning.
- Advanced projections.
- Event archive.
- Cross-service event contracts.

---

# 152. Recommended Initial Event Set

Start small.

Potential initial events:

```text
users.registered
users.email_verified
users.password_changed

roles.assigned
roles.removed

orders.created
orders.paid
orders.cancelled

reports.requested
reports.completed
reports.failed

imports.completed
exports.completed
```

Not every event needs to exist immediately.

Add events when there is a real consumer or a clear architectural requirement.

---

# 153. Recommended Initial Consumers

Start with:

```text
users.registered
    └── welcome-email consumer

users.email_verified
    └── notification consumer

reports.completed
    └── notification consumer

orders.paid
    └── webhook/integration consumer
```

Expand gradually.

---

# 154. Event Architecture with Existing Queue Architecture

The relationship should be:

```text
             Business Domain
                   │
                   ▼
              Domain Event
                   │
                   ▼
             Transactional
                Outbox
                   │
                   ▼
             Event Publisher
                   │
                   ▼
              Redis/BullMQ
                   │
          ┌────────┼─────────┐
          ▼        ▼         ▼
       Consumer Consumer  Consumer
          │        │         │
          ▼        ▼         ▼
       Job/IO    Search    Webhook
```

`QUEUE_ARCHITECTURE.md` describes execution.

This document describes event semantics and event flow.

---

# 155. Relationship to Background Jobs

Events and jobs complement each other.

```text
Event:
"Order was paid."

Job:
"Send fulfillment request."
```

A useful architecture is:

```text
Event
  ↓
Consumer
  ↓
Job
  ↓
Worker
```

But avoid unnecessary layers.

If a queued event can safely be processed directly by one worker, use the simpler design.

---

# 156. Relationship to Audit Logging

Audit logging and event processing should remain separate concerns.

```text
Business transaction
   ├── audit record
   └── outbox event
```

Then:

```text
event
 ├── notification
 ├── analytics
 └── integration
```

Audit records provide accountability.

Events provide asynchronous communication.

One should not replace the other.

---

# 157. Relationship to Caching

Events can trigger invalidation:

```text
user.updated
   ↓
cache.invalidate(user)
```

But cache state remains derived.

```text
PostgreSQL
   ↓ source of truth
Redis
   ↓ derived state
```

Do not make event processing the only mechanism through which critical business state becomes durable.

---

# 158. Relationship to API Versioning

Event contracts require their own compatibility strategy.

The API can evolve:

```text
/api/v1
/api/v2
```

while events remain:

```text
users.registered v1
```

until their consumers require a new schema.

Do not couple API version numbers to event version numbers.

---

# 159. Relationship to RBAC

Authorization happens before producing sensitive commands/events.

For example:

```text
Admin
 ↓
RBAC
 ↓
Suspend user
 ↓
transaction
 ↓
user.suspended
```

Consumers should not bypass domain authorization rules simply because an event exists.

---

# 160. Relationship to Security

The event system is part of the application's security boundary.

Threats include:

- Event tampering.
- Unauthorized replay.
- Payload data leakage.
- Malicious external events.
- SSRF through event payloads.
- Poison events.
- Queue flooding.
- Credential leakage.
- Cross-tenant event processing.

Use the same defense-in-depth principles defined in `SECURITY.md`.

---

# 161. Event-Driven Incident Response

During an incident, inspect:

```text
outbox backlog
queue depth
queue lag
consumer failures
dead-letter count
event versions
external dependency health
database health
Redis health
```

Determine whether the issue is:

```text
producer
outbox
publisher
queue
consumer
dependency
database
```

This decomposition speeds diagnosis.

---

# 162. Event Incident Runbook

When events stop processing:

1. Check Redis.
2. Check worker health.
3. Check queue depth.
4. Check queue lag.
5. Check dead-letter growth.
6. Check consumer errors.
7. Check PostgreSQL.
8. Check external dependencies.
9. Check recent deployments.
10. Pause non-critical workloads if necessary.
11. Preserve evidence.
12. Recover gradually.
13. Reconcile business state.
14. Document the incident.

---

# 163. Recovery Principles

Recovery should be:

```text
controlled
observable
idempotent
reversible where possible
```

Do not immediately replay the entire backlog after fixing a dependency.

Start with:

```text
small batch
 ↓
observe
 ↓
increase gradually
```

---

# 164. Disaster Recovery

A disaster recovery plan should account for:

```text
PostgreSQL
Redis
Outbox
Event history
Object storage
Worker deployment
```

The critical distinction is:

```text
PostgreSQL loss
```

is fundamentally different from:

```text
Redis queue loss
```

If the architecture uses an outbox, durable business intent can often be republished after Redis recovery.

---

# 165. Backup Strategy

Back up:

- PostgreSQL business data.
- Outbox records.
- Durable event history if required.
- Business operation records.

Do not assume Redis backups alone can reconstruct business truth.

---

# 166. Reconciliation

For important event-driven systems, provide reconciliation jobs.

Example:

```text
PostgreSQL orders
       ↓
compare
       ↓
webhook delivery records
```

or:

```text
PostgreSQL users
       ↓
compare
       ↓
search index
```

Reconciliation can detect missed or corrupted derived state.

---

# 167. Operational Reconciliation

Examples:

```text
Find orders paid but not fulfilled.

Find exports marked complete but missing files.

Find users missing from search.

Find outbox events stuck beyond threshold.

Find dead-letter events older than SLA.
```

These checks are often more valuable than complex event infrastructure.

---

# 168. Avoid Event-Driven Overengineering

Do not convert:

```text
function A()
  → function B()
```

into:

```text
A event
 → Redis
 → queue
 → worker
 → B event
 → queue
 → worker
 → C
```

when everything must happen immediately inside one transaction.

Events are valuable where decoupling creates a real benefit.

---

# 169. Event-Driven Architecture Decision Rule

Before creating an event, ask:

```text
Does another component need to react independently?
        │
       yes
        ↓
Can it be asynchronous?
        │
       yes
        ↓
Is eventual consistency acceptable?
        │
       yes
        ↓
Use an event.
```

If any answer is no, consider a direct service call or synchronous transaction.

---

# 170. Final Target Architecture

```text
                         ┌──────────────────────┐
                         │      React Admin     │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │     Fastify API      │
                         │ Auth / RBAC / HTTP   │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Application Services │
                         └──────────┬───────────┘
                                    │
                              DB Transaction
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                     ▼                             ▼
               Business State                 Outbox Event
               PostgreSQL                         │
                     │                            │
                     │                            ▼
                     │                    Outbox Publisher
                     │                            │
                     │                            ▼
                     │                       Redis/BullMQ
                     │                            │
          ┌──────────┼─────────────┬──────────────┼──────────┐
          ▼          ▼             ▼              ▼          ▼
       Email      Search       Webhooks       Reports    Analytics
      Consumer   Consumer      Consumer       Consumer   Consumer
          │          │             │              │
          ▼          ▼             ▼              ▼
      Provider    Index        External API   Object Store
```

---

# 171. Golden Rules

1. **Events describe facts; commands request actions.**
2. **PostgreSQL remains the source of truth.**
3. **Use the transactional outbox for critical DB + event dual writes.**
4. **Assume at-least-once delivery.**
5. **Make every important consumer idempotent.**
6. **Never assume global event ordering.**
7. **Version durable event contracts.**
8. **Keep payloads small and explicit.**
9. **Never put secrets in events.**
10. **Minimize PII.**
11. **Validate every event before processing.**
12. **Do not retry permanent failures.**
13. **Use exponential backoff and jitter.**
14. **Dead-letter poison events.**
15. **Keep consumers independently observable.**
16. **Isolate workloads with different dependencies or SLOs.**
17. **Do not use Redis as business storage.**
18. **Do not treat queue state as business state.**
19. **Make replay an explicit capability, not an assumption.**
20. **Never replay irreversible side effects without safeguards.**
21. **Propagate correlation and causation context.**
22. **Protect event ingestion from unauthorized producers.**
23. **Audit privileged replay and operational actions.**
24. **Use events to reduce meaningful coupling, not to add ceremony.**
25. **Do not introduce event sourcing or Kafka-like infrastructure without evidence.**
26. **Prefer a modular monolith with asynchronous workers until scale or ownership requires more.**
27. **Monitor outbox age, queue lag, consumer latency, retries, and dead letters.**
28. **Test duplicate delivery, failures, retries, deployment compatibility, and recovery.**
29. **Design reconciliation paths for important derived state.**
30. **Keep event semantics stable and business-oriented.**

---

# 172. Definition of Done

An event-driven workflow is production-ready when:

### Event Design

- [ ] Event represents a meaningful business fact.
- [ ] Event has an owner.
- [ ] Event name is stable.
- [ ] Event version is defined.
- [ ] Payload is explicitly typed.
- [ ] Runtime validation exists.
- [ ] Sensitive data is minimized.

### Reliability

- [ ] Delivery semantics are documented.
- [ ] Outbox is used when required.
- [ ] Consumer is idempotent.
- [ ] Retry policy is defined.
- [ ] Permanent failures are not retried forever.
- [ ] Dead-letter handling exists.
- [ ] Recovery is documented.

### Compatibility

- [ ] Producer/consumer compatibility is understood.
- [ ] Old event versions can be handled during rollout.
- [ ] Deployment order is documented.
- [ ] Breaking changes have a migration plan.

### Observability

- [ ] Event publication is measurable.
- [ ] Queue lag is measurable.
- [ ] Consumer duration is measurable.
- [ ] Failures are logged.
- [ ] Dead-letter events are visible.
- [ ] Correlation IDs are propagated.
- [ ] Alerts exist for business-critical workflows.

### Security

- [ ] Event transport is protected.
- [ ] Worker permissions follow least privilege.
- [ ] Secrets are absent from payloads.
- [ ] PII is minimized.
- [ ] External events are authenticated.
- [ ] Replay operations are RBAC-protected.
- [ ] Privileged operations are audited.

### Testing

- [ ] Producer tests exist.
- [ ] Consumer tests exist.
- [ ] Contract tests exist.
- [ ] Duplicate delivery is tested.
- [ ] Retry behavior is tested.
- [ ] Dead-letter behavior is tested.
- [ ] Outbox behavior is tested.
- [ ] Failure/recovery is tested.
- [ ] Critical end-to-end workflows are tested.

---

# 173. Final Recommendation

Fastify-MasterApp should adopt event-driven architecture incrementally.

The recommended model is:

```text
Business transaction
       ↓
PostgreSQL + Outbox
       ↓
Event Publisher
       ↓
Redis/BullMQ
       ↓
Idempotent Consumers
       ↓
Async Side Effects
```

Keep the system intentionally simple:

```text
Modular Monolith
       +
Transactional Outbox
       +
BullMQ Workers
       +
Typed Event Contracts
       +
Idempotent Consumers
       +
Strong Observability
```

Only move toward a dedicated event streaming platform or independent event-driven services when there is measurable evidence that the current architecture cannot satisfy:

- Throughput.
- Isolation.
- Reliability.
- Ownership.
- Deployment independence.
- Integration requirements.

The objective is not to maximize the number of events.

The objective is to create **reliable boundaries around meaningful business facts while keeping the system understandable and recoverable**.
