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

describe("Platform tenant list (pagination + search)", () => {
  const listApp = (rows: unknown[], total: number, findMany = vi.fn()) =>
    buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformTenantView]),
            ),
        },
        tenant: {
          count: vi.fn().mockResolvedValue(total),
          findMany: findMany.mockResolvedValue(rows),
        },
      },
    });

  const tenantRow = (over: Record<string, unknown> = {}) => ({
    id: "t1",
    name: "Acme",
    slug: "acme",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    _count: { memberships: 2 },
    ...over,
  });

  it("returns a paginated envelope with offset meta (data + meta)", async () => {
    const app = await listApp([tenantRow()], 1);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({ id: "t1", memberCount: 2 });
    expect(body.meta).toMatchObject({
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    });
    await app.close();
  });

  it("passes a case-insensitive name/slug search into the query", async () => {
    const findMany = vi.fn();
    const app = await listApp([], 0, findMany);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants?q=acme`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: "acme", mode: "insensitive" } },
            { slug: { contains: "acme", mode: "insensitive" } },
          ],
        }),
      }),
    );
    await app.close();
  });

  it("applies page/pageSize to skip/take", async () => {
    const findMany = vi.fn();
    const app = await listApp([], 50, findMany);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants?page=2&pageSize=10`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(res.json().meta).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 50,
      totalPages: 5,
    });
    await app.close();
  });
});

describe("Platform tenant overview (Control Center aggregate)", () => {
  const overviewApp = (extra: Record<string, unknown> = {}) =>
    buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformTenantView]),
            ),
        },
        ...extra,
      },
    });

  it("aggregates real member, credential and plan data for a tenant (200)", async () => {
    // tenantMembership.count is called 4x (total/active/invited/suspended),
    // tenantApiCredential.count 4x (total/active/revoked/expired).
    const membershipCount = vi
      .fn()
      .mockResolvedValueOnce(3) // total
      .mockResolvedValueOnce(2) // active
      .mockResolvedValueOnce(1) // invited
      .mockResolvedValueOnce(0); // suspended
    const credentialCount = vi
      .fn()
      .mockResolvedValueOnce(4) // total
      .mockResolvedValueOnce(2) // active
      .mockResolvedValueOnce(2) // revoked
      .mockResolvedValueOnce(1); // expired (active + past expiry)

    const app = await overviewApp({
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "t1",
          name: "Acme",
          slug: "acme",
          status: "ACTIVE",
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-02"),
        }),
      },
      tenantMembership: {
        count: membershipCount,
        findFirst: vi.fn().mockResolvedValue({
          createdAt: new Date("2026-01-01"),
          user: { id: "u1", name: "Ada Admin", email: "ada@acme.io" },
        }),
      },
      tenantApiCredential: { count: credentialCount },
      tenantPlan: {
        findUnique: vi.fn().mockResolvedValue({
          assignedAt: new Date("2026-01-01"),
          plan: {
            key: "growth",
            name: "Growth",
            _count: { entitlements: 5 },
          },
        }),
      },
      tenantEntitlementOverride: {
        count: vi.fn().mockResolvedValue(1),
        // The union-count path queries overrides by key too.
        findMany: vi
          .fn()
          .mockResolvedValue([{ entitlement: { key: "max_users" } }]),
      },
      planEntitlement: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { entitlement: { key: "max_users" } },
            { entitlement: { key: "api_access" } },
          ]),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/t1/overview`,
      headers: { authorization: `Bearer ${token(app)}` },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toMatchObject({
      id: "t1",
      slug: "acme",
      status: "ACTIVE",
      members: { total: 3, active: 2, invited: 1, suspended: 0 },
      credentials: { total: 4, active: 2, revoked: 2, expired: 1 },
    });
    expect(data.primaryAdmin).toMatchObject({
      name: "Ada Admin",
      email: "ada@acme.io",
    });
    expect(data.plan).toMatchObject({ key: "growth", name: "Growth" });
    await app.close();
  });

  it("returns 404 for a non-existent tenant overview", async () => {
    const app = await overviewApp({
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/missing/overview`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("denies overview WITHOUT platform.tenant.view (403)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: { findMany: vi.fn().mockResolvedValue([]) },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/t1/overview`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("PLATFORM_ACCESS_DENIED");
    await app.close();
  });
});

