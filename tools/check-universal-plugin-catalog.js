'use strict';

const { readFileSync, readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = path.join(root, 'plugins');
const cli = path.join(root, 'packages', 'plugin-cli', 'bin', 'cli.js');
const { parsePluginManifest } = require('../packages/plugin-sdk/dist');
const pluginDirectories = readdirSync(catalog, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(catalog, entry.name))
  .sort();

function verifyCatalogContracts(manifests) {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const resolveOwner = (qualified) => [...byId.keys()].filter((id) => qualified.startsWith(`${id}.`)).sort((a, b) => b.length - a.length)[0];
  const compatible = (produced, accepted) => accepted.some((version) => produced.includes(version));
  for (const consumer of manifests) {
    for (const [qualified, accepted] of Object.entries(consumer.contracts?.readModels.reads || {})) {
      const owner = resolveOwner(qualified);
      if (!owner) throw new Error(`${consumer.id} consumes read model from an unknown plugin: ${qualified}`);
      if (owner !== consumer.id && !consumer.dependencies[owner] && !consumer.optionalDependencies[owner]) throw new Error(`${consumer.id} consumes ${qualified} without declaring ${owner} as a dependency`);
      const model = qualified.slice(owner.length + 1);
      const produced = byId.get(owner).contracts?.readModels.publishes?.[model] || [];
      if (!compatible(produced, accepted)) throw new Error(`${consumer.id} has no compatible version for read model ${qualified}`);
    }
    for (const [event, accepted] of Object.entries(consumer.contracts?.events.subscribes || {})) {
      const owner = resolveOwner(event);
      if (!owner) throw new Error(`${consumer.id} subscribes to an event from an unknown plugin: ${event}`);
      if (owner !== consumer.id && !consumer.dependencies[owner] && !consumer.optionalDependencies[owner]) throw new Error(`${consumer.id} subscribes to ${event} without declaring ${owner} as a dependency`);
      const produced = byId.get(owner).contracts?.events.publishes?.[event] || [];
      if (!compatible(produced, accepted)) throw new Error(`${consumer.id} has no compatible version for event ${event}`);
    }
  }
}

function main() {
  if (!pluginDirectories.length) throw new Error('Official plugin catalog is empty');
  const failures = [];
  for (const directory of pluginDirectories) {
    const result = spawnSync(process.execPath, [cli, 'check', directory, '--require-universal-ui'], { cwd: root, encoding: 'utf8' });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.status !== 0) failures.push(path.basename(directory));
  }
  if (failures.length) throw new Error(`Official plugins failing the universal package contract: ${failures.join(', ')}`);
  const manifests = pluginDirectories.map((directory) => parsePluginManifest(JSON.parse(readFileSync(path.join(directory, 'plugin.json'), 'utf8'))));
  verifyCatalogContracts(manifests);
  process.stdout.write(`Universal plugin catalog verified: ${pluginDirectories.length} packages\n`);
}

if (require.main === module) main();

module.exports = { main, verifyCatalogContracts };
