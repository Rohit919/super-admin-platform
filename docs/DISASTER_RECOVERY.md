# Disaster Recovery

## Fastify-MasterApp

> Production-grade disaster recovery strategy for the Fastify API, React Admin frontend, PostgreSQL database, Redis/BullMQ workers, authentication state, audit data, observability stack, and deployment infrastructure.

---

## 1. Purpose

Disaster recovery (DR) defines how Fastify-MasterApp restores service and protects data after a major failure.

A disaster is larger than an ordinary application error. Examples include:

- PostgreSQL corruption or complete database loss
- Accidental deletion of production data
- Failed or destructive migration
- Compromised credentials or secrets
- Region or availability-zone outage
- Kubernetes cluster failure
- Redis loss
- Container registry outage
- Bad production deployment
- Operator error
- Ransomware or destructive infrastructure activity
- Large-scale dependency outage
- Loss of observability infrastructure
- Failure of DNS, TLS, or load-balancing infrastructure

The DR strategy has five goals:

1. **Protect business data**
2. **Restore critical functionality predictably**
3. **Minimize recovery time**
4. **Minimize unrecoverable data loss**
5. **Provide a tested, documented response process**

The central principle is:

> Backups are not a disaster recovery strategy until restoration has been tested.

---

# 2. Disaster Recovery Principles

Fastify-MasterApp should follow these principles.

### 2.1 PostgreSQL is the source of truth

Business-critical state should ultimately be recoverable from PostgreSQL.

Redis, caches, worker queues, metrics, and ephemeral containers must not become the only copy of business data.

### 2.2 Backups must be independent

A backup stored only beside the production database is not sufficient.

Backups should survive:

- database failure
- application failure
- cluster failure
- credential compromise
- accidental deletion
- infrastructure-region failure

### 2.3 Recovery must be automated where practical

Prefer:

```text
Documented procedure
        ↓
Scripted command
        ↓
Automated validation
        ↓
Human approval
```

over:

```text
Someone remembers what to do
```

### 2.4 Recovery should be rehearsed

Run restoration exercises periodically.

A backup that has never been restored is an assumption, not a guarantee.

### 2.5 Recovery should preserve security

Do not disable authentication, authorization, TLS, audit controls, or secret management simply to restore service faster.

### 2.6 Recovery should be observable

Every recovery action should generate enough logs and operational evidence to determine:

- what happened
- when it happened
- who performed recovery
- what data was restored
- what was lost
- whether the application is healthy afterward

---

# 3. Recovery Objectives

Define recovery targets before an incident occurs.

## 3.1 RPO

**Recovery Point Objective (RPO)** defines the maximum acceptable amount of data loss.

Example:

```text
RPO = 15 minutes
```

means that, in the worst case, recovery may lose up to approximately 15 minutes of committed business data.

Recommended initial targets:

| System                        |                                  Target RPO |
| ----------------------------- | ------------------------------------------: |
| PostgreSQL business data      |                                    ≤ 15 min |
| Authentication/session state  |                                    ≤ 15 min |
| Audit logs                    |                                    ≤ 15 min |
| Background-job business state |                                    ≤ 15 min |
| Redis cache                   |                                         N/A |
| Redis transient queue state   |                           Defined per queue |
| Prometheus metrics            |                                         N/A |
| Grafana dashboards            |               Configuration backup required |
| React Admin static assets     |                         N/A if reproducible |
| Docker images                 | N/A if registry retains immutable artifacts |

Critical business data should have the strongest RPO.

---

# 4. RTO

**Recovery Time Objective (RTO)** defines how quickly a service should be restored.

Example:

```text
RTO = 60 minutes
```

Recommended initial targets:

| Capability       | Target RTO |
| ---------------- | ---------: |
| API              |   ≤ 60 min |
| Admin frontend   |   ≤ 60 min |
| PostgreSQL       |   ≤ 60 min |
| Authentication   |   ≤ 60 min |
| Critical workers |   ≤ 90 min |
| Redis/cache      |   ≤ 90 min |
| Audit access     |  ≤ 120 min |
| Observability    |  ≤ 120 min |

These are planning targets, not guarantees.

They should be validated through real recovery exercises.

---

# 5. Criticality Classification

Not every component needs identical recovery treatment.

## Tier 0 — Critical

Required for core business operation:

- PostgreSQL
- API
- authentication
- authorization/RBAC
- critical background jobs
- secrets required to run the application

## Tier 1 — Important

Required for normal operations:

- React Admin
- Redis
- audit logging
- external integration configuration

## Tier 2 — Operational

Important for investigation and long-term operations:

- Prometheus
- Grafana
- tracing backend
- log aggregation

## Tier 3 — Rebuildable

Can be recreated from source/configuration:

- API containers
- Admin static assets
- development environments
- disposable worker instances
- ephemeral Kubernetes pods

---

# 6. Target Recovery Architecture

A production deployment should conceptually look like:

```text
                         ┌───────────────────┐
                         │ DNS / TLS / Edge  │
                         └─────────┬─────────┘
                                   │
                         ┌─────────▼─────────┐
                         │ Load Balancer     │
                         └─────────┬─────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
             ┌──────▼──────┐               ┌──────▼──────┐
             │ API replicas │               │ Admin CDN   │
             └──────┬──────┘               └─────────────┘
                    │
          ┌─────────┴─────────┐
          │                   │
   ┌──────▼──────┐      ┌──────▼──────┐
   │ PostgreSQL  │      │ Redis       │
   │ primary/HA  │      │ cache/queue │
   └──────┬──────┘      └──────┬──────┘
          │                    │
          │              ┌─────▼─────┐
          │              │ Workers   │
          │              └───────────┘
          │
   ┌──────▼─────────────────────────┐
   │ Independent backup storage     │
   │ PITR / snapshots / archives    │
   └────────────────────────────────┘
```

The backup system must remain operationally independent enough to recover the primary environment.

---

# 7. What Must Be Backed Up

Back up durable state, not just application containers.

## 7.1 PostgreSQL

Back up:

- schema
- tables
- indexes where appropriate
- business records
- users
- roles
- permissions
- authentication state
- refresh-token/session state
- audit records
- configuration stored in the database
- idempotency records
- outbox records
- job state that represents business truth

Use a combination of:

- continuous WAL/PITR
- scheduled full backups
- snapshots where supported
- long-term backups where required

---

## 7.2 Prisma Migrations

Keep migration files in source control.

Example:

```text
prisma/
  schema.prisma
  migrations/
    20260901090000_initial/
    20260902100000_add_roles/
    ...
```

A database backup alone is not enough to reproduce the expected application version.

Store:

- migration history
- Prisma schema
- seed procedures
- data migration scripts

in version control.

---

## 7.3 Secrets

Do not put raw production secrets into Git.

Back up the configuration necessary to recover access to:

- database credentials
- JWT signing keys/secrets
- refresh-token signing configuration
- encryption keys
- Redis credentials
- cloud credentials
- webhook secrets
- external API credentials
- TLS certificate management configuration

Prefer a managed secret store with its own redundancy and recovery process.

---

## 7.4 Infrastructure Configuration

Recovery should not depend on manually reconstructing infrastructure.

Keep infrastructure definitions in version control:

```text
docker/
k8s/
scripts/
.github/
```

and, where applicable:

```text
terraform/
helm/
infra/
```

Back up state files for infrastructure tooling using the tooling provider's recommended secure backend.

---

## 7.5 Admin Frontend

The Admin application should be reproducible from:

- Git commit
- package lockfile
- build configuration
- environment configuration
- immutable build artifact

Prefer rebuilding the Admin frontend from a known commit rather than treating a server copy as the canonical source.

---

## 7.6 Docker Images

Production images should be immutable and identifiable.

Record:

- Git SHA
- image digest
- release version
- build timestamp
- dependency lockfile version

Do not depend on mutable tags such as:

```text
latest
```

for recovery.

Prefer:

```text
fastify-masterapp-api@sha256:<digest>
```

---

# 8. PostgreSQL Backup Strategy

PostgreSQL is the most important recovery component.

## 8.1 Backup layers

Recommended architecture:

```text
PostgreSQL
   │
   ├── Continuous WAL / PITR
   │
   ├── Frequent snapshots
   │
   ├── Daily logical backup
   │
   └── Long-term encrypted archive
```

The exact implementation depends on the PostgreSQL hosting provider.

---

# 9. Point-in-Time Recovery

PITR allows recovery to a specific time.

Example:

```text
14:00  Normal operation
14:17  Bad deployment
14:20  Destructive migration discovered
14:25  Incident declared
14:31  Target recovery point selected
```

The goal may be:

```text
Restore PostgreSQL to 14:16:59
```

rather than restoring only the latest backup.

This is particularly important when a bad migration or accidental deletion occurs.

---

# 10. Backup Retention

Example policy:

| Backup             |   Retention |
| ------------------ | ----------: |
| WAL/PITR           |   7–30 days |
| Daily backup       |     30 days |
| Weekly backup      |  8–12 weeks |
| Monthly backup     |   12 months |
| Compliance archive | As required |

Actual retention should be based on:

- business requirements
- legal requirements
- storage cost
- recovery risk

---

# 11. Backup Security

Backups may contain the entire production database.

Therefore:

- encrypt backups at rest
- encrypt backup transport
- restrict access
- use separate credentials
- enable audit logging
- avoid public buckets
- use retention controls
- consider object-lock/immutability where appropriate
- separate backup administration from ordinary application credentials

A compromised application credential should not automatically provide the ability to delete every backup.

---

# 12. Backup Validation

Every backup system should perform automated checks.

Minimum validation:

```text
Backup created
     ↓
Backup exists
     ↓
Expected size/checksum
     ↓
Metadata validated
     ↓
Restore test
     ↓
Database starts
     ↓
Schema validated
     ↓
Critical tables validated
```

A successful backup command does not prove that the backup is usable.

---

# 13. Restore Testing

Perform restoration tests on a schedule.

Example:

```text
Monthly:
    restore latest backup to isolated environment

Quarterly:
    perform full application recovery exercise

Annually:
    perform larger disaster simulation
```

Test:

- database restore
- migration compatibility
- API startup
- authentication
- RBAC
- Admin access
- background workers
- critical business workflows
- audit logs
- external integrations
- monitoring

Record recovery duration.

---

# 14. Database Restore Procedure

High-level recovery:

```text
1. Declare incident
2. Freeze destructive operations
3. Identify failure point
4. Preserve evidence
5. Select recovery target
6. Provision clean PostgreSQL
7. Restore backup
8. Replay WAL if applicable
9. Validate database integrity
10. Validate schema/migrations
11. Point application at recovered database
12. Run smoke tests
13. Re-enable traffic
14. Monitor closely
15. Document incident
```

Do not immediately overwrite the failed database if investigation may be required.

---

# 15. Accidental Data Deletion

Example:

```text
DELETE FROM users;
```

or an application bug deletes a large dataset.

Response:

1. Stop the offending application/version.
2. Prevent additional writes if necessary.
3. Determine the exact incident time.
4. Identify affected records.
5. Preserve the current database.
6. Restore a copy to an isolated environment.
7. Recover the desired point in time.
8. Determine the correct records.
9. Validate relationships and dependencies.
10. Apply a controlled repair.
11. Verify application behavior.
12. Resume normal traffic.

Avoid blindly replacing production with an older database if only a subset of records needs restoration.

---

# 16. Bad Database Migration

A destructive migration is a high-risk event.

Preferred migration strategy:

```text
Expand
  ↓
Deploy compatible application
  ↓
Backfill
  ↓
Validate
  ↓
Switch reads/writes
  ↓
Contract
```

Avoid migrations that simultaneously:

- delete columns
- rename columns
- change incompatible types
- deploy incompatible application code

without an intermediate compatibility phase.

---

# 17. Database Corruption

Indicators may include:

- checksum errors
- inconsistent reads
- repeated PostgreSQL crashes
- corrupted indexes
- failed integrity checks
- storage errors

Response:

