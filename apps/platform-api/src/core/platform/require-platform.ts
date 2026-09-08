import type { FastifyRequest, FastifyReply } from "fastify";
import type { PermissionKey } from "@app/api-contracts";
import {
  UnauthorizedError,
  PlatformAccessDeniedError,
} from "@core/errors/index.js";

/**
 * Platform (Super Admin) route guards.
 *
 * requirePlatform            — gate: caller must be an ACTIVE platform member.
 * requirePlatformPermission  — gate + a specific platform.* permission.
 *
 * Assumes fastify.authenticate ran first (request.user populated). Platform
 * permissions resolve through the RBAC engine WITHOUT a tenant scope, so
 * getContextForRequest / hasPermission with no active tenant returns the
 * user's platform-role permissions (UserRole.tenantId = null).
 *
 * Denials throw canonical AppError subclasses → global error handler → standard
 * envelope. A tenant user hitting /platform/* gets a uniform 403.
 */

function logPlatformDenial(
  request: FastifyRequest,
  userId: string,
  permission?: string,
): void {
  request.log.warn(
    {
      event: "platform.authorization.denied",
      userId,
      ...(permission ? { permission } : {}),
      route: request.routeOptions?.url ?? request.url,
      requestId: request.id,
    },
    "platform authorization denied",
  );
}

/** Gate: require an ACTIVE platform membership. */
export async function requirePlatform(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const userId = request.user?.id;
  if (!userId) throw new UnauthorizedError();

  if (!(await request.server.platform.isActivePlatformMember(userId))) {
    logPlatformDenial(request, userId);
    throw new PlatformAccessDeniedError();
  }
}

/** Gate + require a specific platform permission. */
export function requirePlatformPermission(permission: PermissionKey) {
  return async function (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedError();

    // 1) Platform membership gate.
    if (!(await request.server.platform.isActivePlatformMember(userId))) {
      logPlatformDenial(request, userId, permission);
      throw new PlatformAccessDeniedError();
    }

    // 2) Platform permission — resolved with NO tenant scope, so only platform
    //    roles (tenantId null) contribute. A tenant role can never grant a
    //    platform permission.
    const hasPerm = await request.server.authorization.hasPermission(
      userId,
      permission,
    );
    if (!hasPerm) {
      logPlatformDenial(request, userId, permission);
      // Same error as the gate so callers can't distinguish "no membership"
      // from "missing permission" — no platform structure leakage.
      throw new PlatformAccessDeniedError();
    }
  };
}
