import type { PrismaClient } from "@prisma/client";
import type { JWTPayload } from "../../../plugins/auth.js";

/**
 * Builds the JWT access-token payload for a user, resolving the active tenant.
 *
 * Multi-tenancy: a user may belong to several tenants. At sign time we select
 * an active tenant so the session has a default context; the user can switch
 * later (validated server-side). Selection rules:
 *   - if `preferredTenantId` is given AND the user has an ACTIVE membership in
 *     an ACTIVE tenant there, use it;
 *   - otherwise fall back to the user's first ACTIVE membership in an ACTIVE
 *     tenant (deterministic order: membership createdAt asc);
 *   - if the user has no usable membership, `tenantId` is left undefined
 *     (platform-only identity). The tenant-resolution hook decides whether a
 *     given route requires a tenant.
 *
 * The token also carries `permissionVersion` so the server can detect a stale
 * token whose authorization has since changed. The token is a HINT only —
 * membership and tenant status are always re-validated per request.
 *
 * See MULTI-TENANT-ARCHITECTURE §7.1, §11, §47.
 */
export async function buildTokenPayload(
  prisma: PrismaClient,
  user: { id: string; email: string; role: string; permissionVersion?: number },
  preferredTenantId?: string,
): Promise<JWTPayload> {
  const tenantId = await resolveActiveTenantId(
    prisma,
    user.id,
    preferredTenantId,
  );

  const payload: JWTPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    ...(user.permissionVersion !== undefined
      ? { permissionVersion: user.permissionVersion }
      : {}),
    ...(tenantId ? { tenantId } : {}),
  };

  return payload;
}

/**
 * Resolve the active tenant id for a user: a preferred tenant if the user has a
 * valid (ACTIVE membership + ACTIVE tenant) relationship there, else the first
 * such membership. Returns undefined when the user has no usable tenant.
 *
 * Exported for reuse by the tenant-switch endpoint (Phase 7) and tests.
 */
export async function resolveActiveTenantId(
  prisma: PrismaClient,
  userId: string,
  preferredTenantId?: string,
): Promise<string | undefined> {
  if (preferredTenantId) {
    const preferred = await prisma.tenantMembership.findFirst({
      where: {
        userId,
        tenantId: preferredTenantId,
        status: "ACTIVE",
        tenant: { status: "ACTIVE" },
      },
      select: { tenantId: true },
    });
    if (preferred) return preferred.tenantId;
  }

  const first = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      tenant: { status: "ACTIVE" },
    },
    orderBy: { createdAt: "asc" },
    select: { tenantId: true },
  });

  return first?.tenantId;
}
