# Feature Flags

> Production-grade feature flag architecture and implementation guide for Fastify-MasterApp.

## 1. Purpose

Feature flags allow Fastify-MasterApp to separate **code deployment** from **feature activation**.

They should be used to:

- release functionality gradually
- reduce deployment risk
- perform controlled rollouts
- enable or disable risky behavior
- support migrations
- test new integrations
- protect production during incidents
- run experiments where appropriate
- coordinate API and Admin frontend releases

The core principle is:

> **A feature flag controls behavior; it must not become a permanent replacement for architecture, configuration, or authorization.**

---

# 2. Why Feature Flags Matter

Without flags:

```text
write code
   ↓
deploy code
   ↓
feature immediately active
```

With flags:

```text
write code
   ↓
deploy code disabled
   ↓
validate production
   ↓
enable gradually
   ↓
observe
   ↓
expand rollout
```

This reduces the blast radius of changes.

---

# 3. Deployment vs Release

Feature flags create two separate actions:

```text
Deployment
  = code becomes available

Release
  = users can access the behavior
```

Example:

```text
Friday:
  deploy new dashboard code

Monday:
  enable for internal admins

Tuesday:
  enable for 10%

Wednesday:
  enable for 100%
```

---

# 4. Feature Flag Principles

1. Default safely.
2. Fail closed for security-sensitive features.
3. Keep authorization separate.
4. Use typed flag definitions.
5. Give every flag an owner.
6. Give temporary flags an expiration/removal date.
7. Audit flag changes.
8. Log important evaluations without high-cardinality noise.
9. Test both enabled and disabled behavior.
10. Roll out gradually when risk justifies it.
11. Do not expose server-only flags to the browser.
12. Avoid evaluating flags inconsistently across services.
13. Keep evaluation deterministic.
14. Document dependencies between flags.
15. Remove obsolete flags promptly.

---

# 5. Feature Flag Categories

Recommended categories:

```text
Release flags
Operational flags
Permission/entitlement flags
Experiment flags
Migration flags
Kill switches
Infrastructure flags
UI flags
```

Each category has different lifecycle expectations.

---

# 6. Release Flags

Used to hide incomplete or newly deployed functionality.

Example:

```text
admin.newDashboard
```

Lifecycle:

```text
OFF
 ↓
internal
 ↓
small rollout
 ↓
100%
 ↓
remove flag
```

Release flags should normally be temporary.

---

# 7. Operational Flags

Used to control operational behavior.

Examples:

```text
files.processing.enabled
notifications.enabled
search.indexing.enabled
backgroundReports.enabled
```

These may remain longer because they provide operational controls.

---

# 8. Kill Switches

Kill switches disable dangerous functionality quickly.

Examples:

```text
payments.capture.enabled
remoteFileImport.enabled
newWebhookProcessor.enabled
```

A kill switch should have:

- clear owner
- documented failure behavior
- safe default
- audit logging
- operational runbook

---

# 9. Experiment Flags

Experiments compare behavior between variants.

Example:

```text
admin.dashboard.experiment
```

Experiments need:

- defined hypothesis
- target audience
- allocation
- metrics
- start date
- end date
- owner
- analysis plan

Do not run experiments indefinitely.

---

# 10. Migration Flags

Migration flags help transition between implementations.

Example:

```text
storage.useNewProvider
```

Typical lifecycle:

```text
old implementation
   ↓
new implementation disabled
   ↓
new implementation internal
   ↓
new implementation partial
   ↓
new implementation 100%
   ↓
remove old implementation
   ↓
remove flag
```

---

# 11. Entitlement Flags

An entitlement determines whether a customer/product tier is allowed to use functionality.

This is different from a release flag.

Example:

```text
plan.exports.enabled
```

Entitlements should generally be evaluated as business policy rather than arbitrary operational toggles.

---

# 12. Authorization Is Not a Feature Flag

Never replace RBAC with:

```ts
if (flags.adminEnabled) {
  allow();
}
```

Correct:

```text
Authentication
   ↓
Authorization
   ↓
Feature availability
```

A user must still have permission even when the feature is enabled.

See `RBAC.md`.

---

# 13. Recommended Evaluation Order

For protected functionality:

```text
1. Authenticate
2. Authorize
3. Evaluate feature availability
4. Execute
```

Depending on product semantics, an unavailable feature may return a controlled `404`, `403`, or feature-disabled response.

---

# 14. Flag Model

A practical flag record:

```text
id
key
description
type
enabled
defaultValue
owner
environment
rollout
createdAt
updatedAt
expiresAt
archivedAt
```

Additional fields may include:

```text
reason
ticket
category
risk
version
```

---

# 15. Flag Types

Prefer explicit types:

```text
BOOLEAN
PERCENTAGE
VARIANT
TARGETING
```

Avoid storing arbitrary JSON unless there is a strong requirement.

---

# 16. Boolean Flags

Example:

```text
files.processing.enabled = true
```

Good for:

- kill switches
- operational controls
- simple releases

---

# 17. Percentage Rollouts

Example:

```text
newDashboard = 10%
```

Users are deterministically assigned to a cohort.

Do not use random assignment on every request.

Bad:

```ts
Math.random() < 0.1;
```

This can cause a user to see different behavior between requests.

---

# 18. Deterministic Rollout

Use a stable identity:

```text
hash(flagKey + subjectId)
```

Then map the hash to a bucket.

Example:

```text
user_123 → bucket 37
10% rollout → OFF
```

Another user may be:

```text
user_456 → bucket 4
10% rollout → ON
```

The same user remains consistent.

---

# 19. Rollout Subject

Define what the percentage applies to:

```text
user
tenant
organization
account
request
```

For most user-facing releases:

```text
user
```

For tenant-level products:

```text
tenant
```

Choose deliberately.

---

# 20. Tenant-Level Rollouts

Tenant rollouts are useful for B2B deployments.

Example:

```text
tenant_a → ON
tenant_b → OFF
tenant_c → ON
```

This enables:

- pilot customers
- staged migrations
- controlled enterprise releases

Tenant identity must be included in evaluation context.

---

# 21. Internal Users

Provide a controlled mechanism for internal testing.

Example:

```text
environment = production
target = internal-admins
```

Do not use hidden usernames or undocumented email lists in application code.

---

# 22. Targeting Rules

A flag may support:

```text
all users
internal users
specific users
specific tenants
specific roles
percentage
environment
```

Rules should remain simple enough to reason about.

---

# 23. Targeting Priority

Define deterministic precedence.

Example:

```text
explicit user override
        ↓
tenant override
        ↓
role rule
        ↓
percentage rollout
        ↓
environment default
        ↓
global default
```

Document the exact order in code.

---

# 24. Avoid Complex Targeting

Do not build a general-purpose policy language inside the feature flag system.

Avoid rules such as:

```text
country AND browser AND age AND role
OR tenant AND date
OR random condition
```

unless a dedicated flag platform is actually required.

Complex authorization belongs in authorization/policy systems.

---

# 25. Flag Evaluation Context

Example:

```ts
interface FlagContext {
  userId?: string;
  tenantId?: string;
  roles?: string[];
  environment: Environment;
}
```

