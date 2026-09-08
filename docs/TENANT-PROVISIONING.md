# Tenant Provisioning

**Phase 8 — Tenant Provisioning** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §13).

This documents the **implemented** tenant provisioning workflow, its
transactional guarantees, identity-reuse semantics, and the default role it
grants — plus an honest analysis of the invitation-vs-password tradeoff the plan
raises. Verification + documentation only: no schema, migration, or database
command changes were made.

---

## 1. Endpoint

```text
POST /api/v1/platform/tenants        permission: platform.tenant.create → 201
```

Request body (`CreateTenantBody`, `@app/api-contracts`):

| Field           | Rules                                             |
| --------------- | ------------------------------------------------- |
| `name`          | 1–120 chars                                       |
| `slug`          | 2–64 chars, URL-safe `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| `adminEmail`    | email, ≤255                                       |
| `adminName`     | 1–120 chars                                       |
| `adminPassword` | 12–200 chars                                      |

Response: the created tenant DTO (`{ id, name, slug, status, memberCount,
createdAt, updatedAt }`), status `ACTIVE`.

## 2. Workflow (single transaction)

`PlatformService.provisionTenant(input)` runs an explicit, ordered workflow. A
slug-uniqueness pre-check runs first (friendly `409` before the transaction);
the mutations then execute in **one Prisma `$transaction`** so they all commit or
all roll back:

```text
(pre-check) slug not taken  → else 409 CONFLICT
        ↓  ── begin transaction ──
1. Create Tenant                 (status = ACTIVE)
2. Resolve admin identity        (reuse User by email, else create)
3. Create TenantMembership       (tenantId + userId, status = ACTIVE)
4. Create default tenant role    (name ADMIN, tenantId-scoped, isSystem)
5. Attach TENANT_PERMISSION_KEYS to that role
6. Assign the admin the role     (UserRole with tenantId, assignedBy = "platform-provisioning")
        ↓  ── commit ──
return tenant DTO
```

### Step notes

- **1 — Tenant** is created directly `ACTIVE` (not `TRIAL`); lifecycle changes
  afterward go through the validated status endpoint (`docs/TENANT-LIFECYCLE.md`).
- **2 — Identity reuse.** A person is a single identity across the platform
  (MULTI-TENANT §11). If a `User` already exists for `adminEmail`, that identity
  is reused (no duplicate account, password unchanged); otherwise a new `User` is
  created with the hashed `adminPassword`, `role: "user"`, and `emailVerifiedAt`
  set (the provisioned admin is trusted, so they can log in immediately).
- **3 — Membership** is created `ACTIVE`, so the admin can use the tenant right
  away.
- **4/5 — Default role.** A tenant-scoped `ADMIN` role (`Role.tenantId = tenant.id`,
  `isSystem = true`) is created and granted the **tenant** permission set
  (`TENANT_PERMISSION_KEYS` — i.e. every non-`platform.*` key). This is a tenant
  role, so it can never confer platform access.
- **6 — Assignment** ties the admin to that role **within the new tenant**
  (`UserRole.tenantId = tenant.id`), recording `assignedBy` for auditability.

## 3. Transactional & boundary guarantees

- **Atomic.** Tenant, membership, role, permissions, and assignment commit
  together; a failure leaves no half-provisioned tenant.
- **Platform boundary respected.** The default role gets only tenant permissions;
  provisioning never grants `platform.*` or a `PlatformMembership`.
- **No cross-database access.** All writes are to the single platform database
  via the raw Prisma client (see `docs/PLATFORM-DATABASE.md`); there is no call
  to any external/logistics service.
- **Lean by design.** No settings/branding rows are written — there is no such
  model, and the plan (§13) explicitly says not to invent Settings/Branding
  persistence to satisfy a screen.

## 4. Invitation vs. password — analysis (plan §13)

The plan prefers **invitation over creating an unnecessary permanent
tenant-admin password**, _if the platform already supports invitations_.

**Current state:** the data model has an `INVITED` `MembershipStatus`, and the
tenant-facing module surfaces it, but **there is no invitation workflow**
(no invite endpoint, no acceptance flow, no invite token). Provisioning today
takes a required `adminPassword` and creates an `ACTIVE` membership directly.

**Assessment / recommendation:**

- The password-based path is functional and safe as implemented (password is
  hashed with Argon2id; never stored or returned in plaintext). It is acceptable
  for an operator-provisioned first admin.
- However, per the plan's preference, an **invitation-based** provisioning option
  is the better long-term design: create the tenant + admin `User` **without** a
  caller-supplied password, set the membership `INVITED`, and send the admin an
  invite (reusing the existing OTP/token infrastructure in
  `modules/auth/services/otp.service.ts`) to set their own password and activate.
- This is **net-new work** (new endpoint/contract + invite token/flow) and is
  **not** implemented in this phase. It is recorded here as the recommended
  enhancement so provisioning does not mint an unnecessary permanent password
  when invitations become available. Adding it does not require schema changes
  (the `INVITED` status and OTP tables already exist).

Until then, the password path remains the documented, supported behavior.

## 5. Errors

- `409 CONFLICT` — slug already exists.
- `400 VALIDATION_ERROR` — body fails the contract schema.
- `401 UNAUTHORIZED` / `403 PLATFORM_ACCESS_DENIED` — auth / platform-permission
  failures (see `docs/PLATFORM-API.md`).

## 6. Not yet implemented (honest scope)

- **Invitation-based provisioning** — see §4 (recommended; deferred).
- **Audit event** on provisioning — `AuditService` exists but the platform
  routes do not yet emit audit records; wired in **Phase 10**.
- **Tenant-side resource initialization via a Logistics API** (plan §13 step) —
  there is no separate logistics system in this repository, so this step does not
  apply here (see `docs/PLATFORM-DATABASE.md`, `docs/CONVERSION-INVENTORY.md`).
- **Settings/Branding persistence** — intentionally absent (no model; plan §13).

## 7. Tests

`modules/platform/__tests__/platform.test.ts` covers provisioning:

- full workflow — asserts Tenant, admin `User`, `TenantMembership` (ACTIVE),
  tenant `ADMIN` role (tenant-scoped), and the `UserRole` assignment are all
  created with the right shape;
- duplicate slug → `409`.

---

## Gate

Phase 8 verifies and documents the transactional tenant provisioning workflow
(tenant + admin identity + ACTIVE membership + default tenant ADMIN role +
assignment, all atomic), confirms the platform boundary is respected and no
Settings/Branding persistence is invented, and honestly analyzes the
invitation-vs-password tradeoff with a concrete recommendation. Invitation flow,
audit emission, and any logistics-side initialization are explicitly deferred/
not-applicable. No schema, migration, or database command changes were made;
tests pass.
