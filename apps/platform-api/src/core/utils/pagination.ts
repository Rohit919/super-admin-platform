import { PAGINATION_DEFAULTS } from "@app/api-contracts";

/**
 * Server-side pagination helpers (API_CONVENTIONS §12–§14).
 *
 * The route schema (shared PaginationQuery contract) already validates and
 * coerces page/pageSize via ajv. These helpers apply the documented defaults,
 * clamp to the safe range, and translate page/pageSize into Prisma
 * `skip`/`take`, plus build the response `meta`.
 */

export interface NormalizedPage {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface OffsetPageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Apply defaults and clamp to [1, MAX]. Never trusts unbounded values even if
 * validation is bypassed (defence in depth — API_CONVENTIONS §13).
 */
export function normalizePagination(input?: {
  page?: number;
  pageSize?: number;
}): NormalizedPage {
  const page = Math.max(1, Math.trunc(input?.page ?? PAGINATION_DEFAULTS.page));
  const requested = Math.trunc(input?.pageSize ?? PAGINATION_DEFAULTS.pageSize);
  const pageSize = Math.min(
    PAGINATION_DEFAULTS.maxPageSize,
    Math.max(PAGINATION_DEFAULTS.minPageSize, requested),
  );

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Build the canonical offset pagination `meta`. */
export function buildPageMeta(
  page: number,
  pageSize: number,
  total: number,
): OffsetPageMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

// ── Cursor pagination ────────────────────────────────────────────────────────

export interface NormalizedCursor<C = string> {
  limit: number;
  cursor?: C;
}

/**
 * Encode/decode opaque cursors as base64url. Callers decide the payload shape
 * (e.g. `{ id, createdAt }`). Keep the payload minimal and stable — it is part
 * of the API contract once emitted.
 */
export function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor<T = Record<string, unknown>>(
  cursor?: string,
): T | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

export function normalizeCursor(input?: {
  limit?: number;
  cursor?: string;
}): NormalizedCursor {
  const requested = Math.trunc(input?.limit ?? PAGINATION_DEFAULTS.pageSize);
  const limit = Math.min(
    PAGINATION_DEFAULTS.maxPageSize,
    Math.max(PAGINATION_DEFAULTS.minPageSize, requested),
  );
  return { limit, cursor: input?.cursor };
}
