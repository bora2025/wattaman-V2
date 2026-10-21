'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd || process.cwd(), env: options.env || process.env, stdio: 'inherit', shell: false });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
}

function gitHead(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(`Cannot resolve git commit for ${root}`);
  return result.stdout.trim();
}

function certify() {
  const marketplaceRoot = path.resolve(__dirname, '..');
  const customerRoot = path.resolve(process.env.CUSTOMER_SCHOOL_PATH || '');
  if (!process.env.CUSTOMER_SCHOOL_PATH || !fs.existsSync(path.join(customerRoot, 'backend', 'package.json'))) {
    throw new Error('CUSTOMER_SCHOOL_PATH must reference a released Customer School checkout');
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  run(npm, ['run', 'plugins:check:universal'], { cwd: marketplaceRoot });
  run(npm, ['run', 'test:official-plugins'], { cwd: marketplaceRoot });
  run(npm, ['test', '--', '--runInBand', 'src/plugins/all-plugin-package-lifecycle.spec.ts', 'src/plugins/plugin-ui-schema.spec.ts'], {
    cwd: path.join(customerRoot, 'backend'),
    env: { ...process.env, PLUGIN_SOURCE_CATALOG: path.join(marketplaceRoot, 'plugins') },
  });
  const evidence = {
    format: 'wattanam-plugin-release-certification-v1',
    certifiedAt: new Date().toISOString(),
    marketplaceCommit: gitHead(marketplaceRoot),
    customerSchoolCommit: gitHead(customerRoot),
    checks: ['universal-catalog', 'official-plugin-behavior', 'released-host-install-activate-lifecycle', 'universal-ui-schema'],
  };
  const output = path.resolve(process.env.PLUGIN_RELEASE_CERTIFICATION_OUT || path.join(marketplaceRoot, 'tmp', 'plugin-release-certification.json'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'w' });
  process.stdout.write(`Plugin release certification passed: ${output}\n`);
  return evidence;
}

if (require.main === module) {
  try { certify(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}

module.exports = { certify };
