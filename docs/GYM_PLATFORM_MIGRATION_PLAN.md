# GYM PLATFORM API — Cleanup & Migration Plan

**Repository:** `gym-platform-api`  
**Source Repository:** `super-admin-platform`  
**Purpose:** Transform the copied Super Admin platform backend into the centralized backend API for the Gym SaaS Platform.

---

## 1. Purpose

The `gym-platform-api` repository was initially created by copying the existing `super-admin-platform` repository.

The existing repository contains both:

- Super Admin frontend
- Platform backend/API
- Authentication
- Database
- API contracts
- Infrastructure
- Tests
- Monitoring
- Development/demo functionality

The objective of this migration is to convert the repository into a **pure centralized backend API** for the complete Gym SaaS Platform.

The Super Admin frontend will live separately in:

```text
gym-platform-super-admin
```

The Tenant Web application will live separately in:

```text
gym-platform-tenant-web
```

All applications will communicate with the centralized:

```text
gym-platform-api
```

---

# 2. Target Architecture

```text
                         GYM PLATFORM
                              |
                              v
                    +---------------------+
                    | gym-platform-api    |
                    |                     |
                    | Fastify             |
                    | Prisma              |
                    | PostgreSQL          |
                    | Redis               |
                    +----------+----------+
                               |
          +--------------------+--------------------+
          |                    |                    |
          v                    v                    v
+-------------------+  +-------------------+  +-------------------+
| Super Admin       |  | Tenant Web        |  | Native Mobile     |
|                   |  |                   |  |                   |
| gym-platform-     |  | gym-platform-     |  | Member / Staff    |
| super-admin       |  | tenant-web        |  | iOS / Android     |
+-------------------+  +-------------------+  +-------------------+
```

The API is the central business and security layer.

---

# 3. Repository Responsibilities

## 3.1 gym-platform-api

Responsible for:

- Authentication
- Authorization
- Multi-tenancy
- RBAC
- Users
- Members
- Trainers
- Exercises
- Workouts
- Workout plans
- Workout sessions
- Attendance
- Memberships
- Payments
- Notifications
- Devices
- Branding
- Feature flags
- File management
- Reports
- Background jobs
- Platform administration
- Mobile application configuration
- Mobile build/release management
- Audit logging

---

## 3.2 gym-platform-super-admin

Responsible for:

- Super Admin UI
- Platform dashboard
- Tenant management UI
- Subscription management UI
- Platform configuration UI
- Mobile application management UI
- Build/release UI
- Platform audit UI

It must consume the central API.

---

## 3.3 gym-platform-tenant-web

Responsible for:

- Tenant dashboard
- Member management
- Trainer management
- Workout management
- Attendance
- Memberships
- Payments
- Reports
- Tenant settings
- Tenant branding
- Tenant RBAC management

It must consume the central API.

---

# 4. Migration Principles

Follow these principles during cleanup.

### 4.1 Do not blindly delete code

Every existing module must first be classified as:

```text
KEEP
ADAPT
REMOVE
```

### 4.2 Do not blindly rename domains

For example:

```text
orders -> memberships
todos -> workouts
```

should not be done automatically.

The domain model must be reviewed before migration.

### 4.3 Backend owns business logic

Business rules must live in:

```text
gym-platform-api
```

not separately in:

```text
tenant-web
super-admin
member-ios
member-android
staff-ios
staff-android
```

### 4.4 Clients are untrusted

The backend must always enforce:

- Authentication
- Tenant isolation
- Permissions
- Resource ownership
- Feature access

---

# 5. Phase 1 — Freeze Current Repository

Before making destructive changes, create a migration branch.

```bash
git checkout -b refactor/gym-platform-api
```

Create a recovery tag:

```bash
git tag pre-gym-api-cleanup
git push origin pre-gym-api-cleanup
```

Run the existing project:

```bash
pnpm install
pnpm build
pnpm test
```

Record:

- Build status
- Test status
- Typecheck status
- Lint status
- Database migration status
- Seed status

This establishes the baseline.

---

# 6. Phase 2 — Remove Super Admin Frontend

The Super Admin frontend must be separated from the API repository.

Remove or migrate:

```text
apps/super-admin/
```

Target:

```text
gym-platform-super-admin/
```

After migration, the API repository should contain:

```text
apps/
└── platform-api/
```

The API repository should not build or deploy the Super Admin frontend.

---

# 7. Phase 3 — Frontend Dependency Cleanup

After removing the frontend, audit dependencies.

Look for frontend-only dependencies such as:

- React
- React DOM
- Vite
- React Router
- Frontend component libraries
- Frontend state libraries
- Browser-only packages
- Frontend testing tools

Before removing a dependency:

```text
Search imports
       |
       v
Check API usage
       |
       v
Check tests
       |
       v
Check scripts
       |
       v
Remove
```

Do not remove dependencies solely based on their package names.

---

# 8. Phase 4 — Audit Existing API Modules

Every existing backend module must be reviewed.

Classify modules as follows.

## KEEP

Infrastructure required by the Gym Platform.

Examples:

```text
auth
users
health
metrics
logging
database
configuration
errors
request context
rate limiting
Swagger/OpenAPI
```

## ADAPT

Functionality that can support the Gym Platform after redesign.

Examples:

```text
users
orders
notifications
roles
permissions
files
audit
```

These should be reviewed and adapted rather than simply renamed.

## REMOVE

Functionality that has no purpose in the Gym Platform.

Examples:

```text
todos
demo modules
example modules
sample routes
tutorial endpoints
unused integrations
temporary development modules
```

---

# 9. Phase 5 — Remove Demo and Example Functionality

Search the entire repository for:

```text
demo
example
sample
todo
fake
mock
fixture
placeholder
test@example.com
password123
```

Review:

```text
apps/platform-api/
prisma/
scripts/
tests/
docs/
README.md
```

Remove demo functionality that is not required by the Gym Platform.

---

# 10. Demo Credentials

The existing Super Admin platform may contain development/demo credentials.

These must not remain in the production-oriented system.

Never commit credentials such as:

```text
email: demo@example.com
password: password123
```

Development seed credentials must be:

- Clearly development-only
- Documented
- Environment-controlled
- Never production credentials

---

# 11. Phase 6 — Prisma Schema Audit

Do not automatically retain the existing database schema.

Review every model.

Classify each model:

```text
KEEP
MODIFY
REPLACE
REMOVE
```

The new schema should support the Gym SaaS domain.

---

# 12. Core Platform Models

Initial platform models should include:

```text
User
Tenant
TenantMembership

Role
Permission
RolePermission

AuthSession
RefreshToken
PasskeyCredential

AuditLog
```

---

# 13. Gym Domain Models

The Gym domain should include models for:

```text
Member
Trainer

Exercise
Workout
WorkoutPlan
WorkoutSession

Attendance

Membership
Payment

Notification
Device
```

---

# 14. White-Label and Platform Models

The platform should eventually support:

```text
TenantBranding
FeatureFlag

TenantApplication
MobileAppBuild
MobileAppRelease
```

These support the white-label mobile architecture.

---

# 15. Phase 7 — Multi-Tenant Foundation

Multi-tenancy must be established before implementing large amounts of Gym functionality.

Tenant-owned records should generally contain:

```text
tenantId
```

Conceptually:

```text
Tenant
 |
 +-- TenantMembership
 +-- Member
 +-- Trainer
 +-- Workout
 +-- Attendance
 +-- Membership
 +-- Payment
 +-- Notification
 +-- Branding
```

Every tenant-owned query must be tenant-scoped.

---

# 16. Tenant Isolation Rule

Never trust tenant information supplied by the client.

For example:

```http
X-Tenant-ID: tenant_123
```

is only a client hint.

The server must:

```text
Authenticate user
       |
       v
Resolve requested tenant
       |
       v
Verify TenantMembership
       |
       v
Resolve active tenant
       |
       v
Authorize permission
       |
       v
Execute tenant-scoped query
```

---

# 17. Phase 8 — Authentication

Central authentication must live inside:

```text
gym-platform-api
```

Support:

```text
Registration
Login
Logout
Logout all
Access tokens
Refresh tokens
Token rotation
Sessions
Email verification
Phone verification
OTP
Forgot password
Reset password
Change password
Passkeys
Tenant selection
```

All applications consume the same authentication system.

---

# 18. Phase 9 — Authorization and RBAC

Authorization must be centralized.

Tenant roles:

```text
OWNER
ADMIN
TRAINER
MEMBER
```

Platform roles:

```text
SUPER_ADMIN
PLATFORM_SUPPORT
PLATFORM_OPERATOR
```

Authorization must be permission-based.

Example:

```text
members.read
members.create
members.update
members.delete

payments.read
payments.create
payments.refund

workouts.read
workouts.create
workouts.update
```

Do not use scattered checks such as:

```typescript
user.role === "ADMIN";
```

Use centralized authorization services.

---

# 19. Authorization Pipeline

Every protected request should follow:

```text
Request
  |
  v
Request ID
  |
  v
Rate Limit
  |
  v
Authentication
  |
  v
Session Validation
  |
  v
Tenant Context
  |
  v
Permission Check
  |
  v
Resource Policy
  |
  v
Validation
  |
  v
Controller
  |
  v
Service
  |
  v
Repository
  |
  v
Database
```

