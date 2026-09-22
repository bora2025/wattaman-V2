import { readFileSync } from 'fs';
import path from 'path';
import { PluginMigrationsService } from './plugin-migrations.service';
import { parsePluginUiBundle } from './plugin-ui-schema';

const root = path.resolve(__dirname, '../../../plugins/wattanam.timetable');

describe('Timetable plugin source', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'plugin.json'), 'utf8'));

  it('keeps timetable data namespaced and migration-compatible with the runtime', () => {
    const migrations = new PluginMigrationsService();
    for (const migration of manifest.migrations) {
      const sql = readFileSync(path.join(root, migration.path), 'utf8');
      expect(() => migrations.validateSql(manifest, migration.id, sql, migration.destructive)).not.toThrow();
    }
  });

  it('offers a permission-gated declarative page with matching routes', () => {
    const descriptor = JSON.parse(readFileSync(path.join(root, 'frontend/page.json'), 'utf8'));
    const bundle = parsePluginUiBundle(descriptor, manifest.id, new Set(manifest.permissions));
    expect(bundle.pages.map((page) => page.routePath)).toEqual(['timetables', 'subjects', 'classes', 'classrooms', 'teachers', 'lessons', 'entries']);
    expect(bundle.pages[0].dataSources.map((source) => source.path)).toEqual(['timetables', 'timetables']);
  });

  it('hosts the rich legacy-equivalent workspace only at plugin-owned entry routes', () => {
    expect(readFileSync(path.resolve(__dirname, '../../../frontend/app/plugins/wattanam.timetable/timetables/page.tsx'), 'utf8')).toContain("/admin/timetable?source=plugin");
    expect(readFileSync(path.resolve(__dirname, '../../../frontend/app/plugins/wattanam.timetable/schedule/page.tsx'), 'utf8')).toContain("/admin/timetable/schedule?source=plugin");
    const workspace = readFileSync(path.resolve(__dirname, '../../../frontend/app/admin/timetable/page.tsx'), 'utf8');
    expect(workspace).toContain('pluginTimetableFetch');
    expect(workspace).toContain("searchParams.get('source') === 'plugin'");
  });
});
