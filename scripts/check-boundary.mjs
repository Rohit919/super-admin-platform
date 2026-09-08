/**
 * Platform/Logistics boundary guard (Phase 19.11 / §16 / §18).
 *
 * Enforces the non-negotiable guardrails so a future change can't silently
 * reintroduce the removed admin app or leak logistics concerns into the Super
 * Admin control plane:
 *
 *   1. apps/admin must NOT exist (it was removed).
 *   2. No logistics domain modules under the apps source trees.
 *   3. No logistics dependencies in any package.json.
 *   4. No direct Logistics DB access (no logistics Prisma models / clients).
 *
 * Non-destructive and read-only. Exits non-zero (with a clear reason) on any
 * violation so CI blocks the PR. Intentionally dependency-free (plain Node).
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const violations = [];

// Words that indicate logistics/operational domain leaking into the platform.
// Matched case-insensitively as whole-ish tokens in source file paths and in
// dependency names. Kept specific to avoid false positives (e.g. "route" alone
// is too generic, so we require domain-specific compounds).
const LOGISTICS_TOKENS = [
  "shipment",
  "shipments",
  "dispatch",
  "warehouse",
  "proof-of-delivery",
  "waybill",
];

// Directories we never descend into.
const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  "_Reference",
  ".kiro",
]);

// ── 1. apps/admin must be absent ──────────────────────────────────────────────
if (existsSync(join(ROOT, "apps", "admin"))) {
  violations.push(
    "apps/admin exists — the tenant admin app was removed and must not return.",
  );
}

// ── 2/4. Scan app source paths for logistics module names ──────────────────────
function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

const appsDir = join(ROOT, "apps");
if (existsSync(appsDir)) {
  walk(appsDir, (file) => {
    if (!/\.(ts|tsx)$/.test(file)) return;
    const rel = relative(ROOT, file).toLowerCase();
    for (const token of LOGISTICS_TOKENS) {
      // Match the token as a path segment or filename fragment.
      if (rel.includes(token)) {
        violations.push(
          `Logistics module path detected: ${relative(ROOT, file)} (token "${token}")`,
        );
        break;
      }
    }
  });
}

// ── 3. No logistics dependencies in any package.json ───────────────────────────
function checkPackageJson(file) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return;
  }
  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  for (const name of Object.keys(deps)) {
    const lower = name.toLowerCase();
    for (const token of LOGISTICS_TOKENS) {
      if (lower.includes(token)) {
        violations.push(
          `Logistics dependency detected in ${relative(ROOT, file)}: ${name}`,
        );
      }
    }
  }
}

checkPackageJson(join(ROOT, "package.json"));
for (const scope of ["apps", "packages"]) {
  const base = join(ROOT, scope);
  if (!existsSync(base)) continue;
  for (const entry of readdirSync(base)) {
    const pj = join(base, entry, "package.json");
    if (existsSync(pj)) checkPackageJson(pj);
  }
}

// ── 4. Prisma schema must not contain logistics models ─────────────────────────
const schemaPath = join(ROOT, "prisma", "schema.prisma");
if (existsSync(schemaPath)) {
  const schema = readFileSync(schemaPath, "utf8").toLowerCase();
  for (const token of LOGISTICS_TOKENS) {
    if (
      schema.includes(`model ${token}`) ||
      schema.includes(`model ${token}s`)
    ) {
      violations.push(
        `Logistics Prisma model detected in schema.prisma (token "${token}").`,
      );
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────────
if (violations.length > 0) {
  console.error("✖ Platform/Logistics boundary check FAILED:\n");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    "\nThe Super Admin Platform must not contain logistics modules, dependencies, or DB models.",
  );
  process.exit(1);
}

console.log(
  "✓ Boundary check passed: no admin app, no logistics modules/dependencies/DB models.",
);
