# Multi-Tenant Architecture

**Project:** Fastify-MasterApp  
**Document:** `MULTI-TENANT-ARCHITECTURE.md`  
**Status:** Architecture Specification  
**Audience:** Backend, Admin Frontend, Database, DevOps, Security  
**Primary Stack:** Fastify + TypeScript + Prisma + PostgreSQL + React + TypeBox + React Query + Zustand

---

# 1. Purpose

This document defines the architecture required to transform Fastify-MasterApp into a **secure, scalable, tenant-aware SaaS platform**.

The system must support multiple independent organizations/tenants while using the same application codebase and, where appropriate, the same database infrastructure.

Each tenant must have isolated:

- Users
- Roles
- Permissions
- Logistics data
- Configuration
- Branding
- Operational settings
- Audit records
- Business resources

The most important requirement is:

> A user belonging to Tenant A must never be able to read, modify, delete, or otherwise access Tenant B's data unless an explicitly authorized platform-level operation permits it.

---

# 2. Scope

This architecture covers:

1. Tenant model
2. Organization model
3. User-to-tenant relationship
4. Tenant membership
5. Tenant-aware authentication
6. Tenant resolution
7. Tenant context
8. Tenant-aware authorization
9. Tenant-aware RBAC
10. Prisma tenant isolation
11. Database constraints
12. Database indexes
13. Tenant-aware API contracts
14. Tenant-aware Admin Frontend
15. Tenant-aware White-Label branding
16. Platform administrators
17. Tenant administrators
18. Audit logging
19. Cross-tenant security
20. Tenant lifecycle
21. Tenant provisioning
22. Tenant suspension
23. Tenant deletion
24. Testing
25. Migration strategy
26. Future scalability

This document does **not** implement individual logistics modules such as:

- Shipments
- Vehicles
- Drivers
- Routes
- Warehouses
- Tracking
- Deliveries

Instead, it establishes the tenant boundary those modules must follow.

---

# 3. Existing Architecture

The existing application already contains:

```text
Fastify API
    ↓
TypeScript
    ↓
Prisma
    ↓
PostgreSQL
```

and:

```text
React Admin
    ↓
React Router
    ↓
React Query
    ↓
Centralized API Client
    ↓
Fastify API
```

The application already contains:

- Authentication
- JWT access/refresh tokens
- OTP validation
- Login/logout
- Password reset
- RBAC
- Users
- Roles
- Permissions
- Dashboard
- Settings
- i18n
- Theme system
- Tables
- Forms
- White-label branding

Multi-tenancy must integrate with these systems.

Do **not** rebuild existing functionality.

Do **not** create a second authentication system.

Do **not** create a second RBAC system.

Do **not** create a second Admin application.

---

# 4. Multi-Tenant Definition

A **tenant** represents an independent customer organization using the platform.

Example:

```text
Platform
│
├── Acme Logistics
│   ├── Users
│   ├── Roles
│   ├── Vehicles
│   ├── Drivers
│   ├── Shipments
│   └── Branding
│
├── FastTrack Transport
│   ├── Users
│   ├── Roles
│   ├── Vehicles
│   ├── Drivers
│   ├── Shipments
│   └── Branding
│
└── Global Freight
    ├── Users
    ├── Roles
    ├── Vehicles
    ├── Drivers
    ├── Shipments
    └── Branding
```

The same application serves all tenants.

---

# 5. Core Architecture Principle

The tenant must become part of the application's security context.

The request lifecycle must conceptually be:

```text
HTTP Request
    ↓
Authentication
    ↓
Identify User
    ↓
Resolve Tenant
    ↓
Create Tenant Context
    ↓
Authorization
    ↓
Business Logic
    ↓
Tenant-Scoped Database Query
    ↓
Response
```

Never allow business services to independently guess or derive tenant ownership.

---

# 6. Tenant Boundary

The tenant boundary must be explicit.

Every tenant-owned resource must have a tenant relationship.

Conceptually:

```text
Tenant
  │
  ├── Users / Memberships
  ├── Roles
  ├── Branding
  ├── Settings
  ├── Audit Logs
  ├── Vehicles
  ├── Drivers
  ├── Shipments
  ├── Routes
  ├── Warehouses
  └── Deliveries
```

For a tenant-owned resource:

```text
Resource
    ↓
tenantId
    ↓
Tenant
```

Example:

```text
Shipment
├── id
├── tenantId
├── trackingNumber
├── status
└── ...
```

---

# 7. Tenant Identification

Tenant identification must be deterministic and secure.

Possible mechanisms include:

### 7.1 JWT Tenant Claim

Example:

```json
{
  "sub": "user-id",
  "tenantId": "tenant-id",
  "role": "tenant_admin"
}
```

However, the frontend must never be trusted to arbitrarily modify this value.

The server must validate the tenant context.

---

### 7.2 Tenant Selection

A user may belong to multiple tenants.

Example:

```text
User
  │
  ├── Acme Logistics
  └── Global Freight
```

The user can select an active tenant.

The selected tenant must be validated against the user's memberships.

```text
User selects Tenant B
        ↓
Server verifies:
User belongs to Tenant B?
        ↓
YES → create tenant context
NO  → reject request
```

Never trust:

```http
X-Tenant-ID: arbitrary-tenant
```

without server-side membership validation.

---

# 8. Recommended Tenant Resolution Strategy

The application should support a centralized tenant resolver.

Conceptually:

```text
authenticateUser()
        ↓
resolveTenant()
        ↓
createRequestContext()
```

Example request context:

```ts
interface RequestContext {
  userId: string;
  tenantId: string;
  isPlatformAdmin: boolean;
  permissions: string[];
}
```

The actual implementation must follow the repository's existing architecture.

Do not blindly introduce this exact interface if an equivalent request context already exists.

---

# 9. Tenant Context

Tenant context must be available throughout the request lifecycle.

Example:

```text
request
  │
  ├── user
  ├── tenant
  ├── permissions
  └── request metadata
```

Services should receive the authenticated tenant context rather than accepting arbitrary tenant IDs from controllers.

Bad:

```ts
shipmentService.getShipment(shipmentId, tenantIdFromBody);
```

Preferred:

```ts
shipmentService.getShipment(shipmentId, requestContext);
```

The service determines the authorized tenant from the trusted context.

---

# 10. Authentication + Multi-Tenancy

Authentication answers:

> Who is this user?

Multi-tenancy answers:

> Which tenant is this user operating within?

Authorization answers:

> What can this user do inside that tenant?

These must remain separate concepts.

```text
Authentication
      ↓
Identity
      ↓
Tenant Membership
      ↓
Tenant Context
      ↓
RBAC Authorization
      ↓
Business Operation
```

---

# 11. User-to-Tenant Relationship

Do not assume:

```text
User → exactly one Tenant
```

unless the product explicitly requires it.

The architecture should preferably support:

```text
User
  │
  ├── Membership → Tenant A
  │
  ├── Membership → Tenant B
  │
  └── Membership → Tenant C
```

This enables:

- Multi-organization users
- Account switching
- Platform administrators
- Consultants/operators
- Future enterprise use cases

---

# 12. Tenant Membership

Recommended conceptual model:

```text
User
  │
  └── TenantMembership
          │
          ├── tenantId
          ├── userId
          ├── role
          ├── status
          ├── createdAt
          └── ...
```

Do not duplicate user accounts for every tenant.

A single identity may have multiple memberships.

---

