'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const bcrypt = require('bcryptjs');
const { buildReport, querySnapshot } = require('./legacy-preflight');
const { postgresEnvironment } = require('./db-toolkit');

function assertFixtureTarget(env = process.env) {
  if (env.ALLOW_SYNTHETIC_LEGACY_FIXTURE !== 'true') throw new Error('ALLOW_SYNTHETIC_LEGACY_FIXTURE=true is required');
  if (!env.ADOPT_DATABASE_URL?.trim()) throw new Error('ADOPT_DATABASE_URL is required');
  if (env.ADOPT_DATABASE_URL === env.DATABASE_URL) throw new Error('synthetic legacy fixture refuses the primary DATABASE_URL');
}

function run(command, args, env) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

async function main() {
  assertFixtureTarget();
  const environment = postgresEnvironment(process.env.ADOPT_DATABASE_URL);
  const before = buildReport(querySnapshot(environment));
  if (before.state !== 'empty') throw new Error(`synthetic fixture target must be empty; found ${before.state}`);
  run('psql', ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', path.join(process.cwd(), 'prisma/migrations/20260827000000_baseline/migration.sql')], environment);
  const passwordHash = await bcrypt.hash(`fixture-${Date.now()}-Password1`, 12);
  run('psql', [
    '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--set', 'owner_hash=' + passwordHash,
    '--command', `INSERT INTO "User" ("id","email","password","name","role","createdAt","updatedAt") VALUES ('legacy-owner-fixture','legacy-owner@example.invalid', :'owner_hash','Legacy Fixture Owner','SUPER_ADMIN',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
  ], environment);
  const after = buildReport(querySnapshot(environment));
  if (after.state !== 'legacy_unadopted') throw new Error(`fixture did not produce legacy_unadopted state; found ${after.state}`);
  process.stdout.write(`${JSON.stringify(after, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => { process.stderr.write(`ERROR: synthetic legacy fixture failed: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}

module.exports = { assertFixtureTarget };
