# Multi-Tenant Architecture

**Project:** Gym Platform  
**Document:** Multi-Tenant Architecture  
**Status:** Proposed  
**Version:** 1.0  
**Last Updated:** 2026-09-09

---

## 1. Purpose

This document defines the architecture required to transform the existing OpenGym application from a primarily single-user/self-hosted gym application into a **multi-tenant Gym SaaS platform**.

The platform will support:

- Super Admin
- Multiple Gym Tenants
- Tenant Owners
- Tenant Admins
- Trainers
- Gym Members
- Tenant-branded websites
- Tenant applications
- Member iOS application
- Member Android application
- Staff iOS application
- Staff Android application
- Centralized authentication
- Centralized authorization/RBAC
- Tenant-specific branding
- Tenant-specific feature configuration
- Centralized API
- Tenant-isolated data

The architecture must allow multiple gyms to operate independently while sharing the same platform infrastructure and application code.

---

# 2. Architectural Goal

The target architecture is:

```text
                         GYM PLATFORM
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
         Super Admin      Tenant Apps      Websites
              │               │               │
              └───────────────┼───────────────┘
                              │
                              ▼
                       CENTRAL API
                         Fastify
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
           Auth              RBAC            Tenant
             │                │                │
             └────────────────┼────────────────┘
                              │
                       Domain Services
                              │
       ┌──────────────┬───────┼────────┬──────────────┐
       ▼              ▼       ▼        ▼              ▼
     Users         Workouts Exercises Memberships   Payments
       │              │       │        │              │
       └──────────────┴───────┼────────┴──────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
               PostgreSQL             Redis
                    │
                    ▼
              Object Storage


                         MOBILE
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
           Member App             Staff App
            iOS/Android           iOS/Android
                │                     │
                └──────────┬──────────┘
                           ▼
                      CENTRAL API
```

---

# 3. Core Architectural Principles

The platform must follow these principles.

## 3.1 Centralized API

All applications communicate with one centralized API.

```text
Super Admin
Tenant App
Website
Member Mobile
Staff Mobile
       │
       ▼
Central API
```

There should not be separate APIs for:

```text
/admin-api
/member-api
/trainer-api
/mobile-api
/tenant-api
```

Instead, the API should be organized by domain and authorization.

Example:

```text
/api/v1/auth/*
/api/v1/users/*
/api/v1/tenants/*
/api/v1/members/*
/api/v1/trainers/*
/api/v1/workouts/*
/api/v1/exercises/*
/api/v1/memberships/*
/api/v1/payments/*
```

Authorization determines what a caller can access.

---

# 4. Multi-Tenant Model

The platform follows a **shared application + shared database + tenant isolation** model.

```text
                    PostgreSQL
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
     Tenant A         Tenant B         Tenant C
        │                │                │
        ▼                ▼                ▼
     Members          Members          Members
     Trainers         Trainers         Trainers
     Workouts         Workouts         Workouts
     Payments         Payments         Payments
```

All tenant-owned records must contain a `tenantId`.

Example:

```text
Member
├── id
├── tenantId
├── userId
├── name
└── ...
```

```text
Workout
├── id
├── tenantId
├── memberId
├── trainerId
└── ...
```

---

# 5. Tenant Isolation

Tenant isolation is a critical security requirement.

A user belonging to Tenant A must never be able to access Tenant B's data.

For example:

```text
Tenant A
Member A1
Member A2
Workout A1
```

must never be accessible to:

```text
Tenant B
```

even if Tenant B knows the database ID.

The API must enforce:

```text
Authenticated User
       ↓
Tenant Context
       ↓
Authorization
       ↓
Database Query
       ↓
Tenant-filtered data
```

Never rely on the frontend to enforce tenant isolation.

---

# 6. Tenant Context

Every authenticated request must establish a tenant context where applicable.

Example:

```text
Request
   │
   ▼
Authentication
   │
   ▼
User Identity
   │
   ▼
Tenant Membership
   │
   ▼
Tenant Context
   │
   ▼
RBAC
   │
   ▼
Resource Authorization
   │
   ▼
Service
```

The backend should know:

```text
userId
tenantId
role
permissions
```

before executing tenant-owned operations.

---

# 7. Tenant Resolution

Tenant resolution determines which gym the request belongs to.

Possible sources include:

### 7.1 Authenticated membership

For mobile applications:

```text
Access Token
    ↓
User
    ↓
Tenant Membership
    ↓
Tenant
```

