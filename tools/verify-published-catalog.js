'use strict';

const { createHash, verify } = require('node:crypto');
const { canonicalJson } = require('../packages/marketplace-contracts/src');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function json(url, headers = {}) {
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url.pathname} returned ${response.status}`);
  return response.json();
}

async function main() {
  const base = new URL(required('MARKETPLACE_URL'));
  const coreVersion = required('CORE_VERSION');
  const auth = process.env.MARKETPLACE_DOWNLOAD_TOKEN?.trim();
  const keys = await json(new URL('/v1/repository-key', base));
  const envelope = await json(new URL(`/v1/index?coreVersion=${encodeURIComponent(coreVersion)}&channel=stable`, base));
  const publicKeys = new Map((keys.keys || []).map((entry) => [entry.keyId, entry.publicKeyPem]));
  const signatures = envelope.signatures || (envelope.signature ? [envelope.signature] : []);
  const payloadBytes = Buffer.from(canonicalJson(envelope.payload), 'utf8');
  const valid = signatures.some((signature) => signature.algorithm === 'ed25519'
    && publicKeys.has(signature.keyId)
    && verify(null, payloadBytes, publicKeys.get(signature.keyId), Buffer.from(signature.value, 'base64')));
  if (!valid) throw new Error('Published repository index has no valid signature from the advertised key set');

  const seen = new Set();
  let verifiedArtifacts = 0;
  for (const release of envelope.payload.pluginReleases || []) {
    const identity = `${release.pluginId}@${release.version}:${release.channel}`;
    if (seen.has(identity)) throw new Error(`Duplicate published release: ${identity}`);
    seen.add(identity);
    if (release.manifest?.id !== release.pluginId || release.manifest?.version !== release.version) {
      throw new Error(`Manifest identity mismatch for ${identity}`);
    }
    const headers = auth ? { authorization: `Bearer ${auth}` } : {};
    const response = await fetch(release.downloadUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (response.status === 401 || response.status === 403) {
      if (release.paid && !auth) continue;
      throw new Error(`Artifact access unexpectedly denied for ${identity}`);
    }
    if (!response.ok) throw new Error(`Artifact download failed for ${identity}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== release.sha256) throw new Error(`Artifact digest mismatch for ${identity}`);
    verifiedArtifacts += 1;
  }
  if (!seen.size) throw new Error('Published stable catalog is empty');
  process.stdout.write(JSON.stringify({ status: 'passed', releases: seen.size, verifiedArtifacts, activeKeyId: keys.activeKeyId }) + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
