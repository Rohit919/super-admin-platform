# Integrations

> Production-grade integration architecture and implementation guide for Fastify-MasterApp.

## 1. Purpose

Fastify-MasterApp is designed as a modular monolith with a clear boundary between internal application modules and external systems.

This document defines how external integrations should be designed, implemented, secured, tested, observed, deployed, and retired.

The goal is not to connect every possible provider. The goal is to make integrations:

- reliable
- secure
- observable
- testable
- replaceable
- idempotent
- resilient to provider failures
- compatible with background jobs
- safe for retries
- easy to operate

The primary rule is:

> **External systems are dependencies, not sources of application architecture.**

The application owns its business rules and durable state. Providers perform specialized external work.

---

# 2. Integration Principles

## 2.1 Keep provider code behind an application boundary

Business logic should not directly depend on provider SDKs.

Prefer:

```text
Route
  ↓
Service / Orchestrator
  ↓
Integration Interface
  ↓
Provider Adapter
  ↓
External API
```

Avoid:

```text
Route
  ↓
Provider SDK
  ↓
Business logic
```

This allows the provider to be replaced without rewriting the application.

---

## 2.2 PostgreSQL remains the business source of truth

External providers should not become the authoritative source for core business state unless the domain explicitly requires it.

For example:

```text
PostgreSQL
  order.status = paid

External payment provider
  payment transaction = succeeded
```

The application should reconcile the two states rather than blindly assuming an API response is permanent truth.

---

## 2.3 Treat external APIs as unreliable

Every external dependency can:

- time out
- return 5xx errors
- return malformed data
- rate-limit requests
- change behavior
- become unavailable
- return duplicate events
- process a request but lose the response
- return success followed by delayed failure
- change authentication credentials
- introduce breaking API changes

Integration code must be designed for these cases.

---

## 2.4 Never assume exactly-once delivery

Network systems generally provide weaker guarantees than business workflows need.

Assume:

```text
request may be retried
response may be lost
webhook may be duplicated
job may execute more than once
consumer may restart
provider may resend events
```

Therefore:

> **All important external operations must have an idempotency strategy.**

---

# 3. Integration Categories

Fastify-MasterApp may eventually integrate with:

| Category           | Examples                      |
| ------------------ | ----------------------------- |
| Payments           | payment processors            |
| Email              | transactional email providers |
| SMS                | messaging providers           |
| Storage            | object storage                |
| Identity           | OAuth/OIDC providers          |
| Analytics          | product analytics             |
| Search             | search engines                |
| Monitoring         | external telemetry            |
| AI                 | model APIs                    |
| CRM                | customer systems              |
| ERP                | enterprise systems            |
| Webhooks           | inbound/outbound events       |
| Shipping           | logistics providers           |
| Notifications      | push providers                |
| Tax                | tax calculation services      |
| Maps               | geocoding/distance providers  |
| Feature management | feature flag platforms        |

Only add an integration when the product requires it.

---

# 4. Integration Architecture

Recommended architecture:

```text
                         ┌──────────────────────┐
                         │ React Admin          │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Fastify API          │
                         └──────────┬───────────┘
                                    │
                           Service / Orchestrator
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
                ▼                   ▼                   ▼
        Integration Port     Domain Service       Queue Producer
                │                                       │
                ▼                                       ▼
        Provider Adapter                              BullMQ
                │                                       │
                ▼                                       ▼
        External API                              Worker Adapter
                                                        │
                                                        ▼
                                                External API

PostgreSQL ───────────────────────────────────────────────┐
   ▲                                                       │
   │                                                       ▼
   └──────── durable business state ◄──────── integration results
```

---

# 5. Ports and Adapters

Use an integration port to describe what the application needs.

Example:

```ts
export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
```

Provider-specific implementation:

```ts
export class ProviderEmailAdapter implements EmailProvider {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    // provider-specific implementation
  }
}
```

The service depends on the interface:

```ts
export class NotificationService {
  constructor(private readonly emailProvider: EmailProvider) {}
}
```

This prevents provider-specific concepts from leaking into business code.

---

# 6. Integration Directory Structure

Recommended:

```text
apps/api/src/
├── integrations/
│   ├── email/
│   │   ├── email.port.ts
│   │   ├── email.types.ts
│   │   ├── email.errors.ts
│   │   ├── email.service.ts
│   │   ├── providers/
│   │   │   ├── provider-a.adapter.ts
│   │   │   └── provider-b.adapter.ts
│   │   └── index.ts
│   │
│   ├── payments/
│   │   ├── payments.port.ts
│   │   ├── payments.types.ts
│   │   ├── payments.errors.ts
│   │   ├── payments.service.ts
│   │   ├── providers/
│   │   └── index.ts
│   │
│   ├── storage/
│   ├── sms/
│   ├── identity/
│   └── webhooks/
│
├── modules/
├── services/
├── repositories/
├── workers/
└── plugins/
```

Keep each integration self-contained.

---

# 7. Provider-Neutral Types

Do not expose provider SDK types throughout the application.

Bad:

```ts
function sendEmail(
  request: ProviderSdkSendRequest,
): Promise<ProviderSdkResponse>;
```

Preferred:

```ts
interface SendEmailInput {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  idempotencyKey?: string;
}
```

The adapter translates internal types into provider-specific types.

---

# 8. Integration Configuration

Configuration should be centralized.

Example:

```text
EMAIL_PROVIDER
EMAIL_API_KEY
EMAIL_FROM
EMAIL_REPLY_TO

PAYMENT_PROVIDER
PAYMENT_API_KEY
PAYMENT_WEBHOOK_SECRET

STORAGE_PROVIDER
STORAGE_BUCKET
STORAGE_REGION
STORAGE_ACCESS_KEY
STORAGE_SECRET_KEY
```

Do not access `process.env` throughout integration code.

Prefer:

```ts
config.integrations.email.apiKey;
```

This provides:

- startup validation
- typed configuration
- consistent defaults
- easier testing
- safer secret handling

---

# 9. Secret Management

Integration secrets are credentials.

Never:

- commit secrets
- print secrets
- include secrets in errors
- include API keys in audit metadata
- send secrets to the frontend
- store provider credentials in source code
- place credentials in Docker images

Production credentials should come from a secret-management mechanism appropriate to the deployment environment.

---

# 10. Secret Rotation

Every integration should support credential rotation.

Recommended process:

```text
Create new credential
       ↓
Deploy configuration
       ↓
Validate new credential
       ↓
Observe traffic
       ↓
Revoke old credential
```

Where supported, allow overlapping credentials during rotation.

---

# 11. HTTP Client Boundary

External HTTP calls should go through a controlled client layer.

The client should provide:

- timeout
- retry policy
- structured logging
- request ID propagation where appropriate
- response validation
- safe error mapping
- metrics
- tracing
- connection reuse
- cancellation

Avoid creating arbitrary HTTP requests throughout business services.

---

# 12. Timeouts

Every external request must have an explicit timeout.

Never rely on an infinite/default timeout.

Example policy:

```text
Fast API request:
  short timeout

Background job:
  longer timeout

Large export:
  asynchronous workflow

Webhook acknowledgement:
  very short timeout
```

Timeouts should reflect business behavior, not provider marketing claims.

---

# 13. Retry Policy

Retry only failures that are likely to succeed later.

Usually retryable:

- connection reset
- temporary DNS failure
- timeout
- HTTP 429
- selected 5xx responses

Usually not retryable:

- invalid credentials
- malformed request
- authorization failure
- invalid resource
- business validation failure
- unsupported operation

---

# 14. Exponential Backoff

Recommended:

```text
attempt 1 → immediate / short delay
attempt 2 → increasing delay
attempt 3 → larger delay
attempt 4 → larger delay
```

Add jitter:

```text
delay = exponential_backoff + random_jitter
```

This prevents many workers from retrying simultaneously.

---

# 15. Retry Budgets

Do not retry forever.

Define:

- maximum attempts
- maximum elapsed time
- maximum provider load
- dead-letter behavior

