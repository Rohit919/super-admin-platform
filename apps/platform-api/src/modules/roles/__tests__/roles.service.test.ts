import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { AuthorizationService } from "@core/authorization/index.js";
import { RolesService } from "../roles.service.js";
import { PermissionKeys, SystemRoles } from "@app/api-contracts";

/**
 * Service-level unit tests for authorization resolution and role assignment
 * business rules, exercised directly (no HTTP layer).
 */

function userRolesWith(roles: { name: string; permissions: string[] }[]) {
  return roles.map((r) => ({
    role: {
      name: r.name,
      permissions: r.permissions.map((key) => ({ permission: { key } })),
    },
  }));
}

describe("AuthorizationService.getContext", () => {
  it("unions permissions across roles and dedupes", async () => {
    const prisma = {
      userRole: {
        findMany: vi.fn().mockResolvedValue(
          userRolesWith([
            {
              name: "A",
              permissions: [PermissionKeys.UsersRead, PermissionKeys.RolesRead],
            },
            {
              name: "B",
              permissions: [PermissionKeys.UsersRead, PermissionKeys.AuditRead],
            },
          ]),
        ),
      },
    } as unknown as PrismaClient;

    const svc = new AuthorizationService(prisma);
    const ctx = await svc.getContext("u1");

    expect(ctx.roles.sort()).toEqual(["A", "B"]);
    expect(ctx.permissions.sort()).toEqual(
      [
        PermissionKeys.AuditRead,
        PermissionKeys.RolesRead,
        PermissionKeys.UsersRead,
      ].sort(),
    );
  });

  it("filters out permission keys not in the registry (default-deny)", async () => {
    const prisma = {
      userRole: {
        findMany: vi.fn().mockResolvedValue(
          userRolesWith([
            {
              name: "X",
              permissions: ["not.a.real.permission", PermissionKeys.UsersRead],
            },
          ]),
        ),
      },
    } as unknown as PrismaClient;

    const svc = new AuthorizationService(prisma);
    const ctx = await svc.getContext("u1");

    expect(ctx.permissions).toEqual([PermissionKeys.UsersRead]);
  });

  it("reports super-admin membership", async () => {
    const prisma = {
      userRole: {
        findMany: vi
          .fn()
          .mockResolvedValue(
            userRolesWith([{ name: SystemRoles.SuperAdmin, permissions: [] }]),
          ),
      },
    } as unknown as PrismaClient;

    const svc = new AuthorizationService(prisma);
    expect(await svc.isSuperAdmin("u1")).toBe(true);
  });

  it("scopes role resolution to platform roles + the active tenant only", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { userRole: { findMany } } as unknown as PrismaClient;
    const svc = new AuthorizationService(prisma);

    await svc.getContext("u1", "tenant-a");

    // Must query platform assignments (tenantId null) OR the active tenant's —
    // never another tenant's roles. This is the RBAC isolation guarantee.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          OR: [{ tenantId: null }, { tenantId: "tenant-a" }],
        }),
      }),
    );
  });

  it("considers only platform roles when no tenant is active", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { userRole: { findMany } } as unknown as PrismaClient;
    const svc = new AuthorizationService(prisma);

    await svc.getContext("u1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          OR: [{ tenantId: null }],
        }),
      }),
    );
    const ctx = await svc.getContext("u1");
    expect(ctx.tenantId).toBeUndefined();
  });
});

describe("RolesService.createRole — delegation guard", () => {
  it("blocks a non-super admin from creating a role with role-management permissions", async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const svc = new RolesService(prisma);

    await expect(
      svc.createRole(
        { name: "Escalator", permissions: [PermissionKeys.RolesUpdate] },
        { userId: "actor", isSuperAdmin: false },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects unknown permission keys with a validation error", async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const svc = new RolesService(prisma);

    await expect(
      svc.createRole(
        { name: "Bad", permissions: ["made.up.permission"] },
        { userId: "actor", isSuperAdmin: true },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects using a reserved system role name", async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const svc = new RolesService(prisma);

    await expect(
      svc.createRole(
        { name: SystemRoles.Admin },
        { userId: "actor", isSuperAdmin: true },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("RolesService.deleteRole — system role protection", () => {
  it("refuses to delete a system role (403)", async () => {
    const prisma = {
      role: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "r1", name: "ADMIN", isSystem: true }),
      },
    } as unknown as PrismaClient;

    const svc = new RolesService(prisma);

    await expect(svc.deleteRole("r1", {})).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
