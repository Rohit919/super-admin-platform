# Phase 20.1 — Tenant Data Model & Capability Audit

This is the **inspect-first** deliverable for Phase 20. It records what the
tenant data surface actually is today (DB → service → contract → API → UI),
classifies every requested capability, and calls out the migrations, storage,
product, and STOP decisions required before any code changes.

> Guiding rule (Phase 20 §33): **No manufactured depth.** Every editable value
> must have a complete path UI → Contract → API → Service → Persistence. Every
> displayed metric must have a trustworthy source or show "Not available".

This audit builds on the existing `docs/PHASE-19-TENANT-CONTROL-CENTER.md`
capability matrix, which already documented the Phase-19 gaps honestly. Phase 20
re-verifies that matrix against the current code and decides what can be closed.

---

## 1. Stack reality (correction to the phase brief)

The Phase 20 brief lists a target frontend stack (shadcn/Radix, React Hook Form,
Zod, i18next, recharts, sonner). **`apps/super-admin` does not use any of
these.** Verified against `apps/super-admin/package.json` and a repo-wide grep:

Actual dependencies: `@tanstack/react-query`, `zustand`, `react-router-dom`,
`lucide-react`, `clsx`, `tailwind-merge`, `@app/api-contracts`.

- UI primitives are hand-rolled in a **single file**:
  `apps/super-admin/src/components/ui.tsx` (Button, Input, Textarea, Select,
  Field, Card, Avatar, Badge, StatusBadge, DataTable/Th/Td, DropdownMenu, Tabs,
  Dialog, CopyButton, SummaryStat, MetadataGrid, Timeline, CapabilityGapNote).
- **No** file-upload component, **no** toast/sonner, **no** Drawer.
- Forms = controlled `useState` + `useMutation` + inline validation + an
  `ApiError.message` red banner (see `EditTenantDialog`).
- Contracts are **TypeBox** (`@sinclair/typebox`), not Zod. Package import name
  is `@app/api-contracts`.

**Consequence:** the Control Center must be extended using the existing
hand-rolled primitives and contract-first discipline. The reference project
(`_Reference/slash-admin-main`) is used **only** as a visual/information-hierarchy
benchmark — its Ant Design/axios/RHF/sonner/faker code is never copied.

---

## 2. Current tenant data model (authoritative)

`prisma/schema.prisma` — the `Tenant` model has **exactly**:

| Column      | Type                           | Notes                                              |
| ----------- | ------------------------------ | -------------------------------------------------- |
| `id`        | `String @id @default(cuid())`  | Immutable canonical id                             |
| `name`      | `String`                       | Human-facing display name (editable)               |
| `slug`      | `String @unique`               | Stable URL-safe identity — **immutable** by design |
| `status`    | `TenantStatus @default(TRIAL)` | TRIAL / ACTIVE / SUSPENDED / ARCHIVED              |
| `createdAt` | `DateTime`                     |                                                    |
| `updatedAt` | `DateTime`                     |                                                    |

Relations: `memberships`, `roles`, `userRoles`, `apiCredentials`, `tenantPlan`,
`entitlementOverrides`.

There are **no** columns for organization profile, contact, address, branding,
configuration, provisioning telemetry, or usage. Confirmed against the schema
and against every service that touches `Tenant`.

---

## 3. Capability matrix

Legend: ✓ present · ✗ absent · ➖ derivable from existing data

