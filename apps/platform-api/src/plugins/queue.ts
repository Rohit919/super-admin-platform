import fp from "fastify-plugin";
import { Queue } from "bullmq";
import type { FastifyPluginAsync } from "fastify";
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from "../queue/index.js";

declare module "fastify" {
  interface FastifyInstance {
    // Optional: the queue plugin is registered in the full app but not in the
    // test harness, so consumers must guard with `fastify.queues?.`.
    queues?: {
      notifications: Queue;
    };
  }
}

/**
 * BullMQ queue plugin. Creates Queue producers on the shared Redis connection
 * (reuses fastify.redis rather than opening new connections) and decorates
 * fastify.queues. Workers live in src/workers and run as separate processes.
 */
const queuePlugin: FastifyPluginAsync = async (fastify) => {
  const connection = fastify.redis;

  const notifications = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  fastify.decorate("queues", { notifications });

  fastify.addHook("onClose", async () => {
    await notifications.close();
  });
};

export default fp(queuePlugin, {
  name: "queue",
  dependencies: ["env", "redis"],
});
