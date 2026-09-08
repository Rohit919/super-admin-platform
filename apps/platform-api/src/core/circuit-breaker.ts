import CircuitBreaker from "opossum";
import { Gauge, register } from "prom-client";
import { CircuitOpenError } from "./errors/index.js";

/**
 * Circuit breaker utility for outbound calls (HTTP/RPC to third parties).
 *
 * Wrap any async function that talks to an external service. When failures
 * exceed the threshold the circuit OPENs and calls fail fast with
 * CircuitOpenError (no network attempt) until the reset timeout elapses.
 *
 * Usage:
 *   const result = await withCircuitBreaker('sendgrid', (signal) =>
 *     fetch(url, { signal }), { timeout: 3000 });
 */

export interface CircuitBreakerOptions {
  /** ms before the call is aborted via AbortController and counted as a failure. */
  timeout?: number;
  /** % of failures within the rolling window that trips the circuit. */
  errorThresholdPercentage?: number;
  /** ms the circuit stays OPEN before moving to HALF-OPEN to probe. */
  resetTimeout?: number;
}

const DEFAULTS: Required<CircuitBreakerOptions> = {
  timeout: 5_000,
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
};

// One gauge for all breakers: 1 = current state, labelled by service + state.
const circuitState = new Gauge({
  name: "circuit_breaker_state",
  help: "Circuit breaker state (1 = current). Labels: service, state.",
  labelNames: ["service", "state"],
  registers: [register],
});

function setState(
  service: string,
  state: "closed" | "open" | "half_open",
): void {
  for (const s of ["closed", "open", "half_open"] as const) {
    circuitState.labels({ service, state: s }).set(s === state ? 1 : 0);
  }
}

// Cache one breaker per service name so state persists across calls.
const breakers = new Map<string, CircuitBreaker>();

function getBreaker<TArgs extends unknown[], TResult>(
  service: string,
  action: (...args: TArgs) => Promise<TResult>,
  options: CircuitBreakerOptions,
): CircuitBreaker {
  const existing = breakers.get(service);
  if (existing) return existing;

  const opts = { ...DEFAULTS, ...options };
  const breaker = new CircuitBreaker(
    action as (...args: unknown[]) => Promise<unknown>,
    {
      timeout: opts.timeout,
      errorThresholdPercentage: opts.errorThresholdPercentage,
      resetTimeout: opts.resetTimeout,
      name: service,
    },
  );

  breaker.on("open", () => setState(service, "open"));
  breaker.on("halfOpen", () => setState(service, "half_open"));
  breaker.on("close", () => setState(service, "closed"));
  setState(service, "closed");

  breakers.set(service, breaker);
  return breaker;
}

/**
 * Run `fn` through the named circuit breaker. `fn` receives an AbortSignal that
 * fires when the breaker's timeout elapses — pass it to fetch/axios so the
 * underlying request is actually cancelled.
 */
export async function withCircuitBreaker<TResult>(
  service: string,
  fn: (signal: AbortSignal) => Promise<TResult>,
  options: CircuitBreakerOptions = {},
): Promise<TResult> {
  const controller = new AbortController();
  const breaker = getBreaker(service, () => fn(controller.signal), options);

  try {
    return (await breaker.fire()) as TResult;
  } catch (err) {
    // opossum throws an error with code 'EOPENBREAKER' when the circuit is open.
    if ((err as { code?: string })?.code === "EOPENBREAKER") {
      controller.abort();
      throw new CircuitOpenError(service);
    }
    throw err;
  }
}

/** Test/introspection helper. */
export function getCircuitBreaker(service: string): CircuitBreaker | undefined {
  return breakers.get(service);
}
