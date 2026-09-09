# RBAC.md

# Role-Based Access Control Architecture

## 1. Purpose

This document defines the Role-Based Access Control (RBAC) architecture for the multi-tenant Gym SaaS Platform.

The RBAC system controls access for:

```text
Super Admin
Tenant Owner
Tenant Admin
Trainer
Member
```

The authorization system must support:

- Platform-level permissions
- Tenant-level roles
- Permission-based authorization
- Resource-level authorization
- Trainer-to-member restrictions
- Tenant isolation
- Custom tenant roles
- System roles
- Permission inheritance where required
- API middleware/guards
- Frontend route protection
- Native mobile feature authorization
- Audit logging
- Permission seeding
- Automated authorization testing

The most important principle is:

> Roles are not authorization. Permissions are authorization.

---

# 2. Core Authorization Model

The platform follows:

```text
User
 │
 └── TenantMembership
          │
          ▼
         Role
          │
          ▼
    RolePermission
          │
          ▼
      Permission
```

Resource authorization then adds:

```text
User
 │
 ▼
Tenant
 │
 ▼
Role
 │
 ▼
Permission
 │
 ▼
Resource Policy
 │
 ▼
ALLOW / DENY
```

---

# 3. Authentication vs Authorization

Authentication answers:

```text
Who is this user?
```

Authorization answers:

```text
What can this user do?
```

Example:

```text
User
 ↓
Authenticated
 ↓
Tenant A
 ↓
TRAINER
 ↓
members.read
 ↓
Is this member assigned to this trainer?
 ↓
ALLOW
```

---

# 4. Authorization Hierarchy

The platform has two authorization levels.

## Platform level

```text
SUPER_ADMIN
PLATFORM_SUPPORT
PLATFORM_OPERATOR
```

## Tenant level

```text
OWNER
ADMIN
TRAINER
MEMBER
```

These must not be mixed.

```text
SUPER_ADMIN
```

is not a tenant role.

Likewise:

```text
OWNER
```

does not automatically become a platform administrator.

---

# 5. Tenant Isolation Comes First

Authorization must always evaluate tenant context.

Example:

```text
User A
Tenant A
ADMIN
members.read
```

This does not mean:

```text
User A
Tenant B
members.read
```

unless the user also has a valid Tenant B membership with that permission.

The authorization chain is:

```text
Authentication
      ↓
Tenant Membership
      ↓
Tenant Status
      ↓
Role
      ↓
Permission
      ↓
Resource Policy
```

---

# 6. Roles

Initial system roles:

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

---

# 7. OWNER

The `OWNER` represents the tenant business owner.

Typical responsibilities:

```text
Tenant settings
Staff management
Member management
Workout management
Membership management
Payment management
Reports
Branding
Feature configuration
```

Example permissions:

```text
tenant.read
tenant.update

members.read
members.create
members.update
members.delete

staff.read
staff.create
staff.update
staff.delete

trainers.read
trainers.create
trainers.update
trainers.delete

workouts.read
workouts.create
workouts.update
workouts.delete

attendance.read
attendance.create
attendance.update

memberships.read
memberships.create
memberships.update
memberships.delete

payments.read
payments.create
payments.refund

reports.read

branding.read
branding.update

features.read
features.update
```

Owner access should still be restricted by tenant boundaries.

---

# 8. ADMIN

The `ADMIN` role manages day-to-day gym operations.

Typical permissions:

```text
members.read
members.create
members.update
members.delete

staff.read
staff.create
staff.update

trainers.read
trainers.create
trainers.update

workouts.read
workouts.create
workouts.update

attendance.read
attendance.create
attendance.update

memberships.read
memberships.create
memberships.update

payments.read
payments.create

reports.read
```

An Admin should not automatically have:

```text
tenant.delete
platform.*
```

---

# 9. TRAINER

The trainer role is intentionally narrower.

Typical permissions:

```text
members.read
members.progress.read

workouts.read
workouts.create
workouts.update

workout-sessions.read
workout-sessions.create
workout-sessions.update

exercises.read

attendance.read
```

However, permissions alone are not enough.

A trainer should usually only access members assigned to them.

Therefore:

```text
TRAINER
+
members.read
+
member assigned to trainer
=
ALLOW
```

---

# 10. MEMBER

Members receive the most restricted role.

Typical permissions:

```text
profile.read
profile.update

workouts.read
workout-sessions.read
workout-sessions.create
workout-sessions.update

progress.read

attendance.read

membership.read

payments.read
payments.create
```

A member must not be able to:

```text
members.read
staff.read
payments.refund
tenant.update
tenant.delete
role.update
```

---

# 11. Super Admin

Super Admin operates at the platform level.

Example permissions:

```text
platform.tenants.read
platform.tenants.create
platform.tenants.update
platform.tenants.suspend

platform.users.read
platform.users.update

platform.subscriptions.read
platform.subscriptions.update

platform.features.read
platform.features.update

platform.branding.read
platform.branding.update

platform.mobile-apps.read
platform.mobile-apps.create
platform.mobile-apps.update

platform.mobile-builds.read
platform.mobile-builds.create
platform.mobile-builds.cancel

platform.mobile-releases.read
platform.mobile-releases.approve
platform.mobile-releases.publish

platform.audit.read

platform.support.access
```

Super Admin access must be separately audited.

---

# 12. Platform Support

Support personnel may need limited access.

Example:

```text
PLATFORM_SUPPORT
```

Permissions might include:

```text
platform.tenants.read
platform.users.read
platform.support.access
platform.audit.read
```

But not:

```text
platform.mobile-releases.publish
platform.tenants.delete
platform.billing.modify
```

unless explicitly granted.

---

# 13. Platform Operator

Platform operators can manage operational infrastructure.

Example:

```text
PLATFORM_OPERATOR
```

Possible permissions:

```text
platform.mobile-builds.read
platform.mobile-builds.create
platform.mobile-builds.cancel

platform.mobile-releases.read

platform.monitoring.read
platform.audit.read
```

---

# 14. Permission Naming Convention

Permissions must follow a predictable format.

Recommended:

```text
resource.action
```

Examples:

```text
members.read
members.create
members.update
members.delete
```

For more specific actions:

```text
payments.refund
memberships.cancel
workouts.assign
attendance.checkin
```

---

# 15. Permission Domains

Recommended permission domains:

```text
tenant
members
staff
trainers
roles
permissions
exercises
workouts
workout-plans
workout-sessions
progress
attendance
memberships
payments
reports
branding
features
notifications
devices
audit
platform
```

---

# 16. Standard CRUD Permissions

Where appropriate:

```text
resource.read
resource.create
resource.update
resource.delete
```

Example:

```text
members.read
members.create
members.update
members.delete
```

Do not create unnecessary permissions such as:

```text
members.viewPage
members.clickButton
members.openModal
```

Permissions should represent business capabilities.

---

# 17. Action Permissions

Some operations need explicit business permissions.

Examples:

```text
payments.refund
memberships.cancel
memberships.extend
attendance.override
workouts.assign
members.export
reports.export
tenant.suspend
```

These should not be inferred simply from `update`.

---

# 18. Sensitive Permissions

Certain permissions require additional controls.

Examples:

```text
payments.refund
members.delete
staff.delete
roles.update
permissions.update
tenant.update
platform.*
```

These actions should:

- Be strongly authorized
- Be audited
- Potentially require confirmation
- Potentially require MFA/step-up authentication

---

# 19. Permission Database Model

Recommended Prisma model:

```prisma
model Permission {
  id          String @id @default(cuid())
  code        String @unique
  description String?

  rolePermissions RolePermission[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

# 20. Role Database Model

```prisma
model Role {
  id       String @id @default(cuid())

  tenantId String?
  name     String
  code     String

  isSystem Boolean @default(false)

  memberships TenantMembership[]

  rolePermissions RolePermission[]

  tenant Tenant?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, code])
  @@index([tenantId])
}
```

---

# 21. RolePermission

```prisma
model RolePermission {
  roleId       String
  permissionId String

  role       Role       @relation(fields: [roleId], references: [id])
  permission Permission @relation(fields: [permissionId], references: [id])

  @@id([roleId, permissionId])
}
```

---

# 22. TenantMembership

The role belongs to a user's tenant membership.

```prisma
model TenantMembership {
  id       String @id @default(cuid())

  tenantId String
  userId   String
  roleId   String

  status MembershipStatus @default(ACTIVE)

  joinedAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  user   User   @relation(fields: [userId], references: [id])
  role   Role   @relation(fields: [roleId], references: [id])

  @@unique([tenantId, userId])
  @@index([tenantId, roleId])
}
```

Therefore:

```text
User
 +
Tenant
 +
Membership
 +
Role
 =
Tenant authorization context
```

---

# 23. System Roles vs Custom Roles

System roles:

```text
OWNER
ADMIN
TRAINER
MEMBER
```

should be protected.

Tenants may create custom roles.

Example:

```text
FRONT_DESK
ACCOUNTANT
SENIOR_TRAINER
RECEPTIONIST
```

Custom role:

```text
Receptionist
 ├── members.read
 ├── members.create
 ├── attendance.read
 └── attendance.create
