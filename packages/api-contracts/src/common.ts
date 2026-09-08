import { Type, type Static, type TSchema } from "@sinclair/typebox";

/**
 * Shared response envelopes and error contracts used across all modules.
 *
 * Both the API (Fastify response schemas) and the admin (response typing)
 * import from here so the contract can never drift (API_CONVENTIONS §20, §59).
 *
 * ── Canonical envelopes (API_CONVENTIONS §9–§14, §39) ──────────────────────
 *   Single resource : { data: T }
 *   Collection       : { data: T[], meta: { ...pagination } }
 *   Error            : { error: { code, message, requestId, details? } }
 *
 * Clients branch on error.code (stable), never on error.message.
 */

// ── Stable, machine-readable error codes ────────────────────────────────────
// Mirror of apps/api core ErrorCode. Kept here so the Admin/consumers can
// branch on codes without importing server code.
export const ErrorCode = {
  // Generic
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // Authentication-specific (API_CONTRACTS §17)
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  TOKEN_MISSING: "TOKEN_MISSING",
  TOKEN_INVALID: "TOKEN_INVALID",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_REVOKED: "TOKEN_REVOKED",
  OTP_INVALID: "OTP_INVALID",
  OTP_EXPIRED: "OTP_EXPIRED",

  // Multi-tenancy (MULTI-TENANT-ARCHITECTURE §50). Mirror of the server codes.
  TENANT_REQUIRED: "TENANT_REQUIRED",
  TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
  TENANT_ACCESS_DENIED: "TENANT_ACCESS_DENIED",
  TENANT_SUSPENDED: "TENANT_SUSPENDED",
  TENANT_MEMBERSHIP_INACTIVE: "TENANT_MEMBERSHIP_INACTIVE",

  // Platform (Super Admin) layer.
  PLATFORM_ACCESS_DENIED: "PLATFORM_ACCESS_DENIED",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── Error envelope ───────────────────────────────────────────────────────────
export const ApiError = Type.Object({
  /** Stable machine-readable code — clients branch on this, not the message. */
  code: Type.Optional(
    Type.String({ description: "Stable machine-readable error code" }),
  ),
  message: Type.String({
    description: "Human-readable message (may change over time)",
  }),
  /** HTTP status echoed in the body for convenience. */
  statusCode: Type.Optional(Type.Number()),
  requestId: Type.Optional(
    Type.String({ description: "Correlates with server logs" }),
  ),
  details: Type.Optional(Type.Unknown()),
  timestamp: Type.Optional(Type.String({ format: "date-time" })),
  path: Type.Optional(Type.String()),
  /** Present on 429 responses. */
  retryAfter: Type.Optional(Type.Number()),
});
export type ApiError = Static<typeof ApiError>;

export const ErrorEnvelope = Type.Object({
  success: Type.Optional(Type.Literal(false)),
  error: ApiError,
});
export type ErrorEnvelope = Static<typeof ErrorEnvelope>;

/** Field-level validation detail (API_CONVENTIONS §40). */
export const ValidationErrorDetails = Type.Object({
  fields: Type.Record(Type.String(), Type.String()),
});
export type ValidationErrorDetails = Static<typeof ValidationErrorDetails>;

// ── Pagination meta ──────────────────────────────────────────────────────────
/** Offset/page pagination defaults (API_CONVENTIONS §12). */
export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 25,
  minPageSize: 1,
  maxPageSize: 100,
} as const;

/** Offset pagination metadata returned on collections. */
export const OffsetPageMeta = Type.Object({
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1 }),
  total: Type.Integer({ minimum: 0 }),
  totalPages: Type.Integer({ minimum: 0 }),
});
export type OffsetPageMeta = Static<typeof OffsetPageMeta>;

/** Cursor pagination metadata for large datasets / feeds (API_CONVENTIONS §14). */
export const CursorPageMeta = Type.Object({
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});
export type CursorPageMeta = Static<typeof CursorPageMeta>;

// ── Query contracts ──────────────────────────────────────────────────────────
/** Standard offset pagination query params. Coerced/validated by Fastify+ajv. */
export const PaginationQuery = Type.Object({
  page: Type.Optional(
    Type.Integer({
      minimum: 1,
      default: PAGINATION_DEFAULTS.page,
      description: "Page number (1-based)",
    }),
  ),
  pageSize: Type.Optional(
    Type.Integer({
      minimum: PAGINATION_DEFAULTS.minPageSize,
      maximum: PAGINATION_DEFAULTS.maxPageSize,
      default: PAGINATION_DEFAULTS.pageSize,
      description: "Items per page (1–100)",
    }),
  ),
});
export type PaginationQuery = Static<typeof PaginationQuery>;

/** Standard cursor pagination query params. */
export const CursorQuery = Type.Object({
  limit: Type.Optional(
    Type.Integer({
      minimum: PAGINATION_DEFAULTS.minPageSize,
      maximum: PAGINATION_DEFAULTS.maxPageSize,
      default: PAGINATION_DEFAULTS.pageSize,
    }),
  ),
  cursor: Type.Optional(Type.String()),
});
export type CursorQuery = Static<typeof CursorQuery>;

/** Standard sort query params. Modules should further constrain `sortBy`. */
export const SortQuery = Type.Object({
  sortBy: Type.Optional(Type.String()),
  sortOrder: Type.Optional(
    Type.Union([Type.Literal("asc"), Type.Literal("desc")], {
      default: "desc",
    }),
  ),
});
export type SortQuery = Static<typeof SortQuery>;

// ── Envelope builders ────────────────────────────────────────────────────────
/** Wrap a schema in the canonical single-resource envelope: `{ data }`. */
export function DataEnvelope<T extends TSchema>(data: T) {
  return Type.Object({ data });
}

/** Wrap a schema in the canonical collection envelope: `{ data: T[], meta }`. */
export function PaginatedEnvelope<T extends TSchema>(item: T) {
  return Type.Object({
    data: Type.Array(item),
    meta: OffsetPageMeta,
  });
}

/** Wrap a schema in the canonical cursor collection envelope: `{ data: T[], meta }`. */
export function CursorEnvelope<T extends TSchema>(item: T) {
  return Type.Object({
    data: Type.Array(item),
    meta: CursorPageMeta,
  });
}

// ── Legacy helpers (deprecated) ──────────────────────────────────────────────
/**
 * @deprecated Legacy `{ success: true, data }` envelope. New endpoints should
 * use {@link DataEnvelope}/{@link PaginatedEnvelope}. Kept while existing
 * modules migrate to the canonical `{ data, meta }` shape.
 */
export function SuccessEnvelope<T extends ReturnType<typeof Type.Object>>(
  data: T,
) {
  return Type.Object({
    success: Type.Literal(true),
    data,
  });
}

// ── Shared enums ─────────────────────────────────────────────────────────────
export const UserRole = Type.Union([
  Type.Literal("admin"),
  Type.Literal("support"),
  Type.Literal("viewer"),
  Type.Literal("user"),
]);
export type UserRole = Static<typeof UserRole>;
