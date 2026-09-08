import Fastify from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { logger } from "@core/utils/logger.js";
import {
  registerGlobalHooks,
  registerErrorHandlers,
} from "@core/hooks/index.js";
import { registerTenantResolutionHook } from "@core/tenant/index.js";
import { RateLimitError } from "@core/errors/index.js";

// ── Infrastructure plugins ──────────────────────────────────────────────────
import envPlugin from "./plugins/env.js";
import corsPlugin from "./plugins/cors.js";
import redisPlugin from "./plugins/redis.js";
import queuePlugin from "./plugins/queue.js";
import dbPlugin from "./plugins/db.js";
import authPlugin from "./plugins/auth.js";
import authorizationPlugin from "./plugins/authorization.js";
import platformPlugin from "./plugins/platform.js";
import metricsPlugin from "./plugins/metrics.js";
import swaggerPlugin from "./plugins/swagger.js";
import csrfPlugin from "./plugins/csrf.js";

// ── Domain modules (vertical slices) ────────────────────────────────────────
import rootRoutes from "./modules/root/root.routes.js";
import apiIndexRoutes from "./modules/api-index/api-index.routes.js";
import healthRoutes from "./modules/health/health.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import authRecoveryRoutes from "./modules/auth/auth-recovery.routes.js";
import userRoutes from "./modules/users/users.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import rolesRoutes from "./modules/roles/roles.routes.js";
import brandingRoutes from "./modules/branding/branding.routes.js";
import tenantsRoutes from "./modules/tenants/tenants.routes.js";
import platformRoutes from "./modules/platform/platform.routes.js";
import credentialRoutes from "./modules/platform/credential.routes.js";
import planRoutes from "./modules/platform/plan.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: logger as any,
    trustProxy: true,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
    disableRequestLogging: false,
    maxParamLength: 200,
    // Strip undeclared body properties (mass-assignment defence) and fill schema
    // defaults. TypeBox objects are additionalProperties:false, so removeAdditional
    // silently drops unknown fields instead of rejecting.
    ajv: {
      customOptions: {
        removeAdditional: true,
        useDefaults: true,
        coerceTypes: "array",
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // ── Infrastructure plugin registration (order matters) ──────────────────────
  await app.register(envPlugin);
  await app.register(corsPlugin);
  await app.register(redisPlugin);
  await app.register(queuePlugin);
  await app.register(dbPlugin);
  await app.register(authPlugin);
  await app.register(authorizationPlugin);
  await app.register(platformPlugin);
  await app.register(metricsPlugin);
  await app.register(swaggerPlugin);

  const sensiblePlugin = await import("@fastify/sensible");
  await app.register(sensiblePlugin.default);

  const cookiePlugin = await import("@fastify/cookie");
  await app.register(cookiePlugin.default);

  // CSRF defense-in-depth for cookie-bearing state changes (SECURITY.md §30/§74).
  // Registered after cookie parsing and CORS so it shares the origin allowlist.
  await app.register(csrfPlugin);

  const helmetPlugin = await import("@fastify/helmet");
  await app.register(helmetPlugin.default, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Swagger UI needs inline scripts
        styleSrc: ["'self'", "'unsafe-inline'"], // Swagger UI needs inline styles
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
      // Report-only in non-production so a bad directive doesn't break local dev.
      reportOnly: process.env.NODE_ENV !== "production",
    },
    crossOriginEmbedderPolicy: false, // Swagger UI assets
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: {
      maxAge: 31_536_000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  });

  const rateLimitPlugin = await import("@fastify/rate-limit");
  await app.register(rateLimitPlugin.default, {
    max: app.config.RATE_LIMIT_MAX,
    timeWindow: app.config.RATE_LIMIT_TIME_WINDOW,
    // Distributed store: counters are shared across all API replicas via Redis.
    // If Redis is unreachable, @fastify/rate-limit falls back to its in-memory
    // store automatically (fail-open — degraded enforcement, not an outage).
    redis: app.redis,
    // Don't count health/readiness/metrics against the global limit.
    allowList: (req) => {
      const base = `${app.config.API_PREFIX}/${app.config.API_VERSION}`;
      return (
        req.url === `${base}/health` ||
        req.url === `${base}/ready` ||
        req.url === app.config.METRICS_PATH
      );
    },
    // Throw a RateLimitError so the throttle response flows through the global
    // error handler — which emits the canonical envelope (ERROR_HANDLING §22)
    // AND sets the Retry-After header. Returning a plain object here breaks
    // per-route limits: @fastify/rate-limit throws the returned value, and a
    // non-Error object is classified as a 500 "programming error" by the
    // handler. A RateLimitError (an AppError, statusCode 429) is handled
    // correctly for both the global and per-route limiters.
    errorResponseBuilder: (_request, context) => {
      throw new RateLimitError(
        "Too many requests. Please try again later.",
        Math.ceil(context.ttl / 1000),
      );
    },
  });

  // ── Global hooks (user context in logs, etc.) ───────────────────────────────
  registerGlobalHooks(app);

  // ── Tenant resolution ───────────────────────────────────────────────────────
  // Resolves + validates the active tenant for authenticated requests and
  // attaches request.tenant. Registered after auth/global hooks so request.user
  // (and its tenantId claim) is available; before routes so per-route guards
  // and RBAC can rely on request.tenant. (MULTI-TENANT-ARCHITECTURE §49)
  registerTenantResolutionHook(app);

  // ── Error and 404 handlers ──────────────────────────────────────────────────
  // Registered BEFORE routes so every child route context inherits the canonical
  // error envelope. Fastify captures the error handler when a child context
  // loads, so setting it after route registration would leave those routes on
  // the default Fastify error shape.
  registerErrorHandlers(app);

  // ── Root landing page (no API prefix) ───────────────────────────────────────
  await app.register(rootRoutes);

  // ── Versioned API — each module is a self-contained vertical slice ──────────
  await app.register(
    async function apiRoutes(fastify) {
      await fastify.register(apiIndexRoutes);
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
    { prefix: `${app.config.API_PREFIX}/${app.config.API_VERSION}` },
  );

  // ── Graceful shutdown log ────────────────────────────────────────────────────
  app.addHook("onClose", async () => {
    logger.info("Server is shutting down...");
  });

  return app;
}