# 13. Membership Status

Memberships should support lifecycle states.

Example:

```text
INVITED
ACTIVE
SUSPENDED
REMOVED
```

Rules:

### INVITED

User has been invited but has not completed onboarding.

### ACTIVE

User can operate inside the tenant.

### SUSPENDED

User exists but cannot perform tenant operations.

### REMOVED

Membership is no longer active.

Historical records should remain intact where required for auditing.

---

# 14. Tenant Model

The tenant model should contain organizational identity rather than application branding alone.

Conceptually:

```text
Tenant
├── id
├── name
├── slug
├── status
├── createdAt
├── updatedAt
└── ...
```

Potential statuses:

```text
TRIAL
ACTIVE
SUSPENDED
ARCHIVED
```

The exact names should follow existing project conventions.

---

# 15. Tenant Slug

Each tenant should have a stable unique slug.

Example:

```text
acme-logistics
fasttrack-transport
global-freight
```

Potential uses:

```text
/acme-logistics/dashboard
```

or:

```text
acme.example.com
```

or:

```text
app.example.com?tenant=acme
```

The routing/domain strategy may evolve later.

The database should enforce slug uniqueness.

---

# 16. Tenant Status Rules

A suspended tenant must not behave like an active tenant.

Example:

```text
Tenant = SUSPENDED
        ↓
Authenticated User
        ↓
Tenant context resolution
        ↓
Tenant access denied
```

Platform administrators may still be allowed to inspect or manage suspended tenants.

---

# 17. Platform Administrator vs Tenant Administrator

The architecture must distinguish between:

### Platform Administrator

Operates the SaaS platform itself.

Can potentially:

- Create tenants
- Suspend tenants
- Reactivate tenants
- View tenant metadata
- Manage platform configuration
- Support tenants
- Perform approved cross-tenant administrative operations

### Tenant Administrator

Operates only within their own tenant.

Can potentially:

- Manage tenant users
- Manage tenant roles
- Manage permissions
- Manage tenant settings
- Manage tenant branding
- Manage tenant logistics data

A tenant administrator must never automatically become a platform administrator.

---

# 18. Platform Scope

Platform-level resources should not accidentally receive a `tenantId` requirement.

Examples:

```text
PlatformConfiguration
SystemFeatureFlag
PlatformAdmin
```

Tenant-level resources require tenant isolation.

Examples:

```text
Shipment
Vehicle
Driver
Warehouse
TenantUser
TenantRole
TenantBranding
```

The architecture must explicitly classify each model as:

```text
PLATFORM
TENANT
GLOBAL_REFERENCE
```

before implementing it.

---

# 19. Data Ownership Classification

Every Prisma model must be classified.

### Platform-owned

```text
Platform
PlatformAdmin
GlobalConfiguration
```

### Tenant-owned

```text
Shipment
Vehicle
Driver
Warehouse
TenantMembership
TenantRole
TenantBranding
```

### Global reference data

Potential examples:

```text
Country
Currency
Timezone
VehicleType
```

Global reference data can be shared safely if it contains no tenant-specific information.

---

# 20. Prisma Tenant Isolation

Tenant-owned queries must always be tenant-scoped.

Example:

```ts
await prisma.shipment.findMany({
  where: {
    tenantId: context.tenantId,
  },
});
```

Never use:

```ts
await prisma.shipment.findMany();
```

inside a tenant-scoped operation.

---

# 21. Resource Lookup Security

This is critical.

A query like:

```ts
prisma.shipment.findUnique({
  where: {
    id: shipmentId,
  },
});
```

can cause a cross-tenant data leak.

Instead, tenant ownership must be part of the lookup strategy.

Conceptually:

```ts
findFirst({
  where: {
    id: shipmentId,
    tenantId: context.tenantId,
  },
});
```

or use a composite unique constraint where appropriate.

---

# 22. Composite Unique Constraints

Where appropriate, tenant-owned uniqueness should be scoped to the tenant.

Bad:

```text
trackingNumber UNIQUE
```

if different tenants should be allowed to use the same tracking number.

Better:

```text
UNIQUE(tenantId, trackingNumber)
```

Similarly:

```text
UNIQUE(tenantId, slug)
UNIQUE(tenantId, code)
UNIQUE(tenantId, referenceNumber)
```

depending on business requirements.

---

# 23. Database Indexes

Tenant-owned tables must have appropriate indexes.

At minimum, frequently queried tenant-owned models should consider:

```text
INDEX tenantId
```

and composite indexes such as:

```text
INDEX(tenantId, status)
INDEX(tenantId, createdAt)
INDEX(tenantId, updatedAt)
```

based on actual query patterns.

Do not blindly add every possible index.

Indexes must be based on real access patterns.

---

# 24. Tenant-Aware Repository/Service Pattern

The architecture should centralize tenant scoping.

Potential pattern:

```text
Controller
    ↓
Service
    ↓
Tenant-aware Repository
    ↓
Prisma
```

Example:

```ts
shipmentRepository.findMany(context, filters);
```

The repository applies:

```ts
tenantId = context.tenantId;
```

This reduces the risk of developers forgetting tenant filters.

---

# 25. Defense in Depth

Tenant isolation must not depend on one layer.

Security should exist at multiple levels:

```text
Authentication
      ↓
Tenant Membership
      ↓
Tenant Context
      ↓
RBAC
      ↓
Service Authorization
      ↓
Tenant-Scoped Query
      ↓
Database Constraints
```

A failure in one layer should not automatically expose another tenant's data.

---

# 26. RBAC + Multi-Tenancy

Existing RBAC must become tenant-aware.

Permission example:

```text
shipment.read
shipment.create
shipment.update
shipment.delete
```

does not mean:

> User can access every shipment in the database.

It means:

> User can perform the operation against resources inside their authorized tenant context.

Therefore:

```text
Permission
+
Tenant Membership
+
Resource Ownership
=
Authorized Operation
```

---

# 27. Example Authorization Flow

Request:

```http
GET /api/v1/shipments/123
```

Processing:

```text
JWT
 ↓
User = U100
 ↓
Tenant = ACME
 ↓
Membership = ACTIVE
 ↓
Permission = shipment.read
 ↓
Shipment 123
 ↓
Verify shipment.tenantId = ACME
 ↓
Return shipment
```

If:

```text
shipment.tenantId = FASTTRACK
```

then:

```text
403 Forbidden
```

or an equivalent not-found response according to the security policy.

---

# 28. Avoiding Tenant Enumeration

The API should avoid leaking whether a resource exists in another tenant.

For example:

```text
Tenant A requests shipment belonging to Tenant B
```

The API should generally behave as though the resource is unavailable.

Depending on the API's security convention:

```text
404 Not Found
```

may be preferable to:

```text
403 Forbidden
```

because `403` can reveal that the resource exists.

Apply one consistent policy across the application.

---

# 29. Tenant ID Must Not Be Trusted From Request Body

Never implement:

```json
{
  "tenantId": "tenant-b",
  "name": "Shipment"
}
```

and then use that tenant ID directly.

The server must derive tenant context from authenticated authorization state.

If a platform administrator needs to operate on another tenant, that must be an explicit privileged operation.

---

# 30. Tenant ID in URL

If the API uses:

```http
/api/v1/tenants/:tenantId/shipments
```

the server must still validate:

```text
Authenticated user
        ↓
allowed to operate on :tenantId?
```

The URL is not an authorization mechanism.

---

