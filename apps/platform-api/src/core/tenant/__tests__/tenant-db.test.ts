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

// Builds a mock Prisma whose gym-model delegates all record their calls.
function makeGymPrisma() {
  const model = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "x" }),
    count: vi.fn().mockResolvedValue(0),
  });
  const delegates = {
    member: model(),
    trainer: model(),
    exercise: model(),
    workout: model(),
    workoutItem: model(),
    workoutPlan: model(),
    workoutSession: model(),
    attendance: model(),
  };
  return {
    prisma: delegates as unknown as PrismaClient,
    delegates,
  };
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

// ─── Gym domain (Phase 6A) ────────────────────────────────────────────────────
// Every tenant-owned gym accessor must thread tenantId into reads AND writes so
// a caller cannot cross a tenant boundary. We assert the behaviour uniformly
// across all eight accessors, plus the create/count paths on a representative
// model.
describe("getTenantDb (gym-domain accessors)", () => {
  const accessorNames = [
    "member",
    "trainer",
    "exercise",
    "workout",
    "workoutItem",
    "workoutPlan",
    "workoutSession",
    "attendance",
  ] as const;

  for (const name of accessorNames) {
    it(`${name}.findMany injects tenantId into where`, async () => {
      const { prisma, delegates } = makeGymPrisma();
      const db = getTenantDb(prisma, "tenant-a");
      await db[name].findMany({ where: { status: "ACTIVE" } });

      expect(delegates[name].findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "ACTIVE", tenantId: "tenant-a" },
        }),
      );
    });

    it(`${name}.findFirst injects tenantId into where`, async () => {
      const { prisma, delegates } = makeGymPrisma();
      const db = getTenantDb(prisma, "tenant-a");
      await db[name].findFirst({ where: { id: "z" } });

      expect(delegates[name].findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "z", tenantId: "tenant-a" } }),
      );
    });
  }

  it("member.create injects tenantId into data", async () => {
    const { prisma, delegates } = makeGymPrisma();
    await getTenantDb(prisma, "tenant-a").member.create({
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(delegates.member.create).toHaveBeenCalledWith({
      data: { firstName: "Ada", lastName: "Lovelace", tenantId: "tenant-a" },
    });
  });

  it("attendance.count scopes by tenant", async () => {
    const { prisma, delegates } = makeGymPrisma();
    await getTenantDb(prisma, "tenant-a").attendance.count({
      method: "MANUAL",
    });

    expect(delegates.attendance.count).toHaveBeenCalledWith({
      where: { method: "MANUAL", tenantId: "tenant-a" },
    });
  });

  it("two accessors bound to different tenants never share scope", async () => {
    const { prisma, delegates } = makeGymPrisma();
    await getTenantDb(prisma, "tenant-a").member.findMany();
    await getTenantDb(prisma, "tenant-b").member.findMany();

    expect(delegates.member.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { tenantId: "tenant-a" } }),
    );
    expect(delegates.member.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { tenantId: "tenant-b" } }),
    );
  });
});
