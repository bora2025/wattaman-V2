'use strict';

const crypto = require('crypto');
const attendanceRuntime = require('./attendance-runtime');
const { registerSelfAttendance } = require('./self-attendance');
const { registerStaffAttendance } = require('./staff-attendance');
const { registerAuthoritativeReports } = require('./authoritative-reports');

const DEPARTMENT = 'plugin_wattanam_academic_management_department';
const USER_DEPARTMENT = 'plugin_wattanam_academic_management_user_department';
const CLASS = 'plugin_wattanam_academic_management_class';
const REGISTRATION = 'plugin_wattanam_academic_management_class_registration';
const SETTINGS = 'plugin_wattanam_academic_management_class_registration_settings';
const FIELD = 'plugin_wattanam_academic_management_class_registration_field';
const STUDENT_PROFILE = 'plugin_wattanam_academic_management_student_profile';
const ENROLLMENT = 'plugin_wattanam_academic_management_enrollment_interval';
const SUBJECT = 'plugin_wattanam_academic_management_subject';
const STUDY_YEAR = 'plugin_wattanam_academic_management_study_year';
const OFFICER = 'plugin_wattanam_academic_management_officer_profile';
const OFFICER_ATTENDANCE = 'plugin_wattanam_academic_management_officer_attendance';
const ATTENDANCE_IDENTIFIER = 'plugin_wattanam_academic_management_attendance_identifier';

function newCardCode(scope) {
  return `wtn_${scope}_${crypto.randomBytes(24).toString('hex')}`;
}

