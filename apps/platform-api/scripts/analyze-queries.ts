/**
 * Reports the top queries from pg_stat_statements — by total time and by call
 * count — to surface slow queries and N+1 patterns in dev/staging.
 *
 * Usage: tsx apps/api/scripts/analyze-queries.ts
 * Requires the pg_stat_statements extension (enabled in docker/init.sql).
 */
import { PrismaClient } from "@prisma/client";

interface StatRow {
  query: string;
  calls: bigint;
  total_exec_time: number;
  mean_exec_time: number;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const byTotal = await prisma.$queryRawUnsafe<StatRow[]>(`
      SELECT query, calls, total_exec_time, mean_exec_time
      FROM pg_stat_statements
      ORDER BY total_exec_time DESC
      LIMIT 10
    `);

    const byCalls = await prisma.$queryRawUnsafe<StatRow[]>(`
      SELECT query, calls, total_exec_time, mean_exec_time
      FROM pg_stat_statements
      ORDER BY calls DESC
      LIMIT 10
    `);

    const fmt = (rows: StatRow[]) =>
      rows.map((r, i) => {
        const q = r.query.replace(/\s+/g, " ").slice(0, 90);
        return `${String(i + 1).padStart(2)}. calls=${r.calls} mean=${r.mean_exec_time.toFixed(2)}ms total=${r.total_exec_time.toFixed(0)}ms\n    ${q}`;
      });

    console.log("\n=== Top 10 queries by TOTAL time ===");
    console.log(fmt(byTotal).join("\n"));
    console.log("\n=== Top 10 queries by CALL count (N+1 suspects) ===");
    console.log(fmt(byCalls).join("\n"));
  } catch (err) {
    console.error(
      "Failed to read pg_stat_statements. Is the extension enabled and shared_preload_libraries set?",
      err,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
