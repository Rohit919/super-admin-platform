import type { Env } from "./env.js";

/**
 * Typed, derived configuration helpers.
 *
 * `Env` is the raw validated environment. This module derives convenience
 * values from it so modules don't repeat parsing/branching logic.
 *
 * The raw Env is still exposed on `fastify.config` by the env plugin.
 * Use these helpers when you need a computed/derived value.
 */

export interface AppConfig {
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  readonly apiBasePath: string;
  readonly corsOrigins: string[];
}

export function deriveConfig(env: Env): AppConfig {
  return {
    isProduction: env.NODE_ENV === "production",
    isDevelopment: env.NODE_ENV === "development",
    isTest: env.NODE_ENV === "test",
    apiBasePath: `${env.API_PREFIX}/${env.API_VERSION}`,
    corsOrigins: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
  };
}
