'use strict';

// B-012: restores a recovery-set journal produced by backup-recovery-set.js --
// the database (via the existing, unchanged restore-database.js) plus the
// plugin-files and plugin-data archives, into a fresh or in-place target.
// Verifies every checksum against the journal before touching anything, and
// again after extraction, matching restore-database.js's verify-first pattern.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  fail, pluginDataDirectory, pluginDirectory, sha256, tar, verifyDirectoryChecksums,
} = require('./db-toolkit');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv.includes('--help')) {
  process.stdout.write(
    'Usage: node scripts/restore-recovery-set.js --from <journal.json> --confirm-target <school-slug|EMPTY> --yes-replace ' +
    '[--use-restore-database-url] [--plugin-dir <dir>] [--plugin-data-dir <dir>]\n',
  );
  process.exit(0);
}

if (process.env.PLUGIN_STORAGE_PROVIDER === 's3') {
  fail('restore into S3 requires a local staging target; use PLUGIN_STORAGE_PROVIDER=dual-local-primary, restore, then run local-to-s3 migration and cut over');
}

const journalArg = argument('--from');
const confirmation = argument('--confirm-target');
if (!journalArg || !confirmation || !process.argv.includes('--yes-replace')) fail('restore requires --from, --confirm-target, and --yes-replace');

const journalPath = path.resolve(journalArg);
if (!fs.existsSync(journalPath)) fail('recovery-set journal does not exist');
let journal;
try { journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')); } catch { fail('recovery-set journal is invalid JSON'); }
if (journal.format !== 'wattanam-recovery-set-v1') fail('unsupported recovery-set journal format');

const directory = path.dirname(journalPath);
const databaseArchive = path.join(directory, journal.database.file);
const pluginFilesArchive = path.join(directory, journal.pluginFiles.archive.file);
const pluginDataArchive = path.join(directory, journal.pluginData.archive.file);

process.stderr.write('Verifying recovery-set archives against the journal...\n');
for (const [file, expected, label] of [
  [databaseArchive, journal.database.sha256, 'database'],
  [pluginFilesArchive, journal.pluginFiles.archive.sha256, 'plugin-files'],
  [pluginDataArchive, journal.pluginData.archive.sha256, 'plugin-data'],
]) {
  if (!fs.existsSync(file)) fail(`recovery-set ${label} archive is missing: ${file}`);
  if (sha256(file) !== expected) fail(`recovery-set ${label} archive checksum mismatch`);
}

process.stderr.write('Restoring database...\n');
const restoreArgs = [path.join(__dirname, 'restore-database.js'), '--from', databaseArchive, '--confirm-target', confirmation, '--yes-replace'];
if (process.argv.includes('--use-restore-database-url')) restoreArgs.push('--use-restore-database-url');
const dbRestore = spawnSync(process.execPath, restoreArgs, { env: process.env, encoding: 'utf8', stdio: 'inherit' });
if (dbRestore.error) fail(`restore-database.js could not start: ${dbRestore.error.message}`);
if (dbRestore.status !== 0) fail('database restore failed; plugin files were not touched');

const pluginTarget = argument('--plugin-dir') ? path.resolve(argument('--plugin-dir')) : pluginDirectory();
const pluginDataTarget = argument('--plugin-data-dir') ? path.resolve(argument('--plugin-data-dir')) : pluginDataDirectory();

process.stderr.write(`Extracting plugin files into ${pluginTarget}...\n`);
fs.mkdirSync(pluginTarget, { recursive: true, mode: 0o750 });
tar(['-xf', pluginFilesArchive, '-C', pluginTarget]);
verifyDirectoryChecksums(pluginTarget, journal.pluginFiles.checksums);

process.stderr.write(`Extracting plugin data into ${pluginDataTarget}...\n`);
fs.mkdirSync(pluginDataTarget, { recursive: true, mode: 0o750 });
tar(['-xf', pluginDataArchive, '-C', pluginDataTarget]);
verifyDirectoryChecksums(pluginDataTarget, journal.pluginData.checksums);

process.stdout.write(`Recovery set restored: database, ${Object.keys(journal.pluginFiles.checksums.files).length} plugin file(s), ${Object.keys(journal.pluginData.checksums.files).length} plugin data file(s)\n`);