Keep context minimal.

Do not pass full user objects into the flag evaluator.

---

# 26. Typed Flag Registry

Define flags centrally.

Example:

```ts
export const flags = {
  newAdminDashboard: {
    key: "admin.newDashboard",
    type: "BOOLEAN",
    defaultValue: false,
  },
  newFilePipeline: {
    key: "files.newPipeline",
    type: "BOOLEAN",
    defaultValue: false,
  },
} as const;
```

This prevents string drift.

---

# 27. Avoid String Literals Everywhere

Bad:

```ts
if (isEnabled("admin.newDashbord")) {
}
```

The typo can silently disable functionality.

Prefer:

```ts
if (flags.admin.newDashboard.isEnabled(context)) {
}
```

or another typed wrapper.

---

# 28. Flag Namespace

Use namespaces.

Examples:

```text
admin.*
auth.*
files.*
payments.*
search.*
notifications.*
integrations.*
workers.*
```

This makes ownership and discovery easier.

---

# 29. Naming Convention

Recommended:

```text
<domain>.<feature>.<behavior>
```

Examples:

```text
admin.dashboard.v2
files.processing.v2
payments.newCheckout
search.newIndexer
notifications.email.enabled
```

Names should describe behavior rather than implementation trivia.

---

# 30. Bad Flag Names

Avoid:

```text
newCode
temporaryFix
test123
enableStuff
useThing
boolean1
```

These become meaningless quickly.

---

# 31. Flag Metadata

Every flag should document:

```text
Key
Purpose
Owner
Category
Risk
Default
Environment
Created
Expiration
Removal issue
Dependencies
```

---

# 32. Flag Ownership

Every production flag must have an owner.

Possible ownership:

```text
Platform
Backend
Admin
Security
Commerce
Infrastructure
```

The owner is responsible for:

- rollout
- monitoring
- incidents
- cleanup

---

# 33. Flag Expiration

Temporary flags should have:

```text
expiresAt
```

or a documented removal date.

A flag without an expiration becomes technical debt.

---

# 34. Flag Debt

Example:

```text
100 old flags
  ↓
every code path has conditions
  ↓
behavior becomes difficult to understand
```

Flag debt creates:

- test explosion
- cognitive complexity
- stale configuration
- accidental behavior
- difficult debugging

---

# 35. Flag Lifecycle

Recommended:

```text
PROPOSED
   ↓
IMPLEMENTED
   ↓
TESTING
   ↓
ROLLOUT
   ↓
ACTIVE
   ↓
SUNSETTING
   ↓
REMOVED
```

---

# 36. Flag States

Do not confuse flag state with feature state.

Example:

```text
Flag:
  ACTIVE

Evaluation:
  user A → true
  user B → false
```

A flag can be active while only a subset receives it.

---

# 37. Storage Options

Possible implementations:

## Option A — Environment variables

Good for:

- simple deployments
- static operational switches

Limitations:

- requires deployment to change
- poor targeting
- weak auditability

## Option B — Database

Good for:

- admin controls
- audit
- targeting
- dynamic updates

Requires:

- caching
- consistency strategy
- safe defaults

## Option C — Dedicated feature flag platform

Good for:

- complex targeting
- experimentation
- large-scale operations

Adds:

- vendor dependency
- cost
- operational complexity

For Fastify-MasterApp, start simple.

---

# 38. Recommended Initial Architecture

Use:

```text
PostgreSQL
  ↓
Feature Flag Repository
  ↓
Feature Flag Service
  ↓
Redis cache
  ↓
Fastify / Worker / Admin
```

Static bootstrap flags can remain environment-based when appropriate.

---

# 39. Database-Backed Flags

Example model:

```text
FeatureFlag
├── id
├── key
├── type
├── description
├── defaultValue
├── enabled
├── rolloutPercentage
├── environment
├── owner
├── expiresAt
├── createdAt
├── updatedAt
└── archivedAt
```

For complex targeting, use separate rule records rather than unrestricted JSON.

---

# 40. Environment Isolation

Flags should be environment-aware.

Example:

```text
development:
  true

staging:
  true

production:
  false
```

Never assume development values should automatically propagate to production.

---

# 41. Configuration vs Feature Flags

Use configuration for:

```text
DATABASE_URL
PORT
JWT expiration
storage bucket
provider credentials
```

Use feature flags for:

```text
new dashboard
new processing pipeline
temporary kill switch
gradual rollout
```

Do not turn every environment variable into a feature flag.

---

# 42. Feature Flag Service

Recommended interface:

```ts
interface FeatureFlagService {
  isEnabled(key: FeatureFlagKey, context: FlagContext): Promise<boolean>;

  getVariant(key: FeatureFlagKey, context: FlagContext): Promise<string | null>;
}
```

Keep evaluation logic centralized.

---

# 43. Synchronous Evaluation

If flags are loaded into memory safely:

```ts
isEnabled(...)
```

can be synchronous.

This is useful for hot application paths.

Avoid database queries on every request.

---

# 44. Caching

For database-backed flags:

```text
PostgreSQL
   ↓
Redis
   ↓
in-process cache
```

Possible hierarchy:

```text
L1 → process memory
L2 → Redis
L3 → PostgreSQL
```

Use short TTLs or explicit invalidation.

See `CACHING.md`.

---

# 45. Cache Invalidation

When a flag changes:

```text
Admin update
   ↓
PostgreSQL
   ↓
publish invalidation event
   ↓
Redis invalidation
   ↓
process cache invalidation
```

This avoids stale rollout state.

---

# 46. Cache Failure

If Redis fails:

```text
use local cache
```

if safely possible.

If no valid value exists:

```text
use flag's safe default
```

Do not let flag infrastructure take down the API.

---

# 47. Fail-Open vs Fail-Closed

Choose based on risk.

## Low-risk UI feature

```text
cache failure → default OFF
```

## Security-sensitive capability

```text
evaluation failure → deny
```

## Operational kill switch

The architecture must ensure the safest operational behavior is available during dependency failure.

Document each flag's failure mode.

---

# 48. Security Flags

Security-sensitive flags require special handling.

Examples:

```text
auth.passwordless.enabled
auth.externalLogin.enabled
admin.breakGlass.enabled
files.remoteImport.enabled
```

Use:

- default deny
- RBAC
- audit
- stronger approval
- monitoring

Do not casually expose these through a general flag UI.

---

# 49. Feature Flags and RBAC

A feature can be enabled globally but still restricted:

```text
feature enabled
       +
permission granted
       =
access
```

This is the correct relationship.

---

# 50. Feature Flags and Authentication

Never use:

```text
authEnabled = false
```

as a production shortcut for bypassing authentication.

Authentication is a security boundary.

Development-only bypasses should be explicit and isolated.

---

# 51. Feature Flags and API Routes

A disabled feature can be handled at:

```text
route
service
orchestrator
```

Prefer enforcing business availability near the service boundary when multiple entry points exist.

Do not protect only the Admin UI.

---

# 52. API Security

If a frontend button is hidden:

```text
button hidden
```

that is not security.

The API must still evaluate:

