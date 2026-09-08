import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Users,
  ScrollText,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";
import { usePlatformBootstrap } from "@/modules/auth/use-platform-bootstrap";
import { PermissionKeys } from "@app/api-contracts";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
}

const NAV: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    permission: PermissionKeys.PlatformDashboardView,
  },
  {
    to: "/tenants",
    label: "Tenants",
    icon: Building2,
    permission: PermissionKeys.PlatformTenantView,
  },
  {
    to: "/users",
    label: "Platform Users",
    icon: Users,
    permission: PermissionKeys.PlatformUserView,
  },
  {
    to: "/audit",
    label: "Audit Logs",
    icon: ScrollText,
    permission: PermissionKeys.PlatformAuditView,
  },
];

/**
 * Authenticated Super Admin shell — sidebar + routed content. Bootstraps the
 * platform user (identity + platform permissions) once for the shell. Nav is
 * permission-gated (UX only; the API enforces every platform.* permission).
 */
export function PlatformLayout() {
  const navigate = useNavigate();
  const clearSession = useAuthStore((s) => s.clearSession);
  const can = useAuthStore((s) => s.can);
  usePlatformBootstrap();

  const visible = NAV.filter((n) => !n.permission || can(n.permission));

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-60 flex-col border-r bg-white">
        <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-xs text-white">
            SA
          </span>
          Super Admin
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visible.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => {
            clearSession();
            navigate("/login", { replace: true });
          }}
          className="m-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
