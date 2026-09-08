import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { platformApi } from "@/modules/platform/platform.api";
import { useAuthStore } from "@/stores/auth.store";
import { PermissionKeys, type TenantStatus } from "@app/api-contracts";
import type { CreateTenantBody } from "@app/api-contracts";
import { ApiError } from "@/lib/api-client";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  StatusBadge,
} from "@/components/ui";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: Array<{ label: string; value: TenantStatus | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Trial", value: "TRIAL" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Archived", value: "ARCHIVED" },
];

const STATUS_TRANSITIONS: Record<
  TenantStatus,
  Array<{ label: string; value: TenantStatus; perm: string }>
> = {
  TRIAL: [
    {
      label: "Activate",
      value: "ACTIVE",
      // Backend gates ALL status transitions on platform.tenant.suspend
      // (see /platform/tenants/:id/status). Match it so the UI gate is
      // consistent with the authoritative check.
      perm: PermissionKeys.PlatformTenantSuspend,
    },
    {
      label: "Suspend",
      value: "SUSPENDED",
      perm: PermissionKeys.PlatformTenantSuspend,
    },
  ],
  ACTIVE: [
    {
      label: "Suspend",
      value: "SUSPENDED",
      perm: PermissionKeys.PlatformTenantSuspend,
    },
    {
      label: "Archive",
      value: "ARCHIVED",
      perm: PermissionKeys.PlatformTenantArchive,
    },
  ],
  SUSPENDED: [
    {
      label: "Reactivate",
      value: "ACTIVE",
      perm: PermissionKeys.PlatformTenantSuspend,
    },
    {
      label: "Archive",
      value: "ARCHIVED",
      perm: PermissionKeys.PlatformTenantArchive,
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

export function TenantsPage() {
  const qc = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const canCreate = can(PermissionKeys.PlatformTenantCreate);

  const [filter, setFilter] = useState<TenantStatus | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateTenantBody>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);

  const { data: tenants = [], isPending } = useQuery({
    queryKey: ["platform", "tenants", filter],
    queryFn: () =>
      platformApi.tenants((filter as TenantStatus | undefined) || undefined),
  });

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

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Tenants</h1>
        <div className="flex items-center gap-2">
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as TenantStatus | "")}
            className="text-sm"
          >
            {STATUS_OPTIONS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {canCreate && (
            <Button onClick={() => setShowCreate((v) => !v)}>
              <Plus className="h-4 w-4" />
              New tenant
            </Button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium text-slate-900">
            Provision new tenant
          </h2>
          <form
            onSubmit={onCreateSubmit}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <Field label="Organization name">
              <Input placeholder="Acme Inc" required {...field("name")} />
            </Field>
            <Field label="Slug (URL-safe)">
              <Input
                placeholder="acme-inc"
                required
                pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                {...field("slug")}
              />
            </Field>
            <Field label="Admin email">
              <Input type="email" required {...field("adminEmail")} />
            </Field>
            <Field label="Admin name">
              <Input required {...field("adminName")} />
            </Field>
            <Field label="Admin password">
              <Input
                type="password"
                minLength={12}
                required
                {...field("adminPassword")}
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={createTenant.isPending}>
                {createTenant.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  "Create tenant"
                )}
              </Button>
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
            </div>
            {createError && (
              <p className="col-span-full text-sm text-red-600">
                {createError}
              </p>
            )}
          </form>
        </Card>
      )}

      {/* Tenants table */}
      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : tenants.length === 0 ? (
        <p className="text-sm text-slate-500">No tenants found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Slug</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Members</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((tenant) => {
                const transitions =
                  STATUS_TRANSITIONS[tenant.status as TenantStatus] ?? [];
                return (
                  <tr
                    key={tenant.id}
                    className={cn(
                      "hover:bg-slate-50",
                      setStatus.isPending && "opacity-60",
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        to={`/tenants/${tenant.id}`}
                        className="hover:underline"
                      >
                        {tenant.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {tenant.slug}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={tenant.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {tenant.memberCount}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {transitions
                          .filter(({ perm }) => can(perm))
                          .map(({ label, value }) => (
                            <button
                              key={value}
                              type="button"
                              disabled={setStatus.isPending}
                              onClick={() =>
                                setStatus.mutate({
                                  id: tenant.id,
                                  status: value,
                                })
                              }
                              className="rounded px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                            >
                              {label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
