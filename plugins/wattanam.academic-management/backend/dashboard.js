'use strict';

// Attendance dashboard, cloned from the school's original admin dashboard: today's (or any day's)
// student and staff headcount, class-by-class progress, a per-person list, the monthly trend,
// perfect attendance for the month, and 3/6/9-month perfect-attendance milestones of the study year.
// Counting rule (as the original): each person counts once per day by their best status in either
// half-day — present, then late, then permission, then absent — and a person with no record is absent.
// Unlike the original, a class's day off and school holidays are not counted as absences.
const T = {
  klass: 'plugin_wattanam_academic_management_class',
  student: 'plugin_wattanam_academic_management_student_profile',
  enrollment: 'plugin_wattanam_academic_management_enrollment_interval',
  officer: 'plugin_wattanam_academic_management_officer_profile',
  record: 'plugin_wattanam_academic_management_attendance_record',
  holiday: 'plugin_wattanam_academic_management_attendance_holiday',
  studyYear: 'plugin_wattanam_academic_management_study_year',
};
const VIEW = 'wattanam.academic-management.attendance.view';
const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

function isoDay(value, name) {
  const text = String(value || '').slice(0, 10);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error(`${name} is invalid`);
  return text;
}
function dayCode(day) { return DAY_CODES[new Date(`${day}T00:00:00.000Z`).getUTCDay()]; }
function week(value) {
  try { const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value || {}; return Array.isArray(parsed.week) && parsed.week.length ? parsed.week.map((d) => String(d).toUpperCase()) : WEEKDAYS; } catch { return WEEKDAYS; }
}
// Best status in one half-day block, then across the day.
function blockStatus(statuses) {
  if (statuses.includes('PRESENT')) return 'present';
  if (statuses.includes('LATE')) return 'late';
  if (statuses.includes('PERMISSION')) return 'permission';
  if (statuses.includes('ABSENT')) return 'absent';
  return null;
}
function dayStatus(records) {
  if (!records || !records.length) return 'absent';
  const am = blockStatus(records.filter((r) => Number(r.session) <= 2).map((r) => r.status));
  const pm = blockStatus(records.filter((r) => Number(r.session) >= 3).map((r) => r.status));
  for (const status of ['present', 'late', 'permission', 'absent']) if (am === status || pm === status) return status;
  return 'absent';
}
function emptyTotals() { return { total: 0, present: 0, late: 0, absent: 0, permission: 0, off: 0, unmarked: 0, permissionBreakdown: { halfDayMorning: 0, halfDayAfternoon: 0, fullDay: 0, multiDay: 0, unknown: 0 } }; }
function addPermissionType(totals, records) {
  const type = (records.find((r) => r.status === 'PERMISSION' && r.permissionType) || {}).permissionType;
  const key = { HALF_DAY_MORNING: 'halfDayMorning', HALF_DAY_AFTERNOON: 'halfDayAfternoon', FULL_DAY: 'fullDay', MULTI_DAY: 'multiDay' }[type] || 'unknown';
  totals.permissionBreakdown[key] += 1;
}
function groupBy(rows, key) { const map = new Map(); for (const row of rows) { const k = key(row); if (!map.has(k)) map.set(k, []); map.get(k).push(row); } return map; }

