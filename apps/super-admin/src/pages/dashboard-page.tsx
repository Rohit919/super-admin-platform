import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Users,
  CheckCircle,
  Clock,
  PauseCircle,
  Archive,
} from "lucide-react";
import { platformApi } from "@/modules/platform/platform.api";
import { ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui";

/**
 * Platform Dashboard — tenant + user stats.
 *
 * When the backend returns 403 PLATFORM_ACCESS_DENIED it means the logged-in
 * user is not a platform member. We show a clear message rather than a blank
 * or broken screen.
 */
export function DashboardPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ["platform", "dashboard"],
    queryFn: platformApi.dashboard,
    retry: false,
  });

  if (isPending) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (error) {
    const isPlatformDenied =
      error instanceof ApiError && error.code === "PLATFORM_ACCESS_DENIED";
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="font-medium text-amber-800">
          {isPlatformDenied
            ? "Not a platform account"
            : "Failed to load dashboard"}
        </p>
        <p className="mt-1 text-sm text-amber-700">
          {isPlatformDenied
            ? "This account does not have Super Admin access. Please sign in with a platform administrator account."
            : error instanceof Error
              ? error.message
              : "An unexpected error occurred."}
        </p>
      </div>
    );
  }

  const stats = [
    {
      label: "Total Tenants",
      value: data.totalTenants,
      icon: Building2,
      color: "text-slate-700",
    },
    {
      label: "Active",
      value: data.activeTenants,
      icon: CheckCircle,
      color: "text-green-600",
    },
    {
      label: "Trial",
      value: data.trialTenants,
      icon: Clock,
      color: "text-blue-600",
    },
    {
      label: "Suspended",
      value: data.suspendedTenants,
      icon: PauseCircle,
      color: "text-amber-600",
    },
    {
      label: "Archived",
      value: data.archivedTenants,
      icon: Archive,
      color: "text-slate-400",
    },
    {
      label: "Total Users",
      value: data.totalUsers,
      icon: Users,
      color: "text-slate-700",
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">
        Platform Dashboard
      </h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="flex flex-col gap-2">
            <div
              className={`flex items-center gap-1.5 text-sm font-medium ${color}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {value.toLocaleString()}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
