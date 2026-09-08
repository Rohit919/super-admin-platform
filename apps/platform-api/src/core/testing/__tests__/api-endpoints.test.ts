/**
 * Endpoint registry tests (API_ENDPOINTS §76).
 *
 * Verifies path composition and safe id encoding for the centralized registry.
 * Keeps the registry honest against the real `/api/v1` prefix.
 */
import { describe, it, expect } from "vitest";
import { API_ENDPOINTS, API_VERSION } from "@app/api-contracts";

describe("API_ENDPOINTS registry", () => {
  it("uses the /api/v1 version prefix", () => {
    expect(API_VERSION).toBe("/api/v1");
  });

  it("composes static auth + user + admin paths correctly", () => {
    expect(API_ENDPOINTS.AUTH.LOGIN).toBe("/api/v1/auth/login");
    expect(API_ENDPOINTS.AUTH.LOGOUT_ALL).toBe("/api/v1/auth/logout-all");
    expect(API_ENDPOINTS.AUTH.RESET_PASSWORD).toBe(
      "/api/v1/auth/password-reset/confirm",
    );
    expect(API_ENDPOINTS.USERS.ROOT).toBe("/api/v1/users");
    expect(API_ENDPOINTS.USERS.ME).toBe("/api/v1/users/me");
    expect(API_ENDPOINTS.ROLES.ROOT).toBe("/api/v1/admin/roles");
    expect(API_ENDPOINTS.PERMISSIONS.ROOT).toBe("/api/v1/admin/permissions");
    expect(API_ENDPOINTS.ADMIN.DB_METRICS).toBe("/api/v1/admin/db-metrics");
  });

  it("builds dynamic id paths", () => {
    expect(API_ENDPOINTS.USERS.BY_ID("123")).toBe("/api/v1/users/123");
    expect(API_ENDPOINTS.ROLES.BY_ID("r1")).toBe("/api/v1/admin/roles/r1");
    expect(API_ENDPOINTS.ROLES.PERMISSIONS("r1")).toBe(
      "/api/v1/admin/roles/r1/permissions",
    );
    expect(API_ENDPOINTS.USER_ROLES.BY_USER("u1")).toBe(
      "/api/v1/admin/users/u1/roles",
    );
  });

  it("encodes untrusted id segments (API_ENDPOINTS §22, §76)", () => {
    expect(API_ENDPOINTS.USERS.BY_ID("a/b")).toBe("/api/v1/users/a%2Fb");
    expect(API_ENDPOINTS.ROLES.BY_ID("a b")).toBe("/api/v1/admin/roles/a%20b");
  });

  it("exposes Fastify route templates with :params", () => {
    expect(API_ENDPOINTS.USERS.ROUTE_BY_ID).toBe("/api/v1/users/:userId");
    expect(API_ENDPOINTS.ROLES.ROUTE_BY_ID).toBe("/api/v1/admin/roles/:id");
    expect(API_ENDPOINTS.USER_ROLES.ROUTE_BY_USER).toBe(
      "/api/v1/admin/users/:id/roles",
    );
  });
});
