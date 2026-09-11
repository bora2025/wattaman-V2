const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildInventory, gateReport, serialized } = require('./architecture-inventory');

function write(root, file, contents) {
  const target = path.join(root, ...file.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

test('builds a deterministic cross-layer architecture inventory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-architecture-inventory-'));
  try {
    write(root, 'backend/src/app.module.ts', '@Module({ imports: [] }) export class AppModule {}');
    write(root, 'backend/src/example/example.module.ts', '@Module({}) export class ExampleModule {}');
    write(root, 'backend/src/example/example.controller.ts', "@UseGuards(JwtAuthGuard, RolesGuard)\n@Controller('examples')\n@Roles('ADMIN')\nexport class ExampleController {\n  @Roles('TEACHER')\n  @Get(':id')\n  find(@Param('id') id: string, @Body() body: ExampleDto) {}\n}");
    write(root, 'backend/src/example/example.gateway.ts', "@WebSocketGateway({ namespace: '/example', cors: {} })\n@UseGuards(SchoolAccessWsGuard)\nexport class ExampleGateway {\n async handleConnection() { await authenticateSocket(); await disconnectIfSuspended(); }\n @SubscribeMessage('changed') handleChanged() { requireSocketUser(); }\n}");
    write(root, 'backend/src/example/example.job.ts', "export class ExampleJobs {\n@Cron('0 * * * *')\nrun() {}\n}");
    write(root, 'backend/src/example/files.ts', "const root = process.env.PLUGIN_DIR; await writeFile(root, data); const upload = FileInterceptor('photo'); function f(@UploadedFile() file) {};");
    write(root, 'backend/src/example/notifications.ts', "await this.notifications.sendEmail(user.email, 'Subject', `Hello ${user.name}`); await this.notifications.notifyInApp(user.id, message, 'example'); await this.prisma.notification.create({ data }); await this.directory.resolveAudience({ audience: 'SCHOOL' }); await this.prisma.notificationPreference.findMany({}); const limit = process.env.PLUGIN_NOTIFICATION_DAILY_LIMIT;");
    write(root, 'backend/src/example/example-report.service.ts', "const classId = params.get('classId'); const presentTotal = rows.filter(row => row.present).reduce((sum, row) => sum + row.value, 0); const grouped = prisma.attendance.groupBy({ by: ['classId'], _count: true });");
    write(root, 'backend/prisma/schema.prisma', 'model User {\n  id String @id @map("user_id")\n  posts Post[] @relation("AuthorPosts")\n\n  @@index([id])\n  @@map("users")\n}\n');
    write(root, 'frontend/app/admin/example/page.tsx', "import Widget from '../../../components/Widget'; export default function Page() { router.push(`/admin/example/${id}`); const url = URL.createObjectURL(blob); window.print(); return <><input type=\"file\" /><a href=\"/admin/example/new\"><Widget /></a></> }");
    write(root, 'frontend/app/api/[...path]/route.ts', 'export async function GET() {}\nexport async function POST() {}');
    write(root, 'frontend/components/Widget.tsx', "import { helper } from '../lib/helper'; export default function Widget() { return null }");
    write(root, 'frontend/lib/helper.ts', 'export const helper = true');
    write(root, 'frontend/lib/example-api.ts', "apiFetch(`/api/examples/${id}`, { method: 'GET' });");
    write(root, 'apps/mobile/src/screens/ExampleScreen.tsx', "export default function ExampleScreen() { SecureStore.getItemAsync(TOKEN_KEY); const controller = new AbortController(); fetchWithAuth(`/examples/${id}`, { method: 'GET' }); navigation.navigate('Details'); }");
    write(root, 'apps/mobile/App.tsx', "<Stack.Screen name=\"Example\" component={ExampleScreen} />");
    write(root, 'apps/mobile/package.json', '{"dependencies":{"expo-camera":"1.0.0"}}');
    write(root, 'apps/mobile/app.json', '{"expo":{"android":{"permissions":["CAMERA"]},"ios":{"infoPlist":{"NSCameraUsageDescription":"scan"}},"plugins":["expo-camera"]}}');
    write(root, 'frontend/lib/admin-nav.ts', "export const nav = [{ label: 'Example', href: '/admin/example', icon: 'book', section: 'Demo', badgeKey: 'examples' as const }]");
    write(root, 'plugins/example/manifest.json', '{}');
    write(root, 'plugins/example/backend/index.js', "context.jobs.register({ id: 'heartbeat', intervalSeconds: 60, async handler() {} }); context.storage.writeText('result.txt', 'ok');");

    const inventory = buildInventory(root);
    assert.deepEqual(inventory.counts, {
      nestFeatureModules: 1,
      prismaModels: 1,
      prismaRelationFields: 1,
      prismaIndexes: 1,
      controllers: 1,
      httpRouteDecorators: 1,
      apiConsumerCalls: 2,
      matchedApiConsumerCalls: 2,
      dynamicOrExternalApiConsumerCalls: 0,
      unmatchedStaticSchoolApiConsumerCalls: 0,
      frontendPages: 1,
      frontendApiProxies: 1,
      frontendImports: 2,
      sharedComponents: 1,
      frontendDeepLinks: 2,
      navigationEntries: 1,
      scheduledJobDecorators: 1,
      websocketGateways: 1,
      websocketSubscribedEvents: 1,
      pluginJobRegistrations: 1,
      uploadHandlers: 2,
      frontendFileInputs: 1,
      downloadAndDocumentSites: 2,
      filesystemOperations: 1,
      storageConfigurationReferences: 1,
      pluginStorageCalls: 1,
      notificationDeliveries: 2,
      notificationDatabaseWrites: 1,
      notificationRecipientResolutionCalls: 1,
      notificationPreferenceAccesses: 1,
      notificationQuotaReferences: 1,
      notificationApiConsumerCalls: 0,
      notificationDigestJobs: 0,
      reportFiles: 1,
      reportPages: 0,
      reportRoutes: 0,
      reportApiConsumerCalls: 0,
      reportFilters: 1,
      reportCalculations: 5,
      reportExportSites: 1,
      printViews: 1,
      mobileScreens: 1,
      mobileNavigationRegistrations: 2,
      mobileApiDependencies: 1,
      mobileSecureStorageCalls: 1,
      mobileOfflineAndNetworkSignals: 1,
      mobileNativeCapabilityReferences: 0,
      mobileConfiguredPlugins: 1,
      mobileConfiguredPermissions: 2,
      mobilePackageDependencies: 1,
      officialPlugins: 1,
      sourceImports: 0,
      prismaDataAccesses: 0,
      outboundCalls: 0,
    });
    assert.deepEqual(inventory.frontendPages, [{ file: 'frontend/app/admin/example/page.tsx', route: '/admin/example' }]);
    assert.equal(inventory.controllers[0].className, 'ExampleController');
    assert.deepEqual(inventory.controllers[0].guards, ['JwtAuthGuard', 'RolesGuard']);
    assert.deepEqual(inventory.controllers[0].roles, ['ADMIN']);
    assert.equal(inventory.httpRoutes[0].method, 'GET');
    assert.equal(inventory.httpRoutes[0].path, ':id');
    assert.equal(inventory.httpRoutes[0].fullPath, '/examples/:id');
    assert.equal(inventory.httpRoutes[0].handler, 'find');
    assert.deepEqual(inventory.httpRoutes[0].effectiveRoles, ['TEACHER']);
    assert.deepEqual(inventory.httpRoutes[0].parameters, [
      { decorator: 'Param', key: 'id' },
      { decorator: 'Body', key: null },
    ]);
    assert.deepEqual(inventory.httpRoutes[0].referencedTypes, ['ExampleDto']);
    assert.equal(inventory.apiConsumers[0].normalizedPath, '/examples/:dynamic');
    assert.deepEqual(inventory.apiConsumers[0].matchedRoutes, ['GET /examples/:id']);
    assert.equal(inventory.apiConsumers[1].surface, 'school-web');
    assert.deepEqual(inventory.frontendApiProxies[0], {
      file: 'frontend/app/api/[...path]/route.ts',
      route: '/api/[...path]',
      methods: [{ method: 'GET', line: 1 }, { method: 'POST', line: 2 }],
    });
    assert.deepEqual(inventory.sharedComponents[0].importedBy, ['frontend/app/admin/example/page.tsx']);
    assert.deepEqual(inventory.sharedComponents[0].imports, ['frontend/lib/helper.ts']);
    assert.deepEqual(inventory.frontendDeepLinks.map((entry) => entry.expression), ['/admin/example/new', '/admin/example/:dynamic']);
    assert.deepEqual(inventory.scheduledJobs[0], {
      file: 'backend/src/example/example.job.ts', line: 2, kind: 'Cron', scheduleExpression: "'0 * * * *'",
      scheduleValue: '0 * * * *', className: 'ExampleJobs', handler: 'run', processOwnership: 'worker-or-combined',
    });
    assert.equal(inventory.websocketGateways[0].namespace, '/example');
    assert.deepEqual(inventory.websocketGateways[0].guards, ['SchoolAccessWsGuard']);
    assert.equal(inventory.websocketGateways[0].authenticatesConnection, true);
    assert.equal(inventory.websocketGateways[0].enforcesSchoolAccessOnConnection, true);
    assert.deepEqual(inventory.websocketGateways[0].subscriptions, [{ event: 'changed', handler: 'handleChanged', line: 5 }]);
    assert.equal(inventory.pluginJobRegistrations[0].id, 'heartbeat');
    assert.deepEqual(inventory.fileStorage.storageConfiguration.map((entry) => entry.value), ['PLUGIN_DIR']);
    assert.deepEqual(inventory.fileStorage.pluginStorageCalls.map((entry) => entry.value), ['writeText']);
    assert.deepEqual(inventory.notifications.deliveries.map((entry) => entry.channel), ['email', 'in-app']);
    assert.equal(inventory.notifications.deliveries[0].recipientExpression, 'user.email');
    assert.deepEqual(inventory.notifications.deliveries[0].templateExpressions, ["'Subject'", '`Hello ${user.name}`']);
    assert.deepEqual(inventory.notifications.recipientResolution.map((entry) => entry.value), ['resolveAudience']);
    assert.deepEqual(inventory.notifications.preferenceAccess.map((entry) => entry.value), ['findMany']);
    assert.deepEqual(inventory.reports.filters.map((entry) => entry.value), ['classId']);
    assert.deepEqual(inventory.reports.calculations.map((entry) => entry.value), ['_count', 'filter', 'reduce', 'groupBy', 'presentTotal']);
    assert.deepEqual(inventory.reports.printViews.map((entry) => entry.kind), ['print']);
    assert.deepEqual(inventory.mobile.screens, [{ file: 'apps/mobile/src/screens/ExampleScreen.tsx', component: 'ExampleScreen' }]);
    assert.deepEqual(inventory.mobile.configuredPlugins, ['expo-camera']);
    assert.deepEqual(inventory.mobile.dependencies, [{ name: 'expo-camera', version: '1.0.0' }]);
    assert.equal(inventory.prismaModels[0].mappedTable, 'users');
    assert.equal(inventory.prismaModels[0].fields[0].mappedColumn, 'user_id');
    assert.equal(inventory.prismaModels[0].fields[1].relation, 'AuthorPosts');
    assert.equal(inventory.prismaModels[0].indexes[0].definition, '@@index([id])');
    assert.deepEqual(inventory.navigation[0], {
      file: 'frontend/lib/admin-nav.ts',
      set: 'nav',
      href: '/admin/example',
      label: 'Example',
      icon: 'book',
      section: 'Demo',
      badgeKey: 'examples',
      line: 1,
    });
    assert.equal(serialized(inventory), serialized(buildInventory(root)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** LC1-011 fixture: two plugin owners, one split module, a derived component and a provisional decision. */
function ownershipFixture(root, overrides) {
  write(root, 'backend/src/app.module.ts', '@Module({ imports: [] }) export class AppModule {}');
  write(root, 'backend/src/billing/billing.module.ts', '@Module({}) export class BillingModule {}');
  write(root, 'backend/src/billing/billing.controller.ts', "@Controller('billing')\nexport class BillingController {\n  @Get('invoices')\n  invoices() {}\n  @Get('staff/payroll')\n  payroll() {}\n}");
  write(root, 'backend/src/billing/billing.gateway.ts', "@WebSocketGateway({ namespace: '/billing' })\nexport class BillingGateway {}");
  write(root, 'backend/src/billing/billing.jobs.ts', "export class BillingJobs {\n@Cron('0 * * * *')\nsweep() {}\n}");
  write(root, 'backend/prisma/schema.prisma', 'model Invoice {\n  id String @id\n}\nmodel Payroll {\n  id String @id\n}\n');
  write(root, 'frontend/app/admin/billing/page.tsx', "import InvoiceTable from '../../../components/InvoiceTable'; import Shell from '../../../components/Shell'; import { money } from '../../../lib/money'; export default function Page() { return <Shell><InvoiceTable /></Shell> }");
  write(root, 'frontend/app/admin/payroll/page.tsx', "import Shell from '../../../components/Shell'; export default function Page() { return <Shell /> }");
  write(root, 'frontend/app/admin/payroll/PayrollChart.tsx', "import Shell from '../../../components/Shell'; export default function PayrollChart() { return <Shell /> }");
  write(root, 'frontend/lib/money.ts', 'export const money = (value) => String(value);');
  write(root, 'frontend/components/InvoiceTable.tsx', 'export default function InvoiceTable() { return null }');
  write(root, 'frontend/components/Shell.tsx', 'export default function Shell() { return null }');
  write(root, 'frontend/lib/admin-nav.ts', "export const adminNav = [{ label: 'Billing', href: '/admin/billing' }, { label: 'Payroll', href: '/admin/payroll?tab=all' }]");
  write(root, 'plugins/example/plugin.json', '{"id":"example.plugin","version":"1.2.3"}');
  write(root, 'plugins/example/backend/index.js', "context.jobs.register({ id: 'heartbeat', intervalSeconds: 60, async handler() {} });");
  write(root, 'docs/architecture/ownership-manifest.json', JSON.stringify({
    status: 'fixture',
    owners: { core: { kind: 'core' }, finance: { kind: 'official-plugin' }, hr: { kind: 'official-plugin', dependsOn: ['finance'] } },
    decisions: { 'D-1': 'Who owns payroll.' },
    splitPlans: { 'billing-split': { area: 'backend/src/billing', owners: ['finance', 'hr'], summary: 'Payroll leaves billing.' } },
    models: { Invoice: { owner: 'finance' }, Payroll: { owner: 'hr', decision: 'D-1' } },
    files: [
      { match: '^backend/src/app\\.module\\.ts$', owner: 'core' },
      { match: '^backend/src/billing/', owner: 'finance', splitPlan: 'billing-split' },
      { match: '^frontend/components/Shell\\.tsx$', owner: 'core' },
      { match: '^frontend/lib/[a-z]+-nav\\.ts$', owner: 'core' },
      { match: '^plugins/example/', owner: 'finance' },
    ],
    routes: [{ match: '^GET /billing/staff/', owner: 'hr', splitPlan: 'billing-split', decision: 'D-1' }],
    pages: [{ match: '^/admin/billing$', owner: 'finance' }, { match: '^/admin/payroll$', owner: 'hr', decision: 'D-1' }],
    mobileConfigurationOwner: 'core',
    ...overrides,
  }));
}

function withOwnershipFixture(overrides, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-ownership-'));
  try {
    ownershipFixture(root, overrides);
    return run(buildInventory(root), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const find = (list, key, value) => list.find((item) => item[key] === value);

test('LC1-011: resolves exactly one owner for every discovered item from the ownership manifest', () => {
  withOwnershipFixture({}, (inventory, root) => {
    const { ownership } = inventory;
    assert.deepEqual(ownership.errors, []);
    assert.deepEqual(ownership.gaps, []);
    assert.deepEqual(ownership.unusedRules, []);

    // A route rule overrides its controller file's owner; both still name the module's split plan.
    assert.deepEqual(find(ownership.items.routes, 'route', 'GET /billing/invoices'), {
      route: 'GET /billing/invoices', file: 'backend/src/billing/billing.controller.ts', handler: 'invoices', owner: 'finance', rule: 'files[1]', splitPlan: 'billing-split',
    });
    assert.deepEqual(find(ownership.items.routes, 'route', 'GET /billing/staff/payroll'), {
      route: 'GET /billing/staff/payroll', file: 'backend/src/billing/billing.controller.ts', handler: 'payroll', owner: 'hr', rule: 'routes[0]', decision: 'D-1', splitPlan: 'billing-split',
    });
    assert.deepEqual(find(ownership.items.models, 'model', 'Payroll'), { model: 'Payroll', owner: 'hr', rule: 'models.Payroll', decision: 'D-1' });

    // Navigation follows the page it links to, ignoring the query string.
    assert.equal(find(ownership.items.navigation, 'href', '/admin/payroll?tab=all').owner, 'hr');
    assert.equal(find(ownership.items.pages, 'route', '/admin/billing').owner, 'finance');

    // A component imported by one owner takes that owner; the shared one is owned by its explicit rule.
    assert.deepEqual(find(ownership.items.files, 'file', 'frontend/components/InvoiceTable.tsx'), {
      file: 'frontend/components/InvoiceTable.tsx', owner: 'finance', rule: 'sole-importer-owner', derivedFrom: ['frontend/app/admin/billing/page.tsx'],
    });
    assert.equal(find(ownership.items.files, 'file', 'frontend/components/Shell.tsx').owner, 'core');

    assert.equal(ownership.items.websocketGateways[0].owner, 'finance');
    assert.equal(ownership.items.scheduledJobs[0].owner, 'finance');
    assert.equal(ownership.items.pluginJobs[0].owner, 'finance');
    assert.deepEqual(ownership.items.officialPlugins, [{ directory: 'plugins/example', pluginId: 'example.plugin', version: '1.2.3', owner: 'finance', rule: 'files[4]' }]);

    // A helper follows its only importer; a page's own file follows the nearest page, decision included.
    assert.deepEqual(find(ownership.items.files, 'file', 'frontend/lib/money.ts'), {
      file: 'frontend/lib/money.ts', owner: 'finance', rule: 'sole-importer-owner', derivedFrom: ['frontend/app/admin/billing/page.tsx'],
    });
    assert.deepEqual(find(ownership.items.files, 'file', 'frontend/app/admin/payroll/PayrollChart.tsx'), {
      file: 'frontend/app/admin/payroll/PayrollChart.tsx', owner: 'hr', rule: 'route-segment-owner', decision: 'D-1', derivedFrom: ['frontend/app/admin/payroll/page.tsx'],
    });

    // Provisional owners are counted by decision: the payroll model, route, page, page file, chart and nav entry.
    assert.deepEqual(ownership.provisional, { 'D-1': 6 });
    assert.deepEqual(ownership.splitPlans, [{ id: 'billing-split', area: 'backend/src/billing', owners: ['finance', 'hr'], decision: null, items: 10, itemsByOwner: { finance: 9, hr: 1 } }]);
    assert.equal(serialized(inventory), serialized(buildInventory(root)));
  });
});

test('LC1-011: reports a gap instead of guessing an owner, and rejects manifest mistakes', () => {
  withOwnershipFixture({
    models: { Invoice: { owner: 'finance' }, Refund: { owner: 'finance' } },
    files: [
      { match: '^backend/src/app\\.module\\.ts$', owner: 'core' },
      { match: '^backend/src/billing/', owner: 'finance', splitPlan: 'billing-split' },
      { match: '^frontend/lib/[a-z]+-nav\\.ts$', owner: 'core' },
      { match: '^plugins/example/', owner: 'marketing' },
      { match: '^backend/src/legacy/', owner: 'core' },
    ],
    routes: [{ match: '^GET /billing/staff/', owner: 'core', splitPlan: 'billing-split' }],
    pages: [{ match: '^/admin/billing$', owner: 'finance' }],
  }, (inventory) => {
    const { ownership } = inventory;
    // No page rule, no model entry, and a component whose importers disagree: each is a gap, not core.
    // The chart inherits its page's gap rather than falling back to anything.
    assert.deepEqual(ownership.gaps.map(({ category, key }) => `${category}:${key}`).sort(), [
      'files:frontend/app/admin/payroll/PayrollChart.tsx',
      'files:frontend/app/admin/payroll/page.tsx',
      'files:frontend/components/Shell.tsx',
      'models:Payroll',
      'navigation:adminNav /admin/payroll?tab=all',
      'pages:/admin/payroll',
    ]);
    assert.deepEqual(find(ownership.gaps, 'key', 'frontend/components/Shell.tsx').importerOwners, ['finance', 'unclassified']);
    assert.ok(ownership.errors.includes('files[3]: unknown owner marketing'));
    assert.ok(ownership.errors.includes('routes[0]: core is not an owner in split plan billing-split'));
    assert.ok(ownership.errors.includes('models.Refund: no such Prisma model'));
    assert.deepEqual(ownership.unusedRules, [{ rule: 'files[4]', match: '^backend/src/legacy/' }]);
  });
});

test('LC1-011: every discovered item in this repository has exactly one owner', () => {
  const inventory = buildInventory();
  const { ownership } = inventory;
  assert.deepEqual(ownership.errors, []);
  assert.deepEqual(ownership.gaps, []);
  assert.deepEqual(ownership.unusedRules, []);
  const catalog = new Set(ownership.owners);
  for (const [category, list] of Object.entries(ownership.items)) {
    for (const item of list) assert.ok(catalog.has(item.owner), `${category} item owned by unknown owner ${item.owner}`);
  }
  // Checklist LC-1 baseline: the existing official plugin is recorded under its real identity.
  assert.deepEqual(ownership.items.officialPlugins.map(({ directory, pluginId }) => ({ directory, pluginId })), [
    { directory: 'plugins/announcements', pluginId: 'wattanam.announcements' },
  ]);
  // Mixed modules are split by a documented plan, never guessed: every declared plan covers real items.
  for (const plan of ownership.splitPlans) assert.ok(plan.items > 0, `split plan ${plan.id} covers no item`);
});

/**
 * LC1-012 fixture: core, Academic (acad), Attendance (att, depends on acad), HR (hr, optionally on att)
 * and Communication (comm). Attendance still holds staff logic under the att-staff split plan.
 */
function dependencyFixture(root) {
  write(root, 'backend/src/app.module.ts', "import { AttModule } from './att/att.module';\n@Module({ imports: [AttModule] }) export class AppModule {}");
  write(root, 'backend/src/att/att.module.ts', '@Module({}) export class AttModule {}');
  write(root, 'backend/src/att/att.controller.ts', "@Controller('att')\nexport class AttController {\n  @Get('records')\n  records() {}\n}");
  write(root, 'backend/src/att/att.service.ts', "import { AuditService } from '../core/audit.service';\nexport class AttService {\n  shifts() { return this.prisma.staffShift.findMany({}); }\n  roster() { return this.prisma.student.findMany({}); }\n}");
  write(root, 'backend/src/acad/acad.service.ts', 'export class AcadService {\n  removeClass() { return this.prisma.attendanceRecord.deleteMany({}); }\n}');
  write(root, 'backend/src/core/audit.service.ts', 'export class AuditService {\n  activity() { return this.prisma.student.count(); }\n}');
  write(root, 'backend/src/core/audit.service.spec.ts', "import { AttModule } from '../att/att.module';");
  write(root, 'backend/src/hr/hr.service.ts', 'export class HrService {\n  overlap() { return this.prisma.attendanceRecord.findMany({}); }\n}');
  write(root, 'backend/prisma/schema.prisma', [
    'model Student {\n  id String @id\n  attendance AttendanceRecord[]\n  messages Message[]\n}',
    'model AttendanceRecord {\n  id String @id\n  studentId String\n  student Student @relation(fields: [studentId], references: [id])\n}',
    'model StaffShift {\n  id String @id\n}',
    'model Message {\n  id String @id\n  authorId String\n  author Student @relation(fields: [authorId], references: [id])\n}',
  ].join('\n'));
  write(root, 'frontend/app/admin/page.tsx', "import AttCard from '../../components/AttCard'; export default function Page() { apiFetch('/api/att/records'); return <a href=\"/admin/att\"><AttCard /></a> }");
  write(root, 'frontend/app/admin/att/page.tsx', 'export default function Page() { return null }');
  write(root, 'frontend/components/AttCard.tsx', 'export default function AttCard() { return null }');
  write(root, 'frontend/lib/admin-nav.ts', "export const adminNav = [{ label: 'Attendance', href: '/admin/att' }]");
  write(root, 'plugins/comm/plugin.json', '{"id":"comm.plugin","version":"1.0.0","capabilities":["notifications.send","directory.read"]}');
  write(root, 'docs/architecture/ownership-manifest.json', JSON.stringify({
    status: 'fixture',
    owners: {
      core: { kind: 'core' },
      acad: { kind: 'official-plugin', dependsOn: [] },
      att: { kind: 'official-plugin', dependsOn: ['acad'] },
      hr: { kind: 'official-plugin', dependsOn: [], optionalDependsOn: ['att'] },
      comm: { kind: 'official-plugin', dependsOn: [], optionalDependsOn: ['hr'] },
    },
    decisions: {},
    splitPlans: { 'att-staff': { area: 'backend/src/att', owners: ['att', 'hr'], summary: 'Staff logic leaves Attendance.' } },
    models: { Student: { owner: 'acad' }, AttendanceRecord: { owner: 'att' }, StaffShift: { owner: 'hr' }, Message: { owner: 'comm' } },
    files: [
      { match: '^backend/src/app\\.module\\.ts$', owner: 'core' },
      { match: '^backend/src/core/', owner: 'core' },
      { match: '^backend/src/acad/', owner: 'acad' },
      { match: '^backend/src/att/', owner: 'att', splitPlan: 'att-staff' },
      { match: '^backend/src/hr/', owner: 'hr' },
      { match: '^frontend/components/AttCard\\.tsx$', owner: 'att' },
      { match: '^frontend/lib/[a-z]+-nav\\.ts$', owner: 'core' },
      { match: '^plugins/comm/', owner: 'comm' },
    ],
    routes: [],
    pages: [{ match: '^/admin$', owner: 'core' }, { match: '^/admin/att$', owner: 'att' }],
    mobileConfigurationOwner: 'core',
  }));
}

test('LC1-012: classifies every cross-owner reference against the target architecture', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-dependencies-'));
  try {
    dependencyFixture(root);
    const inventory = buildInventory(root);
    const { ownership, dependencies } = inventory;
    assert.deepEqual(ownership.gaps, []);
    assert.deepEqual(ownership.errors, []);

    // Every way one owner reaches another: imports, table access, foreign keys, API calls, links,
    // navigation and SDK capabilities. The staff read inside the mixed module is tagged with its split plan.
    assert.deepEqual(dependencies.references.map((ref) => `${ref.kind} ${ref.from}->${ref.to}${ref.splitPlan ? ` [${ref.splitPlan}]` : ''}`), [
      'data-access acad->att',
      'data-access att->acad',
      'relation att->acad',
      'import att->core',
      'data-access att->hr [att-staff]',
      'relation comm->acad',
      'sdk-capability comm->core',
      'sdk-capability comm->core',
      'data-access core->acad',
      'api-call core->att',
      'composition core->att',
      'link core->att',
      'navigation core->att',
      'test-import core->att',
      'ui-import core->att',
      'data-access hr->att',
    ]);
    assert.deepEqual(dependencies.ownerEdges.map(({ from, to, classification }) => `${from}->${to} ${classification}`), [
      'acad->att undeclared-dependency',
      'att->acad declared-dependency',
      'att->core feature-to-core',
      'att->hr undeclared-dependency',
      'comm->acad undeclared-dependency',
      'comm->core feature-to-core',
      'core->acad core-to-feature',
      'core->att core-to-feature',
      'hr->att declared-optional-dependency',
    ]);

    // Test imports stay visible but are never findings; every finding names what removes it.
    assert.deepEqual(dependencies.coreToFeature.map(({ to, kind, references }) => `${to} ${kind} ${references}`), [
      'acad data-access 1', 'att api-call 1', 'att composition 1', 'att link 1', 'att navigation 1', 'att ui-import 1',
    ]);
    assert.equal(find(dependencies.coreToFeature, 'kind', 'navigation').resolution, 'Navigation registry built from plugin contributions (LC2-008, LC2-009)');
    assert.deepEqual(dependencies.undeclared.map(({ from, to, withinSplitPlan }) => `${from}->${to} ${withinSplitPlan}`), ['acad->att 0', 'att->hr 1', 'comm->acad 0']);

    // Attendance reaching HR disappears with the split, so only Academic <-> Attendance is a cycle to break.
    assert.deepEqual(dependencies.featureCycles, [['acad', 'att']]);
    assert.deepEqual(dependencies.declaredUnused, [{ from: 'comm', to: 'hr', declared: 'optional' }]);
    assert.deepEqual(dependencies.summary, {
      crossOwnerReferences: 16, productionReferences: 15, withinSplitPlanReferences: 1, ownerPairs: 9,
      coreToFeatureReferences: 6, undeclaredFeatureDependencies: 3, featureCycles: 1, unresolvedLinks: 0,
    });
    assert.equal(serialized(inventory), serialized(buildInventory(root)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('LC1-012: generates the dependency graph for this repository', () => {
  const { ownership, dependencies } = buildInventory();
  const catalog = new Set(ownership.owners);
  for (const ref of dependencies.references) {
    assert.ok(catalog.has(ref.from) && catalog.has(ref.to), `reference with an unknown owner: ${ref.source} -> ${ref.target}`);
  }
  // The composition roots are where core loads every feature, and every reference from them is composition.
  const fromRoots = dependencies.references.filter((ref) => /^(backend\/src\/app\.module\.ts|apps\/mobile\/App\.tsx):/.test(ref.source));
  assert.ok(fromRoots.length > 0);
  assert.ok(fromRoots.every((ref) => ref.kind === 'composition'));
  // The existing official plugin reaches core only through the SDK capabilities it declares.
  assert.ok(dependencies.references.some((ref) => ref.from === 'wattanam.communication' && ref.kind === 'sdk-capability'));
  // Every core-to-feature finding names the checklist item that removes it.
  assert.ok(dependencies.coreToFeature.every((group) => group.resolution));
});

/** LC1-013 fixture: student data, a staff payslip wrongly tagged, an unreviewed field and three outbound paths. */
function classificationFixture(root) {
  write(root, 'backend/prisma/schema.prisma', [
    'model Student {\n  id String @id\n  name String\n  address String?\n  parentEmail String?\n  photoFlag Boolean\n  classId String?\n  createdAt DateTime\n}',
    'model Mark {\n  id String @id\n  studentId String\n  student Student @relation(fields: [studentId], references: [id])\n  score Float\n}',
    'model Payslip {\n  id String @id\n  studentId String\n  netPay Float\n  bankAccount String\n}',
    'model Room {\n  id String @id\n  name String\n  latitude Float\n}',
    'model Orphan {\n  id String @id\n}',
  ].join('\n'));
  write(root, 'backend/src/billing/sync.service.ts', "// We fetch(the invoices) here: a comment, not a call.\nexport async function sync() { await fetch('https://market.example/v1/sync'); }");
  write(root, 'backend/src/reports/export.service.ts', "const url = 'https://reports.example'; export const pull = () => fetch(url);");
  write(root, 'backend/src/billing/notify.service.ts', "export class Notify {\n  async run(user) {\n    await this.notifications.sendEmail(user.email, 'Subject', 'Body');\n    await this.notifications.notifyInApp(user.id, 'Body', 'kind');\n    await this.notifications.sendSms(user.phone, 'Body');\n  }\n}");
  write(root, 'backend/src/billing/notify.service.spec.ts', "await this.notifications.sendEmail('parent@example.com', 'S', 'B');");
  write(root, 'docs/architecture/ownership-manifest.json', JSON.stringify({
    status: 'fixture',
    owners: { core: { kind: 'core' }, school: { kind: 'official-plugin', dependsOn: [] } },
    decisions: {},
    splitPlans: {},
    models: { Student: { owner: 'school' }, Mark: { owner: 'school' }, Payslip: { owner: 'core' }, Room: { owner: 'core' }, Orphan: { owner: 'core' } },
    files: [{ match: '^backend/src/billing/', owner: 'school' }, { match: '^backend/src/reports/', owner: 'core' }],
    routes: [],
    pages: [],
    mobileConfigurationOwner: 'core',
  }));
  write(root, 'docs/architecture/data-classification.json', JSON.stringify({
    status: 'fixture',
    subjects: { student: { child: true }, staff: { child: false } },
    models: {
      Student: { subjects: ['student'], fields: { name: { tier: 2, categories: ['personal'] }, address: { tier: 2, categories: ['location', 'personal'] } } },
      Mark: { subjects: ['student'], fields: { score: { tier: 3, categories: ['personal'] }, grade: { tier: 3, categories: ['personal'] } } },
      Payslip: { subjects: ['staff'], fields: { netPay: { tier: 3, categories: ['financial', 'personal'] }, bankAccount: { tier: 3, categories: ['financial', 'personal'] } } },
      Room: { subjects: [], fields: {}, unflagged: { latitude: 'A fixed room position, not a person.' } },
      Ghost: { subjects: [], fields: {} },
    },
    notificationChannels: { email: 'email-provider', 'in-app': null },
    destinations: {
      'email-provider': { name: 'Email', external: true, categories: ['personal'] },
      marketplace: { name: 'Marketplace', external: true, categories: ['financial'] },
    },
    outbound: [{ match: '^backend/src/billing/', destination: 'marketplace' }],
  }));
}

test('LC1-013: tags personal, child, financial, credential and location data and every outbound flow', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-classification-'));
  try {
    classificationFixture(root);
    const inventory = buildInventory(root);
    const data = inventory.dataClassification;
    const categories = (name) => data.models.find((model) => model.model === name).categories;

    // Subjects make a model personal and, for students, child data; fields add financial and location.
    assert.deepEqual(categories('Student'), ['child', 'location', 'personal']);
    assert.deepEqual(categories('Mark'), ['child', 'personal']);
    assert.deepEqual(categories('Payslip'), ['financial', 'personal']);
    assert.deepEqual(categories('Room'), []);

    // A student-linked model tagged as staff data, a missing model and a missing field are all rejected.
    assert.deepEqual(data.errors, [
      'models.Ghost: no such Prisma model',
      'models.Mark.fields.grade: no such field',
      'models.Payslip: holds student-linked records but is not classified as child data',
    ]);
    // An unreviewed sensitive-looking field, an unlisted model, an outbound call with no destination and a
    // notification channel with none are gaps. Booleans, ids, timestamps and reviewed fields are not.
    assert.deepEqual(data.gaps.map(({ category, key }) => `${category}:${key}`), [
      'fields:Student.parentEmail',
      'models:Orphan',
      'flows:backend/src/reports/export.service.ts:1',
      'flows:backend/src/billing/notify.service.ts:5',
    ]);

    // The comment is not a call; the URL before a real call does not hide it; in-app mail and specs stay out.
    assert.deepEqual(data.flows, [
      { destination: 'email-provider', owner: 'school', source: 'backend/src/billing/notify.service.ts:3', via: 'email' },
      { destination: 'marketplace', owner: 'school', source: 'backend/src/billing/sync.service.ts:2', via: 'http' },
    ]);
    assert.deepEqual(data.byOwner.school, {
      categories: ['child', 'location', 'personal'],
      subjects: ['student'],
      modelsByCategory: { child: ['Mark', 'Student'], location: ['Student'], personal: ['Mark', 'Student'] },
      classifiedFields: 4,
      externalDestinations: ['email-provider', 'marketplace'],
    });
    assert.deepEqual(data.summary, {
      models: 5, classifiedModels: 4, classifiedFields: 6, thirdPartyFields: 0,
      modelsByCategory: { child: 2, credential: 0, financial: 1, location: 1, personal: 3 },
      fieldsByTier: { 2: 2, 3: 4 }, externalDestinations: 2, gaps: 4, errors: 3, unusedRules: 0,
    });
    assert.equal(serialized(inventory), serialized(buildInventory(root)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('LC1-013: classifies every model and outbound flow in this repository', () => {
  const { dataClassification: data } = buildInventory();
  assert.deepEqual(data.errors, []);
  assert.deepEqual(data.gaps, []);
  assert.deepEqual(data.unusedRules, []);
  assert.equal(data.summary.classifiedModels, data.summary.models);
  const model = (name) => data.models.find((entry) => entry.model === name);
  const field = (name, fieldName) => model(name).fields.find((entry) => entry.field === fieldName);

  // A-002's judgements survive the move into machine-checked form.
  assert.deepEqual(field('User', 'password'), { field: 'password', tier: 4, categories: ['credential'] });
  assert.deepEqual(field('ClassRegistration', 'generatedPassword'), { field: 'generatedPassword', tier: 4, categories: ['credential'] });
  assert.deepEqual(field('Notification', 'message'), { field: 'message', tier: 3, categories: ['personal'], thirdParty: ['email', 'sms'] });
  assert.deepEqual(field('Salary', 'netSalary').categories, ['financial', 'personal']);
  assert.deepEqual(field('Attendance', 'scanLatitude').categories, ['location', 'personal']);
  assert.deepEqual(model('BusLocation').categories, ['child', 'location', 'personal']);
  assert.deepEqual(model('FeeSettings').fields, []);

  // Students are minors: every model holding their records is child data.
  for (const name of ['Student', 'Attendance', 'ScoreEntry', 'FeeRecord', 'ClassRegistration', 'ParentLinkRequest']) {
    assert.ok(model(name).categories.includes('child'), `${name} should be child data`);
  }
  // Every declared external destination is actually reached by some flow.
  assert.ok(data.externalFlows.filter((flow) => flow.external).every((flow) => flow.references > 0));
});

/** LC1-014 fixture: a fully reviewed repository, before anything unreviewed is added to it. */
function gateFixture(root) {
  write(root, 'backend/src/app.module.ts', '@Module({}) export class AppModule {}');
  write(root, 'backend/prisma/schema.prisma', 'model Widget {\n  id String @id\n  label String\n}\n');
  write(root, 'frontend/app/admin/page.tsx', 'export default function Page() { return null }');
  write(root, 'docs/architecture/ownership-manifest.json', JSON.stringify({
    status: 'fixture',
    owners: { core: { kind: 'core' } },
    decisions: {},
    splitPlans: {},
    models: { Widget: { owner: 'core' } },
    files: [{ match: '^backend/src/app\\.module\\.ts$', owner: 'core' }],
    routes: [],
    pages: [{ match: '^/admin$', owner: 'core' }],
    mobileConfigurationOwner: 'core',
  }));
  write(root, 'docs/architecture/data-classification.json', JSON.stringify({
    status: 'fixture',
    subjects: {},
    models: { Widget: { subjects: [], fields: {} } },
    notificationChannels: {},
    destinations: {},
    outbound: [],
  }));
}

test('LC1-014: the gate fails on new unreviewed items and says exactly what to fix', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-gate-'));
  try {
    gateFixture(root);
    assert.deepEqual(gateReport(buildInventory(root)), {
      ok: true, summary: 'no problems', lines: ['Architecture gate passed: 5 discovered items owned and 1 model classified.'],
    });

    // A new controller with two routes, a new page, a new model, a new sensitive field and an outbound call.
    write(root, 'backend/src/gadgets/gadgets.controller.ts', "@Controller('gadgets')\nexport class GadgetsController {\n  @Get()\n  list() {}\n  @Post()\n  create() {}\n}");
    write(root, 'backend/src/gadgets/sync.ts', "export const sync = () => fetch('https://example.test');");
    write(root, 'frontend/app/admin/gadgets/page.tsx', 'export default function Page() { return null }');
    write(root, 'backend/prisma/schema.prisma', 'model Widget {\n  id String @id\n  label String\n  supportPhone String\n}\nmodel Gadget {\n  id String @id\n  ownerEmail String\n}\n');
    const report = gateReport(buildInventory(root));
    assert.equal(report.ok, false);
    // Grouped by what to fix, each naming the file to edit. The page's own file is not listed twice.
    assert.deepEqual(report.lines, [
      'Architecture gate failed: 8 ownership gaps and 3 data-classification gaps.',
      '',
      'Files with no owner. Add a "files" rule to docs/architecture/ownership-manifest.json:',
      '  - backend/src/gadgets/gadgets.controller.ts (controller, 2 routes)',
      '  - backend/src/gadgets/sync.ts',
      '',
      'Pages with no owner. Add a "pages" rule to docs/architecture/ownership-manifest.json:',
      '  - /admin/gadgets',
      '',
      'Models with no owner. Add them to "models" in docs/architecture/ownership-manifest.json:',
      '  - Gadget',
      '',
      'Models with no data classification. Add them to "models" in docs/architecture/data-classification.json:',
      '  - Gadget',
      '',
      'Fields that look sensitive but are not reviewed. Classify them under the model\'s "fields", or add them to "unflagged" with the reason:',
      '  - Widget.supportPhone',
      '',
      'Outbound flows with no destination. Add an "outbound" rule or a "notificationChannels" entry to docs/architecture/data-classification.json:',
      '  - backend/src/gadgets/sync.ts:1',
      '',
      'Then run `npm run architecture:inventory:write` and commit the manifests with the regenerated snapshot.',
      'Owners follow docs/architecture/module-to-plugin-migration-plan.md; data tiers follow docs/architecture/data-classification.md.',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('LC1-014: the gate passes for this repository', () => {
  const report = gateReport(buildInventory());
  assert.equal(report.ok, true, report.lines.join('\n'));
  assert.match(report.lines[0], /^Architecture gate passed: \d+ discovered items owned and \d+ models classified\.$/);
});
