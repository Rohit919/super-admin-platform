import type { FastifyInstance } from "fastify";

/**
 * preHandler hook — attaches authenticated user context to the request logger.
 * Runs after preValidation (where jwtVerify populates request.user), so every
 * log line from an authenticated request carries userId/userRole.
 */
export function registerPreHandlerHook(app: FastifyInstance): void {
  app.addHook("preHandler", async (request) => {
    if (request.user) {
      request.log = request.log.child({
        userId: request.user.id,
        userRole: request.user.role,
      });
    }
  });
}
