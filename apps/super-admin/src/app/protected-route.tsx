import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import { useSessionBootstrap } from "@/modules/auth/use-session-bootstrap";

/**
 * Gates the platform app behind authentication. Unauthenticated users are sent
 * to /login (remembering where they were headed). The BACKEND is authoritative
 * for platform access: even an authenticated non-platform user is rejected by
 * the API (403 PLATFORM_ACCESS_DENIED) on every /platform/* call.
 *
 * The access token is memory-only (Phase 19.2), so on a hard reload we first
 * run a silent /auth/refresh via the HTTP-only cookie. Until that bootstrap
 * settles we render nothing rather than bouncing a still-valid session to
 * /login.
 */
export function ProtectedRoute() {
  const { bootstrapped } = useSessionBootstrap();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const location = useLocation();

  if (!bootstrapped) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  }
  return <Outlet />;
}
