-- RenameForeignKey
ALTER TABLE "password_reset_tokens" RENAME CONSTRAINT "password_reset_tokens_userId_fk" TO "password_reset_tokens_userId_fkey";

-- RenameForeignKey
ALTER TABLE "platform_memberships" RENAME CONSTRAINT "platform_memberships_userId_fk" TO "platform_memberships_userId_fkey";

-- RenameForeignKey
ALTER TABLE "role_permissions" RENAME CONSTRAINT "role_permissions_permissionId_fk" TO "role_permissions_permissionId_fkey";

-- RenameForeignKey
ALTER TABLE "role_permissions" RENAME CONSTRAINT "role_permissions_roleId_fk" TO "role_permissions_roleId_fkey";

-- RenameForeignKey
ALTER TABLE "roles" RENAME CONSTRAINT "roles_tenantId_fk" TO "roles_tenantId_fkey";

-- RenameForeignKey
ALTER TABLE "tenant_memberships" RENAME CONSTRAINT "tenant_memberships_tenantId_fk" TO "tenant_memberships_tenantId_fkey";

-- RenameForeignKey
ALTER TABLE "tenant_memberships" RENAME CONSTRAINT "tenant_memberships_userId_fk" TO "tenant_memberships_userId_fkey";

-- RenameForeignKey
ALTER TABLE "user_roles" RENAME CONSTRAINT "user_roles_roleId_fk" TO "user_roles_roleId_fkey";

-- RenameForeignKey
ALTER TABLE "user_roles" RENAME CONSTRAINT "user_roles_tenantId_fk" TO "user_roles_tenantId_fkey";

-- RenameForeignKey
ALTER TABLE "user_roles" RENAME CONSTRAINT "user_roles_userId_fk" TO "user_roles_userId_fkey";

-- RenameIndex
ALTER INDEX "password_reset_tokens_hash_key" RENAME TO "password_reset_tokens_tokenHash_key";
