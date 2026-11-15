'use strict';

// My Profile (core convention: GET me/profile): what Academic Management holds about the signed-in staff
// member — their staff record, the classes they teach and their own attendance this month — as widgets
// the core shows on the person's My Profile page. Only the caller's own data is ever read.
const T = {
  officer: 'plugin_wattanam_academic_management_officer_profile',
  department: 'plugin_wattanam_academic_management_department',
  klass: 'plugin_wattanam_academic_management_class',
  enrollment: 'plugin_wattanam_academic_management_enrollment_interval',
  studyYear: 'plugin_wattanam_academic_management_study_year',
  record: 'plugin_wattanam_academic_management_attendance_record',
};
const SELF = 'wattanam.academic-management.profile.self';
const BASE = '/plugins/wattanam.academic-management';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Each day counts once by its best status (present, then late, permission, absent), as the dashboard does.
function dayCounts(records) {
  const byDay = new Map();
  for (const r of records) {
    const day = String(r.date).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, new Set());
    byDay.get(day).add(r.status);
  }
  const counts = { present: 0, late: 0, permission: 0, absent: 0 };
  for (const statuses of byDay.values()) {
    if (statuses.has('PRESENT')) counts.present += 1;
    else if (statuses.has('LATE')) counts.late += 1;
    else if (statuses.has('PERMISSION')) counts.permission += 1;
    else counts.absent += 1;
  }
  return counts;
}

function registerMyProfile(context) {
  const db = context.database;
  context.permissions.register([{ id: SELF, label: 'See my own staff profile', description: 'My Profile: my staff record, my classes and my attendance.', roles: ['TEACHER', 'CLASS_ADMIN', 'WATTAMAN', 'RECEPTIONIST'] }]);

  context.routes.register({
    method: 'GET', path: 'me/profile', permission: SELF,
    handler: async (request) => {
      const principal = request?.principal || {};
      const userId = String(principal.userId || '');
      if (!userId) throw new Error('Authenticated principal is required');
      const timeZone = await context.settings.get('school-timezone', 'Asia/Phnom_Penh');
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
      const monthStart = `${parts.year}-${parts.month}-01`, today = `${parts.year}-${parts.month}-${parts.day}`;
      const officers = await db.query(
        `SELECT o."id", o."employeeNumber", o."position", o."employmentStatus", to_char(o."startedAt", 'YYYY-MM-DD') AS "startedAt", d."name" AS "department", d."nameKh" AS "departmentKh"
           FROM ${T.officer} o LEFT JOIN ${T.department} d ON d."id"::text = o."departmentId"::text WHERE o."userId"::text = $1 LIMIT 1`, [userId]);
      const officer = officers[0] || null;
      const [classes, records] = await Promise.all([
        db.query(
          `SELECT c."id", c."name", COALESCE(y."label", y."year"::text) AS "studyYear",
                  (SELECT COUNT(*)::int FROM ${T.enrollment} e WHERE e."classId" = c."id" AND e."validTo" IS NULL) AS "students",
                  CASE WHEN c."teacherId" = $1 THEN 'Teacher' ELSE 'Class admin' END AS "as"
             FROM ${T.klass} c LEFT JOIN ${T.studyYear} y ON y."id" = c."studyYearId"
            WHERE c."teacherId" = $1 OR c."classAdminId" = $1 ORDER BY c."name"`, [userId]),
        db.query(
          `SELECT "date"::text AS "date", "status" FROM ${T.record}
            WHERE "personType" = 'STAFF' AND "personId" = ANY($1::text[]) AND "date" BETWEEN $2::date AND $3::date`,
          [[userId, officer ? String(officer.id) : userId], monthStart, today]),
      ]);
      const counts = dayCounts(records);
      const students = classes.reduce((n, c) => n + Number(c.students || 0), 0);
      const widgets = [{
        id: 'staff-record', title: 'Staff record', priority: 10,
        description: officer ? 'Kept by the school office; ask them to correct anything wrong.' : 'You have no staff record yet — ask the school office to add you.',
        stats: officer ? [
          { id: 'number', label: 'Staff ID', value: officer.employeeNumber || '—', tone: 'info' },
          { id: 'position', label: 'Position', value: officer.position || '—', tone: 'neutral' },
          { id: 'department', label: 'Department', value: officer.departmentKh || officer.department || '—', tone: 'neutral' },
          { id: 'started', label: 'Started', value: officer.startedAt || '—', tone: 'neutral' },
          { id: 'status', label: 'Status', value: officer.employmentStatus === 'ACTIVE' ? 'Active' : String(officer.employmentStatus || '—').toLowerCase(), tone: officer.employmentStatus === 'ACTIVE' ? 'good' : 'warn' },
        ] : [{ id: 'number', label: 'Staff ID', value: '—', tone: 'warn' }],
      }];
      if (classes.length || principal.role === 'TEACHER' || principal.role === 'CLASS_ADMIN') {
        widgets.push({
          id: 'my-classes', title: 'My classes', priority: 20,
          description: classes.length ? `${classes.length} class${classes.length === 1 ? '' : 'es'} · ${students} students` : 'No class is assigned to you yet.',
          stats: [{ id: 'classes', label: 'Classes', value: classes.length, tone: 'info' }, { id: 'students', label: 'Students', value: students, tone: 'info' }],
          itemsTitle: 'Take attendance',
          items: classes.slice(0, 8).map((c) => ({ label: c.name, value: `${Number(c.students || 0)} students`, hint: [c.as, c.studyYear].filter(Boolean).join(' · '), tone: 'info', href: `${BASE}/attendance?classId=${encodeURIComponent(c.id)}` })),
        });
      }
      widgets.push({
        id: 'my-attendance', title: 'My attendance this month', priority: 30,
        description: `${MONTHS[Number(parts.month) - 1]} ${parts.year}, days with a record`,
        stats: [
          { id: 'present', label: 'Present', value: counts.present, hint: 'days', tone: 'good' },
          { id: 'late', label: 'Late', value: counts.late, hint: 'days', tone: counts.late ? 'warn' : 'neutral' },
          { id: 'permission', label: 'Permission', value: counts.permission, hint: 'days', tone: 'info' },
          { id: 'absent', label: 'Absent', value: counts.absent, hint: 'days', tone: counts.absent ? 'bad' : 'neutral' },
        ],
      });
      return widgets;
    },
  });
}

module.exports = { registerMyProfile, dayCounts };
