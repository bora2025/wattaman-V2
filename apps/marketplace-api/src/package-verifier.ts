import { createHash, verify as verifySignature } from 'node:crypto';
import semver from 'semver';
import yauzl from 'yauzl';
import { z } from 'zod';
import { HttpError } from './http-error';

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/).max(100),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  version: z.string().refine((value) => semver.valid(value) !== null, 'invalid semantic version'),
  requiresCore: z.string().refine((value) => semver.validRange(value) !== null, 'invalid core range'),
  publisher: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/).max(100),
  license: z.string().min(1).max(80),
  backendEntry: z.string().optional(),
  frontendEntry: z.string().optional(),
  sdkVersion: z.string().optional(),
  runtimeVersion: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  dependencies: z.record(z.string()).default({}),
  optionalDependencies: z.record(z.string()).default({}),
  migrations: z.array(z.object({ id: z.string(), path: z.string(), checksum: z.string().regex(/^[a-f0-9]{64}$/), destructive: z.boolean().default(false) })).default([]),
  navigation: z.array(z.unknown()).default([]),
  supportedLanguages: z.array(z.string()).default([]),
}).passthrough();

type Manifest = z.infer<typeof manifestSchema>;

type SignatureFile = { algorithm: string; publisher: string; keyId: string; signature: string };
type ChecksumsFile = { algorithm: string; files: Record<string, string> };

const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const safePath = (name: string) => !!name && !name.startsWith('/') && !name.includes('\\') && !name.includes('\0') && !name.split('/').includes('..');

function parseJson<T>(value: Buffer | undefined, name: string): T {
  if (!value) throw new HttpError(400, `Package is missing ${name}`);
  try { return JSON.parse(value.toString('utf8')) as T; }
  catch { throw new HttpError(400, `${name} is invalid JSON`); }
}

export type VerifiedRelease = { manifest: Manifest; sha256: string; sizeBytes: number; publisherKeyId: string; analysisSignals: { embeddedSecret: boolean; commandExecution: boolean; files: string[] } };

export async function verifyPluginPackage(buffer: Buffer, publisherKeys: Map<string, Map<string, string>>, maximum: number): Promise<VerifiedRelease> {
  if (!buffer.length || buffer.length > maximum) throw new HttpError(400, 'Package is empty or exceeds the artifact limit');
  const files = await readZip(buffer, maximum);
  const manifestResult = manifestSchema.safeParse(parseJson(files.get('plugin.json'), 'plugin.json'));
  if (!manifestResult.success) throw new HttpError(400, `Invalid plugin manifest: ${manifestResult.error.issues[0]?.message}`);
  const manifest = manifestResult.data;
  if (manifest.id !== manifest.publisher && !manifest.id.startsWith(`${manifest.publisher}.`) && !manifest.id.startsWith(`${manifest.publisher}-`)) {
    throw new HttpError(400, 'Plugin id is not namespaced by its publisher');
  }
  if (manifest.permissions.some((permission) => !permission.startsWith(`${manifest.id}.`))) {
    throw new HttpError(400, 'Plugin permissions are not namespaced by plugin id');
  }
  for (const [dependency, range] of Object.entries(manifest.dependencies)) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(dependency) || !semver.validRange(range)) {
      throw new HttpError(400, `Invalid plugin dependency: ${dependency}`);
    }
  }
  for (const [dependency, range] of Object.entries(manifest.optionalDependencies)) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(dependency) || !semver.validRange(range) || dependency in manifest.dependencies) {
      throw new HttpError(400, `Invalid optional plugin dependency: ${dependency}`);
    }
  }

  const checksums = parseJson<ChecksumsFile>(files.get('checksums.json'), 'checksums.json');
  if (checksums.algorithm !== 'sha256' || !checksums.files || typeof checksums.files !== 'object') throw new HttpError(400, 'Invalid checksum manifest');
  const expected = Object.keys(checksums.files).sort();
  const actual = [...files.keys()].filter((name) => name !== 'checksums.json' && name !== 'signature.json').sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new HttpError(400, 'Archive contents do not exactly match checksums');
  for (const [name, checksum] of Object.entries(checksums.files)) {
    if (!/^[a-f0-9]{64}$/.test(checksum) || !files.get(name) || sha256(files.get(name)!) !== checksum) {
      throw new HttpError(400, `Checksum verification failed for ${name}`);
    }
  }
  for (const entry of [manifest.backendEntry, manifest.frontendEntry].filter(Boolean) as string[]) {
    if (!files.has(entry)) throw new HttpError(400, `Plugin entry file is missing: ${entry}`);
  }
  for (const migration of manifest.migrations) {
    const content = files.get(migration.path);
    if (!content || sha256(content) !== migration.checksum) throw new HttpError(400, `Plugin migration checksum does not match manifest: ${migration.id}`);
  }
  const signature = parseJson<SignatureFile>(files.get('signature.json'), 'signature.json');
  const key = publisherKeys.get(manifest.publisher)?.get(signature.keyId);
  if (signature.algorithm !== 'ed25519' || signature.publisher !== manifest.publisher || !key) throw new HttpError(403, 'Publisher signature is not trusted');
  let valid = false;
  try { valid = verifySignature(null, files.get('checksums.json')!, key, Buffer.from(signature.signature, 'base64')); } catch { valid = false; }
  if (!valid) throw new HttpError(403, 'Publisher signature is invalid');
  const sourceText = [...files.entries()].filter(([name]) => !['signature.json', 'checksums.json'].includes(name)).map(([, value]) => value.toString('utf8')).join('\n');
  return {
    manifest, sha256: sha256(buffer), sizeBytes: buffer.length, publisherKeyId: signature.keyId,
    analysisSignals: {
      embeddedSecret: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}/.test(sourceText),
      commandExecution: /child_process|powershell(?:\.exe)?|cmd\.exe|eval\s*\(/i.test(sourceText),
      files: [...files.keys()].sort(),
    },
  };
}

function readZip(buffer: Buffer, maximum: number): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) return reject(new HttpError(400, `Invalid WTP archive: ${error?.message || 'unknown error'}`));
      const files = new Map<string, Buffer>();
      let total = 0;
      let settled = false;
      const fail = (cause: unknown) => { if (!settled) { settled = true; zip.close(); reject(cause); } };
      zip.on('error', (cause) => fail(new HttpError(400, `Invalid WTP archive: ${cause.message}`)));
      zip.on('end', () => { if (!settled) { settled = true; resolve(files); } });
      zip.on('entry', (entry) => {
        if (!safePath(entry.fileName)) return fail(new HttpError(400, `Unsafe archive path: ${entry.fileName}`));
        if (entry.fileName.endsWith('/')) return zip.readEntry();
        const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
        if ((mode & 0o170000) === 0o120000) return fail(new HttpError(400, 'Archive symlinks are forbidden'));
        if (files.has(entry.fileName)) return fail(new HttpError(400, `Duplicate archive path: ${entry.fileName}`));
        total += entry.uncompressedSize;
        if (total > maximum) return fail(new HttpError(400, 'Unpacked package exceeds the artifact limit'));
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail(new HttpError(400, `Cannot read ${entry.fileName}`));
          const chunks: Buffer[] = [];
          stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on('error', fail);
          stream.on('end', () => { files.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}
