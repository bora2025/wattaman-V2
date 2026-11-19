'use strict';

const studentDetails = require('./student-details');

// My Class (Teacher Portal): one class at a glance for its teacher — the class, every student with their
// details and guardian, today's attendance (best status of the day, or not marked / day off), this
// month's attendance per student and the recent permissions. Scoped by the class-staff check: a teacher
// or class admin gets only their own class; administrators and the school-wide roles any class.
const T = {
  klass: 'plugin_wattanam_academic_management_class',
  student: 'plugin_wattanam_academic_management_student_profile',
  enrollment: 'plugin_wattanam_academic_management_enrollment_interval',
  studyYear: 'plugin_wattanam_academic_management_study_year',
  record: 'plugin_wattanam_academic_management_attendance_record',
  holiday: 'plugin_wattanam_academic_management_attendance_holiday',
  permission: 'plugin_wattanam_academic_management_student_permission',
  sheet: 'plugin_wattanam_academic_management_transcript_sheet',
  sheetClass: 'plugin_wattanam_academic_management_transcript_sheet_class',
};
const VIEW = 'wattanam.academic-management.attendance.view';
const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

function week(schedule) {
  try { const parsed = typeof schedule === 'string' ? JSON.parse(schedule || '{}') : schedule || {}; return Array.isArray(parsed.week) && parsed.week.length ? parsed.week.map((d) => String(d).toUpperCase()) : WEEKDAYS; } catch { return WEEKDAYS; }
}
// One status per day: present, then late, then permission, then absent (as the attendance dashboard).
function bestStatus(statuses) {
  for (const [status, name] of [['PRESENT', 'present'], ['LATE', 'late'], ['PERMISSION', 'permission'], ['ABSENT', 'absent']]) if (statuses.has(status)) return name;
  return null;
}

