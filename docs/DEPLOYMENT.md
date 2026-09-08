# DEPLOYMENT.md

# Fastify-MasterApp Deployment Guide

This document defines the deployment architecture, environments, release process, infrastructure requirements, configuration strategy, database migration process, container deployment, Kubernetes deployment, rollback procedures, security controls, observability requirements, and production launch checklist for Fastify-MasterApp.

The deployment philosophy is:

```text
Build once
   |
Validate
   |
Deploy safely
   |
Observe
   |
Verify
   |
Rollback or promote
```

Fastify-MasterApp should remain a modular monolith until operational evidence justifies service extraction.

---

# 1. Deployment Goals

A production deployment must provide:

- repeatable builds
- immutable artifacts
- environment-specific configuration
- safe database migrations
- health and readiness checks
- graceful shutdown
- observability
- secure secret handling
- predictable rollback
- controlled scaling
- minimal downtime
- deployment verification

---

# 2. Target Deployment Architecture

The recommended production architecture is:

```text
                         Internet
                            |
                            v
                    ┌───────────────┐
                    │ Load Balancer │
                    │ / Ingress     │
                    └───────┬───────┘
                            |
                 ┌──────────┴──────────┐
                 v                     v
          ┌─────────────┐       ┌─────────────┐
          │ API Instance│       │ API Instance│
          │ Fastify     │       │ Fastify     │
          └──────┬──────┘       └──────┬──────┘
                 |                     |
                 └──────────┬──────────┘
                            v
                    ┌───────────────┐
                    │ PostgreSQL    │
                    └───────────────┘

                    Optional services:

                    ┌───────────────┐
                    │ Redis         │
                    └───────────────┘

                    ┌───────────────┐
                    │ Worker        │
                    │ BullMQ        │
                    └───────────────┘

                    ┌───────────────┐
                    │ Observability │
                    └───────────────┘
```

The React Admin application can be deployed independently as static assets:

```text
React Admin
    |
    v
Static hosting / CDN
    |
    v
Fastify API
```

---

# 3. Deployment Units

Fastify-MasterApp has several logical deployment units.

| Unit          | Responsibility                            |
| ------------- | ----------------------------------------- |
| API           | Fastify HTTP server                       |
| Admin         | React/Vite static frontend                |
| Worker        | background jobs when enabled              |
| PostgreSQL    | persistent database                       |
| Redis         | caching/rate limiting/queues when enabled |
| Observability | logs/metrics/traces                       |

Do not create separate deployable services merely because they are separate source directories.

---

# 4. Modular Monolith Deployment

The initial production target should remain:

```text
One API deployment
One Admin deployment
One PostgreSQL deployment
Optional Redis
Optional worker
```

This provides:

- simple operations
- fewer network failures
- easier debugging
- simpler deployments
- lower infrastructure cost

Extract services only when there is a demonstrated operational or organizational reason.

---

# 5. Environments

Recommended environments:

```text
local
development
test
staging
production
```

Each environment should have independent configuration and appropriate data isolation.

---

# 6. Local Environment

Purpose:

```text
developer productivity
```

Typical services:

```text
PostgreSQL
API
Admin
optional Redis
optional worker
```

Local development may use Docker Compose.

Do not connect local development to production databases.

---

# 7. Development Environment

Purpose:

```text
integration development
```

Characteristics:

- representative infrastructure
- disposable data where possible
- debug-friendly logging
- automated deployment
- shared environment with controlled access

---

# 8. Test Environment

Purpose:

```text
automated tests
```

Requirements:

- isolated database
- predictable seed data
- test-only credentials
- no production secrets
- deterministic setup/teardown

Tests must never accidentally target production.

---

# 9. Staging Environment

Staging should resemble production closely.

Use:

```text
same container images
same runtime configuration model
same database engine
same migration mechanism
same health checks
same observability approach
```

Infrastructure scale can be smaller.

---

# 10. Production Environment

Production should use:

```text
immutable application artifacts
secure secret management
managed PostgreSQL where practical
TLS
centralized logs
metrics
alerts
health checks
automated backups
controlled deployments
rollback capability
```

---

# 11. Environment Isolation

Never share:

```text
production database
production secrets
production Redis
production credentials
```

with development or test environments.

A compromise of development infrastructure should not become a production compromise.

---

# 12. Configuration Model

Configuration should come from the environment.

Examples:

```text
NODE_ENV
PORT
HOST
DATABASE_URL
JWT_SECRET
JWT_ACCESS_EXPIRES_IN
JWT_REFRESH_EXPIRES_IN
API_PREFIX
API_VERSION
CORS_ORIGIN
RATE_LIMIT_MAX
RATE_LIMIT_TIME_WINDOW
METRICS_ENABLED
SWAGGER_ENABLED
REDIS_URL
```

Only variables actually supported by the implementation should be used.

---

# 13. Configuration Validation

Validate configuration at startup.

Fail fast when required values are missing or invalid.

Example:

```text
DATABASE_URL missing
        |
        v
startup validation fails
        |
        v
process exits
```

Do not start production with insecure fallback values.

---

# 14. Configuration Categories

Separate configuration into:

```text
Application configuration
Infrastructure configuration
Security configuration
Observability configuration
Feature configuration
```

Examples:

Application:

```text
PORT
API_PREFIX
```

Security:

```text
JWT_SECRET
CORS_ORIGIN
```

