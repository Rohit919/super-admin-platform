# SUPER-ADMIN-FRONTEND-PLAN.md

# Super Admin Frontend Plan

**Status:** Active implementation plan  
**Application:** `apps/super-admin`  
**Repository:** `super-admin-platform`

> This document defines a **true Super Admin / SaaS Control Plane UI**.
> It is not a renamed Tenant Admin panel and must not contain Logistics operational screens.

---

## 1. Product Definition

The Super Admin Panel is the **control plane of the entire SaaS platform**.

```text
                    SaaS Platform
                         │
                         ▼
                 ┌───────────────┐
                 │  SUPER ADMIN  │
                 │    PANEL      │
                 └───────┬───────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       Platform       Tenants        Platform
       Users          Lifecycle      Configuration
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                    Platform API
                         │
                         ▼
                    Platform DB
```

The Super Admin manages the **SaaS platform itself** and the organizations using it.

It does **not** operate a customer's logistics business.

---

# 2. Strict Boundary

## Super Admin owns

- Platform dashboard
- Platform health and operational visibility
- Tenant lifecycle
- Tenant onboarding/provisioning
- Tenant subscription/plan information
- Tenant status
- Platform users
- Platform memberships
- Platform roles
- Platform permissions
- Platform-wide feature flags
- Tenant-level feature entitlements
- Platform configuration
- Audit/security logs
- Platform API credentials
- Platform integrations/configuration
- Support access workflows
- Platform branding
- Super Admin account/session security

## Super Admin does NOT own

- Shipments
- Orders
- Drivers
- Vehicles
- Routes
- Warehouses
- Dispatch operations
- Delivery operations
- Customer logistics workflows
- Tenant operational dashboards
- Tenant operational reports
- Tenant employee management as a normal tenant-admin feature
- Direct access to a tenant database

Those belong to:

```text
logistics-platform
├── api
└── admin
```

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

Runtime:

```text
Super Admin
     │
     ▼
Platform API
     │
     ▼
Platform DB
```

The browser never talks directly to Prisma/PostgreSQL.

---

# 4. Super Admin Navigation

The primary navigation should be platform-oriented.

```text
SUPER ADMIN
│
├── Dashboard
│
├── Tenants
│   ├── All Tenants
│   ├── Pending
│   ├── Active
│   ├── Suspended
│   └── Archived
│
├── Platform
│   ├── Platform Users
│   ├── Roles
│   ├── Permissions
│   ├── Feature Flags
│   └── Platform Settings
│
├── Operations
│   ├── Provisioning
│   ├── System Health
│   ├── Background Jobs
│   └── Integrations
│
├── Security
│   ├── Audit Logs
│   ├── Login Activity
│   ├── Sessions
│   └── Security Events
│
└── Configuration
    ├── Plans
    ├── Tenant Entitlements
    ├── API Credentials
    └── Platform Branding
```

Only expose a navigation item when the current platform principal has the corresponding permission.

---

# 5. Dashboard

The dashboard is a **platform operations dashboard**, not a business/logistics dashboard.

## Recommended widgets

```text
Platform Overview

┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Total Tenants  │ │ Active Tenants │ │ Suspended      │
│                │ │                │ │ Tenants        │
└────────────────┘ └────────────────┘ └────────────────┘

┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Platform Users │ │ Provisioning   │ │ System Health  │
│                │ │ Pending        │ │                │
└────────────────┘ └────────────────┘ └────────────────┘
```

Additional sections:

- Recent tenant registrations
- Recent provisioning failures
- Recent security events
- Recent privileged actions
- API/system health
- Integration health
- Platform usage trends

Do not put:

```text
Today's Shipments
Today's Deliveries
Driver Performance
Vehicle Utilization
Route Performance
```

on this dashboard.

---

# 6. Tenant Management

The tenant section is the most important Super Admin business module.

A tenant represents a customer organization using the SaaS platform.

## Tenant list

Columns:

```text
Tenant ID
Organization Name
Plan
Status
Region
Created At
Last Activity
Provisioning Status
Actions
```

Filters:

```text
Search
Status
Plan
Region
Created Date
Provisioning Status
```

## Tenant lifecycle

```text
CREATE
  ↓
PROVISIONING
  ↓
ACTIVE
  │
  ├── SUSPENDED
  │      ↓
  │    ACTIVE
  │
  └── ARCHIVED
```

## Tenant actions

Allowed platform-level actions may include:

- Create
- View
- Edit platform metadata
- Activate
- Suspend
- Archive
- Re-provision when explicitly supported
- View provisioning status
- View tenant configuration
- Manage entitlements
- Manage tenant API credentials
- Manage tenant branding
- View tenant usage/health
- View tenant audit activity

Hard deletion should not be a normal UI action.

---

