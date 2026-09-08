import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

/**
 * API index — served at the bare API prefix (e.g. GET /api/v1).
 * Returns version info and a catalog of available endpoints so hitting the
 * prefix root is useful instead of returning 404.
 */
const apiIndexRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const base = `${fastify.config.API_PREFIX}/${fastify.config.API_VERSION}`;

  fastify.get(
    "/",
    {
      schema: {
        description: "API index — version and available endpoints",
        tags: ["Meta"],
        response: {
          200: Type.Object({
            success: Type.Literal(true),
            data: Type.Object({
              name: Type.String(),
              version: Type.String(),
              environment: Type.String(),
              documentation: Type.String(),
              endpoints: Type.Array(
                Type.Object({
                  method: Type.String(),
                  path: Type.String(),
                  auth: Type.Boolean(),
                  description: Type.String(),
                }),
              ),
            }),
          }),
        },
      },
    },
    async (_request, reply) => {
      return reply.send({
        success: true,
        data: {
          name: "Super Admin Platform API",
          version: fastify.config.API_VERSION,
          environment: fastify.config.NODE_ENV,
          documentation: fastify.config.SWAGGER_ENABLED
            ? fastify.config.SWAGGER_PATH
            : "disabled",
          endpoints: [
            {
              method: "GET",
              path: `${base}/health`,
              auth: false,
              description: "Liveness probe",
            },
            {
              method: "GET",
              path: `${base}/ready`,
              auth: false,
              description: "Readiness probe (DB check)",
            },
            {
              method: "POST",
              path: `${base}/auth/register`,
              auth: false,
              description: "Create an account",
            },
            {
              method: "POST",
              path: `${base}/auth/login`,
              auth: false,
              description: "Log in, get tokens",
            },
            {
              method: "POST",
              path: `${base}/auth/refresh`,
              auth: false,
              description: "Rotate refresh token",
            },
            {
              method: "POST",
              path: `${base}/auth/logout`,
              auth: false,
              description: "Revoke refresh token",
            },
            {
              method: "GET",
              path: `${base}/auth/verify`,
              auth: true,
              description: "Verify access token",
            },
            {
              method: "GET",
              path: `${base}/users/me`,
              auth: true,
              description: "Current user profile",
            },
            {
              method: "GET",
              path: `${base}/platform/dashboard`,
              auth: true,
              description: "Platform dashboard stats",
            },
            {
              method: "GET",
              path: `${base}/platform/tenants`,
              auth: true,
              description: "List tenants",
            },
            {
              method: "GET",
              path: `${base}/platform/audit`,
              auth: true,
              description: "Platform audit log",
            },
          ],
        },
      });
    },
  );
};

export default apiIndexRoutes;
