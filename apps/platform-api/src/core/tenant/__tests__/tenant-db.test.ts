import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getTenantDb } from "../tenant-db.js";

/**
 * The explicit accessor must thread tenantId into every tenant-owned query —
 * where-clauses for reads, and data for creates. Verified via the auditLog
 * accessor (the current tenant-owned surface; the demo `todo` accessor was
 * removed in Phase 14).
 */

function makePrisma() {
  const auditLog = {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "a" }),
    count: vi.fn().mockResolvedValue(0),
  };
  return { prisma: { auditLog } as unknown as PrismaClient, auditLog };
}

describe("getTenantDb (auditLog accessor)", () => {
  it("injects tenantId into findMany where", async () => {
    const { prisma, auditLog } = makePrisma();
    await getTenantDb(prisma, "tenant-a").auditLog.findMany({
      where: { action: "TENANT_SUSPENDED" },
    });

    expect(auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: "TENANT_SUSPENDED", tenantId: "tenant-a" },
      }),
    );
  });

  it("injects tenantId into create data", async () => {
    const { prisma, auditLog } = makePrisma();
    await getTenantDb(prisma, "tenant-a").auditLog.create({
      action: "TENANT_ACTIVATED",
      actorId: "u1",
    });

    expect(auditLog.create).toHaveBeenCalledWith({
      data: { action: "TENANT_ACTIVATED", actorId: "u1", tenantId: "tenant-a" },
    });
  });

  it("scopes count by tenant", async () => {
    const { prisma, auditLog } = makePrisma();
    await getTenantDb(prisma, "tenant-a").auditLog.count({ action: "X" });

    expect(auditLog.count).toHaveBeenCalledWith({
      where: { action: "X", tenantId: "tenant-a" },
    });
  });

  it("exposes the bound tenantId", () => {
    const { prisma } = makePrisma();
    expect(getTenantDb(prisma, "tenant-a").tenantId).toBe("tenant-a");
  });
});
