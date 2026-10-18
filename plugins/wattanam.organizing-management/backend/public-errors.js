'use strict';

const ATTENDANCE_SCAN_ERRORS = {
  SCANNER_RATE_LIMIT_EXCEEDED: { status: 429, message: 'Too many scans were submitted. Wait a moment and try again.' },
  SCAN_TIMESTAMP_OUT_OF_RANGE: { status: 409, message: 'The scan time is outside the allowed offline window. Check the device clock and reconnect.' },
  QR_CODE_NOT_RECOGNIZED: { status: 404, message: 'This QR code does not belong to a workforce card.' },
  WORKFORCE_MEMBER_NOT_ACTIVE: { status: 409, message: 'This workforce member is not active.' },
  NOT_A_CONFIGURED_WORK_DAY: { status: 409, message: 'Today is not configured as a working day.' },
  ORGANIZATION_HOLIDAY: { status: 409, message: 'Attendance is closed for an organization holiday.' },
  APPROVED_DAY_OFF: { status: 409, message: 'This workforce member has an approved day off.' },
  CHECK_OUT_TOO_SOON: { status: 409, message: 'Check-out is not available yet. Wait for the configured minimum work period.' },
};

const PASSTHROUGH_SCHEMA = { parse: (value) => value };

function normalizeAttendanceCode(message) {
  if (/^CHECK_OUT_TOO_SOON_\d+_MINUTES$/.test(message)) return 'CHECK_OUT_TOO_SOON';
  return Object.prototype.hasOwnProperty.call(ATTENDANCE_SCAN_ERRORS, message) ? message : null;
}

module.exports = function withPublicErrors(context) {
  return {
    ...context,
    routes: {
      register(definition) {
        if (definition.method !== 'POST' || definition.path !== 'attendance/scan') return context.routes.register(definition);
        const handler = definition.handler;
        return context.routes.register({
          ...definition,
          contract: { version: '1.0', response: PASSTHROUGH_SCHEMA, errors: ATTENDANCE_SCAN_ERRORS },
          async handler(request) {
            try { return await handler(request); }
            catch (error) {
              const diagnostic = error instanceof Error ? error.message : String(error);
              const code = normalizeAttendanceCode(diagnostic);
              if (code) throw context.errors.contract(code, diagnostic);
              throw error;
            }
          },
        });
      },
    },
  };
};

module.exports.ATTENDANCE_SCAN_ERRORS = ATTENDANCE_SCAN_ERRORS;
module.exports.normalizeAttendanceCode = normalizeAttendanceCode;
