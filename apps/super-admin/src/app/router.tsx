import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/app/protected-route";
import { PlatformLayout } from "@/layouts/platform-layout";
import { LoginPage } from "@/pages/login-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { TenantsPage } from "@/pages/tenants-page";
import { TenantDetailPage } from "@/pages/tenant-detail-page";
import { PlatformUsersPage } from "@/pages/platform-users-page";
import { AuditPage } from "@/pages/audit-page";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <PlatformLayout />,
        children: [
          { path: "/", element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/tenants", element: <TenantsPage /> },
          { path: "/tenants/:id", element: <TenantDetailPage /> },
          { path: "/users", element: <PlatformUsersPage /> },
          { path: "/audit", element: <AuditPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
