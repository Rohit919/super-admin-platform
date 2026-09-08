/**
 * CSRF strategy (SECURITY.md §30 / §74).
 *
 * Documented model for this API:
 *   - Access tokens are sent as `Authorization: Bearer …` headers. Browsers do
 *     not attach those automatically to cross-site requests, so header-authed
 *     endpoints are not CSRF-able (token theft via XSS remains the relevant
 *     threat, addressed by CSP/helmet + short-lived tokens).
 *   - The refresh/session credential is an HttpOnly, SameSite=Strict, path
 *     scoped cookie. SameSite=Strict is the primary CSRF defense for it.
 *
 * This plugin adds defense-in-depth on top of SameSite: for any state-changing
 * request that actually carries a cookie, it validates the Origin (falling back
 * to Referer) against the configured allowlist. A cross-origin cookie-bearing
 * mutation is rejected with 403 before it reaches a handler. Requests with no
 * cookie (pure Bearer API calls) are exempt, matching the documented model.
 */
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { AppError, ErrorCode } from "@core/errors/index.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** 403 with the dedicated CSRF code so clients/observability can branch on it. */
function csrfDenied(): AppError {
  return new AppError(
    "Cross-site request blocked.",
    403,
    true,
    undefined,
    ErrorCode.CSRF_FAILED,
  );
}

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.origin;
  } catch {
    return null;
  }
}

const csrfPlugin: FastifyPluginAsync = async (fastify) => {
  const allowedOrigins = new Set(
    fastify.config.CORS_ORIGIN.split(",")
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) => originOf(o) ?? o),
  );

  fastify.addHook("onRequest", async (request) => {
    if (SAFE_METHODS.has(request.method)) return;

    // Only cookie-bearing requests are subject to CSRF; Bearer-only calls are
    // not CSRF-able (see module header).
    const hasCookie = Boolean(request.headers.cookie);
    if (!hasCookie) return;

    const origin =
      originOf(request.headers.origin) ?? originOf(request.headers.referer);

    // No Origin/Referer header: browsers always attach one to cross-site
    // requests, so its absence indicates a non-browser client (curl, mobile,
    // server-to-server). We fall back to the cookie's SameSite=Strict as the
    // primary CSRF defense here (the documented model) rather than block
    // legitimate API clients.
    if (!origin) return;

    // Origin/Referer present but not on the allowlist → cross-site browser
    // request. Reject.
    if (!allowedOrigins.has(origin)) {
      request.log.warn(
        {
          event: "csrf.denied",
          reason: "origin-mismatch",
          origin,
          route: request.url,
          requestId: request.id,
        },
        "CSRF check failed: origin not allowed",
      );
      throw csrfDenied();
    }
  });
};

export default fp(csrfPlugin, {
  name: "csrf",
  dependencies: ["env", "cors"],
});