# 7. Tenant Detail

The Tenant Detail page is still platform-level.

```text
Tenant
│
├── Overview
├── Lifecycle
├── Plan / Entitlements
├── Provisioning
├── Configuration
├── Branding
├── API Credentials
├── Integrations
├── Usage
├── Security
└── Audit
```

Important:

> Tenant Detail must not become a Logistics Admin dashboard.

For example, do not create:

```text
Tenant
└── Shipments
    └── Drivers
        └── Routes
```

inside the Super Admin frontend.

If support access to tenant operations is required later, it must use an explicit, time-limited, audited support/impersonation boundary.

---

# 8. Platform Users

This is **Platform User Management**, not normal Tenant User Management.

Platform users are people who operate the SaaS control plane.

Example:

```text
Platform Users
│
├── Super Admin
├── Platform Administrator
├── Platform Support
├── Platform Operations
└── Platform Auditor
```

A platform user is not automatically inserted into every tenant.

## Capabilities

- List platform users
- Search
- View
- Invite
- Activate/deactivate
- Assign platform roles
- Remove platform access
- Review platform sessions
- Review login/security activity

Do not use the tenant's user-management UI here.

---

# 9. Platform RBAC

Platform RBAC must be separate from tenant RBAC.

```text
Platform User
      ↓
Platform Membership
      ↓
Platform Role
      ↓
Platform Permissions
      ↓
Super Admin Action
```

Example permission namespace:

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
platform.role.read
platform.role.manage
platform.permission.read
platform.audit.read
platform.settings.read
platform.settings.update
platform.credentials.manage
platform.feature_flags.manage
```

Do not use tenant permissions such as:

```text
shipment.read
driver.update
vehicle.delete
```

as Super Admin navigation permissions.

---

# 10. Permissions Screen

> **HISTORICAL (superseded by Phase 20.2):** A Platform Permissions administration
> screen is intentionally **out of current Super Admin scope**. Platform permissions
> remain active as authorization controls; no CRUD UI is planned. See
> `PHASE-20-2` scope decision and `PLATFORM-API.md` §5. The section below is
> retained as original planning history only.

The Permissions page is a platform permission registry.

Display:

```text
Permission
Description
Resource
Action
Used By Roles
```

Group by platform resource:

```text
Dashboard
Tenants
Platform Users
Platform Roles
Platform Permissions
Audit
Security
Settings
Feature Flags
Credentials
Integrations
```

The page should explain what each permission allows.

---

# 11. Roles Screen

> **HISTORICAL (superseded by Phase 20.2):** A Platform Roles administration screen
> is intentionally **out of current Super Admin scope**. Platform RBAC enforcement
> (`requirePlatformPermission`, `PlatformMembership`, `SUPER_ADMIN`) remains fully
> active; a role-management CRUD UI is not a current product requirement. See
> `PLATFORM-API.md` §5. The section below is retained as original planning history only.

Platform roles are roles for operating the SaaS platform.

Example:

```text
SUPER_ADMIN
PLATFORM_ADMIN
PLATFORM_SUPPORT
PLATFORM_OPERATIONS
PLATFORM_AUDITOR
```

The UI should allow authorized platform administrators to:

- Create custom platform roles
- Edit descriptions
- Assign platform permissions
- Review role members
- Disable/delete custom roles where safe

System roles must be protected from destructive modification.

---

# 12. Provisioning

Provisioning is a first-class Super Admin operation.

When creating a tenant:

```text
Super Admin
     ↓
Create Tenant
     ↓
Provision Tenant
     ├── Tenant metadata
     ├── Initial configuration
     ├── Initial administrator invitation
     ├── Default tenant settings
     ├── Entitlements
     └── Branding defaults
```

The UI should expose:

```text
Provisioning Status
├── Pending
├── Running
├── Completed
└── Failed
```

For failures:

- Show safe error information
- Show request/correlation ID
- Allow retry only when backend supports it
- Preserve audit history

---

# 13. Plans and Entitlements

This is a Super Admin concern.

The platform may eventually support:

```text
Plans
├── Starter
├── Growth
├── Enterprise
└── Custom
```

A tenant can have:

```text
Tenant
 ├── Plan
 ├── Enabled Features
 ├── Limits
 ├── Quotas
 └── Entitlements
