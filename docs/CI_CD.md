# CI_CD.md

# Fastify-MasterApp CI/CD Standard

This document defines the Continuous Integration and Continuous Delivery/Deployment strategy for Fastify-MasterApp.

The goal is to make every change:

```text
validated
repeatable
traceable
secure
deployable
recoverable
```

The target pipeline is:

```text
Developer
   |
   v
Feature Branch
   |
   v
Pull Request
   |
   +--> Lint
   +--> Typecheck
   +--> Unit Tests
   +--> Integration Tests
   +--> Contract Tests
   +--> Security Checks
   +--> Build
   |
   v
Merge
   |
   v
Build Immutable Artifact
   |
   v
Scan Artifact
   |
   v
Publish
   |
   v
Deploy Staging
   |
   v
Smoke / E2E
   |
   v
Production Approval
   |
   v
Deploy Production
   |
   v
Verify + Observe
```

---

# 1. Core Principles

Fastify-MasterApp follows these CI/CD principles:

1. **Every pull request is validated automatically.**
2. **Main should remain deployable.**
3. **Build once and promote the same artifact.**
4. **Production artifacts must be immutable.**
5. **CI must validate application and infrastructure changes.**
6. **Security checks are part of the pipeline, not an afterthought.**
7. **Database migrations are tested before production.**
8. **Tests must be deterministic.**
9. **Deployments must be observable.**
10. **Rollback must use a known-good artifact.**
11. **Production credentials must not live in source control.**
12. **CI credentials should use least privilege.**
13. **High-risk changes require additional review.**
14. **Pipeline failures should be actionable.**
15. **Do not make CI/CD more complicated than the application requires.**

---

# 2. CI vs CD

## Continuous Integration

CI answers:

```text
Can this change safely be merged?
```

CI should validate:

```text
code quality
types
tests
contracts
security
build
```

---

## Continuous Delivery

Continuous Delivery answers:

```text
Can this validated artifact be deployed safely?
```

It produces:

```text
immutable artifact
release metadata
migration package
deployment metadata
```

---

## Continuous Deployment

Continuous Deployment answers:

```text
Should this validated artifact be automatically deployed?
```

For production, automatic deployment can be enabled when the organization is comfortable with the risk model.

---

# 3. Target Pipeline

The recommended pipeline:

```text
Pull Request
    |
    +--> formatting/lint
    +--> typecheck
    +--> unit tests
    +--> integration tests
    +--> API contract tests
    +--> security scanning
    +--> dependency checks
    +--> build
    |
    v
Merge to Main
    |
    +--> build production image
    +--> image scan
    +--> publish image
    |
    v
Staging
    |
    +--> database migration
    +--> deploy
    +--> health check
    +--> smoke tests
    +--> E2E tests
    |
    v
Production Approval
    |
    v
Production
    |
    +--> migration
    +--> deployment
    +--> smoke tests
    +--> observability verification
    |
    v
Release Complete
```

---

# 4. Repository Structure

The monorepo contains multiple applications/packages.

Conceptually:

```text
Fastify-MasterApp/
├── apps/
│   ├── api/
│   └── admin/
├── packages/
│   └── api-contracts/
├── prisma/
├── docker/
├── k8s/
├── scripts/
├── docs/
└── .kiro/
```

CI should understand these boundaries.

A change to:

```text
packages/api-contracts
```

may require testing:

```text
apps/api
apps/super-admin
```

because both consume the shared contract.

---

# 5. Change Impact

CI should eventually support dependency-aware execution.

Example:

```text
apps/api changed
    |
    +--> API tests
    +--> shared contract tests
    +--> API build

apps/super-admin changed
    |
    +--> Super Admin build

packages/api-contracts changed
    |
    +--> API tests
    +--> Super Admin build
    +--> contract validation
```

Do not optimize this too aggressively before the pipeline becomes expensive.

Correctness comes first.

---

# 6. Branch Strategy

Recommended:

```text
main
  |
  +-- feature/*
  +-- fix/*
  +-- chore/*
  +-- security/*
```

Short-lived branches are preferred.

Avoid long-running branches that drift significantly from `main`.

---

# 7. Protected Main

`main` should be protected.

Recommended requirements:

- pull request required
- CI required
- review required
- force push disabled
- direct push restricted
- branch deletion restricted where appropriate

---

# 8. Pull Request Workflow

Developer:

```text
create branch
    |
implement change
    |
run local checks
    |
push branch
    |
open PR
```

CI:

```text
validate
    |
report status
```

Review:

```text
code review
    |
CI green
    |
merge
```

---

# 9. Required PR Checks

Minimum recommended checks:

```text
lint
typecheck
unit tests
integration tests
contract tests
build
dependency/security scan
```

Additional checks may run for specific changes.

---

# 10. Fast Feedback

CI should run cheap checks early.

Recommended order:

```text
1. install
2. formatting/lint
3. typecheck
4. unit tests
5. integration tests
6. security scans
7. build
8. E2E
```

The exact order can be parallelized.

---

# 11. Parallel Jobs

Independent jobs should run in parallel.

Example:

```text
              ┌--> lint
              |
PR ----------+--> typecheck
              |
              +--> unit tests
              |
              +--> security
```

Then:

```text
all required checks
        |
        v
build
```

This reduces feedback time.

---

# 12. CI Runtime

Track pipeline duration.

Useful metrics:

```text
total CI duration
test duration
build duration
dependency install duration
queue time
```

If CI becomes slow, optimize the slowest stage rather than adding complexity everywhere.

---

# 13. Dependency Installation

CI should use the repository lockfile.

Use the package manager's immutable/frozen installation mode where supported.

Do not allow CI to silently modify the lockfile.

---

# 14. Node.js Version

CI should use the same supported Node.js major version as production.

Align:

```text
local
CI
Docker
staging
production
```

where practical.

---

# 15. Dependency Caching

Dependency caches can significantly reduce CI duration.

Cache:

```text
package manager cache
```