```text
Detect
 ↓
Stop unnecessary writes
 ↓
Preserve evidence
 ↓
Assess corruption scope
 ↓
Fail over if HA is healthy
 OR
Restore from trusted backup
 ↓
Validate
 ↓
Resume service
```

Never assume the newest backup is safe if corruption may have existed before the backup was created.

---

# 18. Complete Database Loss

If the primary database is unavailable:

```text
Application
    │
    X
PostgreSQL unavailable
```

Recovery:

```text
Select trusted backup
        ↓
Provision PostgreSQL
        ↓
Restore full backup
        ↓
Replay WAL
        ↓
Validate
        ↓
Apply required migrations
        ↓
Configure connection
        ↓
Run smoke tests
        ↓
Restore traffic
```

---

# 19. PostgreSQL High Availability

For stricter production requirements, use managed PostgreSQL HA or PostgreSQL replication.

Potential architecture:

```text
                ┌─────────────┐
                │ Application │
                └──────┬──────┘
                       │
                ┌──────▼──────┐
                │ DB endpoint │
                └──────┬──────┘
                       │
              ┌────────┴────────┐
              │                 │
       ┌──────▼──────┐   ┌──────▼──────┐
       │ Primary     │──▶│ Standby     │
       └─────────────┘   └─────────────┘
```

HA reduces downtime but does not replace backups.

Replication can reproduce:

- accidental deletes
- bad migrations
- corrupted writes

to the standby.

Therefore:

> High availability and disaster recovery solve different problems.

---

# 20. Redis Recovery

Redis should not be treated as the authoritative database for business state.

Redis may contain:

- cache entries
- rate-limit counters
- BullMQ queue state
- transient locks
- temporary coordination state

Recovery strategy depends on the data.

---

## 20.1 Cache

Cache data can usually be discarded.

After Redis recovery:

```text
Redis empty
   ↓
Application starts
   ↓
Cache misses
   ↓
PostgreSQL queried
   ↓
Cache rebuilt
```

---

## 20.2 Rate Limits

Rate-limit counters can generally be reset.

Do not preserve them at the cost of delaying service recovery.

However, after a reset, temporarily increased traffic should be expected.

---

## 20.3 BullMQ

Queue recovery requires more care.

Determine whether each job is:

- safe to lose
- retryable
- reconstructable
- business-critical

Business-critical jobs should have durable state in PostgreSQL.

Example:

```text
Order created in PostgreSQL
        ↓
Outbox event
        ↓
Queue
        ↓
Worker
```

If Redis is lost, the application should be able to reconstruct or replay required work from durable state.

---

# 21. Background Job Recovery

Workers must be designed for recovery.

Every important job should be:

- idempotent
- retryable
- observable
- versioned
- safe to run more than once

Example:

```text
Job ID: order-123-email-confirmation
```

If the worker processes it twice, the resulting state should remain correct.

Use idempotency keys where duplicate external effects are possible.

---

# 22. Outbox Recovery

For critical asynchronous operations:

```text
BEGIN
  Update business record
  Insert outbox event
COMMIT
```

Then:

```text
Outbox
  ↓
Publisher
  ↓
Redis/BullMQ
  ↓
Worker
```

If Redis fails:

```text
Outbox records remain in PostgreSQL
```

and publishing can resume later.

This avoids making Redis the source of truth.

---

# 23. Authentication Recovery

Authentication requires special attention.

Recover:

- users
- password hashes
- account state
- roles
- permissions
- refresh-token/session records where applicable
- email verification state
- password reset state where applicable

Do not store plaintext passwords in backups or application logs.

---

# 24. JWT Recovery

Determine the effect of restoring:

- JWT secrets
- signing keys
- key versions
- key rotation metadata

If signing keys are lost or compromised, rotate them.

A controlled security recovery may require:

```text
Generate new signing key
        ↓
Deploy new verification/signing configuration
        ↓
Invalidate affected sessions
        ↓
Force re-authentication where required
```

The exact strategy depends on whether tokens are self-contained and how revocation is implemented.

---

# 25. Refresh Token Recovery

Refresh tokens are high-value authentication state.

If refresh-token records are stored in PostgreSQL, recover them with the database.

If there is evidence that the database or token secrets were compromised:

- revoke active sessions
- rotate signing/encryption secrets as appropriate
- invalidate refresh-token families
- require re-authentication
- investigate suspicious sessions
- audit privileged accounts

Security recovery may intentionally cause user logout.

---

# 26. Admin Recovery

The Admin application should be restored only after the API and database are trustworthy.

Recovery order:

```text
Database
   ↓
API
   ↓
Authentication
   ↓
Authorization
   ↓
Workers
   ↓
Admin frontend
```

After recovery verify:

- admin login
- RBAC
- protected routes
- user management
- audit log access
- critical mutations
- API error handling

---

# 27. RBAC Recovery

Verify that recovered permissions are correct.

Check:

- role assignments
- permission records
- protected endpoints
- resource-level authorization
- default-deny behavior
- privileged administrator accounts

A database restore that makes every user an administrator is a security disaster even if the application is technically online.

---

# 28. Audit Log Recovery

Audit records are evidence.

Protect them carefully.

Recovery should verify:

- timestamps
- actors
- target resources
- actions
- outcomes
- request IDs
- metadata
- ordering where required
- retention state

Do not silently discard audit history during recovery.

---

# 29. Secrets Recovery

Maintain a documented inventory.

Example:

| Secret                 | Purpose                | Storage            | Rotation            |
| ---------------------- | ---------------------- | ------------------ | ------------------- |
| `DATABASE_URL`         | DB access              | Secret manager     | As required         |
| JWT signing secret/key | Authentication         | Secret manager/KMS | Scheduled/emergency |
| Redis credentials      | Queue/cache            | Secret manager     | As required         |
| External API key       | Integration            | Secret manager     | Provider policy     |
| Webhook secret         | Signature verification | Secret manager     | As required         |
| Encryption key         | Sensitive data         | KMS/secret manager | Strict procedure    |

Never put actual secret values in this document.

---

# 30. Secret Loss

If a production secret is unavailable:

