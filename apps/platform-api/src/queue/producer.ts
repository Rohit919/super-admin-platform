import type { Queue } from "bullmq";
import { context, propagation } from "@opentelemetry/api";
import type { NotificationJobData } from "./types.js";

/**
 * Serialize the active OTel context into a carrier so the worker can continue
 * the same distributed trace. No-op when tracing is disabled (empty carrier).
 */
function injectOtelContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Enqueue a notification job. Returns as soon as the job is written to Redis
 * (typically < 5ms) — the actual work runs in the worker process.
 */
export async function enqueueNotification(
  queue: Queue,
  data: Omit<NotificationJobData, "_otel">,
): Promise<string> {
  const job = await queue.add("notify", {
    ...data,
    _otel: injectOtelContext(),
  });
  return job.id ?? "";
}
