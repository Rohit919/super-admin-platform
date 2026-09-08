# Super Admin Platform — Operational Runbooks

Incident and operational runbooks for the Super Admin Platform control plane.
Each runbook is a step-by-step procedure; keep them current as the system
evolves (Phase 19.12).

### Operational / incident

| Runbook                                                                  | When to use                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [migration.md](./migration.md)                                           | Applying Platform DB migrations (esp. production)          |
| [credential-compromise.md](./credential-compromise.md)                   | A tenant API credential is leaked or suspected compromised |
| [super-admin-account-compromise.md](./super-admin-account-compromise.md) | A platform (Super Admin) account is suspected compromised  |
| [platform-outage.md](./platform-outage.md)                               | Platform API is down or degraded                           |

### Alert runbooks (linked from `docker/prometheus/alert_rules.yml`)

| Runbook                                                                  | Alert(s)                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| [high-error-rate.md](./high-error-rate.md)                               | `SLO5xxErrorRateCritical`, `SLO4xxErrorRateWarn` |
| [high-latency.md](./high-latency.md)                                     | `SLOLatencyP99Warn`, `SLOLatencyP99Critical`     |
| [service-down.md](./service-down.md)                                     | `ServiceDown`                                    |
| [pgbouncer-pool.md](./pgbouncer-pool.md)                                 | `PgBouncerPoolSaturation`                        |
| [bullmq-backlog.md](./bullmq-backlog.md)                                 | `BullMQWaitingJobsHigh`                          |
| [bullmq-failures.md](./bullmq-failures.md)                               | `BullMQFailedJobsHigh`                           |
| [event-loop-lag.md](./event-loop-lag.md)                                 | `EventLoopLagHigh`                               |
| [active-handles.md](./active-handles.md)                                 | `ActiveHandlesHigh`                              |
| [orchestrator-overload.md](./orchestrator-overload.md)                   | `OrchestratorOverload`                           |
| [orchestrator-errors.md](./orchestrator-errors.md)                       | `OrchestratorErrors`                             |
| [super-admin-account-compromise.md](./super-admin-account-compromise.md) | `PlatformAuthFailureSpike`                       |

## Conventions

- Commands assume repo root and the `@app/api` workspace.
- `DATABASE_URL` / `DATABASE_DIRECT_URL` must point at the **intended** database
  before any migration command — verify first, never assume.
- Never paste secret values into tickets, chat, or logs. Reference them by key
  name (e.g. `JWT_SECRET`), never by value.
- Production destructive actions require human approval and a confirmed backup.