describe("Platform tenant metadata update", () => {
  const updateApp = (
    keys: string[],
    tenantFindUnique = vi.fn(),
    tenantUpdate = vi.fn(),
  ) =>
    buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi.fn().mockResolvedValue(rolesWithPerms(keys)),
        },
        tenant: {
          findUnique: tenantFindUnique,
          update: tenantUpdate,
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      },
    });

  it("updates the tenant name with platform.tenant.update (200) and audits it", async () => {
    const auditCreate = vi.fn().mockResolvedValue({});
    const findUnique = vi
      .fn()
      // 1st: existence check (id + current name); 2nd: getTenant() after update.
      .mockResolvedValueOnce({ id: "t1", name: "Old Name" })
      .mockResolvedValue({
        id: "t1",
        name: "New Name",
        slug: "acme",
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
        _count: { memberships: 1 },
      });
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformTenantUpdate]),
            ),
        },
        tenant: {
          findUnique,
          update: vi.fn().mockResolvedValue({}),
        },
        auditLog: { create: auditCreate },
      },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { name: "New Name" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: "t1", name: "New Name" });
    // Audited as TENANT_UPDATED with a from/to name (no secrets).
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "TENANT_UPDATED" }),
      }),
    );
    await app.close();
  });

  it("denies tenant update WITHOUT platform.tenant.update (403)", async () => {
    // Has an unrelated platform permission but not update.
    const app = await updateApp([PermissionKeys.PlatformTenantView]);
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { name: "New Name" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("PLATFORM_ACCESS_DENIED");
    await app.close();
  });

  it("returns 404 when updating a non-existent tenant", async () => {
    const app = await updateApp(
      [PermissionKeys.PlatformTenantUpdate],
      vi.fn().mockResolvedValue(null), // no such tenant
      vi.fn(),
    );
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/missing`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { name: "New Name" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("Platform tenant organization profile (Phase 20)", () => {
  const ORG_ROW = {
    id: "t1",
    name: "Acme",
    slug: "acme",
    legalName: "Acme Logistics, Inc.",
    website: "https://acme.io",
    industry: "Logistics",
    description: null,
    timeZone: "Africa/Lagos",
    locale: "en-US",
    addressLine1: "1 Market St",
    addressLine2: null,
    city: "Lagos",
    region: "LA",
    postalCode: "100001",
    country: "NG",
    contactName: "Ada Ops",
    contactEmail: "ops@acme.io",
    contactPhone: "+234 800 0000",
  };

  /** Build an app with org read/write mocks and the given permission keys. */
  const orgApp = (
    keys: string[],
    tenantMocks: Record<string, ReturnType<typeof vi.fn>> = {},
  ) =>
    buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: { findMany: vi.fn().mockResolvedValue(rolesWithPerms(keys)) },
        tenant: tenantMocks,
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      },
    });

  it("returns the organization profile with platform.tenant.view (200)", async () => {
    const app = await orgApp([PermissionKeys.PlatformTenantView], {
      findUnique: vi.fn().mockResolvedValue(ORG_ROW),
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/t1/organization`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      id: "t1",
      slug: "acme",
      legalName: "Acme Logistics, Inc.",
      website: "https://acme.io",
      country: "NG",
      contactEmail: "ops@acme.io",
    });
    await app.close();
  });

  it("returns 404 for a non-existent tenant organization", async () => {
    const app = await orgApp([PermissionKeys.PlatformTenantView], {
      findUnique: vi.fn().mockResolvedValue(null),
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/missing/organization`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("denies reading the organization WITHOUT platform.tenant.view (403)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: { findMany: vi.fn().mockResolvedValue([]) },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/t1/organization`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("PLATFORM_ACCESS_DENIED");
    await app.close();
  });

  it("updates organization fields with platform.tenant.update (200) and audits changed keys", async () => {
    const update = vi.fn().mockResolvedValue({});
    const auditCreate = vi.fn().mockResolvedValue({});
    const findUnique = vi
      .fn()
      // 1st: existence check; 2nd: getTenantOrganization() after update.
      .mockResolvedValueOnce({ id: "t1" })
      .mockResolvedValue({ ...ORG_ROW, legalName: "Acme Global Ltd" });
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformTenantUpdate]),
            ),
        },
        tenant: { findUnique, update },
        auditLog: { create: auditCreate },
      },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/organization`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { legalName: "Acme Global Ltd", industry: "Freight" },
    });

    expect(res.statusCode).toBe(200);
    // Only the provided keys are written.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: { legalName: "Acme Global Ltd", industry: "Freight" },
      }),
    );
    // Audited as TENANT_ORGANIZATION_UPDATED with the changed key names only.
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "TENANT_ORGANIZATION_UPDATED",
          metadata: expect.objectContaining({
            changed: expect.arrayContaining(["legalName", "industry"]),
          }),
        }),
      }),
    );
    await app.close();
  });

  it("clears a field when an empty string is provided (stored as null)", async () => {
    const update = vi.fn().mockResolvedValue({});
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: "t1" })
      .mockResolvedValue({ ...ORG_ROW, website: null });
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformTenantUpdate]),
            ),
        },
        tenant: { findUnique, update },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/organization`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { website: "" },
    });

    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { website: null } }),
    );
    await app.close();
  });

  it("rejects a malformed website (400 VALIDATION_ERROR)", async () => {
    const app = await orgApp([PermissionKeys.PlatformTenantUpdate], {
      findUnique: vi.fn().mockResolvedValue({ id: "t1" }),
      update: vi.fn(),
    });
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/organization`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { website: "notaurl" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    await app.close();
  });

  it("rejects a malformed contact email (400 VALIDATION_ERROR)", async () => {
    const app = await orgApp([PermissionKeys.PlatformTenantUpdate], {
      findUnique: vi.fn().mockResolvedValue({ id: "t1" }),
      update: vi.fn(),
    });
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/organization`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { contactEmail: "nope" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    await app.close();
  });

  it("denies organization update WITHOUT platform.tenant.update (403)", async () => {
    const app = await orgApp([PermissionKeys.PlatformTenantView], {
      findUnique: vi.fn().mockResolvedValue({ id: "t1" }),
      update: vi.fn(),
    });
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/organization`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { legalName: "X" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("PLATFORM_ACCESS_DENIED");
    await app.close();
  });

  it("returns 404 when updating a non-existent tenant organization", async () => {
    const app = await orgApp([PermissionKeys.PlatformTenantUpdate], {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    });
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/missing/organization`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { legalName: "X" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
