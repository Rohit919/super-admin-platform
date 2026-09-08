/**
 * Global Fastify hooks and error/404 handlers — barrel.
 *
 * `registerGlobalHooks` and `registerErrorHandlers` preserve the public API
 * used by app.ts and the test harness. Individual hook files are split out
 * for discoverability (on-request, pre-handler, error-handler).
 */

import type { FastifyInstance } from "fastify";
import { registerOnRequestHook } from "./on-request.js";
import { registerPreHandlerHook } from "./pre-handler.js";
import { registerErrorHandler } from "./error-handler.js";

export function registerGlobalHooks(app: FastifyInstance): void {
  registerOnRequestHook(app);
  registerPreHandlerHook(app);
}

export function registerErrorHandlers(app: FastifyInstance): void {
  registerErrorHandler(app);
}

// Also export the individual registrars for direct use if needed.
export { registerOnRequestHook } from "./on-request.js";
export { registerPreHandlerHook } from "./pre-handler.js";
export { registerErrorHandler } from "./error-handler.js";
