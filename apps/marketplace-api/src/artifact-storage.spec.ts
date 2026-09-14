import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { artifactKey, LocalArtifactStorage } from './artifact-storage';

async function consume(stream: NodeJS.ReadableStream) { const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }

describe('content-addressed artifact storage', () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), 'wattanam-artifacts-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('derives the immutable object key only from SHA-256 and round-trips bytes', async () => {
    const bytes = Buffer.from('signed plugin bytes'); const sha256 = createHash('sha256').update(bytes).digest('hex'); const storage = new LocalArtifactStorage(root);
    const key = await storage.putImmutable(sha256, bytes);
    expect(key).toBe(`sha256/${sha256.slice(0, 2)}/${sha256}.wtp`);
    expect(await consume(await storage.open(key))).toEqual(bytes);
    await expect(storage.putImmutable(sha256, bytes)).resolves.toBe(key);
  });

  it('rejects digest mismatch and existing-object corruption instead of overwriting', async () => {
    const bytes = Buffer.from('expected'); const sha256 = createHash('sha256').update(bytes).digest('hex'); const storage = new LocalArtifactStorage(root);
    await expect(storage.putImmutable('a'.repeat(64), bytes)).rejects.toThrow('digest');
    const target = path.join(root, ...artifactKey(sha256).split('/')); await storage.putImmutable(sha256, bytes); await writeFile(target, 'corrupt');
    await expect(storage.putImmutable(sha256, bytes)).rejects.toThrow('different bytes');
    await expect(readFile(target, 'utf8')).resolves.toBe('corrupt');
  });

  it('rejects invalid digests and unsafe read keys', async () => {
    const storage = new LocalArtifactStorage(root);
    expect(() => artifactKey('../escape')).toThrow('digest');
    await expect(storage.open('../escape')).rejects.toThrow('unsafe');
  });
});
