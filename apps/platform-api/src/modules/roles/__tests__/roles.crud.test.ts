import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { RolesService } from "../roles.service.js";
import { PermissionKeys, SystemRoles } from "@app/api-contracts";

/**
 * Happy-path + branch coverage for RolesService mutations, exercised directly.
 * A shared mock Prisma with an interactive $transaction that runs the callback
 * with the same client (so tx.* calls resolve).
 */

function roleRow(
  over: Partial<{
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
  }> = {},
) {
  return {
    id: over.id ?? "role-1",
    name: over.name ?? "CustomRole",
    description: over.description ?? "desc",
    isSystem: over.isSystem ?? false,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-02T00:00:00Z"),
    permissions: [{ permission: { key: PermissionKeys.UsersRead } }],
  };
}

function makePrisma(over: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    role: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([roleRow()]),
      create: vi.fn().mockResolvedValue({ id: "role-new" }),
      update: vi.fn().mockResolvedValue({ id: "role-1" }),
      delete: vi.fn().mockResolvedValue({ id: "role-1" }),
    },
    permission: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: "perm-1", key: PermissionKeys.UsersRead, description: "x" },
        ]),
    },
    rolePermission: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(1),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "target", email: "t@x.com" }),
      update: vi.fn().mockResolvedValue({ id: "target" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue(null) },
  };
  const merged = { ...base, ...over } as Record<string, unknown>;
  (merged as { $transaction: unknown }).$transaction = async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(merged)
      : Promise.all(arg as Promise<unknown>[]);
  return merged as unknown as PrismaClient;
}

const AUDIT = {
  actorId: "actor",
  requestId: "req-1",
  ip: "127.0.0.1",
  userAgent: "test",
};

describe("RolesService — read operations", () => {
  it("lists roles as DTOs", async () => {
    const svc = new RolesService(makePrisma());
    const roles = await svc.listRoles();
    expect(roles[0]).toMatchObject({
      name: "CustomRole",
      permissions: [PermissionKeys.UsersRead],
    });
  });

  it("gets a role by id", async () => {
    const prisma = makePrisma({
      role: {
        findUnique: vi.fn().mockResolvedValue(roleRow({ id: "role-1" })),
      },
    });
    const svc = new RolesService(prisma);
    const role = await svc.getRole("role-1");
    expect(role.id).toBe("role-1");
  });

  it("throws 404 for a missing role", async () => {
    const svc = new RolesService(makePrisma());
    await expect(svc.getRole("nope")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("lists permissions and user roles", async () => {
    const prisma = makePrisma({
      permission: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "perm-1", key: PermissionKeys.UsersRead, description: "x" },
          ]),
      },
      userRole: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ role: { name: SystemRoles.Support } }]),
      },
    });
    const svc = new RolesService(prisma);
    await expect(svc.listPermissions()).resolves.toHaveLength(1);
    const roles = await svc.getUserRoles("u1");
    expect(roles).toEqual([SystemRoles.Support]);
  });
});

