import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Gates the platform app behind authentication. Unauthenticated users are sent
 * to /login (remembering where they were headed). The BACKEND is authoritative
 * for platform access: even an authenticated non-platform user is rejected by
 * the API (403 PLATFORM_ACCESS_DENIED) on every /platform/* call.
 */
export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const location = useLocation();

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