but avoid caching mutable build outputs unless cache invalidation is reliable.

---

# 16. Cache Safety

A cache must never become a source of correctness.

If a cache is stale:

```text
clear cache
rebuild
```

The pipeline should still work.

---

# 17. Lint

Lint should run on every PR.

Lint catches:

```text
style violations
unsafe patterns
unused imports
code-quality issues
```

Lint should not replace typechecking or tests.

---

# 18. Formatting

If the project uses an automated formatter, CI should verify formatting.

Prefer:

```text
format check
```

over modifying files inside CI.

A PR should contain the formatted code.

---

# 19. Typecheck

TypeScript typechecking is mandatory for relevant packages.

The goal is to catch:

```text
invalid types
contract mismatches
incorrect imports
unsafe assumptions
```

before runtime.

---

# 20. Unit Tests

Unit tests should validate isolated behavior.

Examples:

```text
services
domain rules
authorization policies
utilities
error mapping
validation helpers
```

Unit tests should be fast.

---

# 21. Integration Tests

Integration tests should validate boundaries.

Examples:

```text
Fastify routes
authentication
Prisma
PostgreSQL
RBAC
transactions
error responses
```

Use isolated test databases.

---

# 22. Contract Tests

Because Fastify-MasterApp uses shared TypeBox contracts, CI should validate contract compatibility.

Test:

```text
request schema
response schema
error schema
Admin API client assumptions
```

Contract changes should be visible during PR review.

---

# 23. Admin Tests

CI should test the React Admin application.

Minimum:

```text
component tests
query/mutation behavior
authentication behavior
permission-aware UI
form validation
error states
```

---

# 24. End-to-End Tests

E2E tests should cover critical user workflows.

Examples:

```text
Admin login
refresh/session behavior
user management
role/permission behavior
critical CRUD workflows
logout
```

Do not attempt to cover every edge case through E2E tests.

Use unit/integration tests for lower-level behavior.

---

# 25. Test Database

CI integration tests should use a dedicated database.

Conceptually:

```text
CI Job
   |
   v
PostgreSQL service/container
   |
   v
Prisma migration
   |
   v
seed test data
   |
   v
tests
   |
   v
cleanup
```

Never point CI at production.

---

# 26. Prisma Migration Testing

CI should verify migrations can be applied from a clean database.

Conceptually:

```text
empty PostgreSQL
      |
      v
prisma migrate deploy
      |
      v
schema valid
      |
      v
integration tests
```

This catches migration problems before deployment.

---

# 27. Migration Compatibility Tests

For important schema changes, test compatibility between:

```text
previous application
+
new schema
```

and:

```text
new application
+
new schema
```

when rolling deployments are used.

---

# 28. Seed Data

CI test seeds should be:

```text
deterministic
minimal
safe
repeatable
```

Do not rely on manually created records.

---

# 29. Test Isolation

Tests should not depend on:

```text
execution order
shared mutable state
previous CI runs
developer machines
external production services
```

A test should be able to run repeatedly.

---

# 30. Flaky Tests

Flaky tests are defects.

Do not normalize:

```text
retry test 3 times until green
```

as the permanent solution.

Instead:

1. identify root cause
2. isolate state
3. remove timing assumptions
4. control external dependencies
5. fix cleanup

Temporary retries may be used only while fixing known infrastructure flakiness.

---

# 31. Coverage

Coverage is useful as a signal, not a goal by itself.

Focus on coverage of:

```text
authentication
authorization
RBAC
business rules
database boundaries
error handling
critical workflows
```

Do not inflate coverage with meaningless tests.

---

# 32. Security Scanning

CI should include security checks.

Recommended categories:

```text
secret scanning
dependency scanning
SAST
container scanning
configuration scanning
```

The exact tools can evolve.

---

# 33. Secret Scanning

CI should detect accidental commits of:

```text
API keys
JWT secrets
cloud credentials
private keys
database credentials
tokens
```

If a real secret is committed:

```text
do not merely delete the file
```

Also rotate/revoke the secret.

---

# 34. Dependency Scanning

Scan:

```text
production dependencies
development dependencies
container OS packages
```

Prioritize:

```text
critical vulnerabilities
high-risk exploitable vulnerabilities
```

Do not blindly block every low-severity finding without a risk policy.

---

# 35. SAST

Static analysis should identify:

```text
injection risks
unsafe input handling
authentication mistakes
authorization mistakes
dangerous APIs
hardcoded secrets
```

SAST should complement code review and tests.

---

# 36. Container Scanning

Production images should be scanned for:

```text
OS vulnerabilities
dependency vulnerabilities
secrets
misconfiguration
```

Do not publish known-critical vulnerable images without an explicit exception process.

---

# 37. Security Exceptions

If a vulnerability cannot immediately be fixed, document:

```text
vulnerability
severity
affected component
reason for exception
mitigation
owner
expiration/review date
```

Avoid permanent undocumented exceptions.

---

# 38. License Scanning

If required by the organization, scan dependency licenses.

Pay attention to:

```text
copyleft obligations
commercial restrictions
unknown licenses
```

The repository should define an approved dependency policy.

---

# 39. Build Verification

The API build must succeed in a clean CI environment.

Do not depend on:

```text
developer global packages
local environment variables
untracked files
local build output
```

---

# 40. Admin Build Verification

The Admin production build should succeed with only the intended public configuration.

Verify:

```text
API base URL
build mode
asset generation
typecheck
bundle
```

Never inject private backend secrets.

---

# 41. Build Artifacts

Artifacts may include:

```text
API container image
Admin static assets
migration files
release metadata
test reports
coverage reports
```

Only production-relevant artifacts should be promoted.

---

# 42. Immutable Artifacts

Every release should produce an immutable identifier.

Example:

```text
fastify-masterapp-api:git-abc123
```

The same artifact should move through:

```text
staging
production
```

---

# 43. Artifact Metadata

Store:

```text
Git SHA
version
build timestamp
Node version
dependency lockfile state
```

where appropriate.

