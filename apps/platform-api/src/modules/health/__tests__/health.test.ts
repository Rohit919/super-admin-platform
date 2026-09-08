/**
 * Error scenario integration tests
 *
 * Verifies the global error handler, 404 handler, and common error shapes
 * that cut across all routes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildTestApp, signTestToken } from "@core/testing/test-app.js";
import {
  expectErrorEnvelope,
  expectNoSensitiveLeak,
} from "@core/testing/error-assertions.js";

// ─── 404 not found ────────────────────────────────────────────────────────────

describe("404 Not Found handler", () => {
  it("returns a consistent error shape for unknown routes", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/does-not-exist" });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    // Canonical error envelope: { error: { code, message, requestId, ... } }
    expectErrorEnvelope(body, "NOT_FOUND");
    expect(body.error.message).toBe("Route not found");
    expect(body.error.path).toBe("/does-not-exist");
    expect(body.error.requestId).toBeDefined();
    expect(body.error.timestamp).toBeDefined();

    await app.close();
  });

  it("returns 404 for an unknown API sub-path", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/nonexistent" });

    expect(res.statusCode).toBe(404);

    await app.close();
  });
});

// ─── 400 validation errors ────────────────────────────────────────────────────

describe("400 Validation errors", () => {
  it("returns 400 with validation details for malformed JSON body", async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{ bad json }",
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it("returns 400 when required body fields are missing", async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {},
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });
});

// ─── 401 unauthorised ─────────────────────────────────────────────────────────

describe("401 Unauthorized errors", () => {
  it("returns 401 with consistent shape when bearer token is absent", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/auth/verify" });

    expect(res.statusCode).toBe(401);
    expectErrorEnvelope(res.json(), "UNAUTHORIZED");

    await app.close();
  });

  it("returns 401 with consistent shape when bearer token is malformed", async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/verify",
      headers: { authorization: "Bearer not.a.real.token" },
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });
});

// ─── 500 internal server errors ───────────────────────────────────────────────

describe("500 Internal server errors", () => {
  it("returns 500 and does not leak stack traces when Prisma throws", async () => {
    const app = await buildTestApp({
      prisma: {
        user: {
          findUnique: vi
            .fn()
            .mockRejectedValue(new Error("DB connection refused")),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "test@example.com", password: "password123" },
    });

    expect(res.statusCode).toBe(500);
    // Response must be the safe canonical envelope with no internal detail
    // (no stack, SQL, connection strings, secrets, or filesystem paths).
    expectErrorEnvelope(res.json(), "INTERNAL_ERROR");
    expectNoSensitiveLeak(res.body);

    await app.close();
  });
});

// ─── Health endpoints ─────────────────────────────────────────────────────────

describe("Health endpoints", () => {
  // Vitest runs under load — the event-loop lag histogram can read high values
  // (hundreds of ms). Set the threshold well above any realistic test value so
  // readiness checks don't spuriously fail with 503 during test runs.
  beforeEach(() => {
    vi.stubEnv("EVENT_LOOP_LAG_THRESHOLD_MS", "9999");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("GET /api/v1/health returns 200 ok", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.environment).toBe("test");
    expect(body.uptime).toBeTypeOf("number");

    await app.close();
  });

  it("GET /api/v1/ready returns 200 when DB + Redis are reachable", async () => {
    const app = await buildTestApp({
      prisma: {
        $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      },
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/ready" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ready");
    expect(body.services.database).toBe(true);
    expect(body.services.redis).toBe(true);
    // event-loop lag fields
    expect(body.eventLoop).toBeDefined();
    expect(body.eventLoop.lagMs).toBeTypeOf("number");
    expect(body.eventLoop.healthy).toBe(true);
    // process fields
    expect(body.process.activeHandles).toBeTypeOf("number");
    expect(body.process.activeRequests).toBeTypeOf("number");
    // circuit-breaker fields
    expect(body.circuitBreakers).toBeDefined();
    expect(body.circuitBreakers.allClosed).toBe(true);
    expect(body.circuitBreakers.openBreakers).toEqual([]);

    await app.close();
  });

  it("GET /api/v1/ready returns 503 when DB is unreachable", async () => {
    const app = await buildTestApp({
      prisma: {
        $queryRaw: vi.fn().mockRejectedValue(new Error("Connection refused")),
      },
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/ready" });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe("not_ready");
    expect(body.services.database).toBe(false);
    expect(body.eventLoop).toBeDefined();
    expect(body.process).toBeDefined();
    expect(body.circuitBreakers).toBeDefined();

    await app.close();
  });

  it("GET /api/v1/ready returns 503 when Redis is unreachable", async () => {
    const app = await buildTestApp({
      prisma: {
        $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      },
      redis: {
        ping: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
      },
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/ready" });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    // DB is up so status is "degraded" not "not_ready"
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe(true);
    expect(body.services.redis).toBe(false);

    await app.close();
  });

  it("GET /api/v1/ready: eventLoop.lagMs is a non-negative number", async () => {
    const app = await buildTestApp({
      prisma: {
        $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      },
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/ready" });
    const body = res.json();

    expect(body.eventLoop.lagMs).toBeTypeOf("number");
    expect(body.eventLoop.lagMs).toBeGreaterThanOrEqual(0);
    expect(body.eventLoop.healthy).toBe(true); // threshold=9999ms in tests

    await app.close();
  });
});

// ─── Users endpoints ──────────────────────────────────────────────────────────

describe("GET /api/v1/users/me", () => {
  const MOCK_USER = {
    id: "user-test-id",
    email: "test@example.com",
    name: "Test User",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("returns 200 with the current user profile", async () => {
    const app = await buildTestApp({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(MOCK_USER) },
      },
    });

    const token = signTestToken(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe("test@example.com");
    expect(body.data).not.toHaveProperty("password");

    await app.close();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/users/me" });

    expect(res.statusCode).toBe(401);

    await app.close();
  });
});
