# Platform Testing

**Phase 16 — Testing** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §21).

This maps the plan's §21 test checklist to the **existing** test suite,
documents coverage and honest gaps, and records how the suite runs. No new
behavior was added in this phase; it is verification + documentation of what the
suite already proves.

---

## 1. How the suite runs

- **Runner:** Vitest, in `apps/platform-api`, via `npm run test`.
- **Harness:** `core/testing/test-app.ts` — `buildTestApp()` builds the real
  Fastify app with a **mock Prisma** and mock env, so tests need **no database
  and no `.env`**. `signTestToken()` mints JWTs for authenticated cases.
- **Current status:** **231 tests / 25 files passing.** (CI additionally runs the
  suite against a real Postgres with coverage.)
- Tests are co-located in each module's `__tests__/`.

## 2. Plan §21 checklist → coverage

### Authentication (`modules/auth/__tests__/auth.test.ts`, `auth-recovery.test.ts`, `operations/__tests__/password.test.ts`)

| Item                                        | Covered                                    |
| ------------------------------------------- | ------------------------------------------ |
| valid login                                 | ✅                                         |
| invalid credentials                         | ✅                                         |
| refresh (rotation)                          | ✅                                         |
| refresh reuse / revoked / expired           | ✅                                         |
| logout / logout-all                         | ✅                                         |
| account lockout (locked user rejected)      | ✅ (429 after threshold; reset on success) |
| forgot password                             | ✅                                         |
| reset password (OTP → token → confirm)      | ✅                                         |
| OTP verify (email verification)             | ✅                                         |
| password hashing (argon2id + legacy bcrypt) | ✅                                         |
| change-password revokes sessions            | ✅                                         |
| mass-assignment defence (register)          | ✅                                         |

### Authorization (`modules/roles/__tests__/rbac.test.ts`, `roles.service.test.ts`, `core/authorization/__tests__/require-permission.test.ts`, `modules/platform/__tests__/platform.test.ts`)

| Item                                             | Covered                                                 |
| ------------------------------------------------ | ------------------------------------------------------- |
| unauthenticated request rejected                 | ✅                                                      |
| default-deny (no permission → 403)               | ✅                                                      |
| permission grants access                         | ✅                                                      |
| effective permissions = union across roles       | ✅                                                      |
| unknown/registry-absent permission ignored       | ✅                                                      |
| **tenant-only user rejected on platform**        | ✅ (`platform.test.ts` — no `PlatformMembership` → 403) |
| **role name alone cannot grant platform access** | ✅ (permission-based; membership-gated)                 |
| platform member without permission rejected      | ✅                                                      |
| permitted platform member accepted               | ✅                                                      |
| sensitive endpoint enforces correct permission   | ✅ (archive requires `platform.tenant.archive`)         |
| privilege-escalation protection (SUPER_ADMIN)    | ✅ (`rbac.test.ts`, `roles.service.test.ts`)            |
| last-administrator protection                    | ✅                                                      |
| API enforcement independent of UI                | ✅                                                      |

### Tenant lifecycle (`modules/platform/__tests__/platform.test.ts`)

| Item                                                 | Covered |
| ---------------------------------------------------- | ------- |
| create (provisioning transaction)                    | ✅      |
| duplicate slug → 409                                 | ✅      |
| suspend                                              | ✅      |
| reactivate (`SUSPENDED → ACTIVE`)                    | ✅      |
| archive (requires archive permission)                | ✅      |
| invalid transitions (out of `ARCHIVED`, no-op) → 409 | ✅      |

### Credentials (`modules/platform/__tests__/credentials.test.ts`)

| Item                                     | Covered                                  |
| ---------------------------------------- | ---------------------------------------- |
| create                                   | ✅                                       |
| rotate                                   | ✅                                       |
| revoke                                   | ✅                                       |
| rotate/revoke a revoked credential → 409 | ✅                                       |
| secret NOT returned by list              | ✅ (asserts no secret/hash in list body) |
| secret returned once on create/rotate    | ✅                                       |
| authorization gate on all four           | ✅                                       |
| audit generated                          | ✅ (`audit.test.ts`)                     |