Infrastructure:

```text
DATABASE_URL
REDIS_URL
```

Observability:

```text
LOG_LEVEL
METRICS_ENABLED
TRACING_ENABLED
```

---

# 15. Secrets

Never commit secrets to Git.

Never put secrets into:

```text
Dockerfile
source code
README
logs
frontend bundles
public environment files
```

Use an appropriate secret manager or deployment secret mechanism.

---

# 16. Frontend Environment Variables

Remember:

```text
React/Vite frontend variables are public.
```

Anything bundled into the Admin application can potentially be inspected by users.

Never put:

```text
JWT signing secret
database password
private API key
internal credential
```

into frontend configuration.

Only public configuration belongs there.

---

# 17. API and Admin Configuration

The Admin should receive only configuration it genuinely needs.

Examples:

```text
API base URL
public application name
public feature configuration
```

Keep private infrastructure configuration on the server.

---

# 18. Build Strategy

The build should be deterministic.

Recommended flow:

```text
Install dependencies
      |
Lint
      |
Typecheck
      |
Unit tests
      |
Integration tests
      |
Build
      |
Security checks
      |
Create artifact
```

The production artifact should be the same artifact promoted through environments.

---

# 19. Build Once, Promote Many

Preferred:

```text
Build image
   |
   v
Registry
   |
   +--> staging
   |
   +--> production
```

Avoid rebuilding separately for production.

Different builds can introduce subtle differences.

---

# 20. Container Image

The API should run in a production-oriented container.

The image should:

- use a supported Node.js runtime
- install only required production dependencies
- run as a non-root user
- contain no development secrets
- avoid unnecessary packages
- expose the application port
- handle SIGTERM correctly

---

# 21. Multi-Stage Docker Build

A typical strategy:

```text
Stage 1: dependency/build
        |
        v
Stage 2: production runtime
```

Build stages can contain:

```text
TypeScript compiler
development dependencies
build tools
```

The final image should contain only what runtime requires.

---

# 22. Docker Image Security

Scan images for:

```text
OS vulnerabilities
dependency vulnerabilities
known malicious packages
misconfiguration
secrets
```

Use a minimal runtime image where practical.

---

# 23. Image Tags

Avoid relying only on:

```text
latest
```

Prefer immutable identifiers:

```text
fastify-masterapp:<git-sha>
```

or:

```text
fastify-masterapp:<version>
```

A Git SHA is especially useful for incident correlation.

---

# 24. Image Registry

The deployment pipeline should push immutable images to a private registry where possible.

Examples of registry capabilities:

```text
authentication
image scanning
retention
immutability
access control
```

The exact provider is an infrastructure decision.

---

# 25. Container Runtime

The API process should be the main container process.

Conceptually:

```text
PID 1
 |
 +--> Node.js
       |
       +--> Fastify
```

Do not use unnecessary process managers inside containers.

Container orchestration should manage process restarts.

---

# 26. Graceful Shutdown

The API must handle:

```text
SIGTERM
SIGINT
```

Shutdown sequence:

```text
Receive SIGTERM
       |
       v
Stop accepting new traffic
       |
       v
Allow safe in-flight requests
       |
       v
Stop background processing
       |
       v
Close Redis
       |
       v
Close Prisma/database
       |
       v
Exit
```

The exact order should match dependency requirements.

---

# 27. Shutdown Timeout

Do not wait forever for an in-flight request.

Configure an appropriate termination grace period.

If the process cannot shut down within the platform's deadline, it may be forcefully terminated.

Long-running work should be moved to background jobs where appropriate.

---

# 28. Health Checks

Production should use:

```text
/health
/ready
```

or the exact configured equivalent.

Liveness:

```text
process alive
```

Readiness:

```text
safe to receive traffic
```

---

# 29. Container Health

The container/orchestrator should use health checks intentionally.

Avoid making liveness depend on every external dependency.

Otherwise:

```text
database outage
    |
    v
all pods restart
    |
    v
recovery becomes harder
```

Readiness is usually the correct place for dependency availability.

---

# 30. Load Balancer

The load balancer should send traffic only to ready instances.

Flow:

```text
Load Balancer
      |
      v
Readiness
      |
      +--> Ready --> receive traffic
      |
      +--> Not Ready --> remove from traffic
```

---

# 31. Stateless API

The Fastify API should remain stateless where practical.

Do not rely on:

```text
local filesystem session
in-memory session state
instance-specific mutable state
```

for functionality that must work across multiple replicas.

Persistent state belongs in:

```text
PostgreSQL
Redis
object storage
```

depending on the use case.

---

# 32. Horizontal Scaling

The API should be able to scale:

```text
1 instance
   |
   v
2 instances
   |
   v
N instances
```

without requiring user affinity.

JWT-based authentication can support stateless access-token verification while refresh/session state can remain server-controlled.

---

# 33. Session Scaling

If refresh tokens/session state are persisted:

```text
API instance A
API instance B
API instance C
       |
       v
shared session store
```

Do not store refresh-session state only in one instance's memory.

---

# 34. Database Scaling

PostgreSQL is the source of truth for transactional application data.

Scale carefully:

```text
query optimization
indexes
connection pool tuning
vertical scaling
read replicas when justified
partitioning when justified
```

Do not introduce replicas before understanding actual database bottlenecks.

---

# 35. Database Connection Pool

