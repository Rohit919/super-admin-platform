import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { assertSameTenant } from "../tenant-relationship-guard.js";
import { ErrorCode } from "@core/errors/index.js";

/**
 * Cross-tenant relationship guard: a referenced record must belong to the same
 * tenant. A record from another tenant (or missing) is rejected identically.
 */

function makePrisma(found: Record<string, { id: string } | null>) {
  const delegates: Record<string, { findFirst: ReturnType<typeof vi.fn> }> = {};
  for (const [model, result] of Object.entries(found)) {
    delegates[model] = { findFirst: vi.fn().mockResolvedValue(result) };
  }
  return { prisma: delegates as unknown as PrismaClient, delegates };
}

describe("assertSameTenant", () => {
  it("passes when every referenced record belongs to the tenant", async () => {
    const { prisma, delegates } = makePrisma({ todo: { id: "d1" } });

    await expect(
      assertSameTenant(prisma, "tenant-a", [{ model: "todo", id: "d1" }]),
    ).resolves.toBeUndefined();

    expect(delegates.todo?.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1", tenantId: "tenant-a" } }),
    );
  });

  it("rejects a reference owned by another tenant (returned as not found)", async () => {
    const { prisma } = makePrisma({ todo: null });

    await expect(
      assertSameTenant(prisma, "tenant-a", [
        { model: "todo", id: "other-tenant-record" },
      ]),
    ).rejects.toMatchObject({ statusCode: 403, code: ErrorCode.FORBIDDEN });
  });

  it("rejects when any one of several references is cross-tenant", async () => {
    const { prisma } = makePrisma({ todo: { id: "d1" }, example: null });

    await expect(
      assertSameTenant(prisma, "tenant-a", [
        { model: "todo", id: "d1" },
        { model: "example", id: "x" },
      ]),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws a programming error for an unknown model", async () => {
    const { prisma } = makePrisma({});
    await expect(
      assertSameTenant(prisma, "tenant-a", [
        { model: "doesNotExist", id: "x" },
      ]),
    ).rejects.toThrow(/unknown or non-queryable/i);
  });
});
