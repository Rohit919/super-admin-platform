import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Eye,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { platformApi } from "@/modules/platform/platform.api";
import { useAuthStore } from "@/stores/auth.store";
import {
  PermissionKeys,
  type PlatformTenantDto,
  type TenantStatus,
} from "@app/api-contracts";
import type { CreateTenantBody } from "@app/api-contracts";
import { ApiError } from "@/lib/api-client";
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  EmptyState,
  ErrorState,
  Field,
  Input,
  MenuItem,
  MenuSeparator,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  Td,
  Th,
} from "@/components/ui";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: Array<{ label: string; value: TenantStatus | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Trial", value: "TRIAL" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Archived", value: "ARCHIVED" },
];

/**
 * Lifecycle transitions available from each status. The backend gates ALL
 * status transitions on platform.tenant.suspend (and archive on
 * platform.tenant.archive) — see /platform/tenants/:id/status — so the UI gate
 * mirrors the authoritative check. Frontend gating is UX only.
 */
const STATUS_TRANSITIONS: Record<
  TenantStatus,
  Array<{
    label: string;
    value: TenantStatus;
    perm: string;
    tone: "default" | "warning" | "danger";
  }>
> = {
  TRIAL: [
    {
      label: "Activate",
      value: "ACTIVE",
      perm: PermissionKeys.PlatformTenantSuspend,
      tone: "default",
    },
    {
      label: "Suspend",
      value: "SUSPENDED",
      perm: PermissionKeys.PlatformTenantSuspend,
      tone: "warning",
    },
  ],
  ACTIVE: [
    {
      label: "Suspend",
      value: "SUSPENDED",
      perm: PermissionKeys.PlatformTenantSuspend,
      tone: "warning",
    },
    {
      label: "Archive",
      value: "ARCHIVED",
      perm: PermissionKeys.PlatformTenantArchive,
      tone: "danger",
    },
  ],
  SUSPENDED: [
    {
      label: "Reactivate",
      value: "ACTIVE",
      perm: PermissionKeys.PlatformTenantSuspend,
      tone: "default",
    },
    {
      label: "Archive",
      value: "ARCHIVED",
      perm: PermissionKeys.PlatformTenantArchive,
      tone: "danger",
    },
  ],
  ARCHIVED: [],
};

const EMPTY_FORM: CreateTenantBody = {
  name: "",
  slug: "",
  adminEmail: "",
  adminName: "",
  adminPassword: "",
};

