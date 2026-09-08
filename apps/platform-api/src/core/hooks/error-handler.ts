import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import {
  AppError,
  ErrorCode,
  RateLimitError,
  formatErrorResponse,
} from "../errors/index.js";

/**
 * Registers the global error handler and the not-found handler.
 *
 * Both emit the canonical error envelope (API_CONVENTIONS §39):
 *   { error: { code, message, requestId, details?, timestamp, path? } }
 *
 * `code` is a STABLE, machine-readable identifier that clients branch on.
 * `message` is human-readable and may change over time.
 */

/** Map a raw/unknown error to a stable code given its resolved status code. */
function resolveCode(
  error: FastifyError | AppError,
  statusCode: number,
): string {
  if (error instanceof AppError) return error.code;

  // Fastify schema validation failures arrive with an `error.validation` array.
  if ((error as FastifyError).validation) return ErrorCode.VALIDATION_ERROR;

  switch (statusCode) {
    case 400:
      return ErrorCode.VALIDATION_ERROR;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.RATE_LIMITED;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return statusCode >= 500
        ? ErrorCode.INTERNAL_ERROR
        : ErrorCode.VALIDATION_ERROR;
  }
}

/**
 * Turn Fastify's ajv validation array into machine-readable field details
 * (API_CONVENTIONS §40) so the Admin can render field-level errors without
 * parsing human-readable strings.
 */
function extractValidationDetails(
  error: FastifyError,
): { fields: Record<string, string> } | undefined {
  if (!error.validation) return undefined;
  const fields: Record<string, string> = {};
  for (const issue of error.validation) {
    // instancePath like "/email" → "email"; missing-property errors carry the
    // field name in params.missingProperty.
    const rawPath = (issue.instancePath ?? "")
      .replace(/^\//, "")
      .replace(/\//g, ".");
    const key =
      rawPath ||
      (issue.params && "missingProperty" in issue.params
        ? String((issue.params as { missingProperty: string }).missingProperty)
        : "request");
    fields[key] = issue.message ?? "Invalid value";
  }
  return Object.keys(fields).length ? { fields } : undefined;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const isOperational = error instanceof AppError && error.isOperational;

      if (!isOperational) {
        request.log.error(
          { err: error, requestId: request.id },
          "Unexpected programming error",
        );
      } else {
        request.log.warn(
          { err: error, requestId: request.id },
          "Operational error",
        );
      }

      const statusCode = error.statusCode ?? 500;
      const code = resolveCode(error, statusCode);

      // Never leak internal 5xx details in production.
      const message =
        statusCode >= 500 && process.env.NODE_ENV === "production"
          ? "Internal Server Error"
          : (error.message ?? "Internal Server Error");

      // Prefer explicit AppError details; otherwise surface validation field details.
      const details =
        error instanceof AppError &&
        statusCode < 500 &&
        error.details !== undefined
          ? error.details
          : extractValidationDetails(error);

      // Standard Retry-After for rate-limit errors that carry a hint — set as a
      // header AND echoed in the envelope body.
      const retryAfter =
        error instanceof RateLimitError && typeof error.retryAfter === "number"
          ? error.retryAfter
          : undefined;
      if (retryAfter !== undefined) {
        reply.header("retry-after", String(retryAfter));
      }

      // Single serializer assembles the canonical envelope (matches
      // @app/api-contracts ErrorEnvelope) so every error path is byte-consistent.
      return reply.status(statusCode).send(
        formatErrorResponse({
          code,
          message,
          statusCode,
          requestId: request.id,
          details,
          retryAfter,
        }),
      );
    },
  );

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send(
      formatErrorResponse({
        code: ErrorCode.NOT_FOUND,
        message: "Route not found",
        statusCode: 404,
        requestId: request.id,
        path: request.url,
      }),
    );
  });
}
