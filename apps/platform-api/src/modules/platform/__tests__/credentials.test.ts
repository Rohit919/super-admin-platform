import { describe, it, expect, vi } from "vitest";
import { buildTestApp } from "@core/testing/test-app.js";
import { PermissionKeys } from "@app/api-contracts";

/**
 * Tenant API credential route tests — the platform security boundary plus the
 * secret-handling contract:
 *   - gated by platform.credential.* (tenant user / missing perm → 403)
 *   - create/rotate return the plaintext secret ONCE
 *   - list NEVER returns a secret
 *   - revoke is auditable and idempotent-safe (double revoke → 409)
 */
const BASE = "/api/v1/platform";
const TENANT = "t1";

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
const TENANT_ROW = { id: TENANT };

function credRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cred-1",
    tenantId: TENANT,
    name: "CI",
    publicKey: "pk_abc",
    secretKeyHash: "hash-never-exposed",
    status: "ACTIVE",
    lastUsedAt: null,
    expiresAt: null,
    createdAt: new Date("2026-01-01"),
    revokedAt: null,
    ...overrides,
  };
}

describe("Tenant API credentials — authorization", () => {
  it("denies a user without platform membership (403)", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/${TENANT}/credentials`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("PLATFORM_ACCESS_DENIED");
    await app.close();
  });

  it("denies a platform member lacking platform.credential.read (403)", async () => {
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
      url: `${BASE}/tenants/${TENANT}/credentials`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("Tenant API credentials — lifecycle", () => {
  it("lists credentials WITHOUT exposing any secret (200)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformCredentialRead]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue(TENANT_ROW) },
        tenantApiCredential: {
          findMany: vi.fn().mockResolvedValue([credRow()]),
        },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/${TENANT}/credentials`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty("publicKey", "pk_abc");
    // No secret / hash ever leaves the API on a list.
    expect(body.data[0]).not.toHaveProperty("secretKey");
    expect(body.data[0]).not.toHaveProperty("secretKeyHash");
    expect(JSON.stringify(body)).not.toContain("hash-never-exposed");
    await app.close();
  });

  it("creates a credential and returns the secret ONCE (201)", async () => {
    const create = vi
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(credRow({ id: "cred-new", ...data })),
      );
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
        tenant: { findUnique: vi.fn().mockResolvedValue(TENANT_ROW) },
        tenantApiCredential: { create },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/tenants/${TENANT}/credentials`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { name: "CI" },
    });
    expect(res.statusCode).toBe(201);
    const { data } = res.json();
    // Secret present exactly here, and it is the plaintext (sk_...) not the hash.
    expect(typeof data.secretKey).toBe("string");
    expect(data.secretKey.startsWith("sk_")).toBe(true);
    expect(data.publicKey.startsWith("pk_")).toBe(true);
    // The stored hash must never be the plaintext secret.
    const createArg = create.mock.calls[0][0].data;
    expect(createArg.secretKeyHash).not.toBe(data.secretKey);
    expect(createArg).not.toHaveProperty("secretKey");
    await app.close();
  });

  it("rotates: revokes the old credential and returns a new secret (200)", async () => {
    const update = vi.fn().mockResolvedValue({});
    const create = vi
      .fn()
      .mockResolvedValue(credRow({ id: "cred-2", publicKey: "pk_new" }));
    // $transaction runs the callback with a tx client exposing the same models.
    const txClient = { tenantApiCredential: { update, create } };
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformCredentialRotate]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue(TENANT_ROW) },
        tenantApiCredential: {
          findUnique: vi.fn().mockResolvedValue(credRow({ status: "ACTIVE" })),
        },
        $transaction: vi.fn().mockImplementation((cb) => cb(txClient)),
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/tenants/${TENANT}/credentials/cred-1/rotate`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.secretKey.startsWith("sk_")).toBe(true);
    // Old credential was revoked in the transaction.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REVOKED" }),
      }),
    );
    await app.close();
  });

  it("refuses to rotate an already-revoked credential (409)", async () => {
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformCredentialRotate]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue(TENANT_ROW) },
        tenantApiCredential: {
          findUnique: vi.fn().mockResolvedValue(credRow({ status: "REVOKED" })),
        },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/tenants/${TENANT}/credentials/cred-1/rotate`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("revokes an active credential (200) and refuses double-revoke (409)", async () => {
    const update = vi
      .fn()
      .mockResolvedValue(credRow({ status: "REVOKED", revokedAt: new Date() }));
    const app = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformCredentialRevoke]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue(TENANT_ROW) },
        tenantApiCredential: {
          findUnique: vi.fn().mockResolvedValue(credRow({ status: "ACTIVE" })),
          update,
        },
      },
    });
    const ok = await app.inject({
      method: "POST",
      url: `${BASE}/tenants/${TENANT}/credentials/cred-1/revoke`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.status).toBe("REVOKED");
    // The revoke response carries no secret.
    expect(ok.json().data).not.toHaveProperty("secretKey");
    await app.close();

    const app2 = await buildTestApp({
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformCredentialRevoke]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue(TENANT_ROW) },
        tenantApiCredential: {
          findUnique: vi.fn().mockResolvedValue(credRow({ status: "REVOKED" })),
        },
      },
    });
    const dup = await app2.inject({
      method: "POST",
      url: `${BASE}/tenants/${TENANT}/credentials/cred-1/revoke`,
      headers: { authorization: `Bearer ${token(app2)}` },
    });
    expect(dup.statusCode).toBe(409);
    await app2.close();
  });
});