Each API replica may create database connections.

Example:

```text
5 API pods
x
20 DB connections
=
100 possible connections
```

Ensure the total remains within PostgreSQL capacity.

This becomes more important as horizontal scaling increases.

---

# 36. Database Migration Strategy

Production migrations must be deliberate.

Preferred process:

```text
Develop migration
      |
Test locally
      |
Test in CI
      |
Apply to staging
      |
Verify
      |
Apply to production
      |
Verify
```

Never manually modify production schema as the normal workflow.

---

# 37. Prisma Migrations

Prisma migrations should be version-controlled.

Typical deployment flow:

```text
prisma migrate deploy
```

Use the migration command intended for production deployment rather than development-only migration workflows.

---

# 38. Migration Compatibility

Prefer backward-compatible migrations.

Safe sequence:

```text
1. Add new nullable column
2. Deploy code that writes it
3. Backfill
4. Deploy code that requires it
5. Add constraint later
```

Avoid:

```text
drop column
+
deploy old code
```

during rolling deployments.

---

# 39. Expand and Contract

For schema changes, prefer:

```text
EXPAND
  |
  +--> add compatible schema
  |
DEPLOY
  |
  +--> migrate application
  |
BACKFILL
  |
CONTRACT
  |
  +--> remove obsolete schema later
```

This supports zero/low-downtime deployments.

---

# 40. Destructive Migrations

Destructive changes require additional planning.

Examples:

```text
drop column
rename column
change incompatible type
remove enum value
```

Before executing:

- confirm no application version depends on it
- back up data
- test rollback implications
- stage the migration
- verify deployment ordering

---

# 41. Data Migrations

Schema migrations and data migrations are different.

Schema:

```text
add table
add column
add index
```

Data:

```text
populate new field
transform records
recalculate derived values
```

Large data migrations should not block application startup unnecessarily.

Consider background jobs or controlled migration scripts.

---

# 42. Migration Locking

Large migrations can create:

```text
table locks
slow queries
deployment outages
```

Test migration behavior against production-like data volume.

Do not assume a migration that works on a small local database is safe at production scale.

---

# 43. Database Backups

Production PostgreSQL must have automated backups.

Recommended capabilities:

```text
automated snapshots
point-in-time recovery
retention policy
backup monitoring
restore testing
```

A backup that has never been restored is not fully trusted.

---

# 44. Restore Testing

Periodically test:

```text
backup exists
backup can be restored
application can connect
migrations can complete
critical data exists
```

Document:

```text
RPO
RTO
```

---

# 45. RPO

Recovery Point Objective answers:

```text
How much data can we afford to lose?
```

Example:

```text
RPO = 15 minutes
```

This is a product/operations decision, not a universal recommendation.

---

# 46. RTO

Recovery Time Objective answers:

```text
How quickly must service recover?
```

Example:

```text
RTO = 1 hour
```

Define realistic targets based on business requirements.

---

# 47. Deployment Ordering

For a backend + database change:

```text
1. Expand database schema
2. Verify migration
3. Deploy compatible API
4. Verify API
5. Deploy Admin
6. Monitor
7. Contract old schema later
```

Do not introduce incompatible schema and application changes simultaneously during rolling deployment.

---

# 48. Admin Deployment

The React Admin build should be:

```text
linted
typechecked
tested
built
```

Then published to static hosting/CDN.

Typical flow:

```text
Source
  |
  v
npm build
  |
  v
static assets
  |
  v
CDN
```

---

# 49. Admin Cache Strategy

Because frontend assets may be cached aggressively:

```text
index.html
```

and hashed static assets should have different cache strategies.

Prefer hashed assets:

```text
assets/index-<hash>.js
```

This avoids stale JavaScript bundles.

---

# 50. Frontend/API Compatibility

During deployment:

```text
old Admin
+
new API
```

and:

```text
new Admin
+
old API
```

may coexist briefly.

Design API changes to tolerate this where rolling deployment requires it.

---

# 51. API Versioning

Use the established API version prefix.

Example:

```text
/api/v1
```

Breaking changes should use a deliberate versioning strategy.

Do not silently break existing Admin clients.

---

# 52. CORS in Production

Configure allowed Admin origins explicitly.

Example conceptual configuration:

```text
https://admin.example.com
```

Avoid permissive production settings.

Never copy local:

```text
localhost
```

configuration into production unintentionally.

---

# 53. TLS

Production traffic should use HTTPS.

Expected flow:

```text
Browser
   |
 HTTPS
   v
Load Balancer / Ingress
   |
 HTTPS or secure internal transport
   v
API
```

Redirect HTTP to HTTPS where appropriate.

---

# 54. Security Headers

Production should enable appropriate security headers through the established Fastify security configuration.

Review:

```text
CSP
HSTS
X-Content-Type-Options
frame protection
referrer policy
```

Do not blindly copy a generic header policy without validating application behavior.

---

# 55. JWT Secrets

Production JWT signing secrets must:

- be generated securely
- be stored outside source control
- differ from non-production values
- have controlled access
- support planned rotation

Never use example secrets in production.

---

# 56. Secret Rotation

Plan rotation for:

```text
JWT signing keys
database credentials
Redis credentials
external API keys
deployment credentials
```

For JWTs, rotation may require overlapping verification keys depending on the signing architecture.

---

# 57. Access Control