| Domain       | Field / Capability                      | DB  | Service | Contract | API | UI  | Classification                                                                |
| ------------ | --------------------------------------- | :-: | :-----: | :------: | :-: | :-: | ----------------------------------------------------------------------------- |
| Identity     | Tenant ID                               |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists — exposed**                                                      |
| Identity     | Name                                    |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists — editable**                                                     |
| Identity     | Slug                                    |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(8) Exists, read-only by design** (rename = product/security decision)      |
| Identity     | Status / Lifecycle                      |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists**                                                                |
| Identity     | Created / Updated                       |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists**                                                                |
| Organization | Legal name                              |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(4) Needs migration + product decision**                                    |
| Organization | Display / company name                  |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(4) Needs migration** (distinct from `name`? product decision)              |
| Organization | Website                                 |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(4) Needs migration**                                                       |
| Organization | Industry                                |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(4) Needs migration**                                                       |
| Organization | Description                             |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(4) Needs migration**                                                       |
| Organization | Registration / Tax id                   |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(7) Product decision — sensitive/legal**                                    |
| Config       | Time zone / Locale / Currency           |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(4) Needs migration** (typed fields, not a JSON blob)                       |
| Contact      | Primary contact (name/email/phone/role) | ✗*  |    ✗    |    ✗     |  ✗  |  ✗  | **(7) Product decision** — reference existing `User`/membership vs new fields |
| Address      | Registered/billing address              |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(4) Needs migration** (billing address only — NOT operational locations)    |
| Branding     | Logo / favicon / colors                 |  ✗  |    ✗    |   ✗**    |  ✗  |  ✗  | **(5) Needs file storage — STOP**                                             |
| Lifecycle    | State + transitions                     |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists**                                                                |
| Lifecycle    | State changed at/by, history            | ➖  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists — reconstructed from AuditLog**                                  |
| Provisioning | Simple state (create outcome)           | ➖  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists — single-transaction outcome**                                   |
| Provisioning | Multi-step telemetry / timestamps       |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(3/8) No async workflow — deferred, shown honestly**                        |
| Plan         | Current plan + assignment               |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists**                                                                |
| Entitlements | Plan + override, effective + source     |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists**                                                                |
| Credentials  | Create / rotate / revoke, health        |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists**                                                                |
| Credentials  | `lastUsedAt`                            |  ✓  |    ✗    |    ✓     |  ✓  |  ✓  | **(8) Field exists, never written** — no tenant-facing auth path; renders "—" |
| Integrations | Provider config / status                |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(8) No integration model — deferred**                                       |
| Usage        | API requests / storage / feature usage  |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(8) No metering — deferred, real-data rule**                                |
| Usage        | Members / users                         |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists — real counts**                                                  |
| Security     | Access + credential health (derived)    | ➖  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists — real subset**                                                  |
| Security     | Per-tenant auth events                  |  ✗  |    ✗    |    ✗     |  ✗  |  ✗  | **(8) No event store — deferred**                                             |
| Audit        | Activity history                        |  ✓  |    ✓    |    ✓     |  ✓  |  ✓  | **(1) Exists**                                                                |

\* No tenant-operational Contact model exists. A platform `User` + oldest ACTIVE
`TenantMembership` already yields a real "primary administrator" (shipped in
Phase 19). A dedicated _business contact_ would be new data.

\** `packages/api-contracts/src/branding.ts` (`AppBranding`) exists but is
**application-level white-label branding** resolved from `BRAND_*` env vars — it
is not tenant-scoped, has no `tenantId`, and its original consumer was removed.
It is not a tenant→branding relationship.

Classification codes reference the brief's §3 list (1 exists/exposable · 3 needs
backend · 4 needs migration · 5 needs file-storage · 7 product decision · 8 out
of scope for now).

---

## 4. What is already shipped (Phase 19) — do not rebuild

Identity, primary administrator, lifecycle + history (from audit), plan,
entitlements (effective + source), credentials (create/rotate/revoke + health),
real member counts, a derived security subset, and audit are all implemented
end-to-end and surfaced in the tabbed Control Center. The deep
`GET /platform/tenants/:id/overview` aggregate is real. Phase 20 should
**enhance** this, not duplicate it.

---

## 5. Storage analysis (branding / logo)

`docs/FILE_STORAGE.md` is a thorough 100-section design guide, but there is
**no implementation**: no `ObjectStorage` interface, no S3/local adapter, no
`File` model, and `.env.example` contains **no** storage/bucket/S3 variables.
The only "branding" route is a public `GET /api/v1/branding` that echoes
`BRAND_*` env vars.

**Conclusion:** tenant logo/favicon upload cannot reuse an existing storage
abstraction because none exists. Implementing it means introducing a new storage
provider + `File` model + upload/scan/signed-URL lifecycle — a **STOP condition**
(brief §32, §39). Deferred pending explicit approval of a storage architecture.

---

## 6. API & contract analysis

- Contracts are the source of truth (`packages/api-contracts`), consumed by both
  the Fastify API and the Super Admin client. Platform endpoints use the legacy
  `{ success, data }` envelope; new tenant endpoints should match their
  neighbors for consistency.
- Update surface is deliberately narrow: `UpdateTenantBody = { name }` only.
  Extending organization profile means a new `PATCH .../organization` contract +
  route + service method + DTO fields, mapped to a new
  `platform.tenant.update`-scoped permission (reuse existing key).
- The `PlatformTenantOverviewDto` already aggregates real data; organization
  fields would extend a new detail/organization DTO, not the lean list DTO.

---

## 7. RBAC analysis

The permission registry (`packages/api-contracts/src/rbac.ts`) already defines
`platform.tenant.view` and `platform.tenant.update`. Organization-profile
read/write map cleanly onto these existing keys — **no new permission is
required** for an organization profile. Branding, integrations, and usage would
each need new keys, but they are deferred (see STOP conditions).

---

## 8. Migration requirements

Adding an organization profile (legal name, website, industry, description,
time zone, locale, and optionally billing-address + business-contact fields)
requires **new nullable columns on `tenants`** — i.e. a Prisma migration.

