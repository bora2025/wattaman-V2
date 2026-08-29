'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const blueprintPath = arg('blueprint');
const slug = arg('school-slug');
const schoolName = arg('school-name');
const workspace = arg('workspace');
const execute = process.argv.includes('--execute');
if (!blueprintPath || !slug || !schoolName) throw new Error('--blueprint, --school-slug, and --school-name are required');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('school slug must be lowercase kebab-case');
if (execute && arg('confirm-slug') !== slug) throw new Error('--confirm-slug must exactly match --school-slug for execution');

const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
if (blueprint.invariants?.tenancy !== 'one-school-per-project') throw new Error('Blueprint does not enforce one-school-per-project');
for (const name of ['api', 'web', 'gateway']) {
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(blueprint.services?.[name]?.image || '')) throw new Error(`${name} image is not digest-pinned`);
}

const projectName = `Wattanam - ${schoolName} - Production`;
const plan = [
  ['init', '--name', projectName, ...(workspace ? ['--workspace', workspace] : []), '--json'],
  ['add', '--database', 'postgres', '--json'],
  ['add', '--image', blueprint.services.api.image, '--service', 'api', '--json'],
  ['add', '--image', blueprint.services.web.image, '--service', 'web', '--json'],
  ['add', '--image', blueprint.services.gateway.image, '--service', 'gateway', '--json'],
  ['volume', 'add', '--service', 'api', '--mount-path', '/data', '--json'],
  ['domain', '--service', 'gateway', '--port', '8080', '--json'],
];

if (!execute) {
  process.stdout.write(`${JSON.stringify({ mode: 'dry-run', projectName, slug, release: blueprint.release, commands: plan.map((parts) => ['railway', ...parts]) }, null, 2)}\n`);
  process.exit(0);
}

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `wattanam-${slug}-`));
const journal = { schemaVersion: 1, slug, projectName, release: blueprint.release, startedAt: new Date().toISOString(), steps: [] };
function railway(args, input) {
  const result = spawnSync(process.platform === 'win32' ? 'railway.cmd' : 'railway', args, { cwd: workdir, input, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`Railway command failed (${args[0]}): ${(result.stderr || result.stdout).trim()}`);
  journal.steps.push({ command: args[0], completedAt: new Date().toISOString() });
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}
function setSecret(service, key, value) {
  railway(['variable', 'set', key, '--stdin', '--service', service, '--skip-deploys', '--json'], `${value}\n`);
}
function setVariables(service, values) {
  const pairs = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  railway(['variable', 'set', ...pairs, '--service', service, '--skip-deploys', '--json']);
}

try {
  const project = railway(plan[0]);
  journal.projectId = project.id || project.projectId;
  railway(plan[1]); railway(plan[2]); railway(plan[3]); railway(plan[4]); railway(plan[5]);
  const domainResult = railway(plan[6]);
  const domain = domainResult.domain || domainResult.serviceDomain || domainResult.url;
  if (!domain) throw new Error('Railway did not return the generated gateway domain');
  setSecret('api', 'JWT_SECRET', crypto.randomBytes(48).toString('base64url'));
  setVariables('api', {
    NODE_ENV: 'production', PORT: '3001', APP_VERSION: blueprint.release.version, GIT_COMMIT: blueprint.release.commit,
    DATABASE_URL: '${{Postgres.DATABASE_URL}}', CORS_ORIGINS: `https://${domain}`, COOKIE_SECURE: 'true',
    BACKUP_DIR: '/data/backups', PLUGIN_DIR: '/data/plugins', PLUGIN_DATA_DIR: '/data/plugin-data',
  });
  setVariables('web', { NODE_ENV: 'production', PORT: '3000', API_URL: 'http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001', NEXT_PUBLIC_API_URL: '' });
  setVariables('gateway', { API_UPSTREAM: '${{api.RAILWAY_PRIVATE_DOMAIN}}:3001', WEB_UPSTREAM: '${{web.RAILWAY_PRIVATE_DOMAIN}}:3000' });
  journal.gatewayOrigin = `https://${domain}`;
  journal.completedAt = new Date().toISOString();
  fs.writeFileSync(path.resolve(`railway-school-${slug}.journal.json`), `${JSON.stringify(journal, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ projectId: journal.projectId, gatewayOrigin: journal.gatewayOrigin, journal: `railway-school-${slug}.journal.json` })}\n`);
} catch (error) {
  journal.failedAt = new Date().toISOString();
  journal.error = error instanceof Error ? error.message : String(error);
  fs.writeFileSync(path.resolve(`railway-school-${slug}.failed.json`), `${JSON.stringify(journal, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  throw error;
}
