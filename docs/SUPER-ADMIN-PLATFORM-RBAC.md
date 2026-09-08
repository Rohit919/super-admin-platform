# Super Admin Platform RBAC

**Phase 5 — Super Admin Platform RBAC**

This document defines the **Super Admin authorization model** for the SaaS control plane.

The Super Admin application is not a tenant/logistics administration panel. It is the
**platform control plane** used to govern tenants, platform users, platform roles,
permissions, provisioning, plans, entitlements, feature flags, credentials, audit,
security, and platform configuration.

Authorization is permission-based and DB-backed. A role name such as `SUPER_ADMIN`
never grants access by itself.

---

## 1. Super Admin RBAC Model

The authorization model is:

```text
Super Admin User
      ↓
Platform Membership
      ↓
Platform Role
      ↓
Platform Permissions
      ↓
Allowed Platform Action
```

The underlying role relationship is:

```text
User → UserRole → Role → RolePermission → Permission
                    │
          tenantId = null
              ↓
       PLATFORM ROLE
```

A platform role has `tenantId = null` and represents authority over the SaaS
platform itself.

A tenant role has:

```text
tenantId = <tenant-id>
```

and represents authority inside that tenant's operational environment.

### Critical boundary

```text
SUPER ADMIN / PLATFORM RBAC
        ≠
TENANT / LOGISTICS RBAC
```

A tenant role must never be able to grant a `platform.*` permission.

For example, a tenant role named `SUPER_ADMIN` is still only a **tenant role**.
Its name does not give it access to the Super Admin control plane.

---

## 2. Effective Permissions

Effective permissions for a platform request are resolved from the user's
**platform-scoped assignments**.

For a Super Admin route:

```text
User
 ↓
PlatformMembership
 ↓
UserRole where tenantId IS NULL
 ↓
RolePermission
 ↓
Permission
```

Tenant-scoped assignments are not used to authorize platform routes.

This creates the required isolation:

```text
Platform permissions
    ↓
tenantId = null only

Tenant permissions
    ↓
tenantId = specific tenant only
```

Unknown permission keys stored in the database are ignored during resolution.
Only permission keys registered in the platform permission catalog can become
effective.

---

## 3. Super Admin Guard Layers

### 3.1 `requirePlatform`

Location:

```text
core/platform/require-platform.ts
```

Every `/api/v1/platform/*` endpoint must pass through the platform access gate.

`requirePlatform` verifies:

1. the user is authenticated;
2. the user has an active `PlatformMembership`;
3. the platform membership is not suspended/revoked.

It does not rely on the role name.

---

### 3.2 `requirePlatformPermission(key)`

A platform permission guard performs:

```text
Authentication
    +
Active Platform Membership
    +
Required platform.* permission
```

Example:

```text
GET /api/v1/platform/tenants
        ↓
requirePlatformPermission("platform.tenant.view")
```

The authorization service is called without a tenant scope.

Therefore:

```text
platform role → can grant platform permission
tenant role   → cannot grant platform permission
```

All platform authorization failures should use the same platform access-denied
response so that callers cannot probe the existence or structure of the
Super Admin control plane.

---

## 4. Super Admin Permission Namespace

The `platform.*` namespace is the single source of truth for Super Admin
permissions.

Current platform permissions:

```text
platform.dashboard.view

platform.tenant.view
platform.tenant.create
platform.tenant.update
platform.tenant.suspend
platform.tenant.archive

platform.user.view
platform.user.create
platform.user.update
platform.user.suspend

platform.role.view
platform.role.create
platform.role.update

platform.permission.view

platform.audit.view

platform.settings.view
platform.settings.update

platform.feature-flag.view
platform.feature-flag.update
```

Credential permissions should use the singular `credential` convention:

```text
platform.credential.read
platform.credential.create
platform.credential.rotate
platform.credential.revoke
```

Do **not** introduce the inconsistent namespace:

