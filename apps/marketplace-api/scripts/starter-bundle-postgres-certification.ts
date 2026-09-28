import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { StarterBundleService } from '../src/starter-bundle.service';

const prisma = new PrismaClient();
const runId = randomUUID();
const suffix = runId.slice(0, 8);
const publisherSlug = `cert-bundles-${suffix}`;
const operatorEmail = `starter-bundle-${suffix}@certification.invalid`;
const pluginIds = [`cert.free-${suffix}`, `cert.paid-${suffix}`];
let publisherId: string | undefined;
let operatorId: string | undefined;
let bundleId: string | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Starter-bundle PostgreSQL certification failed: ${message}`);
}

async function cleanup() {
  if (bundleId) await prisma.starterBundle.deleteMany({ where: { id: bundleId } });
  await prisma.packageArtifact.deleteMany({ where: { pluginVersion: { pluginId: { in: pluginIds } } } });
  await prisma.pluginVersion.deleteMany({ where: { pluginId: { in: pluginIds } } });
  await prisma.productPrice.deleteMany({ where: { pluginId: { in: pluginIds } } });
  await prisma.marketplacePlugin.deleteMany({ where: { id: { in: pluginIds } } });
  if (publisherId) await prisma.publisher.deleteMany({ where: { id: publisherId } });
  await prisma.platformAuditEvent.deleteMany({ where: { correlationId: runId } });
  if (operatorId) await prisma.platformOperator.deleteMany({ where: { id: operatorId } });
}

async function main() {
  assert(process.env.DATABASE_URL?.startsWith('postgresql://') || process.env.DATABASE_URL?.startsWith('postgres://'), 'DATABASE_URL must point to PostgreSQL');
  const publisher = await prisma.publisher.create({
    data: { slug: publisherSlug, displayName: 'Starter Bundle Certification', status: 'VERIFIED' },
  });
  publisherId = publisher.id;
  const operator = await prisma.platformOperator.create({
    data: { email: operatorEmail, displayName: 'Starter Bundle Certification', passwordHash: 'certification-only' },
  });
  operatorId = operator.id;

  for (const [index, pluginId] of pluginIds.entries()) {
    await prisma.marketplacePlugin.create({
      data: {
        id: pluginId, publisherId: publisher.id, name: index ? 'Paid Certification Plugin' : 'Free Certification Plugin',
        description: 'Disposable starter-bundle certification fixture.', license: 'Commercial',
        isPaid: index === 1, status: 'APPROVED',
        versions: { create: {
          version: '1.0.0', requiresCore: '^1.0.0', channel: 'STABLE', reviewStatus: 'APPROVED',
          publishedAt: new Date(), manifestJson: { id: pluginId, version: '1.0.0' },
          artifact: { create: {
            sha256: createHash('sha256').update(`${runId}:${pluginId}`).digest('hex'), sizeBytes: 1024,
            storageKey: `certification/${runId}/${pluginId}.wtp`,
            publisherKeyId: 'certification-key',
          } },
        } },
        ...(index === 1 ? { prices: { create: {
          currency: 'USD', amountMinor: 2500, licensedMajor: 1, validFrom: new Date('2020-01-01T00:00:00Z'),
        } } } : {}),
      },
    });
  }

  const actor = {
    operatorId: operator.id, reason: 'Disposable PostgreSQL certification',
    context: { correlationId: runId, ip: '127.0.0.1', userAgent: 'starter-bundle-certification' },
  };
  const service = new StarterBundleService(prisma);
  const created = await service.create({
    slug: `certified-school-${suffix}`, name: 'Certified School', description: 'Disposable certification bundle.',
    items: pluginIds.map((pluginId) => ({ pluginId, versionRange: '^1.0.0', required: true })),
  }, actor);
  bundleId = created.id;
  assert(created.status === 'DRAFT', 'new bundle must be DRAFT');
  assert(created.items.length === 2, 'both independent plugin members must persist');

  const published = await service.publish(created.id, actor);
  assert(published.status === 'APPROVED', 'bundle must publish after release validation');
  const catalog = await service.catalog('1.4.0', 'USD');
  const resolved = catalog.find((candidate) => candidate.id === created.id);
  assert(resolved?.plugins.length === 2, 'published bundle must be discoverable');
  assert(resolved.plugins.every((plugin) => plugin.compatible && plugin.version === '1.0.0'), 'members must resolve independently to compatible releases');
  assert(resolved.plugins[0].paid === false && !resolved.plugins[0].price, 'free member must remain free');
  assert(resolved.plugins[1].paid === true && resolved.plugins[1].price?.amountMinor === 2500, 'paid member must expose its normal price');

  await service.withdraw(created.id, actor);
  const afterWithdrawal = await service.catalog('1.4.0', 'USD');
  assert(!afterWithdrawal.some((candidate) => candidate.id === created.id), 'withdrawn bundle must leave the public catalog');
  const audits = await prisma.platformAuditEvent.findMany({ where: { correlationId: runId }, orderBy: { createdAt: 'asc' } });
  assert(audits.map((event) => event.action).join(',') === 'starter_bundle_created,starter_bundle_published,starter_bundle_withdrawn', 'all lifecycle mutations must be audited');
  console.log(JSON.stringify({ status: 'passed', bundleId: created.id, members: pluginIds.length, audits: audits.length }));
}

main()
  .finally(async () => { await cleanup(); await prisma.$disconnect(); })
  .catch((error) => { console.error(error); process.exitCode = 1; });