function eventKey(prefix, payload) {
  return `${prefix}-${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

const MIN_PASSWORD_LENGTH = 6;
const FIELD_MODES = ['REQUIRED', 'OPTIONAL', 'HIDDEN'];
const CUSTOM_FIELD_TYPES = ['TEXT', 'SELECT', 'MULTI_SELECT'];
const CUSTOM_FIELD_TYPES_WITH_OPTIONS = ['SELECT', 'MULTI_SELECT'];
const ROSTER_CONTRACT = Object.freeze({ id: 'wattanam.academic-management.roster', version: '1.0.0' });
const OFFICER_EMPLOYMENT_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'EXCUSED'];

function requireDate(value, label = 'date') {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${label} must be a valid ISO date (YYYY-MM-DD)`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${label} must be a valid ISO date (YYYY-MM-DD)`);
  }
  return date;
}

function attendanceSql(sql) {
  return String(sql)
    .replaceAll('plugin_wattanam_attendance_manager_study_year', STUDY_YEAR)
    .replaceAll('plugin_wattanam_attendance_manager_', 'plugin_wattanam_academic_management_attendance_');
}

function attendancePermission(value) {
  if (!value) return value;
  return String(value).replace('wattanam.attendance-manager.', 'wattanam.academic-management.attendance.');
}

function attendanceContext(context) {
  const database = {
    query: (sql, params) => context.database.query(attendanceSql(sql), params),
    execute: (sql, params) => context.database.execute(attendanceSql(sql), params),
    transaction: (work) => context.database.transaction((tx) => work({
      query: (sql, params) => tx.query(attendanceSql(sql), params),
      execute: (sql, params) => tx.execute(attendanceSql(sql), params),
      publish: (event) => tx.publish({ ...event, event: attendancePermission(event.event) }),
    })),
  };
  const getClassRoster = async (classId, asOfIsoDate) => {
    const date = requireIsoDate(asOfIsoDate);
    const classes = await context.database.query(
      `SELECT "id", "name" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`,
      [String(classId || '')],
    );
    if (!classes.length) throw new Error('Class not found');
    const intervals = await context.database.query(
      `SELECT "studentId" FROM ${ENROLLMENT} WHERE "classId" = $1 AND "validFrom" <= $2::date AND ("validTo" IS NULL OR "validTo" >= $2::date) ORDER BY "studentId" ASC`,
      [String(classId || ''), date],
    );
    const studentIds = intervals.map((row) => row.studentId);
    if (new Set(studentIds).size !== studentIds.length) throw new Error('Overlapping Academic Management enrollment intervals detected');
    const profiles = studentIds.length ? await context.database.query(
      `SELECT "id", "userId", "studentNumber", "guardianUserId" FROM ${STUDENT_PROFILE} WHERE "id" = ANY($1::text[]) ORDER BY "id" ASC`,
      [studentIds],
    ) : [];
    if (profiles.length !== studentIds.length) throw new Error('Academic enrollment interval references a missing student profile');
    const users = profiles.length && typeof context.directory.lookupUsers === 'function'
      ? await context.directory.lookupUsers(profiles.map((profile) => profile.userId))
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    return {
      contract: ROSTER_CONTRACT,
      classId: String(classId || ''),
      className: classes[0].name || null,
      asOfIsoDate: date,
      source: 'plugin-enrollment-interval',
      students: studentIds.map((studentId) => profilesById.get(studentId)).map((profile) => ({
        studentId: profile.id,
        userId: profile.userId,
        studentNumber: profile.studentNumber || null,
        name: usersById.get(profile.userId)?.name || '',
        parentId: profile.guardianUserId || null,
      })),
    };
  };
  return {
    ...context,
    database,
    directory: {
      ...context.directory,
      // Attendance belongs to this plugin and must not fall back to the lean core's
      // optional legacy academic Prisma models when resolving its own class roster.
      getClassRoster,
      resolveAttendanceIdentifier: async (code) => {
        const rows = await context.database.query(
          `SELECT "id" AS "personId", 'STUDENT' AS "personType" FROM ${STUDENT_PROFILE} WHERE "qrCode" = $1 LIMIT 1`,
          [String(code || '')],
        );
        return rows[0] || null;
      },
      getClassAttendanceSchedule: async (classId) => {
        const rows = await context.database.query(`SELECT "schedule" FROM ${CLASS} WHERE "id"=$1 LIMIT 1`, [String(classId || '')]);
        if (!rows.length) throw new Error('Class not found');
        try {
          const parsed = typeof rows[0].schedule === 'string' ? JSON.parse(rows[0].schedule || '{}') : rows[0].schedule || {};
          const week = Array.isArray(parsed.week) && parsed.week.length ? parsed.week.map((day) => String(day).toUpperCase()) : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
          return { attendanceFormat: String(parsed.attendanceFormat || 'GLOBAL').toUpperCase(), week };
        } catch { return { attendanceFormat: 'GLOBAL', week: ['MON', 'TUE', 'WED', 'THU', 'FRI'] }; }
      },
    },
    permissions: { register: (items) => context.permissions.register(items.map((item) => ({ ...item, id: attendancePermission(item.id) }))) },
    navigation: { register: (items) => context.navigation.register(items
      .filter((item) => !['study-years', 'scanner'].includes(item.id))
      .map((item) => ({
        ...item,
        id: item.id === 'attendance' ? 'attendance-records' : `attendance-${item.id}`,
        label: item.id === 'reports' ? 'Student Attendance Reports' : item.label,
        href: item.href.replace('/wattanam.attendance-manager/', '/wattanam.academic-management/'),
        permission: attendancePermission(item.permission),
        dashboard: item.dashboard ? { ...item.dashboard, title: 'Academic Attendance' } : undefined,
      }))) },
    routes: { register: (route) => {
      if (route.path === 'study-years' || route.path.startsWith('study-years/')) return () => {};
      return context.routes.register({ ...route, permission: attendancePermission(route.permission) });
    } },
    events: {
      ...context.events,
      publish: (event, payload) => context.events.publish(attendancePermission(event), payload),
    },
  };
}

function requireIsoDate(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('asOfIsoDate must be a valid ISO date (YYYY-MM-DD)');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('asOfIsoDate must be a valid ISO date (YYYY-MM-DD)');
  }
  return date;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('855') && digits.length >= 9) return `+${digits}`;
  if (digits.startsWith('0')) return `+855${digits.slice(1)}`;
  return `+${digits}`;
}

const CLASS_DAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
function normalizeClassSchedule(value) {
  if (value === undefined || value === null || value === '') return null;
  let parsed;
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value; } catch { throw new Error('schedule must be valid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('schedule must be an object');
  const week = [...new Set((Array.isArray(parsed.week) ? parsed.week : []).map((day) => String(day).toUpperCase()))];
  if (!week.length) throw new Error('schedule must contain at least one study day');
  if (week.some((day) => !CLASS_DAY_CODES.includes(day))) throw new Error('schedule contains an invalid study day');
  const attendanceFormat = String(parsed.attendanceFormat || 'GLOBAL').toUpperCase();
  if (!['GLOBAL', 'FULL', 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'CUSTOM'].includes(attendanceFormat)) throw new Error('schedule contains an invalid attendance format');
  return JSON.stringify({ ...parsed, attendanceFormat, week: CLASS_DAY_CODES.filter((day) => week.includes(day)) });
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted && char === '"' && line[index + 1] === '"') { current += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { values.push(current); current = ''; continue; }
    current += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted value');
  values.push(current);
  return values;
}

function normalizedCsvSex(value) {
  const sex = String(value || '').trim().toUpperCase();
  if (value === 'ប្រុស' || sex === 'MALE' || sex === 'M') return 'MALE';
  if (value === 'ស្រី' || sex === 'FEMALE' || sex === 'F') return 'FEMALE';
  return null;
}

function generatePassword(length = 8) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[crypto.randomInt(chars.length)];
  }
  return out;
}

function slugify(label) {
  return (label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field');
}

function assertMode(value, key) {
  if (!FIELD_MODES.includes(value)) {
    throw new Error(`${key} must be one of ${FIELD_MODES.join(', ')}`);
  }
}

function sanitizeFieldTypeAndOptions(fieldType, options) {
  const type = String(fieldType || 'TEXT').toUpperCase();
  if (!CUSTOM_FIELD_TYPES.includes(type)) {
    throw new Error(`fieldType must be one of ${CUSTOM_FIELD_TYPES.join(', ')}`);
  }
  if (!CUSTOM_FIELD_TYPES_WITH_OPTIONS.includes(type)) return { fieldType: type, options: null };
  const cleaned = Array.from(new Set((Array.isArray(options) ? options : []).map((o) => String(o).trim()).filter(Boolean)));
  if (cleaned.length < 2) throw new Error('This field needs at least 2 options');
  return { fieldType: type, options: cleaned };
}

module.exports = {
  id: 'wattanam.academic-management',
  health() { return { status: 'ready' }; },
  async activate(context) {
    context.logger.log('Wattanam Academic Management activated');
    const lookupUserMap = async (ids) => new Map(
      (await context.directory.lookupUsers(Array.from(new Set(ids.filter(Boolean))))).map((user) => [user.id, user]),
    );
    const loadStudyYearMap = async () => new Map(
      (await context.database.query(`SELECT * FROM ${STUDY_YEAR} ORDER BY "year" DESC`))
        .map((entry) => [entry.id, entry]),
    );
    const decorateClassRows = async (rows) => {
      const [users, studyYears] = await Promise.all([
        lookupUserMap(rows.flatMap((row) => [row.teacherId, row.classAdminId])),
        loadStudyYearMap(),
      ]);
      return rows.map((row) => ({
        ...row,
        teacher: row.teacherId ? users.get(row.teacherId) || null : null,
        classAdmin: row.classAdminId ? users.get(row.classAdminId) || null : null,
        studyYear: row.studyYearId ? studyYears.get(row.studyYearId) || null : null,
      }));
    };
    const decorateStudentRows = async (rows) => {
      const users = await lookupUserMap(rows.map((row) => row.userId));
      return rows.map((row) => {
        const user = users.get(row.userId) || null;
        return { ...row, user, name: user?.name || null, email: user?.email || null, phone: user?.phone || null };
      });
    };
    const requireRole = async (userId, role, message) => {
      const user = (await context.directory.lookupUsers([userId]))[0];
      if (!user || user.role !== role) throw new Error(message);
      return user;
    };
    const requireStudyYear = async (studyYearId) => {
      if (!studyYearId) return;
      if (!(await loadStudyYearMap()).has(studyYearId)) throw new Error('studyYearId must reference an Academic Management Study Year');
    };
    const requireClassStaffScope = async (request, classId) => {
      const principal = request?.principal || {};
      const userId = principal.userId;
      if (!userId) throw new Error('Authenticated principal is required');
      const role = principal.role || (await context.directory.lookupUsers([userId]))[0]?.role;
      if (['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'].includes(role)) return;
      const rows = await context.database.query(`SELECT "teacherId", "classAdminId" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`, [classId]);
      if (!rows.length) throw new Error('Class not found');
      if ((role === 'TEACHER' && rows[0].teacherId === userId) || (role === 'CLASS_ADMIN' && rows[0].classAdminId === userId)) return;
      throw new Error('You are not assigned to this class');
    };
    const requireAdministrativePrincipal = async (request) => {
      const principal = request?.principal || {};
      if (!principal.userId) throw new Error('Authenticated principal is required');
      const role = principal.role || (await context.directory.lookupUsers([principal.userId]))[0]?.role;
      if (!['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'].includes(role)) throw new Error('Administrator access is required');
    };
    const requireEnrollmentScope = async (request, profile, classId) => {
      const principal = request?.principal || {};
      if (!principal.userId) throw new Error('Authenticated principal is required');
      const role = principal.role || (await context.directory.lookupUsers([principal.userId]))[0]?.role;
      if (['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'].includes(role)) return;
      if (role === 'STUDENT' && profile?.userId === principal.userId) return;
      if (role === 'PARENT' && profile?.guardianUserId === principal.userId) return;
      if (classId && ['TEACHER', 'CLASS_ADMIN'].includes(role)) {
        await requireClassStaffScope({ principal: { ...principal, role } }, classId);
        return;
      }
      throw new Error('You are not authorized to view this enrollment');
    };
    const applyClassListScope = async (request, conditions, params) => {
      const principal = request?.principal || {};
      if (!principal.userId) throw new Error('Authenticated principal is required');
      const role = principal.role || (await context.directory.lookupUsers([principal.userId]))[0]?.role;
      if (['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'].includes(role)) return;
      if (role === 'TEACHER') { params.push(principal.userId); conditions.push(`c."teacherId" = $${params.length}`); return; }
      if (role === 'CLASS_ADMIN') { params.push(principal.userId); conditions.push(`c."classAdminId" = $${params.length}`); return; }
      throw new Error('You are not assigned to an academic class staff role');
    };
    context.permissions.register([
      { id: 'wattanam.academic-management.view', label: 'View academic structures and rosters' },
      { id: 'wattanam.academic-management.manage', label: 'Manage academic structures and enrollment' },
      { id: 'wattanam.academic-management.attendance', label: 'Record and correct officer attendance' },
    ]);
    context.navigation.register([
      { id: 'study-years', label: 'Academic Years', href: '/plugins/wattanam.academic-management/study-years', permission: 'wattanam.academic-management.view' },
      { id: 'classes', label: 'Classes', href: '/plugins/wattanam.academic-management/classes', permission: 'wattanam.academic-management.view', dashboard: { title: 'Academic Management', description: 'Manage classes, enrollment, and student academic profiles.', priority: 50 } },
      { id: 'student-id-cards', label: 'Student ID Cards', href: '/plugins/wattanam.academic-management/student-id-cards', permission: 'wattanam.academic-management.manage' },
      { id: 'officers', label: 'Manage Officers', href: '/plugins/wattanam.academic-management/officers', permission: 'wattanam.academic-management.view' },
      { id: 'staff-id-cards', label: 'Staff ID Cards', href: '/plugins/wattanam.academic-management/staff-id-cards', permission: 'wattanam.academic-management.manage' },
    ]);
    const studyYearSelect = `SELECT y."id", y."year", y."label", y."startDate", y."endDate", y."isCurrent", y."schoolName", y."logoUrl", y."createdAt", y."updatedAt", jsonb_build_object('classes', COUNT(c."id")::int) AS "_count" FROM ${STUDY_YEAR} y LEFT JOIN ${CLASS} c ON c."studyYearId" = y."id"`;
    context.routes.register({
      method: 'GET', path: 'study-years', permission: 'wattanam.academic-management.view',
      handler: () => context.database.query(`${studyYearSelect} GROUP BY y."id" ORDER BY y."year" DESC`),
    });
    context.routes.register({
      method: 'GET', path: 'study-years/:id', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const rows = await context.database.query(`${studyYearSelect} WHERE y."id" = $1 GROUP BY y."id" LIMIT 1`, [request?.params?.id]);
        if (!rows.length) throw new Error('Study year not found');
        return rows[0];
      },
    });
    context.routes.register({
      method: 'POST', path: 'study-years', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const body = request?.body || {};
        const year = Number(body.year);
        if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('year must be between 2020 and 2100');
        if (body.startDate && body.endDate && String(body.startDate) > String(body.endDate)) throw new Error('endDate must be on or after startDate');
        const id = crypto.randomUUID();
        await context.database.execute(`INSERT INTO ${STUDY_YEAR} ("id", "year", "label", "startDate", "endDate", "schoolName", "logoUrl") VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, year, String(body.label || '').trim() || `${year}-${year + 1}`, body.startDate || null, body.endDate || null, body.schoolName || null, body.logoUrl || null]);
        return context.database.query(`${studyYearSelect} WHERE y."id" = $1 GROUP BY y."id" LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'PUT', path: 'study-years/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        const body = request?.body || {};
        const year = Number(body.year);
        if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('year must be between 2020 and 2100');
        if (body.startDate && body.endDate && String(body.startDate) > String(body.endDate)) throw new Error('endDate must be on or after startDate');
        const changed = await context.database.execute(`UPDATE ${STUDY_YEAR} SET "year"=$1,"label"=$2,"startDate"=$3,"endDate"=$4,"schoolName"=$5,"logoUrl"=$6,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$7`, [year, String(body.label || '').trim() || `${year}-${year + 1}`, body.startDate || null, body.endDate || null, body.schoolName || null, body.logoUrl || null, id]);
        if (!changed.count) throw new Error('Study year not found');
        return context.database.query(`${studyYearSelect} WHERE y."id" = $1 GROUP BY y."id" LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'POST', path: 'study-years/:id/set-current', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        return context.database.transaction(async (tx) => {
          const exists = await tx.query(`SELECT "id" FROM ${STUDY_YEAR} WHERE "id"=$1 LIMIT 1`, [id]);
          if (!exists.length) throw new Error('Study year not found');
          await tx.execute(`UPDATE ${STUDY_YEAR} SET "isCurrent"=FALSE,"updatedAt"=CURRENT_TIMESTAMP WHERE "isCurrent"=TRUE`, []);
          await tx.execute(`UPDATE ${STUDY_YEAR} SET "isCurrent"=TRUE,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [id]);
          return tx.query(`SELECT * FROM ${STUDY_YEAR} WHERE "id"=$1 LIMIT 1`, [id]).then((rows) => rows[0]);
        });
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'study-years/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        const references = await context.database.query(`SELECT COUNT(*)::int AS "count" FROM ${CLASS} WHERE "studyYearId"=$1`, [id]);
        if (Number(references[0]?.count || 0) > 0) throw new Error('Cannot delete a study year that still has classes');
        const changed = await context.database.execute(`DELETE FROM ${STUDY_YEAR} WHERE "id"=$1`, [id]);
        if (!changed.count) throw new Error('Study year not found');
        return { success: true };
      },
    });
    context.routes.register({
      method: 'GET', path: 'departments', permission: 'wattanam.academic-management.view',
      handler: () => context.database.query(`SELECT "id", "name", "nameKh", "description", "createdAt", "updatedAt" FROM ${DEPARTMENT} ORDER BY "name" ASC`),
    });
    context.routes.register({
      method: 'GET', path: 'departments/:id', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const rows = await context.database.query(
          `SELECT "id", "name", "nameKh", "description", "createdAt", "updatedAt" FROM ${DEPARTMENT} WHERE "id" = $1 LIMIT 1`,
          [request?.params?.id],
        );
        if (!rows.length) throw new Error('Department not found');
        return rows[0];
      },
    });
    context.routes.register({
      method: 'POST', path: 'departments', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const body = request?.body || {};
        const name = String(body.name || '').trim();
        if (!name || name.length > 120) throw new Error('name must contain 1-120 characters');
        const id = crypto.randomUUID();
        return context.database.transaction(async (tx) => {
          await tx.execute(
            `INSERT INTO ${DEPARTMENT} ("id", "name", "nameKh", "description", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [id, name, body.nameKh ? String(body.nameKh).trim() : null, body.description ? String(body.description).trim() : null],
          );
          const rows = await tx.query(`SELECT "id", "name", "nameKh", "description", "createdAt", "updatedAt" FROM ${DEPARTMENT} WHERE "id" = $1`, [id]);
          tx.publish({ event: 'wattanam.academic-management.department.created', version: 1, subjectKey: id, payload: { department: rows[0] }, idempotencyKey: `academic-department-created-${id}` });
          return rows[0];
        });
      },
    });
    context.routes.register({
      method: 'PUT', path: 'departments/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = String(request?.params?.id || '');
        const body = request?.body || {};
        const name = String(body.name || '').trim();
        if (!name || name.length > 120) throw new Error('name must contain 1-120 characters');
        return context.database.transaction(async (tx) => {
          const changed = await tx.execute(
            `UPDATE ${DEPARTMENT} SET "name" = $2, "nameKh" = $3, "description" = $4, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
            [id, name, body.nameKh ? String(body.nameKh).trim() : null, body.description ? String(body.description).trim() : null],
          );
          if (!changed?.count) throw new Error('Department not found');
          const rows = await tx.query(`SELECT "id", "name", "nameKh", "description", "createdAt", "updatedAt" FROM ${DEPARTMENT} WHERE "id" = $1`, [id]);
          tx.publish({ event: 'wattanam.academic-management.department.updated', version: 1, subjectKey: id, payload: { department: rows[0] }, idempotencyKey: eventKey('academic-department-updated', rows[0]) });
          return rows[0];
        });
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'departments/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = String(request?.params?.id || '');
        const expectedKey = `delete-department:${id}`;
        if (request?.body?.idempotencyKey !== expectedKey) throw new Error('Academic department delete command has an invalid idempotency key');
        return context.database.transaction(async (tx) => {
          const rows = await tx.query(`SELECT "id", "name", "nameKh", "description", "createdAt", "updatedAt" FROM ${DEPARTMENT} WHERE "id" = $1 FOR UPDATE`, [id]);
          if (!rows.length) throw new Error('Department not found');
          await tx.execute(`DELETE FROM ${USER_DEPARTMENT} WHERE "departmentId" = $1`, [id]);
          await tx.execute(`DELETE FROM ${DEPARTMENT} WHERE "id" = $1`, [id]);
          tx.publish({ event: 'wattanam.academic-management.department.deleted', version: 1, subjectKey: id, payload: { departmentId: id }, idempotencyKey: expectedKey });
          return rows[0];
        });
      },
    });
    context.routes.register({
      method: 'GET', path: 'subjects', permission: 'wattanam.academic-management.view',
      handler: (request) => {
        const includeInactive = String(request?.query?.includeInactive || '').toLowerCase() === 'true';
        return context.database.query(
          `SELECT "id", "code", "name", "nameKh", "description", "active", "createdAt", "updatedAt" FROM ${SUBJECT}${includeInactive ? '' : ' WHERE "active" = TRUE'} ORDER BY "name" ASC`,
        );
      },
    });
    context.routes.register({
      method: 'GET', path: 'subjects/:id', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const rows = await context.database.query(
          `SELECT "id", "code", "name", "nameKh", "description", "active", "createdAt", "updatedAt" FROM ${SUBJECT} WHERE "id" = $1 LIMIT 1`,
          [request?.params?.id],
        );
        if (!rows.length) throw new Error('Subject not found');
        return rows[0];
      },
    });
    context.routes.register({
      method: 'POST', path: 'subjects', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const body = request?.body || {};
        const code = String(body.code || '').trim().toUpperCase();
        const name = String(body.name || '').trim();
        if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(code)) throw new Error('code must contain 1-32 uppercase letters, numbers, dot, underscore, or hyphen');
        if (!name || name.length > 120) throw new Error('name must contain 1-120 characters');
        const id = crypto.randomUUID();
        return context.database.transaction(async (tx) => {
          await tx.execute(
            `INSERT INTO ${SUBJECT} ("id", "code", "name", "nameKh", "description", "active", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [id, code, name, body.nameKh ? String(body.nameKh).trim() : null, body.description ? String(body.description).trim() : null],
          );
          const created = await tx.query(`SELECT "id", "code", "name", "nameKh", "description", "active", "createdAt", "updatedAt" FROM ${SUBJECT} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
          tx.publish({ event: 'wattanam.academic-management.subject.created', version: 1, subjectKey: id, payload: { subject: created }, idempotencyKey: `academic-subject-created-${id}` });
          return created;
        });
      },
    });
    context.routes.register({
      method: 'PUT', path: 'subjects/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        const body = request?.body || {};
        const sets = [];
        const params = [];
        const add = (column, value) => { params.push(value); sets.push(`"${column}" = $${params.length}`); };
        if (body.code !== undefined) {
          const code = String(body.code).trim().toUpperCase();
          if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(code)) throw new Error('code must contain 1-32 uppercase letters, numbers, dot, underscore, or hyphen');
          add('code', code);
        }
        if (body.name !== undefined) {
          const name = String(body.name).trim();
          if (!name || name.length > 120) throw new Error('name must contain 1-120 characters');
          add('name', name);
        }
        if (body.nameKh !== undefined) add('nameKh', body.nameKh ? String(body.nameKh).trim() : null);
        if (body.description !== undefined) add('description', body.description ? String(body.description).trim() : null);
        if (body.active !== undefined) add('active', Boolean(body.active));
        if (!sets.length) throw new Error('No valid subject updates provided');
        sets.push('"updatedAt" = CURRENT_TIMESTAMP');
        params.push(id);
        return context.database.transaction(async (tx) => {
          const changed = await tx.execute(`UPDATE ${SUBJECT} SET ${sets.join(', ')} WHERE "id" = $${params.length}`, params);
          if (!changed?.count) throw new Error('Subject not found');
          const updated = await tx.query(`SELECT "id", "code", "name", "nameKh", "description", "active", "createdAt", "updatedAt" FROM ${SUBJECT} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
          tx.publish({ event: 'wattanam.academic-management.subject.updated', version: 1, subjectKey: id, payload: { subject: updated }, idempotencyKey: eventKey('academic-subject-updated', updated) });
          return updated;
        });
      },
    });
    context.routes.register({
      method: 'GET', path: 'contracts/subjects', permission: 'wattanam.academic-management.view',
      handler: async () => ({
        schemaVersion: 1,
        subjects: await context.database.query(`SELECT "id", "code", "name", "nameKh" FROM ${SUBJECT} WHERE "active" = TRUE ORDER BY "name" ASC`),
      }),
    });
    context.routes.register({
      method: 'GET', path: 'teachers', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const query = request?.query || {};
        const departmentId = Array.isArray(query.departmentId) ? query.departmentId[0] : query.departmentId;
        const recipients = await context.directory.resolveAudience({ audience: 'ROLE', targetRole: 'TEACHER' });
        const identities = await lookupUserMap(recipients.map((recipient) => recipient.id));
        const params = [];
        const where = typeof departmentId === 'string' && departmentId ? 'WHERE ud."departmentId" = $1' : '';
        if (where) params.push(departmentId);
        const memberships = await context.database.query(
          `SELECT ud."userId", d."id" AS "departmentId", d."name" AS "departmentName" FROM ${USER_DEPARTMENT} ud JOIN ${DEPARTMENT} d ON d."id" = ud."departmentId" ${where}`,
          params,
        );
        const departmentByUser = new Map(memberships.map((row) => [row.userId, { id: row.departmentId, name: row.departmentName }]));
        return recipients
          .filter((recipient) => !where || departmentByUser.has(recipient.id))
          .map((recipient) => ({ ...recipient, ...identities.get(recipient.id), department: departmentByUser.get(recipient.id) || null }))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      },
    });
    context.routes.register({
      method: 'GET', path: 'class-admins', permission: 'wattanam.academic-management.view',
      handler: async () => {
        const recipients = await context.directory.resolveAudience({ audience: 'ROLE', targetRole: 'CLASS_ADMIN' });
        const identities = await lookupUserMap(recipients.map((recipient) => recipient.id));
        return recipients
          .map((recipient) => ({ ...recipient, ...identities.get(recipient.id) }))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      },
    });
    // Migration 004 remains immutable because it was already published. Attendance Manager is
    // the sole runtime owner for Study Years; Academic Management consumes its versioned read model.
    context.routes.register({
      method: 'POST', path: 'classes', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const body = request?.body || {};
        if (!body.name || typeof body.name !== 'string') throw new Error('name is required');
        if (!body.teacherId) throw new Error('teacherId is required');
        if (!['AVAILABLE', 'UNAVAILABLE', 'HIDDEN'].includes(body.registrationStatus)) throw new Error('registrationStatus must be one of AVAILABLE, UNAVAILABLE, HIDDEN');
        if (body.price !== undefined && body.price !== null && (typeof body.price !== 'number' || body.price < 0)) throw new Error('price must be a non-negative number');
        await requireRole(body.teacherId, 'TEACHER', 'Only users with TEACHER role can be assigned as teacher');
        if (body.classAdminId) {
          await requireRole(body.classAdminId, 'CLASS_ADMIN', 'Only users with CLASS_ADMIN role can be assigned as class admin');
        }
        await requireStudyYear(body.studyYearId);
        const id = crypto.randomUUID();
        const created = await context.database.transaction(async (tx) => {
          await tx.execute(
            `INSERT INTO ${CLASS} ("id", "name", "subject", "teacherId", "classAdminId", "studyYearId", "schedule", "registrationStatus", "thumbnail", "description", "price", "showPrice", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              id,
              body.name,
              body.subject || null,
              body.teacherId,
              body.classAdminId || null,
              body.studyYearId || null,
              normalizeClassSchedule(body.schedule),
              body.registrationStatus || 'HIDDEN',
              body.thumbnail || null,
              body.description || null,
              body.price ?? null,
              body.showPrice === true,
            ],
          );
          const row = await tx.query(
            `SELECT c."id", c."name", c."subject", c."teacherId", c."classAdminId", c."studyYearId", c."schedule", c."registrationStatus", c."thumbnail", c."description", c."price", c."showPrice", c."createdAt", c."updatedAt" FROM ${CLASS} c WHERE c."id" = $1`,
            [id],
          ).then((rows) => rows[0]);
          tx.publish({
            event: 'wattanam.academic-management.class.created',
            version: 1,
            subjectKey: row.id,
            payload: { class: row, principal: request?.principal },
            idempotencyKey: `class-created-${row.id}`,
          });
          return (await decorateClassRows([row]))[0];
        });
        context.events.publish('academic.class.created.v1', { class: created, principal: request?.principal });
        return created;
      },
    });
    context.routes.register({
      method: 'PUT', path: 'classes/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        const body = request?.body || {};
        if (body.registrationStatus !== undefined && !['AVAILABLE', 'UNAVAILABLE', 'HIDDEN'].includes(body.registrationStatus)) {
          throw new Error('registrationStatus must be one of AVAILABLE, UNAVAILABLE, HIDDEN');
        }
        if (body.price !== undefined && body.price !== null && (typeof body.price !== 'number' || body.price < 0)) throw new Error('price must be a non-negative number');
        if (body.teacherId) {
          await requireRole(body.teacherId, 'TEACHER', 'Only users with TEACHER role can be assigned as teacher');
        }
        if (body.classAdminId) {
          await requireRole(body.classAdminId, 'CLASS_ADMIN', 'Only users with CLASS_ADMIN role can be assigned as class admin');
        }
        if (body.studyYearId !== undefined && body.studyYearId !== '') await requireStudyYear(body.studyYearId);
        const sets = [];
        const params = [];
        const add = (col, val) => { if (val !== undefined) { sets.push(`"${col}" = $${params.length + 1}`); params.push(val); } };
        add('name', body.name);
        add('subject', body.subject);
        add('teacherId', body.teacherId);
        add('classAdminId', body.classAdminId === '' ? null : body.classAdminId);
        add('studyYearId', body.studyYearId === '' ? null : body.studyYearId);
        add('schedule', body.schedule === undefined ? undefined : normalizeClassSchedule(body.schedule));
        add('registrationStatus', body.registrationStatus);
        add('thumbnail', body.thumbnail);
        add('description', body.description);
        add('price', body.price ?? null);
        add('showPrice', body.showPrice === undefined ? undefined : body.showPrice === true);
        if (sets.length === 0) throw new Error('No valid class updates provided');
        sets.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        params.push(id);
        const updated = await context.database.transaction(async (tx) => {
          await tx.execute(
            `UPDATE ${CLASS} SET ${sets.join(', ')} WHERE "id" = $${params.length}`,
            params,
          );
          const row = await tx.query(
            `SELECT c."id", c."name", c."subject", c."teacherId", c."classAdminId", c."studyYearId", c."schedule", c."registrationStatus", c."thumbnail", c."description", c."price", c."showPrice", c."createdAt", c."updatedAt" FROM ${CLASS} c WHERE c."id" = $1`,
            [id],
          ).then((rows) => rows[0]);
          tx.publish({
            event: 'wattanam.academic-management.class.updated',
            version: 1,
            subjectKey: row.id,
            payload: { class: row, principal: request?.principal },
            idempotencyKey: eventKey('class-updated', row),
          });
          return (await decorateClassRows([row]))[0];
        });
        context.events.publish('academic.class.updated.v1', { class: updated, principal: request?.principal });
        return updated;
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'classes/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        await context.database.transaction(async (tx) => {
          await tx.execute(`DELETE FROM ${REGISTRATION} WHERE "classId" = $1`, [id]);
          await tx.execute(`DELETE FROM ${CLASS} WHERE "id" = $1`, [id]);
          tx.publish({
            event: 'wattanam.academic-management.class.deleted',
            version: 1,
            subjectKey: id,
            payload: { classId: id, principal: request?.principal },
            idempotencyKey: eventKey('class-deleted', { id }),
          });
        });
        context.events.publish('academic.class.deleted.v1', { classId: id, principal: request?.principal });
        return { success: true };
      },
    });
    context.routes.register({
      method: 'GET', path: 'classes/:id', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const id = request?.params?.id;
        await requireClassStaffScope(request, id);
        const rows = await context.database.query(
          `SELECT c."id", c."name", c."subject", c."teacherId", c."classAdminId", c."studyYearId", c."schedule", c."registrationStatus", c."thumbnail", c."description", c."price", c."showPrice", c."createdAt", c."updatedAt" FROM ${CLASS} c WHERE c."id" = $1 LIMIT 1`,
          [id],
        );
        if (!rows.length) throw new Error('Class not found');
        return (await decorateClassRows(rows))[0];
      },
    });
    context.routes.register({
      method: 'GET', path: 'classes', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const query = request?.query || {};
        const teacherId = Array.isArray(query.teacherId) ? query.teacherId[0] : query.teacherId;
        const classAdminId = Array.isArray(query.classAdminId) ? query.classAdminId[0] : query.classAdminId;
        const studyYearId = Array.isArray(query.studyYearId) ? query.studyYearId[0] : query.studyYearId;
        const params = [];
        const conditions = [];
        await applyClassListScope(request, conditions, params);
        if (typeof teacherId === 'string' && teacherId) {
          params.push(teacherId);
          conditions.push(`c."teacherId" = $${params.length}`);
        }
        if (typeof classAdminId === 'string' && classAdminId) {
          params.push(classAdminId);
          conditions.push(`c."classAdminId" = $${params.length}`);
        }
        if (typeof studyYearId === 'string' && studyYearId) {
          params.push(studyYearId);
          conditions.push(`c."studyYearId" = $${params.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const rows = await context.database.query(
          `SELECT c."id", c."name", c."subject", c."teacherId", c."classAdminId", c."studyYearId", c."schedule", c."registrationStatus", c."thumbnail", c."description", c."price", c."showPrice", c."createdAt", c."updatedAt", COALESCE((SELECT COUNT(*)::int FROM ${ENROLLMENT} e WHERE e."classId" = c."id" AND e."validTo" IS NULL), 0) AS "studentCount" FROM ${CLASS} c ${where} ORDER BY c."name" ASC`,
          params,
        );
        return decorateClassRows(rows);
      },
    });
    context.routes.register({
      method: 'GET', path: 'classes/:id/students', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const classId = request?.params?.id;
        await requireClassStaffScope(request, classId);
        const rows = await context.database.query(
          `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."qrCode", s."photo", s."sex", s."dateOfBirth", s."address", s."generation", s."customFieldValues", s."guardianUserId" AS "parentId" FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL WHERE e."classId" = $1 ORDER BY s."studentNumber" ASC`,
          [classId],
        );
        return decorateStudentRows(rows);
      },
    });
    context.routes.register({
      method: 'POST', path: 'classes/:id/students/bulk-csv', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const classId = request?.params?.id;
        const csv = String(request?.body?.csv || '').replace(/^\uFEFF/, '');
        if (!csv || Buffer.byteLength(csv, 'utf8') > 2 * 1024 * 1024) throw new Error('CSV must contain 1 byte to 2 MiB');
        const lines = csv.split(/\r?\n/).filter((line) => line.trim());
        if (lines.length < 2 || lines.length > 2001) throw new Error('CSV must contain a header and 1-2000 data rows');
        const classes = await context.database.query(`SELECT "id" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`, [classId]);
        if (!classes.length) throw new Error('Class not found');
        const header = parseCsvLine(lines[0]).map((value) => value.trim().toLowerCase());
        const find = (...names) => header.findIndex((value) => names.some((name) => value === name || (name.endsWith('*') && value.includes(name.slice(0, -1)))));
        const indexes = {
          id: find('id'), name: find('name'), sex: find('sex'), email: find('mail*'), phone: find('phone*', 'contact*'),
          photo: find('photo'), password: find('password'), dateOfBirth: find('birth*', 'dob', 'date of birth'),
          address: find('address'), generation: find('generation*'), nameKh: find('namekh', 'khmer name'),
        };
        if (indexes.name < 0) throw new Error('CSV must have a Name column');
        const results = [];
        const usedNumbers = new Set();
        for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
          const columns = parseCsvLine(lines[rowIndex]);
          const value = (index) => index >= 0 ? String(columns[index] || '').trim() : '';
          const studentNumber = value(indexes.id) || String(rowIndex).padStart(4, '0');
          const name = value(indexes.name);
          const email = value(indexes.email).toLowerCase();
          const phone = value(indexes.phone);
          const result = { row: rowIndex + 1, id: studentNumber, name, email: '', status: 'error' };
          try {
            if (!name) { result.status = 'skipped'; result.error = 'Missing name'; results.push(result); continue; }
            if (studentNumber.length > 100) throw new Error('Student ID exceeds 100 characters');
            if (usedNumbers.has(studentNumber)) throw new Error('Duplicate student ID in CSV');
            usedNumbers.add(studentNumber);
            if (email && !isValidEmail(email)) throw new Error('Invalid email address');
            const dateOfBirth = value(indexes.dateOfBirth);
            if (dateOfBirth) {
              const parsedBirthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
              if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(parsedBirthDate.getTime()) || parsedBirthDate.toISOString().slice(0, 10) !== dateOfBirth) {
                throw new Error('Date of birth must be a valid YYYY-MM-DD date');
              }
            }
            const existing = await context.database.query(
              `SELECT s."id", s."userId" FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL WHERE e."classId" = $1 AND s."studentNumber" = $2 LIMIT 1`,
              [classId, studentNumber],
            ).then((rows) => rows[0] || null);
            let account;
            if (existing) {
              const identityHash = crypto.createHash('sha256').update(JSON.stringify({ name, email, phone })).digest('hex').slice(0, 20);
              account = await context.accounts.updateStudent({
                commandKey: `csv-update:${classId}:${studentNumber}:${identityHash}`, userId: existing.userId,
                name, email: email || null, phone: phone || null,
              });
              await context.database.execute(
                `UPDATE ${STUDENT_PROFILE} SET "nameKh" = $2, "photo" = $3, "sex" = $4, "dateOfBirth" = $5, "address" = $6, "generation" = $7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
                [existing.id, value(indexes.nameKh) || null, value(indexes.photo) || null, normalizedCsvSex(value(indexes.sex)), dateOfBirth || null, value(indexes.address) || null, value(indexes.generation) || null],
              );
            } else {
              const password = value(indexes.password) || `student${studentNumber}`;
              if (password.length < 6 || password.length > 200) throw new Error('Password must contain 6-200 characters');
              const passwordHash = await context.crypto.hashBcrypt(password, 12);
              account = await context.accounts.createStudent({
                commandKey: `csv-create:${classId}:${studentNumber}`, name, email: email || null, phone: phone || null, passwordHash,
              });
              const profileId = crypto.randomUUID();
              const today = new Date().toISOString().slice(0, 10);
              await context.database.transaction(async (tx) => {
                await tx.execute(
                  `INSERT INTO ${STUDENT_PROFILE} ("id", "userId", "studentNumber", "nameKh", "qrCode", "photo", "sex", "dateOfBirth", "address", "generation", "source", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'plugin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("userId") DO NOTHING`,
                  [profileId, account.id, studentNumber, value(indexes.nameKh) || null, newCardCode('stu'), value(indexes.photo) || null, normalizedCsvSex(value(indexes.sex)), dateOfBirth || null, value(indexes.address) || null, value(indexes.generation) || null],
                );
                const profiles = await tx.query(`SELECT "id" FROM ${STUDENT_PROFILE} WHERE "userId" = $1 LIMIT 1`, [account.id]);
                if (!profiles.length) throw new Error('Student profile materialization failed');
                await tx.execute(
                  `INSERT INTO ${ENROLLMENT} ("id", "studentId", "classId", "validFrom", "source", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, 'plugin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("studentId", "classId", "validFrom") DO NOTHING`,
                  [crypto.randomUUID(), profiles[0].id, classId, today],
                );
                await tx.publish({
                  event: 'wattanam.academic-management.student.imported', version: 1, subjectKey: profiles[0].id,
                  payload: { studentId: profiles[0].id, userId: account.id, classId, studentNumber },
                  idempotencyKey: `academic-student-imported-${classId}-${studentNumber}`,
                });
              });
            }
            result.email = account.email || '';
            result.status = 'success';
          } catch (error) {
            result.error = error instanceof Error ? error.message : String(error);
          }
          results.push(result);
        }
        return {
          total: results.length,
          success: results.filter((row) => row.status === 'success').length,
          errors: results.filter((row) => row.status === 'error').length,
          skipped: results.filter((row) => row.status === 'skipped').length,
          details: results,
        };
      },
    });
    context.routes.register({
      method: 'GET', path: 'classes/parents', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const rows = await context.directory.resolveAudience({ audience: 'ROLE', targetRole: 'PARENT' });
        if (rows.length > 500) throw new Error('Parent directory exceeds the bounded response limit');
        return rows.map((row) => ({ id: row.id, name: row.name || '', email: row.email || null, phone: row.phone || null }))
          .sort((a, b) => a.name.localeCompare(b.name));
      },
    });
    context.routes.register({
      method: 'GET', path: 'classes/students/batch', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const raw = Array.isArray(request?.query?.ids) ? request.query.ids[0] : request?.query?.ids;
        const classIds = [...new Set(String(raw || '').split(',').map((id) => id.trim()).filter(Boolean))];
        if (classIds.length > 100) throw new Error('ids supports at most 100 classes');
        const result = Object.fromEntries(classIds.map((id) => [id, []]));
        if (!classIds.length) return result;
        for (const classId of classIds) await requireClassStaffScope(request, classId);
        const rows = await context.database.query(
          `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."qrCode", s."photo", s."sex", s."dateOfBirth", s."address", s."generation", s."customFieldValues", s."guardianUserId" AS "parentId", e."classId", c."name" AS "className" FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL JOIN ${CLASS} c ON c."id" = e."classId" WHERE e."classId" = ANY($1::text[]) ORDER BY e."classId" ASC, s."studentNumber" ASC`,
          [classIds],
        );
        for (const row of await decorateStudentRows(rows)) result[row.classId].push({ ...row, className: row.className || null });
        return result;
      },
    });
    context.routes.register({
      method: 'GET', path: 'classes/:id/available-students', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const classId = request?.params?.id;
        const exists = await context.database.query(`SELECT "id" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`, [classId]);
        if (!exists.length) throw new Error('Class not found');
        const rows = await context.database.query(
          `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."qrCode", s."photo", s."sex" FROM ${STUDENT_PROFILE} s LEFT JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL WHERE e."studentId" IS NULL ORDER BY s."studentNumber" ASC LIMIT 500`,
        );
        return decorateStudentRows(rows);
      },
    });
    context.routes.register({
      method: 'GET', path: 'classes/:id/students/:studentId', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        await requireClassStaffScope(request, request?.params?.id);
        const rows = await context.database.query(
          `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."qrCode", s."photo", s."sex", s."dateOfBirth", s."address", s."generation", s."customFieldValues", s."guardianUserId" AS "parentId", c."name" AS "className" FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL LEFT JOIN ${CLASS} c ON c."id" = e."classId" WHERE s."id" = $1 AND e."classId" = $2 LIMIT 1`,
          [request?.params?.studentId, request?.params?.id],
        );
        if (!rows.length) throw new Error('Student not found in this class');
        const row = (await decorateStudentRows(rows))[0];
        return {
          id: row.id, userId: row.userId, studentNumber: row.studentNumber || '', name: row.name,
          nameKh: row.nameKh || '', email: row.email, phone: row.phone || '', qrCode: row.qrCode,
          photo: row.photo || '', sex: row.sex || '', dateOfBirth: row.dateOfBirth,
          address: row.address || '', generation: row.generation || '',
          customFieldValues: row.customFieldValues || {}, parentId: row.parentId || '',
          className: row.className || null,
        };
      },
    });
    context.routes.register({
      method: 'GET', path: 'classes/:id/document-records', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const classId = request?.params?.id;
        await requireClassStaffScope(request, classId);
        const classRows = await context.database.query(`SELECT "id", "name", "subject", "studyYearId" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`, [classId]);
        if (!classRows.length) throw new Error('Class not found');
        const rows = await context.database.query(
          `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."qrCode", s."photo", s."sex", s."dateOfBirth", s."generation" FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL WHERE e."classId" = $1 ORDER BY s."studentNumber" ASC LIMIT 500`,
          [classId],
        );
        const decorated = await decorateStudentRows(rows);
        const classRecord = classRows[0];
        return {
          schemaVersion: 1,
          source: { pluginId: 'wattanam.academic-management', kind: 'class-roster', classId, principalId: request.principal.userId },
          records: decorated.map((student) => ({
            id: student.id, userId: student.userId, studentNumber: student.studentNumber || '',
            name: student.name || '', nameKh: student.nameKh || '', qrCode: student.qrCode || '',
            photo: student.photo || '', sex: student.sex || '', dateOfBirth: student.dateOfBirth || null,
            generation: student.generation || '', class: { id: classRecord.id, name: classRecord.name, subject: classRecord.subject || '', studyYearId: classRecord.studyYearId || null },
          })),
        };
      },
    });
    context.routes.register({
      method: 'GET', path: 'contracts/classes/:id/roster', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const classId = request?.params?.id;
        const asOfIsoDate = requireIsoDate(request?.query?.asOfIsoDate);
        await requireClassStaffScope(request, classId);
        const classRows = await context.database.query(`SELECT "id", "name" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`, [classId]);
        const intervalRows = await context.database.query(
          `SELECT "studentId" FROM ${ENROLLMENT} WHERE "classId" = $1 AND "validFrom" <= $2::date AND ("validTo" IS NULL OR "validTo" >= $2::date) ORDER BY "studentId" ASC`,
          [classId, asOfIsoDate],
        );
        const studentIds = intervalRows.map((row) => row.studentId);
        if (new Set(studentIds).size !== studentIds.length) throw new Error('Overlapping Academic Management enrollment intervals detected');
        const profiles = studentIds.length ? await context.database.query(
          `SELECT "id", "userId", "studentNumber", "guardianUserId" FROM ${STUDENT_PROFILE} WHERE "id" = ANY($1::text[]) ORDER BY "id" ASC`,
          [studentIds],
        ) : [];
        if (profiles.length !== studentIds.length) throw new Error('Academic enrollment interval references a missing student profile');
        const users = await lookupUserMap(profiles.map((profile) => profile.userId));
        const byId = new Map(profiles.map((profile) => [profile.id, profile]));
        return {
          contract: ROSTER_CONTRACT,
          classId,
          className: classRows[0]?.name || null,
          asOfIsoDate,
          source: 'plugin-enrollment-interval',
          students: studentIds.map((id) => byId.get(id)).map((profile) => ({
            studentId: profile.id,
            userId: profile.userId,
            studentNumber: profile.studentNumber || null,
            name: users.get(profile.userId)?.name || '',
            parentId: profile.guardianUserId || null,
          })),
        };
      },
    });
    context.routes.register({
      method: 'GET', path: 'contracts/students/:id/enrollment', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const studentId = request?.params?.id;
        const asOfIsoDate = requireIsoDate(request?.query?.asOfIsoDate);
        const profiles = await context.database.query(
          `SELECT "id", "userId", "guardianUserId" FROM ${STUDENT_PROFILE} WHERE "id" = $1 LIMIT 1`,
          [studentId],
        );
        if (!profiles.length) throw new Error('Student profile not found');
        const intervals = await context.database.query(
          `SELECT "classId" FROM ${ENROLLMENT} WHERE "studentId" = $1 AND "validFrom" <= $2::date AND ("validTo" IS NULL OR "validTo" >= $2::date) ORDER BY "validFrom" DESC`,
          [studentId, asOfIsoDate],
        );
        if (intervals.length > 1) throw new Error('Overlapping Academic Management enrollment intervals detected');
        const classId = intervals[0]?.classId || null;
        await requireEnrollmentScope(request, profiles[0], classId);
        const classes = classId ? await context.database.query(`SELECT "name" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`, [classId]) : [];
        return {
          contract: ROSTER_CONTRACT,
          studentId,
          classId,
          className: classes[0]?.name || null,
          enrolled: Boolean(classId),
          asOfIsoDate,
          source: 'plugin-enrollment-interval',
        };
      },
    });
    context.routes.register({
      method: 'GET', path: 'contracts/classes/:id/audience', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const classId = request?.params?.id;
        await requireClassStaffScope(request, classId);
        const classes = await context.database.query(`SELECT "teacherId", "classAdminId" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`, [classId]);
        if (!classes.length) throw new Error('Class not found');
        const profiles = await context.database.query(
          `SELECT s."userId", s."guardianUserId" FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL WHERE e."classId" = $1 ORDER BY s."id" ASC`,
          [classId],
        );
        const ids = Array.from(new Set([
          classes[0].teacherId, classes[0].classAdminId,
          ...profiles.flatMap((profile) => [profile.userId, profile.guardianUserId]),
        ].filter(Boolean)));
        const users = await context.directory.lookupUsers(ids);
        return {
          schemaVersion: 1,
          classId,
          users: users.map((user) => ({ id: user.id, email: user.email || null, phone: user.phone || null, role: user.role })),
        };
      },
    });
    context.routes.register({
      method: 'GET', path: 'contracts/users/:id/classes', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const userId = request?.params?.id;
        const role = String(request?.query?.role || '');
        if (!['TEACHER', 'CLASS_ADMIN', 'STUDENT', 'PARENT'].includes(role)) throw new Error('role is not supported by the Academic class-membership contract');
        const principal = request?.principal || {};
        if (principal.userId !== userId) await requireAdministrativePrincipal(request);
        let rows;
        if (role === 'TEACHER') {
          rows = await context.database.query(`SELECT "id" FROM ${CLASS} WHERE "teacherId" = $1 ORDER BY "id" ASC`, [userId]);
        } else if (role === 'CLASS_ADMIN') {
          rows = await context.database.query(`SELECT "id" FROM ${CLASS} WHERE "classAdminId" = $1 ORDER BY "id" ASC`, [userId]);
        } else if (role === 'STUDENT') {
          rows = await context.database.query(`SELECT e."classId" AS "id" FROM ${ENROLLMENT} e JOIN ${STUDENT_PROFILE} s ON s."id" = e."studentId" WHERE e."validTo" IS NULL AND s."userId" = $1 ORDER BY e."classId" ASC`, [userId]);
        } else {
          rows = await context.database.query(`SELECT DISTINCT e."classId" AS "id" FROM ${ENROLLMENT} e JOIN ${STUDENT_PROFILE} s ON s."id" = e."studentId" WHERE e."validTo" IS NULL AND s."guardianUserId" = $1 ORDER BY e."classId" ASC`, [userId]);
        }
        return { schemaVersion: 1, userId, role, classIds: Array.from(new Set(rows.map((row) => row.id))) };
      },
    });
    context.routes.register({
      method: 'GET', path: 'contracts/classes/lookup', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const rawIds = request?.query?.ids;
        const ids = Array.from(new Set((Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : []).map(String).filter(Boolean)));
        if (ids.length > 100) throw new Error('Class lookup accepts at most 100 ids');
        if (!ids.length) return { schemaVersion: 1, classes: [] };
        const rows = await context.database.query(`SELECT "id", "name" FROM ${CLASS} WHERE "id" = ANY($1::text[]) ORDER BY "id" ASC`, [ids]);
        return { schemaVersion: 1, classes: rows.map((row) => ({ id: row.id, name: row.name })) };
      },
    });
    context.routes.register({
      method: 'GET', path: 'contracts/subjects/lookup', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const rawIds = request?.query?.ids;
        const ids = Array.from(new Set((Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : []).map(String).filter(Boolean)));
        if (ids.length > 100) throw new Error('Subject lookup accepts at most 100 ids');
        if (!ids.length) return { schemaVersion: 1, subjects: [] };
        const rows = await context.database.query(`SELECT "id", "name", "code" FROM ${SUBJECT} WHERE "id" = ANY($1::text[]) ORDER BY "id" ASC`, [ids]);
        return { schemaVersion: 1, subjects: rows.map((row) => ({ id: row.id, name: row.name, code: row.code ?? null })) };
      },
    });
    context.routes.register({
      method: 'GET', path: 'contracts/users/:id/department', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const userId = request?.params?.id;
        if (request?.principal?.userId !== userId) await requireAdministrativePrincipal(request);
        const rows = await context.database.query(
          `SELECT d."id", d."name", d."nameKh" FROM ${USER_DEPARTMENT} ud JOIN ${DEPARTMENT} d ON d."id" = ud."departmentId" WHERE ud."userId" = $1 LIMIT 1`,
          [userId],
        );
        return { schemaVersion: 1, userId, department: rows[0] || null };
      },
    });
    context.routes.register({
      method: 'PUT', path: 'commands/users/:id/department', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const userId = request?.params?.id;
        const departmentId = request?.body?.departmentId || null;
        const idempotencyKey = request?.body?.idempotencyKey;
        if (idempotencyKey !== `assign-department:${userId}:${departmentId || 'none'}`) {
          throw new Error('Academic department assignment command has an invalid idempotency key');
        }
        if (departmentId) {
          const departments = await context.database.query(`SELECT "id" FROM ${DEPARTMENT} WHERE "id" = $1 LIMIT 1`, [departmentId]);
          if (!departments.length) throw new Error('Department not found');
          await context.database.execute(
            `INSERT INTO ${USER_DEPARTMENT} ("userId", "departmentId", "createdAt", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("userId") DO UPDATE SET "departmentId" = EXCLUDED."departmentId", "updatedAt" = CURRENT_TIMESTAMP`,
            [userId, departmentId],
          );
        } else {
          await context.database.execute(`DELETE FROM ${USER_DEPARTMENT} WHERE "userId" = $1`, [userId]);
        }
        return { success: true, userId, departmentId, idempotencyKey };
      },
    });
    context.routes.register({
      method: 'PUT', path: 'commands/students/by-user/:id/guardian', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const studentUserId = request?.params?.id;
        const parentId = request?.body?.parentId || null;
        const idempotencyKey = request?.body?.idempotencyKey;
        if (idempotencyKey !== `assign-parent:${studentUserId}:${parentId || 'none'}`) {
          throw new Error('Academic parent assignment command has an invalid idempotency key');
        }
        if (parentId) await requireRole(parentId, 'PARENT', 'parentId must reference a user with role PARENT');
        const profiles = await context.database.query(`SELECT "id" FROM ${STUDENT_PROFILE} WHERE "userId" = $1 LIMIT 1`, [studentUserId]);
        if (!profiles.length) throw new Error('Student profile not found for this user');
        await context.database.execute(
          `UPDATE ${STUDENT_PROFILE} SET "guardianUserId" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2`,
          [parentId, profiles[0].id],
        );
        return { success: true, studentUserId, parentId, idempotencyKey };
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'commands/users/:id/academic-identity', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const userId = request?.params?.id;
        const idempotencyKey = request?.body?.idempotencyKey;
        if (idempotencyKey !== `delete-user:${userId}`) throw new Error('Academic identity detach command has an invalid idempotency key');
        const result = await context.database.transaction(async (tx) => {
          const profiles = await tx.query(`SELECT "id" FROM ${STUDENT_PROFILE} WHERE "userId" = $1 LIMIT 1`, [userId]);
          const profileId = profiles[0]?.id || null;
          await tx.execute(`UPDATE ${CLASS} SET "teacherId" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "teacherId" = $1`, [userId]);
          await tx.execute(`UPDATE ${CLASS} SET "classAdminId" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "classAdminId" = $1`, [userId]);
          await tx.execute(`DELETE FROM ${USER_DEPARTMENT} WHERE "userId" = $1`, [userId]);
          await tx.execute(`UPDATE ${STUDENT_PROFILE} SET "guardianUserId" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "guardianUserId" = $1`, [userId]);
          if (profileId) {
            await tx.execute(`DELETE FROM ${ENROLLMENT} WHERE "studentId" = $1`, [profileId]);
            await tx.execute(`DELETE FROM ${STUDENT_PROFILE} WHERE "id" = $1`, [profileId]);
          }
          tx.publish({
            event: 'wattanam.academic-management.identity.detached', version: 1, subjectKey: userId,
            payload: { userId, studentProfileId: profileId, principal: request?.principal }, idempotencyKey,
          });
          return { success: true, userId, studentProfileId: profileId, idempotencyKey };
        });
        context.events.publish('academic.identity.detached.v1', result);
        return result;
      },
    });
    context.routes.register({
      method: 'POST', path: 'contracts/users/academic-profiles', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const userIds = Array.from(new Set((Array.isArray(request?.body?.userIds) ? request.body.userIds : []).map(String).filter(Boolean)));
        if (!userIds.length || userIds.length > 500) throw new Error('userIds must contain between 1 and 500 unique ids');
        const [memberships, profiles, children] = await Promise.all([
          context.database.query(
            `SELECT ud."userId", d."id" AS "departmentId", d."name" AS "departmentName", d."nameKh" AS "departmentNameKh" FROM ${USER_DEPARTMENT} ud JOIN ${DEPARTMENT} d ON d."id" = ud."departmentId" WHERE ud."userId" = ANY($1::text[])`,
            [userIds],
          ),
          context.database.query(
            `SELECT p."id", p."userId", p."studentNumber", p."sex", p."photo", p."dateOfBirth", p."address", p."guardianUserId" AS "parentId", c."id" AS "classId", c."name" AS "className" FROM ${STUDENT_PROFILE} p LEFT JOIN ${ENROLLMENT} e ON e."studentId" = p."id" AND e."validTo" IS NULL LEFT JOIN ${CLASS} c ON c."id" = e."classId" WHERE p."userId" = ANY($1::text[])`,
            [userIds],
          ),
          context.database.query(
            `SELECT p."guardianUserId" AS "parentId", p."id", p."userId" FROM ${STUDENT_PROFILE} p WHERE p."guardianUserId" = ANY($1::text[]) ORDER BY p."id" ASC`,
            [userIds],
          ),
        ]);
        const identityIds = Array.from(new Set([
          ...profiles.map((profile) => profile.parentId), ...children.map((child) => child.userId),
        ].filter(Boolean)));
        const identities = await lookupUserMap(identityIds);
        const departmentByUser = new Map(memberships.map((row) => [row.userId, {
          id: row.departmentId, name: row.departmentName, nameKh: row.departmentNameKh || null,
        }]));
        const profileByUser = new Map(profiles.map((profile) => [profile.userId, {
          id: profile.id, studentNumber: profile.studentNumber || null, sex: profile.sex || null,
          photo: profile.photo || null, dateOfBirth: profile.dateOfBirth || null, address: profile.address || null,
          parentId: profile.parentId || null,
          class: profile.classId ? { id: profile.classId, name: profile.className } : null,
          parent: profile.parentId ? (() => {
            const parent = identities.get(profile.parentId);
            return parent ? { id: parent.id, name: parent.name, email: parent.email || null, phone: parent.phone || null } : null;
          })() : null,
        }]));
        const childrenByParent = new Map();
        for (const child of children) {
          const list = childrenByParent.get(child.parentId) || [];
          list.push({ id: child.id, user: { name: identities.get(child.userId)?.name || '' } });
          childrenByParent.set(child.parentId, list);
        }
        return {
          schemaVersion: 1,
          profiles: userIds.map((userId) => ({
            userId,
            departmentId: departmentByUser.get(userId)?.id || null,
            department: departmentByUser.get(userId) || null,
            studentProfile: profileByUser.get(userId) || null,
            parentStudents: childrenByParent.get(userId) || [],
          })),
        };
      },
    });
    function convertGoogleDriveUrl(url) {
      if (!url) return url;
      const match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
      return url;
    }
    context.routes.register({
      method: 'POST', path: 'classes/:id/students/create', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const classId = String(request?.params?.id || '').trim();
        const body = request?.body || {};
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const phone = String(body.phone || '').trim();
        const password = String(body.password || '');
        const commandKey = String(body.commandKey || '').trim();
        const studentNumber = String(body.studentNumber || '').trim();
        if (!classId) throw new Error('classId is required');
        if (!name || name.length > 160) throw new Error('name is required');
        if (email && !isValidEmail(email)) throw new Error('email is invalid');
        if (password.length < 6 || password.length > 200) throw new Error('password must contain 6-200 characters');
        if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,199}$/.test(commandKey)) throw new Error('commandKey is required');
        if (studentNumber.length > 100) throw new Error('studentNumber exceeds 100 characters');
        const classRows = await context.database.query(`SELECT "id" FROM ${CLASS} WHERE "id"=$1 LIMIT 1`, [classId]);
        if (!classRows.length) throw new Error('Class not found');
        if (studentNumber) {
          const clash = await context.database.query(`SELECT "id" FROM ${STUDENT_PROFILE} WHERE "studentNumber"=$1 LIMIT 1`, [studentNumber]);
          if (clash.length) throw new Error('Student number is already used');
        }
        const account = await context.accounts.createStudent({ commandKey, name, email: email || null, phone: phone || null, passwordHash: await context.crypto.hashBcrypt(password, 12) });
        const profileId = crypto.randomUUID();
        const resolvedNumber = studentNumber || String((await context.database.query(`SELECT COUNT(*)::int AS "count" FROM ${ENROLLMENT} WHERE "classId"=$1 AND "validTo" IS NULL`, [classId]))[0].count + 1).padStart(4, '0');
        const materializedId = await context.database.transaction(async (tx) => {
          await tx.execute(`INSERT INTO ${STUDENT_PROFILE} ("id","userId","studentNumber","nameKh","qrCode","photo","sex","dateOfBirth","address","generation","source") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,'plugin') ON CONFLICT ("userId") DO NOTHING`, [profileId, account.id, resolvedNumber, String(body.nameKh || '').trim() || null, newCardCode('stu'), convertGoogleDriveUrl(String(body.photo || '').trim()) || null, normalizedCsvSex(String(body.sex || '')), body.dateOfBirth || null, String(body.address || '').trim() || null, String(body.generation || '').trim() || null]);
          const profile = (await tx.query(`SELECT "id" FROM ${STUDENT_PROFILE} WHERE "userId"=$1 LIMIT 1`, [account.id]))[0];
          if (!profile) throw new Error('Student profile materialization failed');
          await tx.execute(`INSERT INTO ${ENROLLMENT} ("id","studentId","classId","validFrom","source") VALUES ($1,$2,$3,CURRENT_DATE,'plugin') ON CONFLICT ("studentId","classId","validFrom") DO NOTHING`, [crypto.randomUUID(), profile.id, classId]);
          await tx.publish({ event: 'wattanam.academic-management.student.created', version: 1, subjectKey: profile.id, payload: { studentId: profile.id, userId: account.id, classId, studentNumber: resolvedNumber }, idempotencyKey: `academic-student-created-${profile.id}-${classId}` });
          return profile.id;
        });
        context.events.publish('academic.student.added-to-class.v1', { studentId: materializedId, classId, principal: request?.principal });
        return { id: materializedId, userId: account.id, studentNumber: resolvedNumber, name: account.name, email: account.email, phone: account.phone, classId };
      },
    });
    context.routes.register({
      method: 'POST', path: 'classes/:id/students', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const classId = request?.params?.id;
        await requireClassStaffScope(request, classId);
        const body = request?.body || {};
        const studentId = body.studentId;
        if (!studentId) throw new Error('studentId is required');
        if (!classId) throw new Error('classId is required');
        const classRows = await context.database.query(`SELECT "id" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`, [classId]);
        if (!classRows.length) throw new Error('Class not found');
        let student = await context.database.query(`SELECT "id", "userId", "studentNumber" FROM ${STUDENT_PROFILE} WHERE "id" = $1 LIMIT 1`, [studentId]);
        if (!student.length) {
          student = await context.database.query(`SELECT "id", "userId", "studentNumber" FROM ${STUDENT_PROFILE} WHERE "userId" = $1 LIMIT 1`, [studentId]);
        }
        if (student.length) {
          const existing = student[0];
          const existingUser = (await context.directory.lookupUsers([existing.userId]))[0] || null;
          const enrollmentRows = await context.database.query(`SELECT "id", "classId", "validFrom" FROM ${ENROLLMENT} WHERE "studentId" = $1 AND "validTo" IS NULL LIMIT 1`, [existing.id]);
          if (enrollmentRows[0]?.classId === classId) {
            return { ...existing, classId, user: existingUser };
          }
          let studentNumber = existing.studentNumber;
          if (!studentNumber) {
            const countRows = await context.database.query(`SELECT COUNT(*)::int AS "count" FROM ${ENROLLMENT} WHERE "classId" = $1 AND "validTo" IS NULL`, [classId]);
            studentNumber = String(countRows[0].count + 1).padStart(4, '0');
          }
          const added = await context.database.transaction(async (tx) => {
            await tx.execute(`DELETE FROM ${ENROLLMENT} WHERE "studentId" = $1 AND "validTo" IS NULL AND "validFrom" = CURRENT_DATE`, [existing.id]);
            await tx.execute(`UPDATE ${ENROLLMENT} SET "validTo" = CURRENT_DATE - INTERVAL '1 day', "updatedAt" = CURRENT_TIMESTAMP WHERE "studentId" = $1 AND "validTo" IS NULL AND "validFrom" < CURRENT_DATE`, [existing.id]);
            await tx.execute(`UPDATE ${STUDENT_PROFILE} SET "studentNumber" = $1, "qrCode" = COALESCE("qrCode", $2), "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $3`, [studentNumber, newCardCode('stu'), existing.id]);
            await tx.execute(`INSERT INTO ${ENROLLMENT} ("id","studentId","classId","validFrom","source") VALUES ($1,$2,$3,CURRENT_DATE,'plugin')`, [crypto.randomUUID(), existing.id, classId]);
            const row = await tx.query(
              `SELECT s."id", s."userId", s."studentNumber", e."classId", jsonb_build_object('id', c."id", 'name', c."name") AS class FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL LEFT JOIN ${CLASS} c ON c."id" = e."classId" WHERE s."id" = $1 LIMIT 1`,
              [existing.id],
            ).then((rows) => rows[0]);
            row.user = existingUser;
            tx.publish({
              event: 'wattanam.academic-management.student.added-to-class',
              version: 1,
              subjectKey: row.id,
              payload: { student: row, classId, principal: request?.principal },
              idempotencyKey: eventKey('student-added-to-class', { student: row, classId }),
            });
            return row;
          });
          context.events.publish('academic.student.added-to-class.v1', { student: added, classId, principal: request?.principal });
          return added;
        }
        const studentUser = await requireRole(studentId, 'STUDENT', 'studentId must reference a user with role STUDENT');
        const added = await context.database.transaction(async (tx) => {
          const countRowsInner = await tx.query(`SELECT COUNT(*)::int AS "count" FROM ${ENROLLMENT} WHERE "classId" = $1 AND "validTo" IS NULL`, [classId]);
          const studentNumber = String(countRowsInner[0].count + 1).padStart(4, '0');
          const sid = crypto.randomUUID();
          await tx.execute(
            `INSERT INTO ${STUDENT_PROFILE} ("id", "userId", "studentNumber", "qrCode", "source") VALUES ($1, $2, $3, $4, 'plugin')`,
            [sid, studentId, studentNumber, newCardCode('stu')],
          );
          await tx.execute(`INSERT INTO ${ENROLLMENT} ("id","studentId","classId","validFrom","source") VALUES ($1,$2,$3,CURRENT_DATE,'plugin')`, [crypto.randomUUID(), sid, classId]);
          const row = await tx.query(
            `SELECT s."id", s."userId", s."studentNumber", e."classId", jsonb_build_object('id', c."id", 'name', c."name") AS class FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL LEFT JOIN ${CLASS} c ON c."id" = e."classId" WHERE s."id" = $1 LIMIT 1`,
            [sid],
          ).then((rows) => rows[0]);
          row.user = studentUser;
          tx.publish({
            event: 'wattanam.academic-management.student.added-to-class',
            version: 1,
            subjectKey: row.id,
            payload: { student: row, classId, principal: request?.principal },
            idempotencyKey: `student-added-to-class-${row.id}-${classId}`,
          });
          return row;
        });
        context.events.publish('academic.student.added-to-class.v1', { student: added, classId, principal: request?.principal });
        return added;
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'classes/:classId/students/:studentId', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const studentId = request?.params?.studentId;
        await requireClassStaffScope(request, request?.params?.classId);
        const body = request?.body || {};
        const studentRows = await context.database.query(`SELECT s."id", s."userId" FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL WHERE s."id" = $1 AND e."classId" = $2 LIMIT 1`, [studentId, request?.params?.classId]);
        if (!studentRows.length) throw new Error('Student not found');
        const student = studentRows[0];
        if (body.name !== undefined || body.phone !== undefined || body.email !== undefined) {
          throw new Error('Core account name, email, and phone must be changed in User Management');
        }
        const studentUser = (await context.directory.lookupUsers([student.userId]))[0] || null;
        const studentSets = [];
        const studentParams = [];
        if (body.nameKh !== undefined) { studentSets.push(`"nameKh" = $${studentParams.length + 1}`); studentParams.push(body.nameKh); }
        if (body.sex !== undefined) { studentSets.push(`"sex" = $${studentParams.length + 1}`); studentParams.push(body.sex); }
        if (body.photo !== undefined) { studentSets.push(`"photo" = $${studentParams.length + 1}`); studentParams.push(convertGoogleDriveUrl(body.photo || '')); }
        if (body.dateOfBirth !== undefined) { studentSets.push(`"dateOfBirth" = $${studentParams.length + 1}`); studentParams.push(body.dateOfBirth ? new Date(body.dateOfBirth) : null); }
        if (body.address !== undefined) { studentSets.push(`"address" = $${studentParams.length + 1}`); studentParams.push(body.address); }
        if (body.generation !== undefined) { studentSets.push(`"generation" = $${studentParams.length + 1}`); studentParams.push(body.generation); }
        if (body.studentNumber !== undefined) { studentSets.push(`"studentNumber" = $${studentParams.length + 1}`); studentParams.push(body.studentNumber.trim() || null); }
        if (body.customFieldValues !== undefined) { studentSets.push(`"customFieldValues" = $${studentParams.length + 1}`); studentParams.push(JSON.stringify(body.customFieldValues)); }
        if (body.parentId !== undefined) {
          if (body.parentId) {
            await requireRole(body.parentId, 'PARENT', 'parentId must reference a user with role PARENT');
          }
          studentSets.push(`"guardianUserId" = $${studentParams.length + 1}`);
          studentParams.push(body.parentId || null);
        }
        const updated = await context.database.transaction(async (tx) => {
          if (studentSets.length) {
            studentSets.push(`"updatedAt" = CURRENT_TIMESTAMP`);
            studentParams.push(student.id);
            await tx.execute(`UPDATE ${STUDENT_PROFILE} SET ${studentSets.join(', ')} WHERE "id" = $${studentParams.length}`, studentParams);
          }
          const rows = await tx.query(
            `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."qrCode", s."photo", s."sex", s."dateOfBirth", s."address", s."generation", s."customFieldValues", s."guardianUserId" AS "parentId", c."name" AS "className" FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL LEFT JOIN ${CLASS} c ON c."id" = e."classId" WHERE s."id" = $1 LIMIT 1`,
            [studentId],
          );
          const row = rows[0];
          const result = {
            id: row.id,
            studentNumber: row.studentNumber || '',
            userId: row.userId,
            name: studentUser?.name || null,
            nameKh: row.nameKh || '',
            email: studentUser?.email || null,
            phone: studentUser?.phone || '',
            qrCode: row.qrCode,
            photo: row.photo,
            sex: row.sex,
            dateOfBirth: row.dateOfBirth,
            address: row.address || '',
            generation: row.generation || '',
            customFieldValues: row.customFieldValues || {},
            parentId: row.parentId,
            className: row.className || null,
          };
          tx.publish({
            event: 'wattanam.academic-management.student.updated',
            version: 1,
            subjectKey: result.id,
            payload: { student: result, principal: request?.principal },
            idempotencyKey: eventKey('student-updated', result),
          });
          return result;
        });
        context.events.publish('academic.student.updated.v1', { student: updated, principal: request?.principal });
        return updated;
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'classes/:id/students/:studentId', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const studentId = request?.params?.studentId;
        await requireClassStaffScope(request, request?.params?.id);
        const studentRows = await context.database.query(`SELECT s."id", s."userId" FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId" = s."id" AND e."validTo" IS NULL WHERE s."id" = $1 AND e."classId" = $2 LIMIT 1`, [studentId, request?.params?.id]);
        if (!studentRows.length) return { success: false, message: 'Student not found' };
        await context.database.transaction(async (tx) => {
          await tx.execute(`DELETE FROM ${ENROLLMENT} WHERE "studentId" = $1 AND "validTo" IS NULL AND "validFrom" = CURRENT_DATE`, [studentId]);
          await tx.execute(`UPDATE ${ENROLLMENT} SET "validTo" = CURRENT_DATE - INTERVAL '1 day', "updatedAt" = CURRENT_TIMESTAMP WHERE "studentId" = $1 AND "validTo" IS NULL AND "validFrom" < CURRENT_DATE`, [studentId]);
          tx.publish({
            event: 'wattanam.academic-management.student.removed-from-class',
            version: 1,
            subjectKey: studentId,
            payload: { studentId, classId: request?.params?.id, principal: request?.principal },
            idempotencyKey: eventKey('student-removed-from-class', { studentId, classId: request?.params?.id }),
          });
        });
        context.events.publish('academic.student.removed-from-class.v1', { studentId, classId: request?.params?.id, principal: request?.principal });
        return { success: true };
      },
    });
    context.routes.register({
      method: 'POST', path: 'classes/cleanup-orphaned-students', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const orphaned = await context.database.query(`SELECT s."id" FROM ${STUDENT_PROFILE} s WHERE NOT EXISTS (SELECT 1 FROM ${ENROLLMENT} e WHERE e."studentId" = s."id") ORDER BY s."id" ASC`);
        if (!orphaned.length) return { deleted: 0 };
        const studentIds = orphaned.map((s) => s.id);
        const idList = studentIds.map((_, i) => `$${i + 1}`).join(', ');
        await context.database.transaction(async (tx) => {
          await tx.execute(`DELETE FROM ${STUDENT_PROFILE} WHERE "id" IN (${idList})`, studentIds);
          tx.publish({
            event: 'wattanam.academic-management.students.cleaned-up',
            version: 1,
            subjectKey: 'orphaned',
            payload: { studentIds, deleted: orphaned.length, principal: request?.principal },
            idempotencyKey: eventKey('students-cleaned-up', { studentIds: [...studentIds].sort() }),
          });
        });
        context.events.publish('academic.students.cleaned-up.v1', { studentIds, deleted: orphaned.length, principal: request?.principal });
        return { deleted: orphaned.length };
      },
    });
    context.routes.register({
      method: 'GET', path: 'admissions/public/classes', permission: 'wattanam.academic-management.view',
      handler: async () => decorateClassRows(await context.database.query(
        `SELECT c."id", c."name", c."subject", c."teacherId", c."classAdminId", c."studyYearId", c."registrationStatus", c."thumbnail", c."description", CASE WHEN c."showPrice" THEN c."price" ELSE NULL END AS "price", c."showPrice" FROM ${CLASS} c WHERE c."registrationStatus" <> 'HIDDEN' ORDER BY c."name" ASC`,
        [],
      )),
    });
    const defaultSettings = {
      id: 'singleton',
      khmerNameMode: 'REQUIRED',
      phoneMode: 'REQUIRED',
      emailMode: 'REQUIRED',
      photoMode: 'OPTIONAL',
      passwordMode: 'REQUIRED',
      sexMode: 'HIDDEN',
      dateOfBirthMode: 'HIDDEN',
      addressMode: 'HIDDEN',
      generationMode: 'HIDDEN',
      updatedAt: null,
    };

    async function getSettings() {
      const rows = await context.database.query(
        `SELECT "id", "khmerNameMode", "phoneMode", "emailMode", "photoMode", "passwordMode", "sexMode", "dateOfBirthMode", "addressMode", "generationMode", "updatedAt" FROM ${SETTINGS} WHERE "id" = 'singleton' LIMIT 1`,
        [],
      );
      return rows[0] ?? defaultSettings;
    }

    async function getEnabledFields() {
      return context.database.query(
        `SELECT "id", "key", "label", "fieldType", "options", "required", "order", "enabled", "createdAt", "updatedAt" FROM ${FIELD} WHERE "enabled" = TRUE ORDER BY "order" ASC`,
        [],
      );
    }

    context.routes.register({
      method: 'GET', path: 'admissions/public/form-config', permission: 'wattanam.academic-management.view',
      handler: async () => ({ settings: await getSettings(), fields: await getEnabledFields() }),
    });
    context.routes.register({
      method: 'GET', path: 'admissions/settings', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        return getSettings();
      },
    });
    context.routes.register({
      method: 'GET', path: 'admissions/fields', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        return context.database.query(
          `SELECT "id", "key", "label", "fieldType", "options", "required", "order", "enabled", "createdAt", "updatedAt" FROM ${FIELD} ORDER BY "order" ASC`,
          [],
        );
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'admissions/settings', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const body = request?.body || {};
        const columns = [];
        const values = [];
        const params = [];
        for (const key of ['khmerNameMode', 'phoneMode', 'emailMode', 'photoMode', 'passwordMode', 'sexMode', 'dateOfBirthMode', 'addressMode', 'generationMode']) {
          const v = body[key];
          if (v === undefined) continue;
          assertMode(v, key);
          columns.push(`"${key}"`);
          values.push(`$${params.length + 1}`);
          params.push(v);
        }
        if (columns.length === 0) throw new Error('No valid settings provided');
        const current = await getSettings();
        const nextEmailMode = body.emailMode ?? current.emailMode;
        const nextPhoneMode = body.phoneMode ?? current.phoneMode;
        if (nextEmailMode === 'HIDDEN' && nextPhoneMode === 'HIDDEN') {
          throw new Error('Email and Phone cannot both be hidden — a student needs at least one to create a login');
        }
        await context.database.execute(
          `INSERT INTO ${SETTINGS} ("id", ${columns.join(', ')}, "updatedAt") VALUES ('singleton', ${values.join(', ')}, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO UPDATE SET ${columns.map((c, i) => `${c} = $${i + 1}`).join(', ')}, "updatedAt" = CURRENT_TIMESTAMP`,
          params,
        );
        return getSettings();
      },
    });
    context.routes.register({
      method: 'POST', path: 'admissions/fields', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const body = request?.body || {};
        const label = String(body.label || '').trim();
        if (!label) throw new Error('label is required');
        const { fieldType, options } = sanitizeFieldTypeAndOptions(body.fieldType, body.options);
        const base = slugify(label);
        let key = base;
        let n = 1;
        let existing = await context.database.query(`SELECT "id" FROM ${FIELD} WHERE "key" = $1 LIMIT 1`, [key]);
        while (existing.length) {
          key = `${base}_${++n}`;
          existing = await context.database.query(`SELECT "id" FROM ${FIELD} WHERE "key" = $1 LIMIT 1`, [key]);
        }
        const maxRows = await context.database.query(`SELECT MAX("order") AS "maxOrder" FROM ${FIELD}`);
        const order = (maxRows[0]?.maxOrder ?? -1) + 1;
        const id = crypto.randomUUID();
        await context.database.execute(
          `INSERT INTO ${FIELD} ("id", "key", "label", "fieldType", "options", "required", "order", "enabled", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [id, key, label, fieldType, options ? JSON.stringify(options) : null, !!body.required, order],
        );
        return { id, key, label, fieldType, options, required: !!body.required, order, enabled: true };
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'admissions/fields/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        const body = request?.body || {};
        const existingRows = await context.database.query(`SELECT "id", "fieldType", "options" FROM ${FIELD} WHERE "id" = $1 LIMIT 1`, [id]);
        const field = existingRows[0];
        if (!field) throw new Error('Field not found');
        const sets = [];
        const params = [];
        if (body.label !== undefined) {
          const label = String(body.label).trim();
          if (!label) throw new Error('label cannot be empty');
          sets.push(`"label" = $${params.length + 1}`);
          params.push(label);
        }
        if (body.required !== undefined) {
          sets.push(`"required" = $${params.length + 1}`);
          params.push(!!body.required);
        }
        if (body.enabled !== undefined) {
          sets.push(`"enabled" = $${params.length + 1}`);
          params.push(!!body.enabled);
        }
        if (body.fieldType !== undefined) {
          const { fieldType, options } = sanitizeFieldTypeAndOptions(body.fieldType, body.options ?? field.options);
          sets.push(`"fieldType" = $${params.length + 1}`);
          params.push(fieldType);
          sets.push(`"options" = $${params.length + 1}`);
          params.push(options ? JSON.stringify(options) : null);
        } else if (body.options !== undefined && CUSTOM_FIELD_TYPES_WITH_OPTIONS.includes(field.fieldType)) {
          const { options } = sanitizeFieldTypeAndOptions(field.fieldType, body.options);
          sets.push(`"options" = $${params.length + 1}`);
          params.push(options ? JSON.stringify(options) : null);
        }
        if (sets.length === 0) throw new Error('No valid field updates provided');
        sets.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        params.push(id);
        await context.database.execute(
          `UPDATE ${FIELD} SET ${sets.join(', ')} WHERE "id" = $${params.length}`,
          params,
        );
        return context.database.query(`SELECT * FROM ${FIELD} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'POST', path: 'admissions/fields/reorder', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const ids = request?.body?.ids;
        if (!Array.isArray(ids) || ids.length === 0) throw new Error('ids is required');
        await context.database.transaction(async (tx) => {
          for (let i = 0; i < ids.length; i += 1) {
            await tx.execute(`UPDATE ${FIELD} SET "order" = $1 WHERE "id" = $2`, [i, ids[i]]);
          }
        });
        return context.database.query(`SELECT "id", "key", "label", "fieldType", "options", "required", "order", "enabled", "createdAt", "updatedAt" FROM ${FIELD} ORDER BY "order" ASC`, []);
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'admissions/fields/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        const existingRows = await context.database.query(`SELECT "id" FROM ${FIELD} WHERE "id" = $1 LIMIT 1`, [id]);
        if (!existingRows.length) throw new Error('Field not found');
        await context.database.execute(`DELETE FROM ${FIELD} WHERE "id" = $1`, [id]);
        return { success: true };
      },
    });
    context.routes.register({
      method: 'GET', path: 'admissions/registrations', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const query = request?.query || {};
        const status = Array.isArray(query.status) ? query.status[0] : query.status;
        const classId = Array.isArray(query.classId) ? query.classId[0] : query.classId;
        const conditions = [];
        const params = [];
        if (typeof status === 'string' && status) {
          params.push(status);
          conditions.push(`r."status" = $${params.length}`);
        }
        if (typeof classId === 'string' && classId) {
          params.push(classId);
          conditions.push(`r."classId" = $${params.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        return context.database.query(
          `SELECT r."id", r."classId", r."nameKh", r."nameEn", r."email", r."phone", r."status", r."createdAt", r."resolvedAt", r."resolvedBy", jsonb_build_object('id', c."id", 'name', c."name") AS class FROM ${REGISTRATION} r LEFT JOIN ${CLASS} c ON c."id" = r."classId" ${where} ORDER BY r."createdAt" DESC`,
          params,
        );
      },
    });
    context.routes.register({
      method: 'GET', path: 'admissions/registrations/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        const rows = await context.database.query(
          `SELECT r.*, jsonb_build_object('id', c."id", 'name', c."name") AS class FROM ${REGISTRATION} r LEFT JOIN ${CLASS} c ON c."id" = r."classId" WHERE r."id" = $1 LIMIT 1`,
          [id],
        );
        if (!rows.length) throw new Error('Registration not found');
        return rows[0];
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'admissions/registrations/:id/resolve', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        const body = request?.body || {};
        const action = body.action;
        if (action !== 'APPROVE' && action !== 'REJECT') throw new Error('action must be APPROVE or REJECT');
        const regRows = await context.database.query(`SELECT * FROM ${REGISTRATION} WHERE "id" = $1 LIMIT 1`, [id]);
        const reg = regRows[0];
        if (!reg) throw new Error('Registration not found');
        if (reg.status !== 'PENDING') throw new Error('Registration already resolved');
        const resolvedAt = new Date().toISOString();
        const resolvedBy = request?.principal?.userId;
        if (action === 'REJECT') {
          await context.database.execute(
            `UPDATE ${REGISTRATION} SET "status" = 'REJECTED', "rejectReason" = $1, "resolvedAt" = $2, "resolvedBy" = $3 WHERE "id" = $4`,
            [body.rejectReason?.trim() || null, resolvedAt, resolvedBy, id],
          );
          if (reg.email) {
            try { await context.notifications.sendEmail(reg.email, 'Your class registration was not approved', `Hi ${reg.nameEn}, your registration was not approved${body.rejectReason ? `: ${body.rejectReason}` : '.'}`); } catch {}
          }
          return context.database.query(`SELECT * FROM ${REGISTRATION} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
        }
        const password = reg.generatedPassword || generatePassword();
        const account = await context.accounts.createStudent({
          commandKey: `registration:${id}`,
          name: reg.nameEn,
          email: reg.email || null,
          phone: reg.phone || null,
          passwordHash: reg.passwordHash,
        });
        await context.database.transaction(async (tx) => {
          const lockedRows = await tx.query(`SELECT "status", "studentId" FROM ${REGISTRATION} WHERE "id" = $1 FOR UPDATE`, [id]);
          if (!lockedRows.length) throw new Error('Registration not found');
          if (lockedRows[0].status === 'APPROVED' && lockedRows[0].studentId) return;
          if (lockedRows[0].status !== 'PENDING') throw new Error('Registration already resolved');
          const profileId = crypto.randomUUID();
          const countRows = await tx.query(`SELECT COUNT(*)::int AS "count" FROM ${STUDENT_PROFILE}`);
          const studentNumber = String(Number(countRows[0]?.count || 0) + 1).padStart(4, '0');
          await tx.execute(
            `INSERT INTO ${STUDENT_PROFILE} ("id", "userId", "studentNumber", "qrCode", "photo", "sex", "dateOfBirth", "address", "generation", "nameKh", "customFieldValues", "source", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'registration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("userId") DO NOTHING`,
            [profileId, account.id, studentNumber, newCardCode('stu'), reg.photo || null, reg.sex || null, reg.dateOfBirth || null, reg.address || null, reg.generation || null, reg.nameKh || null, reg.customFieldValues || {}],
          );
          const profiles = await tx.query(`SELECT "id" FROM ${STUDENT_PROFILE} WHERE "userId" = $1 LIMIT 1`, [account.id]);
          if (!profiles.length) throw new Error('Student profile materialization failed');
          const studentId = profiles[0].id;
          await tx.execute(
            `INSERT INTO ${ENROLLMENT} ("id", "studentId", "classId", "validFrom", "source", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, 'registration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("studentId", "classId", "validFrom") DO NOTHING`,
            [crypto.randomUUID(), studentId, reg.classId, resolvedAt.slice(0, 10)],
          );
          await tx.execute(
            `UPDATE ${REGISTRATION} SET "status" = 'APPROVED', "studentId" = $1, "resolvedAt" = $2, "resolvedBy" = $3 WHERE "id" = $4`,
            [studentId, resolvedAt, resolvedBy, id],
          );
          await tx.publish({
            event: 'academic.registration.approved.v2', version: 2, subjectKey: id,
            payload: { registrationId: id, classId: reg.classId, studentId, userId: account.id, resolvedBy, resolvedAt },
            idempotencyKey: `academic-registration-approved-${id}`,
          });
        });
        if (reg.email) {
          try { await context.notifications.sendEmail(reg.email, 'Your class registration is approved', `Hi ${reg.nameEn}, your registration has been approved. Your temporary password is: ${password}`); } catch {}
        }
        return context.database.query(`SELECT * FROM ${REGISTRATION} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
    const decorateOfficerRows = async (rows) => {
      const [users, departments] = await Promise.all([
        lookupUserMap(rows.map((row) => row.userId)),
        context.database.query(`SELECT "id", "name", "nameKh" FROM ${DEPARTMENT}`),
      ]);
      const departmentMap = new Map(departments.map((department) => [department.id, department]));
      return rows.map((row) => {
        const user = users.get(row.userId) || null;
        return {
          ...row,
          user,
          name: user?.name || null,
          email: user?.email || null,
          phone: user?.phone || null,
          role: user?.role || null,
          department: row.departmentId ? departmentMap.get(row.departmentId) || null : null,
        };
      });
    };
    const officerSelect = `SELECT o."id", o."userId", o."employeeNumber", o."position", o."departmentId", o."employmentStatus", o."startedAt", o."endedAt", o."notes", o."createdAt", o."updatedAt" FROM ${OFFICER} o`;
    context.routes.register({
      method: 'GET', path: 'officers', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const status = String(request?.query?.status || '').toUpperCase();
        if (status && !OFFICER_EMPLOYMENT_STATUSES.includes(status)) throw new Error('Invalid employment status');
        const rows = await context.database.query(`${officerSelect}${status ? ' WHERE o."employmentStatus" = $1' : ''} ORDER BY o."createdAt" DESC`, status ? [status] : []);
        return decorateOfficerRows(rows);
      },
    });
    context.routes.register({
      method: 'GET', path: 'officers/:id', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const rows = await context.database.query(`${officerSelect} WHERE o."id" = $1::uuid LIMIT 1`, [request?.params?.id]);
        if (!rows.length) throw new Error('Officer profile not found');
        return decorateOfficerRows(rows).then((items) => items[0]);
      },
    });
    context.routes.register({
      method: 'POST', path: 'officers', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const body = request?.body || {};
        let userId = String(body.userId || '').trim();
        let user;
        if (!userId) {
          const name = String(body.name || '').trim();
          const email = String(body.email || '').trim().toLowerCase();
          const password = String(body.password || '');
          const commandKey = String(body.commandKey || '').trim();
          if (!name || name.length > 160) throw new Error('name is required');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('email is invalid');
          if (password.length < 8 || password.length > 200) throw new Error('password must contain 8-200 characters');
          if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,199}$/.test(commandKey)) throw new Error('commandKey is required');
          const account = await context.accounts.createStaff({ commandKey, name, email, phone: String(body.phone || '').trim() || null, photo: String(body.photo || '').trim() || null, passwordHash: await context.crypto.hashBcrypt(password), role: String(body.position || '').toUpperCase() === 'TEACHER' ? 'TEACHER' : 'STAFF' });
          userId = account.id;
          user = account;
        } else user = (await context.directory.lookupUsers([userId]))[0];
        if (!user) throw new Error('Directory user not found');
        if (['STUDENT', 'PARENT'].includes(user.role)) throw new Error('Officer profiles cannot be assigned to student or parent accounts');
        const employmentStatus = String(body.employmentStatus || 'ACTIVE').toUpperCase();
        if (!OFFICER_EMPLOYMENT_STATUSES.includes(employmentStatus)) throw new Error('Invalid employment status');
        if (body.departmentId) {
          const department = await context.database.query(`SELECT "id" FROM ${DEPARTMENT} WHERE "id" = $1 LIMIT 1`, [body.departmentId]);
          if (!department.length) throw new Error('Department not found');
        }
        const startedAt = body.startedAt ? requireDate(body.startedAt, 'startedAt') : null;
        const endedAt = body.endedAt ? requireDate(body.endedAt, 'endedAt') : null;
        if (startedAt && endedAt && endedAt < startedAt) throw new Error('endedAt must be on or after startedAt');
        const id = crypto.randomUUID();
        await context.database.transaction(async (tx) => {
          await tx.execute(`INSERT INTO ${OFFICER} ("id", "userId", "employeeNumber", "position", "departmentId", "employmentStatus", "startedAt", "endedAt", "notes") VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,$6,$7::date,$8::date,$9)`, [id, userId, String(body.employeeNumber || '').trim() || null, String(body.position || '').trim() || null, body.departmentId || null, employmentStatus, startedAt, endedAt, String(body.notes || '').trim() || null]);
          await tx.execute(`INSERT INTO ${ATTENDANCE_IDENTIFIER} ("id","code","personId","personType","createdById") VALUES ($1,$2,$3,'STAFF',$4)`, [crypto.randomUUID(), newCardCode('staff'), id, request?.principal?.userId || null]);
        });
        context.events.publish('wattanam.academic-management.officer.created.v1', { officerId: id, userId, employmentStatus });
        return context.database.query(`${officerSelect} WHERE o."id" = $1::uuid LIMIT 1`, [id]).then(decorateOfficerRows).then((items) => items[0]);
      },
    });
    const defaultCardTemplates = {
      student: { schoolName: 'Wattanam School', cardTitle: 'Student Identification Card', logoUrl: '', cardSize: 'cr80-portrait', designPreset: 'classic-orange', primaryColor: '#ea580c', accentColor: '#f97316', footerText: 'Scan QR code for attendance', extraInfo: '', showPhone: true, showEmail: false, showAddress: true, showDateOfBirth: true },
      staff: { schoolName: 'Wattanam School', cardTitle: 'Office Employee ID Card', logoUrl: '', cardSize: 'cr80-portrait', designPreset: 'staff-geometric-mint', primaryColor: '#164e3f', accentColor: '#3b9478', footerText: 'Official staff attendance card', extraInfo: '', showPhone: true, showEmail: true, showAddress: false, showDateOfBirth: false },
    };
    const cardTemplate = (type, value = {}) => {
      if (!defaultCardTemplates[type]) throw new Error('Card template type must be student or staff');
      const text = (key, limit) => String(value[key] === undefined ? defaultCardTemplates[type][key] : value[key]).trim().slice(0, limit);
      const color = (key) => /^#[0-9a-f]{6}$/i.test(String(value[key] || '')) ? String(value[key]) : defaultCardTemplates[type][key];
      const requestedLogo = String(value.logoUrl || '').trim();
      const logoUrl = (/^https:\/\//i.test(requestedLogo) || /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(requestedLogo)) && requestedLogo.length <= 1000000 ? requestedLogo : '';
      const cardSize = ['cr80-portrait','cr80-landscape'].includes(value.cardSize) ? value.cardSize : defaultCardTemplates[type].cardSize;
      const designPreset = /^[a-z0-9-]{1,40}$/.test(String(value.designPreset || '')) ? String(value.designPreset) : defaultCardTemplates[type].designPreset;
      return { schoolName: text('schoolName', 100), cardTitle: text('cardTitle', 100), logoUrl, cardSize, designPreset, primaryColor: color('primaryColor'), accentColor: color('accentColor'), footerText: text('footerText', 160), extraInfo: text('extraInfo', 500), ...Object.fromEntries(['showPhone','showEmail','showAddress','showDateOfBirth'].map((key) => [key, value[key] === undefined ? defaultCardTemplates[type][key] : value[key] === true])) };
    };
    context.routes.register({ method: 'GET', path: 'id-cards/templates/:type', permission: 'wattanam.academic-management.manage', handler: async (request) => { const type = String(request?.params?.type || '').toLowerCase(); return cardTemplate(type, await context.settings.get(`id-card-template-${type}`, defaultCardTemplates[type])); } });
    context.routes.register({ method: 'PUT', path: 'id-cards/templates/:type', permission: 'wattanam.academic-management.manage', handler: async (request) => { await requireAdministrativePrincipal(request); const type = String(request?.params?.type || '').toLowerCase(); const template = cardTemplate(type, request?.body || {}); await context.settings.set(`id-card-template-${type}`, template); return template; } });
    context.routes.register({
      method: 'GET', path: 'id-cards/staff', permission: 'wattanam.academic-management.manage',
      handler: async () => {
        const missing = await context.database.query(`SELECT o."id", ai."id" AS "identifierId" FROM ${OFFICER} o LEFT JOIN ${ATTENDANCE_IDENTIFIER} ai ON ai."personId"=o."id"::text AND ai."personType"='STAFF' AND ai."active"=TRUE WHERE o."employmentStatus"='ACTIVE' AND (ai."id" IS NULL OR NULLIF(BTRIM(ai."code"),'') IS NULL)`);
        if (missing.length) await context.database.transaction(async (tx) => {
          for (const officer of missing) {
            if (officer.identifierId) await tx.execute(`UPDATE ${ATTENDANCE_IDENTIFIER} SET "code"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2`, [newCardCode('staff'), officer.identifierId]);
            else await tx.execute(`INSERT INTO ${ATTENDANCE_IDENTIFIER} ("id","code","personId","personType") VALUES ($1,$2,$3,'STAFF')`, [crypto.randomUUID(), newCardCode('staff'), officer.id]);
          }
        });
        const cardSelect = officerSelect.replace(' FROM ', ', ai."code" AS "qrCode" FROM ');
        const rows = await context.database.query(`${cardSelect} LEFT JOIN ${ATTENDANCE_IDENTIFIER} ai ON ai."personId"=o."id"::text AND ai."personType"='STAFF' AND ai."active"=TRUE WHERE o."employmentStatus"='ACTIVE' ORDER BY o."createdAt" DESC`);
        return decorateOfficerRows(rows);
      },
    });
    context.routes.register({
      method: 'POST', path: 'id-cards/classes/:id/ensure', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const classId = String(request?.params?.id || '');
        const missing = await context.database.query(`SELECT s."id" FROM ${STUDENT_PROFILE} s JOIN ${ENROLLMENT} e ON e."studentId"=s."id" AND e."validTo" IS NULL WHERE e."classId"=$1 AND NULLIF(BTRIM(s."qrCode"),'') IS NULL`, [classId]);
        if (missing.length) await context.database.transaction(async (tx) => {
          for (const student of missing) await tx.execute(`UPDATE ${STUDENT_PROFILE} SET "qrCode"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2 AND NULLIF(BTRIM("qrCode"),'') IS NULL`, [newCardCode('stu'), student.id]);
        });
        return { classId, generated: missing.length };
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'officers/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        await requireAdministrativePrincipal(request);
        const id = request?.params?.id;
        const body = request?.body || {};
        const existing = await context.database.query(`${officerSelect} WHERE o."id" = $1::uuid LIMIT 1`, [id]);
        if (!existing.length) throw new Error('Officer profile not found');
        const employmentStatus = String(body.employmentStatus || existing[0].employmentStatus).toUpperCase();
        if (!OFFICER_EMPLOYMENT_STATUSES.includes(employmentStatus)) throw new Error('Invalid employment status');
        const startedAt = body.startedAt ? requireDate(body.startedAt, 'startedAt') : existing[0].startedAt;
        const endedAt = body.endedAt ? requireDate(body.endedAt, 'endedAt') : (body.endedAt === null ? null : existing[0].endedAt);
        if (startedAt && endedAt && String(endedAt).slice(0, 10) < String(startedAt).slice(0, 10)) throw new Error('endedAt must be on or after startedAt');
        await context.database.execute(`UPDATE ${OFFICER} SET "employeeNumber"=$2, "position"=$3, "departmentId"=$4::uuid, "employmentStatus"=$5, "startedAt"=$6::date, "endedAt"=$7::date, "notes"=$8, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [id, body.employeeNumber === undefined ? existing[0].employeeNumber : (String(body.employeeNumber || '').trim() || null), body.position === undefined ? existing[0].position : (String(body.position || '').trim() || null), body.departmentId === undefined ? existing[0].departmentId : (body.departmentId || null), employmentStatus, startedAt, endedAt, body.notes === undefined ? existing[0].notes : (String(body.notes || '').trim() || null)]);
        context.events.publish('wattanam.academic-management.officer.updated.v1', { officerId: id, employmentStatus });
        return context.database.query(`${officerSelect} WHERE o."id" = $1::uuid LIMIT 1`, [id]).then(decorateOfficerRows).then((items) => items[0]);
      },
    });
    const attendanceRows = async (date) => {
      const rows = await context.database.query(`SELECT a."id", a."officerId", a."attendanceDate", a."status", a."checkInAt", a."checkOutAt", a."note", a."recordedBy", a."correctedBy", a."correctedAt", a."createdAt", a."updatedAt", o."userId", o."employeeNumber", o."position", o."departmentId", o."employmentStatus" FROM ${OFFICER_ATTENDANCE} a JOIN ${OFFICER} o ON o."id" = a."officerId" WHERE a."attendanceDate" = $1::date ORDER BY a."createdAt" DESC`, [date]);
      return decorateOfficerRows(rows);
    };
    context.routes.register({
      method: 'GET', path: 'attendance', permission: 'wattanam.academic-management.attendance',
      handler: (request) => attendanceRows(requireDate(request?.query?.date || new Date().toISOString().slice(0, 10), 'date')),
    });
    context.routes.register({
      method: 'POST', path: 'attendance', permission: 'wattanam.academic-management.attendance',
      handler: async (request) => {
        const principal = request?.principal || {};
        if (!principal.userId) throw new Error('Authenticated principal is required');
        const body = request?.body || {};
        const officerId = String(body.officerId || '').trim();
        const attendanceDate = requireDate(body.attendanceDate || new Date().toISOString().slice(0, 10), 'attendanceDate');
        const status = String(body.status || '').toUpperCase();
        if (!ATTENDANCE_STATUSES.includes(status)) throw new Error('Invalid attendance status');
        const officer = await context.database.query(`SELECT "id" FROM ${OFFICER} WHERE "id" = $1::uuid AND "employmentStatus" = 'ACTIVE' LIMIT 1`, [officerId]);
        if (!officer.length) throw new Error('Active officer profile not found');
        const checkInAt = body.checkInAt ? new Date(body.checkInAt) : null;
        const checkOutAt = body.checkOutAt ? new Date(body.checkOutAt) : null;
        if (checkInAt && Number.isNaN(checkInAt.getTime())) throw new Error('checkInAt must be a valid date and time');
        if (checkOutAt && Number.isNaN(checkOutAt.getTime())) throw new Error('checkOutAt must be a valid date and time');
        if (checkInAt && checkOutAt && checkOutAt < checkInAt) throw new Error('checkOutAt must be on or after checkInAt');
        const existing = await context.database.query(`SELECT "id" FROM ${OFFICER_ATTENDANCE} WHERE "officerId"=$1::uuid AND "attendanceDate"=$2::date LIMIT 1`, [officerId, attendanceDate]);
        const id = existing[0]?.id || crypto.randomUUID();
        await context.database.execute(`INSERT INTO ${OFFICER_ATTENDANCE} ("id", "officerId", "attendanceDate", "status", "checkInAt", "checkOutAt", "note", "recordedBy") VALUES ($1::uuid,$2::uuid,$3::date,$4,$5::timestamptz,$6::timestamptz,$7,$8::uuid) ON CONFLICT ("officerId", "attendanceDate") DO UPDATE SET "status"=EXCLUDED."status", "checkInAt"=EXCLUDED."checkInAt", "checkOutAt"=EXCLUDED."checkOutAt", "note"=EXCLUDED."note", "correctedBy"=EXCLUDED."recordedBy", "correctedAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP`, [id, officerId, attendanceDate, status, checkInAt?.toISOString() || null, checkOutAt?.toISOString() || null, String(body.note || '').trim() || null, principal.userId]);
        context.events.publish(existing.length ? 'wattanam.academic-management.attendance.corrected.v1' : 'wattanam.academic-management.attendance.recorded.v1', { attendanceId: id, officerId, attendanceDate, status });
        return attendanceRows(attendanceDate).then((items) => items.find((item) => item.id === id));
      },
    });
    context.routes.register({
      method: 'GET', path: 'attendance/reports', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const today = new Date().toISOString().slice(0, 10);
        const startDate = requireDate(request?.query?.startDate || `${today.slice(0, 8)}01`, 'startDate');
        const endDate = requireDate(request?.query?.endDate || today, 'endDate');
        if (endDate < startDate) throw new Error('endDate must be on or after startDate');
        const rows = await context.database.query(`SELECT o."id" AS "officerId", o."userId", o."employeeNumber", o."position", o."departmentId", o."employmentStatus", COUNT(a."id")::int AS "recordedDays", COUNT(a."id") FILTER (WHERE a."status"='PRESENT')::int AS "presentDays", COUNT(a."id") FILTER (WHERE a."status"='ABSENT')::int AS "absentDays", COUNT(a."id") FILTER (WHERE a."status"='LATE')::int AS "lateDays", COUNT(a."id") FILTER (WHERE a."status"='LEAVE')::int AS "leaveDays", COUNT(a."id") FILTER (WHERE a."status"='EXCUSED')::int AS "excusedDays" FROM ${OFFICER} o LEFT JOIN ${OFFICER_ATTENDANCE} a ON a."officerId"=o."id" AND a."attendanceDate" BETWEEN $1::date AND $2::date GROUP BY o."id" ORDER BY o."createdAt" DESC`, [startDate, endDate]);
        const decorated = await decorateOfficerRows(rows);
        return decorated.map((row) => ({ ...row, startDate, endDate, attendanceRate: row.recordedDays ? Math.round(((row.presentDays + row.lateDays) / row.recordedDays) * 10000) / 100 : 0 }));
      },
    });
    context.routes.register({
      method: 'POST', path: 'admissions/public/submit', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const body = request?.body || {};
        const email = String(body.email || '').trim().toLowerCase();
        const nameKh = String(body.nameKh || '').trim();
        const nameEn = String(body.nameEn || '').trim();
        const phone = String(body.phone || '').trim();
        const password = body.password || '';
        const sex = String(body.sex || '').trim();
        const dateOfBirth = String(body.dateOfBirth || '').trim();
        const address = String(body.address || '').trim();
        const generation = String(body.generation || '').trim();

        if (!body.classId) throw new Error('classId is required');
        if (!nameEn) throw new Error('English name is required');
        if (email && !isValidEmail(email)) throw new Error('Invalid email address');

        const settings = await getSettings();
        if (settings.passwordMode === 'REQUIRED' && password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        if (settings.passwordMode !== 'REQUIRED' && password && password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        if (settings.khmerNameMode === 'REQUIRED' && !nameKh) throw new Error('Khmer name is required');
        if (settings.emailMode === 'REQUIRED' && !email) throw new Error('Email is required');
        if (settings.phoneMode === 'REQUIRED' && !phone) throw new Error('Phone number is required');
        if (!email && !phone) throw new Error('Email or phone number is required');
        if (settings.photoMode === 'REQUIRED' && !body.photo) throw new Error('Photo is required');
        if (settings.sexMode === 'REQUIRED' && !sex) throw new Error('Sex is required');
        if (settings.dateOfBirthMode === 'REQUIRED' && !dateOfBirth) throw new Error('Date of birth is required');
        if (settings.addressMode === 'REQUIRED' && !address) throw new Error('Address is required');
        if (settings.generationMode === 'REQUIRED' && !generation) throw new Error('Generation is required');

        const enabledFields = await getEnabledFields();
        const customFieldValues = {};
        const submitted = body.customFieldValues || {};
        for (const f of enabledFields) {
          const options = Array.isArray(f.options) ? f.options : [];
          if (f.fieldType === 'MULTI_SELECT') {
            const raw = submitted[f.key];
            const arr = Array.from(new Set((Array.isArray(raw) ? raw : []).map((s) => String(s).trim()).filter(Boolean)));
            if (f.required && arr.length === 0) throw new Error(`${f.label} is required`);
            for (const v of arr) {
              if (!options.includes(v)) throw new Error(`${f.label} must be one of the listed options`);
            }
            if (arr.length) customFieldValues[f.key] = arr;
            continue;
          }
          const v = String(submitted[f.key] ?? '').trim();
          if (f.required && !v) throw new Error(`${f.label} is required`);
          if (v && f.fieldType === 'SELECT' && !options.includes(v)) {
            throw new Error(`${f.label} must be one of the listed options`);
          }
          if (v) customFieldValues[f.key] = v;
        }

        const classRows = await context.database.query(
          `SELECT "id", "name", "registrationStatus" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`,
          [body.classId],
        );
        const cls = classRows[0];
        if (!cls) throw new Error('Class not found');
        if (cls.registrationStatus !== 'AVAILABLE') throw new Error('Registration is not currently open for this class');

        const conditions = ['"classId" = $1', '"status" = \'PENDING\''];
        const params = [body.classId];
        const orClauses = [];
        if (email) { params.push(email); orClauses.push(`"email" = $${params.length}`); }
        if (phone) { params.push(phone); orClauses.push(`"phone" = $${params.length}`); }
        if (orClauses.length) {
          const existingRows = await context.database.query(
            `SELECT * FROM ${REGISTRATION} WHERE ${conditions.join(' AND ')} AND (${orClauses.join(' OR ')}) LIMIT 1`,
            params,
          );
          if (existingRows.length) return existingRows[0];
        }

        const autoGenerated = !password ? generatePassword() : null;
        const finalPassword = password || autoGenerated;
        const passwordHash = await context.crypto.hashBcrypt(finalPassword, 12);
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await context.database.execute(
          `INSERT INTO ${REGISTRATION} ("id", "classId", "nameKh", "nameEn", "email", "phone", "passwordHash", "generatedPassword", "photo", "sex", "dateOfBirth", "address", "generation", "customFieldValues", "status", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'PENDING', $15)`,
          [
            id,
            body.classId,
            settings.khmerNameMode === 'HIDDEN' ? null : (nameKh || null),
            nameEn,
            settings.emailMode === 'HIDDEN' ? null : (email || null),
            settings.phoneMode === 'HIDDEN' ? null : (phone || null),
            passwordHash,
            autoGenerated || null,
            settings.photoMode === 'HIDDEN' ? null : (body.photo || null),
            settings.sexMode === 'HIDDEN' ? null : (sex || null),
            settings.dateOfBirthMode === 'HIDDEN' ? null : (dateOfBirth ? new Date(dateOfBirth).toISOString() : null),
            settings.addressMode === 'HIDDEN' ? null : (address || null),
            settings.generationMode === 'HIDDEN' ? null : (generation || null),
            Object.keys(customFieldValues).length ? JSON.stringify(customFieldValues) : null,
            now,
          ],
        );

        try {
          const admins = await context.directory.resolveAudience({ audience: 'ROLE', targetRole: 'ADMIN' });
          if (admins.length) {
            await Promise.all(admins.map((a) => context.notifications.notifyInApp(a.id, `${nameEn} requested to register for class ${cls.name}`, 'class_registration_request')));
          }
        } catch {}

        return context.database.query(`SELECT * FROM ${REGISTRATION} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'GET', path: 'session-settings', permission: 'wattanam.academic-management.attendance.view',
      handler: async () => context.settings.get('attendance-session-settings', {
        classFormat: 'CUSTOM', classFormatRules: false, staffFormatRules: false,
        staffWorkingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      }),
    });
    context.routes.register({
      method: 'PUT', path: 'session-settings', permission: 'wattanam.academic-management.attendance.configure',
      handler: async (request) => {
        const body = request?.body || {};
        const classFormat = String(body.classFormat || 'CUSTOM').toUpperCase();
        if (!['FULL', 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'CUSTOM'].includes(classFormat)) throw new Error('Invalid class attendance format');
        const staffWorkingDays = [...new Set((Array.isArray(body.staffWorkingDays) ? body.staffWorkingDays : []).map((day) => String(day).toUpperCase()))];
        if (staffWorkingDays.some((day) => !['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].includes(day))) throw new Error('Invalid staff working day');
        const settings = { classFormat, classFormatRules: body.classFormatRules === true, staffFormatRules: body.staffFormatRules === true, staffWorkingDays };
        await context.settings.set('attendance-session-settings', settings);
        return settings;
      },
    });
    const academicAttendanceContext = attendanceContext(context);
    await attendanceRuntime.activate(academicAttendanceContext);
    registerSelfAttendance(context);
    registerStaffAttendance(context);
    // Authoritative student reports must resolve rosters from this plugin's
    // enrollment tables. The lean customer-school core intentionally does not
    // expose the legacy academic Prisma models through its directory provider.
    registerAuthoritativeReports(academicAttendanceContext);
  },
};