### 7.2 Subdomain

For tenant websites/apps:

```text
goldsgym.platform.com
        ↓
Tenant Resolver
        ↓
tenant = goldsgym
```

### 7.3 Custom domain

Future support:

```text
www.goldsgym.com
        ↓
Domain Resolver
        ↓
Tenant
```

### 7.4 Explicit tenant selection

Useful when a user belongs to multiple gyms.

```text
Login
  ↓
User has multiple memberships
  ↓
Select Gym
  ↓
Active Tenant
```

---

# 8. Tenant Membership

A user should not necessarily have a single global role.

Instead, roles should normally be assigned through tenant membership.

Example:

```text
User
 │
 ├── Tenant A → OWNER
 │
 └── Tenant B → TRAINER
```

Another example:

```text
User
 │
 ├── Tenant A → MEMBER
 ├── Tenant B → MEMBER
 └── Tenant C → TRAINER
```

This allows the same person to participate in multiple gyms.

---

# 9. Platform-Level Roles

Platform roles belong to the entire system.

```text
SUPER_ADMIN
PLATFORM_SUPPORT
PLATFORM_OPERATOR
```

These roles are different from tenant roles.

Example:

```text
SUPER_ADMIN
    │
    ├── Manage tenants
    ├── Manage plans
    ├── Manage platform settings
    ├── Manage feature flags
    ├── View platform analytics
    └── Manage platform users
```

Platform users do not automatically become members of a gym.

---

# 10. Tenant-Level Roles

Initial tenant roles:

```text
OWNER
ADMIN
TRAINER
MEMBER
```

Hierarchy:

```text
OWNER
  │
  ├── ADMIN
  │
  ├── TRAINER
  │
  └── MEMBER
```

This hierarchy is conceptual.

Actual authorization must be permission-based.

---

# 11. Permission-Based Authorization

Do not implement authorization only as:

```typescript
if (user.role === "ADMIN") {
   ...
}
```

Instead:

```text
Role
 ↓
Permissions
 ↓
Authorization
```

Example:

```text
OWNER
├── tenant.read
├── tenant.update
├── members.read
├── members.create
├── members.update
├── members.delete
├── trainers.manage
├── payments.manage
└── reports.read
```

Trainer:

```text
TRAINER
├── members.read
├── assigned_members.read
├── workouts.create
├── workouts.update
├── progress.read
└── attendance.manage
```

Member:

```text
MEMBER
├── profile.read
├── profile.update
├── workouts.read
├── workout_sessions.create
├── progress.read
└── attendance.read
```

---

# 12. Super Admin Architecture

The Super Admin application is the **platform control plane**.

```text
Super Admin
     │
     ▼
Super Admin Web
     │
     ▼
Central API
     │
     ▼
Platform Services
```

Responsibilities:

```text
Tenant Management
Subscription Plans
Feature Flags
Platform Settings
Global Exercises
Platform Users
Audit Logs
System Monitoring
Tenant Suspension
Tenant Activation
Platform Analytics
```

Super Admin should not bypass the normal authorization system.

All privileged operations must be audited.

---

# 13. Tenant Application

Each gym receives access to the same Tenant Application.

Example:

```text
goldsgym.platform.com
fitnesspro.platform.com
powerfit.platform.com
```

The application loads:

```text
Tenant
   ↓
Branding
   ↓
Feature Configuration
   ↓
Permissions
   ↓
Application
```

The codebase remains shared.

There should not be:

```text
goldsgym-app/
fitnesspro-app/
powerfit-app/
```

Instead:

```text
tenant-app/
```

with runtime tenant configuration.

---

# 14. Tenant Branding

Tenant branding is configuration, not separate application code.

Example:

```text
TenantBranding
├── logo
├── favicon
├── primaryColor
├── secondaryColor
├── accentColor
├── font
├── darkMode
└── customCss
```

The tenant application loads branding:

```text
GET /api/v1/tenant/branding
```

Example response:

```json
{
  "tenantId": "tenant_123",
  "name": "Gold's Gym",
  "logoUrl": "...",
  "primaryColor": "#000000",
  "secondaryColor": "#FFD700",
  "theme": "dark"
}
```

The frontend applies this configuration dynamically.

---

# 15. Tenant Feature Flags

Tenants should be able to enable or disable platform features.

Example:

```text
TenantFeatures
├── workouts
├── classes
├── attendance
├── payments
├── nutrition
├── AI_COACH
├── notifications
└── reports
```

The platform may also control global feature availability.

Final feature availability:

```text
Platform Feature
       ↓
Tenant Feature
       ↓
User Permission
       ↓
Feature Available
```

---

# 16. Website Architecture

The platform should support two website types.

## Platform Website

```text
www.platform.com
```

Used for:

```text
Marketing
Pricing
Features
Documentation
Contact
Login
Tenant registration
```

## Tenant Website

Example:

```text
goldsgym.platform.com
```

or eventually:

```text
goldsgym.com
```

Tenant websites should load:

```text
Tenant
Tenant Branding
Website Configuration
Membership Plans
Classes
Trainers
Contact Information
```

---

# 17. Mobile Applications

There will be two mobile application products.

## 17.1 Member App

```text
Member App
├── iOS
└── Android
```

Features:

```text
Authentication
Profile
Gym
Workout Plans
Workout Sessions
Exercise Tracking
Progress
Body Measurements
Personal Records
Notifications
Membership
Attendance
```

## 17.2 Staff App

```text
Staff App
├── iOS
└── Android
```

The same application supports:

```text
OWNER
ADMIN
TRAINER
```

Navigation and capabilities are determined by permissions.

---

# 18. Mobile Authentication

Mobile applications use the same centralized authentication system.

```text
Mobile
   ↓
Central Auth
   ↓
Identity
   ↓
Tenant Membership
   ↓
Role
   ↓
Permissions
```

Authentication must support:

```text
Passkeys / WebAuthn
Session management
Refresh tokens where applicable
Logout
Account recovery
OTP where required
Device management
```

Authentication architecture must be centralized and documented separately in:

```text
AUTHENTICATION_IMPLEMENTATION.md
```

---

# 19. Database Architecture

PostgreSQL should be the primary database.

Recommended stack:

```text
PostgreSQL
    +
Prisma
```

The database should use relational models.

Core platform models:

```text
User
Tenant
TenantMembership
Role
Permission
RolePermission
```

Tenant configuration:

```text
TenantBranding
TenantSettings
TenantFeature
TenantDomain
```

Gym domain:

```text
Member
Trainer
Exercise
Workout
WorkoutPlan
WorkoutSession
WorkoutSet
Progress
Attendance
Membership
Payment
```

---

# 20. Database Tenant Ownership

Every tenant-owned table must have a tenant relationship.

Example:

```text
Tenant
  │
  ├── Members
  ├── Trainers
  ├── Workouts
  ├── WorkoutSessions
  ├── Memberships
  ├── Payments
  ├── Attendance
  └── TenantSettings
```

Example Prisma concept:

```prisma
model Member {
  id       String @id @default(cuid())
  tenantId String

  tenant   Tenant @relation(fields: [tenantId], references: [id])

  userId   String
  user     User @relation(fields: [userId], references: [id])
}
```

---

# 21. Platform-Owned Data

Not every entity requires a tenant.

Platform-owned examples:

```text
SubscriptionPlan
GlobalFeature
GlobalExercise
PlatformSetting
SystemConfiguration
```

These should not be duplicated for every tenant unless tenant customization is required.

---

# 22. Global vs Tenant Exercises

Exercises should support global and tenant-specific records.

Example:

```text
Exercise
├── id
├── tenantId nullable
├── name
├── description
├── muscleGroup
└── equipment
```

Interpretation:

```text
tenantId = NULL
    ↓
Global exercise

tenantId = tenant_123
    ↓
Tenant-specific exercise
```

A tenant can use global exercises while also creating private exercises.

---

# 23. API Architecture

API should be versioned.

```text
/api/v1
```

Domain-based structure:

```text
/api/v1/auth
/api/v1/users
/api/v1/tenants
/api/v1/members
/api/v1/trainers
/api/v1/exercises
/api/v1/workouts
/api/v1/workout-sessions
/api/v1/progress
/api/v1/attendance
/api/v1/memberships
/api/v1/payments
/api/v1/notifications
/api/v1/files
```

Platform APIs:

```text
/api/v1/platform/tenants
/api/v1/platform/users
/api/v1/platform/plans
/api/v1/platform/features
/api/v1/platform/audit-logs
```

---

# 24. Centralized API Contract

All clients must consume a shared API contract.

Recommended package:

```text
packages/api-contracts
```

Possible technology:

```text
OpenAPI
Zod
TypeScript
```

The goal is:

```text
Backend
   │
   ▼
API Contract
   │
   ├── Super Admin
   ├── Tenant Web
   ├── Website
   ├── Member Mobile
   └── Staff Mobile
```

This prevents each frontend from inventing its own API models.

---

# 25. Recommended Monorepo

Target repository:

```text
gym-platform/
│
├── apps/
│   │
│   ├── platform-api/
│   ├── super-admin/
│   ├── tenant-app/
│   ├── website/
│   ├── member-mobile/
│   └── staff-mobile/
│
├── packages/
│   │
│   ├── api-contracts/
│   ├── auth/
│   ├── rbac/
│   ├── tenant/
│   ├── database/
│   ├── ui/
│   ├── validation/
│   ├── types/
│   ├── config/
│   └── utils/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── MULTI_TENANT_ARCHITECTURE.md
│   ├── AUTHENTICATION_IMPLEMENTATION.md
│   ├── RBAC.md
│   ├── TENANT_BRANDING.md
│   ├── API.md
│   ├── MOBILE.md
│   ├── WEBSITE.md
│   └── DATABASE.md
│
├── docker/
├── scripts/
├── package.json
└── README.md
```

---

# 26. Request Lifecycle

A typical tenant request should follow:

```text
Client
  │
  ▼
HTTPS
  │
  ▼
Fastify
  │
  ▼
Request ID
  │
  ▼
Authentication
  │
  ▼
User Identity
  │
  ▼
Tenant Resolution
  │
  ▼
RBAC
  │
  ▼
Permission Check
  │
  ▼
Domain Service
  │
  ▼
Tenant-Scoped Repository
  │
  ▼
PostgreSQL
  │
  ▼
Response
```

---

# 27. Tenant-Scoped Repository

Application services should not manually repeat tenant filters everywhere.

Avoid:

```typescript
prisma.member.findMany();
```

for tenant-owned data.

Prefer a tenant-aware abstraction:

```typescript
memberRepository.findMany({
  tenantId,
});
```

or a transaction/request context that guarantees tenant scoping.

The architectural goal is to make accidental cross-tenant queries difficult.

---

# 28. Caching

Redis can be introduced for:

```text
Sessions
Rate limiting
Tenant configuration
Feature flags
Frequently accessed data
Background jobs
Distributed locks
```

Do not use Redis as the primary source of truth.

PostgreSQL remains authoritative.

---

# 29. Background Jobs

Long-running operations should not block HTTP requests.

Examples:

```text
Email
Push notifications
Reports
Data exports
AI processing
Image processing
Subscription processing
Analytics
```

Architecture:

```text
API
 │
 ▼
Queue
 │
 ▼
Worker
 │
 ├── Email
 ├── Notification
 ├── Report
 ├── AI
 └── Export
```

A queue such as BullMQ can be introduced when required.

---

# 30. File Storage

Files should not be stored directly inside the application container.

Use object storage:

```text
S3-compatible storage
```

Examples:

```text
Tenant logo
User avatar
Exercise image
Trainer image
Documents
Exports
Reports
```

Database stores metadata:

```text
File
├── id
├── tenantId
├── objectKey
├── filename
├── mimeType
└── size
```

---

# 31. Audit Logging

Important platform and tenant operations must be auditable.

Example:

```text
AuditLog
├── id
├── tenantId
├── actorUserId
├── action
├── resourceType
├── resourceId
├── metadata
├── ipAddress
├── userAgent
└── createdAt
```

Examples:

```text
TENANT_CREATED
TENANT_SUSPENDED
USER_INVITED
ROLE_CHANGED
MEMBER_DELETED
PAYMENT_UPDATED
BRANDING_UPDATED
WORKOUT_MODIFIED
```

Super Admin operations must always be logged.

---

# 32. Tenant Lifecycle

Tenant lifecycle:

```text
PROVISIONING
     ↓
ACTIVE
     ↓
SUSPENDED
     ↓
ACTIVE
     ↓
CANCELLED
     ↓
DELETED
```

Recommended states:

```text
PENDING
ACTIVE
SUSPENDED
CANCELLED
DELETED
```

Suspending a tenant should disable application access without immediately deleting data.

---

# 33. Tenant Provisioning

Tenant creation:

```text
Super Admin
     │
     ▼
Create Tenant
     │
     ▼
Create Owner
     │
     ▼
Create Tenant Settings
     │
     ▼
Create Branding
     │
     ▼
Create Default Features
     │
     ▼
Create Default Roles
     │
     ▼
Tenant ACTIVE
```

Provisioning should be transactional where possible.

---

# 34. Tenant Deletion

Tenant deletion must be treated as a destructive operation.

Recommended approach:

```text
Active
 ↓
Cancellation
 ↓
Retention period
 ↓
Soft deletion
 ↓
Data export
 ↓
Permanent deletion
```

Permanent deletion should require explicit authorization.

---

# 35. Subscription Architecture

The platform should separate:

```text
Tenant
Subscription
SubscriptionPlan
SubscriptionStatus
```

Example:

```text
Tenant
   │
   ▼
Subscription
   │
   ▼
SubscriptionPlan
```

Possible plans:

```text
FREE
STARTER
PRO
ENTERPRISE
```

Plan limits can control:

```text
Maximum members
Maximum trainers
Features
Storage
AI usage
Reports
Custom domains
White-labeling
```

---

# 36. Feature Availability

Feature access should be calculated from:

```text
Platform
   ↓
Subscription
   ↓
Tenant Configuration
   ↓
User Permissions
   ↓
Feature
```

For example:

```text
AI Coach
```

requires:

```text
Platform enabled
AND
Tenant plan supports AI
AND
Tenant enabled AI
AND
User has permission
```

---

# 37. Mobile Tenant Resolution

Member mobile:

```text
Login
 ↓
User
 ↓
Tenant Memberships
 ↓
Select Tenant if required
 ↓
Active Tenant
 ↓
Load Branding
 ↓
Load Features
 ↓
Load Dashboard
```

Staff mobile follows the same model.

---

# 38. Multiple Gym Memberships

The architecture should support users belonging to multiple tenants.

Example:

```text
Rohit
 │
 ├── Gold Gym
 │     └── MEMBER
 │
 └── Fitness Pro
       └── TRAINER
```

The active tenant must be explicitly represented in application state.

```text
activeTenantId
```

The client must not be allowed to arbitrarily switch to a tenant for which the user has no membership.

The backend must validate every tenant switch.

---

# 39. Tenant Context Security

Never trust:

```http
X-Tenant-ID: tenant_123
```

by itself.

The backend must verify:

```text
Authenticated User
        +
Requested Tenant
        +
Tenant Membership
        +
Role
        +
Permission
```

Only then should the request proceed.

---

# 40. API Security Rules

Every protected request should follow:

```text
Authentication
     ↓
Tenant Resolution
     ↓
Membership Verification
     ↓
Permission Verification
     ↓
Resource Ownership
```

For example:

```text
Trainer requests Member A
```

The system verifies:

```text
Trainer authenticated
        ↓
Trainer belongs to Tenant X
        ↓
Member A belongs to Tenant X
        ↓
Trainer has access to Member A
        ↓
Allow
```

---

# 41. Resource-Level Authorization

Tenant-level authorization alone is not enough.

Example:

```text
Trainer belongs to Gym A
```

does not necessarily mean:

```text
Trainer can access every member of Gym A.
```

Trainer access may be restricted to assigned members.

Therefore authorization may require:

```text
Tenant
+
Role
+
Permission
+
Resource ownership/assignment
```

---

# 42. Frontend Architecture

Frontend applications should consume configuration from the backend.

Example:

```text
Application startup
        ↓
Identify tenant
        ↓
Fetch tenant configuration
        ↓
Fetch branding
        ↓
Fetch feature flags
        ↓
Initialize application
```

Avoid hard-coding tenant information.

Bad:

```typescript
const logo = "/gold-gym.png";
```

Good:

```typescript
const logo = tenant.branding.logoUrl;
```

---

# 43. Shared UI Package

Common components should live in:

```text
packages/ui
```

Examples:

```text
Button
Input
Modal
Table
Card
Avatar
Navigation
Charts
Form
Toast
Dialog
```

Branding should be applied through theme variables.

---

# 44. Domain Boundaries

The backend should be organized by business domains.

Recommended:

```text
src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── tenants/
│   ├── rbac/
│   ├── members/
│   ├── trainers/
│   ├── exercises/
│   ├── workouts/
│   ├── progress/
│   ├── attendance/
│   ├── memberships/
│   ├── payments/
│   ├── notifications/
│   ├── files/
│   └── platform/
│
├── infrastructure/
├── plugins/
├── middleware/
├── config/
└── app.ts
```