---

# 20. Phase 10 — API Structure

Recommended API structure:

```text
apps/platform-api/src/
|
+-- app/
|
+-- config/
|
+-- plugins/
|
+-- common/
|   +-- errors/
|   +-- logging/
|   +-- pagination/
|   +-- validation/
|   +-- request-context/
|
+-- infrastructure/
|   +-- database/
|   +-- redis/
|   +-- storage/
|   +-- email/
|   +-- notifications/
|
+-- modules/
    +-- auth/
    +-- authorization/
    +-- users/
    +-- tenants/
    +-- members/
    +-- trainers/
    +-- exercises/
    +-- workouts/
    +-- workout-plans/
    +-- workout-sessions/
    +-- attendance/
    +-- memberships/
    +-- payments/
    +-- notifications/
    +-- devices/
    +-- branding/
    +-- features/
    +-- files/
    +-- reports/
    +-- jobs/
    +-- platform/
```

---

# 21. Phase 11 — API Namespaces

Use a single API version:

```text
/api/v1
```

Authentication:

```text
/api/v1/auth/*
```

Mobile:

```text
/api/v1/mobile/*
```

Public APIs:

```text
/api/v1/public/*
```

Platform APIs:

```text
/api/v1/platform/*
```

Tenant APIs:

```text
/api/v1/tenants/*
```

Gym domain:

```text
/api/v1/members/*
/api/v1/trainers/*
/api/v1/exercises/*
/api/v1/workouts/*
/api/v1/workout-plans/*
/api/v1/workout-sessions/*
/api/v1/attendance/*
/api/v1/memberships/*
/api/v1/payments/*
```

Additional:

```text
/api/v1/notifications/*
/api/v1/devices/*
/api/v1/files/*
/api/v1/reports/*
/api/v1/jobs/*
```

---

# 22. Phase 12 — API Contracts

Keep:

```text
packages/api-contracts/
```

This package should contain:

- Request schemas
- Response schemas
- Error schemas
- Pagination contracts
- Authentication contracts
- Tenant contracts
- Member contracts
- Workout contracts
- Platform contracts

Business logic must not live inside `api-contracts`.

Architecture:

```text
              api-contracts
              /           \
             /             \
            v               v
    platform-api       Applications
```

---

# 23. Standard API Response

Success:

```json
{
  "success": true,
  "data": {},
  "requestId": "req_123"
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "MEMBER_NOT_FOUND",
    "message": "Member could not be found."
  },
  "requestId": "req_123"
}
```

---

# 24. Phase 13 — Infrastructure Cleanup

Keep infrastructure required by the central API:

```text
PostgreSQL
Redis
Object Storage
Docker
Kubernetes
Prometheus
Health Checks
Logging
```

Remove infrastructure that exists exclusively for the Super Admin frontend.

Examples:

```text
Super Admin Dockerfile
Super Admin nginx configuration
Frontend deployment
Frontend build scripts
Frontend-only monitoring
```

Only remove after confirming they are not used by the API.

---

# 25. Phase 14 — CI/CD Cleanup

The API CI/CD pipeline should be:

```text
Pull Request
    |
    v
Install Dependencies
    |
    v
Lint
    |
    v
Typecheck
    |
    v
Unit Tests
    |
    v
Integration Tests
    |
    v
Security Scan
    |
    v
Build
    |
    v
Docker Image
    |
    v
Deploy
```

The API pipeline must not build the Super Admin frontend.

---

# 26. Phase 15 — Environment Cleanup

Maintain:

```text
.env.example
.env.test
.env.development
```

Production secrets must be supplied through a secret-management system.

Never commit:

```text
JWT secrets
Database passwords
AWS credentials
API keys
Payment secrets
SMTP passwords
OAuth secrets
Mobile signing credentials
```

---

# 27. Phase 16 — Testing

After cleanup, establish tests for:

## Authentication

```text
Login
Logout
Refresh
Password reset
OTP
Passkeys
Session revocation
```

## Tenant Isolation

```text
Tenant A cannot access Tenant B
Tenant switching
Invalid tenant
Missing tenant
```

## RBAC

```text
OWNER
ADMIN
TRAINER
MEMBER
```

## Resource Authorization

```text
Trainer -> assigned members
Member -> own data
Admin -> tenant data
Owner -> tenant administration
```

---

# 28. Mandatory Security Tests

At minimum:

```text
Cross-tenant member access
Cross-tenant workout access
Cross-tenant payment access
Cross-tenant attendance access

Invalid tenant membership
Invalid permission
Expired session
Revoked session
Refresh token reuse
Unauthorized resource access
```

Every discovered authorization bug must become a regression test.

---

# 29. Phase 17 — Documentation Cleanup

