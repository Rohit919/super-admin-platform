# SUPER-ADMIN-FRONTEND-ARCHITECTURE-PLAN.md

# Super Admin Frontend — Architecture & Planning

**Application:** `apps/super-admin`  
**Role:** SaaS Control Plane  
**Status:** Active Architecture Specification

---

## 1. What This Application Is

`apps/super-admin` is the frontend for the **SaaS platform control plane**.

It is not:

- a Logistics Admin dashboard;
- a tenant operations console;
- a shipment management application;
- a driver management application.

The application manages the platform that hosts multiple tenants.

```text
                         SaaS Platform
                              │
                              ▼
                    ┌──────────────────┐
                    │   Super Admin    │
                    │      Panel       │
                    └────────┬─────────┘
                             │
             ┌───────────────┼────────────────┐
             ▼               ▼                ▼
          Tenants       Platform Users    Platform Config
             │               │                │
             └───────────────┼────────────────┘
                             ▼
                       Platform API
                             ▼
                       Platform DB
```

---

# 2. Control Plane vs Operational Plane

This is the most important architectural distinction.

```text
┌───────────────────────────────────────┐
│          SUPER ADMIN PLATFORM         │
│                                       │
│  SaaS / Control Plane                 │
│                                       │
│  • Tenants                            │
│  • Platform Users                     │
│  • Platform RBAC                      │
│  • Plans / Entitlements               │
│  • Provisioning                       │
│  • Feature Flags                      │
│  • API Credentials                    │
│  • Audit / Security                   │
│  • Platform Settings                  │
└───────────────────┬───────────────────┘
                    │
                    │ platform boundary
                    ▼
┌───────────────────────────────────────┐
│           LOGISTICS PLATFORM          │
│                                       │
│  Operational Plane                    │
│                                       │
│  • Shipments                          │
│  • Orders                             │
│  • Drivers                            │
│  • Vehicles                           │
│  • Routes                             │
│  • Dispatch                            │
│  • Warehouses                         │
│  • Delivery                           │
└───────────────────────────────────────┘
```

The Super Admin UI must not absorb the second box.

---

# 3. Target Repository

```text
super-admin-platform/
│
├── apps/
│   ├── platform-api/
│   └── super-admin/
│
├── packages/
│   └── api-contracts/
│
├── prisma/
├── docs/
└── scripts/
```

Current runtime:

```text
apps/super-admin
        │
        ▼
apps/platform-api
        │
        ▼
current Platform PostgreSQL DB
```

Future:

```text
super-admin-platform
    super-admin → platform-api → platform_db

logistics-platform
    admin      → api          → logistics_db
```

The physical database split should happen when the Logistics Platform is actually established. Do not fake a second database in the Super Admin repository.

---

# 4. Platform Domains

The Super Admin frontend should be organized around these domains:

```text
Platform
│
├── Dashboard
├── Tenants
├── Platform Identity
│   ├── Platform Users
│   ├── Platform Roles
│   └── Platform Permissions
│
├── Tenant Lifecycle
│   ├── Provisioning
│   ├── Activation
│   ├── Suspension
│   └── Archival
│
├── Commercial / Entitlements
│   ├── Plans
│   ├── Limits
│   └── Feature Entitlements
│
├── Configuration
│   ├── Platform Settings
│   ├── Feature Flags
│   ├── Branding
│   └── Integrations
│
├── Security
│   ├── Audit Logs
│   ├── Login Activity
│   ├── Sessions
│   └── Security Events
│
└── API Access
    └── Tenant API Credentials
```

---

# 5. Dashboard Architecture

The dashboard aggregates platform-level information.

Recommended API:

```http
GET /api/v1/platform/dashboard
```

Potential response concepts:

```text
tenantCount
activeTenantCount
suspendedTenantCount
pendingProvisioningCount
platformUserCount
recentSecurityEvents
recentAuditEvents
systemHealth
integrationHealth
```

The frontend should not create a logistics dashboard.

Do not calculate:

```text
shipmentCount
driverCount
deliveryCount
vehicleUtilization
routePerformance
```

unless a future, explicitly approved platform-analytics feature requires them.

---

# 6. Tenant Architecture

Tenant is a first-class platform resource.

```text
Tenant
├── identity
├── lifecycle
├── plan
├── entitlements
├── provisioning
├── branding
├── configuration
├── credentials
├── integrations
├── usage
└── audit
```

Tenant detail is a platform-management screen.

