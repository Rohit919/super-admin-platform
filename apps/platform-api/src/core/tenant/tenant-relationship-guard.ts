import type { PrismaClient } from "@prisma/client";
import { ForbiddenError } from "@core/errors/index.js";

/**
 * Cross-tenant relationship guard (MULTI-TENANT-ARCHITECTURE §85-86).
 *
 * When a tenant-owned record connects to another tenant-owned record (e.g. a
 * Shipment connecting a Driver), the connected record MUST belong to the same
 * tenant. Foreign-key existence is NOT authorization — a valid id from another
 * tenant must be rejected.
 *
 * Usage before a nested write / connect:
 *   await assertSameTenant(prisma, request.tenant.tenantId, [
 *     { model: 'driver', id: driverId },
 *     { model: 'warehouse', id: warehouseId },
 *   ]);
 *
 * Each referenced record is looked up and its tenantId compared to the active
 * tenant. Any mismatch (or missing record) throws ForbiddenError — reported
 * generically to avoid revealing another tenant's data (§28, §83).
 */
export interface TenantOwnedRef {
  /** Prisma delegate key, e.g. 'todo'. Must be a tenant-owned model with tenantId. */
  model: string;
  id: string;
}

export async function assertSameTenant(
  prisma: PrismaClient,
  tenantId: string,
  refs: TenantOwnedRef[],
): Promise<void> {
  for (const ref of refs) {
    // Access the delegate dynamically; each tenant-owned model exposes findFirst.
    const delegate = (
      prisma as unknown as Record<
        string,
        {
          findFirst: (args: unknown) => Promise<{ id: string } | null>;
        }
      >
    )[ref.model];

    if (!delegate?.findFirst) {
      // Programming error: guarding a model that doesn't exist / isn't queryable.
      throw new Error(
        `assertSameTenant: unknown or non-queryable model '${ref.model}'`,
      );
    }

    const found = await delegate.findFirst({
      where: { id: ref.id, tenantId },
      select: { id: true },
    });

    if (!found) {
      // Either the record doesn't exist or belongs to another tenant — both are
      // rejected identically so we never leak cross-tenant existence.
      throw new ForbiddenError(
        "A referenced resource is not available in this tenant.",
      );
    }
  }
}
