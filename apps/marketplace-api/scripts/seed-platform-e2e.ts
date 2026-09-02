/**
 * Fixture data for the operator control plane's browser E2E suite (PA2-6 / PA3-8).
 *
 * Two things it must produce that no production seed would:
 *   1. Operators whose TOTP secret is *known to the test*, so a spec can sign in as a
 *      customer_support or finance_operator identity and prove the navigation and API surface
 *      really do differ per role. Enrollment itself is exercised separately by the bootstrapped
 *      owner, who is deliberately left un-enrolled.
 *   2. Enough marketplace records that every list, detail, filter, and CSV export renders real
 *      rows -- an empty table passes a naive assertion without proving anything.
 *
 * Secrets are written to --out for the test process to read; they are throwaway credentials for a
 * disposable database and never touch a real environment.
 *
 * Run from apps/marketplace-api:
 *   DATABASE_URL=... npx tsx scripts/seed-platform-e2e.ts --out <path>
 */
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { generateTotpSecret, hashPassword } from '../src/identity-crypto';
import { encryptSecret, parseSecretEncryptionKeys } from '../src/secret-encryption';
import { seedRbac } from './bootstrap-platform-owner';

const encryptionKeys = parseSecretEncryptionKeys(
  process.env.IDENTITY_ENCRYPTION_KEYS_JSON,
  process.env.IDENTITY_ENCRYPTION_ACTIVE_KEY_ID,
);

/** Operators the matrix specs sign in as. Each is pre-enrolled so a spec spends its time on the
 * authorization question it exists to answer rather than re-walking enrollment. */
const OPERATORS = [
  // A second Platform Owner, pre-enrolled. The bootstrapped owner is left un-enrolled so the
  // mandatory-enrollment journey has a genuine first-time operator to walk through, which leaves
  // nobody to exercise the owner's own permission set — hence this one.
  { email: 'owner2@e2e.test', displayName: 'E2E Second Owner', password: 'E2ESecondOwnerPass123!', roles: ['platform_owner'] },
  { email: 'support@e2e.test', displayName: 'E2E Support', password: 'E2ESupportPass123!', roles: ['customer_support'] },
  { email: 'finance@e2e.test', displayName: 'E2E Finance', password: 'E2EFinancePass123!', roles: ['finance_operator'] },
  { email: 'auditor@e2e.test', displayName: 'E2E Auditor', password: 'E2EAuditorPass123!', roles: ['auditor'] },
  { email: 'reviewer@e2e.test', displayName: 'E2E Reviewer', password: 'E2EReviewerPass123!', roles: ['plugin_reviewer'] },
  // Two marketplace operators, because the exceptional-entitlement path is deliberately impossible
  // for one person to complete alone.
  { email: 'ops1@e2e.test', displayName: 'E2E Operator One', password: 'E2EOpsOnePass123!', roles: ['marketplace_operator'] },
  { email: 'ops2@e2e.test', displayName: 'E2E Operator Two', password: 'E2EOpsTwoPass123!', roles: ['marketplace_operator'] },
  // No roles at all: proves the shell degrades to "ask an owner for a role" instead of showing a
  // navigation tree the operator cannot actually use.
  { email: 'norole@e2e.test', displayName: 'E2E Unassigned', password: 'E2ENoRolePass123!', roles: [] as string[] },
];