/** Tenant identity cell — deterministic avatar + name + slug. */
function TenantIdentity({ tenant }: { tenant: PlatformTenantDto }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={tenant.name} seed={tenant.slug} />
      <div className="min-w-0">
        <Link
          to={`/tenants/${tenant.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block truncate font-medium text-slate-900 hover:text-indigo-600 hover:underline"
        >
          {tenant.name}
        </Link>
        <span className="block truncate font-mono text-xs text-slate-400">
          {tenant.slug}
        </span>
      </div>
    </div>
  );
}

/**
 * Plan + credential cells for a tenant row. Lazily fetches the REAL tenant
 * overview aggregate and caches it under the same key the detail page uses, so
 * clicking through reuses the cache (no duplicate request). The lean list query
 * stays fast; these enrich each visible row without loading heavy datasets.
 */
function TenantAggregateCells({ tenantId }: { tenantId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["platform", "tenant", tenantId, "overview"],
    queryFn: () => platformApi.tenantOverview(tenantId),
    retry: false,
    staleTime: 60_000,
  });

  return (
    <>
      <Td>
        {isPending ? (
          <Skeleton className="h-5 w-16 rounded-full" />
        ) : data?.plan ? (
          <Badge tone="accent">{data.plan.name}</Badge>
        ) : (
          <span className="text-xs text-slate-400">None</span>
        )}
      </Td>
      <Td align="right" className="tabular-nums text-slate-700">
        {isPending ? (
          <Skeleton className="ml-auto h-4 w-8" />
        ) : data ? (
          <span
            className={cn(data.credentials.expired > 0 && "text-amber-700")}
            title={
              data.credentials.expired > 0
                ? `${data.credentials.expired} expired`
                : `${data.credentials.total} total`
            }
          >
            {data.credentials.active}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </Td>
    </>
  );
}

export function TenantsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const can = useAuthStore((s) => s.can);
  const canCreate = can(PermissionKeys.PlatformTenantCreate);

  const [filter, setFilter] = useState<TenantStatus | "">("");
  const [search, setSearch] = useState("");
  // Debounced search term actually sent to the API (avoids a request per keystroke).
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateTenantBody>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);

  const hasFilters = Boolean(debouncedSearch || filter);

  // Debounce the search box; reset to page 1 whenever the term changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to the first page when the status filter changes.
  useEffect(() => {
    setPage(1);
  }, [filter]);

  const {
    data: tenantPage,
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["platform", "tenants", filter, debouncedSearch, page],
    queryFn: () =>
      platformApi.tenants({
        ...(filter ? { status: filter as TenantStatus } : {}),
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
        page,
      }),
    placeholderData: (prev) => prev,
    retry: false,
  });

  const tenants = tenantPage?.data ?? [];
  const meta = tenantPage?.meta;

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TenantStatus }) =>
      platformApi.setTenantStatus(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform", "tenants"] });
    },
  });

  const createTenant = useMutation({
    mutationFn: (body: CreateTenantBody) => platformApi.createTenant(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform", "tenants"] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setCreateError(null);
    },
    onError: (err) => {
      setCreateError(
        err instanceof ApiError ? err.message : "Failed to create tenant.",
      );
    },
  });

  const onCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    createTenant.mutate(form);
  };

  const field = (key: keyof CreateTenantBody) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  const clearFilters = () => {
    setSearch("");
    setFilter("");
  };

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="Manage the organizations using the platform."
        actions={
          canCreate && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New tenant
            </Button>
          )
        }
      />

      {/* Toolbar — integrated search + status filter + refresh. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tenants…"
              aria-label="Search tenants by name or slug"
              className="pl-9"
            />
          </div>
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as TenantStatus | "")}
            aria-label="Filter tenants by status"
          >
            {STATUS_OPTIONS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4" aria-hidden />
              Clear
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            loading={isFetching && !isPending}
            aria-label="Refresh tenants"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                isFetching && !isPending && "animate-spin",
              )}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Table / states */}
      {isPending ? (
        <TenantTableSkeleton />
      ) : error ? (
        <ErrorState
          icon={AlertTriangle}
          title="Unable to load tenants"
          description="Something went wrong while loading tenant data."
          requestId={error instanceof ApiError ? error.requestId : undefined}
          onRetry={() => void refetch()}
        />
      ) : tenants.length === 0 ? (
        <Card padded={false}>
          {hasFilters ? (
            <EmptyState
              icon={Search}
              title="No tenants found"
              description="Try adjusting your search or filters."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Building2}
              title="No tenants yet"
              description="Create your first tenant to start managing organizations on the platform."
              action={
                canCreate && (
                  <Button onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4" aria-hidden />
                    New tenant
                  </Button>
                )
              }
            />
          )}
        </Card>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Tenant</Th>
              <Th>Status</Th>
              <Th>Plan</Th>
              <Th align="right">Credentials</Th>
              <Th align="right">Users</Th>
              <Th>Created</Th>
              <Th>Updated</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.map((tenant) => {
              const transitions =
                STATUS_TRANSITIONS[tenant.status as TenantStatus] ?? [];
              const allowed = transitions.filter(({ perm }) => can(perm));
              return (
                <tr
                  key={tenant.id}
                  onClick={() => navigate(`/tenants/${tenant.id}`)}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-slate-50/70",
                    setStatus.isPending && "opacity-60",
                  )}
                >
                  <Td>
                    <TenantIdentity tenant={tenant} />
                  </Td>
                  <Td>
                    <StatusBadge status={tenant.status} />
                  </Td>
                  <TenantAggregateCells tenantId={tenant.id} />
                  <Td align="right" className="tabular-nums text-slate-700">
                    {tenant.memberCount}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">
                    {new Date(tenant.updatedAt).toLocaleDateString()}
                  </Td>
                  <Td align="right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <DropdownMenu label={`Actions for ${tenant.name}`}>
                        {(close) => (
                          <>
                            <MenuItem
                              icon={Eye}
                              onClick={() => {
                                close();
                                navigate(`/tenants/${tenant.id}`);
                              }}
                            >
                              View tenant
                            </MenuItem>
                            {allowed.length > 0 && <MenuSeparator />}
                            {allowed.map(({ label, value, tone }) => (
                              <MenuItem
                                key={value}
                                danger={tone === "danger"}
                                icon={
                                  tone === "danger"
                                    ? undefined
                                    : value === "ACTIVE"
                                      ? PlayCircle
                                      : Pencil
                                }
                                disabled={setStatus.isPending}
                                onClick={() => {
                                  close();
                                  setStatus.mutate({
                                    id: tenant.id,
                                    status: value,
                                  });
                                }}
                              >
                                {label}
                              </MenuItem>
                            ))}
                          </>
                        )}
                      </DropdownMenu>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}

      {/* Pagination — backend-authoritative offset paging. */}
      {meta && meta.total > 0 && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          pageSize={meta.pageSize}
          disabled={isFetching}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      )}

      {/* Create tenant dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
        <DialogHeader
          title="Provision new tenant"
          description="Create an organization and its first administrator account."
          onClose={() => setShowCreate(false)}
        />
        <form onSubmit={onCreateSubmit}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Organization name" htmlFor="t-name" required>
                <Input
                  id="t-name"
                  placeholder="Acme Inc"
                  required
                  {...field("name")}
                />
              </Field>
              <Field
                label="Slug"
                htmlFor="t-slug"
                required
                hint="URL-safe identifier, e.g. acme-inc."
              >
                <Input
                  id="t-slug"
                  placeholder="acme-inc"
                  required
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                  {...field("slug")}
                />
              </Field>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Primary administrator
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Admin name" htmlFor="t-admin-name" required>
                  <Input id="t-admin-name" required {...field("adminName")} />
                </Field>
                <Field label="Admin email" htmlFor="t-admin-email" required>
                  <Input
                    id="t-admin-email"
                    type="email"
                    required
                    {...field("adminEmail")}
                  />
                </Field>
                <Field
                  label="Admin password"
                  htmlFor="t-admin-pass"
                  required
                  hint="At least 12 characters."
                  className="sm:col-span-2"
                >
                  <Input
                    id="t-admin-pass"
                    type="password"
                    minLength={12}
                    required
                    {...field("adminPassword")}
                  />
                </Field>
              </div>
            </div>
            {createError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {createError}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                setCreateError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createTenant.isPending}>
              Create tenant
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}

/** Skeleton rows while the first page loads. */
function TenantTableSkeleton() {
  return (
    <DataTable>
      <thead>
        <tr>
          <Th>Tenant</Th>
          <Th>Status</Th>
          <Th>Plan</Th>
          <Th align="right">Credentials</Th>
          <Th align="right">Users</Th>
          <Th>Created</Th>
          <Th>Updated</Th>
          <Th align="right">Actions</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <tr key={i}>
            <Td>
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </Td>
            <Td>
              <Skeleton className="h-5 w-20 rounded-full" />
            </Td>
            <Td>
              <Skeleton className="h-5 w-16 rounded-full" />
            </Td>
            <Td align="right">
              <Skeleton className="ml-auto h-4 w-8" />
            </Td>
            <Td align="right">
              <Skeleton className="ml-auto h-4 w-8" />
            </Td>
            <Td>
              <Skeleton className="h-4 w-20" />
            </Td>
            <Td>
              <Skeleton className="h-4 w-20" />
            </Td>
            <Td align="right">
              <Skeleton className="ml-auto h-8 w-8 rounded-md" />
            </Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Backend-authoritative offset pager with a range summary. */
function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  disabled,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  disabled?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-slate-500">
        Showing <span className="font-medium text-slate-700">{from}</span>–
        <span className="font-medium text-slate-700">{to}</span> of{" "}
        <span className="font-medium text-slate-700">{total}</span> tenant
        {total === 1 ? "" : "s"}
      </p>
      <div className="flex items-center gap-3">
        <Badge tone="neutral">
          Page {page} of {totalPages}
        </Badge>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || page <= 1}
            onClick={onPrev}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || page >= totalPages}
            onClick={onNext}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
