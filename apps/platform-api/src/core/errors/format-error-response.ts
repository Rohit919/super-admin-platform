import { ErrorCode } from "./error-codes.js";

/**
 * Canonical error envelope (API_CONVENTIONS §39 / ERROR_HANDLING §93).
 *
 *   { error: { code, message, statusCode, requestId?, details?, timestamp, path? } }
 *
 * Clients branch on `error.code` (stable, machine-readable) — never on
 * `error.message`. `requestId` correlates the failure with server logs.
 *
 * This is the single serializer used by the global error handler and the
 * not-found handler so every error path is byte-consistent.
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
    requestId?: string;
    details?: unknown;
    timestamp: string;
    path?: string;
    retryAfter?: number;
  };
}

export interface ErrorEnvelopeInput {
  code?: string;
  message: string;
  statusCode: number;
  requestId?: string;
  details?: unknown;
  path?: string;
  /** Seconds until retry — surfaced on 429 responses. */
  retryAfter?: number;
}

export function formatErrorResponse(input: ErrorEnvelopeInput): ErrorResponse {
  return {
    error: {
      code: input.code ?? ErrorCode.INTERNAL_ERROR,
      message: input.message,
      statusCode: input.statusCode,
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      ...(input.details !== undefined ? { details: input.details } : {}),
      timestamp: new Date().toISOString(),
      ...(input.path !== undefined ? { path: input.path } : {}),
      ...(input.retryAfter !== undefined
        ? { retryAfter: input.retryAfter }
        : {}),
    },
  };
}
