/**
 * Re-seeds the platform permission and role catalog on a *deployed* environment.
 *
 * Nothing seeds RBAC at boot. The catalog reaches a database only through
 * `bootstrap-platform-owner.ts` or `create-platform-operator.js`, both of which run once when an
 * operator is created — so a release that adds a permission key ships code that checks for a
 * permission the database has never heard of, and every route behind it answers 403 for everyone.
 * This script is the missing step: run it after any deploy that changed `platform-rbac-seed.ts`.
 *
 *   railway ssh --project <id> --service marketplace-api -i ~/.ssh/<key> \
 *     node < scripts/seed-platform-rbac.js
 *
 * Idempotent and additive. It creates permissions, creates roles, and grants each role the
 * permissions the seed lists. It deliberately does not revoke: a grant this catalog no longer
 * mentions may have been made on purpose by an operator with deploy access, and silently removing
 * someone's access during a routine deploy is not a decision a seed script should take. Removals
 * are reported so a human can make them.
 */
const APP = process.env.PLATFORM_APP_ROOT || '/app';
const { PrismaClient } = require(`${APP}/node_modules/@prisma/client`);
const { PLATFORM_PERMISSIONS, PLATFORM_ROLES } = require(`${APP}/dist/platform-rbac-seed`);

async function main() {
  const prisma = new PrismaClient();
  try {
    const before = await prisma.platformPermission.findMany({ select: { key: true } });
    const known = new Set(before.map((row) => row.key));
    const added = PLATFORM_PERMISSIONS.filter((permission) => !known.has(permission.key)).map((permission) => permission.key);

    for (const permission of PLATFORM_PERMISSIONS) {
      await prisma.platformPermission.upsert({
        where: { key: permission.key },
        create: { key: permission.key, description: permission.description },
        update: { description: permission.description },
      });
    }

    const grantsAdded = [];
    for (const role of PLATFORM_ROLES) {
      const record = await prisma.platformRole.upsert({
        where: { key: role.key },
        create: { key: role.key, displayName: role.displayName, description: role.description },
        update: { displayName: role.displayName, description: role.description },
      });
      for (const permissionKey of role.permissions) {
        const permission = await prisma.platformPermission.findUnique({ where: { key: permissionKey } });
        if (!permission) throw new Error(`Role ${role.key} references unknown permission ${permissionKey}`);
        const existing = await prisma.platformRolePermission.findUnique({
          where: { roleId_permissionId: { roleId: record.id, permissionId: permission.id } },
        });
        if (!existing) {
          await prisma.platformRolePermission.create({ data: { roleId: record.id, permissionId: permission.id } });
          grantsAdded.push(`${role.key} -> ${permissionKey}`);
        }
      }
    }

    /** Reported, never removed — see the header. */
    const seededKeys = new Set(PLATFORM_PERMISSIONS.map((permission) => permission.key));
    const orphaned = before.map((row) => row.key).filter((key) => !seededKeys.has(key));

    console.log(JSON.stringify({
      permissions: PLATFORM_PERMISSIONS.length,
      roles: PLATFORM_ROLES.length,
      newPermissions: added,
      newRoleGrants: grantsAdded,
      permissionsNoLongerInTheSeed: orphaned,
      note: orphaned.length
        ? 'Listed keys exist in the database but not in the current seed. Nothing was revoked; remove them deliberately if that is intended.'
        : 'Catalog matches the seed.',
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
