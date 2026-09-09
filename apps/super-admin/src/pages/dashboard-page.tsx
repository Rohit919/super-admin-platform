import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  Building2,
  CheckCircle,
  Clock,
  KeyRound,
  PauseCircle,
  RefreshCw,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { platformApi } from "@/modules/platform/platform.api";
import { ApiError } from "@/lib/api-client";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Platform Dashboard — a SaaS control-center overview.
 *
 * Everything here is sourced from existing platform APIs: the dashboard stats
 * contract (tenants/users/platform users/active API credentials/recent tenants)
 * and the platform audit endpoint (recent control-plane activity). No tenant
 * operational (logistics) data appears here, and no metrics are fabricated.
 */

/** Humanize an audit action key like "tenant.provisioned" → "Tenant provisioned". */
function humanizeAction(action: string): string {
  const words = action.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function DashboardPage() {
  const { data, isPending, error, isFetching, refetch } = useQuery({
    queryKey: ["platform", "dashboard"],
    queryFn: platformApi.dashboard,
    retry: false,
  });

  // Recent activity comes from the existing audit endpoint. It is secondary, so
  // a failure here must not break the dashboard — we just omit the panel.
  const activity = useQuery({
    queryKey: ["platform", "dashboard", "activity"],
    queryFn: () => platformApi.auditLogs({ limit: 6 }),
    retry: false,
  });

  if (isPending) return <DashboardSkeleton />;

  if (error) {
    const isPlatformDenied =
      error instanceof ApiError && error.code === "PLATFORM_ACCESS_DENIED";
    return (
      <ErrorState
        icon={AlertTriangle}
        title={
          isPlatformDenied
            ? "Not a platform account"
            : "Failed to load dashboard"
        }
        description={
          isPlatformDenied
            ? "This account does not have Super Admin access. Please sign in with a platform administrator account."
            : error instanceof Error
              ? error.message
              : "An unexpected error occurred."
        }
        requestId={error instanceof ApiError ? error.requestId : undefined}
        onRetry={isPlatformDenied ? undefined : () => void refetch()}
      />
    );
  }

  const primary: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
    tint: string;
  }> = [
    {
      label: "Total Tenants",
      value: data.totalTenants,
      icon: Building2,
      tint: "bg-slate-100 text-slate-700",
    },
    {
      label: "Active",
      value: data.activeTenants,
      icon: CheckCircle,
      tint: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "Total Users",
      value: data.totalUsers,
      icon: Users,
      tint: "bg-sky-100 text-sky-700",
    },
    {
      label: "Active API Keys",
      value: data.activeApiCredentials,
      icon: KeyRound,
      tint: "bg-indigo-100 text-indigo-700",
    },
  ];

  const statusBreakdown: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
    bar: string;
    text: string;
  }> = [
    {
      label: "Active",
      value: data.activeTenants,
      icon: CheckCircle,
      bar: "bg-emerald-500",
      text: "text-emerald-600",
    },
    {
      label: "Trial",
      value: data.trialTenants,
      icon: Clock,
      bar: "bg-sky-500",
      text: "text-sky-600",
    },
    {
      label: "Suspended",
      value: data.suspendedTenants,
      icon: PauseCircle,
      bar: "bg-amber-500",
      text: "text-amber-600",
    },
    {
      label: "Archived",
      value: data.archivedTenants,
      icon: Archive,
      bar: "bg-slate-400",
      text: "text-slate-500",
    },
  ];

  const breakdownTotal = statusBreakdown.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Dashboard"
        description="An at-a-glance view of tenants, users and platform activity."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            loading={isFetching}
            aria-label="Refresh dashboard"
          >
            <RefreshCw
              className={cn("h-4 w-4", isFetching && "animate-spin")}
              aria-hidden
            />
            Refresh
          </Button>
        }
      />

      {/* Primary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {primary.map(({ label, value, icon: Icon, tint }) => (
          <Card key={label} className="flex items-center gap-4">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                tint,
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-500">
                {label}
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {value.toLocaleString()}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Secondary metrics + status breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tenant status breakdown */}
        <Card padded={false} className="lg:col-span-2">
          <CardHeader
            title="Tenant status"
            description="Distribution across lifecycle states."
          />
          <CardBody className="space-y-4">
            {/* Segmented bar (derived from real counts only). */}
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {breakdownTotal === 0 ? (
                <div className="w-full bg-slate-100" />
              ) : (
                statusBreakdown
                  .filter((s) => s.value > 0)
                  .map((s) => (
                    <div
                      key={s.label}
                      className={s.bar}
                      style={{ width: `${(s.value / breakdownTotal) * 100}%` }}
                      title={`${s.label}: ${s.value}`}
                    />
                  ))
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {statusBreakdown.map(({ label, value, icon: Icon, text }) => (
                <div key={label}>
                  <p
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium",
                      text,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                    {value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Platform operators */}
        <Card padded={false}>
          <CardHeader title="Platform" description="Operator access." />
          <CardBody className="flex h-full flex-col justify-center">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <UserCog className="h-6 w-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-500">
                  Platform Users
                </p>
                <p className="text-3xl font-semibold tabular-nums text-slate-900">
                  {data.platformUsers.toLocaleString()}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Operators with a platform membership, distinct from the{" "}
              {data.totalUsers.toLocaleString()} total user identities.
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Recent tenants + activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader
            title="Recent Tenants"
            action={
              <Link
                to="/tenants"
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
              >
                View all
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            }
          />
          <CardBody>
            {data.recentTenants.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No tenants yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recentTenants.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/tenants/${t.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-slate-50"
                    >
                      <Avatar name={t.name} seed={t.slug} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {t.name}
                        </p>
                        <p className="truncate font-mono text-xs text-slate-400">
                          {t.slug}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card padded={false}>
          <CardHeader
            title="Recent Activity"
            action={
              <Link
                to="/audit"
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
              >
                View all
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            }
          />
          <CardBody>
            {activity.isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-2.5 w-2.5 rounded-full" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ))}
              </div>
            ) : activity.error || !activity.data ? (
              <p className="py-6 text-center text-sm text-slate-500">
                Activity is unavailable right now.
              </p>
            ) : activity.data.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No recent activity.
              </p>
            ) : (
              <ol className="relative space-y-4 pl-5 before:absolute before:left-[3px] before:top-1 before:h-[calc(100%-0.5rem)] before:w-px before:bg-slate-200">
                {activity.data.map((log) => (
                  <li key={log.id} className="relative">
                    <span
                      className="absolute -left-[calc(1.25rem-1px)] top-1 h-2 w-2 -translate-x-1/2 rounded-full bg-indigo-500 ring-2 ring-white"
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-slate-900">
                      {humanizeAction(log.action)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span className="font-mono">{log.action}</span>
                      <span aria-hidden>·</span>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-44 w-full rounded-xl lg:col-span-2" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}
