import { buildTestApp } from "@core/testing/test-app.js";
import { PermissionKeys } from "@app/api-contracts";

/**
 * Plans & Entitlements route tests (Phase 19.6). Same platform boundary as the
 * rest of /platform/*: membership gate + platform.plan.* / platform.entitlement.*
 * permission, default-deny. Also verifies override-over-plan precedence in the
 * effective entitlement resolution.
 */
const BASE = "/api/v1/platform";

function token(app: Awaited<ReturnType<typeof buildTestApp>>): string {
  return app.jwt.sign({ id: "sa-1", email: "super@platform.io", role: "user" });
}

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

describe("Plans & entitlements authorization", () => {
  it("denies listing plans without platform.plan.view (403)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: { findMany: vi.fn().mockResolvedValue(rolesWithPerms([])) },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/plans`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("PLATFORM_ACCESS_DENIED");
    await app.close();
  });

  it("lists plans with platform.plan.view (200)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformPlanView]),
            ),
        },
        plan: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "p1",
              key: "starter",
              name: "Starter",
              description: null,
              isSystem: true,
              createdAt: new Date("2026-01-01"),
              entitlements: [
                {
                  value: "5",
                  entitlement: {
                    key: "max_users",
                    name: "Maximum users",
                    valueType: "NUMERIC",
                  },
                },
              ],
            },
          ]),
        },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/plans`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data).toHaveLength(1);
    expect(data[0].key).toBe("starter");
    expect(data[0].entitlements[0].key).toBe("max_users");
    await app.close();
  });

  it("resolves effective entitlements with override winning over plan (200)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformEntitlementView]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t1" }) },
        tenantPlan: {
          findUnique: vi.fn().mockResolvedValue({
            tenantId: "t1",
            plan: {
              key: "starter",
              name: "Starter",
              entitlements: [
                {
                  value: "5",
                  entitlement: {
                    key: "max_users",
                    name: "Maximum users",
                    valueType: "NUMERIC",
                  },
                },
              ],
            },
          }),
        },
        tenantEntitlementOverride: {
          findMany: vi.fn().mockResolvedValue([
            {
              value: "25",
              entitlement: {
                key: "max_users",
                name: "Maximum users",
                valueType: "NUMERIC",
              },
            },
          ]),
        },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/t1/entitlements`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.plan.key).toBe("starter");
    // Override value wins over the plan value, and is marked as OVERRIDE.
    const maxUsers = data.entitlements.find(
      (e: { key: string }) => e.key === "max_users",
    );
    expect(maxUsers.value).toBe("25");
    expect(maxUsers.source).toBe("OVERRIDE");
    await app.close();
  });

  it("assigns a plan to a tenant with platform.plan.manage (200)", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformPlanManage]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t1" }) },
        plan: {
          findUnique: vi.fn().mockResolvedValue({ id: "p1", key: "growth" }),
        },
        tenantPlan: {
          upsert,
          findUnique: vi.fn().mockResolvedValue({
            tenantId: "t1",
            plan: { key: "growth", name: "Growth", entitlements: [] },
          }),
        },
        tenantEntitlementOverride: { findMany: vi.fn().mockResolvedValue([]) },
        auditLog: { create: vi.fn().mockResolvedValue(null) },
      },
    });
    const res = await app.inject({
      method: "PUT",
      url: `${BASE}/tenants/t1/plan`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { planKey: "growth" },
    });
    expect(res.statusCode).toBe(200);
    expect(upsert).toHaveBeenCalled();
    expect(res.json().data.plan.key).toBe("growth");
    await app.close();
  });

  it("denies setting an entitlement override without platform.entitlement.manage (403)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformEntitlementView]),
            ),
        },
      },
    });
    const res = await app.inject({
      method: "PUT",
      url: `${BASE}/tenants/t1/entitlements/max_users`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { value: "25" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("PLATFORM_ACCESS_DENIED");
    await app.close();
  });

  it("sets a per-tenant entitlement override with platform.entitlement.manage (200) and audits it", async () => {
    const overrideUpsert = vi.fn().mockResolvedValue({});
    const auditCreate = vi.fn().mockResolvedValue({});
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformEntitlementManage]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t1" }) },
        entitlement: {
          findUnique: vi.fn().mockResolvedValue({ id: "e1", key: "max_users" }),
        },
        tenantEntitlementOverride: {
          upsert: overrideUpsert,
          findMany: vi.fn().mockResolvedValue([
            {
              value: "25",
              entitlement: {
                key: "max_users",
                name: "Maximum users",
                valueType: "NUMERIC",
              },
            },
          ]),
        },
        tenantPlan: { findUnique: vi.fn().mockResolvedValue(null) },
        auditLog: { create: auditCreate },
      },
    });
    const res = await app.inject({
      method: "PUT",
      url: `${BASE}/tenants/t1/entitlements/max_users`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { value: "25" },
    });
    expect(res.statusCode).toBe(200);
    expect(overrideUpsert).toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "TENANT_ENTITLEMENT_OVERRIDE_SET",
        }),
      }),
    );
    const maxUsers = res
      .json()
      .data.entitlements.find((e: { key: string }) => e.key === "max_users");
    expect(maxUsers.source).toBe("OVERRIDE");
    await app.close();
  });
});
