const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  manifestKeyToRoute,
  optionalBackendDirectories,
  optionalRuntimeSymbols,
  verifyCleanCoreArtifact,
} = require('./verify-clean-core-artifact');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-clean-core-'));
  const backendDir = path.join(root, 'dist');
  const frontendManifest = path.join(root, 'app-paths-manifest.json');
  const registry = path.join(root, 'module-registry.ts');
  const backendSource = path.join(root, 'src');
  fs.mkdirSync(backendDir);
  fs.mkdirSync(path.join(backendSource, 'attendance'), { recursive: true });
  fs.writeFileSync(path.join(backendSource, 'attendance', 'attendance.service.ts'), '@Injectable()\nexport class AttendanceService {}\n');
  fs.writeFileSync(registry, `
    { module: 'AuthModule', importPath: './auth/auth.module', classification: 'core', owner: 'lean-core' },
    { module: 'AttendanceModule', importPath: './attendance/attendance.module', classification: 'business', owner: 'plugin' },
    { module: 'AnnouncementsModule', importPath: './announcements/announcements.module', classification: 'proxy', owner: 'plugin' },
  `);
  return { root, backendDir, frontendManifest, registry, backendSource };
}

test('normalizes Next app manifest keys to public routes', () => {
  assert.equal(manifestKeyToRoute('/admin/plugins/page'), '/admin/plugins');
  assert.equal(manifestKeyToRoute('/(shell)/admin/page'), '/admin');
  assert.equal(manifestKeyToRoute('/api/[...path]/route'), '/api/[...path]');
});

test('derives optional backend directories from the authoritative registry', () => {
  const parsed = optionalBackendDirectories(`
    { module: 'AuthModule', importPath: './auth/auth.module', classification: 'core', owner: 'lean-core' },
    { module: 'FeesModule', importPath: './fees/fees.module', classification: 'business', owner: 'finance' },
  `);
  assert.deepEqual(parsed, [{ moduleName: 'FeesModule', directory: 'fees', classification: 'business' }]);
});

test('discovers optional decorated providers, controllers, jobs and gateways', () => {
  const paths = fixture();
  fs.writeFileSync(path.join(paths.backendSource, 'attendance', 'attendance.gateway.ts'), '@WebSocketGateway()\nexport class AttendanceGateway {}\n@Processor()\nclass AttendanceQueue {}\n');
  assert.deepEqual(optionalRuntimeSymbols(paths.backendSource, optionalBackendDirectories(fs.readFileSync(paths.registry, 'utf8'))).map((entry) => entry.symbol), [
    'AttendanceGateway', 'AttendanceQueue', 'AttendanceService',
  ]);
});

test('passes an artifact containing only core backend and frontend surfaces', () => {
  const paths = fixture();
  fs.mkdirSync(path.join(paths.backendDir, 'auth'));
  fs.writeFileSync(paths.frontendManifest, JSON.stringify({
    '/admin/page': 'app/admin/page.js',
    '/admin/plugins/page': 'app/admin/plugins/page.js',
    '/plugins/[pluginId]/[[...path]]/page': 'app/plugins/[pluginId]/[[...path]]/page.js',
  }));
  const result = verifyCleanCoreArtifact(paths);
  assert.equal(result.status, 'pass');
  assert.equal(result.violationCount, 0);
});

test('rejects plugin-specific compiled pages while allowing the generic plugin host', () => {
  const paths = fixture();
  fs.writeFileSync(paths.frontendManifest, JSON.stringify({
    '/plugins/[pluginId]/[[...path]]/page': 'app/plugins/[pluginId]/[[...path]]/page.js',
    '/plugins/wattanam.timetable/classes/page': 'app/plugins/wattanam.timetable/classes/page.js',
  }));
  const result = verifyCleanCoreArtifact(paths);
  assert.deepEqual(result.violations, [{
    kind: 'optional-frontend-route',
    path: '/plugins/wattanam.timetable/classes',
    detail: '/plugins/wattanam.timetable/classes/page',
  }]);
});

test('fails when optional backend modules or static business pages remain compiled', () => {
  const paths = fixture();
  fs.mkdirSync(path.join(paths.backendDir, 'attendance'));
  fs.mkdirSync(path.join(paths.backendDir, 'announcements'));
  fs.writeFileSync(paths.frontendManifest, JSON.stringify({
    '/admin/page': 'app/admin/page.js',
    '/admin/attendance/page': 'app/admin/attendance/page.js',
    '/accounter/fees/page': 'app/accounter/fees/page.js',
  }));
  const result = verifyCleanCoreArtifact(paths);
  assert.equal(result.status, 'fail');
  assert.deepEqual(
    result.violations.map((entry) => `${entry.kind}:${entry.path}`).sort(),
    [
      'optional-backend-module:announcements',
      'optional-backend-module:attendance',
      'optional-frontend-route:/accounter/fees',
      'optional-frontend-route:/admin/attendance',
    ],
  );
});

test('fails when an optional module is hidden inside a single JavaScript bundle', () => {
  const paths = fixture();
  fs.writeFileSync(path.join(paths.backendDir, 'main.js'), 'class AttendanceModule {}');
  fs.writeFileSync(paths.frontendManifest, JSON.stringify({ '/admin/page': 'app/admin/page.js' }));
  const result = verifyCleanCoreArtifact(paths);
  assert.deepEqual(result.violations, [{
    kind: 'optional-backend-module-bundled',
    path: 'main.js',
    detail: 'AttendanceModule (business)',
  }]);
});

test('fails when an optional provider is bundled without its module symbol', () => {
  const paths = fixture();
  fs.writeFileSync(path.join(paths.backendDir, 'main.js'), 'class AttendanceService {}');
  fs.writeFileSync(paths.frontendManifest, JSON.stringify({ '/admin/page': 'app/admin/page.js' }));
  const result = verifyCleanCoreArtifact(paths);
  assert.deepEqual(result.violations, [{
    kind: 'optional-runtime-symbol-bundled',
    path: 'main.js',
    detail: 'AttendanceService from attendance',
  }]);
});