---

# 45. Recommended Backend Layers

Each domain should preferably follow:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Database
```

With cross-cutting concerns:

```text
Authentication
Authorization
Validation
Logging
Tenant Context
Error Handling
```

---

# 46. Error Handling

API errors must be standardized.

Example:

```json
{
  "success": false,
  "error": {
    "code": "TENANT_ACCESS_DENIED",
    "message": "You do not have access to this tenant."
  },
  "requestId": "req_123"
}
```

Clients should depend on stable error codes rather than parsing messages.

---

# 47. Observability

The platform should eventually include:

```text
Structured logging
Metrics
Tracing
Error tracking
Health checks
Audit logs
```

Recommended architecture:

```text
Fastify
   │
   ├── Logs
   ├── Metrics
   └── Traces
          │
          ├── Grafana
          ├── Prometheus
          └── Jaeger
```

These are operational concerns and should remain separate from business logic.

---

# 48. Environment Architecture

Development:

```text
Local
 ↓
Docker Compose
 ↓
PostgreSQL
Redis
API
Web
```

Staging:

```text
Cloud
 ↓
Staging API
Staging DB
Staging Storage
```

Production:

```text
Production
 ↓
Load Balancer
 ↓
API Instances
 ↓
PostgreSQL
Redis
Object Storage
Workers
```

---

# 49. Horizontal Scaling

The API should be stateless wherever possible.

```text
                 Load Balancer
                      │
           ┌──────────┼──────────┐
           ▼          ▼          ▼
        API #1     API #2     API #3
           │          │          │
           └──────────┼──────────┘
                      │
                PostgreSQL
```

Do not depend on local process memory for critical session or tenant state.

---

# 50. White-Label Strategy

The initial version should use a shared mobile application.

```text
Gym Platform App
      │
      ├── Tenant A
      ├── Tenant B
      └── Tenant C
```

Do not initially generate a separate iOS/Android application for every tenant.

Future architecture may support:

```text
Tenant Branding
      ↓
Build Configuration
      ↓
Automated Mobile Build
      ↓
Tenant-specific iOS/Android App
```

This should be considered a later phase.

---

# 51. Recommended Initial Mobile Strategy

### Member App

One application:

```text
Gym Platform Member
```

available on:

```text
iOS
Android
```

### Staff App

One application:

```text
Gym Platform Staff
```

available on:

```text
iOS
Android
```

Roles determine functionality:

```text
OWNER
ADMIN
TRAINER
```

---

# 52. Data Access Rules

Every repository dealing with tenant-owned data must require tenant context.

Conceptually:

```typescript
repository.findMember({
  tenantId,
  memberId,
});
```

Not:

```typescript
repository.findMember(memberId);
```

This makes tenant isolation explicit.

---

# 53. Database Indexing

Tenant-owned tables should generally index:

```text
tenantId
```

Common compound indexes:

```text
(tenantId, userId)
(tenantId, createdAt)
(tenantId, status)
(tenantId, memberId)
(tenantId, trainerId)
```

Indexes should be based on actual query patterns.

---

# 54. Unique Constraints

Global uniqueness and tenant uniqueness must be distinguished.

Example:

An email may be globally unique if the platform uses one identity per user.

But a gym membership number may only need to be unique inside a tenant.

Example:

```text
@@unique([tenantId, membershipNumber])
```

not:

```text
@@unique([membershipNumber])
```

when the business rule is tenant-scoped.

---

# 55. Tenant Branding Storage

Brand assets should be stored in object storage.

Example:

```text
storage/
└── tenants/
    └── tenant_123/
        ├── logo.png
        ├── favicon.png
        └── assets/
```

The database stores references rather than binary files.

---

# 56. Tenant Domains

Domain model:

```text
TenantDomain
├── id
├── tenantId
├── domain
├── type
├── verified
└── isPrimary
```

Types:

```text
SUBDOMAIN
CUSTOM_DOMAIN
```

Example:

```text
goldsgym.platform.com
```

or:

```text
goldsgym.com
```

---

# 57. Tenant Configuration Hierarchy

Configuration should have predictable precedence.

```text
Platform Default
       ↓
Tenant Configuration
       ↓
