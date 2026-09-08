import { expect } from "vitest";

/**
 * Shared error-response assertions (ERROR_HANDLING §93, §94).
 *
 * Reused across module tests so every endpoint's failure path is verified
 * against the same contract and the same security invariants, instead of each
 * test hand-rolling its own field checks.
 */

/** The parsed JSON body of an error response. */
interface ErrorBody {
  success?: false;
  error?: {
    code?: unknown;
    message?: unknown;
    statusCode?: unknown;
    requestId?: unknown;
    [k: string]: unknown;
  };
}

/**
 * Assert the canonical error envelope (ERROR_HANDLING §93):
 *   { error: { code: string, message: string, ... } }
 *
 * Pass `expectedCode` to also assert the stable machine-readable code.
 */
export function expectErrorEnvelope(
  body: ErrorBody,
  expectedCode?: string,
): void {
  expect(body).toMatchObject({
    error: {
      code: expect.any(String),
      message: expect.any(String),
    },
  });
  if (expectedCode !== undefined) {
    expect(body.error?.code).toBe(expectedCode);
  }
}

/**
 * Patterns that must NEVER appear in a client-facing error response
 * (ERROR_HANDLING §94 / §19). Covers stack traces, SQL, connection strings,
 * secret material, auth headers, and absolute filesystem paths.
 */
const FORBIDDEN_LEAK_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "stack trace", pattern: /\bat\s+[\w.<>]+\s+\(/ },
  { label: "postgres connection string", pattern: /postgres(?:ql)?:\/\//i },
  { label: "redis connection string", pattern: /redis:\/\//i },
  { label: "DATABASE_URL", pattern: /DATABASE_URL/ },
  { label: "JWT secret var", pattern: /JWT_SECRET/ },
  { label: "password hash field", pattern: /passwordHash|password_hash/i },
  { label: "bearer token", pattern: /Bearer\s+[A-Za-z0-9._-]+/ },
  { label: "private key", pattern: /BEGIN (?:RSA )?PRIVATE KEY/ },
  {
    label: "SQL statement",
    pattern: /\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/,
  },
  { label: "prisma internals", pattern: /PrismaClient\w*Error|prisma\.\w+\./ },
  { label: "absolute unix path", pattern: /\/(?:Users|home|var|etc|root)\// },
];

/**
 * Assert a raw response body contains no sensitive/internal detail
 * (ERROR_HANDLING §94). Accepts the raw string body so it also catches leaks in
 * non-JSON error responses (e.g. an accidental HTML 500).
 */
export function expectNoSensitiveLeak(rawBody: string): void {
  for (const { label, pattern } of FORBIDDEN_LEAK_PATTERNS) {
    expect(rawBody, `error body must not leak ${label}`).not.toMatch(pattern);
  }
}
