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

/**
 * The action every cached breaker runs: it simply invokes the thunk it is
 * handed on THIS call. Per-call parameters live in the thunk's closure, so the
 * breaker never replays a previous call's arguments — it only carries the
 * circuit STATE across calls. opossum forwards `fire(arg)` to the action.
 */
type Thunk<TResult> = () => Promise<TResult>;
async function runThunk(thunk: Thunk<unknown>): Promise<unknown> {
  return thunk();
}

// Cache one breaker per service name so STATE (open/half-open/closed + failure
// counters) persists across calls. The action is always `runThunk`, so the
// cached breaker is safe to reuse for different operations/arguments.
const breakers = new Map<string, CircuitBreaker>();

function getBreaker(
  service: string,
  options: CircuitBreakerOptions,
): CircuitBreaker {
  const existing = breakers.get(service);
  if (existing) return existing;

  const opts = { ...DEFAULTS, ...options };
  const breaker = new CircuitBreaker(runThunk, {
    timeout: opts.timeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeout,
    name: service,
  });

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
 *
 * SAFE FOR PARAMETERIZED OPERATIONS: the breaker's cached action is a generic
 * thunk-runner and the CURRENT `fn` (with its arguments) is passed per call via
 * `fire()`. Reusing the same `service` name for different operations shares only
 * the circuit STATE, never a stale closure.
 */
export async function withCircuitBreaker<TResult>(
  service: string,
  fn: (signal: AbortSignal) => Promise<TResult>,
  options: CircuitBreakerOptions = {},
): Promise<TResult> {
  const controller = new AbortController();
  const breaker = getBreaker(service, options);
  const thunk: Thunk<TResult> = () => fn(controller.signal);

  try {
    return (await breaker.fire(thunk)) as TResult;
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
