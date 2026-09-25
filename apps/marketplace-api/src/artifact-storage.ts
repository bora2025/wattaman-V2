import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdir, open, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { MarketplaceConfig } from './config';

export interface ArtifactStorage {
  readonly provider: 'local' | 's3';
  putImmutable(sha256: string, value: Buffer): Promise<string>;
  open(storageKey: string): Promise<Readable>;
}

export function artifactKey(sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Artifact digest is invalid');
  return `sha256/${sha256.slice(0, 2)}/${sha256}.wtp`;
}

export class LocalArtifactStorage implements ArtifactStorage {
  readonly provider = 'local' as const;
  constructor(private readonly root: string) {}
  async putImmutable(sha256: string, value: Buffer) {
    if (createHash('sha256').update(value).digest('hex') !== sha256) throw new Error('Artifact bytes do not match their digest');
    const key = artifactKey(sha256); const destination = path.join(this.root, ...key.split('/')); const temporary = `${destination}.${process.pid}.${Date.now()}.partial`;
    await mkdir(path.dirname(destination), { recursive: true });
    try { await writeFile(temporary, value, { flag: 'wx', mode: 0o640 }); await link(temporary, destination); }
    catch (error: any) { if (error?.code !== 'EEXIST') throw error; const existing = await open(destination, 'r'); try { const bytes = await existing.readFile(); if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Immutable artifact key contains different bytes'); } finally { await existing.close(); } }
    finally { await unlink(temporary).catch(() => undefined); }
    return key;
  }
  async open(storageKey: string) { const expectedRoot = path.resolve(this.root); const target = path.resolve(this.root, ...storageKey.split('/')); if (!target.startsWith(`${expectedRoot}${path.sep}`)) throw new Error('Artifact storage key is unsafe'); return createReadStream(target); }
}

export class S3ArtifactStorage implements ArtifactStorage {
  readonly provider = 's3' as const;
  constructor(
    private readonly settings: NonNullable<MarketplaceConfig['artifactS3']>,
    private readonly client: S3Client = new S3Client({ region: settings.region, endpoint: settings.endpoint, forcePathStyle: settings.forcePathStyle, credentials: settings.accessKeyId ? { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey! } : undefined }),
  ) {}
  private async verifyExisting(key: string, sha256: string, byteLength: number) {
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.settings.bucket, Key: key }));
    if (head.Metadata?.sha256 !== sha256 || Number(head.ContentLength) !== byteLength) throw new Error('Immutable artifact key contains different metadata');
  }
  async putImmutable(sha256: string, value: Buffer) {
    if (createHash('sha256').update(value).digest('hex') !== sha256) throw new Error('Artifact bytes do not match their digest');
    const key = artifactKey(sha256);
    try { await this.verifyExisting(key, sha256, value.length); return key; }
    catch (error: any) { if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound') throw error; }
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.settings.bucket, Key: key, Body: value, ContentType: 'application/vnd.wattanam.plugin+zip', CacheControl: 'public, max-age=31536000, immutable', Metadata: { sha256 }, ChecksumSHA256: createHash('sha256').update(value).digest('base64'), IfNoneMatch: '*' }));
    } catch (error: any) {
      // Another API instance may win the create-only race after our HEAD. Treat that as an
      // idempotent success only after independently verifying the immutable winner.
      if (error?.$metadata?.httpStatusCode !== 412 && error?.name !== 'PreconditionFailed') throw error;
      await this.verifyExisting(key, sha256, value.length);
    }
    return key;
  }
  async open(storageKey: string) { const result = await this.client.send(new GetObjectCommand({ Bucket: this.settings.bucket, Key: storageKey, ChecksumMode: 'ENABLED' })); if (!result.Body) throw new Error('Artifact body is missing'); return result.Body as Readable; }
}

export function createArtifactStorage(config: MarketplaceConfig): ArtifactStorage { return config.artifactProvider === 's3' && config.artifactS3 ? new S3ArtifactStorage(config.artifactS3) : new LocalArtifactStorage(config.artifactPath); }