### Isolation (`core/tenant/__tests__/*`, `modules/platform/__tests__/*`)

| Item                                                                | Covered                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| tenant-scoped accessor injects `tenantId`                           | ✅ (`tenant-db.test.ts`)                                                                               |
| cross-tenant reference rejected / not-found                         | ✅ (`tenant-relationship-guard.test.ts`, credential `getOwned`)                                        |
| tenant resolution validates membership + status                     | ✅ (`tenant.service.test.ts`)                                                                          |
| tenant-owned model allow-list assertion                             | ✅ (`tenant-scope-assertion.test.ts`, `tenant-isolation.integration.test.ts`)                          |
| Platform API uses no tenant fallback                                | ✅ (platform module verified free of tenant context — `docs/PLATFORM-API.md`)                          |
| Platform cannot connect to a Logistics DB / import Logistics Prisma | N/A — single DB, no logistics system (`docs/PLATFORM-LOGISTICS-INTEGRATION.md`); enforced structurally |

### Platform audit (`modules/platform/__tests__/audit.test.ts`, `core/audit/__tests__/audit.service.test.ts`)

| Item                                               | Covered                     |
| -------------------------------------------------- | --------------------------- |
| tenant status change emits correct action          | ✅                          |
| credential action emits event                      | ✅                          |
| **no secret in audit metadata**                    | ✅ (asserted)               |
| audit read endpoint gated by `platform.audit.view` | ✅ (403 without / 200 with) |

### Frontend

| Item                                                             | Covered                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| protected routes / permission-aware nav / tenant + credential UX | ⚠️ **Not unit-tested** — `apps/super-admin` has no test suite. Verified via typecheck + production build only. |

## 3. Honest gaps

- **Super Admin frontend has no automated tests.** The tenant Admin app (which
  had RTL tests) was removed in an earlier session; `apps/super-admin` is
  currently verified by typecheck + build, not unit/component tests. Adding a
  Vitest + Testing Library setup for the platform frontend (protected-route
  redirect, permission-aware nav, credential show-once UX) is a recommended
  follow-up.
- **DB-level isolation tests are structural, not live-connection.** "Platform
  cannot connect to a Logistics DB" holds by construction (one datasource, no
  logistics system) rather than by a runtime test — appropriate given no second
  DB exists.
- **Credential/audit tests use mock Prisma.** They prove route/service behavior
  and the security contract (no secret leakage, correct actions) without a live
  DB; end-to-end DB behavior is exercised by CI's real-Postgres run of the same
  suite once the pending migrations are applied there.
- **Legacy role-matrix authorization** (`core/authorization/{permissions,authorize,ownership}.ts`)
  is now dead code (its only consumer, the demo `todos` module, was removed).
  Any tests still covering it exercise unused code; removing that subsystem +
  its tests is a recommended cleanup follow-up.

## 4. Running

```bash
npm run test                    # platform-api suite (Vitest, mock Prisma)
npm run typecheck               # all workspaces
npm run lint                    # 0 errors required
npm run build                   # contracts → api → super-admin
```

CI (`.github/workflows/ci.yml`) additionally runs the suite with coverage
against a real Postgres service and applies migrations first.

---

## Gate

Phase 16 verifies that the plan's §21 security-sensitive areas —
authentication, authorization (incl. tenant-user-rejected and
role-name-insufficient), tenant lifecycle, credentials (incl. secret-not-leaked
and audit-generated), isolation, and platform audit (incl. no-secret-in-metadata)
— are covered by the existing 231-test suite, and documents the honest gaps
(no frontend unit tests; structural DB-isolation; dead legacy authz). No new
behavior, schema, or database command was introduced.
