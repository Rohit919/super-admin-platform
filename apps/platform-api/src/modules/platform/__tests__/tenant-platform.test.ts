import { describe, it, expect, vi, afterEach } from "vitest";
import { buildTestApp } from "@core/testing/test-app.js";
import { PermissionKeys } from "@app/api-contracts";

/**
 * Tenant platform connection route tests (Phase 21).
 *
 * Covers the Platform side of the Super Admin → Tenant API control plane:
 *   - authorization (platform.tenant.view / platform.tenant.update)
 *   - branding read/update proxied to the Tenant API (fetch mocked)
 *   - request-id + tenant-id + bearer headers sent to the Tenant API
 *   - connection status reports reachable/unreachable truthfully
 *   - integration disabled (no TENANT_API_* config) → 503
 *   - audit on branding update (changed field names only, no secret)
 */
const BASE = "/api/v1/platform";
const TENANT = "t1";
// A literal PUBLIC IP so the SSRF guard takes the no-DNS path and tests never
// perform a real DNS lookup. fetch is mocked, so nothing is actually dialed.
const TENANT_API = "http://93.184.216.34";
const S2S_SECRET = "tenant-s2s-secret-that-is-long-enough-xxxxx";

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

const CONNECTED_ENV = {
  TENANT_API_BASE_URL: TENANT_API,
  TENANT_API_S2S_SECRET: S2S_SECRET,
  TENANT_API_ALLOW_HTTP: true,
};

/** Build a platform app authorized for the given permissions + tenant present. */
async function appWith(keys: string[], env: Record<string, unknown> = {}) {
  return buildTestApp({
    env: { ...CONNECTED_ENV, ...env },
    prisma: {
      platformMembership: {
        findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
      },
      userRole: { findMany: vi.fn().mockResolvedValue(rolesWithPerms(keys)) },
      tenant: { findUnique: vi.fn().mockResolvedValue(TENANT_ROW) },
      auditLog: { create: vi.fn().mockResolvedValue(null) },
    },
  });
}

function mockFetch(
  impl: (url: string, init: RequestInit) => { status: number; body: unknown },
) {
  const spy = vi.fn(async (url: unknown, init: unknown) => {
    const { status, body } = impl(String(url), init as RequestInit);
    return {
      status,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Tenant platform branding — authorization", () => {
  it("denies a user without platform membership (403)", async () => {
    const app = await buildTestApp({ env: CONNECTED_ENV });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/${TENANT}/branding`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("denies a platform member lacking platform.tenant.view (403)", async () => {
    const app = await appWith([]);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/${TENANT}/branding`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("denies branding UPDATE with only view permission (403)", async () => {
    const app = await appWith([PermissionKeys.PlatformTenantView]);
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/${TENANT}/branding`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { appName: "Acme" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("Tenant platform branding — proxying to the Tenant API", () => {
  it("reads branding from the Tenant API and unwraps the envelope (200)", async () => {
    const fetchSpy = mockFetch(() => ({
      status: 200,
      body: {
        data: {
          appName: "Acme Logistics",
          shortName: "Acme",
          colors: { primary: "#2563EB" },
        },
      },
    }));
    const app = await appWith([PermissionKeys.PlatformTenantView]);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/${TENANT}/branding`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.appName).toBe("Acme Logistics");

    // The Tenant API was called with the S2S bearer + tenant id + correlation.
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${S2S_SECRET}`);
    expect(headers["x-platform-tenant-id"]).toBe(TENANT);
    expect(headers["x-request-id"]).toBeDefined();
    await app.close();
  });

  it("updates branding via PATCH → Tenant API PUT and audits (200)", async () => {
    const fetchSpy = mockFetch(() => ({
      status: 200,
      body: {
        data: {
          appName: "Renamed Co",
          shortName: "RC",
          colors: { primary: "#111827" },
        },
      },
    }));
    const auditCreate = vi.fn().mockResolvedValue(null);
    const app = await buildTestApp({
      env: CONNECTED_ENV,
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformTenantUpdate]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue(TENANT_ROW) },
        auditLog: { create: auditCreate },
      },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `${BASE}/tenants/${TENANT}/branding`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { appName: "Renamed Co", shortName: "RC" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.appName).toBe("Renamed Co");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(url).toContain("/api/v1/internal/platform/branding");

    // Audit records changed field names only — no secret, no values.
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const arg = auditCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data.action).toBe("TENANT_BRANDING_UPDATED");
    expect(arg.data.tenantId).toBe(TENANT);
    const meta = arg.data.metadata as { changedFields: string[] };
    expect(meta.changedFields).toEqual(["appName", "shortName"]);
    expect(JSON.stringify(arg.data)).not.toContain(S2S_SECRET);
    await app.close();
  });
});

describe("Tenant platform connection — status truthfulness", () => {
  it("reports reachable:true with runtime status when the Tenant API answers", async () => {
    mockFetch(() => ({
      status: 200,
      body: {
        data: {
          tenantId: TENANT,
          status: "ready",
          environment: "production",
          version: "1.2.3",
        },
      },
    }));
    const app = await appWith([PermissionKeys.PlatformTenantView]);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/${TENANT}/connection`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.reachable).toBe(true);
    expect(data.status).toBe("ready");
    expect(data.version).toBe("1.2.3");
    await app.close();
  });

  it("reports reachable:false when the Tenant API cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const app = await appWith([PermissionKeys.PlatformTenantView]);
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/${TENANT}/connection`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.reachable).toBe(false);
    expect(data.detail).toBeDefined();
    await app.close();
  });
});

describe("Tenant platform — integration disabled", () => {
  it("returns 503 when TENANT_API_* is not configured", async () => {
    const app = await buildTestApp({
      // No TENANT_API_BASE_URL / secret → disabled.
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformTenantView]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue(TENANT_ROW) },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/${TENANT}/branding`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe("Tenant platform — unknown tenant", () => {
  it("returns 404 for a tenant that does not exist", async () => {
    const app = await buildTestApp({
      env: CONNECTED_ENV,
      prisma: {
        platformMembership: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_PLATFORM),
        },
        userRole: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              rolesWithPerms([PermissionKeys.PlatformTenantView]),
            ),
        },
        tenant: { findUnique: vi.fn().mockResolvedValue(null) },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/tenants/${TENANT}/branding`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
