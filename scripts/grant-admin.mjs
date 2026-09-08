// Dev helper: assign the ADMIN role to a user by email via the RBAC join table.
// Usage: node scripts/grant-admin.mjs <email> [ROLE_NAME]
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.argv[2];
const roleName = process.argv[3] ?? "ADMIN";

if (!email) {
  console.error("Usage: node scripts/grant-admin.mjs <email> [ROLE_NAME]");
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}

// Platform-level role lookup (tenantId = null). Role names are unique per
// tenant now, so scope to platform roles for this dev helper.
const role = await prisma.role.findFirst({
  where: { name: roleName, tenantId: null },
  include: { permissions: { include: { permission: true } } },
});
if (!role) {
  console.error(`No role found with name ${roleName}`);
  process.exit(1);
}

await prisma.userRole.upsert({
  where: { userId_roleId: { userId: user.id, roleId: role.id } },
  create: {
    userId: user.id,
    roleId: role.id,
    assignedBy: "grant-admin-script",
  },
  update: {},
});

// Bump permissionVersion so any cached permission set is invalidated.
await prisma.user.update({
  where: { id: user.id },
  data: { permissionVersion: { increment: 1 } },
});

const perms = role.permissions.map((rp) => rp.permission.key).sort();
console.log(`Assigned role ${roleName} to ${email}`);
console.log(
  `Effective permissions from this role (${perms.length}):`,
  perms.join(", "),
);

await prisma.$disconnect();
