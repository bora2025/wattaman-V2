'use strict';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function validateCoreReleaseInput(version, releaseNotes) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version || '')) {
    throw new Error('version must be a stable semantic version such as 0.2.0; the workflow adds the beta channel');
  }
  const notes = (releaseNotes || '').trim();
  if (!notes) throw new Error('release notes are required');
  if (notes.length > 50_000) throw new Error('release notes must not exceed 50000 characters');
  return { version, channel: 'BETA', imageTag: `${version}-beta`, releaseNotes: notes };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(validateCoreReleaseInput(arg('version'), arg('release-notes')))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { validateCoreReleaseInput };
