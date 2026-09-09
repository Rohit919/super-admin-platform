#!/usr/bin/env node
/**
 * API endpoint drift detection (API_ENDPOINTS §57–§58, API_CONTRACTS §89–§90).
 *
 * Fails CI if application code (apps/**) hardcodes an `/api/v1` PATH in a real
 * API call instead of importing it from the centralized registry
 * (@app/api-contracts). The registry itself and a small set of legitimate
 * infrastructure/documentation exceptions are allowed.
 *
 * This is intentionally a lightweight lexical check — it does not parse TS. It
 * flags string/template literals containing `/api/v1` in non-test source, minus
 * the explicit allowlist below.
 *
 * Usage: node scripts/check-api-drift.mjs
 * Exit:  0 = clean, 1 = drift found.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const SCAN_DIRS = ["apps/platform-api/src"];

// Files/paths where an `/api/v1` literal is legitimate.
const ALLOWED_FILES = new Set(
  [
    // The refresh-token cookie Path attribute (a Set-Cookie value, not an API call).
    "apps/platform-api/src/modules/auth/auth.routes.ts",
    // The API-index catalog route intentionally documents the bare prefix.
    "apps/platform-api/src/modules/api-index/api-index.routes.ts",
  ].map((p) => path.normalize(p)),
);

const NEEDLE = "/api/v1";

function isSourceFile(file) {
  return (
    /\.(ts|tsx)$/.test(file) &&
    !/\.(test|spec)\.(ts|tsx)$/.test(file) &&
    !file.includes("__tests__")
  );
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...(await walk(full)));
    } else if (isSourceFile(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Strip line + block comments so we only flag `/api/v1` in real code. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "")) // line comments
    .join("\n");
}

async function main() {
  const violations = [];

  for (const rel of SCAN_DIRS) {
    const files = await walk(path.join(root, rel));
    for (const file of files) {
      const relFile = path.normalize(path.relative(root, file));
      if (ALLOWED_FILES.has(relFile)) continue;

      const raw = await fs.readFile(file, "utf8");
      const code = stripComments(raw);
      if (!code.includes(NEEDLE)) continue;

      const lines = code.split("\n");
      lines.forEach((line, i) => {
        if (line.includes(NEEDLE)) {
          violations.push({ file: relFile, line: i + 1, text: line.trim() });
        }
      });
    }
  }

  if (violations.length === 0) {
    console.log(
      "✓ API drift check passed — no hardcoded /api/v1 paths in application code.",
    );
    process.exit(0);
  }

  console.error("✗ API drift detected — hardcoded /api/v1 paths found.");
  console.error(
    "  Import paths from @app/api-contracts (API_ENDPOINTS / API_CONTRACTS) instead.\n",
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  console.error(
    "\nIf a match is a legitimate exception (infra value, docs), add the file to ALLOWED_FILES in scripts/check-api-drift.mjs.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("check-api-drift failed to run:", err);
  process.exit(1);
});
