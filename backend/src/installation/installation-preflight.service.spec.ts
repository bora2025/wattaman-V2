import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import yazl from 'yazl';
import { InstallationPreflightService } from './installation-preflight.service';
import { PluginPackageVerifier } from '../plugins/plugin-package';

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function digest(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

async function zip(entries: Record<string, Buffer>): Promise<Buffer> {
  const archive = new yazl.ZipFile();
  for (const [name, value] of Object.entries(entries)) archive.addBuffer(value, name);
  archive.end();
  const chunks: Buffer[] = [];
  for await (const chunk of archive.outputStream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function pluginPackageBase64(options: { tamper?: boolean; incompatible?: boolean } = {}) {
  const manifest = {
    schemaVersion: 1, id: 'wattanam.noticeboard', name: 'Noticeboard', description: 'Test fixture plugin.',
    version: '1.0.0', requiresCore: options.incompatible ? '>=99.0.0' : '>=1.0.0-0 <2.0.0', publisher: 'wattanam',
    license: 'commercial', backendEntry: 'backend/index.js', capabilities: [], permissions: [], dependencies: {},
  };
  const pluginJson = Buffer.from(JSON.stringify(manifest));
  const backend = Buffer.from('module.exports = {};');
  const checksums = Buffer.from(JSON.stringify({
    algorithm: 'sha256',
    files: { 'backend/index.js': digest(backend), 'plugin.json': digest(pluginJson) },
  }));
  const signature = Buffer.from(JSON.stringify({
    algorithm: 'ed25519', publisher: 'wattanam', keyId: 'preflight-test',
    signature: sign(null, checksums, keys.privateKey).toString('base64'),
  }));
  const buffer = await zip({
    'plugin.json': pluginJson,
    'backend/index.js': options.tamper ? Buffer.from('tampered') : backend,
    'checksums.json': checksums,
    'signature.json': signature,
  });
  return buffer.toString('base64');
}

describe('InstallationPreflightService', () => {
  const originalEnvironment = process.env;
  let writableDir: string;
  let unwritablePath: string;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    writableDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wattanam-preflight-'));
    // A path that collides with an existing file can never become a writable directory.
    unwritablePath = path.join(writableDir, 'blocked-by-a-file');
    await fs.writeFile(unwritablePath, 'not a directory');
    process.env = {
      ...originalEnvironment,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost:5432/wattanam_test',
      APP_VERSION: '1.0.0-test',
      PLUGIN_TRUSTED_KEYS: JSON.stringify({ wattanam: { 'preflight-test': publicKey } }),
      BACKUP_DIR: writableDir,
      PLUGIN_DIR: writableDir,
      PLUGIN_DATA_DIR: writableDir,
    };
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(async () => {
    process.env = originalEnvironment;
    fetchSpy.mockRestore();
    await fs.rm(writableDir, { recursive: true, force: true });
  });

  function service(prismaOverrides: any = {}) {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]), ...prismaOverrides };
    return new InstallationPreflightService(prisma as any, new PluginPackageVerifier());
  }

  it('reports every check ok on a healthy target with no optional providers configured', async () => {
    const report = await service().run({ locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR' });
    expect(report.ok).toBe(true);
    const byName = Object.fromEntries(report.checks.map((c) => [c.name, c]));
    expect(byName.database.ok).toBe(true);
    expect(byName['storage:backup'].ok).toBe(true);
    expect(byName['storage:plugin'].ok).toBe(true);
    expect(byName['storage:pluginData'].ok).toBe(true);
    expect(byName.locale.ok).toBe(true);
    expect(byName.email).toEqual({ name: 'email', ok: true, detail: 'not configured' });
    expect(byName.sms).toEqual({ name: 'sms', ok: true, detail: 'not configured' });
    expect(byName.license.ok).toBe(true);
    expect(byName.license.detail).toMatch(/not yet accepted/);
  });

  it('fails overall when the database is unreachable', async () => {
    const report = await service({ $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')) })
      .run({ locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR' });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'database')).toMatchObject({ ok: false });
  });

  it('fails overall when a storage directory is not writable, but leaves the other two independent', async () => {
    process.env.PLUGIN_DIR = unwritablePath;
    const report = await service().run({ locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR' });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'storage:plugin')).toMatchObject({ ok: false });
    expect(report.checks.find((c) => c.name === 'storage:backup')).toMatchObject({ ok: true });
    expect(report.checks.find((c) => c.name === 'storage:pluginData')).toMatchObject({ ok: true });
  });

  it('reports invalid locale/timezone/currency without affecting overall ok', async () => {
    const report = await service().run({ locale: 'not-a-locale-!!', timezone: 'Invalid/Timezone', currency: 'ZZZ' });
    expect(report.ok).toBe(true);
    expect(report.checks.find((c) => c.name === 'locale')).toMatchObject({ ok: false });
  });

  it('reports a reachable SendGrid account as ok when configured', async () => {
    process.env.SENDGRID_API_KEY = 'a'.repeat(32);
    process.env.SENDGRID_FROM = 'noreply@example.com';
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    const report = await service().run({ locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR' });
    expect(report.checks.find((c) => c.name === 'email')).toMatchObject({ ok: true, detail: 'reachable' });
    expect(fetchSpy).toHaveBeenCalledWith('https://api.sendgrid.com/v3/user/account', expect.objectContaining({
      headers: { Authorization: `Bearer ${'a'.repeat(32)}` },
    }));
  });

  it('reports an unreachable/invalid SendGrid key without failing the overall report', async () => {
    process.env.SENDGRID_API_KEY = 'a'.repeat(32);
    fetchSpy.mockResolvedValue(new Response('{}', { status: 401 }));
    const report = await service().run({ locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR' });
    expect(report.ok).toBe(true);
    expect(report.checks.find((c) => c.name === 'email')).toMatchObject({ ok: false, detail: 'SendGrid returned 401' });
  });

  it('reports a reachable Twilio account as ok when configured', async () => {
    process.env.TWILIO_ACCOUNT_SID = `AC${'a'.repeat(32)}`;
    process.env.TWILIO_AUTH_TOKEN = 'b'.repeat(32);
    process.env.TWILIO_PHONE_NUMBER = '+15551234567';
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    const report = await service().run({ locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR' });
    expect(report.checks.find((c) => c.name === 'sms')).toMatchObject({ ok: true, detail: 'reachable' });
  });

  it('records license acceptance when provided', async () => {
    const report = await service().run({ locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR', acceptedLicenseVersion: 'terms-of-service-v1.0' });
    expect(report.checks.find((c) => c.name === 'license')).toMatchObject({ ok: true, detail: 'accepted terms-of-service-v1.0' });
  });

  it('makes no checks at all when no initial plugins were requested', async () => {
    const report = await service().run({ locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR' });
    expect(report.checks.some((c) => c.name.startsWith('initialPlugin:'))).toBe(false);
  });

  it('verifies a real signed, compatible initial plugin package without installing it', async () => {
    const report = await service().run({
      locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR',
      initialPlugins: [await pluginPackageBase64()],
    });
    expect(report.ok).toBe(true);
    expect(report.checks.find((c) => c.name === 'initialPlugin:0')).toMatchObject({
      ok: true, detail: 'wattanam.noticeboard@1.0.0 verified, compatible with core 1.0.0-test',
    });
  });

  it('fails the overall report when a requested initial plugin is tampered', async () => {
    const report = await service().run({
      locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR',
      initialPlugins: [await pluginPackageBase64({ tamper: true })],
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'initialPlugin:0')).toMatchObject({ ok: false });
  });

  it('fails the overall report when a requested initial plugin is incompatible with the running core version', async () => {
    const report = await service().run({
      locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR',
      initialPlugins: [await pluginPackageBase64({ incompatible: true })],
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'initialPlugin:0')).toMatchObject({ ok: false, detail: expect.stringContaining('incompatible') });
  });

  it('rejects malformed base64 as its own clear failure rather than crashing', async () => {
    const report = await service().run({
      locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR',
      initialPlugins: ['not-a-real-plugin-package'],
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'initialPlugin:0')).toMatchObject({ ok: false });
  });

  it('checks multiple requested plugins independently, each reported by its own index', async () => {
    const report = await service().run({
      locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR',
      initialPlugins: [await pluginPackageBase64(), await pluginPackageBase64({ tamper: true })],
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'initialPlugin:0')).toMatchObject({ ok: true });
    expect(report.checks.find((c) => c.name === 'initialPlugin:1')).toMatchObject({ ok: false });
  });

  it('reports both provider checks as failing when notification config itself is malformed, without failing the overall report', async () => {
    process.env.SENDGRID_FROM = 'not-an-email';
    const report = await service().run({ locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR' });
    expect(report.ok).toBe(true);
    expect(report.checks.find((c) => c.name === 'email')).toMatchObject({ ok: false });
    expect(report.checks.find((c) => c.name === 'sms')).toMatchObject({ ok: false });
  });
});
