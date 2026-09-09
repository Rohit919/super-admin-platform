# Super Admin Platform — Documentation Index

The platform (Super Admin) documentation set, produced during the conversion.
Start with **Architecture**, then dive into a domain. Each doc describes the
**implemented** system and flags any divergence from the master plan.

## Start here

- [PLATFORM-ARCHITECTURE.md](./PLATFORM-ARCHITECTURE.md) — top-level architecture; links everything.
- [SUPER-ADMIN-PLATFORM-CONVERSION-PLAN.md](./SUPER-ADMIN-PLATFORM-CONVERSION-PLAN.md) — the master conversion plan.

## Conversion & structure

- [CONVERSION-INVENTORY.md](./CONVERSION-INVENTORY.md) — component classification (Phase 0) + status updates.
- [TARGET-STRUCTURE.md](./TARGET-STRUCTURE.md) — monorepo layout, `apps/api → apps/platform-api` rename.

## Data & domains

- [PLATFORM-DATABASE.md](./PLATFORM-DATABASE.md) — DB ownership, full model inventory, single-DB rationale, future split.
- [PLATFORM-AUTHENTICATION.md](./PLATFORM-AUTHENTICATION.md) — login/refresh/logout/OTP, token lifecycle, account status.
- [SUPER-ADMIN-PLATFORM-RBAC.md](./SUPER-ADMIN-PLATFORM-RBAC.md) — permission-based platform RBAC, guards, no-role-name rule.
- [PLATFORM-API.md](./PLATFORM-API.md) — `/api/v1/platform/*` surface, per-endpoint contract, no tenant fallback.
- [TENANT-LIFECYCLE.md](./TENANT-LIFECYCLE.md) — status state machine (validated transitions, ARCHIVED terminal).
- [TENANT-PROVISIONING.md](./TENANT-PROVISIONING.md) — transactional provisioning, invitation-vs-password analysis.
- [TENANT-API-CREDENTIALS.md](./TENANT-API-CREDENTIALS.md) — SHA-256 hashed, show-once secret, rotate/revoke.
- [PLATFORM-AUDIT.md](./PLATFORM-AUDIT.md) — audited actions, no secrets in metadata, read endpoint.

## Boundary, security, ops

- [PLATFORM-LOGISTICS-INTEGRATION.md](./PLATFORM-LOGISTICS-INTEGRATION.md) — none today; future boundary contract.
- [PLATFORM-SECURITY.md](./PLATFORM-SECURITY.md) — frontend is not the boundary; no browser secret storage.
- [PLATFORM-DEPLOYMENT.md](./PLATFORM-DEPLOYMENT.md) — environment separation + independent build/deploy.
- [PLATFORM-TESTING.md](./PLATFORM-TESTING.md) — §21 coverage map + honest gaps.

## Status snapshot

- Repo: platform-only monorepo — `apps/platform-api` + `apps/super-admin` + `packages/api-contracts`.
- Tests: platform-api suite (Vitest, mock Prisma) + Super Admin frontend suite (Vitest + RTL). See PLATFORM-TESTING.
- **Migrations:** applied — DB schema is up to date. Legacy role-matrix authz removed.
- **Super Admin scope (Phase 20.2):** the Super Admin panel is the SaaS platform control plane — tenant lifecycle, provisioning, organization, plans, entitlements, credentials, platform users, audit, and platform authorization enforcement. Platform **Roles/Permissions administration UI** is intentionally out of scope (RBAC enforcement stays active). Platform **Settings UI** is deferred until a real settings domain exists. Tenant operational RBAC and logistics operations belong to the Tenant platform, not Super Admin.

> Note: some older, source-inherited docs (ARCHITECTURE.md, DATABASE.md, RBAC*.md,
> etc.) predate the conversion and may reference the original starter naming.
> The `PLATFORM-*` / `TENANT-*` / `SUPER-ADMIN-PLATFORM-*` docs above are the
> authoritative set for the Super Admin Platform.