```text
platform.credentials.*
```

### Permission registry

The platform permission registry should expose:

```text
isPlatformPermissionKey(key)
PLATFORM_PERMISSION_KEYS
TENANT_PERMISSION_KEYS
```

The registry is consumed by:

```text
Platform API
    → authorization enforcement

Prisma seed
    → permission creation/assignment

Super Admin frontend
    → permission-aware navigation/actions
```

The registry is the contract. UI visibility is not a security boundary.

---

## 5. Super Admin Permission Categories

### Dashboard

```text
platform.dashboard.view
```

Controls access to the SaaS platform dashboard.

The dashboard represents platform-level information such as:

- tenant lifecycle status;
- provisioning status;
- platform health;
- platform usage;
- security signals;
- background jobs;
- platform-level operational metrics.

It must not become a logistics dashboard containing shipments, drivers,
routes, dispatch, or delivery operations.

---

### Tenant Management

```text
platform.tenant.view
platform.tenant.create
platform.tenant.update
platform.tenant.suspend
platform.tenant.archive
```

These permissions govern the SaaS tenant lifecycle.

They cover:

```text
Create tenant
View tenant
Update tenant metadata
Activate tenant
Suspend tenant
Archive tenant
Provision tenant
Review tenant configuration
```

Tenant detail remains platform-level.

Allowed:

```text
Tenant
├── Overview
├── Lifecycle
├── Plan & Entitlements
├── Provisioning
├── Configuration
├── Branding
├── API Credentials
├── Integrations
├── Usage
├── Security
└── Audit
```

Not allowed as Super Admin RBAC resources:

```text
Tenant
├── Shipments
├── Orders
├── Drivers
├── Vehicles
├── Routes
├── Dispatch
├── Warehouses
└── Proof of Delivery
```

Those belong to the Logistics/Tenant operational plane.

---

### Platform Users

```text
platform.user.view
platform.user.create
platform.user.update
platform.user.suspend
```

These permissions govern users who operate the **platform control plane**.

They are not a replacement for tenant-user administration.

Use explicit terminology:

```text
Platform Users
```

rather than:

```text
Users
```

when referring to the Super Admin application's user-management domain.

---

### Platform Roles

```text
platform.role.view
platform.role.create
platform.role.update
```

Platform roles define reusable sets of platform permissions.

Examples:

```text
SUPER_ADMIN
ADMIN
MANAGER
SUPPORT
VIEWER
```

The role name is descriptive only. The permissions assigned to the role determine
what the role can actually do.

---

### Platform Permissions

```text
platform.permission.view
```

Allows authorized Super Admin users to inspect the platform permission catalog.

The permission catalog must remain the authoritative definition of available
platform capabilities.

---

### Audit

```text
platform.audit.view
```

Controls access to platform audit events.

Audit records should cover sensitive control-plane actions such as:

```text
Tenant created
Tenant suspended
Tenant archived
Platform user changed
Platform role changed
Permission assignment changed
Credential created
Credential rotated
Credential revoked
Feature flag changed
Platform setting changed
Security-sensitive configuration changed
```

---

### Platform Settings

```text
platform.settings.view
platform.settings.update
```

These permissions govern SaaS-level configuration.

They must not be used for tenant logistics configuration unless that configuration
is explicitly part of the platform control plane.

---

### Feature Flags

```text
platform.feature-flag.view
platform.feature-flag.update
```

These permissions govern platform-wide feature rollout and tenant-level
entitlement/feature controls.

Feature-flag authorization remains separate from tenant operational RBAC.

---

### Tenant API Credentials

```text
platform.credential.read
platform.credential.create
platform.credential.rotate
platform.credential.revoke
```

These permissions govern platform-managed credentials issued to tenants.

Recommended routes:

```http
GET    /api/v1/platform/tenants/:tenantId/credentials
POST   /api/v1/platform/tenants/:tenantId/credentials
POST   /api/v1/platform/tenants/:tenantId/credentials/:credentialId/rotate
POST   /api/v1/platform/tenants/:tenantId/credentials/:credentialId/revoke
```

Mapping:

```text
GET    → platform.credential.read
POST   → platform.credential.create
rotate → platform.credential.rotate
revoke → platform.credential.revoke
```

Secrets are security-sensitive:

- store only a one-way hash such as SHA-256 for high-entropy secrets;
- return the plaintext secret only at creation/rotation time;
- never expose the stored secret through GET/list APIs;
- never place secrets in browser localStorage/sessionStorage;
- audit creation, rotation, and revocation.

---

## 6. Authorization Resolution

The authorization service should expose a model equivalent to:

```text
getContext(userId, tenantId?)
hasPermission(userId, key, tenantId?)
```

For Super Admin routes:

```text
hasPermission(
  userId,
  "platform.tenant.view"
)
```

not:

```text
hasPermission(
  userId,
  "platform.tenant.view",
  tenantId
)
```

The absence of a tenant scope is intentional.

It means platform permissions are resolved exclusively from platform roles.

---

## 7. Request-Level Authorization Context

The effective authorization context may be memoized for the duration of a
single request.

The cache key must include:

```text
userId
activeTenantId
```

when tenant-scoped authorization is being used.

For platform authorization, the platform route must resolve permissions without
an active tenant scope.

This prevents a tenant context from accidentally expanding platform authority.

---

## 8. Super Admin Route Enforcement

The platform route enforcement map should follow this model:

| Super Admin API                                                      | Required Permission          |
| -------------------------------------------------------------------- | ---------------------------- |
| `GET /api/v1/platform/dashboard`                                     | `platform.dashboard.view`    |
| `GET /api/v1/platform/tenants`                                       | `platform.tenant.view`       |
| `POST /api/v1/platform/tenants`                                      | `platform.tenant.create`     |
| `GET /api/v1/platform/tenants/:id`                                   | `platform.tenant.view`       |
| `PATCH /api/v1/platform/tenants/:id/status`                          | `platform.tenant.suspend`    |
| `GET /api/v1/platform/users`                                         | `platform.user.view`         |
| `GET /api/v1/platform/tenants/:id/credentials`                       | `platform.credential.read`   |
| `POST /api/v1/platform/tenants/:id/credentials`                      | `platform.credential.create` |
| `POST /api/v1/platform/tenants/:id/credentials/:credentialId/rotate` | `platform.credential.rotate` |
| `POST /api/v1/platform/tenants/:id/credentials/:credentialId/revoke` | `platform.credential.revoke` |

If a status operation can archive a tenant, it must additionally verify:

```text
platform.tenant.archive
```

This prevents an operator who can suspend a tenant from automatically receiving
archive authority.

---

## 9. Platform Membership Is the Access Gate

A platform role alone is not sufficient to enter the Super Admin control plane.

The required model is:

```text
Authenticated User
       ↓
Active Platform Membership
       ↓
Platform Permission
       ↓
Super Admin Action
```

Therefore:

```text
No PlatformMembership
        → DENY

Inactive PlatformMembership
        → DENY

Active membership + missing permission
        → DENY

Active membership + required permission
        → ALLOW
```

The role name `SUPER_ADMIN` is not the platform access gate.

---

## 10. Seeded Super Admin Roles

The platform seed should create/upsert the complete permission catalog.

System roles are platform-scoped:

```text
tenantId = null
```

Recommended system roles:

```text
SUPER_ADMIN
ADMIN
MANAGER
SUPPORT
VIEWER
```

`SUPER_ADMIN` may receive every registered platform permission as a break-glass
role.

This should be assigned sparingly.

The initial platform administrator should receive:

```text
SUPER_ADMIN role
+
ACTIVE PlatformMembership
```

The seed must remain idempotent and must not introduce a default password.