This makes releases traceable.

---

# 44. Container Build

Production image flow:

```text
Source
  |
  v
Docker build
  |
  v
Image
  |
  v
Image scan
  |
  v
Registry
```

Build should fail if required security gates fail.

---

# 45. Registry Security

Protect registry access.

Use:

```text
short-lived credentials where possible
least privilege
private repositories
image retention
vulnerability scanning
```

---

# 46. Release Tags

Use consistent release tags.

Possible:

```text
v1.2.3
```

and immutable image:

```text
v1.2.3-abc123
```

The Git SHA should remain available even if semantic versions are used.

---

# 47. Staging Deployment

After merge:

```text
build
  |
  v
publish
  |
  v
staging migration
  |
  v
staging API
  |
  v
staging Admin
```

Staging should use the same production artifact.

---

# 48. Staging Validation

Run:

```text
health checks
smoke tests
critical E2E tests
API contract tests
database checks
observability checks
```

---

# 49. Staging Data

Never copy production data into staging without explicit authorization and privacy controls.

Prefer:

```text
synthetic data
sanitized data
controlled fixtures
```

---

# 50. Production Promotion

Production should promote the exact artifact already validated in staging.

Example:

```text
image abc123
   |
   +--> staging
   |
   +--> production
```

Do not rebuild:

```text
abc123
```

for production.

---

# 51. Production Approval

Depending on risk, production may require:

```text
automatic approval
manual approval
two-person review
change window
```

High-risk changes should receive stronger controls.

---

# 52. High-Risk Changes

Require additional review for:

```text
authentication
JWT configuration
RBAC
authorization
database migrations
data deletion
security headers
CORS
networking
infrastructure
secret handling
major dependency upgrades
```

---

# 53. Deployment Environments

CI/CD should use separate environment credentials.

Example:

```text
CI
 |
 +--> staging credentials
 |
 +--> production credentials
```

Do not reuse a broad production credential for staging.

---

# 54. CI Identity

The CI system should have a dedicated identity.

Avoid:

```text
developer personal cloud credentials
```

for automated production deployment.

---

# 55. Least Privilege CI

CI should only have permissions required for:

```text
build
publish
deploy
read required secrets
```

It should not have unrestricted access to the entire cloud account.

---

# 56. Secret Injection

Secrets should be injected at runtime or deployment time.

Examples:

```text
CI secret store
cloud secret manager
Kubernetes Secret
external secret manager
```

Do not bake secrets into:

```text
Docker image
Admin bundle
Git repository
artifact archive
```

---

# 57. Secret Exposure in CI Logs

Never print:

```text
DATABASE_URL
JWT_SECRET
cloud credentials
tokens
private keys
```

Even debugging output must not dump the environment.

---

# 58. Pull Request Secrets

Forked/untrusted PRs should not automatically receive production secrets.

Design workflows so:

```text
untrusted code
```

cannot access:

```text
production credentials
```

---

# 59. CI Script Security

Treat CI configuration as executable code.

Review changes to:

```text
.github/workflows
scripts
Dockerfiles
deployment manifests
```

with the same security attention as application code.

---

# 60. Dependency Supply Chain

Protect the dependency supply chain.

Use:

```text
lockfiles
trusted registries
dependency scanning
package review
minimal dependencies
```

Avoid installing arbitrary packages dynamically during CI.

---

# 61. Dependency Pinning

Pin important CI actions/tools according to the organization's security policy.

For high-security environments, immutable commit references can be preferable to mutable tags.

---

# 62. CI Runner Security

Prefer isolated/ephemeral runners where practical.

Avoid allowing untrusted PR code to persist state between jobs.

---

# 63. Build Isolation

Build jobs should not depend on:

```text
previous job filesystem
developer machine
global packages
```

unless explicitly passed as artifacts/cache.

---

# 64. Artifact Integrity

Production artifacts should be traceable.

Where required, consider:

```text
artifact signing
provenance
SBOM
verification
```

---

# 65. SBOM

A Software Bill of Materials can identify:

```text
application dependencies
OS packages
versions
licenses
vulnerabilities
```

Generate an SBOM for production images where operational/security maturity justifies it.

---

# 66. Supply Chain Security

Long-term controls may include:

```text
signed commits
artifact signing
provenance attestations
SBOM
dependency review
registry controls
```

Adopt incrementally.

---

# 67. CI Environment Variables

Categorize variables:

```text
public build configuration
test configuration
staging secrets
production secrets
```

Never mix them accidentally.

---

# 68. Database Credentials in CI

Integration tests can use disposable credentials.

Staging migrations use staging credentials.

Production migrations use tightly scoped production deployment credentials.

Never store one shared database password in multiple environments.

---

# 69. Database Migration Job

Production migration should be explicit.

Conceptually:

```text
Deploy pipeline
    |
    v
Migration job
    |
    +--> success --> continue
    |
    +--> failure --> stop
```

Do not continue application rollout after a required migration fails.

---

# 70. Migration Race Conditions

Prevent multiple deployments from applying migrations simultaneously.

Use:

```text
deployment lock
migration job ownership
database migration locking
```

depending on the chosen tooling.

---

# 71. Backward Compatibility

CI should encourage compatible deployments.

For API changes:

```text
add
  |
migrate consumers
  |
remove later
```

For database changes:

```text
expand
  |
deploy
  |
backfill
  |
contract
```

---

# 72. API Contract Compatibility

When changing shared TypeBox contracts, verify:

```text
API
+
Admin
+
existing consumers where applicable
```

Breaking changes should be deliberate.

---

# 73. Error Contract Compatibility

Error codes are API contracts.

CI should detect unintended changes to:

```text
error code
status
response schema
required fields
```

---

# 74. OpenAPI / Swagger Validation

If OpenAPI documentation is generated, CI should validate it.

Check:

```text
schema generation
route registration
response schemas
error responses
```

Broken API documentation should fail CI when it affects the release contract.

---

# 75. Generated Files