```

The UI should manage platform-level entitlement configuration.

It must not implement the underlying logistics feature itself.

---

# 14. Feature Flags

Feature flags should be platform-controlled.

Examples:

```text
advanced_tracking
route_optimization
reports
bulk_import
external_integrations
```

Super Admin can configure:

```text
Global default
Tenant override
Environment availability
Enabled / Disabled
```

Do not place logistics workflows inside the Super Admin application merely because their feature flag is configurable here.

---

# 15. API Credentials

Tenant API credentials are platform security resources.

Super Admin may eventually:

- Create credential
- Rotate credential
- Revoke credential
- View credential status
- View last-used time
- Set expiry
- Review credential audit events

Security rules:

```text
Public Key → may be displayed
Secret Key → sensitive
Secret Hash → server only
```

Never store tenant secrets in:

```text
localStorage
sessionStorage
VITE_*
Zustand persistence
console logs
analytics
URL parameters
```

---

# 16. Audit Logs

Every privileged platform operation should be auditable.

Example:

```text
Actor
Action
Resource
Target
Tenant
Timestamp
Request ID
Result
IP / security metadata where supported
```

Examples:

```text
tenant.created
tenant.suspended
tenant.activated
tenant.archived
platform.user.invited
platform.role.updated
platform.permission.changed
api.credential.created
api.credential.revoked
feature_flag.changed
settings.updated
```

Audit logs are read-only from the Super Admin UI.

---

# 17. Security Center

The Super Admin panel should provide platform security visibility.

Possible sections:

```text
Security Center
│
├── Login Activity
├── Active Sessions
├── Failed Authentication
├── Account Lockouts
├── Privileged Actions
├── Security Events
└── Audit Logs
```

High-risk actions should require confirmation and produce an audit event.

---

# 18. Support Access / Impersonation

If support access is required, it must not silently turn a Super Admin into a tenant administrator.

Correct model:

```text
Super Admin
     ↓
Request Support Access
     ↓
Select Tenant
     ↓
Explicit Confirmation
     ↓
Temporary Support Session
     ↓
Tenant Context
     ↓
Audit Everything
     ↓
Exit
```

Requirements:

- explicit permission
- explicit confirmation
- short lifetime
- visible support mode
- original actor preserved
- complete audit trail
- no credential exposure
- no permanent hidden backdoor

This feature should be implemented only when the backend boundary exists.

---

# 19. Platform Settings

Platform settings are not tenant settings.

```text
Platform Settings
├── Platform Identity
├── General Configuration
├── Security Policies
├── Session Policies
├── Email Configuration
├── Storage Configuration
├── Integration Configuration
└── System Defaults
```

Tenant-specific settings should remain under Tenant Detail.

---

# 20. Platform Branding

The Super Admin application uses **platform branding**.

```text
Platform Branding
├── Platform Name
├── Logo
├── Favicon
├── Primary Color
└── Support Information
```

Tenant branding is managed as tenant configuration.

A tenant's logo must never replace the Super Admin platform identity globally.

---

# 21. Authentication

Super Admin authentication uses the platform authentication system.

Flow:

```text
/login
   ↓
email + password
   ↓
authentication
   ↓
platform access check
   ↓
platform permissions
   ↓
dashboard
```

Password recovery:

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

Login OTP must not be invented if the backend does not support it.

---

# 22. Frontend Architecture

```text
apps/super-admin/src/
│
├── app/
├── components/
├── modules/
│   ├── auth/
│   ├── dashboard/
│   ├── tenants/
│   ├── platform-users/
│   ├── platform-roles/
│   ├── platform-permissions/
│   ├── provisioning/
│   ├── entitlements/
│   ├── feature-flags/
│   ├── credentials/
│   ├── audit/
│   ├── security/
│   ├── integrations/
│   └── settings/
│
├── lib/
├── stores/
├── hooks/
├── i18n/
├── styles/
└── test/
```

Use `modules/` for platform business areas.

Do not create:

```text
modules/shipments
modules/drivers
modules/vehicles
modules/routes
modules/dispatch
```

in this repository.

---

# 23. API Architecture

All Super Admin API access goes through the centralized Platform API client.

Conceptually:

```text
UI
 ↓
Module Hook
 ↓
Module API Service
 ↓
Central API Client
 ↓