```

---

# 24. Custom Role Restrictions

Tenant admins should not be able to grant platform permissions.

For example:

```text
platform.tenants.delete
```

must never be assignable by a tenant.

Tenant-customizable permissions should belong to an allowed namespace.

```text
tenant.*
members.*
trainers.*
workouts.*
attendance.*
```

Platform permissions:

```text
platform.*
```

remain platform-controlled.

---

# 25. Role Creation

Endpoint:

```text
POST /api/v1/roles
```

Example:

```json
{
  "name": "Front Desk",
  "code": "FRONT_DESK",
  "permissions": [
    "members.read",
    "members.create",
    "attendance.read",
    "attendance.create"
  ]
}
```

The API must validate every permission.

---

# 26. Role Update

Endpoint:

```text
PATCH /api/v1/roles/:roleId
```

Changing permissions should require:

```text
roles.update
```

and should create an audit record.

Example:

```text
role.permissions.updated
```

---

# 27. Protected System Roles

Do not allow tenant users to freely delete:

```text
OWNER
ADMIN
TRAINER
MEMBER
```

System roles should have:

```text
isSystem = true
```

and additional API protection.

---

# 28. Owner Protection

There should always be an owner-management rule.

For example:

```text
Tenant must have at least one OWNER.
```

Therefore:

```text
Delete last OWNER
```

must be rejected.

---

# 29. Role Assignment

Assigning a role:

```text
POST /api/v1/tenant-memberships/:id/role
```

requires authorization.

Example:

```text
ADMIN
```

may assign:

```text
TRAINER
MEMBER
```

but may not assign:

```text
OWNER
```

unless explicitly allowed by tenant policy.

---

# 30. Owner Transfer

Changing tenant ownership is a sensitive operation.

Example:

```text
POST /api/v1/tenants/:tenantId/transfer-ownership
```

Requirements may include:

```text
Current OWNER authentication
Target user belongs to tenant
Target membership active
Explicit confirmation
Audit event
Optional MFA
```

---

# 31. Permission Resolution

Permission resolution should follow:

```text
Authenticated User
      ↓
Active Tenant
      ↓
TenantMembership
      ↓
Role
      ↓
RolePermission
      ↓
Permission codes
```

Example result:

```typescript
type AuthorizationContext = {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: string;
  permissions: Set<string>;
};
```

---

# 32. Authorization Service

Create a centralized service:

```text
AuthorizationService
```

Example API:

```typescript
authorization.hasPermission(context, "members.read");
```

Or:

```typescript
authorization.requirePermission(context, "members.update");
```

---

# 33. Never Scatter Role Checks

Avoid:

```typescript
if (user.role === "ADMIN") {
  ...
}
```

throughout the application.

Bad:

```typescript
if (
  user.role === "OWNER" ||
  user.role === "ADMIN"
) {
  ...
}
```

This becomes difficult to maintain.

Instead:

```typescript
authorization.requirePermission(auth, "members.update");
```

---

# 34. Permission-Based API

Example:

```typescript
await authorization.requirePermission(request.auth, "members.read");
```

Then the resource policy:

```typescript
await memberPolicy.canRead(request.auth, member);
```

---

# 35. Resource Authorization

Permissions answer:

```text
Can this user perform this type of operation?
```

Resource policies answer:

```text
Can this user perform it on THIS resource?
```

Example:

```text
Trainer
+
members.read
+
Member belongs to trainer
=
ALLOW
```

---

# 36. Trainer Member Policy

Recommended rule:

```text
TRAINER
```

can access a member only if:

```text
memberTrainer.memberId == member.id
```

and:

```text
memberTrainer.trainerId == trainer.id
```

and:

```text
trainer.tenantId == member.tenantId
```

---

# 37. Trainer Workout Policy

A trainer may:

```text
create workout
update workout
assign workout
```

only for:

```text
assigned members
```

unless an explicit permission allows access to all tenant members.

---

# 38. Member Resource Policy

A member can normally access only their own resources.

Example:

```text
Member A
 ↓
WorkoutSession A
```

Allowed:

```text
Member A → Session A
```

Denied:

```text
Member A → Session B
```

---

# 39. Owner/Admin Resource Policy

Owner and Admin generally operate across the tenant.

But:

```text
Tenant A
```

still cannot access:

```text
Tenant B
```

unless a platform-level operation explicitly establishes Tenant B context.

---

# 40. Query-Level Authorization

Authorization should be applied before data leaves the repository.

Bad:

```typescript
const members = await prisma.member.findMany();
```

Better:

```typescript
const members = await prisma.member.findMany({
  where: {
    tenantId: auth.tenantId,
  },
});
```

Trainer:

```typescript
const members = await prisma.member.findMany({
  where: {
    tenantId: auth.tenantId,
    trainers: {
      some: {
        trainerId: auth.trainerId,
      },
    },
  },
});
```

---

# 41. Prevent IDOR

Never assume:

```text
/member/:id
```

is safe because the user is authenticated.

Example attack:

```text
GET /members/member-A
```

while logged in as a Tenant B user.

The query must include tenant/resource authorization.

---

# 42. Authorization Middleware

Recommended Fastify architecture:

```text
Request
  ↓
Authentication Hook
  ↓
Tenant Context Hook
  ↓
Authorization Hook
  ↓
Controller
  ↓
Service
  ↓
