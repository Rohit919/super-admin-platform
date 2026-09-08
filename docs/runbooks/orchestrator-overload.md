# Runbook — Orchestrator Overload

| Alert                  | Severity | Expression                            | For |
| ---------------------- | -------- | ------------------------------------- | --- |
| `OrchestratorOverload` | warning  | `orchestrator_active_operations > 50` | 2m  |

## 1. Alert purpose

Detect an unusually high number of concurrent orchestrator operations, which can
signal a slowdown, a backlog, or a leak of in-flight operations.

## 2. What the alert means

More than 50 operations are active concurrently (per `service`) for over 2m. The
gauge is `orchestrator_active_operations{service}` from
`apps/platform-api/src/core/orchestration/orchestrator-metrics.ts`. A healthy
system drains operations quickly; a sustained high count means they are starting
faster than they finish, or not decrementing (leak).

## 3. Severity

Warning — a leading indicator, not necessarily user-facing yet.

## 4. Trigger condition

`orchestrator_active_operations > 50` sustained 2m. The `service` label
identifies which orchestrator.

## 5. Immediate impact

Rising concurrency usually precedes latency growth and, if unbounded, resource
exhaustion (memory, DB connections). Left unchecked it can escalate into 5xx
errors or event-loop lag.

## 6. First checks

- Which `service` label is elevated?
- Is it correlated with rising latency (`orchestrator_pipeline_duration_ms`) or
  errors ([orchestrator-errors.md](./orchestrator-errors.md))?
- Is overall request latency rising too ([high-latency.md](./high-latency.md))?
- Is the DB pool saturating ([pgbouncer-pool.md](./pgbouncer-pool.md))?

## 7. Relevant logs

Orchestrator/service logs (pino). Correlate by `requestId` where present. Look
for operations that started but never logged completion (leak signature).

## 8. Relevant metrics

- `orchestrator_active_operations{service}` — the alert gauge.
- `orchestrator_pipeline_duration_ms{service,status}` — are pipelines slowing?
- `orchestrator_stage_latency_ms{service,stage}` — which stage is slow?
- `http_request_duration_seconds_*` — downstream latency impact.

```promql
orchestrator_active_operations
histogram_quantile(0.99, sum(rate(orchestrator_pipeline_duration_ms_bucket[5m])) by (le, service))
```

## 9. Relevant traces

If `OTEL_ENABLED=true`, inspect traces for the affected `service` to see where
pipeline time accumulates (a slow stage or a slow DB/downstream call).

## 10. Diagnostic commands/queries

```bash
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" http://<api-host>/metrics \
  | grep -E "orchestrator_active_operations|orchestrator_pipeline_duration_ms"
curl -fsS http://<api-host>/api/v1/ready   # event-loop + DB + breakers
```

## 11. Common causes

- A downstream dependency (DB, external service via circuit breaker) is slow, so
  operations pile up.
- A traffic surge exceeding capacity.
- A bug that fails to decrement the active-operations gauge on some path (leak) —
  suspect this if the count stays high with low traffic.

## 12. Remediation steps

- If a dependency is slow: address it (DB pool → [pgbouncer-pool.md](./pgbouncer-pool.md);
  open breaker → wait for recovery / fix the downstream).
- If a genuine load surge: scale out API replicas (see `docs/PLATFORM-DEPLOYMENT.md`).
- If a leak is suspected (high count, low throughput): capture diagnostics and
  restart the affected instance to clear stuck operations, then fix the code path
  that failed to release.

## 13. Verification after remediation

- `orchestrator_active_operations` returns to normal baseline; alert clears after 2m.
- Latency and error metrics back to baseline.

## 14. Escalation conditions

- Count keeps climbing despite mitigation, or it escalates into 5xx / event-loop
  lag → follow [platform-outage.md](./platform-outage.md) and page the on-call owner.

## 15. Recovery / rollback considerations

If a recent deploy introduced the leak/slowdown, roll back to the previous API
image (`docs/PLATFORM-DEPLOYMENT.md`). Restarting an instance is a safe way to
clear leaked in-flight operations.

## 16. References

- Alert: `docker/prometheus/alert_rules.yml` (`orchestrator.rules`).
- Metrics: `apps/platform-api/src/core/orchestration/orchestrator-metrics.ts`.
- `docs/OBSERVABILITY.md`, `docs/PERFORMANCE.md`.
- Related: [orchestrator-errors.md](./orchestrator-errors.md), [high-latency.md](./high-latency.md).