A retry policy must have a terminal state.

---

# 16. Idempotency

Idempotency is mandatory for operations where duplicate execution can cause harm.

Examples:

- charging a payment
- creating an external customer
- sending a notification
- creating a shipping label
- submitting an order
- provisioning a resource

Use a stable business operation identifier.

Example:

```text
payment:create:order_123
```

or:

```text
notification:welcome:user_123
```

Do not generate a new idempotency key for every retry.

---

# 17. Idempotency Lifecycle

Preferred:

```text
Create operation record
        ↓
Generate stable idempotency key
        ↓
Call provider
        ↓
Persist provider result
        ↓
Mark operation completed
```

If the request times out:

```text
Unknown provider state
        ↓
Do not blindly create another operation
        ↓
Query/reconcile using idempotency key
```

---

# 18. Integration Operation Records

For important integrations, maintain a durable operation record.

Possible fields:

```text
id
integration
operation
internal_resource_id
idempotency_key
provider_reference
status
attempt_count
last_attempt_at
completed_at
failure_code
created_at
updated_at
```

This provides operational visibility and recovery capability.

---

# 19. Integration Status Model

Prefer explicit states.

Example:

```text
PENDING
PROCESSING
SUCCEEDED
FAILED
RETRYING
UNKNOWN
CANCELLED
```

Do not reduce complex external workflows to a boolean.

---

# 20. Unknown State

One of the most important integration states is:

```text
UNKNOWN
```

Example:

```text
Application → Provider
Provider processes payment
Network connection fails
Application receives no response
```

The application cannot safely assume failure.

The correct action may be:

```text
UNKNOWN
   ↓
reconcile/query provider
   ↓
SUCCEEDED or FAILED
```

---

# 21. Reconciliation

Critical integrations should have reconciliation workflows.

Examples:

```text
PostgreSQL orders
       ↕
Payment provider

PostgreSQL shipments
       ↕
Shipping provider

PostgreSQL files
       ↕
Object storage
```

Reconciliation detects:

- missing provider objects
- unexpected provider objects
- state mismatches
- duplicate operations
- delayed webhooks
- failed synchronization

---

# 22. Background Jobs

Long-running or failure-prone integrations should generally run asynchronously.

Prefer:

```text
API request
  ↓
Validate
  ↓
Persist intent
  ↓
Enqueue job
  ↓
Return accepted/result
  ↓
Worker calls provider
```

Avoid:

```text
HTTP request
  ↓
multiple external APIs
  ↓
long synchronous request
```

See `BACKGROUND_JOBS.md` and `QUEUE_ARCHITECTURE.md` for worker design.

---

# 23. Transactional Outbox

When a database mutation and external work must be coordinated:

```text
DB transaction
 ├── update business record
 └── insert outbox event

Commit
  ↓
Publisher
  ↓
Queue
  ↓
Worker
  ↓
External provider
```

This prevents:

```text
database update succeeds
external job enqueue fails
```

from silently losing required work.

---

# 24. Webhook Architecture

Inbound webhooks are untrusted external input.

Recommended:

```text
Provider
   ↓
Webhook endpoint
   ↓
Verify signature
   ↓
Validate schema
   ↓
Check timestamp/replay
   ↓
Persist event
   ↓
Acknowledge
   ↓
Process asynchronously
```

Do not perform heavy business processing before acknowledging a provider webhook unless required.

---

# 25. Webhook Signature Verification

Webhook authenticity must be verified before trusting the payload.

Typical mechanisms:

- HMAC
- asymmetric signatures
- provider SDK verification
- signed timestamps
- signed request bodies

Verification must use the exact raw request payload where required.

---

# 26. Webhook Replay Protection

A valid signature does not necessarily mean a request is fresh.

Use:

- provider event ID
- timestamp tolerance
- processed-event table
- idempotency key
- event hash where appropriate

Example:

```text
event_id = evt_123

already processed?
  yes → acknowledge and stop
  no  → persist/process
```

---

# 27. Webhook Event Storage

For important providers, persist the received event.

Possible fields:

```text
id
provider
provider_event_id
event_type
received_at
signature_verified
processing_status
processed_at
failure_reason
payload_reference
```

Avoid storing unnecessary sensitive payload data.

---

# 28. Webhook Processing

Separate acknowledgement from processing.

```text
POST /webhooks/provider

verify
validate
persist
enqueue
return 2xx
```

Worker:

```text
consume
  ↓
validate stored event
  ↓
apply business transition
  ↓
record result
```

---

# 29. Outbound Webhooks

If Fastify-MasterApp sends webhooks to customers:

```text
Domain event
   ↓
Outbox
   ↓
Webhook delivery job
   ↓
HTTP client
   ↓
Customer endpoint
```

Support:

- signing
- event IDs
- timestamps
- retries
- exponential backoff
- delivery history
- idempotency
- timeout
- dead-letter state
- replay
- endpoint disablement

---

# 30. Webhook Signing

Use a signing secret per endpoint when appropriate.

Conceptually:

```text
signature = HMAC(secret, timestamp + "." + body)
```

Include:

```text
event ID
timestamp
signature
event type
```

Consumers should be able to detect replay and duplicate delivery.

---

# 31. Integration Error Model

Do not expose provider-specific errors directly.

Bad:

```json
{
  "error": "StripeInvalidRequestError"
}
```

Preferred:

```json
{
  "error": {
    "code": "PAYMENT_PROVIDER_UNAVAILABLE",
    "message": "Payment processing is temporarily unavailable.",
    "requestId": "req_123"
  }
}
```

Internal logs can retain the provider-specific cause.

---

# 32. Error Classification

Create a normalized error taxonomy.

Example:

```text
IntegrationError
├── IntegrationTimeoutError
├── IntegrationRateLimitError
├── IntegrationAuthenticationError
├── IntegrationValidationError
├── IntegrationNotFoundError
├── IntegrationConflictError
├── IntegrationUnavailableError
├── IntegrationBusinessError
└── IntegrationUnknownStateError
```

Business services should reason about normalized errors.

---

# 33. Rate Limits

Providers commonly impose rate limits.

The integration layer should understand:

- requests per second
- requests per minute
- concurrency limits
- daily quotas
- account limits

Respect provider signals such as:

```text
HTTP 429
Retry-After
provider-specific quota headers
```

Do not blindly retry rate-limit failures immediately.

---

# 34. Concurrency Control

If a provider has strict limits:

```text
Worker pool
   ↓
Concurrency limiter
   ↓
Provider
```

Protect both:

- your application
- the provider account

Concurrency may need to be configured per integration.

---

# 35. Circuit Breaker

A circuit breaker can protect the application when an external provider is repeatedly failing.

States:

```text
CLOSED
  ↓ failures
OPEN
  ↓ timeout
HALF_OPEN
  ↓ success
CLOSED
```

Use circuit breakers selectively.

Do not hide persistent provider failures behind an arbitrary breaker.

---

# 36. Bulkheads

Separate workloads that should not affect each other.

Example:

```text
Payment workers
Email workers
Export workers
Webhook workers
```

A flood of email jobs should not consume every worker needed for payments.

---

# 37. Provider SDK Policy

SDKs are useful but should be isolated.

Recommended:

```text
Integration adapter
    ↓
Provider SDK
```

Not:

```text
Domain service
    ↓
Provider SDK
```

Provider SDK upgrades should therefore have a limited blast radius.

---

# 38. Provider Abstraction

Do not abstract every provider prematurely.

Good abstraction:

```ts
interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
```

Bad abstraction:

```ts
interface UniversalProvider {
  createAnything(): Promise<unknown>;
}
```

Abstract business capabilities, not imaginary universality.

---

# 39. Email Integration

Recommended email flow:

```text
Application event
   ↓
Notification service
   ↓
Outbox
   ↓
Email job
   ↓
Email adapter
   ↓
Provider
```

Track:

- template
- recipient
- provider message ID
- status
- attempts
- timestamps

