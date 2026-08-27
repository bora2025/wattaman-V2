import { generateKeyPairSync } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { PluginPackageVerifier } from './plugin-package';

const { packPlugin } = require('../../scripts/plugin-package');

describe('plugin packaging tool', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wattanam-pack-test-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('packages and verifies the announcements reference source', async () => {
    const keys = generateKeyPairSync('ed25519');
    const privateKey = path.join(directory, 'private.pem');
    const output = path.join(directory, 'announcements.wtp');
    const secondOutput = path.join(directory, 'announcements-second.wtp');
    await fs.writeFile(privateKey, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));

    const packed = await packPlugin({
      source: path.resolve(__dirname, '../../../plugins/announcements'),
      privateKeyFile: privateKey,
      keyId: 'test-key',
      output,
    });
    const result = await new PluginPackageVerifier().verify(
      await fs.readFile(output),
      { wattanam: { 'test-key': keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() } },
      '0.1.0',
    );
    const second = await packPlugin({
      source: path.resolve(__dirname, '../../../plugins/announcements'),
      privateKeyFile: privateKey,
      keyId: 'test-key',
      output: secondOutput,
    });

    expect(packed.sha256).toBe(result.packageSha256);
    expect(second.sha256).toBe(packed.sha256);
    expect(result.manifest.id).toBe('wattanam.announcements');
    expect(result.files.has('backend/index.js')).toBe(true);
  });
});
