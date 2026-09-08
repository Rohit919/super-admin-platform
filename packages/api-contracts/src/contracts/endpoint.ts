import type { TSchema } from "@sinclair/typebox";
import type { HttpMethod } from "./http.js";
import { ErrorCode, ErrorEnvelope } from "../common.js";

/**
 * Stable error code → HTTP status (ERROR_HANDLING §6). Used to turn a
 * contract's `errors: ErrorCode[]` list into documented Swagger error
 * responses so the OpenAPI spec reflects every failure an endpoint can return.
 */
const ERROR_CODE_STATUS: Record<string, number> = {
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.INTERNAL_ERROR]: 500,
  // Auth-specific
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.ACCOUNT_LOCKED]: 429,
  [ErrorCode.TOKEN_MISSING]: 401,
  [ErrorCode.TOKEN_INVALID]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.TOKEN_REVOKED]: 401,
  [ErrorCode.OTP_INVALID]: 400,
  [ErrorCode.OTP_EXPIRED]: 400,
  // Multi-tenancy
  [ErrorCode.TENANT_REQUIRED]: 400,
  [ErrorCode.TENANT_NOT_FOUND]: 404,
  [ErrorCode.TENANT_ACCESS_DENIED]: 403,
  [ErrorCode.TENANT_SUSPENDED]: 403,
  [ErrorCode.TENANT_MEMBERSHIP_INACTIVE]: 403,
  // Platform
  [ErrorCode.PLATFORM_ACCESS_DENIED]: 403,
};

/**
 * A complete, framework-neutral endpoint contract (API_CONTRACTS §22–§23).
 *
 * One object bundles everything the API boundary needs: method, path, auth
 * requirement, permission metadata, request/response schemas, stable error
 * codes, and OpenAPI metadata. The Fastify API, the Admin client, and tests
 * all consume the SAME object so the contract is defined exactly once.
 *
 * This describes WHAT the API looks like — never HOW it is implemented.
 * `auth`/`permission` are descriptive metadata; runtime enforcement stays in
 * the API (API_CONTRACTS §19, §67–§69).
 */
export interface ApiEndpoint {
  method: HttpMethod;
  /** Absolute path incl. the /api/v1 prefix. Uses Fastify `:param` syntax. */
  path: string;

  auth: "public" | "required";
  /** Required permission key (stable). Descriptive — the API still enforces it. */
  permission?: string;

  params?: TSchema;
  query?: TSchema;
  body?: TSchema;

  /** Response schemas keyed by HTTP status code. */
  response?: Record<number, TSchema>;

  /** Stable error codes this endpoint may return. */
  errors?: readonly string[];

  // ── OpenAPI / observability metadata ──────────────────────────────────────
  /** Stable operation id (e.g. "users.list") — for OpenAPI, metrics, tracing. */
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: readonly string[];
  deprecated?: boolean;
}

/**
 * Fastify `schema` object derived from a contract. Only includes the keys
 * Fastify understands (params/querystring/body/response) plus doc metadata.
 */
export interface FastifyRouteSchema {
  params?: TSchema;
  querystring?: TSchema;
  body?: TSchema;
  response?: Record<number, TSchema>;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: readonly string[];
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

/**
 * Build a Fastify route `schema` from an endpoint contract.
 *
 * Adds bearer-auth security metadata for `auth: 'required'` endpoints so
 * Swagger reflects the requirement. Note Fastify uses `querystring`, while the
 * contract uses `query`.
 */
export interface ToFastifySchemaOptions {
  /**
   * Omit the request-body schema. Use for endpoints whose contract declares a
   * (typically empty) body for documentation/typing, but whose runtime input
   * comes from elsewhere — e.g. cookie-based refresh/logout. Enforcing an empty
   * object body would 400 legitimate bodiless POSTs.
   */
  omitBody?: boolean;
}

export function toFastifySchema(
  endpoint: ApiEndpoint,
  options: ToFastifySchemaOptions = {},
): FastifyRouteSchema {
  const schema: FastifyRouteSchema = {};
  if (endpoint.params) schema.params = endpoint.params;
  if (endpoint.query) schema.querystring = endpoint.query;
  if (endpoint.body && !options.omitBody) schema.body = endpoint.body;

  // Merge success responses with documented error responses derived from the
  // contract's `errors` list (ERROR_HANDLING §58). Every error uses the shared
  // ErrorEnvelope, so the OpenAPI doc shows the canonical shape per status.
  const response: Record<number, TSchema> = { ...(endpoint.response ?? {}) };
  if (endpoint.errors) {
    for (const code of endpoint.errors) {
      const status = ERROR_CODE_STATUS[code];
      // Don't clobber an explicit response schema already set for this status.
      if (status && !(status in response)) response[status] = ErrorEnvelope;
    }
  }
  if (Object.keys(response).length) schema.response = response;

  if (endpoint.operationId) schema.operationId = endpoint.operationId;
  if (endpoint.summary) schema.summary = endpoint.summary;
  if (endpoint.description) schema.description = endpoint.description;
  if (endpoint.tags) schema.tags = endpoint.tags;
  if (endpoint.deprecated) schema.deprecated = endpoint.deprecated;
  if (endpoint.auth === "required") schema.security = [{ bearerAuth: [] }];
  return schema;
}

/**
 * Resolve a contract path into a concrete URL by substituting `:param`
 * segments with encoded values. Extra params are ignored; missing ones throw.
 */
export function buildPath(
  endpoint: ApiEndpoint,
  params: Record<string, string> = {},
): string {
  return endpoint.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(
        `Missing path parameter "${name}" for ${endpoint.method} ${endpoint.path}`,
      );
    }
    return encodeURIComponent(value);
  });
}
