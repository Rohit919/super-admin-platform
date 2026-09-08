# Platform Database

**Phase 3 — Platform Database Ownership & Documentation** (Option A).

This document establishes database ownership for the Super Admin Platform. It is
a **documentation + inventory** deliverable only. Per the Phase 3 directive:

> No schema changes · No migration changes · No Prisma/database commands · No
> `DATABASE_URL` change · No second database · No Platform → Logistics API
> boundary.

The physical separation into two databases is **explicitly deferred** (§9–§12).

---

## 1. Current database ownership

The Super Admin Platform owns **one PostgreSQL database**, addressed by
`DATABASE_URL` (with `DATABASE_DIRECT_URL` used only by Prisma migrate /
introspection). This single database **is** the Platform Database.

There is **no separate Logistics Platform and no logistics database** in this
repository. The tenant/business plane is represented inside the same database as
tenant metadata + tenant-scoped RBAC, not as a distinct logistics datastore.

The Prisma schema at `prisma/schema.prisma` is **owned by `apps/platform-api`
(`platform-api`)**. It is the single source of truth for the platform's
relational model. `platform-api` is the only service that opens a Prisma client
against this database; the frontends (`super-admin`, `admin`) never touch the DB
directly — they go through the API.

```text
super-admin (frontend)        admin (tenant frontend)
        \                         /
         \  authenticated HTTPS  /
          ▼                     ▼
              platform-api  (apps/platform-api)
                     │  Prisma client (owner)
                     ▼
          ONE PostgreSQL database  (DATABASE_URL)
          = the Platform Database
```

## 2. Current single-database architecture

The platform control plane and tenant metadata **share one database** by design.
The platform layer is implemented as an **authorized cross-tenant surface** over
that database, not as a second system:

- Platform (Super Admin) operations read/write across tenants deliberately and
  explicitly via the raw Prisma client (never silently tenant-filtered).
- Tenant-scoped operations go through an explicit tenant-scoped accessor
  (`core/tenant/tenant-db.ts`) that injects `tenantId` into every query.

Because there is exactly one database:

- there are **no cross-database foreign keys** (there is nothing to cross to);
- there is **no Platform → Logistics API boundary** (there is no logistics
  service to call);
- referential integrity is enforced by ordinary in-database foreign keys.

This is the intentional architecture described in
`docs/super-admin/MULTI-TENANT-ARCHITECTURE.md`.

## 3. Prisma ownership

| Aspect        | Value                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------- |
| Schema file   | `prisma/schema.prisma` (repo root)                                                       |
| Owner service | `apps/platform-api` (`@app/api`, "platform-api")                                         |
| Datasource    | `db` → `env("DATABASE_URL")`, `directUrl = env("DATABASE_DIRECT_URL")`                   |
| Provider      | `postgresql`                                                                             |
| Generator     | `prisma-client-js` (previewFeatures: tracing, metrics)                                   |
| Migrations    | `prisma/migrations/` (10 migrations, `init` → `add_platform_membership`)                 |
| Seed          | `prisma/seed.ts` (permission catalog, system roles, initial admin + platform membership) |
| Client access | only `platform-api` (via `plugins/db.ts` → `fastify.prisma`)                             |

## 4. Complete model inventory

The schema defines **14 models** and **3 enums**. Every model is classified
below as **Platform-owned**, **Tenant metadata**, **Demo/placeholder**, or a
**candidate for future removal**. (Ownership tags in the schema comments were
cross-checked against this inventory.)

| #   | Model                | Classification                             | Notes                                                                                                                                            |
| --- | -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `User`               | **Platform-owned**                         | Single global identity (one person = one user). Shared across platform + tenants via memberships. `tenantId`-free.                               |
| 2   | `RefreshToken`       | **Platform-owned**                         | Session/refresh rotation + family reuse detection. Belongs to a `User`, not a tenant.                                                            |
| 3   | `OtpChallenge`       | **Platform-owned**                         | Email verification / password reset / login OTP. Identity-layer, tenant-independent.                                                             |
| 4   | `PasswordResetToken` | **Platform-owned**                         | Short-lived reset authorization token. Identity-layer.                                                                                           |
| 5   | `PlatformMembership` | **Platform-owned**                         | The Super Admin access gate (ACTIVE membership required for `/platform/*`).                                                                      |
| 6   | `Permission`         | **Platform-owned**                         | Global permission registry (incl. `platform.*` keys). Application-defined, not tenant-scoped.                                                    |
| 7   | `Role`               | **Platform-owned _or_ Tenant metadata**    | `tenantId = null` → platform/system role (e.g. `SUPER_ADMIN`). `tenantId` set → a tenant's role. Same table, ownership determined by `tenantId`. |
| 8   | `RolePermission`     | **Platform-owned**                         | Role ↔ Permission join. Ownership follows the parent `Role`.                                                                                     |
| 9   | `UserRole`           | **Platform-owned _or_ Tenant metadata**    | Assignment. `tenantId = null` → platform-level assignment; `tenantId` set → scoped to that tenant. This column makes RBAC tenant-aware.          |
| 10  | `Tenant`             | **Tenant metadata**                        | Tenant lifecycle record (name, slug, `TenantStatus`). Platform-owned _metadata about_ tenants — not tenant business data.                        |
| 11  | `TenantMembership`   | **Tenant metadata**                        | User ↔ Tenant relationship + `MembershipStatus`.                                                                                                 |
| 12  | `AuditLog`           | **Platform-owned (nullable tenant scope)** | Immutable authorization/audit events. `tenantId = null` → platform event; set → tenant-scoped event.                                             |
| 13  | `Todo`               | **Demo / placeholder**                     | Golden Orchestrator reference model. **Candidate for future removal.**                                                                           |
| 14  | `Example`            | **Demo / placeholder**                     | Direct-Prisma CRUD reference model. **Candidate for future removal.**                                                                            |

