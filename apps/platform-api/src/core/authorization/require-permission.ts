import type { FastifyRequest, FastifyReply } from "fastify";
import type { PermissionKey } from "@app/api-contracts";
import { UnauthorizedError, ForbiddenError } from "@core/errors/index.js";

/**
 * Permission-based route guards. These are the primary authorization boundary:
 * a route declares the capability it needs, the guard resolves the caller's
 * effective permissions (via fastify.authorization) and allows/denies.
 *
 * Default-deny: if the permission is not explicitly granted, access is refused.
 * Assumes fastify.authenticate ran first (request.user populated). Permissions
 * are resolved for the ACTIVE tenant (request.tenant) — a tenant role only
 * grants within its tenant; platform roles apply everywhere (see
 * AuthorizationService.getContext).
 *
 *   preValidation: [fastify.authenticate],
 *   preHandler: [requirePermission(PermissionKeys.UsersRead)],
 *
 * Denials throw canonical AppError subclasses so every response flows through
 * the global error handler and uses the standard error envelope (the previous
 * ad-hoc reply shape is gone — MULTI-TENANT §50, API_CONVENTIONS §39).
 */

function logDenial(
  request: FastifyRequest,
  userId: string,
  permission: string,
): void {
  request.log.warn(
    {
      event: "authorization.denied",
      userId,
      tenantId: request.tenant?.tenantId,
      permission,
      route: request.routeOptions?.url ?? request.url,
      requestId: request.id,
    },
    "authorization denied",
  );
}

/** Require a single permission. */
export function requirePermission(permission: PermissionKey) {
  return async function (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user?.id) throw new UnauthorizedError();

    const ctx =
      await request.server.authorization.getContextForRequest(request);
    if (!ctx.permissions.includes(permission)) {
      logDenial(request, ctx.userId, permission);
      throw new ForbiddenError(
        "You do not have permission to perform this action.",
      );
    }
  };
}

/** Require ANY of the given permissions. */
export function requireAnyPermission(permissions: PermissionKey[]) {
  return async function (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user?.id) throw new UnauthorizedError();

    const ctx =
      await request.server.authorization.getContextForRequest(request);
    if (!permissions.some((p) => ctx.permissions.includes(p))) {
      logDenial(request, ctx.userId, permissions.join("|"));
      throw new ForbiddenError(
        "You do not have permission to perform this action.",
      );
    }
  };
}

/** Require ALL of the given permissions. */
export function requireAllPermissions(permissions: PermissionKey[]) {
  return async function (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user?.id) throw new UnauthorizedError();

    const ctx =
      await request.server.authorization.getContextForRequest(request);
    if (!permissions.every((p) => ctx.permissions.includes(p))) {
      logDenial(request, ctx.userId, permissions.join("&"));
      throw new ForbiddenError(
        "You do not have permission to perform this action.",
      );
    }
  };
}
