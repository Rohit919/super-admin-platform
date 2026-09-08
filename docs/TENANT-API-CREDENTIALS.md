# Tenant API Credentials

**Phase 9 — Tenant API Credentials** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §9/§14).

Platform-managed API credentials issued to a tenant, owned entirely by the
**platform control plane**. This is a net-new build. It adds a Prisma model, a
hand-authored migration (**not executed** — see §8), permissions, contracts, a
service, and routes.

```text
Super Admin → Platform API → Tenant API Credentials → Platform DB
```

No logistics DB/API access, no tenant operational credentials, no
shipment/order/etc. functionality, and no frontend secret persistence are
introduced (all explicitly out of scope).

---

## 1. Data model

`TenantApiCredential` (`prisma/schema.prisma`), owned by the platform DB:

| Field           | Type               | Notes                                                              |
| --------------- | ------------------ | ------------------------------------------------------------------ |
| `id`            | `String` cuid      | PK                                                                 |
| `tenantId`      | `String`           | FK → `Tenant` (`onDelete: Cascade`)                                |
| `name`          | `String?`          | Optional label (e.g. "CI integration"). Not secret.                |
| `publicKey`     | `String @unique`   | Public identifier (`pk_…`). **Not secret** — safe to list/show.    |
| `secretKeyHash` | `String`           | **SHA-256 hash** of the secret. The secret itself is never stored. |
| `status`        | `CredentialStatus` | `ACTIVE` \| `REVOKED` (default `ACTIVE`).                          |
| `lastUsedAt`    | `DateTime?`        | Reserved for future usage tracking.                                |
| `expiresAt`     | `DateTime?`        | Optional expiry.                                                   |
| `createdAt`     | `DateTime`         | Default now.                                                       |
| `revokedAt`     | `DateTime?`        | Set on revoke/rotate (auditable).                                  |

Indexes: `tenantId`, `(tenantId, status)`, `publicKey`; unique on `publicKey`.
Enum `CredentialStatus { ACTIVE, REVOKED }`.

## 2. Secret handling (the core security property)

- The plaintext **secret** (`sk_…`) is generated with a CSPRNG
  (`crypto.randomBytes(32)`), 256 bits of entropy.
- Only its **one-way SHA-256 hash** is persisted (`secretKeyHash`). A KDF like
  Argon2 is unnecessary for a high-entropy random secret; SHA-256 is the standard
  choice here.
- The plaintext secret is returned **exactly once** — in the create (`201`) and
  rotate (`200`) responses (`CreatedTenantApiCredentialResponse.data.secretKey`).
- It is **never**: stored in plaintext, returned by list/get, written to logs, or
  put in audit metadata. The safe DTO (`TenantApiCredentialDto`) structurally has
  no secret field; the service's `toDto` cannot leak it.
- `publicKey` is not secret and is safe to display.

## 3. Endpoints

Base: `/api/v1/platform/tenants/:tenantId/credentials`. Each route runs
`authenticate` + `requirePlatformPermission(...)` (same platform gate as the
rest of `/platform/*`).

| Method | Path                                 | Permission                   | Success | Notes                                                                             |
| ------ | ------------------------------------ | ---------------------------- | ------- | --------------------------------------------------------------------------------- |
| GET    | `…/credentials`                      | `platform.credential.read`   | 200     | List; **never** includes secrets.                                                 |
| POST   | `…/credentials`                      | `platform.credential.create` | 201     | Creates a credential; returns the secret **once**. Body: `{ name?, expiresAt? }`. |
| POST   | `…/credentials/:credentialId/rotate` | `platform.credential.rotate` | 200     | Revokes the old credential and issues a new one; returns the new secret **once**. |
| POST   | `…/credentials/:credentialId/revoke` | `platform.credential.revoke` | 200     | Revokes the credential (auditable). No secret in response.                        |

Errors: `401 UNAUTHORIZED`, `403 PLATFORM_ACCESS_DENIED`, `404 NOT_FOUND`
(unknown tenant/credential, incl. cross-tenant reference — reported as not-found,
no enumeration), `400 VALIDATION_ERROR`, `409 CONFLICT` (rotate/revoke an
already-revoked credential).

## 4. Permissions

Added to the shared registry (`packages/api-contracts/src/rbac.ts`) using the
existing **singular** `platform.<resource>.<action>` convention:

```text
platform.credential.read
platform.credential.create
platform.credential.rotate
platform.credential.revoke
```

They are part of `PLATFORM_PERMISSION_KEYS` automatically (prefix `platform.`)
and are granted to `SUPER_ADMIN` via the seed's `ALL_PERMISSION_KEYS`; human
descriptions were added to the seed's `PERMISSION_DESCRIPTIONS`.

## 5. Rotation & revocation semantics

- **Rotate** (`CredentialService.rotate`) runs in a transaction: mark the current
  credential `REVOKED` (`revokedAt = now`) **and** create a fresh `ACTIVE`
  credential (carrying over `name`/`expiresAt`) with a new key pair. Rotating an
  already-`REVOKED` credential → `409 CONFLICT`.
- **Revoke** (`CredentialService.revoke`) sets `status = REVOKED`,
  `revokedAt = now`. Revoking an already-revoked credential → `409 CONFLICT`
  (safe, explicit; not a silent no-op).
- Both actions are **auditable** via `revokedAt`/`status`. (Emitting platform
  `AuditLog` events for credential actions is wired in **Phase 10**; the model
  changes here already make the actions auditable at the data level.)

## 6. Ownership & boundary

- All reads/writes go through the **raw Prisma client** against the single
  platform DB (`CredentialService`) — the authorized cross-tenant surface, never
  silently tenant-filtered.
- Cross-tenant access is denied: fetching a credential whose `tenantId` doesn't
  match the path tenant returns `404` (no enumeration).
- No logistics DB/API, no external service calls, no tenant operational
  credentials — strictly platform-owned metadata about tenant API access.

## 7. Tests

`modules/platform/__tests__/credentials.test.ts` (mock Prisma, no DB):

- authorization gate — non-platform user `403`; platform member missing
  `platform.credential.read` `403`;
- **list never exposes a secret** (asserts no `secretKey`/`secretKeyHash`, and
  the stored hash string is absent from the response body);
- **create returns the plaintext secret once** and the stored `secretKeyHash`
  is not the plaintext;
- **rotate** issues a new secret and revokes the previous credential;
- rotate on a revoked credential → `409`;
- **revoke** succeeds and returns no secret; double-revoke → `409`.

## 8. Migration status — PENDING (not applied)

Per the Phase 9 decision, the schema change is accompanied by a **hand-authored**
migration that is **intentionally not executed**:

```text
prisma/migrations/20260909000000_add_tenant_api_credentials/migration.sql
```

What was and was NOT done:

- ✅ `prisma/schema.prisma` updated (model + enum + relation).
- ✅ Migration SQL authored by hand in Prisma's format (creates the
  `credential_status` enum, `tenant_api_credentials` table, indexes, and FK).
- ✅ `prisma generate` run — **codegen only**, so `@prisma/client` includes
  `tenantApiCredential`; this does **not** touch any database.
- ❌ **Not run:** `prisma migrate dev`, `prisma migrate deploy`, `prisma db push`,
  `prisma migrate reset`, `prisma db seed`, or any database connection.

**To apply later** (deliberately, never automatically): verify `DATABASE_URL`
points at the Platform DB, then run `prisma migrate deploy` (which will apply the
pending `20260909000000_add_tenant_api_credentials` migration). Until applied,
the table does not exist in any live database — the code type-checks, builds, and
passes its mock-based tests, but the endpoints will fail at runtime against a DB
that has not had the migration applied.

## 9. Not in scope (deliberately)

- Emitting platform audit events for credential actions → **Phase 10**.
- Any Super Admin **frontend** for credentials (and, per the security rules, the
  frontend must never persist secrets in `localStorage`/`sessionStorage`; the
  secret is display-once only) → frontend phase.
- Actually using these credentials to authenticate a tenant API caller (a
  verification/consumption path) → not part of issuance.

---

## Gate

Phase 9 delivers platform-owned tenant API credentials: a secure model
(SHA-256-hashed secrets, display-once plaintext), permission-gated CRUD
(list/create/rotate/revoke) under `/platform/tenants/:tenantId/credentials`,
strict platform ownership with no logistics coupling, and tests proving secrets
are exposed only at create/rotate and never leaked by list. The Prisma schema and
a hand-authored migration are in place; the migration is **pending application**
and was not executed, and no database command was run.
