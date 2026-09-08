/**
 * Branding endpoint integration tests.
 *
 * GET /api/v1/branding is the public white-label config the Admin applies at
 * runtime. Verifies the canonical `{ data }` envelope, required fields sourced
 * from env (TEST_ENV), public access, and cache header.
 */
import { describe, it, expect } from "vitest";
import { buildTestApp } from "@core/testing/test-app.js";

describe("GET /api/v1/branding", () => {
  it("returns branding in the canonical { data } envelope (public)", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/branding" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("data");
    expect(body.data.appName).toBe("Super Admin Platform");
    expect(body.data.shortName).toBe("Super Admin");
    expect(body.data.colors.primary).toBe("#4f46e5");

    await app.close();
  });

  it("sends a cache-control header so the Admin can cache branding", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/branding" });

    expect(res.headers["cache-control"]).toContain("max-age=300");

    await app.close();
  });
});
