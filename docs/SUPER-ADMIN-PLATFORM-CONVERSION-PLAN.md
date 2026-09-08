# SUPER-ADMIN-PLATFORM-CONVERSION-PLAN

## 1. Purpose

This is the master implementation plan for converting the copied `Fastify-MasterApp` repository into a completely separate **Super Admin Platform**.

The copied repository is a starting codebase only. It must be transformed into a platform-control-plane application and must not remain a second copy of the logistics application.

## 2. Target Architecture

The final ecosystem consists of two independently deployable systems.

### Logistics Platform

```text
logistics-platform/
├── api/                 # Tenant / logistics backend
├── admin/               # Tenant admin frontend
├── prisma/
├── packages/
└── docs/
```

### Super Admin Platform

```text
super-admin-platform/
├── platform-api/       # Platform backend
├── super-admin/        # Platform frontend
├── prisma/             # Platform database
├── packages/
└── docs/
```

The two systems have separate repositories, backend/frontend applications, PostgreSQL databases, secrets, deployment pipelines, migrations, and release cycles.

They may share engineering conventions and intentionally shared API contracts, but must never share direct database access.

## 3. Core Principle

The Super Admin Platform is the **control plane**.

The Logistics Platform is the **tenant/business plane**.

```text
super-admin
    ↓
platform-api
    ↓
Platform DB
    │
    │ controlled API boundary
    ▼
Logistics API
    ↓
Logistics DB
```

The Platform backend must never directly query the Logistics database.

The Super Admin frontend must never access either database.

## 4. Non-Negotiable Rules

1. Inspect the copied repository before modifying it.
2. Preserve useful infrastructure patterns from the source project.
3. Do not blindly preserve logistics business logic.
4. Do not rebuild the existing logistics platform.
5. Do not modify the original Logistics Platform repository.
6. Do not access the Logistics DB from `platform-api`.
7. Do not create cross-database foreign keys.
8. Do not introduce implicit Prisma tenant filtering.
9. Never expose tenant secret keys to browser code.
10. Do not hardcode authorization around a role name such as `SUPER_ADMIN`.
11. Platform authorization requires authenticated platform membership plus the required platform permission.
12. Platform and tenant RBAC are separate bounded contexts.
13. Never run destructive or production migrations automatically.
14. Do not execute `prisma migrate deploy`, `prisma migrate dev`, reset, seed, or destructive database commands without explicit approval.
15. Do not invent missing Settings/Branding persistence merely to satisfy a screen.
16. Every platform endpoint must have explicit authentication and authorization requirements.
17. Security-sensitive features must include appropriate tests.
18. Remove unused logistics modules instead of leaving dead code throughout the project.
19. Keep platform code independently deployable from the Logistics Platform.
20. Prefer small, reversible phases with validation after each phase.

## 5. Phase 0 — Repository Discovery

Before changing code, inventory:

```text
package.json
workspace configuration
apps/
packages/
prisma/
docs/
Docker
CI/CD
environment configuration
Fastify bootstrap
plugins
routes
services
repositories
authentication
authorization/RBAC
API contracts
database schema
seed scripts
tests
admin frontend
routing
stores
API client
query client
```

Classify components as:

```text
KEEP
REUSE PATTERN
ADAPT
REWRITE
REMOVE
PLATFORM-ONLY
LOGISTICS-ONLY
```

Create:

```text
docs/CONVERSION-INVENTORY.md
```

The inventory must identify current entry points, Prisma models, authentication, RBAC, API structure, contracts, frontend routes, reusable packages, logistics-only modules, and removable dependencies.

### Gate

Do not begin schema/database work until discovery is complete.

## 6. Phase 1 — Repository Identity

Convert the copied repository identity to:

```text
super-admin-platform
platform-api
super-admin
platform-db
```

Review:

```text
package.json
package names
README
application titles
Docker/service names
environment prefixes
Vite metadata
HTML title
logging service names
OpenAPI metadata
```

Do not alter useful technical naming merely for cosmetic consistency.

### Gate

No runtime package, service, or documentation should falsely describe this repository as the Logistics Platform.

## 7. Phase 2 — Target Structure

Transform the copied structure toward:

```text
super-admin-platform/
├── platform-api/
│   ├── src/
│   │   ├── app/
│   │   ├── config/
│   │   ├── plugins/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── roles/
│   │   │   ├── permissions/
│   │   │   ├── tenants/
│   │   │   ├── credentials/
│   │   │   ├── audit/
│   │   │   └── dashboard/
│   │   └── server.ts
│   └── package.json
├── super-admin/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── routes/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── tenants/
│   │   │   ├── users/
│   │   │   ├── roles/
│   │   │   ├── permissions/
│   │   │   └── audit/
│   │   └── ...
│   └── package.json
├── packages/
├── prisma/
└── docs/
```

