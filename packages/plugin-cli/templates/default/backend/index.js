'use strict';

module.exports = {
  id: '{{publisher}}.{{name}}',
  async activate(context) {
    context.logger.log('{{displayName}} activated');

    context.permissions.register([
      { id: '{{publisher}}.{{name}}.manage', label: 'Manage {{displayName}} settings' },
    ]);
    context.navigation.register([
      { id: 'settings', label: '{{displayName}} settings', href: '/plugins/{{publisher}}.{{name}}/settings', permission: '{{publisher}}.{{name}}.manage' },
    ]);

    context.routes.register({
      method: 'GET', path: 'settings', permission: '{{publisher}}.{{name}}.manage',
      async handler() {
        return context.settings.get('preferences', { enabled: true });
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'settings', permission: '{{publisher}}.{{name}}.manage',
      async handler(request) {
        const input = request.body && typeof request.body === 'object' ? request.body : {};
        const preferences = { enabled: input.enabled !== false };
        await context.settings.set('preferences', preferences);
        return preferences;
      },
    });
  },
  deactivate(context) {
    context.logger.log('{{displayName}} deactivated');
  },
  health() {
    return { status: 'ready' };
  },
};