```text
authorization
+
feature availability
```

---

# 53. Feature Flags and Background Jobs

Workers must evaluate flags where behavior can change.

Example:

```text
newProcessingPipeline = true
```

The worker should use the same authoritative flag configuration.

Do not rely on stale worker environment variables unless intentionally designed.

---

# 54. Existing Jobs

When disabling a feature:

```text
new jobs → blocked
existing jobs → continue or drain
```

Define behavior explicitly.

Do not abruptly invalidate in-flight work unless safe.

---

# 55. Flag Changes During Processing

For long-running jobs, capture the relevant version/configuration at job creation when deterministic behavior is required.

Example:

```text
job
  ├── flagSnapshot
  └── processingVersion
```

This avoids a job changing semantics halfway through execution.

---

# 56. Feature Flags and Events

Flag changes can emit events:

```text
feature_flag.updated
```

Consumers may invalidate caches.

Do not trigger arbitrary business behavior merely because a flag changed unless explicitly designed.

---

# 57. Feature Flag Audit

Every administrative flag change should record:

```text
actor
flag
old value
new value
environment
reason
requestId
timestamp
```

Sensitive flag changes may require stronger audit requirements.

See `AUDIT_LOGGING.md`.

---

# 58. Flag Change API

Possible endpoints:

```text
GET   /api/v1/admin/feature-flags
GET   /api/v1/admin/feature-flags/:key
PATCH /api/v1/admin/feature-flags/:key
POST  /api/v1/admin/feature-flags/:key/enable
POST  /api/v1/admin/feature-flags/:key/disable
```

Avoid exposing raw internal configuration.

---

# 59. Flag API Authorization

Possible permissions:

```text
feature_flags.read
feature_flags.update
feature_flags.rollout
feature_flags.archive
```

High-risk flags may require dedicated permissions.

---

# 60. Two-Person Approval

For especially dangerous flags, consider:

```text
operator A proposes change
        ↓
operator B approves
        ↓
change activated
```

Useful for:

- payment controls
- security controls
- data deletion
- authentication changes

Do not introduce this complexity for ordinary UI releases.

---

# 61. Admin UI

Recommended page:

```text
Feature Flags
├── Key
├── Description
├── Category
├── Status
├── Rollout
├── Environment
├── Owner
├── Expiration
└── Actions
```

Actions:

```text
Enable
Disable
Edit rollout
View history
```

---

# 62. Flag History

The Admin UI should show:

```text
Who changed it?
When?
From what?
To what?
Why?
```

This is especially valuable during incidents.

---

# 63. Dangerous Flag UX

For high-risk changes:

```text
Enable payments.capture
```

require:

```text
warning
reason
confirmation
permission
```

Avoid accidental activation.

---

# 64. Bulk Changes

Bulk flag updates are dangerous.

If supported:

- show preview
- require confirmation
- enforce permissions
- limit batch size
- audit each change
- support rollback

---

# 65. Flag Rollback

A flag change should be easy to reverse.

Example:

```text
100%
 ↓
50%
 ↓
10%
 ↓
OFF
```

Operators should not need a code deployment to disable a risky release.

---

# 66. Safe Rollout

Recommended:

```text
OFF
 ↓
internal users
 ↓
1%
 ↓
5%
 ↓
10%
 ↓
25%
 ↓
50%
 ↓
100%
```

Pause between stages when risk is high.

---

# 67. Rollout Gates

Before increasing rollout, check:

```text
error rate
latency
business metric
security alerts
queue health
database load
provider failures
```

Do not increase rollout automatically without guardrails for critical features.

---

# 68. Automated Rollback

For high-risk features, automation can disable a flag when:

```text
error rate > threshold
```

or:

```text
critical health metric fails
```

Automation must have conservative thresholds and strong observability.

---

# 69. Flag Evaluation Metrics

Useful aggregate metrics:

```text
feature_flag_evaluations_total
feature_flag_evaluation_errors_total
feature_flag_cache_hits_total
feature_flag_cache_misses_total
```

Do not label metrics with arbitrary user IDs.

---

# 70. Evaluation Logging

Do not log every flag evaluation.

That can generate enormous volume.

Log:

- evaluation failures
- unusual targeting decisions
- configuration changes
- rollout changes

Sample normal evaluation logs if needed.

---

# 71. Debugging Flag Evaluation

Provide an authorized diagnostic endpoint/tool.

Example:

```text
evaluate flag:
  admin.newDashboard

context:
  userId
  tenantId
  roles

result:
  enabled
  matchedRule
  source
```

Never expose this capability broadly.

---

# 72. Evaluation Reason

Internally, evaluations may record:

```text
GLOBAL_DEFAULT
ENVIRONMENT_OVERRIDE
USER_OVERRIDE
TENANT_OVERRIDE
ROLE_RULE
ROLLOUT
```

This makes debugging easier.

---

# 73. Privacy

Do not put sensitive user attributes into flag targeting unnecessarily.

Avoid targeting on:

```text
health information
financial details
private content
```

Use minimal, non-sensitive attributes.

---

# 74. Experiment Privacy

If running experiments:

- document data collection
- minimize identifiers
- avoid unnecessary sensitive attributes
- respect product/privacy requirements
- define retention

---

# 75. Flag Data Access

Flag configuration may reveal:

- unreleased features
- internal systems
- security controls
- migration plans

Restrict access to flag administration.

---

# 76. Frontend Flags

The Admin frontend may need some flags.

Example:

```text
admin.newDashboard
```

The API can return safe public-to-Admin feature state.

Do not expose:

```text
payment provider credentials
internal kill switches
security configuration
```

through frontend flag payloads.

---

# 77. Frontend Flag Hydration

Possible flow:

```text
Admin login
  ↓
GET /api/v1/admin/features
  ↓
safe feature state
  ↓
React context/store
  ↓
UI
```

The frontend uses this for UX only.

The API remains authoritative.

---

# 78. Frontend Caching

Feature state can be cached in memory.

Invalidate after:

```text
login
logout
tenant switch
role change
flag refresh
```

Do not cache authorization decisions indefinitely.

---

# 79. Tenant Switching

If the Admin supports tenant switching:

```text
tenant A
  ↓
flags for tenant A

tenant B
  ↓
flags for tenant B
```

Never reuse tenant A's evaluation context for tenant B.

---

# 80. SSR / Server Rendering

If server-rendering is added later, evaluate flags using server-side context.

Do not trust a client-provided flag value.

---

# 81. API and Frontend Version Compatibility

When a feature flag controls both API and frontend behavior:

```text
API supports old + new
        ↓
enable frontend
        ↓
remove old behavior later
```

Avoid:

```text
frontend assumes new API
API immediately removes old API
```

Use backward-compatible migrations.

See `API_VERSIONING.md`.

---

# 82. Database Migrations and Flags

Flags are useful for expand/contract migrations.

Example:

```text
1. Add new nullable column
2. Deploy code
3. Backfill
4. Enable new read path
5. Verify
6. Enable new write path
7. Remove old path
8. Remove compatibility code
```

Never use a flag as a substitute for safe database migration sequencing.

---