Never log full email contents unnecessarily.

---

# 40. Email Templates

Keep templates versioned.

Example:

```text
welcome.v1
password-reset.v1
email-verification.v1
order-confirmation.v1
```

Do not build important transactional emails entirely inside route handlers.

---

# 41. Payment Integration

Payments require stronger guarantees.

Recommended model:

```text
Order
PaymentIntent
PaymentAttempt
ProviderTransaction
```

Do not rely solely on:

```text
order.isPaid = true
```

Track provider references and state transitions.

---

# 42. Payment State Machine

Example:

```text
PENDING
  ↓
PROCESSING
  ├──→ SUCCEEDED
  ├──→ FAILED
  └──→ UNKNOWN
```

Terminal states should be carefully defined.

Never allow arbitrary state transitions.

---

# 43. Payment Webhooks

Payment providers frequently use webhooks as an authoritative asynchronous signal.

Flow:

```text
Provider
   ↓
signed webhook
   ↓
deduplicate
   ↓
persist
   ↓
queue
   ↓
payment state transition
   ↓
audit event
```

Do not assume the browser returning from a payment page proves payment success.

---

# 44. Storage Integration

Object storage should be abstracted:

```ts
interface ObjectStorage {
  createUploadUrl(input: CreateUploadInput): Promise<UploadUrl>;
  getDownloadUrl(input: GetDownloadInput): Promise<DownloadUrl>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
}
```

The database should generally store metadata rather than large binary content.

---

# 45. Storage Security

Use:

- private buckets by default
- short-lived signed URLs
- content-type validation
- size limits
- filename sanitization
- malware scanning where required
- authorization before URL generation
- lifecycle policies
- encryption
- access logging

Never expose unrestricted buckets for convenience.

---

# 46. File Upload Flow

Recommended:

```text
Admin
  ↓
API authorization
  ↓
Upload intent
  ↓
Signed upload URL
  ↓
Object storage
  ↓
Verification/scan
  ↓
Database metadata
```

For large files, avoid proxying the entire file through the API unnecessarily.

---

# 47. OAuth / OIDC Integrations

For external identity providers:

```text
Browser
  ↓
Authorization endpoint
  ↓
Provider
  ↓
Callback
  ↓
Validate state
  ↓
Validate issuer
  ↓
Validate authorization response
  ↓
Resolve external identity
  ↓
Application session
```

Never trust an email address alone as proof of account identity.

Use stable provider subject identifiers.

---

# 48. OAuth Security

Protect against:

- CSRF
- authorization-code injection
- open redirects
- issuer confusion
- token substitution
- replay
- incorrect audience
- missing state validation

Store only the tokens and scopes actually required.

---

# 49. API Key Integrations

When Fastify-MasterApp calls a provider using an API key:

- store it as a secret
- never expose it to Admin
- never log it
- scope it narrowly
- rotate it
- monitor usage
- revoke compromised keys quickly

Prefer provider keys with least privilege.

---

# 50. External Identity Mapping

Use an explicit mapping:

```text
user_id
provider
provider_subject
created_at
updated_at
```

Avoid using provider email as the primary identity key.

Users may change email addresses.

---

# 51. External API Pagination

Do not assume provider pagination matches internal API pagination.

Adapter:

```text
Provider cursor
      ↓
internal pagination abstraction
```

Never expose provider-specific cursor semantics directly unless intentionally part of your public API.

---

# 52. External Search

If using an external search engine:

```text
PostgreSQL
   ↓
domain events
   ↓
indexing worker
   ↓
search engine
```

PostgreSQL remains the source of truth.

Search is a derived read model.

---

# 53. Search Consistency

Expect:

```text
Database updated
   ↓
event queued
   ↓
index updated later
```

Therefore search results may be eventually consistent.

Admin UI should tolerate this.

---

# 54. Analytics Integrations

Analytics events should not block user-facing requests unnecessarily.

Prefer:

```text
Application event
   ↓
analytics job
   ↓
analytics provider
```

Do not send sensitive information merely because an analytics provider accepts it.

---

# 55. AI Provider Integrations

AI integrations require additional controls.

Protect:

- API credentials
- prompt data
- user data
- uploaded files
- provider output
- cost
- token usage

Use:

- timeouts
- quotas
- model allowlists
- request limits
- output validation
- cost metrics
- PII minimization

Never assume model output is trusted business data.

---

# 56. AI Output Validation

If AI output controls application behavior:

```text
AI output
   ↓
schema validation
   ↓
business validation
   ↓
authorization
   ↓
action
```

Do not execute arbitrary model-generated commands.

---

# 57. External Data Validation

Provider responses are external input too.

Validate:

```text
HTTP response
  ↓
JSON parsing
  ↓
runtime schema validation
  ↓
normalized internal type
```

Do not trust TypeScript types alone.

---

# 58. TypeBox Integration Contracts

Use TypeBox or equivalent runtime schemas for important external payloads.

Example:

```ts
const ProviderResponseSchema = Type.Object({
  id: Type.String(),
  status: Type.String(),
});
```

Then validate the actual response before using it.

This prevents malformed provider responses from contaminating business logic.

---

# 59. Integration Contract Versioning

External providers may evolve.

Track:

- provider API version
- SDK version
- webhook version
- internal adapter version

Avoid mixing provider versions accidentally.

Example:

```text
payments/provider-x/v1
payments/provider-x/v2
```

Migration should be deliberate.

---

# 60. Provider API Changes

Before upgrading a provider:

1. Read release notes.
2. Identify breaking changes.
3. Review request/response differences.
4. Update adapter.
5. Update fixtures.
6. Run contract tests.
7. Test webhooks.
8. Deploy to staging.
9. Observe.
10. Roll forward or roll back safely.

---

# 61. Integration Testing Strategy

Each integration should have multiple test layers.

## Unit tests

Test:

- mapping
- normalization
- error classification
- retry decisions
- idempotency key generation
- signature generation/verification

## Contract tests

Test provider request/response assumptions.

## Integration tests

Use provider sandbox/test environments when available.

## Failure tests

Simulate:

- timeout
- 429
- 400
- 401
- 403
- 404
- 409
- 500
- malformed response
- connection failure

---

# 62. Mocking Policy

Mocks should be used to test application behavior.

Do not allow mocks to become the only evidence that an integration works.

Recommended hierarchy:

```text
Unit mocks
     +
HTTP contract fixtures
     +
Sandbox tests
     +
Production smoke/reconciliation
```

---

# 63. Fake Provider Implementations

For local development, use deterministic fakes.

Example:

```ts
class FakeEmailProvider implements EmailProvider {
  async send(input: SendEmailInput) {
    return {
      providerMessageId: `fake_${input.idempotencyKey}`,
      status: "sent",
    };
  }
}
```

Fakes should behave realistically enough to test application workflows.

---

# 64. Sandbox Environments

Where providers offer sandboxes:

```text
development → sandbox
staging → sandbox
production → production provider
```

Never accidentally use production credentials in development.

---

# 65. Integration Health Checks

Health checks should distinguish:

```text
application healthy
provider configured
provider reachable
provider operational
```

Do not make every readiness check call every external provider.

Otherwise one provider outage can make the entire application appear dead.

---

# 66. Active vs Passive Health Checks

Prefer passive monitoring for expensive integrations.

Example:

```text
provider latency
provider errors
queue backlog
recent successful operations
```

Use active checks only where they provide meaningful operational value.

---

# 67. Observability

Every integration should expose:

- request count
- success count
- failure count
- timeout count
- retry count
- rate-limit count
- latency
- queue delay
- webhook count
- webhook failures
- reconciliation mismatches

---

# 68. Metrics Naming

Example:

```text
integration_requests_total
integration_failures_total
integration_retries_total
integration_request_duration_seconds
integration_rate_limits_total
integration_webhook_events_total
integration_webhook_failures_total
integration_reconciliation_mismatches_total
```

Include safe labels such as:

```text
integration
operation
status
```

