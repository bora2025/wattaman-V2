'use strict';

const fs = require('fs');
const crypto = require('crypto');

const file = process.argv[2];
if (!file) throw new Error('Usage: node tools/verify-school-release.js <school-release.json>');
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
if (value.schemaVersion !== 1 || value.invariants?.tenancy !== 'one-school-per-project') throw new Error('Unsupported school release blueprint');
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.release?.repository || '')) throw new Error('Release repository identity is missing');
if (value.release?.workflowRef !== `${value.release.repository}/.github/workflows/core-release.yml@refs/heads/main`) throw new Error('Release workflow identity is invalid');
if (JSON.stringify(value.invariants.publicServices) !== JSON.stringify(['gateway'])) throw new Error('Gateway must be the only public service');
for (const name of ['api', 'web', 'gateway']) {
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(value.services?.[name]?.image || '')) throw new Error(`${name} is not digest-pinned`);
}
if (value.services.api.volume !== '/data' || value.services.postgres.volume !== '/var/lib/postgresql/data') throw new Error('Required persistent volume is missing');
if (value.services.api.variables.DATABASE_URL !== '${{Postgres.DATABASE_URL}}') throw new Error('API must use the project-local PostgreSQL service');
if (value.services.api.variables.WATTANAM_DISTRIBUTION !== 'core') throw new Error('API distribution must be core');
if (value.services.web.variables.WATTANAM_DISTRIBUTION !== 'core' || value.services.web.variables.NEXT_PUBLIC_WATTANAM_DISTRIBUTION !== 'core') throw new Error('Web distribution must be core');
if (!value.services.api.variables.JWT_SECRET.includes('secret(')) throw new Error('JWT secret must be generated per deployment');
if (value.services.api.variables.CORS_ORIGINS !== 'https://${{gateway.RAILWAY_PUBLIC_DOMAIN}}') throw new Error('CORS must bind to the public gateway origin');
if (value.services.api.variables.PUBLIC_APP_URL !== 'https://${{gateway.RAILWAY_PUBLIC_DOMAIN}}') throw new Error('Public app URL must bind to the public gateway origin');
const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
process.stdout.write(`${JSON.stringify({ valid: true, sha256: digest, version: value.release.version })}\n`);
