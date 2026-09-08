import { describe, it, expect, vi } from "vitest";
import { buildTestApp } from "@core/testing/test-app.js";
import { PermissionKeys } from "@app/api-contracts";

/**
 * Platform (Super Admin) route tests — the platform security boundary:
 *   - no platform membership  → 403 PLATFORM_ACCESS_DENIED (a tenant admin
 *     cannot touch /platform/* even with a valid token)
 *   - platform member but missing the platform.* permission → 403
 *   - platform member with the permission → allowed
 *   - provisioning creates tenant + admin user + membership + tenant role
 *   - archiving requires the higher platform.tenant.archive permission
 */
const BASE = "/api/v1/platform";

/** Platform token — no tenant claim (a platform operator has no active tenant). */
function token(app: Awaited<ReturnType<typeof buildTestApp>>): string {
  return app.jwt.sign({ id: "sa-1", email: "super@platform.io", role: "user" });
}

/** userRole.findMany shape the AuthorizationService consumes. */
function rolesWithPerms(keys: string[]) {
  return [
    {
      role: {
        name: "SUPER_ADMIN",
        permissions: keys.map((key) => ({ permission: { key } })),
      },
    },
  ];
}

const ACTIVE_PLATFORM = { status: "ACTIVE" };

describe("Platform authorization boundary", () => {
  it("denies a user WITHOUT platform membership (403 PLATFORM_ACCESS_DENIED)", async () => {
    // Default mock: platformMembership.findUnique -> null.
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/dashboard`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("PLATFORM_ACCESS_DENIED");
    await app.close();
  });

  it("denies a platform member LACKING the required permission (403)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: { findMany: vi.fn().mockResolvedValue([]) }, // no permissions
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/dashboard`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("PLATFORM_ACCESS_DENIED");
    await app.close();
  });

  it("allows a platform member WITH the permission (200)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
          count: vi.fn().mockResolvedValue(0),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformDashboardView]),
            ),
        },
        tenant: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
        user: { count: vi.fn().mockResolvedValue(0) },
        tenantApiCredential: { count: vi.fn().mockResolvedValue(0) },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/dashboard`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveProperty("totalTenants");
    expect(body.data).toHaveProperty("platformUsers");
    expect(body.data).toHaveProperty("activeApiCredentials");
    expect(body.data).toHaveProperty("recentTenants");
    expect(Array.isArray(body.data.recentTenants)).toBe(true);
    await app.close();
  });

  it("rejects an INACTIVE platform membership (403)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue({ status: "SUSPENDED" }),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformDashboardView]),
            ),
        },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/dashboard`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("Platform tenant provisioning", () => {
  it("provisions a tenant: creates tenant + admin user + membership + tenant role", async () => {
    const tenantCreate = vi.fn().mockResolvedValue({ id: "new-tenant" });
    const userCreate = vi.fn().mockResolvedValue({ id: "new-admin" });
    const membershipCreate = vi.fn().mockResolvedValue({});
    const roleCreate = vi.fn().mockResolvedValue({ id: "tenant-admin-role" });
    const rolePermissionCreateMany = vi.fn().mockResolvedValue({ count: 10 });
    const userRoleCreate = vi.fn().mockResolvedValue({});

    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformTenantCreate]),
            ),
          create: userRoleCreate,
        },
        tenant: {
          findUnique: vi
            .fn()
            // 1st call: slug pre-check (no conflict). Later: getTenant() after create.
            .mockResolvedValueOnce(null)
            .mockResolvedValue({
              id: "new-tenant",
              name: "Acme",
              slug: "acme",
              status: "ACTIVE",
              createdAt: new Date("2026-01-01"),
              updatedAt: new Date("2026-01-01"),
              _count: { memberships: 1 },
            }),
          create: tenantCreate,
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: userCreate,
        },
        tenantMembership: { create: membershipCreate },
        role: { create: roleCreate },
        permission: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: "perm-1" }, { id: "perm-2" }]),
        },
        rolePermission: { createMany: rolePermissionCreateMany },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE}/tenants`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: {
        name: "Acme",
        slug: "acme",
        adminEmail: "admin@acme.io",
        adminName: "Acme Admin",
        adminPassword: "a-strong-password-123",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      id: "new-tenant",
      slug: "acme",
      status: "ACTIVE",
    });

    // The full provisioning workflow ran.
    expect(tenantCreate).toHaveBeenCalled();
    expect(userCreate).toHaveBeenCalled();
    expect(membershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "new-tenant",
          userId: "new-admin",
          status: "ACTIVE",
        }),
      }),
    );
    expect(roleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "new-tenant" }),
      }),
    );
    expect(userRoleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "new-admin",
          roleId: "tenant-admin-role",
          tenantId: "new-tenant",
        }),
      }),
    );
    await app.close();
  });

  it("rejects a duplicate tenant slug (409)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformTenantCreate]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue({ id: "existing" }) }, // slug taken
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE}/tenants`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: {
        name: "Acme",
        slug: "acme",
        adminEmail: "admin@acme.io",
        adminName: "Acme Admin",
        adminPassword: "a-strong-password-123",
      },
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe("Platform tenant status changes", () => {
  const withPerms = (keys: string[], currentStatus = "ACTIVE") => ({
    prisma: {
      platformMembership: {
        findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
      },
      userRole: { findMany: vi.fn().mockResolvedValue(rolesWithPerms(keys)) },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "t1",
          name: "Acme",
          slug: "acme",
          status: currentStatus,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
          _count: { memberships: 1 },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    },
  });

  it("suspends a tenant with platform.tenant.suspend (200)", async () => {
    const app = await buildTestApp(
      withPerms([PermissionKeys.PlatformTenantSuspend]),
    );
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/status`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { status: "SUSPENDED" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("refuses to ARCHIVE without platform.tenant.archive (403)", async () => {
    // Has suspend (passes the route guard) but NOT archive.
    const app = await buildTestApp(
      withPerms([PermissionKeys.PlatformTenantSuspend]),
    );
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/status`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { status: "ARCHIVED" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("PLATFORM_ACCESS_DENIED");
    await app.close();
  });

  it("allows ARCHIVE with both suspend + archive permissions (200)", async () => {
    const app = await buildTestApp(
      withPerms([
        PermissionKeys.PlatformTenantSuspend,
        PermissionKeys.PlatformTenantArchive,
      ]),
    );
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/status`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { status: "ARCHIVED" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  // ── Lifecycle transition matrix (plan §12) ──────────────────────────────────
  it("reactivates a SUSPENDED tenant → ACTIVE (200)", async () => {
    const app = await buildTestApp(
      withPerms([PermissionKeys.PlatformTenantSuspend], "SUSPENDED"),
    );
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/status`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("activates a TRIAL tenant → ACTIVE with platform.tenant.suspend (200)", async () => {
    // The "Activate" transition (TRIAL → ACTIVE) is gated by the same
    // platform.tenant.suspend permission as every other status change — it does
    // NOT require platform.tenant.update. The Super Admin UI mirrors this key.
    const app = await buildTestApp(
      withPerms([PermissionKeys.PlatformTenantSuspend], "TRIAL"),
    );
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/status`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("rejects ANY transition out of ARCHIVED (409) — terminal state", async () => {
    // Full permissions so the route guard passes; the service must still refuse.
    const app = await buildTestApp(
      withPerms(
        [
          PermissionKeys.PlatformTenantSuspend,
          PermissionKeys.PlatformTenantArchive,
        ],
        "ARCHIVED",
      ),
    );
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/status`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
    await app.close();
  });

  it("rejects a no-op same-status change (409)", async () => {
    const app = await buildTestApp(
      withPerms([PermissionKeys.PlatformTenantSuspend], "ACTIVE"),
    );
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/status`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { status: "SUSPENDED" }, // ACTIVE → SUSPENDED is valid; now try SUSPENDED again below
    });
    expect(res.statusCode).toBe(200);
    await app.close();

    // ACTIVE → ACTIVE (no-op) must be rejected.
    const app2 = await buildTestApp(
      withPerms([PermissionKeys.PlatformTenantSuspend], "ACTIVE"),
    );
    const res2 = await app2.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/status`,
      headers: { authorization: `Bearer ${token(app2)}` },
      payload: { status: "ACTIVE" },
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().error.code).toBe("CONFLICT");
    await app2.close();
  });
});