# 31. API Contract Requirements

All tenant-aware APIs must be represented in the existing shared API contract system.

Use:

```text
packages/api-contracts
```

where appropriate.

Do not create duplicate request/response type definitions inside the Admin frontend.

Example conceptual response:

```ts
{
  id: string;
  tenantId: string;
  ...
}
```

Whether `tenantId` should be exposed to the frontend should be decided based on the resource and security model.

Do not expose internal fields unnecessarily.

---

# 32. Tenant Context API

The application should provide a centralized API for resolving the current tenant.

Potential endpoint:

```http
GET /api/v1/tenants/current
```

or:

```http
GET /api/v1/me/tenant
```

The exact endpoint must follow the existing centralized endpoint architecture.

It should provide information such as:

```json
{
  "id": "tenant-id",
  "name": "Acme Logistics",
  "slug": "acme-logistics",
  "status": "ACTIVE"
}
```

Do not create duplicate tenant-resolution endpoints.

---

# 33. Current User + Tenant

The existing authentication/session bootstrap should ideally be capable of determining:

```text
Current User
Current Tenant
Membership
Permissions
Branding
```

Conceptually:

```text
GET /me
   ↓
User
   ↓
Active Tenant
   ↓
Membership
   ↓
Permissions
```

The exact response shape must be compatible with the existing authentication architecture.

---

# 34. Tenant Switching

If multi-tenant users are supported, the Admin UI should allow:

```text
Current Tenant
       ↓
Tenant Switcher
       ↓
Available Memberships
```

When switching tenants:

```text
Select Tenant
    ↓
Validate membership
    ↓
Update active tenant context
    ↓
Refresh relevant authorization state
    ↓
Refresh branding
    ↓
Invalidate tenant-scoped React Query cache
    ↓
Navigate to tenant dashboard
```

---

# 35. React Query Cache Isolation

This is extremely important.

Tenant A and Tenant B data must never share the same cache key.

Bad:

```ts
["shipments"];
```

Preferred:

```ts
["tenant", tenantId, "shipments"];
```

or an equivalent centralized key strategy.

When changing tenants:

```text
Tenant A
   ↓
Switch to Tenant B
   ↓
Invalidate/remove Tenant A scoped queries
   ↓
Load Tenant B queries
```

The existing API/query architecture should be adapted rather than replaced.

---

# 36. Zustand Tenant State

If Zustand is used for client-side tenant state, keep it centralized.

Possible state:

```ts
interface TenantState {
  activeTenantId: string | null;
  availableTenants: Tenant[];
}
```

Do not duplicate tenant state across multiple components.

The backend remains authoritative.

---

# 37. Tenant-Aware Routing

Routes may conceptually look like:

```text
/dashboard
/shipments
/vehicles
/drivers
```

without requiring the tenant in the URL if the active tenant is securely established through the session/context.

Alternatively:

```text
/tenants/:tenantId/dashboard
```

may be used.

Do not introduce tenant IDs into every route unless there is a clear architectural reason.

The chosen strategy must be centralized.

---

# 38. White-Label Integration

Multi-tenancy must integrate directly with the existing White-Label architecture.

Relationship:

```text
Tenant
  │
  └── Branding
       ├── appName
       ├── shortName
       ├── logo
       ├── logoDark
       ├── icon
       ├── favicon
       ├── primaryColor
       ├── secondaryColor
       └── accentColor
```

When the active tenant changes:

```text
Tenant A
   ↓
Acme Branding
   ↓
Admin UI

switch

Tenant B
   ↓
XYZ Branding
   ↓
Admin UI
```

---

# 39. Branding Security

Tenant branding must not permit arbitrary executable content.

Do not allow tenant configuration to inject:

```text
JavaScript
HTML
arbitrary CSS
scripts
iframes
unsafe SVG
```

Branding should be restricted to validated configuration and assets.

---

# 40. Tenant Settings

Tenant configuration should be separate from user preferences.

### Tenant settings

Examples:

```text
timezone
currency
date format
operational defaults
notification settings
logistics configuration
branding
```

### User settings

Examples:

```text
language
theme
sidebar state
table preferences
personal UI preferences
```

Do not mix these models.

---

# 41. Tenant Audit Logging

Audit logs must be tenant-aware.

Example:

```text
AuditLog
├── id
├── tenantId
├── userId
├── action
├── resource
├── resourceId
├── metadata
└── createdAt
```

Example event:

```text
Tenant: ACME
User: U100
Action: shipment.created
Resource: Shipment
Resource ID: S1001
```

Platform-level events may have no tenant ID where appropriate.

---

# 42. Audit Log Security

Tenant users must only see audit records belonging to their tenant.

Platform administrators may have broader access depending on their permissions.

Audit logs must never become a cross-tenant information leak.

---

# 43. Tenant Provisioning

Tenant creation should follow a controlled lifecycle.

Conceptually:

```text
Platform Admin / Signup
        ↓
Create Tenant
        ↓
Create Initial Membership
        ↓
Create Tenant Admin
        ↓
Create Default Roles
        ↓
Create Default Settings
        ↓
Create Default Branding
        ↓
Tenant ACTIVE
```

The process should be transactional where possible.

---

# 44. Default Tenant Data

When creating a tenant, determine which defaults are required.

Potential defaults:

```text
Tenant
Tenant Membership
Default Roles
Default Permissions
Tenant Settings
Branding
Feature Flags
```

Do not duplicate global permissions unnecessarily.

---

# 45. Tenant Deletion

Tenant deletion must be treated as a high-risk operation.

The architecture should support:

```text
ACTIVE
  ↓
SUSPENDED
  ↓
ARCHIVED
  ↓
DELETED
```

Prefer soft deletion or archival where business/legal requirements require historical records.

Before implementing hard deletion, document:

- cascading relationships
- retention requirements
- audit requirements
- backups
- compliance requirements
- recovery strategy

---

# 46. Tenant Suspension

Suspension should immediately prevent normal tenant operations.

Example:

```text
Tenant.status = SUSPENDED
```

Then:

```text
Authentication
    ↓
Tenant resolution
    ↓
Tenant suspended
    ↓
Tenant access denied
```

Existing tokens must not automatically bypass tenant suspension.

The backend must check current tenant status according to the authentication/session architecture.

---

# 47. Token Strategy

The existing JWT system already supports access and refresh tokens.

Multi-tenancy must integrate with it.

Possible token claims:

```json
{
  "sub": "user-id",
  "tenantId": "tenant-id"
}
```

However:

> Never rely on a stale JWT claim alone for long-lived tenant authorization.

Important tenant changes include:

- Membership removal
- Membership suspension
- Tenant suspension
- Role changes
- Permission changes

The existing token/session invalidation strategy must account for these changes.

---

# 48. Refresh Token Security

Refresh token rotation must remain intact.

Tenant context must not allow a refresh token issued for one tenant to become an authorization mechanism for another tenant.

If tenant switching is supported, define explicitly whether:

```text
same refresh session
```

or:

```text
new tenant-scoped access token
```

is generated.

The server remains authoritative.

---

# 49. API Middleware / Hooks

Tenant resolution should be centralized in Fastify.

Conceptual pipeline:

```text
Fastify Request
    ↓
JWT Authentication Hook
    ↓
User Resolution
    ↓
Tenant Resolution Hook
    ↓
Authorization Hook
    ↓
Route Handler
```

Do not implement tenant resolution separately in every route.

---