Production seed execution should require explicit opt-in.

---

## 11. No Role-Name Authorization

### Rule

The Super Admin platform must never use:

```text
if (user.role === "SUPER_ADMIN") {
    allow();
}
```

as its authorization mechanism.

Instead:

```text
requirePlatformPermission("platform.tenant.create")
```

must determine access.

The role name is only metadata.

### Legitimate role-name checks

A role name may still be used for **privilege-escalation protection**.

For example, only a current `SUPER_ADMIN` may be allowed to:

- grant the `SUPER_ADMIN` role;
- modify the most privileged system roles;
- remove the final Super Admin;
- perform other break-glass RBAC operations.

This is different from route access.

The route itself should still require a platform permission such as:

```text
platform.role.update
```

The role-name check determines whether the already-authorized actor may perform
the highest-risk delegation.

---

## 12. Tenant Roles Can Never Grant Platform Access

This is a mandatory security property.

Example:

```text
User
 ├── Tenant Role: SUPER_ADMIN
 │       tenantId = tenant_123
 │       permissions:
 │         shipment.read
 │         driver.update
 │
 └── No Platform Membership
```

Result:

```text
GET /api/v1/platform/tenants
        ↓
403 PLATFORM_ACCESS_DENIED
```

Even if the tenant role is literally named `SUPER_ADMIN`, it cannot grant:

```text
platform.tenant.view
```

because its role assignment is tenant-scoped.

---

## 13. Super Admin Frontend RBAC

The Super Admin frontend may use platform permissions for:

```text
Navigation visibility
Button visibility
Action availability
Route UX
Empty states
Permission-aware screens
```

Example:

```text
platform.tenant.create
        ↓
Show "Create Tenant"

platform.credential.rotate
        ↓
Show "Rotate Credential"

platform.audit.view
        ↓
Show "Audit" navigation
```

However:

> Frontend RBAC is UX only.

The API remains the security boundary.

A user who manually calls:

```http
POST /api/v1/platform/tenants
```

must still be denied by the backend when the required permission is missing.

---

## 14. Super Admin Navigation Authorization

The permission-aware navigation should represent the platform control plane:

```text
Dashboard
Tenants
Platform Users
Platform Roles
Platform Permissions
Provisioning
Plans
Entitlements
Feature Flags
Credentials
Audit
Security
Integrations
Settings
```

Navigation must not introduce logistics operational sections such as:

```text
Shipments
Orders
Drivers
Vehicles
Routes
Dispatch
Warehouses
Delivery
```

Those belong to the separate Logistics/Tenant Admin application.

---

## 15. Security Properties

The Super Admin RBAC implementation must maintain these properties:

### Permission based

```text
Permission grant → capability
Role name → metadata
```

### Default deny

```text
No permission → no access
```

### Platform isolation

```text
tenant role
   ✗
platform permission
```

### Membership gate

```text
platform role
   +
inactive/no membership
   =
DENY
```

### Registry enforcement

Only registered permission keys can become effective.

### Uniform platform denial

Unauthorized callers should receive the same platform access-denied response
rather than information that reveals platform structure.

### Backend enforcement

Frontend permission checks never replace API authorization.

### Sensitive-action protection

High-risk actions such as:

```text
Grant SUPER_ADMIN
Rotate credentials
Revoke credentials
Archive tenant
Change security settings
```

require explicit permissions and appropriate audit logging.

---

## 16. Test Coverage

The Super Admin RBAC test suite must verify at minimum:

### Platform access

```text
No PlatformMembership
    → 403

Suspended PlatformMembership
    → 403

Active membership + missing permission
    → 403

Active membership + required permission
    → 200
```

### Platform/tenant isolation

```text
Tenant role named SUPER_ADMIN
    → cannot access /api/v1/platform/*
```

### Permission enforcement

Verify that each protected endpoint rejects callers who lack its required
`platform.*` permission.

