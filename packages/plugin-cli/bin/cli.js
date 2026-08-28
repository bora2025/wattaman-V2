#!/usr/bin/env node
'use strict';

const commands = {
  init: require('../src/commands/init'),
  check: require('../src/commands/check'),
  keygen: require('../src/commands/keygen'),
  pack: require('../src/commands/pack'),
  publish: require('../src/commands/publish'),
};

const [, , name, ...rest] = process.argv;
const command = commands[name];
if (!command) {
  process.stdout.write(`wattanam-plugin -- Wattanam V2 plugin developer tooling\n\nCommands:\n  init <publisher>.<name>   Scaffold a new plugin project\n  check <dir>               Validate a plugin against the SDK 1.0 contract\n  keygen <dir>              Generate an Ed25519 signing keypair\n  pack --source ...         Package and sign a .wtp\n  publish --package ...     Submit a signed .wtp to an official repository\n\nRun any command with --help for its exact usage.\n`);
  process.exit(name ? 1 : 0);
}

Promise.resolve(command.run(rest)).catch((error) => {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
