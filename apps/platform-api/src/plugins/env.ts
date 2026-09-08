import fp from "fastify-plugin";
import fastifyEnv from "@fastify/env";
import { envSchema, type Env } from "../config/env.js";

// Re-export Env so existing imports from the plugin keep working.
export type { Env } from "../config/env.js";

// Extend Fastify instance type
declare module "fastify" {
  interface FastifyInstance {
    config: Env;
  }
}

export default fp(
  async function envPlugin(fastify) {
    await fastify.register(fastifyEnv, {
      confKey: "config",
      schema: envSchema,
      dotenv: true,
      data: process.env,
    });
  },
  {
    name: "env",
  },
);
