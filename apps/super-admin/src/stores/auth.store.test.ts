import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./auth.store";

/**
 * Auth store is UX state only (the API is the security boundary). These tests
 * pin the behaviors the UI relies on: authentication flag, permission checks,
 * and full session clearing.
 */
const reset = () => useAuthStore.getState().clearSession();

describe("auth.store", () => {
  beforeEach(reset);

  it("starts unauthenticated with no permissions", () => {
    const s = useAuthStore.getState();
    expect(s.isAuthenticated()).toBe(false);
    expect(s.can("platform.tenant.view")).toBe(false);
  });

  it("isAuthenticated reflects the access token", () => {
    useAuthStore.getState().setSession({
      accessToken: "tok",
      user: { id: "u1", email: "a@b.io", name: "A", role: "user" },
    });
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
  });

  it("can() reflects the effective permissions from bootstrap", () => {
    useAuthStore.getState().setAuthorization({
      roles: ["SUPER_ADMIN"],
      permissions: ["platform.audit.view"],
    });
    const s = useAuthStore.getState();
    expect(s.can("platform.audit.view")).toBe(true);
    expect(s.can("platform.tenant.archive")).toBe(false);
  });

  it("never persists the access token, roles, or permissions to localStorage (Phase 19.2)", () => {
    const s = useAuthStore.getState();
    s.setSession({
      accessToken: "super-secret-jwt",
      user: { id: "u1", email: "a@b.io", name: "A", role: "user" },
    });
    s.setAuthorization({
      roles: ["SUPER_ADMIN"],
      permissions: ["platform.audit.view"],
    });

    const raw = window.localStorage.getItem("super-admin-auth") ?? "";
    // The bearer JWT and authorization data must not touch disk...
    expect(raw).not.toContain("super-secret-jwt");
    expect(raw).not.toContain("SUPER_ADMIN");
    expect(raw).not.toContain("platform.audit.view");

    // ...but the non-sensitive identity may be persisted for a flash-free shell.
    const persisted = raw ? JSON.parse(raw) : { state: {} };
    expect(persisted.state.user?.email).toBe("a@b.io");
    expect(persisted.state.accessToken).toBeUndefined();
    expect(persisted.state.permissions).toBeUndefined();
  });

  it("clearSession wipes token, user, roles, and permissions", () => {
    const s = useAuthStore.getState();
    s.setSession({
      accessToken: "tok",
      user: { id: "u1", email: "a@b.io", name: "A", role: "user" },
    });
    s.setAuthorization({ roles: ["R"], permissions: ["platform.tenant.view"] });

    s.clearSession();

    const after = useAuthStore.getState();
    expect(after.isAuthenticated()).toBe(false);
    expect(after.user).toBeNull();
    expect(after.roles).toEqual([]);
    expect(after.permissions).toEqual([]);
    expect(after.can("platform.tenant.view")).toBe(false);
  });
});