It is not a portal into the tenant's operational database.

---

# 7. Tenant Lifecycle State Machine

```text
                 ┌──────────────┐
                 │   PENDING    │
                 └──────┬───────┘
                        │ provision
                        ▼
                 ┌──────────────┐
                 │ PROVISIONING │
                 └──────┬───────┘
                        │ success
                        ▼
                 ┌──────────────┐
            ┌───▶│    ACTIVE    │◀───┐
            │    └──────┬───────┘    │
            │           │             │
       activate      suspend       archive
            │           ▼             │
            │    ┌──────────────┐      │
            └────│  SUSPENDED   │      │
                 └──────────────┘      │
                                       ▼
                                ┌──────────────┐
                                │   ARCHIVED   │
                                └──────────────┘
```

Only backend-supported transitions should be exposed.

---

# 8. Platform Identity Architecture

Platform identity is separate from tenant identity.

```text
Platform User
    ↓
Platform Membership
    ↓
Platform Role
    ↓
Platform Permission
```

Example platform roles:

```text
SUPER_ADMIN
PLATFORM_ADMIN
PLATFORM_SUPPORT
PLATFORM_OPERATIONS
PLATFORM_AUDITOR
```

These are not tenant roles.

---

# 9. Platform RBAC

Use permission-based authorization.

Example:

```text
platform.dashboard.read
platform.tenant.read
platform.tenant.create
platform.tenant.update
platform.tenant.suspend
platform.tenant.activate

platform.user.read
platform.user.create
platform.user.update
platform.user.disable

platform.role.read
platform.role.manage

platform.permission.read

platform.audit.read
platform.security.read

platform.settings.read
platform.settings.update

platform.feature_flag.manage
platform.entitlement.manage
platform.credentials.manage
```

The backend is authoritative.

```text
Frontend permission check
        ↓
       UX
        │
        └───────────────┐
                        ▼
                 Platform API
                        ↓
                Authorization check
                        ↓
                    Allow/Deny
```

---

# 10. Tenant vs Platform Permissions

Never mix namespaces.

```text
PLATFORM
platform.tenant.suspend

TENANT
shipment.read
driver.read
vehicle.update
```

A tenant permission must never grant a platform permission.

---

# 11. Platform Users vs Tenant Users

The Super Admin frontend may manage:

```text
Platform Users
```

It should not recreate a full:

```text
Tenant Users
```

administration module.

A platform user can have platform access without belonging to every tenant.

If a platform administrator needs to inspect tenant membership, that is a targeted platform capability under Tenant Detail, not a second Tenant Admin application.

---

# 12. Tenant Detail Design

Recommended tabs:

```text
Overview
Lifecycle
Plan & Entitlements
Provisioning
Configuration
Branding
API Credentials
Integrations
Usage
Security
Audit
```

Avoid:

```text
Shipments
Orders
Drivers
Vehicles
Routes
Dispatch
Delivery
Warehouse
```

Those belong to the Logistics Platform.

---

# 13. Support Access Architecture

Support access is an exceptional capability.

Normal state:

```text
Super Admin
     ↓
Platform API
     ↓
Platform Resources
```

Support state, only if implemented:

```text
Super Admin
     ↓
Request Support Access
     ↓
Tenant Selection
     ↓
Explicit Confirmation
     ↓
Temporary Support Context
     ↓
Target System API
```

Rules:

- time-limited;
- explicit;
- permission-controlled;
- visible in UI;
- fully audited;
- original platform actor preserved;
- no credential sharing;
- no hidden permanent backdoor.

---

# 14. API Architecture

The Super Admin frontend communicates with the Platform API.

```text
React
  ↓
Module hook
  ↓
Module API service
  ↓
Central API client
  ↓
Shared contracts
  ↓
Platform API
```

All platform routes should use the platform namespace:

```text
/api/v1/platform/*
```

Examples:

```text
/api/v1/platform/dashboard
/api/v1/platform/tenants
/api/v1/platform/users
/api/v1/platform/roles
/api/v1/platform/permissions
/api/v1/platform/audit-logs
/api/v1/platform/settings
/api/v1/platform/feature-flags
```

Use the repository's centralized endpoint registry rather than hardcoding URLs in components.

---

# 15. Frontend Module Structure

