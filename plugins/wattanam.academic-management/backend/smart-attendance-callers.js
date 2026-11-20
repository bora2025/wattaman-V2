'use strict';
// Partner screens (school core 0.2+): Smart Attendance's screens (Take Attendance, settings, self-scan,
// staff and workforce attendance) call these routes of wattanam.academic-management. The core answers another plugin's
// screen only on routes that name it in "callers"; the signed-in user still needs this plugin's permission.
const SMART = 'wattanam.smart-attendance';
const ROUTES = [
  "GET alert-rules",
  "GET attendance-self-review",
  "GET attendance-windows",
  "GET attendance-windows/:id/live",
  "GET classes",
  "GET classes/:id/students",
  "GET departments",
  "GET holidays",
  "GET identifiers",
  "GET my/classes",
  "GET my/classes/:id/students",
  "GET officers",
  "GET records",
  "GET reports/print-data",
  "GET reports/staff-print-template",
  "GET session-settings",
  "GET sessions",
  "GET staff-attendance/records",
  "GET staff-attendance/reports",
  "GET staff-attendance/reports/authoritative",
  "GET staff-attendance/reports/summary",
  "GET student/attendance-devices",
  "GET student/attendance-history",
  "GET study-years",
  "POST alert-rules",
  "POST attendance-self-review/:id/decide",
  "POST attendance-windows",
  "POST attendance-windows/:id/close",
  "POST attendance-windows/:id/rotate",
  "POST holidays",
  "POST identifiers",
  "POST records",
  "POST scan",
  "POST sessions",
  "POST staff-attendance/scan",
  "POST student/attendance-devices",
  "POST student/self-scan",
  "PUT reports/staff-print-template",
  "PUT session-settings"
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
