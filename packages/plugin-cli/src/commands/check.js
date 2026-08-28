'use strict';

const fs = require('fs');
const path = require('path');
const { sha256 } = require('../util');

/**
 * The compatibility test kit: validates a plugin directory the same way the
 * real backend verifier would, plus a local activate() smoke test -- all
 * without a running backend. Throws (rather than calling process.exit
 * itself) on any failure, so it stays a plain, testable function; bin/cli.js
 * is the only place that turns a thrown error into a process exit code.
 */
async function run(argv) {
  const dir = argv[0];
  if (!dir || argv.includes('--help')) {
    process.stdout.write('Usage: wattanam-plugin check <plugin-directory>\n');
    if (!dir) throw new Error('Missing required <plugin-directory> argument');
    return;
  }
  const root = path.resolve(dir);
  // eslint-disable-next-line global-require
  const { parsePluginManifest, createTestContext } = require('@wattanam/plugin-sdk');

  let failures = 0;
  const check = (label, ok, detail) => {
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` -- ${detail}` : ''}\n`);
    if (!ok) failures += 1;
  };

  const manifestPath = path.join(root, 'plugin.json');
  let manifest;
  if (!fs.existsSync(manifestPath)) {
    check('plugin.json exists', false, root);
  } else {
    try {
      manifest = parsePluginManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
      check('plugin.json is a valid manifest', true);
    } catch (error) {
      check('plugin.json is a valid manifest', false, error.message);
    }
  }

  if (manifest) {
    for (const migration of manifest.migrations) {
      const migrationFile = path.join(root, migration.path);
      if (!fs.existsSync(migrationFile)) { check(`migration file exists: ${migration.path}`, false); continue; }
      check(`migration file exists: ${migration.path}`, true);
      const actual = sha256(fs.readFileSync(migrationFile));
      check(`migration checksum matches plugin.json: ${migration.id}`, actual === migration.checksum, actual === migration.checksum ? undefined : `expected ${migration.checksum}, got ${actual}`);
    }

    for (const entry of [manifest.backendEntry, manifest.frontendEntry].filter(Boolean)) {
      check(`entry file exists: ${entry}`, fs.existsSync(path.join(root, entry)));
    }

    if (manifest.backendEntry) {
      const entryPath = path.resolve(root, manifest.backendEntry);
      let plugin;
      try {
        delete require.cache[require.resolve(entryPath)];
        // eslint-disable-next-line global-require, import/no-dynamic-require
        plugin = require(entryPath);
        check('backend entry exports { id, activate }', Boolean(plugin) && plugin.id === manifest.id && typeof plugin.activate === 'function', plugin ? `id=${plugin.id}` : 'module has no exports');
      } catch (error) {
        check('backend entry loads without throwing', false, error.message);
      }
      if (plugin && typeof plugin.activate === 'function') {
        try {
          const harness = createTestContext();
          await plugin.activate(harness.context);
          check('activate(context) runs against the local harness without throwing', true);
        } catch (error) {
          check('activate(context) runs against the local harness without throwing', false, error.message);
        }
      }
    }
  }

  process.stdout.write(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

module.exports = { run };
