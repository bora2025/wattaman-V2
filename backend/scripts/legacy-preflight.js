'use strict';

const crypto = require('crypto');
const { postgresEnvironment, run } = require('./db-toolkit');

const BASELINE = '20260827000000_baseline';
const LEGACY_ANCHORS = ['User', 'Class', 'Student'];

function classify(snapshot) {
  const tables = new Set(snapshot.tables || []);
  const migrations = new Set(snapshot.migrations || []);
  if (tables.size === 0) {
    return { state: 'empty', nextAction: 'migrate_deploy', safeToMutate: true };
  }
  if (migrations.has(BASELINE)) {
    return { state: 'managed', nextAction: 'migrate_deploy', safeToMutate: true };
  }
  const anchors = LEGACY_ANCHORS.filter((name) => tables.has(name));
  if (anchors.length === LEGACY_ANCHORS.length && !tables.has('_prisma_migrations')) {
    return { state: 'legacy_unadopted', nextAction: 'schema_diff_backup_restore_then_adopt', safeToMutate: false };
  }
  return {
    state: 'unsupported_partial',
    nextAction: 'stop_and_review',
    safeToMutate: false,
    missingLegacyAnchors: LEGACY_ANCHORS.filter((name) => !tables.has(name)),
  };
}

function fingerprint(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify({
    tables: [...(snapshot.tables || [])].sort(),
    columns: [...(snapshot.columns || [])].sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`)),
    constraints: [...(snapshot.constraints || [])].sort(),
  })).digest('hex');
}

function querySnapshot(environment) {
  const sql = `
WITH public_tables AS (
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
), public_columns AS (
  SELECT table_name, column_name, data_type, is_nullable, ordinal_position, COALESCE(column_default, '') AS column_default
  FROM information_schema.columns WHERE table_schema = 'public'
), public_constraints AS (
  SELECT table_name || ':' || constraint_name || ':' || constraint_type AS value
  FROM information_schema.table_constraints WHERE table_schema = 'public'
)
SELECT json_build_object(
  'databaseVersion', current_setting('server_version'),
  'databaseBytes', pg_database_size(current_database()),
  'tables', COALESCE((SELECT json_agg(table_name ORDER BY table_name) FROM public_tables), '[]'::json),
  'columns', COALESCE((SELECT json_agg(json_build_object('table', table_name, 'column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) ORDER BY table_name, ordinal_position) FROM public_columns), '[]'::json),
  'constraints', COALESCE((SELECT json_agg(value ORDER BY value) FROM public_constraints), '[]'::json)
)::text;`;
  const readOnlyEnvironment = {
    ...environment,
    PGOPTIONS: `${environment.PGOPTIONS || ''} -c default_transaction_read_only=on`.trim(),
  };
  const output = run('psql', ['--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', sql], readOnlyEnvironment, true);
  const line = output.split(/\r?\n/).map((value) => value.trim()).find((value) => value.startsWith('{'));
  if (!line) throw new Error('PostgreSQL preflight did not return a metadata snapshot');
  const snapshot = JSON.parse(line);
  snapshot.migrations = [];
  if (snapshot.tables.includes('_prisma_migrations')) {
    const migrationOutput = run('psql', ['--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', 'SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name'], readOnlyEnvironment, true);
    snapshot.migrations = migrationOutput.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  }
  return snapshot;
}

function buildReport(snapshot) {
  const result = classify(snapshot);
  return {
    format: 'wattanam-legacy-preflight-v1',
    generatedAt: new Date().toISOString(),
    state: result.state,
    nextAction: result.nextAction,
    safeToMutate: result.safeToMutate,
    missingLegacyAnchors: result.missingLegacyAnchors || [],
    databaseVersion: snapshot.databaseVersion,
    databaseBytes: snapshot.databaseBytes,
    tableCount: (snapshot.tables || []).length,
    columnCount: (snapshot.columns || []).length,
    migrationCount: (snapshot.migrations || []).length,
    appliedMigrations: snapshot.migrations || [],
    schemaFingerprint: fingerprint(snapshot),
    containsCustomerRows: false,
  };
}

function main() {
  const useValidationTarget = process.argv.includes('--use-restore-database-url');
  if (useValidationTarget && !process.env.RESTORE_DATABASE_URL) throw new Error('RESTORE_DATABASE_URL is required with --use-restore-database-url');
  const report = buildReport(querySnapshot(postgresEnvironment(useValidationTarget ? process.env.RESTORE_DATABASE_URL : process.env.DATABASE_URL)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.state === 'unsupported_partial') process.exitCode = 2;
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(`ERROR: legacy preflight failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { BASELINE, LEGACY_ANCHORS, buildReport, classify, fingerprint, querySnapshot };
