# White-Label Asset Management

## Storage model

Tenant assets (logo, dark logo, icon, favicon) should live in object storage or
a CDN, **not** in the Admin source tree. Avoid `src/assets/customer-a/` — that
defeats the single-build goal. Branding stores only the resulting URLs.

```
Object Storage / CDN  ──►  public (or signed) URL  ──►  AppBranding.{logo,icon,favicon}  ──►  Admin
```

For the single-tenant default, same-origin relative paths (e.g. `/brand/logo.svg`
served by the API/host) are also fine.

## URLs

Asset fields accept:

- Absolute **https** URLs (e.g. a CDN), or
- Same-origin **relative** paths starting with `/`.

Everything else — `http:` (mixed content), `javascript:`, `data:`,
protocol-relative `//` — is rejected by `isSafeAssetUrl()` and falls back.

## File formats

- **Logo / dark logo**: SVG preferred (crisp at any size); PNG acceptable.
- **Icon**: square SVG or PNG.
- **Favicon**: SVG, PNG, or ICO. Type is derived from the extension.

## Size recommendations

| Asset     | Suggested            | Notes                                  |
| --------- | -------------------- | -------------------------------------- |
| Logo      | ~160×32 (SVG scales) | Rendered up to `max-w-[160px]`, `h-6`  |
| Dark logo | matches logo         | Used when resolved theme is dark       |
| Icon      | 32×32 / 64×64        | Compact square, transparent background |
| Favicon   | 32×32 (or SVG)       | Transparent background                 |

Keep payloads small; prefer transparent backgrounds so marks sit on any surface.

## Security

- Assets are referenced by URL only; branding is never rendered as HTML.
- SVGs are used as `<img src>` (not inlined), so embedded scripts do not execute.
- Only https / same-origin relative URLs are allowed.

## Caching

Serve assets with long cache headers from the CDN/storage. The branding document
itself is cached for 5 minutes (`Cache-Control`) and last-good in localStorage.

## Broken asset fallback

`<AppLogo>` and `<AppIcon>` handle image `onError` and degrade: dark logo →
light logo → icon → default `Zap` glyph. The interface never shows a broken
image.

## Future upload flow

A Settings → Branding editor could upload assets to storage and PATCH the tenant
config with the returned URLs. Enforce type/size/dimension limits server-side and
re-validate URLs before persisting.