Decide which generated files belong in Git.

For generated API clients or documentation:

```text
generate
validate
```

Do not create accidental diffs from nondeterministic generation.

---

# 76. Code Generation

If code generation is required:

```text
clean environment
   |
generate
   |
verify
```

Generation should be reproducible.

---

# 77. Test Reports

CI should preserve useful reports:

```text
test results
coverage
lint results
security results
build output
```

Retain them according to repository policy.

---

# 78. Failure Diagnostics

A failed CI job should provide:

```text
clear error
relevant logs
test report
artifact where useful
```

Avoid hiding the real failure behind a generic:

```text
Build failed
```

---

# 79. CI Notifications

Notify developers about:

```text
PR failure
main branch failure
deployment failure
security gate failure
production deployment failure
```

Do not notify everyone for every low-priority event.

---

# 80. Main Branch Health

Monitor:

```text
main CI failure rate
main time-to-green
broken-build duration
```

A broken `main` should be treated as a priority.

---

# 81. Broken Main Policy

If `main` is broken:

```text
stop unrelated merges
identify failing change
fix or revert
restore green state
```

Do not stack more changes on a known broken build.

---

# 82. Revert Strategy

When a newly merged change breaks production or main:

```text
revert
  |
restore known-good state
  |
investigate
  |
fix properly
```

A fast revert is often safer than debugging directly on production.

---

# 83. Deployment Freeze

Consider a temporary deployment freeze during:

```text
major incidents
database recovery
security incident
critical infrastructure outage
```

Only emergency fixes should proceed.

---

# 84. Emergency Changes

Emergency changes still require:

```text
review where possible
automated validation
traceability
post-incident review
```

Do not turn an emergency into undocumented permanent infrastructure.

---

# 85. Rollback Pipeline

A rollback should be a first-class pipeline operation.

Conceptually:

```text
Select previous release
       |
       v
Verify artifact
       |
       v
Deploy
       |
       v
Health checks
       |
       v
Smoke tests
       |
       v
Observe
```

---

# 86. Rollback Database Considerations

Before rolling back application code:

```text
Is the current schema backward compatible?
```

If no:

```text
do not blindly roll back
```

Use the documented migration recovery strategy.

---

# 87. Production Smoke Tests

After deployment:

```text
GET /health
GET /ready
login
authenticated API request
critical read
critical write
Admin load
```

Use safe test accounts and data.

---

# 88. Deployment Verification

CI/CD should verify:

```text
new version running
readiness healthy
critical endpoints responding
5xx normal
latency normal
metrics available
logs flowing
```

---

# 89. Automated Rollback

Automated rollback can be introduced when deployment signals are trustworthy.

Potential triggers:

```text
readiness failure
sustained 5xx spike
severe latency regression
failed smoke test
```

Do not automate rollback based on noisy signals.

---

# 90. Canary Promotion

If canary deployment is used:

```text
deploy 5%
   |
observe
   |
25%
   |
observe
   |
50%
   |
observe
   |
100%
```

Each stage should have clear promotion criteria.

---

# 91. Release Health

Define a release health window.

Monitor:

```text
error rate
latency
authentication
database
workers
business-critical metrics
```

Compare against the previous baseline.

---

# 92. CI/CD Observability

Track pipeline metrics:

```text
deployment frequency
lead time
change failure rate
mean time to recovery
CI duration
deployment duration
rollback frequency
```

These can support DORA-style engineering metrics.

---

# 93. Deployment Frequency

Higher deployment frequency is useful only if:

```text
change failure rate remains acceptable
```

Do not optimize for deployment count at the expense of reliability.

---

# 94. Lead Time

Measure:

```text
commit
  |
  v
production
```

Shorter lead time can indicate efficient delivery.

---

# 95. Change Failure Rate

Track:

```text
deployments causing rollback
+
deployments causing incidents
--------------------------------
total deployments
```

Use this to identify risky parts of the release process.

---

# 96. Mean Time to Recovery

Measure:

```text
incident detected
       |
       v
service recovered
```

Observability and rollback should reduce recovery time.

---

# 97. Pipeline Ownership

Every pipeline should have an owner.

Ownership includes:

```text
workflow maintenance
security updates
runner maintenance
deployment credentials
failure investigation
```

---

# 98. CI/CD Documentation

Keep workflows understandable.

Recommended:

```text
.github/
├── workflows/
│   ├── ci.yml
│   ├── security.yml
│   ├── release.yml
│   ├── deploy-staging.yml
│   └── deploy-production.yml
```

The exact naming can differ.

---

# 99. Suggested Workflow Separation

A mature repository may separate:

```text
CI
Security
Release
Staging deployment
Production deployment
Rollback
```

This is easier to reason about than one enormous workflow.

---

# 100. Avoid Giant Workflows

Bad:

```text
one 2000-line workflow
```

with every possible condition.

Prefer:

```text
small composable workflows
```

where the dependency relationships remain clear.

---

# 101. Reusable CI Jobs

Reusable workflows or scripts can centralize:

```text
Node setup
dependency installation
test database setup
lint
typecheck
tests
Docker build
```

Avoid copy/paste across workflows.

---

# 102. Local CI Parity

Developers should be able to reproduce major CI checks locally.

Provide scripts such as:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

and, where practical:

```text
npm run test:integration
npm run test:e2e
```

---

# 103. Pre-Commit vs CI

Local hooks can provide fast feedback.

Examples:

```text
format
lint
typecheck
```

But CI remains authoritative.

Never rely solely on local hooks because developers can bypass them.

---

# 104. Commit Validation

Commits should be understandable and traceable.

Where the project uses conventional commits, validate them consistently.

Examples:

```text
feat:
fix:
docs:
refactor:
test:
chore:
security:
```

---

# 105. Pull Request Validation

PR checks should verify:

```text
branch is current enough
tests pass
build passes
security passes
required approvals exist
```

The exact branch freshness policy depends on team size.

---

# 106. PR Size

Large PRs increase CI and review risk.

