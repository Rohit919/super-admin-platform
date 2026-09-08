import { Type, type Static } from "@sinclair/typebox";

/**
 * Environment variable schema — the single source of truth for all config.
 * Validated at startup by @fastify/env (see plugins/env.ts).
 */
export const envSchema = Type.Object({
  NODE_ENV: Type.String({ default: "development" }),
  PORT: Type.Number({ default: 3000 }),
  HOST: Type.String({ default: "0.0.0.0" }),
  LOG_LEVEL: Type.String({ default: "info" }),

  // Database — DATABASE_URL is the app connection (through PgBouncer in prod).
  // DATABASE_DIRECT_URL bypasses the pooler for migrations (Prisma needs a
  // direct session). Optional: falls back to DATABASE_URL when unset.
  DATABASE_URL: Type.String(),
  DATABASE_DIRECT_URL: Type.Optional(Type.String()),

  // Redis (distributed rate limiting, queues)
  REDIS_URL: Type.String({ default: "redis://localhost:6379" }),

  // Authentication
  JWT_SECRET: Type.String({ minLength: 32 }),
  JWT_EXPIRES_IN: Type.String({ default: "15m" }),
  REFRESH_TOKEN_EXPIRES_IN: Type.String({ default: "7d" }),
  // Sets the Secure flag on the refresh-token cookie. Enable in production
  // (HTTPS); leave false for local HTTP dev.
  HTTPS_ONLY: Type.Boolean({ default: false }),

  // API
  API_PREFIX: Type.String({ default: "/api" }),
  API_VERSION: Type.String({ default: "v1" }),

  // Rate Limiting
  RATE_LIMIT_MAX: Type.Number({ default: 100 }),
  RATE_LIMIT_TIME_WINDOW: Type.Number({ default: 60000 }),

  // CORS
  CORS_ORIGIN: Type.String({
    default: "http://localhost:3001,http://localhost:3000",
  }),
  CORS_CREDENTIALS: Type.Boolean({ default: true }),

  // Monitoring
  METRICS_ENABLED: Type.Boolean({ default: true }),
  METRICS_PATH: Type.String({ default: "/metrics" }),
  // Optional bearer token to protect the /metrics endpoint. If unset, /metrics is open (dev).
  METRICS_TOKEN: Type.Optional(Type.String({ minLength: 20 })),

  // Swagger — disabled by default; must be explicitly enabled (avoids exposing the schema in prod)
  SWAGGER_ENABLED: Type.Boolean({ default: false }),
  SWAGGER_PATH: Type.String({ default: "/documentation" }),

  // Secrets provider: env (default) | aws | vault | doppler
  SECRETS_PROVIDER: Type.String({ default: "env" }),

  // Tracing — opt-in. When enabled, spans are exported to the OTLP endpoint.
  OTEL_ENABLED: Type.Boolean({ default: false }),
  OTEL_EXPORTER_OTLP_ENDPOINT: Type.String({
    default: "http://localhost:4318/v1/traces",
  }),
  OTEL_SERVICE_NAME: Type.String({ default: "platform-api" }),

  // White-label branding — served by GET /api/v1/branding for the Admin to
  // apply at runtime. These are the DEFAULT (single-tenant) values; a real
  // multi-tenant deployment resolves branding per tenant in the route instead.
  // See docs/white-label/WHITE-LABEL-RUNTIME-CONFIG.md.
  BRAND_APP_NAME: Type.String({ default: "Super Admin Platform" }),
  BRAND_SHORT_NAME: Type.String({ default: "Super Admin" }),
  BRAND_LOGO: Type.Optional(Type.String()),
  BRAND_LOGO_DARK: Type.Optional(Type.String()),
  BRAND_ICON: Type.Optional(Type.String()),
  BRAND_FAVICON: Type.Optional(Type.String()),
  BRAND_COLOR_PRIMARY: Type.String({ default: "#4f46e5" }),
  BRAND_COLOR_SECONDARY: Type.Optional(Type.String()),
  BRAND_COLOR_ACCENT: Type.Optional(Type.String()),
  BRAND_COMPANY_NAME: Type.Optional(Type.String()),
  BRAND_DESCRIPTION: Type.Optional(Type.String()),
});

export type Env = Static<typeof envSchema>;
