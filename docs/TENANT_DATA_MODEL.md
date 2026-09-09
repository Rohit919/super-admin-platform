# Tenant Data Model

## 1. Purpose

This document defines the database architecture for the multi-tenant Gym SaaS platform.

The data model is designed to support:

- Multiple independent gym tenants
- Tenant-level user memberships
- Tenant-specific RBAC
- Super Admin platform management
- Member accounts
- Staff accounts
- Trainers
- Workout plans
- Exercises
- Workout sessions
- Attendance
- Memberships
- Payments
- Tenant branding
- White-label mobile applications
- Tenant-specific feature configuration
- Audit logging
- Strong tenant data isolation

The database uses **PostgreSQL** with **Prisma ORM**.

---

# 2. Core Architecture

The platform uses a **shared database / shared schema / tenant-isolation** model.

```text
                         PostgreSQL
                              │
             ┌────────────────┴────────────────┐
             │                                 │
      Platform Data                       Tenant Data
             │                                 │
      ┌──────┴──────┐              ┌───────────┴───────────┐
      │             │              │                       │
   Platform      Global        Tenant A                Tenant B
   Settings      Exercises        │                       │
                                  │                       │
                              Members                  Members
                              Staff                    Staff
                              Workouts                 Workouts
                              Payments                 Payments
                              Attendance               Attendance
```

Most business entities are associated with a `tenantId`.

Example:

```text
Tenant
  │
  ├── TenantMembership
  ├── Member
  ├── Workout
  ├── WorkoutPlan
  ├── Attendance
  ├── Membership
  ├── Payment
  ├── Branding
  └── Applications
```

---

# 3. Tenant Isolation Principle

The most important rule in the database is:

> A tenant must never be able to access another tenant's data.

Every tenant-owned entity should contain:

```prisma
tenantId String
```

Example:

```prisma
model Member {
  id       String @id @default(cuid())
  tenantId String

  firstName String
  lastName  String
  email     String?

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

The API must never rely solely on:

```http
GET /members/:id
```

It must verify:

```text
authenticatedUser
        │
        ▼
active tenant
        │
        ▼
member belongs to tenant
        │
        ▼
authorization
        │
        ▼
return member
```

---

# 4. Platform vs Tenant Ownership

Not every table requires `tenantId`.

## Platform-owned entities

These belong to the SaaS platform itself:

```text
User
Permission
Global Exercise
Platform Setting
Subscription Plan
Platform Audit Log
```

## Tenant-owned entities

These belong to a specific gym:

```text
TenantMembership
Member
Trainer
Workout
WorkoutPlan
WorkoutSession
Attendance
Membership
Payment
TenantBranding
TenantApplication
TenantFeatureFlag
TenantAuditLog
```

## Global resources

Some resources may be created by the platform and reused by tenants.

Example:

```text
Global Exercise
        │
        ├── Tenant A
        ├── Tenant B
        └── Tenant C
```

A tenant can reference a global exercise without owning the global record.

---

# 5. Entity Relationship Overview

```text
                         ┌─────────────┐
                         │    Tenant   │
                         └──────┬──────┘
                                │
       ┌────────────────────────┼────────────────────────┐
       │                        │                        │
       ▼                        ▼                        ▼
 TenantMembership          TenantBranding          TenantApplication
       │
       ▼
     User
       │
       ├───────────────┐
       │               │
       ▼               ▼
    Member           Staff
                       │
                       ▼
                    Trainer

Tenant
   │
   ├── WorkoutPlan
   │      │
   │      ▼
   │    Workout
   │      │
   │      ▼
   │  WorkoutSession
   │      │
   │      ▼
   │   WorkoutSet
   │
   ├── Attendance
   │
   ├── Membership
   │
   ├── Payment
   │
   └── TenantFeatureFlag
```

---

# 6. Tenant

The `Tenant` represents a gym/business using the platform.

```prisma
model Tenant {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  status    TenantStatus @default(ACTIVE)

  timezone  String   @default("UTC")
  currency  String   @default("USD")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships    TenantMembership[]
  branding       TenantBranding?
  applications   TenantApplication[]
  featureFlags   TenantFeatureFlag[]

  members        Member[]
  trainers       Trainer[]
  workoutPlans   WorkoutPlan[]
  workouts       Workout[]
  sessions       WorkoutSession[]
  attendance     Attendance[]
  memberships2   Membership[]
  payments       Payment[]
}
```

Recommended status:

```prisma
enum TenantStatus {
  ACTIVE
  SUSPENDED
  PENDING
  DEACTIVATED
}
```

The tenant slug must be stable.

Example:

```text
goldsgym
fitness-pro
powerfit
```

Do not use mutable names as tenant identifiers.

---

# 7. User

`User` represents a platform identity.

A user is not automatically a member of one tenant.

The same user may belong to multiple tenants.

```text
User
 │
 ├── Tenant A → MEMBER
 │
 ├── Tenant B → TRAINER
 │
 └── Tenant C → ADMIN
