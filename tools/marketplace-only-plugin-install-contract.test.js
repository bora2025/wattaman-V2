const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('customer-school plugin controller exposes lifecycle operations but no package ingestion', () => {
  const controller = read('backend/src/plugins/plugins.controller.ts');

  assert.match(controller, /@Controller\('plugins'\)/);
  assert.match(controller, /@Post\(':id\/activate'\)/);
  assert.match(controller, /@Delete\(':id'\)/);
  assert.doesNotMatch(controller, /FileInterceptor|FilesInterceptor|UploadedFile|UploadedFiles|Multer/);
  assert.doesNotMatch(controller, /@Post\([^)]*(?:install|inspect|upload|package)/i);
  assert.doesNotMatch(controller, /this\.plugins\.(?:install|inspect)\s*\(/);
});

test('customer-school admin UI acquires plugins only through marketplace commerce', () => {
  const page = read('frontend/app/admin/plugins/page.tsx');

  assert.match(page, /\/api\/admin\/marketplace\/catalog/);
  assert.match(page, /\/api\/admin\/marketplace\/plugins\/\$\{encodeURIComponent\(product\.id\)\}\/\$\{encodeURIComponent\(version\)\}\/install/);
  assert.doesNotMatch(page, /<input[^>]+type=["']file["']/i);
  assert.doesNotMatch(page, /new\s+FormData\s*\(|\.wtp\b|Inspect package|local package/i);
});

test('school marketplace install endpoint is role-guarded and cannot accept a package body', () => {
  const controller = read('backend/src/marketplace/marketplace-commerce.controller.ts');

  assert.match(controller, /@UseGuards\(JwtAuthGuard, RolesGuard\)/);
  assert.match(controller, /@Roles\('SUPER_ADMIN'\)/);
  assert.match(controller, /@Post\('plugins\/:pluginId\/:version\/install'\)/);
  assert.match(controller, /this\.commerce\.install\(pluginId, version, body\?\.activate === true, String\(body\?\.consentDigest/);
  assert.doesNotMatch(controller, /FileInterceptor|UploadedFile|Buffer|packageBuffer/);
});

test('package ingestion remains confined to authenticated central marketplace roles', () => {
  const app = read('apps/marketplace-api/src/app.ts');

  assert.match(app, /app\.post\('\/v1\/publisher-submissions', requireSession, upload\.single\('package'\)/);
  assert.match(app, /app\.post\('\/admin\/v1\/plugin-releases', requireAdmin, upload\.single\('package'\)/);
  assert.doesNotMatch(app, /app\.post\('\/(?:v1\/)?(?:plugins\/)?(?:install|inspect|upload)'\s*,\s*upload\./);
});

test('first-run HTTP and CLI setup cannot ingest local plugin packages', () => {
  const dto = read('backend/src/installation/dto/install.dto.ts');
  const preflight = read('backend/src/installation/installation-preflight.service.ts');
  const cli = read('backend/src/installation/install-cli.ts');

  assert.doesNotMatch(dto, /initialPlugins|IsBase64|IsArray/);
  assert.doesNotMatch(preflight, /PluginPackageVerifier|checkInitialPlugins|initialPlugin:/);
  assert.match(cli, /INSTALL_INITIAL_PLUGIN_FILES was removed/);
  assert.doesNotMatch(cli, /readBinaryFile|toString\('base64'\)/);
});
