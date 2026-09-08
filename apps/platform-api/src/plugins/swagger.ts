import fp from "fastify-plugin";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import type { FastifyPluginAsync } from "fastify";

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  if (
    fastify.config.SWAGGER_ENABLED &&
    fastify.config.NODE_ENV === "production"
  ) {
    fastify.log.warn(
      "SWAGGER_ENABLED=true in production — this exposes your full API schema. Disable unless intentional.",
    );
  }

  // Register Swagger
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Super Admin Platform API",
        description:
          "Super Admin Platform — control-plane backend (platform-api). Fastify, TypeScript, Prisma.",
        version: "1.0.0",
      },
      // Don't set servers - let Swagger UI auto-detect from browser URL
      // Tags are optional - Swagger auto-discovers them from routes!
      // Define tags here only if you want to control order or add descriptions
      tags: [
        { name: "Meta", description: "API index and metadata" },
        { name: "Health", description: "Health check endpoints" },
        {
          name: "Authentication",
          description: "Authentication & account recovery endpoints",
        },
        { name: "Users", description: "User management endpoints" },
        { name: "Roles", description: "RBAC role management (admin)" },
        {
          name: "Permissions",
          description: "RBAC permission registry (admin)",
        },
        { name: "Admin", description: "Admin-only diagnostics" },
        {
          name: "Platform",
          description: "Super Admin platform control-plane endpoints",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  // Register Swagger UI
  if (fastify.config.SWAGGER_ENABLED) {
    await fastify.register(fastifySwaggerUI, {
      routePrefix: fastify.config.SWAGGER_PATH,
      uiConfig: {
        docExpansion: "none",
        deepLinking: true,
        persistAuthorization: true,
        // Safari compatibility
        tryItOutEnabled: true,
      },
      // Disable staticCSP for better Safari compatibility
      staticCSP: false,
      transformSpecification: (swaggerObject, _req, _reply) => {
        // Create a copy without host for Safari compatibility
        const spec = { ...swaggerObject };

        delete spec.host;
        return spec;
      },
    });
  }
};

export default fp(swaggerPlugin, {
  name: "swagger",
  dependencies: ["env"],
});
