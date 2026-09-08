# Platform Audit

**Phase 10 — Platform Audit** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §15).

Platform (Super Admin) actions now emit immutable audit events, and there is a
permission-gated read endpoint to view them. This phase wired emission into the
existing `AuditService` / `AuditLog` and added a small additive field; it did
**not** change the database schema (the `AuditLog.tenantId` column already
existed) and ran no database commands.

---

## 1. Audited actions

| Action constant             | Emitted when                      | targetType              |
| --------------------------- | --------------------------------- | ----------------------- |
| `TENANT_PROVISIONED`        | `POST /platform/tenants` succeeds | `TENANT`                |
| `TENANT_SUSPENDED`          | status → `SUSPENDED`              | `TENANT`                |
| `TENANT_ACTIVATED`          | status → `ACTIVE` (reactivate)    | `TENANT`                |
| `TENANT_ARCHIVED`           | status → `ARCHIVED`               | `TENANT`                |
| `TENANT_CREDENTIAL_CREATED` | credential created                | `TENANT_API_CREDENTIAL` |
| `TENANT_CREDENTIAL_ROTATED` | credential rotated                | `TENANT_API_CREDENTIAL` |
| `TENANT_CREDENTIAL_REVOKED` | credential revoked                | `TENANT_API_CREDENTIAL` |

These cover the plan's §15 list applicable to what exists today: tenant
creation/suspension/activation/archival and credential create/rotate/revoke.
Authentication events and platform user/role/permission changes are covered by
the pre-existing auth/RBAC audit actions (`AuditActions`); support/impersonation
actions are not implemented and are therefore not audited.

## 2. Audit entry shape

Written via `AuditService.record(entry, tx?)` into `AuditLog`:

| Field                          | Source                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| `action`                       | one of the constants above                                   |
| `tenantId`                     | the affected tenant (platform events are tenant-scoped here) |
| `actorId`                      | the authenticated platform user (`request.user.id`)          |
| `targetType` / `targetId`      | `TENANT`/tenantId or `TENANT_API_CREDENTIAL`/credentialId    |
| `metadata`                     | small JSON context (see §4) — **never secrets**              |
| `requestId`, `ip`, `userAgent` | request context via `AuditService.contextFrom(request)`      |
| `createdAt`                    | now                                                          |

Request context is captured in the route (`AuditService.contextFrom(request)`)
and threaded into the service as an `AuditContext`, so services stay free of
Fastify types.

### 2.1 Additive change to the audit layer

`AuditEntry` gained an **optional** `tenantId` field, and `AuditService.record`
now writes it to the existing `AuditLog.tenantId` column. This is additive:
existing callers that don't set it are unchanged, and **no schema/migration
change was needed** (the column already existed).

## 3. No secrets in audit metadata (guarantee)

- Credential events record `{ publicKey, … }` only. The plaintext secret and its
  hash are **never** placed in metadata (enforced by the private
  `CredentialService.auditCredential` helper, which only ever receives the
  `publicKey`). A test asserts the created secret and the string `hash` are
  absent from the recorded metadata.
- Tenant events record `{ from, to }` (status change) or
  `{ slug, name, adminEmail }` (provisioning). The provisioning admin
  **password is never** included.

## 4. Metadata by action

| Action                                                      | metadata                               |
| ----------------------------------------------------------- | -------------------------------------- |
| `TENANT_PROVISIONED`                                        | `{ slug, name, adminEmail }`           |
| `TENANT_SUSPENDED` / `TENANT_ACTIVATED` / `TENANT_ARCHIVED` | `{ from, to }` (previous → new status) |
| `TENANT_CREDENTIAL_CREATED` / `_REVOKED`                    | `{ publicKey }`                        |
| `TENANT_CREDENTIAL_ROTATED`                                 | `{ publicKey, rotatedFromId }`         |

## 5. Read endpoint

```text
GET /api/v1/platform/audit        permission: platform.audit.view
```

- Returns platform audit events newest-first (`PlatformAuditLogDto[]`).
- Optional query filters: `?tenantId=`, `?action=`, `?limit=` (1–200, default 100).
- Gated by the platform membership + `platform.audit.view` permission; a caller
  without it gets `403 PLATFORM_ACCESS_DENIED`.
- The DTO exposes `action, tenantId, actorId, targetType, targetId, metadata,
requestId, createdAt`. Since metadata never contains secrets (§3), the read
  path cannot leak them.

## 6. Transactional behaviour (honest note)

`AuditService.record` supports an optional Prisma transaction client so an audit
row can be written **in the same transaction** as the change it describes.

In this phase, the platform mutations emit their audit event **after** the
mutation, **not** inside the mutation's transaction:

- tenant status change: `tenant.update(...)` then `audit.record(...)`;
- provisioning: the provisioning `$transaction` commits, then `audit.record(...)`;
- credential create/rotate/revoke: the write completes, then `audit.record(...)`.

Implication: in the rare event the audit write fails after the mutation
commits, the change would be applied without an audit row (logged as an error,
but not rolled back). This matches the existing repository pattern for
post-mutation auditing and keeps the change minimal. Making platform auditing
fully atomic (passing `tx` into `record` within each mutation's transaction) is a
straightforward, isolated follow-up if strict atomicity is required; it needs no
schema change.

## 7. Tests

`modules/platform/__tests__/audit.test.ts`:

- suspend emits `TENANT_SUSPENDED` with the right `tenantId`/`targetType`/`actorId`;
- credential creation emits `TENANT_CREDENTIAL_CREATED` whose metadata contains
  the `publicKey` but **not** the secret or its hash;
- `GET /platform/audit` → `403` without `platform.audit.view`, `200` (list) with it.

The existing platform + credential suites continue to pass with audit emission
enabled (the mock `auditLog.create` default absorbs the write).

## 8. Not in scope

- **Atomic (in-transaction) auditing** — see §6 (optional follow-up).
- **Support/impersonation auditing** — no such feature exists yet.
- **A Super Admin audit UI** — backend read endpoint only; frontend is a later phase.

---

## Gate

Phase 10 emits immutable platform audit events for tenant lifecycle,
provisioning, and credential create/rotate/revoke, with a permission-gated
`GET /platform/audit` read endpoint. Metadata never contains secrets (verified by
test). The only data-layer change was writing the already-existing
`AuditLog.tenantId` column via an additive optional field — no schema change, no
migration, no database command. Post-mutation (non-transactional) auditing is
documented honestly as the current behavior with an isolated follow-up noted.
