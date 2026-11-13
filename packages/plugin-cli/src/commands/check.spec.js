'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { run: init } = require('./init');
const { run: check } = require('./check');

describe('wattanam-plugin check', () => {
  let dir;
  let logs;
  let originalWrite;

  beforeEach(async () => {
    dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-check-')), 'acme.widget');
    await init(['acme.widget', '--dir', dir]);
    logs = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { logs.push(String(chunk)); return true; };
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  });

  it('passes a freshly scaffolded plugin', async () => {
    await check([dir, '--require-universal-ui']);
    expect(logs.join('')).toContain('ALL CHECKS PASSED');
    expect(logs.join('')).not.toMatch(/^FAIL/m);
  });

  it('rejects host-specific UI when universal portability is required', async () => {
    const descriptorPath = path.join(dir, 'frontend', 'page.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    descriptor.pages[0].components = [{ id: 'private', type: 'organizing-dashboard' }];
    fs.writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2));
    await expect(check([dir, '--require-universal-ui'])).rejects.toThrow('check(s) failed');
    expect(logs.join('')).toContain('component is not universal: organizing-dashboard');
  });

  it('accepts the portable guided attendance station', async () => {
    const descriptorPath = path.join(dir, 'frontend', 'page.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    descriptor.pages[0].dataSources = ['classes', 'sessions', 'records', 'students', 'save', 'scan'].map((id) => ({ id, method: 'GET', path: id, permission: 'acme.widget.view' }));
    descriptor.pages[0].components = [{
      id: 'attendance',
      type: 'take-attendance',
      source: 'classes',
      options: { sessionsSource: 'sessions', recordsSource: 'records', studentsSource: 'students', saveSource: 'save', scanSource: 'scan' },
    }];
    fs.writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2));
    await check([dir, '--require-universal-ui']);
    expect(logs.join('')).toContain('frontend contains valid universal UI');
  });

  it('expands reusable universal UI fragments and rejects cycles', async () => {
    const descriptorPath = path.join(dir, 'frontend', 'page.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    descriptor.fragments = { summary: [{ id: 'title', type: 'heading', title: 'Summary' }] };
    descriptor.pages[0].components = [{ use: 'summary', idPrefix: 'records-' }];
    fs.writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2));
    await check([dir, '--require-universal-ui']);
    expect(logs.join('')).toContain('frontend contains valid universal UI');

    logs.length = 0;
    descriptor.fragments.summary = [{ use: 'summary' }];
    fs.writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2));
    await expect(check([dir, '--require-universal-ui'])).rejects.toThrow('check(s) failed');
    expect(logs.join('')).toContain('cyclic or deeply nested fragment summary');
  });

  it('requires universal UI automatically for SDK 1.3 plugins', async () => {
    const descriptorPath = path.join(dir, 'frontend', 'page.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    delete descriptor.portability;
    fs.writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2));
    await expect(check([dir])).rejects.toThrow('check(s) failed');
    expect(logs.join('')).toContain('portability=legacy, sdk=1.3.0');
  });

  it('fails and reports the exact reason when plugin.json is invalid', async () => {
    const manifestPath = path.join(dir, 'plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.capabilities = ['http.fetch'];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(check([dir])).rejects.toThrow('check(s) failed');
    expect(logs.join('')).toContain('unsupported capability');
  });

  it('fails when a declared migration checksum does not match the file on disk', async () => {
    fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'migrations', '001_x.sql'), '-- wattanam-plugin-migration: 001_x\nCREATE TABLE "plugin_acme_widget_x" ("id" TEXT PRIMARY KEY);');
    const manifestPath = path.join(dir, 'plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.migrations = [{ id: '001_x', path: 'migrations/001_x.sql', checksum: 'a'.repeat(64), destructive: false }];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(check([dir])).rejects.toThrow('check(s) failed');
    expect(logs.join('')).toContain('CHECK(S) FAILED');
    expect(logs.join('')).toContain('migration checksum matches plugin.json');
  });

  it('fails when the runtime omits its declared operational health check', async () => {
    const backendPath = path.join(dir, 'backend', 'index.js');
    const backend = fs.readFileSync(backendPath, 'utf8');
    fs.writeFileSync(backendPath, backend.replace(/\n\s*health\(\) \{[\s\S]*?\n\s*\},\n\};\s*$/, '\n};\n'));
    await expect(check([dir])).rejects.toThrow('check(s) failed');
    expect(logs.join('')).toContain('backend entry exports the declared health check');
  });
});