Repository
```

---

# 43. Authentication Hook

Authentication establishes:

```text
userId
sessionId
```

Example:

```typescript
request.auth = await authService.authenticate(request);
```

---

# 44. Tenant Hook

Tenant context establishes:

```text
tenantId
membershipId
role
permissions
```

Example:

```typescript
request.tenantContext = await tenantContextService.resolve(request);
```

---

# 45. Permission Hook

Routes may declare required permissions.

Example:

```typescript
config: {
  permission: "members.read";
}
```

The authorization hook checks the permission.

---

# 46. Route Example

Conceptually:

```typescript
fastify.get(
  "/members",
  {
    config: {
      permission: "members.read",
    },
  },
  memberController.list,
);
```

The controller should not manually repeat the permission check if centralized route authorization is already guaranteed.

---

# 47. Sensitive Route Example

```typescript
fastify.post(
  "/payments/:id/refund",
  {
    config: {
      permission: "payments.refund",
      requiresStepUpAuth: true,
    },
  },
  paymentController.refund,
);
```

---

# 48. Frontend Authorization

Frontend applications should consume permissions from the API.

Example:

```typescript
can("members.create");
```

Then:

```text
Create Member button
```

may be hidden for users without permission.

But this is only UX.

The backend must still enforce:

```text
members.create
```

---

# 49. Frontend Route Guards

Example:

```text
/members
```

requires:

```text
members.read
```

Example:

```text
/members/new
```

requires:

```text
members.create
```

Example:

```text
/payments/refund
```

requires:

```text
payments.refund
```

---

# 50. Mobile Authorization

Native apps should receive the user's effective permissions.

However:

> Mobile permission checks are never security boundaries.

The backend must enforce permissions on every API operation.

Mobile can use permissions to:

```text
hide UI
disable buttons
choose navigation
```

but cannot authorize server actions.

---

# 51. Staff Mobile App

The Staff app supports:

```text
OWNER
ADMIN
TRAINER
```

The same native application can dynamically expose functionality based on permissions.

Example:

```text
OWNER
 ├── Members
 ├── Staff
 ├── Payments
 ├── Reports
 └── Settings

TRAINER
 ├── Assigned Members
 ├── Workouts
 └── Progress
```

No separate source codebase is required for every staff role.

---

# 52. Member Mobile App

The Member app should expose only member-oriented capabilities.

Example:

```text
My Profile
My Membership
My Workouts
Workout Sessions
Progress
Attendance
Payments
Notifications
```

The backend still verifies every operation.

---

# 53. Super Admin Application

Super Admin uses a separate application:

```text
apps/super-admin
```

It should use platform permissions.

Example:

```text
platform.tenants.read
platform.tenants.update
platform.mobile-builds.create
platform.audit.read
```

Do not expose platform administration through tenant UI.

---

# 54. Platform Permission Namespace

All platform permissions should start with:

```text
platform.
```

Examples:

```text
platform.tenants.read
platform.tenants.create
platform.tenants.update
platform.tenants.suspend

platform.users.read
platform.users.update

platform.mobile-apps.read
platform.mobile-apps.create
platform.mobile-apps.update

platform.mobile-builds.read
platform.mobile-builds.create

platform.mobile-releases.approve
platform.mobile-releases.publish
```

---

# 55. Permission Groups

Permissions should be grouped logically.

Example:

```text
Members
 ├── members.read
 ├── members.create
 ├── members.update
 ├── members.delete
 └── members.export

Payments
 ├── payments.read
 ├── payments.create
 ├── payments.refund
 └── payments.export
```

The UI can use these groups to render permission-management screens.

---

# 56. Permission Catalog

Initial permission catalog:

```text
TENANT

tenant.read
tenant.update
tenant.settings.update


MEMBERS

members.read
members.create
members.update
members.delete
members.export


STAFF

staff.read
staff.create
staff.update
staff.delete


TRAINERS

trainers.read
trainers.create
trainers.update
trainers.delete


ROLES

roles.read
roles.create
roles.update
roles.delete
roles.assign


EXERCISES

exercises.read
exercises.create
exercises.update
exercises.delete


WORKOUTS

workouts.read
workouts.create
workouts.update
workouts.delete
workouts.assign


WORKOUT SESSIONS

workout-sessions.read
workout-sessions.create
workout-sessions.update


PROGRESS

progress.read
progress.create
progress.update


ATTENDANCE

attendance.read
attendance.create
attendance.update
attendance.delete
attendance.override


MEMBERSHIPS

memberships.read
memberships.create
memberships.update
memberships.cancel


PAYMENTS

payments.read
payments.create
payments.refund
payments.export


REPORTS

reports.read
reports.export


BRANDING

branding.read
branding.update


FEATURES

features.read
features.update


NOTIFICATIONS

notifications.read
notifications.send


DEVICES

devices.read
devices.revoke


AUDIT

audit.read
```

---

# 57. Platform Permission Catalog

```text
platform.tenants.read
platform.tenants.create
platform.tenants.update
platform.tenants.suspend
platform.tenants.deactivate

platform.users.read
platform.users.update
platform.users.suspend

