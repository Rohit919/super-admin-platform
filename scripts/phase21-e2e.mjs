#!/usr/bin/env node
/**
 * Phase 21 — live two-server end-to-end verification.
 *
 * Exercises the REAL S2S path against a running Tenant API (Fastify-Master):
 *   Platform operator → (this script simulates the Platform's TenantPlatformClient)
 *   → HTTPS + S2S bearer → Tenant API /internal/platform/* → Tenant DB
 *
 * It verifies the functional flow AND the security cases. It talks to the
 * TENANT API directly using the same headers the Platform sends, so it does not
 * require the Platform API to be running — but it proves the tenant contract the
 * Platform depends on. (A full UI-through-Platform check is a manual step noted
 * at the end.)
 *
 * USAGE:
 *   TENANT_API_BASE_URL=https://tenant.example.com \
 *   PLATFORM_S2S_SECRET=<secret> \
 *   PLATFORM_TENANT_ID=<tenantId> \
 *   node scripts/phase21-e2e.mjs
 *
 * Exit code 0 = all checks passed; non-zero = a check failed.
 */

const BASE = (process.env.TENANT_API_BASE_URL || "").replace(/\/+$/, "");
const SECRET = process.env.PLATFORM_S2S_SECRET || "";
const TENANT = process.env.PLATFORM_TENANT_ID || "";

if (!BASE || !SECRET || !TENANT) {
  console.error(
    "Missing env. Required: TENANT_API_BASE_URL, PLATFORM_S2S_SECRET, PLATFORM_TENANT_ID",
  );
  process.exit(2);
}

const H = {
  HEALTH: "/api/v1/internal/platform/health",
  RUNTIME: "/api/v1/internal/platform/runtime",
  BRANDING: "/api/v1/internal/platform/branding",
  PUBLIC_BRANDING: "/api/v1/branding",
};

let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.error(`  \u2717 ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(
  path,
  { method = "GET", secret = SECRET, tenant = TENANT, body, requestId } = {},
) {
  const headers = { accept: "application/json" };
  if (secret !== null) headers.authorization = `Bearer ${secret}`;
  if (tenant !== null) headers["x-platform-tenant-id"] = tenant;
  if (requestId) headers["x-request-id"] = requestId;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json, text };
}

async function main() {
  console.log(`Phase 21 E2E → ${BASE} (tenant=${TENANT})\n`);

  console.log("Security cases:");
  ok(
    "missing secret → 401",
    (await call(H.HEALTH, { secret: null })).status === 401,
  );
  ok(
    "wrong secret → 401",
    (
      await call(H.HEALTH, {
        secret: "wrong-secret-value-of-sufficient-length-xx",
      })
    ).status === 401,
  );
  ok(
    "wrong tenant id → 403",
    (await call(H.RUNTIME, { tenant: "definitely-not-this-tenant" })).status ===
      403,
  );

  console.log("\nFunctional flow:");
  const health = await call(H.HEALTH);
  ok(
    "health → 200 { status: ok }",
    health.status === 200 && health.json?.data?.status === "ok",
  );

  const runtime = await call(H.RUNTIME, { requestId: "e2e-req-1" });
  ok("runtime → 200", runtime.status === 200);
  ok("runtime tenantId matches", runtime.json?.data?.tenantId === TENANT);
  ok("runtime carries no secret", !runtime.text.includes(SECRET));

  const before = await call(H.BRANDING);
  ok(
    "get branding → 200",
    before.status === 200 && !!before.json?.data?.appName,
  );

  const marker = `E2E ${new Date().toISOString().slice(11, 19)}`;
  const upd = await call(H.BRANDING, {
    method: "PUT",
    body: { appName: marker },
  });
  ok(
    "update branding (partial) → 200",
    upd.status === 200 && upd.json?.data?.appName === marker,
  );
  ok(
    "partial update preserved shortName",
    upd.json?.data?.shortName === before.json?.data?.shortName,
  );

  const invalid = await call(H.BRANDING, {
    method: "PUT",
    body: { appName: "x".repeat(500) },
  });
  ok("invalid branding → 400", invalid.status === 400);

  const pub = await call(H.PUBLIC_BRANDING, { secret: null, tenant: null });
  ok(
    "public GET /branding reflects persisted update",
    pub.status === 200 && pub.json?.data?.appName === marker,
  );

  // Restore original appName so repeated runs are idempotent.
  await call(H.BRANDING, {
    method: "PUT",
    body: { appName: before.json?.data?.appName },
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nManual follow-up (through the Platform + UI): log into Super Admin, open\n" +
      "Tenant Control Center → Branding, change a field, confirm it persists and\n" +
      "the tenant Admin renders it via GET /api/v1/branding.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E run failed:", err);
  process.exit(1);
});
