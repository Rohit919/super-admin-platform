import { Counter, register } from "prom-client";

/**
 * Security counters for actionable alerting (plan §15: "auth-failure spikes",
 * "authorization failures"). These are distinct from ordinary 4xx counts in
 * http_requests_total so an operator can alert specifically on a rise in
 * denied privileged access.
 *
 * Cardinality is deliberately tiny and NEVER user-controlled:
 *   - `type`  : "authentication" | "authorization" | "platform"
 *   - `reason`: a small fixed set of internal reasons
 * We never label by userId, permission string, route, IP, or any dynamic value.
 *
 * Registered against prom-client's default `register`, the same one the metrics
 * plugin exposes at /metrics — so these appear automatically with no wiring.
 */
export type SecurityFailureType =
  "authentication" | "authorization" | "platform";

export type SecurityFailureReason =
  "unauthenticated" | "missing_permission" | "not_platform_member";

// Guard against double-registration under test/hot-reload: reuse the existing
// metric if it's already on the default registry.
const existing = register.getSingleMetric("platform_security_failures_total");

export const securityFailuresTotal =
  (existing as Counter<string> | undefined) ??
  new Counter({
    name: "platform_security_failures_total",
    help: "Count of denied authentication/authorization/platform-access attempts",
    labelNames: ["type", "reason"],
    registers: [register],
  });

/** Increment the security-failure counter with bounded labels. */
export function recordSecurityFailure(
  type: SecurityFailureType,
  reason: SecurityFailureReason,
): void {
  securityFailuresTotal.labels({ type, reason }).inc();
}
