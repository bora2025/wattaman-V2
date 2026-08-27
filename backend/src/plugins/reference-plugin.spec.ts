const reference = require('../../../plugins/announcements/backend/index.js');

describe('announcements reference plugin SDK contract', () => {
  it('registers permissions, navigation, routes, job, storage, settings, events, and health', async () => {
    const routes: any[] = [];
    let job: any;
    let subscriber: any;
    const context: any = {
      pluginId: 'wattanam.announcements', logger: { log: jest.fn() },
      permissions: { register: jest.fn(() => jest.fn()) },
      navigation: { register: jest.fn(() => jest.fn()) },
      routes: { register: jest.fn((route) => { routes.push(route); return jest.fn(); }) },
      jobs: { register: jest.fn(async (definition) => { job = definition; return jest.fn(); }) },
      settings: { get: jest.fn(async (_key, fallback) => fallback), set: jest.fn(async () => undefined) },
      storage: { writeText: jest.fn(async () => undefined) },
      events: { subscribe: jest.fn((_event, handler) => { subscriber = handler; return jest.fn(); }) },
    };
    const cleanup = await reference.activate(context);
    expect(context.permissions.register).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'wattanam.announcements.manage' })]));
    expect(context.navigation.register).toHaveBeenCalledWith([expect.objectContaining({ href: '/plugins/wattanam.announcements/settings' })]);
    expect(routes.map((route) => `${route.method}:${route.path}`)).toEqual(['GET:settings', 'PATCH:settings']);
    await expect(routes[0].handler()).resolves.toMatchObject({ digestEnabled: true });
    await expect(routes[1].handler({ body: { digestEnabled: false, audience: 'staff' } })).resolves.toEqual({ digestEnabled: false, audience: 'staff' });
    expect(context.settings.set).toHaveBeenCalledWith('preferences', { digestEnabled: false, audience: 'staff' });
    await job.handler();
    await subscriber();
    expect(context.storage.writeText).toHaveBeenCalledTimes(2);
    expect(reference.health()).toEqual({ status: 'ready' });
    expect(typeof cleanup).toBe('function');
  });
});
