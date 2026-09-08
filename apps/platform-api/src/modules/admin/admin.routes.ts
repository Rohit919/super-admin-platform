import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { PermissionKeys, DASHBOARD_CONTRACTS } from "@app/api-contracts";
import { requirePermission } from "@core/authorization/index.js";

const SIGNUP_WINDOW_DAYS = 7;

/** YYYY-MM-DD (UTC) for a date. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Admin-only diagnostics + aggregated dashboard metrics. Protected by JWT auth +
 * the metrics.read permission (granted to ADMIN/SUPER_ADMIN by the seed).
 */
const adminRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // ── GET /admin/dashboard ─────────────────────────────────────────────────────
  // Real aggregated metrics for the admin overview: entity totals, the most
  // recent users, and a trailing new-users-per-day series. Read-only (no audit).
  fastify.get(
    "/dashboard",
    {
      preValidation: [fastify.authenticate],
      preHandler: [requirePermission(DASHBOARD_CONTRACTS.STATS.permission!)],
      schema: {
        summary: DASHBOARD_CONTRACTS.STATS.summary,
        tags: DASHBOARD_CONTRACTS.STATS.tags,
        operationId: DASHBOARD_CONTRACTS.STATS.operationId,
        security: [{ bearerAuth: [] }],
        response: DASHBOARD_CONTRACTS.STATS.response,
      },
    },
    async (_request, reply) => {
      const since = new Date(
        Date.now() - SIGNUP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      since.setUTCHours(0, 0, 0, 0);

      const [users, roles, permissions, recentUsers, windowUsers] =
        await Promise.all([
          fastify.prisma.user.count(),
          fastify.prisma.role.count(),
          fastify.prisma.permission.count(),
          fastify.prisma.user.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
            },
          }),
          fastify.prisma.user.findMany({
            where: { createdAt: { gte: since } },
            select: { createdAt: true },
          }),
        ]);

      // Bucket new users per UTC day across the trailing window (fill gaps → 0).
      const counts = new Map<string, number>();
      for (const u of windowUsers) {
        const key = dayKey(u.createdAt);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const signups: { date: string; count: number }[] = [];
      for (let i = SIGNUP_WINDOW_DAYS - 1; i >= 0; i--) {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - i);
        const key = dayKey(d);
        signups.push({ date: key, count: counts.get(key) ?? 0 });
      }

      return reply.send({
        data: {
          totals: { users, roles, permissions },
          recentUsers: recentUsers.map((u) => ({
            ...u,
            createdAt: u.createdAt.toISOString(),
          })),
          signups,
        },
      });
    },
  );

  // ── GET /admin/db-metrics ────────────────────────────────────────────────────
  // Prisma client metrics: connection pool gauges + query counters. Useful for
  // spotting pool exhaustion and query-volume regressions.
  fastify.get(
    "/db-metrics",
    {
      preValidation: [fastify.authenticate],
      preHandler: [requirePermission(PermissionKeys.MetricsRead)],
      schema: {
        description: "Prisma client metrics (admin only)",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({
            success: Type.Literal(true),
            data: Type.Unknown(),
          }),
        },
      },
    },
    async (_request, reply) => {
      // $metrics is enabled by previewFeatures = ["metrics"] in schema.prisma.
      const metrics = await (
        fastify.prisma as unknown as {
          $metrics: { json: () => Promise<unknown> };
        }
      ).$metrics.json();
      return reply.send({ success: true, data: metrics });
    },
  );
};

export default adminRoutes;
