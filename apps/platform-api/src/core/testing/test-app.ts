/**
 * Test application factory.
 * Builds a fully wired Fastify instance with the real plugin/route stack but
 * with Prisma and env replaced by in-memory mocks so tests never need a
 * database connection or a .env file.
 */

import Fastify from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
import authPlugin from "../../plugins/auth.js";
import authorizationPlugin from "../../plugins/authorization.js";
import platformPlugin from "../../plugins/platform.js";
import csrfPlugin from "../../plugins/csrf.js";
import corsPlugin from "../../plugins/cors.js";
import { registerErrorHandlers } from "../hooks/index.js";
import { registerTenantResolutionHook } from "../tenant/index.js";
import rootRoutes from "../../modules/root/root.routes.js";
import healthRoutes from "../../modules/health/health.routes.js";
import brandingRoutes from "../../modules/branding/branding.routes.js";
import authRoutes from "../../modules/auth/auth.routes.js";
import authRecoveryRoutes from "../../modules/auth/auth-recovery.routes.js";
import userRoutes from "../../modules/users/users.routes.js";
import rolesRoutes from "../../modules/roles/roles.routes.js";
import adminRoutes from "../../modules/admin/admin.routes.js";
import tenantsRoutes from "../../modules/tenants/tenants.routes.js";
import platformRoutes from "../../modules/platform/platform.routes.js";
import credentialRoutes from "../../modules/platform/credential.routes.js";
import planRoutes from "../../modules/platform/plan.routes.js";
import type { Env } from "../../plugins/env.js";
import type { PrismaClient } from "@prisma/client";

// ─── default test env ─────────────────────────────────────────────────────────
export const TEST_ENV: Env = {
  NODE_ENV: "test",
  PORT: 3000,
  HOST: "127.0.0.1",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://test:test@localhost/test",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "test-secret-that-is-long-enough-for-hs256",
  JWT_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_IN: "7d",
  API_PREFIX: "/api",
  API_VERSION: "v1",
  RATE_LIMIT_MAX: 1000,
  RATE_LIMIT_TIME_WINDOW: 60000,
  CORS_ORIGIN: "http://localhost:3000",
  CORS_CREDENTIALS: true,
  HTTPS_ONLY: false,
  METRICS_ENABLED: false,
  METRICS_PATH: "/metrics",
  SWAGGER_ENABLED: false,
  SWAGGER_PATH: "/documentation",
  SECRETS_PROVIDER: "env",
  OTEL_ENABLED: false,
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318/v1/traces",
  OTEL_SERVICE_NAME: "platform-api-test",
  BRAND_APP_NAME: "Super Admin Platform",
  BRAND_SHORT_NAME: "Super Admin",
  BRAND_COLOR_PRIMARY: "#4f46e5",
};

// ─── mock Prisma type ─────────────────────────────────────────────────────────
export type MockPrisma = {
  // Top-level client methods ($connect, $queryRaw, etc.) are functions;
  // model accessors (user, tenant, ...) are records of functions.
  [K in keyof PrismaClient]: K extends `$${string}`
    ? (...args: unknown[]) => unknown
    : Record<string, (...args: unknown[]) => unknown>;
};

export function buildMockPrisma(
  overrides: Partial<MockPrisma> = {},
): MockPrisma {
  const defaults: Record<string, unknown> = {
    $connect: async () => {},
    $disconnect: async () => {},
    $queryRaw: async () => [{ "?column?": 1 }],
    user: {
      findUnique: async () => null,
      create: async () => null,
      update: async () => null,
      updateMany: async () => ({ count: 0 }),
      count: async () => 0,
    },
    refreshToken: {
      create: async () => null,
      findUnique: async () => null,
      update: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
    otpChallenge: {
      create: async () => null,
      findFirst: async () => null,
      update: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
    passwordResetToken: {
      create: async () => null,
      findUnique: async () => null,
      update: async () => null,
    },
    // RBAC models — default to no assignments (default-deny) so tests must
    // opt into permissions by overriding userRole.findMany.
    userRole: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async () => null,
      delete: async () => null,
      deleteMany: async () => ({ count: 0 }),
      count: async () => 0,
    },
    role: {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => null,
      update: async () => null,
      delete: async () => null,
    },
    permission: {
      findMany: async () => [],
      findUnique: async () => null,
      upsert: async () => null,
    },
    rolePermission: {
      findMany: async () => [],
      create: async () => null,
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 0 }),
    },
    auditLog: {
      create: async () => null,
      findMany: async () => [],
    },
    // Multi-tenancy models. Default to no memberships/tenants so tokens carry
    // no tenant unless a test opts in by overriding these.
    tenant: {
      findUnique: async () => null,
      findFirst: async () => null,
      findMany: async () => [],
      create: async () => null,
      update: async () => null,
      upsert: async () => null,
      count: async () => 0,
    },
    tenantMembership: {
      findUnique: async () => null,
      findFirst: async () => null,
      findMany: async () => [],
      create: async () => null,
      update: async () => null,
      upsert: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
    // Platform gate. Default null => no platform access (default-deny). Tests
    // opt in by overriding platformMembership.findUnique.
    platformMembership: {
      findUnique: async () => null,
      findMany: async () => [],
      create: async () => null,
      update: async () => null,
      upsert: async () => null,
      count: async () => 0,
    },
    tenantApiCredential: {
      findUnique: async () => null,
      findMany: async () => [],
      create: async () => null,
      update: async () => null,
      count: async () => 0,
    },
    // Plans & entitlements (Phase 19.6). Default empty so tests opt in.
    plan: {
      findMany: async () => [],
      findUnique: async () => null,
      upsert: async () => null,
    },
    entitlement: {
      findMany: async () => [],
      findUnique: async () => null,
      upsert: async () => null,
    },
    planEntitlement: {
      upsert: async () => null,
    },
    tenantPlan: {
      findUnique: async () => null,
      upsert: async () => null,
    },
    tenantEntitlementOverride: {
      findMany: async () => [],
      upsert: async () => null,
      deleteMany: async () => ({ count: 0 }),
    },
    // $transaction: run the callback with the same mock client (interactive form).
    $transaction: async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => unknown)(merged);
      }
      // Array form: resolve each promise.
      return Promise.all(arg as Promise<unknown>[]);
    },
  };

  // Deep-merge per-model: a test overriding `user.findUnique` still keeps the
  // default `user.update`, so handlers that touch multiple methods don't 500.
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    const base = defaults[key];
    if (
      base &&
      typeof base === "object" &&
      typeof value === "object" &&
      value !== null
    ) {
      merged[key] = { ...(base as object), ...(value as object) };
    } else {
      merged[key] = value;
    }
  }

  return merged as unknown as MockPrisma;
}

