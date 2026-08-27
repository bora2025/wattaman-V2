'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fail(message) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
}

function postgresEnvironment(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) fail('DATABASE_URL is required');
  let url;
  try { url = new URL(databaseUrl); } catch { fail('DATABASE_URL is not a valid URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) fail('DATABASE_URL must use PostgreSQL');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) fail('DATABASE_URL must include a database name');
  const sslMode = url.searchParams.get('sslmode');
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
    ...(sslMode ? { PGSSLMODE: sslMode } : {}),
  };
}

function run(command, args, environment, capture = false) {
  const result = spawnSync(command, args, {
    env: environment,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    fail(`${command} exited with status ${result.status}`);
  }
  return capture ? String(result.stdout || '').trim() : '';
}

function backupDirectory() {
  const directory = path.resolve(process.env.BACKUP_DIR || '/data/backups');
  if (directory === path.parse(directory).root) fail('BACKUP_DIR cannot be a filesystem root');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

function installationSlug(environment) {
  const sql = 'SELECT "schoolSlug" FROM "Installation" WHERE "id" = \'singleton\' LIMIT 1';
  const result = spawnSync('psql', ['--no-psqlrc', '--tuples-only', '--no-align', '--command', sql], {
    env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 ? String(result.stdout || '').trim() || null : null;
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

module.exports = { backupDirectory, fail, installationSlug, postgresEnvironment, run, sha256, timestamp };