# 50. Tenant Context Error Handling

Define consistent errors.

Potential errors:

```text
TENANT_REQUIRED
TENANT_NOT_FOUND
TENANT_ACCESS_DENIED
TENANT_SUSPENDED
TENANT_MEMBERSHIP_INACTIVE
```

Use the project's existing centralized error architecture.

Do not create inconsistent error formats across modules.

---

# 51. Centralized API Endpoints

The application already aims to keep API endpoints centralized.

Tenant endpoints must follow that rule.

For example:

```text
src/api/endpoints/
    auth.ts
    users.ts
    roles.ts
    permissions.ts
    tenants.ts
    branding.ts
    ...
```

The actual directory structure must follow the repository's current conventions.

Do not scatter literal endpoint strings across React components.

---

# 52. Tenant API Examples

Potential API surface:

```http
GET    /api/v1/tenants
POST   /api/v1/tenants

GET    /api/v1/tenants/:tenantId
PATCH  /api/v1/tenants/:tenantId

GET    /api/v1/tenants/current

GET    /api/v1/tenants/current/members
POST   /api/v1/tenants/current/members

GET    /api/v1/tenants/current/branding
PATCH  /api/v1/tenants/current/branding
```

These are architectural examples.

The implementation must inspect the existing API and choose the smallest consistent endpoint surface.

Do not duplicate existing endpoints.

---

# 53. Tenant-Aware Users

A global user directory and a tenant user directory are different concepts.

Platform:

```text
All Users
```

Tenant:

```text
Users belonging to current tenant
```

Tenant Admin must only receive users within the current tenant.

Example:

```text
GET /users
```

must effectively behave as:

```sql
WHERE tenantId = currentTenant
```

or use the membership relationship.

---

# 54. Tenant-Aware Roles

Roles must be scoped correctly.

Example:

```text
Tenant A
 ├── Admin
 ├── Dispatcher
 └── Driver Manager

Tenant B
 ├── Admin
 ├── Dispatcher
 └── Warehouse Manager
```

Role names may repeat across tenants.

Therefore, global uniqueness such as:

```text
role.name UNIQUE
```

may be incorrect.

Potential constraint:

```text
UNIQUE(tenantId, name)
```

depending on the RBAC model.

---

# 55. Global Permissions

Permissions are often platform-level definitions.

Example:

```text
shipment.read
shipment.create
shipment.update
shipment.delete
vehicle.read
vehicle.create
```

A permission can be globally defined while role assignments are tenant-specific.

Conceptually:

```text
Global Permission
       ↓
Tenant Role
       ↓
Tenant Membership
       ↓
User
```

Do not unnecessarily duplicate the same permission definitions for every tenant unless the existing RBAC design requires it.

---

# 56. Tenant-Aware RBAC Model

Recommended conceptual structure:

```text
Permission
    ↓
Role
    ↓
Tenant
    ↓
RoleAssignment
    ↓
User
```

or:

```text
User
 ↓
TenantMembership
 ↓
TenantRole
 ↓
Permission
```

The final database design must adapt to the existing RBAC implementation.

---

# 57. Platform RBAC

Platform administrators may require separate permissions.

Examples:

```text
platform.tenant.read
platform.tenant.create
platform.tenant.update
platform.tenant.suspend
platform.user.read
```

These must not accidentally become tenant permissions.

---

# 58. Cross-Tenant Operations

Cross-tenant operations must be extremely explicit.

Allowed example:

```text
Platform Admin
    ↓
platform.tenant.read
    ↓
Inspect Tenant B
```

Not allowed:

```text
Tenant Admin A
    ↓
shipment.read
    ↓
Shipment belonging to Tenant B
```

Never create generic bypasses such as:

```ts
if (isAdmin) {
  ignoreTenantFilter();
}
```

unless `isAdmin` specifically means an authorized platform role and the operation is explicitly designed for it.

---

# 59. Prisma Middleware / Extension

A centralized Prisma extension or repository pattern may be considered for enforcing tenant filtering.

However:

> Do not introduce global Prisma magic until the existing Prisma architecture has been inspected.

Potential problems with automatic filtering include:

- background jobs
- platform operations
- migrations
- analytics
- transactions
- nested writes
- administrative operations

If implemented, the mechanism must have an explicit and auditable tenant context.

---

# 60. Background Jobs

Background jobs must also be tenant-aware.

Example:

```text
Queue Job
├── tenantId
├── userId
├── action
└── payload
```

A worker must restore the correct tenant context before accessing tenant data.

Never rely on the HTTP request context inside asynchronous jobs.

---

# 61. Scheduled Jobs

Scheduled jobs must define whether they are:

### Platform-wide

Example:

```text
Cleanup expired sessions
```

or:

### Tenant-specific

Example:

```text
Generate ACME daily shipment report
```

Tenant-specific jobs must carry:

```text
tenantId
```

and enforce tenant-scoped queries.

---

# 62. Events

Domain events should include tenant context when tenant-owned.

Example:

```json
{
  "event": "shipment.created",
  "tenantId": "tenant-acme",
  "resourceId": "shipment-123"
}
```

This is essential for:

- event consumers
- audit logging
- notifications
- webhooks
- analytics
- background processing

---

# 63. Webhooks

Tenant-specific webhooks must be isolated.

Example:

```text
Tenant A
    ↓
Webhook configuration A

Tenant B
    ↓
Webhook configuration B
```

A webhook worker must not accidentally use another tenant's credentials or configuration.

---

# 64. File Storage

Tenant-owned files must be isolated.

Recommended conceptual structure:

```text
tenants/
  {tenantId}/
    logos/
    documents/
    shipments/
    invoices/
```

Never allow a user to directly manipulate another tenant's storage path.

Storage authorization must use tenant context.

---

# 65. Notifications

Notifications must be tenant-aware.

Example:

```text
Notification
├── tenantId
├── userId
├── type
├── payload
└── readAt
```

A user's notification query must be restricted to:

```text
current tenant
+
current user
```

unless the notification is intentionally platform-level.

---

# 66. Feature Flags

Feature flags should be classified.

### Platform feature flag

```text
new_tracking_engine
```

### Tenant feature flag

```text
Tenant A → enabled
Tenant B → disabled
```

The feature-flag architecture should support tenant-level overrides without bypassing authorization.

---

# 67. Tenant Branding Runtime

White-label configuration should be loaded based on the active tenant.

Conceptually:

```text
User Login
   ↓
Tenant Resolution
   ↓
Branding Resolution
   ↓
Branding Provider
   ↓
CSS Variables + Assets + Metadata
```

When tenant changes:

```text
Tenant changed
   ↓
Fetch branding
   ↓
Apply branding
   ↓
Update document.title
   ↓
Update favicon
   ↓
Update logos
   ↓
Update theme tokens
```

---

# 68. Tenant Branding Failure

If tenant branding cannot be loaded:

```text
Tenant identity remains authoritative
```

The UI may fall back to safe platform defaults where appropriate.

However, branding fallback must not silently change the tenant context.

Example:

```text
Tenant = ACME
Branding unavailable
    ↓
Use default logo
    ↓
Still operating as ACME
```

---

# 69. Tenant Switch + Branding

Tenant switching must update all tenant-specific state.

```text
Switch Tenant
    ↓
Tenant Context
    ↓
RBAC Permissions
    ↓
Branding
    ↓
Settings
    ↓
React Query Cache
    ↓
Dashboard
```

