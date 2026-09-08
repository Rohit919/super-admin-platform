import fp from "fastify-plugin";
import { PrismaClient, Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { assertTenantScoped } from "@core/tenant/tenant-scope-assertion.js";

// Extend Fastify instance type
declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

// Lower threshold in dev to surface N+1 patterns early; higher in prod to avoid noise.
const SLOW_QUERY_THRESHOLD_MS =
  process.env.NODE_ENV === "development" ? 100 : 500;
const QUERY_TIMEOUT_MS = 10_000;

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const isDev = fastify.config.NODE_ENV === "development";

  const base = new PrismaClient({
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ],
  });

  // ── Slow-query logging (all environments) ────────────────────────────────────
  // Logs any query slower than the threshold with model/duration so performance
  // regressions are visible. Full query text only in development.
  base.$on("query", (event: Prisma.QueryEvent) => {
    if (event.duration > SLOW_QUERY_THRESHOLD_MS) {
      fastify.log.warn(
        {
          durationMs: event.duration,
          ...(isDev ? { query: event.query } : {}),
        },
        "Slow database query",
      );
    }
  });
  base.$on("error", (event: Prisma.LogEvent) => {
    fastify.log.error({ target: event.target }, event.message);
  });

  // ── Query timeout (safety net for runaway queries) ───────────────────────────
  // A server-level guard: any single Prisma operation that exceeds the timeout
  // rejects instead of holding a worker indefinitely. Per-stage orchestrator
  // timeouts are tighter; this catches anything without one.
  // Dev/test-only guard: fail loudly if a tenant-owned model is queried without
  // tenant scope. NEVER runs in production and NEVER rewrites the query — it
  // only detects a missed tenant-scoped accessor (MULTI-TENANT §21, §59).
  const assertTenantScope = fastify.config.NODE_ENV !== "production";

  const prisma = base.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (assertTenantScope) {
          assertTenantScoped(model, operation, args);
        }
        return Promise.race([
          query(args),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Prisma query timeout (${QUERY_TIMEOUT_MS}ms): ${model ?? "raw"}.${operation}`,
                  ),
                ),
              QUERY_TIMEOUT_MS,
            ),
          ),
        ]);
      },
    },
  });

  await base.$connect();

  // The extended client is a superset of PrismaClient at runtime; cast for the
  // decorator so callers keep the familiar PrismaClient type.
  fastify.decorate("prisma", prisma as unknown as PrismaClient);

  fastify.addHook("onClose", async () => {
    await base.$disconnect();
  });
};

// Keep the Fastify plugin name as 'prisma' — other plugins declare
// `dependencies: ['prisma']` and the test harness relies on it.
export default fp(dbPlugin, {
  name: "prisma",
});
