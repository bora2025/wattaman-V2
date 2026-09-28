'use strict';

const { randomUUID } = require('crypto');
const { registerScheduling, resources } = require('./scheduling');
const { registerGenerator } = require('./generator');
const { registerTeacherAttendance } = require('./teacher-attendance');
const TABLE = 'plugin_wattanam_timetable_document';

function text(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${name} is required (maximum ${max} characters)`);
  return value.trim();
}
function optional(value, max = 200) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw new Error(`Value exceeds ${max} characters`);
  return value.trim();
}
function integer(value, name, min, max, fallback) {
  const result = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return result;
}
function json(value, name) {
  if (value == null || value === '') return null;
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = value; }
  }
  return JSON.stringify(parsed);
}

function serializeDocument(document) {
  const serialized = { ...document };
  for (const field of ['periodTimes', 'timeOffRules', 'distribution', 'homeworkPrep']) {
    serialized[field] = document[field] == null ? null : JSON.stringify(document[field]);
  }
  return serialized;
}

function hydrateTimetable(document, loaded) {
  const byId = (rows) => new Map(rows.map((row) => [row.id, row]));
  const subjects = loaded.subjects || [];
  const classes = loaded.classes || [];
  const classrooms = loaded.classrooms || [];
  const teachers = loaded.teachers || [];
  const lessons = loaded.lessons || [];
  const entries = loaded.entries || [];
  const subjectById = byId(subjects); const classById = byId(classes);
  const classroomById = byId(classrooms); const teacherById = byId(teachers);
  return {
    ...serializeDocument(document),
    subjects, classes: classes.map((row) => ({ ...row, classTeachers: teachers.filter((teacher) => teacher.classTeacherId === row.id) })), classrooms,
    teachers: teachers.map((row) => ({ ...row, classTeacher: row.classTeacherId ? classById.get(row.classTeacherId) || null : null })),
    lessons: lessons.map((row) => ({ ...row, teacher: teacherById.get(row.teacherId), subject: subjectById.get(row.subjectId), class: classById.get(row.classId) })),
    entries: entries.map((row) => ({ ...row, teacher: teacherById.get(row.teacherId), subject: subjectById.get(row.subjectId), class: classById.get(row.classId), classroom: row.classroomId ? classroomById.get(row.classroomId) || null : null })),
  };
}

module.exports = {
  id: 'wattanam.timetable',
  health() { return { status: 'ready' }; },
  async activate(context) {
    context.permissions.register([
      { id: 'wattanam.timetable.view', label: 'View timetables' },
      { id: 'wattanam.timetable.manage', label: 'Manage timetables and schedules' },
      { id: 'wattanam.timetable.attendance.view', label: 'View teacher lesson attendance' },
      { id: 'wattanam.timetable.attendance.manage', label: 'Record teacher lesson attendance' },
    ]);
    context.navigation.register([
      { id: 'timetables', label: 'Timetable', href: '/plugins/wattanam.timetable/timetables', permission: 'wattanam.timetable.view', dashboard: { title: 'Timetable', description: 'Build schedules, manage rooms, and track teacher lesson attendance.', priority: 120 } },
      { id: 'subjects', label: 'Timetable Subjects', href: '/plugins/wattanam.timetable/subjects', permission: 'wattanam.timetable.view' },
      { id: 'classes', label: 'Timetable Classes', href: '/plugins/wattanam.timetable/classes', permission: 'wattanam.timetable.view' },
      { id: 'classrooms', label: 'Classrooms', href: '/plugins/wattanam.timetable/classrooms', permission: 'wattanam.timetable.view' },
      { id: 'teachers', label: 'Timetable Teachers', href: '/plugins/wattanam.timetable/teachers', permission: 'wattanam.timetable.view' },
      { id: 'lessons', label: 'Lessons', href: '/plugins/wattanam.timetable/lessons', permission: 'wattanam.timetable.view' },
      { id: 'entries', label: 'Schedule', href: '/plugins/wattanam.timetable/schedule', permission: 'wattanam.timetable.view' },
      { id: 'teacher-attendance', label: 'Teacher Lesson Attendance', href: '/plugins/wattanam.timetable/teacher-attendance', permission: 'wattanam.timetable.attendance.view' },
      { id: 'scheduled-teachers', label: 'Scheduled Teachers', href: '/plugins/wattanam.timetable/scheduled-teachers', permission: 'wattanam.timetable.attendance.view' },
      { id: 'teacher-scan', label: 'Teacher Scanner', href: '/plugins/wattanam.timetable/teacher-scan', permission: 'wattanam.timetable.attendance.manage' },
    ]);
    context.routes.register({ method: 'GET', path: 'timetables', permission: 'wattanam.timetable.view', handler: () =>
      context.database.query(`SELECT "id","name","short","academicYear","periodsPerDay","numberOfDays","status","createdAt","updatedAt" FROM ${TABLE} ORDER BY "createdAt" DESC LIMIT 500`),
    });
    context.routes.register({ method: 'POST', path: 'timetables', permission: 'wattanam.timetable.manage', handler: async (request) => {
      const body = request?.body || {};
      const id = randomUUID();
      await context.database.execute(
        `INSERT INTO ${TABLE} ("id","name","short","academicYear","periodsPerDay","numberOfDays","weekend","periodTimes","timeOffRules","distribution","homeworkPrep","maxOnDay","docNotes") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13)`,
        [id, text(body.name, 'name'), optional(body.short, 50), text(body.academicYear, 'academicYear', 100), integer(body.periodsPerDay, 'periodsPerDay', 1, 24, 8), integer(body.numberOfDays, 'numberOfDays', 1, 7, 5), json(body.weekend ?? ['SATURDAY', 'SUNDAY'], 'weekend'), json(body.periodTimes, 'periodTimes'), json(body.timeOffRules, 'timeOffRules'), json(body.distribution, 'distribution'), json(body.homeworkPrep, 'homeworkPrep'), body.maxOnDay == null || body.maxOnDay === '' ? null : integer(body.maxOnDay, 'maxOnDay', 1, 24), optional(body.docNotes, 5000)],
      );
      const rows = await context.database.query(`SELECT * FROM ${TABLE} WHERE "id"=$1`, [id]);
      return serializeDocument(rows[0]);
    }});
    context.routes.register({ method: 'GET', path: 'timetables/:id', permission: 'wattanam.timetable.view', handler: async (request) => {
      const timetableId = text(request?.params?.id, 'id', 100);
      const rows = await context.database.query(`SELECT * FROM ${TABLE} WHERE "id"=$1`, [timetableId]);
      if (!rows.length) throw new Error('Timetable not found');
      const loaded = {};
      for (const [name, definition] of Object.entries(resources)) loaded[name] = await context.database.query(`SELECT * FROM ${definition.table} WHERE "timetableId"=$1 ORDER BY "createdAt" ASC LIMIT 1000`, [timetableId]);
      return hydrateTimetable(rows[0], loaded);
    }});
    context.routes.register({ method: 'PUT', path: 'timetables/:id', permission: 'wattanam.timetable.manage', handler: async (request) => {
      const id = text(request?.params?.id, 'id', 100);
      const body = request?.body || {};
      const accepted = {
        name: (v) => text(v, 'name'), short: (v) => optional(v, 50), academicYear: (v) => text(v, 'academicYear', 100),
        periodsPerDay: (v) => integer(v, 'periodsPerDay', 1, 24), numberOfDays: (v) => integer(v, 'numberOfDays', 1, 7),
        weekend: (v) => json(v, 'weekend'), periodTimes: (v) => json(v, 'periodTimes'), timeOffRules: (v) => json(v, 'timeOffRules'),
        distribution: (v) => json(v, 'distribution'), homeworkPrep: (v) => json(v, 'homeworkPrep'),
        maxOnDay: (v) => v == null || v === '' ? null : integer(v, 'maxOnDay', 1, 24), docNotes: (v) => optional(v, 5000),
        status: (v) => { if (!['DRAFT', 'PUBLISHED'].includes(v)) throw new Error('Invalid status'); return v; },
      };
      const fields = Object.keys(accepted).filter((key) => body[key] !== undefined);
      if (!fields.length) throw new Error('No editable fields supplied');
      const values = fields.map((field) => accepted[field](body[field]));
      const jsonFields = new Set(['weekend', 'periodTimes', 'timeOffRules', 'distribution', 'homeworkPrep']);
      const result = await context.database.execute(`UPDATE ${TABLE} SET ${fields.map((field, index) => `"${field}"=$${index + 2}${jsonFields.has(field) ? '::jsonb' : ''}`).join(',')},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [id, ...values]);
      if (!result.count) throw new Error('Timetable not found');
      const rows = await context.database.query(`SELECT * FROM ${TABLE} WHERE "id"=$1`, [id]);
      return serializeDocument(rows[0]);
    }});
    context.routes.register({ method: 'DELETE', path: 'timetables/:id', permission: 'wattanam.timetable.manage', handler: async (request) => {
      const id = text(request?.params?.id, 'id', 100);
      const rows = await context.database.query(`SELECT "status" FROM ${TABLE} WHERE "id"=$1`, [id]);
      if (!rows.length) throw new Error('Timetable not found');
      if (rows[0].status === 'PUBLISHED') throw new Error('Unpublish the timetable before deletion');
      await context.database.execute(`DELETE FROM ${TABLE} WHERE "id"=$1`, [id]);
      return { deleted: true, id };
    }});
    registerScheduling(context);
    registerGenerator(context);
    registerTeacherAttendance(context);
  },
};
