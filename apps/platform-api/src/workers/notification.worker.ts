import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { context, propagation, trace } from "@opentelemetry/api";
import { QUEUE_NAMES } from "../queue/index.js";
import type { NotificationJobData } from "../queue/types.js";
import { createLogger } from "../core/utils/logger.js";

const log = createLogger("notification-worker");
const tracer = trace.getTracer("notification-worker");

/**
 * Processes a single notification job under the trace context propagated from
 * the API. Replace the body with real delivery (email/webhook/etc.).
 */
async function process(job: Job<NotificationJobData>): Promise<void> {
  const parentCtx = propagation.extract(context.active(), job.data._otel ?? {});
  await context.with(parentCtx, async () => {
    const span = tracer.startSpan("notification.process");
    try {
      log.info(
        { jobId: job.id, type: job.data.type, userId: job.data.userId },
        "Processing notification",
      );
      // TODO: real delivery — SendGrid / Slack / etc. For now this is the seam.
      span.end();
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err; // let BullMQ retry per the job's backoff policy
    }
  });
}

export function createNotificationWorker(
  connection: Redis,
): Worker<NotificationJobData> {
  const worker = new Worker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATIONS,
    process,
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    log.debug({ jobId: job.id }, "Notification job completed");
  });

  worker.on("failed", (job, err) => {
    // After all attempts are exhausted, the job stays in the failed set (DLQ).
    const exhausted = job
      ? job.attemptsMade >= (job.opts.attempts ?? 1)
      : false;
    log[exhausted ? "error" : "warn"](
      { jobId: job?.id, attemptsMade: job?.attemptsMade, err },
      exhausted
        ? "Notification job dead-lettered (all retries exhausted)"
        : "Notification job attempt failed",
    );
  });

  return worker;
}
