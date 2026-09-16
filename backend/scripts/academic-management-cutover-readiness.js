'use strict';

// Read-only gate. A passing report is evidence for a controlled drill, not permission to switch
// production routing: other Academic Management consumers still use legacy academic storage.
const fs = require('node:fs');
const path = require('node:path');
const { inspect, TARGET_TABLES } = require('./academic-management-adoption-preflight');
const { journalPaths } = require('./academic-management-adopt');
const { verifyRecoveryBackup } = require('./document-designer-adopt');
const { loadJournal } = require('./plugin-adoption-toolkit');

async function check({ adapter, directory, backupName, slug }) {
  const backup = verifyRecoveryBackup(directory, backupName, slug);
  const files = journalPaths(directory, slug);
  const source = await inspect(adapter);
  const blockers = source.blockers.filter((item) => !item.endsWith('is not empty'));
  const targetsExist = source.target.tables.every((table) => table.exists);
  const target = targetsExist ? await inspect({
    readDepartmentChunk: adapter.readTargetDepartmentChunk,
    readMembershipChunk: adapter.readTargetMembershipChunk,
    targetState: async () => TARGET_TABLES.map((table) => ({ table, exists: true, rowCount: 0 })),
  }) : null;
  if (target) {
    blockers.push(...target.blockers);
    if (source.source.departmentCount !== target.source.departmentCount ||
        source.source.membershipCount !== target.source.membershipCount ||
        source.source.sha256 !== target.source.sha256) blockers.push('academic source and target fingerprints/counts differ');
  }
  const identity = `academic:${slug}:${source.source.sha256}:${backup.sha256}`;
  const journalStages = {};
  for (const [phase, file] of [['departments', files.departments], ['memberships', files.memberships]]) {
    if (!fs.existsSync(file)) { blockers.push(`${phase} adoption journal is absent`); continue; }
    try {
      const journal = loadJournal(file, `${identity}:${phase}`);
      journalStages[phase] = journal.stage;
      if (journal.backupSha256 !== backup.sha256 || journal.stage !== 'reconciled') {
        blockers.push(`${phase} journal is not reconciled against the verified backup`);
      }
    } catch { blockers.push(`${phase} adoption journal identity is invalid`); }
  }
  const installation = await adapter.pluginState();
  if (installation?.status !== 'active') blockers.push('Academic Management plugin is not active');
  if (fs.existsSync(files.maintenance)) blockers.push('plugin adoption maintenance lock is still present');
  return {
    format: 'wattanam-academic-management-cutover-readiness-v1', readOnly: true,
    ready: blockers.length === 0, blockers, schoolSlug: slug,
    source: source.source, target: target?.source ?? null,
    backup: { file: path.basename(backup.archive), sha256: backup.sha256 },
    journals: journalStages, plugin: { status: installation?.status ?? 'absent', version: installation?.version ?? null },
    warning: 'Passing parity does not certify full Academic Management extraction, dual-write consistency, or production cutover',
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const directory = process.env.BACKUP_DIR;
  if (!directory || !path.isAbsolute(directory)) throw new Error('absolute BACKUP_DIR is required');
  const slug = process.env.ACADEMIC_SCHOOL_SLUG;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '') || slug.length > 80) throw new Error('ACADEMIC_SCHOOL_SLUG is invalid');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const departmentTable = TARGET_TABLES[0];
  const membershipTable = TARGET_TABLES[1];
  const adapter = {
    readDepartmentChunk: ({ after, limit }) => prisma.department.findMany({ ...(after ? { cursor: { id: after }, skip: 1 } : {}), orderBy: { id: 'asc' }, take: limit, select: { id: true, name: true, nameKh: true, description: true } }),
    readMembershipChunk: ({ after, limit }) => prisma.user.findMany({ where: { departmentId: { not: null } }, ...(after ? { cursor: { id: after }, skip: 1 } : {}), orderBy: { id: 'asc' }, take: limit, select: { id: true, departmentId: true } }).then((rows) => rows.map((row) => ({ userId: row.id, departmentId: row.departmentId }))),
    readTargetDepartmentChunk: ({ after, limit }) => prisma.$queryRawUnsafe(`SELECT "id","name","nameKh","description" FROM "${departmentTable}" WHERE "id" > $1 ORDER BY "id" LIMIT $2`, after || '', limit),
    readTargetMembershipChunk: ({ after, limit }) => prisma.$queryRawUnsafe(`SELECT "userId","departmentId" FROM "${membershipTable}" WHERE "userId" > $1 ORDER BY "userId" LIMIT $2`, after || '', limit),
    targetState: async (tables) => Promise.all(tables.map(async (table) => { const found = await prisma.$queryRawUnsafe(`SELECT to_regclass('public.${table}') IS NOT NULL AS "exists"`); const exists = found[0]?.exists === true; const counts = exists ? await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "${table}"`) : []; return { table, exists, rowCount: exists ? Number(counts[0]?.count || 0) : 0 }; })),
    pluginState: () => prisma.pluginInstallation.findUnique({ where: { id: 'wattanam.academic-management' }, select: { status: true, version: true } }),
  };
  try {
    const report = await check({ adapter, directory, backupName: process.env.ACADEMIC_BACKUP_FILE, slug });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ready) process.exitCode = 2;
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) main().catch((error) => { process.stderr.write(`Academic cutover check failed: ${error.message}\n`); process.exitCode = 1; });
module.exports = { check };