Prefer:

```text
small logical changes
```

over:

```text
massive mixed feature + refactor + migration
```

---

# 107. Database + API PRs

When a PR changes both:

```text
Prisma schema
+
API
```

review:

```text
migration
compatibility
rollback
tests
```

as one release unit.

---

# 108. Admin + API PRs

When changing:

```text
API contract
+
Admin
```

verify:

```text
shared TypeBox contract
API implementation
Admin client
Admin UI
E2E workflow
```

---

# 109. Security-Sensitive PRs

Authentication/RBAC/security changes should receive focused tests.

Examples:

```text
JWT
refresh rotation
permission checks
session revocation
CORS
rate limiting
password reset
MFA
```

Do not rely on generic tests.

---

# 110. Test Matrix

Recommended CI matrix:

```text
Node version
+
package/app
+
test type
```

Keep the matrix small unless compatibility requirements justify expansion.

---

# 111. Supported Runtime Matrix

If multiple Node versions are supported:

```text
minimum supported
current production
```

should be tested.

If only one version is supported, keep CI aligned with production.

---

# 112. Browser Testing

For React Admin E2E, test supported browsers based on product requirements.

Do not create a huge browser matrix without evidence it is necessary.

---

# 113. E2E Environment

E2E tests should run against:

```text
real API
real test database
real Admin build
```

where possible.

Mock external dependencies that would make tests:

```text
slow
expensive
unstable
unsafe
```

---

# 114. External Service Testing

Use:

```text
mock
sandbox
test account
```

instead of production credentials.

Never use real payment/customer systems for ordinary CI.

---

# 115. Network Testing

CI should test failure handling where important:

```text
timeout
dependency unavailable
HTTP 500
HTTP 429
malformed response
```

This validates resilience.

---

# 116. Error Handling Gates

Because `ERROR_HANDLING.md` defines a standard contract, CI should verify:

```text
error envelope
error code
status
request ID
redaction
```

Unexpected raw exceptions should fail integration/security tests.

---

# 117. Observability Gates

CI should validate:

```text
health
readiness
metrics
structured logging
request ID
```

where practical.

---

# 118. Docker Compose Validation

If Docker Compose is used locally, CI can validate:

```text
configuration syntax
service startup
network connectivity
health checks
```

Do not require every CI job to start the entire stack.

Use it where integration coverage benefits.

---

# 119. Kubernetes Manifest Validation

If Kubernetes manifests are version-controlled, CI should validate:

```text
YAML
schema
security policies
resource configuration
container references
```

Deployment to staging should provide the final validation.

---

# 120. Helm or Kustomize

If introduced, validate rendered manifests.

Conceptually:

```text
template/render
    |
    v
validate
    |
    v
deploy staging
```

Do not validate only the source template.

Validate what the cluster will actually receive.

---

# 121. Infrastructure Changes

Infrastructure changes should be reviewed separately where appropriate.

Examples:

```text
network
database
Kubernetes
Ingress
DNS
IAM
secrets
monitoring
```

High-risk infrastructure changes should not bypass application CI/CD governance.

---

# 122. Infrastructure Drift

Where infrastructure is declarative, detect drift.

The desired state should be version-controlled.

Avoid undocumented manual production changes.

---

# 123. Production Configuration Drift

Monitor critical configuration.

If production differs unexpectedly from declared configuration:

```text
investigate
```

Do not automatically overwrite emergency changes without understanding why they exist.

---

# 124. CI/CD Disaster Recovery

The team should be able to deploy without one specific person's laptop.

Ensure:

```text
workflow definitions version-controlled
credentials recoverable
artifact registry available
deployment process documented
rollback documented
```

---

# 125. Registry Outage

If the image registry is unavailable:

```text
do not rebuild arbitrary images
```

Use existing deployed artifacts where possible.

Production should continue operating independently of CI availability.

---

# 126. CI Outage

If CI is unavailable:

```text
do not bypass all controls casually
```

Use an emergency deployment procedure with:

```text
manual verification
review
artifact traceability
post-incident documentation
```

---

# 127. Deployment Tool Outage

If deployment tooling fails:

```text
preserve current production
```

Do not make multiple manual changes without a clear recovery plan.

---

# 128. Artifact Retention

Keep enough previous production artifacts to support rollback.

At minimum, retain:

```text
current
previous known-good
recent releases
```

Retention should follow cost and compliance requirements.

---

# 129. Rollback Artifact Testing

Periodically verify that retained artifacts are actually deployable.

A stale artifact that cannot start due to unavailable dependencies is not a reliable rollback option.

---

# 130. Release Promotion

Use explicit release states:

```text
built
scanned
staged
verified
approved
production
rolled-back
```

This improves traceability.

---

# 131. Release Notes Automation

CI can generate release notes from:

```text
Git commits
PR labels
release metadata
```

Include manual notes for:

```text
migration
breaking changes
security
rollback
```

---

# 132. Changelog

Maintain a changelog if the project needs public release history.

Do not duplicate dozens of independent sources of truth.

---

# 133. Version Bumping

Use one consistent versioning strategy.

Possible:

```text
semantic-release
manual release
tag-driven release
```

Do not combine incompatible automated versioning systems.

---

# 134. Git Tags

Production releases should be associated with a Git tag or equivalent immutable revision.

Example:

```text
v1.4.0
```

---

# 135. Release Branches

Release branches are optional.

Prefer trunk-based development unless there is a real need for:

```text
parallel release stabilization
long-term support
```

---

# 136. Hotfixes

A production hotfix should:

```text
branch from production release/main
fix
test
deploy
merge back
```

Avoid leaving the hotfix absent from `main`.

---

# 137. Hotfix Validation

At minimum:

```text
targeted regression test
lint
typecheck
build
security check
smoke test
```

Do not skip validation simply because the change is urgent.

---

# 138. Security Hotfixes

For active security vulnerabilities:

```text
assess
contain
patch
test
deploy
rotate credentials if required
monitor
document
```