1. Determine whether a recoverable copy exists.
2. Do not expose it through logs.
3. Restore from the approved secret manager.
4. If recovery is impossible, rotate the secret.
5. Update dependent services.
6. Validate authentication/integrations.
7. Record the event.

---

# 31. Secret Compromise

If a secret may have been exposed:

```text
Suspected compromise
        ↓
Contain
        ↓
Identify affected secret
        ↓
Rotate
        ↓
Revoke dependent credentials
        ↓
Invalidate sessions if required
        ↓
Review audit logs
        ↓
Deploy new configuration
        ↓
Validate
        ↓
Document incident
```

Do not wait for absolute proof when the secret is high-impact and exposure is credible.

---

# 32. Application Disaster

If the application is broken but the database is healthy:

```text
Healthy DB
    │
    ↓
Known-good image
    │
    ↓
Known-good configuration
    │
    ↓
Deployment
    │
    ↓
Health checks
    │
    ↓
Smoke tests
```

Prefer rollback to the last known-good immutable artifact.

---

# 33. Kubernetes Disaster

If the Kubernetes cluster is lost:

1. Provision/recover cluster.
2. Restore cluster-level configuration.
3. Configure secrets.
4. Configure ingress/load balancing.
5. Configure PostgreSQL connectivity.
6. Configure Redis.
7. Deploy API.
8. Deploy workers.
9. Deploy Admin/static delivery.
10. Verify health/readiness.
11. Verify observability.
12. Run smoke tests.
13. Restore traffic.

Application infrastructure should be reproducible from version-controlled configuration.

---

# 34. Container Registry Disaster

If the registry is unavailable:

- use a secondary registry where required
- retain immutable production artifacts
- maintain a documented artifact recovery process
- keep source code and lockfiles available
- verify build reproducibility

Do not depend on rebuilding immediately during an incident if the build environment itself may be affected.

---

# 35. Git Repository Disaster

Source code recovery should include:

- primary repository
- repository backup/mirror where appropriate
- release tags
- deployment manifests
- migration files
- CI/CD definitions
- Dockerfiles
- environment templates
- operational scripts

Never store production secrets in the repository merely because the repository is backed up.

---

# 36. DNS Disaster

Maintain documented access to:

- DNS provider
- domain registrar
- DNS records
- TLS certificate process
- load balancer endpoints

Protect DNS credentials separately from application credentials.

For critical systems, consider:

- secondary DNS
- low-risk tested failover records
- documented manual DNS recovery

---

# 37. TLS Certificate Disaster

Ensure the recovery process can recreate or renew certificates.

Verify:

- certificate issuer
- DNS validation access
- private-key storage
- renewal automation
- ingress/load-balancer configuration

Never put private TLS keys into ordinary source control.

---

# 38. External Dependency Failure

Identify critical external dependencies:

- email provider
- payment provider
- object storage
- identity provider
- webhook endpoints
- third-party APIs

For each dependency document:

- purpose
- timeout behavior
- retry behavior
- fallback behavior
- credentials
- recovery owner
- business impact

The application should degrade gracefully where possible.

---

# 39. Region Failure

For higher availability requirements:

```text
                  Global DNS / Edge
                         │
              ┌──────────┴──────────┐
              │                     │
        ┌─────▼─────┐         ┌─────▼─────┐
        │ Region A  │         │ Region B  │
        │ API/Admin │         │ API/Admin │
        └─────┬─────┘         └─────┬─────┘
              │                     │
              └──────────┬──────────┘
                         │
                    Data strategy
```

Multi-region database architecture is significantly more complex than multi-region stateless API deployment.

Do not introduce it merely because it sounds resilient.

Adopt it when RTO/RPO and business requirements justify the complexity.

---

# 40. Disaster Recovery Tiers

A practical evolution:

### Level 1 — Backup and Restore

- daily backups
- secure backup storage
- documented restore procedure
- periodic restore tests

### Level 2 — Point-in-Time Recovery

- continuous WAL/PITR
- tested recovery points
- improved RPO

### Level 3 — High Availability

- managed PostgreSQL HA
- redundant application replicas
- redundant infrastructure

### Level 4 — Multi-Region

- independent regional infrastructure
- cross-region data strategy
- tested failover

Fastify-MasterApp should progress through these levels based on actual requirements.

---

# 41. Recovery Runbook

## 41.1 Declare the Incident

Record:

- incident ID
- start time
- symptoms
- affected systems
- current availability
- incident commander
- technical lead
- communications owner

---

## 41.2 Stabilize

Immediately stop actions that could worsen the incident.

Examples:

- disable failing deployment
- stop destructive worker
- disable problematic integration
- pause bulk operations
- restrict administrative access
- stop automated migrations

---

## 41.3 Preserve Evidence

Preserve:

- application logs
- database logs
- deployment records
- audit events
- metrics
- traces
- relevant snapshots
- container/image identifiers
- configuration versions

Do not destroy the failed environment unnecessarily.

---

## 41.4 Determine Scope

Ask:

- Is data intact?
- Is PostgreSQL available?
- Is Redis available?
- Is the API available?
- Is authentication safe?
- Are secrets compromised?
- Is the cluster available?
- Is the failure regional?
- Are external dependencies affected?

---

# 42. Recovery Decision Tree

```text
                    Incident
                       │
             ┌─────────▼─────────┐
             │ Is data intact?   │
             └───────┬───────────┘
                 Yes │ No
                     │
        ┌────────────▼────────────┐
        │ Is application broken?  │
        └───────┬─────────────────┘
            Yes │ No
                │
        Roll back/redeploy
                │
                ▼
          Validate service

If data is not intact:

        Determine recovery point
                ↓
        Restore isolated database
                ↓
        Validate
                ↓
        Repair/replace production
                ↓
        Validate application
                ↓
        Restore traffic
```

---

# 43. Recovery Sequence

Recommended generic sequence:

```text
1. Incident declaration
2. Freeze risky changes
3. Preserve evidence
4. Determine blast radius
5. Secure credentials if needed
6. Restore infrastructure
7. Restore PostgreSQL
8. Validate database
9. Deploy known-good API
10. Configure authentication
11. Start workers
12. Deploy Admin
13. Validate observability
14. Run smoke tests
15. Restore external traffic
16. Monitor
17. Confirm recovery
18. Communicate closure
19. Perform postmortem
```

