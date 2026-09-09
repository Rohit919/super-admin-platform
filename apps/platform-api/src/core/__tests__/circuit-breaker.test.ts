import { describe, it, expect } from "vitest";
import { withCircuitBreaker } from "../circuit-breaker.js";

/**
 * Regression guard for the parameterized-operation bug (Phase 21): a cached
 * breaker must run the CURRENT operation with the CURRENT arguments, never a
 * previous call's closure. Uses a unique service name per test so shared module
 * state doesn't bleed across tests.
 */
describe("withCircuitBreaker — parameterized operations", () => {
  it("runs the current operation, not the first cached one, for the same service", async () => {
    const svc = `unit-${Math.random().toString(36).slice(2)}`;

    const first = await withCircuitBreaker(svc, async () => "A");
    const second = await withCircuitBreaker(svc, async () => "B");
    const third = await withCircuitBreaker(svc, async () => "C");

    expect(first).toBe("A");
    expect(second).toBe("B"); // would be "A" with the stale-closure bug
    expect(third).toBe("C");
  });

  it("passes distinct arguments through per call (no argument replay)", async () => {
    const svc = `unit-${Math.random().toString(36).slice(2)}`;
    const seen: number[] = [];
    const call = (n: number) =>
      withCircuitBreaker(svc, async () => {
        seen.push(n);
        return n * 2;
      });

    expect(await call(1)).toBe(2);
    expect(await call(5)).toBe(10);
    expect(await call(9)).toBe(18);
    expect(seen).toEqual([1, 5, 9]);
  });

  it("provides an AbortSignal that fires on timeout", async () => {
    const svc = `unit-${Math.random().toString(36).slice(2)}`;
    await expect(
      withCircuitBreaker(
        svc,
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
        { timeout: 20 },
      ),
    ).rejects.toBeTruthy();
  });
});