Production infrastructure access should follow least privilege.

Separate:

```text
developer
operator
deployment bot
database administrator
security administrator
```

where appropriate.

---

# 58. CI/CD Credentials

CI should use short-lived or tightly scoped credentials where possible.

Avoid long-lived administrator credentials in CI.

Protect:

```text
registry credentials
cloud credentials
deployment credentials
signing keys
```

---

# 59. Deployment Pipeline

Recommended pipeline:

```text
Commit
  |
  v
Pull Request
  |
  +--> lint
  +--> typecheck
  +--> unit tests
  +--> integration tests
  +--> contract tests
  +--> security checks
  |
  v
Merge
  |
  v
Build artifact
  |
  v
Scan artifact
  |
  v
Publish immutable image
  |
  v
Deploy staging
  |
  v
Smoke tests
  |
  v
Production approval
  |
  v
Deploy production
  |
  v
Smoke tests
  |
  v
Observe
```

---

# 60. Pre-Deployment Checks

Before production:

```text
tests green
build successful
image scan acceptable
migration reviewed
secrets available
capacity acceptable
backup verified
rollback plan ready
alerts functioning
on-call available
```

---

# 61. Deployment Approval

For high-risk production changes, require an explicit approval step.

High-risk changes include:

```text
database migration
authentication change
RBAC change
security configuration
infrastructure change
dependency upgrade
major API change
```

---

# 62. Rolling Deployment

Preferred for multiple API instances:

```text
Instance A old
Instance B old

        |
        v

Instance A new
Instance B old

        |
        v

Instance A new
Instance B new
```

Traffic should only reach ready instances.

---

# 63. Rolling Deployment Requirements

To safely roll:

- API must be stateless
- schema changes must be compatible
- health checks must work
- shutdown must be graceful
- new image must be immutable
- readiness must be accurate

---

# 64. Canary Deployment

For higher-risk releases:

```text
Stable: 90%
Canary: 10%
```

Monitor:

```text
5xx
latency
auth failures
database errors
business metrics
```

If healthy:

```text
10% -> 25% -> 50% -> 100%
```

If unhealthy:

```text
rollback canary
```

---

# 65. Blue/Green Deployment

For infrastructure that supports it:

```text
Blue = current
Green = new
```

Validate Green:

```text
health
readiness
smoke tests
critical flows
```

Then switch traffic.

This can provide fast rollback but requires additional infrastructure.

---

# 66. Deployment Strategy Selection

Use:

| Strategy   | Best for                      |
| ---------- | ----------------------------- |
| Rolling    | normal API releases           |
| Canary     | risky/high-impact releases    |
| Blue/Green | fast rollback / major changes |
| Recreate   | development/simple workloads  |

Do not use complex deployment strategies without operational need.

---

# 67. Smoke Tests

After deployment, test:

```text
/health
/ready
API root
authentication
authenticated endpoint
critical Admin flow
```

Also verify:

```text
metrics
logs
database connectivity
```

---

# 68. Post-Deployment Verification

Immediately inspect:

```text
5xx rate
latency
restart rate
readiness
database errors
Redis errors
worker failures
authentication failures
```

Compare with the pre-deployment baseline.

---

# 69. Deployment Success Criteria

A deployment is successful only when:

```text
process healthy
+
ready
+
critical flows work
+
error rate normal
+
latency normal
+
dependencies healthy
+
telemetry working
```

A green CI pipeline alone is not sufficient.

---

# 70. Rollback

Rollback must be simple and tested.

Possible rollback:

```text
deploy previous image
```

Do not rebuild the previous version during an incident.

Use the previously validated immutable artifact.

---

# 71. Application Rollback

Example:

```text
Current:
image: abc123

Previous:
image: def456
```

Rollback:

```text
abc123
   |
   v
def456
```

Then verify:

```text
readiness
5xx
latency
critical flows
```

---

# 72. Database Rollback

Database rollback is different from application rollback.

Do not assume:

```text
API rollback
=
database rollback
```

If the migration is backward-compatible, application rollback may be safe without reversing the schema.

Prefer expand/contract migrations.

---

# 73. Migration Rollback Planning

For every migration, document:

```text
forward change
compatibility
rollback possibility
data implications
required deployment order
```

Some data transformations are irreversible.

Know this before production.

---

# 74. Emergency Rollback

Emergency rollback process:

```text
1. Confirm incident
2. Identify current version
3. Identify last known-good version
4. Stop further rollout
5. Roll back application
6. Verify readiness
7. Verify critical flows
8. Monitor
9. Investigate root cause
```

Do not make unrelated changes during an emergency rollback.

---

# 75. Feature Flags

For risky functionality, feature flags can reduce deployment risk.

Example:

```text
new-user-workflow=false
```

Deploy code disabled:

```text
deploy
  |
  v
enable gradually
```

Feature flags are useful when:

```text
code deployment
```

and:

```text
feature activation
```

should be separated.

---

# 76. Feature Flag Safety

Flags should have:

```text
owner
default
scope
expiration
auditability
rollback behavior
```

Remove temporary flags after the feature stabilizes.

---

# 77. Database Seeding

Do not run development seed logic automatically in production.

Production data should be created through:

```text
migration
controlled bootstrap
admin workflow
approved operational script
```

Never execute destructive test seeds against production.

---

# 78. Admin Bootstrap

If production requires an initial admin account, use a secure bootstrap process.