---

# 44. Smoke Tests After Recovery

At minimum test:

### API

```text
GET /api/v1
GET /health
GET /ready
```

### Authentication

```text
register
login
verify
refresh
logout
```

### Authorization

```text
unauthorized request → 401
insufficient permission → 403
allowed operation → success
```

### Database

Verify:

- user records
- critical business records
- relationships
- timestamps
- constraints
- indexes
- migrations

### Admin

Verify:

- login
- navigation
- protected routes
- data loading
- mutations
- logout

### Workers

Verify:

- queue connectivity
- job consumption
- retry behavior
- critical job completion

---

# 45. Data Integrity Checks

Do not stop at "the database starts."

Validate:

- row counts for critical tables
- foreign-key relationships
- uniqueness constraints
- recent records
- user accounts
- roles
- permissions
- audit records
- business invariants

Where practical, compare:

```text
Expected
vs
Recovered
```

for critical aggregates.

---

# 46. Recovery Validation Checklist

## Database

- [ ] PostgreSQL starts
- [ ] expected database exists
- [ ] schema version is correct
- [ ] critical tables exist
- [ ] relationships are valid
- [ ] recent data is present
- [ ] audit data is present
- [ ] database credentials work
- [ ] application migrations are compatible

## API

- [ ] API starts
- [ ] health endpoint works
- [ ] readiness works
- [ ] database connection works
- [ ] authentication works
- [ ] authorization works
- [ ] errors are handled correctly
- [ ] metrics are available
- [ ] logs are available

## Admin

- [ ] Admin loads
- [ ] login works
- [ ] protected routes work
- [ ] API calls work
- [ ] RBAC works
- [ ] critical mutations work

## Workers

- [ ] Redis connectivity works
- [ ] workers start
- [ ] queues are healthy
- [ ] jobs process
- [ ] retries work
- [ ] critical jobs are not lost

## Security

- [ ] secrets are valid
- [ ] TLS works
- [ ] CORS is correct
- [ ] authentication is safe
- [ ] privileged access is restricted
- [ ] suspicious sessions are handled
- [ ] audit events are recorded

---

# 47. Post-Recovery Monitoring

After restoration, increase monitoring.

Watch:

- API error rate
- latency
- database connections
- database CPU
- database storage
- slow queries
- worker failures
- queue depth
- Redis health
- authentication failures
- authorization failures
- unusual traffic
- audit events

Recovery is not complete merely because traffic has resumed.

---

# 48. Recovery Stabilization Window

For a significant disaster, define a stabilization period.

Example:

```text
T+0       Service restored
T+15 min  Smoke tests complete
T+30 min  Metrics stable
T+60 min  Business validation complete
T+2 hr    Recovery confirmed
T+24 hr   Post-recovery review
```

During stabilization:

- avoid unnecessary deployments
- avoid schema changes
- avoid large migrations
- monitor resource saturation
- preserve recovery artifacts

---

# 49. Read-Only Recovery Mode

For certain incidents, temporarily serving read-only traffic can reduce risk.

Example:

```text
Database recovered
        ↓
Writes disabled
        ↓
Reads validated
        ↓
Business data verified
        ↓
Writes re-enabled
```

This is particularly useful after uncertain database recovery.

The application should explicitly support such operational modes if business requirements justify them.

---

# 50. Maintenance Mode

A controlled maintenance mode can prevent inconsistent writes during recovery.

Possible behavior:

```text
GET requests → allowed
POST/PATCH/PUT/DELETE → temporarily rejected
```

Return a stable API error such as:

```text
SERVICE_TEMPORARILY_UNAVAILABLE
```

Do not expose internal recovery details to end users.

---

# 51. Incident Communication

Define communication channels before disaster strikes.

Communicate:

- what is affected
- whether data is safe
- whether writes are disabled
- expected recovery status
- next update time
- recovery completion

Do not speculate about security or data loss before investigation.

---

# 52. Security Incident Recovery

If the disaster involves compromise:

```text
Contain
  ↓
Preserve evidence
  ↓
Rotate credentials
  ↓
Revoke sessions
  ↓
Restore trusted infrastructure
  ↓
Restore trusted database point
  ↓
Patch vulnerability
  ↓
Validate
  ↓
Monitor
```

Do not restore a compromised application image merely because it is known to have worked previously.

---

# 53. Ransomware / Destructive Attack

If destructive activity is suspected:

1. Isolate affected systems.
2. Protect backup infrastructure.
3. Disable compromised credentials.
4. Preserve forensic evidence.
5. Identify last trusted backup.
6. Restore into clean infrastructure.
7. Rotate secrets.
8. Patch the attack vector.
9. Validate data.
10. Reintroduce traffic gradually.

Backups should be protected from the same credentials and network paths used by production.

---

# 54. Backup Account Separation

Prefer separate identities:

```text
Application identity
        ≠
Database administrator
        ≠
Backup administrator
        ≠
Infrastructure administrator
```

This limits blast radius.

---

# 55. Backup Deletion Protection

Where supported, use:

- object lock
- immutable snapshots
- retention policies
- MFA-protected deletion
- separate backup accounts/projects
- delayed deletion

This is especially valuable against compromised administrator credentials.

---

# 56. Disaster Recovery for Audit Logs

Audit data should have:

- independent retention
- access controls
- backup
- integrity protection
- restoration testing

If audit logs are required for compliance or security investigations, their recovery priority should be explicitly documented.

---

# 57. Observability Recovery

Observability is important but should not block core service recovery unless operational requirements demand it.

Recovery order:

```text
Core database
   ↓
API
   ↓
Authentication
   ↓
Critical workers
   ↓
Admin
   ↓
Metrics
   ↓
Dashboards
   ↓
Tracing/log aggregation enhancements
```

Application logs should remain available through the deployment platform even if the centralized observability stack is temporarily unavailable.

---

# 58. Prometheus/Grafana Recovery

Metrics data is usually less critical than business data.

Back up:

