# Runbook — Orchestrator Pipeline Errors

| Alert                | Severity | Expression                                           | For |
| -------------------- | -------- | ---------------------------------------------------- | --- |
| `OrchestratorErrors` | critical | `rate(orchestrator_pipeline_errors_total[5m]) > 0.1` | 1m  |

## 1. Alert purpose

Detect an elevated rate of orchestrator pipeline errors — failures inside a
service's processing pipeline.

## 2. What the alert means

Pipeline errors are occurring faster than 0.1/s over 5m. The counter is
`orchestrator_pipeline_errors_total{service,stage}` from
`apps/platform-api/src/core/orchestration/orchestrator-metrics.ts`. The
`service` and `stage` labels pinpoint where the pipeline is failing.

## 3. Severity

Critical — pipeline errors typically mean work is not completing correctly.

## 4. Trigger condition

`rate(orchestrator_pipeline_errors_total[5m]) > 0.1` sustained 1m.

## 5. Immediate impact

Operations routed through the failing `service`/`stage` fail or produce
incorrect results; user-facing flows that depend on them break.

## 6. First checks

- Identify the failing `service` and `stage` from the alert labels.
- Correlate with HTTP 5xx ([high-error-rate.md](./high-error-rate.md)) — do the
  failures surface as request errors?
- Check `/api/v1/ready` for a failing dependency (DB, Redis, open breaker).
- Did a recent deploy/migration coincide?

## 7. Relevant logs

Service/orchestrator error logs (pino), which carry the error and stage context;
correlate by `requestId`. In production, response bodies for 5xx are redacted,
so the stack/root cause is in the logs.

## 8. Relevant metrics

- `orchestrator_pipeline_errors_total{service,stage}` — the alert counter.
- `orchestrator_stage_latency_ms{service,stage}` — is the failing stage also slow
  (timeouts)?
- `orchestrator_pipeline_duration_ms{service,status}` — status="error" share.

```promql
sum(rate(orchestrator_pipeline_errors_total[5m])) by (service, stage)
```

## 9. Relevant traces

With `OTEL_ENABLED=true`, inspect traces for the failing `service` to see the
erroring stage and any underlying DB/downstream span.

## 10. Diagnostic commands/queries

```bash
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" http://<api-host>/metrics \
  | grep orchestrator_pipeline_errors_total
curl -fsS http://<api-host>/api/v1/ready
```

## 11. Common causes

- A downstream dependency failing (DB error, external call failing → circuit
  breaker) at a specific stage.
- A code defect in a pipeline stage introduced by a recent change.
- Bad or unexpected input reaching a stage that doesn't handle it.

## 12. Remediation steps

- If a deploy correlates: roll back to the previous API image
  (`docs/PLATFORM-DEPLOYMENT.md`).
- If a dependency is the cause: restore it (DB → [pgbouncer-pool.md](./pgbouncer-pool.md)
  / [service-down.md](./service-down.md); breaker open → address the downstream).
- Otherwise: patch the failing stage and deploy a forward fix.

## 13. Verification after remediation

- `rate(orchestrator_pipeline_errors_total[5m])` returns to ~0; alert clears.
- Associated 5xx (if any) subsides; `/ready` healthy.

## 14. Escalation conditions

- Errors persist after rollback, or the failing stage corrupts data → page the
  on-call owner and follow [platform-outage.md](./platform-outage.md); if data
  integrity is at risk consider recovery per [migration.md](./migration.md) §6.

## 15. Recovery / rollback considerations

Prefer rollback over live hotfix. If a stage wrote bad data, assess whether a
corrective forward migration or restore is required (see `docs/DISASTER_RECOVERY.md`).

## 16. References

- Alert: `docker/prometheus/alert_rules.yml` (`orchestrator.rules`).
- Metrics: `apps/platform-api/src/core/orchestration/orchestrator-metrics.ts`.
- `docs/OBSERVABILITY.md`, `docs/ERROR_HANDLING.md`.
- Related: [orchestrator-overload.md](./orchestrator-overload.md), [high-error-rate.md](./high-error-rate.md).