User Preference
```

Example:

```text
Default theme = light
Tenant theme = dark
User preference = light
```

Final result:

```text
light
```

because user preference has the highest precedence.

---

# 58. Notifications

Notifications should be centralized.

Supported channels may include:

```text
Email
Push
SMS
In-app
```

Architecture:

```text
Domain Event
     ↓
Notification Service
     ↓
Queue
     ↓
Provider
```

Tenant-specific notification settings must be respected.

---

# 59. Events

The system should use domain events where useful.

Examples:

```text
MemberCreated
WorkoutCompleted
MembershipCreated
PaymentCompleted
TrainerAssigned
TenantCreated
TenantSuspended
```

Events should not replace normal transactional operations.

Use them for secondary processes such as:

```text
Notifications
Analytics
Audit
Background processing
```

---

# 60. AI Architecture

AI must remain isolated from core business authorization.

Recommended:

```text
User
 ↓
AI Request
 ↓
AI Service
 ↓
Context Builder
 ↓
AI Provider
 ↓
Suggestion
 ↓
User Approval
 ↓
Domain Service
 ↓
Database
```

AI should not directly write arbitrary database records.

Example:

```text
AI suggests workout change
        ↓
User reviews
        ↓
User approves
        ↓
Workout Service validates
        ↓
Change applied
```

---

# 61. Backup and Recovery

Production must support:

```text
Database backups
Object storage backups
Configuration backups
Point-in-time recovery where supported
Disaster recovery procedures
```

Tenant deletion and restoration procedures must be documented.

---

# 62. Security Boundaries

Security boundaries:

```text
Platform
   │
   ├── Platform Authorization
   │
   └── Tenant
          │
          ├── Tenant Authorization
          │
          └── User
                 │
                 ├── Role
                 ├── Permission
                 └── Resource Access
```

Never assume that authentication alone provides authorization.

---

# 63. Recommended Security Controls

Minimum production controls:

```text
HTTPS
Secure cookies/tokens
Passkeys/WebAuthn
Rate limiting
Input validation
Schema validation
CORS policy
Security headers
CSRF protection where applicable
SQL injection protection
Audit logging
Secret management
Dependency scanning
Container security
Tenant isolation tests
Authorization tests
```

---

# 64. Testing Strategy

Multi-tenancy requires dedicated security tests.

At minimum:

```text
Tenant A cannot access Tenant B
Tenant A cannot modify Tenant B
Trainer cannot access unauthorized member
Member cannot access trainer APIs
Tenant admin cannot access platform APIs
Tenant cannot modify global resources incorrectly
Suspended tenant cannot perform protected operations
```

Example test:

```text
Given:
  User belongs to Tenant A

When:
  User requests Member belonging to Tenant B

Then:
  Request must be rejected
```

This should be tested automatically.

---

# 65. Recommended Testing Layers

```text
Unit Tests
    ↓
Service Tests
    ↓
Repository Tests
    ↓
Authorization Tests
    ↓
Integration Tests
    ↓
API Tests
    ↓
