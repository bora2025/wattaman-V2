import { PluginExtensionsService } from './plugin-extensions.service';

function deps(granted = true) {
  const grants = { isGranted: jest.fn().mockResolvedValue(granted) } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  return { grants, audit };
}

describe('PluginExtensionsService', () => {
  const permissions = new Set(['wattanam.test.read', 'wattanam.test.manage']);
  let service: PluginExtensionsService;
  let deps_: ReturnType<typeof deps>;
  beforeEach(() => { deps_ = deps(); service = new PluginExtensionsService(deps_.grants, deps_.audit); });

  it('registers and dispatches a namespaced route without exposing the application container', async () => {
    service.registerRoute('wattanam.test', permissions, { method: 'GET', path: 'settings', permission: 'wattanam.test.read', handler: ({ principal }) => ({ owner: principal.userId }) });
    await expect(service.dispatch('wattanam.test', { method: 'GET', path: 'settings', params: {}, query: {}, body: null, principal: { userId: 'owner', role: 'SUPER_ADMIN' } })).resolves.toEqual({ owner: 'owner' });
    expect(deps_.grants.isGranted).toHaveBeenCalledWith('wattanam.test', 'wattanam.test.read', 'SUPER_ADMIN');
    expect(deps_.audit.log).toHaveBeenCalledWith(expect.objectContaining({ success: true, actorId: 'owner', resourceId: 'wattanam.test' }));
  });

  it('denies dispatch and audits the denial when the caller has no granted permission', async () => {
    const denied = deps(false);
    const denyingService = new PluginExtensionsService(denied.grants, denied.audit);
    denyingService.registerRoute('wattanam.test', permissions, { method: 'GET', path: 'settings', permission: 'wattanam.test.read', handler: () => ({}) });
    await expect(denyingService.dispatch('wattanam.test', { method: 'GET', path: 'settings', params: {}, query: {}, body: null, principal: { userId: 'teacher-1', role: 'CLASS_ADMIN' } }))
      .rejects.toThrow('Missing plugin permission');
    expect(denied.audit.log).toHaveBeenCalledWith(expect.objectContaining({ success: false, actorId: 'teacher-1', errorMessage: expect.stringContaining('wattanam.test.read') }));
  });

  it('audits a failed handler without swallowing the original error', async () => {
    service.registerRoute('wattanam.test', permissions, { method: 'GET', path: 'settings', permission: 'wattanam.test.read', handler: () => { throw new Error('handler exploded'); } });
    await expect(service.dispatch('wattanam.test', { method: 'GET', path: 'settings', params: {}, query: {}, body: null, principal: { userId: 'owner', role: 'SUPER_ADMIN' } }))
      .rejects.toThrow('handler exploded');
    expect(deps_.audit.log).toHaveBeenCalledWith(expect.objectContaining({ success: false, errorMessage: 'handler exploded' }));
  });

  it('rejects traversal, undeclared permissions, and duplicate routes', () => {
    const handler = () => ({});
    expect(() => service.registerRoute('wattanam.test', permissions, { method: 'GET', path: '../core', permission: 'wattanam.test.read', handler })).toThrow('invalid');
    expect(() => service.registerRoute('wattanam.test', permissions, { method: 'GET', path: 'users', permission: 'core.users.manage', handler })).toThrow('not declared');
    service.registerRoute('wattanam.test', permissions, { method: 'GET', path: 'settings', permission: 'wattanam.test.read', handler });
    expect(() => service.registerRoute('wattanam.test', permissions, { method: 'GET', path: 'settings', permission: 'wattanam.test.read', handler })).toThrow('already');
  });

  it('listForPrincipal filters navigation to what the role is granted, always keeps unpermissioned entries, and leaves pages unfiltered', async () => {
    service.registerNavigation('wattanam.test', permissions, [
      { pluginId: 'wattanam.test', id: 'settings', label: 'Settings', href: '/plugins/wattanam.test/settings', permission: 'wattanam.test.manage' },
      { pluginId: 'wattanam.test', id: 'open', label: 'Open', href: '/plugins/wattanam.test/open' },
    ]);
    service.registerPage('wattanam.test', { schemaVersion: 1, id: 'settings', title: 'Settings', routePath: 'settings', kind: 'json-settings' });

    const granted = await service.listForPrincipal('TEACHER');
    expect(granted.navigation.map((entry) => entry.id).sort()).toEqual(['open', 'settings']);
    expect(deps_.grants.isGranted).toHaveBeenCalledWith('wattanam.test', 'wattanam.test.manage', 'TEACHER');
    expect(granted.pages).toHaveLength(1);

    const deniedDeps = deps(false);
    const deniedService = new PluginExtensionsService(deniedDeps.grants, deniedDeps.audit);
    deniedService.registerNavigation('wattanam.test', permissions, [
      { pluginId: 'wattanam.test', id: 'settings', label: 'Settings', href: '/plugins/wattanam.test/settings', permission: 'wattanam.test.manage' },
      { pluginId: 'wattanam.test', id: 'open', label: 'Open', href: '/plugins/wattanam.test/open' },
    ]);
    const filtered = await deniedService.listForPrincipal('STUDENT');
    expect(filtered.navigation.map((entry) => entry.id)).toEqual(['open']);
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