Do not wait for a normal release cycle if exposure is critical.

---

# 139. Roll Forward vs Roll Back

Sometimes rolling forward is safer than rollback.

Choose based on:

```text
database compatibility
data changes
security impact
blast radius
time to fix
availability
```

Do not automatically roll back every failure.

---

# 140. Deployment Decision Tree

```text
Deployment failure
       |
       v
Is production impacted?
       |
   +---+---+
   |       |
  No      Yes
   |       |
 investigate  Is rollback safe?
             |
          +--+--+
          |     |
         Yes    No
          |      |
       rollback  mitigate/fix
          |      |
          +--+---+
             |
             v
         verify recovery
```

---

# 141. Production Change Audit

Record:

```text
release
commit
artifact
migration
deployment time
operator/pipeline
environment
result
rollback if applicable
```

This is especially important for security-sensitive systems.

---

# 142. Deployment Notifications

Useful notifications:

```text
staging deployment succeeded
production deployment started
production deployment succeeded
production deployment failed
rollback executed
```

Include:

```text
version
environment
status
link to deployment
```

---

# 143. Avoid Notification Noise

Do not notify large groups about:

```text
every unit test
every lint run
every successful local action
```

Use notifications for meaningful events.

---

# 144. CI/CD Review Checklist

Before merging pipeline changes:

### Security

- [ ] no secret leakage
- [ ] permissions least privilege
- [ ] untrusted PRs isolated
- [ ] actions/dependencies trusted

### Reliability

- [ ] failures stop appropriately
- [ ] rollback path exists
- [ ] artifacts immutable
- [ ] deployment ordering correct

### Testing

- [ ] application tests included
- [ ] migration tests included where needed
- [ ] security checks included
- [ ] smoke tests included

### Operations

- [ ] logs useful
- [ ] notifications useful
- [ ] deployment observable
- [ ] ownership clear

---

# 145. Common CI/CD Anti-Patterns

## Anti-pattern: `npm test || true`

Never use this to make CI green.

---

## Anti-pattern: Skip Tests on Main

Production branches need stronger, not weaker, validation.

---

## Anti-pattern: Build Different Production Artifact

Do not rebuild after staging.

Promote the same artifact.

---

## Anti-pattern: Secrets in Workflow YAML

Never hardcode:

```text
JWT_SECRET
DATABASE_URL
AWS_SECRET_ACCESS_KEY
```

---

## Anti-pattern: Print Environment

Never:

```text
env
```

in a production deployment job.

---

## Anti-pattern: Deploy Directly From PR

Untrusted PR code should not receive production deployment credentials.

---

## Anti-pattern: Mutable `latest`

Do not use `latest` as the only release identifier.

---

## Anti-pattern: Ignore Migration Failures

If migration is required and fails:

```text
stop
```

---

## Anti-pattern: Giant Workflow

Break responsibilities into understandable jobs/workflows.

---

## Anti-pattern: Permanent Test Retries

Retries can hide flaky tests.

Fix the root cause.

---

## Anti-pattern: Manual Production Editing

Avoid modifying production containers/configuration manually as a normal workflow.

---

# 146. Recommended GitHub Actions Structure

If GitHub Actions is used, a reasonable structure is:

```text
.github/
└── workflows/
    ├── ci.yml
    ├── security.yml
    ├── release.yml
    ├── deploy-staging.yml
    ├── deploy-production.yml
    └── rollback.yml
```

This is a recommended structure, not a requirement.

---

# 147. Example CI Job Graph

```text
                    ┌──────────────┐
                    │ Checkout     │
                    └──────┬───────┘
                           |
                    ┌──────v───────┐
                    │ Install      │
                    └──────┬───────┘
                           |
          ┌────────────────┼────────────────┐
          v                v                v
      ┌───────┐       ┌──────────┐     ┌──────────┐
      │ Lint  │       │ Typecheck│     │ Security │
      └───┬───┘       └────┬─────┘     └────┬─────┘
          |                |                |
          └────────────────┼────────────────┘
                           v
                    ┌──────────────┐
                    │ Unit Tests   │
                    └──────┬───────┘
                           |
                    ┌──────v───────┐
                    │ Integration  │
                    └──────┬───────┘
                           |
                    ┌──────v───────┐
                    │ Build        │
                    └──────┬───────┘
                           |
                    ┌──────v───────┐
                    │ E2E / Release│
                    └──────────────┘
```

---

# 148. Example Release Graph

```text
main
 |
 v
CI
 |
 v
Build
 |
 v
Scan
 |
 v
Registry
 |
 v
Staging
 |
 v
Smoke/E2E
 |
 v
Approval
 |
 v
Production
 |
 v
Verify
 |
 +--> Success
 |
 +--> Rollback
```

---

# 149. CI Environment Protection

Use environment protections for production where supported.

Possible controls:

```text
required reviewers
branch restrictions
deployment approvals
secret scoping
concurrency control
```

---

# 150. Deployment Concurrency

Prevent multiple production deployments from running simultaneously.

Conceptually:

```text
Production deployment lock
```

If deployment B starts while A is running:

```text
queue or reject B
```

Do not allow races.

---

# 151. CI Concurrency

For PRs, cancel obsolete runs where safe.

Example:

```text
push commit A
   |
CI starts
   |
push commit B
   |
cancel old CI
   |
run latest CI
```

Do not cancel jobs that are still needed for release integrity.

---

# 152. Production Deployment Concurrency

Production deployments should generally not be canceled halfway through unless the deployment system guarantees safe cancellation.

Prefer:

```text
one controlled deployment
```

at a time.

---

# 153. Database Deployment Concurrency

Only one production migration process should run at a time.

Coordinate:

```text
migration job
+
application deployment
```

---

# 154. Artifact Promotion

Promotion should reference an existing artifact.

Example:

```text
registry/image@digest
```

or an immutable image tag.

This is safer than:

```text
rebuild source
```

---

# 155. Container Digest

For high assurance, deploy by immutable image digest.