End-to-End Tests
```

Critical tenant isolation tests should run in CI.

---

# 66. Migration From OpenGym

The existing OpenGym architecture should not be rewritten blindly.

Migration should occur in phases.

## Phase 1 — Architecture

Define:

```text
Tenant
User
TenantMembership
Role
Permission
TenantBranding
TenantFeature
```

---

## Phase 2 — Database

Move from:

```text
JSON storage
```

to:

```text
PostgreSQL
+
Prisma
```

---

## Phase 3 — Authentication

Centralize:

```text
Authentication
Sessions
Passkeys
OTP
Recovery
Logout
```

---

## Phase 4 — RBAC

Implement:

```text
Platform roles
Tenant roles
Permissions
Resource authorization
```

---

## Phase 5 — Tenant Context

Implement:

```text
Tenant resolution
Tenant membership
Tenant-scoped repositories
Tenant isolation
```

---

## Phase 6 — Tenant Branding

Implement:

```text
TenantBranding
TenantSettings
TenantFeatures
TenantDomain
```

---

## Phase 7 — Super Admin

Build:

```text
Super Admin Dashboard
Tenant management
Plans
Feature flags
Platform configuration
Audit logs
```

---

## Phase 8 — Tenant Application

Convert OpenGym UI into:

```text
Tenant App
```

with dynamic:

```text
tenantId
branding
features
permissions
```

---

## Phase 9 — Website

Create:

```text
Platform Website
Tenant Website
```

---

## Phase 10 — Member Mobile

Create:

```text
Member iOS
Member Android
```

using the centralized API.

---

## Phase 11 — Staff Mobile

Create:

```text
Staff iOS
Staff Android
```

with:

```text
OWNER
ADMIN
TRAINER
```

permissions.

---

# 67. Target Repository

The final repository should approximately look like:

```text
gym-platform/
│
├── apps/
│   ├── platform-api/
│   ├── super-admin/
│   ├── tenant-app/
│   ├── website/
│   ├── member-mobile/
│   └── staff-mobile/
│
├── packages/
│   ├── api-contracts/
│   ├── auth/
│   ├── rbac/
│   ├── tenant/
│   ├── database/
│   ├── ui/
│   ├── validation/
│   ├── types/
│   └── config/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── MULTI_TENANT_ARCHITECTURE.md
│   ├── AUTHENTICATION_IMPLEMENTATION.md
│   ├── RBAC.md
│   ├── RBAC_TENANT.md
│   ├── TENANT_BRANDING.md
│   ├── API.md
│   ├── MOBILE.md
│   ├── WEBSITE.md
│   ├── DATABASE.md
│   └── SECURITY.md
│
├── docker/
├── scripts/
├── .env.example
├── package.json
└── README.md
```

---

# 68. Architecture Decision Summary

| Decision           | Choice                          |
| ------------------ | ------------------------------- |
| Architecture       | Multi-tenant SaaS               |
| API                | Centralized                     |
| Backend            | Fastify                         |
| Database           | PostgreSQL                      |
| ORM                | Prisma                          |
| Cache              | Redis                           |
| Storage            | S3-compatible object storage    |
| Authentication     | Centralized                     |
| Passkeys           | WebAuthn                        |
| Authorization      | RBAC + permissions              |
| Tenant model       | Shared DB with tenant isolation |
| Tenant isolation   | `tenantId` + authorization      |
| Web                | Shared applications             |
| Mobile             | Member + Staff applications     |
| iOS                | Supported                       |
| Android            | Supported                       |
| Branding           | Runtime tenant configuration    |
| Websites           | Platform + tenant websites      |
| Background jobs    | Queue/workers                   |
| Observability      | Logs + metrics + traces         |
| Audit              | Centralized audit logs          |
| AI                 | Isolated service with approval  |
| White-label mobile | Future phase                    |

---

# 69. Non-Negotiable Rules

The following rules must not be violated during implementation.

### Rule 1

**Never trust the client-provided tenant ID.**

### Rule 2

**Never query tenant-owned data without tenant context.**

### Rule 3

**Authentication and authorization are separate concerns.**

### Rule 4

**Roles must map to permissions.**

### Rule 5

**Super Admin permissions must be explicitly defined.**

### Rule 6

**Tenant data must never be accessible across tenant boundaries.**

### Rule 7

**All clients consume the centralized API.**

### Rule 8

**Tenant branding must be configuration-driven.**

### Rule 9

**AI must not directly bypass domain services.**

### Rule 10

**Critical authorization and tenant-isolation behavior must have automated tests.**

### Rule 11

**Platform-owned and tenant-owned resources must be clearly distinguished.**

### Rule 12

**Mobile applications must not contain business authorization logic that can be bypassed.**

The backend is always the final authority.

---

# 70. Final Architecture

The final product is not simply:

```text
OpenGym
```

It becomes:

```text
                         GYM PLATFORM
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
        SUPER ADMIN       TENANT PLATFORM    WEBSITE
             │                │                │
             │                │                │
             └────────────────┼────────────────┘
                              │
                              ▼
                       CENTRAL FASTIFY API
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
     AUTH                    RBAC                  TENANT
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              │
                       DOMAIN SERVICES
                              │
       ┌──────────────┬───────┼────────┬──────────────┐
       │              │       │        │              │
       ▼              ▼       ▼        ▼              ▼
    Members        Trainers Workouts Memberships    Payments
       │              │       │        │              │
       └──────────────┴───────┼────────┴──────────────┘
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
               PostgreSQL              Redis
                    │
                    ▼
              Object Storage


              MOBILE APPLICATIONS
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
       MEMBER APP            STAFF APP
       iOS/Android           iOS/Android
             │                   │
             └─────────┬─────────┘
                       ▼
                  CENTRAL API
```

**This architecture should be treated as the baseline before implementing the multi-tenant conversion.**

Any future architectural change should either conform to this model or be recorded as an explicit Architecture Decision Record (ADR).