Enums:

| Enum                                                                      | Used by                                  | Classification             |
| ------------------------------------------------------------------------- | ---------------------------------------- | -------------------------- |
| `TenantStatus` (`TRIAL`/`ACTIVE`/`SUSPENDED`/`ARCHIVED`)                  | `Tenant`                                 | Tenant metadata            |
| `MembershipStatus` (`INVITED`/`ACTIVE`/`SUSPENDED`/`REMOVED`)             | `TenantMembership`, `PlatformMembership` | Platform + tenant metadata |
| `OtpPurpose` (`EMAIL_VERIFICATION`/`PASSWORD_RESET`/`LOGIN_VERIFICATION`) | `OtpChallenge`                           | Platform-owned             |

### 4.1 Classification summary

- **Platform-owned:** `User`, `RefreshToken`, `OtpChallenge`,
  `PasswordResetToken`, `PlatformMembership`, `Permission`, `RolePermission`,
  platform `Role`/`UserRole` (`tenantId = null`), `AuditLog`.
- **Tenant metadata:** `Tenant`, `TenantMembership`, tenant `Role`/`UserRole`
  (`tenantId` set).
- **Demo / placeholder:** `Todo`, `Example`.
- **Candidates for future removal:** `Todo`, `Example` (and, in code, the
  unregistered `orders` module — no model exists for it). Removal is a **later,
  separate phase**, not part of Phase 3.

## 5. No logistics business models — confirmed

A full scan of `prisma/schema.prisma` confirms **none** of the following exist:

```text
Shipment · Order · Driver · Vehicle · Warehouse · Route · Delivery ·
Fleet · Carrier · Consignment · Cargo · Package · Tracking
```

The only non-identity/non-RBAC models are the two demo models (`Todo`,
`Example`). There is therefore **no logistics business data to exclude, copy, or
separate** — the plan's "do not copy Shipment/Order/… into the Platform DB" rule
(§8) is satisfied vacuously.

## 6. Platform vs tenant-metadata responsibilities

| Concern                   | Owned by                          | Models                                                       |
| ------------------------- | --------------------------------- | ------------------------------------------------------------ |
| Platform identity & auth  | Platform                          | `User`, `RefreshToken`, `OtpChallenge`, `PasswordResetToken` |
| Platform access gate      | Platform                          | `PlatformMembership`                                         |
| Global RBAC registry      | Platform                          | `Permission`, platform `Role`/`RolePermission`/`UserRole`    |
| Platform audit            | Platform                          | `AuditLog` (`tenantId = null`)                               |
| Tenant lifecycle metadata | Platform (metadata about tenants) | `Tenant`, `TenantMembership`                                 |
| Tenant RBAC               | Tenant                            | tenant `Role`/`UserRole` (`tenantId` set)                    |
| Tenant audit              | Tenant                            | `AuditLog` (`tenantId` set)                                  |
| Demo/reference            | —                                 | `Todo`, `Example`                                            |

The Platform DB owns **tenant lifecycle metadata**, not tenant _business_ data —
consistent with the conversion plan (§8). Since no logistics business plane
exists here, there is no tenant business data in this database beyond the demo
models.

## 7. Existing authorization / scoping model

Authorization is enforced entirely in `platform-api`; the database stores
assignments, never trusts client-supplied permissions.

- **Platform access:** `requirePlatformPermission(key)` (in
  `core/platform/require-platform.ts`) = ACTIVE `PlatformMembership` gate **plus**
  a `platform.*` permission resolved with **no tenant scope** (only platform
  roles, `UserRole.tenantId = null`, contribute). A tenant role can never grant a
  platform permission.
- **Tenant access:** the tenant-resolution hook validates membership + tenant
  status and attaches an explicit tenant-scoped DB accessor
  (`getTenantDb(prisma, tenantId)`), which injects `tenantId` into every
  tenant-owned query. Platform operations bypass this accessor **intentionally**
  and use the raw client, so cross-tenant reads are explicit and never silent.
