/**
 * Creates a platform operator on a *deployed* environment.
 *
 * `bootstrap-platform-owner.ts` is the same operation for a local or CI database, but it needs
 * `tsx` and the TypeScript sources, and the production image ships neither — it carries only
 * `dist/` and production dependencies. This script is plain CommonJS and reuses the compiled
 * `identity-crypto` and `platform-rbac-seed` already inside the image, so the password hash is
 * produced by exactly the code the login path verifies against, never a re-implementation.
 *
 * It is piped in over SSH rather than baked into the image, because operator creation should
 * require someone with deploy access at the moment they run it (plan §4: no HTTP endpoint creates
 * operators, and the bootstrap hole that would open is the reason why).
 *
 *   PAYLOAD=$(printf '%s' '{"email":"you@example.com","name":"Your Name","password":"..."}' | base64 -w0)
 *   railway ssh --service marketplace-api -i ~/.ssh/<key> \
 *     env PLATFORM_OPERATOR_B64=$PAYLOAD node < scripts/create-platform-operator.js
 *
 * The new operator has no second factor yet. Their first sign-in returns `mfa_enrollment_required`
 * with a short-lived, enrollment-only session that can reach nothing but the two MFA routes, so
 * mandatory MFA is enforced from the very first login.
 */
const APP = process.env.PLATFORM_APP_ROOT || '/app';
const { PrismaClient } = require(`${APP}/node_modules/@prisma/client`);
const { hashPassword } = require(`${APP}/dist/identity-crypto`);
const { PLATFORM_PERMISSIONS, PLATFORM_ROLES } = require(`${APP}/dist/platform-rbac-seed`);

/**
 * `railway ssh` joins its command arguments and re-splits them on whitespace, so `env
 * NAME="Two Words" node` arrives as a broken command line. Accept a base64 JSON blob — which
 * contains no whitespace and so survives that round trip — and fall back to plain environment
 * variables when the script is run somewhere with a normal shell.
 */
function inputs() {
  const encoded = process.env.PLATFORM_OPERATOR_B64;
  if (encoded) return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  return {
    email: process.env.PLATFORM_OPERATOR_EMAIL,
    name: process.env.PLATFORM_OPERATOR_NAME,
    password: process.env.PLATFORM_OPERATOR_PASSWORD,
    role: process.env.PLATFORM_OPERATOR_ROLE,
  };
}

const given = inputs();
const email = (given.email || '').trim().toLowerCase();
const displayName = (given.name || '').trim();
const password = (given.password || '').trim();
const roleKey = (given.role || 'platform_owner').trim();

/** Idempotent, and identical to the local bootstrap's seed: a deployed database that has had its
 * migrations applied still has an empty role/permission catalog until something seeds it. */
async function seedRbac(prisma) {
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
  if (!email || !displayName) {
    throw new Error('Set PLATFORM_OPERATOR_EMAIL and PLATFORM_OPERATOR_NAME');
  }
  if (password.length < 12) {
    throw new Error('Set PLATFORM_OPERATOR_PASSWORD to at least 12 characters');
  }

  const prisma = new PrismaClient();
  try {
    const seeded = await seedRbac(prisma);

    const role = await prisma.platformRole.findUnique({ where: { key: roleKey } });
    if (!role) throw new Error(`Unknown platform role ${roleKey}`);

    const existing = await prisma.platformOperator.findUnique({ where: { email } });
    if (existing) throw new Error(`An operator already exists for ${email} -- refusing to overwrite`);

    const passwordHash = await hashPassword(password);
    const operator = await prisma.platformOperator.create({
      data: { email, displayName, passwordHash, roles: { create: { roleId: role.id } } },
      select: { id: true, email: true, displayName: true, createdAt: true },
    });
    await prisma.platformAuditEvent.create({
      data: {
        operatorId: operator.id, action: 'platform_operator_created_via_cli', success: true,
        targetType: 'PlatformOperator', targetId: operator.id, metadata: { role: roleKey },
      },
    });

    console.log(JSON.stringify({
      seeded, operator, role: roleKey,
      nextStep: 'Sign in; the first login requires MFA enrollment before any other action.',
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