Avoid hardcoded:

```text
admin@example.com
password123
```

Production bootstrap credentials should be generated and handled securely.

---

# 79. Initial Production Setup

Recommended order:

```text
1. Provision database
2. Configure secrets
3. Apply migrations
4. Configure API
5. Start API
6. Verify readiness
7. Deploy Admin
8. Configure monitoring
9. Create initial admin securely
10. Run smoke tests
```

---

# 80. Production Database Security

Use:

```text
private networking where possible
TLS
strong credentials
least privilege
restricted access
backups
monitoring
```

The API should be the normal application access path.

Developers should not have unrestricted production database access by default.

---

# 81. Network Architecture

Prefer:

```text
Internet
   |
   v
Load Balancer
   |
   v
API
   |
   +--> PostgreSQL private network
   +--> Redis private network
   +--> external providers
```

Do not expose PostgreSQL directly to the public internet.

---

# 82. Outbound Network Access

Restrict outbound traffic where practical.

The API should only need access to known dependencies.

This reduces the blast radius of SSRF or compromised application code.

---

# 83. DNS

Production domains should map predictably.

Example:

```text
admin.example.com
api.example.com
```

Use separate domains/subdomains for frontend and API where appropriate.

---

# 84. CDN

The React Admin static application can use a CDN.

Benefits:

```text
lower latency
caching
static asset availability
traffic absorption
```

The API generally requires dynamic routing rather than static CDN caching unless explicitly designed for it.

---

# 85. API Caching

Do not cache authenticated responses casually.

Before caching an API endpoint, verify:

```text
authorization
tenant boundaries
cache invalidation
sensitive data
staleness tolerance
```

Incorrect caching can become a security issue.

---

# 86. Database Migrations in CI

CI should verify:

```text
migration applies
schema is valid
application starts
tests pass
```

For staging/production:

```text
migration output is captured
migration success is observable
failure stops deployment
```

---

# 87. Migration Failure

If a migration fails:

```text
stop deployment
do not continue application rollout
inspect database state
determine whether migration is partial
follow documented recovery
```

Never blindly rerun destructive migration commands.

---

# 88. Deployment Locking

Avoid concurrent production deployments.

Use a deployment lock or CI environment protection.

Without coordination:

```text
Deploy A
+
Deploy B
=
unpredictable final state
```

---

# 89. Release Versioning

Use a consistent versioning strategy.

Possible:

```text
semantic version
Git SHA
release tag
```

At minimum, every production deployment must be traceable to a source revision.

---

# 90. Release Notes

Every meaningful production release should document:

```text
features
bug fixes
database changes
security changes
breaking changes
migration requirements
rollback notes
```

---

# 91. Deployment Metadata

Expose internally:

```text
service name
version
Git SHA
environment
build timestamp
```

This should be available to observability systems.

---

# 92. Dependency Updates

Dependency upgrades should go through normal CI.

Pay special attention to:

```text
Fastify
Node.js
Prisma
TypeBox
JWT libraries
security middleware
React
Vite
TanStack Query
```

Security updates may require expedited deployment.

---

# 93. Node.js Runtime

Pin the production Node.js major version.

Do not allow local and production versions to drift significantly.

Keep:

```text
Docker runtime
CI runtime
local recommended runtime
```

aligned.

---

# 94. Lockfiles

Use the repository's package-manager lockfile consistently.

Production installs should use the lockfile.

Do not resolve arbitrary dependency versions during deployment.

---

# 95. Dependency Reproducibility

The same lockfile should produce:

```text
same dependency graph
```

across environments.

This reduces:

```text
works locally
fails in production
```

problems.

---

# 96. Resource Limits

Production API containers should have appropriate:

```text
CPU requests
CPU limits
memory requests
memory limits
```

Do not set limits arbitrarily.

Base them on observed workload.

---

# 97. Autoscaling

If Kubernetes autoscaling is introduced, scale using meaningful signals.

Possible signals:

```text
CPU
memory
request rate
request latency
custom application metrics
```

CPU alone may not represent API saturation.

---

# 98. Worker Scaling

Workers may scale independently from the API.

For example:

```text
API replicas = 4
Worker replicas = 2
```

Scale workers based on:

```text
queue depth
job latency
processing capacity
```

---

# 99. Graceful Worker Shutdown

Workers should stop accepting new jobs during termination and allow active work to finish safely where possible.

Avoid killing jobs mid-operation without understanding retry/idempotency behavior.

---

# 100. Job Idempotency

Background jobs should be safe to retry where practical.

Example:

```text
send email
```

must consider duplicate delivery.

Example:

```text
process payment
```

must use provider-supported idempotency mechanisms.

---

# 101. Deployment and Queues

When deploying workers:

```text
old workers
+
new workers
```

may coexist.

Job payloads should remain compatible across versions during rolling deployment.

Avoid changing job schemas incompatibly without a migration strategy.

---

# 102. Redis Deployment

If Redis is introduced for:

```text
rate limiting
queues
cache
sessions
```

define whether Redis data is:

```text
ephemeral
recoverable
critical
```

Do not assume all Redis data has the same durability requirements.

---

# 103. Redis Failure Strategy

For each Redis feature, document:

```text
Redis unavailable
        |
        +--> fail closed
        +--> fail open
        +--> fallback
        +--> 503
```

