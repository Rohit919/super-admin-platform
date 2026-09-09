# Tenant Lifecycle

**Phase 7 — Tenant Lifecycle** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §12).

The Platform API owns the tenant lifecycle. This documents the lifecycle states,
the **explicit, validated** status-transition matrix now enforced by
`platform-api`, the endpoints, and the guarantees that follow. Phase 7 added the
transition enforcement (small, real implementation); it did **not** change the
Prisma schema, run migrations, or touch the database.

---

## 1. States

`TenantStatus` (Prisma enum, unchanged):

| State       | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| `TRIAL`     | Newly created / evaluation; not yet a paying/active tenant. |
| `ACTIVE`    | Fully operational tenant.                                   |
| `SUSPENDED` | Temporarily disabled (e.g. billing/policy). Reversible.     |
| `ARCHIVED`  | Permanently retired. **Terminal.**                          |

## 2. Transition matrix (enforced)

Defined and enforced in `modules/platform/platform.service.ts`
(`TENANT_STATUS_TRANSITIONS`, `isValidTenantStatusTransition`):

```text
TRIAL      → ACTIVE | SUSPENDED | ARCHIVED
ACTIVE     → SUSPENDED | ARCHIVED
SUSPENDED  → ACTIVE | ARCHIVED
ARCHIVED   → (none — terminal)
```

Rules:

- **Illegal transitions are rejected** with `409 CONFLICT` (e.g. any change out
  of `ARCHIVED`).
- **Same-status no-ops are rejected** with `409 CONFLICT` (e.g. `ACTIVE →
ACTIVE`), so every accepted change is a real, auditable state change.
- **`ARCHIVED` is terminal** — an archived tenant can never be reactivated, so it
  can never be silently treated as active (plan §12).

This server-side matrix is the source of truth. It is consistent with the Super
Admin UI's action set (`apps/super-admin/src/pages/tenants-page.tsx`): TRIAL →
Activate/Suspend, ACTIVE → Suspend/Archive, SUSPENDED → Reactivate/Archive,
ARCHIVED → no actions. The UI hides disallowed actions for UX; the API enforces
them as the security/consistency boundary.

## 3. Endpoints

All under `/api/v1/platform/*`, each gated by authenticate + a `platform.*`
permission (see `docs/PLATFORM-API.md`).

| Operation                          | Method / Path                        | Permission                | Notes                                                                                                                                                               |
| ---------------------------------- | ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create** (provision)             | `POST /platform/tenants`             | `platform.tenant.create`  | New tenant is created `ACTIVE` with an admin user + membership + default tenant role, in one transaction (see `docs/TENANT-PROVISIONING.md`).                       |
| **List**                           | `GET /platform/tenants`              | `platform.tenant.view`    | Optional `?status=` filter, `?q=` name/slug search (case-insensitive), and `?page=`/`?pageSize=` offset pagination. Returns `{ data, meta }` with `OffsetPageMeta`. |
| **Get**                            | `GET /platform/tenants/:id`          | `platform.tenant.view`    | 404 if unknown.                                                                                                                                                     |
| **Update** (metadata)              | `PATCH /platform/tenants/:id`        | `platform.tenant.update`  | Body `{ name }`. Edits platform-level metadata (display name). The `slug` is stable external identity and is **not** editable. Audited as `TENANT_UPDATED`.         |
| **Suspend / Reactivate / Archive** | `PATCH /platform/tenants/:id/status` | `platform.tenant.suspend` | Body `{ status }`. Transition validated (§2). Archiving additionally requires `platform.tenant.archive` (checked inline in the route).                              |

Mapped to the plan's lifecycle verbs:

- **Create** → `POST /platform/tenants`
- **List** → `GET /platform/tenants` (paginated; optional `status`/`q`)
- **Get** → `GET /platform/tenants/:id`
- **Update** → `PATCH /platform/tenants/:id { "name": "…" }`
- **Suspend** → `PATCH …/status { "status": "SUSPENDED" }`
- **Reactivate** → `PATCH …/status { "status": "ACTIVE" }` (from `SUSPENDED`)
- **Archive** → `PATCH …/status { "status": "ARCHIVED" }` (needs archive permission)

