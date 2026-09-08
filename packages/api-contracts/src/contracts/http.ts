/**
 * Shared HTTP method type (API_CONTRACTS §9).
 * Prevents arbitrary method strings scattered across the codebase.
 */
export const HttpMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];