Security-sensitive controls may require fail-closed behavior.

Non-critical caching may fail open to PostgreSQL.

---

# 104. Observability Deployment Requirements

Production deployment must preserve:

```text
Pino logs
request IDs
metrics
health checks
readiness
tracing where enabled
deployment version
```

A release that disables observability unexpectedly should be treated as a deployment risk.

---

# 105. Log Collection

Prefer container stdout/stderr for application logs.

Conceptual flow:

```text
API container
    |
    v
stdout
    |
    v
collector
    |
    v
central log system
```

Do not rely on container-local log files for long-term production diagnostics.

---

# 106. Metrics Collection

Prometheus should scrape the metrics endpoint through an internal network path.

Verify after deployment:

```text
target healthy
metrics available
new version labels correct
```

---

# 107. Deployment Alerts

Recommended alerts:

```text
deployment failed
readiness failure
5xx spike
latency spike
pod restart spike
database errors
worker failure spike
queue growth
```

---

# 108. Deployment Observability Window

After production deployment, monitor closely for an appropriate period.

Check:

```text
immediately
+
short-term
+
normal traffic cycle
```

Some issues appear only under normal traffic.

---

# 109. Production Change Windows

For high-risk infrastructure/database changes, use an appropriate change window.

Consider:

```text
traffic levels
on-call availability
backup status
dependency support
rollback time
```

Do not perform risky migrations when nobody can respond.

---

# 110. Incident During Deployment

If an incident occurs during rollout:

```text
Stop rollout
     |
     v
Assess impact
     |
     v
Rollback if appropriate
     |
     v
Verify recovery
     |
     v
Investigate
```

Do not continue deploying unrelated services.

---

# 111. Deployment Checklist — Code

- [ ] code reviewed
- [ ] lint passes
- [ ] typecheck passes
- [ ] unit tests pass
- [ ] integration tests pass
- [ ] contract tests pass
- [ ] E2E tests pass where required
- [ ] security checks pass
- [ ] build succeeds
- [ ] artifact is immutable

---

# 112. Deployment Checklist — Database

- [ ] migration reviewed
- [ ] migration tested
- [ ] compatibility verified
- [ ] backup verified
- [ ] locking considered
- [ ] rollback implications documented
- [ ] data migration tested if applicable

---

# 113. Deployment Checklist — Security

- [ ] secrets available
- [ ] no secrets in image
- [ ] TLS configured
- [ ] CORS reviewed
- [ ] security headers reviewed
- [ ] database not publicly exposed
- [ ] registry access protected
- [ ] deployment credentials scoped
- [ ] image scan reviewed

---

# 114. Deployment Checklist — Observability

- [ ] logs available
- [ ] metrics available
- [ ] request IDs working
- [ ] health works
- [ ] readiness works
- [ ] dashboards updated
- [ ] alerts working
- [ ] deployment version visible

---

# 115. Deployment Checklist — Application

- [ ] API starts
- [ ] Admin loads
- [ ] authentication works
- [ ] authorization works
- [ ] database queries work
- [ ] critical workflows work
- [ ] background jobs work if enabled
- [ ] graceful shutdown works

---

# 116. Deployment Checklist — Rollback

- [ ] previous image exists
- [ ] previous release identified
- [ ] rollback command/process documented
- [ ] database compatibility checked
- [ ] rollback tested
- [ ] responsible operator identified

---

# 117. Production Launch Checklist

Before first launch:

```text
Infrastructure
- [ ] production environment provisioned
- [ ] networking configured
- [ ] TLS configured
- [ ] load balancer configured
- [ ] DNS configured

Database
- [ ] PostgreSQL provisioned
- [ ] credentials secured
- [ ] migrations applied
- [ ] backups enabled
- [ ] restore process tested

API
- [ ] image deployed
- [ ] configuration validated
- [ ] health works
- [ ] readiness works
- [ ] authentication works
- [ ] API documentation configured appropriately

Admin
- [ ] production build created
- [ ] API URL configured
- [ ] static assets deployed
- [ ] CDN/cache behavior verified

Security
- [ ] secrets secured
- [ ] CORS restricted
- [ ] headers enabled
- [ ] database private
- [ ] observability protected

Operations
- [ ] logs collected
- [ ] metrics collected
- [ ] dashboards available
- [ ] alerts configured
- [ ] runbooks available
- [ ] rollback tested
- [ ] on-call coverage established
```

---

# 118. Disaster Recovery

Production deployment must include a recovery plan.

Potential failures:

```text
API outage
database outage
Redis outage
cloud outage
region outage
bad deployment
bad migration
credential compromise
data corruption
```

Recovery procedures should be documented separately where they become complex.

---

# 119. Region Failure

For high-availability requirements, consider:

```text
multi-zone PostgreSQL
multi-zone API
regional load balancing
cross-region backups
```

Do not introduce multi-region architecture without a real availability requirement.

It significantly increases complexity.

---

# 120. Disaster Recovery Priorities

Recovery priority should generally be:

```text
1. Protect data
2. Restore database
3. Restore API
4. Restore Admin
5. Restore workers
6. Verify critical workflows
7. Restore secondary functionality
```

The exact order depends on product architecture.

---

# 121. Business Continuity

Define critical workflows.

Example:

```text
Authentication
User management
Core business operation
Audit logging
```

Identify which functions may temporarily degrade.

---

# 122. Production Access

