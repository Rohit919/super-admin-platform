import { describe, it, expect, vi } from "vitest";
import { buildTestApp, signTestToken } from "@core/testing/test-app.js";
import { PermissionKeys, SystemRoles } from "@app/api-contracts";

/**
 * RBAC authorization tests — permission-based (DB-backed) enforcement.
 *
 * These verify the security boundary independently of the Admin UI:
 *   - default-deny when a user has no matching permission
 *   - permission grants access
 *   - multi-role effective permissions = union
 *   - revocation removes access
 *   - privilege escalation is blocked (non-super can't grant SUPER_ADMIN)
 *   - last-administrator protection
 *   - API-level enforcement (a direct request is refused regardless of UI)
 */

const BASE = "/api/v1/admin";

/** Shape a userRole.findMany result that grants the given roles+permissions. */
function userRolesWith(roles: { name: string; permissions: string[] }[]) {
  return roles.map((r) => ({
    role: {
      name: r.name,
      permissions: r.permissions.map((key) => ({ permission: { key } })),
    },
  }));
}

/** Build an app where the authenticated user resolves to the given roles. */
async function appWithRoles(
  roles: { name: string; permissions: string[] }[],
  extra = {},
) {
  return buildTestApp({
    prisma: {
      userRole: { findMany: vi.fn().mockResolvedValue(userRolesWith(roles)) },
      ...extra,
    },
  });
}

describe("RBAC — route permission enforcement", () => {
  it("denies access when the user has no permissions (default-deny → 403)", async () => {
    const app = await appWithRoles([]); // no roles → no permissions
    const token = signTestToken(app);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/roles`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns 401 for an unauthenticated request", async () => {
    const app = await appWithRoles([]);
    const res = await app.inject({ method: "GET", url: `${BASE}/roles` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("grants access when the user holds the required permission (200)", async () => {
    const app = await appWithRoles([
      { name: "CustomReader", permissions: [PermissionKeys.RolesRead] },
    ]);
    const token = signTestToken(app);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/roles`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it("a user with users.read but not roles.read cannot read roles (403)", async () => {
    const app = await appWithRoles([
      { name: "UserViewer", permissions: [PermissionKeys.UsersRead] },
    ]);
    const token = signTestToken(app);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/roles`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("RBAC — multiple roles (effective permissions = union)", () => {
  it("combines permissions across assigned roles", async () => {
    const app = await appWithRoles([
      { name: "RoleA", permissions: [PermissionKeys.UsersRead] },
      { name: "RoleB", permissions: [PermissionKeys.RolesRead] },
    ]);
    const token = signTestToken(app);

    // roles.read comes from RoleB → allowed
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/roles`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe("RBAC — revocation", () => {
  it("removing the granting role removes access (403)", async () => {
    // Simulate the post-revocation state: the user now has no roles.
    const app = await appWithRoles([]);
    const token = signTestToken(app);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/roles`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("RBAC — unknown permission keys never grant access", () => {
  it("a DB permission not in the registry is ignored (default-deny)", async () => {
    const app = await appWithRoles([
      { name: "Weird", permissions: ["roles.read.totally.bogus"] },
    ]);
    const token = signTestToken(app);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/roles`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("RBAC — privilege escalation protection", () => {
  it("a non-super admin (with users.roles.update) cannot grant SUPER_ADMIN (403)", async () => {
    const targetUserId = "target-user";
    const superAdminRole = { id: "role-super", name: SystemRoles.SuperAdmin };

    const app = await buildTestApp({
      prisma: {
        // Actor holds users.roles.update but is NOT a super admin.
        userRole: {
          findMany: vi.fn().mockResolvedValue(
            userRolesWith([
              {
                name: "UserAdmin",
                permissions: [PermissionKeys.UsersRolesUpdate],
              },
            ]),
          ),
        },
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: targetUserId, email: "t@x.com" }),
        },
        role: { findMany: vi.fn().mockResolvedValue([superAdminRole]) },
      },
    });
    const token = signTestToken(app, {
      id: "actor",
      email: "actor@x.com",
      role: "user",
    });

    const res = await app.inject({
      method: "PUT",
      url: `${BASE}/users/${targetUserId}/roles`,
      headers: { authorization: `Bearer ${token}` },
      payload: { roles: [SystemRoles.SuperAdmin] },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("RBAC — last administrator protection", () => {
  it("a super admin cannot remove the final SUPER_ADMIN (403)", async () => {
    const targetUserId = "the-only-super";

    // The actor IS a super admin (holds users.roles.update + SUPER_ADMIN role).
    // The target currently HAS SUPER_ADMIN; the request sets roles to [] (removal).
    // countUsersWithRole(excluding target) returns 0 → last-admin guard trips.
    const app = await buildTestApp({
      prisma: {
        userRole: {
          findMany: vi
            .fn()
            .mockImplementation((args: { where?: { userId?: string } }) => {
              // Actor context resolution + target's current roles both go through here.
              const uid = args?.where?.userId;
              if (uid === targetUserId) {
                // target currently has SUPER_ADMIN
                return Promise.resolve(
                  userRolesWith([
                    { name: SystemRoles.SuperAdmin, permissions: [] },
                  ]),
                );
              }
              // actor: super admin + users.roles.update
              return Promise.resolve(
                userRolesWith([
                  {
                    name: SystemRoles.SuperAdmin,
                    permissions: [PermissionKeys.UsersRolesUpdate],
                  },
                ]),
              );
            }),
          count: vi.fn().mockResolvedValue(0), // no OTHER super admins
        },
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: targetUserId, email: "s@x.com" }),
        },
        role: { findMany: vi.fn().mockResolvedValue([]) }, // requested roles: none
      },
    });
    const token = signTestToken(app, {
      id: "actor-super",
      email: "a@x.com",
      role: "admin",
    });

    const res = await app.inject({
      method: "PUT",
      url: `${BASE}/users/${targetUserId}/roles`,
      headers: { authorization: `Bearer ${token}` },
      payload: { roles: [] },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("RBAC — API enforcement is independent of the UI", () => {
  it("a direct HTTP request without the permission is refused (403), even though the UI might hide it", async () => {
    const app = await appWithRoles([
      { name: "NoDeletePower", permissions: [PermissionKeys.RolesRead] },
    ]);
    const token = signTestToken(app);
    // roles.delete is required for DELETE /roles/:id; the user only has roles.read.
    const res = await app.inject({
      method: "DELETE",
      url: `${BASE}/roles/some-role`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
