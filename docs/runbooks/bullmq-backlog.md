# Runbook — BullMQ Waiting-Job Backlog

| Alert                   | Severity | Expression                           | For |
| ----------------------- | -------- | ------------------------------------ | --- |
| `BullMQWaitingJobsHigh` | warning  | `bullmq_jobs{state="waiting"} > 500` | 5m  |

## 1. Alert purpose

Detect a growing backlog of queued background jobs — the consumer (worker) is
falling behind producers.

## 2. What the alert means

More than 500 jobs are in the `waiting` state for a queue over 5m. The gauge is
`bullmq_jobs{queue,state}` from `apps/platform-api/src/workers/worker-metrics.ts`,
which polls BullMQ counts every 15s and exposes them on the worker metrics
server (default port `9101`, `WORKER_METRICS_PORT`). BullMQ is Redis-backed
(see `docs/QUEUE_ARCHITECTURE.md`, `docs/BACKGROUND_JOBS.md`).

## 3. Severity

Warning — work is delayed but not (yet) failing.

## 4. Trigger condition

`bullmq_jobs{state="waiting"} > 500` sustained 5m. The `queue` label identifies
the affected queue.

## 5. Immediate impact

Background work (e.g. notifications) is delayed. If the backlog keeps growing,
latency for dependent features increases and Redis memory grows.

## 6. First checks

- Which `queue` is backed up (alert label)?
- Are workers running and healthy? Is the worker metrics server scrapable
  (`:9101/metrics`)?
- Is Redis healthy? `GET /api/v1/ready` → `services.redis`.
- Are jobs also failing ([bullmq-failures.md](./bullmq-failures.md))? Failing +
  retrying jobs can inflate the waiting count.

## 7. Relevant logs

Worker logs (pino, logger `worker-metrics` and the worker itself). Look for a
stalled/crashed worker, Redis connection errors, or slow job handlers.

## 8. Relevant metrics

- `bullmq_jobs{queue,state="waiting"}` — the backlog (alert).
- `bullmq_jobs{queue,state="active"}` — are workers processing at all?
- `bullmq_jobs{queue,state="failed"}` — cross-check failures.

```promql
bullmq_jobs{state="waiting"}
sum(bullmq_jobs{state="active"}) by (queue)
```

## 9. Relevant traces

Notification/worker flows propagate OTel context via `job.data._otelContext`
(see `docs/BACKGROUND_JOBS.md`); with tracing enabled you can follow a job's span.

## 10. Diagnostic commands/queries

```bash
# Worker metrics (separate server from the API)
curl -fsS http://<worker-host>:9101/metrics | grep bullmq_jobs
# Redis reachability from the API's perspective
curl -fsS http://<api-host>/api/v1/ready
```

## 11. Common causes

- Workers stopped, crashed, or not scaled for current volume.
- A slow or blocking job handler reducing throughput.
- A producer surge (burst of enqueued jobs).
- Redis degraded/slow.

## 12. Remediation steps

- Restart/scale workers to increase consumption (see `docs/BACKGROUND_JOBS.md`).
- If a slow handler: identify and optimise it.
- If Redis is degraded: restore Redis (rate limiting also depends on it — see
  [platform-outage.md](./platform-outage.md) §3).
- If a one-off producer surge: confirm the backlog drains once workers catch up.

## 13. Verification after remediation

- `bullmq_jobs{state="waiting"}` trends down below 500; alert clears after 5m.
- `active` count shows workers processing; Redis healthy.

## 14. Escalation conditions

- Backlog keeps growing despite healthy, scaled workers, or Redis is down and
  cannot be restored → page the on-call owner.

## 15. Recovery / rollback considerations

If a recent worker deploy slowed processing, roll it back. Draining a large
backlog may take time even after throughput is restored — monitor until clear.

## 16. References

- Alert: `docker/prometheus/alert_rules.yml` (`queue.rules`).
- Metrics: `apps/platform-api/src/workers/worker-metrics.ts`.
- `docs/QUEUE_ARCHITECTURE.md`, `docs/BACKGROUND_JOBS.md`.
- Related: [bullmq-failures.md](./bullmq-failures.md).