- Grafana dashboard definitions
- alert rules
- recording rules
- Prometheus configuration
- scrape configuration

Do not treat historical metrics as a substitute for application logs or audit records.

---

# 59. Configuration Recovery

Configuration should be reproducible.

Keep:

```text
.env.example
configuration schemas
deployment manifests
Helm values
Kubernetes manifests
Docker configuration
CI/CD definitions
```

Do not store:

```text
.env.production
real secrets
private keys
```

in source control.

---

# 60. Recovery Configuration Checklist

Verify:

- `NODE_ENV`
- `PORT`
- `HOST`
- `DATABASE_URL`
- JWT configuration
- refresh-token configuration
- API prefix/version
- CORS origins
- rate limits
- Redis URL
- worker configuration
- metrics configuration
- Swagger configuration
- external service credentials

Use startup validation so invalid configuration fails fast.

---

# 61. Deployment Recovery

Always retain:

- previous production image
- current image
- release metadata
- Git SHA
- database migration version
- configuration version

A deployment should answer:

```text
What version was running?
What version was deployed?
What changed?
Can we roll back?
Is the database compatible with rollback?
```

---

# 62. Rollback vs Restore

These are different operations.

### Rollback

Use when:

- application code is broken
- database is intact
- schema is compatible
- deployment is the primary failure

### Restore

Use when:

- data is corrupted
- data was deleted
- database is lost
- migration caused irreversible damage

### Both

Sometimes required:

```text
Restore database
+
Deploy known-good application
```

---

# 63. Rollback Safety

Never assume application rollback is safe after a database migration.

Safe:

```text
Old app
   ↓
Compatible schema
```

Unsafe:

```text
Old app
   ↓
Schema has removed fields old app requires
```

Use expand/contract migrations to preserve rollback options.

---

# 64. Recovery and API Versioning

During recovery, ensure the restored database supports the deployed API version.

If multiple API versions exist:

```text
/api/v1
/api/v2
```

verify:

- routes
- contracts
- authorization
- database compatibility
- background jobs
- webhooks

Do not restore an older application against an incompatible newer schema.

---

# 65. Recovery and Background Jobs

After restoring a database, queue state may not match application state.

Possible scenario:

```text
PostgreSQL:
order = PAID

Redis:
payment-confirmation job missing
```

Recovery should reconcile durable business state with asynchronous work.

Build reconciliation tools for critical workflows.

Example:

```text
Find paid orders without confirmation event
        ↓
Generate missing outbox event
        ↓
Publish job
        ↓
Process idempotently
```

---

# 66. Recovery Reconciliation

Critical business modules should define reconciliation checks.

Examples:

- orders without payment events
- users without required roles
- records missing audit events
- completed operations with missing notifications
- outbox events not published
- jobs stuck beyond expected duration

This is one of the most powerful protections against partial disaster recovery.

---

# 67. Recovery Scripts

Create a dedicated operational scripts area.

Example:

```text
scripts/
  backup/
    verify-backup.*
    restore-db.*
  recovery/
    health-check.*
    validate-db.*
    reconcile-jobs.*
    verify-rbac.*
  deployment/
    rollback.*
```

Scripts should:

- fail safely
- require explicit confirmation for destructive actions
- log actions
- validate prerequisites
- avoid printing secrets

---

# 68. Destructive Recovery Commands

Commands that can destroy data must require explicit confirmation.

Example:

```text
RESTORE_PRODUCTION=true
```

or an equivalent interactive confirmation.

Prefer:

```text
restore into isolated environment
```

before:

```text
overwrite production
```

---

# 69. Recovery Environment

Maintain the ability to create an isolated recovery environment.

It should include:

- PostgreSQL
- API
- workers
- Redis where required
- Admin
- secrets/configuration
- observability

The recovery environment should not automatically receive public traffic.

---

# 70. Recovery Testing Environment

Example:

```text
Backup
  ↓
Isolated recovery DB
  ↓
Recovered API
  ↓
Recovered workers
  ↓
Recovered Admin
  ↓
Automated validation
```

This environment is where backup restoration should be proven.

---

# 71. Disaster Recovery Drill

A realistic drill:

### Scenario

> Production PostgreSQL was corrupted after a faulty deployment.

### Exercise

1. Declare simulated incident.
2. Freeze deployment.
3. Identify last trusted point.
4. Restore backup.
5. Replay WAL.
6. Deploy known-good API.
7. Validate migrations.
8. Validate authentication.
9. Validate RBAC.
10. Validate Admin.
11. Validate workers.
12. Validate audit logs.
13. Restore simulated traffic.
14. Record RTO/RPO.
15. Document failures.

---

# 72. Recovery Drill Metrics

Record:

| Metric                        | Result |
| ----------------------------- | -----: |
| Time to detect                |      X |
| Time to declare               |      X |
| Time to select recovery point |      X |
| Backup restore time           |      X |
| WAL replay time               |      X |
| API deployment time           |      X |
| Smoke-test time               |      X |
| Total RTO                     |      X |
| Effective RPO                 |      X |
| Manual steps                  |      X |
| Failed steps                  |      X |

Use these results to improve the system.

---

# 73. Recovery Readiness Score

A simple internal score can track:

### Data

- [ ] backups automated
- [ ] PITR configured
- [ ] backups encrypted
- [ ] restore tested

### Application

- [ ] immutable images
- [ ] reproducible deployment
- [ ] rollback tested

### Infrastructure

- [ ] infrastructure as code
- [ ] secrets recoverable
- [ ] DNS access documented
- [ ] TLS recovery documented

### Operations

- [ ] runbook exists
- [ ] owners assigned
- [ ] alerts configured
- [ ] DR drill completed

### Security

- [ ] backup deletion protected
- [ ] credential rotation tested
- [ ] incident response documented

---

# 74. Ownership

Every critical recovery component needs an owner.

Example:

| Component             | Owner             |
| --------------------- | ----------------- |
| PostgreSQL            | Backend/Platform  |
| Redis                 | Platform          |
| API                   | Backend           |
| Admin                 | Frontend          |
| Kubernetes            | Platform          |
| CI/CD                 | Platform          |
| Secrets               | Security/Platform |
| DNS                   | Platform          |
| Audit logs            | Backend/Security  |
| External integrations | Feature owner     |

