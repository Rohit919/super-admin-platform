# White-Label Branding

## The branding model

Defined once in `packages/api-contracts/src/branding.ts` and consumed by both
the API and the Admin (`AppBranding`):

```ts
interface AppBranding {
  appName: string; // required, ≤ 80 chars
  shortName: string; // required, ≤ 24 chars
  logo?: string; // asset URL/path
  logoDark?: string; // asset URL/path (dark theme)
  icon?: string; // compact mark
  favicon?: string; // browser tab icon
  colors: {
    primary: string; // required
    secondary?: string;
    accent?: string;
  };
  metadata?: {
    description?: string; // used as the auth tagline
    companyName?: string;
  };
}
```

Only `appName`, `shortName`, and `colors.primary` are required. Everything else
falls back to `DEFAULT_BRANDING`.

## Fields

- **appName** — full name; browser title, sidebar, auth panels.
- **shortName** — compact name for tight surfaces (collapsed sidebar).
- **logo / logoDark** — full brand image; `logoDark` is auto-selected in dark theme.
- **icon** — compact square mark for chips, mobile nav, loading.
- **favicon** — tab icon (png/svg/ico).
- **colors** — brand colors normalized to the CSS-variable HSL triplet.
- **metadata.description** — shown as the login tagline.
- **metadata.companyName** — available for footers/about.

## Branding components (`@/branding`)

- `<AppName />` / `<AppName short />` — renders the (short) app name as plain text.
- `<AppLogo />` — full logo; picks `logoDark` in dark theme; falls back to `<AppIcon />`.
- `<AppIcon />` — compact mark; falls back to the default `Zap` glyph.
- `<DocumentTitle title="Users" />` — sets `"<page> · <appName>"`, restores on unmount.
- `<FaviconManager />` — keeps the favicon in sync (also handled by the provider).

All image components handle load errors and degrade gracefully — no broken images.

## Branding hook

```ts
const { branding, appName, shortName, colors, isLoading, isFallback, refresh } =
  useBranding();
```

Always returns fully-resolved, safe values (defaults until runtime config loads),
so callers never null-check.

## Branding provider

`BrandingProvider` (in `apps/admin/src/app/providers/index.tsx`) sits inside
`ThemeProvider` and above the app. It seeds from cache, applies to the DOM, and
fetches the authoritative config. It is the ONE place branding is owned.

## Fallback branding

`DEFAULT_BRANDING` (`apps/admin/src/branding/branding.config.ts`) mirrors the
current project brand (name "Admin · Logistics", indigo primary `243 75% 59%`).

## Hardcoded branding removal

Replaced hardcoded references with centralized components/config:

| Location                        | Before                                                                             | After                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `layouts/auth/auth-layout.tsx`  | `Zap` icon ×2, `t('common:appName')` ×3, literal `"Logistics Admin"` + description | `<AppIcon>`, `<AppName>`, `branding.metadata.description` tagline |
| `components/layout/sidebar.tsx` | `Zap` icon, `t('common:appName')`                                                  | `<AppIcon>`, `<AppName>`                                          |
| `index.html`                    | static `<title>`                                                                   | static `<title>` + pre-React branding bootstrap                   |
| colors                          | hardcoded only in `globals.css`                                                    | `globals.css` defaults + runtime override via CSS vars            |

Business/domain terms that merely contain the app name are intentionally left alone.
