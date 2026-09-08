# Runbook — BullMQ Failed Jobs

| Alert                  | Severity | Expression                          | For |
| ---------------------- | -------- | ----------------------------------- | --- |
| `BullMQFailedJobsHigh` | critical | `bullmq_jobs{state="failed"} > 100` | 2m  |

## 1. Alert purpose

Detect a high number of jobs in the failed / dead-letter set — background work
is erroring out rather than completing.

## 2. What the alert means

More than 100 jobs are in the `failed` state for a queue over 2m. The gauge is
`bullmq_jobs{queue,state}` from `apps/platform-api/src/workers/worker-metrics.ts`
(polled every 15s, exposed on the worker metrics server, default port `9101`).
BullMQ retries exhausted jobs land in `failed` (see `docs/BACKGROUND_JOBS.md`).

## 3. Severity

Critical — failed jobs usually mean lost/incomplete work.

## 4. Trigger condition

`bullmq_jobs{state="failed"} > 100` sustained 2m. The `queue` label identifies
the affected queue.

## 5. Immediate impact

Work handled by that queue (e.g. notifications) is not completing. Depending on
the job type, users/tenants may miss expected side effects.

## 6. First checks

- Which `queue` is failing (alert label)?
- Read the worker logs for the failure reason/stack.
- Is a dependency the failing queue relies on healthy (DB, Redis, external
  service via circuit breaker)? `GET /api/v1/ready`.
- Did a recent worker deploy coincide?

## 7. Relevant logs

Worker logs (pino) contain the job failure error and stack. Group by queue and
error message to find the dominant failure. In production, secrets are never
logged; the error message + stack are the primary root-cause source.

## 8. Relevant metrics

- `bullmq_jobs{queue,state="failed"}` — the alert gauge.
- `bullmq_jobs{queue,state="waiting"}` — retries can inflate the waiting backlog
  ([bullmq-backlog.md](./bullmq-backlog.md)).

```promql
bullmq_jobs{state="failed"}
```

## 9. Relevant traces

If tracing is enabled and the job propagates OTel context
(`job.data._otelContext`, `docs/BACKGROUND_JOBS.md`), follow a failing job's span
to the erroring call.

## 10. Diagnostic commands/queries

```bash
curl -fsS http://<worker-host>:9101/metrics | grep 'bullmq_jobs{.*state="failed"'
curl -fsS http://<api-host>/api/v1/ready
```

## 11. Common causes

- A bug in the job handler (introduced by a change).
- A downstream dependency failing (DB error, external service down / breaker open).
- Malformed job payloads.
- Redis instability causing job processing errors.

## 12. Remediation steps

- Fix the root cause (handler bug → forward fix; dependency → restore it).
- If a deploy correlates: roll back the worker (see `docs/BACKGROUND_JOBS.md`).
- Once healthy, retry/re-drive failed jobs per BullMQ operational procedure, or
  drain the dead-letter set if the jobs are no longer valid.

## 13. Verification after remediation

- `bullmq_jobs{state="failed"}` stops growing and drains; alert clears after 2m.
- New jobs complete (rising `completed`, low `failed`).

## 14. Escalation conditions

- Failures continue after rollback/fix, or failed jobs represent data-affecting
  work that cannot be safely retried → page the on-call owner and involve the
  data owner.

## 15. Recovery / rollback considerations

Prefer rollback of a failing worker deploy. Before mass-retrying failed jobs,
confirm the root cause is fixed to avoid re-failing. For data-affecting jobs,
assess correctness before re-driving.

## 16. References

- Alert: `docker/prometheus/alert_rules.yml` (`queue.rules`).
- Metrics: `apps/platform-api/src/workers/worker-metrics.ts`.
- `docs/BACKGROUND_JOBS.md`, `docs/QUEUE_ARCHITECTURE.md`.
- Related: [bullmq-backlog.md](./bullmq-backlog.md).