Conceptually:

```text
image@sha256:<digest>
```

This guarantees the exact image content.

---

# 156. Artifact Provenance

Long-term production maturity may include:

```text
source revision
build system
builder identity
dependencies
artifact digest
```

This helps establish software supply-chain provenance.

---

# 157. Reproducible Builds

Aim for deterministic builds.

Factors include:

```text
lockfile
Node version
package manager version
Docker base image
build scripts
environment
```

---

# 158. Base Image Updates

Keep Docker base images updated.

Track:

```text
Node runtime security updates
OS package updates
```

Rebuild images when important security patches are released.

---

# 159. Dependency Update Automation

Dependabot/Renovate-style automation may be introduced.

Use controlled grouping to avoid overwhelming the repository with hundreds of simultaneous PRs.

---

# 160. Dependency Update Policy

Classify:

```text
security
patch
minor
major
```

Major upgrades should receive additional testing.

---

# 161. Fastify Upgrade

Fastify upgrades should test:

```text
plugins
hooks
routes
validation
error handling
logging
security middleware
```

Do not upgrade the framework blindly.

---

# 162. Prisma Upgrade

Prisma upgrades should test:

```text
schema generation
migrations
queries
transactions
integration tests
production migration behavior
```

---

# 163. Node.js Upgrade

Node upgrades should validate:

```text
API
Admin build
Docker image
native dependencies
crypto/authentication
performance
```

---

# 164. Security Middleware Upgrade

Changes to:

```text
Helmet
CORS
JWT
rate limiting
```

should include focused security regression tests.

---

# 165. Release Checklist

Before release:

```text
- [ ] PR approved
- [ ] CI green
- [ ] security checks green
- [ ] migration reviewed
- [ ] release notes prepared
- [ ] artifact built
- [ ] artifact scanned
- [ ] staging deployed
- [ ] staging smoke tests pass
- [ ] production approval obtained
```

---

# 166. Production Release Checklist

```text
- [ ] correct artifact selected
- [ ] correct environment selected
- [ ] migration compatibility verified
- [ ] backup verified
- [ ] deployment lock acquired
- [ ] production secrets available
- [ ] deployment started
- [ ] readiness healthy
- [ ] smoke tests pass
- [ ] telemetry healthy
- [ ] release marked successful
```

---

# 167. Post-Release Checklist

```text
- [ ] 5xx normal
- [ ] latency normal
- [ ] authentication normal
- [ ] database normal
- [ ] workers normal
- [ ] queue depth normal
- [ ] logs flowing
- [ ] metrics flowing
- [ ] alerts normal
- [ ] Admin critical flows verified
```

---

# 168. Rollback Checklist

```text
- [ ] incident confirmed
- [ ] rollout stopped
- [ ] previous artifact identified
- [ ] database compatibility checked
- [ ] rollback executed
- [ ] readiness verified
- [ ] smoke tests pass
- [ ] metrics recovered
- [ ] incident documented
```

---

# 169. Definition of Done — CI

CI is complete when:

- [ ] lint runs
- [ ] formatting is validated
- [ ] typecheck runs
- [ ] unit tests run
- [ ] integration tests run
- [ ] contract tests run
- [ ] security scanning exists
- [ ] dependency scanning exists
- [ ] build is verified
- [ ] test database is isolated
- [ ] failures block merge appropriately
- [ ] reports are available

---

# 170. Definition of Done — CD

CD is complete when:

- [ ] immutable artifacts are built
- [ ] artifacts are scanned
- [ ] registry is protected
- [ ] staging deployment is automated
- [ ] staging smoke tests exist
- [ ] production approval exists where required
- [ ] production deployment is automated
- [ ] deployment is observable
- [ ] rollback is documented
- [ ] previous artifacts are retained
- [ ] database migrations are controlled
- [ ] deployment concurrency is controlled

---

# 171. Definition of Done — Production Pipeline

The production pipeline is complete when:

- [ ] source revision is traceable
- [ ] artifact digest is traceable
- [ ] migration is traceable
- [ ] deployment identity is traceable
- [ ] secrets are externally managed
- [ ] deployment is repeatable
- [ ] health checks are verified
- [ ] smoke tests run
- [ ] observability is verified
- [ ] rollback is tested
- [ ] security controls are active
- [ ] incident recovery is documented

---

# 172. Recommended Implementation Phases

## Phase 1 — Basic CI

Implement:

```text
lint
typecheck
unit tests
build
```

---

## Phase 2 — Integration

Add:

```text
PostgreSQL
Prisma migrations
integration tests
API contract tests
```

---

## Phase 3 — Security

Add:

```text
secret scanning
dependency scanning
SAST
container scanning
```

---

## Phase 4 — Release

Add:

```text
immutable Docker image
registry
release tags
staging deployment
smoke tests
```

---

## Phase 5 — Production

Add:

```text
production approval
controlled deployment
observability
rollback
backup verification
```

---

## Phase 6 — Advanced

Add only when justified:

```text
canary deployment
automated rollback
artifact signing
SBOM
provenance
advanced SLO gates
```

---

# 173. Recommended Initial Pipeline

For the current Fastify-MasterApp stage, start with:

```text
Pull Request
   |
   +--> lint
   +--> typecheck
   +--> unit tests
   +--> integration tests
   +--> build
   +--> dependency/security checks
   |
   v
Merge main
   |
   v
Docker build
   |
   v
Image scan
   |
   v
Push registry
   |
   v
Deploy staging
   |
   v
Migration
   |
   v
Smoke tests
   |
   v
Manual production approval
   |
   v
Deploy production
   |
   v
Verify
```

This is enough for a strong first production pipeline.

---

# 174. What Not to Automate First

Avoid starting with:

```text
multi-region deployment
complex progressive delivery
automatic database rollback
fully automatic production rollback
dozens of microservices
massive browser matrix
custom deployment platform
```

First make:

```text
CI reliable
artifact immutable
staging reliable
production deployment repeatable
rollback reliable
observability reliable
```

