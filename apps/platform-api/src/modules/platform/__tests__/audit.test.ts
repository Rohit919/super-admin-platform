import { describe, it, expect, vi } from "vitest";
import { buildTestApp } from "@core/testing/test-app.js";
import { PermissionKeys } from "@app/api-contracts";

/**
 * Platform audit tests:
 *   - tenant status change emits a TENANT_* audit event (correct action + tenant)
 *   - credential creation emits an audit event whose metadata carries NO secret
 *   - GET /platform/audit is gated by platform.audit.view and lists events
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
const TENANT_ROW = {
  id: "t1",
  name: "Acme",
  slug: "acme",
  status: "ACTIVE",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  _count: { memberships: 1 },
};

describe("Platform audit — emission", () => {
  it("records a TENANT_SUSPENDED event on suspend (no secrets)", async () => {
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
              rolesWithPerms([PermissionKeys.PlatformTenantSuspend]),
            ),
        },
        tenant: {
          findUnique: vi.fn().mockResolvedValue(TENANT_ROW),
          update: vi.fn().mockResolvedValue({}),
        },
        auditLog: { create: auditCreate },
      },
    });
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/t1/status`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { status: "SUSPENDED" },
    });
    expect(res.statusCode).toBe(200);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const entry = auditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("TENANT_SUSPENDED");
    expect(entry.tenantId).toBe("t1");
    expect(entry.targetType).toBe("TENANT");
    expect(entry.actorId).toBe("sa-1");
    await app.close();
  });

  it("records TENANT_CREDENTIAL_CREATED with NO secret in metadata", async () => {
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
              rolesWithPerms([PermissionKeys.PlatformCredentialCreate]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t1" }) },
        tenantApiCredential: {
          create: vi.fn().mockResolvedValue({
            id: "cred-1",
            tenantId: "t1",
            name: "CI",
            publicKey: "pk_abc",
            secretKeyHash: "hash",
            status: "ACTIVE",
            lastUsedAt: null,
            expiresAt: null,
            createdAt: new Date("2026-01-01"),
            revokedAt: null,
          }),
        },
        auditLog: { create: auditCreate },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/tenants/t1/credentials`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { name: "CI" },
    });
    expect(res.statusCode).toBe(201);
    const secret = res.json().data.secretKey as string;

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const entry = auditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("TENANT_CREDENTIAL_CREATED");
    expect(entry.tenantId).toBe("t1");
    expect(entry.targetType).toBe("TENANT_API_CREDENTIAL");
    expect(entry.targetId).toBe("cred-1");
    // Metadata carries the publicKey but NEVER the secret or its hash.
    expect(entry.metadata).toMatchObject({ publicKey: "pk_abc" });
    expect(JSON.stringify(entry.metadata)).not.toContain(secret);
    expect(JSON.stringify(entry.metadata)).not.toContain("hash");
    await app.close();
  });
});

describe("Platform audit — read endpoint", () => {
  it("denies without platform.audit.view (403)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: { findMany: vi.fn().mockResolvedValue([]) },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/audit`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("lists audit events with platform.audit.view (200)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformAuditView]),
            ),
        },
        auditLog: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "a1",
              action: "TENANT_SUSPENDED",
              tenantId: "t1",
              actorId: "sa-1",
              targetType: "TENANT",
              targetId: "t1",
              metadata: { from: "ACTIVE", to: "SUSPENDED" },
              requestId: "req-1",
              createdAt: new Date("2026-01-02"),
            },
          ]),
        },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/audit`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data).toHaveLength(1);
    expect(data[0].action).toBe("TENANT_SUSPENDED");
    expect(data[0].tenantId).toBe("t1");
    await app.close();
  });
});