Adapt names to existing conventions where appropriate, but keep the platform/tenant boundaries explicit.

## 8. Phase 3 — Platform Database

Create a completely independent PostgreSQL database, for example:

```text
platform_db
```

The Platform Prisma schema is owned by `platform-api`.

Initial platform-domain models:

```text
User
PlatformMembership
PlatformRole
PlatformPermission
PlatformRolePermission
Tenant
TenantApiCredential
PlatformAuditLog
```

Only add models when a concrete platform requirement requires them.

The Platform DB owns tenant lifecycle metadata, not logistics data.

Do not copy:

```text
Shipment
Order
Driver
Vehicle
Warehouse
Route
```

into the Platform DB.

### Cross-database rule

Never create database foreign keys from Platform DB to Logistics DB or vice versa.

Use stable IDs and API contracts.

## 9. Phase 4 — Platform Authentication

Implement a platform-specific authentication boundary.

Support, as applicable to the existing authentication architecture:

```text
login
logout
refresh
forgot password
reset password
OTP validation
session/token lifecycle
account status validation
```

Technical security patterns may be adapted from the copied application, but platform authorization remains independent.

Flow:

```text
Credentials
    ↓
Platform API
    ↓
Platform User
    ↓
Platform Membership
    ↓
Platform Role
    ↓
Platform Permissions
```

A tenant-only user must not gain platform access simply because a role is named `SUPER_ADMIN`.

## 10. Phase 5 — Platform RBAC

Implement permission-based platform RBAC.

Suggested namespace:

```text
platform.dashboard.read

platform.tenants.read
platform.tenants.create
platform.tenants.update
platform.tenants.suspend
platform.tenants.activate
platform.tenants.archive

platform.credentials.read
platform.credentials.create
platform.credentials.rotate
platform.credentials.revoke

platform.users.read
platform.users.create
platform.users.update
platform.users.disable

platform.roles.read
platform.roles.manage

platform.permissions.read

platform.audit.read
```

Exact permissions must follow actual requirements.

Do not use:

```ts
if (user.role === "SUPER_ADMIN") { ... }
```

as the authorization mechanism.

Use explicit guards such as:

```text
requirePlatform()
requirePlatformPermission("platform.tenants.read")
```

or the equivalent established implementation.

## 11. Phase 6 — Platform API

All platform routes use:

```text
/api/v1/platform/*
```

Suggested modules:

```text
/api/v1/platform/dashboard

/api/v1/platform/tenants
/api/v1/platform/tenants/:tenantId

/api/v1/platform/tenants/:tenantId/credentials

/api/v1/platform/users

/api/v1/platform/roles
/api/v1/platform/permissions

/api/v1/platform/audit
```

Endpoint flow:

```text
Authentication
      ↓
Platform Membership
      ↓
Platform Permission
      ↓
Handler
      ↓
Platform DB
```

Platform routes must not silently fall back to tenant context.

## 12. Phase 7 — Tenant Lifecycle

The Platform API owns tenant lifecycle:

```text
Create
List
Get
Update
Suspend
Reactivate
Archive
```

Tenant status must be explicit and validated.

Suspended/archived tenants must not be treated as active.

## 13. Phase 8 — Tenant Provisioning

Provisioning should be an explicit workflow:

```text
Create Tenant
      ↓
Create tenant administrative identity/membership
      ↓
Initialize tenant-side resources through Logistics API
      ↓
Create default tenant roles where owned by Logistics Platform
      ↓
Finalize provisioning
      ↓
Write platform audit event
```

If the Logistics Platform already supports invitations, prefer invitation over creating an unnecessary permanent tenant-admin password.

Do not invent Settings/Branding persistence until its actual model exists.

## 14. Phase 9 — Tenant API Credentials

Manage tenant API credentials in the Platform domain.

Conceptual model:

```text
TenantApiCredential
├── id
├── tenantId
├── publicKey
├── secretKeyHash
├── status
├── lastUsedAt
├── expiresAt
├── createdAt
└── revokedAt
```

Rules:

- Public key is not secret.
- Secret key must never be stored in frontend source, localStorage, sessionStorage, VITE variables, or ordinary API responses after initial creation.
- Prefer one-way hashing of secrets.
- If recoverable encrypted storage is required, document the reason.
- Rotation must invalidate the previous credential according to policy.
- Revocation must be auditable.
- Credential actions must create platform audit events.

Suggested endpoints:

```text
GET  /api/v1/platform/tenants/:tenantId/credentials
POST /api/v1/platform/tenants/:tenantId/credentials
POST /api/v1/platform/tenants/:tenantId/credentials/:credentialId/rotate
POST /api/v1/platform/tenants/:tenantId/credentials/:credentialId/revoke
```

