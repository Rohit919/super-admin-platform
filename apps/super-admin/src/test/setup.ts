import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Register jest-dom matchers (toBeInTheDocument, etc.) on vitest's expect.
// The explicit expect.extend form is used (rather than the "/vitest" side-effect
// import) so registration is deterministic regardless of setup load order.
expect.extend(matchers);

// Reset the DOM + the persisted auth store between tests so each starts clean.
afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom localStorage may be unavailable in some environments */
  }
});
