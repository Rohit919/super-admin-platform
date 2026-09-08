/**
 * Generate the endpoint error matrix (ERROR_HANDLING §59) from the contract
 * registry — the single source of truth. Run after changing any contract:
 *
 *   node packages/api-contracts/scripts/gen-error-matrix.mjs
 *
 * Prints a Markdown table to stdout (status columns × endpoint rows). The
 * documented statuses come from toFastifySchema(endpoint).response, so the
 * table always matches what the API actually serves.
 */
import { API_CONTRACTS, toFastifySchema } from "../dist/index.js";

// Error status columns to display, in ascending order.
const STATUS_COLUMNS = [400, 401, 403, 404, 409, 429, 500, 503];

/** Flatten API_CONTRACTS into [group, name, endpoint] rows. */
function collectEndpoints() {
  const rows = [];
  for (const [group, registry] of Object.entries(API_CONTRACTS)) {
    for (const [name, endpoint] of Object.entries(registry)) {
      rows.push({ group, name, endpoint });
    }
  }
  return rows;
}

function documentedStatuses(endpoint) {
  const schema = toFastifySchema(endpoint);
  return new Set(Object.keys(schema.response ?? {}).map(Number));
}

function render() {
  const rows = collectEndpoints();

  const header = `| Endpoint | Method | Auth | ${STATUS_COLUMNS.join(" | ")} |`;
  const divider = `|---|---|---|${STATUS_COLUMNS.map(() => ":-:").join("|")}|`;

  const lines = [header, divider];
  for (const { endpoint } of rows) {
    const statuses = documentedStatuses(endpoint);
    const cells = STATUS_COLUMNS.map((s) => (statuses.has(s) ? "✓" : "·"));
    const method = endpoint.method;
    const auth = endpoint.auth === "required" ? "🔒" : "—";
    lines.push(
      `| \`${endpoint.path}\` | ${method} | ${auth} | ${cells.join(" | ")} |`,
    );
  }
  return lines.join("\n");
}

process.stdout.write(render() + "\n");