No stale Tenant A data may remain visible after switching to Tenant B.

---

# 70. Browser Storage

Do not store sensitive tenant authorization state in arbitrary localStorage values.

If localStorage is used for:

```text
preferredTenantId
```

the backend must still validate membership.

Browser state is a preference, not authorization.

---

# 71. Security Requirements

The implementation must protect against:

- IDOR
- cross-tenant reads
- cross-tenant updates
- cross-tenant deletes
- cross-tenant search
- cross-tenant exports
- cross-tenant file access
- cross-tenant notifications
- cross-tenant websocket events
- cross-tenant audit logs
- cross-tenant cache leakage
- tenant enumeration
- manipulated tenant IDs
- stale tenant sessions

---

# 72. IDOR Protection

Every resource endpoint must answer:

> Does this resource belong to the current authorized tenant?

For example:

```http
GET /shipments/:id
PATCH /shipments/:id
DELETE /shipments/:id
```

must verify tenant ownership.

Do not rely solely on:

```text
id = resourceId
```

---

# 73. Search Isolation

Search endpoints are especially dangerous.

Example:

```http
GET /shipments?search=ABC
```

must search only the current tenant's records.

The same applies to:

- users
- vehicles
- drivers
- warehouses
- tracking numbers
- documents
- audit logs

---

# 74. Pagination Isolation

Pagination must remain tenant-scoped.

Never construct a cursor from an unscoped query.

Example:

```text
Tenant A
  ↓
query + cursor
  ↓
Tenant A records only
```

---

# 75. Sorting Isolation

Sorting must not change the tenant scope.

Example:

```http
GET /shipments?sort=createdAt
```

still means:

```sql
WHERE tenantId = currentTenant
ORDER BY createdAt
```

---

# 76. Aggregations

Dashboard queries must also be tenant-scoped.

Bad:

```sql
COUNT(*) FROM shipments
```

Preferred:

```sql
COUNT(*)
FROM shipments
WHERE tenantId = currentTenant
```

Every:

- count
- sum
- average
- grouping
- report
- analytics query

must respect tenant scope.

---

# 77. Export Isolation

Exports are a common source of accidental leaks.

Example:

```text
Export Shipments
```

must export only the current tenant's authorized records.

The same applies to:

- CSV
- Excel
- PDF
- reports
- dashboards
- scheduled reports

---

# 78. WebSocket Isolation

If the application later uses WebSockets/SSE:

```text
Tenant A connection
    ↓
Tenant A events only
```

Never broadcast all tenant events to all connected users.

Connection context should contain:

```text
userId
tenantId
permissions
```

---

# 79. API Rate Limiting

Rate limiting should be considered at multiple levels:

```text
IP
User
Tenant
Endpoint
```

Tenant-level limits can prevent one tenant from exhausting shared infrastructure.

---

# 80. Observability

Logs must contain tenant context where appropriate.

Example:

```json
{
  "requestId": "req-123",
  "userId": "user-100",
  "tenantId": "tenant-acme",
  "route": "/shipments",
  "action": "shipment.list"
}
```

Do not log sensitive tenant data unnecessarily.

Tenant IDs are useful for debugging and operational tracing.

---

# 81. Metrics

Metrics should be carefully designed.

Potential dimensions:

```text
tenant
module
operation
status
```

Avoid high-cardinality tenant labels on metrics that could create operational problems.

For large tenant counts, tenant-specific analysis may belong in logs/traces rather than Prometheus labels.

---

# 82. Tracing

Distributed traces should propagate tenant context where appropriate.

Example:

```text
HTTP Request
 ↓
Fastify
 ↓
Service
 ↓
Prisma
 ↓
Queue
```

Tenant context should remain traceable without exposing sensitive information.

---

# 83. Error Messages

Do not expose internal tenant information.

Bad:

```text
Shipment belongs to Tenant ABC
```

for an unauthorized user.

Prefer a generic resource-unavailable response according to the application's security conventions.

---

# 84. Database Transactions

Tenant context must remain consistent throughout transactions.

Example:

```text
Transaction
    ↓
Create Shipment
    ↓
Create Audit Log
    ↓
Create Notification
```

All tenant-owned records must use the same tenant context.

---

# 85. Nested Prisma Writes

Nested writes require special care.

Example:

```ts
prisma.shipment.create({
  data: {
    tenantId,
    driver: {
      connect: {
        id: driverId,
      },
    },
  },
});
```

The system must verify that the connected driver also belongs to the same tenant.

Never assume foreign-key existence means authorization.

---

# 86. Cross-Tenant Relationship Protection

A resource belonging to Tenant A must not be connectable to a resource belonging to Tenant B.

Example:

```text
Shipment A → Driver B
```

must be rejected if:

```text
Shipment A.tenantId != Driver B.tenantId
```

This applies to all tenant-owned relationships.

---

# 87. Referential Integrity

Where appropriate, database relationships should help enforce ownership.

Potential conceptual strategy:

```text
Shipment
tenantId
driverId
```

must ensure the selected driver belongs to the same tenant.

The exact PostgreSQL/Prisma implementation should be designed carefully rather than relying only on application-level checks.

---

# 88. Tenant-Aware Unique IDs

Global UUIDs/IDs can still be used.

Do not assume tenant IDs must be embedded in resource IDs.

Example:

```text
tenantId = tenant-acme
shipmentId = uuid
```

Tenant isolation comes from authorization and ownership, not from ID formatting.

---

# 89. Database Strategy

Initial recommended architecture:

```text
Application
    ↓
Shared PostgreSQL Database
    ↓
Tenant-scoped tables
```

This is usually simpler for the initial SaaS architecture.

However, the design should avoid making future migration to:

```text
Database per tenant
```

or:

```text
Schema per tenant
```

impossible.

---

# 90. Multi-Tenancy Strategies

Three common strategies:

### Shared Database / Shared Schema

```text
Database
 ├── tenants
 ├── users
 ├── shipments
 └── vehicles
```

with:

```text
tenantId
```

This is the recommended initial approach unless existing requirements dictate otherwise.

### Schema Per Tenant

```text
schema_acme
schema_fasttrack
schema_globalfreight
```

More isolation but more operational complexity.

### Database Per Tenant

```text
DB_ACME
DB_FASTTRACK
DB_GLOBAL
```

Strong isolation but substantially greater operational complexity.

The architecture should begin with shared schema + tenant IDs while maintaining clean boundaries.

---

# 91. PostgreSQL Row-Level Security

PostgreSQL Row-Level Security may be considered as an additional defense layer.

Example conceptual policy:

```text
Application tenant context
        ↓
PostgreSQL session context
        ↓
RLS policy
        ↓
Tenant rows only
```

Do not introduce RLS automatically during the first implementation unless the team is prepared to manage:

- connection pooling
- transaction-scoped context
- migrations
- privileged platform queries
- background jobs
- debugging

Application-level tenant isolation is still required.

---

# 92. Migration Strategy

Existing data must be migrated carefully.

Before adding `tenantId` to existing models:

1. Create Tenant model.
2. Create initial/default tenant.
3. Add nullable `tenantId`.
4. Backfill existing records.
5. Verify all records have valid tenant ownership.
6. Add indexes.
7. Add constraints.
8. Make `tenantId` required.
9. Update application queries.
10. Add tenant isolation tests.

Never make `tenantId` required before existing records are safely migrated.

---

# 93. Existing Users Migration

Existing users need a deterministic tenant assignment strategy.

