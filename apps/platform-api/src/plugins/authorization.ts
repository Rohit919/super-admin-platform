import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { AuthorizationService } from "@core/authorization/index.js";

/**
 * Registers the AuthorizationService as `fastify.authorization`.
 * Depends on `prisma` (the DB decorator) — the service resolves roles and
 * permissions from the database.
 */
const authorizationPlugin: FastifyPluginAsync = async (fastify) => {
  const service = new AuthorizationService(fastify.prisma);
  fastify.decorate("authorization", service);
};

declare module "fastify" {
  interface FastifyInstance {
    authorization: AuthorizationService;
  }
}

export default fp(authorizationPlugin, {
  name: "authorization",
  dependencies: ["prisma"],
});
