# White-Label Theming

## One theme system

White-labeling does **not** introduce a second theme system. It overrides the
existing shadcn/ui CSS variables at runtime. Everything downstream (Tailwind
tokens, shadcn components) inherits automatically.

## Color tokens & CSS variables

Tokens live in `apps/admin/src/styles/globals.css` as HSL triplets, e.g.
`--primary: 243 75% 59%`. Tailwind (`tailwind.config.ts`) maps them via
`hsl(var(--x))`. `.dark` on `<html>` flips the palette.

Branding overrides a whitelist of variables (`branding.constants.ts`):

| Brand color | CSS variables set                         |
| ----------- | ----------------------------------------- |
| `primary`   | `--primary`, `--ring`, `--sidebar-accent` |
| `secondary` | `--secondary`                             |
| `accent`    | `--accent`                                |

Plus derived `--primary-foreground` / `--sidebar-accent-foreground` for contrast.

## Normalization

Any input color (hex `#2563EB`, `rgb(...)`, `hsl(...)`, or bare `H S% L%`) is
normalized to the CSS-variable triplet by `normalizeColor()` in
`branding.utils.ts`. Defaults and runtime values pass through the same function,
so the applied format is always identical. Unparseable colors fall back.

## Light / dark / system

The `ThemeProvider` owns light/dark/system (user preference), persisted to
`localStorage['admin-theme']`. Branding sets the base `:root` variables; the
`.dark` overrides in `globals.css` still apply. Brand and appearance are
independent: a tenant's blue brand + a user's dark mode = blue-in-dark.

## Contrast & accessibility

`getReadableForeground()` picks black or white foreground for the brand color
using its lightness, so button/nav text stays readable regardless of the tenant
color. This is a pragmatic heuristic — verify tenant palettes against WCAG for
production (see WHITE-LABEL-TESTING.md). Full WCAG conformance requires manual
testing with assistive technology and expert review.

## Dynamic theme updates

When branding changes (fetch resolves or `refresh()` is called), the provider
re-runs `applyThemeVariables()` on `document.documentElement` — no reload needed.

## Theme persistence

Branding is cached in `localStorage['admin-branding']` (application/tenant
scope). Theme mode is cached in `localStorage['admin-theme']` (user scope). The
two are deliberately separate keys and concepts.