```

Recommended model:

```prisma
model User {
  id            String   @id @default(cuid())

  email         String?  @unique
  phone         String?

  firstName     String?
  lastName      String?

  passwordHash  String?

  emailVerified Boolean  @default(false)
  phoneVerified Boolean  @default(false)

  status        UserStatus @default(ACTIVE)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  memberships   TenantMembership[]
  authAccounts  AuthAccount[]
}
```

```prisma
enum UserStatus {
  ACTIVE
  INVITED
  SUSPENDED
  DEACTIVATED
}
```

---

# 8. TenantMembership

This is one of the most important tables.

A `TenantMembership` connects a `User` to a `Tenant`.

```prisma
model TenantMembership {
  id       String @id @default(cuid())

  tenantId String
  userId   String
  roleId   String

  status   MembershipStatus @default(ACTIVE)

  joinedAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  user   User   @relation(fields: [userId], references: [id])
  role   Role   @relation(fields: [roleId], references: [id])

  @@unique([tenantId, userId])
  @@index([userId])
  @@index([tenantId, roleId])
}
```

This prevents duplicate membership:

```text
Tenant A + User X
```

from appearing twice.

---

# 9. RBAC

RBAC should be permission-based.

Recommended structure:

```text
Role
 │
 └── RolePermission
          │
          ▼
      Permission
```

Example roles:

```text
OWNER
ADMIN
TRAINER
MEMBER
```

Example permissions:

```text
members.read
members.create
members.update
members.delete

workouts.read
workouts.create
workouts.update
workouts.delete

attendance.read
attendance.create

payments.read
payments.create
payments.refund
```

---

# 10. Role

```prisma
model Role {
  id        String @id @default(cuid())

  tenantId  String?
  name      String
  code      String

  isSystem  Boolean @default(false)

  tenant Tenant?

  memberships     TenantMembership[]
  rolePermissions RolePermission[]

  @@unique([tenantId, code])
  @@index([tenantId])
}
```

The `tenantId` can be nullable.

Why?

Because some roles may be platform/system roles while others are tenant-specific.

Example:

```text
Platform:
SUPER_ADMIN

Tenant:
OWNER
ADMIN
TRAINER
MEMBER
```

---

# 11. Permission

Permissions are platform-defined capabilities.

```prisma
model Permission {
  id          String @id @default(cuid())

  code        String @unique
  description String?

  rolePermissions RolePermission[]
}
```

Example:

```text
members.read
members.create
members.update
members.delete

trainers.read
trainers.create

workouts.read
workouts.create
workouts.update

attendance.read
attendance.create

payments.read
payments.create
payments.refund
```

---

# 12. RolePermission

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

# 13. Member

A member represents a gym customer.

```prisma
model Member {
  id       String @id @default(cuid())
  tenantId String
  userId   String @unique

  memberNumber String?

  dateOfBirth DateTime?
  gender      String?

  emergencyContactName  String?
  emergencyContactPhone String?

  status MemberStatus @default(ACTIVE)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  user   User   @relation(fields: [userId], references: [id])

  workouts       Workout[]
  workoutPlans   WorkoutPlan[]
  sessions       WorkoutSession[]
  attendance     Attendance[]
  memberships    Membership[]
  payments       Payment[]

  @@unique([tenantId, memberNumber])
  @@index([tenantId])
  @@index([tenantId, status])
}
```

Important:

`userId` identifies the global user.

`tenantId` identifies which gym owns the member relationship.

---

# 14. Trainer

A trainer is a staff user with trainer-specific capabilities.

```prisma
model Trainer {
  id       String @id @default(cuid())
  tenantId String
  userId   String

  bio       String?
  specialty String?

  status TrainerStatus @default(ACTIVE)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  user   User   @relation(fields: [userId], references: [id])

  assignedMembers MemberTrainer[]

  @@unique([tenantId, userId])
  @@index([tenantId])
}
```

---

# 15. MemberTrainer

A member may have multiple trainers.

A trainer may manage multiple members.

Therefore use a many-to-many relation.

```prisma
model MemberTrainer {
  memberId  String
  trainerId String

  assignedAt DateTime @default(now())

  member  Member  @relation(fields: [memberId], references: [id])
  trainer Trainer @relation(fields: [trainerId], references: [id])

  @@id([memberId, trainerId])
  @@index([trainerId])
}
```

The API must additionally ensure that:

```text
member.tenantId == trainer.tenantId
```

---

# 16. Exercise

Exercises can be platform-global or tenant-specific.

```prisma
model Exercise {
  id       String  @id @default(cuid())

  tenantId String?

  name        String
  description String?

  category String?
  muscleGroup String?

  equipment String?

  isGlobal Boolean @default(false)
  isActive Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant?

  workoutExercises WorkoutExercise[]

  @@index([tenantId])
  @@index([isGlobal])
  @@index([category])
}
```

Example:

```text
Global Exercise
Bench Press

