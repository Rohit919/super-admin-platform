import { describe, it, expect, vi } from "vitest";
import { buildTestApp, signTestToken } from "@core/testing/test-app.js";
import { PermissionKeys } from "@app/api-contracts";

/**
 * Users CRUD route tests — verify the security boundary + behavior of the
 * admin-managed user endpoints and the self profile update, independently of
 * the Admin UI:
 *   - default-deny (401 unauthenticated / 403 without the permission)
 *   - create (201) + duplicate-email conflict (409)
 *   - get-by-id (404 when missing)
 *   - update (200) + self-delete guard (403)
 *   - PATCH /me self-service (no permission required)
 */
const BASE = "/api/v1/users";

function userRolesWith(roles: { name: string; permissions: string[] }[]) {
  return roles.map((r) => ({
    role: {
      name: r.name,
      permissions: r.permissions.map((key) => ({ permission: { key } })),
    },
  }));
}

function appWith(
  permissions: string[],
  userOverrides: Record<string, ReturnType<typeof vi.fn>> = {},
) {
  return buildTestApp({
    prisma: {
      userRole: {
        findMany: vi
          .fn()
          .mockResolvedValue(
            userRolesWith(
              permissions.length ? [{ name: "T", permissions }] : [],
            ),
          ),
      },
      user: userOverrides,
    },
  });
}

const NOW = new Date("2026-01-01T00:00:00.000Z");
const dbUser = (over: Record<string, unknown> = {}) => ({
  id: "u-1",
  email: "a@b.c",
  name: "Alice",
  role: "user",
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe("Users CRUD — authorization", () => {
  it("401 when unauthenticated (create)", async () => {
    const app = await appWith([]);
    const res = await app.inject({
      method: "POST",
      url: BASE,
      payload: { email: "x@y.z", name: "New User", password: "password123" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("403 when the caller lacks users.create", async () => {
    const app = await appWith([PermissionKeys.UsersRead]);
    const token = signTestToken(app);
    const res = await app.inject({
      method: "POST",
      url: BASE,
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "x@y.z", name: "New User", password: "password123" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("Users CRUD — create", () => {
  it("creates a user (201) and never returns the password", async () => {
    const create = vi
      .fn()
      .mockResolvedValue(
        dbUser({ id: "u-new", email: "new@x.io", name: "New User" }),
      );
    const app = await appWith([PermissionKeys.UsersCreate], {
      findUnique: vi.fn().mockResolvedValue(null), // no existing email
      create,
    });
    const token = signTestToken(app);
    const res = await app.inject({
      method: "POST",
      url: BASE,
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "new@x.io", name: "New User", password: "password123" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.email).toBe("new@x.io");
    expect(body.data.password).toBeUndefined();
    // Password must have been hashed (not stored as plaintext).
    const createArg = create.mock.calls[0][0];
    expect(createArg.data.password).not.toBe("password123");
    await app.close();
  });

  it("returns 409 when the email already exists", async () => {
    const app = await appWith([PermissionKeys.UsersCreate], {
      findUnique: vi.fn().mockResolvedValue(dbUser()),
      create: vi.fn(),
    });
    const token = signTestToken(app);
    const res = await app.inject({
      method: "POST",
      url: BASE,
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "a@b.c", name: "Dup User", password: "password123" },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("rejects an invalid body (400)", async () => {
    const app = await appWith([PermissionKeys.UsersCreate], {
      findUnique: vi.fn(),
      create: vi.fn(),
    });
    const token = signTestToken(app);
    const res = await app.inject({
      method: "POST",
      url: BASE,
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "not-an-email", name: "x", password: "short" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("Users CRUD — get / update / delete", () => {
  it("404 when getting a missing user", async () => {
    const app = await appWith([PermissionKeys.UsersRead], {
      findUnique: vi.fn().mockResolvedValue(null),
    });
    const token = signTestToken(app);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/u-404`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("updates a user (200)", async () => {
    const app = await appWith([PermissionKeys.UsersUpdate], {
      findUnique: vi.fn().mockResolvedValue(dbUser()),
      update: vi.fn().mockResolvedValue(dbUser({ name: "Renamed" })),
    });
    const token = signTestToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/u-1`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe("Renamed");
    await app.close();
  });

  it("deletes a user (200)", async () => {
    const app = await appWith([PermissionKeys.UsersDelete], {
      findUnique: vi
        .fn()
        .mockResolvedValue(dbUser({ id: "u-2", email: "other@x.io" })),
      delete: vi.fn().mockResolvedValue(dbUser({ id: "u-2" })),
    });
    const token = signTestToken(app); // acting user id = 'user-test-id'
    const res = await app.inject({
      method: "DELETE",
      url: `${BASE}/u-2`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toMatch(/deleted/i);
    await app.close();
  });

  it("403 when deleting your own account (self-delete guard)", async () => {
    const del = vi.fn();
    const app = await appWith([PermissionKeys.UsersDelete], {
      findUnique: vi.fn(),
      delete: del,
    });
    const token = signTestToken(app, {
      id: "self-1",
      email: "s@x.io",
      role: "admin",
    });
    const res = await app.inject({
      method: "DELETE",
      url: `${BASE}/self-1`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(del).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("Users — self profile update (PATCH /me)", () => {
  it("updates own profile without any permission (self-scoped)", async () => {
    const app = await appWith([], {
      // no email clash lookup needed (name-only update)
      update: vi
        .fn()
        .mockResolvedValue(dbUser({ id: "self-1", name: "Self Renamed" })),
    });
    const token = signTestToken(app, {
      id: "self-1",
      email: "s@x.io",
      role: "user",
    });
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/me`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Self Renamed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe("Self Renamed");
    await app.close();
  });

  it("401 when unauthenticated", async () => {
    const app = await appWith([]);
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/me`,
      payload: { name: "x y" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