- **RBAC resolution:** `AuthorizationService.getContext(userId, tenantId?)`
  unions platform assignments (`tenantId = null`, apply everywhere) with the
  active tenant's assignments only — never another tenant's.

## 8. Why the current single database is valid

1. **No second system to separate from.** There is no logistics service or
   logistics DB in this repository; a physical split would create an empty
   second database with no data to hold today.
2. **Ownership is already explicit.** Platform vs tenant-metadata is expressed
   via `tenantId` and enforced by distinct code paths (platform raw client vs
   tenant-scoped accessor), so the _logical_ boundary the plan wants already
   exists without a physical split.
3. **No cross-database coupling risk today.** One database means zero
   cross-database foreign keys and zero hidden cross-service data access — the
   exact failure modes the plan warns against.
4. **Independently deployable.** `platform-api` deploys with its own image and
   its own `DATABASE_URL`; nothing about the single-DB design ties it to another
   system's release cycle.
5. **Reversible.** Keeping one DB now does not preclude a future split (§9–§11);
   the logical ownership documented here is exactly what a future split would
   follow.

## 9. Future two-database architecture (target, not implemented)

If a genuine, separate business/logistics plane is ever introduced, the target
becomes two independently owned databases communicating only through APIs:

```text
                CONTROL PLANE                         BUSINESS PLANE
   super-admin ─▶ platform-api ─▶ platform_db      admin ─▶ business API ─▶ business_db
                        │                                          ▲
                        └────────── authenticated HTTPS ───────────┘
                                    (stable IDs + contracts only)
```

`platform_db` would own: `Tenant`, `TenantMembership`, `PlatformMembership`,
platform `User`/RBAC, `AuditLog`, tenant API credentials (a later phase). The
business plane would own its own business tables in `business_db`.

## 10. Requirements for a future physical split

A future split must satisfy all of the following (each maintainer-approved):

1. A concrete business/logistics plane actually exists to separate into.
2. `platform_db` gets its own connection string, migration history, and Prisma
   schema owned by `platform-api`.
3. The business plane gets a **separate** database + schema + migrations, owned
   by its own service.
4. All cross-plane references use **stable IDs + API contracts**, never shared
   tables or shared connection strings.
5. Data that logically belongs to each plane is carved to the correct DB with a
   documented, reversible migration + rollback plan (see §13 of the master plan
   / §24 migration strategy).
6. `DATABASE_URL` is verified to point at `platform_db` before any migration
   runs.

## 11. No cross-database foreign-key rule

Even after a future split:

- **Never** create a foreign key from `platform_db` to a business DB or vice
  versa.
- Cross-plane relationships are expressed with **stable identifiers** (e.g. a
  `tenantId` string) resolved through the owning service's API.
- Referential integrity within a database uses ordinary FKs; across databases it
  is the responsibility of the API contract + application logic.

Today this rule holds trivially: there is one database and therefore no
cross-database FK can exist. This section is the standing rule for any future
split.

## 12. Future API-boundary requirement

A physical split **requires** a real service boundary between the planes before
any data is separated. That boundary (service auth, tenant identifier,
request/response schemas, idempotency, timeouts, retries, error mapping,
correlation IDs, audit) is defined in the master plan (§16) and belongs to a
dedicated integration phase. **It is not introduced now** — there is no second
service to talk to.

## 13. Migration risks (for a future split — informational)

- **Copied migration history:** the current `prisma/migrations/` reflect _this_
  platform's own evolution (not an old logistics schema), so they are valid for
  the Platform DB as-is. A future split would need a **new, separate** migration
  history for any new business DB — do not reuse platform migrations for it.
- **Data carve-out:** moving any data across a future DB boundary is
  destructive/irreversible if mishandled; it requires an explicit backup +
  rollback plan and must never run automatically.
- **`DATABASE_URL` targeting:** before any migration, verify the URL points at
  the intended database. Never run `prisma migrate deploy`/`dev`/`reset`/seed
  without explicit approval.
- **Demo models:** `Todo`/`Example` should be removed (separate phase) before
  they are mistaken for business data during any future carve-out.

## 14. Explicit deferral of physical DB separation

The physical two-database split is **DEFERRED**. It is out of scope for Phase 3
and for the current codebase, because:

- there is no separate logistics/business plane to split into, and
- the logical platform/tenant ownership boundary is already documented and
  enforced in code against the single database.

The split will be revisited only if and when a real business plane is
introduced, under a dedicated, maintainer-approved phase that satisfies §10–§13.

---

## Gate

Phase 3 (Option A) documents Platform Database ownership, the complete model
inventory, the platform/tenant-metadata responsibilities, and the authorization
model against the **existing single database** — with **no** schema, migration,
database-command, `DATABASE_URL`, or Platform → Logistics boundary changes. The
physical database separation is explicitly deferred.