Per brief §31, "no migration should be created solely because the UI wants a
field," and a DB migration "requires explicit approval if the project workflow
requires migration approval." The repo has a formal `docs/MIGRATIONS.md` workflow
and CI, so this is treated as **requiring approval** → STOP.

All proposed columns are **nullable/back-compatible** (no data backfill, no
breaking change, no second database).

---

## 9. Recommended, minimal, real plan (pending approval)

The single gap that can be closed cleanly, with a full real UI→persistence path
and no fake data, is the **Organization Profile** (plus optional billing address
and business contact). Recommended nullable columns on `Tenant`:

```prisma
legalName    String?   // registered legal company name
website      String?   // https URL, validated
industry     String?   // free-text or constrained list (product decision)
description  String?   // short org description (maxLength ~500)
timeZone     String?   // IANA tz (e.g. "Africa/Lagos")
locale       String?   // BCP-47 (e.g. "en-US")
// Optional billing/registered address (NOT operational/warehouse address):
addressLine1 String?
addressLine2 String?
city         String?
region       String?   // state / province
postalCode   String?
country      String?   // ISO-3166 alpha-2
// Optional business contact (distinct from platform admin identity):
contactName  String?
contactEmail String?   // validated email
contactPhone String?
```

This would ship as:
`Prisma migration → PlatformService.getTenantOrganization/updateTenantOrganization
(audited TENANT_UPDATED / new TENANT_ORGANIZATION_UPDATED) → contract DTOs +
PATCH .../organization → platformApi methods → an "Organization" tab in the
Control Center (2-column layout adapted from the reference) → tests`.

Currency is intentionally omitted (billing is out of scope). Tax/registration ids
are omitted pending a product decision (sensitive/legal per brief §7).

---

## 10. STOP conditions — approval required before Phase 20.2+

Per brief §39, the following require explicit approval and must not be solved
with temporary/fake implementations:

1. **Database migration** for the organization-profile columns (§8). Approve the
   migration and confirm the field set in §9.
2. **Logo / favicon / branding upload** — requires a new file-storage provider +
   `File` model (no storage backend exists). Recommend **deferring** until a
   storage architecture is approved (§5, brief §32).
3. **Usage metrics, integrations, per-tenant security events, provisioning
   telemetry** — no trustworthy data source exists. Keep surfacing them honestly
   ("Not available" / `CapabilityGapNote`); do **not** fabricate (brief §33).
4. **Tax/registration identifiers, custom domain, billing/currency** — product
   decisions, explicitly out of scope unless approved (brief §7, §9, §40).

## 10a. Phase 20.2 — Organization Profile (SHIPPED)

Approved and implemented end-to-end (real UI → contract → API → service →
persistence). No fake data; no storage/logistics/billing scope introduced.

- **DB:** migration `20260912000000_add_tenant_organization_profile` adds 15
  nullable columns to `tenants` (legalName, website, industry, description,
  timeZone, locale, addressLine1/2, city, region, postalCode, country,
  contactName, contactEmail, contactPhone). Additive, back-compatible, no backfill.
- **Contracts:** `TenantOrganizationDto`, `TenantOrganizationResponse`,
  `UpdateTenantOrganizationBody` (partial, bounded); endpoints
  `GET`/`PATCH /platform/tenants/:id/organization`; Level-2 contracts
  `TENANT_ORGANIZATION_GET` (platform.tenant.view) / `TENANT_ORGANIZATION_UPDATE`
  (platform.tenant.update). No new permission keys needed.
- **API/Service:** `PlatformService.getTenantOrganization` /
  `updateTenantOrganization` — partial update (only provided keys; empty string
  clears to NULL), server-side format validation for website (http[s]),
  contactEmail, and country (ISO alpha-2), audited as
  `TENANT_ORGANIZATION_UPDATED` recording changed field NAMES only.
- **UI:** an "Organization" tab in the Control Center — read-only `MetadataGrid`
  view + an edit form (Organization / Registered address / Business contact
  sections), dirty-state tracking, client-side validation mirror, partial-update
  submit. Editing gated on `platform.tenant.update`; the tab is visible to any
  operator with `platform.tenant.view`.
- **Tests:** 9 backend route tests (read/404/permission/update/clear/validation)
  - 4 frontend tests (render/edit/permission-hide/invalid-website).

Remaining STOP items (§10) are unchanged and deferred: logo/branding (no
storage), usage/integrations/security-events (no data source, kept honest),
tax/registration id + currency + custom domain (product decisions).

## 11. Boundary confirmation

- No Logistics operational data (shipments/orders/drivers/etc.) is introduced.
- No direct Logistics DB access.
- No fake tenant data.
- No migration, storage, or production change performed in this audit phase.