/api/v1/platform/*
 ↓
Platform API
```

Examples:

```http
GET    /api/v1/platform/dashboard
GET    /api/v1/platform/tenants
POST   /api/v1/platform/tenants
GET    /api/v1/platform/tenants/:tenantId
PATCH  /api/v1/platform/tenants/:tenantId
POST   /api/v1/platform/tenants/:tenantId/suspend
POST   /api/v1/platform/tenants/:tenantId/activate

GET    /api/v1/platform/users
GET    /api/v1/platform/roles
GET    /api/v1/platform/permissions
GET    /api/v1/platform/audit-logs
GET    /api/v1/platform/settings
```

These are architectural examples. The shared endpoint registry remains the source of truth.

---

# 24. Centralized Endpoint Registry

Do not scatter URLs across components.

Use:

```text
packages/api-contracts
```

for shared contracts and endpoint definitions where that is the established project convention.

Frontend modules consume those definitions.

Never:

```tsx
fetch("/api/v1/platform/tenants");
```

directly from a page component.

---

# 25. State Management

## Server state

Use TanStack Query for:

```text
Tenants
Platform Users
Platform Roles
Permissions
Dashboard
Provisioning
Feature Flags
Audit Logs
Security Events
Settings
Credentials
```

## Client state

Use Zustand/local state for:

```text
Theme
Sidebar
UI preferences
Temporary UI state
Session bootstrap state where required
```

Never use Zustand as a second database for server collections.

---

# 26. Routing

Recommended:

```text
/login
/forgot-password
/verify-otp
/reset-password

/dashboard

/tenants
/tenants/:tenantId
/tenants/:tenantId/provisioning
/tenants/:tenantId/entitlements
/tenants/:tenantId/branding
/tenants/:tenantId/credentials
/tenants/:tenantId/audit

/platform-users
/platform-users/:id

/platform-roles
/platform-permissions

/provisioning

/feature-flags
/entitlements

/audit
/security
/integrations
/settings
```

Routes must be permission-aware.

---

# 27. UI Design Principles

The UI should visually communicate:

```text
PLATFORM CONTROL CENTER
```

not:

```text
LOGISTICS OPERATIONS
```

Use:

- dense operational tables
- status badges
- tenant lifecycle indicators
- system health indicators
- audit timelines
- security warnings
- confirmation dialogs for destructive actions
- clear platform/tenant boundaries
- tenant context only when a tenant is selected

Avoid:

- shipment boards
- dispatch boards
- driver maps
- delivery tracking screens
- warehouse operations
- logistics KPIs

---

# 28. Tenant Context

Super Admin is platform-scoped by default.

```text
Super Admin
     ↓
Platform
```

When a tenant is intentionally selected:

```text
Super Admin
     ↓
Tenant: Acme Logistics
     ↓
Tenant Platform Metadata
```

Do not make the entire application depend on an active tenant.

---

# 29. Error and Security Rules

Central API handling must support:

- 401 → refresh/session recovery
- 403 → forbidden
- 404 → not found
- 409 → conflict
- 422 → validation
- 429 → rate limited
- 5xx → platform error

Never display internal secrets or stack traces.

Always surface a request/correlation ID when available.

---

# 30. Testing

## Authentication

- Platform user can log in
- Tenant-only user cannot access Super Admin
- Logout works
- Refresh works
- Password reset works
- OTP reset flow works
- Expired sessions are rejected

## Platform RBAC

For every protected platform endpoint:

```text
No auth                  → reject
Tenant user              → reject
Platform user no perm    → reject
Platform user with perm  → allow
```

## Tenant lifecycle

Test:

```text
Create
Provision
Activate
Suspend
Reactivate
Archive
```

## Security

Test:

```text
Tenant role cannot grant platform permission
Cross-tenant access is rejected
Credential secrets are never persisted in frontend state
Privileged actions create audit records
Support access is time-limited if implemented
```

---

# 31. Explicitly Out of Scope

The following are **not Super Admin modules**:

```text
Shipments
Orders
Drivers
Vehicles
Routes
Dispatch
Delivery
Warehouses
Customers
Proof of Delivery
Driver Attendance
Driver Tracking
Logistics Reports
Logistics Operations Dashboard
```

These belong to the future/current `logistics-platform`.

---

# 32. Definition of Done

The Super Admin frontend is complete when:

- [ ] It is clearly platform/control-plane oriented
- [ ] No Tenant Admin operational UI exists
- [ ] No shipment/driver/vehicle/order modules exist
- [ ] Platform authentication works
- [ ] Platform RBAC is permission-based
- [ ] Tenant lifecycle is supported
- [ ] Tenant provisioning visibility exists
- [ ] Platform users are separate from tenant users
- [ ] Platform roles and permissions are separate from tenant RBAC
- [ ] Audit/security visibility exists
- [ ] Platform settings exist
- [ ] Feature flags/entitlements are platform-scoped
- [ ] API credential lifecycle is secure when backend support exists
- [ ] All API access is centralized
- [ ] Shared API contracts are used
- [ ] Frontend never accesses Prisma/PostgreSQL
- [ ] Privileged actions are audited
- [ ] Unauthorized platform users cannot access protected routes
- [ ] Tenant operational workflows remain outside this repository

---

# 33. Final Principle

> **Super Admin controls the SaaS platform.**
>
> **Tenant Admin operates one customer's business.**

Therefore:

```text
SUPER ADMIN
    ↓
SaaS Platform
    ↓
Tenants
    ↓
Platform Configuration
    ↓
Platform Security
    ↓
Platform Operations


TENANT ADMIN
    ↓
One Tenant
    ↓
Tenant Users
    ↓
Tenant Configuration
    ↓
Logistics Operations
```

Never blur these boundaries.
