# Database Guide

This document defines the database architecture, development workflow, Prisma conventions, migration strategy, transaction rules, indexing approach, testing strategy, and production considerations for **Fastify-MasterApp**.

Fastify-MasterApp uses **PostgreSQL** as its relational database and **Prisma** as the primary ORM/database access layer.

The database is a core architectural boundary:

```text
HTTP Request
     ↓
Fastify Route
     ↓
Service / Orchestrator
     ↓
Repository
     ↓
Prisma
     ↓
PostgreSQL
```

The application should keep database-specific concerns isolated from HTTP and UI concerns.

---

## Table of Contents

1. [Database Principles](#1-database-principles)
2. [Database Architecture](#2-database-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure](#4-repository-structure)
5. [Local Database Setup](#5-local-database-setup)
6. [Database Configuration](#6-database-configuration)
7. [Prisma Workflow](#7-prisma-workflow)
8. [Schema Design](#8-schema-design)
9. [Models](#9-models)
10. [Primary Keys and IDs](#10-primary-keys-and-ids)
11. [Relationships](#11-relationships)
12. [Foreign Keys](#12-foreign-keys)
13. [Nullability and Defaults](#13-nullability-and-defaults)
14. [Enums](#14-enums)
15. [Timestamps](#15-timestamps)
16. [Soft Deletes](#16-soft-deletes)
17. [Unique Constraints](#17-unique-constraints)
18. [Indexes](#18-indexes)
19. [Query Design](#19-query-design)
20. [Pagination](#20-pagination)
21. [Filtering and Searching](#21-filtering-and-searching)
22. [Relations and N+1 Queries](#22-relations-and-n1-queries)
23. [Repository Pattern](#23-repository-pattern)
24. [Service and Database Boundaries](#24-service-and-database-boundaries)
25. [Transactions](#25-transactions)
26. [Concurrency](#26-concurrency)
27. [Idempotency](#27-idempotency)
28. [Migrations](#28-migrations)
29. [Migration Safety](#29-migration-safety)
30. [Data Migrations](#30-data-migrations)
31. [Seed Data](#31-seed-data)
32. [Development Database Reset](#32-development-database-reset)
33. [Prisma Client](#33-prisma-client)
34. [Connection Management](#34-connection-management)
35. [Database Errors](#35-database-errors)
36. [API Error Mapping](#36-api-error-mapping)
37. [Security](#37-security)
38. [Sensitive Data](#38-sensitive-data)
39. [Passwords and Credentials](#39-passwords-and-credentials)
40. [Audit Data](#40-audit-data)
41. [RBAC Data](#41-rbac-data)
42. [Authentication Session Data](#42-authentication-session-data)
43. [Multi-Tenancy Considerations](#43-multi-tenancy-considerations)
44. [Caching and Database Consistency](#44-caching-and-database-consistency)
45. [Background Jobs and Database State](#45-background-jobs-and-database-state)
46. [Testing](#46-testing)
47. [Integration Testing](#47-integration-testing)
48. [Migration Testing](#48-migration-testing)
49. [Performance](#49-performance)
50. [Observability](#50-observability)
51. [Backups](#51-backups)
52. [Recovery](#52-recovery)
53. [Production Deployment](#53-production-deployment)
54. [Database Changes Workflow](#54-database-changes-workflow)
55. [Adding a New Model](#55-adding-a-new-model)
56. [Changing an Existing Model](#56-changing-an-existing-model)
57. [Removing a Field](#57-removing-a-field)
58. [Renaming a Field](#58-renaming-a-field)
59. [Large Tables](#59-large-tables)
60. [Data Retention](#60-data-retention)
61. [Database Review Checklist](#61-database-review-checklist)
62. [Common Anti-Patterns](#62-common-anti-patterns)
63. [Troubleshooting](#63-troubleshooting)
64. [Definition of Done](#64-definition-of-done)
65. [Database Golden Rules](#65-database-golden-rules)

---

# 1. Database Principles

The database should be:

```text
Consistent
Predictable
Secure
Validated
Observable
Recoverable
Performant
```

The application should not treat PostgreSQL as an unstructured storage bucket.

---

## 1.1 Database as a Boundary

The database is responsible for enforcing important invariants.

For example:

```text
Application validation
        +
Database constraints
```

Both should be used.

Application validation improves user experience and error handling.

Database constraints provide the final consistency boundary.

---

## 1.2 Do Not Trust Application Logic Alone

If a value must be unique, enforce uniqueness in PostgreSQL.

Do not rely only on:

```ts
const existing = await findUser(email);

if (!existing) {
  await createUser(email);
}
```

Two concurrent requests can both pass the check.

Prefer:

```text
Application check
        +
Database UNIQUE constraint
        +
Conflict handling
```

---

# 2. Database Architecture

The recommended architecture is:

```text
┌─────────────────────────┐
│ Fastify HTTP Layer      │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Service / Orchestrator  │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Repository              │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Prisma Client           │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ PostgreSQL              │
└─────────────────────────┘
```

---

## 2.1 Why the Repository Boundary Exists

The repository layer provides:

- Persistence isolation
- Testability
- Consistent queries
- Centralized database access
- Easier future database optimization
- Protection from leaking ORM details into business logic

The goal is not to create unnecessary abstraction.

The goal is to keep application behavior independent from raw database implementation details.

---

# 3. Technology Stack

Current database technologies include:

| Technology | Purpose                            |
| ---------- | ---------------------------------- |
| PostgreSQL | Relational database                |
| Prisma     | ORM/database client                |
| TypeScript | Application language               |
| Docker     | Local infrastructure               |
| SQL        | Database-level behavior/migrations |

Optional future infrastructure may include:

| Technology | Purpose                               |
| ---------- | ------------------------------------- |
| Redis      | Cache/distributed state/rate limiting |
| BullMQ     | Background jobs                       |

Redis should not be treated as a replacement for PostgreSQL.

---

# 4. Repository Structure

Database-related files typically live under:

```text
prisma/
├── schema.prisma
└── migrations/
```

Application persistence code lives under:

```text
apps/api/
```

with repository/service/module structure determined by the API architecture.

---

# 5. Local Database Setup

A local PostgreSQL instance can be run through Docker or a native PostgreSQL installation.

Recommended development architecture:

```text
Local API
    ↓
Local PostgreSQL
```

Never use a production database for ordinary development.

---

## 5.1 Docker PostgreSQL

If the repository's Docker configuration provides PostgreSQL:

```bash
docker compose up -d
```

Check:

```bash
docker compose ps
```

Inspect database logs:

```bash
docker compose logs -f postgres
```

The service name may differ depending on the Compose configuration.

---

## 5.2 Native PostgreSQL

If PostgreSQL is installed locally:

```bash
psql --version
```

Create a dedicated development database.

Example:

```text
fastify_masterapp_dev
```

The actual connection string belongs in local environment configuration.

---

# 6. Database Configuration

The primary connection is normally provided through:

```env
DATABASE_URL=postgresql://...
```

The exact URL should match the repository's configuration requirements.

Example structure:

```text
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

Do not commit real credentials.

---

## 6.1 Connection URL Components

Conceptually:

```text
postgresql://
    username
    :
    password
    @
    host
    :
    port
    /
    database
```

Some deployments may include connection parameters for:

- SSL
- Connection pooling
- Timeouts
- Application names

Follow the target deployment's database provider requirements.

---

# 7. Prisma Workflow

Prisma is the application's primary database access layer.

Typical workflow:

```text
schema.prisma
      ↓
Prisma migration
      ↓
PostgreSQL
      ↓
Prisma Client
      ↓
Repository
```

---

## 7.1 Generate Client

Run:

```bash
npx prisma generate
```

This generates the Prisma Client based on the schema.

---

## 7.2 Development Migration

For local schema development:

```bash
npx prisma migrate dev
```

This is intended for development.

It can:

- Detect schema changes
- Create migrations
- Apply migrations
- Regenerate Prisma Client

Review generated migrations rather than blindly accepting them.

---

## 7.3 Production Migration

Production deployments should use the migration workflow intended for deployment environments, typically:

```bash
npx prisma migrate deploy
```

Do not use an interactive development migration workflow against production.

---

## 7.4 Prisma Studio

Useful for local inspection:

```bash
npx prisma studio
```

Prisma Studio is a development tool.

Treat production database access as a controlled operational activity.

---

# 8. Schema Design

The Prisma schema should express the application's domain model clearly.

A good schema should make important invariants obvious.

Consider:

```text
Entity
 ├── Identity
 ├── Relationships
 ├── Required fields
 ├── Optional fields
 ├── Constraints
 ├── Indexes
 └── Lifecycle fields
```

---

## 8.1 Avoid Database-Only Thinking

A database model should correspond to a meaningful domain concept.

Do not create tables merely because they are convenient for one implementation detail.

Before creating a model ask:

```text
What domain concept does this represent?
Who owns it?
Who can modify it?
How long does it live?
What relationships does it have?
What invariants must always hold?
```

---

# 9. Models

Prisma models should use clear names.

Example:

```prisma
model User {
  id        String   @id
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

The actual project schema is authoritative; this example is illustrative.

---

## 9.1 Model Naming

Prefer singular PascalCase:

```text
User
Role
Permission
Todo
AuditLog
RefreshToken
```

Avoid inconsistent naming:

```text
users
user_table
tbl_user
USER
```

---

## 9.2 Field Naming

Prefer camelCase in Prisma/application code:

```text
createdAt
updatedAt
displayName
lastLoginAt
```

Database naming can be mapped with Prisma where required.

---

# 10. Primary Keys and IDs

Every persistent entity should have a stable primary key.

The project should use its established ID strategy consistently.

Possible strategies include:

```text
UUID
CUID
Numeric ID
```

Do not introduce a second ID strategy for one new module without a strong reason.

---

## 10.1 IDs at API Boundaries

Database IDs should be treated as opaque identifiers.

Do not make clients depend on database implementation details.

For example:

```text
"123"
```

should be treated as an identifier, not necessarily as a numeric sequence with business meaning.

---

# 11. Relationships

Relationships should reflect domain ownership.

Common patterns:

```text
User
 └── Todos

User
 └── Roles

Role
 └── Permissions
```

Many-to-many relationships often require a join model.

Example:

```text
User
  ↕
UserRole
  ↕
Role
```

---

## 11.1 Relationship Questions

Before adding a relation:

```text
Is it one-to-one?
One-to-many?
Many-to-many?

Who owns the relation?
Can either side exist independently?
What happens when the parent is deleted?
Should deletion cascade?
Should the relation be preserved?
```

---

# 12. Foreign Keys

Use foreign keys for relationships that must remain consistent.

For example:

```text
Todo.userId → User.id
```

The database should prevent references to nonexistent users unless there is a deliberate alternative design.

---

## 12.1 Cascade Behavior

Be careful with:

```text
ON DELETE CASCADE
```

It can be useful, but dangerous.

Before using cascading deletion ask:

```text
Could this delete valuable data?
Should historical records remain?
Should the child become detached instead?
Is the parent deletion itself allowed?
```

For audit and compliance data, permanent deletion may be inappropriate.

---

# 13. Nullability and Defaults

Nullability is a domain decision.

Do not make everything optional merely to simplify migrations.

Consider:

```text
Required:
email

Optional:
phoneNumber
```

A nullable field means:

```text
There is a meaningful "unknown/not provided" state.
```

It should not simply mean:

```text
We were unsure what to do.
```

---

## 13.1 Defaults

Use database defaults for values that should reliably exist regardless of which application process creates the row.

Examples:

```text
createdAt = now()
```

Application-level defaults may still be useful for business behavior.

---

# 14. Enums

Use enums for values with a controlled finite set.

Examples:

```text
UserStatus
OrderStatus
JobStatus
```

Avoid enums for values that change frequently or are essentially configuration data.

---

## 14.1 Enum Evolution

Adding an enum value is usually easier than removing or renaming one.

Before removing a value:

```text
Search application usage
 ↓
Migrate existing rows
 ↓
Update clients
 ↓
Deploy compatible code
 ↓
Remove old value
```

---

# 15. Timestamps

Important entities should generally track lifecycle timestamps where useful.

Common fields:

```text
createdAt
updatedAt
deletedAt
```

Use UTC/timezone-aware database timestamps according to the application's established convention.

---

## 15.1 Never Store Local Business Time Without Context

If an event represents an instant in time, store it in a consistent timezone representation.

If a business event represents a local calendar time, such as:

```text
Store opens at 09:00 in Delhi
```

the timezone context is part of the domain model.

Do not silently treat local wall-clock time as a universal instant.

---

# 16. Soft Deletes

Soft deletion may be appropriate for entities that must remain recoverable or auditable.

Typical pattern:

```text
deletedAt DateTime?
```

Active:

```text
deletedAt IS NULL
```

Deleted:

```text
deletedAt IS NOT NULL
```

---

## 16.1 Soft Delete Tradeoffs

Soft deletion increases query complexity.

Every query must correctly decide whether deleted records should appear.

Potential problems:

```text
Forgotten deletedAt filter
Unique constraint conflicts
Growing table size
Unexpected relations
Reporting complexity
```

Use soft deletion intentionally.

---

# 17. Unique Constraints

Use database uniqueness for actual domain uniqueness.

Examples:

```text
User.email
Role.name
Permission.key
```

Depending on business requirements, uniqueness may be:

```text
Global
Per tenant
Per parent
```

Do not assume all uniqueness is global.

---

## 17.1 Case Sensitivity

Email and username uniqueness require explicit consideration of case behavior.

For example:

```text
User@example.com
user@example.com
```

may or may not be considered the same identity.

The database strategy and application normalization should agree.

---

# 18. Indexes

Indexes should follow real query patterns.

Common candidates:

```text
Primary keys
Unique fields
Foreign keys
Frequent filters
Frequent sorting fields
Composite access patterns
```

---

## 18.1 Index Cost

Indexes improve reads but add:

- Storage
- Write overhead
- Maintenance
- Migration cost

Do not create indexes for every column.

---

## 18.2 Composite Indexes

If a query commonly behaves like:

```text
WHERE organizationId = ?
ORDER BY createdAt DESC
```

a composite index may be more useful than separate indexes.

The exact index should be validated against actual query patterns.

---

## 18.3 Index Review

Before adding an index:

```text
What query needs it?
How frequently is that query executed?
How large will the table become?
Does an existing index already help?
What is the write cost?
```

---

# 19. Query Design

Repositories should request only the data needed by the use case.

Avoid unnecessarily loading entire records and large relation graphs.

Prefer:

```text
SELECT required fields
```

over:

```text
SELECT everything + every relation
```

when the endpoint only needs a small subset.

---

## 19.1 Projection

Use explicit selection when appropriate.

Conceptually:

```text
User
 ├── id
 ├── email
 └── displayName
```

instead of retrieving:

```text
User
 ├── id
 ├── email
 ├── passwordHash
 ├── refreshTokenHash
 ├── internal fields
 └── ...
```

This also reduces accidental sensitive-data exposure.

---

# 20. Pagination

Never assume an Admin table can safely retrieve every database row.

Use server-side pagination.

Example:

```text
GET /users?page=2&pageSize=25
```

or cursor pagination:

```text
GET /users?cursor=...
```

The API conventions document defines the preferred API semantics.

---

## 20.1 Offset Pagination

Conceptually:

```text
OFFSET
LIMIT
```

Easy to understand but can become less efficient for deep pages on large datasets.

---

## 20.2 Cursor Pagination

Cursor pagination is often better for large or frequently changing datasets.

Typical pattern:

```text
ORDER BY createdAt DESC, id DESC
```

with a stable cursor.

Cursor values should be opaque to API consumers.

---

# 21. Filtering and Searching

Filtering belongs at the database/query layer for scalable lists.

Bad:

```text
Fetch all users
 ↓
Filter in JavaScript
```

Prefer:

```text
Request filters
 ↓
Repository query
 ↓
PostgreSQL
 ↓
Required rows
```

---

## 21.1 Search

Search behavior should define:

- Case sensitivity
- Partial vs exact matching
- Allowed fields
- Maximum query length
- Pagination
- Index requirements

Do not construct raw SQL using untrusted strings.

Use Prisma's parameterized query mechanisms or carefully reviewed SQL where required.

---

# 22. Relations and N+1 Queries

Be alert for N+1 behavior.

Bad pattern:

```text
Fetch 100 users
 ↓
For each user:
    Fetch roles
```

This can produce:

```text
1 + 100 queries
```

Prefer an appropriately composed query when possible.

---

## 22.1 N+1 Review

When implementing list endpoints ask:

```text
How many queries happen for 1 row?
How many for 100 rows?
How many for 10,000 rows?
```

The query count should not grow unexpectedly with result count.

---

# 23. Repository Pattern

Repositories provide persistence operations.

Example conceptual interface:

```ts
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, input: UpdateUserInput): Promise<User>;
}
```

The actual implementation may use Prisma.

---

## 23.1 Repository Rules

Repositories should:

- Perform database operations
- Return appropriate domain/persistence data
- Handle database-specific query composition
- Support transactions when explicitly provided

Repositories should generally not:

- Parse HTTP requests
- Read cookies
- Decide UI behavior
- Return HTTP responses
- Implement route authorization
- Send browser notifications

---

# 24. Service and Database Boundaries

Services decide **what the application should do**.

Repositories decide **how persistence happens**.

Example:

```text
UserService
    ↓
"Create user"
    ↓
UserRepository
    ↓
INSERT user
```

A service may also coordinate:

```text
Create user
+
Assign default role
+
Create audit event
```

The database remains responsible for atomic persistence guarantees.

---

# 25. Transactions

Use transactions when multiple database operations must behave atomically.

Example:

```text
BEGIN
  Create User
  Assign Role
  Create Audit Event
COMMIT
```

If a required operation fails:

```text
ROLLBACK
```

---

## 25.1 Transaction Boundaries

Transactions should generally correspond to a meaningful business operation.

Do not wrap unrelated operations in one giant transaction.

Bad:

```text
Transaction
 ├── Create user
 ├── Send email
 ├── Generate report
 ├── Update settings
 └── Cleanup logs
```

External operations such as email cannot normally be rolled back by a PostgreSQL transaction.

---

## 25.2 Keep Transactions Short

Long transactions can:

- Hold locks
- Increase contention
- Increase latency
- Increase deadlock risk
- Reduce throughput

Prefer:

```text
Validate
 ↓
Start transaction
 ↓
Required DB work
 ↓
Commit
 ↓
External work
```

when the external operation does not need to be part of the transaction.

---

# 26. Concurrency

Concurrent requests are normal.

Design database operations assuming two or more requests can execute simultaneously.

Examples:

```text
Two requests update same record
Two users claim same resource
Two requests create same email
Two workers process same job
```

Use:

- Unique constraints
- Transactions
- Row-level/database locking where appropriate
- Optimistic concurrency
- Atomic updates
- Idempotency

depending on the use case.

---

## 26.1 Lost Updates

Do not assume:

```text
Read
 ↓
Modify in memory
 ↓
Write
```

is safe under concurrency.

If two requests do this simultaneously, one may overwrite the other.

Use an appropriate concurrency strategy.

---

# 27. Idempotency

Operations that may be retried should be designed carefully.

Examples:

```text
Payment creation
Webhook processing
Background jobs
External API synchronization
Bulk operations
```

A repeated request should not accidentally create duplicate business effects.

---

## 27.1 Idempotency Keys

Where appropriate:

```text
Request
 ↓
Idempotency key
 ↓
Check existing operation
 ↓
Return previous result OR execute once
```

Store enough information to safely determine whether the operation already completed.

---

# 28. Migrations

Migrations are the history of database schema changes.

They should be:

```text
Versioned
Reviewable
Repeatable
Deployable
Recoverable
```

Never treat migrations as disposable local scripts.

---

## 28.1 Create a Migration

During development:

```bash
npx prisma migrate dev --name descriptive_change
```

Use a meaningful migration name.

Examples:

```text
add_user_status
add_role_permissions
create_audit_logs
add_todo_owner_index
```

---

## 28.2 Review Migration

After generating a migration:

```text
Read the migration
 ↓
Understand SQL
 ↓
Check destructive operations
 ↓
Check indexes
 ↓
Check constraints
 ↓
Check data compatibility
```

Never blindly merge generated database changes.

---

# 29. Migration Safety

The most important migration rule:

> Existing production data must remain valid throughout the deployment process.

---

## 29.1 Avoid Immediate Destructive Changes

Dangerous:

```text
DROP COLUMN old_field
```

while the currently deployed application still reads:

```text
old_field
```

Safer:

```text
Release A:
Add new field

Release B:
Application starts using new field

Release C:
Backfill/verify

Release D:
Remove old field
```

---

## 29.2 Expand and Contract

For significant schema changes:

```text
Expand
  ↓
Deploy compatible application
  ↓
Migrate/backfill data
  ↓
Switch reads/writes
  ↓
Verify
  ↓
Contract/remove old structure
```

This reduces deployment coupling.

---

# 30. Data Migrations

Schema migrations and data migrations are different.

### Schema migration

Changes database structure:

```text
Add column
Add table
Add index
Add constraint
```

### Data migration

Changes existing records:

```text
Backfill column
Transform values
Merge records
Normalize data
```

Large data migrations need special care.

---

## 30.1 Large Backfills

Avoid one enormous transaction for millions of rows if it creates unacceptable locks or transaction growth.

Prefer controlled batches when appropriate:

```text
Batch 1
 ↓
Batch 2
 ↓
Batch 3
 ↓
...
```

Monitor:

- Runtime
- Locking
- Database load
- Error rate
- Replication impact

---

# 31. Seed Data

Development and test environments may need deterministic seed data.

Typical seed categories:

```text
Roles
Permissions
Admin test user
Demo users
Demo todos
```

Seed data should be safe and clearly distinguishable from production data.

---

## 31.1 Production Seeds

Do not assume development seed scripts are safe for production.

Production initialization should be explicit and idempotent.

Never create a default administrator with a known public password.

---

# 32. Development Database Reset

A local database can sometimes be recreated from migrations.

Use Prisma's documented development reset workflow when appropriate.

For example:

```bash
npx prisma migrate reset
```

This is destructive.

It may:

- Drop the database
- Recreate schema
- Apply migrations
- Run seed scripts

Never run destructive reset commands against production.

---

# 33. Prisma Client

Prisma Client should be managed consistently.

Avoid creating a new Prisma Client instance for every request.

Prefer an application-level lifecycle:

```text
Application startup
      ↓
Prisma Client
      ↓
Requests
      ↓
Application shutdown
      ↓
Disconnect
```

---

## 33.1 Development Hot Reload

Development servers may restart modules frequently.

The repository's Prisma initialization should account for development reload behavior to avoid excessive database connections.

Do not independently introduce competing Prisma singleton patterns in different modules.

---

# 34. Connection Management

PostgreSQL connections are finite resources.

Consider:

```text
API instances
×
Connection pool size
=
Total DB connections
```

If production runs:

```text
10 API instances
```

and each can use:

```text
20 connections
```

the database may face up to approximately:

```text
200 connections
```

before accounting for other clients.

Connection limits must be planned against the actual PostgreSQL/provider capacity.

---

## 34.1 Pooling

Use connection pooling where appropriate.

Depending on deployment architecture, pooling may happen through:

- Prisma
- PostgreSQL provider
- PgBouncer
- Managed database proxy

Do not add multiple pooling layers without understanding their interaction.

---

# 35. Database Errors

Database errors should be translated into meaningful application errors.

Examples:

```text
Unique constraint
        ↓
409 Conflict

Foreign key violation
        ↓
Appropriate domain/client error

Missing resource
        ↓
404 Not Found

Unexpected database failure
        ↓
500 Internal Server Error
```

Exact mappings should follow `API_CONVENTIONS.md`.

---

# 36. API Error Mapping

Do not expose raw Prisma/database errors.

Bad:

```json
{
  "error": "PrismaClientKnownRequestError: ..."
}
```

Prefer a stable application-level error.

Example:

```json
{
  "error": {
    "code": "USER_EMAIL_ALREADY_EXISTS",
    "message": "A user with this email already exists."
  }
}
```

The exact envelope is defined by the API contract.

---

# 37. Security

Database security follows defense in depth.

Use:

```text
Application validation
+
Authorization
+
Database constraints
+
Least-privilege credentials
+
Network controls
+
Encryption
+
Backups
+
Monitoring
```

---

## 37.1 Least Privilege

Application database credentials should have only the permissions required by the application.

Do not run the application using a superuser account when a restricted role is possible.

---

## 37.2 Network Access

Production databases should not be publicly accessible unless there is a deliberate, controlled architecture requiring it.

Prefer:

```text
Internet
   ✕
Database

Application
   ↓
Private network
   ↓
Database
```

---

# 38. Sensitive Data

Treat database contents as potentially sensitive.

Examples:

```text
Passwords
Password hashes
Refresh token hashes
Personal information
Sessions
Audit data
Security events
Payment-related information
```

Do not return or log sensitive fields casually.

---

## 38.1 Data Minimization

Store only data that the application actually needs.

Before adding a sensitive field:

```text
Why do we need it?
Who can access it?
How long should we keep it?
Can it be derived instead?
Can it be encrypted?
```

---

# 39. Passwords and Credentials

Passwords must never be stored in plaintext.

Store only the output of the approved password hashing strategy.

Do not:

- Log passwords
- Return password hashes
- Put passwords in JWTs
- Store passwords in audit logs
- Include passwords in seed fixtures committed to the repository

Development test passwords should be synthetic.

---

# 40. Audit Data

Audit logs may be stored in PostgreSQL.

An audit record may contain:

```text
Actor
Action
Resource
Resource ID
Timestamp
Request ID
Outcome
Relevant metadata
```

Audit records should avoid storing secrets.

---

## 40.1 Audit Immutability

Audit data should generally be append-oriented.

Avoid allowing ordinary users to edit or delete audit records.

If retention requires deletion, implement it through a controlled operational process.

---

# 41. RBAC Data

RBAC commonly requires entities such as:

```text
User
Role
Permission
UserRole
RolePermission
```

The exact schema is defined by the application's RBAC implementation.

---

## 41.1 Permission Keys

Permission identifiers should be stable.

Example:

```text
users:read
users:create
users:update
users:delete
```

Avoid storing human-readable descriptions as the permission identifier.

Descriptions can change.

Permission keys should not change casually because they may be referenced by:

- API authorization
- Admin UI
- Tests
- Seed data
- Policies
- Documentation

---

# 42. Authentication Session Data

If refresh-token/session state is stored in PostgreSQL, the database model should support:

```text
Session identity
User relationship
Token/hash representation
Created time
Expiration
Revocation
Rotation
Device/session metadata where appropriate
```

Never store raw refresh tokens if the security architecture calls for hashed storage.

---

## 42.1 Session Revocation

Logout or security events may require revoking:

```text
One session
All sessions
A token family
All sessions for a user
```

The database model should support the required lifecycle without exposing secrets.

---

# 43. Multi-Tenancy Considerations

Multi-tenancy is a future architectural concern unless already implemented.

If tenant isolation is introduced, database design must treat tenant boundaries as security boundaries.

Conceptually:

```text
Tenant
  ↓
User
  ↓
Resource
```

Queries must not accidentally cross tenant boundaries.

---

## 43.1 Tenant-Scoped Constraints

Some uniqueness requirements become:

```text
UNIQUE(tenantId, email)
```

rather than:

```text
UNIQUE(email)
```

This should be decided explicitly.

---

## 43.2 Tenant-Scoped Queries

A tenant-aware repository should make the tenant boundary difficult to forget.

Avoid relying on every developer remembering:

```text
WHERE tenantId = ?
```

for every query.

Use architecture/policy patterns that make tenant isolation explicit.

---

# 44. Caching and Database Consistency

Redis may eventually be used for caching.

Remember:

```text
PostgreSQL = source of truth
Redis = derived/temporary state
```

Do not make cache contents more authoritative than persistent data unless the architecture explicitly requires it.

---

## 44.1 Cache Invalidation

When updating:

```text
Database
+
Cache
```

define what happens on:

```text
Create
Update
Delete
Rollback
Failure
Expiration
```

A stale cache can produce incorrect authorization or business behavior if used carelessly.

---

# 45. Background Jobs and Database State

Workers may modify database state outside the HTTP request lifecycle.

This introduces concurrency.

A job should be safe against:

```text
Retry
Duplicate delivery
Worker restart
Timeout
Partial failure
Concurrent processing
```

Use database constraints and idempotency where required.

---

# 46. Testing

Database behavior requires more than unit tests.

Recommended layers:

```text
Unit
Integration
Migration
Contract
E2E
Performance
Recovery
```

---

## 46.1 Unit Tests

Unit tests can verify business behavior without requiring PostgreSQL where appropriate.

Examples:

```text
Service validation
Authorization decisions
Mapping
Business rules
```

---

## 46.2 Integration Tests

Integration tests should exercise:

```text
Repository
+
Prisma
+
PostgreSQL
```

This catches:

- Constraint problems
- Query errors
- Relation issues
- Migration mismatches
- Transaction behavior

---

# 47. Integration Testing

Integration tests should use an isolated database.

Avoid tests that depend on:

```text
Developer's personal database
Existing rows
Manual state
```

---

## 47.1 Test Isolation

Each test or test suite should have predictable state.

Possible strategies:

```text
Transaction rollback
Database reset
Dedicated schema
Dedicated test database
Fixtures
```

Choose according to the project's test harness.

---

## 47.2 Test Fixtures

Fixtures should be:

```text
Minimal
Deterministic
Reusable
Explicit
```

Avoid huge fixture graphs unless required.

---

# 48. Migration Testing

Every migration should be tested before production.

At minimum:

```text
Clean database
 ↓
Apply all migrations
 ↓
Start application
 ↓
Run tests
```

For important production changes:

```text
Existing realistic database
 ↓
Apply migration
 ↓
Verify data
 ↓
Run application
```

---

# 49. Performance

Database performance is often the primary backend bottleneck.

Monitor:

```text
Query latency
Query count
Rows scanned
Rows returned
Connection utilization
Lock waits
CPU
Memory
Storage I/O
```

---

## 49.1 Slow Query Investigation

Use:

```text
Application metrics
 ↓
Identify slow endpoint
 ↓
Identify query
 ↓
Inspect query plan
 ↓
Check indexes
 ↓
Optimize
 ↓
Measure again
```

Do not add an index blindly without understanding the query.

---

## 49.2 Avoid Over-Fetching

If an endpoint needs:

```text
id
name
status
```

do not retrieve:

```text
all columns
all relations
large text fields
```

unless required.

---

# 50. Observability

Database operations should be observable without exposing sensitive data.

Useful metrics:

```text
Query latency
Connection count
Connection pool utilization
Transaction duration
Database errors
Timeouts
Deadlocks
Slow queries
```

---

## 50.1 Database Logging

Do not enable verbose SQL logging permanently in production without a reason.

SQL logs can:

- Produce high volume
- Expose sensitive values depending on configuration
- Increase costs
- Reduce signal-to-noise

Use controlled debugging.

---

# 51. Backups

Production PostgreSQL requires backups.

A production strategy should define:

```text
Backup frequency
Retention
Encryption
Storage location
Access control
Verification
Restore testing
```

---

## 51.1 Backups Are Not Enough

A backup that has never been restored is not fully trustworthy.

Test restoration periodically.

---

# 52. Recovery

Recovery planning should define:

```text
RPO
Recovery Point Objective

RTO
Recovery Time Objective
```

Example:

```text
RPO = maximum acceptable data loss
RTO = maximum acceptable recovery time
```

The actual production values belong to the deployment requirements.

---

## 52.1 Recovery Workflow

Conceptually:

```text
Incident
 ↓
Stop/contain writes if required
 ↓
Identify recovery point
 ↓
Restore database
 ↓
Verify schema
 ↓
Verify data
 ↓
Verify application
 ↓
Resume traffic
 ↓
Monitor
```

---

# 53. Production Deployment

Database deployment should be coordinated with application deployment.

Preferred pattern:

```text
Backward-compatible migration
        ↓
Deploy application
        ↓
Verify
        ↓
Contract/remove old structure later
```

Avoid migrations that require the application and database to change at exactly the same instant unless the deployment system explicitly guarantees that coordination.

---

## 53.1 Migration Gate

Before production migration:

```text
[ ] Migration reviewed
[ ] Migration tested
[ ] Data impact understood
[ ] Locking impact considered
[ ] Rollback strategy understood
[ ] Backup available
[ ] Monitoring ready
[ ] Application compatibility verified
```

---

# 54. Database Changes Workflow

Every database change should follow:

```text
Requirement
   ↓
Domain analysis
   ↓
Schema design
   ↓
Migration
   ↓
Repository
   ↓
Service
   ↓
API contract
   ↓
Admin
   ↓
Tests
   ↓
Documentation
```

Not every change affects every layer.

---

# 55. Adding a New Model

Example:

```text
Notification
```

### Step 1 — Define purpose

```text
Why does Notification exist?
```

### Step 2 — Define fields

```text
id
userId
type
status
createdAt
updatedAt
```

### Step 3 — Define relationships

```text
Notification → User
```

### Step 4 — Define constraints

```text
Required fields
Unique constraints
Foreign keys
```

### Step 5 — Define indexes

Based on actual queries.

### Step 6 — Create migration

```bash
npx prisma migrate dev --name create_notifications
```

### Step 7 — Implement repository

Add persistence methods.

### Step 8 — Implement service

Add business behavior.

### Step 9 — Add API contract

If exposed externally.

### Step 10 — Add tests

Include database and authorization behavior.

### Step 11 — Update Admin

If the feature is Admin-facing.

### Step 12 — Document

Update relevant documentation.

---

# 56. Changing an Existing Model

Before changing an existing model ask:

```text
Does production contain data?
Are old application versions still running?
Does the Admin depend on this field?
Does an external client depend on it?
Is the change backward compatible?
```

---

## 56.1 Add a Field

Usually:

```text
Add nullable/default field
 ↓
Deploy
 ↓
Backfill if necessary
 ↓
Start using field
 ↓
Make required later if appropriate
```

---

## 56.2 Change a Field Type

Changing:

```text
String → Integer
```

requires data analysis.

Do not assume PostgreSQL can safely convert every existing value.

Plan:

```text
Compatibility
 ↓
Conversion
 ↓
Validation
 ↓
Application update
```

---

# 57. Removing a Field

Do not immediately remove a field used by the current application.

Preferred:

```text
1. Stop writing old field
2. Stop reading old field
3. Verify no consumers remain
4. Deploy
5. Remove field
```

This is an expand/contract migration.

---

# 58. Renaming a Field

A database rename can be more dangerous than it appears.

If the application currently uses:

```text
displayName
```

and the desired name is:

```text
name
```

do not assume a direct rename is safe.

Consider:

```text
New field
 ↓
Backfill
 ↓
Dual compatibility if needed
 ↓
Application switch
 ↓
Remove old field
```

For large or production-critical tables, use an explicit migration strategy rather than relying blindly on generated SQL.

---

# 59. Large Tables

Large tables require additional planning.

Examples:

```text
AuditLog
Events
Sessions
Orders
Users
```

Consider:

- Index size
- Vacuum behavior
- Query plans
- Retention
- Partitioning
- Archiving
- Pagination
- Batch operations
- Migration locking
- Backup size

Do not introduce partitioning prematurely.

---

## 59.1 Bulk Operations

For large updates:

```text
Do not:
UPDATE millions of rows blindly
```

Prefer controlled batching where appropriate.

Monitor database load.

---

# 60. Data Retention

Every long-lived data category should have a retention strategy where appropriate.

Examples:

```text
Sessions
Audit logs
Temporary records
Job history
Events
```

Questions:

```text
How long is data required?
Who requires it?
Can it be deleted?
Can it be archived?
Does legal/compliance policy apply?
```

Retention jobs should be:

```text
Safe
Idempotent
Observable
Batch-oriented
```

---

# 61. Database Review Checklist

## Schema

- [ ] Model represents a real domain concept.
- [ ] Naming is consistent.
- [ ] Primary key strategy is consistent.
- [ ] Nullability is intentional.
- [ ] Defaults are intentional.
- [ ] Relationships are correct.
- [ ] Foreign keys are defined where appropriate.
- [ ] Delete behavior is intentional.

## Constraints

- [ ] Unique constraints are correct.
- [ ] Database invariants are enforced.
- [ ] Enum changes are safe.
- [ ] Null handling is correct.

## Indexes

- [ ] Indexes match actual queries.
- [ ] No redundant indexes.
- [ ] Composite indexes are justified.
- [ ] Write overhead is understood.

## Queries

- [ ] No obvious N+1 queries.
- [ ] Data is not over-fetched.
- [ ] Pagination is server-side.
- [ ] Search is safely parameterized.
- [ ] Query performance is acceptable.

## Migrations

- [ ] Migration name is meaningful.
- [ ] Migration has been reviewed.
- [ ] Existing data is considered.
- [ ] Destructive changes are safe.
- [ ] Locking impact is understood.
- [ ] Production deployment sequence is compatible.

## Security

- [ ] Sensitive data is minimized.
- [ ] Secrets are not stored in source control.
- [ ] Passwords are hashed.
- [ ] Token secrets are protected.
- [ ] Database credentials use least privilege.
- [ ] Database network exposure is controlled.

## Application

- [ ] Repository layer is used appropriately.
- [ ] Business logic remains in services/orchestrators.
- [ ] API contracts are updated.
- [ ] Error mapping is consistent.
- [ ] Authorization is enforced.

## Testing

- [ ] Repository tests exist where needed.
- [ ] Integration tests cover important behavior.
- [ ] Migration has been tested.
- [ ] Constraints are tested.
- [ ] Authorization/data isolation is tested.

## Operations

- [ ] Backups are considered.
- [ ] Restore implications are understood.
- [ ] Metrics/logging are appropriate.
- [ ] Connection limits are understood.
- [ ] Rollback/recovery is considered.

---

# 62. Common Anti-Patterns

## 62.1 Prisma Directly in Routes

Bad:

```text
Route
 ↓
Prisma
```

Prefer:

```text
Route
 ↓
Service
 ↓
Repository
 ↓
Prisma
```

---

## 62.2 Application-Only Uniqueness

Bad:

```text
SELECT
if missing:
INSERT
```

without a database constraint.

Prefer:

```text
UNIQUE constraint
+
conflict handling
```

---

## 62.3 Fetch Everything

Bad:

```text
findMany()
```

with unnecessary relations and fields.

Prefer targeted selection.

---

## 62.4 N+1 Queries

Bad:

```text
Get users
 ↓
Loop
 ↓
Get roles for each user
```

Prefer appropriately composed queries.

---

## 62.5 Giant Transactions

Do not keep transactions open while performing:

```text
HTTP calls
Email
File uploads
Slow computation
User interaction
```

---

## 62.6 Production Database From Local Machine

Never use production as a development environment.

---

## 62.7 Manual Production Changes

Avoid:

```text
"Just run this SQL manually."
```

for persistent schema changes.

Use reviewed migrations and controlled operational procedures.

---

## 62.8 Destructive Migration Without Compatibility

Avoid:

```text
DROP COLUMN
```

when active application versions still depend on it.

---

## 62.9 Storing Raw Tokens

Never store raw authentication tokens when the security design calls for hashed token storage.

---

## 62.10 Treating Redis as the Database

Redis should not replace PostgreSQL for durable relational business state unless a deliberate architecture explicitly requires it.

---

# 63. Troubleshooting

## Prisma Client Is Missing

Run:

```bash
npx prisma generate
```

Then restart the application.

---

## Migration Is Pending

Inspect migration status using Prisma tooling.

Apply the appropriate development or deployment migration workflow.

---

## Database Connection Refused

Check:

```text
PostgreSQL running
DATABASE_URL
Host
Port
Credentials
Docker network
Firewall
Connection pool
```

---

## Unique Constraint Error

Check:

```text
Existing record
Concurrent requests
Input normalization
Database constraint
```

Do not simply remove the constraint.

---

## Foreign Key Error

Check:

```text
Parent exists?
Correct ID?
Transaction order?
Delete behavior?
```

---

## Slow Query

Check:

```text
Query shape
Indexes
Rows scanned
Relations
N+1
Pagination
Connection contention
```

---

## Migration Fails

Do not immediately edit migration history.

First determine:

```text
Was the migration partially applied?
Is the database state different?
Is existing data incompatible?
Is another migration pending?
```

For production, follow the database provider and deployment recovery procedure.

---

# 64. Definition of Done

A database change is complete when applicable requirements are satisfied.

## Design

- [ ] Domain purpose is clear.
- [ ] Model design is intentional.
- [ ] Relationships are understood.
- [ ] Constraints are intentional.
- [ ] Indexes are justified.

## Implementation

- [ ] Prisma schema is updated.
- [ ] Repository is updated.
- [ ] Service/orchestrator is updated.
- [ ] API contracts are updated when required.
- [ ] Admin is updated when required.

## Migration

- [ ] Migration exists.
- [ ] Migration is reviewed.
- [ ] Existing data is considered.
- [ ] Production compatibility is considered.
- [ ] Destructive operations are justified.

## Security

- [ ] Sensitive fields are protected.
- [ ] Authorization is enforced.
- [ ] Secrets are not stored.
- [ ] Database credentials follow least privilege.

## Testing

- [ ] Repository behavior is tested.
- [ ] Integration behavior is tested.
- [ ] Constraints are tested.
- [ ] Migration is tested.
- [ ] Concurrency/authorization is tested when relevant.

## Operations

- [ ] Performance is considered.
- [ ] Observability is considered.
- [ ] Backup/recovery impact is understood.
- [ ] Deployment order is understood.

## Documentation

- [ ] Relevant docs are updated.
- [ ] New fields/models are documented where appropriate.
- [ ] Operational requirements are documented.

---

# 65. Database Golden Rules

Keep these rules in mind:

```text
1. PostgreSQL is the source of truth for durable business data.
2. Prisma is the standard database access layer.
3. Keep database access behind repository boundaries.
4. Keep business logic in services/orchestrators.
5. Enforce important invariants in the database.
6. Never trust application-level uniqueness checks alone.
7. Validate input before querying.
8. Select only the data you need.
9. Watch for N+1 queries.
10. Paginate large collections.
11. Index based on real query patterns.
12. Keep transactions short.
13. Design for concurrent requests.
14. Make retryable operations idempotent where necessary.
15. Treat migrations as permanent production artifacts.
16. Prefer expand/contract for risky schema changes.
17. Never use production as a development database.
18. Never commit database credentials.
19. Never store passwords or raw authentication tokens.
20. Minimize sensitive data.
21. Test migrations before production.
22. Test database restoration, not just backups.
23. Monitor connections and slow queries.
24. Do not add infrastructure before it is needed.
25. Prefer simple, explicit database design.
```

---

# Database Development Model

The intended database development lifecycle is:

```text
                    Requirement
                         │
                         ▼
                  Domain Analysis
                         │
                         ▼
                    Schema Design
                         │
                         ▼
                 Prisma Migration
                         │
                         ▼
                 Repository Layer
                         │
                         ▼
                Service / Orchestrator
                         │
                         ▼
                   API Contract
                         │
                         ▼
                    Admin UI
                         │
                         ▼
                       Tests
                         │
                         ▼
                 Review + Validation
                         │
                         ▼
                     Deployment
                         │
                         ▼
                  Monitor + Recover
```

The database should remain a **stable, secure, and deliberately managed foundation** for the rest of Fastify-MasterApp.

The guiding principle is:

> **Make the database enforce what must always be true, make the application enforce what the business requires, and keep both layers explicit, testable, and observable.**
