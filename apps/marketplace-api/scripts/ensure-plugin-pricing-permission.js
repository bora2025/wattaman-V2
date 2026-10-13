/**
 * Ensure the marketplace operator can manage plugin pricing.
 *
 * This startup repair is intentionally narrow: it creates one permission and
 * grants it to one existing role. It does not synchronize or revoke any other
 * RBAC data.
 */
const fs = require('fs');
const path = require('path');
const configuredApp = process.env.PLATFORM_APP_ROOT || '/workspace/apps/marketplace-api';
const APP = fs.existsSync(path.join(configuredApp, 'node_modules', '@prisma', 'client'))
  ? configuredApp
  : path.resolve(__dirname, '..');
const { PrismaClient } = require(`${APP}/node_modules/@prisma/client`);

async function main() {
  const prisma = new PrismaClient();
  try {
    const role = await prisma.platformRole.findUnique({
      where: { key: 'marketplace_operator' },
      select: { id: true },
    });
    if (!role) throw new Error('Required platform role marketplace_operator does not exist');

    const permission = await prisma.platformPermission.upsert({
      where: { key: 'plugins.pricing.manage' },
      create: {
        key: 'plugins.pricing.manage',
        description: 'Configure free or paid plugin availability and pricing',
      },
      update: {
        description: 'Configure free or paid plugin availability and pricing',
      },
      select: { id: true },
    });

    await prisma.platformRolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
      create: { roleId: role.id, permissionId: permission.id },
      update: {},
    });

    console.log(JSON.stringify({
      role: 'marketplace_operator',
      permission: 'plugins.pricing.manage',
      granted: true,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