---

# 175. CI/CD and Architecture

The deployment model should reinforce the application architecture:

```text
apps/api
    |
    +--> one deployable API

apps/admin
    |
    +--> one static deployable application

packages/api-contracts
    |
    +--> shared build dependency

Prisma
    |
    +--> controlled migration

workers
    |
    +--> separate deployable only when needed
```

This preserves the modular-monolith strategy.

---

# 176. CI/CD and Monorepo Boundaries

The monorepo should make dependencies explicit.

Avoid hidden dependencies such as:

```text
Admin importing API source files
API importing Admin source files
```

Shared code should live in:

```text
packages/
```

This makes CI impact analysis clearer.

---

# 177. CI/CD and Shared Contracts

When `api-contracts` changes:

```text
contract
   |
   +--> API compile/test
   |
   +--> Admin compile/test
   |
   +--> contract tests
```

A contract change should not be treated as an isolated package change.

---

# 178. CI/CD and Database

Database changes should be first-class release inputs.

A release can be modeled as:

```text
Application artifact
+
Database migration
+
Configuration
```

All three must be compatible.

---

# 179. CI/CD and Authentication

Authentication releases require additional verification:

```text
login
refresh
logout
session revocation
JWT validation
CORS
cookies if used
```

A successful API health check does not prove authentication works.

---

# 180. CI/CD and RBAC

RBAC changes require:

```text
authorized user
unauthorized user
resource ownership
admin action
default deny
```

tests.

Permission regressions can otherwise reach production unnoticed.

---

# 181. CI/CD and Error Handling

Error-handling changes should verify:

```text
400
401
403
404
409
429
500
dependency failures
```

and confirm no internal details leak.

---

# 182. CI/CD and Observability

Observability changes should verify:

```text
logs
metrics
request IDs
health
readiness
trace integration if enabled
```

A deployment should not silently remove operational visibility.

---

# 183. CI/CD and Admin

Admin releases should verify:

```text
build
API compatibility
authentication
RBAC
critical routes
forms
error handling
```

Static build success is not enough.

---

# 184. Production Governance

Production changes should have:

```text
ownership
review
traceability
rollback
observability
```

This is especially important as the project grows.

---

# 185. CI/CD Security Golden Rules

```text
1. Never expose production secrets to untrusted PRs.

2. Never print secrets in CI logs.

3. Never deploy mutable artifacts.

4. Never use developer credentials for automated production deployment.

5. Never skip security checks because they are inconvenient.

6. Treat workflow files as production code.

7. Keep CI permissions least-privileged.

8. Keep production credentials environment-scoped.

9. Rotate compromised credentials immediately.

10. Scan dependencies and production images.

11. Preserve artifact provenance.

12. Keep rollback artifacts available.
```

---

# 186. CI/CD Reliability Golden Rules

```text
1. Keep main green.

2. Fail fast on important checks.

3. Do not hide failures with `|| true`.

4. Fix flaky tests.

5. Build once and promote.

6. Deploy one production release at a time.

7. Test migrations before production.

8. Use meaningful health checks.

9. Observe every deployment.

10. Keep rollback simple.

11. Do not rebuild during rollback.

12. Verify recovery after rollback.
```

---

# 187. Final Pipeline Architecture

The target CI/CD architecture is:

```text
                         ┌─────────────────┐
                         │ Developer       │
                         └────────┬────────┘
                                  |
                                  v
                         ┌─────────────────┐
                         │ Pull Request    │
                         └────────┬────────┘
                                  |
                    ┌─────────────┼─────────────┐
                    v             v             v
                 ┌──────┐    ┌────────┐    ┌──────────┐
                 │ Lint │    │ Tests  │    │ Security │
                 └───┬──┘    └────┬───┘    └────┬─────┘
                     └────────────┼─────────────┘
                                  v
                         ┌─────────────────┐
                         │ Typecheck/Build │
                         └────────┬────────┘
                                  |
                                  v
                         ┌─────────────────┐
                         │ Merge to Main   │
                         └────────┬────────┘
                                  |
                                  v
                         ┌─────────────────┐
                         │ Immutable Image │
                         └────────┬────────┘
                                  |
                                  v
                         ┌─────────────────┐
                         │ Image Scan      │
                         └────────┬────────┘
                                  |
                                  v
                         ┌─────────────────┐
                         │ Registry        │
                         └────────┬────────┘
                                  |
                                  v
                         ┌─────────────────┐
                         │ Staging         │
                         │ Migration       │
                         │ Smoke/E2E       │
                         └────────┬────────┘
                                  |
                                  v
                         ┌─────────────────┐
                         │ Approval        │
                         └────────┬────────┘
                                  |
                                  v
                         ┌─────────────────┐
                         │ Production      │
                         │ Migration       │
                         │ Deployment      │
                         └────────┬────────┘
                                  |
                    ┌─────────────┼─────────────┐
                    v             v             v
               ┌────────┐   ┌──────────┐   ┌─────────┐
               │ Health │   │ Smoke    │   │ Metrics │
               │ Ready  │   │ Tests    │   │ /Logs   │
               └────────┘   └──────────┘   └─────────┘
                                  |
                                  v
                         ┌─────────────────┐
                         │ Release Success│
                         │ or Rollback    │
                         └─────────────────┘
```

---

# 188. Final CI/CD Principle

> **Fastify-MasterApp should treat CI/CD as a safety system: every change is validated, every release is traceable, every artifact is immutable, every deployment is observable, and every production release has a tested recovery path.**

The pipeline should remain intentionally simple until scale or reliability requirements justify additional automation.

The desired progression is:

```text
Reliable CI
    |
    v
Immutable Releases
    |
    v
Reliable Staging
    |
    v
Controlled Production
    |
    v
Observable Deployments
    |
    v
Tested Rollback
    |
    v
Progressive Delivery
```

Do not optimize for the most sophisticated pipeline.

Optimize for:

```text
confidence
speed
security
repeatability
recoverability
```
