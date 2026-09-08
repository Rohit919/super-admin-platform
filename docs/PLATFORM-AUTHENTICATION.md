# Platform Authentication

**Phase 4 — Platform Authentication** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §9).

This document describes the **implemented** authentication boundary for the
Super Admin Platform and the platform authorization gate that sits on top of it.
It is a verification + documentation deliverable: the authentication surface
already exists and is covered by tests. No schema, migration, or database
command changes were made in this phase.

> The authentication endpoints (`/auth/*`) are a **general identity boundary**:
> any client authenticates the same way. Platform **authorization** is
> independent and enforced separately (§4). A user authenticating successfully
> does **not** thereby gain platform access. (The tenant Admin frontend that
> previously shared these endpoints has been removed — see
> `docs/CONVERSION-INVENTORY.md`; the shared-auth design is unchanged and any
> future tenant client would authenticate the same way.)

---

## 1. Summary

| Capability                                   | Status         | Where                                                         |
| -------------------------------------------- | -------------- | ------------------------------------------------------------- |
| Login (password)                             | ✅ Implemented | `modules/auth/auth.routes.ts`                                 |
| Logout / logout-all                          | ✅ Implemented | `auth.routes.ts`                                              |
| Refresh (rotation + reuse detection)         | ✅ Implemented | `auth.routes.ts`                                              |
| Change password (authenticated)              | ✅ Implemented | `auth.routes.ts`                                              |
| Forgot password                              | ✅ Implemented | `auth-recovery.routes.ts`                                     |
| Reset password (OTP → reset token → confirm) | ✅ Implemented | `auth-recovery.routes.ts`                                     |
| Email verification / resend (OTP)            | ✅ Implemented | `auth-recovery.routes.ts`                                     |
| Session / token lifecycle                    | ✅ Implemented | JWT access + rotating refresh cookie                          |
| Account status validation                    | ✅ Implemented | lockout (login) + `PlatformMembership.status` (platform gate) |
| Platform membership gate                     | ✅ Implemented | `core/platform/require-platform.ts`                           |
| Permission-based platform authorization      | ✅ Implemented | `core/authorization` + `platform.*` keys                      |

All endpoints are served by `platform-api` under `/api/v1/auth/*`.

## 2. Authentication flow

```text
Credentials (email + password)
        ↓
platform-api  POST /api/v1/auth/login
        ↓
User verified (password + account-status checks)
        ↓
Access token (JWT, 15m) + refresh token (rotating, HTTP-only cookie)
        ↓
Authenticated requests: Authorization: Bearer <access token>
```

For **platform** operations the request additionally passes the platform gate
(§4). Authentication proves _who_ you are; the gate decides whether you may act
on the platform.

## 3. Endpoints

### 3.1 Core (`modules/auth/auth.routes.ts`)

