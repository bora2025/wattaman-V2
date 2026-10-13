'use strict';

const crypto = require('node:crypto');

const RECORD = 'plugin_wattanam_academic_management_attendance_record';
const IDENTIFIER = 'plugin_wattanam_academic_management_attendance_identifier';
const SESSION = 'plugin_wattanam_academic_management_attendance_session';
const HOLIDAY = 'plugin_wattanam_academic_management_attendance_holiday';
const SCAN = 'plugin_wattanam_academic_management_attendance_scan';
const CORRECTION = 'plugin_wattanam_academic_management_attendance_correction';
const OFFICER = 'plugin_wattanam_academic_management_officer_profile';
const STUDY_YEAR = 'plugin_wattanam_academic_management_study_year';

const scanPermission = 'wattanam.academic-management.attendance.staff.scan';
const reportPermission = 'wattanam.academic-management.attendance.staff.report';
const correctPermission = 'wattanam.academic-management.attendance.staff.correct';

function required(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function local(value, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function minuteOfDay(value) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function timeWithinWindow(current, start, end) {
  const now = String(current || '').slice(0, 5);
  const from = String(start || '').slice(0, 5);
  const until = String(end || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(now) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(until)) return false;
  return from <= until ? now >= from && now <= until : now >= from || now <= until;
}

function staffRole(request) {
  const role = String(request?.principal?.role || '').toUpperCase();
  if (!['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'WATTAMAN'].includes(role)) throw new Error('This role cannot scan staff attendance');
}

function registerStaffAttendance(context) {
  context.permissions.register([
    { id: scanPermission, label: 'Scan and record staff attendance' },
    { id: reportPermission, label: 'View and export staff attendance reports' },
    { id: correctPermission, label: 'Correct staff attendance records' },
  ]);
  context.navigation.register([
    { id: 'staff-attendance-scanner', label: 'Staff Attendance', href: '/plugins/wattanam.academic-management/staff-attendance', permission: scanPermission },
    { id: 'staff-attendance-reports', label: 'Staff Attendance Reports', href: '/plugins/wattanam.academic-management/staff-attendance-reports', permission: reportPermission },
  ]);

  context.routes.register({
    method: 'GET', path: 'staff-attendance/records', permission: scanPermission,
    handler: async (request) => {
      const date = String(request?.query?.date || new Date().toISOString().slice(0, 10));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date is invalid');
      return context.database.query(
        `SELECT * FROM ${RECORD} WHERE "personType"='STAFF' AND "date"=$1::date ORDER BY "session","personNameSnapshot" LIMIT 1000`,
        [date],
      );
    },
  });

  context.routes.register({
    method: 'POST', path: 'staff-attendance/scan', permission: scanPermission,
    handler: async (request) => {
      staffRole(request);
      const body = request?.body || {};
      const code = required(body.code, 'code');
      const commandKey = required(body.idempotencyKey, 'idempotencyKey');
      const capturedAt = new Date(body.clientTimestamp || new Date());
      if (Number.isNaN(capturedAt.getTime())) throw new Error('clientTimestamp is invalid');
      const timeZone = await context.settings.get('school-timezone', 'Asia/Phnom_Penh');
      const schoolTime = local(capturedAt, timeZone);
      if ((await context.database.query(`SELECT "id" FROM ${HOLIDAY} WHERE "date"=$1::date LIMIT 1`, [schoolTime.date])).length) throw new Error('Staff attendance cannot be recorded on a configured holiday');
      const sessions = await context.database.query(
        `SELECT * FROM ${SESSION} WHERE "scope"='STAFF' AND "classId"='' ORDER BY "session"`,
      );
      const requested = body.session == null || body.session === '' ? null : Number(body.session);
      const active = sessions.find((candidate) => (requested === null || Number(candidate.session) === requested)
        && timeWithinWindow(schoolTime.time, candidate.startTime, candidate.endTime));
      if (!active) throw new Error('No active staff attendance session');
      const alias = (await context.database.query(
        `SELECT "personId" FROM ${IDENTIFIER} WHERE "code"=$1 AND "personType"='STAFF' AND "active"=TRUE LIMIT 1`, [code],
      ))[0];
      if (!alias) throw new Error('Staff attendance identifier not found');
      const officer = (await context.database.query(
        `SELECT o.*,d."name" AS "departmentName" FROM ${OFFICER} o LEFT JOIN plugin_wattanam_academic_management_department d ON d."id"=o."departmentId"::text WHERE o."id"=$1::uuid AND o."employmentStatus"='ACTIVE' LIMIT 1`,
        [alias.personId],
      ))[0];
      if (!officer) throw new Error('Active officer profile not found');
      const person = (await context.directory.lookupUsers([officer.userId]))[0];
      if (!person) throw new Error('Officer directory account not found');
      const lateAfter = Number(await context.settings.get('attendance-late-after-minutes', 15));
      const status = minuteOfDay(schoolTime.time) > minuteOfDay(active.startTime) + lateAfter ? 'LATE' : 'PRESENT';
      const studyYear = (await context.database.query(`SELECT "id","label","year" FROM ${STUDY_YEAR} WHERE "isCurrent"=TRUE ORDER BY "year" DESC LIMIT 1`))[0] || null;
      const idempotencyKey = `staff:${commandKey}`;
      const output = await context.database.transaction(async (tx) => {
        await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS "locked" FROM (SELECT COUNT(*) FROM ${SCAN}) AS namespace_guard`, [idempotencyKey]);
        const previous = (await tx.query(`SELECT "recordId" FROM ${SCAN} WHERE "idempotencyKey"=$1 LIMIT 1`, [idempotencyKey]))[0];
        if (previous?.recordId) return { record: (await tx.query(`SELECT * FROM ${RECORD} WHERE "id"=$1`, [previous.recordId]))[0], replay: true };
        const existing = (await tx.query(
          `SELECT * FROM ${RECORD} WHERE "personType"='STAFF' AND "personId"=$1 AND "date"=$2::date AND "session"=$3 LIMIT 1 FOR UPDATE`,
          [officer.id, schoolTime.date, Number(active.session)],
        ))[0];
        let record = existing;
        if (existing) {
          if (active.type === 'CHECK_OUT' && !existing.checkOutTime) {
            await tx.execute(`UPDATE ${RECORD} SET "checkOutTime"=$2::timestamptz,"scanLatitude"=$3,"scanLongitude"=$4,"scanLocation"=$5,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [existing.id, capturedAt.toISOString(), body.latitude ?? null, body.longitude ?? null, String(body.location || '').slice(0, 300) || null]);
            record = (await tx.query(`SELECT * FROM ${RECORD} WHERE "id"=$1`, [existing.id]))[0];
          }
        } else {
          const recordId = crypto.randomUUID();
          await tx.execute(
            `INSERT INTO ${RECORD} ("id","personId","personType","studyYearId","date","session","status","checkInTime","checkOutTime","markedById","scanMode","scanLatitude","scanLongitude","scanLocation","personNameSnapshot","personNumberSnapshot","classNameSnapshot","studyYearLabelSnapshot","source","originalScanAt","synchronizedAt")
             VALUES ($1,$2,'STAFF',$3,$4::date,$5,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11,$12,$13,$14,$15,$16,$17,'STAFF_SCAN',$18::timestamptz,CURRENT_TIMESTAMP)`,
            [recordId, officer.id, studyYear?.id || null, schoolTime.date, Number(active.session), status, active.type === 'CHECK_IN' ? capturedAt.toISOString() : null, active.type === 'CHECK_OUT' ? capturedAt.toISOString() : null, request.principal.userId, String(body.mode || '').toUpperCase() === 'USB' ? 'USB' : 'CAMERA', body.latitude ?? null, body.longitude ?? null, String(body.location || '').slice(0, 300) || null, person.name, officer.employeeNumber || null, officer.departmentName || null, studyYear?.label || (studyYear?.year ? String(studyYear.year) : null), capturedAt.toISOString()],
          );
          record = (await tx.query(`SELECT * FROM ${RECORD} WHERE "id"=$1`, [recordId]))[0];
        }
        await tx.execute(
          `INSERT INTO ${SCAN} ("id","idempotencyKey","codeHash","mode","principalId","clientTimestamp","outcome","recordId","metadata") VALUES ($1,$2,$3,$4,$5,$6::timestamptz,'ACCEPTED',$7,$8::jsonb)`,
          [crypto.randomUUID(), idempotencyKey, crypto.createHash('sha256').update(code).digest('hex'), String(body.mode || '').toUpperCase() === 'USB' ? 'USB' : 'CAMERA', request.principal.userId, capturedAt.toISOString(), record.id, JSON.stringify({ scope: 'STAFF', session: Number(active.session), timeZone })],
        );
        await tx.publish({ event: 'wattanam.academic-management.attendance.staff-recorded', version: 1, subjectKey: record.id, payload: { record }, idempotencyKey });
        return { record, replay: Boolean(existing) };
      });
      context.events.publish('attendance.staff.recorded.v1', { record: output.record, principal: request.principal });
      return { ...output.record, idempotentReplay: output.replay };
    },
  });

  context.routes.register({
    method: 'PATCH', path: 'staff-attendance/records/:id/correct', permission: correctPermission,
    handler: async (request) => {
      const status = String(request?.body?.status || '').toUpperCase();
      if (!['PRESENT', 'LATE', 'ABSENT', 'PERMISSION'].includes(status)) throw new Error('status is invalid');
      const reason = required(request?.body?.reason, 'reason');
      const id = required(request?.params?.id, 'record id');
      const permissionType = status === 'PERMISSION' ? String(request.body.permissionType || '').slice(0, 100) || null : null;
      const record = await context.database.transaction(async (tx) => {
        const previous = (await tx.query(`SELECT * FROM ${RECORD} WHERE "id"=$1 AND "personType"='STAFF' FOR UPDATE`, [id]))[0];
        if (!previous) throw new Error('Staff attendance record not found');
        await tx.execute(`UPDATE ${RECORD} SET "status"=$2,"permissionType"=$3,"markedById"=$4,"reviewStatus"='APPROVED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [id, status, permissionType, request.principal.userId]);
        await tx.execute(`INSERT INTO ${CORRECTION} ("id","recordId","actorId","reason","previousValue","newValue") VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`, [crypto.randomUUID(), id, request.principal.userId, reason, JSON.stringify({ status: previous.status, permissionType: previous.permissionType || null }), JSON.stringify({ status, permissionType })]);
        return (await tx.query(`SELECT * FROM ${RECORD} WHERE "id"=$1`, [id]))[0];
      });
      context.events.publish('wattanam.academic-management.attendance.staff-corrected.v1', { recordId: id, status, reason, actorId: request.principal.userId });
      return record;
    },
  });

  context.routes.register({
    method: 'GET', path: 'staff-attendance/reports', permission: reportPermission,
    handler: async (request) => {
      const startDate = String(request?.query?.startDate || new Date().toISOString().slice(0, 10));
      const endDate = String(request?.query?.endDate || startDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) throw new Error('report date range is invalid');
      return context.database.query(
        `SELECT "personId","personNameSnapshot","personNumberSnapshot","classNameSnapshot","date","session","status","checkInTime","checkOutTime","scanLocation","source"
         FROM ${RECORD} WHERE "personType"='STAFF' AND "date" BETWEEN $1::date AND $2::date ORDER BY "date","personNameSnapshot","session" LIMIT 10000`,
        [startDate, endDate],
      );
    },
  });

  context.routes.register({
    method: 'GET', path: 'staff-attendance/reports/summary', permission: reportPermission,
    handler: async (request) => {
      const startDate = String(request?.query?.startDate || new Date().toISOString().slice(0, 10));
      const endDate = String(request?.query?.endDate || startDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) throw new Error('report date range is invalid');
      return context.database.query(
        `SELECT "personId","personNameSnapshot","personNumberSnapshot",COUNT(*)::int AS "sessions",COUNT(*) FILTER (WHERE "status"='PRESENT')::int AS "present",COUNT(*) FILTER (WHERE "status"='LATE')::int AS "late",COUNT(*) FILTER (WHERE "status"='ABSENT')::int AS "absent",COUNT(*) FILTER (WHERE "status"='PERMISSION')::int AS "permission"
         FROM ${RECORD} WHERE "personType"='STAFF' AND "date" BETWEEN $1::date AND $2::date GROUP BY "personId","personNameSnapshot","personNumberSnapshot" ORDER BY "personNameSnapshot"`,
        [startDate, endDate],
      );
    },
  });
}

module.exports = { registerStaffAttendance };
