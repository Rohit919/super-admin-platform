# 📚 Documentation — Gym Platform API

Reference documentation for the centralized backend API of the Gym SaaS
Platform.

## Start Here

- **[GETTING_STARTED.md](./GETTING_STARTED.md)** — setup, first run, common commands
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — the Golden Orchestrator pattern
- **[MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md)** — multi-tenant model & isolation
- **[GYM_PLATFORM_MIGRATION_PLAN.md](./GYM_PLATFORM_MIGRATION_PLAN.md)** — the migration plan of record

---

## Canonical architecture docs

The gym-platform target documentation set:

- [MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md) — tenant model, isolation, enforcement
- [TENANT_DATA_MODEL.md](./TENANT_DATA_MODEL.md) — database architecture & tenant-owned data
- [RBAC.md](./RBAC.md) — roles, permissions, authorization model
- [AUTHENTICATION_IMPLEMENTATION.md](./AUTHENTICATION_IMPLEMENTATION.md) — auth flows, tokens, sessions
- [TENANT_BRANDING.md](./TENANT_BRANDING.md) — per-tenant branding
- [WHITE_LABEL_ARCHITECTURE.md](./WHITE_LABEL_ARCHITECTURE.md) — white-label / mobile architecture

> The detailed, code-referenced multi-tenant spec (cited by `§` numbers in
> source comments) lives at
> [super-admin/MULTI-TENANT-ARCHITECTURE.md](./super-admin/MULTI-TENANT-ARCHITECTURE.md).

---

## Topic Guides

### Platform & multi-tenancy

- [MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md), [TENANT_DATA_MODEL.md](./TENANT_DATA_MODEL.md)
- [PLATFORM-PLANS-ENTITLEMENTS.md](./PLATFORM-PLANS-ENTITLEMENTS.md) — platform feature-gating (non-commercial, separate from gym membership/payment)

### Auth & security

- [AUTHENTICATION.md](./AUTHENTICATION.md), [AUTHENTICATION_IMPLEMENTATION.md](./AUTHENTICATION_IMPLEMENTATION.md)
- [RBAC.md](./RBAC.md)
- [SECURITY.md](./SECURITY.md), [AUDIT_LOGGING.md](./AUDIT_LOGGING.md), [RATE_LIMITING.md](./RATE_LIMITING.md)

### API surface

- [API_ENDPOINTS.md](./API_ENDPOINTS.md), [API_CONTRACTS.md](./API_CONTRACTS.md), [API_VERSIONING.md](./API_VERSIONING.md)

### Branding & white-label

- [TENANT_BRANDING.md](./TENANT_BRANDING.md), [WHITE_LABEL_ARCHITECTURE.md](./WHITE_LABEL_ARCHITECTURE.md)

### Data & operations

- [DATABASE.md](./DATABASE.md), [MIGRATIONS.md](./MIGRATIONS.md)
- [BACKGROUND_JOBS.md](./BACKGROUND_JOBS.md), [QUEUE_ARCHITECTURE.md](./QUEUE_ARCHITECTURE.md), [CACHING.md](./CACHING.md)
- [OBSERVABILITY.md](./OBSERVABILITY.md), [PERFORMANCE.md](./PERFORMANCE.md), [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)
- [runbooks/](./runbooks/) — operational runbooks

### Delivery

- [DEPLOYMENT.md](./DEPLOYMENT.md), [CI_CD.md](./CI_CD.md), [DEVELOPMENT.md](./DEVELOPMENT.md), [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## Need the Main README?

→ **[../README.md](../README.md)**