### Stronger privilege checks

For tenant lifecycle:

```text
platform.tenant.suspend
    ≠
platform.tenant.archive
```

For credentials:

```text
platform.credential.read
platform.credential.create
platform.credential.rotate
platform.credential.revoke
```

must be independently enforced.

### Revocation

Removing a platform permission must immediately prevent the corresponding
platform action after authorization context is refreshed.

### Privilege escalation

A non-Super-Admin operator must not be able to grant or modify the highest-risk
platform role without the required privileged protection.

---

## 17. Implementation Boundaries

The Super Admin RBAC implementation must remain inside the platform control plane.

Allowed:

```text
apps/platform-api
apps/super-admin
packages/api-contracts
prisma
```

The platform authorization layer may manage:

```text
Tenants
Platform Users
Platform Roles
Platform Permissions
Plans
Entitlements
Feature Flags
Provisioning
Credentials
Audit
Security
Platform Settings
```

It must not directly access or implement Logistics operational domains.

Forbidden coupling:

```text
Platform API
   ↓
Logistics Prisma Client
```

or:

```text
Platform API
   ↓
Logistics database
```

or:

```text
Super Admin
   ↓
Shipment/Driver/Vehicle services
```

Any future platform-to-logistics interaction must cross an explicit authenticated
service/API boundary.

---

## 18. Definition of Done

Super Admin Platform RBAC is complete when:

- [ ] All Super Admin routes use platform guards.
- [ ] Platform permissions use the `platform.*` namespace.
- [ ] Platform permission keys are centralized in the contract registry.
- [ ] Platform permission seed data matches the registry.
- [ ] Platform roles are distinguished from tenant roles by scope.
- [ ] `PlatformMembership` is required for platform access.
- [ ] Platform permission resolution uses no tenant scope.
- [ ] Tenant roles cannot grant `platform.*` permissions.
- [ ] Role names are not used as the normal authorization mechanism.
- [ ] High-risk RBAC delegation remains specially protected.
- [ ] Credential permissions use `platform.credential.*`.
- [ ] Credential routes enforce independent read/create/rotate/revoke permissions.
- [ ] Sensitive credential secrets are never returned by normal read/list APIs.
- [ ] Platform authorization failures are uniformly denied.
- [ ] Frontend permission checks are treated as UX only.
- [ ] Backend authorization tests cover allow/deny cases.
- [ ] Super Admin navigation contains platform-control-plane domains only.
- [ ] No Logistics operational domain is introduced into the Super Admin RBAC.
- [ ] No direct Platform API → Logistics DB coupling exists.
- [ ] Audit coverage exists for sensitive platform actions.

---

## 19. Final Super Admin RBAC Architecture

```text
                         SUPER ADMIN
                              │
                              ▼
                    ┌───────────────────┐
                    │ Platform Membership│
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  Platform Role    │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │Platform Permissions│
                    │   platform.*      │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │   Platform API    │
                    │ /api/v1/platform/*│
                    └─────────┬─────────┘
                              │
          ┌───────────────────┼────────────────────┐
          ▼                   ▼                    ▼
       Tenants          Platform Users        RBAC/Security
          │                   │                    │
          ▼                   ▼                    ▼
   Provisioning       Platform Roles        Audit/Credentials
   Plans/Entitlements Permissions            Settings/Flags
          │
          ▼
      Platform DB

        ║
        ║ explicit authenticated API boundary
        ║
        ▼
 ┌───────────────────────┐
 │  Logistics Platform   │
 │  Tenant Operational   │
 │       Plane           │
 └───────────────────────┘
```

**Gate**

This document is the authoritative Super Admin interpretation of platform RBAC.
It defines the authorization boundary between the SaaS control plane and the
tenant/logistics operational plane.

No platform permission may implicitly grant tenant operational permissions, and
no tenant permission may implicitly grant Super Admin platform authority.
