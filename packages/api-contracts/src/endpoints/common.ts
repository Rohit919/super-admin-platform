/**
 * Centralized API version + base path (API_ENDPOINTS §5).
 *
 * Single source of truth for the versioned prefix. The Fastify API composes it
 * from env (API_PREFIX/API_VERSION → `/api/v1`); this constant mirrors that
 * default so the Admin client and tests never hardcode `/api/v1` independently.
 *
 * The registry owns PATHS only — never hosts, query params, methods, or auth
 * (API_ENDPOINTS §6, §26, §31, §41).
 */
export const API_PREFIX = "/api";
export const API_VERSION = `${API_PREFIX}/v1`;

/** Safely build a dynamic path segment (API_ENDPOINTS §22). */
export function encodeId(id: string): string {
  return encodeURIComponent(id);
}
