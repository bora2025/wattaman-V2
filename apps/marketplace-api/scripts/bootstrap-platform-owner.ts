/**
 * PA-1 offline bootstrap (plan §15 step 2): seeds the platform RBAC role/permission catalog and
 * creates the FIRST Platform Owner. Deliberately a CLI, not an HTTP endpoint -- there is no
 * authenticated operator yet who could call one, and exposing operator creation publicly (even
 * once) is exactly the bootstrap hole the plan's §4 warns about.
 *
 * The created owner has NO MFA yet. Their first login returns `mfa_enrollment_required` with a
 * short-lived, enrollment-only session that can reach nothing but the two MFA-enrollment routes,
 * so mandatory MFA (plan §4) is enforced from the very first sign-in rather than being optional.
 *
 * Run from apps/marketplace-api:
 *   DATABASE_URL=... npx tsx scripts/bootstrap-platform-owner.ts \
 *     --email owner@wattanam.example --name "Platform Owner"
 *
 * The password is read from PLATFORM_OWNER_PASSWORD (or --password-file), never from argv, so it
 * cannot land in shell history or process listings.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { hashPassword } from '../src/identity-crypto';
import { PLATFORM_PERMISSIONS, PLATFORM_ROLES } from '../src/platform-rbac-seed';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readPassword(): string {
  const file = flag('password-file');
  const password = file ? readFileSync(file, 'utf8').trim() : process.env.PLATFORM_OWNER_PASSWORD?.trim();
  if (!password) throw new Error('Set PLATFORM_OWNER_PASSWORD or pass --password-file <path>');
  if (password.length < 12) throw new Error('Platform owner password must be at least 12 characters');
  return password;
}

export async function seedRbac(prisma: PrismaClient) {
  for (const permission of PLATFORM_PERMISSIONS) {
    await prisma.platformPermission.upsert({
      where: { key: permission.key },
      create: { key: permission.key, description: permission.description },
      update: { description: permission.description },
    });
  }
  for (const role of PLATFORM_ROLES) {
    const record = await prisma.platformRole.upsert({
      where: { key: role.key },
      create: { key: role.key, displayName: role.displayName, description: role.description },
      update: { displayName: role.displayName, description: role.description },
    });
    for (const permissionKey of role.permissions) {
      const permission = await prisma.platformPermission.findUnique({ where: { key: permissionKey } });
      if (!permission) throw new Error(`Role ${role.key} references unknown permission ${permissionKey}`);
      await prisma.platformRolePermission.upsert({
        where: { roleId_permissionId: { roleId: record.id, permissionId: permission.id } },
        create: { roleId: record.id, permissionId: permission.id },
        update: {},
      });
    }
  }
  return { permissions: PLATFORM_PERMISSIONS.length, roles: PLATFORM_ROLES.length };
}

async function main() {
  const email = flag('email')?.trim().toLowerCase();
  const displayName = flag('name')?.trim();
  if (!email || !displayName) throw new Error('Usage: --email <address> --name "<display name>" [--password-file <path>]');
  const password = readPassword();

  const prisma = new PrismaClient();
  try {
    const seeded = await seedRbac(prisma);

    const ownerRole = await prisma.platformRole.findUnique({ where: { key: 'platform_owner' } });
    if (!ownerRole) throw new Error('platform_owner role missing after seed');

    const existing = await prisma.platformOperator.findUnique({ where: { email } });
    if (existing) throw new Error(`An operator already exists for ${email} -- refusing to overwrite`);

    const passwordHash = await hashPassword(password);
    const operator = await prisma.platformOperator.create({
      data: { email, displayName, passwordHash, roles: { create: { roleId: ownerRole.id } } },
      select: { id: true, email: true, displayName: true, createdAt: true },
    });
    await prisma.platformAuditEvent.create({
      data: { operatorId: operator.id, action: 'platform_operator_bootstrapped', success: true, targetType: 'PlatformOperator', targetId: operator.id },
    });

    console.log(JSON.stringify({
      seeded, operator, role: 'platform_owner',
      nextStep: 'Sign in at the platform admin app; the first login will require MFA enrollment before any other action.',
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
