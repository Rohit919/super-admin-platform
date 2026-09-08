import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@app/api-contracts";

/**
 * Super Admin auth state — access token + platform user + effective platform
 * roles/permissions. Deliberately SEPARATE from the tenant Admin's store
 * (different persist key) so the two apps never share a session in the same
 * browser. Platform permissions here are UX-only; the API enforces the
 * PlatformMembership gate + platform.* permission on every request.
 *
 * SECURITY (Phase 19.2): the access token is a bearer JWT and is held IN MEMORY
 * ONLY — it is never written to localStorage/sessionStorage, so an XSS payload
 * cannot exfiltrate a long-lived credential from disk. Session continuity
 * across reloads comes from the HTTP-only, JS-inaccessible refresh cookie: on
 * load the app silently calls /auth/refresh to mint a fresh in-memory access
 * token (see use-session-bootstrap.ts). Only the non-sensitive `user` identity
 * is persisted, purely so the shell can render without a flash before refresh
 * completes; roles/permissions are re-fetched from the API each load.
 */
interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  roles: string[];
  permissions: string[];
  /**
   * True once the initial silent-refresh attempt has completed (success OR
   * failure). Route guards wait for this before deciding a user is
   * unauthenticated, so a valid refresh cookie is not mistaken for "logged out"
   * on a hard reload.
   */
  bootstrapped: boolean;

  setSession: (session: { accessToken: string; user: AuthUser }) => void;
  setAccessToken: (accessToken: string) => void;
  setAuthorization: (authz: { roles: string[]; permissions: string[] }) => void;
  setBootstrapped: (value: boolean) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
  can: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      roles: [],
      permissions: [],
      bootstrapped: false,
      setSession: ({ accessToken, user }) => set({ accessToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setAuthorization: ({ roles, permissions }) => set({ roles, permissions }),
      setBootstrapped: (value) => set({ bootstrapped: value }),
      clearSession: () =>
        set({ accessToken: null, user: null, roles: [], permissions: [] }),
      isAuthenticated: () => Boolean(get().accessToken),
      can: (permission) => get().permissions.includes(permission),
    }),
    {
      name: "super-admin-auth",
      // Persist ONLY the non-sensitive identity. The access token, roles, and
      // permissions are intentionally excluded so no bearer credential or
      // authorization data is written to localStorage.
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
