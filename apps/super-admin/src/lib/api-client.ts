import { config } from "@/config";
import { useAuthStore } from "@/stores/auth.store";
import {
  buildPath,
  API_ENDPOINTS,
  type ApiEndpoint,
  type ErrorEnvelope,
} from "@app/api-contracts";

/**
 * Central HTTP client for the Super Admin app. Same conventions as the tenant
 * Admin client, EXCEPT it never sends an X-Tenant-Id header — platform
 * operations are cross-tenant and have no active tenant.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly requestId?: string,
    public readonly code: string = "INTERNAL_ERROR",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  anonymous?: boolean;
  timeoutMs?: number;
  _isRetry?: boolean;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("Request timed out", 0, undefined, "TIMEOUT");
    }
    throw new ApiError(
      err instanceof Error ? err.message : "Network request failed",
      0,
      undefined,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timer);
  }
}

function buildHeaders(anonymous: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (!anonymous) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function parseError(res: Response, json: unknown): Promise<ApiError> {
  const err = json as ErrorEnvelope | null;
  return new ApiError(
    err?.error?.message ?? `Request failed (${res.status})`,
    res.status,
    err?.error?.requestId,
    err?.error?.code ?? (res.status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR"),
  );
}

// Single-flight refresh shared across concurrent 401s.
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetchWithTimeout(
        `${config.apiBaseUrl}${API_ENDPOINTS.AUTH.REFRESH}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        },
        config.apiTimeoutMs,
      );
      if (!res.ok) return false;
      const json = (await res.json().catch(() => null)) as {
        success: true;
        data: { accessToken: string };
      } | null;
      const accessToken = json?.data?.accessToken;
      if (!accessToken) return false;
      useAuthStore.getState().setAccessToken(accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function handleSessionExpired(): void {
  useAuthStore.getState().clearSession();
  if (
    typeof window !== "undefined" &&
    !window.location.pathname.startsWith("/login")
  ) {
    window.location.assign("/login");
  }
}

async function rawRequest<TBody>(
  path: string,
  options: RequestOptions = {},
): Promise<TBody> {
  const {
    method = "GET",
    body,
    anonymous = false,
    _isRetry = false,
    timeoutMs,
  } = options;

  const res = await fetchWithTimeout(
    `${config.apiBaseUrl}${path}`,
    {
      method,
      headers: buildHeaders(anonymous),
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
    },
    timeoutMs ?? config.apiTimeoutMs,
  );

  const json = (await res.json().catch(() => null)) as unknown;
  if (res.ok) return json as TBody;

  if (res.status === 401 && !anonymous && !_isRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed)
      return rawRequest<TBody>(path, { ...options, _isRetry: true });
    handleSessionExpired();
  }

  throw await parseError(res, json);
}

async function request<TData>(
  path: string,
  options: RequestOptions = {},
): Promise<TData> {
  const envelope = await rawRequest<{ success?: boolean; data: TData }>(
    path,
    options,
  );
  return envelope.data;
}

export interface ContractRequestArgs {
  params?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

function requestContract<TResponse>(
  endpoint: ApiEndpoint,
  args: ContractRequestArgs = {},
): Promise<TResponse> {
  let path = buildPath(endpoint, args.params ?? {});
  if (args.query) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(args.query)) {
      if (value !== undefined && value !== "")
        search.append(key, String(value));
    }
    const qs = search.toString();
    if (qs) path += `?${qs}`;
  }
  return rawRequest<TResponse>(path, {
    method: endpoint.method,
    body: args.body,
    anonymous: endpoint.auth === "public",
  });
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, anonymous = false) =>
    request<T>(path, { method: "POST", body, anonymous }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),
  raw: rawRequest,
  request: requestContract,
};
