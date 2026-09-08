import { describe, it, expect, vi } from "vitest";
import { buildTestApp } from "@core/testing/test-app.js";

/**
 * CSRF strategy (SECURITY.md §30/§74). The test env allowlists
 * http://localhost:3000 as the CORS origin, which the CSRF plugin reuses.
 */
const BASE_URL = "/api/v1/auth";

describe("CSRF protection (cookie-bearing state changes)", () => {
  it("blocks a cookie-bearing POST from a cross-site Origin", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/logout`,
      headers: {
        cookie: "refreshToken=abc123",
        origin: "https://evil.example.com",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("CSRF_FAILED");
    await app.close();
  });

  it("allows a cookie-bearing POST from an allowlisted Origin", async () => {
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const app = await buildTestApp({
      prisma: { refreshToken: { updateMany: updateManyMock } },
    });
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/logout`,
      headers: {
        cookie: "refreshToken=abc123",
        origin: "http://localhost:3000",
      },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("allows non-browser clients (cookie present, no Origin) — SameSite fallback", async () => {
    const app = await buildTestApp({
      prisma: {
        refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/logout`,
      headers: { cookie: "refreshToken=abc123" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("does not interfere with Bearer-only (no cookie) requests", async () => {
    const app = await buildTestApp();
    // login carries no cookie and no Origin → CSRF hook is a no-op; 401 comes
    // from the auth logic (unknown user), proving the request reached the handler.
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/login`,
      payload: { email: "nobody@example.com", password: "password123" },
      headers: { origin: "https://evil.example.com" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
