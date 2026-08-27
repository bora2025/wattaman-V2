'use strict';

module.exports = {
  id: 'wattanam.announcements',
  async activate(context) {
    context.logger.log('Announcements reference plugin activated');
    context.permissions.register([
      { id: 'wattanam.announcements.read', label: 'Read announcements' },
      { id: 'wattanam.announcements.manage', label: 'Manage announcement settings' },
    ]);
    context.navigation.register([{ id: 'settings', label: 'Announcement settings', href: '/plugins/wattanam.announcements/settings', permission: 'wattanam.announcements.manage' }]);
    context.routes.register({
      method: 'GET', path: 'settings', permission: 'wattanam.announcements.read',
      async handler() {
        return context.settings.get('preferences', { digestEnabled: true, audience: 'all' });
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'settings', permission: 'wattanam.announcements.manage',
      async handler(request) {
        const input = request.body && typeof request.body === 'object' ? request.body : {};
        const preferences = {
          digestEnabled: input.digestEnabled !== false,
          audience: ['all', 'staff', 'parents'].includes(input.audience) ? input.audience : 'all',
        };
        await context.settings.set('preferences', preferences);
        return preferences;
      },
    });
    await context.jobs.register({
      id: 'digest-heartbeat', intervalSeconds: 3600,
      async handler() { await context.storage.writeText('jobs/digest-heartbeat.txt', new Date().toISOString()); },
    });
    return context.events.subscribe('core.system.started.v1', async () => {
      context.logger.log('Announcements plugin received core startup event');
      await context.storage.writeText('lifecycle/last-started.txt', new Date().toISOString());
    });
  },
  deactivate(context) {
    context.logger.log('Announcements reference plugin deactivated');
  },
  health() { return { status: 'ready' }; },
};
