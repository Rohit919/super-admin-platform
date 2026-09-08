import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Users,
  UserCog,
  KeyRound,
  CheckCircle,
  Clock,
  PauseCircle,
  Archive,
} from "lucide-react";
import { Link } from "react-router-dom";
import { platformApi } from "@/modules/platform/platform.api";
import { ApiError } from "@/lib/api-client";
import { Card, StatusBadge } from "@/components/ui";

/**
 * Platform Dashboard — a SaaS control-center overview.
 *
 * Everything here is sourced from existing platform APIs: the dashboard stats
 * contract (tenants/users/platform users/active API credentials/recent tenants)
 * and the platform audit endpoint (recent control-plane activity). No tenant
 * operational (logistics) data appears here.
 *
 * When the backend returns 403 PLATFORM_ACCESS_DENIED the logged-in user is not
 * a platform member — we show a clear message rather than a broken screen.
 */
export function DashboardPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ["platform", "dashboard"],
    queryFn: platformApi.dashboard,
    retry: false,
  });

  // Recent activity comes from the existing audit endpoint. It is secondary, so
  // a failure here must not break the dashboard — we just omit the panel.
  const activity = useQuery({
    queryKey: ["platform", "dashboard", "activity"],
    queryFn: () => platformApi.auditLogs({ limit: 5 }),
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
    {
      label: "Platform Users",
      value: data.platformUsers,
      icon: UserCog,
      color: "text-indigo-600",
    },
    {
      label: "Active API Keys",
      value: data.activeApiCredentials,
      icon: KeyRound,
      color: "text-slate-700",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">
        Platform Dashboard
      </h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent tenants — from the dashboard stats contract. */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Tenants
            </h2>
            <Link
              to="/tenants"
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {data.recentTenants.length === 0 ? (
            <p className="text-sm text-slate-500">No tenants yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentTenants.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between py-2"
                >
                  <Link
                    to={`/tenants/${t.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 hover:underline"
                  >
                    {t.name}
                    <span className="ml-2 font-mono text-xs text-slate-400">
                      {t.slug}
                    </span>
                  </Link>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent activity — from the existing platform audit endpoint. */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Activity
            </h2>
            <Link
              to="/audit"
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {activity.isPending ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : activity.error || !activity.data ? (
            <p className="text-sm text-slate-500">
              Activity is unavailable right now.
            </p>
          ) : activity.data.length === 0 ? (
            <p className="text-sm text-slate-500">No recent activity.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.data.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                    {log.action}
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