Avoid high-cardinality labels such as user IDs or arbitrary URLs.

---

# 69. Structured Logging

Example:

```json
{
  "level": "warn",
  "integration": "payments",
  "operation": "create_payment",
  "provider": "provider-a",
  "attempt": 2,
  "errorCode": "TIMEOUT",
  "requestId": "req_123"
}
```

Never include:

- API keys
- access tokens
- refresh tokens
- full card information
- passwords
- unnecessary personal data

---

# 70. Distributed Tracing

Propagate correlation information when appropriate.

Example:

```text
API request
  ↓
service
  ↓
queue
  ↓
worker
  ↓
integration
```

Useful attributes:

```text
integration
provider
operation
attempt
status
```

Do not put secrets into trace attributes.

---

# 71. Integration Dashboards

Recommended dashboard panels:

```text
Requests/min
Success %
p50 latency
p95 latency
p99 latency
429 rate
5xx rate
Timeout rate
Retry rate
Queue depth
Webhook failures
Unknown states
Reconciliation mismatches
```

---

# 72. Alerts

Alert on symptoms that matter.

Examples:

```text
Provider failure rate > threshold
Provider p95 latency > threshold
Queue backlog growing
Webhook failures increasing
Payment unknown states increasing
Credential authentication failures
Reconciliation mismatch detected
```

Avoid alerting on every individual transient failure.

---

# 73. Cost Monitoring

Integrations may create variable costs.

Track where applicable:

- requests
- tokens
- messages
- storage
- bandwidth
- search operations
- AI usage
- payment fees

Expose cost-related metrics without exposing sensitive business information.

---

# 74. Provider Quotas

Document provider quotas.

For each integration record:

```text
provider
quota
current usage
burst limit
recommended concurrency
reset period
```

The worker system should respect those constraints.

---

# 75. Backpressure

If provider capacity decreases:

```text
Provider slows
   ↓
workers retry
   ↓
queue grows
```

Do not respond by increasing workers indefinitely.

Use:

- concurrency limits
- queue rate limiting
- backoff
- prioritization
- dead-lettering
- operational alerts

---

# 76. Priority

Not every integration job is equally important.

Example:

```text
P0 Payment confirmation
P1 Security notification
P2 Transactional email
P3 Analytics event
P4 Report synchronization
```

Do not allow low-priority workloads to starve critical workflows.

---

# 77. Integration Isolation

Prefer separate queues when workloads have different operational characteristics.

Example:

```text
payments
notifications
webhooks
exports
sync
```

This creates natural bulkheads.

---

# 78. Provider Failover

Multi-provider failover should be introduced only when justified.

Possible strategy:

```text
Primary provider
      ↓ failure
Secondary provider
```

But failover is dangerous for operations that may already have succeeded.

For payment-like operations, never blindly retry against a second provider without understanding transaction state.

---

# 79. Active-Active Providers

If using multiple providers simultaneously:

- define routing rules
- define reconciliation
- define source of truth
- define idempotency
- define customer-visible semantics
- define failure ownership

Do not treat multiple providers as interchangeable unless the business semantics truly match.

---

# 80. Data Privacy

Only send the minimum data required by the provider.

Before adding an integration, document:

```text
What data leaves the system?
Why?
Where?
How long?
Who can access it?
Can it be deleted?
Can it be exported?
```

---

# 81. PII Minimization

Prefer:

```text
providerCustomerId
```

over repeatedly sending:

```text
full customer profile
```

Store provider references internally when possible.

---

# 82. Data Residency

If requirements exist around data location, document:

- provider region
- storage location
- processing location
- backup location
- sub-processors

Do not assume the provider's primary region determines all processing locations.

---

# 83. Integration Access Control

Integration administration belongs behind RBAC.

Examples:

```text
integrations.read
integrations.configure
integrations.test
integrations.rotate
integrations.replay
integrations.reconcile
```

Dangerous actions should require stronger authorization.

---

# 84. Admin Integration UI

A future Admin area may expose:

```text
Integrations
├── Provider status
├── Configuration status
├── Recent failures
├── Webhook deliveries
├── Queue state
├── Retry controls
├── Reconciliation
└── Credential rotation state
```

Never display secret values.

---

# 85. Test Connection

A "test connection" feature should:

- authorize the administrator
- use a safe provider operation
- avoid mutating business data
- record success/failure
- redact credentials
- rate-limit repeated attempts

Do not implement test connection by creating real customer transactions.

---

# 86. Manual Retry

Manual retries must be controlled.

Before retrying:

```text
Is operation safe?
Is it idempotent?
Could it duplicate external side effects?
Is provider state known?
```

Only expose manual retry when those questions have safe answers.

---

# 87. Replay

Webhook/event replay is powerful and dangerous.

Require:

- RBAC permission
- audit event
- event identity
- idempotency
- operator visibility
- safe retry semantics

Never provide unrestricted "replay everything".

---

# 88. Reconciliation Admin Workflow

Recommended:

```text
Find mismatches
   ↓
Inspect internal state
   ↓
Inspect provider reference
   ↓
Run reconciliation
   ↓
Preview proposed correction
   ↓
Authorize correction
   ↓
Apply
   ↓
Audit
```

Prefer preview-before-mutate for dangerous operations.

---

# 89. Integration Audit Events

Audit critical integration actions:

```text
integration.config.updated
integration.credential.rotated
integration.test.executed
integration.webhook.replayed
integration.operation.retried
integration.reconciliation.started
integration.reconciliation.corrected
```

Audit records should contain safe metadata only.

---

# 90. Failure Recovery

For every integration document:

```text
How is failure detected?
How is it retried?
What happens after max retries?
How is unknown state resolved?
How can operators inspect it?
How can operators recover it?
How is recovery audited?
```

If these answers do not exist, the integration is not operationally complete.

---

# 91. Dependency Failure Modes

Document:

```text
Provider unavailable
Provider slow
Provider rate limited
Credentials invalid
Provider schema changed
Webhook delayed
Webhook duplicated
Webhook missing
Queue unavailable
Database unavailable
DNS failure
TLS failure
```

Every critical integration should have an explicit response.

---

# 92. Incident Response

During provider incidents:

1. Confirm provider impact.
2. Check application metrics.
3. Determine affected operations.
4. Stop unsafe retries if necessary.
5. Preserve unknown-state operations.
6. Communicate impact.
7. Monitor provider recovery.
8. Reconcile.
9. Resume processing.
10. Verify business state.
11. Document the incident.

See `INCIDENT_RESPONSE.md`.

---

# 93. Credential Compromise

If an integration credential is compromised:

```text
Revoke credential
   ↓
Issue replacement
   ↓
Deploy replacement
   ↓
Check provider audit logs
   ↓
Check application activity
   ↓
Identify affected operations
   ↓
Rotate related secrets
   ↓
Audit
```

Treat compromised credentials as a security incident.

---

# 94. Provider Outage Runbook

Minimum runbook:

```text
1. Identify affected integration.
2. Check provider status.
3. Inspect failure/timeout metrics.
4. Determine whether requests are safe to retry.
5. Pause unsafe jobs if needed.
6. Preserve unknown states.
7. Monitor queue growth.
8. Communicate impact.
9. Resume gradually.
10. Reconcile.
```

---

# 95. DNS/TLS Failures

Do not immediately assume provider application failure.

Investigate:

```text
DNS resolution
TCP connection
TLS handshake
certificate validation
proxy/load balancer
network policy
provider endpoint
```

Observability should distinguish connection failures from HTTP failures.

---

# 96. Provider Maintenance

If provider maintenance is announced:

- review expected impact
- identify affected operations
- reduce unnecessary traffic
- prepare queue capacity
- verify fallback/recovery
- communicate internally
- monitor during maintenance
- reconcile afterward

---

# 97. Integration Deployment

Deployment should be safe even when provider configuration changes.

Prefer:

```text
Code deployed
      ↓
configuration validated
      ↓
integration enabled
      ↓
smoke test
      ↓
observe
```