platform.subscriptions.read
platform.subscriptions.create
platform.subscriptions.update

platform.features.read
platform.features.update

platform.branding.read
platform.branding.update

platform.mobile-apps.read
platform.mobile-apps.create
platform.mobile-apps.update
platform.mobile-apps.suspend

platform.mobile-builds.read
platform.mobile-builds.create
platform.mobile-builds.cancel
platform.mobile-builds.retry

platform.mobile-releases.read
platform.mobile-releases.approve
platform.mobile-releases.publish
platform.mobile-releases.rollback

platform.audit.read

platform.support.access
platform.monitoring.read
```

---

# 58. Permission Seeding

Permissions should be seeded through Prisma.

Recommended:

```text
prisma/seed/
├── permissions.ts
├── roles.ts
└── tenants.ts
```

Example:

```typescript
await prisma.permission.upsert({
  where: {
    code: "members.read",
  },
  update: {},
  create: {
    code: "members.read",
    description: "View tenant members",
  },
});
```

---

# 59. Role Seeding

System roles should also be seeded.

Example:

```typescript
await prisma.role.upsert({
  where: {
    tenantId_code: {
      tenantId: null,
      code: "MEMBER",
    },
  },
  update: {},
  create: {
    tenantId: null,
    code: "MEMBER",
    name: "Member",
    isSystem: true,
  },
});
```

The exact Prisma unique-input shape may need adjustment depending on the final schema because nullable compound unique constraints require careful handling.

---

# 60. Tenant Role Provisioning

When creating a tenant:

```text
Tenant created
      ↓
Create default roles
      ↓
Assign default permissions
      ↓
Create owner membership
```

Example:

```text
Tenant A
 ├── OWNER
 ├── ADMIN
 ├── TRAINER
 └── MEMBER
```

---

# 61. Role Permission Matrix

Initial recommendation:

| Permission Group | OWNER |   ADMIN |  TRAINER | MEMBER |
| ---------------- | ----: | ------: | -------: | -----: |
| Tenant settings  |     ✓ | Limited |        — |      — |
| Members          |     ✓ |       ✓ | Assigned |    Own |
| Staff            |     ✓ |       ✓ |        — |      — |
| Trainers         |     ✓ |       ✓ |      Own |      — |
| Roles            |     ✓ | Limited |        — |      — |
| Exercises        |     ✓ |       ✓ |        ✓ |   Read |
| Workouts         |     ✓ |       ✓ |        ✓ |    Own |
| Progress         |     ✓ |       ✓ |        ✓ |    Own |
| Attendance       |     ✓ |       ✓ |        ✓ |    Own |
| Memberships      |     ✓ |       ✓ |  Limited |    Own |
| Payments         |     ✓ |       ✓ |        — |    Own |
| Reports          |     ✓ |       ✓ |  Limited |      — |
| Branding         |     ✓ | Limited |        — |      — |
| Features         |     ✓ | Limited |        — |      — |

"Assigned" and "Own" require resource-level policies.

---

# 62. Permission Evaluation Example

Request:

```text
PATCH /api/v1/members/member_123
```

Authorization:

```text
Authenticated?
       ↓
Yes
       ↓
Tenant context?
       ↓
Tenant A
       ↓
Membership active?
       ↓
Yes
       ↓
members.update?
       ↓
Yes
       ↓
Member belongs to Tenant A?
       ↓
Yes
       ↓
Resource policy?
       ↓
Allowed
       ↓
UPDATE
```

---

# 63. Denial Example

```text
User:
Trainer

Permission:
members.update

Resource:
Member belonging to Tenant A

Trainer assignment:
No

Result:
DENY
```

Even though the trainer has:

```text
members.update
```

resource authorization blocks the request.

---

# 64. Error Responses

Unauthorized:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication is required."
  }
}
```

Forbidden:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action."
  }
}
```

Tenant access denied:

```json
{
  "success": false,
  "error": {
    "code": "TENANT_ACCESS_DENIED",
    "message": "Access denied."
  }
}
```

Do not reveal sensitive authorization details.

---

# 65. 403 vs 404

For resources that users should not know exist in another tenant, returning `404` can reduce information leakage.

Example:

```text
Tenant A user requests Tenant B member.
```

Possible response:

```text
404 NOT_FOUND
```

rather than:

```text
403 FORBIDDEN
```

The exact policy should be standardized across the API.

---

# 66. Authorization Audit Logging

Sensitive authorization events should be audited.

Examples:

```text
role.created
role.updated
role.deleted
role.permissions.updated
role.assigned

permission.denied
tenant.access.denied

owner.transferred

member.deleted
payment.refunded
membership.cancelled
```

High-volume ordinary permission checks do not necessarily need database audit records.

---

# 67. Permission Denial Logging

A denied request may be logged for security monitoring:

```text
authorization.denied
```

Metadata:

```text
userId
tenantId
permission
resourceType
resourceId
requestId
IP
timestamp
```

Never log secrets.

---

# 68. Break-Glass Access

Super Admin support may require emergency tenant access.

This should be explicit.

Example:

```text
Super Admin
     ↓
