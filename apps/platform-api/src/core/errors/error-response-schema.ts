import { ErrorEnvelope } from "@app/api-contracts";

/**
 * Shared error-response schema for Swagger/OpenAPI (ERROR_HANDLING §58).
 *
 * Every error the API returns uses the canonical envelope, so route authors
 * document failure behavior by spreading `errorResponses(...)` into their
 * schema `response` map instead of redeclaring the shape per status code:
 *
 *   schema: {
 *     response: {
 *       200: OkSchema,
 *       ...errorResponses(400, 401, 404),
 *     },
 *   }
 *
 * The status → envelope binding keeps the OpenAPI document honest (consumers
 * see which failures each endpoint can produce) without coupling routes to a
 * hand-written per-status schema.
 */
export const ErrorResponseSchema = ErrorEnvelope;

export type ErrorStatus =
  400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 502 | 503;

export function errorResponses(
  ...statuses: ErrorStatus[]
): Record<number, typeof ErrorEnvelope> {
  const out: Record<number, typeof ErrorEnvelope> = {};
  for (const status of statuses) {
    out[status] = ErrorEnvelope;
  }
  return out;
}