Production shell/database access should be:

```text
limited
audited
temporary where possible
least privilege
```

Avoid shared administrator accounts.

---

# 123. Emergency Access

Emergency access should have:

```text
break-glass procedure
strong authentication
audit logging
limited scope
post-incident review
```

---

# 124. Deployment Documentation

Every production deployment should be traceable to:

```text
commit
release
artifact
migration
operator/pipeline
timestamp
```

This makes incidents and audits easier to investigate.

---

# 125. Common Deployment Failures

## Failure: API starts locally but not in production

Check:

```text
environment variables
Node version
module resolution
production dependencies
database connectivity
container entrypoint
```

---

## Failure: Readiness fails

Check:

```text
database
Redis if required
configuration
networking
credentials
```

---

## Failure: Admin gets 401 after deployment

Check:

```text
API base URL
CORS
cookie/token behavior
JWT configuration
refresh flow
deployment version compatibility
```

---

## Failure: Database migration fails

Check:

```text
migration state
database locks
permissions
connection
schema history
```

Do not blindly rerun destructive commands.

---

## Failure: API works but is extremely slow

Check:

```text
database latency
connection pool
CPU
event loop
external dependencies
N+1 queries
recent deployment
```

---

## Failure: Pods restart repeatedly

Check:

```text
OOMKilled
startup configuration
liveness probe
uncaught exception
resource limits
```

---

## Failure: Queue grows after deployment

Check:

```text
worker health
job compatibility
dependency failures
Redis
worker capacity
retry storms
```

---

# 126. Deployment Anti-Patterns

## Deploying From a Developer Laptop

Avoid manual production deployments from personal machines.

Use controlled CI/CD.

---

## Using `latest`

Do not depend on mutable image tags.

Use immutable version identifiers.

---

## Production Secrets in `.env`

Do not copy local `.env` files into production.

Use secure secret management.

---

## Automatic Production Seeding

Never run development seed scripts automatically against production.

---

## Destructive Migration + Code Deploy Together

Avoid incompatible changes during rolling deployment.

Use expand/contract.

---

## No Rollback Plan

Every significant production deployment needs a recovery path.

---

## No Health Checks

Load balancers cannot safely route traffic without meaningful readiness.

---

## Logging to Local Files Only

Container restarts can destroy diagnostic data.

Use centralized collection.

---

## Public Database

Never expose PostgreSQL directly to the public internet.

---

## Rebuilding During Rollback

Use the last known-good immutable artifact.

---

# 127. Recommended Deployment Order

For the current Fastify-MasterApp architecture:

```text
1. PostgreSQL
       |
2. Redis (if enabled)
       |
3. Database migrations
       |
4. API
       |
5. Worker (if enabled)
       |
6. Admin
       |
7. Monitoring verification
       |
8. Smoke tests
```

---

# 128. Recommended Repository Deployment Structure

A possible structure:

```text
docker/
├── api/
│   └── Dockerfile
├── admin/
│   └── Dockerfile
└── worker/
    └── Dockerfile

k8s/
├── namespace.yaml
├── config/
├── secrets/
├── api/
├── admin/
├── worker/
├── ingress/
└── monitoring/

scripts/
├── deploy.sh
├── migrate.sh
├── smoke-test.sh
└── rollback.sh
```

The actual repository structure may differ.

---

# 129. Kubernetes API Deployment

A typical Kubernetes API deployment should define:

```text
Deployment
Service
ConfigMap where appropriate
Secret references
readinessProbe
livenessProbe
resources
securityContext
rolling update strategy
```

---

# 130. Kubernetes Security Context

Prefer:

```text
runAsNonRoot
readOnlyRootFilesystem where possible
drop unnecessary Linux capabilities
seccomp
no privileged container
```

Validate compatibility with the application before enforcing each option.

---

# 131. Kubernetes Pod Disruption

For multiple replicas, consider:

```text
PodDisruptionBudget
```

to reduce simultaneous voluntary disruption.

---

# 132. Kubernetes Availability

Use:

```text
multiple replicas
anti-affinity where justified
multiple availability zones where required
```

Do not claim high availability from replicas alone if all replicas run on one failure domain.

---

# 133. Kubernetes Service

The API should be exposed internally through a Kubernetes Service.

Ingress/load balancer should route only to healthy pods.

---

# 134. Kubernetes Ingress

Ingress should handle:

```text
TLS
routing
timeouts
body limits
security headers where appropriate
```

Do not put business logic into ingress configuration.

---

# 135. Kubernetes Secrets

Do not assume a Kubernetes Secret automatically provides complete secret security.

Use:

```text
RBAC
encryption at rest
restricted access
secret rotation
external secret manager where appropriate
```

---

# 136. Deployment Resource Requests

Start with measured values.

Example concept:

```text
CPU request
memory request
CPU limit
memory limit
```

Then tune based on:

```text
real traffic
latency
GC
CPU
memory
```

---

# 137. Autoscaling Safety

Avoid autoscaling that creates database overload.

Example:

```text
API CPU rises
   |
   v
more API pods
   |
   v
more DB connections
   |
   v
database saturation
```

Autoscaling must account for downstream capacity.

---

# 138. Deployment Capacity Planning

Before increasing API replicas, estimate:

```text
requests/sec
average CPU/request
p95 latency
DB connections/replica
Redis connections/replica
external API limits
```

