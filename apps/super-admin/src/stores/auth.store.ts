import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@app/api-contracts";

/**
 * Super Admin auth state — access token + platform user + effective platform
 * roles/permissions. Deliberately SEPARATE from the tenant Admin's store
 * (different persist key) so the two apps never share a session in the same
 * browser. Platform permissions here are UX-only; the API enforces the
 * PlatformMembership gate + platform.* permission on every request.
 */
interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  roles: string[];
  permissions: string[];

  setSession: (session: { accessToken: string; user: AuthUser }) => void;
  setAccessToken: (accessToken: string) => void;
  setAuthorization: (authz: { roles: string[]; permissions: string[] }) => void;
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
      setSession: ({ accessToken, user }) => set({ accessToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setAuthorization: ({ roles, permissions }) => set({ roles, permissions }),
      clearSession: () =>
        set({ accessToken: null, user: null, roles: [], permissions: [] }),
      isAuthenticated: () => Boolean(get().accessToken),
      can: (permission) => get().permissions.includes(permission),
    }),
    { name: "super-admin-auth" },
  ),
);