Avoid:

```text
Everyone owns DR
```

which often means nobody owns it.

---

# 75. Access During Disaster

Emergency access should be:

- authenticated
- authorized
- logged
- time-limited where possible
- reviewed afterward

Use break-glass access only when necessary.

Break-glass credentials should not be ordinary application credentials.

---

# 76. Break-Glass Procedure

A controlled emergency access process:

```text
Emergency declared
        ↓
Break-glass access approved
        ↓
Privileged action performed
        ↓
Action logged
        ↓
Access revoked
        ↓
Credential rotated if appropriate
        ↓
Post-incident review
```

---

# 77. Recovery Data Privacy

Recovered production data is still production data.

Do not copy it casually into:

- developer laptops
- public test environments
- shared staging environments
- unencrypted local storage

If production data must be used for testing:

- restrict access
- encrypt storage
- minimize data
- mask sensitive values
- delete temporary copies afterward

---

# 78. Recovery and GDPR/Privacy Requirements

Where applicable, recovery procedures should preserve:

- retention policies
- deletion requirements
- access controls
- data-subject rights
- auditability

Do not assume that backup copies are exempt from privacy obligations.

Legal requirements depend on jurisdiction and business context.

---

# 79. Recovery Documentation

Keep this document synchronized with reality.

At minimum document:

- architecture
- backups
- restore process
- credentials/access paths
- deployment process
- database migration process
- DNS
- TLS
- external services
- recovery scripts
- owners
- RPO
- RTO

Outdated runbooks are dangerous.

---

# 80. Change Management

Any infrastructure change that affects recovery should update:

- DR documentation
- recovery scripts
- backup configuration
- monitoring
- test procedures

Examples:

- database provider migration
- Redis replacement
- new Kubernetes cluster
- new secret manager
- new external payment provider
- schema architecture change

---

# 81. Dependency Inventory

Maintain a list of dependencies:

```text
Fastify
Node.js
PostgreSQL
Prisma
Redis
BullMQ
Docker
Kubernetes
React
Vite
TanStack Query
Prometheus
Grafana
DNS
TLS
Cloud provider
Container registry
Secret manager
External APIs
Email provider
```

For each dependency determine:

- recovery mechanism
- business impact
- alternative
- owner
- credentials
- documentation

---

# 82. Disaster Scenarios

Test at least:

### Scenario A — Bad deployment

Expected response:

```text
Rollback
```

### Scenario B — Accidental delete

Expected response:

```text
PITR / targeted data restoration
```

### Scenario C — Database loss

Expected response:

```text
Backup restore + PITR
```

### Scenario D — Redis loss

Expected response:

```text
Rebuild cache + recover/reconcile jobs
```

### Scenario E — Kubernetes loss

Expected response:

```text
Recreate infrastructure + redeploy
```

### Scenario F — Secret compromise

Expected response:

```text
Rotate + revoke + investigate
```

### Scenario G — Region outage

Expected response:

```text
Fail over if multi-region architecture exists
otherwise restore according to DR plan
```

---

# 83. Disaster Scenario Matrix

| Failure             | Data Loss Risk | Primary Recovery          |
| ------------------- | -------------- | ------------------------- |
| API crash           | Low            | Restart/scale             |
| Bad API deploy      | Low            | Rollback                  |
| Redis loss          | Low–Medium     | Rebuild/reconcile         |
| Worker failure      | Medium         | Restart/retry             |
| DB outage           | Medium         | HA/failover               |
| DB corruption       | High           | PITR/restore              |
| Accidental deletion | High           | PITR/targeted restore     |
| Cluster loss        | Low–Medium     | Rebuild                   |
| Region loss         | High           | Regional failover/restore |
| Secret compromise   | Security risk  | Rotate/revoke/rebuild     |
| Backup corruption   | Critical       | Secondary backup/archive  |

---

# 84. Production Backup Checklist

- [ ] PostgreSQL backups enabled
- [ ] PITR enabled where required
- [ ] backups stored independently
- [ ] backups encrypted
- [ ] backup deletion protected
- [ ] retention policy defined
- [ ] backup monitoring enabled
- [ ] failed backups alert
- [ ] restore test completed
- [ ] restore duration measured

---

# 85. Production Recovery Checklist

- [ ] RPO defined
- [ ] RTO defined
- [ ] recovery owner assigned
- [ ] incident commander defined
- [ ] database restore documented
- [ ] application rollback documented
- [ ] secret recovery documented
- [ ] DNS recovery documented
- [ ] TLS recovery documented
- [ ] infrastructure recreation tested
- [ ] Admin recovery tested
- [ ] worker recovery tested
- [ ] audit recovery tested
- [ ] reconciliation procedures exist

---

# 86. Quarterly DR Checklist

- [ ] Restore latest PostgreSQL backup
- [ ] Validate schema
- [ ] Validate critical data
- [ ] Start API
- [ ] Test authentication
- [ ] Test RBAC
- [ ] Start workers
- [ ] Test queue processing
- [ ] Start Admin
- [ ] Test critical workflows
- [ ] Validate audit events
- [ ] Validate observability
- [ ] Measure RTO
- [ ] Measure RPO
- [ ] Record findings
- [ ] Fix identified gaps

---

# 87. Annual Disaster Exercise

Perform a broader simulation at least annually for critical production systems.

Example:

```text
Simulated region loss
        ↓
Production unavailable
        ↓
Activate DR
        ↓
Provision/recover infrastructure
        ↓
Restore data
        ↓
Deploy application
        ↓
Recover workers
        ↓
Validate
        ↓
Fail traffic
        ↓
Monitor
        ↓
Complete postmortem
```

The exercise should involve the people who would actually respond to a real incident.

---

# 88. Common Disaster Recovery Anti-Patterns

## Anti-pattern 1 — "We have backups"

Without restore testing, this is incomplete.

---

## Anti-pattern 2 — Backup stored on the same server

A server failure destroys both.

---

## Anti-pattern 3 — Redis contains business truth

