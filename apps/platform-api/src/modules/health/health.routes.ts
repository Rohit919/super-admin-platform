import { monitorEventLoopDelay } from "perf_hooks";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { getCircuitBreaker } from "@core/circuit-breaker.js";

// ── Event-loop lag monitor ────────────────────────────────────────────────────
// A histogram sampled at 20ms resolution; measurements are in nanoseconds.
// The monitor is module-scoped so it tracks cumulative lag rather than
// spinning up a fresh one per request.
const lagMonitor = monitorEventLoopDelay({ resolution: 20 });
lagMonitor.enable();

/** Current P99 event-loop lag in milliseconds (from the rolling histogram). */
function getEventLoopLagMs(): number {
  return lagMonitor.percentile(99) / 1e6;
}

/** Threshold above which the process is considered degraded. Read per-request
 *  so tests can override via `process.env.EVENT_LOOP_LAG_THRESHOLD_MS`. */
function getLagThresholdMs(): number {
  return Number(process.env.EVENT_LOOP_LAG_THRESHOLD_MS ?? 200);
}

// ── Shared response sub-schemas ───────────────────────────────────────────────
const ServicesSchema = Type.Object({
  database: Type.Boolean(),
  redis: Type.Boolean(),
});

const EventLoopSchema = Type.Object({
  lagMs: Type.Number({ description: "P99 event-loop lag in milliseconds" }),
  healthy: Type.Boolean(),
});

const ProcessSchema = Type.Object({
  activeHandles: Type.Number(),
  activeRequests: Type.Number(),
});

const CircuitBreakersSchema = Type.Object({
  openBreakers: Type.Array(Type.String(), {
    description: "Names of circuit breakers currently in OPEN state",
  }),
  allClosed: Type.Boolean(),
});

const ReadyResponseBase = {
  services: ServicesSchema,
  eventLoop: EventLoopSchema,
  process: ProcessSchema,
  circuitBreakers: CircuitBreakersSchema,
  timestamp: Type.String(),
};

const healthRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // ── GET /health (liveness) ──────────────────────────────────────────────────
  fastify.get(
    "/health",
    {
      schema: {
        description:
          "Liveness probe — checks the Node.js process is responsive",
        tags: ["Health"],
        response: {
          200: Type.Object({
            status: Type.Literal("ok"),
            timestamp: Type.String(),
            uptime: Type.Number(),
            environment: Type.String(),
          }),
        },
      },
    },
    async (_request, reply) => {
      return reply.send({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV ?? "development",
      });
    },
  );

  // ── GET /ready (readiness) ──────────────────────────────────────────────────
  fastify.get(
    "/ready",
    {
      schema: {
        description:
          "Readiness probe — verifies database, Redis, event-loop health, and circuit-breaker state before routing traffic",
        tags: ["Health"],
        response: {
          200: Type.Object({
            status: Type.Union([
              Type.Literal("ready"),
              Type.Literal("degraded"),
            ]),
            ...ReadyResponseBase,
          }),
          503: Type.Object({
            status: Type.Union([
              Type.Literal("not_ready"),
              Type.Literal("degraded"),
            ]),
            ...ReadyResponseBase,
          }),
        },
      },
    },
    async (_request, reply) => {
      // ── Database check ────────────────────────────────────────────────────
      let isDatabaseReady = false;
      try {
        await fastify.prisma.$queryRaw`SELECT 1`;
        isDatabaseReady = true;
      } catch (err) {
        fastify.log.error({ err }, "Database readiness check failed");
      }

      // ── Redis check ───────────────────────────────────────────────────────
      let isRedisReady = false;
      try {
        const pong = await fastify.redis.ping();
        isRedisReady = pong === "PONG";
      } catch (err) {
        fastify.log.warn({ err }, "Redis readiness check failed");
      }

      // ── Circuit-breaker check ─────────────────────────────────────────────
      // Collect all known breaker names that are currently OPEN. A breaker in
      // OPEN state means the downstream service is considered unavailable.
      // We probe well-known service names used in the codebase; unknown names
      // simply return undefined from getCircuitBreaker and are skipped.
      const knownBreakers = ["sendgrid", "slack", "stripe", "external-api"];
      const openBreakers: string[] = knownBreakers.filter((name) => {
        const breaker = getCircuitBreaker(name);
        return breaker?.opened ?? false;
      });
      const allCircuitsClosed = openBreakers.length === 0;

      // ── Event-loop lag check ──────────────────────────────────────────────
      const lagMs = getEventLoopLagMs();
      const isEventLoopHealthy = lagMs < getLagThresholdMs();

      // ── Active handles / requests (Node.js internal process counters) ─────
      // process._getActiveHandles / _getActiveRequests are untyped but stable
      // since Node.js 0.10. We cast to avoid strict TS errors.
      const activeHandles: number =
        (
          process as NodeJS.Process & { _getActiveHandles?: () => unknown[] }
        )._getActiveHandles?.()?.length ?? 0;
      const activeRequests: number =
        (
          process as NodeJS.Process & { _getActiveRequests?: () => unknown[] }
        )._getActiveRequests?.()?.length ?? 0;

      // ── Determine overall readiness ───────────────────────────────────────
      // Service is not ready if: DB unreachable, Redis unreachable,
      // event-loop overloaded, or any critical circuit breaker is open.
      const isReady =
        isDatabaseReady &&
        isRedisReady &&
        isEventLoopHealthy &&
        allCircuitsClosed;

      // "degraded" = DB up but one of the secondary checks is failing
      const status = isReady
        ? "ready"
        : isDatabaseReady
          ? "degraded"
          : "not_ready";

      if (!isRedisReady) {
        fastify.log.warn("Redis is not responding — marking as not ready");
      }
      if (openBreakers.length > 0) {
        fastify.log.warn(
          { openBreakers },
          "Open circuit breakers detected — marking as degraded",
        );
      }
      if (!isEventLoopHealthy) {
        fastify.log.warn(
          { lagMs },
          "Event-loop lag exceeds readiness threshold",
        );
      }

      const statusCode = isReady ? 200 : 503;

      return reply.status(statusCode).send({
        status,
        services: { database: isDatabaseReady, redis: isRedisReady },
        eventLoop: { lagMs, healthy: isEventLoopHealthy },
        process: { activeHandles, activeRequests },
        circuitBreakers: { openBreakers, allClosed: allCircuitsClosed },
        timestamp: new Date().toISOString(),
      });
    },
  );
};

export default healthRoutes;
