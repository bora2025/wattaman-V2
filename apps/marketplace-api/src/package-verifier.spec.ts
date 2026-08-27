import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import yazl from 'yazl';
import { verifyPluginPackage } from './package-verifier';

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const trusted = new Map([['wattanam', new Map([['official-test', publicKey]])]]);

const manifest = {
  schemaVersion: 1, id: 'wattanam.announcements', name: 'Announcements', description: 'Official announcements.',
  version: '1.0.0', requiresCore: '>=0.1.0 <1.0.0', publisher: 'wattanam', license: 'commercial',
  capabilities: ['events.subscribe'], permissions: ['wattanam.announcements.read'], dependencies: {},
};

const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');

async function zip(entries: Record<string, Buffer>) {
  const archive = new yazl.ZipFile();
  for (const [name, value] of Object.entries(entries)) archive.addBuffer(value, name);
  archive.end();
  const chunks: Buffer[] = [];
  for await (const chunk of archive.outputStream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function fixture(change: 'none' | 'tamper' | 'extra' | 'wrong-key' = 'none') {
  const pluginJson = Buffer.from(JSON.stringify(manifest));
  const backend = Buffer.from('module.exports = {};');
  const checksums = Buffer.from(JSON.stringify({ algorithm: 'sha256', files: { 'backend/index.js': digest(backend), 'plugin.json': digest(pluginJson) } }));
  const signingKey = change === 'wrong-key' ? generateKeyPairSync('ed25519').privateKey : keys.privateKey;
  const signature = Buffer.from(JSON.stringify({ algorithm: 'ed25519', publisher: 'wattanam', keyId: 'official-test', signature: sign(null, checksums, signingKey).toString('base64') }));
  return zip({
    'plugin.json': pluginJson,
    'backend/index.js': change === 'tamper' ? Buffer.from('changed') : backend,
    'checksums.json': checksums,
    'signature.json': signature,
    ...(change === 'extra' ? { 'extra.txt': Buffer.from('unsigned') } : {}),
  });
}

describe('marketplace publication verifier', () => {
  it('accepts an exactly checksummed package signed by the named publisher', async () => {
    const result = await verifyPluginPackage(await fixture(), trusted, 1024 * 1024);
    expect(result.manifest.id).toBe('wattanam.announcements');
    expect(result.publisherKeyId).toBe('official-test');
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ['tamper', 'Checksum verification failed'],
    ['extra', 'exactly match'],
    ['wrong-key', 'signature is invalid'],
  ] as const)('rejects %s packages', async (change, message) => {
    await expect(verifyPluginPackage(await fixture(change), trusted, 1024 * 1024)).rejects.toThrow(message);
  });

  it('does not trust a key with the same id under another publisher', async () => {
    const wrongScope = new Map([['another-publisher', trusted.get('wattanam')!]]);
    await expect(verifyPluginPackage(await fixture(), wrongScope, 1024 * 1024)).rejects.toThrow('not trusted');
  });
});