/** Deliberately hostile school label; the export must emit it as inert text. */
const FORMULA_LABEL = '=SUM(1+1)';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function seedOperators(prisma: PrismaClient) {
  const created: Array<{ email: string; password: string; totpSecret: string; roles: string[] }> = [];
  for (const definition of OPERATORS) {
    const totpSecret = generateTotpSecret();
    const passwordHash = await hashPassword(definition.password);
    const roleIds: string[] = [];
    for (const key of definition.roles) {
      const role = await prisma.platformRole.findUnique({ where: { key } });
      if (!role) throw new Error(`Unknown platform role ${key}`);
      roleIds.push(role.id);
    }
    await prisma.platformOperator.upsert({
      where: { email: definition.email },
      update: {},
      create: {
        email: definition.email,
        displayName: definition.displayName,
        passwordHash,
        mfaEnabled: true,
        mfaSecret: encryptSecret(totpSecret, encryptionKeys),
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
    });
    created.push({ email: definition.email, password: definition.password, totpSecret, roles: definition.roles });
  }
  return created;
}

async function seedMarketplace(prisma: PrismaClient) {
  const publisher = await prisma.publisher.upsert({
    where: { slug: 'e2e-publisher' },
    update: {},
    create: { slug: 'e2e-publisher', displayName: 'E2E Publishing Co', status: 'VERIFIED' },
  });

  const plugin = await prisma.marketplacePlugin.upsert({
    where: { id: 'com.e2e.gradebook' },
    update: {},
    create: {
      id: 'com.e2e.gradebook',
      publisherId: publisher.id,
      name: 'E2E Gradebook',
      description: 'Fixture plugin for the operator control plane browser suite.',
      license: 'Commercial',
      isPaid: true,
      status: 'APPROVED',
    },
  });

  const freePlugin = await prisma.marketplacePlugin.upsert({
    where: { id: 'com.e2e.attendance' },
    update: {},
    create: {
      id: 'com.e2e.attendance',
      publisherId: publisher.id,
      name: 'E2E Attendance',
      description: 'Second fixture plugin, free, so catalog listings have more than one row.',
      license: 'MIT',
      isPaid: false,
      status: 'APPROVED',
    },
  });

  // A paid plugin with no entitlement yet, so a school asking for free access to it exercises the
  // two-person exception path rather than the ordinary free-approval path.
  const paidPlugin = await prisma.marketplacePlugin.upsert({
    where: { id: 'com.e2e.reporting' },
    update: {},
    create: {
      id: 'com.e2e.reporting',
      publisherId: publisher.id,
      name: 'E2E Reporting',
      description: 'Paid fixture plugin used by the exceptional-entitlement journey.',
      license: 'Commercial',
      isPaid: true,
      status: 'APPROVED',
    },
  });

  const existingPrice = await prisma.productPrice.findFirst({ where: { pluginId: plugin.id } });
  const price = existingPrice ?? await prisma.productPrice.create({
    data: {
      pluginId: plugin.id, currency: 'USD', amountMinor: 4500, licensedMajor: 1,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  for (const [target, version] of [[plugin, '1.2.0'], [freePlugin, '0.9.0']] as const) {
    const pluginVersion = await prisma.pluginVersion.upsert({
      where: { pluginId_version_channel: { pluginId: target.id, version, channel: 'STABLE' } },
      update: {},
      create: {
        pluginId: target.id, version, requiresCore: '>=1.0.0', channel: 'STABLE', reviewStatus: 'APPROVED',
        manifestJson: { id: target.id, version, name: target.name },
        changelog: 'Fixture release.', publishedAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    });
    const sha256 = createHash('sha256').update(`${target.id}@${version}`).digest('hex');
    await prisma.packageArtifact.upsert({
      where: { pluginVersionId: pluginVersion.id },
      update: {},
      create: {
        pluginVersionId: pluginVersion.id, sha256, sizeBytes: 20480,
        storageKey: `e2e/${target.id}-${version}.wtp`, publisherKeyId: 'e2e-publisher-key-1',
      },
    });
  }

  const account = await prisma.marketplaceAccount.upsert({
    where: { email: 'principal@school.e2e' },
    update: {},
    create: {
      email: 'principal@school.e2e', displayName: 'E2E School Principal',
      passwordHash: await hashPassword('E2ECustomerPass123!'), emailVerifiedAt: new Date(),
    },
  });

  const installation = await prisma.installationRegistration.upsert({
    where: { installationId: 'e2e-installation-0001' },
    update: {},
    create: {
      installationId: 'e2e-installation-0001', accountId: account.id,
      label: 'Kampot Demo High School', lastSeenAt: new Date(),
    },
  });

  await prisma.installationMarketplaceGrant.upsert({
    where: { installationRegistrationId: installation.id },
    update: {},
    create: {
      installationRegistrationId: installation.id, accountId: account.id, scope: 'COMMERCE_PROXY',
      consentedAt: new Date(), expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    },
  });

  // A second, unlinked installation so the "Marketplace link" filter has both sides to select.
  await prisma.installationRegistration.upsert({
    where: { installationId: 'e2e-installation-0002' },
    update: {},
    create: { installationId: 'e2e-installation-0002', label: 'Battambang Pilot School' },
  });

  // A school label is operator-supplied text that ends up in a CSV an operator opens in Excel.
  // Seeding a formula here means the export spec can prove the cell is neutralized rather than
  // trusting that it is.
  await prisma.installationRegistration.upsert({
    where: { installationId: 'e2e-installation-0003' },
    update: {},
    create: { installationId: 'e2e-installation-0003', label: FORMULA_LABEL },
  });

  const pendingOrder = await prisma.marketplaceOrder.upsert({
    where: { idempotencyKey: 'e2e-order-pending' },
    update: {},
    create: {
      accountId: account.id, installationId: installation.id, status: 'PENDING',
      currency: 'USD', totalMinor: 4500, idempotencyKey: 'e2e-order-pending',
      lines: { create: [{ pluginId: plugin.id, priceId: price.id, unitPriceMinor: 4500 }] },
    },
  });

  const paidOrder = await prisma.marketplaceOrder.upsert({
    where: { idempotencyKey: 'e2e-order-paid' },
    update: {},
    create: {
      accountId: account.id, installationId: installation.id, status: 'PAID',
      currency: 'USD', totalMinor: 4500, idempotencyKey: 'e2e-order-paid',
      lines: { create: [{ pluginId: plugin.id, priceId: price.id, unitPriceMinor: 4500 }] },
    },
  });

  await prisma.installationEntitlement.upsert({
    where: { installationId_pluginId: { installationId: installation.id, pluginId: plugin.id } },
    update: {},
    create: {
      installationId: installation.id, pluginId: plugin.id, status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      updatesThrough: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      tokenId: 'e2e-entitlement-token-1',
      // Shape only: nothing in the operator read surface verifies this signature, and minting a
      // real one here would just be re-testing the entitlement signer.
      signedToken: { payload: { installationId: installation.id, pluginId: plugin.id }, note: 'fixture' },
    },
  });

  await prisma.securityAdvisory.upsert({
    where: { id: 'WTN-E2E-0001' },
    update: {},
    create: {
      id: 'WTN-E2E-0001', pluginId: plugin.id, title: 'Fixture advisory for the E2E suite',
      severity: 'MODERATE', affectedVersions: '<1.2.0', fixedVersion: '1.2.0',
      description: 'Present so the advisories screen and the dashboard counter render a real row.',
      recommendedAction: 'WARN',
    },
  });

  async function upsertRequest(pluginId: string, justification: string) {
    const existing = await prisma.schoolPluginRequest.findFirst({ where: { installationId: installation.id, pluginId } });
    return existing ?? prisma.schoolPluginRequest.create({
      data: {
        accountId: account.id, installationId: installation.id, pluginId,
        type: 'FREE_APPROVAL', status: 'SUBMITTED', justification,
        intendedUsers: 240, contactEmail: 'principal@school.e2e',
        slaDueAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      },
    });
  }

  const request = await upsertRequest(freePlugin.id, 'Attendance tracking is required before the new term starts.');
  const paidAccessRequest = await upsertRequest(
    paidPlugin.id,
    'A provincial pilot school cannot fund the reporting licence this year and is asking for a waiver.',
  );

  return {
    formulaLabel: FORMULA_LABEL,
    publisherId: publisher.id,
    pluginId: plugin.id,
    freePluginId: freePlugin.id,
    paidPluginId: paidPlugin.id,
    accountId: account.id,
    installationRecordId: installation.id,
    installationId: installation.installationId,
    installationLabel: installation.label,
    pendingOrderId: pendingOrder.id,
    paidOrderId: paidOrder.id,
    pluginRequestId: request.id,
    paidAccessRequestId: paidAccessRequest.id,
  };
}

async function main() {
  if (encryptionKeys.length === 0) {
    throw new Error('Set IDENTITY_ENCRYPTION_KEYS_JSON and IDENTITY_ENCRYPTION_ACTIVE_KEY_ID so seeded MFA secrets are stored the way production stores them');
  }
  const prisma = new PrismaClient();
  try {
    await seedRbac(prisma);
    const operators = await seedOperators(prisma);
    const marketplace = await seedMarketplace(prisma);
    // A pre-existing audit row guarantees the audit screen and its CSV export have content even
    // before the running suite generates any of its own.
    await prisma.platformAuditEvent.create({
      data: { action: 'platform_e2e_fixture_seeded', success: true, targetType: 'Fixture', targetId: randomUUID() },
    });

    const out = flag('out');
    if (out) writeFileSync(out, JSON.stringify({ operators, marketplace }, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ operators: operators.map((entry) => entry.email), marketplace }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
