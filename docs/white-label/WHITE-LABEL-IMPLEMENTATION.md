# White-Label Implementation Plan

This documents the implementation, organized in phases. Phases 1–6 and 8 are
implemented; 7 (multi-tenant resolution), 9 (settings editor), and 11 hardening
are architected for but not fully built (single-tenant reference).

After each phase: `typecheck → lint → test → build` must pass.

---

## Phase 1 — Branding model

- **Objective**: One typed branding model shared by API + Admin.
- **Files**: `packages/api-contracts/src/branding.ts`, `endpoints/branding.ts`,
  `contracts/branding.ts`; barrels in `src/index.ts`, `endpoints/index.ts`,
  `contracts/index.ts`.
- **Changes**: `AppBranding` TypeBox schema + `AppBrandingResponse` envelope;
  `BRANDING_ENDPOINTS.GET`; `BRANDING_CONTRACTS.GET` (public).
- **Acceptance**: `@app/api-contracts` builds; types importable from both apps.
- **Risks**: contract drift — mitigated by single definition.
- **Rollback**: remove the three files + barrel entries.

## Phase 2 — Branding provider

- **Objective**: Central runtime source of truth + `useBranding()`.
- **Files**: `apps/admin/src/branding/` (`branding.types|constants|config|utils|api|provider`, `index.ts`).
- **Changes**: `BrandingProvider` seeds cache/default, applies DOM, fetches, validates.
- **Acceptance**: `useBranding()` returns resolved values; app renders branded.
- **Risks**: provider ordering — placed inside `ThemeProvider`.
- **Rollback**: remove the module + provider wiring.

## Phase 3 — Dynamic app name

- **Objective**: Name/title driven by branding.
- **Files**: `branding/components/app-name.tsx`, `document-title.tsx`; consumers.
- **Changes**: `<AppName>`, `updateDocumentTitle`, pre-React title bootstrap.
- **Acceptance**: sidebar/auth/title show the tenant name.

## Phase 4 — Dynamic logos / icons

- **Objective**: Logo/icon components with dark-variant + fallback.
- **Files**: `branding/components/app-logo.tsx`, `app-icon.tsx`.
- **Changes**: theme-aware selection, `onError` fallback to `Zap`.
- **Acceptance**: configured logo renders; missing/broken degrades cleanly.

## Phase 5 — Dynamic favicon

- **Objective**: Runtime favicon.
- **Files**: `branding/components/favicon-manager.tsx`, `updateFavicon` in utils.
- **Changes**: owns a single `<link id="app-favicon">`, type by extension.
- **Acceptance**: favicon updates when branding provides one; unsafe URLs ignored.

## Phase 6 — Dynamic colors

- **Objective**: Brand colors via existing CSS variables.
- **Files**: `branding.utils.ts` (`normalizeColor`, `applyThemeVariables`), `branding.constants.ts`.
- **Changes**: override `--primary`/`--ring`/`--sidebar-accent` (+secondary/accent),
  derive readable foregrounds.
- **Acceptance**: primary color changes propagate to buttons/nav/focus rings in light + dark.
- **Risks**: contrast — mitigated by `getReadableForeground`.

## Phase 7 — Runtime configuration (multi-tenant)

- **Objective**: Resolve branding per tenant server-side.
- **Files**: `apps/api/src/modules/branding/branding.routes.ts`.
- **Status**: single-tenant env-driven now; resolution seam documented.
- **Acceptance (future)**: different hosts/sessions return different branding.

## Phase 8 — Backend / API contract

- **Objective**: Public branding endpoint.
- **Files**: `branding.routes.ts`, `config/env.ts` (`BRAND_*`), `app.ts`, `test-app.ts`.
- **Changes**: `GET /api/v1/branding` returns `{ data }`, `Cache-Control: 300`.
- **Acceptance**: endpoint returns valid `AppBranding`; api typecheck passes.

## Phase 9 — Settings integration (future)

- **Objective**: Settings → Branding editor with live preview.
- **Notes**: gate behind existing authorization; PATCH tenant config; call `refresh()`.

## Phase 10 — Testing

- **Files**: unit tests for utils/provider; see WHITE-LABEL-TESTING.md.

## Phase 11 — Production hardening (future)

- Rate-limit/cache the endpoint at the edge; asset CDN; contrast auditing;
  tenant isolation tests.

---

## Environment variables (backend defaults)

`BRAND_APP_NAME`, `BRAND_SHORT_NAME`, `BRAND_COLOR_PRIMARY` (defaults set), plus
optional `BRAND_LOGO`, `BRAND_LOGO_DARK`, `BRAND_ICON`, `BRAND_FAVICON`,
`BRAND_COLOR_SECONDARY`, `BRAND_COLOR_ACCENT`, `BRAND_COMPANY_NAME`,
`BRAND_DESCRIPTION`. These seed the single-tenant default; multi-tenant
deployments resolve per tenant instead.
