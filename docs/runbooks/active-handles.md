# Runbook — Node.js Active Handles High

| Alert               | Severity | Expression                    | For |
| ------------------- | -------- | ----------------------------- | --- |
| `ActiveHandlesHigh` | warning  | `nodejs_active_handles > 100` | 5m  |

## 1. Alert purpose

Detect an unusually high number of active libuv handles, a common signature of a
resource leak (unclosed sockets, timers, file descriptors, or DB/HTTP clients).

## 2. What the alert means

`nodejs_active_handles` (prom-client default metric, via `collectDefaultMetrics`
in `apps/platform-api/src/plugins/metrics.ts`) exceeds 100 for over 5m. The
readiness endpoint also reports `process.activeHandles` for the same instance
(`health.routes.ts`). A steadily climbing count that doesn't fall with traffic
indicates handles are being opened but not released.

## 3. Severity

Warning — early leak indicator; if unbounded it leads to FD exhaustion and
instability.

## 4. Trigger condition

`nodejs_active_handles > 100` sustained 5m.

## 5. Immediate impact

Usually none immediately. Over time a leak exhausts sockets/file descriptors,
causing failed connections, rising latency, and eventual crashes.

## 6. First checks

- Is the count **growing over time** (leak) or just high under load (transient)?
  Look at the trend, not a single sample.
- `GET /api/v1/ready` → `process.activeHandles` / `process.activeRequests`.
- Did a recent deploy correlate with the onset?
- Any downstream (DB pool, external HTTP, Redis) opening connections abnormally?

## 7. Relevant logs

Process logs (pino). Look for repeated open-without-close patterns, connection
churn, or errors from clients that may leave handles dangling.

## 8. Relevant metrics

- `nodejs_active_handles` (alert), `nodejs_active_requests`.
- Correlate with `pgbouncer_pools_client_active_connections` (DB) and event-loop
  lag — a leak often accompanies rising resource use.

```promql
nodejs_active_handles
```

## 9. Relevant traces

Tracing rarely pinpoints a handle leak directly; use it to spot code paths that
open connections per request without pooling/closing.

## 10. Diagnostic commands/queries

```bash
curl -fsS http://<api-host>/api/v1/ready   # process.activeHandles / activeRequests
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" http://<api-host>/metrics \
  | grep -E "nodejs_active_handles|nodejs_active_requests"
```

## 11. Common causes

- A code path creating a client/socket/timer per request without closing it.
- A library misused so connections aren't pooled or released.
- Legitimate high concurrency (transient) — distinguish from a true leak by the
  trend.

## 12. Remediation steps

- If a genuine leak from a recent change: roll back the deploy
  (`docs/PLATFORM-DEPLOYMENT.md`) and fix the offending path (ensure `close()` /
  pooling / `clearTimeout`).
- Immediate relief: restart the affected instance to reclaim handles (does not
  fix the underlying leak).
- If transient under load: scale out and confirm the count falls afterward.

## 13. Verification after remediation

- `nodejs_active_handles` returns to and stays at baseline (not just after a
  restart); alert clears after 5m.
- `/api/v1/ready` handle counts normal.

## 14. Escalation conditions

- Handles keep climbing after rollback/restart, or FD exhaustion causes failures
  → page the on-call owner and follow [platform-outage.md](./platform-outage.md).

## 15. Recovery / rollback considerations

A restart is a stopgap; the leak returns until the code is fixed. Prefer rolling
back the introducing deploy and shipping a forward fix.

## 16. References

- Alert: `docker/prometheus/alert_rules.yml` (`nodejs.rules`).
- Metrics: prom-client defaults via `apps/platform-api/src/plugins/metrics.ts`.
- Readiness: `apps/platform-api/src/modules/health/health.routes.ts`.
- `docs/OBSERVABILITY.md`, `docs/PERFORMANCE.md`.
- Related: [event-loop-lag.md](./event-loop-lag.md).
