# Runbook — High HTTP Error Rate

Covers the SLO error-rate alerts on the Platform API.

| Alert                     | Severity | Expression                                                                                           | For |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------- | --- |
| `SLO5xxErrorRateCritical` | critical | `sum(rate(http_requests_total{status_class="5xx"}[5m])) / sum(rate(http_requests_total[5m])) > 0.01` | 2m  |
| `SLO4xxErrorRateWarn`     | warning  | `sum(rate(http_requests_total{status_class="4xx"}[5m])) / sum(rate(http_requests_total[5m])) > 0.10` | 10m |

## 1. Alert purpose

Detect a rise in failed requests as a fraction of total traffic, using the
RED-method "Errors" signal.

## 2. What the alert means

- **5xx critical**: more than 1% of requests are server errors over 5m — the API
  is failing requests it should have served.
- **4xx warning**: more than 10% of requests are client errors over 5m — usually
  a client/frontend bug, expired auth, bad API usage, or abusive traffic, not a
  server fault.

## 3. Severity

5xx → critical. 4xx → warning.

## 4. Trigger condition

Ratio thresholds above, sustained for the `for:` window (2m / 10m). Labels come
from `http_requests_total{method,route,status_class}` in
`apps/platform-api/src/plugins/metrics.ts` (`status_class` is the bounded
`2xx/3xx/4xx/5xx` bucket, `route` is a template, never a raw URL).

## 5. Immediate impact

5xx: users see failures; dependent flows break. 4xx spike: often a specific
client or auth path is broken; can also be scanning/abuse.

## 6. First checks

- Confirm the API is up: `GET /api/v1/health` (200) and `GET /api/v1/ready`
  (200 `ready`). If `/ready` is 503/degraded, follow
  [service-down.md](./service-down.md) / [platform-outage.md](./platform-outage.md).
- Identify which `route` and `status_class` dominate the errors (see §8).
- Check whether a deploy correlates in time with the spike.

## 7. Relevant logs

Structured per-request logs (pino) emitted in `plugins/metrics.ts` on
`onResponse`:

- `event: "request.failed"` (statusCode ≥ 500) with `route`, `statusCode`,
  `statusClass`, `durationMs`, `requestId`.
- `event: "request.completed"` for non-error requests.

Filter logs by `event="request.failed"` and group by `route`. Use `requestId`
to trace a single failing request end to end. Note: in production the error
handler replaces 5xx bodies with a generic message (no leakage), so root cause
lives in the logs, not the response.

## 8. Relevant metrics

- `http_requests_total{route,status_class}` — error counts/rates by route.
- `http_request_duration_seconds_*` — is the error correlated with latency?

Example PromQL (top failing routes):

```promql
topk(5, sum(rate(http_requests_total{status_class="5xx"}[5m])) by (route))
```

## 9. Relevant traces

If `OTEL_ENABLED=true`, HTTP/Fastify/Prisma spans are exported (see
`apps/platform-api/src/telemetry.ts`). Inspect traces for the failing `route` to
see whether time/errors are in a DB query or a downstream call.

## 10. Diagnostic commands/queries

```bash
# Liveness / readiness
curl -fsS http://<api-host>/api/v1/health
curl -fsS http://<api-host>/api/v1/ready

# Scrape current metrics (token-gated if METRICS_TOKEN is set)
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" http://<api-host>/metrics | grep http_requests_total
```

## 11. Common causes

- 5xx: unhandled exception in a route/service, DB unavailable or timing out
  (cross-check `/ready` `services.database`), a broken dependency (open circuit
  breaker), a bad deploy/migration.
- 4xx: frontend bug sending malformed requests, mass token expiry, a changed
  contract, validation rejects, or scanner/abuse traffic.

## 12. Remediation steps

- If a recent deploy correlates: roll back to the previous known-good API image
  (see [platform-outage.md](./platform-outage.md) §5 and `docs/PLATFORM-DEPLOYMENT.md`).
- If DB-driven: follow [pgbouncer-pool.md](./pgbouncer-pool.md) /
  [service-down.md](./service-down.md); if a migration is implicated see
  [migration.md](./migration.md) §6.
- If a specific route: fix the handler/validation and deploy a forward fix.
- If abuse/scanning drives 4xx: rely on existing rate limiting; consider blocking
  the source upstream.

## 13. Verification after remediation

- 5xx ratio back below 1% and 4xx below 10% (alerts clear after the `for:`
  window).
- `GET /api/v1/ready` returns 200 `ready`.

## 14. Escalation conditions

- 5xx critical persists after rollback, or `/ready` shows a failing dependency
  that you cannot restore — escalate to the on-call owner and follow
  [platform-outage.md](./platform-outage.md).

## 15. Recovery / rollback considerations

Prefer rolling back a bad deploy over hotfixing under pressure. If a migration
is implicated, migrations are forward-only — see [migration.md](./migration.md) §6.

## 16. References

- Alerts: `docker/prometheus/alert_rules.yml` (`slo.rules`).
- Metrics: `apps/platform-api/src/plugins/metrics.ts`.
- `docs/OBSERVABILITY.md`, `docs/ERROR_HANDLING.md`, `docs/PLATFORM-DEPLOYMENT.md`.
- Grafana dashboards: `docker/grafana/provisioning/dashboards/`.
