import { Type, type Static } from "@sinclair/typebox";
import { DataEnvelope } from "./common.js";
import { UserListItem } from "./users.js";

/**
 * Dashboard metrics — shared between the API and the admin. Aggregated,
 * read-only figures for the admin overview. All counts come from real data;
 * `signups` is a per-day new-user series for the trailing window.
 */
export const DashboardSignupPoint = Type.Object({
  /** ISO date (YYYY-MM-DD) for the bucket. */
  date: Type.String(),
  count: Type.Integer({ minimum: 0 }),
});
export type DashboardSignupPoint = Static<typeof DashboardSignupPoint>;

export const DashboardStats = Type.Object({
  totals: Type.Object({
    users: Type.Integer({ minimum: 0 }),
    roles: Type.Integer({ minimum: 0 }),
    permissions: Type.Integer({ minimum: 0 }),
  }),
  /** Most-recently-created users (trimmed list-item shape). */
  recentUsers: Type.Array(UserListItem),
  /** New users per day for the trailing window (oldest → newest). */
  signups: Type.Array(DashboardSignupPoint),
});
export type DashboardStats = Static<typeof DashboardStats>;

/** Canonical single-resource envelope: `{ data: DashboardStats }`. */
export const DashboardStatsResponse = DataEnvelope(DashboardStats);
export type DashboardStatsResponse = Static<typeof DashboardStatsResponse>;
