import type { PrismaClient } from "@prisma/client";
import { PlatformAccessDeniedError } from "@core/errors/index.js";

/**
 * PlatformService — the single gate for platform (Super Admin) access.
 *
 * A user may operate on /api/v1/platform/* only with an ACTIVE
 * PlatformMembership. This is INDEPENDENT of any tenant context: a platform
 * operator has no active tenant, yet must still pass this gate. Platform
 * PERMISSIONS are resolved separately through the RBAC engine (platform roles,
 * UserRole.tenantId = null) — this service answers only "may this user act on
 * the platform at all?" (MULTI-TENANT-ARCHITECTURE §17, §57, §58).
 */
export class PlatformService {
  constructor(private readonly prisma: PrismaClient) {}

  /** True if the user has an ACTIVE platform membership. */
  async isActivePlatformMember(userId: string): Promise<boolean> {
    const membership = await this.prisma.platformMembership.findUnique({
      where: { userId },
      select: { status: true },
    });
    return membership?.status === "ACTIVE";
  }

  /**
   * Assert the user has ACTIVE platform access, or throw. No membership and an
   * inactive membership are reported identically to avoid platform enumeration.
   */
  async assertPlatformAccess(userId: string): Promise<void> {
    if (!(await this.isActivePlatformMember(userId))) {
      throw new PlatformAccessDeniedError();
    }
  }
}
