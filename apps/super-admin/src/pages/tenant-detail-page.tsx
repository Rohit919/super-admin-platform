import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  KeyRound,
  RefreshCw,
  Plus,
  Copy,
  Check,
  ScrollText,
} from "lucide-react";
import {
  platformApi,
  type CreatedCredential,
} from "@/modules/platform/platform.api";
import { useAuthStore } from "@/stores/auth.store";
import { PermissionKeys, type TenantStatus } from "@app/api-contracts";
import { ApiError } from "@/lib/api-client";
import { Button, Card, Field, Input, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/utils";

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

/**
 * One-time secret banner. The plaintext secret is shown ONCE after create/rotate
 * and is NEVER persisted (no localStorage/sessionStorage/store). It lives only in
 * component state until dismissed.
 */
function SecretBanner({
  credential,
  onDismiss,
}: {
  credential: CreatedCredential;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="font-medium text-amber-900">
        Copy this secret now — it is shown only once and cannot be retrieved
        again.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-sm text-slate-800">
          {credential.secretKey}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(credential.secretKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-amber-800">
        Public key: <span className="font-mono">{credential.publicKey}</span>
      </p>
      <Button type="button" className="mt-3" onClick={onDismiss}>
        I've stored it — dismiss
      </Button>
    </div>
  );
}

function CredentialsPanel({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const canRead = can(PermissionKeys.PlatformCredentialRead);
  const canCreate = can(PermissionKeys.PlatformCredentialCreate);
  const canRotate = can(PermissionKeys.PlatformCredentialRotate);
  const canRevoke = can(PermissionKeys.PlatformCredentialRevoke);

  // The one-time secret lives ONLY in state — never written to storage.
  const [revealed, setRevealed] = useState<CreatedCredential | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const key = ["platform", "credentials", tenantId];
  const { data: creds = [], isPending } = useQuery({
    queryKey: key,
    queryFn: () => platformApi.listCredentials(tenantId),
    enabled: canRead,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () =>
      platformApi.createCredential(tenantId, name ? { name } : {}),
    onSuccess: (cred) => {
      setRevealed(cred);
      setName("");
      setError(null);
      void invalidate();
    },
    onError: (e) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to create credential.",
      ),
  });

  const rotate = useMutation({
    mutationFn: (id: string) => platformApi.rotateCredential(tenantId, id),
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
    mutationFn: (id: string) => platformApi.revokeCredential(tenantId, id),
    onSuccess: () => void invalidate(),
    onError: (e) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to revoke credential.",
      ),
  });

  if (!canRead) {
    return (
      <Card>
        <h2 className="font-medium text-slate-900">API Credentials</h2>
        <p className="mt-1 text-sm text-slate-500">
          You do not have permission to view credentials.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-medium text-slate-900">
          <KeyRound className="h-4 w-4" /> API Credentials
        </h2>
      </div>

      {revealed && (
        <SecretBanner
          credential={revealed}
          onDismiss={() => setRevealed(null)}
        />
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {canCreate && (
        <div className="mb-4 flex items-end gap-2">
          <Field label="New credential label (optional)">
            <Input
              value={name}
              placeholder="e.g. CI integration"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create
          </Button>
        </div>
      )}

      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : creds.length === 0 ? (
        <p className="text-sm text-slate-500">No credentials yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Public key</th>
                <th className="px-4 py-2 text-left">Label</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {creds.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs text-slate-700">
                    {c.publicKey}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{c.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {c.status === "ACTIVE" && canRotate && (
                        <button
                          type="button"
                          disabled={rotate.isPending}
                          onClick={() => rotate.mutate(c.id)}
                          className="rounded px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Rotate
                        </button>
                      )}
                      {c.status === "ACTIVE" && canRevoke && (
                        <button
                          type="button"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(c.id)}
                          className="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * Lifecycle & audit history for a single tenant. Sourced from the existing
 * platform audit endpoint filtered by tenantId — no new backend needed. Gated
 * on platform.audit.view; the panel is simply hidden without it (the API also
 * enforces it).
 */
function TenantAuditPanel({ tenantId }: { tenantId: string }) {
  const { data: logs = [], isPending } = useQuery({
    queryKey: ["platform", "tenant", tenantId, "audit"],
    queryFn: () => platformApi.auditLogs({ tenantId, limit: 20 }),
    retry: false,
  });

  return (
    <Card>
      <h2 className="mb-3 flex items-center gap-2 font-medium text-slate-900">
        <ScrollText className="h-4 w-4" /> Lifecycle &amp; Audit
      </h2>
      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-500">
          No recorded events for this tenant yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {logs.map((log) => (
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
  );
}

/**
 * Plan & entitlements panel (Phase 19.6). Shows the tenant's active plan and
 * effective entitlements (plan value or per-tenant override). Operators with
 * platform.plan.manage can assign a plan. Read gated on platform.entitlement.view.
 */
function PlanPanel({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const canManage = can(PermissionKeys.PlatformPlanManage);

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
    onSuccess: () => void qc.invalidateQueries({ queryKey: entKey }),
  });

  return (
    <Card>
      <h2 className="mb-3 font-medium text-slate-900">
        Plan &amp; Entitlements
      </h2>

      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !data ? (
        <p className="text-sm text-slate-500">Unavailable.</p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-3">
            <span className="text-sm text-slate-500">Active plan:</span>
            <span className="text-sm font-medium text-slate-900">
              {data.plan ? data.plan.name : "None"}
            </span>
          </div>

          {canManage && plans.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <Field label="Assign plan">
                <select
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  defaultValue={data.plan?.key ?? ""}
                  disabled={assign.isPending}
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
              </Field>
            </div>
          )}

          {data.entitlements.length === 0 ? (
            <p className="text-sm text-slate-500">
              No entitlements — assign a plan to grant capabilities.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Entitlement</th>
                    <th className="px-4 py-2 text-left">Value</th>
                    <th className="px-4 py-2 text-left">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.entitlements.map((e) => (
                    <tr key={e.key} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700">
                        {e.name}
                        <span className="ml-2 font-mono text-xs text-slate-400">
                          {e.key}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-800">
                        {e.value}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            e.source === "OVERRIDE"
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {e.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function TenantDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const can = useAuthStore((s) => s.can);
  // Pending confirmation for a high-risk status transition. Null = none.
  const [pending, setPending] = useState<{
    label: string;
    value: TenantStatus;
  } | null>(null);

  const {
    data: tenant,
    isPending,
    error,
  } = useQuery({
    queryKey: ["platform", "tenant", id],
    queryFn: () => platformApi.tenant(id),
    retry: false,
  });

  const setStatus = useMutation({
    mutationFn: (status: TenantStatus) =>
      platformApi.setTenantStatus(id, status),
    onSuccess: () => {
      setPending(null);
      void qc.invalidateQueries({ queryKey: ["platform", "tenant", id] });
      void qc.invalidateQueries({ queryKey: ["platform", "tenants"] });
      void qc.invalidateQueries({
        queryKey: ["platform", "tenant", id, "audit"],
      });
    },
  });

  if (isPending) return <p className="text-sm text-slate-500">Loading…</p>;

  if (error || !tenant) {
    const denied =
      error instanceof ApiError && error.code === "PLATFORM_ACCESS_DENIED";
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="font-medium text-amber-800">
          {denied ? "Not a platform account" : "Failed to load tenant"}
        </p>
        <p className="mt-1 text-sm text-amber-700">
          {error instanceof Error ? error.message : "Tenant not found."}
        </p>
        <Link to="/tenants" className="mt-2 inline-block text-sm underline">
          Back to tenants
        </Link>
      </div>
    );
  }

  const transitions = STATUS_TRANSITIONS[tenant.status as TenantStatus] ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/tenants"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Tenants
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">{tenant.name}</h1>
        <p className="font-mono text-sm text-slate-500">{tenant.slug}</p>
      </div>

      {/* Overview + Status */}
      <Card>
        <h2 className="mb-4 font-medium text-slate-900">Overview</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="mt-1">
              <StatusBadge status={tenant.status} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Members</dt>
            <dd className="mt-1 tabular-nums text-slate-900">
              {tenant.memberCount}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Created</dt>
            <dd className="mt-1 text-slate-900">
              {new Date(tenant.createdAt).toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Updated</dt>
            <dd className="mt-1 text-slate-900">
              {new Date(tenant.updatedAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>

        {transitions.length > 0 && (
          <div className="mt-5 border-t pt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">
              Status actions
            </p>

            {pending ? (
              // Explicit confirmation for a high-risk lifecycle change. Archive
              // is irreversible; suspend disrupts a live tenant — so no status
              // change fires without a deliberate confirm.
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm text-amber-900">
                  {pending.value === "ARCHIVED"
                    ? `Archive "${tenant.name}"? This is permanent and cannot be undone.`
                    : `Change "${tenant.name}" to ${pending.value}?`}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant={
                      pending.value === "ARCHIVED" ? "danger" : "primary"
                    }
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate(pending.value)}
                  >
                    {setStatus.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : null}
                    Confirm {pending.label}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={setStatus.isPending}
                    onClick={() => setPending(null)}
                  >
                    Cancel
                  </Button>
                </div>
                {setStatus.error && (
                  <p className="mt-2 text-sm text-red-600">
                    {setStatus.error instanceof Error
                      ? setStatus.error.message
                      : "Failed to change status."}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {transitions
                  .filter(({ perm }) => can(perm))
                  .map(({ label, value }) => (
                    <Button
                      key={value}
                      type="button"
                      variant="outline"
                      onClick={() => setPending({ label, value })}
                    >
                      {label}
                    </Button>
                  ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Plan & entitlements */}
      {can(PermissionKeys.PlatformEntitlementView) && (
        <PlanPanel tenantId={id} />
      )}

      {/* Lifecycle & audit history (existing audit endpoint, tenant-scoped) */}
      {can(PermissionKeys.PlatformAuditView) && (
        <TenantAuditPanel tenantId={id} />
      )}

      {/* Credentials */}
      <CredentialsPanel tenantId={id} />
    </div>
  );
}
