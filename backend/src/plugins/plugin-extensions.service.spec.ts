import { PluginExtensionsService } from './plugin-extensions.service';

describe('PluginExtensionsService', () => {
  const permissions = new Set(['wattanam.test.read', 'wattanam.test.manage']);
  let service: PluginExtensionsService;
  beforeEach(() => { service = new PluginExtensionsService(); });

  it('registers and dispatches a namespaced route without exposing the application container', async () => {
    service.registerRoute('wattanam.test', permissions, { method: 'GET', path: 'settings', permission: 'wattanam.test.read', handler: ({ principal }) => ({ owner: principal.userId }) });
    await expect(service.dispatch('wattanam.test', { method: 'GET', path: 'settings', params: {}, query: {}, body: null, principal: { userId: 'owner', role: 'SUPER_ADMIN' } })).resolves.toEqual({ owner: 'owner' });
  });

  it('rejects traversal, undeclared permissions, and duplicate routes', () => {
    const handler = () => ({});
    expect(() => service.registerRoute('wattanam.test', permissions, { method: 'GET', path: '../core', permission: 'wattanam.test.read', handler })).toThrow('invalid');
    expect(() => service.registerRoute('wattanam.test', permissions, { method: 'GET', path: 'users', permission: 'core.users.manage', handler })).toThrow('not declared');
    service.registerRoute('wattanam.test', permissions, { method: 'GET', path: 'settings', permission: 'wattanam.test.read', handler });
    expect(() => service.registerRoute('wattanam.test', permissions, { method: 'GET', path: 'settings', permission: 'wattanam.test.read', handler })).toThrow('already');
  });

  it('cleans permissions and navigation when a plugin unloads', () => {
    service.registerPermissions('wattanam.test', permissions, [{ pluginId: 'wattanam.test', id: 'wattanam.test.read', label: 'Read' }]);
    service.registerNavigation('wattanam.test', permissions, [{ pluginId: 'wattanam.test', id: 'settings', label: 'Settings', href: '/plugins/wattanam.test/settings', permission: 'wattanam.test.manage' }]);
    service.registerPage('wattanam.test', { schemaVersion: 1, id: 'settings', title: 'Settings', routePath: 'settings', kind: 'json-settings' });
    expect(service.list().navigation).toHaveLength(1);
    service.clear('wattanam.test');
    expect(service.list()).toMatchObject({ navigation: [], permissions: [], pages: [] });
  });
});