Feature flags can help gradual activation.

---

# 98. Feature Flags

New integrations should often support:

```text
integration.enabled
integration.provider
integration.shadowMode
integration.rolloutPercentage
```

Do not leave feature flags permanently undocumented.

See `FEATURE_FLAGS.md`.

---

# 99. Shadow Mode

For high-risk provider migrations:

```text
Production request
   ├── Primary provider → real result
   └── New provider → shadow request
```

Only use shadowing when the operation is safe and does not create duplicate side effects.

---

# 100. Dual Writes

Dual writes are dangerous.

Example:

```text
Provider A
Provider B
```

If both create real resources, the system may create duplicates.

Prefer:

```text
primary
+
shadow/read-only validation
```

before enabling dual writes.

---

# 101. Provider Migration

Recommended:

```text
1. Define provider-neutral interface.
2. Implement current adapter.
3. Add new adapter.
4. Add contract tests.
5. Test sandbox.
6. Add routing flag.
7. Shadow where safe.
8. Gradually migrate.
9. Reconcile.
10. Disable old provider.
11. Remove old credentials.
12. Remove old code.
```

---

# 102. Integration Lifecycle

Every integration should have:

```text
PLANNED
  ↓
DEVELOPING
  ↓
TESTING
  ↓
STAGING
  ↓
ACTIVE
  ↓
DEPRECATED
  ↓
RETIRED
```

Do not leave abandoned credentials or code paths.

---

# 103. Integration Documentation

Each integration should have a provider-specific README containing:

```text
Purpose
Provider
Owner
Environment configuration
Required credentials
API version
SDK version
Supported operations
Timeouts
Retry policy
Rate limits
Idempotency
Webhook behavior
Failure modes
Monitoring
Runbooks
Testing
Data privacy
Provider documentation
Decommission plan
```

---

# 104. Integration Registry

Maintain a registry.

Example:

| Integration | Purpose                 | Criticality | Async | Webhooks | Owner    |
| ----------- | ----------------------- | ----------: | ----: | -------: | -------- |
| Email       | Transactional messaging |          P1 |   Yes | Optional | Platform |
| Payments    | Payment processing      |          P0 |   Yes |      Yes | Commerce |
| Storage     | File storage            |          P1 | Mixed |       No | Platform |
| Analytics   | Product analytics       |          P3 |   Yes |       No | Product  |

Criticality should influence:

- retry policy
- alerting
- worker isolation
- recovery requirements
- provider redundancy

---

# 105. Integration Criticality

Recommended levels:

```text
P0 — financial/security/business-critical
P1 — important customer workflow
P2 — operationally useful
P3 — non-critical enhancement
```

Examples:

```text
Payment processing → P0
Authentication provider → P0
Transactional email → P1
Search indexing → P2
Analytics → P3
```

---

# 106. Service-Level Expectations

For each critical integration define:

```text
availability expectation
latency expectation
maximum retry duration
recovery target
data consistency expectation
acceptable backlog
```

This prevents vague operational requirements.

---

# 107. Integration SLOs

Example:

```text
Payment confirmation:
99.9% processed within defined target

Webhook processing:
99.9% acknowledged quickly

Email:
99% accepted by provider within target

Search indexing:
99% indexed within target delay
```

Use actual business requirements rather than copying these numbers blindly.

---

# 108. Integration Dependency Graph

Document dependencies:

```text
Order Service
  ├── Payment
  ├── Email
  └── Analytics

User Service
  ├── Identity
  └── Email

File Service
  └── Object Storage
```

This makes blast radius analysis easier.

---

# 109. Synchronous vs Asynchronous Decision

Use synchronous calls when:

- response is required immediately
- operation is fast
- provider reliability is acceptable
- user experience requires immediate result

Use asynchronous processing when:

- operation can take time
- retries are expected
- provider is unreliable
- operation is non-critical to immediate response
- work can be eventually consistent

---

# 110. Integration Decision Matrix

| Question                                       | Prefer                             |
| ---------------------------------------------- | ---------------------------------- |
| Must user receive provider result immediately? | Sync                               |
| Can operation finish later?                    | Async                              |
| Is retry likely?                               | Async                              |
| Is operation expensive?                        | Async                              |
| Does failure block a critical workflow?        | Carefully designed sync + fallback |
| Is provider response uncertain?                | Durable operation + reconciliation |
| Is webhook involved?                           | Async processing                   |

---

# 111. API Boundary

Do not expose provider-specific models unless required.

Bad:

```json
{
  "stripePaymentIntent": {...}
}
```

Preferred:

```json
{
  "payment": {
    "id": "pay_123",
    "status": "succeeded"
  }
}
```

The public API should represent application concepts.

---

# 112. Provider Reference IDs

Store provider identifiers separately.

Example:

```text
payment.id
payment.provider
payment.providerPaymentId
```

Do not replace internal IDs with provider IDs.

---

# 113. External Resource Mapping

For important resources:

```text
internal resource
      ↕
provider resource
```

Track:

```text
provider
provider_resource_id
resource_type
internal_resource_id
```

Unique constraints should prevent accidental duplicate mappings.

---

# 114. Clock and Timestamp Handling

External systems may use different timestamp formats.

Normalize to:

```text
UTC
```

Store provider timestamps when useful:

```text
providerCreatedAt
providerUpdatedAt
```

Do not assume local server time.

---

# 115. Currency and Monetary Values

Never represent money with floating-point numbers.

Prefer:

```text
amountMinor = 1999
currency = USD
```

Provider-specific monetary formats should be converted at the integration boundary.

---

# 116. External Enums

Provider statuses should not leak into the domain.

Example:

```text
Provider:
  succeeded
  requires_action
  canceled

Internal:
  PENDING
  ACTION_REQUIRED
  SUCCEEDED
  CANCELLED
```

The adapter owns the mapping.

---

# 117. Provider Metadata

Store only metadata needed for:

- reconciliation
- support
- auditing
- customer service
- reporting

Avoid copying entire provider payloads into core tables.

---

# 118. Raw Payload Storage

If raw payloads are required for debugging or compliance:

- restrict access
- encrypt where appropriate
- redact secrets
- define retention
- avoid exposing through normal APIs
- audit access
- consider object storage for large payloads

---

# 119. Integration Security Checklist

Before production:

- [ ] credentials are stored securely
- [ ] secrets are not logged
- [ ] least privilege is used
- [ ] webhook signatures are verified
- [ ] replay protection exists
- [ ] outbound requests use TLS
- [ ] timeouts are configured
- [ ] retries are bounded
- [ ] idempotency is implemented
- [ ] response schemas are validated
- [ ] PII is minimized
- [ ] provider permissions are documented
- [ ] audit logging exists for sensitive admin actions
- [ ] rate limits are understood
- [ ] SSRF is prevented for user-controlled URLs
- [ ] provider errors are normalized

---

# 120. SSRF Protection

If an integration accepts a user-provided URL, do not fetch arbitrary destinations.

Protect against:

- localhost
- private IP ranges
- cloud metadata endpoints
- internal DNS
- link-local addresses
- redirect-based SSRF

Prefer an allowlist of approved destinations where possible.

---

# 121. Redirect Handling

External HTTP clients should have explicit redirect behavior.

For security-sensitive integrations:

```text
disable automatic redirects
```

or validate every redirected destination.

Never assume a redirect remains on the trusted provider domain.

---

# 122. Webhook SSRF

Do not make webhook destination URLs freely configurable by untrusted users.

For customer-configured outbound webhooks:

- validate URL
- protect against private addresses
- resolve/revalidate destination safely
- restrict protocols
- limit redirects
- apply egress controls

---

# 123. Payload Size Limits

Limit inbound and outbound payload sizes.

This protects against:

- memory exhaustion
- oversized webhook attacks
- accidental huge responses
- expensive parsing

Use provider-specific limits where appropriate.

---

# 124. Content-Type Validation

Validate expected content types.

Do not blindly parse arbitrary content.