# 83. Migration Flag Example

```text
users.readFromNewProfile = false
```

Rollout:

```text
deploy new schema
 ↓
backfill
 ↓
enable 1%
 ↓
compare results
 ↓
enable 100%
 ↓
remove old read path
```

---

# 84. Dual Read

For migrations, temporarily compare:

```text
old result
new result
```

without changing user-visible behavior.

Track mismatches.

---

# 85. Dual Write

Use carefully.

If two systems can create external side effects, feature flags do not make dual writes safe.

Use:

- idempotency
- outbox
- reconciliation
- explicit migration design

---

# 86. Feature Flags and Caching

If flag state is cached:

```text
flag update
   ↓
invalidate
   ↓
new evaluation
```

Cache TTL should match operational requirements.

Critical kill switches should have faster propagation than low-risk UI flags.

---

# 87. Feature Flag Availability

The flag system itself should not become a single point of failure.

Recommended:

```text
startup load
  ↓
in-memory snapshot
  ↓
Redis refresh
  ↓
PostgreSQL fallback
```

The exact hierarchy depends on deployment requirements.

---

# 88. Startup Behavior

At startup:

```text
validate flag configuration
   ↓
load required flags
   ↓
build local snapshot
   ↓
start application
```

For critical flags, fail safely if required configuration cannot be established.

---

# 89. Dynamic Refresh

Possible strategies:

```text
TTL polling
Redis pub/sub
event-driven invalidation
manual refresh
```

For a modular monolith, Redis invalidation plus local cache is usually sufficient.

---

# 90. Flag Versioning

Include a version or updated timestamp.

Example:

```text
flagVersion = 42
```

Workers/instances can compare versions.

This helps detect stale configuration.

---

# 91. Consistency

Feature flags are generally configuration, not transactional business state.

It is acceptable for a low-risk flag to propagate within seconds.

For security/financial controls, define stricter propagation requirements.

---

# 92. Stronger Controls

For high-risk flags:

- short cache TTL
- explicit invalidation
- audit
- approval
- operator alert
- deployment-independent emergency path

---

# 93. Emergency Kill Switch

The emergency path should remain available during partial infrastructure failure.

For example:

```text
Admin flag UI
      ↓
API
      ↓
Redis unavailable
      ↓
database
```

or an operational mechanism appropriate to deployment.

Do not design a kill switch that depends on the exact component currently failing.

---

# 94. Incident Response

During an incident:

```text
detect
  ↓
identify affected flag
  ↓
disable/rollback
  ↓
observe metrics
  ↓
stabilize
  ↓
investigate
  ↓
fix code
  ↓
re-enable gradually
```

Flag changes should be recorded as incident actions.

---

# 95. Flag Change During Incident

Record:

```text
incidentId
reason
actor
previous value
new value
timestamp
```

This helps reconstruct incident timelines.

---

# 96. Feature Flag Testing

Every flag-controlled feature should test:

```text
flag OFF
flag ON
partial rollout
override
missing configuration
cache failure
evaluation failure
```

Not every feature needs every scenario.

Risk determines depth.

---

# 97. Unit Tests

Test:

- key lookup
- default behavior
- targeting
- deterministic rollout
- precedence
- variant selection
- invalid configuration

---

# 98. Integration Tests

Test:

```text
database → flag service
Redis → flag service
Admin update → invalidation
multiple API instances → propagation
```

Verify stale values eventually disappear.

---

# 99. E2E Tests

Test:

```text
Admin enables feature
  ↓
API reflects feature
  ↓
Admin UI reflects feature
  ↓
authorized user can use it
  ↓
unauthorized user cannot
```

---

# 100. Security Tests

Test:

- unauthorized flag modification
- cross-tenant targeting
- hidden server-only flags
- privilege escalation
- dangerous flag activation
- audit integrity

---

# 101. Rollout Tests

Verify deterministic assignment:

```text
same user
  ↓
same result
```

unless the flag configuration changes.

Also verify percentage distribution over a sufficiently large sample.

---

# 102. Failure Injection

Simulate:

```text
PostgreSQL unavailable
Redis unavailable
invalid flag data
network partition
stale cache
partial rollout state
```

The application should follow documented defaults.

---

# 103. Flag Contract Tests

The flag registry itself should be validated.

Ensure:

- unique keys
- valid types
- valid defaults
- valid rollout percentages
- required ownership
- valid expiration dates where required

---

# 104. Rollout Percentage Validation

Allow:

```text
0–100
```

Reject:

```text
-1
101
NaN
```

Use runtime validation at configuration boundaries.

---

# 105. Variant Flags

Some features require multiple variants.

Example:

```text
dashboard.layout
  → control
  → compact
  → expanded
```

Use stable assignment.

Do not make arbitrary variants equivalent to authorization.

---

# 106. Variant Validation

Define an allowed set:

```ts
type DashboardVariant = "control" | "compact" | "expanded";
```

Reject unknown variants.

---

# 107. Experiment Assignment

For experiments, persist assignment when consistency matters.

Example:

```text
ExperimentAssignment
├── experiment
├── subject
├── variant
├── assignedAt
```

This avoids users moving between variants unexpectedly.

---

# 108. Experiment Metrics

Track:

```text
exposure
conversion
error rate
latency
retention
business KPI
```

Do not evaluate an experiment solely by feature usage.

---

# 109. Experiment Cleanup

When an experiment ends:

```text
stop assignment
 ↓
analyze
 ↓
choose winner
 ↓
remove variants
 ↓
remove experiment flag
 ↓
remove assignment data if no longer required
```

---

# 110. Flag Documentation

For each flag:

```text
### admin.dashboard.v2

Purpose:
New admin dashboard implementation.

Owner:
Admin Platform

Category:
Release

Default:
false

Risk:
P1

Rollout:
User-based

Expiration:
YYYY-MM-DD

Removal plan:
Remove after 100% rollout and validation.

Dependencies:
API dashboard v2 endpoint.
```

---

# 111. Flag Inventory

Maintain a machine-readable or documented inventory.

Example:

| Flag                       | Category    | Owner    | Risk | Default | Expiration |
| -------------------------- | ----------- | -------- | ---: | ------: | ---------- |
| `admin.dashboard.v2`       | Release     | Admin    |   P1 |     Off | Planned    |
| `files.processing.v2`      | Migration   | Platform |   P1 |     Off | Planned    |
| `analytics.enabled`        | Operational | Product  |   P2 |      On | Long-lived |
| `payments.capture.enabled` | Kill switch | Commerce |   P0 |      On | Long-lived |

---

# 112. Risk Classification

Suggested:

```text
P0 — financial/security critical
P1 — important production workflow
P2 — normal product behavior
P3 — low-risk UI/analytics
```

Flag controls should reflect risk.

---

# 113. P0 Flag Controls

For P0 flags:

- explicit owner
- strong RBAC
- audit
- alerting
- rollback
- documented runbook
- possibly approval
- fast propagation

---

# 114. P1 Flag Controls

For P1:

- owner
- audit
- staged rollout
- monitoring
- rollback
- expiration/removal plan

---

# 115. P2/P3 Flag Controls

