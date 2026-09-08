# Runbook — Platform API Service Down

| Alert         | Severity | Expression                    | For |
| ------------- | -------- | ----------------------------- | --- |
| `ServiceDown` | critical | `up{job="platform-api"} == 0` | 1m  |

## 1. Alert purpose

Detect that Prometheus cannot scrape the Platform API target — the API is
unreachable or not serving `/metrics`.

## 2. What the alert means

The `up` series for the `platform-api` scrape job has been `0` for over 1m: the
process is down, crash-looping, unreachable on the network, or the metrics
endpoint is failing. Scrape config: `docker/prometheus/prometheus.yml`.

## 3. Severity

Critical — a full or partial outage of the control-plane API.

## 4. Trigger condition

`up{job="platform-api"} == 0` for 1m.

## 5. Immediate impact

The Super Admin app and all `/api/v1/platform/*` operations are unavailable.
Note this is also an availability signal, not only a metrics-scrape issue.

## 6. First checks

- Hit the health endpoints directly:
  - `GET /api/v1/health` (liveness)
  - `GET /api/v1/ready` (readiness: DB, Redis, event-loop, circuit breakers)
- If both fail/refuse connection → the process/instance is down or unreachable.
- If health responds but Prometheus shows `up=0` → a scrape/network/metrics-auth
  problem, not a true outage.
- Check the platform for crash-loop / restart events and recent deploys.

## 7. Relevant logs

Process/container logs (pino). Look for a startup failure (e.g. env validation
via `@fastify/env`, a too-short `JWT_SECRET`, DB connect failure) or a repeated
crash stack. Startup logs are the fastest signal for a crash loop.

## 8. Relevant metrics

While down there are no app metrics. On recovery, watch `up{job="platform-api"}`
return to 1 and confirm `http_requests_total` resumes incrementing.

## 9. Relevant traces

None while down. After recovery, tracing (if `OTEL_ENABLED=true`) resumes.

## 10. Diagnostic commands/queries

```bash
curl -fsS http://<api-host>/api/v1/health || echo "health unreachable"
curl -fsS http://<api-host>/api/v1/ready  || echo "ready unreachable"
# Confirm the metrics endpoint (token-gated if METRICS_TOKEN set)
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" http://<api-host>/metrics | head
```

## 11. Common causes

- Crash on boot: bad/missing env (`docs/PLATFORM-DEPLOYMENT.md`), DB unreachable,
  invalid secret configuration.
- A bad deploy/image.
- Host/instance failure or network/ingress misconfiguration.
- Metrics endpoint auth mismatch (scrape shows down but app is actually serving).

## 12. Remediation steps

- If a recent deploy correlates: roll back to the previous known-good API image
  (`docs/PLATFORM-DEPLOYMENT.md`).
- If crash-on-boot from config: fix the env/secret and redeploy (never paste
  secrets into logs/tickets).
- If host/network: restore the instance / fix ingress.
- If DB-driven boot failure: see [pgbouncer-pool.md](./pgbouncer-pool.md) and
  [migration.md](./migration.md) §6.

## 13. Verification after remediation

- `GET /api/v1/health` → 200; `GET /api/v1/ready` → 200 `ready`.
- `up{job="platform-api"}` returns to 1; alert clears.

## 14. Escalation conditions

- Cannot restore within the outage SLA, or root cause is infrastructure you don't
  own → page the on-call owner and follow [platform-outage.md](./platform-outage.md).

## 15. Recovery / rollback considerations

Roll back the deploy first; investigate root cause after service is restored.
Platform deploys are independent of any other system's build/image/migration.

## 16. References

- Alert: `docker/prometheus/alert_rules.yml` (`api.rules`).
- Scrape config: `docker/prometheus/prometheus.yml`.
- Health: `apps/platform-api/src/modules/health/health.routes.ts`.
- `docs/PLATFORM-DEPLOYMENT.md`, [platform-outage.md](./platform-outage.md).