For example:

```text
application/json
application/octet-stream
image/*
```

only when explicitly expected.

---

# 125. External Dependency Supply Chain

Provider SDKs are third-party dependencies.

Monitor:

- security advisories
- dependency versions
- abandoned packages
- transitive dependencies
- license constraints

Pin versions appropriately and upgrade deliberately.

---

# 126. Provider SDK Upgrade Checklist

Before upgrading:

```text
Review changelog
Review security advisories
Run unit tests
Run contract tests
Run sandbox tests
Run webhook tests
Review generated types
Review authentication behavior
Review retry behavior
Deploy staging
Observe
Deploy production gradually
```

---

# 127. Local Development

Local development should work without production credentials.

Provide:

```text
fake providers
sandbox configuration
fixture webhooks
test API responses
local object storage where practical
```

Document how to simulate failures.

---

# 128. Local Webhook Testing

Use deterministic fixtures.

Example:

```text
fixtures/webhooks/
├── payment-succeeded.json
├── payment-failed.json
├── duplicate-event.json
├── malformed-event.json
└── replayed-event.json
```

Tests should verify both verification and business processing.

---

# 129. Contract Fixtures

Store representative provider responses.

Include:

```text
success
partial success
validation error
rate limit
server error
unknown field
missing field
null field
```

Fixtures protect against accidental parser assumptions.

---

# 130. Integration Test Matrix

| Scenario             | Expected             |
| -------------------- | -------------------- |
| Provider success     | success              |
| Provider timeout     | retry/unknown        |
| Provider 429         | backoff              |
| Provider 401         | alert/fail           |
| Provider 400         | no retry             |
| Provider 500         | bounded retry        |
| Duplicate webhook    | no duplicate effect  |
| Invalid signature    | reject               |
| Replayed webhook     | reject/ignore        |
| Malformed response   | safe failure         |
| Provider unavailable | graceful degradation |

---

# 131. Chaos Testing

For critical integrations, simulate:

- latency
- packet failure
- timeout
- 429
- 5xx
- malformed JSON
- duplicate webhooks
- delayed webhooks
- worker crashes
- database failure during processing

The goal is to verify recovery rather than merely error handling.

---

# 132. Recovery Testing

Test:

```text
provider fails
  ↓
jobs accumulate
  ↓
provider recovers
  ↓
workers resume
  ↓
backlog drains
  ↓
business state reconciles
```

Do not assume recovery works simply because retries exist.

---

# 133. Queue Recovery

After provider recovery:

- avoid retry storms
- gradually increase concurrency
- respect provider rate limits
- prioritize critical jobs
- monitor queue age
- monitor failures
- verify business state

---

# 134. Data Reconciliation Schedule

Critical resources may require periodic reconciliation.

Examples:

```text
Payments: frequent
Shipping: periodic
Search: periodic
Analytics: low priority
```

Choose frequency based on business impact.

---

# 135. Reconciliation Idempotency

A reconciliation job must be safe to run repeatedly.

Example:

```text
reconcile(order_123)
```

may run multiple times without creating duplicate external side effects.

---

# 136. Reconciliation Results

Record:

```text
resource
internal_state
provider_state
match
difference
action_taken
operator
timestamp
```

This supports investigation.

---

# 137. Provider Status Pages

Monitor provider status pages for critical services.

Do not rely exclusively on status pages; application telemetry remains authoritative for your actual dependency behavior.

---

# 138. Graceful Degradation

When a non-critical integration fails:

```text
Core transaction
      ↓
succeeds
      ↓
secondary notification
      ↓
queued for retry
```

Example:

```text
Order creation succeeds
Email temporarily unavailable
Email job remains pending
```

Do not fail the order merely because analytics failed.

---

# 139. Hard Dependencies

Some integrations genuinely block workflows.

Examples:

```text
payment authorization
identity verification
tax calculation
```

For these, define:

- timeout
- failure behavior
- retry policy
- user-facing status
- reconciliation
- fallback if any

---

# 140. Dependency Classification

Each integration should be labeled:

```text
HARD_DEPENDENCY
SOFT_DEPENDENCY
ASYNC_DEPENDENCY
OPTIONAL_DEPENDENCY
```

This determines failure behavior.

---

# 141. Integration Boundaries and Transactions

Never assume a database transaction can include an external API call safely.

Avoid:

```text
BEGIN
  update database
  call provider
  COMMIT
```

External calls can take too long and cannot participate in the database transaction.

Prefer:

```text
DB transaction
  ↓
persist intent
  ↓
commit
  ↓
external operation
  ↓
persist result
```

---

# 142. Saga-Like Workflows

For multi-step external workflows:

```text
Create order
  ↓
Reserve inventory
  ↓
Authorize payment
  ↓
Create shipment
```

Failures may require compensating actions.

Model the workflow explicitly rather than relying on nested try/catch blocks.

---

# 143. Compensation

Compensating actions might include:

```text
payment authorized
  ↓
inventory unavailable
  ↓
refund/cancel payment
```

Compensation itself can fail.

Therefore compensation must also be:

- idempotent
- retryable
- observable
- auditable

---

# 144. Distributed Transactions

Do not attempt to implement a traditional distributed transaction across providers.

Use:

- local transactions
- durable state
- outbox
- queues
- idempotency
- reconciliation
- compensation

---

# 145. Integration State Machine

Complex integrations should define explicit transitions.

Example:

```text
PENDING
  ↓
SUBMITTED
  ↓
PROCESSING
  ├──→ SUCCEEDED
  ├──→ FAILED
  └──→ UNKNOWN
             ↓
        RECONCILING
             ├──→ SUCCEEDED
             └──→ FAILED
```

Every transition should be validated.

---

# 146. Integration APIs

Internal integration APIs should be capability-oriented.

Example:

```ts
createPayment();
capturePayment();
refundPayment();
getPaymentStatus();
```

Avoid leaking provider APIs:

```ts
createStripePaymentIntent();
updateStripePaymentIntent();
```

Provider-specific methods belong inside the adapter.

---

# 147. Integration Module Ownership

Each integration should have a clear owner.

Ownership includes:

- code
- credentials
- provider relationship
- runbooks
- dashboards
- incident response
- upgrades
- deprecation

No critical integration should be "everyone's responsibility."

---

# 148. Integration Review

Before adding an integration ask:

1. Why is it required?
2. What data leaves the system?
3. What happens when it fails?
4. Is it synchronous or asynchronous?
5. What is the idempotency strategy?
6. What is the retry strategy?
7. How are webhooks secured?
8. How is provider state reconciled?
9. How is it tested?
10. Who owns it?
11. How is it observed?
12. How is it removed?

---

# 149. New Integration Workflow

Recommended sequence:

```text
1. Write integration requirements.
2. Define business capability.
3. Define failure modes.
4. Define internal port.
5. Define internal types.
6. Define configuration.
7. Implement provider adapter.
8. Add response validation.
9. Add timeout/retry/idempotency.
10. Add webhook handling if required.
11. Add metrics/logging/tracing.
12. Add tests.
13. Add runbook.
14. Add Admin controls if required.
15. Deploy to staging.
16. Verify recovery.
17. Deploy gradually.
18. Monitor.
```

---

# 150. Definition of Done

An integration is not production-ready until:

- [ ] business capability is clearly defined
- [ ] integration boundary exists
- [ ] provider-specific code is isolated
- [ ] configuration is typed and validated
- [ ] secrets are securely managed
- [ ] timeouts are configured
- [ ] retry behavior is explicit
- [ ] idempotency is implemented
- [ ] unknown states are handled
- [ ] external responses are validated
- [ ] errors are normalized
- [ ] rate limits are understood
- [ ] webhooks are verified if applicable
- [ ] replay protection exists
- [ ] critical operations are durable
- [ ] reconciliation exists where required
- [ ] background processing is used where appropriate
- [ ] metrics exist
- [ ] structured logs exist
- [ ] tracing exists where appropriate
- [ ] tests cover success and failure
- [ ] sandbox/staging verification is complete
- [ ] security review is complete
- [ ] privacy review is complete where required
- [ ] runbook exists
- [ ] owner is assigned
- [ ] rollback/deactivation plan exists
- [ ] documentation exists

