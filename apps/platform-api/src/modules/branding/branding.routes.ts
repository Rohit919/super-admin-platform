import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  BRANDING_CONTRACTS,
  toFastifySchema,
  type AppBranding,
} from "@app/api-contracts";

/**
 * White-label branding module.
 *
 * `GET /api/v1/branding` returns the branding configuration the Admin applies
 * at runtime (app name, assets, colors). It is PUBLIC so the Admin can brand
 * the login screen and bootstrap before any session exists.
 *
 * ── Tenant resolution (security boundary) ──────────────────────────────────
 * The backend is authoritative for WHICH tenant's branding is returned — the
 * browser never chooses. This reference implementation is single-tenant and
 * sources values from validated env (`BRAND_*`). To go multi-tenant, resolve
 * the tenant from the request here (host/subdomain or authenticated session)
 * and look up that tenant's branding — the contract and the Admin client do
 * not change. See docs/white-label/WHITE-LABEL-RUNTIME-CONFIG.md.
 */
const brandingRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const contract = BRANDING_CONTRACTS.GET;

  fastify.get(
    "/branding",
    { schema: toFastifySchema(contract) },
    async (_request, reply) => {
      const env = fastify.config;

      const branding: AppBranding = {
        appName: env.BRAND_APP_NAME,
        shortName: env.BRAND_SHORT_NAME,
        colors: {
          primary: env.BRAND_COLOR_PRIMARY,
          ...(env.BRAND_COLOR_SECONDARY
            ? { secondary: env.BRAND_COLOR_SECONDARY }
            : {}),
          ...(env.BRAND_COLOR_ACCENT ? { accent: env.BRAND_COLOR_ACCENT } : {}),
        },
        ...(env.BRAND_LOGO ? { logo: env.BRAND_LOGO } : {}),
        ...(env.BRAND_LOGO_DARK ? { logoDark: env.BRAND_LOGO_DARK } : {}),
        ...(env.BRAND_ICON ? { icon: env.BRAND_ICON } : {}),
        ...(env.BRAND_FAVICON ? { favicon: env.BRAND_FAVICON } : {}),
        ...(env.BRAND_COMPANY_NAME || env.BRAND_DESCRIPTION
          ? {
              metadata: {
                ...(env.BRAND_COMPANY_NAME
                  ? { companyName: env.BRAND_COMPANY_NAME }
                  : {}),
                ...(env.BRAND_DESCRIPTION
                  ? { description: env.BRAND_DESCRIPTION }
                  : {}),
              },
            }
          : {}),
      };

      // Branding is relatively static and safe to cache at the edge/browser.
      reply.header("Cache-Control", "public, max-age=300");
      return reply.send({ data: branding });
    },
  );
};

export default brandingRoutes;
