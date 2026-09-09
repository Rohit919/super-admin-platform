import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Building2,
  CalendarDays,
  Check,
  CircleUser,
  Gauge,
  History,
  KeyRound,
  LayoutGrid,
  MapPin,
  Package,
  Palette,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  ShieldCheck,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  platformApi,
  type CreatedCredential,
} from "@/modules/platform/platform.api";
import { useAuthStore } from "@/stores/auth.store";
import {
  PermissionKeys,
  type PlatformAuditLogDto,
  type PlatformTenantDto,
  type PlatformTenantOverviewDto,
  type TenantOrganizationDto,
  type UpdateTenantOrganizationBody,
  type TenantStatus,
  type AppBranding,
  type UpdateTenantBrandingBody,
} from "@app/api-contracts";
import { ApiError } from "@/lib/api-client";
import {
  Avatar,
  Badge,
  Button,
  CapabilityGapNote,
  Card,
  CardBody,
  CardHeader,
  CopyButton,
  DataTable,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  EmptyState,
  ErrorState,
  Field,
  InfoList,
  InfoRow,
  Input,
  MenuItem,
  MetadataGrid,
  MetadataItem,
  Skeleton,
  StatusBadge,
  SummaryStat,
  Tabs,
  Td,
  Textarea,
  Th,
  Timeline,
  TimelineItem,
  type TabItem,
} from "@/components/ui";
import { cn } from "@/lib/utils";

// ── Shared date formatting ───────────────────────────────────────────────────