Tenant-specific Exercise
Gold's Gym Special Bench Press
```

---

# 17. WorkoutPlan

A workout plan is a reusable training program.

```prisma
model WorkoutPlan {
  id       String @id @default(cuid())
  tenantId String

  memberId String?
  trainerId String?

  name        String
  description String?

  status WorkoutPlanStatus @default(DRAFT)

  startDate DateTime?
  endDate   DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  member  Member? @relation(fields: [memberId], references: [id])
  trainer Trainer? @relation(fields: [trainerId], references: [id])

  workouts Workout[]

  @@index([tenantId])
  @@index([tenantId, memberId])
  @@index([tenantId, trainerId])
}
```

---

# 18. Workout

A workout is an individual training session/program.

```prisma
model Workout {
  id       String @id @default(cuid())
  tenantId String

  planId   String?
  memberId String?

  name        String
  description String?

  scheduledAt DateTime?

  status WorkoutStatus @default(DRAFT)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  plan   WorkoutPlan? @relation(fields: [planId], references: [id])
  member Member? @relation(fields: [memberId], references: [id])

  exercises WorkoutExercise[]
  sessions  WorkoutSession[]

  @@index([tenantId])
  @@index([tenantId, memberId])
  @@index([tenantId, scheduledAt])
}
```

---

# 19. WorkoutExercise

This represents an exercise inside a workout.

```prisma
model WorkoutExercise {
  id         String @id @default(cuid())

  workoutId  String
  exerciseId String

  orderIndex Int

  sets       Int?
  reps       Int?
  weight     Decimal?
  duration   Int?

  restSeconds Int?

  notes String?

  workout  Workout  @relation(fields: [workoutId], references: [id])
  exercise Exercise @relation(fields: [exerciseId], references: [id])

  @@unique([workoutId, orderIndex])
  @@index([exerciseId])
}
```

---

# 20. WorkoutSession

A session represents an actual workout performed by a member.

```prisma
model WorkoutSession {
  id       String @id @default(cuid())
  tenantId String

  workoutId String?
  memberId  String

  startedAt  DateTime
  completedAt DateTime?

  status WorkoutSessionStatus @default(IN_PROGRESS)

  notes String?

  createdAt DateTime @default(now())

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  workout Workout? @relation(fields: [workoutId], references: [id])
  member  Member  @relation(fields: [memberId], references: [id])

  sets WorkoutSet[]

  @@index([tenantId])
  @@index([tenantId, memberId])
  @@index([tenantId, startedAt])
}
```

---

# 21. WorkoutSet

Stores actual performed set data.

```prisma
model WorkoutSet {
  id        String @id @default(cuid())
  sessionId String

  exerciseId String

  setNumber Int

  reps       Int?
  weight     Decimal?
  duration   Int?

  rpe Decimal?
  rir Int?

  completed Boolean @default(false)

  createdAt DateTime @default(now())

  session  WorkoutSession @relation(fields: [sessionId], references: [id])
  exercise Exercise       @relation(fields: [exerciseId], references: [id])

  @@unique([sessionId, exerciseId, setNumber])
  @@index([exerciseId])
}
```

---

# 22. Attendance

Attendance records gym visits.

```prisma
model Attendance {
  id       String @id @default(cuid())
  tenantId String
  memberId String

  checkedInAt  DateTime
  checkedOutAt DateTime?

  method AttendanceMethod @default(MANUAL)

  createdAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  member Member @relation(fields: [memberId], references: [id])

  @@index([tenantId, memberId])
  @@index([tenantId, checkedInAt])
}
```

Methods:

```prisma
enum AttendanceMethod {
  MANUAL
  QR_CODE
  RFID
  MOBILE
  KIOSK
}
```

---

# 23. Membership

This represents a customer's gym subscription/membership.

Do not confuse this with `TenantMembership`.

They are completely different concepts.

```text
TenantMembership
    =
User belongs to tenant

Membership
    =
