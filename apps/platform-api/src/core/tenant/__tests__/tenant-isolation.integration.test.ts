import { describe, it, expect, vi } from "vitest";
import { buildTestApp } from "@core/testing/test-app.js";

/**
 * Tenant isolation — HTTP-level security tests through the REAL route stack
 * (auth → tenant-resolution hook → route). These assert the boundary the spec
 * calls the most important rule: the backend enforces tenant ownership even if
 * the client ignores the Admin UI (MULTI-TENANT §96-§109, §149, §152).
 *
 * The tenant-resolution hook resolves the active tenant via
 * tenantMembership.findUnique({ tenantId_userId }) — so our mock returns a
 * membership (or not) to model belongs / doesn't-belong / suspended / inactive.
 */

const CURRENT = "/api/v1/tenants/current";

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

describe("Tenant isolation (HTTP boundary)", () => {
  it("rejects an X-Tenant-Id header for a tenant the user does NOT belong to (403)", async () => {
    // No membership for ANY tenant → the hook denies whatever tenant is claimed.
    const findUnique = vi.fn().mockResolvedValue(null);
    const app = await buildTestApp({
      prisma: { tenantMembership: { findUnique } },
    });

    // Attacker holds a valid token for their own tenant but spoofs the header
    // to point at another tenant they have no membership in.
    const res = await app.inject({
      method: "GET",
      url: CURRENT,
      headers: {
        authorization: `Bearer ${token(app, "my-tenant")}`,
        "x-tenant-id": "victim-tenant",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("TENANT_ACCESS_DENIED");
    // The hook must have validated the SPOOFED tenant, not trusted it.
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_userId: { tenantId: "victim-tenant", userId: "u-1" },
        },
      }),
    );
    await app.close();
  });

  it("blocks a suspended tenant (403 TENANT_SUSPENDED)", async () => {
    const app = await buildTestApp({
      prisma: {
        tenantMembership: {
          findUnique: vi.fn().mockResolvedValue({
            status: "ACTIVE",
            tenant: { id: "t1", slug: "acme", status: "SUSPENDED" },
          }),
        },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: CURRENT,
      headers: { authorization: `Bearer ${token(app, "t1")}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("TENANT_SUSPENDED");
    await app.close();
  });

  it("blocks a revoked/inactive membership (403 TENANT_MEMBERSHIP_INACTIVE)", async () => {
    const app = await buildTestApp({
      prisma: {
        tenantMembership: {
          findUnique: vi.fn().mockResolvedValue({
            status: "REMOVED",
            tenant: { id: "t1", slug: "acme", status: "ACTIVE" },
          }),
        },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: CURRENT,
      headers: { authorization: `Bearer ${token(app, "t1")}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("TENANT_MEMBERSHIP_INACTIVE");
    await app.close();
  });

  it("allows a valid active membership in an active tenant (200)", async () => {
    const app = await buildTestApp({
      prisma: {
        tenantMembership: {
          findUnique: vi.fn().mockResolvedValue({
            status: "ACTIVE",
            tenant: { id: "t1", slug: "acme", status: "ACTIVE" },
          }),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue({ name: "Acme" }) },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: CURRENT,
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

  it("RBAC: a tenant role grants permissions ONLY within its own tenant", async () => {
    // The user has a tenant-scoped role assignment. The AuthorizationService
    // scopes userRole.findMany by {userId, OR:[{tenantId:null},{tenantId:active}]}.
    // We assert the query is scoped to the ACTIVE tenant so another tenant's
    // assignments can never contribute (MULTI-TENANT §26, §58, §106).
    const userRoleFindMany = vi.fn().mockResolvedValue([
      {
        role: {
          name: "Dispatcher",
          permissions: [{ permission: { key: "users.read" } }],
        },
      },
    ]);
    const app = await buildTestApp({
      prisma: {
        tenantMembership: {
          findUnique: vi.fn().mockResolvedValue({
            status: "ACTIVE",
            tenant: { id: "t1", slug: "acme", status: "ACTIVE" },
          }),
        },
        userRole: { findMany: userRoleFindMany },
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: "u-1",
            email: "a@b.c",
            name: "Alice",
            role: "user",
            createdAt: new Date("2026-01-01"),
            updatedAt: new Date("2026-01-01"),
          }),
        },
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            id: "t1",
            name: "Acme",
            slug: "acme",
            status: "ACTIVE",
          }),
        },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: { authorization: `Bearer ${token(app, "t1")}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.permissions).toEqual(["users.read"]);
    // Effective permissions were resolved scoped to the active tenant t1 only.
    expect(userRoleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u-1",
          OR: [{ tenantId: null }, { tenantId: "t1" }],
        }),
      }),
    );
    await app.close();
  });

  it("the X-Tenant-Id header overrides the token claim but is still validated", async () => {
    // Token claims t1, header requests t2. The hook validates t2 (the header
    // takes precedence as a switch hint) — and here the user IS a member of t2.
    const findUnique = vi.fn().mockResolvedValue({
      status: "ACTIVE",
      tenant: { id: "t2", slug: "globex", status: "ACTIVE" },
    });
    const app = await buildTestApp({
      prisma: {
        tenantMembership: { findUnique },
        tenant: { findUnique: vi.fn().mockResolvedValue({ name: "Globex" }) },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: CURRENT,
      headers: {
        authorization: `Bearer ${token(app, "t1")}`,
        "x-tenant-id": "t2",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe("t2");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "t2", userId: "u-1" } },
      }),
    );
    await app.close();
  });
});