Possible:

```text
Existing Users
      ↓
Default Tenant
      ↓
TenantMembership
```

Do not silently create multiple tenants based on assumptions.

The migration strategy must be documented before execution.

---

# 94. Existing RBAC Migration

Existing:

```text
Users
Roles
Permissions
```

must be mapped into the new tenant-aware model.

Example:

```text
Existing Admin Role
        ↓
Default Tenant
        ↓
Tenant Admin Role
```

Do not destroy existing permission semantics.

---

# 95. Backward Compatibility

Existing API behavior should remain stable wherever possible.

Multi-tenancy should be introduced incrementally.

Do not combine the migration with unrelated:

- framework upgrades
- folder restructuring
- UI redesign
- API renaming
- database rewrites

unless required.

---

# 96. Testing Strategy

Multi-tenancy requires dedicated security tests.

At minimum:

```text
Tenant Isolation Tests
Tenant Authorization Tests
Tenant Switching Tests
Tenant RBAC Tests
Tenant Branding Tests
Tenant Cache Tests
Tenant Migration Tests
```

---

# 97. Tenant Isolation Test

Create:

```text
Tenant A
Tenant B
```

Create:

```text
Shipment A → Tenant A
Shipment B → Tenant B
```

Authenticate as Tenant A.

Verify:

```text
GET shipments
```

returns:

```text
Shipment A
```

and never:

```text
Shipment B
```

---

# 98. Cross-Tenant Resource Test

Authenticate as Tenant A.

Attempt:

```http
GET /shipments/{tenantBShipment}
```

Expected:

```text
Not accessible
```

Repeat for:

```text
PATCH
DELETE
```

---

# 99. Cross-Tenant Relationship Test

Create:

```text
Driver A → Tenant A
Shipment A → Tenant A
Driver B → Tenant B
```

Attempt:

```text
Shipment A → Driver B
```

Expected:

```text
Rejected
```

---

# 100. Tenant Search Test

Authenticate as Tenant A.

Search for data that only exists in Tenant B.

Expected:

```text
No Tenant B records returned
```

---

# 101. Tenant Dashboard Test

Tenant A dashboard must calculate only:

```text
Tenant A shipments
Tenant A vehicles
Tenant A drivers
Tenant A deliveries
```

Tenant B data must never influence the result.

---

# 102. Tenant Cache Test

Perform:

```text
Login Tenant A
Load dashboard
Switch Tenant B
```

Verify:

```text
Tenant A cached data
```

is not displayed under Tenant B.

---

# 103. Tenant Branding Test

Tenant A:

```text
Acme Logistics
Blue
Acme Logo
```

Tenant B:

```text
FastTrack
Green
FastTrack Logo
```

Switch tenants and verify:

```text
App name
Logo
Icon
Favicon
Colors
Page title
```

all update correctly.

---

# 104. Suspended Tenant Test

Set:

```text
Tenant.status = SUSPENDED
```

Attempt tenant operation.

Expected:

```text
Access denied
```

Platform administrator access should follow the platform RBAC policy.

---

# 105. Membership Revocation Test

User belongs to Tenant A.

Remove membership.

Attempt access using an existing session/token.

Expected:

```text
Access denied
```

The exact behavior depends on the existing token invalidation/session model, but stale authorization must not remain indefinitely.

---

# 106. Role Isolation Test

Tenant A:

```text
Dispatcher
```

Tenant B:

```text
Admin
```

Ensure Tenant A's role assignment cannot grant access to Tenant B.

---

# 107. API Contract Tests

Validate:

- tenant endpoints
- tenant context
- tenant membership
- tenant branding
- tenant errors
- tenant switching

using the existing TypeBox contract/testing architecture.

---

# 108. Database Tests

Verify:

- foreign keys
- unique constraints
- composite constraints
- tenant indexes
- cascade behavior
- deletion behavior

---

# 109. Security Test Matrix

The implementation should produce a matrix similar to:

| Operation | Tenant A → A | Tenant A → B |        Platform Admin |
| --------- | -----------: | -----------: | --------------------: |
| Read      |           ✅ |           ❌ | Depends on permission |
| Create    |           ✅ |           ❌ | Depends on permission |
| Update    |           ✅ |           ❌ | Depends on permission |
| Delete    |           ✅ |           ❌ | Depends on permission |
| Export    |           ✅ |           ❌ | Depends on permission |
| Audit     |           ✅ |           ❌ | Depends on permission |

---

# 110. Admin UI Tenant Architecture

The Admin application should have a centralized tenant layer.

Conceptually:

```text
apps/admin/src/
    tenant/
        tenant.types.ts
        tenant.api.ts
        tenant.store.ts
        tenant.provider.tsx
        tenant.hooks.ts
        tenant.utils.ts
```

Only introduce this structure if it matches the existing project organization.

Do not duplicate existing providers/stores.

---

# 111. Tenant Provider

The provider should expose:

```ts
useTenant();
```

Potential capabilities:

```text
currentTenant
availableTenants
switchTenant()
isLoading
```

The backend remains authoritative.

---

# 112. Tenant-Aware UI

Tenant Admin UI should only display:

```text
Current tenant resources
```

Examples:

```text
Users
Roles
Vehicles
Drivers
Shipments
Warehouses
Reports
Settings
Branding
```

Platform-only navigation should not appear for ordinary tenant users.

---

# 113. Platform Admin UI

Platform users may have a separate navigation area.

Conceptually:

```text
Platform
├── Tenants
├── Platform Users
├── System Settings
└── Platform Monitoring
```

and:

```text
Tenant
├── Dashboard
├── Shipments
├── Vehicles
├── Drivers
├── Users
├── Roles
└── Branding
```

Do not duplicate the Admin application.

Use the existing RBAC/navigation architecture.

---

# 114. Tenant-Aware Navigation

Navigation visibility should depend on:

```text
platform role
+
tenant role
+
permission
+
current tenant
```

Do not rely solely on hiding UI.

Backend authorization remains mandatory.

---

# 115. Tenant Context During App Bootstrap

Recommended sequence:

```text
Application Start
      ↓
Authenticate Session
      ↓
Resolve User
      ↓
Resolve Active Tenant
      ↓
Resolve Permissions
      ↓
Resolve Branding
      ↓
Initialize Application
      ↓
Render Dashboard
```

Avoid rendering tenant-sensitive data before tenant context is known.

---

# 116. Loading State

The Admin UI should provide a centralized loading state while tenant context initializes.

Do not allow:

```text
Tenant A → stale UI
```

to flash while Tenant B is loading.

---

# 117. Tenant Switch Loading

During tenant switching:

```text
Disable repeated switching
        ↓
Update server/session context
        ↓
Clear/invalidate tenant queries
        ↓
Load new tenant
        ↓
Load permissions
        ↓
Load branding
        ↓
Render
```

---

# 118. Tenant Context and Forms

Create/update forms must never expose arbitrary:

```text
tenantId
```

as a user-editable field for normal tenant users.

The backend determines the tenant.

---

# 119. Tenant Context and Tables

Tables should query the centralized tenant-aware API.

Do not add:

```text
tenantId
```

filters manually to every table.

The backend should already scope the response.

---

# 120. Tenant Context and Reports

Reports must be tenant-scoped.

Examples:

```text
Shipment Report
Driver Report
Vehicle Report
Revenue Report
Delivery Report
```

Each report must use the current tenant context.

---