const DATE_TIME_FMT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/** Humanize an audit action key like "TENANT_SUSPENDED" → "Tenant suspended". */
function humanizeAction(action: string): string {
  const words = action.replace(/[._]/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Tone for a lifecycle/audit action, for the timeline dot. */
function actionTone(
  action: string,
): "neutral" | "accent" | "success" | "warning" | "danger" {
  const a = action.toUpperCase();
  if (a.includes("ARCHIV") || a.includes("REVOK") || a.includes("DELET"))
    return "danger";
  if (a.includes("SUSPEND")) return "warning";
  if (a.includes("ACTIVAT") || a.includes("PROVISION") || a.includes("CREATED"))
    return "success";
  return "accent";
}

// ── Lifecycle model ──────────────────────────────────────────────────────────

interface Transition {
  label: string;
  value: TenantStatus;
  perm: string;
  tone: "primary" | "warning" | "danger";
  /** High-impact transitions require typing the tenant name to confirm. */
  requireTypeToConfirm?: boolean;
  description: string;
}

const STATUS_TRANSITIONS: Record<TenantStatus, Transition[]> = {
  TRIAL: [
    {
      label: "Activate",
      value: "ACTIVE",
      perm: PermissionKeys.PlatformTenantSuspend,
      tone: "primary",
      description: "Move this trial tenant to an active state.",
    },
    {
      label: "Suspend",
      value: "SUSPENDED",
      perm: PermissionKeys.PlatformTenantSuspend,
      tone: "warning",
      description:
        "Suspending this tenant will prevent tenant access to the platform.",
    },
  ],
  ACTIVE: [
    {
      label: "Suspend",
      value: "SUSPENDED",
      perm: PermissionKeys.PlatformTenantSuspend,
      tone: "warning",
      description:
        "Suspending this tenant will prevent tenant access to the platform.",
    },
    {
      label: "Archive",
      value: "ARCHIVED",
      perm: PermissionKeys.PlatformTenantArchive,
      tone: "danger",
      requireTypeToConfirm: true,
      description:
        "This is a high-impact action. The tenant will no longer be active.",
    },
  ],
  SUSPENDED: [
    {
      label: "Reactivate",
      value: "ACTIVE",
      perm: PermissionKeys.PlatformTenantSuspend,
      tone: "primary",
      description: "Restore this tenant's access to the platform.",
    },
    {
      label: "Archive",
      value: "ARCHIVED",
      perm: PermissionKeys.PlatformTenantArchive,
      tone: "danger",
      requireTypeToConfirm: true,
      description:
        "This is a high-impact action. The tenant will no longer be active.",
    },
  ],
  ARCHIVED: [],
};

const DATE_FMT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export function TenantDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const can = useAuthStore((s) => s.can);

  const canUpdate = can(PermissionKeys.PlatformTenantUpdate);
  const canViewEntitlements = can(PermissionKeys.PlatformEntitlementView);
  const canViewAudit = can(PermissionKeys.PlatformAuditView);
  const canReadCreds = can(PermissionKeys.PlatformCredentialRead);

  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Transition | null>(null);

  const {
    data: tenant,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["platform", "tenant", id],
    queryFn: () => platformApi.tenant(id),
    retry: false,
  });

  // Deep, real aggregate for the Control Center (identity, admin, breakdowns,
  // plan). Loaded alongside the lean tenant; failures degrade gracefully.
  const { data: overview } = useQuery({
    queryKey: ["platform", "tenant", id, "overview"],
    queryFn: () => platformApi.tenantOverview(id),
    retry: false,
    enabled: Boolean(id),
  });

  const invalidateTenant = () => {
    void qc.invalidateQueries({ queryKey: ["platform", "tenant", id] });
    void qc.invalidateQueries({ queryKey: ["platform", "tenants"] });
    void qc.invalidateQueries({
      queryKey: ["platform", "tenant", id, "audit"],
    });
    void qc.invalidateQueries({
      queryKey: ["platform", "tenant", id, "overview"],
    });
  };

  const setStatus = useMutation({
    mutationFn: (status: TenantStatus) =>
      platformApi.setTenantStatus(id, status),
    onSuccess: () => {
      setPending(null);
      invalidateTenant();
    },
  });

  const tabs = useMemo<TabItem[]>(() => {
    const t: TabItem[] = [
      { value: "overview", label: "Overview", icon: LayoutGrid },
      // Organization profile is readable with platform.tenant.view (already
      // required to load this page). Editing is gated separately on
      // platform.tenant.update inside the panel.
      { value: "organization", label: "Organization", icon: Building2 },
      // Branding is readable with platform.tenant.view (already required to
      // load this page). Editing is gated separately on platform.tenant.update
      // inside the panel. Managed through the Platform → Tenant API boundary.
      { value: "branding", label: "Branding", icon: Palette },
    ];
    // Lifecycle history is reconstructed from audit, so it is gated on audit view.
    if (canViewAudit)
      t.push({ value: "lifecycle", label: "Lifecycle", icon: History });
    if (canViewEntitlements) {
      t.push({ value: "plan", label: "Plan", icon: Package });
      t.push({ value: "entitlements", label: "Entitlements", icon: Gauge });
    }
    if (canReadCreds)
      t.push({ value: "credentials", label: "Credentials", icon: KeyRound });
    // Security is derived from real signals (lifecycle + credential health).
    if (canReadCreds)
      t.push({ value: "security", label: "Security", icon: ShieldCheck });
    if (canViewAudit)
      t.push({ value: "audit", label: "Audit", icon: ScrollText });
    return t;
  }, [canViewEntitlements, canReadCreds, canViewAudit]);

  const [tab, setTab] = useState("overview");

  if (isPending) return <DetailSkeleton />;

  if (error || !tenant) {
    const denied =
      error instanceof ApiError && error.code === "PLATFORM_ACCESS_DENIED";
    return (
      <div className="mx-auto max-w-2xl">
        <Link
          to="/tenants"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Tenants
        </Link>
        <ErrorState
          icon={AlertTriangle}
          title={denied ? "Not a platform account" : "Failed to load tenant"}
          description={
            error instanceof Error ? error.message : "Tenant not found."
          }
          requestId={error instanceof ApiError ? error.requestId : undefined}
          onRetry={denied ? undefined : () => void refetch()}
        />
      </div>
    );
  }

  const transitions = (
    STATUS_TRANSITIONS[tenant.status as TenantStatus] ?? []
  ).filter((t) => can(t.perm));
  const primaryTransition = transitions[0];
  const menuTransitions = transitions.slice(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/tenants"
          className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Tenants
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={tenant.name} seed={tenant.slug} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">
                  {tenant.name}
                </h1>
                <StatusBadge status={tenant.status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="font-mono text-sm text-slate-500">
                  {tenant.slug}
                </p>
                {overview?.plan ? (
                  <Badge tone="accent">{overview.plan.name} plan</Badge>
                ) : overview ? (
                  <Badge tone="neutral">No plan</Badge>
                ) : null}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  Created{" "}
                  {new Date(tenant.createdAt).toLocaleDateString(
                    undefined,
                    DATE_FMT,
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" aria-hidden />
                  Updated{" "}
                  {new Date(tenant.updatedAt).toLocaleDateString(
                    undefined,
                    DATE_FMT,
                  )}
                </span>
              </p>
            </div>
          </div>

          {/* Header actions */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canUpdate && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </Button>
            )}
            {primaryTransition && (
              <Button
                variant={
                  primaryTransition.tone === "danger" ? "danger" : "primary"
                }
                onClick={() => setPending(primaryTransition)}
              >
                {primaryTransition.value === "ACTIVE" && (
                  <PlayCircle className="h-4 w-4" aria-hidden />
                )}
                {primaryTransition.label}
              </Button>
            )}
            {menuTransitions.length > 0 && (
              <DropdownMenu label="More tenant actions">
                {(close) =>
                  menuTransitions.map((t) => (
                    <MenuItem
                      key={t.value}
                      danger={t.tone === "danger"}
                      onClick={() => {
                        close();
                        setPending(t);
                      }}
                    >
                      {t.label}
                    </MenuItem>
                  ))
                }
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Summary metrics — real aggregate data only. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryStat
          label="Members"
          icon={Users}
          value={overview ? overview.members.total : tenant.memberCount}
          sublabel={
            overview
              ? `${overview.members.active} active${
                  overview.members.invited
                    ? ` · ${overview.members.invited} invited`
                    : ""
                }`
              : "\u00a0"
          }
        />
        <SummaryStat
          label="Active credentials"
          icon={KeyRound}
          value={overview ? overview.credentials.active : "—"}
          tone={
            overview && overview.credentials.expired > 0 ? "warning" : "neutral"
          }
          sublabel={
            overview
              ? overview.credentials.expired > 0
                ? `${overview.credentials.expired} expired · ${overview.credentials.total} total`
                : `${overview.credentials.total} total · ${overview.credentials.revoked} revoked`
              : "\u00a0"
          }
        />
        <SummaryStat
          label="Plan"
          icon={Package}
          value={overview?.plan ? overview.plan.name : overview ? "None" : "—"}
          tone={overview?.plan ? "accent" : "neutral"}
          sublabel={
            overview?.plan
              ? `${overview.plan.entitlementCount} entitlements${
                  overview.plan.overrideCount > 0
                    ? ` · ${overview.plan.overrideCount} overridden`
                    : ""
                }`
              : "\u00a0"
          }
          className="[&>div:nth-child(2)]:text-lg [&>div:nth-child(2)]:truncate"
        />
        <SummaryStat
          label="Primary admin"
          icon={CircleUser}
          value={
            overview === undefined ? (
              <Skeleton className="h-6 w-24" />
            ) : overview.primaryAdmin ? (
              <span className="block truncate text-lg">
                {overview.primaryAdmin.name}
              </span>
            ) : (
              <span className="text-lg text-slate-400">—</span>
            )
          }
          sublabel={
            overview?.primaryAdmin ? overview.primaryAdmin.email : "\u00a0"
          }
        />
      </div>

      {/* Tabbed sections */}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "overview" && (
        <OverviewTab
          tenant={tenant}
          overview={overview}
          transitions={transitions}
          onTransition={setPending}
          canViewAudit={canViewAudit}
        />
      )}
      {tab === "organization" && (
        // Keyed by tenant id so switching tenants fully remounts the panel and
        // resets any in-progress edit draft — no cross-tenant state bleed.
        <OrganizationPanel key={id} tenantId={id} canEdit={canUpdate} />
      )}
      {tab === "branding" && (
        <BrandingPanel key={id} tenantId={id} canEdit={canUpdate} />
      )}
      {tab === "lifecycle" && canViewAudit && (
        <LifecycleTab
          tenant={tenant}
          transitions={transitions}
          onTransition={setPending}
        />
      )}
      {tab === "plan" && canViewEntitlements && (
        <PlanPanel tenantId={id} mode="plan" />
      )}
      {tab === "entitlements" && canViewEntitlements && (
        <PlanPanel tenantId={id} mode="entitlements" />
      )}
      {tab === "credentials" && canReadCreds && (
        <CredentialsPanel tenantId={id} />
      )}
      {tab === "security" && canReadCreds && (
        <SecurityTab tenant={tenant} overview={overview} />
      )}
      {tab === "audit" && canViewAudit && <TenantAuditPanel tenantId={id} />}

      {/* Edit dialog — keyed so the draft is re-seeded from the current name. */}
      {canUpdate && editing && (
        <EditTenantDialog
          key={`${tenant.id}:${tenant.name}`}
          tenant={tenant}
          open
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            invalidateTenant();
          }}
        />
      )}

      {/* Lifecycle confirmation dialog — keyed per transition so the
          type-to-confirm field resets between actions. */}
      {pending && (
        <LifecycleDialog
          key={pending.value}
          tenant={tenant}
          transition={pending}
          pending={setStatus.isPending}
          error={
            setStatus.error instanceof Error ? setStatus.error.message : null
          }
          onClose={() => {
            if (!setStatus.isPending) setPending(null);
          }}
          onConfirm={() => setStatus.mutate(pending.value)}
        />
      )}
    </div>
  );
}

// ── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({
  tenant,
  overview,
  transitions,
  onTransition,
  canViewAudit,
}: {
  tenant: PlatformTenantDto;
  overview?: PlatformTenantOverviewDto;
  transitions: Transition[];
  onTransition: (t: Transition) => void;
  canViewAudit: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Identity — the canonical facts about this tenant. */}
        <Card padded={false}>
          <CardHeader
            title="Identity"
            icon={CircleUser}
            description="Platform-level identity for this tenant."
          />
          <CardBody className="py-1">
            <InfoList>
              <InfoRow label="Display name" value={tenant.name} />
              <InfoRow label="Slug" value={tenant.slug} mono />
              <InfoRow
                label="Tenant ID"
                value={
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono text-xs">{tenant.id}</span>
                    <CopyButton value={tenant.id} label="Copy" />
                  </span>
                }
              />
              <InfoRow
                label="Lifecycle status"
                value={<StatusBadge status={tenant.status} />}
              />
              <InfoRow
                label="Primary administrator"
                value={
                  overview === undefined ? (
                    <Skeleton className="ml-auto h-4 w-40" />
                  ) : overview.primaryAdmin ? (
                    <span className="inline-flex flex-col items-end">
                      <span>{overview.primaryAdmin.name}</span>
                      <span className="font-mono text-xs text-slate-500">
                        {overview.primaryAdmin.email}
                      </span>
                    </span>
                  ) : undefined
                }
                empty="No administrator"
              />
              <InfoRow
                label="Created"
                value={new Date(tenant.createdAt).toLocaleString(
                  undefined,
                  DATE_TIME_FMT,
                )}
              />
              <InfoRow
                label="Last updated"
                value={new Date(tenant.updatedAt).toLocaleString(
                  undefined,
                  DATE_TIME_FMT,
                )}
              />
            </InfoList>
          </CardBody>
        </Card>

        {/* Platform state summary — real signals only. */}
        <Card padded={false}>
          <CardHeader
            title="Platform state"
            icon={Boxes}
            description="The tenant's current standing across platform capabilities."
          />
          <CardBody className="py-1">
            <InfoList>
              <InfoRow
                label="Plan"
                value={
                  overview === undefined ? (
                    <Skeleton className="ml-auto h-4 w-24" />
                  ) : overview.plan ? (
                    <Badge tone="accent">{overview.plan.name}</Badge>
                  ) : (
                    <Badge tone="neutral">None</Badge>
                  )
                }
              />
              <InfoRow
                label="Entitlements"
                value={
                  overview === undefined ? (
                    <Skeleton className="ml-auto h-4 w-16" />
                  ) : (
                    <span className="tabular-nums">
                      {overview.plan?.entitlementCount ?? 0}
                      {overview.plan && overview.plan.overrideCount > 0 && (
                        <span className="ml-2 text-xs text-slate-500">
                          ({overview.plan.overrideCount} overridden)
                        </span>
                      )}
                    </span>
                  )
                }
              />
              <InfoRow
                label="Members"
                value={
                  overview === undefined ? (
                    <Skeleton className="ml-auto h-4 w-16" />
                  ) : (
                    <span className="tabular-nums">
                      {overview.members.total}
                      <span className="ml-2 text-xs text-slate-500">
                        ({overview.members.active} active)
                      </span>
                    </span>
                  )
                }
              />
              <InfoRow
                label="Credential health"
                value={
                  overview === undefined ? (
                    <Skeleton className="ml-auto h-4 w-28" />
                  ) : overview.credentials.expired > 0 ? (
                    <Badge tone="warning">
                      {overview.credentials.expired} expired
                    </Badge>
                  ) : overview.credentials.active > 0 ? (
                    <Badge tone="success">Healthy</Badge>
                  ) : (
                    <Badge tone="neutral">No active credentials</Badge>
                  )
                }
              />
            </InfoList>
          </CardBody>
        </Card>

        {/* Recent activity — real audit data. */}
        {canViewAudit && <RecentActivity tenantId={tenant.id} />}
      </div>

      {/* Lifecycle action rail */}
      <div className="space-y-6">
        <Card padded={false}>
          <CardHeader
            title="Lifecycle actions"
            icon={History}
            description="Change the tenant state."
          />
          <CardBody className="space-y-3">
            <LifecycleActions
              tenant={tenant}
              transitions={transitions}
              onTransition={onTransition}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/** Compact recent-activity list backed by real tenant-scoped audit rows. */