The API repository should contain documentation focused on the centralized platform backend.

Recommended:

```text
docs/
|
+-- ARCHITECTURE.md
+-- API.md
+-- AUTHENTICATION_IMPLEMENTATION.md
+-- MULTI_TENANT_ARCHITECTURE.md
+-- TENANT_DATA_MODEL.md
+-- RBAC.md
+-- TENANT_BRANDING.md
+-- MOBILE_ARCHITECTURE.md
+-- MOBILE_RELEASES.md
+-- SECURITY.md
```

The README should describe:

- What the API is
- Local setup
- Environment configuration
- Database setup
- Migration commands
- Testing
- API documentation
- Architecture
- Deployment

---

# 30. Recommended Git Commit Strategy

Do not make one huge cleanup commit.

Use logical commits.

Example:

```text
chore: create gym api cleanup branch

refactor: remove super admin frontend from api

chore: remove unused frontend dependencies

refactor: remove demo modules

refactor: clean demo seed data

refactor: redesign platform prisma schema

feat: implement centralized authentication

feat: implement tenant context

feat: implement tenant isolation

feat: implement rbac authorization

refactor: restructure api modules

refactor: clean api contracts

chore: clean docker infrastructure

chore: clean ci pipeline

test: add tenant isolation tests

test: add authorization regression tests

docs: update gym platform api documentation
```

---

# 31. Definition of Done

The migration is considered complete when:

### Repository

- [ ] Super Admin frontend removed
- [ ] Frontend dependencies removed
- [ ] Demo modules removed
- [ ] Example modules removed
- [ ] Unused scripts removed
- [ ] Unused infrastructure removed

### Backend

- [ ] Fastify API starts successfully
- [ ] PostgreSQL connection works
- [ ] Redis connection works
- [ ] Prisma migrations work
- [ ] API contracts work
- [ ] Swagger works
- [ ] Health checks work
- [ ] Metrics work
- [ ] Logging works

### Authentication

- [ ] Registration
- [ ] Login
- [ ] Logout
- [ ] Refresh
- [ ] Sessions
- [ ] OTP
- [ ] Password reset
- [ ] Passkeys
- [ ] Email/phone verification

### Multi-Tenancy

- [ ] Tenant model
- [ ] Tenant membership
- [ ] Active tenant
- [ ] Tenant isolation
- [ ] Cross-tenant tests

### RBAC

- [ ] Roles
- [ ] Permissions
- [ ] Permission checks
- [ ] Resource policies
- [ ] Platform authorization
- [ ] Tenant authorization

### Security

- [ ] Secrets removed
- [ ] Demo credentials removed
- [ ] Rate limiting
- [ ] Input validation
- [ ] Secure errors
- [ ] Audit logging
- [ ] Security tests

---

# 32. Final Repository Structure

The final API repository should approximately look like:

```text
gym-platform-api/
|
+-- apps/
|   |
|   +-- platform-api/
|       |
|       +-- src/
|           +-- app/
|           +-- config/
|           +-- plugins/
|           +-- common/
|           +-- infrastructure/
|           +-- modules/
|
+-- packages/
|   |
|   +-- api-contracts/
|
+-- prisma/
|   +-- schema.prisma
|   +-- migrations/
|   +-- seed/
|
+-- infrastructure/
|   +-- docker/
|   +-- k8s/
|   +-- monitoring/
|
+-- scripts/
|
+-- tests/
|
+-- docs/
|
+-- package.json
+-- pnpm-workspace.yaml
+-- README.md
```

---

# 33. Final Platform Structure

The complete Gym Platform should eventually be:

```text
gym-platform-api
        |
        +------------------------------+
        |              |               |
        v              v               v
super-admin       tenant-web       public website
        |
        +------------------------------+
                       |
                       v
                 Native Mobile
                       |
              +--------+--------+
              |                 |
              v                 v
          Member Apps       Staff Apps
          iOS/Android       iOS/Android
```

All applications consume the same centralized API.

---

# 34. Core Architectural Rule

The most important rule for this migration is:

> **`gym-platform-api` is the single source of truth for authentication, authorization, tenant isolation, business rules, and data access.**

Applications are clients.

They must not independently implement critical business rules or bypass the centralized authorization model.

The final architecture is:

```text
                    Applications
                         |
                         v
                gym-platform-api
                         |
          +--------------+--------------+
          |              |              |
          v              v              v
       Auth/RBAC     Domain Logic    Platform
          |              |              |
          +--------------+--------------+
                         |
                         v
                    PostgreSQL
                         +
                       Redis
                         +
                  Object Storage
```

This architecture provides the foundation required for a secure, multi-tenant, white-label Gym SaaS platform.
