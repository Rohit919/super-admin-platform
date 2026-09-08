# Runbook — High Request Latency

| Alert                   | Severity | Expression                                                                                           | For |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------------- | --- |
| `SLOLatencyP99Warn`     | warning  | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)) > 0.5` | 5m  |
| `SLOLatencyP99Critical` | critical | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)) > 1`   | 5m  |

## 1. Alert purpose

Detect slow responses via the RED-method "Duration" signal — P99 request latency
per route.

## 2. What the alert means

- **Warn**: P99 latency on some `route` exceeds 500ms over 5m.
- **Critical**: P99 exceeds 1s over 5m.

Source histogram: `http_request_duration_seconds_bucket` labeled by
`method,route,status_class` in `apps/platform-api/src/plugins/metrics.ts`
(`route` is a template, never a raw URL).

## 3. Severity

> 500ms → warning; >1s → critical.

## 4. Trigger condition

P99 (via `histogram_quantile`) over the thresholds, sustained 5m. The `route`
label identifies the slow endpoint.

## 5. Immediate impact

Users experience slow responses on the affected route; sustained latency often
precedes timeouts, retries, and eventually 5xx / event-loop lag.

## 6. First checks

- Which `route` is slow (from the alert label)?
- Is it correlated with 5xx ([high-error-rate.md](./high-error-rate.md))?
- Check `/api/v1/ready`: `eventLoop.healthy`, `services.database`, breaker state.
- Did a deploy or traffic surge coincide?

## 7. Relevant logs

`event: "request.completed"` / `"request.failed"` logs carry `durationMs`,
`route`, and `requestId`. Filter by the slow `route` and sort by `durationMs`;
use `requestId` to trace the slowest requests.

## 8. Relevant metrics

- `http_request_duration_seconds_bucket{route}` — the alert histogram.
- `orchestrator_stage_latency_ms{service,stage}` — if the route runs a pipeline.
- `pgbouncer_pools_client_active_connections` / event-loop lag — contention signals.

```promql
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))
```

## 9. Relevant traces

With `OTEL_ENABLED=true`, open traces for the slow `route`; the Prisma/HTTP spans
show whether time is in the DB, a downstream call, or app code.

## 10. Diagnostic commands/queries

```bash
curl -fsS http://<api-host>/api/v1/ready
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" http://<api-host>/metrics \
  | grep http_request_duration_seconds
```

## 11. Common causes

- Slow DB queries / pool contention (see [pgbouncer-pool.md](./pgbouncer-pool.md)).
- Event-loop lag / CPU starvation (see [event-loop-lag.md](./event-loop-lag.md)).
- A slow downstream dependency.
- Load surge beyond current capacity; N+1 or missing index on a hot query.

## 12. Remediation steps

- DB-bound: investigate slow queries / indexes (`docs/PERFORMANCE.md`,
  `docs/DATABASE.md`); relieve pool pressure ([pgbouncer-pool.md](./pgbouncer-pool.md)).
- CPU/event-loop bound: see [event-loop-lag.md](./event-loop-lag.md); scale out.
- Deploy-correlated regression: roll back (`docs/PLATFORM-DEPLOYMENT.md`).
- Load surge: scale API replicas.

## 13. Verification after remediation

- P99 for the route back under threshold; alert clears after 5m.
- `/api/v1/ready` healthy; no correlated 5xx.

## 14. Escalation conditions

- Critical latency persists after mitigation, or it cascades into 5xx / outage →
  page the on-call owner and follow [platform-outage.md](./platform-outage.md).

## 15. Recovery / rollback considerations

Roll back a latency-regressing deploy. Adding an index is a schema change — do it
deliberately via the migration process ([migration.md](./migration.md)), never
ad hoc against production.

## 16. References

- Alert: `docker/prometheus/alert_rules.yml` (`slo.rules`).
- Metrics: `apps/platform-api/src/plugins/metrics.ts`.
- `docs/OBSERVABILITY.md`, `docs/PERFORMANCE.md`, `docs/DATABASE.md`.
- Grafana dashboards: `docker/grafana/provisioning/dashboards/`.
