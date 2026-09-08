// Start tracing first (opt-in via OTEL_ENABLED) so worker spans link to API traces.
import "../telemetry.js";

import { Redis } from "ioredis";
import { createNotificationWorker } from "./notification.worker.js";
import { startWorkerMetricsServer } from "./worker-metrics.js";
import { logger } from "../core/utils/logger.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// BullMQ requires maxRetriesPerRequest: null on the worker's connection.
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

const worker = createNotificationWorker(connection);
const metricsServer = startWorkerMetricsServer(worker);

logger.info("Notification worker started");

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Worker shutting down");
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  try {
    await worker.close();
    await metricsServer?.close();
    await connection.quit().catch(() => connection.disconnect());
    logger.info("Worker closed cleanly");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during worker shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