Request support access
     ↓
Select tenant
     ↓
Reason required
     ↓
Temporary access
     ↓
Full audit trail
```

Do not silently impersonate users.

---

# 69. Impersonation

If impersonation is ever implemented:

```text
Super Admin
   ↓
Impersonate User
```

the session must clearly identify:

```text
actorUserId
effectiveUserId
tenantId
impersonationId
reason
```

Every action must remain attributable to the real Super Admin.

---

# 70. Step-Up Authorization

Sensitive operations may require recent authentication.

Example:

```text
payments.refund
role.permissions.update
owner.transfer
```

Authorization flow:

```text
Permission
    +
Recent authentication
    +
Optional MFA
    =
Sensitive operation allowed
```

---

# 71. Feature Flags vs Permissions

These are different.

Permission:

```text
Can the user perform this action?
```

Feature flag:

```text
Is this feature enabled for this tenant?
```

Example:

```text
Tenant feature:
payments = false

User permission:
payments.create = true
```

Result:

```text
DENY
```

because the feature is disabled.

---

# 72. Final Access Decision

A request is allowed only when all required conditions pass:

```text
Authenticated
    AND
Session valid
    AND
Tenant valid
    AND
Membership active
    AND
Permission granted
    AND
Feature enabled
    AND
Resource policy allows
```

---

# 73. Caching Permissions

Permissions may be cached briefly for performance.

However:

```text
role changed
permission removed
user suspended
tenant suspended
```

must eventually invalidate authorization caches.

Recommended cache strategy:

```text
Redis
   ↓
short TTL
+
explicit invalidation
```

Do not use an indefinitely cached permission set.

---

# 74. Authorization Cache Key

Conceptually:

```text
authz:{tenantId}:{userId}
```

Example:

```text
authz:tenant_123:user_456
```

The cache should contain effective permission information.

---

# 75. Authorization Cache Invalidation

Invalidate when:

```text
role permissions change
user role changes
membership revoked
user suspended
tenant suspended
permission catalog changes
```

Example:

```text
Role updated
   ↓
Invalidate affected authorization contexts
```

---

# 76. API Contract

Permission codes should be stable.

Clients should receive:

```json
{
  "permissions": ["members.read", "members.update", "workouts.read"]
}
```

Do not make frontend clients depend on role names alone.

---

# 77. Current User Endpoint

```text
GET /api/v1/auth/me
```

can return:

```json
{
  "user": {
    "id": "usr_123",
    "firstName": "John"
  },
  "tenant": {
    "id": "tenant_123",
    "name": "Example Gym"
  },
  "role": {
    "code": "TRAINER"
  },
  "permissions": ["members.read", "workouts.read", "workouts.create"]
}
```

---

# 78. Tenant Switch

When a user changes tenant:

```text
Tenant A
 ↓
Tenant B
```

the API must recalculate:

```text
role
permissions
feature flags
resource policies
tenant status
```

Never reuse Tenant A authorization context.

---

# 79. Multi-Tenant User Example

User:

```text
John
```

Memberships:

```text
Tenant A → MEMBER
Tenant B → TRAINER
Tenant C → ADMIN
```

Effective permissions depend on active tenant.

```text
Tenant A:
members.read = false

Tenant B:
members.read = true

Tenant C:
members.delete = true
```

---

# 80. Tenant Data Query Rule

Every repository should expose tenant-aware methods.

Bad:

```typescript
memberRepository.findById(id);
```

Better:

```typescript
memberRepository.findById({
  tenantId,
  memberId,
});
```

This makes tenant scope explicit.

---

# 81. Repository Pattern

Recommended:

```text
Service
   ↓
Repository
   ↓
Prisma
```

Example:

```typescript
memberRepository.findById({
  tenantId: auth.tenantId,
  memberId,
});
```

Repository:

```typescript
return prisma.member.findFirst({
  where: {
    id: memberId,
    tenantId,
  },
});
```

---

# 82. Service-Level Authorization

Authorization should not exist only in controllers.

Controllers can perform:

```text
authentication
route permission
```

Services should perform:

```text
business/resource authorization
```

Example:

```text
Controller
 ↓
members.update permission
 ↓
MemberService
 ↓
resource policy
 ↓
Repository
```

---

# 83. Database-Level Protection

Application-level tenant isolation is mandatory.

As the platform matures, PostgreSQL Row-Level Security (RLS) may be considered as an additional defense layer.

Potential future model:

```text
Application authorization
        +
PostgreSQL RLS
        =
Defense in depth
```

RLS should not be introduced casually because it adds operational complexity and must be integrated correctly with Prisma connection/session handling.

---

# 84. Authorization Testing Strategy

Tests must verify:

```text
role
+
permission
+
tenant
+
resource
```

not just role names.

---

# 85. Role Tests

Example:

```text
OWNER
→ members.update
→ ALLOW

