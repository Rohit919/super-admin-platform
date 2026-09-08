import { Type, type Static } from "@sinclair/typebox";
import { DataEnvelope } from "./common.js";

/**
 * White-label branding contract.
 *
 * Branding represents the APPLICATION / TENANT identity (name, logo, colors),
 * NOT an individual user's preferences (theme mode, language). Keep the two
 * separate: a user toggling dark mode must never mutate tenant branding.
 *
 * All fields are treated as PLAIN TEXT by consumers — never rendered as HTML.
 * Asset URLs and colors must be validated on the client before being applied.
 * This schema is the single source of truth for the shape; a consuming client
 * should re-validate at runtime because the payload is external, untrusted data.
 *
 * NOTE: the original consumer (the tenant Admin, apps/admin) has been removed.
 * The contract is retained as the source of truth for any future consumer.
 */

// ── Field-level constraints ──────────────────────────────────────────────────
// `Brand*` reference identifiers are conservative so a malformed tenant config
// can never inject markup or absurd payloads. The client still re-validates.

/** Human-facing name shown in the title bar, sidebar, auth screens. */
const AppName = Type.String({ minLength: 1, maxLength: 80 });

/** Compact name for collapsed sidebar / small surfaces. */
const ShortName = Type.String({ minLength: 1, maxLength: 24 });

/**
 * Asset reference. Either a trusted relative path (starts with `/`) or an
 * absolute https URL. The client rejects `javascript:`/`data:` and other unsafe
 * schemes before applying (see resolveAssetUrl / isSafeAssetUrl).
 */
const AssetRef = Type.String({ minLength: 1, maxLength: 2048 });

/**
 * Color value. A permissive string here; the client normalizes to an HSL
 * triplet consumable by the CSS-variable theme and falls back on anything it
 * cannot parse. Accepts hex (`#2563EB`), `rgb(...)`, `hsl(...)`, or a bare
 * `H S% L%` triplet.
 */
const Color = Type.String({ minLength: 1, maxLength: 64 });

// ── Branding categories ──────────────────────────────────────────────────────

export const BrandingColors = Type.Object({
  primary: Color,
  secondary: Type.Optional(Color),
  accent: Type.Optional(Color),
});
export type BrandingColors = Static<typeof BrandingColors>;

export const BrandingMetadata = Type.Object({
  description: Type.Optional(Type.String({ maxLength: 280 })),
  companyName: Type.Optional(Type.String({ maxLength: 120 })),
});
export type BrandingMetadata = Static<typeof BrandingMetadata>;

/**
 * The complete branding document. Only `appName`, `shortName` and
 * `colors.primary` are required — everything else is optional so a tenant can
 * provide a minimal config and the client fills gaps from safe defaults.
 */
export const AppBranding = Type.Object({
  appName: AppName,
  shortName: ShortName,

  logo: Type.Optional(AssetRef),
  logoDark: Type.Optional(AssetRef),
  icon: Type.Optional(AssetRef),
  favicon: Type.Optional(AssetRef),

  colors: BrandingColors,

  metadata: Type.Optional(BrandingMetadata),
});
export type AppBranding = Static<typeof AppBranding>;

/** Canonical single-resource envelope: `{ data: AppBranding }`. */
export const AppBrandingResponse = DataEnvelope(AppBranding);
export type AppBrandingResponse = Static<typeof AppBrandingResponse>;