function registerMyClass(context, helpers) {
  const db = context.database;
  const { requireClassStaffScope, decorateStudentRows } = helpers;

  context.routes.register({
    method: 'GET', path: 'my/classes/:id/overview', permission: VIEW,
    handler: async (request) => {
      const classId = String(request?.params?.id || '');
      if (!classId) throw new Error('Class not found');
      await requireClassStaffScope(request, classId);
      const timeZone = await context.settings.get('school-timezone', 'Asia/Phnom_Penh');
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
      const today = `${parts.year}-${parts.month}-${parts.day}`, monthStart = `${parts.year}-${parts.month}-01`;
      const klass = (await db.query(
        `SELECT c."id", c."name", c."subject", c."schedule", c."teacherId", c."classAdminId", c."level", COALESCE(y."label", y."year"::text) AS "studyYear"
           FROM ${T.klass} c LEFT JOIN ${T.studyYear} y ON y."id" = c."studyYearId" WHERE c."id" = $1 LIMIT 1`, [classId]))[0];
      if (!klass) throw new Error('Class not found');
      // The kinds of score sheet the class uses (Enter scores opens the right one).
      const scoreKinds = (await db.query(`SELECT DISTINCT s."kind" FROM ${T.sheet} s JOIN ${T.sheetClass} sc ON sc."sheetId" = s."id" JOIN ${T.klass} c ON c."id" = sc."classId" WHERE sc."classId" = $1 AND (c."level" IS NULL OR c."level" = 'SHORT_COURSE' OR (s."kind" = 'UNIVERSITY' AND c."level" = 'UNIVERSITY') OR (s."kind" <> 'UNIVERSITY' AND c."level" IN ('PRIMARY', 'SECONDARY', 'HIGH_SCHOOL')))`, [classId])).map((row) => row.kind).sort();
      const [rows, records, holidays, permissions] = await Promise.all([
        db.query(
          `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."sex", s."photo", s."dateOfBirth"::text AS "dateOfBirth", s."address", ${studentDetails.detailColumns('s')}, s."guardianUserId"
             FROM ${T.student} s JOIN ${T.enrollment} e ON e."studentId" = s."id" AND e."validTo" IS NULL
            WHERE e."classId" = $1 ORDER BY s."studentNumber" ASC NULLS LAST`, [classId]),
        db.query(
          `SELECT "personId", "date"::text AS "date", "status" FROM ${T.record}
            WHERE "personType" = 'STUDENT' AND "classId" = $1 AND "date" BETWEEN $2::date AND $3::date`, [classId, monthStart, today]),
        db.query(`SELECT "date"::text AS "date", "name" FROM ${T.holiday} WHERE "date" BETWEEN $1::date AND $2::date`, [monthStart, today]),
        db.query(
          `SELECT p."id", p."studentId", p."fromDate"::text AS "fromDate", p."toDate"::text AS "toDate", p."part", p."reason", p."days"
             FROM ${T.permission} p WHERE p."classId" = $1 ORDER BY p."fromDate" DESC, p."createdAt" DESC LIMIT 30`, [classId]).catch(() => []),
      ]);
      const students = await decorateStudentRows(rows);
      const people = await context.directory.lookupUsers([klass.teacherId, ...rows.map((r) => r.guardianUserId)].filter(Boolean));
      const person = new Map(people.map((u) => [u.id, u]));
      const studyDays = week(klass.schedule);
      const holidayToday = holidays.find((h) => String(h.date).slice(0, 10) === today);
      const studyToday = studyDays.includes(DAY_CODES[new Date(`${today}T00:00:00Z`).getUTCDay()]) && !holidayToday;
      // per student, per day
      const byStudent = new Map();
      for (const r of records) {
        const day = String(r.date).slice(0, 10);
        if (!byStudent.has(r.personId)) byStudent.set(r.personId, new Map());
        const days = byStudent.get(r.personId);
        if (!days.has(day)) days.set(day, new Set());
        days.get(day).add(r.status);
      }
      const totals = { students: students.length, male: 0, female: 0, present: 0, late: 0, permission: 0, absent: 0, unmarked: 0 };
      const list = students.map((s) => {
        const days = byStudent.get(s.id) || new Map();
        const todayStatus = days.has(today) ? bestStatus(days.get(today)) : studyToday ? 'unmarked' : 'off';
        const month = { present: 0, late: 0, permission: 0, absent: 0 };
        for (const statuses of days.values()) { const best = bestStatus(statuses); if (best) month[best] += 1; }
        if (s.sex === 'MALE') totals.male += 1; else if (s.sex === 'FEMALE') totals.female += 1;
        if (todayStatus in totals) totals[todayStatus] += 1;
        const guardian = s.guardianUserId ? person.get(s.guardianUserId) : null;
        return {
          id: s.id, studentNumber: s.studentNumber || '', name: s.name || '', nameKh: s.nameKh || '', sex: s.sex || null,
          photo: s.photo || '', dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : null, address: s.address || '', ...studentDetails.detailsOut(s),
          email: s.email || '', phone: s.phone || '',
          guardian: guardian ? { name: guardian.name || '', phone: guardian.phone || '', email: guardian.email || '' } : null,
          today: todayStatus, month,
        };
      });
      const teacher = klass.teacherId ? person.get(klass.teacherId) : null;
      const names = new Map(list.map((s) => [s.id, s]));
      return {
        class: { id: klass.id, name: klass.name, subject: klass.subject || '', studyYear: klass.studyYear || '', teacher: teacher ? teacher.name || '' : '', studyDays, level: klass.level || null, scoreKinds },
        date: today, studyToday, holiday: holidayToday ? holidayToday.name || 'Holiday' : null,
        totals, students: list,
        permissions: permissions.filter((p) => names.has(p.studentId)).map((p) => ({
          id: p.id, studentId: p.studentId, name: names.get(p.studentId).nameKh || names.get(p.studentId).name, studentNumber: names.get(p.studentId).studentNumber,
          fromDate: String(p.fromDate).slice(0, 10), toDate: String(p.toDate).slice(0, 10), part: p.part, reason: p.reason, days: Number(p.days),
        })),
      };
    },
  });
}

module.exports = { registerMyClass, bestStatus };
