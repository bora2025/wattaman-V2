'use strict';

// Absences for the score documents (monthly bulletin, progress book, year report card, record book),
// from all three ways attendance is saved: Take Attendance, Scan Attendance and Student Permissions.
//   - PERMISSION (Take Attendance "permission", or a Student Permission) → with permission (មានច្បាប់);
//   - ABSENT (Take Attendance ✗) → without permission (ឥតច្បាប់);
//   - no record, on a study day of the class (not a holiday), in a session where attendance WAS taken
//     for the class (someone was marked present, late or absent) → without permission: the student
//     did not scan while the others did.
// A session nobody took attendance for (the months before the school used attendance, a day the scan
// was not opened, check-out sessions a school does not scan) counts no absence. Each missed session
// counts once (the books' "ដង").

const T = {
  record: 'plugin_wattanam_academic_management_attendance_record',
  holiday: 'plugin_wattanam_academic_management_attendance_holiday',
  klass: 'plugin_wattanam_academic_management_class',
  enrollment: 'plugin_wattanam_academic_management_enrollment_interval',
};
const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const TAKEN = new Set(['PRESENT', 'LATE', 'ABSENT']);

const day = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
};
const weekOf = (value) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value || {};
    return Array.isArray(parsed.week) && parsed.week.length ? parsed.week.map((d) => String(d).toUpperCase()) : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  } catch { return ['MON', 'TUE', 'WED', 'THU', 'FRI']; }
};

// One counter per class and request: loads the class's attendance for the widest span once,
// then counts any period inside it.
async function absenceCounter(context, classId, spanStart, spanEnd) {
  const db = context.database;
  const start = day(spanStart), end = day(spanEnd);
  if (!start || !end || start > end) return { count: (a, b, ids) => (ids || []).map((studentId) => ({ studentId, excused: 0, unexcused: 0 })) };
  const [classes, holidays, records, intervals] = await Promise.all([
    db.query(`SELECT "schedule" FROM ${T.klass} WHERE "id" = $1 LIMIT 1`, [classId]),
    db.query(`SELECT "date"::text AS "date" FROM ${T.holiday} WHERE "date" BETWEEN $1::date AND $2::date`, [start, end]),
    db.query(`SELECT "personId", "date"::text AS "date", "session", "status" FROM ${T.record} WHERE "personType" = 'STUDENT' AND "classId" = $1 AND "date" BETWEEN $2::date AND $3::date`, [classId, start, end]),
    db.query(`SELECT "studentId", "validFrom"::text AS "validFrom", "validTo"::text AS "validTo" FROM ${T.enrollment} WHERE "classId" = $1 AND "validFrom" <= $3::date AND ("validTo" IS NULL OR "validTo" >= $2::date)`, [classId, start, end]),
  ]);
  const week = new Set(weekOf(classes[0] && classes[0].schedule));
  const holidaySet = new Set(holidays.map((row) => day(row.date)));
  const studyDay = (date) => week.has(DAY_CODES[new Date(`${date}T00:00:00.000Z`).getUTCDay()]) && !holidaySet.has(date);
  // per date: each student's status per session, and the sessions attendance was taken in
  const byDate = new Map();
  records.forEach((row) => {
    const date = day(row.date), session = Number(row.session);
    if (!byDate.has(date)) byDate.set(date, { status: new Map(), taken: new Set() });
    const entry = byDate.get(date);
    entry.status.set(`${row.personId}:${session}`, row.status);
    if (TAKEN.has(row.status)) entry.taken.add(session);
  });
  const enrolledOn = (studentId, date) => intervals.some((row) => row.studentId === studentId && day(row.validFrom) <= date && (!row.validTo || day(row.validTo) >= date));

  return {
    // [{ studentId, excused, unexcused }] for the period, for every student asked about
    count(periodStart, periodEnd, studentIds) {
      const from = day(periodStart), to = day(periodEnd);
      const totals = new Map((studentIds || []).map((sid) => [sid, { studentId: sid, excused: 0, unexcused: 0 }]));
      byDate.forEach((entry, date) => {
        if (!from || !to || date < from || date > to) return;
        const expected = studyDay(date);
        totals.forEach((total, sid) => {
          if (!enrolledOn(sid, date)) return;
          const sessions = new Set(entry.taken);
          entry.status.forEach((status, key) => { if (key.startsWith(`${sid}:`)) sessions.add(Number(key.split(':').pop())); });
          sessions.forEach((session) => {
            const status = entry.status.get(`${sid}:${session}`);
            if (status === 'PERMISSION') total.excused += 1;
            else if (status === 'ABSENT' || (status === undefined && expected)) total.unexcused += 1;
          });
        });
      });
      return [...totals.values()];
    },
  };
}

module.exports = { absenceCounter };