Scale based on the entire dependency chain.

---

# 139. Production Traffic Testing

Before major scale changes, test:

```text
normal traffic
peak traffic
burst traffic
dependency degradation
database saturation
worker backlog
```

Use realistic production-like data volumes.

---

# 140. Load Balancer Timeouts

Set timeouts intentionally.

Too short:

```text
legitimate requests fail
```

Too long:

```text
connections remain occupied
```

For long-running operations, prefer asynchronous jobs.

---

# 141. API Timeouts

Every external dependency should have an explicit timeout.

Avoid indefinite awaits.

---

# 142. Deployment and Long Requests

If a request can take minutes:

```text
do not rely on rolling deployment graceful shutdown alone
```

Prefer:

```text
submit job
return job ID
poll/status
```

where appropriate.

---

# 143. Database Migration Observability

Before a large migration, establish baseline:

```text
query latency
CPU
locks
connections
5xx
```

During migration, monitor these signals.

After migration, compare against baseline.

---

# 144. Release Verification Matrix

| Area     | Verification       |
| -------- | ------------------ |
| API      | health/readiness   |
| Auth     | login/refresh      |
| RBAC     | protected action   |
| Database | read/write         |
| Admin    | load/login         |
| Worker   | job execution      |
| Metrics  | scrape             |
| Logs     | ingestion          |
| Tracing  | trace if enabled   |
| Security | headers/CORS       |
| Rollback | artifact available |

---

# 145. Definition of Done — Deployment

A deployment system is complete when:

- [ ] environments are defined
- [ ] configuration is validated
- [ ] secrets are externalized
- [ ] builds are reproducible
- [ ] production images are immutable
- [ ] image scanning exists
- [ ] migrations are automated and reviewed
- [ ] health checks exist
- [ ] readiness is meaningful
- [ ] graceful shutdown works
- [ ] rolling deployment works
- [ ] rollback is documented
- [ ] smoke tests exist
- [ ] logs are centralized
- [ ] metrics are available
- [ ] alerts are configured
- [ ] backups exist
- [ ] restore is tested
- [ ] deployment version is traceable

---

# 146. Production Deployment Golden Rules

```text
1. Build once, promote the same artifact.

2. Never commit secrets.

3. Never put private secrets in the Admin frontend.

4. Use immutable image versions.

5. Validate configuration at startup.

6. Keep API instances stateless.

7. Use health and readiness intentionally.

8. Make database migrations backward compatible.

9. Prefer expand/contract migrations.

10. Never assume application rollback means database rollback.

11. Keep a last-known-good artifact.

12. Test rollback before an incident.

13. Observe every deployment.

14. Do not expose PostgreSQL publicly.

15. Do not run development seeds in production.

16. Scale API and database capacity together.

17. Treat Redis according to the importance of the data it contains.

18. Make workers retry-safe and idempotent.

19. Stop a bad rollout early.

20. A deployment is successful only after production verification.
```

---

# 147. Target Production Architecture

The long-term deployment target is:

```text
                         ┌─────────────────────────┐
                         │       DNS / CDN         │
                         └────────────┬────────────┘
                                      |
                     ┌────────────────┴────────────────┐
                     v                                 v
              ┌──────────────┐                 ┌──────────────┐
              │ React Admin  │                 │ Load Balancer│
              │ Static/CDN   │                 │ / Ingress   │
              └──────────────┘                 └──────┬───────┘
                                                       |
                                      ┌────────────────┼────────────────┐
                                      v                v                v
                               ┌────────────┐   ┌────────────┐   ┌────────────┐
                               │ API Pod    │   │ API Pod    │   │ API Pod    │
                               │ Fastify    │   │ Fastify    │   │ Fastify    │
                               └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
                                     |                |                |
                                     └────────────────┼────────────────┘
                                                      v
                                             ┌─────────────────┐
                                             │ PostgreSQL      │
                                             │ Managed/HA      │
                                             └─────────────────┘
                                                      |
                                     ┌────────────────┴───────────────┐
                                     v                                v
                              ┌─────────────┐                  ┌─────────────┐
                              │ Redis       │                  │ Worker Pods │
                              │ Cache/Queue │                  │ BullMQ      │
                              └─────────────┘                  └─────────────┘

                                      Observability
                                             |
                       ┌─────────────────────┼─────────────────────┐
                       v                     v                     v
                 ┌───────────┐        ┌────────────┐        ┌───────────┐
                 │ Logs      │        │ Prometheus │        │ Traces    │
                 └─────┬─────┘        └─────┬──────┘        └─────┬─────┘
                       └─────────────────────┼─────────────────────┘
                                             v
                                      ┌────────────┐
                                      │ Grafana    │
                                      │ Alerts     │
                                      └────────────┘
```

The deployment architecture should remain intentionally boring:

```text
simple
repeatable
observable
secure
recoverable
```

That is preferable to premature infrastructure complexity.

---

# 148. Final Deployment Principle

> **Fastify-MasterApp should be deployed as an immutable, observable, stateless application with controlled configuration, backward-compatible database changes, secure secrets, meaningful health checks, and a tested rollback path.**

A production deployment is not complete when the container starts.

It is complete when:

```text
artifact is verified
+
database is compatible
+
API is ready
+
Admin works
+
critical workflows succeed
+
telemetry is visible
+
alerts are healthy
+
rollback is possible
```
