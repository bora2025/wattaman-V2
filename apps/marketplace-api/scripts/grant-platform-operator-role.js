/**
 * Grants or revokes a platform operator's role on a *deployed* environment.
 *
 * `operators.manage` is seeded but no endpoint implements it yet, so role grants have nowhere else
 * to happen. That matters most right after bootstrap: `create-platform-operator.js` defaults to
 * `platform_owner`, and this RBAC model has no universal admin — Platform Owner deliberately holds
 * no `schools.*`, `plugins.*`, `customers.*`, or `orders.*`, so an operator created that way finds
 * whole sections of the console missing and no way to grant themselves more.
 *
 * Piped in over SSH rather than baked into the image, for the same reason as operator creation:
 * changing who can act on customer schools should require deploy access at the moment it is done.
 *
 *   # Show the operators and roles that exist, and what each role can do:
 *   railway ssh --project <id> --service marketplace-api -i ~/.ssh/<key> \
 *     node < scripts/grant-platform-operator-role.js
 *
 *   # Grant a role:
 *   PAYLOAD=$(printf '%s' '{"email":"you@example.com","role":"marketplace_operator"}' | base64 -w0)
 *   railway ssh --project <id> --service marketplace-api -i ~/.ssh/<key> \
 *     env PLATFORM_ROLE_GRANT_B64=$PAYLOAD node < scripts/grant-platform-operator-role.js
 *
 *   # Revoke one (add "revoke": true).
 *
 * Granting is itself a privileged act, so it writes a `platform_operator_role_granted` audit event
 * naming the role and the operator it was applied to.
 */
const APP = process.env.PLATFORM_APP_ROOT || '/app';
const { PrismaClient } = require(`${APP}/node_modules/@prisma/client`);

/**
 * `railway ssh` joins its command arguments and re-splits them on whitespace, so a payload arrives
 * broken unless it contains none. Base64 JSON survives that round trip.
 */
function inputs() {
  const encoded = process.env.PLATFORM_ROLE_GRANT_B64;
  if (encoded) return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  return {
    email: process.env.PLATFORM_OPERATOR_EMAIL,
    role: process.env.PLATFORM_OPERATOR_ROLE,
    revoke: process.env.PLATFORM_OPERATOR_REVOKE === 'true',
  };
}

const given = inputs();
const email = (given.email || '').trim().toLowerCase();
const roleKey = (given.role || '').trim();
const revoke = given.revoke === true;

async function listing(prisma) {
  const [operators, roles] = await Promise.all([
    prisma.platformOperator.findMany({
      select: { email: true, displayName: true, status: true, roles: { select: { role: { select: { key: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.platformRole.findMany({
      select: { key: true, displayName: true, permissions: { select: { permission: { select: { key: true } } } } },
      orderBy: { key: 'asc' },
    }),
  ]);
  return {
    operators: operators.map((operator) => ({
      email: operator.email, name: operator.displayName, status: operator.status,
      roles: operator.roles.map((grant) => grant.role.key),
    })),
    roles: roles.map((role) => ({
      key: role.key, displayName: role.displayName,
      permissions: role.permissions.map((entry) => entry.permission.key).sort(),
    })),
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    if (!email || !roleKey) {
      const catalog = await listing(prisma);
      console.log(JSON.stringify({
        ...catalog,
        nextStep: 'Re-run with PLATFORM_ROLE_GRANT_B64 set to base64 of {"email":"...","role":"..."}.',
        note: 'There is no universal admin. platform_owner holds no schools.*, plugins.*, customers.*, or orders.* — customer school management lives in marketplace_operator.',
      }, null, 2));
      return;
    }

    const operator = await prisma.platformOperator.findUnique({ where: { email }, select: { id: true, email: true, displayName: true } });
    if (!operator) {
      const catalog = await listing(prisma);
      throw new Error(`No operator matches ${email}. Existing operators: ${catalog.operators.map((row) => row.email).join(', ') || 'none'}`);
    }
    const role = await prisma.platformRole.findUnique({ where: { key: roleKey }, select: { id: true, key: true, displayName: true } });
    if (!role) {
      const catalog = await listing(prisma);
      throw new Error(`Unknown role ${roleKey}. Available roles: ${catalog.roles.map((row) => row.key).join(', ')}`);
    }

    if (revoke) {
      /** An operator with no roles can still sign in and sees an empty console, which is the
       * intended shape of "access removed" here — this script never deletes the account. */
      const removed = await prisma.platformOperatorRole.deleteMany({ where: { operatorId: operator.id, roleId: role.id } });
      if (removed.count === 0) throw new Error(`${email} does not hold ${roleKey}`);
    } else {
      await prisma.platformOperatorRole.upsert({
        where: { operatorId_roleId: { operatorId: operator.id, roleId: role.id } },
        create: { operatorId: operator.id, roleId: role.id },
        update: {},
      });
    }

    await prisma.platformAuditEvent.create({
      data: {
        operatorId: operator.id,
        action: revoke ? 'platform_operator_role_revoked' : 'platform_operator_role_granted',
        success: true, targetType: 'PlatformOperator', targetId: operator.id,
        reason: 'Applied through grant-platform-operator-role.js with deploy access',
        metadata: { role: role.key, via: 'cli' },
      },
    });

    const after = await prisma.platformOperator.findUnique({
      where: { id: operator.id },
      select: { email: true, roles: { select: { role: { select: { key: true } } } } },
    });
    console.log(JSON.stringify({
      [revoke ? 'revoked' : 'granted']: role.key,
      operator: after.email,
      rolesNow: after.roles.map((grant) => grant.role.key).sort(),
      nextStep: 'Sign out and back in: permissions are resolved per request, but the console reads them once at page load.',
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
