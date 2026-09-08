import { API_VERSION } from "./common.js";

/**
 * Health / ops endpoint paths.
 *
 * Health + readiness are mounted under the versioned prefix (`/api/v1/health`,
 * `/api/v1/ready`). Metrics and docs live outside the business API and are
 * configured via env (METRICS_PATH, SWAGGER_PATH) — the defaults are mirrored
 * here for centralized reference (API_ENDPOINTS §12).
 */
export const HEALTH_ENDPOINTS = {
  API_ROOT: API_VERSION,
  HEALTH: `${API_VERSION}/health`,
  READY: `${API_VERSION}/ready`,

  // Configurable, outside the versioned business API (defaults shown).
  METRICS: "/metrics",
  DOCUMENTATION: "/documentation",
} as const;
