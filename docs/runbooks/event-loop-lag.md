# Runbook — Node.js Event-Loop Lag High

| Alert              | Severity | Expression                                     | For |
| ------------------ | -------- | ---------------------------------------------- | --- |
| `EventLoopLagHigh` | warning  | `nodejs_eventloop_lag_p99_seconds * 1000 > 50` | 2m  |

## 1. Alert purpose

Detect when the Node.js event loop is lagging — the process is CPU-starved or
blocked, delaying all request handling.

## 2. What the alert means

P99 event-loop lag exceeds 50ms for over 2m. The metric
`nodejs_eventloop_lag_p99_seconds` is a prom-client default metric (registered
via `collectDefaultMetrics` in `apps/platform-api/src/plugins/metrics.ts`). The
readiness endpoint independently tracks event-loop lag and marks the instance
`degraded` past its own threshold (`health.routes.ts`,
`EVENT_LOOP_LAG_THRESHOLD_MS`, default 200ms).

## 3. Severity

Warning — a leading indicator of latency/availability problems.

## 4. Trigger condition

`nodejs_eventloop_lag_p99_seconds * 1000 > 50` sustained 2m.

## 5. Immediate impact

Every request on that instance is delayed (the event loop serialises work), so
latency rises across routes and, if severe, readiness flips to `degraded` and
requests may time out.

## 6. First checks

- `GET /api/v1/ready` → `eventLoop.lagMs` / `eventLoop.healthy` for a second
  opinion on the same instance.
- Is request latency also elevated ([high-latency.md](./high-latency.md))?
- Is orchestrator concurrency high ([orchestrator-overload.md](./orchestrator-overload.md))?
- Traffic surge or a specific heavy route?

## 7. Relevant logs

Request logs (`durationMs`), and the readiness log warning
"Event-loop lag exceeds readiness threshold" from `health.routes.ts`. Look for a
hot code path or a burst of heavy requests around the spike.

## 8. Relevant metrics

- `nodejs_eventloop_lag_p99_seconds` (and related `nodejs_eventloop_lag_*`).
- CPU (`process_cpu_seconds_total`), and correlated
  `http_request_duration_seconds_*`.

```promql
nodejs_eventloop_lag_p99_seconds * 1000
```

## 9. Relevant traces

With `OTEL_ENABLED=true`, look for spans doing heavy synchronous work; note that
event-loop blocking may appear as broadly elevated latency rather than one slow
span.

## 10. Diagnostic commands/queries

```bash
curl -fsS http://<api-host>/api/v1/ready   # eventLoop.lagMs, process counters
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" http://<api-host>/metrics \
  | grep -E "nodejs_eventloop_lag|process_cpu"
```

## 11. Common causes

- CPU-bound work on the main thread (large synchronous loops, heavy JSON,
  crypto, big serialisation).
- A traffic surge exceeding a single instance's CPU.
- Blocking I/O or a tight retry loop.

## 12. Remediation steps

- Scale out API replicas to spread load (`docs/PLATFORM-DEPLOYMENT.md`).
- Identify and offload/optimise the hot synchronous path (`docs/PERFORMANCE.md`).
- If a deploy introduced the regression, roll it back.

## 13. Verification after remediation

- `nodejs_eventloop_lag_p99_seconds*1000` back under 50ms; alert clears after 2m.
- `/api/v1/ready` `eventLoop.healthy=true`; latency normal.

## 14. Escalation conditions

- Lag persists after scaling/rollback, or readiness stays `degraded` and requests
  time out → follow [platform-outage.md](./platform-outage.md) and page on-call.

## 15. Recovery / rollback considerations

Roll back a CPU-regressing deploy. Restarting an overloaded instance gives
temporary relief but won't fix a genuine capacity or code issue.

## 16. References

- Alert: `docker/prometheus/alert_rules.yml` (`nodejs.rules`).
- Metrics: prom-client defaults via `apps/platform-api/src/plugins/metrics.ts`.
- Readiness: `apps/platform-api/src/modules/health/health.routes.ts`.
- `docs/OBSERVABILITY.md`, `docs/PERFORMANCE.md`.
- Related: [high-latency.md](./high-latency.md), [active-handles.md](./active-handles.md).
