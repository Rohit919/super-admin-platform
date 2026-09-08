import type { PrismaClient, Prisma } from "@prisma/client";
import {
  isPermissionKey,
  SystemRoles,
  type PermissionKey,
  type RoleDto,
} from "@app/api-contracts";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "@core/errors/index.js";
import {
  AuditService,
  AuditActions,
  type AuditEntry,
} from "@core/audit/index.js";

type AuditContext = Pick<
  AuditEntry,
  "actorId" | "requestId" | "ip" | "userAgent"
>;

/**
 * Roles service — owns all role/permission mutations.
 *
 * Security responsibilities enforced here (never in route handlers):
 *   - default-deny + registry validation of permission keys
 *   - privilege-escalation protection (only SUPER_ADMIN touches SUPER_ADMIN)
 *   - last-administrator protection
 *   - transactional mutations + audit records
 *   - permissionVersion bump so cached/stale authorization is invalidated
 */
export class RolesService {
  private readonly audit: AuditService;

  constructor(private readonly prisma: PrismaClient) {
    this.audit = new AuditService(prisma);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async listRoles(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: "asc" },
      include: { permissions: { include: { permission: true } } },
    });
    return roles.map(toRoleDto);
  }

  async getRole(id: string): Promise<RoleDto> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundError("Role not found");
    return toRoleDto(role);
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: "asc" } });
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { name: true } } },
    });
    return rows.map((r) => r.role.name);
  }

  // ── Mutations ───────────────────────────────────────────────────────────────

  /**
   * Create a custom role, optionally with permissions.
   * `actorIsSuperAdmin` gates delegation of the SUPER_ADMIN-only capabilities.
   */
  async createRole(
    input: { name: string; description?: string; permissions?: string[] },
    actor: { userId: string; isSuperAdmin: boolean },
    auditCtx: AuditContext,
  ): Promise<RoleDto> {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Role name is required");

    // System role names are reserved.
    if ((Object.values(SystemRoles) as string[]).includes(name)) {
      throw new ConflictError("That role name is reserved for a system role");
    }

    // NOTE: role management is currently platform-scoped (tenantId = null).
    // Phase 5 threads the active tenant through here so tenant admins manage
    // their own roles; the duplicate-name check then scopes to that tenant.
    const existing = await this.prisma.role.findFirst({
      where: { name, tenantId: null },
    });
    if (existing)
      throw new ConflictError("A role with that name already exists");

    const permKeys = this.validatePermissionKeys(input.permissions ?? []);
    this.assertCanDelegatePermissions(permKeys, actor.isSuperAdmin);

    const created = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { name, description: input.description ?? null, isSystem: false },
      });
      if (permKeys.length > 0) {
        await this.attachPermissions(tx, role.id, permKeys);
      }
      await this.audit.record(
        {
          ...auditCtx,
          action: AuditActions.RoleCreated,
          targetType: "ROLE",
          targetId: role.id,
          metadata: { name, permissions: permKeys },
        },
        tx,
      );
      return role.id;
    });

    return this.getRole(created);
  }

  /**
   * Update a role's description and/or replace its full permission set.
   * System roles cannot be renamed; their permissions may be adjusted only by
   * a SUPER_ADMIN.
   */
  async updateRole(
    id: string,
    input: { description?: string; permissions?: string[] },
    actor: { userId: string; isSuperAdmin: boolean },
    auditCtx: AuditContext,
  ): Promise<RoleDto> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundError("Role not found");

    if (role.isSystem && !actor.isSuperAdmin) {
      throw new ForbiddenError(
        "System roles can only be modified by a super administrator",
      );
    }
    // Protect the SUPER_ADMIN role specifically.
    if (role.name === SystemRoles.SuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenError(
        "You cannot modify the super administrator role",
      );
    }

    const permKeys =
      input.permissions !== undefined
        ? this.validatePermissionKeys(input.permissions)
        : undefined;
    if (permKeys)
      this.assertCanDelegatePermissions(permKeys, actor.isSuperAdmin);

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: { description: input.description ?? role.description },
      });

      if (permKeys) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await this.attachPermissions(tx, id, permKeys);
        await this.bumpPermissionVersionForRole(tx, id);
        await this.audit.record(
          {
            ...auditCtx,
            action: AuditActions.RolePermissionsUpdated,
            targetType: "ROLE",
            targetId: id,
            metadata: { permissions: permKeys },
          },
          tx,
        );
      }

      await this.audit.record(
        {
          ...auditCtx,
          action: AuditActions.RoleUpdated,
          targetType: "ROLE",
          targetId: id,
          metadata: { description: input.description },
        },
        tx,
      );
    });

    return this.getRole(id);
  }

  /** Replace a role's full permission set. */
  async setRolePermissions(
    id: string,
    permissions: string[],
    actor: { userId: string; isSuperAdmin: boolean },
    auditCtx: AuditContext,
  ): Promise<RoleDto> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundError("Role not found");
    if (role.name === SystemRoles.SuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenError(
        "You cannot modify the super administrator role",
      );
    }
    if (role.isSystem && !actor.isSuperAdmin) {
      throw new ForbiddenError(
        "System roles can only be modified by a super administrator",
      );
    }

    const permKeys = this.validatePermissionKeys(permissions);
    this.assertCanDelegatePermissions(permKeys, actor.isSuperAdmin);

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await this.attachPermissions(tx, id, permKeys);
      await this.bumpPermissionVersionForRole(tx, id);
      await this.audit.record(
        {
          ...auditCtx,
          action: AuditActions.RolePermissionsUpdated,
          targetType: "ROLE",
          targetId: id,
          metadata: { permissions: permKeys },
        },
        tx,
      );
    });

    return this.getRole(id);
  }

  /** Delete a custom role. System roles cannot be deleted. */
  async deleteRole(id: string, auditCtx: AuditContext): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundError("Role not found");
    if (role.isSystem) {
      throw new ForbiddenError("System roles cannot be deleted");
    }

    await this.prisma.$transaction(async (tx) => {
      // Bump versions for everyone who had this role before the cascade removes
      // the assignments, so their cached permissions are invalidated.
      await this.bumpPermissionVersionForRole(tx, id);
      await tx.role.delete({ where: { id } });
      await this.audit.record(
        {
          ...auditCtx,
          action: AuditActions.RoleDeleted,
          targetType: "ROLE",
          targetId: id,
          metadata: { name: role.name },
        },
        tx,
      );
    });
  }

  /**
   * Replace a user's role assignments with the provided set of role names.
   * Enforces privilege-escalation and last-admin protections.
   */
  async setUserRoles(
    targetUserId: string,
    roleNames: string[],
    actor: { userId: string; isSuperAdmin: boolean },
    auditCtx: AuditContext,
  ): Promise<string[]> {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser) throw new NotFoundError("User not found");

    // Resolve the requested role names to role rows.
    const uniqueNames = [
      ...new Set(roleNames.map((n) => n.trim()).filter(Boolean)),
    ];
    const roles = await this.prisma.role.findMany({
      where: { name: { in: uniqueNames } },
    });
    if (roles.length !== uniqueNames.length) {
      const found = new Set(roles.map((r) => r.name));
      const missing = uniqueNames.filter((n) => !found.has(n));
      throw new ValidationError(`Unknown role(s): ${missing.join(", ")}`);
    }

    const currentNames = await this.getUserRoles(targetUserId);
    const nextNames = roles.map((r) => r.name);

    // ── Privilege-escalation protection ──────────────────────────────────────
    // Only a SUPER_ADMIN may grant or remove the SUPER_ADMIN role.
    const grantsSuperAdmin =
      nextNames.includes(SystemRoles.SuperAdmin) &&
      !currentNames.includes(SystemRoles.SuperAdmin);
    const removesSuperAdmin =
      currentNames.includes(SystemRoles.SuperAdmin) &&
      !nextNames.includes(SystemRoles.SuperAdmin);
    if ((grantsSuperAdmin || removesSuperAdmin) && !actor.isSuperAdmin) {
      throw new ForbiddenError(
        "Only a super administrator can grant or remove that role",
      );
    }

    // ── Last-administrator protection ─────────────────────────────────────────
    // Don't allow removing the final SUPER_ADMIN in the system.
    if (removesSuperAdmin) {
      const remaining = await this.countUsersWithRole(
        SystemRoles.SuperAdmin,
        targetUserId,
      );
      if (remaining === 0) {
        throw new ForbiddenError("Cannot remove the last super administrator");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: targetUserId } });
      if (roles.length > 0) {
        await tx.userRole.createMany({
          data: roles.map((r) => ({
            userId: targetUserId,
            roleId: r.id,
            assignedBy: actor.userId,
          })),
        });
      }
      // Invalidate the target's cached authorization.
      await tx.user.update({
        where: { id: targetUserId },
        data: { permissionVersion: { increment: 1 } },
      });

      const added = nextNames.filter((n) => !currentNames.includes(n));
      const removed = currentNames.filter((n) => !nextNames.includes(n));
      for (const roleName of added) {
        await this.audit.record(
          {
            ...auditCtx,
            action: AuditActions.RoleAssigned,
            targetType: "USER",
            targetId: targetUserId,
            metadata: { role: roleName },
          },
          tx,
        );
      }
      for (const roleName of removed) {
        await this.audit.record(
          {
            ...auditCtx,
            action: AuditActions.RoleRemoved,
            targetType: "USER",
            targetId: targetUserId,
            metadata: { role: roleName },
          },
          tx,
        );
      }
    });

    return nextNames;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Reject any key not present in the application registry (default-deny). */
  private validatePermissionKeys(keys: string[]): PermissionKey[] {
    const unique = [...new Set(keys)];
    const invalid = unique.filter((k) => !isPermissionKey(k));
    if (invalid.length > 0) {
      throw new ValidationError(`Unknown permission(s): ${invalid.join(", ")}`);
    }
    return unique as PermissionKey[];
  }

  /**
   * Delegation guard: a non-SUPER_ADMIN cannot create/assign the
   * SUPER_ADMIN-only capabilities (role/permission administration). This
   * prevents an ordinary admin from crafting a role that escalates privilege.
   */
  private assertCanDelegatePermissions(
    keys: PermissionKey[],
    isSuperAdmin: boolean,
  ): void {
    if (isSuperAdmin) return;
    const restricted: PermissionKey[] = [
      "roles.create",
      "roles.update",
      "roles.delete",
      "users.roles.update",
    ];
    const escalating = keys.filter((k) => restricted.includes(k));
    if (escalating.length > 0) {
      throw new ForbiddenError(
        "You cannot delegate role-management permissions you do not administer",
      );
    }
  }

  private async attachPermissions(
    tx: Prisma.TransactionClient,
    roleId: string,
    keys: PermissionKey[],
  ): Promise<void> {
    if (keys.length === 0) return;
    const perms = await tx.permission.findMany({
      where: { key: { in: keys } },
    });
    const foundKeys = new Set(perms.map((p) => p.key));
    const missing = keys.filter((k) => !foundKeys.has(k));
    if (missing.length > 0) {
      // The registry is valid but the permission rows haven't been seeded.
      throw new ValidationError(
        `Permission(s) not provisioned in the database: ${missing.join(", ")}. Run the seed.`,
      );
    }
    await tx.rolePermission.createMany({
      data: perms.map((p) => ({ roleId, permissionId: p.id })),
    });
  }

  /** Bump permissionVersion for every user assigned the given role. */
  private async bumpPermissionVersionForRole(
    tx: Prisma.TransactionClient,
    roleId: string,
  ): Promise<void> {
    const assignments = await tx.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    if (assignments.length === 0) return;
    await tx.user.updateMany({
      where: { id: { in: assignments.map((a) => a.userId) } },
      data: { permissionVersion: { increment: 1 } },
    });
  }

  /** Count users holding a role, excluding one user id. */
  private async countUsersWithRole(
    roleName: string,
    excludeUserId: string,
  ): Promise<number> {
    return this.prisma.userRole.count({
      where: {
        role: { name: roleName },
        userId: { not: excludeUserId },
      },
    });
  }
}

// ── Mapper ────────────────────────────────────────────────────────────────────
function toRoleDto(role: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: { key: string } }[];
}): RoleDto {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((p) => p.permission.key),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}