## 15. Phase 10 — Platform Audit

Audit at least:

```text
authentication events
tenant creation
tenant suspension
tenant activation
tenant archival
credential creation
credential rotation
credential revocation
platform user changes
platform role/permission changes
support/impersonation actions if implemented
```

Do not store secrets in audit records.

## 16. Phase 11 — Platform → Logistics API Integration

Use a strict service boundary:

```text
platform-api
      │
      │ authenticated HTTPS
      ▼
Logistics API
      │
      ▼
Logistics DB
```

Never use:

```text
Platform API → Logistics Prisma Client
Platform API → Logistics DB connection string
Platform API → copied logistics service imports
```

Define:

- service authentication
- tenant identifier
- request/response schemas
- idempotency
- timeout
- retry policy
- error mapping
- correlation/request IDs
- audit behavior

Choose the exact service-auth mechanism only after inspecting the existing security architecture.

## 17. Phase 12 — Super Admin Frontend

Create the independent `super-admin` React application.

Reuse proven infrastructure patterns from the copied `apps/admin` where appropriate:

```text
React
Vite
TypeScript
React Router
TanStack Query
Zustand
TypeBox/API contracts
existing UI system
```

Remove tenant logistics business screens.

Required screens:

```text
Login

Dashboard

Tenants
├── List
├── Create
└── Detail
    ├── Overview
    ├── Status
    └── Credentials

Platform Users

Platform Roles

Platform Permissions

Audit Logs

Platform Settings
```

Navigation must be permission-aware.

## 18. Phase 13 — Frontend Security

The frontend is not the security boundary.

Use protected routes for UX, but enforce authorization in Platform API.

```text
Authenticated route
      ↓
Platform user state
      ↓
Platform permissions
      ↓
Permission-aware navigation
      ↓
Platform API
      ↓
Server-side authorization
```

Never rely on hidden UI controls as authorization.

Never store platform or tenant secret keys in browser storage.

## 19. Phase 14 — Remove Logistics Functionality

Remove or adapt copied logistics-only functionality after dependencies are understood:

```text
shipments
orders
drivers
vehicles
warehouses
routes
delivery workflows
tracking
logistics reports
logistics business services
logistics Prisma models
logistics frontend routes
logistics-only permissions
```

Do not delete shared technical infrastructure without verifying dependencies.

## 20. Phase 15 — Environment Separation

Platform environment configuration must be independent.

Example:

```text
NODE_ENV
PORT
DATABASE_URL

JWT_ACCESS_SECRET
JWT_REFRESH_SECRET

PLATFORM_API_URL
LOGISTICS_API_URL
LOGISTICS_SERVICE_AUTH_SECRET

CORS_ORIGINS
SWAGGER_ENABLED
```

Never copy Logistics production secrets into the new repository.

Verify `DATABASE_URL` points to Platform DB before migration operations.

## 21. Phase 16 — Testing

### Authentication

- valid platform login
- invalid credentials
- refresh
- logout
- disabled platform user
- forgot password
- reset password
- OTP where supported

### Authorization

- unauthenticated request rejected
- tenant-only user rejected
- platform member without permission rejected
- permitted platform member accepted
- role name alone cannot grant platform access
- sensitive endpoints enforce correct permission

### Tenant lifecycle

- create
- update
- suspend
- reactivate
- archive
- invalid transitions

### Credentials

- create
- rotate
- revoke
- previous secret invalidation
- secret not returned after creation
- audit generated

### Isolation

- Platform API cannot connect to Logistics DB
- Platform API cannot directly import/query Logistics Prisma
- cross-database FK is absent
- tenant identifiers are validated through the proper API boundary

### Frontend

- protected routes
- permission-based navigation
- tenant management
- credential UX
- loading/error states

## 22. Phase 17 — Independent Build and Deployment

Platform must build and deploy independently:

```text
super-admin
platform-api
platform-db
```

Logistics remains:

```text
admin
api
logistics-db
```

Platform deployment must not require building the Logistics frontend or running Logistics migrations.

Use independent:

```text
Docker images
environment variables
secrets
CI pipelines
database migrations
health checks
logging
monitoring
```

## 23. Phase 18 — Documentation

Create/update:

```text
docs/
├── PLATFORM-ARCHITECTURE.md
├── PLATFORM-AUTHENTICATION.md
├── PLATFORM-RBAC.md
├── PLATFORM-API.md
├── TENANT-LIFECYCLE.md
├── TENANT-PROVISIONING.md
├── TENANT-API-CREDENTIALS.md
├── PLATFORM-AUDIT.md
├── PLATFORM-LOGISTICS-INTEGRATION.md
├── PLATFORM-SECURITY.md
├── PLATFORM-DEPLOYMENT.md
└── CONVERSION-INVENTORY.md
```

