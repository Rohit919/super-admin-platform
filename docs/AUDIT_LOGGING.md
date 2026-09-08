# AUDIT_LOGGING.md

# Fastify-MasterApp — Audit Logging & Activity History

> Production-grade design for recording security-sensitive, administrative, and business-significant actions in Fastify-MasterApp.

---

## Table of Contents

1. [Purpose](#purpose)
2. [What Audit Logging Is](#what-audit-logging-is)
3. [Audit Logging vs Application Logs](#audit-logging-vs-application-logs)
4. [Core Principles](#core-principles)
5. [Audit Logging Goals](#audit-logging-goals)
6. [What Should Be Audited](#what-should-be-audited)
7. [What Should Not Be Audited](#what-should-not-be-audited)
8. [Threat Model](#threat-model)
9. [Audit Architecture](#audit-architecture)
10. [Request-to-Audit Flow](#request-to-audit-flow)
11. [Audit Event Model](#audit-event-model)
12. [Recommended Database Model](#recommended-database-model)
13. [Event Naming](#event-naming)
14. [Actor Information](#actor-information)
15. [Target Information](#target-information)
16. [Request Context](#request-context)
17. [Outcome](#outcome)
18. [Reason and Metadata](#reason-and-metadata)
19. [Before and After Values](#before-and-after-values)
20. [Sensitive Data](#sensitive-data)
21. [Authentication Events](#authentication-events)
22. [Authorization Events](#authorization-events)
23. [User Management Events](#user-management-events)
24. [Role and Permission Events](#role-and-permission-events)
25. [Admin Events](#admin-events)
26. [Business Events](#business-events)
27. [Data Export Events](#data-export-events)
28. [File Events](#file-events)
29. [API and Integration Events](#api-and-integration-events)
30. [Background Job Events](#background-job-events)
31. [Audit Event Lifecycle](#audit-event-lifecycle)
32. [Transactional Consistency](#transactional-consistency)
33. [Outbox Pattern](#outbox-pattern)
34. [Immutability](#immutability)
35. [Retention](#retention)
36. [Deletion and Privacy](#deletion-and-privacy)
37. [Audit Log Access](#audit-log-access)
38. [RBAC for Audit Logs](#rbac-for-audit-logs)
39. [Admin UI](#admin-ui)
40. [Audit Log Search](#audit-log-search)
41. [Filtering](#filtering)
42. [Pagination](#pagination)
43. [Sorting](#sorting)
44. [Audit Detail View](#audit-detail-view)
45. [API Design](#api-design)
46. [Example API Responses](#example-api-responses)
47. [Service Architecture](#service-architecture)
48. [Repository Architecture](#repository-architecture)
49. [Automatic Route Auditing](#automatic-route-auditing)
50. [Explicit Business Auditing](#explicit-business-auditing)
51. [Choosing Automatic vs Explicit](#choosing-automatic-vs-explicit)
52. [Error Handling](#error-handling)
53. [Failed Actions](#failed-actions)
54. [Security](#security)
55. [Tamper Resistance](#tamper-resistance)
56. [Database Security](#database-security)
57. [Operational Security](#operational-security)
58. [Logging Integration](#logging-integration)
59. [Metrics](#metrics)
60. [Observability](#observability)
61. [Alerting](#alerting)
62. [Testing](#testing)
63. [Performance](#performance)
64. [Indexing](#indexing)
65. [High-Volume Events](#high-volume-events)
66. [Archiving](#archiving)
67. [Multi-Tenancy](#multi-tenancy)
68. [Compliance Considerations](#compliance-considerations)
69. [Incident Investigation](#incident-investigation)
70. [Audit Log Integrity](#audit-log-integrity)
71. [Operational Procedures](#operational-procedures)
72. [Common Anti-Patterns](#common-anti-patterns)
73. [Implementation Roadmap](#implementation-roadmap)
74. [Definition of Done](#definition-of-done)
75. [Audit Event Checklist](#audit-event-checklist)
76. [Golden Rules](#golden-rules)

---

# Purpose

Audit logging provides a durable history of important actions performed inside Fastify-MasterApp.

It answers questions such as:

- Who changed this user?
- Who granted this permission?
- Who disabled this account?
- Who exported these records?
- When was a role modified?
- Which administrator performed an action?
- What changed?
- Was the operation successful?
- Which request initiated it?
- Which system or background worker performed it?

Audit logs are especially important for:

- security investigations
- administrative accountability
- debugging sensitive workflows
- compliance requirements
- incident response
- operational history
- customer support

---

# What Audit Logging Is

An audit event is a durable record of a meaningful action.

Example:

```text
Actor:
admin_123

Action:
user.role_changed

Target:
user_456

Outcome:
SUCCESS

Time:
2026-09-07T10:30:00Z
```

The audit record should explain the event without requiring the original application log to still exist.

---

# Audit Logging vs Application Logs

These systems serve different purposes.

## Application Logs

Application logs answer:

> What did the software do internally?

Examples:

```text
Database query failed
Request took 1.8 seconds
Redis connection restored
Worker started
```

Application logs are operational telemetry.

---

## Audit Logs

Audit logs answer:

> What meaningful action happened, who initiated it, and what was the result?

Examples:

```text
admin user_123 disabled user_456
admin user_123 granted role ADMIN to user_456
user user_456 changed password
admin user_123 exported users
```

Audit logs are durable business/security history.

---

# Core Principles

## 1. Audit important actions, not every line of code

Do not create an audit event for every function call.

Audit meaningful state changes and security events.

---

## 2. Audit events should be structured

Avoid:

```text
"Rohit changed some user stuff"
```

Prefer:

```json
{
  "action": "user.updated",
  "targetType": "user",
  "targetId": "user_123",
  "outcome": "SUCCESS"
}
```

---

## 3. Audit records should be durable

If an action is important enough to audit, it should not depend solely on ephemeral application logs.

---

## 4. Audit logs should be append-oriented

Normal users and administrators should not edit historical audit records.

---

## 5. Do not store secrets

Never record:

- passwords
- JWTs
- refresh tokens
- API keys
- private keys
- session cookies
- authorization headers

---

## 6. Audit authorization-sensitive operations

RBAC changes are particularly important.

Examples:

```text
role.created
role.updated
role.deleted
permission.granted
permission.revoked
user.role_changed
```

---

# Audit Logging Goals

A production audit system should provide:

```text
Accountability
Traceability
Security investigation
Change history
Operational visibility
Administrative transparency
```

It should make it possible to reconstruct important workflows.

---

# What Should Be Audited

Recommended categories:

### Authentication

- login success
- login failure where security monitoring requires it
- logout
- refresh-token rotation/reuse detection
- password change
- password reset
- email verification
- account lockout
- suspicious authentication event

### Authorization

- role assignment
- role removal
- permission assignment
- permission removal
- access policy changes

### User Administration

- user created
- user updated
- user disabled
- user enabled
- user deleted
- user restored
- user impersonation if supported

### Administration

- configuration changed
- feature flag changed
- security setting changed
- integration configured
- integration disabled

### Data

- sensitive record exported
- bulk update
- bulk deletion
- important record state transition

### Business

- order created
- order cancelled
- refund initiated
- important workflow approved/rejected

The exact list should reflect the application's domain.

---

# What Should Not Be Audited

Do not audit every read automatically.

For example:

```text
GET /health
GET /metrics
GET /api/v1
```

usually do not need audit records.

Avoid high-volume meaningless events.

Also avoid storing:

```text
password = "..."
accessToken = "..."
refreshToken = "..."
```

---

# Threat Model

Audit systems themselves can be attacked.

Threats include:

```text
Administrator modifies audit history
Application accidentally overwrites audit records
Attacker deletes evidence
Sensitive data leaks through audit metadata
Audit table becomes a performance bottleneck
Logs become too large to search
Retention removes important evidence too early
```

Therefore audit logging must itself be treated as a security-sensitive subsystem.

---

# Audit Architecture

Recommended architecture:

```text
HTTP Request
    |
    v
Authentication
    |
    v
Authorization
    |
    v
Service / Orchestrator
    |
    +------> Business DB mutation
    |
    +------> Audit Event
               |
               v
          Audit Service
               |
               v
          Audit Repository
               |
               v
          PostgreSQL
```

For critical transactional workflows:

```text
Service
   |
   v
PostgreSQL Transaction
   |
   +-- business mutation
   |
   +-- audit event
   |
   +-- outbox event if needed
```

---

# Request-to-Audit Flow

Example:

```text
Admin changes a user's role

Admin SPA
   |
   | PATCH /admin/users/123/role
   v
Fastify
   |
   | authenticate
   v
Authorization
   |
   | verify permission
   v
User Service
   |
   | update role
   v
PostgreSQL
   |
   | audit
   v
AuditLog
```

The audit event should represent the actual business operation, not merely the fact that an HTTP endpoint was called.

---

# Audit Event Model

A useful conceptual event:

```ts
interface AuditEvent {
  id: string;
  action: string;

  actorType: "USER" | "SYSTEM" | "WORKER";
  actorId?: string;

  targetType?: string;
  targetId?: string;

  outcome: "SUCCESS" | "FAILURE";

  requestId?: string;
  correlationId?: string;
  traceId?: string;

  ipAddress?: string;
  userAgent?: string;

  reason?: string;
  metadata?: Record<string, unknown>;

  createdAt: Date;
}
```

The actual Prisma model may evolve.

---

# Recommended Database Model

Conceptual Prisma model:

```prisma
model AuditLog {
  id            String   @id @default(cuid())

  action        String
  outcome       String

  actorType     String
  actorId       String?

  targetType    String?
  targetId      String?

  requestId     String?
  correlationId String?
  traceId       String?

  ipAddress     String?
  userAgent     String?

  reason        String?
  metadata      Json?

  createdAt     DateTime @default(now())

  @@index([createdAt])
  @@index([action, createdAt])
  @@index([actorId, createdAt])
  @@index([targetType, targetId, createdAt])
  @@index([outcome, createdAt])
}
```

This is a starting point, not a mandatory final schema.

---

# Event Naming

Use predictable names.

Recommended:

```text
user.created
user.updated
user.deleted
user.disabled
user.enabled

user.role_changed

role.created
role.updated
role.deleted

permission.granted
permission.revoked

auth.login
auth.logout
auth.login_failed
auth.password_changed
auth.password_reset
auth.refresh_reuse_detected

admin.export_started
admin.export_completed
admin.export_failed
```

Use:

```text
noun.verb
```

or another consistently documented convention.

Do not mix:

```text
USER_CREATED
userCreated
user-created
user.created
```

without a reason.

---

# Event Naming Rules

Names should be:

- stable
- lowercase
- machine-readable
- specific
- domain-oriented

Prefer:

```text
user.role_changed
```

over:

```text
admin.updated_user
```

because the former describes the business event.

---

# Actor Information

The actor identifies who or what initiated the event.

Possible actor types:

```text
USER
SYSTEM
WORKER
INTEGRATION
```

Example:

```json
{
  "actorType": "USER",
  "actorId": "user_123"
}
```

For automated jobs:

```json
{
  "actorType": "WORKER",
  "actorId": "worker-reports"
}
```

For system actions:

```json
{
  "actorType": "SYSTEM"
}
```

---

# Actor vs Target

Do not confuse:

```text
actor
```

with:

```text
target
```

Example:

```text
Admin user_123
    changes
User user_456
```

Audit event:

```text
actorId = user_123
targetId = user_456
```

---

# Target Information

A target identifies the affected entity.

Examples:

```text
targetType = user
targetId = user_456
```

or:

```text
targetType = role
targetId = role_admin
```

For bulk operations:

```text
targetType = user_collection
targetId = export_123
```

Avoid putting thousands of IDs into one metadata object.

Use a durable operation record when the operation is large.

---

# Request Context

Where available, capture:

```text
requestId
correlationId
traceId
```

These allow investigators to connect:

```text
HTTP request
→ service
→ database
→ audit
→ background job
```

Do not use request IDs as authentication credentials.

---

# IP Address

IP address may be useful for security investigations.

Store it only when justified.

Consider:

- privacy requirements
- retention
- proxy/load-balancer configuration
- trusted proxy settings

Never blindly trust arbitrary client-provided headers.

---

# User Agent

User agent can help identify:

```text
browser
device class
client
```

But it is not a strong identity signal.

Treat it as contextual metadata, not authentication evidence.

---

# Outcome

Every meaningful event should distinguish:

```text
SUCCESS
FAILURE
```

For some workflows, more states may be useful:

```text
REQUESTED
STARTED
SUCCESS
FAILURE
CANCELLED
```

Do not record:

```text
export.completed
```

when the export was merely queued.

Use:

```text
export.requested
```

at enqueue time and:

```text
export.completed
```

after the worker finishes.

---

# Reason and Metadata

A `reason` field can explain an administrative action.

Example:

```text
reason:
"User requested account closure"
```

Metadata can hold safe structured context:

```json
{
  "previousRole": "EDITOR",
  "newRole": "ADMIN"
}
```

Metadata must follow strict allowlisting rules.

Do not blindly serialize request bodies.

---

# Before and After Values

For important updates, storing a sanitized before/after representation can be valuable.

Example:

```json
{
  "before": {
    "status": "ACTIVE"
  },
  "after": {
    "status": "DISABLED"
  }
}
```

Do not store:

```json
{
  "before": {
    "password": "..."
  }
}
```

or sensitive tokens.

---

# Field-Level Change Tracking

For user profile changes:

```text
user.updated
```

could record:

```json
{
  "changedFields": ["displayName", "timezone"]
}
```

This is often safer than storing the entire record.

---

# Sensitive Data

Audit logs can accidentally become a high-value data leak.

Never include:

```text
password
passwordHash
accessToken
refreshToken
sessionCookie
apiKey
secret
privateKey
authorizationHeader
```

Also carefully evaluate:

- email addresses
- phone numbers
- IP addresses
- addresses
- financial information
- uploaded documents
- personally identifying data

Store only what the audit purpose requires.

---

# Authentication Events

Recommended events:

```text
auth.login
auth.login_failed
auth.logout
auth.password_changed
auth.password_reset_requested
auth.password_reset_completed
auth.email_verified
auth.refresh_reuse_detected
auth.session_revoked
```

Login failures should be handled carefully because high-volume failures can create enormous audit volume.

For security telemetry, aggregate metrics may be better than storing every failure forever.

---

# Login Success

A successful login may record:

```json
{
  "action": "auth.login",
  "actorType": "USER",
  "actorId": "user_123",
  "outcome": "SUCCESS",
  "metadata": {
    "method": "password"
  }
}
```

Do not record credentials.

---

# Login Failure

Possible:

```json
{
  "action": "auth.login_failed",
  "actorType": "USER",
  "outcome": "FAILURE"
}
```

If the user identity cannot safely be determined:

```text
actorId = null
```

Do not leak whether a particular account exists through the audit API.

---

# Refresh Token Reuse

This is a high-value security event.

Example:

```text
auth.refresh_reuse_detected
```

Record:

- affected session/account reference where known
- timestamp
- request ID
- security context
- outcome

Never record the token itself.

---

# Authorization Events

High-value authorization events include:

```text
user.role_changed
permission.granted
permission.revoked
role.created
role.updated
role.deleted
```

These should usually be audited because authorization changes can create privilege escalation.

---

# User Management Events

Examples:

```text
user.created
user.updated
user.disabled
user.enabled
user.deleted
user.restored
```

For updates, include only relevant changed fields.

---

# Role and Permission Events

Role changes deserve detailed metadata.

Example:

```json
{
  "action": "user.role_changed",
  "targetType": "user",
  "targetId": "user_456",
  "metadata": {
    "previousRole": "EDITOR",
    "newRole": "ADMIN"
  }
}
```

Permission changes:

```json
{
  "action": "permission.granted",
  "targetType": "user",
  "targetId": "user_456",
  "metadata": {
    "permission": "users.export"
  }
}
```

---

# Admin Events

Examples:

```text
admin.settings_changed
admin.export_requested
admin.bulk_update
admin.impersonation_started
admin.impersonation_ended
```

Administrative operations should be especially auditable.

---

# Impersonation

If impersonation is supported, audit both:

```text
impersonation.started
impersonation.ended
```

The effective identity and original administrator must be distinguishable.

Example:

```text
actor = admin_123
effectiveUser = user_456
```

Never make an impersonated action appear as though it was directly performed by the impersonated user.

---

# Business Events

Business events should be selected based on domain significance.

Examples:

```text
order.created
order.cancelled
payment.refund_requested
payment.refund_completed
subscription.cancelled
approval.granted
approval.rejected
```

Do not automatically audit every business read.

---

# Data Export Events

Exports deserve explicit audit events because they can expose large amounts of data.

Recommended lifecycle:

```text
export.requested
export.started
export.completed
export.failed
export.downloaded
export.expired
```

Track:

- actor
- export ID
- requested resource
- filters where safe
- result count where useful
- completion
- download

---

# File Events

Potential events:

```text
file.uploaded
file.processed
file.deleted
file.downloaded
file.scan_failed
```

For sensitive files, access events may be required.

Do not store file contents in audit metadata.

---

# API and Integration Events

Important integration changes:

```text
integration.created
integration.updated
integration.enabled
integration.disabled
webhook.endpoint_created
webhook.endpoint_deleted
```

Do not log:

```text
API secret
webhook signing secret
OAuth refresh token
```

Record references or fingerprints only where necessary.

---

# Background Job Events

Background jobs should integrate with auditing.

Example:

```text
admin.export_requested
      ↓
job queued
      ↓
admin.export_started
      ↓
admin.export_completed
```

Do not create noisy audit events for every internal retry.

Retries belong primarily in operational logs/metrics.

Audit only meaningful state changes.

---

# Audit Event Lifecycle

A durable audit event generally follows:

```text
Created
  ↓
Persisted
  ↓
Queryable
  ↓
Retained
  ↓
Archived/expired
```

Audit events should not normally be:

```text
updated
```

after creation.

If a correction is required, append another event explaining the correction.

---

# Transactional Consistency

For a sensitive state change:

```text
BEGIN

UPDATE user
SET status = 'DISABLED'

INSERT audit_log
VALUES ('user.disabled')

COMMIT
```

This ensures:

```text
business mutation
+
audit record
```

succeed together.

Otherwise the system can reach:

```text
User disabled
Audit missing
```

which creates an accountability gap.

---

# Audit Failure Policy

Decide whether audit persistence is:

### Fail-closed

If audit cannot be recorded, the business action fails.

Use for extremely sensitive operations where evidence is mandatory.

### Fail-open

Business action succeeds even if audit recording temporarily fails.

Use only when losing audit telemetry is acceptable.

### Durable asynchronous

Write an outbox event transactionally and process it separately.

This can provide strong consistency without making the request depend on a remote audit system.

The correct choice should be documented per event category.

---

# Outbox Pattern

For critical events:

```text
BEGIN

business mutation
audit event / outbox record

COMMIT
```

Then:

```text
Outbox
  ↓
Dispatcher
  ↓
Audit processing
```

This prevents an application crash from silently losing the event.

---

# Immutability

Application-level rules should prevent:

```text
UPDATE audit_log
DELETE audit_log
```

for ordinary application identities.

Prefer append-only semantics.

If retention requires deletion, perform controlled deletion through an operational process with appropriate authorization.

---

# Database Permissions

Where possible, separate permissions:

```text
Application role:
INSERT audit logs
SELECT audit logs where authorized

Audit maintenance role:
retention/archive operations
```

The application should not need unrestricted database permissions.

---

# Tamper Resistance

For higher assurance environments, consider:

- restricted DB permissions
- append-only storage
- database audit extensions
- immutable object storage
- separate audit database
- signed audit events
- hash chains
- external security monitoring

Do not implement cryptographic audit chains merely for appearance.

Use them when threat/compliance requirements justify the complexity.

---

# Hash Chaining

An advanced design:

```text
event_1
hash_1

event_2
hash(hash_1 + event_2)

event_3
hash(hash_2 + event_3)
```

This can make modification detectable.

However, hash chaining does not prevent deletion unless the chain is anchored externally.

Treat this as an advanced security feature.

---

# Retention

Define retention deliberately.

Example:

```text
Security authentication events:
90–365 days

Administrative changes:
1–2 years

Critical business actions:
based on domain requirements

Operational noise:
shorter retention
```

Actual retention must follow applicable requirements and business needs.

Do not choose retention solely based on database convenience.

---

# Deletion and Privacy

Audit data can contain personal information.

Retention must balance:

```text
security
accountability
privacy
storage cost
legal requirements
```

If a user is deleted, do not blindly cascade-delete their audit history.

Instead consider:

```text
actorId = retained pseudonymous identifier
actor display data = minimized
```

This preserves accountability while reducing unnecessary personal data.

---

# Audit Log Access

Audit logs themselves are sensitive.

Only authorized roles should access them.

Example permission:

```text
audit.read
```

Separate from:

```text
users.read
```

and:

```text
users.write
```

---

# RBAC for Audit Logs

Recommended permissions:

```text
audit.read
audit.export
audit.manage_retention
```

Usually:

```text
audit.write
```

should not be exposed as a normal user permission.

Application code generates audit events.

---

# Audit Log Scope

In a multi-tenant system, audit queries must be tenant-scoped.

Conceptually:

```text
tenantId
actorId
targetId
```

Every query must enforce tenant isolation.

Never rely on the Admin UI to hide records.

Authorization must happen server-side.

---

# Admin UI

Recommended Admin navigation:

```text
Audit Logs
```

Possible layout:

```text
---------------------------------------------------
Audit Logs

Filters
Actor | Action | Target | Outcome | Date

---------------------------------------------------
Time        Actor       Action          Outcome
10:30       Admin       user.updated    SUCCESS
10:21       Admin       role.changed    SUCCESS
09:55       User        auth.login      SUCCESS
---------------------------------------------------
```

---

# Audit Log Search

Search should support:

- action
- actor ID
- target ID
- request ID
- correlation ID
- date range
- outcome

Do not implement unrestricted full-text search over every metadata field initially.

It can be expensive and unpredictable.

---

# Filtering

Recommended filters:

```text
Date range
Action
Outcome
Actor
Target type
Target ID
```

For administrators:

```text
IP address
```

may also be useful if justified.

---

# Pagination

Use cursor pagination for large audit tables.

Example:

```text
GET /admin/audit-logs?limit=50&cursor=...
```

Default:

```text
limit = 50
```

Maximum:

```text
limit = 100
```

Do not allow arbitrary huge page sizes.

---

# Sorting

Default:

```text
createdAt DESC
```

This shows newest activity first.

If alternative sorting is allowed, whitelist fields.

Never interpolate arbitrary SQL column names from user input.

---

# Audit Detail View

Selecting an event should show:

```text
Event
Action
Outcome
Timestamp

Actor
Actor ID

Target
Target type
Target ID

Request
Request ID
Correlation ID

Network
IP
User agent

Reason

Changed fields
Before
After

Metadata
```

Sensitive fields must be redacted server-side.

---

# API Design

Example endpoints:

```text
GET /api/v1/admin/audit-logs
GET /api/v1/admin/audit-logs/:id
```

Potential export:

```text
POST /api/v1/admin/audit-exports
```

The export itself should be asynchronous for large datasets.

---

# Audit API Authorization

Every audit endpoint must require:

```text
authentication
+
audit.read
```

Do not expose audit records through public endpoints.

---

# Example API Response

```json
{
  "data": [
    {
      "id": "audit_123",
      "action": "user.role_changed",
      "outcome": "SUCCESS",
      "actor": {
        "id": "user_123",
        "type": "USER"
      },
      "target": {
        "type": "user",
        "id": "user_456"
      },
      "createdAt": "2026-09-07T10:30:00Z"
    }
  ],
  "pagination": {
    "nextCursor": "..."
  }
}
```

---

# Audit Detail Response

```json
{
  "data": {
    "id": "audit_123",
    "action": "user.role_changed",
    "outcome": "SUCCESS",
    "actorType": "USER",
    "actorId": "user_123",
    "targetType": "user",
    "targetId": "user_456",
    "metadata": {
      "previousRole": "EDITOR",
      "newRole": "ADMIN"
    },
    "createdAt": "2026-09-07T10:30:00Z"
  }
}
```

The API should return only fields the caller is authorized to see.

---

# Service Architecture

Recommended:

```text
AuditService
  |
  +-- record()
  +-- recordSuccess()
  +-- recordFailure()
  +-- findById()
  +-- search()
  +-- export()
```

Example:

```ts
await auditService.record({
  action: "user.role_changed",
  actorType: "USER",
  actorId: actor.id,
  targetType: "user",
  targetId: target.id,
  outcome: "SUCCESS",
  metadata: {
    previousRole,
    newRole,
  },
});
```

---

# Repository Architecture

Keep Prisma access behind a repository.

```text
AuditService
     ↓
AuditRepository
     ↓
Prisma
     ↓
PostgreSQL
```

The Admin route should not directly query Prisma.

---

# Automatic Route Auditing

It is tempting to automatically create an audit event for every:

```text
POST
PATCH
PUT
DELETE
```

This can be useful for basic coverage but is insufficient for business auditing.

Example:

```text
PATCH /users/123
```

does not tell you:

```text
which fields changed
why
whether the role changed
whether the operation had a special business meaning
```

Automatic middleware should therefore be used carefully.

---

# Explicit Business Auditing

Business services know what actually happened.

Example:

```ts
await userRepository.updateRole(...);

await auditService.record({
  action: "user.role_changed",
  ...
});
```

This produces a meaningful event.

---

# Choosing Automatic vs Explicit

Use automatic auditing for:

- generic request-level security events
- standardized authentication events
- coarse operational actions

Use explicit auditing for:

- role changes
- permission changes
- financial operations
- exports
- deletions
- approvals
- sensitive business transitions

The more important the event, the more explicit it should be.

---

# Error Handling

Audit failures must not be silently swallowed.

Bad:

```ts
try {
  await auditService.record(event);
} catch {
  // ignore
}
```

This creates invisible accountability gaps.

Instead:

- log the failure
- emit a metric
- use transactional persistence where required
- apply the documented fail-open/fail-closed policy

---

# Failed Actions

Failed security-sensitive actions may also deserve audit records.

Example:

```text
admin.permission_change_failed
```

However, do not create unlimited noise.

Differentiate:

```text
business failure
security-relevant failure
validation failure
expected user error
```

---

# Audit vs Error Logging

An error log:

```text
PrismaUniqueConstraintError
```

is not necessarily an audit event.

An audit event:

```text
user.role_change_failed
```

explains the meaningful business/security action.

Both can exist.

---

# Security

Audit systems should follow the same security principles as the rest of the application:

- authentication
- authorization
- least privilege
- input validation
- secure logging
- encryption in transit
- encryption at rest where appropriate
- secret protection
- tenant isolation
- retention controls

---

# Tamper Resistance

The following should generally be prohibited for normal users:

```text
edit audit record
change audit timestamp
change actor
change target
change outcome
delete individual record
```

If a correction is needed, append a corrective event.

---

# Database Security

Consider database-level protections for mature deployments:

```text
restricted application role
restricted maintenance role
separate read role
```

A compromised Admin account should not automatically have permission to erase historical audit evidence.

---

# Operational Security

Audit administration itself should be audited.

Examples:

```text
audit.export_requested
audit.retention_changed
audit.archive_started
audit.archive_completed
```

Be careful to avoid recursive logging loops.

For example:

```text
recording an audit event
```

should not generate another audit event unless explicitly intended.

---

# Logging Integration

Connect audit and application logs using:

```text
audit.id
request.id
correlation.id
trace.id
```

Example:

```text
Application log:
requestId=abc123

Audit:
requestId=abc123
auditId=audit789
```

This makes investigations much easier.

---

# Metrics

Recommended metrics:

```text
audit_events_total
audit_write_failures_total
audit_query_total
audit_query_denied_total
audit_export_total
audit_export_failures_total
```

For security:

```text
auth_login_failures_total
auth_refresh_reuse_detected_total
privilege_change_total
```

---

# Observability

Monitor:

```text
audit write latency
audit write failure rate
audit table growth
audit query latency
export duration
retention jobs
archive failures
```

An audit subsystem should not silently degrade.

---

# Alerting

Useful alerts:

- audit write failure spike
- audit database unavailable
- unusual export volume
- excessive audit access denial
- abnormal privilege-change rate
- audit table growth anomaly
- retention job failure
- archive failure

---

# Testing

Audit behavior needs dedicated tests.

## Unit Tests

Test:

- event construction
- redaction
- action naming
- metadata allowlisting
- actor resolution

## Integration Tests

Test:

```text
business mutation
+
audit record
```

inside the same transaction where required.

## Security Tests

Test:

- unauthorized audit access
- cross-tenant access
- audit record modification attempts
- audit deletion attempts
- sensitive field leakage

## E2E Tests

Test important Admin workflows:

```text
Admin changes role
    ↓
role changed
    ↓
audit record appears
```

---

# Testing Before/After Values

For an update:

```text
before:
role = EDITOR

after:
role = ADMIN
```

Assert that:

- only approved fields appear
- sensitive fields are absent
- values are correct
- event action is correct

---

# Testing Failed Actions

Example:

```text
Admin attempts unauthorized role change
```

Assert:

```text
operation rejected
```

and, if the policy requires it:

```text
security-relevant failure audited
```

---

# Performance

Audit writes should not make every request significantly slower.

For high-value transactional events:

```text
same database transaction
```

is often appropriate.

For less critical telemetry:

```text
outbox/asynchronous processing
```

may be preferable.

---

# Indexing

Common audit queries include:

```text
latest events
events by actor
events by target
events by action
events by date
events by outcome
```

Recommended indexes:

```text
createdAt
action + createdAt
actorId + createdAt
targetType + targetId + createdAt
outcome + createdAt
```

Only create indexes justified by real query patterns.

---

# High-Volume Events

Authentication failures can produce huge volumes.

Do not blindly persist every low-value event forever.

Options:

- short retention
- aggregation
- rate-based metrics
- security event stream
- sampled operational logging
- separate high-volume event storage

Critical security events should remain durable.

---

# Audit Exports

Large audit exports should be asynchronous.

Flow:

```text
Admin
  ↓
POST /audit-exports
  ↓
authorize
  ↓
audit export requested
  ↓
queue
  ↓
worker
  ↓
generate file
  ↓
store file
  ↓
audit export completed
```

Exports themselves should have controlled retention.

---

# Archive Strategy

At scale:

```text
Hot audit data
    ↓
PostgreSQL
    ↓
Archive
    ↓
Object storage / warehouse
```

Archive access should remain controlled.

Archived data should preserve:

- event ID
- action
- actor
- target
- timestamp
- relevant metadata
- integrity information

---

# Multi-Tenancy

If Fastify-MasterApp later supports tenants, every audit event should include:

```text
tenantId
```

Example:

```text
tenantId
actorId
targetType
targetId
action
createdAt
```

Queries must always enforce tenant isolation.

Recommended index:

```text
tenantId + createdAt
```

and tenant-scoped variants of common queries.

---

# Compliance Considerations

Audit logging may support requirements around:

- access control
- accountability
- change tracking
- incident investigation
- data access
- administrative actions

However:

> An audit log does not automatically make an application compliant.

Compliance requirements depend on:

- jurisdiction
- industry
- data type
- contractual requirements
- retention requirements
- organizational controls

Treat this document as engineering guidance, not legal advice.

---

# Incident Investigation

A good audit system should let an investigator answer:

```text
1. Who acted?
2. What did they do?
3. What object was affected?
4. When did it happen?
5. Was it successful?
6. From which request?
7. What changed?
8. What happened immediately before?
9. What happened immediately after?
```

Example investigation:

```text
10:31 auth.login
10:32 user.role_changed
10:33 admin.export_requested
10:35 export.completed
```

This timeline can reveal suspicious activity.

---

# Investigation Correlation

Useful identifiers:

```text
userId
auditId
requestId
correlationId
traceId
jobId
targetId
```

Use these consistently across API, workers, and audit storage.

---

# Audit Log Integrity

At minimum:

```text
append-only application behavior
restricted permissions
database backups
controlled retention
secure access
```

Higher-assurance environments may add:

```text
hashing
signing
external immutable storage
separate security account
```

---

# Backup and Recovery

Audit logs are often important during incidents.

Include them in backup planning.

Verify:

- backup frequency
- retention
- restore process
- integrity
- archive accessibility

Test restoration rather than assuming backups work.

---

# Disaster Recovery

If PostgreSQL is unavailable:

```text
business operations
+
audit operations
```

may be affected.

For critical workflows, document whether the system should:

```text
fail closed
queue for later
degrade safely
```

Do not leave this undefined.

---

# Operational Procedures

## Searching an Audit Record

1. Identify target or actor.
2. Narrow the date range.
3. Filter by action.
4. Inspect event details.
5. Correlate request/trace/job IDs.
6. Review neighboring events.

---

## Investigating a Role Change

Search:

```text
action = user.role_changed
targetId = affected user
```

Then inspect:

```text
actor
previousRole
newRole
timestamp
requestId
```

---

## Investigating an Export

Search:

```text
admin.export_requested
admin.export_started
admin.export_completed
admin.export_failed
admin.export_downloaded
```

Correlate using:

```text
exportId
actorId
requestId
```

---

# Common Anti-Patterns

## 1. Logging Passwords

Never.

---

## 2. Logging Tokens

Never.

---

## 3. Treating Application Logs as Audit Logs

They serve different purposes.

---

## 4. Auditing Every Request

This creates noise and storage pressure.

---

## 5. Auditing Only HTTP Routes

Business events should be recorded where the actual business action occurs.

---

## 6. Allowing Admins to Edit History

Audit records should be append-oriented.

---

## 7. No Tenant Filtering

This can become a severe authorization vulnerability.

---

## 8. No Retention Policy

Audit tables can grow indefinitely.

---

## 9. Storing Entire Request Bodies

This creates a high probability of sensitive-data leakage.

---

## 10. No Transactional Strategy

Critical mutations can occur without corresponding audit records.

---

## 11. Calling an Event "Completed" When It Was Only Queued

Use lifecycle events correctly.

---

## 12. No Audit Access Control

Audit logs contain sensitive information and require authorization.

---

## 13. No Monitoring of Audit Failures

A broken audit pipeline can create a silent accountability gap.

---

# Implementation Roadmap

## Phase 1 — Audit Foundation

Create:

```text
AuditLog
AuditService
AuditRepository
```

Implement:

- typed event model
- action naming convention
- actor/target model
- timestamp
- outcome
- request ID

---

# Phase 2 — Authentication Auditing

Add:

```text
auth.login
auth.logout
auth.password_changed
auth.password_reset
auth.refresh_reuse_detected
```

Redact sensitive information.

---

# Phase 3 — User Auditing

Add:

```text
user.created
user.updated
user.disabled
user.enabled
user.deleted
```

Track safe changed fields.

---

# Phase 4 — RBAC Auditing

Add:

```text
user.role_changed
permission.granted
permission.revoked
role.created
role.updated
role.deleted
```

This phase is especially important because authorization changes can create privilege escalation.

---

# Phase 5 — Admin UI

Create:

```text
Audit Logs
```

with:

- search
- filtering
- pagination
- detail view
- permission checks

---

# Phase 6 — Export

Add asynchronous audit export.

Use the background job architecture described in `BACKGROUND_JOBS.md`.

---

# Phase 7 — Outbox

Introduce outbox-based delivery for workflows where business mutations and audit events must be durably coordinated.

---

# Phase 8 — Retention

Implement:

- retention policies
- cleanup jobs
- archive process
- monitoring

---

# Phase 9 — Advanced Integrity

Only if required:

- immutable archive
- hash chains
- signatures
- external security storage

---

# Suggested Module Structure

```text
apps/api/src/modules/audit/

audit.routes.ts
audit.service.ts
audit.repository.ts
audit.schemas.ts
audit.types.ts
audit.constants.ts
audit.redaction.ts
audit.authorization.ts
```

For larger systems:

```text
audit/
  domain/
  application/
  infrastructure/
  http/
```

Keep the module consistent with the rest of the repository architecture.

---

# Example Constants

```ts
export const AuditAction = {
  UserCreated: "user.created",
  UserUpdated: "user.updated",
  UserDisabled: "user.disabled",
  UserRoleChanged: "user.role_changed",

  Login: "auth.login",
  LoginFailed: "auth.login_failed",
  Logout: "auth.logout",

  PermissionGranted: "permission.granted",
  PermissionRevoked: "permission.revoked",

  ExportRequested: "admin.export_requested",
  ExportCompleted: "admin.export_completed",
  ExportFailed: "admin.export_failed",
} as const;
```

Centralizing action names reduces typos.

---

# Example Redaction Strategy

Before writing metadata:

```ts
const safeMetadata = redactAuditMetadata(metadata);
```

Possible denylist:

```text
password
passwordHash
token
accessToken
refreshToken
authorization
cookie
secret
apiKey
privateKey
```

Prefer an allowlist for especially sensitive events.

---

# Example Audit Service API

```ts
await auditService.record({
  action: AuditAction.UserRoleChanged,
  actor: {
    type: "USER",
    id: adminUser.id,
  },
  target: {
    type: "user",
    id: user.id,
  },
  outcome: "SUCCESS",
  requestId,
  metadata: {
    previousRole,
    newRole,
  },
});
```

The service should normalize and validate the event before persistence.

---

# Architecture Review Checklist

Before approving the audit implementation:

### Architecture

- [ ] Audit module has a clear boundary.
- [ ] Routes do not directly access Prisma.
- [ ] Audit service owns event construction.
- [ ] Repository owns persistence.
- [ ] Shared types are reusable.
- [ ] Worker and API events use the same conventions.

### Security

- [ ] Audit API requires authentication.
- [ ] Audit API requires explicit permission.
- [ ] Tenant isolation is enforced if applicable.
- [ ] Sensitive fields are redacted.
- [ ] Audit records cannot be edited normally.
- [ ] Audit deletion is restricted.
- [ ] Secrets never enter metadata.

### Reliability

- [ ] Critical events are transactional.
- [ ] Outbox is used where required.
- [ ] Audit write failures are observable.
- [ ] Backup/recovery is tested.
- [ ] Retention is defined.

### Admin UX

- [ ] Search works.
- [ ] Filters work.
- [ ] Pagination is bounded.
- [ ] Detail view is safe.
- [ ] Export is permission-protected.
- [ ] Large exports are asynchronous.

### Testing

- [ ] Unit tests.
- [ ] Integration tests.
- [ ] RBAC tests.
- [ ] Tenant isolation tests.
- [ ] Sensitive-data redaction tests.
- [ ] Transaction tests.
- [ ] Failure-path tests.
- [ ] E2E Admin tests.

---

# Definition of Done

An audit logging feature is production-ready when:

- [ ] Event categories are documented.
- [ ] Action names are standardized.
- [ ] Actor identity is recorded.
- [ ] Target identity is recorded where applicable.
- [ ] Outcome is recorded.
- [ ] Timestamp is recorded.
- [ ] Request/correlation context is captured where appropriate.
- [ ] Sensitive fields are excluded.
- [ ] Metadata is validated/redacted.
- [ ] Critical events are transactionally consistent.
- [ ] Audit access requires explicit authorization.
- [ ] Tenant isolation exists where applicable.
- [ ] Audit records are append-oriented.
- [ ] Retention is documented.
- [ ] Backups include audit data.
- [ ] Audit failures are observable.
- [ ] Metrics exist.
- [ ] Search and pagination are bounded.
- [ ] Audit exports are secured.
- [ ] Large exports are asynchronous.
- [ ] Unit tests exist.
- [ ] Integration tests exist.
- [ ] Security tests exist.
- [ ] Admin E2E tests exist for critical workflows.
- [ ] Operational investigation procedures exist.

---

# Audit Event Checklist

Before adding a new event, answer:

### Identity

- Who initiated the action?
- Is the actor a user, system, worker, or integration?

### Target

- What resource was affected?
- Can it be represented by a stable ID?

### Action

- What exactly happened?
- Is the action name unambiguous?

### Outcome

- Did it succeed?
- Was it merely requested?
- Did it fail?

### Context

- Is request ID useful?
- Is correlation ID useful?
- Is IP address justified?
- Is user agent justified?

### Data

- What changed?
- Do before/after values matter?
- Could metadata contain secrets or personal data?

### Reliability

- Must the audit event be in the same transaction?
- Can an outbox solve the consistency requirement?

### Security

- Who can view the event?
- Could it reveal sensitive information?
- Could an attacker manipulate or delete it?

### Retention

- How long should it remain?
- Does it need archival?

---

# Golden Rules

## Rule 1

**Audit meaningful actions, not every request.**

## Rule 2

**Audit the business action where it actually happens.**

## Rule 3

**Never store passwords, tokens, or secrets.**

## Rule 4

**Treat audit logs as sensitive data.**

## Rule 5

**Authorization applies to audit-log access too.**

## Rule 6

**Critical business mutations and their audit events should be transactionally consistent.**

## Rule 7

**Audit records should be append-oriented and tamper-resistant.**

## Rule 8

**Use explicit event names that remain stable over time.**

## Rule 9

**Do not confuse queued, started, and completed operations.**

## Rule 10

**Audit failures must be observable.**

## Rule 11

**Do not allow tenant boundaries to be bypassed through audit queries.**

## Rule 12

**Keep audit metadata minimal and intentional.**

---

# Final Architecture Principle

Audit logging in Fastify-MasterApp should be treated as a **security and accountability subsystem**, not as another debug log.

The preferred architecture is:

```text
Business Action
      ↓
Authentication
      ↓
Authorization
      ↓
Service / Orchestrator
      ↓
Business Mutation
      +
Audit Event
      ↓
PostgreSQL
```

For critical asynchronous workflows:

```text
Business Transaction
      ↓
Outbox
      ↓
Worker
      ↓
Meaningful Audit Event
```

The system should make important actions:

- attributable
- durable
- searchable
- authorized
- tamper-resistant
- privacy-conscious
- observable
- recoverable

The goal is not to record everything.

The goal is to ensure that when something important happens, Fastify-MasterApp can reliably answer:

> **Who did what, to which resource, when, from which request, with what result, and what changed?**
