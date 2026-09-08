# White-Label Testing

## Unit

### Branding validation / utils (`branding.utils.ts`)

- `normalizeColor`: hex `#2563EB`, `rgb(37,99,235)`, `hsl(217,91%,53%)`, and
  bare `217 91% 53%` all normalize to an `H S% L%` triplet; garbage → `null`.
- `validateBranding`: partial config fills from defaults; invalid color falls
  back to default primary; unsafe asset URLs are dropped; length caps applied.
- `isSafeAssetUrl`: `/logo.svg` ✓, `https://cdn/x.svg` ✓, `http://…` ✗,
  `javascript:alert(1)` ✗, `data:…` ✗, `//evil` ✗.
- `getReadableForeground`: light background → dark foreground and vice versa.
- `updateFavicon`: creates one `<link id="app-favicon">`, replaces on re-call,
  no-ops on unsafe URLs.
- `updateDocumentTitle`: `"Page · App"` with a page label, `"App"` without.

### Provider / hook

- `BrandingProvider` seeds from cache then applies defaults when fetch fails
  (`isFallback === true`).
- `useBranding` throws outside the provider.
- `refresh()` triggers a re-fetch.

### Components

- `<AppName>` / `<AppName short>` render app/short name.
- `<AppLogo>` renders `logo`, switches to `logoDark` in dark theme, falls back to
  `<AppIcon>` when absent or on `onError`.
- `<AppIcon>` renders `icon` or the default glyph; falls back on `onError`.

## Theme

- Setting `colors.primary` updates `--primary`/`--ring`/`--sidebar-accent`.
- Branding works in light, dark, and system modes; dark logo is selected in dark.
- User dark-mode toggle does not mutate branding.

## Runtime

- Config loads → tenant branding applied.
- Config fails → default branding, app usable.
- Invalid/partial config → sanitized, no crash.
- Cached branding applied on next load (no flash).

## Security

- Invalid/unsafe URLs rejected (see `isSafeAssetUrl` cases).
- Malicious text is rendered as plain text (no HTML execution).
- SVG used via `<img src>` (no inline script execution).
- Tenant isolation: backend returns only the resolved tenant's branding.

## UX / integration

- Login (auth layout): logo, name, primary color, title.
- Sidebar: icon + name (expanded/collapsed, desktop/mobile).
- Header: consumes centralized branding.
- Error pages / loading: use theme tokens (inherit brand color).

## End-to-end scenarios

1. API returns Acme → Acme branding appears.
2. API fails → default branding appears.
3. Branding changes → CSS vars + UI update after `refresh()`.
4. Dark mode → dark logo + dark theme with brand color.
5. Invalid logo URL → fallback logo/icon.

## Backend

- `GET /api/v1/branding` returns `{ data: AppBranding }` matching the schema.
- Response carries `Cache-Control: public, max-age=300`.
- Endpoint is public (no auth required).

## Running

```
# api-contracts
cd packages/api-contracts && npm run build

# admin
cd apps/admin && npm run typecheck && npm run lint && npm run test && npm run build

# api
cd apps/api && npm run typecheck && npm run test
```