Redis loss becomes business-data loss.

---

## Anti-pattern 4 — Secrets only exist on one laptop

That is not recoverable infrastructure.

---

## Anti-pattern 5 — Mutable `latest` image

Recovery cannot reliably identify the previous version.

---

## Anti-pattern 6 — Manual database changes

They make recovery difficult to reproduce.

---

## Anti-pattern 7 — No PITR

A daily backup may still lose an entire day's changes.

---

## Anti-pattern 8 — No migration compatibility

Rollback becomes dangerous after schema changes.

---

## Anti-pattern 9 — No recovery drill

The first disaster becomes the first test.

---

## Anti-pattern 10 — Backups accessible with production credentials

A compromised application may be able to destroy its own backups.

---

# 89. Recommended Implementation Roadmap

## Phase 1 — Backup Foundation

Implement:

- automated PostgreSQL backups
- encrypted independent storage
- retention
- backup monitoring
- restore documentation

---

## Phase 2 — PITR

Implement:

- WAL archiving
- point-in-time recovery
- recovery-point selection
- restore validation

---

## Phase 3 — Recovery Automation

Create:

```text
scripts/backup/
scripts/recovery/
```

Automate:

- backup verification
- restore
- database validation
- health checks
- smoke tests

---

## Phase 4 — Infrastructure Recovery

Ensure:

- Docker images are immutable
- deployment manifests are version controlled
- infrastructure is reproducible
- secrets can be recovered
- DNS/TLS recovery is documented

---

## Phase 5 — Application Reconciliation

Add:

- outbox processing
- job reconciliation
- data integrity checks
- critical workflow verification

---

## Phase 6 — DR Drills

Run:

- monthly backup restores
- quarterly recovery exercises
- annual disaster simulation

---

## Phase 7 — Advanced Resilience

Only when justified:

- PostgreSQL HA
- cross-zone redundancy
- multi-region deployment
- cross-region data replication
- automated failover

---

# 90. Fastify-MasterApp Recovery Architecture

The intended architecture is:

```text
                    ┌─────────────────────┐
                    │ Independent Backup │
                    │ Storage            │
                    └──────────┬──────────┘
                               │
                         PITR / Restore
                               │
                               ▼
┌────────────┐       ┌───────────────────┐
│ React      │──────▶│ Fastify API       │
│ Admin      │       │ Known-good image  │
└────────────┘       └─────────┬─────────┘
                               │
                   ┌───────────┴───────────┐
                   │                       │
            ┌──────▼──────┐         ┌──────▼──────┐
            │ PostgreSQL  │         │ Redis       │
            │ Source of   │         │ Cache/Queue │
            │ Truth       │         └──────┬───────┘
            └──────┬──────┘                │
                   │                ┌──────▼──────┐
                   │                │ BullMQ       │
                   │                │ Workers      │
                   │                └──────────────┘
                   │
             ┌─────▼─────┐
             │ Outbox /  │
             │ Audit     │
             └───────────┘
```

The key property is:

> PostgreSQL remains the durable source of business truth, while Redis and workers can be reconstructed or reconciled.

---

# 91. Definition of Done

Disaster recovery is considered production-ready when:

### Data

- [ ] PostgreSQL backups are automated
- [ ] PITR is configured where required
- [ ] backups are encrypted
- [ ] backups are stored independently
- [ ] backup retention is defined
- [ ] restore has been tested

### Application

- [ ] API can be redeployed from immutable artifacts
- [ ] Admin can be rebuilt
- [ ] rollback is documented
- [ ] database compatibility is understood

### Authentication

- [ ] JWT signing configuration is recoverable
- [ ] refresh-token state is recoverable
- [ ] session revocation strategy is documented
- [ ] secret rotation procedure exists

### Workers

- [ ] critical jobs are idempotent
- [ ] queue recovery is documented
- [ ] outbox/reconciliation strategy exists
- [ ] worker restart is tested

### Infrastructure

- [ ] infrastructure configuration is version controlled
- [ ] secrets are recoverable
- [ ] DNS recovery is documented
- [ ] TLS recovery is documented
- [ ] cluster recreation is possible

### Operations

- [ ] RPO is documented
- [ ] RTO is documented
- [ ] owners are assigned
- [ ] incident runbook exists
- [ ] recovery drill has been completed
- [ ] recovery metrics are recorded

### Security

- [ ] backup access is restricted
- [ ] backup deletion is protected
- [ ] emergency access is controlled
- [ ] compromised-secret procedure exists
- [ ] recovered environments are secured

---

# 92. Final Golden Rules

1. **PostgreSQL is the durable source of business truth.**
2. **Backups must be independent from production.**
3. **PITR is essential for serious data-recovery scenarios.**
4. **Backups must be restored and tested regularly.**
5. **Redis loss should not equal business-data loss.**
6. **Critical jobs must be idempotent and recoverable.**
7. **Use immutable application artifacts.**
8. **Keep infrastructure and migrations in version control.**
9. **Protect backups from compromised production credentials.**
10. **Do not sacrifice security controls during recovery without explicit risk approval.**
11. **Prefer isolated restoration before overwriting production.**
12. **Validate data, authentication, authorization, workers, and Admin—not just process startup.**
13. **Measure actual RPO and RTO during drills.**
14. **Automate repeatable recovery operations.**
15. **Assign explicit ownership for every critical recovery component.**
16. **Reconcile asynchronous state after recovery.**
17. **Keep the recovery runbook synchronized with the real architecture.**
18. **Treat disaster recovery as an engineering capability, not a document.**

---

# 93. Final Principle

The goal of disaster recovery is not simply:

```text
"We can start the application again."
```

The goal is:

```text
Trusted backup
      ↓
Correct recovery point
      ↓
Integrity-checked database
      ↓
Known-good application
      ↓
Secure authentication
      ↓
Correct authorization
      ↓
Recovered background processing
      ↓
Validated Admin
      ↓
Observable service
      ↓
Controlled return to production
```

A resilient Fastify-MasterApp should be designed so that a catastrophic failure becomes a **repeatable recovery procedure**, rather than an improvised emergency.
