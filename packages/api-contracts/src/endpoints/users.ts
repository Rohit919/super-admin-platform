import { API_VERSION, encodeId } from "./common.js";

/**
 * User endpoint paths. Mirrors routes registered under `/api/v1/users`.
 *
 * ROOT   — collection (GET list, POST create).
 * ME     — authenticated profile.
 * BY_ID  — client-facing URL with an encoded id (GET/PATCH/DELETE share it).
 * ROUTE_* — Fastify route templates (`:userId`) for backend registration.
 */
const USERS_BASE = `${API_VERSION}/users`;

export const USER_ENDPOINTS = {
  ROOT: USERS_BASE,
  ME: `${USERS_BASE}/me`,

  BY_ID: (userId: string) => `${USERS_BASE}/${encodeId(userId)}`,

  // Fastify route templates
  ROUTE_BY_ID: `${USERS_BASE}/:userId`,
} as const;

/**
 * Sub-paths RELATIVE to the module registration prefix (`/users`).
 *
 * The API registers `userRoutes` under `${API_VERSION}/users`, so each route
 * uses a relative path. These keep the backend registration in sync with the
 * absolute paths above without double-prefixing.
 */
export const USER_ROUTES = {
  LIST: "/",
  ME: "/me",
  BY_ID: "/:userId",
} as const;
