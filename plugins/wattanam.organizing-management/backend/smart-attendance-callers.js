'use strict';
// Partner screens (school core 0.2+): Smart Attendance's screens (Take Attendance, settings, self-scan,
// staff and workforce attendance) call these routes of wattanam.organizing-management. The core answers another plugin's
// screen only on routes that name it in "callers"; the signed-in user still needs this plugin's permission.
const SMART = 'wattanam.smart-attendance';
const ROUTES = [
  "GET attendance/records",
  "GET attendance/session-settings",
  "GET attendance/sessions",
  "POST attendance/scan",
  "POST attendance/sessions",
  "PUT attendance/session-settings"
];
const shape = (method, routePath) => `${String(method || '').toUpperCase()} ${String(routePath || '').replace(/:[^/]+/g, ':id')}`;
const OPEN = new Set(ROUTES);

module.exports = function withSmartAttendanceCallers(context) {
  return {
    ...context,
    routes: {
      ...context.routes,
      register(definition) {
        if (!definition || !OPEN.has(shape(definition.method, definition.path))) return context.routes.register(definition);
        return context.routes.register({ ...definition, callers: [...new Set([...(definition.callers || []), SMART])] });
      },
    },
  };
};
module.exports.ROUTES = ROUTES;
