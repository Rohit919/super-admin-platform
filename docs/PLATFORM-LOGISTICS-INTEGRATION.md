# Platform ↔ Logistics API Integration

**Phase 11 — Platform → Logistics API Integration** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §16).

> **Status: NOT IMPLEMENTED — documentation only.**
> This repository contains **no separate Logistics Platform** and no logistics
> database or service to integrate with. Per the guardrails, **no fake
> Platform → Logistics boundary was introduced** and no stub/client was built.
> This document records the current reality, the isolation verified in code, and
> the contract a real integration would have to satisfy if one is added later.

---

## 1. Current reality

The Super Admin Platform is a self-contained control plane over a single
PostgreSQL database (`docs/PLATFORM-DATABASE.md`). There is **no** logistics
service, **no** logistics database, and **no** outbound integration from
`platform-api` to any external system. The plan's §16 topology
(`platform-api → Logistics API → Logistics DB`) describes a _future_ two-system
architecture that does not exist here; building a client against it now would be
inventing a boundary to a nonexistent service.

## 2. Isolation properties — verified in code

| Property                                  | Result                                                         |
| ----------------------------------------- | -------------------------------------------------------------- |
| Single Prisma `datasource`                | ✅ one `datasource db` in `schema.prisma`                      |
| No logistics DB URL / env                 | ✅ no `LOGISTICS_DB` / `LOGISTICS_API` / `LOGISTICS_SERVICE_*` |
| No second/logistics Prisma client         | ✅ single `DATABASE_URL` client only                           |
| Platform module imports no logistics code | ✅ nothing from `orders`/`shipment`/`logistics`                |
| No outbound HTTP from the platform module | ✅ no `fetch`/`axios`/`got`/`undici`                           |
| No cross-database foreign key             | ✅ single DB — not expressible                                 |

## 3. Forbidden patterns (standing rules)

Even if a logistics system is later introduced, `platform-api` must **never**:

```text
Platform API → Logistics Prisma Client          (forbidden)
Platform API → Logistics DB connection string   (forbidden)
Platform API → copied logistics service imports  (forbidden)
Platform DB  ↔ Logistics DB cross-database FK     (forbidden)
```

Cross-plane relationships use **stable identifiers** (e.g. a `tenantId` string)
resolved through the owning service's API — never shared tables.

## 4. Future integration boundary contract (spec, not built)

If a real business/logistics plane is introduced, integration must go through a
strict, authenticated service boundary defining:

| Concern                  | Requirement                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Service authentication   | `platform-api` authenticates as a service (signed token / mTLS); never a tenant end-user token. |
| Tenant identifier        | Every call carries the stable `tenantId`; the remote resolves its own records.                  |
| Request/response schemas | Shared TypeBox contracts, validated on the wire.                                                |
| Idempotency              | Mutating calls carry an idempotency key.                                                        |
| Timeout                  | Bounded per-call timeout via `AbortSignal`.                                                     |
| Retry policy             | Bounded backoff for transient failures only.                                                    |
| Circuit breaking         | Wrap with the existing `withCircuitBreaker` (`core/circuit-breaker.ts`).                        |
| Error mapping            | Map remote errors to the canonical `AppError` envelope + `ErrorCode`s.                          |
| Correlation IDs          | Propagate the platform `requestId` for cross-system tracing.                                    |
| Audit                    | Record cross-plane actions via `AuditService` (no secrets).                                     |

It would live in a dedicated client module (e.g.
`modules/integration/logistics.client.ts`) with new env
(`LOGISTICS_API_URL`, `LOGISTICS_SERVICE_AUTH_SECRET`) added at that time — none
exist today.

## 5. Deferral

Physical logistics integration is **DEFERRED** and out of scope for the current
codebase. It will be revisited only if a real business plane is introduced, under
a dedicated, maintainer-approved phase implementing §4 with its own tests. No
integration code, client, stub, env, or database change was made.

---

## Gate

Phase 11 documents that no Platform → Logistics integration exists (and none was
fabricated), verifies the platform's isolation from any logistics
datastore/code, restates the forbidden coupling patterns, and specifies the
boundary contract a future integration must satisfy. Documentation only — no
code, schema, migration, or database command.
