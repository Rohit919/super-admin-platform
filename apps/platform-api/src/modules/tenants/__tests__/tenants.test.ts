import { describe, it, expect, vi } from "vitest";
import { buildTestApp } from "@core/testing/test-app.js";

/**
 * Tenant route tests — verify the tenant endpoints and their security boundary
 * independently of the Admin UI:
 *   - GET /tenants returns only the caller's own memberships
 *   - GET /tenants/current requires an active tenant
 *   - POST /tenants/switch validates membership (403 for a tenant you don't
 *     belong to) and issues a new access token for one you do
 */
const BASE = "/api/v1/tenants";

/** Sign a token, optionally carrying an active tenant claim. */
function token(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  tenantId?: string,
): string {
  return app.jwt.sign({
    id: "u-1",
    email: "a@b.c",
    role: "user",
    ...(tenantId ? { tenantId } : {}),
  });
}

const activeMembership = (tenantId: string, name = "Acme") => ({
  status: "ACTIVE",
  tenant: { id: tenantId, name, slug: "acme", status: "ACTIVE" },
});

describe("GET /tenants (my memberships)", () => {
  it("401 when unauthenticated", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: BASE });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns only the caller memberships (excluding REMOVED)", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        status: "ACTIVE",
        tenant: { id: "t1", name: "Acme", slug: "acme", status: "ACTIVE" },
      },
      {
        status: "INVITED",
        tenant: { id: "t2", name: "Globex", slug: "globex", status: "ACTIVE" },
      },
    ]);
    const app = await buildTestApp({
      prisma: {
        tenantMembership: {
          findMany,
          findUnique: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: BASE,
      headers: { authorization: `Bearer ${token(app)}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      tenant: { id: "t1", slug: "acme" },
      membershipStatus: "ACTIVE",
    });
    // The query must be scoped to the caller and exclude REMOVED memberships.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u-1", status: { not: "REMOVED" } },
      }),
    );
    await app.close();
  });
});

describe("GET /tenants/current", () => {
  it("returns the active tenant when the membership is valid", async () => {
    const app = await buildTestApp({
      prisma: {
        tenantMembership: {
          findUnique: vi.fn().mockResolvedValue(activeMembership("t1")),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue({ name: "Acme" }) },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `${BASE}/current`,
      headers: { authorization: `Bearer ${token(app, "t1")}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      id: "t1",
      slug: "acme",
      status: "ACTIVE",
    });
    await app.close();
  });

  it("401 when the session has no active tenant", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/current`,
      headers: { authorization: `Bearer ${token(app)}` }, // no tenant claim
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe("POST /tenants/switch", () => {
  it("403 when switching to a tenant the user does not belong to", async () => {
    const app = await buildTestApp({
      prisma: {
        // No membership for the target tenant → TenantService denies.
        tenantMembership: { findUnique: vi.fn().mockResolvedValue(null) },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE}/switch`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { tenantId: "not-mine" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("TENANT_ACCESS_DENIED");
    await app.close();
  });

  it("issues a new access token scoped to the target tenant", async () => {
    const app = await buildTestApp({
      prisma: {
        tenantMembership: {
          // Membership for the target tenant (used by both switch validation
          // and buildTokenPayload's active-tenant resolution).
          findUnique: vi
            .fn()
            .mockResolvedValue(activeMembership("t2", "Globex")),
          findFirst: vi.fn().mockResolvedValue({ tenantId: "t2" }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: "u-1",
            email: "a@b.c",
            role: "user",
            permissionVersion: 0,
          }),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue({ name: "Globex" }) },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE}/switch`,
      headers: { authorization: `Bearer ${token(app, "t1")}` },
      payload: { tenantId: "t2" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.tenant).toMatchObject({
      id: "t2",
      slug: "acme",
      status: "ACTIVE",
    });
    expect(typeof body.data.accessToken).toBe("string");

    // The new token must carry the switched tenant claim.
    const decoded = app.jwt.decode(body.data.accessToken) as {
      tenantId?: string;
    };
    expect(decoded.tenantId).toBe("t2");
    await app.close();
  });
});