function RecentActivity({ tenantId }: { tenantId: string }) {
  const { data: logs = [], isPending } = useQuery({
    queryKey: ["platform", "tenant", tenantId, "audit", "recent"],
    queryFn: () => platformApi.auditLogs({ tenantId, limit: 6 }),
    retry: false,
  });

  return (
    <Card padded={false}>
      <CardHeader
        title="Recent activity"
        icon={Activity}
        description="The latest platform events recorded for this tenant."
      />
      <CardBody>
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Lifecycle and configuration changes will appear here."
          />
        ) : (
          <Timeline>
            {logs.map((log: PlatformAuditLogDto) => (
              <TimelineItem
                key={log.id}
                tone={actionTone(log.action)}
                title={humanizeAction(log.action)}
                meta={
                  <>
                    <span className="font-mono">{log.action}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {new Date(log.createdAt).toLocaleString(
                        undefined,
                        DATE_TIME_FMT,
                      )}
                    </span>
                  </>
                }
              />
            ))}
          </Timeline>
        )}
      </CardBody>
    </Card>
  );
}

/** The lifecycle action buttons (shared by Overview and Lifecycle tabs). */
function LifecycleActions({
  tenant,
  transitions,
  onTransition,
}: {
  tenant: PlatformTenantDto;
  transitions: Transition[];
  onTransition: (t: Transition) => void;
}) {
  if (transitions.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No lifecycle actions are available from the{" "}
        <span className="font-medium">{tenant.status}</span> state.
      </p>
    );
  }
  return (
    <>
      {transitions.map((t) => (
        <button
          key={t.value}
          type="button"
          aria-label={`${t.label} tenant`}
          onClick={() => onTransition(t)}
          className={cn(
            "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
            t.tone === "danger"
              ? "border-red-200 hover:bg-red-50"
              : "border-slate-200 hover:bg-slate-50",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              t.tone === "danger"
                ? "bg-red-100 text-red-600"
                : t.tone === "warning"
                  ? "bg-amber-100 text-amber-600"
                  : "bg-emerald-100 text-emerald-600",
            )}
          >
            {t.value === "ARCHIVED" ? (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            ) : t.value === "ACTIVE" ? (
              <PlayCircle className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-900">
              {t.label}
            </span>
            <span className="block text-xs text-slate-500">
              {t.description}
            </span>
          </span>
        </button>
      ))}
    </>
  );
}

// ── Lifecycle tab (state machine + history reconstructed from audit) ─────────

const LIFECYCLE_STATES: TenantStatus[] = [
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "ARCHIVED",
];

/** Audit actions that represent a lifecycle transition (real, from audit). */
const LIFECYCLE_ACTIONS = new Set([
  "TENANT_PROVISIONED",
  "TENANT_ACTIVATED",
  "TENANT_SUSPENDED",
  "TENANT_ARCHIVED",
]);

function LifecycleTab({
  tenant,
  transitions,
  onTransition,
}: {
  tenant: PlatformTenantDto;
  transitions: Transition[];
  onTransition: (t: Transition) => void;
}) {
  const { data: logs = [], isPending } = useQuery({
    queryKey: ["platform", "tenant", tenant.id, "audit", "lifecycle"],
    queryFn: () => platformApi.auditLogs({ tenantId: tenant.id, limit: 50 }),
    retry: false,
  });

  const history = logs.filter((l: PlatformAuditLogDto) =>
    LIFECYCLE_ACTIONS.has(l.action.toUpperCase()),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card padded={false}>
          <CardHeader
            title="Lifecycle state"
            icon={History}
            description="The tenant's position in the platform lifecycle."
          />
          <CardBody>
            <div className="flex flex-wrap items-center gap-2">
              {LIFECYCLE_STATES.map((state, i) => {
                const current = state === tenant.status;
                return (
                  <div key={state} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset",
                        current
                          ? "bg-slate-900 text-white ring-slate-900"
                          : "bg-white text-slate-500 ring-slate-200",
                      )}
                    >
                      {state}
                    </span>
                    {i < LIFECYCLE_STATES.length - 1 && (
                      <span className="text-slate-300" aria-hidden>
                        →
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {tenant.status === "ARCHIVED"
                ? "ARCHIVED is terminal — the tenant cannot transition to another state."
                : "Highlighted state is current. Available transitions are shown on the right."}
            </p>
          </CardBody>
        </Card>

        <Card padded={false}>
          <CardHeader
            title="Transition history"
            icon={ScrollText}
            description="Reconstructed from the platform audit log."
          />
          <CardBody>
            {isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-2.5 w-2.5 rounded-full" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                ))}
              </div>
            ) : history.length === 0 ? (
              <EmptyState
                icon={History}
                title="No lifecycle changes recorded"
                description="Provisioning and status changes will appear here."
              />
            ) : (
              <Timeline>
                {history.map((log: PlatformAuditLogDto) => {
                  const meta = log.metadata as {
                    from?: string;
                    to?: string;
                  } | null;
                  return (
                    <TimelineItem
                      key={log.id}
                      tone={actionTone(log.action)}
                      title={humanizeAction(log.action)}
                      meta={
                        <>
                          {meta?.from && meta?.to && (
                            <span className="font-mono">
                              {meta.from} → {meta.to}
                            </span>
                          )}
                          {meta?.from && meta?.to && <span aria-hidden>·</span>}
                          <span>
                            {new Date(log.createdAt).toLocaleString(
                              undefined,
                              DATE_TIME_FMT,
                            )}
                          </span>
                        </>
                      }
                    />
                  );
                })}
              </Timeline>
            )}
          </CardBody>
        </Card>

        {/* Honest note: no dedicated provisioning-status model exists. */}
        <CapabilityGapNote
          icon={Boxes}
          title="Provisioning is single-step"
          description="Tenants are provisioned in one transaction (tenant, primary admin, membership, default role). There is no multi-step provisioning tracker — the outcome above reflects what actually exists."
        />
      </div>

      <div className="space-y-6">
        <Card padded={false}>
          <CardHeader
            title="Actions"
            icon={PlayCircle}
            description="Available lifecycle transitions."
          />
          <CardBody className="space-y-3">
            <LifecycleActions
              tenant={tenant}
              transitions={transitions}
              onTransition={onTransition}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// ── Security tab (real signals only) ─────────────────────────────────────────

function SecurityTab({
  tenant,
  overview,
}: {
  tenant: PlatformTenantDto;
  overview?: PlatformTenantOverviewDto;
}) {
  const accessActive = tenant.status === "ACTIVE" || tenant.status === "TRIAL";
  return (
    <div className="space-y-6">
      <Card padded={false}>
        <CardHeader
          title="Security posture"
          icon={ShieldCheck}
          description="Derived from real platform signals — lifecycle state and credential health."
        />
        <CardBody>
          <MetadataGrid>
            <MetadataItem
              label="Platform access"
              value={
                accessActive ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Badge tone="warning">
                    {tenant.status === "SUSPENDED" ? "Suspended" : "Archived"}
                  </Badge>
                )
              }
            />
            <MetadataItem
              label="Credential health"
              value={
                overview === undefined ? (
                  <Skeleton className="h-4 w-28" />
                ) : overview.credentials.expired > 0 ? (
                  <Badge tone="warning">
                    {overview.credentials.expired} expired active
                  </Badge>
                ) : overview.credentials.active > 0 ? (
                  <Badge tone="success">Healthy</Badge>
                ) : (
                  <Badge tone="neutral">No active credentials</Badge>
                )
              }
            />
            <MetadataItem
              label="Active credentials"
              value={
                overview === undefined ? (
                  <Skeleton className="h-4 w-10" />
                ) : (
                  <span className="tabular-nums">
                    {overview.credentials.active}
                  </span>
                )
              }
            />
            <MetadataItem
              label="Revoked credentials"
              value={
                overview === undefined ? (
                  <Skeleton className="h-4 w-10" />
                ) : (
                  <span className="tabular-nums">
                    {overview.credentials.revoked}
                  </span>
                )
              }
            />
          </MetadataGrid>
        </CardBody>
      </Card>

      {/* Honest note: no per-tenant auth-event store exists. */}
      <CapabilityGapNote
        icon={ShieldAlert}
        title="Authentication & threat events are not tenant-scoped yet"
        description="The platform does not currently store per-tenant sign-in or suspicious-activity events, so no auth-event feed or security score is shown here (showing one would be fabricated). Security reflects the real signals above."
      />
    </div>
  );
}

// ── Edit dialog (enterprise form) ───────────────────────────────────────────

function EditTenantDialog({
  tenant,
  open,
  onClose,
  onSaved,
}: {
  tenant: PlatformTenantDto;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the draft whenever the dialog is (re)opened for a tenant.
  const dirty = name.trim() !== tenant.name;
  const nameError =
    name.trim().length === 0
      ? "Tenant name is required."
      : name.trim().length > 120
        ? "Tenant name must be 120 characters or fewer."
        : null;

  const update = useMutation({
    mutationFn: (value: string) =>
      platformApi.updateTenant(tenant.id, { name: value }),
    onSuccess: onSaved,
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "Failed to update tenant."),
  });

  // Reset local state when opening.
  const handleClose = () => {
    if (update.isPending) return;
    setName(tenant.name);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader
        title="Edit tenant"
        description="Update organization details."
        onClose={handleClose}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const trimmed = name.trim();
          if (!nameError) update.mutate(trimmed);
        }}
      >
        <DialogBody className="space-y-4">
          <Field
            label="Tenant name"
            htmlFor="edit-name"
            required
            error={
              error ? undefined : dirty ? (nameError ?? undefined) : undefined
            }
          >
            <Input
              id="edit-name"
              value={name}
              autoFocus
              maxLength={120}
              aria-invalid={dirty && Boolean(nameError)}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Slug"
            htmlFor="edit-slug"
            hint="The slug is a stable identifier and cannot be changed."
          >
            <Input id="edit-slug" value={tenant.slug} disabled readOnly />
          </Field>
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={update.isPending}
            disabled={!dirty || Boolean(nameError)}
          >
            Save
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ── Lifecycle confirmation dialog ───────────────────────────────────────────

function LifecycleDialog({
  tenant,
  transition,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  tenant: PlatformTenantDto;
  transition: Transition | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");

  if (!transition) return null;

  const needsType = transition.requireTypeToConfirm;
  const typeOk = !needsType || confirmText.trim() === tenant.name;
  const danger = transition.tone === "danger";

  return (
    <Dialog open={Boolean(transition)} onClose={onClose}>
      <DialogHeader
        title={`${transition.label} tenant`}
        onClose={pending ? undefined : onClose}
      />
      <DialogBody className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={tenant.name} seed={tenant.slug} />
          <div>
            <p className="text-sm font-medium text-slate-900">{tenant.name}</p>
            <p className="font-mono text-xs text-slate-500">{tenant.slug}</p>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          {transition.description}
          {danger && " This is permanent and cannot be undone."}
        </p>

        <p className="text-xs text-slate-500">
          This action will be recorded in the platform audit log.
        </p>

        {needsType && (
          <Field
            label={`Type the tenant name to confirm`}
            htmlFor="confirm-name"
          >
            <Input
              id="confirm-name"
              value={confirmText}
              placeholder={tenant.name}
              autoComplete="off"
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </Field>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant={danger ? "danger" : "primary"}
          loading={pending}
          disabled={!typeOk}
          onClick={onConfirm}
        >
          Confirm {transition.label}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ── Plan & entitlements panel ───────────────────────────────────────────────

function PlanPanel({
  tenantId,
  mode = "entitlements",
}: {
  tenantId: string;
  /** "plan" → plan card + assignment; "entitlements" → the entitlement table. */
  mode?: "plan" | "entitlements";
}) {
  const qc = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const canManage = can(PermissionKeys.PlatformPlanManage);
  const canManageEnt = can(PermissionKeys.PlatformEntitlementManage);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [entError, setEntError] = useState<string | null>(null);

  const entKey = ["platform", "tenant", tenantId, "entitlements"];
  const { data, isPending } = useQuery({
    queryKey: entKey,
    queryFn: () => platformApi.tenantEntitlements(tenantId),
    retry: false,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => platformApi.plans(),
    enabled: canManage,
    retry: false,
  });

  const assign = useMutation({
    mutationFn: (planKey: string) =>
      platformApi.assignTenantPlan(tenantId, planKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: entKey });
      void qc.invalidateQueries({
        queryKey: ["platform", "tenant", tenantId, "overview"],
      });
    },
  });

  const override = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | null }) =>
      platformApi.setTenantEntitlementOverride(tenantId, key, value),
    onSuccess: () => {
      setEntError(null);
      setDrafts({});
      void qc.invalidateQueries({ queryKey: entKey });
      void qc.invalidateQueries({
        queryKey: ["platform", "tenant", tenantId, "overview"],
      });
    },
    onError: (e) =>
      setEntError(
        e instanceof ApiError ? e.message : "Failed to update override.",
      ),
  });

  // ── Plan tab: plan summary + assignment ─────────────────────────────────────
  if (mode === "plan") {
    const selected = data?.plan;
    const planMeta = plans.find((p) => p.key === selected?.key);
    return (
      <Card padded={false}>
        <CardHeader
          title="Plan"
          icon={Package}
          description="The commercial-agnostic capability package assigned to this tenant."
          action={
            canManage &&
            plans.length > 0 &&
            data && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span className="hidden sm:inline">Assign</span>
                <select
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  defaultValue={data.plan?.key ?? ""}
                  disabled={assign.isPending}
                  aria-label="Assign plan"
                  onChange={(e) => {
                    if (e.target.value) assign.mutate(e.target.value);
                  }}
                >
                  <option value="" disabled>
                    Select a plan…
                  </option>
                  {plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )
          }
        />
        <CardBody>
          {isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !data ? (
            <p className="text-sm text-slate-500">Unavailable.</p>
          ) : !data.plan ? (
            <EmptyState
              icon={Package}
              title="No plan assigned"
              description={
                canManage
                  ? "Assign a plan to grant this tenant a capability package."
                  : "This tenant has no plan assigned."
              }
            />
          ) : (
            <>
              <MetadataGrid>
                <MetadataItem
                  label="Current plan"
                  value={<Badge tone="accent">{data.plan.name}</Badge>}
                />
                <MetadataItem label="Plan key" value={data.plan.key} mono />
                {planMeta?.description && (
                  <MetadataItem
                    label="Description"
                    value={planMeta.description}
                    className="sm:col-span-2"
                  />
                )}
                <MetadataItem
                  label="Entitlements granted"
                  value={
                    <span className="tabular-nums">
                      {data.entitlements.length}
                    </span>
                  }
                />
                <MetadataItem
                  label="Overrides in effect"
                  value={
                    <span className="tabular-nums">
                      {
                        data.entitlements.filter((e) => e.source === "OVERRIDE")
                          .length
                      }
                    </span>
                  }
                />
              </MetadataGrid>
              <p className="mt-4 text-xs text-slate-500">
                Manage individual capability values on the{" "}
                <span className="font-medium">Entitlements</span> tab.
              </p>
            </>
          )}
        </CardBody>
      </Card>
    );
  }

  // ── Entitlements tab: effective entitlement table + overrides ────────────────
  return (
    <Card padded={false}>
      <CardHeader
        title="Plan & Entitlements"
        icon={Gauge}
        description="The tenant's effective capabilities (plan values with per-tenant overrides applied)."
      />
      <CardBody>
        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !data ? (
          <p className="text-sm text-slate-500">Unavailable.</p>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm text-slate-500">Current plan</span>
              {data.plan ? (
                <Badge tone="accent">{data.plan.name}</Badge>
              ) : (
                <Badge tone="neutral">None</Badge>
              )}
            </div>

            {entError && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {entError}
              </p>
            )}

            {data.entitlements.length === 0 ? (
              <EmptyState
                icon={Gauge}
                title="No entitlements"
                description="Assign a plan to grant capabilities to this tenant."
              />
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <Th>Entitlement</Th>
                    <Th>Value</Th>
                    <Th>Source</Th>
                    {canManageEnt && <Th align="right">Override</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.entitlements.map((e) => (
                    <tr key={e.key} className="hover:bg-slate-50/70">
                      <Td>
                        <span className="font-medium text-slate-900">
                          {e.name}
                        </span>
                        <span className="ml-2 font-mono text-xs text-slate-400">
                          {e.key}
                        </span>
                      </Td>
                      <Td className="font-mono text-slate-800">{e.value}</Td>
                      <Td>
                        <Badge
                          tone={e.source === "OVERRIDE" ? "accent" : "neutral"}
                        >
                          {e.source}
                        </Badge>
                      </Td>
                      {canManageEnt && (
                        <Td align="right">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              value={drafts[e.key] ?? e.value}
                              aria-label={`Override value for ${e.name}`}
                              disabled={override.isPending}
                              className="h-8 w-28 text-xs"
                              onChange={(ev) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [e.key]: ev.target.value,
                                }))
                              }
                            />
                            <Button
                              type="button"
                              variant="subtle"
                              size="sm"
                              disabled={override.isPending}
                              onClick={() =>
                                override.mutate({
                                  key: e.key,
                                  value: drafts[e.key] ?? e.value,
                                })
                              }
                            >
                              Set
                            </Button>
                            {e.source === "OVERRIDE" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:bg-red-50"
                                disabled={override.isPending}
                                onClick={() =>
                                  override.mutate({ key: e.key, value: null })
                                }
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ── Credentials panel (security-focused) ────────────────────────────────────

function SecretBanner({
  credential,
  onDismiss,
}: {
  credential: CreatedCredential;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        Secret shown once
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-sm text-slate-800 ring-1 ring-inset ring-amber-200">
          {credential.secretKey}
        </code>
        <CopyButton value={credential.secretKey} label="Copy secret" />
      </div>
      <p className="mt-2 text-xs text-amber-800">
        Public key: <span className="font-mono">{credential.publicKey}</span>
      </p>
      <p className="mt-1 text-xs text-amber-800">
        This secret will not be displayed again. Store it securely.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={onDismiss}
      >
        <Check className="h-4 w-4" aria-hidden />
        I've stored it
      </Button>
    </div>
  );
}

function CredentialsPanel({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const canCreate = can(PermissionKeys.PlatformCredentialCreate);
  const canRotate = can(PermissionKeys.PlatformCredentialRotate);
  const canRevoke = can(PermissionKeys.PlatformCredentialRevoke);

  const [revealed, setRevealed] = useState<CreatedCredential | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = ["platform", "credentials", tenantId];
  const { data: creds = [], isPending } = useQuery({
    queryKey: key,
    queryFn: () => platformApi.listCredentials(tenantId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () =>
      platformApi.createCredential(tenantId, name ? { name } : {}),
    onSuccess: (cred) => {
      setRevealed(cred);
      setName("");
      setCreating(false);
      setError(null);
      void invalidate();
    },
    onError: (e) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to create credential.",
      ),
  });

  const rotate = useMutation({
    mutationFn: (cid: string) => platformApi.rotateCredential(tenantId, cid),
    onSuccess: (cred) => {
      setRevealed(cred);
      void invalidate();
    },
    onError: (e) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to rotate credential.",
      ),
  });

  const revoke = useMutation({
    mutationFn: (cid: string) => platformApi.revokeCredential(tenantId, cid),
    onSuccess: () => void invalidate(),
    onError: (e) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to revoke credential.",
      ),
  });

  return (
    <Card padded={false}>
      <CardHeader
        title="API Credentials"
        icon={KeyRound}
        description="Create and manage credentials issued to this tenant."
        action={
          canCreate &&
          !creating && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Create credential
            </Button>
          )
        }
      />
      <CardBody>
        {revealed && (
          <SecretBanner
            credential={revealed}
            onDismiss={() => setRevealed(null)}
          />
        )}

        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {canCreate && creating && (
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-end">
            <Field
              label="Credential label"
              htmlFor="cred-name"
              hint="Optional — helps you identify this credential later."
              className="flex-1"
            >
              <Input
                id="cred-name"
                value={name}
                placeholder="e.g. Production Integration"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                loading={create.isPending}
                onClick={() => create.mutate()}
              >
                Create
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : creds.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No credentials yet"
            description="Issue an API credential to let this tenant integrate with the platform."
            action={
              canCreate &&
              !creating && (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Create credential
                </Button>
              )
            }
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Public key</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Expires</Th>
                <Th>Last used</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {creds.map((c) => {
                const expired =
                  c.status === "ACTIVE" &&
                  c.expiresAt !== null &&
                  new Date(c.expiresAt).getTime() < Date.now();
                return (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <Td className="font-medium text-slate-900">
                      {c.name ?? "—"}
                    </Td>
                    <Td className="font-mono text-xs text-slate-600">
                      {c.publicKey}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={c.status} />
                        {expired && <Badge tone="warning">Expired</Badge>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {c.expiresAt
                        ? new Date(c.expiresAt).toLocaleDateString()
                        : "Never"}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {c.lastUsedAt
                        ? new Date(c.lastUsedAt).toLocaleDateString()
                        : "—"}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        {c.status === "ACTIVE" && canRotate && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={rotate.isPending}
                            onClick={() => rotate.mutate(c.id)}
                          >
                            Rotate
                          </Button>
                        )}
                        {c.status === "ACTIVE" && canRevoke && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            disabled={revoke.isPending}
                            onClick={() => revoke.mutate(c.id)}
                          >
                            Revoke
                          </Button>
                        )}
                        {c.status !== "ACTIVE" && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </CardBody>
    </Card>
  );
}

// ── Audit timeline ────────────────────────────────────────────────────────────

function TenantAuditPanel({ tenantId }: { tenantId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: logs = [], isPending } = useQuery({
    queryKey: ["platform", "tenant", tenantId, "audit"],
    queryFn: () => platformApi.auditLogs({ tenantId, limit: 20 }),
    retry: false,
  });

  return (
    <Card padded={false}>
      <CardHeader
        title="Lifecycle & Audit"
        icon={ScrollText}
        description="Recorded platform activity for this tenant (newest first)."
      />
      <CardBody>
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Lifecycle and configuration changes will appear here."
          />
        ) : (
          <>
            <Timeline>
              {logs.map((log: PlatformAuditLogDto) => {
                const isOpen = expanded === log.id;
                const hasDetail =
                  Boolean(log.actorId) ||
                  Boolean(log.requestId) ||
                  Boolean(log.targetType) ||
                  (log.metadata && Object.keys(log.metadata).length > 0);
                return (
                  <TimelineItem
                    key={log.id}
                    tone={actionTone(log.action)}
                    title={humanizeAction(log.action)}
                    meta={
                      <>
                        <span className="font-mono">{log.action}</span>
                        <span aria-hidden>·</span>
                        <span>
                          {new Date(log.createdAt).toLocaleString(
                            undefined,
                            DATE_TIME_FMT,
                          )}
                        </span>
                        {hasDetail && (
                          <>
                            <span aria-hidden>·</span>
                            <button
                              type="button"
                              className="text-indigo-600 hover:underline"
                              aria-expanded={isOpen}
                              onClick={() =>
                                setExpanded(isOpen ? null : log.id)
                              }
                            >
                              {isOpen ? "Hide details" : "Details"}
                            </button>
                          </>
                        )}
                      </>
                    }
                  >
                    {isOpen && hasDetail && (
                      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
                        {log.actorId && (
                          <div>
                            <dt className="font-medium text-slate-500">
                              Actor
                            </dt>
                            <dd className="font-mono text-slate-700">
                              {log.actorId}
                            </dd>
                          </div>
                        )}
                        {log.targetType && (
                          <div>
                            <dt className="font-medium text-slate-500">
                              Target
                            </dt>
                            <dd className="font-mono text-slate-700">
                              {log.targetType}
                              {log.targetId ? ` · ${log.targetId}` : ""}
                            </dd>
                          </div>
                        )}
                        {log.requestId && (
                          <div>
                            <dt className="font-medium text-slate-500">
                              Request ID
                            </dt>
                            <dd className="font-mono text-slate-700">
                              {log.requestId}
                            </dd>
                          </div>
                        )}
                        {log.metadata &&
                          Object.keys(log.metadata).length > 0 && (
                            <div className="sm:col-span-2">
                              <dt className="font-medium text-slate-500">
                                Metadata
                              </dt>
                              <dd>
                                <pre className="mt-1 overflow-x-auto rounded bg-white p-2 font-mono text-[11px] text-slate-700 ring-1 ring-inset ring-slate-200">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </dd>
                            </div>
                          )}
                      </dl>
                    )}
                  </TimelineItem>
                );
              })}
            </Timeline>
            <p className="mt-4 text-xs text-slate-400">
              Showing the most recent 20 events. Full audit history and
              cross-tenant filtering are available on the Audit page.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ── Skeletons ────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-28" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

// ── Organization panel (Phase 20) ───────────────────────────────────────────
// Real, nullable platform-level tenant metadata: organization identity,
// registered/billing address, and a business contact. Read with
// platform.tenant.view; edit with platform.tenant.update. This is NOT tenant
// operational data — no logistics/warehouse/delivery locations.

/** The editable organization fields, in form order, grouped by section. */
const ORG_SECTIONS: Array<{
  title: string;
  icon: LucideIconType;
  fields: Array<{
    key: keyof UpdateTenantOrganizationBody;
    label: string;
    placeholder?: string;
    maxLength: number;
    type?: "text" | "email" | "url";
    multiline?: boolean;
    hint?: string;
  }>;
}> = [
  {
    title: "Organization",
    icon: Building2,
    fields: [
      {
        key: "legalName",
        label: "Legal name",
        maxLength: 200,
        placeholder: "Acme Logistics, Inc.",
      },
      {
        key: "website",
        label: "Website",
        maxLength: 255,
        type: "url",
        placeholder: "https://example.com",
      },
      {
        key: "industry",
        label: "Industry",
        maxLength: 120,
        placeholder: "Logistics",
      },
      {
        key: "timeZone",
        label: "Time zone",
        maxLength: 64,
        placeholder: "Africa/Lagos",
        hint: "IANA time zone identifier.",
      },
      {
        key: "locale",
        label: "Locale",
        maxLength: 35,
        placeholder: "en-US",
        hint: "BCP-47 language tag.",
      },
      {
        key: "description",
        label: "Description",
        maxLength: 500,
        multiline: true,
        placeholder: "Short description of the organization.",
      },
    ],
  },
  {
    title: "Registered address",
    icon: MapPin,
    fields: [
      { key: "addressLine1", label: "Address line 1", maxLength: 200 },
      { key: "addressLine2", label: "Address line 2", maxLength: 200 },
      { key: "city", label: "City", maxLength: 120 },
      { key: "region", label: "State / Province", maxLength: 120 },
      { key: "postalCode", label: "Postal code", maxLength: 32 },
      {
        key: "country",
        label: "Country",
        maxLength: 2,
        placeholder: "US",
        hint: "2-letter ISO-3166 code.",
      },
    ],
  },
  {
    title: "Business contact",
    icon: CircleUser,
    fields: [
      { key: "contactName", label: "Contact name", maxLength: 120 },
      {
        key: "contactEmail",
        label: "Contact email",
        maxLength: 255,
        type: "email",
        placeholder: "ops@example.com",
      },
      {
        key: "contactPhone",
        label: "Contact phone",
        maxLength: 40,
        placeholder: "+1 555 0100",
      },
    ],
  },
];

type LucideIconType = typeof Users;

/** All editable keys derived from the section config (single source of truth). */
const ORG_KEYS = ORG_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

/** Map the DTO (nulls) to a form draft (empty strings), for controlled inputs. */
function orgToDraft(
  org: TenantOrganizationDto,
): Record<keyof UpdateTenantOrganizationBody, string> {
  const draft = {} as Record<keyof UpdateTenantOrganizationBody, string>;
  for (const key of ORG_KEYS) {
    const value = (org as Record<string, string | null>)[key];
    draft[key] = value ?? "";
  }
  return draft;
}

/** Client-side mirror of the backend format checks (UX only; server re-validates). */
function orgFieldError(
  key: keyof UpdateTenantOrganizationBody,
  value: string,
): string | null {
  const v = value.trim();
  if (v === "") return null; // empty clears the field — always valid
  if (key === "website" && !/^https?:\/\/.+/i.test(v))
    return "Must start with http:// or https://";
  if (key === "contactEmail" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    return "Must be a valid email address";
  if (key === "country" && !/^[A-Za-z]{2}$/.test(v))
    return "Use a 2-letter country code, e.g. US";
  return null;
}

function OrganizationPanel({
  tenantId,
  canEdit,
}: {
  tenantId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const orgKey = ["platform", "tenant", tenantId, "organization"];

  const { data, isPending, error, refetch } = useQuery({
    queryKey: orgKey,
    queryFn: () => platformApi.tenantOrganization(tenantId),
    retry: false,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<
    keyof UpdateTenantOrganizationBody,
    string
  > | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: UpdateTenantOrganizationBody) =>
      platformApi.updateTenantOrganization(tenantId, body),
    onSuccess: (updated) => {
      qc.setQueryData(orgKey, updated);
      // The overview header reads name/plan, not org fields, but keep it fresh.
      void qc.invalidateQueries({
        queryKey: ["platform", "tenant", tenantId, "overview"],
      });
      void qc.invalidateQueries({
        queryKey: ["platform", "tenant", tenantId, "audit"],
      });
      setEditing(false);
      setDraft(null);
      setSaveError(null);
    },
    onError: (e) =>
      setSaveError(
        e instanceof ApiError ? e.message : "Failed to save organization.",
      ),
  });

  if (isPending) {
    return (
      <Card padded={false}>
        <CardHeader title="Organization" icon={Building2} />
        <CardBody className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardBody>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        icon={AlertTriangle}
        title="Unable to load organization"
        description="Something went wrong while loading the organization profile."
        requestId={error instanceof ApiError ? error.requestId : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const startEdit = () => {
    setDraft(orgToDraft(data));
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    if (save.isPending) return;
    setDraft(null);
    setSaveError(null);
    setEditing(false);
  };

  // Read-only view. Every section and field is always shown; empty fields
  // render "Not provided" so the operator sees what is (and is not) recorded.
  if (!editing || !draft) {
    const hasAny = ORG_KEYS.some(
      (k) => (data as Record<string, string | null>)[k],
    );
    const val = (k: keyof UpdateTenantOrganizationBody) =>
      (data as Record<string, string | null>)[k] ?? undefined;
    return (
      <div className="space-y-6">
        {/* Header card with the section-wide edit action + empty hint. */}
        <Card padded={false}>
          <CardHeader
            title="Organization profile"
            icon={Building2}
            description="Platform-level organization details, registered address, and business contact."
            action={
              canEdit ? (
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Edit organization
                </Button>
              ) : undefined
            }
          />
          {!hasAny && (
            <CardBody>
              <EmptyState
                icon={Building2}
                title="No organization details recorded"
                description={
                  canEdit
                    ? "Add the organization's legal identity, address, and business contact."
                    : "This tenant has no organization profile recorded yet."
                }
                action={
                  canEdit ? (
                    <Button size="sm" onClick={startEdit}>
                      <Pencil className="h-4 w-4" aria-hidden />
                      Edit organization
                    </Button>
                  ) : undefined
                }
              />
            </CardBody>
          )}
        </Card>

        {hasAny && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Organization identity */}
            <Card padded={false}>
              <CardHeader title="Organization" icon={Building2} />
              <CardBody className="py-1">
                <InfoList>
                  <InfoRow label="Legal name" value={val("legalName")} />
                  <InfoRow
                    label="Website"
                    value={val("website")}
                    href={val("website")}
                  />
                  <InfoRow label="Industry" value={val("industry")} />
                  <InfoRow label="Time zone" value={val("timeZone")} mono />
                  <InfoRow label="Locale" value={val("locale")} mono />
                  <InfoRow label="Description" value={val("description")} />
                </InfoList>
              </CardBody>
            </Card>

            {/* Registered address + business contact */}
            <div className="space-y-6">
              <Card padded={false}>
                <CardHeader title="Registered address" icon={MapPin} />
                <CardBody className="py-1">
                  <InfoList>
                    <InfoRow
                      label="Address line 1"
                      value={val("addressLine1")}
                    />
                    <InfoRow
                      label="Address line 2"
                      value={val("addressLine2")}
                    />
                    <InfoRow label="City" value={val("city")} />
                    <InfoRow label="State / Province" value={val("region")} />
                    <InfoRow label="Postal code" value={val("postalCode")} />
                    <InfoRow label="Country" value={val("country")} />
                  </InfoList>
                </CardBody>
              </Card>

              <Card padded={false}>
                <CardHeader title="Business contact" icon={CircleUser} />
                <CardBody className="py-1">
                  <InfoList>
                    <InfoRow label="Contact name" value={val("contactName")} />
                    <InfoRow
                      label="Contact email"
                      value={val("contactEmail")}
                      href={
                        val("contactEmail")
                          ? `mailto:${val("contactEmail")}`
                          : undefined
                      }
                    />
                    <InfoRow
                      label="Contact phone"
                      value={val("contactPhone")}
                    />
                  </InfoList>
                </CardBody>
              </Card>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Edit form.
  const setField = (key: keyof UpdateTenantOrganizationBody, value: string) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const original = orgToDraft(data);
  const dirty = ORG_KEYS.some((k) => draft[k].trim() !== (original[k] ?? ""));
  const fieldErrors = ORG_KEYS.map((k) => orgFieldError(k, draft[k])).filter(
    Boolean,
  );
  const hasFieldError = fieldErrors.length > 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (hasFieldError) return;
    // Send only the changed keys (partial update). Trimmed; "" clears the field.
    const body: UpdateTenantOrganizationBody = {};
    for (const key of ORG_KEYS) {
      const next = draft[key].trim();
      if (next !== (original[key] ?? "")) {
        (body as Record<string, string>)[key] = next;
      }
    }
    save.mutate(body);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {ORG_SECTIONS.map((section) => {
        const Icon = section.icon;
        return (
          <Card key={section.title} padded={false}>
            <CardHeader title={section.title} icon={Icon} />
            <CardBody>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {section.fields.map((f) => {
                  const err = orgFieldError(f.key, draft[f.key]);
                  const fieldId = `org-${f.key}`;
                  return (
                    <Field
                      key={f.key}
                      label={f.label}
                      htmlFor={fieldId}
                      hint={f.hint}
                      error={err ?? undefined}
                      className={f.multiline ? "md:col-span-2" : undefined}
                    >
                      {f.multiline ? (
                        <Textarea
                          id={fieldId}
                          rows={3}
                          maxLength={f.maxLength}
                          placeholder={f.placeholder}
                          value={draft[f.key]}
                          onChange={(e) => setField(f.key, e.target.value)}
                        />
                      ) : (
                        <Input
                          id={fieldId}
                          type={f.type ?? "text"}
                          maxLength={f.maxLength}
                          placeholder={f.placeholder}
                          value={draft[f.key]}
                          aria-invalid={Boolean(err)}
                          onChange={(e) => setField(f.key, e.target.value)}
                        />
                      )}
                    </Field>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        );
      })}

      {saveError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {saveError}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={cancelEdit}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={save.isPending}
          disabled={!dirty || hasFieldError}
        >
          <Save className="h-4 w-4" aria-hidden />
          Save changes
        </Button>
      </div>
    </form>
  );
}

// ── Branding panel (Phase 21) ────────────────────────────────────────────────
// Platform-level management of the tenant's white-label branding. Reads/writes
// go through the Platform API, which proxies to the Tenant API over S2S — the
// browser NEVER calls the Tenant API directly. Editing is gated on
// platform.tenant.update; viewing on platform.tenant.view (already required to
// reach this page). A connection card shows whether the Tenant runtime is
// reachable so the operator understands why branding might be unavailable.

/** Editable top-level branding fields as a flat draft (strings for inputs). */
interface BrandingDraft {
  appName: string;
  shortName: string;
  primary: string;
  secondary: string;
  accent: string;
  logo: string;
  logoDark: string;
  icon: string;
  favicon: string;
  companyName: string;
  description: string;
}

function brandingToDraft(b: AppBranding): BrandingDraft {
  return {
    appName: b.appName ?? "",
    shortName: b.shortName ?? "",
    primary: b.colors?.primary ?? "",
    secondary: b.colors?.secondary ?? "",
    accent: b.colors?.accent ?? "",
    logo: b.logo ?? "",
    logoDark: b.logoDark ?? "",
    icon: b.icon ?? "",
    favicon: b.favicon ?? "",
    companyName: b.metadata?.companyName ?? "",
    description: b.metadata?.description ?? "",
  };
}

/**
 * Build a PARTIAL update body from the draft vs the current branding. `colors`
 * and `metadata` are whole-object replacements (contract semantics), so we send
 * the full sub-object whenever any of its fields changed.
 */
function draftToBrandingBody(
  draft: BrandingDraft,
  current: AppBranding,
): UpdateTenantBrandingBody {
  const body: UpdateTenantBrandingBody = {};
  const t = (s: string) => s.trim();

  if (t(draft.appName) !== (current.appName ?? ""))
    body.appName = t(draft.appName);
  if (t(draft.shortName) !== (current.shortName ?? ""))
    body.shortName = t(draft.shortName);

  const colorsChanged =
    t(draft.primary) !== (current.colors?.primary ?? "") ||
    t(draft.secondary) !== (current.colors?.secondary ?? "") ||
    t(draft.accent) !== (current.colors?.accent ?? "");
  if (colorsChanged) {
    body.colors = {
      primary: t(draft.primary),
      ...(t(draft.secondary) ? { secondary: t(draft.secondary) } : {}),
      ...(t(draft.accent) ? { accent: t(draft.accent) } : {}),
    };
  }

  for (const key of ["logo", "logoDark", "icon", "favicon"] as const) {
    if (t(draft[key]) !== (current[key] ?? "")) {
      (body as Record<string, string>)[key] = t(draft[key]);
    }
  }

  const metaChanged =
    t(draft.companyName) !== (current.metadata?.companyName ?? "") ||
    t(draft.description) !== (current.metadata?.description ?? "");
  if (metaChanged) {
    body.metadata = {
      ...(t(draft.companyName) ? { companyName: t(draft.companyName) } : {}),
      ...(t(draft.description) ? { description: t(draft.description) } : {}),
    };
  }

  return body;
}

/** Small non-sensitive connection indicator for the tenant runtime. */
function TenantConnectionCard({ tenantId }: { tenantId: string }) {
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["platform", "tenant", tenantId, "connection"],
    queryFn: () => platformApi.tenantConnection(tenantId),
    retry: false,
  });

  const reachable = data?.reachable ?? false;
  const tone: "neutral" | "success" | "warning" | "danger" = isPending
    ? "neutral"
    : reachable && data?.status === "ready"
      ? "success"
      : reachable
        ? "warning"
        : "danger";

  return (
    <Card padded={false}>
      <CardHeader
        title="Tenant runtime connection"
        icon={Activity}
        description="Live reachability of the Tenant API (server-to-server)."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            loading={isFetching}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Recheck
          </Button>
        }
      />
      <CardBody>
        {isPending ? (
          <Skeleton className="h-9 w-full" />
        ) : error ? (
          <p className="text-sm text-slate-500">
            Unable to determine connection status.
          </p>
        ) : (
          <InfoList>
            <InfoRow
              label="Reachable"
              value={
                <Badge tone={tone}>
                  {reachable ? "Connected" : "Unreachable"}
                </Badge>
              }
            />
            {reachable && (
              <>
                <InfoRow label="Status" value={data?.status} />
                <InfoRow label="Environment" value={data?.environment} />
                <InfoRow label="Version" value={data?.version} mono />
              </>
            )}
            {!reachable && data?.detail && (
              <InfoRow label="Detail" value={data.detail} />
            )}
          </InfoList>
        )}
      </CardBody>
    </Card>
  );
}

function BrandingPanel({
  tenantId,
  canEdit,
}: {
  tenantId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const brandingKey = ["platform", "tenant", tenantId, "branding"];

  const { data, isPending, error, refetch } = useQuery({
    queryKey: brandingKey,
    queryFn: () => platformApi.tenantBranding(tenantId),
    retry: false,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BrandingDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: UpdateTenantBrandingBody) =>
      platformApi.updateTenantBranding(tenantId, body),
    onSuccess: (updated) => {
      qc.setQueryData(brandingKey, updated);
      // Branding writes are audited server-side; keep the audit view fresh.
      void qc.invalidateQueries({
        queryKey: ["platform", "tenant", tenantId, "audit"],
      });
      setEditing(false);
      setDraft(null);
      setSaveError(null);
    },
    onError: (e) =>
      setSaveError(
        e instanceof ApiError ? e.message : "Failed to save branding.",
      ),
  });

  if (isPending) {
    return (
      <div className="space-y-6">
        <TenantConnectionCard tenantId={tenantId} />
        <Card padded={false}>
          <CardHeader title="Branding" icon={Palette} />
          <CardBody className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardBody>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    // A Tenant API connection failure surfaces here (SERVICE_UNAVAILABLE). Show
    // the connection card so the operator can see the runtime is unreachable.
    return (
      <div className="space-y-6">
        <TenantConnectionCard tenantId={tenantId} />
        <ErrorState
          icon={AlertTriangle}
          title="Unable to load branding"
          description={
            error instanceof ApiError && error.code === "SERVICE_UNAVAILABLE"
              ? "The Tenant API could not be reached. Branding is managed on the tenant runtime."
              : "Something went wrong while loading tenant branding."
          }
          requestId={error instanceof ApiError ? error.requestId : undefined}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const startEdit = () => {
    setDraft(brandingToDraft(data));
    setSaveError(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    if (save.isPending) return;
    setDraft(null);
    setSaveError(null);
    setEditing(false);
  };

  // Read view.
  if (!editing || !draft) {
    return (
      <div className="space-y-6">
        <TenantConnectionCard tenantId={tenantId} />
        <Card padded={false}>
          <CardHeader
            title="Branding"
            icon={Palette}
            description="White-label identity served to the tenant's Admin at runtime."
            action={
              canEdit ? (
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Edit branding
                </Button>
              ) : undefined
            }
          />
          <CardBody className="py-1">
            <InfoList>
              <InfoRow label="App name" value={data.appName} />
              <InfoRow label="Short name" value={data.shortName} />
              <InfoRow
                label="Primary color"
                value={data.colors?.primary}
                mono
              />
              <InfoRow
                label="Secondary color"
                value={data.colors?.secondary}
                mono
              />
              <InfoRow label="Accent color" value={data.colors?.accent} mono />
              <InfoRow label="Logo" value={data.logo} />
              <InfoRow label="Logo (dark)" value={data.logoDark} />
              <InfoRow label="Icon" value={data.icon} />
              <InfoRow label="Favicon" value={data.favicon} />
              <InfoRow
                label="Company name"
                value={data.metadata?.companyName}
              />
              <InfoRow label="Description" value={data.metadata?.description} />
            </InfoList>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Edit form.
  const setField = (key: keyof BrandingDraft, value: string) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const body = draftToBrandingBody(draft, data);
  const dirty = Object.keys(body).length > 0;
  // appName/shortName/primary are required by the contract — block clearing them.
  const missingRequired =
    !draft.appName.trim() || !draft.shortName.trim() || !draft.primary.trim();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (missingRequired || !dirty) return;
    save.mutate(body);
  };

  const fields: Array<{
    key: keyof BrandingDraft;
    label: string;
    hint?: string;
    required?: boolean;
    maxLength?: number;
  }> = [
    { key: "appName", label: "App name", required: true, maxLength: 80 },
    { key: "shortName", label: "Short name", required: true, maxLength: 24 },
    {
      key: "primary",
      label: "Primary color",
      required: true,
      hint: "hex, rgb(), hsl(), or an H S% L% triplet",
      maxLength: 64,
    },
    { key: "secondary", label: "Secondary color", maxLength: 64 },
    { key: "accent", label: "Accent color", maxLength: 64 },
    {
      key: "logo",
      label: "Logo URL",
      hint: "https URL or /relative path",
      maxLength: 2048,
    },
    { key: "logoDark", label: "Logo (dark) URL", maxLength: 2048 },
    { key: "icon", label: "Icon URL", maxLength: 2048 },
    { key: "favicon", label: "Favicon URL", maxLength: 2048 },
    { key: "companyName", label: "Company name", maxLength: 120 },
    { key: "description", label: "Description", maxLength: 280 },
  ];

  return (
    <div className="space-y-6">
      <TenantConnectionCard tenantId={tenantId} />
      <form onSubmit={onSubmit} className="space-y-6">
        <Card padded={false}>
          <CardHeader
            title="Edit branding"
            icon={Palette}
            description="Changes are pushed to the tenant runtime and applied on its next branding read."
          />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {fields.map((f) => {
                const fieldId = `brand-${f.key}`;
                const err =
                  f.required && !draft[f.key].trim() ? "Required." : undefined;
                return (
                  <Field
                    key={f.key}
                    label={f.required ? `${f.label} *` : f.label}
                    htmlFor={fieldId}
                    hint={f.hint}
                    error={err}
                  >
                    <Input
                      id={fieldId}
                      maxLength={f.maxLength}
                      value={draft[f.key]}
                      aria-invalid={Boolean(err)}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                  </Field>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {saveError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {saveError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={cancelEdit}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={save.isPending}
            disabled={!dirty || missingRequired}
          >
            <Save className="h-4 w-4" aria-hidden />
            Save branding
          </Button>
        </div>
      </form>
    </div>
  );
}
