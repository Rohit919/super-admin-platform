# Branding Integration (Phase 21)

How white-label branding flows from the Super Admin Platform to a Tenant runtime
and back to the Tenant Admin, and where the source of truth lives.

## Flow

```
        SUPER ADMIN — Tenant Control Center › Branding
                        │  PATCH (partial)
                        ▼
        PLATFORM API  /api/v1/platform/tenants/:id/branding
                        │  authenticate + platform.tenant.update + audit
                        ▼
        TenantPlatformClient  ── HTTPS + S2S bearer ──►
                        ▼
        TENANT API  PUT /api/v1/internal/platform/branding
                        │  S2S auth + platform.branding.write scope
                        │  tenant-identity validation + re-validation
                        ▼
        TenantBranding row (persisted, table tenant_branding)
                        │
                        ▼
        TENANT ADMIN  GET /api/v1/branding  ──►  applies branding
```

## Source of truth

The **Tenant runtime is the persisted owner** of branding. The Super Admin
Platform _manages_ it through the Platform → Tenant API boundary, but the
authoritative persisted record is the tenant's `TenantBranding` row. There is
**no** duplicate branding store on the Platform side.

```
Super Admin  ──manages──►  Platform API  ──synchronizes──►  Tenant branding state  ──serves──►  Tenant Admin
```

## The wire shape

Branding uses the shared `AppBranding` contract on both sides (identical
definition), so the applications cannot drift:

```
appName    (required, ≤80)
shortName  (required, ≤24)
colors     { primary (required), secondary?, accent? }   // hex | rgb() | hsl() | "H S% L%"
logo? logoDark? icon? favicon?                            // https URL or /relative path
metadata?  { description? (≤280), companyName? (≤120) }
```

Updates are **partial**: only supplied top-level fields change. `colors` and
`metadata`, when supplied, replace that whole sub-object (not deep-merged).

## Fallback — `DEFAULT_BRANDING` preserved

The tenant's public `GET /api/v1/branding` resolves in this order:

```
GET /api/v1/branding
   │
   ├─ persisted TenantBranding row exists AND valid ──► serve it
   │
   └─ absent / invalid / store error ──► env BRAND_* (brandingFromEnv)
                                          which mirrors DEFAULT_BRANDING
```

`DEFAULT_BRANDING` (in `apps/admin/src/branding/branding.config.ts`) remains the
Admin's client-side fallback and was not removed. The backend fallback
(`brandingFromEnv`, sourced from `BRAND_*`) keeps the app fully usable when no
branding has been synchronized and even if the persisted read fails. Branding is
presentation data, never an authorization boundary.

## Validation (both sides)

- **Platform** validates the request body at the contract boundary
  (`UpdateTenantBrandingBody`).
- **Tenant** re-validates every write in `BrandingStore` — Platform validation
  is never trusted alone. It caps string lengths, drops unsafe asset URLs
  (only `https:` or `/relative` accepted; `javascript:`/`data:`/`http:` rejected),
  and checks the merged document against the `AppBranding` schema before
  persisting. Invalid payloads are rejected with `400 VALIDATION_ERROR`.

## Caching

The public branding response keeps `Cache-Control: public, max-age=300`, and the
Admin client caches the last valid branding in `localStorage`. Stale branding is
never a security boundary — it is only presentation/config.

## Storage

No file storage was introduced. Branding remains text/colors/metadata plus asset
**URL references**, matching the existing implementation. Logo/favicon are stored
as URL strings, not uploaded binaries. If binary asset hosting is needed later,
it is a separate design (deferred).

## Frontend

The Super Admin branding panel lives in the Tenant Control Center
(`apps/super-admin/src/pages/tenant-detail-page.tsx`, the **Branding** tab). It
calls `platformApi.tenantBranding` / `updateTenantBranding` / `tenantConnection`
through the central API client and shared contracts — no hardcoded URLs in
components. Editing is gated on `platform.tenant.update`; viewing on
`platform.tenant.view`.