// ─── app builder ─────────────────────────────────────────────────────────────
export interface BuildTestAppOptions {
  prisma?: Partial<MockPrisma>;
  env?: Partial<Env>;
  /** Override methods on the mock Redis client (e.g. mock ping to reject). */
  redis?: { ping?: () => Promise<string> };
}

export async function buildTestApp(options: BuildTestAppOptions = {}) {
  const env = { ...TEST_ENV, ...options.env };
  const mockPrisma = buildMockPrisma(options.prisma ?? {});

  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        removeAdditional: true,
        useDefaults: true,
        coerceTypes: "array",
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Inject mock env — name inside fp() so dependency checks pass
  await app.register(
    fp(
      async (fastify) => {
        fastify.decorate("config", env);
      },
      { name: "env" },
    ),
  );

  // Inject mock prisma (cast — the mock only implements methods the tests exercise)
  await app.register(
    fp(
      async (fastify) => {
        fastify.decorate("prisma", mockPrisma as unknown as PrismaClient);
      },
      { name: "prisma" },
    ),
  );

  // Inject mock redis — health route pings this; ping() always resolves 'PONG'
  await app.register(
    fp(
      async (fastify) => {
        const mockRedis = {
          ping: async () => "PONG",
          quit: async () => "OK" as const,
          disconnect: () => undefined,
          ...(options.redis ?? {}),
        };
        fastify.decorate(
          "redis",
          mockRedis as unknown as import("ioredis").Redis,
        );
      },
      { name: "redis" },
    ),
  );

  await app.register(authPlugin);
  await app.register(authorizationPlugin);
  await app.register(platformPlugin);

  const sensible = await import("@fastify/sensible");
  await app.register(sensible.default);

  const cookie = await import("@fastify/cookie");
  await app.register(cookie.default);

  // CORS + CSRF (defense-in-depth) — mirrors the production stack so security
  // behavior is exercised under test.
  await app.register(corsPlugin);
  await app.register(csrfPlugin);

  // Tenant resolution — mirrors production so tenant context is exercised under
  // test. Runs after auth (request.user available), before routes.
  registerTenantResolutionHook(app);

  // Error handlers must be registered BEFORE routes so the child route
  // encapsulation contexts inherit them (Fastify resolves the handler captured
  // when a child context loads).
  registerErrorHandlers(app);

  await app.register(rootRoutes);

  await app.register(
    async (fastify) => {
      await fastify.register(healthRoutes);
      await fastify.register(brandingRoutes);
      await fastify.register(authRoutes, { prefix: "/auth" });
      await fastify.register(authRecoveryRoutes, { prefix: "/auth" });
      await fastify.register(userRoutes, { prefix: "/users" });
      await fastify.register(adminRoutes, { prefix: "/admin" });
      await fastify.register(rolesRoutes, { prefix: "/admin" });
      await fastify.register(tenantsRoutes, { prefix: "/tenants" });
      await fastify.register(platformRoutes, { prefix: "/platform" });
      await fastify.register(credentialRoutes, { prefix: "/platform" });
      await fastify.register(planRoutes, { prefix: "/platform" });
    },
    { prefix: `${env.API_PREFIX}/${env.API_VERSION}` },
  );

  await app.ready();
  return app;
}

// ─── JWT helper ───────────────────────────────────────────────────────────────
export function signTestToken(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  payload: { id: string; email: string; role: string } = {
    id: "user-test-id",
    email: "test@example.com",
    role: "user",
  },
): string {
  return app.jwt.sign(payload);
}