---

# 151. Production Integration Checklist

## Architecture

- [ ] Adapter boundary
- [ ] Provider-neutral types
- [ ] Clear ownership
- [ ] Hard/soft dependency classification
- [ ] Sync/async decision documented

## Reliability

- [ ] Timeout
- [ ] Retry
- [ ] Backoff
- [ ] Jitter
- [ ] Idempotency
- [ ] Circuit breaker if justified
- [ ] Bulkhead
- [ ] Reconciliation

## Security

- [ ] Secret management
- [ ] Least privilege
- [ ] Signature verification
- [ ] Replay protection
- [ ] SSRF protection
- [ ] TLS
- [ ] Payload validation
- [ ] PII minimization

## Operations

- [ ] Metrics
- [ ] Logs
- [ ] Tracing
- [ ] Dashboard
- [ ] Alerts
- [ ] Runbook
- [ ] Incident procedure

## Testing

- [ ] Unit
- [ ] Contract
- [ ] Integration
- [ ] Sandbox
- [ ] Failure injection
- [ ] Recovery
- [ ] Webhook
- [ ] Reconciliation

---

# 152. Recommended Fastify Integration Pattern

A practical Fastify structure:

```text
Fastify plugin
   ↓
register integration dependencies
   ↓
service receives integration port
   ↓
adapter performs external call
```

Example:

```ts
fastify.decorate("emailProvider", emailProvider);
```

Then inject it into application services rather than importing global SDK clients everywhere.

---

# 153. Avoid Global Mutable Provider State

Avoid:

```ts
export const provider = new Provider(...)
```

when the provider requires dynamic configuration or test replacement.

Prefer dependency injection/factory construction.

This improves:

- testing
- configuration
- lifecycle control
- multi-provider support
- shutdown behavior

---

# 154. Connection Lifecycle

Long-lived clients should be managed intentionally.

On startup:

```text
validate config
initialize client
```

During runtime:

```text
reuse connection/client
```

On shutdown:

```text
stop new work
drain workers
close clients if necessary
```

---

# 155. Provider Client Reuse

Avoid constructing a new SDK client for every request if the SDK supports safe reuse.

Prefer:

```text
application startup
   ↓
one configured client
   ↓
adapter
```

rather than:

```text
every request
   ↓
new SDK client
```

---

# 156. Cancellation

Support request cancellation where possible.

For synchronous operations:

```text
client disconnects
   ↓
AbortSignal
   ↓
cancel external request
```

For durable background work, cancellation should be explicit and state-aware.

---

# 157. Request Context

Propagate:

- request ID
- correlation ID
- trace context

where provider APIs support custom headers.

Do not send internal secrets or sensitive metadata unnecessarily.

---

# 158. External Request Logging

Log metadata:

```text
provider
operation
status
latency
attempt
requestId
```

Do not log complete payloads by default.

If payload logging is temporarily enabled for incident response, use strict access control and redaction.

---

# 159. PII Redaction

Build reusable redaction helpers for:

```text
email
phone
address
tokens
authorization headers
API keys
payment details
identity documents
```

Redaction should happen before logs, traces, metrics labels, and audit metadata are emitted.

---

# 160. Integration Performance

Measure:

```text
DNS
connection
TLS
server response
payload processing
queue delay
database persistence
```

A slow integration may be caused by the network, provider, or local processing.

---

# 161. Batch APIs

Use provider batch APIs when appropriate.

But verify:

- partial failures
- per-item status
- idempotency
- maximum batch size
- retry semantics

Never treat a batch response as all-or-nothing unless the provider guarantees it.

---

# 162. Partial Failure

Example:

```text
Batch 100 records
   ↓
97 succeeded
3 failed
```

Persist individual results.

Retry only failed items when safe.

---

# 163. External File Transfers

For large transfers:

- stream where possible
- avoid buffering entire files in memory
- set maximum sizes
- validate content
- use resumable transfers if supported
- monitor transfer duration
- use signed URLs when appropriate

---

# 164. Integration Data Retention

Define retention separately for:

```text
operation records
webhook records
provider references
raw payloads
delivery history
audit events
logs
```

Do not retain everything forever.

---

# 165. Integration Deletion

When deleting an internal resource, determine whether the provider resource should be:

```text
deleted
archived
detached
retained for compliance
```

Do not automatically delete provider resources without domain approval.

---

# 166. Tenant Isolation

For multi-tenant deployments:

```text
tenant
  ↓
integration configuration
  ↓
provider credentials
  ↓
external resource
```

Never accidentally use Tenant A's provider credentials for Tenant B.

See `MULTI_TENANCY.md`.

---

# 167. Tenant-Aware Integration Keys

If tenant-specific integrations are supported:

```text
integration:{tenantId}:{provider}
```

Cache and job payloads must preserve tenant scope.

---

# 168. Background Job Security

Do not put credentials in job payloads.

Bad:

```json
{
  "apiKey": "secret"
}
```

Preferred:

```json
{
  "tenantId": "tenant_123",
  "integration": "email",
  "operationId": "op_123"
}
```

Worker loads credentials securely at execution time.

---

# 169. Job Payload Design

Job payloads should contain stable identifiers:

```text
operationId
resourceId
tenantId
integration
schemaVersion
```

Avoid embedding large external payloads unless required.

---

# 170. Integration Event Design

Use domain/integration events for meaningful facts.

Example:

```text
payment.succeeded
order.created
user.email_verified
file.uploaded
```

Workers can react to these events without coupling the domain to provider APIs.

See `EVENT_DRIVEN_ARCHITECTURE.md`.

---

# 171. Integration Events vs Provider Events

Keep these separate.

Provider event:

```text
provider.payment_intent.succeeded
```

Internal event:

```text
payment.succeeded
```

The adapter translates provider semantics into internal business semantics.

---

# 172. Provider Event Mapping

Example:

```text
Provider:
payment_intent.succeeded

Adapter:
PaymentSucceeded

Domain:
order.markPaymentSucceeded()
```

This protects business logic from provider terminology.

---

# 173. Provider-Specific Business Rules

Provider-specific quirks belong at the integration boundary when possible.

Example:

```text
provider requires confirmation
provider returns special status
provider limits batch size
```

Do not spread these conditions across unrelated services.

---

# 174. Integration Anti-Patterns

## Anti-pattern 1: SDK everywhere

```text
routes → SDK
services → SDK
workers → SDK
```

Result:

- tight coupling
- difficult migration
- difficult testing

---

## Anti-pattern 2: No idempotency

```text
timeout
  ↓
retry
  ↓
duplicate charge
```

Never acceptable for critical side effects.

---

## Anti-pattern 3: Infinite retries

```text
provider down
  ↓
retry forever
```

This creates queue explosions and provider abuse.

---

## Anti-pattern 4: Trusting webhooks blindly

```text
POST webhook
  ↓
change database
```

Always verify authenticity and deduplicate.

---

## Anti-pattern 5: Provider status as application truth

```text
provider says X
  ↓
overwrite everything
```

Apply validated domain transitions.

---

## Anti-pattern 6: Logging secrets

Never.

---

## Anti-pattern 7: Blocking requests on secondary systems

Do not make analytics or non-critical notifications block core transactions.

---

## Anti-pattern 8: Generic universal adapter

Avoid abstractions that erase important provider semantics.

---

## Anti-pattern 9: Direct external calls inside database transactions

This creates long transactions and unreliable coordination.

---

## Anti-pattern 10: Provider-specific public API

Do not force clients to understand your vendor.

---

# 175. Architecture Decision Records

Important integration decisions should have ADRs.

Examples:

```text
ADR-00XX Payment provider selection
ADR-00XX Email provider selection
ADR-00XX Object storage strategy
ADR-00XX Webhook processing model
ADR-00XX Provider failover strategy
ADR-00XX External identity provider
```