| Method | Path                    | Auth   | Notes                                                                                                         |
| ------ | ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`           | public | Password login. Rate-limited 5 / 15 min, keyed by email.                                                      |
| POST   | `/auth/register`        | public | Creates a `role: "user"` account. Rate-limited 3 / hr. Injected `role` is stripped (mass-assignment defence). |
| POST   | `/auth/refresh`         | cookie | Rotates the refresh token; detects reuse. Rate-limited 10 / min.                                              |
| POST   | `/auth/logout`          | cookie | Revokes the presented refresh token (idempotent).                                                             |
| POST   | `/auth/logout-all`      | Bearer | Revokes every active session for the user.                                                                    |
| GET    | `/auth/verify`          | Bearer | Returns the decoded token user (token validity check).                                                        |
| POST   | `/auth/change-password` | Bearer | Verifies current password, sets new, revokes all sessions.                                                    |

### 3.2 Recovery / OTP (`modules/auth/auth-recovery.routes.ts`)

| Method | Path                           | Auth   | Notes                                                                                  |
| ------ | ------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| POST   | `/auth/verify-email`           | public | Consumes an `EMAIL_VERIFICATION` OTP; sets `emailVerifiedAt`.                          |
| POST   | `/auth/resend-verification`    | public | Enumeration-safe; only sends if the account exists and is unverified.                  |
| POST   | `/auth/forgot-password`        | public | Enumeration-safe generic response; sends a `PASSWORD_RESET` OTP if the account exists. |
| POST   | `/auth/password-reset/verify`  | public | Exchanges a valid reset OTP for a **single-use, short-lived** reset token.             |
| POST   | `/auth/password-reset/confirm` | public | Consumes the reset token, sets the new password, revokes all sessions, clears lockout. |

OTP details: 6 numeric digits, stored as **HMAC-SHA256(code)** (never plaintext),
5-minute expiry, attempt-limited (`OtpChallenge`), via `services/otp.service.ts`.
All recovery endpoints are rate-limited (per-email or per-IP).

## 4. Platform authorization boundary (the gate)

Authentication is necessary but **not sufficient** for platform access. Every
`/api/v1/platform/*` route runs:

```text
preValidation: [authenticate]                         → identity (JWT verified)
preHandler:    [requirePlatformPermission(key)]       → ACTIVE PlatformMembership
                                                        + platform.* permission
```

Resolution flow (`core/platform/require-platform.ts`,
`core/authorization/authorization.service.ts`):

```text
Credentials
    ↓
Platform API  (authenticate → request.user)
    ↓
Platform User (User row)
    ↓
Platform Membership  (PlatformMembership.status === ACTIVE)   ← the gate
    ↓
Platform Role  (UserRole with tenantId = null)
    ↓
Platform Permissions  (platform.* keys, resolved with NO tenant scope)
    ↓
Handler
```

Key properties:

- **Membership gate first.** `isActivePlatformMember(userId)` must be true. No
  membership, or a non-`ACTIVE` membership (`INVITED`/`SUSPENDED`/`REMOVED`), is
  denied.
- **Permission-based, not role-name-based.** Authorization checks a
  `platform.*` **permission**, resolved through the RBAC engine with **no tenant
  scope**, so only platform roles (`UserRole.tenantId = null`) contribute. The
  role _name_ `SUPER_ADMIN` is never used as an authorization condition — it is
  merely the seeded platform role that happens to hold the permissions.
- **Tenant roles can never grant platform permissions.** A tenant assignment
  (`UserRole.tenantId` set) is excluded from platform-permission resolution.
- **Uniform failure.** No membership, inactive membership, and missing
  permission all return the same `403 PLATFORM_ACCESS_DENIED`
  (`PlatformAccessDeniedError`) — a tenant user cannot probe platform structure.

### 4.1 A tenant-only user cannot gain platform access

A user who can authenticate and has tenant memberships — even one holding a
tenant role literally named `SUPER_ADMIN` — has **no `PlatformMembership`** and
therefore fails the gate with `403 PLATFORM_ACCESS_DENIED`. This is verified by
tests (§7).

## 5. Token & session lifecycle

- **Access token:** JWT, `HS256` pinned on **both sign and verify** (blocks the
  `alg:none` attack), default 15-minute expiry. `JWT_SECRET` must be ≥ 32 chars
  (enforced at boot in `plugins/auth.ts`).
- **Payload** (`operations/build-token-payload.ts`):
  `{ id, email, role, permissionVersion?, tenantId? }`.
  - `permissionVersion` lets the server detect a stale token whose authorization
    changed (bumped when a user's effective permissions change).
  - `tenantId` is the resolved active tenant (ACTIVE membership in an ACTIVE
    tenant; preferred → first-by-`createdAt`; otherwise **absent** for a
    platform-only identity). It is a **hint** — membership and tenant status are
    re-validated every request; the client can never assert access via the
    claim.
- **Refresh token:** opaque, stored server-side (`RefreshToken`), delivered as an
  HTTP-only, `SameSite=Strict`, path-scoped (`/api/v1/auth`) cookie.
  - **Rotation:** each refresh revokes the old token and issues a new one in the
    same family.
  - **Reuse detection:** presenting an already-revoked token revokes the entire
    family and forces re-login (`401 TOKEN_REVOKED`).
- **Session revocation:** `logout` (one session), `logout-all` and
  `change-password`/`password-reset` (all sessions).

## 6. Account status validation

Account status is enforced at two layers, each in the right place:

1. **Identity layer (login):**
   - **Lockout** — after 5 failed attempts the account is locked for 15 minutes
     (`failedLoginAttempts`, `lockedUntil`). A locked account returns `429` with
     `Retry-After`, checked **before** the password compare. Counters reset on
     successful login and on password reset.
   - **Timing-safe unknown-user path** — a valid dummy Argon2id hash is verified
     when the email is unknown, so response timing does not reveal account
     existence.
   - **Email verification** — `emailVerifiedAt` is recorded via the
     verify-email flow. Login does not currently _require_ verification (the
     seeded platform admin is pre-verified); this is an identity-layer policy
     choice, documented here for transparency.

2. **Platform layer (the gate):** platform access is governed by
   `PlatformMembership.status`. Disabling a **platform** operator is done by
   setting their membership to `SUSPENDED`/`REMOVED`, after which the gate denies
   every `/platform/*` call regardless of a still-valid access token (the gate
   re-checks membership per request; a short-lived access token also expires
   quickly).

> **Design note (honest scope):** there is **no dedicated `User.status` /
> `disabled` boolean**. Global account disabling today is expressed via lockout
> (identity) and, for platform operators, via `PlatformMembership.status`
> (platform). A first-class user-level "disabled/suspended" account state is a
> potential future enhancement; it was **not** invented in this phase to avoid
> unrequested schema changes. If added later, the login path and the platform
> gate are the two enforcement points.

## 7. Test coverage (existing)

- **Platform boundary** (`modules/platform/__tests__/platform.test.ts`):
  - no platform membership → `403 PLATFORM_ACCESS_DENIED`;
  - inactive (`SUSPENDED`) membership → `403`;
  - platform member missing the permission → `403`;
  - platform member with the permission → `200`;
  - higher-privilege action (archive) requires the stronger permission.
    Together these prove a tenant-only user is rejected and that role _name_ alone
    never grants platform access.
- **Core auth** (`modules/auth/__tests__/auth.test.ts`, 22 tests): login success,
  invalid credentials, account lockout (increment + lock + reset), refresh
  rotation, unknown/expired/revoked refresh tokens, refresh-family reuse
  revocation, logout, verify (valid/missing/tampered), mass-assignment defence.
- **Recovery** (`auth-recovery.test.ts`, 13 tests): change-password success/fail,
  logout-all, and the reset/verification flows.

## 8. Security properties (implemented)

- Passwords hashed with **Argon2id**; legacy **bcrypt** hashes still verify and
  are transparently upgraded on next login (`operations/verify-password.ts`,
  `hash-password.ts`).
- `HS256`-pinned JWT verification; `JWT_SECRET` length enforced at boot.
- Refresh cookie is HTTP-only + `SameSite=Strict` + path-scoped; CSRF
  defence-in-depth via the CSRF plugin for cookie-bearing state changes.
- Enumeration-safe recovery responses; per-email/per-IP rate limits on auth
  endpoints; global rate limiting via Redis.
- Uniform `403 PLATFORM_ACCESS_DENIED` prevents platform-structure probing.

## 9. Authentication is a general identity boundary

The `/auth/*` endpoints authenticate identity for **any** client
(`apps/super-admin/src/modules/auth/auth.api.ts` posts to the same login).
**Authentication is not authorization:** what differs _after_ login is that only
a user with an ACTIVE `PlatformMembership` and the required `platform.*`
permission can use `/platform/*`. The Super Admin frontend treats the backend as
authoritative — even an authenticated non-platform user is rejected on the first
`/platform/*` call.

> The tenant Admin frontend (`apps/admin`) that formerly also consumed these
> endpoints has been removed from this repository (see
> `docs/CONVERSION-INVENTORY.md`). Its removal does not change the authentication
> design: the endpoints remain a general identity boundary, and any future
> tenant client would authenticate identically while remaining subject to the
> same platform authorization gate.

---

## Gate

Phase 4 verifies and documents the implemented platform authentication boundary:
password login, logout/logout-all, refresh with rotation + reuse detection,
forgot/reset via OTP + single-use reset token, email verification, JWT/refresh
session lifecycle, and account-status enforcement — plus the permission-based
platform membership gate that keeps tenant-only users out. No new authentication
code, schema, migration, or database command was required; existing tests pass.