```text
apps/super-admin/src/
│
├── app/
│   ├── router/
│   ├── providers/
│   └── guards/
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── data-table/
│   ├── forms/
│   └── feedback/
│
├── modules/
│   ├── auth/
│   ├── dashboard/
│   ├── tenants/
│   ├── platform-users/
│   ├── platform-roles/
│   ├── platform-permissions/
│   ├── provisioning/
│   ├── plans/
│   ├── entitlements/
│   ├── feature-flags/
│   ├── credentials/
│   ├── integrations/
│   ├── audit/
│   ├── security/
│   └── settings/
│
├── lib/
├── stores/
├── hooks/
├── i18n/
├── styles/
└── test/
```

The module list itself is an architectural boundary.

---

# 16. Routing Model

```text
Public
├── /login
├── /forgot-password
├── /verify-otp
└── /reset-password

Protected
├── /dashboard
│
├── /tenants
├── /tenants/:tenantId
├── /tenants/:tenantId/provisioning
├── /tenants/:tenantId/entitlements
├── /tenants/:tenantId/branding
├── /tenants/:tenantId/credentials
├── /tenants/:tenantId/audit
│
├── /platform-users
├── /platform-roles
├── /platform-permissions
│
├── /plans
├── /entitlements
├── /feature-flags
├── /provisioning
│
├── /integrations
├── /audit
├── /security
└── /settings
```

Every protected route is permission-aware.

---

# 17. State Architecture

## TanStack Query

Use for server state:

```text
Dashboard
Tenants
Tenant Detail
Provisioning
Platform Users
Platform Roles
Permissions
Plans
Entitlements
Feature Flags
Credentials
Audit Logs
Security Events
Integrations
Settings
```

## Zustand / React state

Use for:

```text
UI state
Theme
Sidebar
Temporary filters
Modal state
Authentication bootstrap state where required
```

Server state must not be duplicated into Zustand unnecessarily.

---

# 18. Security Architecture

The browser must never contain platform secrets.

Do not store:

```text
passwords
refresh tokens
API secrets
database credentials
service credentials
```

in JavaScript-readable storage.

For tenant API credentials:

```text
Public Key → displayable
Secret     → one-time sensitive display
Secret Hash → backend only
```

---

# 19. Audit Architecture

Every privileged action should generate an audit event.

Example:

```text
actorUserId
action
resourceType
resourceId
tenantId
timestamp
requestId
result
metadata
```

Examples:

```text
platform.tenant.created
platform.tenant.suspended
platform.tenant.activated
platform.user.invited
platform.role.changed
platform.permission.changed
platform.credential.rotated
platform.feature_flag.changed
platform.settings.changed
```

The real actor must always be preserved.

---

# 20. Platform Security Center

The Super Admin security area can expose:

```text
Security
├── Login Activity
├── Failed Login Attempts
├── Active Sessions
├── Session Revocations
├── Privileged Actions
├── Security Events
└── Audit Logs
```

These are platform security concerns.

---

# 21. Platform Configuration

Separate configuration into two levels.

```text
Platform Configuration
        │
        ├── Global Defaults
        ├── Security
        ├── Integrations
        ├── Email
        ├── Storage
        └── Platform Branding

Tenant Configuration
        │
        ├── Tenant Settings
        ├── Branding
        ├── Entitlements
        └── Tenant Credentials
```

A tenant configuration must never silently modify global platform configuration.

---

# 22. Platform Branding

The Super Admin UI always uses platform identity.

```text
Super Admin
    ↓
Platform Name
Platform Logo
Platform Theme
Platform Support Identity
```

When viewing a tenant:

```text
Tenant Detail
    ↓
Tenant Branding
```

Tenant branding must not replace the Super Admin application's platform identity.

---

# 23. Plans and Entitlements

Plans belong to the SaaS control plane.

```text
Plan
├── name
├── status
├── limits
├── features
└── metadata
```

Tenant assignment:

```text
Tenant
   ↓
Plan
   ↓
Entitlements
   ↓
Enabled platform capabilities
```

The Super Admin UI manages the entitlement decision.

The actual Logistics feature remains in the Logistics Platform.

---

# 24. Feature Flags

Global:

```text
Feature Flag
    ↓
Platform default
```

Tenant override:

```text
Feature Flag
    ↓
Tenant override
```

Do not put implementation of the flagged Logistics feature into this repository.

---

# 25. API Credential Architecture

The platform may issue tenant API credentials.

Lifecycle:

```text
Create
  ↓
Active
  ↓
Rotate
  ↓
Revoked / Expired
```

UI responsibilities:

- show status;
- create;
- rotate;
- revoke;
- show expiry;
- show last-used metadata;
- show audit information.

