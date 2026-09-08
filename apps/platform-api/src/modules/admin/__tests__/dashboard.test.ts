import { describe, it, expect, vi } from "vitest";
import { buildTestApp, signTestToken } from "@core/testing/test-app.js";
import { PermissionKeys } from "@app/api-contracts";

/**
 * Dashboard metrics endpoint tests — verify the metrics.read gate and the
 * aggregated response shape (totals + recent users + a filled 7-day signups
 * series), independently of the Admin UI.
 */
const URL = "/api/v1/admin/dashboard";

function userRolesWith(permissions: string[]) {
  return permissions.length
    ? [
        {
          role: {
            name: "T",
            permissions: permissions.map((key) => ({ permission: { key } })),
          },
        },
      ]
    : [];
}

function appWith(permissions: string[]) {
  const now = new Date();
  return buildTestApp({
    prisma: {
      userRole: {
        findMany: vi.fn().mockResolvedValue(userRolesWith(permissions)),
      },
      user: {
        count: vi.fn().mockResolvedValue(42),
        findMany: vi
          .fn()
          // recentUsers call, then windowUsers call
          .mockResolvedValueOnce([
            {
              id: "u1",
              email: "a@x.io",
              name: "Alice",
              role: "admin",
              createdAt: now,
            },
          ])
          .mockResolvedValueOnce([{ createdAt: now }, { createdAt: now }]),
      },
      role: { count: vi.fn().mockResolvedValue(5) },
      permission: { count: vi.fn().mockResolvedValue(26) },
    },
  });
}

describe("GET /admin/dashboard", () => {
  it("401 unauthenticated", async () => {
    const app = await appWith([]);
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("403 without metrics.read", async () => {
    const app = await appWith([PermissionKeys.UsersRead]);
    const token = signTestToken(app);
    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns aggregated metrics with metrics.read (200)", async () => {
    const app = await appWith([PermissionKeys.MetricsRead]);
    const token = signTestToken(app);
    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.totals).toEqual({ users: 42, roles: 5, permissions: 26 });
    expect(body.data.recentUsers).toHaveLength(1);
    expect(body.data.recentUsers[0].email).toBe("a@x.io");
    // 7-day window, gaps filled with 0, ordered oldest → newest.
    expect(body.data.signups).toHaveLength(7);
    const total = body.data.signups.reduce(
      (s: number, p: { count: number }) => s + p.count,
      0,
    );
    expect(total).toBe(2);
    await app.close();
  });
});