describe('wattanam-plugin check: UI appearance', () => {
  const { validateUniversalUi } = require('./check');
  const bundle = (page = {}, component = {}) => ({
    schemaVersion: 2, kind: 'declarative-ui', portability: 'universal',
    pages: [{ id: 'home', title: 'Home', dataSources: [], components: [{ id: 'title', type: 'heading', title: 'Home', ...component }], ...page }],
  });

  it('accepts the allow-listed appearance vocabulary', () => {
    expect(() => validateUniversalUi(bundle({ appearance: { theme: 'company', layout: 'grid', accent: 'info' } }, { appearance: { width: 'half', tone: 'success', surface: 'tinted' } }))).not.toThrow();
  });

  it('refuses raw classes and unknown values with a helpful message', () => {
    expect(() => validateUniversalUi(bundle({}, { appearance: { className: 'bg-red-500' } }))).toThrow(/appearance.className is not supported/);
    expect(() => validateUniversalUi(bundle({}, { appearance: { tone: 'pink' } }))).toThrow(/tone must be one of/);
    expect(() => validateUniversalUi(bundle({ appearance: { css: 'body{}' } }))).toThrow(/page home appearance/);
  });
});

describe('wattanam-plugin check: plugin-owned screens (app)', () => {
  const { validatePluginUiFiles, validateUniversalUi } = require('./check');
  const descriptor = (entry) => ({ schemaVersion: 2, kind: 'declarative-ui', portability: 'universal', pages: [{ id: 'home', title: 'Home', dataSources: [], components: [{ id: 'screen', type: 'app', options: { entry } }] }] });
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-ui-check-'));
    fs.mkdirSync(path.join(root, 'ui', 'home'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ui', 'home', 'index.html'), '<!doctype html><script src="app.js"></script>');
    fs.writeFileSync(path.join(root, 'ui', 'home', 'app.js'), 'console.log(1)');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('accepts an app screen whose entry and files are servable', () => {
    expect(() => validateUniversalUi(descriptor('ui/home/index.html'))).not.toThrow();
    expect(validatePluginUiFiles(root, descriptor('ui/home/index.html'))).toEqual({ problems: [], entries: ['ui/home/index.html'] });
  });

  it('reports a missing or unsafe entry, inline scripts, hidden files and unsupported types', () => {
    expect(validatePluginUiFiles(root, descriptor('ui/missing.html')).problems).toEqual(['app screen: entry ui/missing.html is missing']);
    expect(validatePluginUiFiles(root, descriptor('../plugin.json')).problems[0]).toMatch(/entry must be ui\/<path>\.html/);
    fs.writeFileSync(path.join(root, 'ui', 'home', 'inline.html'), '<script>alert(1)</script>');
    fs.writeFileSync(path.join(root, 'ui', '.secret.js'), '');
    fs.writeFileSync(path.join(root, 'ui', 'server.php'), '');
    const { problems } = validatePluginUiFiles(root, descriptor('ui/home/index.html'));
    expect(problems).toEqual(expect.arrayContaining([
      'ui/home/inline.html: inline <script> is blocked by the screen\'s security policy; use <script src="...">',
      'ui/.secret.js: hidden files are not served',
      'ui/server.php: file type is not served to plugin screens',
    ]));
  });

  it('accepts declared device services and reports unknown ones', () => {
    const withDevices = (devices) => { const value = descriptor('ui/home/index.html'); value.pages[0].components[0].options.devices = devices; return value; };
    expect(validatePluginUiFiles(root, withDevices(['scanner', 'location', 'device-id'])).problems).toEqual([]);
    for (const devices of [['camera'], ['scanner', 'scanner'], 'scanner']) {
      expect(validatePluginUiFiles(root, withDevices(devices)).problems).toEqual(['app screen: devices must be a list of scanner, location, device-id']);
    }
  });
});
