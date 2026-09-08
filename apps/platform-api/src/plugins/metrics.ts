import fp from "fastify-plugin";
import {
  collectDefaultMetrics,
  register,
  Counter,
  Histogram,
  Gauge,
} from "prom-client";
import type { FastifyPluginAsync } from "fastify";

// Extend Fastify instance type
declare module "fastify" {
  interface FastifyInstance {
    metrics: {
      register: typeof register;
      httpRequestDuration: Histogram<string>;
      httpRequestsTotal: Counter<string>;
      httpRequestsInProgress: Gauge<string>;
    };
  }
}

const metricsPlugin: FastifyPluginAsync = async (fastify, _options) => {
  // Collect default metrics
  collectDefaultMetrics({ register });

  // Create custom metrics.
  //
  // Cardinality is deliberately bounded (OBSERVABILITY §2.5 / §17 / §36):
  //   - `route` is ALWAYS a route TEMPLATE (e.g. /api/v1/users/:id), never a
  //     raw URL. Unmatched requests collapse to a single `__unmatched__` label
  //     so scanners/404 floods can't explode the series count.
  //   - `status_class` is the RED-method bucket (2xx/3xx/4xx/5xx), not the raw
  //     status code — a small fixed set instead of one series per code.
  //   - We never label by userId, email, requestId, or any user-controlled value.
  const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_class"],
    buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5],
  });

  const httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_class"],
  });

  const httpRequestsInProgress = new Gauge({
    name: "http_requests_in_progress",
    help: "Number of HTTP requests in progress",
    labelNames: ["method"],
  });

  // Register metrics
  register.registerMetric(httpRequestDuration);
  register.registerMetric(httpRequestsTotal);
  register.registerMetric(httpRequestsInProgress);

  // Decorate fastify with metrics
  fastify.decorate("metrics", {
    register,
    httpRequestDuration,
    httpRequestsTotal,
    httpRequestsInProgress,
  });

  // Add hooks to track metrics
  fastify.addHook("onRequest", async (request, _reply) => {
    // Track in-progress requests
    httpRequestsInProgress.labels({ method: request.method }).inc();

    // Nanosecond-resolution start time (accurate for sub-millisecond responses)
    request.startHrTime = process.hrtime.bigint();
  });

  fastify.addHook("onResponse", async (request, reply) => {
    // Convert nanoseconds → seconds (Prometheus convention)
    const start = request.startHrTime ?? process.hrtime.bigint();
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;

    // Use the matched route TEMPLATE only. Falling back to request.url would
    // make every unique path (?, ids, scanner probes) its own metric series —
    // unbounded cardinality. Collapse unmatched requests to a single bucket.
    const route =
      request.routeOptions?.url ??
      request.routeOptions?.config?.url ??
      "__unmatched__";

    const statusClass = `${Math.floor(reply.statusCode / 100)}xx`;

    const labels = {
      method: request.method,
      route,
      status_class: statusClass,
    };

    // Record metrics
    httpRequestDuration.labels(labels).observe(durationSeconds);
    httpRequestsTotal.labels(labels).inc();
    httpRequestsInProgress.labels({ method: request.method }).dec();

    // ── RED-method structured request log (OBSERVABILITY §8 / §18-20) ─────────
    // One machine-readable event per request carrying the fields dashboards and
    // incident investigation need: route template, status, duration, requestId
    // (and traceId/spanId + userId if the on-request/pre-handler hooks bound
    // them to request.log). We skip the metrics endpoint itself to avoid noise.
    if (request.url !== fastify.config.METRICS_PATH) {
      const durationMs = Math.round(durationSeconds * 1000);
      const isError = reply.statusCode >= 500;
      const logFields = {
        event: isError ? "request.failed" : "request.completed",
        method: request.method,
        route,
        statusCode: reply.statusCode,
        statusClass,
        durationMs,
        requestId: request.id,
      };
      if (isError) {
        request.log.error(logFields, "request.failed");
      } else {
        request.log.info(logFields, "request.completed");
      }
    }
  });

  // Add metrics endpoint — optionally gated behind a bearer token.
  if (fastify.config.METRICS_ENABLED) {
    const metricsToken = fastify.config.METRICS_TOKEN;
    fastify.get(fastify.config.METRICS_PATH, async (request, reply) => {
      if (metricsToken) {
        const header = request.headers.authorization;
        const provided = header?.startsWith("Bearer ") ? header.slice(7) : null;
        if (provided !== metricsToken) {
          return reply.status(401).send({ error: "Unauthorized" });
        }
      }
      const metrics = await register.metrics();
      return reply.type(register.contentType).send(metrics);
    });
  }
};

// Extend request type
declare module "fastify" {
  interface FastifyRequest {
    startHrTime?: bigint;
  }
}

export default fp(metricsPlugin, {
  name: "metrics",
  dependencies: ["env"],
});
