// Side-effect import — starts OTel (if OTEL_ENABLED) before anything else loads,
// so instrumentation patches http/fastify/prisma at module-load time.
import { stopTelemetry } from "./telemetry.js";

import { loadSecrets } from "./secrets.js";
import { buildApp } from "./app.js";
import { logger } from "./core/utils/logger.js";

// Load secrets from the configured provider into process.env before the app
// (and @fastify/env) reads them. Exits 1 on failure.
await loadSecrets();

// Build the app at module scope so the shutdown handlers can reference it.
const app = await buildApp().catch((err) => {
  logger.error({ err }, "Failed to build application");
  process.exit(1);
});

const start = async () => {
  try {
    await app.listen({
      port: app.config.PORT,
      host: app.config.HOST,
    });

    logger.info(`Server ready — http://${app.config.HOST}:${app.config.PORT}`);
    logger.info(
      `API: http://${app.config.HOST}:${app.config.PORT}${app.config.API_PREFIX}/${app.config.API_VERSION}`,
    );
    if (app.config.SWAGGER_ENABLED) {
      logger.info(
        `Docs: http://${app.config.HOST}:${app.config.PORT}${app.config.SWAGGER_PATH}`,
      );
    }
    if (app.config.METRICS_ENABLED) {
      logger.info(
        `Metrics: http://${app.config.HOST}:${app.config.PORT}${app.config.METRICS_PATH}`,
      );
    }
  } catch (err) {
    logger.error({ err }, "Server startup failed");
    process.exit(1);
  }
};

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// 1. Stop accepting new connections
// 2. Drain in-flight requests (Fastify handles this in app.close())
// 3. Fire onClose hooks (Prisma $disconnect, etc.)
// 4. Exit cleanly — with a hard deadline so a hung connection can't block a deploy.
const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutdown signal received — draining connections");

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out after 10s — forcing exit");
    process.exit(1);
  }, 10_000);
  // Don't let this timer keep the event loop alive if shutdown finishes early.
  forceExit.unref();

  try {
    await app.close();
    await stopTelemetry();
    logger.info("Server closed cleanly");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Unhandled errors — programming errors, not operational. Log and exit. ──────
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — process will exit");
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal(
    { reason, promise: String(promise) },
    "Unhandled promise rejection — process will exit",
  );
  process.exit(1);
});

start();
