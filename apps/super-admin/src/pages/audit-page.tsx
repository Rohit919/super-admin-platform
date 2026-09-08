import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { platformApi } from "@/modules/platform/platform.api";
import { ApiError } from "@/lib/api-client";
import { Input, Select } from "@/components/ui";

const ACTION_OPTIONS = [
  { label: "All actions", value: "" },
  { label: "Tenant provisioned", value: "TENANT_PROVISIONED" },
  { label: "Tenant suspended", value: "TENANT_SUSPENDED" },
  { label: "Tenant activated", value: "TENANT_ACTIVATED" },
  { label: "Tenant archived", value: "TENANT_ARCHIVED" },
  { label: "Credential created", value: "TENANT_CREDENTIAL_CREATED" },
  { label: "Credential rotated", value: "TENANT_CREDENTIAL_ROTATED" },
  { label: "Credential revoked", value: "TENANT_CREDENTIAL_REVOKED" },
];

/**
 * Platform Audit Logs. Read-only. Backend metadata never contains secrets, so
 * this view cannot leak them. Gated server-side by platform.audit.view — a
 * caller without it gets 403 and we show a clear message.
 */
export function AuditPage() {
  const [action, setAction] = useState("");
  const [tenantId, setTenantId] = useState("");

  const {
    data: logs = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["platform", "audit", action, tenantId],
    queryFn: () =>
      platformApi.auditLogs({
        action: action || undefined,
        tenantId: tenantId || undefined,
      }),
    retry: false,
  });

  if (error) {
    const denied =
      error instanceof ApiError && error.code === "PLATFORM_ACCESS_DENIED";
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="font-medium text-amber-800">
          {denied ? "Not permitted" : "Failed to load audit logs"}
        </p>
        <p className="mt-1 text-sm text-amber-700">
          {denied
            ? "This account lacks the platform.audit.view permission."
            : error instanceof Error
              ? error.message
              : "An unexpected error occurred."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Audit Logs</h1>
        <div className="flex items-center gap-2">
          <Input
            value={tenantId}
            placeholder="Filter by tenant id"
            onChange={(e) => setTenantId(e.target.value)}
            className="text-sm"
          />
          <Select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="text-sm"
          >
            {ACTION_OPTIONS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-500">No audit events found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Tenant</th>
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Target</th>
                <th className="px-4 py-3 text-left">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {log.tenantId ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {log.actorId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {log.targetType ? (
                      <span className="text-xs">
                        {log.targetType}
                        {log.targetId ? ` · ${log.targetId}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {log.metadata ? (
                      <code className="block max-w-xs break-all text-xs text-slate-500">
                        {JSON.stringify(log.metadata)}
                      </code>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
