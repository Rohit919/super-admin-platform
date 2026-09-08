# Runbook — Platform Outage

The Platform API is down or degraded. Goal: detect, triage the failing
dependency, mitigate, and recover.

## Signals

- `GET /api/v1/health` (liveness) not returning `200 {status:"ok"}`.
- `GET /api/v1/ready` (readiness) returning `503`, or `status: "degraded"`.
- Alerts: high 5xx rate, DB outage, auth-failure spike
  (`platform_security_failures_total`), API down. See
  `docs/OBSERVABILITY.md` and `docker/prometheus/alert_rules.yml`.

## 1. Triage with readiness

```
GET /api/v1/ready
```

The response breaks the failure down:

- `services.database=false` → PostgreSQL unreachable (see §2).
- `services.redis=false` → Redis unreachable (rate limiting fails **open** to
  in-memory; queues/other Redis users degrade) (see §3).
- `eventLoop.healthy=false` → event-loop lag over threshold; the process is
  overloaded (see §4).
- `circuitBreakers.allClosed=false` → a downstream dependency breaker is OPEN.

## 2. Database unreachable

- Verify DB is up and reachable from the API host; check connection limits /
  pooler (PgBouncer) health.
- Confirm `DATABASE_URL` is correct and the DB accepts connections.
- If a recent migration caused it, see `migration.md` §6 (recovery).

## 3. Redis unreachable

- Rate limiting degrades to per-instance in-memory (enforcement is weaker but
  the API stays up). Restore Redis; verify `ready` shows `redis=true`.

## 4. Process overloaded (event-loop lag)

- Check request volume / 5xx via metrics (`http_requests_total`,
  `http_request_duration_seconds`).
- Scale out replicas or shed load; investigate slow queries / hot paths.

## 5. Recover & verify

- After mitigating the failing dependency, confirm:
  - `GET /api/v1/health` → 200
  - `GET /api/v1/ready` → 200 `status: "ready"`
  - 5xx rate returns to baseline; alerts clear.
- If a bad deploy is implicated, roll back to the previous known-good API image
  (`ghcr.io/<repo>/api`) per the deploy pipeline. Platform deploys are
  independent of any other system's build/image/migration.

## Post-incident

- [ ] Root cause identified (DB / Redis / overload / dependency / deploy).
- [ ] Health + readiness green; alerts cleared.
- [ ] Rollback or fix applied and verified.
- [ ] Timeline + root cause recorded; follow-ups filed.