# 121. Tenant Context and File Uploads

Uploads must automatically associate with the current tenant.

The user should not manually select:

```text
tenantId
```

for normal tenant operations.

---

# 122. Tenant Context and Notifications

Tenant-specific notifications must be filtered by:

```text
tenantId
+
userId
```

---

# 123. Tenant Context and Audit Logs

Audit events should automatically receive:

```text
tenantId
+
userId
```

from trusted server context.

Do not accept these values blindly from the client.

---

# 124. Tenant Context and Logging

Every tenant-sensitive request should be traceable through:

```text
requestId
userId
tenantId
```

where operationally appropriate.

---

# 125. Tenant Context and Errors

Error logs should preserve:

```text
requestId
tenantId
userId
errorCode
```

without logging secrets or sensitive payloads.

---

# 126. Tenant Context and External Integrations

Future logistics integrations may include:

```text
Maps
SMS
Email
Payment providers
Carrier APIs
Fleet tracking
Cloud storage
Webhook providers
```

Tenant-specific credentials must be scoped to the correct tenant.

Never use Tenant A's integration credentials for Tenant B.

---

# 127. Encryption

Tenant-specific sensitive configuration should be encrypted where appropriate.

Examples:

```text
API keys
Webhook secrets
OAuth credentials
External service credentials
```

Do not store secrets in branding configuration.

---

# 128. Tenant Onboarding

Future onboarding flow:

```text
Create Account
     ↓
Create Organization
     ↓
Configure Organization
     ↓
Configure Branding
     ↓
Invite Users
     ↓
Assign Roles
     ↓
Complete Setup
```

The architecture should make this possible without redesigning the system later.

---

# 129. Tenant Invitation Flow

Potential lifecycle:

```text
Tenant Admin
    ↓
Invite email
    ↓
Invitation token
    ↓
User accepts
    ↓
Membership created
    ↓
Role assigned
    ↓
Tenant becomes available
```

Invitation tokens must be securely generated and expire.

---

# 130. Tenant Membership Security

An invitation for Tenant A must never allow the recipient to join Tenant B.

The invitation must be cryptographically and logically tied to the intended tenant.

---

# 131. Tenant Domain Strategy

White-label may eventually support:

```text
acme.example.com
fasttrack.example.com
```

or custom domains:

```text
app.acmelogistics.com
```

The current architecture should avoid assumptions that prevent domain-based tenant resolution later.

---

# 132. Domain Resolution

Future architecture:

```text
HTTP Host
    ↓
Domain Resolver
    ↓
Tenant
    ↓
Authentication
    ↓
Tenant Context
```

If implemented later, domain resolution must still verify that the authenticated user is authorized for the resolved tenant.

---

# 133. Tenant Slug vs Domain

Do not make tenant slug and domain the same concept.

A tenant can have:

```text
slug = acme-logistics
domain = app.acme.com
```

They serve different purposes.

---

# 134. Tenant Metadata

Potential metadata:

```text
name
slug
status
timezone
locale
currency
industry
contact information
```

Only store fields actually required by the product.

Avoid premature schema expansion.

---

# 135. Tenant Limits

Future subscription/billing support may require:

```text
maxUsers
maxVehicles
maxShipments
storageLimit
APIRequestLimit
```

These should be tenant-scoped but should not be mixed into authorization logic prematurely.

---

# 136. Tenant Quotas

Quota enforcement should occur centrally.

Example:

```text
Tenant creates vehicle
      ↓
Check tenant quota
      ↓
Allowed
```

The client must not be trusted to enforce quotas.

---

# 137. Tenant Billing Readiness

If billing is introduced later:

```text
Tenant
  ↓
Subscription
  ↓
Plan
  ↓
Limits
  ↓
Feature Access
```

Do not make billing assumptions part of the first tenant implementation unless required.

---

# 138. Tenant Analytics

Tenant analytics must use tenant-scoped queries.

Platform analytics may aggregate across tenants only through explicitly authorized platform services.

---

# 139. Data Export

Tenant administrators may export their own data.

Exports must be:

```text
tenant scoped
permission controlled
audited
```

Platform exports require platform-level permissions.

---

# 140. Data Import

Imports must automatically associate records with the current tenant.

Do not allow uploaded files to specify an arbitrary tenant ownership field for normal tenant users.

---

# 141. Tenant Security Invariants

The implementation must preserve these invariants:

### Invariant 1

Every tenant-owned record has an unambiguous tenant owner.

### Invariant 2

Every tenant operation executes inside an authenticated tenant context.

### Invariant 3

Tenant IDs supplied by clients are never trusted for authorization.

### Invariant 4

Every tenant-owned query is tenant-scoped.

### Invariant 5

Cross-tenant relationships are rejected.

### Invariant 6

RBAC permissions do not bypass tenant isolation.

### Invariant 7

Tenant switching refreshes authorization and tenant-specific state.

### Invariant 8

Tenant branding follows the active tenant.

### Invariant 9

Background jobs preserve tenant context.

### Invariant 10

Platform privileges are explicit and auditable.

---

# 142. Implementation Rules

Before modifying code:

1. Inspect existing Prisma schema.
2. Inspect authentication implementation.
3. Inspect RBAC implementation.
4. Inspect API request context.
5. Inspect API endpoint architecture.
6. Inspect shared API contracts.
7. Inspect Admin authentication state.
8. Inspect React Query configuration.
9. Inspect Zustand stores.
10. Inspect existing White-Label architecture.
11. Inspect existing audit logging.
12. Inspect existing tests.

Do not assume the repository structure from this document.

The repository is the source of truth.

---

# 143. Do Not Rebuild Existing Systems

Do not replace:

- JWT authentication
- refresh-token rotation
- existing RBAC
- existing API client
- React Query
- Zustand
- React Router
- existing centralized endpoints
- existing White-Label system
- existing Admin layout
- existing Slash Admin integration

unless an actual architectural incompatibility is demonstrated.

---

# 144. Reference Repository Rules

If the repository contains:

```text
_Reference/slash-admin
```

it must remain read-only.

Do not:

- modify it
- refactor it
- import application-specific business logic into it
- use it as a second application
- create another Admin application based on it

Use it only as UI/design/reference material.

---

# 145. Documentation Deliverable

Create:

```text
docs/multi-tenant/
└── MULTI-TENANT-ARCHITECTURE.md
```

This document is the architectural source of truth for multi-tenancy.

Additional implementation documents may later be created:

```text
docs/multi-tenant/
├── MULTI-TENANT-ARCHITECTURE.md
├── MULTI-TENANT-DATABASE.md
├── MULTI-TENANT-AUTHENTICATION.md
├── MULTI-TENANT-RBAC.md
├── MULTI-TENANT-API.md
├── MULTI-TENANT-ADMIN.md
├── MULTI-TENANT-TESTING.md
└── MULTI-TENANT-MIGRATION.md
```

Do not create these additional files unless requested.

---

# 146. Proposed Implementation Phases

## Phase 1 — Architecture Audit

Inspect:

```text
apps/api
apps/admin
packages/api-contracts
prisma
docs
```

Identify existing:

```text
User
Role
Permission
Auth
Request Context
API Client
Branding
Audit
```

Deliver an implementation plan based on actual code.

---

## Phase 2 — Database Model

Implement:

```text
Tenant
TenantMembership
Tenant-specific relationships
Tenant-aware branding
```

Only add models/fields required by the existing architecture.

---

## Phase 3 — Authentication Context

