/**
 * Super Admin runtime config. Mirrors the tenant Admin's config so both apps
 * behave the same against the shared API. In dev, /api is proxied to :3000; the
 * versioned /api/v1 prefix comes from the shared endpoint registry.
 */
function readTimeout(): number {
  const raw = import.meta.env.VITE_API_TIMEOUT_MS as string | undefined;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

export const config = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "",
  apiTimeoutMs: readTimeout(),
} as const;