Can use simpler management:

- owner
- default
- documentation
- tests
- cleanup date where temporary

---

# 116. Flag Dependencies

Document dependencies.

Example:

```text
admin.dashboard.v2
  requires:
    api.dashboard.v2
```

Do not enable dependent features in an invalid order.

---

# 117. Dependency Validation

Where practical, the flag service can prevent:

```text
frontend = ON
API dependency = OFF
```

for known hard dependencies.

Alternatively, deployment workflows can enforce the order.

---

# 118. Flag Combinations

Avoid too many independent flags controlling the same workflow.

Bad:

```text
newApi
newUI
newCache
newWorker
newValidation
newProvider
```

This creates:

```text
2^6 = 64 possible combinations
```

Testing becomes difficult.

Group related rollout behavior where possible.

---

# 119. Flag Explosion

If a workflow requires many flags, reconsider the architecture.

Possible alternatives:

- versioned module
- configuration object
- migration strategy
- separate implementation
- dedicated experimentation system

Feature flags should reduce risk, not create combinatorial complexity.

---

# 120. Flag Scope

Prefer the smallest scope necessary.

Examples:

```text
global
environment
tenant
user
```

Do not create user-specific overrides for every release unless needed.

---

# 121. User Overrides

Useful for:

- internal testing
- support troubleshooting
- pilot customers

Require:

- authorization
- audit
- expiration
- clear precedence

Avoid permanent hidden overrides.

---

# 122. Tenant Overrides

Useful for:

- enterprise pilots
- migrations
- staged releases

Tenant overrides must never bypass authorization.

---

# 123. Support Workflows

Support staff may need to inspect:

```text
feature state
targeting
rollout
```

They should not necessarily be allowed to modify production flags.

Separate:

```text
read
```

from:

```text
write
```

permissions.

---

# 124. Feature Flag API Security

Protect endpoints with:

```text
authentication
+
RBAC
+
CSRF protection where applicable
+
rate limiting
+
audit
```

Flag modification is an administrative mutation.

---

# 125. CSRF

If Admin uses cookie-based authentication, flag-changing endpoints require normal CSRF protection.

If using bearer tokens, follow the application's existing authentication model and browser security controls.

---

# 126. Rate Limiting Flag Changes

Administrative flag changes should be rate-limited to prevent accidental or malicious automation.

Avoid overly aggressive limits that interfere with incident response.

---

# 127. Feature Flag Logs

Record:

```text
flag key
action
actor
environment
old state
new state
request ID
```

Avoid logging sensitive targeting attributes unnecessarily.

---

# 128. Metrics During Rollout

Compare:

```text
control
vs
enabled cohort
```

for:

- error rate
- latency
- business success
- provider failures

This is one of the main reasons deterministic rollout matters.

---

# 129. Progressive Delivery

Feature flags can complement:

```text
canary deployments
blue/green deployments
rolling deployments
```

Example:

```text
deploy code
 ↓
canary instances
 ↓
flag 1%
 ↓
flag 10%
 ↓
flag 50%
 ↓
flag 100%
```

Deployment and feature rollout remain separate controls.

---

# 130. Rollback vs Rollout

A deployment rollback changes code.

A feature rollback changes behavior.

Sometimes the safer first action is:

```text
disable flag
```

rather than:

```text
rollback deployment
```

This is especially useful when the new code is backward-compatible.

---

# 131. Database Compatibility

Never assume disabling a feature restores the database to its old shape.

Use expand/contract migrations.

```text
old code
+
new schema
+
new code
```

must remain compatible during rollout.

---

# 132. API Compatibility

Feature flags should not be used to hide breaking API changes from existing clients.

Use API versioning and compatibility strategy.

See `API_VERSIONING.md`.

---

# 133. Background Worker Compatibility

If workers and API deploy independently:

```text
old worker
new API
```

and:

```text
new worker
old API
```

may coexist temporarily.

Flags and job schema versions must account for this.

---

# 134. Job Versioning

For feature-controlled jobs:

```text
job schema version
+
processing version
```

can provide deterministic behavior.

Do not assume every worker receives the latest flag instantly.

---

# 135. Event Compatibility

If a flag changes event behavior:

```text
old consumer
new producer
```

must remain compatible.

Prefer versioned event contracts where necessary.

See `EVENT_DRIVEN_ARCHITECTURE.md`.

---

# 136. Feature Flags and Caching

A feature flag may alter cache keys or response shapes.

When it does:

```text
old behavior cache
≠
new behavior cache
```

Use versioned cache keys.

Example:

```text
dashboard:v1:{tenant}
dashboard:v2:{tenant}
```

Avoid serving incompatible cached data across variants.

---

# 137. Feature Flags and Authorization Cache

Never cache authorization results only by flag state.

Authorization context includes:

```text
user
tenant
resource
permission
```

Keep flag evaluation and authorization conceptually separate.

---

# 138. Feature Flags and File Storage

Example:

```text
files.directUpload.enabled
files.newScanner.enabled
files.newProvider.enabled
```

For storage migrations, combine flags with:

- checksum verification
- reconciliation
- rollback
- old-provider retention

See `FILE_STORAGE.md`.

---

# 139. Feature Flags and Integrations

Example:

```text
email.providerB.enabled
payments.providerB.enabled
```

Provider selection must still handle:

- idempotency
- unknown states
- reconciliation
- migration

A flag alone does not make provider failover safe.

See `INTEGRATIONS.md`.

---

# 140. Feature Flags and Rate Limiting

A new feature may require different rate limits.

Coordinate:

```text
feature rollout
+
rate limit policy
```

before enabling high-volume behavior.

---

# 141. Feature Flags and Observability

Every important flag rollout should have dashboards that make comparison possible.

Example:

```text
new feature ON
  vs
control
```

Observe:

```text
p95 latency
5xx
business failures
queue backlog
```

---

# 142. Feature Flags and Incident Response

During an incident, operators should know:

```text
Which flags changed?
Who changed them?
When?
What rollout was active?
```

Include flag state in incident timelines where relevant.

---

# 143. Change Management

Production flag changes should follow the same general discipline as deployments:

```text
intent
 ↓
authorization
 ↓
change
 ↓
audit
 ↓
observe
```

For high-risk flags:

```text
approval
```

may be required.

---

# 144. Flag Review

Before creating a flag ask:

1. Why can't normal deployment solve this?
2. How long will the flag exist?
3. Who owns it?
4. What is the safe default?
5. What happens if evaluation fails?
6. Is rollout required?
7. Is it security-sensitive?
8. How will it be tested?
9. How will it be removed?

---

# 145. When Not to Use a Feature Flag

Do not use a flag for:

- authentication bypass
- authorization replacement
- secrets
- arbitrary configuration
- permanent business rules
- database schema compatibility by itself
- hiding poor architecture
- every small code change

---

# 146. Feature Flag vs Configuration

Use a feature flag when:

```text
behavior changes dynamically
```

Use configuration when:

```text
deployment/environment changes a stable value
```

Use database state when:

```text
business state changes
```

Use RBAC when:

```text
access permission changes
```

---

# 147. Feature Flag vs Permission