## 4. Validation behaviour

`PlatformService.setTenantStatus(id, status)`:

1. Loads the tenant (`id`, current `status`); `404 NOT_FOUND` if missing.
2. Rejects a same-status no-op → `409 CONFLICT` (`"Tenant is already X."`).
3. Rejects an illegal transition → `409 CONFLICT`
   (`"Invalid tenant status transition: FROM → TO."`, details `{ from, to }`).
4. Otherwise updates the status and returns the refreshed tenant DTO.

Authorization (which actor may suspend vs archive) is enforced in the route
guard, separately from this state-machine validation.

## 5. Guarantees (plan §12)

- **Tenant status is explicit and validated** — no direct, unchecked status
  writes; every change passes the matrix.
- **Suspended/archived tenants are not treated as active** — enforced here at the
  lifecycle layer, and independently at the access layer: `TenantService`
  refuses access for `SUSPENDED`/`ARCHIVED` tenants (see
  `docs/super-admin/MULTI-TENANT-ARCHITECTURE.md`), so a non-active tenant cannot
  be used even with a valid token.
- **Archive is irreversible** — terminal state, no path back.

## 6. Metadata update (`platform.tenant.update`)

`PATCH /platform/tenants/:id` edits platform-level tenant metadata via
`PlatformService.updateTenant(id, { name })`:

1. Loads the tenant (`id`, current `name`); `404 NOT_FOUND` if missing.
2. Trims and updates the `name`.
3. Records a `TENANT_UPDATED` audit event with `{ from: { name }, to: { name } }`
   (no secrets).

The `slug` is intentionally immutable here — it is the tenant's stable,
externally-referenced identity (MULTI-TENANT-ARCHITECTURE §133); renaming it
would break existing references. Lifecycle `status` has its own dedicated
endpoint (§3) and is not changed through this route.

Broader organization metadata (legal name, website, industry, description, time
zone, locale, registered/billing address, business contact) is managed through a
separate, sibling endpoint — `GET`/`PATCH /platform/tenants/:id/organization`
(also gated by `platform.tenant.update`) — added in Phase 20 and documented in
`docs/PHASE-20-TENANT-DATA-MODEL-AUDIT.md`. That surface is a partial update and
is audited as `TENANT_ORGANIZATION_UPDATED`. Identity fields (id/slug/name) are
never editable through it.

## 7. Not yet implemented (honest scope)

- **Slug rename** — deliberately unsupported; the slug is stable identity.
- **Hard delete** — archive is the terminal lifecycle state; there is no
  destructive tenant delete.

## 8. Tests

`modules/platform/__tests__/platform.test.ts` covers:

- suspend `ACTIVE → SUSPENDED` (200);
- archive requires `platform.tenant.archive` (403 without it; 200 with it);
- reactivate `SUSPENDED → ACTIVE` (200);
- **any transition out of `ARCHIVED` → 409** (terminal);
- **same-status no-op → 409**;
- **metadata update** — name change (200) audited `TENANT_UPDATED`, `403`
  without `platform.tenant.update`, `404` for an unknown tenant;
- **list pagination + search** — `{ data, meta }` envelope, `q` name/slug
  filter, and `page`/`pageSize` → `skip`/`take`.

---

## Gate

The tenant lifecycle is explicit and validated: an enforced transition matrix
(`TRIAL/ACTIVE/SUSPENDED` interconnected, `ARCHIVED` terminal), `409 CONFLICT` on
illegal or no-op transitions, and the archive privilege check retained.
Create/List/Get/Update/status endpoints are confirmed; list supports
pagination + name/slug search; metadata update (name) is implemented and
audited. Lifecycle and update mutations emit audit events. No schema, migration,
or database command changes were made; tests pass.
