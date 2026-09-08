import { HttpMethod } from "./http.js";
import type { ApiEndpoint } from "./endpoint.js";
import { ADMIN_ENDPOINTS } from "../endpoints/admin.js";
import { ErrorCode } from "../common.js";
import { PermissionKeys } from "../rbac.js";
import { DashboardStatsResponse } from "../dashboard.js";

/**
 * Dashboard endpoint contract (Level 2). Aggregated admin metrics, gated by the
 * `metrics.read` permission (granted to ADMIN/SUPER_ADMIN by the seed).
 */
export const DASHBOARD_CONTRACTS = {
  STATS: {
    method: HttpMethod.GET,
    path: ADMIN_ENDPOINTS.DASHBOARD,
    auth: "required",
    permission: PermissionKeys.MetricsRead,
    response: { 200: DashboardStatsResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN],
    operationId: "admin.dashboard",
    summary: "Aggregated dashboard metrics",
    tags: ["Admin"],
  },
} satisfies Record<string, ApiEndpoint>;