Documentation must describe actual implementation, not unimplemented future features.

## 24. Migration Strategy

Because this repository was copied from the Logistics Platform:

- Review existing migration history.
- Do not assume old migrations can be reused unchanged.
- Platform migrations must represent Platform schema.
- Do not connect Platform Prisma to Logistics DB.
- Verify `DATABASE_URL` before migrations.
- Prefer a clean Platform migration history if copied migrations represent the old Logistics schema.
- Do not execute migrations automatically.

Before the first migration is executed, document:

```text
Database name
Database owner
DATABASE_URL target
Prisma schema location
Migration directory
Expected tables
Rollback/recovery plan
```

## 25. Dependency and Code Cleanup

After conversion:

```text
unused npm dependencies → remove
unused Prisma models → remove
unused routes → remove
unused services → remove
unused frontend screens → remove
unused permissions → remove
unused environment variables → remove
unused Docker services → remove
```

Validate:

```text
typecheck
lint
unit tests
integration tests
build
```

## 26. Definition of Done

- [ ] Repository identifies as `super-admin-platform`.
- [ ] `platform-api` is an independent Fastify application.
- [ ] `super-admin` is an independent frontend application.
- [ ] Platform DB is separate from Logistics DB.
- [ ] Platform Prisma schema contains only platform-owned data.
- [ ] Platform authentication is implemented.
- [ ] Platform membership is enforced.
- [ ] Platform RBAC is permission-based.
- [ ] `/api/v1/platform/*` is implemented.
- [ ] Tenant lifecycle is implemented.
- [ ] Tenant provisioning has a defined API boundary.
- [ ] Tenant API credentials are implemented securely.
- [ ] Platform audit logging is implemented.
- [ ] Platform → Logistics communication uses an API boundary.
- [ ] Platform backend cannot directly access Logistics DB.
- [ ] Super Admin frontend contains no logistics business screens.
- [ ] Secrets are not exposed to browser code.
- [ ] Authentication and authorization tests pass.
- [ ] Tenant lifecycle tests pass.
- [ ] Isolation/security tests pass.
- [ ] Frontend and backend build independently.
- [ ] Platform deployment is independent of Logistics deployment.
- [ ] Documentation matches implementation.
- [ ] Original Logistics Platform remains unchanged.

## 27. Recommended Execution Order

```text
1. Repository discovery
        ↓
2. Conversion inventory
        ↓
3. Repository/application identity
        ↓
4. Platform project structure
        ↓
5. Platform DB + Prisma
        ↓
6. Platform authentication
        ↓
7. Platform RBAC
        ↓
8. Platform API foundation
        ↓
9. Tenant lifecycle
        ↓
10. Tenant API credentials
        ↓
11. Tenant provisioning
        ↓
12. Platform ↔ Logistics API integration
        ↓
13. Platform audit
        ↓
14. Super Admin frontend
        ↓
15. Remove logistics functionality
        ↓
16. Security hardening
        ↓
17. Full test suite
        ↓
18. Independent deployment validation
        ↓
19. Documentation finalization
```

## 28. AI Coding Agent Operating Mode

Before every phase:

1. Inspect the relevant existing implementation.
2. Identify dependencies.
3. State what will change.
4. State what will not change.
5. Implement the smallest coherent change.
6. Run relevant validation.
7. Report changed files and tests.

Never:

- rewrite the entire repository unnecessarily
- regenerate the project from scratch
- replace working infrastructure without reason
- modify the original Logistics Platform
- silently run destructive database commands
- introduce undocumented architecture
- create duplicate implementations when safe reuse is possible
- expose secrets
- bypass server-side authorization
- access the Logistics database directly

Phase completion report:

```text
Phase:
Status:

Implemented:
- ...

Files changed:
- ...

Tests:
- ...

Database changes:
- ...

Migration executed:
- YES/NO

Risks:
- ...

Next phase:
- ...
```

## 29. Final Boundary

The completed architecture must make the following ownership explicit:

```text
                 PLATFORM CONTROL PLANE

super-admin
     ↓
platform-api
     ↓
platform_db

Owns:
- tenants
- platform users
- platform RBAC
- tenant credentials
- platform audit
- platform configuration


                 TENANT BUSINESS PLANE

admin
     ↓
logistics api
     ↓
logistics_db

Owns:
- tenant users
- tenant RBAC
- shipments
- orders
- drivers
- vehicles
- warehouses
- routes
- logistics business data
```

The two systems communicate through explicit, authenticated APIs rather than shared database access.

This architecture is intentionally designed so the repositories can later be maintained, deployed, scaled, secured, and released completely independently.
