import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TenantService } from "../tenant.service.js";
import { ErrorCode } from "@core/errors/index.js";

/**
 * Unit tests for TenantService.resolveForUser — the tenant-boundary security
 * gate. We hand-build a Prisma stub returning a single membership row.
 */

function makePrisma(membership: unknown): PrismaClient {
  return {
    tenantMembership: {
      findUnique: vi.fn().mockResolvedValue(membership),
    },
  } as unknown as PrismaClient;
}

const ACTIVE_MEMBERSHIP = {
  status: "ACTIVE",
  tenant: { id: "tenant-a", slug: "acme", status: "ACTIVE" },
};

describe("TenantService.resolveForUser", () => {
  it("returns a validated context for an active membership in an active tenant", async () => {
    const svc = new TenantService(makePrisma(ACTIVE_MEMBERSHIP));

    const ctx = await svc.resolveForUser("user-1", "tenant-a");

    expect(ctx).toEqual({
      tenantId: "tenant-a",
      slug: "acme",
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    });
  });

  it("denies access when the user has no membership (no enumeration)", async () => {
    const svc = new TenantService(makePrisma(null));

    await expect(
      svc.resolveForUser("user-1", "tenant-a"),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: ErrorCode.TENANT_ACCESS_DENIED,
    });
  });

  it("refuses a suspended tenant", async () => {
    const svc = new TenantService(
      makePrisma({
        status: "ACTIVE",
        tenant: { id: "tenant-a", slug: "acme", status: "SUSPENDED" },
      }),
    );

    await expect(
      svc.resolveForUser("user-1", "tenant-a"),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: ErrorCode.TENANT_SUSPENDED,
    });
  });

  it("refuses an archived tenant", async () => {
    const svc = new TenantService(
      makePrisma({
        status: "ACTIVE",
        tenant: { id: "tenant-a", slug: "acme", status: "ARCHIVED" },
      }),
    );

    await expect(
      svc.resolveForUser("user-1", "tenant-a"),
    ).rejects.toMatchObject({
      code: ErrorCode.TENANT_SUSPENDED,
    });
  });

  it("allows a suspended tenant when allowSuspended is set (platform inspection)", async () => {
    const svc = new TenantService(
      makePrisma({
        status: "ACTIVE",
        tenant: { id: "tenant-a", slug: "acme", status: "SUSPENDED" },
      }),
    );

    const ctx = await svc.resolveForUser("user-1", "tenant-a", {
      allowSuspended: true,
    });
    expect(ctx.status).toBe("SUSPENDED");
  });

  it("refuses an inactive membership even in an active tenant", async () => {
    const svc = new TenantService(
      makePrisma({
        status: "SUSPENDED",
        tenant: { id: "tenant-a", slug: "acme", status: "ACTIVE" },
      }),
    );

    await expect(
      svc.resolveForUser("user-1", "tenant-a"),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: ErrorCode.TENANT_MEMBERSHIP_INACTIVE,
    });
  });
});
