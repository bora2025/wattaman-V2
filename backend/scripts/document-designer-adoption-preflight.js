'use strict';

// Read-only prerequisite for adopting legacy CardTemplate rows. It never creates a
// journal, backup, migration or plugin row. Do not use this report as cutover approval.
const crypto = require('crypto');

const TARGET_TABLE = 'plugin_wattanam_document_designer_template';
const TYPES = new Set(['student', 'staff', 'teacher-part-time', 'certificate-student', 'certificate-staff', 'qr-sheet', 'general']);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

async function inspect(adapter, { batchSize = 250 } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error('batchSize must be 1..1000');
  const hash = crypto.createHash('sha256');
  const blockers = [];
  const activeByType = new Map();
  const countsByType = Object.create(null);
  let cursor = null;
  let rowCount = 0;
  let designBytes = 0;
  let previousId = null;

  while (true) {
    const rows = await adapter.readSourceChunk({ after: cursor, limit: batchSize });
    if (!Array.isArray(rows) || rows.length > batchSize) throw new Error('source adapter returned an invalid chunk');
    if (!rows.length) break;
    for (const row of rows) {
      if (typeof row.id !== 'string' || !row.id || (previousId !== null && row.id <= previousId)) throw new Error('source rows must have strictly increasing IDs');
      previousId = row.id;
      rowCount++;
      countsByType[row.cardType] = (countsByType[row.cardType] || 0) + 1;
      if (!TYPES.has(row.cardType)) blockers.push(`unsupported cardType for template ${row.id}`);
      if (!row.design || typeof row.design !== 'object' || Array.isArray(row.design)) blockers.push(`invalid design for template ${row.id}`);
      if (row.design?.cardType && row.design.cardType !== row.cardType) blockers.push(`cardType/design mismatch for template ${row.id}`);
      if (row.name === '__active__') {
        const prior = activeByType.get(row.cardType);
        if (prior) blockers.push(`duplicate active templates for ${row.cardType}: ${prior}, ${row.id}`);
        activeByType.set(row.cardType, row.id);
      }
      const design = JSON.stringify(canonical(row.design));
      designBytes += Buffer.byteLength(design);
      hash.update(JSON.stringify([row.id, row.name, row.cardType, canonical(row.design), row.createdAt?.toISOString?.() || row.createdAt, row.updatedAt?.toISOString?.() || row.updatedAt]));
      hash.update('\n');
    }
    cursor = rows.at(-1).id;
  }

  const targetExists = await adapter.targetExists();
  if (!targetExists) blockers.push(`target table ${TARGET_TABLE} is absent; install the signed plugin first`);
  return {
    format: 'wattanam-document-designer-adoption-preflight-v1',
    readOnly: true, ready: blockers.length === 0, blockers,
    source: { rowCount, countsByType, activeByType: Object.fromEntries(activeByType), designBytes, sha256: hash.digest('hex') },
    target: { table: TARGET_TABLE, exists: targetExists },
    nextStep: 'Take a school-bound recovery backup; run the guarded copy only on a controlled environment before any cutover',
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const report = await inspect({
      readSourceChunk: ({ after, limit }) => prisma.cardTemplate.findMany({
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        orderBy: { id: 'asc' }, take: limit,
        select: { id: true, name: true, cardType: true, design: true, createdAt: true, updatedAt: true },
      }),
      targetExists: async () => {
        const rows = await prisma.$queryRawUnsafe(`SELECT to_regclass('public.${TARGET_TABLE}') IS NOT NULL AS "exists"`);
        return rows[0]?.exists === true;
      },
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ready) process.exitCode = 2;
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) main().catch((error) => { process.stderr.write(`Preflight failed: ${error.message}\n`); process.exitCode = 1; });
module.exports = { inspect, TARGET_TABLE, TYPES };
