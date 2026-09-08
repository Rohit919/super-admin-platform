import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL ?? "info";

export const logger = pino({
  level: logLevel,
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
          colorize: true,
          singleLine: false,
        },
      },
  formatters: {
    level: (label: string) => ({ level: label.toUpperCase() }),
  },
  // Redaction at the logger boundary (OBSERVABILITY §72 / §2.4). Secrets and
  // sensitive request data must never reach the log sink even if a developer
  // accidentally logs a whole request, header bag, or config object. Paths use
  // pino's redaction syntax; `censor` replaces the value with a fixed marker.
  redact: {
    paths: [
      // Auth / session material on the standard req serializer output
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "headers.authorization",
      "headers.cookie",
      'headers["set-cookie"]',
      // Common secret-bearing fields anywhere in the log object (one level deep)
      "password",
      "*.password",
      "token",
      "*.token",
      "accessToken",
      "*.accessToken",
      "refreshToken",
      "*.refreshToken",
      "jwt",
      "*.jwt",
      "apiKey",
      "*.apiKey",
      "clientSecret",
      "*.clientSecret",
      "secret",
      "*.secret",
      "JWT_SECRET",
      "DATABASE_URL",
      "DATABASE_DIRECT_URL",
      "REDIS_URL",
      "METRICS_TOKEN",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  base: {
    env: process.env.NODE_ENV,
    revision: process.env.COMMIT_SHA ?? "unknown",
  },
});

export const createLogger = (module: string) => logger.child({ module });
