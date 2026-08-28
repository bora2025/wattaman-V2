'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { execFileSync } = require('child_process');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`--${name} is required`);
  return process.argv[index + 1];
}
const version = argument('version');
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('version must be semantic versioning');
const images = { api: argument('api'), web: argument('web'), gateway: argument('gateway') };
for (const value of Object.values(images)) if (!/^.+@sha256:[a-f0-9]{64}$/.test(value)) throw new Error('Every image must be immutable by sha256 digest');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const evidence = {
  schemaVersion: 1, version, channel: argument('channel'),
  source: { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), repository: process.env.GITHUB_REPOSITORY || null },
  images,
  lockfiles: {
    backend: sha256('backend/package-lock.json'), frontend: sha256('frontend/package-lock.json'),
    marketplace: sha256('apps/marketplace-api/package-lock.json'),
  },
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(argument('output'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
