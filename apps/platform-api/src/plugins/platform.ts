import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { PlatformService } from "@core/platform/index.js";

/**
 * Registers the PlatformService as `fastify.platform` — the Super Admin access
 * gate. Depends on `prisma`. Platform permission checks reuse
 * `fastify.authorization` (the RBAC engine), so no duplicate authorization
 * logic lives here.
 */
const platformPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("platform", new PlatformService(fastify.prisma));
};

declare module "fastify" {
  interface FastifyInstance {
    platform: PlatformService;
  }
}

export default fp(platformPlugin, {
  name: "platform",
  dependencies: ["prisma"],
});