Example:

```text
Feature flag:
newReporting = ON

Permission:
reports.export = DENIED
```

Result:

```text
feature exists
but user cannot export
```

Both systems have separate responsibilities.

---

# 148. Feature Flag vs Subscription

Example:

```text
Feature flag:
newReports = ON

Subscription:
customer plan = Basic
```

The plan determines entitlement.

Do not hardcode plan logic into release flags.

---

# 149. Feature Flag Governance

Maintain:

- registry
- owner
- lifecycle
- expiration
- audit
- review cadence
- removal process

A feature flag system without governance becomes configuration debt.

---

# 150. Periodic Flag Review

Review flags periodically.

For each flag:

```text
still needed?
owner still valid?
expiration valid?
default correct?
security impact?
can it be removed?
```

Remove obsolete flags.

---

# 151. Flag Cleanup PR

When removing a flag:

```text
1. Confirm rollout is 100%.
2. Confirm no rollback need remains.
3. Remove conditional code.
4. Remove registry entry.
5. Remove database record if applicable.
6. Remove tests for obsolete branch.
7. Remove documentation.
8. Verify deployment.
```

---

# 152. Dead Flag Detection

A flag is dead when:

```text
always true
```

or:

```text
always false
```

and no longer needs runtime control.

Static analysis can help detect unused flag keys.

---

# 153. Flag Inventory Validation

CI can check:

- duplicate keys
- missing owner
- expired flags
- missing tests
- unknown flags
- invalid defaults
- invalid rollout values

Fail CI for serious governance violations.

---

# 154. Code Review Checklist

When adding a flag:

- [ ] purpose documented
- [ ] owner assigned
- [ ] category defined
- [ ] safe default defined
- [ ] evaluation context defined
- [ ] security impact reviewed
- [ ] rollout strategy defined
- [ ] tests added
- [ ] metrics considered
- [ ] expiration/removal plan added

---

# 155. Admin Change Checklist

Before changing a production flag:

- [ ] correct environment
- [ ] correct flag
- [ ] authorized operator
- [ ] rollout understood
- [ ] dependencies checked
- [ ] monitoring available
- [ ] rollback understood
- [ ] reason recorded

---

# 156. Production Rollout Checklist

## Before

- [ ] code deployed
- [ ] migrations compatible
- [ ] tests passing
- [ ] monitoring ready
- [ ] rollback ready
- [ ] flag owner available

## During

- [ ] start small
- [ ] observe errors
- [ ] observe latency
- [ ] observe business metrics
- [ ] watch dependencies
- [ ] pause if anomalies appear

## After

- [ ] reach intended rollout
- [ ] confirm metrics
- [ ] remove temporary flag
- [ ] clean old code
- [ ] update documentation

---

# 157. Security Checklist

- [ ] flags do not replace RBAC
- [ ] server-side enforcement exists
- [ ] dangerous flags require elevated permission
- [ ] changes are audited
- [ ] secrets are never flag values
- [ ] sensitive targeting data is avoided
- [ ] server-only flags stay server-side
- [ ] tenant isolation is enforced
- [ ] fail-safe defaults are documented
- [ ] emergency controls are tested

---

# 158. Reliability Checklist

- [ ] local cache
- [ ] Redis cache where needed
- [ ] database fallback
- [ ] bounded refresh
- [ ] deterministic evaluation
- [ ] cache invalidation
- [ ] safe defaults
- [ ] rollout rollback
- [ ] flag dependency documentation

---

# 159. Testing Checklist

- [ ] enabled
- [ ] disabled
- [ ] rollout
- [ ] user override
- [ ] tenant override
- [ ] invalid config
- [ ] Redis failure
- [ ] database failure
- [ ] authorization
- [ ] E2E
- [ ] migration compatibility
- [ ] worker compatibility

---

# 160. Example: Admin Dashboard Rollout

```text
Flag:
admin.dashboard.v2

Default:
false

Owner:
Admin Platform

Rollout:
user percentage

Plan:
0% → 1% → 10% → 25% → 50% → 100%
```

Before each increase:

```text
5xx
p95
JavaScript errors
API latency
user feedback
```

If problems occur:

```text
disable flag
```

Then investigate.

---

# 161. Example: Storage Provider Migration

```text
Flag:
files.storage.providerB

Phase 1:
0%

Phase 2:
internal tenants

Phase 3:
10%

Phase 4:
50%

Phase 5:
100%

After:
reconcile
retain old provider
remove old path
remove flag
```

Do not delete the old provider immediately after reaching 100%.

---

# 162. Example: New Payment Flow

```text
Flag:
payments.checkout.v2
```

Because payments are P0:

```text
internal
 ↓
small trusted cohort
 ↓
small customer rollout
 ↓
monitor
 ↓
gradual increase
```

Requirements:

- idempotency
- reconciliation
- payment state machine
- audit
- rollback
- provider monitoring

---

# 163. Example: Kill Switch

```text
Flag:
payments.capture.enabled
```

Normal:

```text
true
```

Incident:

```text
false
```

Behavior:

```text
new capture requests blocked
existing captures continue according to workflow
```

The exact behavior must be explicitly defined before the incident.

---

# 164. Example: Worker Kill Switch

```text
files.processing.enabled
```

When disabled:

```text
new processing jobs
   ↓
remain pending / delayed
```

Do not silently discard jobs.

When re-enabled:

```text
workers resume
```

---

# 165. Example: Analytics Kill Switch

```text
analytics.enabled
```

If analytics provider fails:

```text
disable
```

Core business operations continue.

This is a good example of graceful degradation.

---

# 166. Feature Flag API Response

Safe Admin response:

```json
{
  "data": [
    {
      "key": "admin.dashboard.v2",
      "enabled": true,
      "rolloutPercentage": 25,
      "category": "RELEASE"
    }
  ]
}
```

Do not expose secrets or internal credentials.

---

# 167. Feature Evaluation Response

Internal representation:

```json
{
  "enabled": true,
  "source": "ROLLOUT",
  "version": 12
}
```

This can help debugging without exposing sensitive context.

---

# 168. Error Handling

If a flag evaluation fails:

```text
log error
record metric
use safe default
continue if safe
```

Do not return a generic 500 for every low-risk flag-system failure.

For high-risk security controls, fail closed.

---

# 169. Avoid Network Calls in Hot Paths

Bad:

```text
every API request
  ↓
PostgreSQL
  ↓
feature flag
```

Preferred:

```text
local cache
   ↓ miss
Redis
   ↓ miss
PostgreSQL
```

Keep evaluation cheap.

---

# 170. Flag Snapshot

A local process can maintain:

```text
FeatureFlagSnapshot
```

containing the currently known configuration.

Refresh it when:

- startup
- invalidation
- TTL expiry
- explicit refresh

---

# 171. Process Consistency

Multiple API instances may briefly have different flag values.

For low-risk releases this may be acceptable.

For critical controls, use faster invalidation or a stronger consistency mechanism.

Document the expected propagation time.

---

# 172. Propagation SLO

For important flags, define:

```text
95% of instances receive change within X seconds
```

The exact target depends on risk.

