# White-Label Runtime Configuration

## Why runtime, not env

`VITE_*` env vars are baked at build time — changing them means a rebuild. For
multi-tenant branding we fetch the config at runtime instead, so one build
serves any tenant. Env vars remain fine for API URL, timeouts, and single-tenant
default branding on the backend.

## Bootstrap

1. **Pre-React** (`index.html`): a tiny script applies last-good cached branding
   (title + `--primary`) before first paint to avoid a default-brand flash.
2. **Provider seed**: `BrandingProvider` seeds from `localStorage['admin-branding']`
   or `DEFAULT_BRANDING`, then applies CSS vars/title/favicon.
3. **Fetch**: `fetchBranding()` → `GET /api/v1/branding` → validate → apply → cache.

## API contract

Defined in `packages/api-contracts`:

- Path: `BRANDING_ENDPOINTS.GET = /api/v1/branding`
- Contract: `BRANDING_CONTRACTS.GET` (`auth: 'public'`, response `AppBrandingResponse`)
- Response envelope: `{ data: AppBranding }`

Example response:

```json
{
  "data": {
    "appName": "Acme Logistics",
    "shortName": "Acme",
    "logo": "/assets/acme/logo.svg",
    "logoDark": "/assets/acme/logo-dark.svg",
    "favicon": "/assets/acme/favicon.svg",
    "colors": { "primary": "#2563EB", "accent": "#F59E0B" }
  }
}
```

## Validation

The response is untrusted external data. `validateBranding()` sanitizes it:
required-field fallback, string length caps, color normalization, and asset-URL
safety checks. Invalid pieces fall back to defaults; the app never crashes.

## Caching

- Client: `localStorage['admin-branding']` (last-good), applied instantly next load.
- HTTP: backend sends `Cache-Control: public, max-age=300`.
- Invalidation: `useBranding().refresh()` re-fetches (e.g. after an admin edit).
- No polling.

## Tenant resolution (backend)

The backend is authoritative. This reference implementation is single-tenant and
reads `BRAND_*` env vars in `apps/api/src/modules/branding/branding.routes.ts`.
To go multi-tenant, resolve the tenant in that route from:

- Subdomain / custom domain (host header), or
- The authenticated session's tenant, or
- A request header set by an upstream proxy.

Pick the mechanism the deployment supports. The contract and Admin client are
unchanged.

## Runtime updates

Update the tenant's branding on the backend, then call `refresh()` (or reload).
The provider re-applies CSS variables, title, and favicon without a full reload.

## Failure handling

Any fetch/parse error returns `DEFAULT_BRANDING` and sets `isFallback = true`.
The Admin stays fully usable — branding is non-critical metadata. If tenant
identity is security-critical for your deployment, enforce that in the backend
session/authorization layer, not in the branding fetch.

## Loading behavior

`useBranding().isLoading` is `true` until the first fetch settles. Because the
provider seeds from cache/defaults synchronously, the UI is always branded —
`isLoading` is for optional indicators, not for gating render.