describe("RolesService — createRole (happy path)", () => {
  it("creates a role with permissions and audits", async () => {
    const prisma = makePrisma({
      role: {
        // Name uniqueness check (findFirst, tenant-scoped) → no existing role.
        findFirst: vi.fn().mockResolvedValue(null),
        // After create, getRole re-reads by id → return a populated role.
        findUnique: vi
          .fn()
          .mockResolvedValue(roleRow({ id: "role-new", name: "Ops" })),
        create: vi.fn().mockResolvedValue({ id: "role-new" }),
      },
    });
    const auditCreate = (
      prisma as unknown as { auditLog: { create: ReturnType<typeof vi.fn> } }
    ).auditLog.create;

    const svc = new RolesService(prisma);
    const role = await svc.createRole(
      {
        name: "Ops",
        description: "ops",
        permissions: [PermissionKeys.UsersRead],
      },
      { userId: "actor", isSuperAdmin: true },
      AUDIT,
    );

    expect(role.id).toBe("role-new");
    expect(auditCreate).toHaveBeenCalled();
  });

  it("rejects a duplicate role name (409)", async () => {
    const prisma = makePrisma({
      role: { findFirst: vi.fn().mockResolvedValue(roleRow({ name: "Dup" })) },
    });
    const svc = new RolesService(prisma);
    await expect(
      svc.createRole(
        { name: "Dup" },
        { userId: "a", isSuperAdmin: true },
        AUDIT,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("RolesService — updateRole / setRolePermissions", () => {
  it("updates a custom role permission set and audits", async () => {
    const prisma = makePrisma({
      role: {
        findUnique: vi
          .fn()
          .mockResolvedValue(roleRow({ id: "role-1", isSystem: false })),
        update: vi.fn().mockResolvedValue({ id: "role-1" }),
      },
    });
    const svc = new RolesService(prisma);
    const role = await svc.updateRole(
      "role-1",
      { description: "new", permissions: [PermissionKeys.UsersRead] },
      { userId: "actor", isSuperAdmin: true },
      AUDIT,
    );
    expect(role.id).toBe("role-1");
  });

  it("blocks a non-super admin from modifying a system role (403)", async () => {
    const prisma = makePrisma({
      role: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            roleRow({ id: "r", name: "ADMIN", isSystem: true }),
          ),
      },
    });
    const svc = new RolesService(prisma);
    await expect(
      svc.updateRole(
        "r",
        { description: "x" },
        { userId: "a", isSuperAdmin: false },
        AUDIT,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("replaces a role permission set via setRolePermissions", async () => {
    const prisma = makePrisma({
      role: {
        findUnique: vi
          .fn()
          .mockResolvedValue(roleRow({ id: "role-1", isSystem: false })),
      },
    });
    const svc = new RolesService(prisma);
    const role = await svc.setRolePermissions(
      "role-1",
      [PermissionKeys.UsersRead],
      { userId: "actor", isSuperAdmin: true },
      AUDIT,
    );
    expect(role.id).toBe("role-1");
  });
});

describe("RolesService — deleteRole (happy path)", () => {
  it("deletes a custom role and audits", async () => {
    const prisma = makePrisma({
      role: {
        findUnique: vi
          .fn()
          .mockResolvedValue(roleRow({ id: "role-1", isSystem: false })),
        delete: vi.fn().mockResolvedValue({ id: "role-1" }),
      },
    });
    const svc = new RolesService(prisma);
    await expect(svc.deleteRole("role-1", AUDIT)).resolves.toBeUndefined();
  });
});

describe("RolesService — setUserRoles (happy path)", () => {
  it("a super admin assigns roles, bumps permissionVersion, and audits", async () => {
    const supportRole = { id: "role-support", name: SystemRoles.Support };
    const prisma = makePrisma({
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "target", email: "t@x.com" }),
        update: vi.fn(),
      },
      role: { findMany: vi.fn().mockResolvedValue([supportRole]) },
      userRole: {
        findMany: vi.fn().mockResolvedValue([]), // no current roles
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(1),
      },
    });
    const userUpdate = (
      prisma as unknown as { user: { update: ReturnType<typeof vi.fn> } }
    ).user.update;

    const svc = new RolesService(prisma);
    const result = await svc.setUserRoles(
      "target",
      [SystemRoles.Support],
      { userId: "actor-super", isSuperAdmin: true },
      AUDIT,
    );

    expect(result).toEqual([SystemRoles.Support]);
    // permissionVersion bump on the target.
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "target" } }),
    );
  });

  it("rejects unknown role names (400)", async () => {
    const prisma = makePrisma({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "target" }) },
      role: { findMany: vi.fn().mockResolvedValue([]) }, // requested role not found
    });
    const svc = new RolesService(prisma);
    await expect(
      svc.setUserRoles(
        "target",
        ["NoSuchRole"],
        { userId: "a", isSuperAdmin: true },
        AUDIT,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 404 when the target user does not exist", async () => {
    const prisma = makePrisma({
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const svc = new RolesService(prisma);
    await expect(
      svc.setUserRoles("ghost", [], { userId: "a", isSuperAdmin: true }, AUDIT),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
