# White-Label Architecture

## Purpose

Let a single compiled Admin frontend serve many customers/tenants with distinct
branding (name, logo, colors, favicon) without a per-customer build. Branding is
applied at **runtime** from a trusted backend source.

## Goals

- One Admin build → many tenant brandings.
- One source of truth for branding, layered onto the existing theme system.
- Runtime configuration (no rebuild for normal branding changes).
- Safe fallback so branding failures never take the Admin down.
- Preserve the existing Admin (auth, RBAC, routing, API client, i18n, themes).

## Non-Goals

- Multi-tenant business logic, billing, provisioning, tenant switching UI.
- A white-label marketing site.
- Arbitrary CSS/HTML/JS injection from tenant config (explicitly forbidden).

## Architecture

```
Fastify API  ──►  GET /api/v1/branding  ──►  api-contracts (TypeBox schema)
                                                     │
                                                     ▼
                                          Admin api-client (apiClient.request)
                                                     │
                                                     ▼
                                    branding.api → validateBranding (untrusted!)
                                                     │
                                                     ▼
                                            BrandingProvider (context)
                          ┌──────────────────────────┼──────────────────────────┐
                          ▼                           ▼                           ▼
                    Identity (name)            Theme (CSS vars)             Assets (logo/icon/favicon)
                          │                           │                           │
                          └──────────────────────────┼──────────────────────────┘
                                                     ▼
                                    Admin UI (login, sidebar, header, pages)
```

## Data Flow

1. `index.html` runs a tiny pre-React script that applies the **last-good cached**
   branding (title + primary CSS var) to avoid a flash of the default brand.
2. React mounts. `BrandingProvider` seeds state from the localStorage cache (or
   `DEFAULT_BRANDING`) and immediately applies CSS variables, `document.title`,
   and favicon.
3. `fetchBranding()` calls the contract-driven `GET /api/v1/branding`, validates
   the response, updates state, re-applies to the DOM, and caches it.
4. On any failure, `DEFAULT_BRANDING` remains and `isFallback` is `true`.

## Branding Model

Owned by the shared contract `packages/api-contracts/src/branding.ts`
(`AppBranding`). See WHITE-LABEL-BRANDING.md. Only `appName`, `shortName`, and
`colors.primary` are required; everything else is optional and falls back.

## Tenant Model

The frontend never decides the tenant. The backend resolves it (host/subdomain
or authenticated session) and returns that tenant's branding. This reference
implementation is single-tenant (env-driven). See WHITE-LABEL-RUNTIME-CONFIG.md.

## Frontend / Backend Responsibilities

| Concern                                 | Owner                                        |
| --------------------------------------- | -------------------------------------------- |
| Which tenant                            | Backend (authoritative)                      |
| Branding values                         | Backend                                      |
| Validation of untrusted values          | Frontend (defense in depth) + backend schema |
| Applying CSS vars / title / favicon     | Frontend (`branding.utils`)                  |
| User preferences (theme mode, language) | Frontend (separate from branding)            |

## Security Boundaries

- Branding is treated as **plain text**; never rendered as HTML, never `dangerouslySetInnerHTML`.
- Asset URLs must be https or same-origin relative paths — `javascript:`/`data:`/`http:` are rejected.
- Colors are normalized/validated; unparseable values fall back.
- Only a whitelist of CSS variables is ever set from branding.
- Tenant identity comes from the backend, never from browser-supplied input.

## Fallback Strategy

`DEFAULT_BRANDING` mirrors the current project brand. It is used on API failure,
invalid/partial config, or before the runtime fetch resolves.

## Caching

Last-good branding is cached in `localStorage['admin-branding']` for instant
next-load application. The backend sends `Cache-Control: public, max-age=300`.
`useBranding().refresh()` forces a re-fetch (e.g. after an admin edit).

## Future Extensibility

- Multi-tenant resolution in the branding route.
- A Settings → Branding editor writing back to the tenant config.
- Asset uploads to object storage; branding stores the resulting URLs.
