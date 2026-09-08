/**
 * Level 2 contract tests (API_CONTRACTS.md).
 *
 * Verifies endpoint contract objects carry the expected method/path/auth/
 * permission metadata and that the contract→Fastify-schema and path builders
 * behave correctly.
 */
import { describe, it, expect } from "vitest";
import {
  API_CONTRACTS,
  toFastifySchema,
  buildPath,
  HttpMethod,
  type ApiEndpoint,
} from "@app/api-contracts";

describe("API_CONTRACTS (Level 2)", () => {
  it("LOGIN is a public POST with a body + response + error codes", () => {
    const c = API_CONTRACTS.AUTH.LOGIN;
    expect(c.method).toBe(HttpMethod.POST);
    expect(c.path).toBe("/api/v1/auth/login");
    expect(c.auth).toBe("public");
    expect(c.body).toBeDefined();
    expect(c.response?.[200]).toBeDefined();
    // Login failures use the auth-specific INVALID_CREDENTIALS code (§17).
    expect(c.errors).toContain("INVALID_CREDENTIALS");
  });

  it("USERS.LIST requires auth + the users.read permission", () => {
    const c = API_CONTRACTS.USERS.LIST;
    expect(c.method).toBe(HttpMethod.GET);
    expect(c.path).toBe("/api/v1/users");
    expect(c.auth).toBe("required");
    expect(c.permission).toBe("users.read");
    expect(c.query).toBeDefined();
    expect(c.operationId).toBe("users.list");
  });

  it("carries stable operationIds", () => {
    expect(API_CONTRACTS.AUTH.LOGIN.operationId).toBe("auth.login");
    expect(API_CONTRACTS.ROLES.CREATE.operationId).toBe("roles.create");
    expect(API_CONTRACTS.PERMISSIONS.LIST.operationId).toBe("permissions.list");
  });

  it("RBAC contracts carry method/path/permission metadata", () => {
    expect(API_CONTRACTS.ROLES.LIST.path).toBe("/api/v1/admin/roles");
    expect(API_CONTRACTS.ROLES.LIST.permission).toBe("roles.read");
    expect(API_CONTRACTS.ROLES.GET_BY_ID.path).toBe("/api/v1/admin/roles/:id");
    expect(API_CONTRACTS.ROLES.SET_PERMISSIONS.method).toBe(HttpMethod.PUT);
    expect(API_CONTRACTS.PERMISSIONS.LIST.path).toBe(
      "/api/v1/admin/permissions",
    );
    expect(API_CONTRACTS.USER_ROLES.SET.path).toBe(
      "/api/v1/admin/users/:id/roles",
    );
    expect(API_CONTRACTS.USER_ROLES.SET.permission).toBe("users.roles.update");
  });

  it("LOGIN documents INVALID_CREDENTIALS; REFRESH documents token errors", () => {
    expect(API_CONTRACTS.AUTH.LOGIN.errors).toContain("INVALID_CREDENTIALS");
    expect(API_CONTRACTS.AUTH.REFRESH.errors).toContain("TOKEN_EXPIRED");
    expect(API_CONTRACTS.AUTH.REFRESH.errors).toContain("TOKEN_REVOKED");
  });

  it("toFastifySchema emits operationId + documented error responses", () => {
    const schema = toFastifySchema(API_CONTRACTS.USERS.LIST);
    expect(schema.operationId).toBe("users.list");
    // errors → documented response entries (401/403 from the error list)
    expect(schema.response?.[401]).toBeDefined();
    expect(schema.response?.[403]).toBeDefined();
  });

  it("USERS.ME requires auth and has no permission gate", () => {
    const c: ApiEndpoint = API_CONTRACTS.USERS.ME;
    expect(c.path).toBe("/api/v1/users/me");
    expect(c.auth).toBe("required");
    expect(c.permission).toBeUndefined();
  });

  it("toFastifySchema maps query→querystring and adds bearer security when required", () => {
    const schema = toFastifySchema(API_CONTRACTS.USERS.LIST);
    expect(schema.querystring).toBeDefined();
    expect(schema.params).toBeUndefined();
    expect(schema.response?.[200]).toBeDefined();
    expect(schema.security).toEqual([{ bearerAuth: [] }]);
  });

  it("toFastifySchema omits security for public endpoints", () => {
    const schema = toFastifySchema(API_CONTRACTS.AUTH.LOGIN);
    expect(schema.security).toBeUndefined();
    expect(schema.body).toBeDefined();
  });

  it("buildPath substitutes and encodes :params", () => {
    const endpoint: ApiEndpoint = {
      method: HttpMethod.GET,
      path: "/api/v1/users/:userId",
      auth: "required",
    };
    expect(buildPath(endpoint, { userId: "123" })).toBe("/api/v1/users/123");
    expect(buildPath(endpoint, { userId: "a/b" })).toBe("/api/v1/users/a%2Fb");
    expect(() => buildPath(endpoint, {})).toThrow(/Missing path parameter/);
  });
});