See `ADR/README.md`.

---

# 176. Integration Selection Criteria

When selecting a provider evaluate:

| Area        | Questions                          |
| ----------- | ---------------------------------- |
| Reliability | Does it meet required SLOs?        |
| Security    | Does it support required controls? |
| API         | Is the API stable and documented?  |
| Webhooks    | Are events signed and replay-safe? |
| Idempotency | Does the provider support it?      |
| Limits      | Are quotas compatible?             |
| Cost        | Is pricing predictable?            |
| Geography   | Does it satisfy residency needs?   |
| Support     | Is incident support adequate?      |
| Portability | Can we replace it?                 |
| Testing     | Is sandbox available?              |
| Compliance  | Does it satisfy requirements?      |

---

# 177. Build vs Buy

Prefer external providers when they provide mature commodity capabilities:

```text
email delivery
payments
SMS
object storage
```

Build internally when the capability is central to product differentiation or requires domain-specific behavior.

---

# 178. Integration Cost Model

Consider total cost:

```text
Provider fees
+
engineering
+
operations
+
monitoring
+
support
+
migration cost
+
vendor lock-in
```

Cheap API pricing can still create high operational cost.

---

# 179. Vendor Lock-In

Reduce lock-in by owning:

- internal domain models
- provider-neutral interfaces
- internal IDs
- durable business state
- event contracts
- adapter layer

Do not over-abstract provider capabilities that are genuinely unique.

---

# 180. Integration Maturity Model

## Level 1 — Direct

```text
service → provider
```

Suitable only for simple prototypes.

## Level 2 — Adapter

```text
service → interface → adapter
```

Recommended baseline.

## Level 3 — Durable

Adds:

- operation records
- queues
- idempotency
- webhooks
- reconciliation

## Level 4 — Production resilient

Adds:

- observability
- rate limiting
- bulkheads
- incident runbooks
- recovery testing
- provider migration strategy

Critical Fastify-MasterApp integrations should target Level 3–4.

---

# 181. Implementation Roadmap

## Phase 1 — Integration foundation

- [ ] integration directory
- [ ] configuration model
- [ ] provider interfaces
- [ ] normalized errors
- [ ] HTTP client policy
- [ ] timeout defaults
- [ ] logging/redaction

## Phase 2 — Reliability

- [ ] retry utility
- [ ] idempotency
- [ ] operation records
- [ ] queue integration
- [ ] dead-letter handling
- [ ] reconciliation framework

## Phase 3 — Security

- [ ] secret management
- [ ] webhook verification
- [ ] replay protection
- [ ] SSRF controls
- [ ] provider permission review

## Phase 4 — Observability

- [ ] metrics
- [ ] dashboards
- [ ] alerts
- [ ] tracing
- [ ] integration health reporting

## Phase 5 — Admin

- [ ] provider status
- [ ] operation history
- [ ] retry controls
- [ ] webhook inspection
- [ ] reconciliation tools
- [ ] credential rotation workflow

## Phase 6 — Advanced resilience

- [ ] provider failover where justified
- [ ] circuit breakers
- [ ] workload isolation
- [ ] chaos testing
- [ ] automated reconciliation

---

# 182. Suggested Initial Integrations

For Fastify-MasterApp, a sensible sequence is:

```text
1. Email
2. Object storage
3. Background job infrastructure
4. Webhooks
5. Payments if the product requires them
6. External identity if required
7. Search if required
8. Analytics
9. Other domain-specific providers
```

Do not implement integrations simply because the architecture supports them.

---

# 183. Reference End-to-End Flow

Example: order payment.

```text
Admin/User
   ↓
POST /api/v1/orders/:id/payment
   ↓
Fastify authentication
   ↓
RBAC/resource authorization
   ↓
OrderService
   ↓
DB transaction
   ├── create PaymentAttempt
   └── create integration operation
   ↓
commit
   ↓
Queue payment job
   ↓
PaymentWorker
   ↓
PaymentIntegration
   ↓
Provider Adapter
   ↓
External Payment API
   ↓
Provider response
   ↓
Persist provider reference/status
   ↓
Emit payment event
   ↓
Audit event
   ↓
Notification job
```

If the provider times out:

```text
UNKNOWN
   ↓
reconciliation
   ↓
provider status lookup
   ↓
SUCCEEDED / FAILED
```

---

# 184. Reference Webhook Flow

```text
Provider
   ↓
POST /api/v1/webhooks/provider
   ↓
Raw body capture
   ↓
Signature verification
   ↓
Replay/deduplication check
   ↓
Schema validation
   ↓
Persist webhook event
   ↓
Queue processing job
   ↓
Return 2xx
   ↓
Worker
   ↓
Provider event adapter
   ↓
Domain transition
   ↓
Outbox/domain event
   ↓
Audit
```

---

# 185. Reference Failure Flow

```text
Worker
  ↓
Provider API
  ↓
Timeout
  ↓
Normalize error
  ↓
Check idempotency state
  ↓
Retry with backoff
  ↓
Provider still unavailable
  ↓
Retry budget exhausted
  ↓
Dead-letter / FAILED
  ↓
Alert
  ↓
Operator investigation
  ↓
Safe retry or reconciliation
```

---

# 186. Golden Rules

1. External providers are dependencies.
2. PostgreSQL owns durable business truth.
3. Hide provider SDKs behind adapters.
4. Use provider-neutral domain types.
5. Validate external responses at runtime.
6. Give every external call a timeout.
7. Retry only retryable failures.
8. Bound every retry policy.
9. Add jitter to retries.
10. Make important side effects idempotent.
11. Treat timeout outcomes as potentially unknown.
12. Reconcile critical external state.
13. Verify webhook signatures.
14. Protect against webhook replay.
15. Persist important webhook events.
16. Process heavy webhook work asynchronously.
17. Never log credentials or tokens.
18. Minimize PII sent to providers.
19. Protect user-controlled URLs from SSRF.
20. Isolate critical workloads.
21. Do not call providers inside DB transactions.
22. Use outbox patterns for durable async work.
23. Normalize provider errors.
24. Do not expose provider models in public APIs unnecessarily.
25. Keep integration configuration centralized.
26. Test success, failure, timeout, retry, and recovery paths.
27. Give every critical integration an owner.
28. Document operational runbooks.
29. Monitor provider behavior using application telemetry.
30. Design for provider replacement where practical.
31. Use failover only when its transaction semantics are safe.
32. Reconcile after outages.
33. Audit sensitive integration administration.
34. Prefer graceful degradation for secondary systems.
35. Treat integrations as production subsystems, not utility functions.

---

# 187. Final Target Architecture

The target Fastify-MasterApp integration architecture is:

```text
                         React Admin
                              │
                              ▼
                        Fastify API
                              │
                 ┌────────────┴────────────┐
                 │                         │
                 ▼                         ▼
        Domain Services              Query Services
                 │
                 ▼
        Integration Ports
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
     Email    Payments  Storage
     Adapter   Adapter   Adapter
        │        │        │
        ▼        ▼        ▼
    Provider  Provider  Object Store

                 │
                 ▼
            PostgreSQL
        durable business state

                 │
                 ▼
        Transactional Outbox
                 │
                 ▼
              BullMQ
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
      Email   Payment   Webhook
     Worker    Worker    Worker
        │        │        │
        ▼        ▼        ▼
     External External External
     Provider Provider Provider

                 │
                 ▼
       Observability Layer
     Pino / Prometheus / Grafana
```

The architecture should remain a **modular monolith with explicit integration boundaries**.

The preferred evolution is:

```text
simple adapter
      ↓
durable operation
      ↓
queue + idempotency
      ↓
webhooks + reconciliation
      ↓
observability + recovery
      ↓
provider migration/failover only when justified
```

The goal is not maximum integration complexity.

The goal is **predictable behavior when external systems succeed, fail, retry, duplicate, slow down, change, or disappear**.