function registerDashboard(context, helpers) {
  const db = context.database;
  const { decorateStudentRows, decorateOfficerRows } = helpers;

  const today = async () => {
    const timeZone = await context.settings.get('school-timezone', 'Asia/Phnom_Penh');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, timeZone };
  };
  const students = async () => decorateStudentRows(await db.query(
    `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."photo", s."address", s."sex", e."classId", c."name" AS "className", c."schedule"
     FROM ${T.student} s JOIN ${T.enrollment} e ON e."studentId" = s."id" AND e."validTo" IS NULL JOIN ${T.klass} c ON c."id" = e."classId"
     ORDER BY c."name", s."studentNumber" NULLS LAST`));
  const staff = async () => decorateOfficerRows(await db.query(
    `SELECT o."id", o."userId", o."employeeNumber", o."position", o."departmentId", o."employmentStatus", o."startedAt", o."endedAt", o."photoUrl", o."notes", o."createdAt", o."updatedAt"
     FROM ${T.officer} o WHERE o."employmentStatus" = 'ACTIVE' ORDER BY o."employeeNumber" NULLS LAST`));

  const dayFigures = async (date, now) => {
      const [studentRows, staffRows, classes, records, holidays, settings] = await Promise.all([
        students(), staff(),
        db.query(`SELECT "id", "name", "schedule" FROM ${T.klass} ORDER BY "name"`),
        db.query(`SELECT "personId", "personType", "classId", "session", "status", "permissionType" FROM ${T.record} WHERE "date" = $1::date AND "personType" IN ('STUDENT', 'STAFF') LIMIT 50000`, [date]),
        db.query(`SELECT "name" FROM ${T.holiday} WHERE "date" = $1::date LIMIT 1`, [date]),
        context.settings.get('attendance-session-settings', { staffWorkingDays: WEEKDAYS }),
      ]);
      const holiday = holidays[0] ? holidays[0].name || 'Holiday' : null;
      const code = dayCode(date);
      const studentRecords = groupBy(records.filter((r) => r.personType === 'STUDENT'), (r) => r.personId);
      const staffRecords = groupBy(records.filter((r) => r.personType === 'STAFF'), (r) => r.personId);
      const people = [];
      const studentTotals = emptyTotals();
      const progress = new Map(classes.map((c) => [c.id, { classId: c.id, className: c.name, total: 0, present: 0, late: 0, absent: 0, permission: 0, off: false }]));
      for (const student of studentRows) {
        const mine = studentRecords.get(student.id) || [];
        const studyDay = week(student.schedule).includes(code);
        const off = !mine.length && (Boolean(holiday) || !studyDay);
        const status = off ? 'off' : dayStatus(mine);
        studentTotals.total += 1; studentTotals[status] += 1;
        if (!off && !mine.length) studentTotals.unmarked += 1;
        if (status === 'permission') addPermissionType(studentTotals, mine);
        const row = progress.get(student.classId);
        if (row) { row.total += 1; if (off) row.off = true; else row[status] += 1; }
        people.push({ key: 's:' + student.id, kind: 'Student', number: student.studentNumber || '', name: student.name || student.nameKh || '', nameKh: student.nameKh || '', group: student.className || '', groupId: student.classId, status, address: student.address || '', photo: student.photo || '' });
      }
      const staffWorkingDay = (Array.isArray(settings.staffWorkingDays) && settings.staffWorkingDays.length ? settings.staffWorkingDays : WEEKDAYS).includes(code);
      const staffTotals = emptyTotals();
      for (const officer of staffRows) {
        const mine = staffRecords.get(officer.id) || staffRecords.get(officer.userId) || [];
        const off = !mine.length && (Boolean(holiday) || !staffWorkingDay);
        const status = off ? 'off' : dayStatus(mine);
        staffTotals.total += 1; staffTotals[status] += 1;
        if (!off && !mine.length) staffTotals.unmarked += 1;
        if (status === 'permission') addPermissionType(staffTotals, mine);
        people.push({ key: 'o:' + officer.id, kind: 'Staff', number: officer.employeeNumber || '', name: officer.name || '', nameKh: '', group: (officer.department && officer.department.name) || '', groupId: officer.departmentId || '', status, position: officer.position || '', photo: officer.photoUrl || '' });
      }
      const classProgress = [...progress.values()].filter((row) => row.total > 0).map((row) => {
        const scanned = row.present + row.late;
        return { ...row, scanned, pctPresent: row.total ? Math.round((row.present / row.total) * 100) : 0, pctScanned: row.total ? Math.round((scanned / row.total) * 100) : 0 };
      });
      return { date, today: now.date, timeZone: now.timeZone, holiday, students: studentTotals, staff: staffTotals, classProgress, people, generatedAt: new Date().toISOString() };
  };
  context.routes.register({
    method: 'GET', path: 'dashboard/day', permission: VIEW,
    handler: async (request) => {
      const now = await today();
      return dayFigures(request?.query?.date ? isoDay(request.query.date, 'date') : now.date, now);
    },
  });

  // The school's main dashboard (core convention: GET dashboard/summary): today's attendance and the
  // school's size, as widgets the core draws. Links stay inside this plugin.
  const BASE = '/plugins/wattanam.academic-management';
  const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
  const rateTone = (rate) => (rate === null ? 'neutral' : rate >= 90 ? 'good' : rate >= 75 ? 'warn' : 'bad');
  const myClassesSummary = async (now, own, userId) => {
    const mine = await db.query(`SELECT "id", "name" FROM ${T.klass} WHERE "${own}" = $1 ORDER BY "name"`, [userId]);
    const ids = new Set(mine.map((c) => c.id));
    const day = await dayFigures(now.date, now);
    const rows = day.classProgress.filter((row) => ids.has(row.classId));
    const students = rows.reduce((n, r) => n + r.total, 0);
    const present = rows.reduce((n, r) => n + r.present + r.late, 0);
    const permission = rows.reduce((n, r) => n + r.permission, 0);
    const taken = (row) => Boolean(row) && !row.off && (row.present + row.late + row.permission + row.absent) > 0;
    const anyTaken = rows.some(taken);
    return [{
      id: 'my-classes', title: 'My classes today', priority: 5, href: `${BASE}/attendance`,
      description: !mine.length ? 'No class is assigned to you yet.' : day.holiday ? `Holiday today: ${day.holiday}` : `${mine.length} class${mine.length === 1 ? '' : 'es'} · ${students} students`,
      updatedAt: day.generatedAt,
      stats: [
        { id: 'classes', label: 'My classes', value: mine.length, tone: 'info', href: `${BASE}/classes` },
        { id: 'students', label: 'Students', value: students, tone: 'info' },
        { id: 'present', label: 'Present today', value: anyTaken && students ? `${percent(present, students)}%` : '—', hint: anyTaken ? `${present} of ${students}` : 'Not taken yet', tone: anyTaken ? rateTone(percent(present, students)) : 'neutral' },
        { id: 'permission', label: 'Permission', value: permission, hint: 'excused today', tone: 'info', href: `${BASE}/student-permissions` },
      ],
      itemsTitle: 'Take attendance',
      items: mine.slice(0, 8).map((klass) => {
        const row = rows.find((r) => r.classId === klass.id);
        const value = !row ? '—' : row.off ? 'Day off' : taken(row) ? `${row.pctScanned}%` : 'Not taken';
        return {
          label: klass.name, value,
          hint: row && !row.off ? `${row.scanned} of ${row.total} present · ${row.permission} permission` : undefined,
          tone: !row || row.off ? 'neutral' : taken(row) ? rateTone(row.pctScanned) : 'warn',
          href: `${BASE}/attendance?classId=${encodeURIComponent(klass.id)}`,
        };
      }),
    }];
  };
  context.routes.register({
    method: 'GET', path: 'dashboard/summary', permission: VIEW,
    handler: async (request) => {
      const now = await today();
      // A teacher (or class admin) sees their own classes only.
      const principal = (request && request.principal) || {};
      const own = principal.role === 'TEACHER' ? 'teacherId' : principal.role === 'CLASS_ADMIN' ? 'classAdminId' : null;
      if (own) return myClassesSummary(now, own, principal.userId);
      const [day, counts, years] = await Promise.all([
        dayFigures(now.date, now),
        db.query(`SELECT
            (SELECT COUNT(*)::int FROM ${T.student} s JOIN ${T.enrollment} e ON e."studentId" = s."id" AND e."validTo" IS NULL) AS "students",
            (SELECT COUNT(*)::int FROM ${T.student} s JOIN ${T.enrollment} e ON e."studentId" = s."id" AND e."validTo" IS NULL WHERE s."sex" = 'FEMALE') AS "female",
            (SELECT COUNT(*)::int FROM ${T.officer} WHERE "employmentStatus" = 'ACTIVE') AS "staff",
            (SELECT COUNT(*)::int FROM ${T.klass}) AS "classes"`),
        db.query(`SELECT "label", "year", to_char("startDate", 'YYYY-MM-DD') AS "startDate", to_char("endDate", 'YYYY-MM-DD') AS "endDate" FROM ${T.studyYear} WHERE "isCurrent" = TRUE LIMIT 1`),
      ]);
      const c = counts[0] || {}, year = years[0] || null;
      const s = day.students, st = day.staff;
      const due = s.total - s.off, marked = due - s.unmarked, attended = s.present + s.late;
      const staffDue = st.total - st.off, staffAttended = st.present + st.late;
      const taken = marked > 0;
      const rate = taken ? percent(attended, due) : null, staffRate = st.total - st.off - st.unmarked > 0 ? percent(staffAttended, staffDue) : null;
      const description = day.holiday ? `Holiday today: ${day.holiday}`
        : !due ? 'No classes study today.'
        : taken ? `${marked} of ${due} students marked so far${s.unmarked ? ` · ${s.unmarked} not marked yet` : ''}.`
        : 'Attendance has not been taken yet today.';
      const followUp = day.classProgress
        .filter((row) => !row.off && row.total)
        .sort((a, b) => a.pctScanned - b.pctScanned || a.className.localeCompare(b.className))
        .slice(0, 5)
        .map((row) => ({ label: row.className, value: `${row.pctScanned}%`, hint: `${row.scanned} of ${row.total} present · ${row.absent} absent`, tone: rateTone(row.pctScanned), href: `${BASE}/attendance?classId=${encodeURIComponent(row.classId)}` }));
      const attendance = {
        id: 'attendance-today', title: "Today's attendance", priority: 10, href: `${BASE}/dashboard`, description, updatedAt: day.generatedAt,
        stats: [
          { id: 'student-rate', label: 'Students present', value: rate === null ? '—' : `${rate}%`, hint: taken ? `${attended} of ${due} (late ${s.late})` : due ? `${due} students due today` : 'No study today', tone: rateTone(rate), href: `${BASE}/dashboard` },
          { id: 'absent', label: 'Absent', value: Math.max(0, s.absent - s.unmarked), hint: 'marked absent', tone: s.absent - s.unmarked > 0 ? 'bad' : 'neutral', href: `${BASE}/dashboard` },
          { id: 'permission', label: 'Permission', value: s.permission, hint: 'excused', tone: 'info' },
          { id: 'unmarked', label: 'Not marked', value: s.unmarked, hint: 'no record yet', tone: s.unmarked > 0 ? 'warn' : 'good', href: `${BASE}/attendance` },
          { id: 'staff-rate', label: 'Staff present', value: staffRate === null ? '—' : `${staffRate}%`, hint: staffDue ? `${staffAttended} of ${staffDue}` : 'No working day', tone: rateTone(staffRate), href: `${BASE}/officer-attendance-reports` },
        ],
        segments: taken ? [
          { label: 'Present', value: s.present, tone: 'good' }, { label: 'Late', value: s.late, tone: 'warn' },
          { label: 'Permission', value: s.permission, tone: 'info' }, { label: 'Absent', value: Math.max(0, s.absent - s.unmarked), tone: 'bad' },
          { label: 'Not marked', value: s.unmarked, tone: 'neutral' },
        ] : [],
        itemsTitle: 'Classes to follow up', items: taken ? followUp : [],
      };
      const overview = {
        id: 'school-overview', title: 'School overview', priority: 20, href: `${BASE}/classes`,
        description: year ? `Academic year ${year.label || year.year}` : 'No current academic year — set one in Academic Years.',
        stats: [
          { id: 'students', label: 'Students', value: Number(c.students || 0), hint: `${Number(c.female || 0)} female`, tone: 'info', href: `${BASE}/classes` },
          { id: 'staff', label: 'Teachers & staff', value: Number(c.staff || 0), hint: 'active', tone: 'info', href: `${BASE}/officers` },
          { id: 'classes', label: 'Classes', value: Number(c.classes || 0), tone: 'info', href: `${BASE}/classes` },
          { id: 'year', label: 'Academic year', value: year ? String(year.label || year.year) : '—', hint: year && year.startDate && year.endDate ? `${year.startDate} → ${year.endDate}` : undefined, tone: year ? 'neutral' : 'warn', href: `${BASE}/study-years` },
        ],
      };
      return [attendance, overview];
    },
  });

  // Daily present/absent counts for a month, and the month's perfect attendance.
  context.routes.register({
    method: 'GET', path: 'dashboard/month', permission: VIEW,
    handler: async (request) => {
      const now = await today();
      const year = Number(request?.query?.year || now.date.slice(0, 4));
      const month = Number(request?.query?.month || now.date.slice(5, 7));
      if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('year or month is invalid');
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const end = `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
      const [records, studentRows] = await Promise.all([
        db.query(`SELECT "personId", "personType", "date"::text AS "day", "status" FROM ${T.record} WHERE "date" BETWEEN $1::date AND $2::date AND "personType" IN ('STUDENT', 'STAFF') LIMIT 200000`, [start, end]),
        students(),
      ]);
      const trend = [];
      for (let d = 1; d <= days; d += 1) {
        const day = `${start.slice(0, 8)}${String(d).padStart(2, '0')}`;
        const mine = records.filter((r) => r.day === day);
        const count = (type, statuses) => new Set(mine.filter((r) => r.personType === type && statuses.includes(r.status)).map((r) => r.personId)).size;
        trend.push({ day: d, studentPresent: count('STUDENT', ['PRESENT', 'LATE']), studentAbsent: count('STUDENT', ['ABSENT']), staffPresent: count('STAFF', ['PRESENT', 'LATE']), staffAbsent: count('STAFF', ['ABSENT']) });
      }
      return { year, month, trend, perfect: perfectAttendance(studentRows, records.filter((r) => r.personType === 'STUDENT')) };
    },
  });

  // Perfect attendance since the study year began, at 3, 6 and 9 months.
  context.routes.register({
    method: 'GET', path: 'dashboard/milestones', permission: VIEW,
    handler: async () => {
      const now = await today();
      const year = (await db.query(`SELECT "label", "year", "startDate"::text AS "startDate", "endDate"::text AS "endDate" FROM ${T.studyYear} WHERE "isCurrent" = TRUE ORDER BY "year" DESC LIMIT 1`))[0] || null;
      const periodStart = year && year.startDate ? year.startDate.slice(0, 10) : `${now.date.slice(0, 4)}-01-01`;
      const yearEnd = year && year.endDate ? year.endDate.slice(0, 10) : null;
      const studentRows = await students();
      const milestones = {};
      for (const months of [3, 6, 9]) {
        const startDate = new Date(`${periodStart}T00:00:00.000Z`);
        let periodEnd = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + months, startDate.getUTCDate())).toISOString().slice(0, 10);
        if (yearEnd && periodEnd > yearEnd) periodEnd = yearEnd;
        const reached = now.date >= periodEnd;
        const records = reached ? await db.query(`SELECT "personId", "status" FROM ${T.record} WHERE "personType" = 'STUDENT' AND "date" BETWEEN $1::date AND $2::date LIMIT 500000`, [periodStart, periodEnd]) : [];
        milestones[months] = { periodStart, periodEnd, reached, students: reached ? perfectAttendance(studentRows, records) : [] };
      }
      return { studyYear: year ? year.label || String(year.year) : null, milestones };
    },
  });
}

// At least one present record, and no absent, late or permission record, in the period.
function perfectAttendance(studentRows, records) {
  const totals = new Map();
  for (const record of records) {
    const row = totals.get(record.personId) || { present: 0, other: 0 };
    if (record.status === 'PRESENT') row.present += 1; else row.other += 1;
    totals.set(record.personId, row);
  }
  return studentRows.filter((s) => { const t = totals.get(s.id); return t && t.present > 0 && t.other === 0; })
    .map((s) => ({ studentId: s.id, studentNumber: s.studentNumber || '', name: s.name || s.nameKh || '', nameKh: s.nameKh || '', className: s.className || '', photo: s.photo || '', presentDays: totals.get(s.id).present }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { registerDashboard, dayStatus };
