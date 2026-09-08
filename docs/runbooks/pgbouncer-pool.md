# Runbook — PgBouncer Connection Pool Saturation

| Alert                     | Severity | Expression                                                                           | For |
| ------------------------- | -------- | ------------------------------------------------------------------------------------ | --- |
| `PgBouncerPoolSaturation` | warning  | `pgbouncer_pools_client_active_connections / pgbouncer_config_max_client_conn > 0.8` | 5m  |

## 1. Alert purpose

Warn when the PgBouncer client connection pool is running near capacity, before
it starts rejecting or queuing connections.

## 2. What the alert means

Active client connections exceed 80% of `MAX_CLIENT_CONN` for over 5m. Metrics
come from the PgBouncer exporter (`pgbouncer_pools_client_active_connections`,
`pgbouncer_config_max_client_conn`). The app connects through PgBouncer via
`DATABASE_URL` (transaction pooling); migrations use the direct
`DATABASE_DIRECT_URL` (see `docs/PLATFORM-DATABASE.md`).

## 3. Severity

Warning — a capacity leading indicator; saturation causes latency/errors if it
reaches 100%.

## 4. Trigger condition

Utilisation ratio > 0.8 sustained 5m.

## 5. Immediate impact

As the pool nears 100%, new connections wait or fail, surfacing as request
latency ([high-latency.md](./high-latency.md)) and eventually 5xx / readiness
failures ([high-error-rate.md](./high-error-rate.md), [service-down.md](./service-down.md)).

## 6. First checks

- Confirm DB reachability: `GET /api/v1/ready` → `services.database`.
- Is API traffic or orchestrator concurrency spiking
  ([orchestrator-overload.md](./orchestrator-overload.md))?
- Any long-running/leaked transactions holding connections?

## 7. Relevant logs

API DB-error logs (pino) — connection timeouts / "too many connections".
PgBouncer logs if accessible. Readiness check logs a warning when the DB check
fails (`health.routes.ts`).

## 8. Relevant metrics

- `pgbouncer_pools_client_active_connections`, `pgbouncer_config_max_client_conn`.
- Correlate with `http_request_duration_seconds_*` and
  `orchestrator_active_operations`.

```promql
pgbouncer_pools_client_active_connections / pgbouncer_config_max_client_conn
```

## 9. Relevant traces

With `OTEL_ENABLED=true`, Prisma spans show DB wait/query time contributing to
request latency.

## 10. Diagnostic commands/queries

```bash
curl -fsS http://<api-host>/api/v1/ready
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" http://<api-host>/metrics \
  | grep pgbouncer_
```

## 11. Common causes

- Legitimate load growth or a traffic surge.
- Too many API replicas × per-instance pool size exceeding `MAX_CLIENT_CONN`.
- Leaked/long-running transactions not releasing connections.
- A slow query holding connections longer than usual.

## 12. Remediation steps

- Short term: shed load / scale down noisy clients; identify and kill
  leaked long-running transactions.
- Capacity: increase `MAX_CLIENT_CONN` (pooler config) or add read replicas —
  a deliberate infra change per `docs/PLATFORM-DATABASE.md` / `docs/DATABASE.md`,
  not an ad-hoc production edit.
- Fix the app path holding connections (slow query, missing index → `docs/PERFORMANCE.md`).

## 13. Verification after remediation

- Utilisation ratio back below 0.8; alert clears after 5m.
- `/api/v1/ready` `services.database=true`; latency normal.

## 14. Escalation conditions

- Pool hits ~100% and requests start failing, or you cannot identify the
  connection consumer → page the DB/on-call owner; follow
  [platform-outage.md](./platform-outage.md).

## 15. Recovery / rollback considerations

Config changes to the pooler/DB are infra changes — apply through the normal,
reviewed process. If a recent deploy increased connection usage, consider
rolling it back.

## 16. References

- Alert: `docker/prometheus/alert_rules.yml` (`db.rules`).
- `docs/PLATFORM-DATABASE.md`, `docs/DATABASE.md`, `docs/PERFORMANCE.md`.
- Health readiness: `apps/platform-api/src/modules/health/health.routes.ts`.