Customer purchased gym membership
```

Model:

```prisma
model Membership {
  id       String @id @default(cuid())
  tenantId String
  memberId String

  planName String

  startDate DateTime
  endDate   DateTime

  price Decimal

  status MembershipStatus @default(ACTIVE)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  member Member @relation(fields: [memberId], references: [id])

  payments Payment[]

  @@index([tenantId, memberId])
  @@index([tenantId, status])
  @@index([tenantId, endDate])
}
```

---

# 24. Payment

Payment records belong to a tenant and member.

```prisma
model Payment {
  id       String @id @default(cuid())
  tenantId String
  memberId String

  membershipId String?

  amount   Decimal
  currency String

  status PaymentStatus @default(PENDING)

  provider       String?
  providerPaymentId String?

  paidAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant     Tenant      @relation(fields: [tenantId], references: [id])
  member     Member      @relation(fields: [memberId], references: [id])
  membership Membership? @relation(fields: [membershipId], references: [id])

  @@index([tenantId, memberId])
  @@index([tenantId, status])
  @@index([tenantId, createdAt])
}
```

Never store payment provider secrets in the database.

---

# 25. TenantBranding

Branding belongs to the tenant.

```prisma
model TenantBranding {
  id       String @id @default(cuid())
  tenantId String @unique

  logoUrl       String?
  faviconUrl    String?
  appIconUrl    String?
  splashScreenUrl String?

  primaryColor   String?
  secondaryColor String?
  accentColor    String?

  fontFamily String?

  appName String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

Assets should be stored in object storage.

Example:

```text
S3-compatible object storage
        │
        ├── tenants/
        │     └── goldsgym/
        │           ├── logo/
        │           ├── branding/
        │           └── mobile/
```

The database stores URLs or object identifiers.

---

# 26. TenantApplication

This table represents a white-label application.

```prisma
model TenantApplication {
  id       String @id @default(cuid())
  tenantId String

  type     ApplicationType
  platform ApplicationPlatform

  appName String

  bundleId    String?
  packageName String?

  storeAppId String?

  status ApplicationStatus @default(CONFIGURING)

  currentVersion String?
  currentBuild   Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])

  builds MobileBuild[]

  @@unique([tenantId, type, platform])
  @@index([tenantId])
}
```

Types:

```prisma
enum ApplicationType {
  MEMBER
  STAFF
}
```

Platforms:

```prisma
enum ApplicationPlatform {
  IOS
  ANDROID
}
```

---

# 27. MobileBuild

Every white-label build must be reproducible.

```prisma
model MobileBuild {
  id            String @id @default(cuid())

  applicationId String

  sourceCommit  String
  configVersion String
  brandingVersion String?

  version       String
  buildNumber   Int

  environment   BuildEnvironment

  status BuildStatus @default(QUEUED)

  artifactUrl String?

  errorMessage String?

  startedAt   DateTime?
  completedAt DateTime?

  createdAt DateTime @default(now())

  application TenantApplication @relation(
    fields: [applicationId],
    references: [id]
  )

  @@index([applicationId])
  @@index([applicationId, status])
}
```

Builds must capture enough information to answer:

```text
What code produced this app?
What branding configuration was used?
What tenant configuration was used?
What build number was released?
Which environment was used?
```

---

# 28. TenantFeatureFlag

Tenant-specific feature configuration.

```prisma
model TenantFeatureFlag {
  id       String @id @default(cuid())
  tenantId String

  key      String
  enabled  Boolean @default(false)

  value Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, key])
  @@index([tenantId])
}
```

Example:

```text
ai_coach = true
payments = true
attendance_qr = true
advanced_analytics = false
```

---

# 29. Authentication Data

Authentication should be centralized.

Recommended entities:

```text
User
 │
 ├── AuthAccount
 ├── RefreshSession
 ├── OTP
 ├── PasswordResetToken
 └── PasskeyCredential
```

---

# 30. AuthAccount

```prisma
model AuthAccount {
  id       String @id @default(cuid())
  userId   String

  provider ProviderType
  providerAccountId String?

  passwordHash String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

Potential providers:

```prisma
enum ProviderType {
  PASSWORD
  GOOGLE
  APPLE
  PASSKEY
}
```

---

# 31. RefreshSession

Refresh sessions should be independently revocable.

```prisma
model RefreshSession {
  id       String @id @default(cuid())
  userId   String

  tokenHash String

  deviceId String?
  userAgent String?
  ipAddress String?

  expiresAt DateTime
  revokedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([tokenHash])
  @@index([expiresAt])
}
```

Never store raw refresh tokens.

Store a secure hash.

---

# 32. OTP

For login, verification, password reset, or other authentication workflows:

```prisma
model OTPCode {
  id       String @id @default(cuid())

  userId   String?
  target   String

  purpose OTPPurpose

  codeHash String

  expiresAt DateTime
  consumedAt DateTime?

  attempts Int @default(0)

  createdAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id])

  @@index([target, purpose])
  @@index([expiresAt])
}
```

Never store OTP codes in plaintext.

---

# 33. Password Reset

```prisma
model PasswordResetToken {
  id       String @id @default(cuid())
  userId   String

  tokenHash String

  expiresAt DateTime
  usedAt    DateTime?

  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([tokenHash])
  @@index([expiresAt])
}
```

Password reset tokens must:

- Be cryptographically random
- Expire
- Be single-use
- Be hashed at rest
- Be invalidated after successful reset

---

# 34. Passkeys

Because the original OpenGym project already uses WebAuthn/passkeys, the platform should preserve this capability while making it tenant-aware.

```prisma
model PasskeyCredential {
  id       String @id @default(cuid())
  userId   String

  credentialId String @unique
  publicKey    String

  counter Int @default(0)

  deviceType String?
  backedUp   Boolean @default(false)

  createdAt DateTime @default(now())
  lastUsedAt DateTime?

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

---

# 35. Audit Logs

Audit logging is mandatory for sensitive administrative operations.

There should be platform-level and tenant-level audit events.

```prisma
model AuditLog {
  id String @id @default(cuid())

  tenantId String?
  actorUserId String?

  action String
  resourceType String
  resourceId String?

  metadata Json?

  ipAddress String?
  userAgent String?

  createdAt DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([actorUserId, createdAt])
  @@index([resourceType, resourceId])
}
```

Examples:

```text
tenant.created
tenant.suspended

member.created
member.updated
member.deleted

payment.created
payment.refunded

role.permission.updated

mobile.build.created
mobile.release.approved
```

---

# 36. Global Exercises

The platform should maintain a global exercise catalog.

```text
Platform
   │
   ▼
Global Exercise Catalog
   │
   ├── Bench Press
   ├── Squat
   ├── Deadlift
   ├── Pull Up
   └── ...
```

Tenants can use global exercises without duplicating them.

Tenant-specific exercises may be added separately.

---

# 37. Tenant-Specific Customization

Do not duplicate global data unnecessarily.

Bad:

```text
Tenant A → copy Bench Press
Tenant B → copy Bench Press
Tenant C → copy Bench Press
```

Better:

```text
Global Exercise
      │
      ├── Tenant A references it
      ├── Tenant B references it
      └── Tenant C references it
```

Tenant-specific configuration can be stored separately when needed.

Example:

```prisma
model TenantExercise {
  id         String @id @default(cuid())

  tenantId   String
  exerciseId String

  customName String?
  enabled    Boolean @default(true)

  createdAt DateTime @default(now())

  @@unique([tenantId, exerciseId])
}
```

---

# 38. Tenant ID Rules

The following entities require `tenantId`:

```text
Member
Trainer
TenantMembership
WorkoutPlan
Workout
WorkoutSession
Attendance
Membership
Payment
TenantBranding
TenantApplication
MobileBuild indirectly through application
TenantFeatureFlag
Tenant-specific exercises
```

Some entities derive tenant ownership through relationships.

However, for high-volume or security-sensitive entities, storing `tenantId` directly is preferred.

Example:

```text
WorkoutSession
    tenantId
    memberId
```

rather than deriving:

```text
WorkoutSession
    memberId
        ↓
Member
        ↓
Tenant
```

The direct tenant ID makes:

- authorization easier
- indexing faster
- queries safer
- reporting easier
- tenant filtering explicit

---

# 39. Compound Indexing

Tenant-aware queries should normally begin with `tenantId`.

Example:

```prisma
@@index([tenantId, status])
```

Instead of:

```prisma
@@index([status])
```

For common queries:

```prisma
@@index([tenantId, memberId])
@@index([tenantId, createdAt])
@@index([tenantId, status])
@@index([tenantId, scheduledAt])
```

This becomes increasingly important as the platform grows.

---

# 40. Unique Constraints

Tenant-specific unique values should generally use compound uniqueness.

Bad:

```prisma
email String @unique
```

when the same email may legitimately exist in multiple tenant contexts.

Better:

```prisma
@@unique([tenantId, memberNumber])
```

For tenant-scoped values:

```text
tenantId + memberNumber
tenantId + roleCode
tenantId + featureFlagKey
tenantId + applicationType + platform
```

Global values can remain globally unique:

```text
User.email
Permission.code
Tenant.slug
```

The exact uniqueness policy for email/phone must be decided at the authentication layer.

---

# 41. Tenant-Aware API Queries

Every tenant query should follow this pattern:

```typescript
const member = await prisma.member.findFirst({
  where: {
    id: memberId,
    tenantId: request.tenant.id,
  },
});
```

Never:

```typescript
const member = await prisma.member.findUnique({
  where: {
    id: memberId,
  },
});
```

for a tenant-owned resource unless tenant authorization has already been independently guaranteed.

---

# 42. Tenant Context

The request lifecycle should establish tenant context before business logic executes.

```text
HTTP Request
     │
     ▼
Authentication
     │
     ▼
Resolve Tenant
     │
     ▼
Validate Tenant Membership
     │
     ▼
Resolve Permissions
     │
     ▼
Controller
     │
     ▼
Service
     │
     ▼
Repository
     │
     ▼
Prisma
```

The request context should contain something conceptually similar to:

```typescript
type TenantContext = {
  userId: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  permissions: string[];
};
```

---

# 43. Never Trust Client Tenant IDs

A mobile or web client may send:

```http
X-Tenant-ID: tenant_b
```

This value must not automatically grant access to Tenant B.

The server must verify:

```text
Authenticated User
        │
        ▼
Has membership in Tenant B?
        │
   ┌────┴────┐
   │         │
  YES        NO
   │         │
 allow      403
```

The tenant context should be derived from authenticated identity and validated membership.

---

# 44. Cross-Tenant Protection

The following must be tested:

```text
Tenant A user
    ↓
Tenant A member → allowed

Tenant A user
    ↓
Tenant B member → denied
```

This should be an automated integration test.

Example:

```text
Given:
  User belongs to Tenant A

When:
  User requests Member belonging to Tenant B

Then:
  API returns 403 or 404 according to security policy
```

The application must never leak whether a protected resource exists in another tenant.

---

# 45. Resource-Level Authorization

Tenant membership alone is not enough.

Example:

```text
TRAINER
```

may have permission:

```text
members.read
```

but should not necessarily access every member.

The authorization chain can therefore be:

```text
Platform authorization
        ↓
Tenant authorization
        ↓
Permission authorization
        ↓
Resource authorization
```

Example:

```text
Trainer
   │
   ├── Has tenant membership
   ├── Has members.read
   └── Member assigned to trainer
              │
              ▼
            ALLOW
```

---

# 46. Soft Deletion

For important business entities, prefer soft deletion when historical data must remain available.

Example:

```prisma
deletedAt DateTime?
```

Potential entities:

```text
Member
Trainer
WorkoutPlan
Workout
Membership
```

Do not automatically physically delete financial or audit records.

---

# 47. Timestamps

All server-side timestamps should be stored in UTC.

```text
Database
    ↓
UTC

API
    ↓
UTC ISO-8601

Client
    ↓
Tenant/user timezone
```

Tenant timezone belongs to:

```text
Tenant.timezone
```

Example:

```text
Asia/Kolkata
America/New_York
Europe/London
```

---

# 48. Currency

Tenant currency should be explicit.

```prisma
currency String
```

Example:

```text
INR
USD
GBP
EUR
AED
```

Payments should store the currency used at transaction time rather than relying only on the current tenant setting.

---

# 49. Database Transaction Rules

Operations that modify multiple related records should use database transactions.

Example:

```text
Create Membership
      +
Create Payment
      +
Update Member status
```

These should be atomic where business rules require it.

Conceptually:

```typescript
await prisma.$transaction(async (tx) => {
  // create membership
  // create payment
  // update member
});
```

---

# 50. Payment Idempotency

Payment creation endpoints must support idempotency.

Example:

```text
POST /payments
Idempotency-Key: abc123
```

Store the idempotency key with tenant scope.

Conceptually:

```prisma
model PaymentIdempotency {
  id String @id @default(cuid())

  tenantId String
  key      String

  paymentId String

  createdAt DateTime @default(now())

  @@unique([tenantId, key])
}
```

This prevents duplicate payments caused by retries.

---

# 51. Mobile Device Registration

Push notification devices should be tenant/application aware.

```prisma
model Device {
  id String @id @default(cuid())

  userId String
  tenantId String

  applicationId String?

  platform DevicePlatform

  pushToken String

  appVersion String?
  buildNumber Int?

  lastSeenAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([tenantId, userId])
  @@index([pushToken])
}
```

A push notification must never accidentally cross tenants.

---

# 52. Recommended Prisma Relation Strategy

Use explicit relations instead of relying heavily on implicit many-to-many relationships.

This provides better control over:

- tenant validation
- metadata
- timestamps
- auditing
- indexes
- future business rules

Example:

```text
MemberTrainer
```

is preferable to an opaque implicit relationship.

---

# 53. Referential Integrity

Use foreign keys wherever practical.

Examples:

```text
Member → Tenant
Member → User

Trainer → Tenant
Trainer → User

Workout → Tenant
Workout → Member

Payment → Tenant
Payment → Member
```

The database should help prevent orphaned records.

---

# 54. Cascading Deletes

Do not blindly use:

```prisma
onDelete: Cascade
```

for important business entities.

For example, deleting a tenant should not casually destroy:

```text
Payments
Audit logs
Financial records
Historical attendance
```

Tenant deactivation should normally be handled through lifecycle/status management.

---

# 55. Tenant Lifecycle

Recommended lifecycle:

```text
PENDING
   │
   ▼
ACTIVE
   │
   ├──────────────┐
   ▼              ▼
SUSPENDED     DEACTIVATED
   │
   ▼
ACTIVE
```

Suspension may disable:

- Login
- Mobile access
- Tenant API operations
- New payments
- New member creation

according to platform policy.

---

# 56. Tenant Creation

Tenant creation should be handled by a platform service.

```text
Super Admin
     │
     ▼
Create Tenant
     │
     ├── Tenant
     ├── Branding
     ├── Default Roles
     ├── Default Feature Flags
     ├── Default Applications
     └── Owner Membership
```

This should execute inside a transaction where appropriate.

---

# 57. Default Tenant Provisioning

When a tenant is created:

```text
Tenant
 │
 ├── Branding configuration
 │
 ├── OWNER role
 ├── ADMIN role
 ├── TRAINER role
 ├── MEMBER role
 │
 ├── Default feature flags
 │
 ├── Member iOS application
 ├── Member Android application
 ├── Staff iOS application
 └── Staff Android application
```

Application records can initially be:

```text
CONFIGURING
```

until branding and app metadata are complete.

---

# 58. Super Admin Data Access

Super Admin is not simply another tenant user.

Platform administration should operate through platform authorization.

Example:

```text
SUPER_ADMIN
     │
     ▼
Platform API
     │
     ├── Tenant management
     ├── Subscription management
     ├── Feature flags
     ├── Branding
     ├── Mobile builds
     ├── Releases
     └── Platform audit
```

When Super Admin accesses tenant data, the operation should still establish an explicit tenant context.

---

# 59. Tenant Context for Super Admin

Example:

```text
Super Admin
    │
    ▼
Select Tenant A
    │
    ▼
Platform API
    │
    ▼
Tenant Context = Tenant A
```

The system should record:

```text
actor = Super Admin
tenant = Tenant A
action = member.updated
```

This makes administrative access auditable.

---

# 60. Data Classification

Recommended classification:

### Platform data

```text
Tenant
User
Permission
Platform settings
Subscription plans
Global exercises
Platform audit
```

### Tenant operational data

```text
Members
Trainers
Workouts
Attendance
Memberships
Payments
Tenant configuration
```

### Sensitive data

```text
Password hashes
Refresh token hashes
OTP hashes
Password reset hashes
Passkey credentials
Payment provider identifiers
Device tokens
IP addresses
```

Sensitive data requires additional access controls and retention policies.

---

# 61. Recommended Naming Rules

Use:

```text
tenantId
userId
memberId
trainerId
workoutId
sessionId
```

Avoid inconsistent names such as:

```text
tenant_id
tenantID
TenantId
gymId
organizationId
```

Use one convention throughout the Prisma schema and TypeScript codebase.

Recommended:

```text
camelCase
```

---

# 62. Recommended Primary Keys

Use application-generated opaque IDs.

For example:

```prisma
id String @id @default(cuid())
```

Avoid exposing sequential database IDs where unnecessary.

IDs should not reveal:

```text
record count
tenant size
creation sequence
```

---

# 63. Tenant Slug

Tenant slugs should be globally unique.

```prisma
slug String @unique
```

Examples:

```text
goldsgym
fitnesspro
powerfit
```

Potential usage:

```text
goldsgym.platform.com
fitnesspro.platform.com
powerfit.platform.com
```

Custom domains can later point to the same tenant.

---

# 64. Custom Domains

A separate table is recommended.

```prisma
model TenantDomain {
  id       String @id @default(cuid())
  tenantId String

  domain String @unique

  type DomainType
  verified Boolean @default(false)

  createdAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
}
```

Types:

```prisma
enum DomainType {
  SUBDOMAIN
  CUSTOM
}
```

---

# 65. Complete High-Level Schema

The final conceptual schema is:

```text
PLATFORM
│
├── Tenant
│   ├── TenantBranding
│   ├── TenantDomain
│   ├── TenantFeatureFlag
│   ├── TenantApplication
│   │   └── MobileBuild
│   │
│   ├── TenantMembership
│   │      └── User
│   │
│   ├── Member
│   │   ├── Membership
│   │   ├── Payment
│   │   ├── Attendance
│   │   ├── WorkoutPlan
│   │   ├── Workout
│   │   └── WorkoutSession
│   │          └── WorkoutSet
│   │
│   └── Trainer
│        └── MemberTrainer
│
├── Role
│   └── RolePermission
│        └── Permission
│
├── Global Exercise
│
└── Authentication
    ├── AuthAccount
    ├── RefreshSession
    ├── OTPCode
    ├── PasswordResetToken
    └── PasskeyCredential
```

---

# 66. Required Tenant Isolation Rules

The following rules are mandatory.

### Rule 1

Every tenant-owned table must have `tenantId` directly or through an explicitly validated ownership relation.

### Rule 2

Every tenant query must be tenant-scoped.

### Rule 3

Client-provided tenant IDs are never trusted without membership validation.

### Rule 4

RBAC must be evaluated within tenant context.

### Rule 5

Resource-level authorization must be enforced where required.

### Rule 6

Super Admin access must be separately authorized and audited.

### Rule 7

Cross-tenant access must have automated tests.

### Rule 8

Tenant-specific unique constraints should use compound keys.

### Rule 9

Financial and audit records should not be casually deleted.

### Rule 10

Mobile applications must never be trusted to enforce tenant isolation.

The backend remains the final authority.

---

# 67. Database Architecture Decision

The recommended architecture is:

```text
                    PostgreSQL
                        │
            Shared Database
                        │
             Shared Prisma Schema
                        │
             ┌──────────┴──────────┐
             │                     │
         Platform              Tenant Data
             │                     │
             │            tenantId-based isolation
             │                     │
             └──────────┬──────────┘
                        │
                  Central API
                        │
          ┌─────────────┼──────────────┐
          │             │              │
      Super Admin    Tenant Web      Mobile
```

This approach provides:

- Lower infrastructure complexity
- Easier migrations
- Centralized reporting
- Shared global exercise catalog
- Shared authentication
- Strong tenant-aware authorization
- Efficient scaling
- Centralized backups
- Easier white-label application management

---

# 68. What Must Not Be Done

Do not create:

```text
database_goldsgym
database_fitnesspro
database_powerfit
```

unless a future enterprise requirement explicitly demands database-per-tenant isolation.

Do not create:

```text
goldsgym-api
fitnesspro-api
powerfit-api
```

Do not create:

```text
goldsgym-source-code
fitnesspro-source-code
powerfit-source-code
```

Do not implement:

```typescript
if (tenant === "goldsgym") {
  ...
}
```

Use configuration and feature flags instead.

---

# 69. Migration From OpenGym JSON Storage

The original OpenGym architecture uses JSON-based persistence.

The SaaS platform must not carry this model forward.

Migration target:

```text
OpenGym JSON
     │
     ▼
Import / migration script
     │
     ▼
PostgreSQL
     │
     ▼
Prisma
     │
     ▼
Central Platform API
```

Existing concepts such as:

```text
Exercises
Workout Plans
Workouts
Workout Sessions
Progress
User settings
```

should be mapped into normalized relational entities.

---

# 70. Recommended Implementation Order

Implement the database in this order:

```text
Phase 1
├── Tenant
├── User
├── TenantMembership
└── Authentication

Phase 2
├── Role
├── Permission
└── RolePermission

Phase 3
├── Member
├── Trainer
└── MemberTrainer

Phase 4
├── Exercise
├── WorkoutPlan
├── Workout
├── WorkoutExercise
├── WorkoutSession
└── WorkoutSet

Phase 5
├── Attendance
├── Membership
└── Payment

Phase 6
├── TenantBranding
├── TenantDomain
├── TenantFeatureFlag
└── TenantApplication

Phase 7
├── MobileBuild
├── Device
└── Release management

Phase 8
├── AuditLog
└── Security hardening
```

---

# 71. Final Architecture Principle

The database should always answer these questions clearly:

```text
Who is the user?
        ↓
Which tenant are they operating in?
        ↓
What role do they have?
        ↓
What permissions does that role have?
        ↓
What resource are they accessing?
        ↓
Does that resource belong to the active tenant?
        ↓
Does the user have permission for that resource?
        ↓
ALLOW / DENY
```

The most important invariant is:

```text
AUTHENTICATED USER
       +
VALID TENANT MEMBERSHIP
       +
VALID PERMISSION
       +
VALID RESOURCE OWNERSHIP
       =
AUTHORIZED REQUEST
```

This invariant must be enforced by the **central Platform API**, not by the web frontend or native mobile applications.

The database, Prisma layer, API authorization layer, and automated tests should all reinforce the same tenant-isolation model.
