'use strict';

// Student permissions (ច្បាប់ឈប់សម្រាក): a teacher records that a student is excused for a morning, an
// afternoon, a full day or several days, with the reason. Every study session in the range becomes a
// PERMISSION attendance record, saved through the attendance runtime's own "mark" route so the class
// scope, enrolment and study-day checks and the attendance events stay exactly the same. Days the class
// does not study and school holidays are skipped. A permission can be cancelled; its PERMISSION
// records are removed (records changed since, e.g. the student came and was scanned, are kept).
const crypto = require('node:crypto');

const T = {
  permission: 'plugin_wattanam_academic_management_student_permission',
  klass: 'plugin_wattanam_academic_management_class',
  student: 'plugin_wattanam_academic_management_student_profile',
  session: 'plugin_wattanam_academic_management_attendance_session',
  holiday: 'plugin_wattanam_academic_management_attendance_holiday',
  record: 'plugin_wattanam_academic_management_attendance_record',
};
const MARK = 'wattanam.academic-management.attendance.mark';
const VIEW = 'wattanam.academic-management.attendance.view';
const PARTS = ['MORNING', 'AFTERNOON', 'FULL_DAY'];
const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const MAX_DAYS = 31;

function isoDay(value, name) {
  const text = String(value || '').slice(0, 10);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error(`${name} must be a date (YYYY-MM-DD)`);
  return text;
}
function addDays(day, n) { const d = new Date(`${day}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function week(schedule) {
  try { const parsed = typeof schedule === 'string' ? JSON.parse(schedule || '{}') : schedule || {}; return Array.isArray(parsed.week) && parsed.week.length ? parsed.week.map((d) => String(d).toUpperCase()) : WEEKDAYS; } catch { return WEEKDAYS; }
}
// The class's student sessions (its own, else the school's); morning = 1–2, afternoon = 3–4.
function sessionsFor(rows, classId, part) {
  const own = rows.filter((r) => r.classId === classId), all = own.length ? own : rows.filter((r) => !r.classId);
  const numbers = [...new Set(all.map((r) => Number(r.session)))].sort((a, b) => a - b);
  const list = numbers.length ? numbers : [1, 2, 3, 4];
  return list.filter((n) => (part === 'MORNING' ? n <= 2 : part === 'AFTERNOON' ? n >= 3 : true));
}
function permissionType(part, days) {
  if (days > 1) return 'MULTI_DAY';
  return part === 'MORNING' ? 'HALF_DAY_MORNING' : part === 'AFTERNOON' ? 'HALF_DAY_AFTERNOON' : 'FULL_DAY';
}

function registerStudentPermissions(context, helpers) {
  const db = context.database;
  const { saveRecord, requireClassStaffScope, decorateStudentRows } = helpers;

  context.routes.register({
    method: 'POST', path: 'attendance/permissions', permission: MARK,
    handler: async (request) => {
      const body = request?.body || {};
      const classId = String(body.classId || '').trim();
      const studentId = String(body.studentId || '').trim();
      if (!classId || !studentId) throw new Error('classId and studentId are required');
      await requireClassStaffScope(request, classId);
      const part = PARTS.includes(String(body.part || '').toUpperCase()) ? String(body.part).toUpperCase() : 'FULL_DAY';
      const from = isoDay(body.from, 'from');
      const to = body.to ? isoDay(body.to, 'to') : from;
      if (to < from) throw new Error('The last day must be on or after the first day');
      const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
      if (span > MAX_DAYS) throw new Error(`A permission can cover at most ${MAX_DAYS} days`);
      if (span > 1 && part !== 'FULL_DAY') throw new Error('A permission over several days covers full days');
      const reason = String(body.reason || '').trim().slice(0, 500);
      if (!reason) throw new Error('Write the reason for the permission');
      const [klass, sessionRows, holidays] = await Promise.all([
        db.query(`SELECT "id", "name", "schedule" FROM ${T.klass} WHERE "id" = $1 LIMIT 1`, [classId]),
        db.query(`SELECT "classId", "session" FROM ${T.session} WHERE "scope" = 'STUDENT'`),
        db.query(`SELECT "date"::text AS "date", "name" FROM ${T.holiday} WHERE "date" BETWEEN $1::date AND $2::date`, [from, to]),
      ]);
      if (!klass.length) throw new Error('Class not found');
      const studyDays = week(klass[0].schedule);
      const holidayOn = new Map(holidays.map((h) => [String(h.date).slice(0, 10), h.name]));
      const sessions = sessionsFor(sessionRows, classId, part);
      const type = permissionType(part, span);
      const days = [], skipped = [];
      for (let i = 0; i < span; i += 1) {
        const day = addDays(from, i);
        if (!studyDays.includes(DAY_CODES[new Date(`${day}T00:00:00Z`).getUTCDay()])) { skipped.push({ date: day, why: 'no class' }); continue; }
        if (holidayOn.has(day)) { skipped.push({ date: day, why: holidayOn.get(day) || 'holiday' }); continue; }
        days.push(day);
      }
      if (!days.length) throw new Error('The class does not study on any of these days');
      // Saved one session at a time through the attendance runtime (scope, enrolment, events).
      for (const day of days) {
        for (const session of sessions) {
          await saveRecord({ principal: request.principal, body: { personId: studentId, classId, date: day, session, status: 'PERMISSION', permissionType: type } });
        }
      }
      const row = {
        id: crypto.randomUUID(), studentId, classId, fromDate: from, toDate: to, part, reason,
        days: days.length, sessions: days.length * sessions.length, createdById: request.principal.userId,
      };
      await db.execute(
        `INSERT INTO ${T.permission} ("id","studentId","classId","fromDate","toDate","part","reason","days","sessions","createdById") VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10)`,
        [row.id, row.studentId, row.classId, row.fromDate, row.toDate, row.part, row.reason, row.days, row.sessions, row.createdById],
      );
      return { ...row, permissionType: type, dates: days, skipped };
    },
  });

  context.routes.register({
    method: 'GET', path: 'attendance/permissions', permission: VIEW,
    handler: async (request) => {
      const classId = String(request?.query?.classId || '').trim();
      if (!classId) throw new Error('classId is required');
      await requireClassStaffScope(request, classId);
      const rows = await db.query(
        `SELECT p."id", p."studentId", p."classId", p."fromDate"::text AS "fromDate", p."toDate"::text AS "toDate", p."part", p."reason", p."days", p."sessions", p."createdById", p."createdAt",
                s."userId", s."studentNumber", s."nameKh"
           FROM ${T.permission} p JOIN ${T.student} s ON s."id" = p."studentId"
          WHERE p."classId" = $1 ORDER BY p."fromDate" DESC, p."createdAt" DESC LIMIT 200`, [classId]);
      const decorated = await decorateStudentRows(rows.map((row) => ({ ...row, id: row.studentId, permissionId: row.id })));
      return decorated.map((row) => ({
        id: row.permissionId, studentId: row.studentId, classId: row.classId, studentNumber: row.studentNumber || '', name: row.name || row.nameKh || '', nameKh: row.nameKh || '',
        fromDate: String(row.fromDate).slice(0, 10), toDate: String(row.toDate).slice(0, 10), part: row.part, reason: row.reason, days: Number(row.days), sessions: Number(row.sessions), createdAt: row.createdAt,
      }));
    },
  });

  context.routes.register({
    method: 'DELETE', path: 'attendance/permissions/:id', permission: MARK,
    handler: async (request) => {
      const rows = await db.query(`SELECT "id", "studentId", "classId", "fromDate"::text AS "fromDate", "toDate"::text AS "toDate", "part" FROM ${T.permission} WHERE "id" = $1 LIMIT 1`, [String(request?.params?.id || '')]);
      if (!rows.length) throw new Error('Permission not found');
      const p = rows[0];
      await requireClassStaffScope(request, p.classId);
      const sessionRows = await db.query(`SELECT "classId", "session" FROM ${T.session} WHERE "scope" = 'STUDENT'`);
      const sessions = sessionsFor(sessionRows, p.classId, p.part);
      return db.transaction(async (tx) => {
        const removed = await tx.execute(
          `DELETE FROM ${T.record} WHERE "personType" = 'STUDENT' AND "personId" = $1 AND "classId" = $2 AND "date" BETWEEN $3::date AND $4::date AND "session" = ANY($5::int[]) AND "status" = 'PERMISSION'`,
          [p.studentId, p.classId, String(p.fromDate).slice(0, 10), String(p.toDate).slice(0, 10), sessions]);
        await tx.execute(`DELETE FROM ${T.permission} WHERE "id" = $1`, [p.id]);
        return { id: p.id, cancelled: true, recordsRemoved: removed.count };
      });
    },
  });
}

module.exports = { registerStudentPermissions, sessionsFor, permissionType };
