'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yazl = require('yazl');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function walk(directory, root = directory) {
  const output = [];
  for (const name of fs.readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${absolute}`);
    if (stat.isDirectory()) output.push(...walk(absolute, root));
    else if (stat.isFile()) {
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (!['checksums.json', 'signature.json'].includes(relative) && !relative.endsWith('.wtp')) output.push({ absolute, relative });
    }
  }
  return output;
}

async function packPlugin({ source, privateKeyFile, keyId, output }) {
  const sourceRoot = path.resolve(source);
  const outputFile = path.resolve(output);
  const entries = walk(sourceRoot);
  if (!entries.some((entry) => entry.relative === 'plugin.json')) throw new Error('plugin.json is required');
  const files = new Map(entries.map((entry) => [entry.relative, fs.readFileSync(entry.absolute)]));
  const checksumMap = {};
  for (const name of [...files.keys()].sort()) checksumMap[name] = sha256(files.get(name));
  const checksums = Buffer.from(`${JSON.stringify({ algorithm: 'sha256', files: checksumMap }, null, 2)}\n`);
  const manifest = JSON.parse(files.get('plugin.json').toString('utf8'));
  const privateKey = fs.readFileSync(path.resolve(privateKeyFile), 'utf8');
  const signature = Buffer.from(`${JSON.stringify({
    algorithm: 'ed25519', publisher: manifest.publisher, keyId,
    signature: crypto.sign(null, checksums, privateKey).toString('base64'),
  }, null, 2)}\n`);

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const archive = new yazl.ZipFile();
  const stableTime = new Date('1980-01-01T00:00:00.000Z');
  for (const name of [...files.keys()].sort()) archive.addBuffer(files.get(name), name, { mtime: stableTime, mode: 0o100640 });
  archive.addBuffer(checksums, 'checksums.json', { mtime: stableTime, mode: 0o100640 });
  archive.addBuffer(signature, 'signature.json', { mtime: stableTime, mode: 0o100640 });
  archive.end();
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(outputFile, { mode: 0o600 });
    archive.outputStream.pipe(stream).on('close', resolve).on('error', reject);
    archive.outputStream.on('error', reject);
  });
  return { output: outputFile, sha256: sha256(fs.readFileSync(outputFile)), publisher: manifest.publisher, version: manifest.version };
}

if (require.main === module) {
  const value = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
  if (process.argv.includes('--help')) {
    process.stdout.write('Usage: node scripts/plugin-package.js --source <directory> --private-key <pem> --key-id <id> --out <plugin.wtp>\n');
    process.exit(0);
  }
  const source = value('--source');
  const privateKeyFile = value('--private-key');
  const keyId = value('--key-id');
  const output = value('--out');
  if (!source || !privateKeyFile || !keyId || !output) throw new Error('Missing required package argument; use --help');
  packPlugin({ source, privateKeyFile, keyId, output })
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`ERROR: ${error.message}\n`); process.exit(1); });
}

module.exports = { packPlugin };
