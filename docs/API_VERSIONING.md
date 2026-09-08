# API_VERSIONING.md

# Fastify-MasterApp — API Versioning & Compatibility Strategy

> Production-grade API versioning guidance for the Fastify API, React Admin frontend, shared TypeBox contracts, external consumers, Swagger/OpenAPI, database migrations, and long-term backward compatibility.

---

## Table of Contents

1. [Purpose](#purpose)
2. [Versioning Philosophy](#versioning-philosophy)
3. [Core Principles](#core-principles)
4. [Why API Versioning Matters](#why-api-versioning-matters)
5. [When to Version](#when-to-version)
6. [When Not to Version](#when-not-to-version)
7. [Recommended Strategy](#recommended-strategy)
8. [URL Versioning](#url-versioning)
9. [Version Format](#version-format)
10. [Current API Structure](#current-api-structure)
11. [Version Ownership](#version-ownership)
12. [Breaking vs Non-Breaking Changes](#breaking-vs-non-breaking-changes)
13. [Safe Changes](#safe-changes)
14. [Breaking Changes](#breaking-changes)
15. [Response Compatibility](#response-compatibility)
16. [Request Compatibility](#request-compatibility)
17. [Error Compatibility](#error-compatibility)
18. [Authentication Compatibility](#authentication-compatibility)
19. [Authorization Compatibility](#authorization-compatibility)
20. [Pagination Compatibility](#pagination-compatibility)
21. [Filtering Compatibility](#filtering-compatibility)
22. [Sorting Compatibility](#sorting-compatibility)
23. [Resource Naming](#resource-naming)
24. [Field Evolution](#field-evolution)
25. [Adding Fields](#adding-fields)
26. [Removing Fields](#removing-fields)
27. [Renaming Fields](#renaming-fields)
28. [Changing Field Types](#changing-field-types)
29. [Nullability Changes](#nullability-changes)
30. [Enum Evolution](#enum-evolution)
31. [Boolean Evolution](#boolean-evolution)
32. [IDs and Identifier Compatibility](#ids-and-identifier-compatibility)
33. [Date and Time Compatibility](#date-and-time-compatibility)
34. [Money and Numeric Fields](#money-and-numeric-fields)
35. [HTTP Methods](#http-methods)
36. [HTTP Status Codes](#http-status-codes)
37. [Headers](#headers)
38. [Content Types](#content-types)
39. [Query Parameters](#query-parameters)
40. [Request Bodies](#request-bodies)
41. [Response Envelopes](#response-envelopes)
42. [TypeBox Contracts](#typebox-contracts)
43. [Shared Contract Package](#shared-contract-package)
44. [Fastify Route Registration](#fastify-route-registration)
45. [Version-Specific Routes](#version-specific-routes)
46. [Version-Specific Services](#version-specific-services)
47. [Avoiding Version Duplication](#avoiding-version-duplication)
48. [Compatibility Adapters](#compatibility-adapters)
49. [Business Logic Independence](#business-logic-independence)
50. [Database Independence](#database-independence)
51. [Swagger/OpenAPI](#swaggeropenapi)
52. [Documentation](#documentation)
53. [Client Generation](#client-generation)
54. [React Admin Strategy](#react-admin-strategy)
55. [External Consumers](#external-consumers)
56. [Mobile Clients](#mobile-clients)
57. [Third-Party Integrations](#third-party-integrations)
58. [Webhooks](#webhooks)
59. [Webhook Versioning](#webhook-versioning)
60. [Background Jobs](#background-jobs)
61. [Job Payload Compatibility](#job-payload-compatibility)
62. [Database Migration Compatibility](#database-migration-compatibility)
63. [Expand and Contract](#expand-and-contract)
64. [Deprecation](#deprecation)
65. [Deprecation Headers](#deprecation-headers)
66. [Sunset Strategy](#sunset-strategy)
67. [Migration Guides](#migration-guides)
68. [Version Lifecycle](#version-lifecycle)
69. [Supporting Multiple Versions](#supporting-multiple-versions)
70. [Version Routing](#version-routing)
71. [Monitoring Versions](#monitoring-versions)
72. [Metrics](#metrics)
73. [Logging](#logging)
74. [Tracing](#tracing)
75. [Security](#security)
76. [Rate Limiting](#rate-limiting)
77. [Caching](#caching)
78. [CDN and Proxy Considerations](#cdn-and-proxy-considerations)
79. [Testing](#testing)
80. [Contract Testing](#contract-testing)
81. [Compatibility Testing](#compatibility-testing)
82. [Integration Testing](#integration-testing)
83. [E2E Testing](#e2e-testing)
84. [Deprecation Testing](#deprecation-testing)
85. [Release Process](#release-process)
86. [Pull Request Rules](#pull-request-rules)
87. [Version Review Checklist](#version-review-checklist)
88. [Common Anti-Patterns](#common-anti-patterns)
89. [Implementation Roadmap](#implementation-roadmap)
90. [Definition of Done](#definition-of-done)
91. [API Change Checklist](#api-change-checklist)
92. [Golden Rules](#golden-rules)

---

# Purpose

API versioning protects clients from unexpected breaking changes.

Fastify-MasterApp currently exposes a versioned API structure:

```text
/api/v1
```

This document defines how the project should evolve that API over time without creating unnecessary compatibility complexity.

The objective is:

```text
Fast iteration
      +
Stable contracts
      +
Predictable migrations
      +
Controlled breaking changes
```

---

# Versioning Philosophy

API versioning is not a license to make every change in a new version.

A healthy API should remain backward compatible whenever reasonably possible.

The preferred approach is:

```text
v1
 |
 +-- additive changes
 +-- deprecations
 +-- compatibility adapters
 |
 +-- v2 only when a real breaking boundary is required
```

Avoid:

```text
Every change
  ↓
new version
```

That creates unnecessary maintenance burden.

---

# Core Principles

## 1. Version contracts, not implementation details

Clients care about:

- URLs
- request shapes
- response shapes
- error behavior
- authentication
- semantics

They do not care whether the backend internally uses:

```text
Prisma
Redis
Fastify
BullMQ
```

---

## 2. Prefer backward-compatible changes

Additive changes are usually safer than breaking changes.

---

## 3. Breaking changes require an explicit decision

Do not accidentally create a breaking API change through a normal refactor.

---

## 4. Versions should represent meaningful contract generations

A version should not exist merely because a developer changed an internal function.

---

## 5. Old versions need a retirement plan

Supporting:

```text
v1
v2
v3
v4
```

forever is expensive.

Every version should have:

```text
launch
maintenance
deprecation
sunset
```

---

# Why API Versioning Matters

Without versioning:

```text
Client
  ↓
expects:
{
  "name": "Rohit"
}
```

Server changes:

```json
{
  "displayName": "Rohit"
}
```

The client breaks.

With explicit versioning:

```text
v1
  ↓
old contract

v2
  ↓
new contract
```

Clients can migrate deliberately.

---

# When to Version

Create a new major API version when the existing contract cannot reasonably remain compatible.

Examples:

- resource representation fundamentally changes
- required fields change incompatibly
- authentication contract changes
- pagination semantics fundamentally change
- endpoint behavior changes incompatibly
- resource model is redesigned
- security boundary requires incompatible behavior

---

# When Not to Version

Do not create a new API version for:

- bug fixes that restore documented behavior
- performance improvements
- internal refactors
- new optional fields
- new endpoints
- new optional query parameters
- additional error metadata that clients can ignore
- implementation changes with unchanged semantics

---

# Recommended Strategy

Fastify-MasterApp should use:

```text
URL path versioning
```

Example:

```text
/api/v1/users
/api/v1/auth/login
```

Future:

```text
/api/v2/users
```

This is simple, explicit, and easy to understand operationally.

---

# URL Versioning

Recommended structure:

```text
/api/{version}/{resource}
```

Examples:

```text
/api/v1/users
/api/v1/roles
/api/v1/permissions
/api/v1/audit-logs
```

Future:

```text
/api/v2/users
```

Keep versioning at a consistent path boundary.

---

# Version Format

Use:

```text
v1
v2
v3
```

Do not use:

```text
v1.2.3
```

in the URL.

API contract versions should represent compatibility generations, not application release versions.

---

# API Release vs API Version

These are different.

Application release:

```text
2026.09.07
```

API contract:

```text
v1
```

An API version can receive many application releases.

Example:

```text
v1
  ├── release 1
  ├── release 2
  ├── release 3
  └── release 20
```

---

# Current API Structure

The existing architecture should maintain:

```text
/api/v1
```

with resources such as:

```text
/api/v1/auth
/api/v1/users
/api/v1/todos
/api/v1/examples
```

Future modules should follow the same convention.

---

# Version Ownership

API versioning should be owned by the API contract layer.

Recommended responsibilities:

```text
Route
  ↓
Version contract
  ↓
Application service
  ↓
Repository
```

The database should not know about:

```text
v1
v2
```

unless a migration temporarily requires compatibility fields.

---

# Breaking vs Non-Breaking Changes

Every API change should be classified.

### Non-breaking

Existing clients continue to work.

### Potentially breaking

Behavior may break poorly implemented clients.

### Breaking

A documented client must change to continue working.

This classification should happen during code review.

---

# Safe Changes

Generally safe:

- add endpoint
- add optional request field
- add optional query parameter
- add response field if clients tolerate unknown fields
- improve performance
- add new enum values only when clients are designed for unknown values
- add documentation
- add optional response metadata

Even these should be reviewed for client behavior.

---

# Breaking Changes

Examples:

```text
rename field
remove field
change field type
make optional field required
change enum meaning
change authentication scheme
change pagination contract
change response envelope
change status-code semantics
remove endpoint
```

---

# Response Compatibility

Clients should generally use:

```text
known fields
```

and ignore unknown fields.

Example v1:

```json
{
  "id": "user_123",
  "name": "Rohit"
}
```

Additive change:

```json
{
  "id": "user_123",
  "name": "Rohit",
  "timezone": "Asia/Kolkata"
}
```

A robust client continues working.

---

# Request Compatibility

Adding an optional field:

```json
{
  "name": "Rohit",
  "timezone": "Asia/Kolkata"
}
```

is generally backward compatible if:

```text
timezone
```

is optional.

Making it required is breaking.

---

# Error Compatibility

Error codes are part of the API contract.

Avoid changing:

```text
USER_NOT_FOUND
```

to:

```text
RESOURCE_MISSING
```

without a compatibility plan.

Messages may evolve more freely than codes.

Clients should use:

```text
error.code
```

rather than message strings.

---

# Authentication Compatibility

Authentication changes are high-risk.

Examples:

```text
JWT claim changes
token transport changes
cookie changes
refresh-token behavior changes
scope changes
```

Treat authentication contract changes as potentially breaking.

---

# JWT Claims

Adding a claim can be safe:

```json
{
  "sub": "user_123",
  "role": "ADMIN"
}
```

becoming:

```json
{
  "sub": "user_123",
  "role": "ADMIN",
  "tenantId": "tenant_123"
}
```

Changing the meaning or type of an existing claim can be breaking.

---

# Authorization Compatibility

Adding a new permission is generally not a protocol break.

However, changing default authorization behavior can be a functional breaking change.

Example:

```text
GET /users
```

previously allowed to a role but now returns:

```text
403
```

This requires deliberate release communication.

---

# Pagination Compatibility

Pagination is a contract.

Current convention should be documented consistently.

Example:

```text
GET /users?limit=50&cursor=...
```

Changing from:

```text
page=2
```

to:

```text
cursor=...
```

is a potentially breaking change.

If both are needed during migration:

```text
v1:
page pagination

v2:
cursor pagination
```

may be cleaner.

---

# Filtering Compatibility

Adding filters is usually safe:

```text
GET /users?status=ACTIVE
```

Changing existing filter semantics may be breaking.

Document:

```text
case sensitivity
null behavior
multiple values
operators
```

---

# Sorting Compatibility

Adding sort options is usually safe.

Changing the default sort order can be a functional change.

Example:

```text
old:
createdAt DESC

new:
updatedAt DESC
```

Even though the response schema is unchanged, client behavior may change.

Treat semantic changes seriously.

---

# Resource Naming

Do not casually rename:

```text
/users
```

to:

```text
/accounts
```

even if the backend domain terminology changes.

If the public API must change:

```text
v1/users
v2/accounts
```

can provide a clean compatibility boundary.

---

# Field Evolution

Field evolution is one of the most common sources of breaking changes.

Example:

```json
{
  "name": "Rohit"
}
```

Possible evolution:

```text
name
 ↓
displayName
```

Avoid changing it directly in v1.

---

# Adding Fields

Usually safe:

```json
{
  "id": "...",
  "name": "...",
  "email": "...",
  "timezone": "Asia/Kolkata"
}
```

Ensure generated clients and validation logic tolerate additional response fields.

---

# Removing Fields

Field removal is breaking if clients may depend on it.

Safer sequence:

```text
1. announce deprecation
2. stop documenting as preferred
3. measure usage
4. provide replacement
5. release new version if required
6. sunset old field
```

---

# Renaming Fields

Do not silently rename.

Possible migration:

```text
v1:
name

v2:
displayName
```

or temporarily support both:

```text
name
displayName
```

with clear precedence rules.

---

# Changing Field Types

Example:

```text
count: number
```

to:

```text
count: string
```

is breaking.

Also potentially breaking:

```text
id: number
```

to:

```text
id: string
```

even if JSON serialization looks simple.

---

# Nullability Changes

Changing:

```text
timezone?: string
```

to:

```text
timezone: string
```

can break clients that omit it.

Changing:

```text
string
```

to:

```text
string | null
```

can also break clients that assume a string.

Nullability is part of the contract.

---

# Enum Evolution

Suppose:

```text
status:
ACTIVE
DISABLED
```

Adding:

```text
PENDING
```

may break clients that assume exhaustive handling.

Clients should use a safe default:

```ts
switch (status) {
  case "ACTIVE":
  case "DISABLED":
    ...
    break;
  default:
    handleUnknownStatus();
}
```

---

# Boolean Evolution

Avoid overloaded booleans.

Bad:

```json
{
  "active": true
}
```

where future states may include:

```text
pending
suspended
deleted
```

Prefer an explicit state enum when the domain has multiple states.

---

# IDs and Identifier Compatibility

Treat identifier format as stable.

Do not casually switch:

```text
integer
```

to:

```text
UUID
```

or:

```text
UUID
```

to:

```text
opaque string
```

without compatibility analysis.

Public IDs should be treated as contracts.

---

# Date and Time Compatibility

Use a documented format.

Recommended:

```text
ISO 8601
```

Example:

```text
2026-09-07T10:30:00Z
```

Do not change from:

```text
UTC timestamp
```

to:

```text
local timestamp
```

without a version or migration strategy.

---

# Timezone Semantics

Document whether timestamps are:

```text
UTC
```

or:

```text
offset-aware
```

Prefer UTC for API timestamps.

User-specific timezone behavior belongs in explicit fields or business configuration.

---

# Money and Numeric Fields

Be careful with:

```text
number
```

because floating-point semantics can cause compatibility and precision problems.

Document:

```text
currency
precision
unit
representation
```

For financial APIs, a decimal/string representation may be safer.

---

# HTTP Methods

Do not change:

```text
POST
```

to:

```text
PUT
```

without considering client compatibility.

HTTP method semantics are part of the API contract.

---

# HTTP Status Codes

Changing:

```text
200
```

to:

```text
202
```

can be breaking.

For example:

```text
POST /exports
```

changing from immediate completion to asynchronous processing may require a contract change.

Document asynchronous semantics clearly.

---

# Headers

Headers can also be contractual.

Examples:

```text
Authorization
Content-Type
Idempotency-Key
Retry-After
Deprecation
```

Do not rename or change semantics casually.

---

# Content Types

A change from:

```text
application/json
```

to:

```text
application/problem+json
```

may affect clients.

Choose a format deliberately and version if necessary.

---

# Query Parameters

Adding optional parameters is generally safe.

Changing:

```text
limit
```

semantics is potentially breaking.

Document:

```text
default
minimum
maximum
meaning
```

---

# Request Bodies

Shared TypeBox contracts should define request compatibility.

Example:

```ts
const CreateUserRequest = Type.Object({
  email: Type.String({ format: "email" }),
  displayName: Type.String(),
});
```

When evolving:

```text
required
optional
nullable
enum
type
```

changes must be reviewed.

---

# Response Envelopes

Keep the envelope stable within a version.

Example:

```json
{
  "data": {},
  "meta": {}
}
```

Do not change to:

```json
{
  "result": {}
}
```

without a version boundary.

---

# TypeBox Contracts

TypeBox provides an important compatibility boundary.

Treat shared schemas as public contracts.

Every contract change should be reviewed for:

```text
request compatibility
response compatibility
runtime validation
generated clients
Admin frontend
external consumers
```

---

# Shared Contract Package

Recommended:

```text
packages/api-contracts/
```

Organize by version where useful:

```text
api-contracts/
  src/
    v1/
      auth.ts
      users.ts
      roles.ts
      audit.ts
    index.ts
```

Do not duplicate every internal type simply because API versions exist.

---

# Contract Ownership

Keep public contracts separate from domain entities.

Bad:

```text
API response = Prisma User model
```

Better:

```text
Prisma User
    ↓
mapper
    ↓
UserResponseV1
```

This prevents database changes from accidentally becoming API changes.

---

# Fastify Route Registration

A versioned API can be registered explicitly.

Conceptually:

```ts
fastify.register(v1Routes, {
  prefix: "/api/v1",
});
```

Future:

```ts
fastify.register(v2Routes, {
  prefix: "/api/v2",
});
```

Keep version registration centralized.

---

# Version-Specific Routes

Example:

```text
apps/api/src/routes/
  v1/
    auth.routes.ts
    users.routes.ts

  v2/
    users.routes.ts
```

Only create a v2 implementation where behavior actually differs.

---

# Version-Specific Services

Avoid:

```text
UserServiceV1
UserServiceV2
```

unless business behavior genuinely differs.

Prefer:

```text
V1 route
   ↓
compatibility mapper
   ↓
shared UserService
```

This reduces duplication.

---

# Avoiding Version Duplication

Do not copy the entire application for every API version.

Bad:

```text
v1/
  services/
  repositories/
  database/

v2/
  services/
  repositories/
  database/
```

This creates two applications.

Prefer:

```text
v1 routes
v2 routes
     ↓
shared application services
     ↓
shared repositories
     ↓
shared database
```

---

# Compatibility Adapters

Adapters are useful when the public contract differs from internal representation.

Example:

```text
Internal User
    ↓
UserResponseV1 mapper
```

and:

```text
Internal User
    ↓
UserResponseV2 mapper
```

The domain model can evolve independently.

---

# Business Logic Independence

API versioning should not force duplicated business rules.

Example:

```text
v1/users
v2/users
```

can both call:

```text
UserService.getUser()
```

while returning different representations.

---

# Database Independence

The database schema should evolve independently of public API versions.

Avoid creating:

```text
users_v1
users_v2
```

just because the API changed.

Instead use:

```text
same database model
+
compatibility mapping
```

when possible.

---

# Swagger/OpenAPI

Swagger should expose versioned contracts clearly.

Example:

```text
API v1
  /api/v1/users
  /api/v1/roles

API v2
  /api/v2/users
```

If multiple versions coexist, documentation should make the supported status obvious.

---

# Documentation

Every breaking version should have:

```text
overview
migration guide
breaking changes
deprecated endpoints
examples
timeline
```

Do not expect consumers to infer migration requirements from a diff.

---

# Client Generation

If generated TypeScript clients are used:

```text
API v1 schema
   ↓
v1 client
```

and:

```text
API v2 schema
   ↓
v2 client
```

Keep generated clients aligned with the API contract.

---

# React Admin Strategy

Fastify-MasterApp's Admin frontend is a first-party consumer.

It should normally use the current supported API version.

Example:

```text
Admin
  ↓
/api/v1
```

When v2 is introduced:

```text
Admin migration
  ↓
v2 client
  ↓
v2 API
```

Do not keep the Admin on an old API indefinitely just because external clients exist.

---

# Admin Migration

Recommended process:

```text
1. implement v2
2. support v1 and v2
3. migrate shared contracts
4. update Admin API client
5. update Admin tests
6. release
7. monitor v2
8. deprecate v1
```

---

# External Consumers

If external consumers exist, version support should be explicit.

Document:

```text
supported versions
minimum version
deprecation dates
sunset dates
migration documentation
```

---

# Mobile Clients

Mobile apps can remain deployed for long periods.

Therefore mobile clients may require longer API support windows.

Before removing a version:

```text
measure active clients
```

and confirm migration feasibility.

---

# Third-Party Integrations

Third-party integrations should never silently break.

Use:

```text
versioned endpoints
stable contracts
deprecation notices
migration guides
```

For high-value integrations, establish communication channels for breaking changes.

---

# Webhooks

Webhooks are APIs too.

Treat webhook payloads as versioned contracts.

Example:

```text
event:
user.created

payloadVersion:
1
```

or:

```text
Webhook endpoint:
.../webhooks/v1
```

Choose one convention and document it.

---

# Webhook Versioning

Do not change a webhook payload shape silently.

Example:

```text
v1:
{
  "userId": "123"
}
```

v2:

```text
{
  "id": "123",
  "user": {...}
}
```

Consumers need an explicit migration path.

---

# Webhook Signature Compatibility

If webhook signing changes:

```text
signature algorithm
header
canonicalization
secret handling
```

treat it as a security-sensitive compatibility change.

Support both during migration if practical.

---

# Background Jobs

Queue payloads are also contracts.

A queued job may survive a deployment.

Therefore:

```text
job version
```

should be considered when changing payloads.

---

# Job Payload Compatibility

Bad:

```text
v1 payload:
{
  "userId": "123"
}
```

Code changes to expect:

```text
{
  "accountId": "123"
}
```

while old jobs remain in Redis.

Safer:

```json
{
  "version": 1,
  "userId": "123"
}
```

and:

```json
{
  "version": 2,
  "accountId": "123"
}
```

or maintain backward-compatible parsing.

See `BACKGROUND_JOBS.md`.

---

# Database Migration Compatibility

API version changes often require database changes.

Use expand-and-contract migrations.

Example:

```text
Old:
name

New:
displayName
```

Safe migration:

```text
1. add displayName
2. populate displayName
3. application reads both
4. application writes new field
5. migrate API representation
6. verify usage
7. remove old field later
```

---

# Expand and Contract

General pattern:

```text
EXPAND
  ↓
Add new structure
  ↓
Deploy compatible code
  ↓
MIGRATE DATA
  ↓
SWITCH TRAFFIC
  ↓
CONTRACT
  ↓
Remove obsolete structure
```

Never couple a destructive database migration directly to the first release of a new API version unless compatibility has been proven.

---

# Deprecation

Deprecation means:

> The API still works, but consumers should migrate away from it.

Deprecation should have:

```text
reason
replacement
date
migration guide
sunset plan
```

---

# Deprecation Timeline

Example:

```text
January:
v1 deprecation announced

February:
v2 migration guide published

March:
v1 warning headers enabled

June:
v1 sunset

After June:
v1 returns documented retirement response
```

The exact timeline depends on consumers.

---

# Deprecation Headers

Where useful, return standardized deprecation metadata.

Potential headers:

```text
Deprecation: true
Sunset: <date>
Link: <migration documentation>; rel="deprecation"
```

Header support should be documented and tested.

Do not invent a proprietary header if a standardized approach is sufficient.

---

# Sunset Strategy

Before sunset:

```text
measure usage
identify consumers
communicate
provide migration guide
```

After sunset:

```text
reject unsupported version
```

Use a clear error:

```json
{
  "error": {
    "code": "API_VERSION_SUNSET",
    "message": "This API version is no longer supported.",
    "requestId": "req_123"
  }
}
```

---

# Migration Guides

A migration guide should contain:

```text
Overview
Why change
Timeline
Breaking changes
Before/after examples
Endpoint mapping
Field mapping
Authentication changes
Error changes
Pagination changes
Testing instructions
Rollback strategy
```

---

# Version Lifecycle

Recommended lifecycle:

```text
ACTIVE
  ↓
DEPRECATED
  ↓
SUNSET
  ↓
REMOVED
```

Each state should have explicit operational meaning.

---

# Active

Supported for normal use.

Requirements:

- tests
- documentation
- monitoring
- security fixes

---

# Deprecated

Still functional but migration is recommended.

Requirements:

- migration documentation
- usage monitoring
- deprecation communication

---

# Sunset

No longer supported.

The API should return a clear error rather than silently behaving differently.

---

# Removed

Implementation and documentation can eventually be removed after the retention period and operational requirements are satisfied.

---

# Supporting Multiple Versions

Multiple versions should be supported only when there is a real consumer need.

Example:

```text
v1 — deprecated
v2 — active
```

Avoid:

```text
v1
v2
v3
v4
```

without strong justification.

---

# Version Routing

Centralize version routing:

```text
/api/v1/*
/api/v2/*
```

Avoid scattering version checks throughout business logic:

Bad:

```ts
if (request.version === "v1") {
  ...
}
```

inside dozens of services.

Prefer version-specific adapters at the API boundary.

---

# Version Detection

Because URL versioning is recommended, avoid multiple competing version mechanisms.

Do not simultaneously require:

```text
URL version
+
Accept header version
+
query version
```

unless there is a compelling external integration requirement.

One clear mechanism is easier to operate.

---

# Monitoring Versions

Track traffic by version:

```text
api_requests_total{version="v1"}
api_requests_total{version="v2"}
```

Monitor:

```text
request count
error rate
latency
endpoint usage
consumer distribution
```

---

# Version Usage Dashboard

Useful Admin/observability dashboard:

```text
API Versions

v1
Requests: 12,400
Errors: 0.8%
Status: Deprecated

v2
Requests: 84,200
Errors: 0.3%
Status: Active
```

This makes sunset decisions evidence-based.

---

# Metrics

Recommended labels:

```text
version
route
method
status
```

Avoid high-cardinality labels such as:

```text
userId
requestId
raw URL
full error message
```

---

# Logging

Every request log should make version identifiable.

Example:

```json
{
  "event": "http.request",
  "version": "v1",
  "route": "/users/:id",
  "method": "GET",
  "statusCode": 200
}
```

This helps identify remaining old-version traffic.

---

# Tracing

Trace attributes can include:

```text
api.version
http.route
http.method
http.status_code
```

This helps compare v1 and v2 behavior.

---

# Security

Do not weaken security merely to maintain an old API.

If v1 uses a security mechanism that becomes unsafe:

```text
security > compatibility
```

may require accelerated deprecation.

---

# Authentication Sunset

If an old authentication scheme is being retired:

```text
v1
  ↓
old authentication

v2
  ↓
new authentication
```

Document:

- token differences
- claims
- expiration
- refresh behavior
- client changes

---

# Rate Limiting

Rate limits are part of API behavior.

Changing:

```text
100 requests/minute
```

to:

```text
10 requests/minute
```

can be a functional breaking change.

Document version-specific policies if they differ.

---

# Caching

Changing response semantics can invalidate caches.

When versioning:

```text
/api/v1/users
```

and:

```text
/api/v2/users
```

are naturally distinct cache keys.

Ensure CDN/proxy configuration preserves version boundaries.

---

# CDN and Proxy Considerations

Verify that:

```text
/api/v1/*
/api/v2/*
```

are not accidentally normalized into the same cache key.

Also ensure:

- authentication headers are handled correctly
- cache-control is correct
- private responses are not shared
- error responses are not incorrectly cached

---

# Testing

API versioning requires compatibility testing.

Test:

```text
v1 behavior
v2 behavior
shared business behavior
version-specific mapping
deprecation
sunset
```

---

# Contract Testing

For each active version:

```text
request schema
response schema
error schema
status codes
headers
```

should be covered.

The TypeBox contract package is a natural source for contract tests.

---

# Compatibility Testing

For a non-breaking change:

```text
existing v1 client
  ↓
new API release
  ↓
still works
```

This should be tested automatically where practical.

---

# Integration Testing

Test version routes against:

- PostgreSQL
- authentication
- authorization
- Redis where needed
- external dependencies
- error handling

Do not only test schema validation.

---

# E2E Testing

For the Admin:

```text
login
  ↓
users
  ↓
roles
  ↓
audit
```

should continue working after API version changes.

---

# Deprecation Testing

Verify:

```text
deprecated version still works
```

and:

```text
Deprecation headers appear
```

when configured.

---

# Sunset Testing

Verify:

```text
sunset version
  ↓
API_VERSION_SUNSET
```

and:

```text
request ID
```

is included.

---

# Release Process

Recommended API change process:

```text
1. classify change
2. determine breaking/non-breaking
3. update TypeBox contracts
4. update OpenAPI
5. update tests
6. update Admin client
7. update migration docs
8. implement
9. review compatibility
10. release
11. monitor
```

---

# Pull Request Rules

Every PR changing an API contract should answer:

```text
Is this change breaking?
If no, why?
If yes, why is a new version required?
Which clients are affected?
What migration is required?
Are contracts updated?
Are Swagger docs updated?
Are tests updated?
```

---

# Breaking Change Review

A breaking change should receive explicit architecture review.

Review:

- client impact
- mobile impact
- external integrations
- database migration
- background jobs
- webhooks
- authentication
- authorization
- monitoring
- rollback

---

# Rollback Strategy

A version rollout should be reversible.

Prefer:

```text
v1
  ↓
v2 introduced
  ↓
v2 monitored
  ↓
v2 rollback if needed
```

Do not immediately remove v1 when introducing v2.

Keep old behavior available during the stabilization window when operationally feasible.

---

# Feature Flags

Feature flags can help roll out new behavior inside a version.

Example:

```text
v2 + featureFlag
```

Do not use feature flags as a substitute for API versioning when the public contract itself is incompatible.

---

# Version and Feature Flags

Use:

```text
version = contract boundary
feature flag = rollout boundary
```

These solve different problems.

---

# API Version Security Review

Before launching a new version:

- [ ] authentication unchanged or documented
- [ ] authorization unchanged or documented
- [ ] IDOR protections preserved
- [ ] rate limits reviewed
- [ ] validation reviewed
- [ ] sensitive fields reviewed
- [ ] error leakage reviewed
- [ ] audit events reviewed
- [ ] CORS reviewed
- [ ] CSRF implications reviewed
- [ ] caching reviewed

---

# Common Anti-Patterns

## 1. Version Every Change

Creates unnecessary duplication.

---

## 2. No Versioning at All

Eventually forces unsafe breaking changes.

---

## 3. Version the Database

API versions should not automatically create database versions.

---

## 4. Duplicate the Entire Application

Avoid:

```text
v1 service
v2 service
v1 repository
v2 repository
```

unless behavior genuinely differs.

---

## 5. Version by Query Parameter

Avoid:

```text
/users?version=2
```

as the primary strategy.

The recommended convention is:

```text
/api/v2/users
```

---

## 6. Mix Multiple Versioning Mechanisms

Avoid requiring clients to understand:

```text
URL version
+
header version
+
query version
```

---

## 7. Change Error Codes Silently

Error codes are contracts.

---

## 8. Remove Fields Without Measuring Usage

A field may be used by clients you cannot see.

---

## 9. Change Semantics Without Changing Schema

Example:

```text
200 now means "accepted for processing"
```

instead of:

```text
completed
```

This can be breaking even if the JSON looks identical.

---

## 10. Break Old Jobs

Queued background jobs may outlive the release that created them.

---

## 11. Ignore Webhooks

Webhook consumers are clients too.

---

## 12. Sunset Without Usage Data

Measure traffic before removal.

---

## 13. Keep Versions Forever

Every supported version has maintenance cost.

---

## 14. Put Version Logic in Business Services

Keep version-specific concerns near the API boundary.

---

# Implementation Roadmap

## Phase 1 — Formalize v1

Document:

```text
/api/v1
```

including:

- endpoints
- request contracts
- response contracts
- error contracts
- authentication
- pagination
- filtering
- rate limits

---

# Phase 2 — Contract Discipline

Require API PRs to classify changes as:

```text
non-breaking
potentially breaking
breaking
```

Update TypeBox and Swagger together.

---

# Phase 3 — Compatibility Tests

Add tests ensuring existing v1 behavior survives normal releases.

---

# Phase 4 — Deprecation Infrastructure

Add support for:

```text
Deprecation
Sunset
migration documentation
version usage metrics
```

before the first real sunset.

---

# Phase 5 — Introduce v2 Only When Needed

When a real breaking requirement appears:

```text
/api/v2
```

Add only the changed boundaries.

Reuse:

```text
services
repositories
database
security
observability
```

where possible.

---

# Phase 6 — Migrate First-Party Admin

Move the Admin frontend to the new version.

Validate:

```text
auth
users
roles
audit
dashboard
settings
```

---

# Phase 7 — External Migration

Provide:

- migration guide
- compatibility period
- usage metrics
- deprecation warnings
- support process

---

# Phase 8 — Sunset

After traffic reaches the acceptable threshold:

```text
deprecate
  ↓
announce
  ↓
monitor
  ↓
sunset
  ↓
remove
```

---

# Recommended Directory Structure

```text
apps/api/src/

routes/
  v1/
    auth.routes.ts
    users.routes.ts
    roles.routes.ts
    audit.routes.ts

  v2/
    users.routes.ts

mappers/
  v1/
    user.mapper.ts

  v2/
    user.mapper.ts
```

Contracts:

```text
packages/api-contracts/src/

v1/
  auth.ts
  users.ts
  roles.ts
  audit.ts

v2/
  users.ts
```

Only duplicate contracts where the public contract differs.

---

# Example Versioned Registration

Conceptually:

```ts
fastify.register(v1Routes, {
  prefix: "/api/v1",
});
```

Later:

```ts
fastify.register(v2Routes, {
  prefix: "/api/v2",
});
```

Keep the registration in one predictable place.

---

# Example V1/V2 Mapper

Internal model:

```ts
type User = {
  id: string;
  displayName: string;
  email: string;
};
```

v1:

```ts
function toUserV1(user: User) {
  return {
    id: user.id,
    name: user.displayName,
    email: user.email,
  };
}
```

v2:

```ts
function toUserV2(user: User) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  };
}
```

The business logic remains shared.

---

# API Change Decision Tree

Use this process:

```text
API change
   |
   v
Does existing client behavior remain valid?
   |
   +-- YES --> non-breaking
   |             |
   |             v
   |        update v1
   |
   +-- NO --> Can compatibility be added?
                 |
                 +-- YES --> compatibility layer
                 |
                 +-- NO --> breaking change
                              |
                              v
                           new version
```

---

# Version Review Checklist

## Contract

- [ ] URL documented.
- [ ] HTTP methods documented.
- [ ] Request schema documented.
- [ ] Response schema documented.
- [ ] Error schema documented.
- [ ] Headers documented.
- [ ] Pagination documented.
- [ ] Filtering documented.
- [ ] Sorting documented.

## Compatibility

- [ ] Existing clients analyzed.
- [ ] Change classified.
- [ ] Error-code compatibility reviewed.
- [ ] Enum compatibility reviewed.
- [ ] Nullability reviewed.
- [ ] Identifier compatibility reviewed.
- [ ] Date/time semantics reviewed.

## Architecture

- [ ] Version logic is near API boundary.
- [ ] Business logic remains reusable.
- [ ] Database does not unnecessarily duplicate models.
- [ ] Shared contracts are versioned appropriately.
- [ ] Mappers/adapters are tested.

## Operations

- [ ] Metrics include version.
- [ ] Logs include version.
- [ ] Traces include version.
- [ ] Swagger updated.
- [ ] Deprecation plan exists if relevant.
- [ ] Rollback plan exists.

## Security

- [ ] Authentication reviewed.
- [ ] Authorization reviewed.
- [ ] Rate limiting reviewed.
- [ ] CORS reviewed.
- [ ] Validation reviewed.
- [ ] Sensitive fields reviewed.
- [ ] Audit events reviewed.

---

# Definition of Done

An API versioning change is production-ready when:

- [ ] Change classification is documented.
- [ ] Public contract is explicit.
- [ ] TypeBox contracts are updated.
- [ ] Fastify routes are versioned correctly.
- [ ] Swagger/OpenAPI is updated.
- [ ] Error contracts are stable.
- [ ] Authentication behavior is documented.
- [ ] Authorization behavior is documented.
- [ ] Pagination/filtering semantics are documented.
- [ ] Database migration is backward compatible.
- [ ] Background job compatibility is verified.
- [ ] Webhook compatibility is verified where relevant.
- [ ] React Admin client is updated.
- [ ] Existing clients have been considered.
- [ ] Compatibility tests pass.
- [ ] E2E tests pass.
- [ ] Security review passes.
- [ ] Metrics identify the version.
- [ ] Logs identify the version.
- [ ] Deprecation/sunset plan exists for breaking migrations.
- [ ] Rollback is possible.

---

# API Change Checklist

Before merging any API change:

### Contract

- [ ] Is the URL unchanged?
- [ ] Is the HTTP method unchanged?
- [ ] Is the request schema backward compatible?
- [ ] Is the response schema backward compatible?
- [ ] Are error codes unchanged?
- [ ] Are status codes unchanged?
- [ ] Are semantics unchanged?

### Data

- [ ] Does the database migration support old code?
- [ ] Does it support new code?
- [ ] Are background jobs compatible?
- [ ] Are webhooks compatible?

### Clients

- [ ] Does the Admin still work?
- [ ] Are generated clients updated?
- [ ] Have external clients been considered?
- [ ] Have mobile clients been considered?

### Documentation

- [ ] TypeBox updated.
- [ ] Swagger updated.
- [ ] API docs updated.
- [ ] Migration guide updated if needed.

### Operations

- [ ] Metrics updated.
- [ ] Logging updated.
- [ ] Alerts reviewed.
- [ ] Rollback tested.

---

# Golden Rules

## Rule 1

**Treat the API contract as a product interface.**

## Rule 2

**Prefer backward-compatible changes.**

## Rule 3

**Use `/api/v1`, `/api/v2`, etc. for major contract generations.**

## Rule 4

**Do not create a new version for internal implementation changes.**

## Rule 5

**Breaking changes require explicit review.**

## Rule 6

**Error codes, status codes, and semantics are part of the contract.**

## Rule 7

**API versions should not require duplicated business logic by default.**

## Rule 8

**Keep version-specific behavior near the API boundary.**

## Rule 9

**Treat webhooks and background jobs as contracts too.**

## Rule 10

**Database migrations must support the application versions that can coexist during deployment.**

## Rule 11

**Measure old-version usage before sunset.**

## Rule 12

**Every deprecated version needs a migration path.**

## Rule 13

**Do not support versions forever without a business reason.**

## Rule 14

**Security requirements take priority over compatibility.**

## Rule 15

**A version is a compatibility boundary, not a copy of the entire application.**

---

# Final API Versioning Architecture

Fastify-MasterApp should evolve using:

```text
                    Public API
                       |
          +------------+------------+
          |                         |
       /api/v1                   /api/v2
          |                         |
          v                         v
    V1 Contracts              V2 Contracts
    V1 Routes                 V2 Routes
          |                         |
          +------------+------------+
                       |
                       v
             Shared Application Layer
                       |
              +--------+--------+
              |                 |
              v                 v
          Repositories      External Clients
              |
              v
          PostgreSQL
```

The Admin frontend should consume the currently supported API version:

```text
React Admin
     |
     v
Typed API Client
     |
     v
/api/vN
```

Operationally:

```text
API Version
    ↓
Metrics
    ↓
Logs
    ↓
Tracing
    ↓
Usage measurement
    ↓
Deprecation
    ↓
Migration
    ↓
Sunset
```

The goal is not to create many versions.

The goal is to create **stable compatibility boundaries that allow Fastify-MasterApp to evolve without unexpectedly breaking consumers**.

The preferred lifecycle is:

```text
Design
  ↓
Implement
  ↓
Test
  ↓
Release
  ↓
Monitor
  ↓
Deprecate
  ↓
Migrate
  ↓
Sunset
  ↓
Remove
```

A strong API versioning strategy allows the internals to evolve quickly while keeping the public contract predictable, documented, secure, and operationally manageable.