Secret values must not be persisted in frontend state.

---

# 26. Authentication Architecture

```text
Super Admin
     ↓
Login
     ↓
Platform authentication
     ↓
Platform access verification
     ↓
Platform permissions
     ↓
Dashboard
```

Password reset:

```text
Forgot Password
     ↓
OTP
     ↓
Verify OTP
     ↓
Reset Password
     ↓
Login
```

Use the existing authentication architecture rather than creating a second password system.

---

# 27. Technology Architecture

Keep the established frontend stack unless an explicit migration is approved.

```text
React
TypeScript
Vite
React Router
TanStack Query
Zustand
Tailwind / shadcn
React Hook Form
Zod
i18next
Vitest
```

Do not introduce another UI framework merely to make the application look like a different admin template.

---

# 28. Data Flow

Read:

```text
Page
 ↓
Hook
 ↓
API Service
 ↓
Central Client
 ↓
Platform API
 ↓
Platform DB
```

Write:

```text
Form
 ↓
Validation
 ↓
Mutation
 ↓
API Service
 ↓
Platform API
 ↓
Authorization
 ↓
Business Rule
 ↓
Database
 ↓
Audit
```

The frontend does not implement platform business rules.

---

# 29. Visual Language

The visual language should communicate:

```text
CONTROL PLANE
PLATFORM OPERATIONS
SECURITY
TENANT LIFECYCLE
CONFIGURATION
```

Recommended UI patterns:

- enterprise data tables;
- tenant status indicators;
- lifecycle timelines;
- provisioning progress;
- audit timelines;
- security alerts;
- permission matrices;
- configuration forms;
- system health cards.

Avoid UI patterns that make it look like a dispatch/operations application.

---

# 30. Explicit Non-Goals

This repository must not contain:

```text
Shipment Management
Order Management
Driver Management
Vehicle Management
Route Management
Dispatch Management
Delivery Management
Warehouse Management
Proof of Delivery
Driver Tracking
Logistics Reports
Logistics Operations Dashboard
```

If a requirement appears to need one of these, stop and determine whether it belongs in `logistics-platform`.

---

# 31. Architecture Validation Checklist

Before implementing a new Super Admin module, ask:

### Question 1

Does this manage the SaaS platform?

If no → probably not Super Admin.

### Question 2

Does this operate a tenant's business?

If yes → Logistics/Tenant Admin.

### Question 3

Does this require direct Logistics DB access?

If yes → wrong boundary.

### Question 4

Can this be expressed as a platform permission?

If yes → define a platform permission.

### Question 5

Does this privileged action need auditability?

If yes → backend audit event required.

---

# 32. Definition of Done

The architecture is correct when:

- [ ] Super Admin is clearly a SaaS control plane
- [ ] Tenant Admin concepts are not copied into the UI
- [ ] Logistics operations are excluded
- [ ] Platform Users are separate from Tenant Users
- [ ] Platform RBAC is separate from Tenant RBAC
- [ ] Tenant lifecycle is first-class
- [ ] Provisioning is first-class
- [ ] Plans and entitlements are platform concerns
- [ ] Feature flags are platform-controlled
- [ ] API credentials are platform security resources
- [ ] Audit and security are first-class modules
- [ ] Platform settings are separate from tenant settings
- [ ] Platform branding is separate from tenant branding
- [ ] API endpoints are centralized
- [ ] API contracts are shared
- [ ] Frontend never accesses Prisma directly
- [ ] Backend remains the authorization boundary
- [ ] Privileged operations are auditable
- [ ] Future Logistics integration remains an API boundary

---

# 33. Final Architecture Principle

```text
                 SUPER ADMIN
                      │
                      ▼
              SaaS CONTROL PLANE
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
    Tenants       Platform IAM    Configuration
       │              │              │
       └──────────────┼──────────────┘
                      ▼
                 Platform API
                      │
                      ▼
                 Platform DB


                 LOGISTICS ADMIN
                      │
                      ▼
              TENANT OPERATIONS
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
   Shipments        Drivers        Vehicles
       │              │              │
       └──────────────┼──────────────┘
                      ▼
                 Logistics API
                      │
                      ▼
                 Logistics DB
```

> **Super Admin controls the platform.**
>
> **Logistics Admin operates the tenant.**
>
> The frontend architecture must preserve that distinction at every level: navigation, routes, modules, API contracts, permissions, database boundaries, and business logic.