Measure it where operationally important.

---

# 173. Flag Change Notifications

For important changes:

```text
flag changed
   ↓
audit
   ↓
optional notification
```

Notify operators for high-risk changes.

---

# 174. Emergency Access

If normal Admin UI is unavailable during an incident, maintain a documented emergency operational path.

It must still have:

- strong authentication
- authorization
- audit
- minimal scope
- safe rollback

Do not create an undocumented secret backdoor.

---

# 175. Secrets Are Not Flags

Never store:

```text
API_KEY
JWT_SECRET
DATABASE_PASSWORD
```

as flag values.

Feature flags are configuration state, not secret storage.

---

# 176. Flag Data Model Example

Conceptual Prisma model:

```prisma
model FeatureFlag {
  id                 String   @id
  key                String   @unique
  category           String
  type               String
  description        String
  enabled            Boolean
  rolloutPercentage  Int?
  environment        String
  owner              String
  expiresAt          DateTime?
  archivedAt         DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([environment, enabled])
  @@index([expiresAt])
}
```

Use actual project ID/enumeration conventions rather than copying this blindly.

---

# 177. Rule Model

For targeting:

```text
FeatureFlag
    ↓
FeatureFlagRule
    ├── priority
    ├── type
    ├── subject
    ├── value
    └── variant
```

Keep rules explicit and queryable.

---

# 178. Avoid Arbitrary JSON Rules

Bad:

```json
{
  "if": {
    "and": [
      ...
    ]
  }
}
```

This quickly becomes a policy language.

If complex targeting becomes necessary, evaluate a dedicated feature management system.

---

# 179. Dedicated Provider Decision

Consider a dedicated platform when you need:

- many teams
- hundreds of flags
- complex targeting
- experiments
- real-time rollout controls
- advanced analytics
- cross-service consistency

Until then, a simple internal implementation may be preferable.

---

# 180. Modular Monolith Fit

Feature flag services belong in the platform layer:

```text
apps/api/src/
├── platform/
│   └── feature-flags/
│       ├── flag.registry.ts
│       ├── flag.service.ts
│       ├── flag.repository.ts
│       ├── flag.types.ts
│       ├── flag.schemas.ts
│       └── flag.errors.ts
```

Business modules consume the service.

---

# 181. Dependency Direction

Preferred:

```text
Business Module
      ↓
FeatureFlagService
      ↓
Repository / Cache
```

Avoid:

```text
FeatureFlagService
      ↓
Business Module
```

This prevents circular architecture.

---

# 182. Worker Integration

Workers should use the same feature flag service abstraction.

```text
Worker
  ↓
FeatureFlagService
  ↓
local/Redis/DB
```

Do not duplicate evaluation logic.

---

# 183. CLI Integration

A future CLI may support:

```text
flags:list
flags:get
flags:enable
flags:disable
flags:rollout
flags:validate
flags:cleanup
```

Production changes should still follow authentication/authorization and audit requirements.

---

# 184. CI Integration

CI can validate:

```text
flag registry
flag references
expired flags
unknown keys
duplicate keys
```

It can also prevent removal of a flag while references remain.

---

# 185. Static Flag References

Searchable references should use known registry keys.

Example:

```ts
FeatureFlags.ADMIN_DASHBOARD_V2;
```

This is easier to analyze than arbitrary strings.

---

# 186. Feature Flag Documentation Generation

A future build step can generate:

```text
docs/feature-flags.md
```

from the typed registry.

This keeps documentation synchronized.

---

# 187. Flag Review Cadence

Suggested:

```text
temporary release flags → review weekly during rollout
migration flags → review each deployment
operational flags → review quarterly
kill switches → review quarterly
experiments → review at experiment end
```

---

# 188. Removal Criteria

Remove a temporary flag when:

- rollout is 100%
- monitoring is stable
- rollback window has passed
- old code is no longer required
- documentation is updated
- tests no longer need the old branch

---

# 189. Flag Technical Debt Metrics

Track:

```text
active flags
expired flags
flags without owner
flags past removal date
flags always true
flags always false
```

Alert on growing debt.

---

# 190. Flag Governance Dashboard

Admin dashboard could show:

```text
Total flags
Active flags
Expiring soon
Expired
High-risk
Recently changed
Unowned
```

This turns flag governance into an operational practice.

---

# 191. Operational Review

During release review:

```text
Which flags are changing?
What is the rollout?
What metrics are being watched?
What is the rollback?
Who is responsible?
```

---

# 192. Feature Flag Runbook

When a new feature causes issues:

```text
1. Identify flag.
2. Check current rollout.
3. Check affected cohort.
4. Compare control metrics.
5. Disable or reduce rollout.
6. Confirm recovery.
7. Preserve audit information.
8. Investigate.
9. Fix.
10. Re-enable gradually.
11. Remove flag after stabilization.
```

---

# 193. Troubleshooting: User Does Not See Feature

Check:

```text
authentication
tenant
RBAC
flag state
environment
targeting
rollout bucket
cache
frontend state
API version
```

Do not immediately change the global flag.

---

# 194. Troubleshooting: Feature Enabled for Wrong User

Check:

```text
context
subject ID
tenant ID
targeting precedence
cached configuration
deterministic hash
override
```

Audit recent flag changes.

---

# 195. Troubleshooting: Flag Change Not Propagating

Check:

```text
database update
Redis invalidation
instance cache
refresh interval
pub/sub
process health
flag version
```

Compare instance snapshots.

---

# 196. Troubleshooting: Flag Service Down

Check:

```text
local snapshot
Redis
database
safe defaults
```

The application should continue operating according to documented failure semantics.

---

# 197. Anti-Pattern: UI-Only Flag

```text
hide button
```

but API still allows action.

Result:

```text
security bypass
```

Always enforce server-side authorization and feature availability.

---

# 198. Anti-Pattern: Flag as Permission

```text
adminFeature = true
```

does not mean every user can access it.

Use RBAC separately.

---

# 199. Anti-Pattern: Permanent Flag

```text
newDashboard = true
```

for years.

Remove the flag once rollout is complete.

---

# 200. Anti-Pattern: Random Per-Request Rollout

```ts
Math.random();
```

causes inconsistent UX.

Use deterministic assignment.

---

# 201. Anti-Pattern: Database Query Per Request

This creates unnecessary latency and load.

Use caching/snapshots.

---

# 202. Anti-Pattern: Arbitrary JSON Configuration

Unstructured flags become difficult to validate and govern.

Prefer typed schemas.

---

# 203. Anti-Pattern: Too Many Flags

If every function has a flag:

```text
architecture is becoming unmaintainable
```

Use flags only where they provide meaningful operational value.

---

# 204. Anti-Pattern: Flag for Secret

Never.

Use secret management.

---

# 205. Anti-Pattern: Flag for Security Bypass

Never use a normal feature flag to disable authentication or authorization in production.

---

# 206. Anti-Pattern: Flag as Rollback Substitute

A flag can help rollback behavior, but it cannot replace:

- backward-compatible schema
- deployment rollback
- data migration strategy
- reconciliation

---

# 207. Anti-Pattern: No Audit

