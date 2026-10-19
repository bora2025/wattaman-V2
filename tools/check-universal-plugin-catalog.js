'use strict';

const { readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = path.join(root, 'plugins');
const cli = path.join(root, 'packages', 'plugin-cli', 'bin', 'cli.js');
const pluginDirectories = readdirSync(catalog, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(catalog, entry.name))
  .sort();

if (!pluginDirectories.length) throw new Error('Official plugin catalog is empty');

const failures = [];
for (const directory of pluginDirectories) {
  const result = spawnSync(process.execPath, [cli, 'check', directory, '--require-universal-ui'], {
    cwd: root,
    encoding: 'utf8',
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) failures.push(path.basename(directory));
}

if (failures.length) {
  throw new Error(`Official plugins failing the universal package contract: ${failures.join(', ')}`);
}

process.stdout.write(`Universal plugin catalog verified: ${pluginDirectories.length} packages\n`);
