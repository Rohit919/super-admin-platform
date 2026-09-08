import http from "node:http";
import { Registry, Gauge, collectDefaultMetrics } from "prom-client";
import { Queue, type Worker } from "bullmq";
import { createLogger } from "../core/utils/logger.js";

const log = createLogger("worker-metrics");
const POLL_INTERVAL_MS = 15_000;
const PORT = Number(process.env.WORKER_METRICS_PORT ?? 9101);

/**
 * Exposes BullMQ queue depth as Prometheus gauges on a small HTTP server so the
 * worker process is scrapable independently of the API.
 */
export function startWorkerMetricsServer(
  worker: Worker,
): http.Server | undefined {
  const register = new Registry();
  collectDefaultMetrics({ register });

  const jobs = new Gauge({
    name: "bullmq_jobs",
    help: "BullMQ job counts by state (waiting/active/completed/failed/delayed)",
    labelNames: ["queue", "state"],
    registers: [register],
  });

  // A read-only Queue handle on the same connection is used purely for counts.
  const queueName = worker.name;
  const countsQueue = new Queue(queueName, {
    connection: worker.opts.connection,
  });

  const poll = async () => {
    try {
      const snapshot = await countsQueue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
      );
      for (const [state, count] of Object.entries(snapshot)) {
        jobs.labels({ queue: queueName, state }).set(count);
      }
    } catch (err) {
      log.warn({ err }, "Failed to poll queue metrics");
    }
  };

  void poll();
  const interval = setInterval(poll, POLL_INTERVAL_MS);
  interval.unref();

  const server = http.createServer((req, res) => {
    if (req.url === "/metrics") {
      register
        .metrics()
        .then((m) => {
          res.writeHead(200, { "Content-Type": register.contentType });
          res.end(m);
        })
        .catch(() => {
          res.writeHead(500);
          res.end();
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, () =>
    log.info({ port: PORT }, "Worker metrics server listening"),
  );
  return server;
}