If an operator can change production behavior without a record, incident investigation becomes difficult.

---

# 208. Anti-Pattern: No Owner

Every flag should have someone responsible for it.

---

# 209. Anti-Pattern: No Expiration

Temporary flags need removal dates.

---

# 210. Anti-Pattern: No Testing of OFF State

The disabled state is a production behavior.

Test it.

---

# 211. Production Architecture

```text
                    React Admin
                         │
                         ▼
                    Fastify API
                         │
                ┌────────┴────────┐
                │                 │
                ▼                 ▼
         Authorization      Feature Flags
                │                 │
                │          ┌──────┴──────┐
                │          ▼             ▼
                │        Redis       PostgreSQL
                │          │             │
                │          └──────┬──────┘
                │                 │
                └────────┬────────┘
                         ▼
                  Business Services
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          Database     Workers    Integrations
```

---

# 212. Recommended Fastify Flow

```text
HTTP request
    ↓
authentication
    ↓
authorization
    ↓
feature evaluation
    ↓
service/orchestrator
    ↓
business logic
```

For internal jobs:

```text
job
 ↓
worker identity
 ↓
feature evaluation
 ↓
processing
```

---

# 213. Feature Flag Implementation Phases

## Phase 1 — Registry

- [ ] typed flag keys
- [ ] metadata
- [ ] defaults
- [ ] ownership

## Phase 2 — Service

- [ ] evaluator
- [ ] context
- [ ] deterministic rollout
- [ ] validation

## Phase 3 — Persistence

- [ ] PostgreSQL model
- [ ] repository
- [ ] audit
- [ ] Admin API

## Phase 4 — Caching

- [ ] Redis
- [ ] local snapshot
- [ ] invalidation
- [ ] propagation monitoring

## Phase 5 — Rollouts

- [ ] user targeting
- [ ] tenant targeting
- [ ] percentage rollout
- [ ] overrides

## Phase 6 — Operations

- [ ] dashboard
- [ ] alerts
- [ ] emergency controls
- [ ] cleanup

## Phase 7 — Advanced

- [ ] experiments
- [ ] automated rollback
- [ ] provider integration
- [ ] advanced targeting if justified

---

# 214. Initial Fastify-MasterApp Scope

Start with:

```text
Boolean flags
+
typed registry
+
PostgreSQL
+
Redis cache
+
Admin CRUD
+
RBAC
+
audit logging
+
deterministic percentage rollout
```

Do not immediately build a full experimentation platform.

---

# 215. Suggested First Flags

Potential examples:

```text
admin.dashboard.v2
files.processing.v2
files.directUpload.enabled
notifications.email.enabled
search.indexing.enabled
analytics.enabled
```

Add only flags tied to real rollout or operational requirements.

---

# 216. High-Risk Examples

Potential P0/P1 flags:

```text
payments.capture.enabled
auth.externalLogin.enabled
files.remoteImport.enabled
webhooks.processing.v2
storage.providerB.enabled
```

These require stronger controls.

---

# 217. Definition of Done

A production-ready feature flag system has:

- [ ] typed registry
- [ ] clear naming convention
- [ ] safe defaults
- [ ] owner for every production flag
- [ ] category/risk metadata
- [ ] environment isolation
- [ ] centralized evaluation
- [ ] deterministic rollout
- [ ] authorization separate from flags
- [ ] database persistence where dynamic control is needed
- [ ] caching
- [ ] invalidation
- [ ] documented failure behavior
- [ ] audit logging
- [ ] Admin permissions
- [ ] rollout controls
- [ ] rollback capability
- [ ] metrics
- [ ] tests
- [ ] cleanup process
- [ ] expiration/removal plan
- [ ] incident runbook
- [ ] dependency documentation
- [ ] migration compatibility
- [ ] worker compatibility

---

# 218. Production Checklist

## Design

- [ ] Why is a flag needed?
- [ ] What category?
- [ ] What risk?
- [ ] What default?
- [ ] Who owns it?
- [ ] When will it be removed?

## Implementation

- [ ] Typed key
- [ ] Central evaluator
- [ ] Runtime validation
- [ ] Deterministic rollout
- [ ] Cache
- [ ] Audit

## Security

- [ ] RBAC
- [ ] Server-side enforcement
- [ ] Sensitive flags restricted
- [ ] No secrets
- [ ] Tenant isolation
- [ ] Fail-safe behavior

## Operations

- [ ] Metrics
- [ ] Dashboard
- [ ] Rollout plan
- [ ] Rollback plan
- [ ] Incident runbook
- [ ] Propagation behavior

## Cleanup

- [ ] Expiration date
- [ ] Removal issue
- [ ] Old code removal
- [ ] Registry cleanup
- [ ] Documentation cleanup

---

# 219. Final Golden Rules

1. Feature flags separate deployment from release.
2. Use flags to reduce rollout risk.
3. Do not use flags as authorization.
4. Do not use flags as secret storage.
5. Keep flag keys typed.
6. Use safe defaults.
7. Define fail-open/fail-closed behavior.
8. Keep evaluation centralized.
9. Use deterministic percentage rollouts.
10. Choose rollout subjects deliberately.
11. Support tenant targeting only when needed.
12. Keep targeting simple.
13. Give every production flag an owner.
14. Document every important flag.
15. Give temporary flags an expiration/removal plan.
16. Audit production flag changes.
17. Restrict dangerous flag changes with RBAC.
18. Consider approval for P0 controls.
19. Cache flag state; do not query the database on every request.
20. Invalidate caches when flags change.
21. Do not make the flag service a single point of failure.
22. Use local snapshots where appropriate.
23. Test enabled and disabled states.
24. Test rollout and targeting.
25. Test cache and dependency failures.
26. Keep API enforcement server-side.
27. Keep frontend flags UX-only.
28. Keep authorization and entitlement separate from release controls.
29. Use flags carefully during migrations.
30. Ensure database changes remain backward compatible.
31. Ensure worker/job versions remain compatible.
32. Ensure event contracts remain compatible.
33. Version cache keys when behavior changes.
34. Do not create flag combinations you cannot reasonably test.
35. Remove temporary flags after rollout.
36. Track expired and unowned flags.
37. Monitor important rollouts.
38. Use kill switches for carefully selected operational controls.
39. Do not build a complex flag platform before the product needs it.
40. Treat feature flags as operational infrastructure, not magic conditionals.

---

# 220. Final Principle

The feature flag system should make production changes **safer, reversible, observable, and controlled**.

The desired lifecycle is:

```text
Design
   ↓
Implement disabled
   ↓
Test
   ↓
Deploy
   ↓
Enable internally
   ↓
Roll out gradually
   ↓
Observe
   ↓
Reach 100%
   ↓
Remove temporary flag
   ↓
Simplify code
```

For Fastify-MasterApp, the recommended architecture is:

> **Typed flag registry + centralized evaluator + PostgreSQL persistence + Redis/local caching + RBAC-protected Admin controls + audit logging + deterministic rollouts + explicit lifecycle management.**

The flag system should reduce operational risk without becoming a second authorization system, configuration system, policy engine, or permanent layer of application complexity.