ADMIN
→ members.update
→ ALLOW

TRAINER
→ members.update
→ depending on resource policy

MEMBER
→ members.update
→ DENY
```

---

# 86. Tenant Isolation Tests

```text
Tenant A Admin
       ↓
Tenant A Member
       ↓
ALLOW
```

But:

```text
Tenant A Admin
       ↓
Tenant B Member
       ↓
DENY
```

---

# 87. Trainer Tests

```text
Trainer A
 ↓
Assigned Member A
 ↓
ALLOW
```

```text
Trainer A
 ↓
Unassigned Member B
 ↓
DENY
```

---

# 88. Member Tests

```text
Member A
 ↓
Own Workout
 ↓
ALLOW
```

```text
Member A
 ↓
Member B Workout
 ↓
DENY
```

---

# 89. Role Modification Tests

```text
ADMIN
 ↓
Change role permissions
 ↓
Allowed only if roles.update
```

And:

```text
TRAINER
 ↓
Change own permissions
 ↓
DENY
```

---

# 90. Owner Protection Tests

Test:

```text
Delete last OWNER
```

Expected:

```text
DENY
```

Test:

```text
Transfer OWNER
```

Expected:

```text
ALLOW only with proper authorization
```

---

# 91. Platform Permission Tests

Tenant users must never receive:

```text
platform.tenants.update
platform.mobile-builds.create
platform.mobile-releases.publish
```

unless they are explicitly operating under a platform authorization context.

---

# 92. Permission Enumeration Tests

An attacker should not be able to:

```text
POST /roles
```

with:

```json
{
  "permissions": ["platform.tenants.delete"]
}
```

and successfully create the role.

The API must validate the allowed permission namespace.

---

# 93. Authorization Performance

Avoid performing excessive queries for every request.

Recommended:

```text
JWT/session validation
       ↓
Redis authorization cache
       ↓
Database fallback
```

But sensitive authorization should remain capable of reflecting revocation quickly.

---

# 94. Authorization Observability

Track:

```text
authorization.denied
authorization.permission_missing
authorization.tenant_denied
authorization.resource_denied
```

Monitor unusual patterns.

Example:

```text
One user
 ↓
hundreds of denied resources
 ↓
Possible abuse
```

---

# 95. RBAC Management UI

Super Admin should manage:

```text
Platform roles
Platform permissions
```

Tenant Admin/Owner should manage:

```text
Tenant roles
Tenant role permissions
Staff role assignments
```

Members should not see RBAC management screens.

---

# 96. Tenant Role Management UI

Example:

```text
Settings
 └── Roles & Permissions
       │
       ├── Owner
       ├── Admin
       ├── Trainer
       ├── Member
       └── Custom Roles
```

Permission groups:

```text
Members
Workouts
Attendance
Payments
Reports
Settings
```

---

# 97. Role Assignment UI

Example:

```text
Staff Member
    ↓
Role
    ↓
Trainer
```

or:

```text
Front Desk
```

The UI should show only roles the current administrator is allowed to assign.

---

# 98. Permission UX

Avoid exposing raw permission codes to normal users.

Instead show:

```text
Members
 [✓] View members
 [✓] Create members
 [✓] Edit members
 [ ] Delete members
```

Internally:

```text
members.read
members.create
members.update
members.delete
```

---

# 99. RBAC and White-Label Mobile Apps

White-label applications use the same RBAC API.

Example:

```text
Gold's Gym Staff App
       ↓
Central API
       ↓
User = TRAINER
       ↓
Trainer permissions
```

The app does not need tenant-specific authorization code.

---

# 100. RBAC and Feature Configuration

Example:

```text
Tenant A
payments = enabled

Tenant B
payments = disabled
```

Even if:

```text
ADMIN
payments.create
```

exists for Tenant B:

```text
payments feature disabled
→ DENY
```

---

# 101. Security Rules

The following rules are mandatory:

### Rule 1

Never authorize using frontend state.

### Rule 2

Never authorize using role names alone.

### Rule 3

Always establish tenant context.

### Rule 4

Always validate tenant membership.

### Rule 5

Always enforce permissions on the API.

### Rule 6

Apply resource-level policies where necessary.

### Rule 7

Never allow tenant administrators to grant platform permissions.

### Rule 8

Protect system roles.

### Rule 9

Protect the last tenant owner.

### Rule 10

Audit sensitive authorization changes.

### Rule 11

Invalidate authorization cache after role changes.

### Rule 12

Test cross-tenant access automatically.

---

# 102. Recommended Backend Structure

```text
apps/platform-api/src/
└── modules/
    └── authorization/
        ├── authorization.service.ts
        ├── authorization.repository.ts
        ├── authorization.types.ts
        ├── authorization.schemas.ts
        │
        ├── guards/
        │   ├── authentication.guard.ts
        │   ├── tenant.guard.ts
        │   └── permission.guard.ts
        │
        ├── policies/
        │   ├── member.policy.ts
        │   ├── trainer.policy.ts
        │   ├── workout.policy.ts
        │   ├── payment.policy.ts
        │   └── membership.policy.ts
        │
        └── permissions/
            ├── permission.constants.ts
            └── permission.seed.ts
