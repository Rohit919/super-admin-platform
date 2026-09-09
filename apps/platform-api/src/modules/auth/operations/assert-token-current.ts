import type { PrismaClient } from "@prisma/client";
import type { JWTPayload } from "../../../plugins/auth.js";
import { UnauthorizedError } from "@core/errors/index.js";
import { ErrorCode } from "@core/errors/error-codes.js";

/**
 * Access-token integrity enforcement (Phase 7 / AUTHENTICATION_IMPLEMENTATION
 * §19, §27, §30-31; MULTI-TENANT-ARCHITECTURE §47).
 *
 * `jwtVerify()` only proves a token was signed by us and hasn't expired. It
 * does NOT prove the token still reflects the user's CURRENT state. Without an
 * extra check, an access token issued before a security-relevant change stays
 * valid until it expires — so `logout-all`, `change-password`, and password
 * reset (which revoke REFRESH tokens) do not actually cut off an already-issued
 * ACCESS token, and a permission downgrade only takes effect on next refresh.
 *
 * This closes that gap by re-loading the user on the authenticated path and
 * rejecting a token that is stale in either of two ways:
 *
 *   1. permissionVersion mismatch — the token's `permissionVersion` claim is
 *      older than the user's current value (roles/permissions changed since
 *      sign time). Forces a refresh so authorization is re-resolved.
 *   2. issued-before-password-change — the token's `iat` predates the user's
 *      `passwordChangedAt` (password changed/reset since sign time), so this
 *      access token belongs to a session that has been invalidated.
 *
 * On any failure it throws UnauthorizedError(TOKEN_REVOKED); the client should
 * refresh (or re-authenticate). A missing user also fails closed.
 *
 * Cost: one indexed `user.findUnique` per authenticated request, selecting only
 * the two fields needed. Kept intentionally small.
 */
export async function assertTokenCurrent(
  prisma: PrismaClient,
  claims: JWTPayload & { iat?: number },
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: claims.id },
    select: { permissionVersion: true, passwordChangedAt: true },
  });

  // User no longer exists → fail closed.
  if (!user) {
    throw new UnauthorizedError(
      "Session is no longer valid",
      ErrorCode.TOKEN_REVOKED,
    );
  }

  // 1) permissionVersion: reject a token minted before the latest permission
  //    change. A token without the claim (legacy) is treated as version 0.
  const tokenVersion = claims.permissionVersion ?? 0;
  if (tokenVersion < user.permissionVersion) {
    throw new UnauthorizedError(
      "Session authorization is stale. Please refresh.",
      ErrorCode.TOKEN_REVOKED,
    );
  }

  // 2) passwordChangedAt: reject a token issued at/before the last password
  //    change. `iat` is in SECONDS (JWT standard); compare in the same unit and
  //    allow a 1s skew so a token minted in the same second as the change (e.g.
  //    the change-password response) is not falsely rejected.
  if (user.passwordChangedAt && typeof claims.iat === "number") {
    const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (claims.iat < changedAtSec - 1) {
      throw new UnauthorizedError(
        "Session invalidated by a password change. Please log in again.",
        ErrorCode.TOKEN_REVOKED,
      );
    }
  }
}
