'use strict';

const DEPARTMENT = 'plugin_wattanam_academic_management_department';

module.exports = {
  id: 'wattanam.academic-management',
  async activate(context) {
    context.logger.log('Wattanam Academic Management activated');
    context.permissions.register([
      { id: 'wattanam.academic-management.view', label: 'View academic structures and rosters' },
      { id: 'wattanam.academic-management.manage', label: 'Manage academic structures and enrollment' },
    ]);
    context.navigation.register([
      { id: 'departments', label: 'Academic Management', href: '/plugins/wattanam.academic-management/departments', permission: 'wattanam.academic-management.view' },
    ]);
    context.routes.register({
      method: 'GET', path: 'departments', permission: 'wattanam.academic-management.view',
      handler: () => context.database.query(`SELECT "id", "name", "nameKh", "description", "createdAt", "updatedAt" FROM ${DEPARTMENT} ORDER BY "name" ASC`),
    });
  },
};