Integrate tenant context with the existing authentication system.

Implement:

```text
User
 ↓
Membership
 ↓
Active Tenant
```

---

## Phase 4 — Tenant Middleware

Centralize:

```text
Tenant resolution
Tenant validation
Tenant status
Membership validation
```

---

## Phase 5 — RBAC Integration

Make existing RBAC tenant-aware.

Verify:

```text
User
 ↓
Tenant Membership
 ↓
Role
 ↓
Permission
```

---

## Phase 6 — Prisma Isolation

Update tenant-owned queries.

Add:

```text
tenantId
indexes
constraints
ownership checks
```

---

## Phase 7 — API Contracts

Update shared TypeBox contracts.

Ensure Admin consumes the same contracts.

---

## Phase 8 — Admin Integration

Implement:

```text
TenantProvider
TenantSwitcher
Tenant-aware query keys
Tenant bootstrap
```

only where required.

---

## Phase 9 — White-Label Integration

Connect:

```text
Active Tenant
      ↓
Tenant Branding
      ↓
Existing BrandingProvider
```

No duplicate branding architecture.

---

## Phase 10 — Security Testing

Test:

```text
cross-tenant read
cross-tenant update
cross-tenant delete
cross-tenant search
cross-tenant export
cross-tenant relationship
tenant switching
membership revocation
tenant suspension
RBAC isolation
branding isolation
cache isolation
```

---

# 147. Acceptance Criteria

Multi-tenancy is considered correctly implemented only when:

### Tenant Model

- [ ] Tenant model exists.
- [ ] Tenant lifecycle is defined.
- [ ] Tenant slug uniqueness is enforced.
- [ ] Tenant status is enforced.

### Membership

- [ ] Users can belong to tenants.
- [ ] Membership status is enforced.
- [ ] Membership authorization is centralized.

### Authentication

- [ ] Existing authentication remains functional.
- [ ] Tenant context integrates with authentication.
- [ ] Tenant switching is secure.
- [ ] Suspended tenants cannot operate normally.

### RBAC

- [ ] Existing RBAC remains functional.
- [ ] Roles are tenant-aware.
- [ ] Permissions are tenant-scoped through membership/role context.
- [ ] Platform permissions are separate.

### Database

- [ ] Tenant-owned records have tenant ownership.
- [ ] Tenant indexes exist where appropriate.
- [ ] Tenant-scoped uniqueness is enforced.
- [ ] Cross-tenant relationships are prevented.
- [ ] Migration is safe.

### API

- [ ] Tenant context is centralized.
- [ ] Tenant IDs from clients are not trusted.
- [ ] Resource queries are tenant-scoped.
- [ ] Search is tenant-scoped.
- [ ] Reports are tenant-scoped.
- [ ] Exports are tenant-scoped.

### Admin

- [ ] Active tenant is centralized.
- [ ] Tenant switching works.
- [ ] React Query cache is tenant-safe.
- [ ] Navigation respects tenant permissions.
- [ ] Tenant-specific data does not leak between tenants.

### White-Label

- [ ] Tenant branding is isolated.
- [ ] App name changes correctly.
- [ ] Logo changes correctly.
- [ ] Icon changes correctly.
- [ ] Favicon changes correctly.
- [ ] Theme colors change correctly.

### Security

- [ ] IDOR tests pass.
- [ ] Cross-tenant access tests pass.
- [ ] Membership revocation tests pass.
- [ ] Tenant suspension tests pass.
- [ ] Background jobs preserve tenant context.
- [ ] Audit logs are tenant-aware.

---

# 148. Example End-to-End Request

Consider:

```text
User:
John

Tenant:
Acme Logistics

Permission:
shipment.read
```

John requests:

```http
GET /api/v1/shipments
```

The system performs:

```text
HTTP Request
     ↓
JWT validation
     ↓
John identified
     ↓
Resolve John → Acme membership
     ↓
Membership ACTIVE
     ↓
Resolve tenant = ACME
     ↓
Check shipment.read
     ↓
Execute:
WHERE tenantId = ACME
     ↓
Return ACME shipments
```

The system must never execute:

```sql
SELECT * FROM shipments;
```

without tenant filtering for a tenant-scoped request.

---

# 149. Example Cross-Tenant Attack

Attacker belongs to:

```text
Tenant A
```

They discover:

```text
Shipment ID = 999
```

which belongs to:

```text
Tenant B
```

They send:

```http
GET /api/v1/shipments/999
```

The API must:

```text
Authenticate attacker
        ↓
Resolve Tenant A
        ↓
Query:
shipment.id = 999
AND
shipment.tenantId = Tenant A
        ↓
No matching resource
        ↓
Return safe response
```

Tenant B's shipment must never be returned.

---

# 150. Final Architecture

The target architecture is:

```text
                         ┌──────────────────────┐
                         │      PostgreSQL      │
                         │                      │
                         │ Tenant A             │
                         │ Tenant B             │
                         │ Tenant C             │
                         └──────────▲───────────┘
                                    │
                              Tenant-scoped
                                 Prisma
                                    │
                         ┌──────────┴───────────┐
                         │      Fastify API     │
                         │                      │
                         │ Authentication       │
                         │ Tenant Resolution    │
                         │ Tenant Context       │
                         │ RBAC                 │
                         │ Business Services    │
                         │ Audit                │
                         └──────────▲───────────┘
                                    │
                             Shared Contracts
                                    │
                         ┌──────────┴───────────┐
                         │    React Admin       │
                         │                      │
                         │ Tenant Provider      │
                         │ Tenant Switcher      │
                         │ React Query          │
                         │ Zustand              │
                         │ RBAC UI              │
                         │ Branding Provider    │
                         └──────────────────────┘
```

---

# 151. Security Boundary

The fundamental security boundary is:

```text
                    USER
                      │
                      ▼
                AUTHENTICATION
                      │
                      ▼
               TENANT MEMBERSHIP
                      │
                      ▼
                TENANT CONTEXT
                      │
                      ▼
                  RBAC
                      │
                      ▼
             RESOURCE OWNERSHIP
                      │
                      ▼
              TENANT-SCOPED QUERY
                      │
                      ▼
                 DATABASE
```

Every layer matters.

---

# 152. Final Rule

The most important rule in the entire architecture is:

> **Tenant isolation is a security requirement, not a frontend filtering feature.**

The frontend may know the active tenant, but the backend must enforce tenant ownership.

The API must derive and validate tenant context.

The services must operate within that context.

Prisma queries must be tenant-scoped.

Relationships must not cross tenant boundaries.

RBAC must operate within the tenant.

Caches, jobs, events, files, notifications, reports, exports, and audit logs must preserve tenant boundaries.

White-label branding must follow the authenticated tenant.

Platform-level operations must be explicit and permission-controlled.

The system must remain secure even if a malicious client completely ignores the Admin UI and directly calls the API.

---

# 153. Definition of Done

Multi-tenancy is **not complete** merely because a `tenantId` column exists.

It is complete only when:

```text
Identity
   +
Membership
   +
Tenant Context
   +
RBAC
   +
Database Isolation
   +
API Isolation
   +
Admin Isolation
   +
Cache Isolation
   +
Background Job Isolation
   +
Branding Isolation
   +
Audit Isolation
   +
Security Tests
```

all work together as one coherent architecture.

The implementation must prioritize **security, correctness, maintainability, and future scalability** over minimizing the number of files or lines of code.