```

---

# 103. Permission Constants

Avoid repeating strings throughout the codebase.

Example:

```typescript
export const PERMISSIONS = {
  MEMBERS_READ: "members.read",
  MEMBERS_CREATE: "members.create",
  MEMBERS_UPDATE: "members.update",
  MEMBERS_DELETE: "members.delete",

  PAYMENTS_READ: "payments.read",
  PAYMENTS_REFUND: "payments.refund",
} as const;
```

This reduces typos.

---

# 104. Permission Type Safety

Where possible:

```typescript
type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
```

This allows TypeScript to catch invalid permission references.

---

# 105. Policy Interface

Recommended abstraction:

```typescript
interface ResourcePolicy<T> {
  canRead(auth: AuthorizationContext, resource: T): Promise<boolean>;

  canUpdate(auth: AuthorizationContext, resource: T): Promise<boolean>;
}
```

This makes resource authorization testable.

---

# 106. Example Member Policy

Conceptually:

```typescript
async function canUpdateMember(auth, member) {
  if (auth.tenantId !== member.tenantId) {
    return false;
  }

  if (auth.permissions.has("members.update")) {
    if (auth.role === "TRAINER") {
      return isAssignedTrainer(auth, member);
    }

    return true;
  }

  return false;
}
```

The final implementation should avoid hard-coding role checks where permission/resource policy is sufficient.

---

# 107. Avoid Authorization Duplication

Do not implement separate authorization rules for:

```text
Web
iOS
Android
API
```

The API is the source of truth.

Clients consume the same authorization model.

---

# 108. API as Security Boundary

Final security model:

```text
Web
Mobile
Super Admin
        │
        ▼
     Platform API
        │
        ▼
Authentication
        │
        ▼
Tenant Authorization
        │
        ▼
Permission Authorization
        │
        ▼
Resource Authorization
        │
        ▼
PostgreSQL
```

---

# 109. Final RBAC Model

The complete model is:

```text
                       USER
                         │
                         ▼
                TENANT MEMBERSHIP
                         │
                         ▼
                       ROLE
                         │
                         ▼
                  ROLE PERMISSIONS
                         │
                         ▼
                    PERMISSIONS
                         │
                         ▼
                  RESOURCE POLICY
                         │
                         ▼
                 FEATURE AVAILABILITY
                         │
                         ▼
                    ALLOW / DENY
```

---

# 110. Final Authorization Invariant

A request is authorized only when:

```text
Authenticated
AND
Session valid
AND
Tenant membership valid
AND
Tenant active
AND
Permission granted
AND
Feature enabled
AND
Resource belongs to tenant
AND
Resource policy allows access
```

Result:

```text
AUTHORIZED
```

Otherwise:

```text
DENIED
```

---

# 111. Implementation Order

Implement RBAC in this order:

```text
Phase 1
├── Permission model
├── Role model
├── RolePermission
└── Permission seed

Phase 2
├── TenantMembership
├── Default tenant roles
└── Role assignment

Phase 3
├── Authentication context
├── Tenant context
├── Permission resolution
└── Authorization service

Phase 4
├── Fastify permission guard
├── Route authorization
└── API enforcement

Phase 5
├── Resource policies
├── Trainer/member restrictions
└── Member ownership restrictions

Phase 6
├── Custom roles
├── Role management API
└── Role management UI

Phase 7
├── Redis authorization caching
├── Cache invalidation
└── Observability

Phase 8
├── Security testing
├── Cross-tenant testing
├── Authorization penetration testing
└── Production review
```

---

# 112. Final Architecture Decision

The Gym SaaS platform will use:

```text
RBAC
+
Permission-Based Authorization
+
Tenant-Scoped Membership
+
Resource-Level Policies
+
Feature Flags
+
Central Fastify Authorization
+
Prisma/PostgreSQL
+
Audit Logging
+
Automated Security Tests
```

The platform will **not** use:

```text
role === "ADMIN"
```

as the primary authorization mechanism.

Instead:

```text
USER
 ↓
TENANT MEMBERSHIP
 ↓
ROLE
 ↓
PERMISSIONS
 ↓
RESOURCE POLICY
 ↓
ALLOW / DENY
```

This design allows the platform to start with:

```text
OWNER
ADMIN
TRAINER
MEMBER
```

while later supporting:

```text
FRONT_DESK
ACCOUNTANT
SENIOR_TRAINER
MANAGER
CUSTOM_ROLE
```

without changing the core authorization architecture.

The same authorization system will serve:

```text
Super Admin
Tenant Web
Tenant Website
Member iOS
Member Android
Staff iOS
Staff Android
```

through the centralized Platform API.
