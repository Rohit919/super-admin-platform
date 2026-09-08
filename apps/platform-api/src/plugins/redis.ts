import fp from "fastify-plugin";
import { Redis } from "ioredis";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

/**
 * Redis plugin — a single shared ioredis connection used by the distributed
 * rate limiter and BullMQ. Registered once; other plugins reuse fastify.redis
 * rather than opening their own connections.
 *
 * Fail-open: a Redis outage must not crash the API. ioredis retries in the
 * background; connection errors are logged (throttled) rather than thrown.
 */
const redisPlugin: FastifyPluginAsync = async (fastify) => {
  const client = new Redis(fastify.config.REDIS_URL, {
    // Don't block startup forever if Redis is down; keep retrying in background.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });

  let loggedError = false;
  client.on("error", (err) => {
    // Throttle: log the first error, then stay quiet until reconnect to avoid flooding.
    if (!loggedError) {
      fastify.log.warn(
        { err },
        "Redis connection error (operating in degraded mode)",
      );
      loggedError = true;
    }
  });
  client.on("ready", () => {
    loggedError = false;
    fastify.log.info("Redis connected");
  });

  fastify.decorate("redis", client);

  fastify.addHook("onClose", async () => {
    await client.quit().catch(() => client.disconnect());
  });
};

export default fp(redisPlugin, {
  name: "redis",
  dependencies: ["env"],
});
