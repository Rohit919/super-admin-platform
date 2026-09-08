import { describe, it, expect } from "vitest";
import {
  assertTenantScoped,
  assertTenantScopedFor,
} from "../tenant-scope-assertion.js";

/**
 * The dev-mode guard must DETECT missing tenant scope on tenant-owned models
 * and NEVER modify queries. `assertTenantScopedFor` assumes the model is
 * tenant-owned; `assertTenantScoped` also gates on the live allow-list.
 */

describe("assertTenantScoped (allow-list gating)", () => {
  it("ignores models not in the allow-list (platform models)", () => {
    // User is never tenant-owned; must be a silent no-op regardless of args.
    expect(() => assertTenantScoped("User", "findMany", {})).not.toThrow();
    expect(() =>
      assertTenantScoped("Permission", "findUnique", { where: { id: "p" } }),
    ).not.toThrow();
  });

  it("ignores undefined model (raw queries)", () => {
    expect(() => assertTenantScoped(undefined, "queryRaw", {})).not.toThrow();
  });
});

describe("assertTenantScopedFor (operation-shape logic)", () => {
  const M = "Shipment"; // representative tenant-owned model

  it("allows where-scoped reads that include tenantId", () => {
    expect(() =>
      assertTenantScopedFor(M, "findMany", { where: { tenantId: "t1" } }),
    ).not.toThrow();
    expect(() =>
      assertTenantScopedFor(M, "findFirst", {
        where: { tenantId: "t1", status: "X" },
      }),
    ).not.toThrow();
    expect(() =>
      assertTenantScopedFor(M, "count", { where: { tenantId: "t1" } }),
    ).not.toThrow();
  });

  it("throws on where-scoped reads missing tenantId", () => {
    expect(() =>
      assertTenantScopedFor(M, "findMany", { where: { status: "X" } }),
    ).toThrow(/tenant-scope/i);
    expect(() => assertTenantScopedFor(M, "findMany", {})).toThrow(
      /tenant-scope/i,
    );
    expect(() =>
      assertTenantScopedFor(M, "updateMany", { where: {}, data: {} }),
    ).toThrow(/tenant-scope/i);
  });

  it("treats a null tenantId as missing", () => {
    expect(() =>
      assertTenantScopedFor(M, "findMany", { where: { tenantId: null } }),
    ).toThrow(/tenant-scope/i);
  });

  it("requires data.tenantId on create", () => {
    expect(() =>
      assertTenantScopedFor(M, "create", {
        data: { tenantId: "t1", name: "x" },
      }),
    ).not.toThrow();
    expect(() =>
      assertTenantScopedFor(M, "create", { data: { name: "x" } }),
    ).toThrow(/tenant-scope/i);
  });

  it("requires tenantId on every createMany row", () => {
    expect(() =>
      assertTenantScopedFor(M, "createMany", {
        data: [{ tenantId: "t1" }, { tenantId: "t1" }],
      }),
    ).not.toThrow();
    expect(() =>
      assertTenantScopedFor(M, "createMany", {
        data: [{ tenantId: "t1" }, { name: "x" }],
      }),
    ).toThrow(/tenant-scope/i);
  });

  it("requires both where.tenantId and create.tenantId on upsert", () => {
    expect(() =>
      assertTenantScopedFor(M, "upsert", {
        where: { tenantId: "t1", id: "x" },
        create: { tenantId: "t1" },
        update: {},
      }),
    ).not.toThrow();
    expect(() =>
      assertTenantScopedFor(M, "upsert", {
        where: { id: "x" },
        create: { tenantId: "t1" },
        update: {},
      }),
    ).toThrow(/tenant-scope/i);
  });

  it("rejects unique-selector ops that cannot be tenant-scoped safely", () => {
    expect(() =>
      assertTenantScopedFor(M, "findUnique", { where: { id: "x" } }),
    ).toThrow(/findFirst/i);
    expect(() =>
      assertTenantScopedFor(M, "update", { where: { id: "x" }, data: {} }),
    ).toThrow(/findFirst/i);
    expect(() =>
      assertTenantScopedFor(M, "delete", { where: { id: "x" } }),
    ).toThrow(/findFirst/i);
  });
});
