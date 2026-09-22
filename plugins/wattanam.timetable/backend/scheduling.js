'use strict';

const { randomUUID, randomBytes } = require('crypto');
const PREFIX = 'plugin_wattanam_timetable_';
const DOCUMENT = `${PREFIX}document`;

const resources = {
  subjects: { table: `${PREFIX}subject`, fields: { name: 'text', short: 'text', color: 'optional', picture: 'optional', classroomCount: 'positive', customFields: 'json' }, required: ['name', 'short'] },
  classes: { table: `${PREFIX}class`, fields: { name: 'text', short: 'text', color: 'optional', picture: 'optional', printSubjectPicture: 'boolean', customFields: 'json' }, required: ['name', 'short'] },
  classrooms: { table: `${PREFIX}classroom`, fields: { name: 'text', short: 'text', color: 'optional', picture: 'optional', customFields: 'json' }, required: ['name', 'short'] },
  teachers: { table: `${PREFIX}teacher`, fields: { firstName: 'text', lastName: 'text', khmerName: 'optional', short: 'text', sex: 'optional', email: 'optional', phone: 'optional', photo: 'optional', color: 'optional', classTeacherId: 'optional' }, required: ['firstName', 'lastName', 'short'] },
  lessons: { table: `${PREFIX}lesson`, fields: { teacherId: 'text', subjectId: 'text', classId: 'text', perWeek: 'positive', lessonType: 'lessonType' }, required: ['teacherId', 'subjectId', 'classId', 'perWeek'] },
  entries: { table: `${PREFIX}entry`, fields: { lessonId: 'optional', classId: 'text', teacherId: 'text', subjectId: 'text', classroomId: 'optional', day: 'day', period: 'period' }, required: ['classId', 'teacherId', 'subjectId', 'day', 'period'] },
};

function clean(value, kind, name) {
  if (kind === 'json') return value == null ? null : JSON.stringify(value);
  if (kind === 'boolean') return value === true;
  if (kind === 'positive' || kind === 'day' || kind === 'period') {
    const number = Number(value);
    const maximum = kind === 'day' ? 7 : kind === 'period' ? 24 : 168;
    if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error(`${name} must be between 1 and ${maximum}`);
    return number;
  }
  if (kind === 'lessonType') {
    if (!['SINGLE', 'DOUBLE', 'TRIPLE'].includes(value)) throw new Error('lessonType is invalid');
    return value;
  }
  if (value == null || value === '') {
    if (kind === 'optional') return null;
    throw new Error(`${name} is required`);
  }
  if (typeof value !== 'string' || value.length > 500) throw new Error(`${name} must be a string of at most 500 characters`);
  return value.trim();
}

function id(value, label = 'id') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

async function belongs(db, table, rowId, timetableId, label) {
  const rows = await db.query(`SELECT "id" FROM ${table} WHERE "id"=$1 AND "timetableId"=$2`, [id(rowId, label), timetableId]);
  if (!rows.length) throw new Error(`${label} does not belong to this timetable`);
}

async function validateReferences(db, resource, values, timetableId) {
  if (resource === 'teachers' && values.classTeacherId) await belongs(db, resources.classes.table, values.classTeacherId, timetableId, 'classTeacherId');
  if (resource === 'lessons' || resource === 'entries') {
    for (const [field, target] of [['teacherId', 'teachers'], ['subjectId', 'subjects'], ['classId', 'classes']]) {
      if (values[field]) await belongs(db, resources[target].table, values[field], timetableId, field);
    }
  }
  if (resource === 'entries') {
    if (values.classroomId) await belongs(db, resources.classrooms.table, values.classroomId, timetableId, 'classroomId');
    if (values.lessonId) {
      const lesson = await db.query(`SELECT "teacherId","subjectId","classId" FROM ${resources.lessons.table} WHERE "id"=$1 AND "timetableId"=$2`, [id(values.lessonId, 'lessonId'), timetableId]);
      if (!lesson.length) throw new Error('lessonId does not belong to this timetable');
      for (const field of ['teacherId', 'subjectId', 'classId']) if (values[field] && values[field] !== lesson[0][field]) throw new Error(`Entry ${field} conflicts with its lesson`);
    }
  }
}

function registerScheduling(context) {
  const db = context.database;
  const view = 'wattanam.timetable.view';
  const manage = 'wattanam.timetable.manage';
  for (const [resource, definition] of Object.entries(resources)) {
    const table = definition.table;
    context.routes.register({ method: 'GET', path: resource, permission: view, handler: (request) => {
      const timetableId = request?.query?.timetableId;
      return timetableId
        ? db.query(`SELECT * FROM ${table} WHERE "timetableId"=$1 ORDER BY "createdAt" ASC LIMIT 1000`, [id(timetableId, 'timetableId')])
        : db.query(`SELECT * FROM ${table} ORDER BY "createdAt" ASC LIMIT 1000`);
    }});
    context.routes.register({ method: 'POST', path: resource, permission: manage, handler: async (request) => {
      const body = request?.body || {};
      const timetableId = id(body.timetableId, 'timetableId');
      const document = await db.query(`SELECT "status" FROM ${DOCUMENT} WHERE "id"=$1`, [timetableId]);
      if (!document.length) throw new Error('Timetable not found');
      if (document[0].status === 'PUBLISHED') throw new Error('Unpublish the timetable before editing it');
      const values = {};
      for (const field of definition.required) values[field] = clean(body[field], definition.fields[field], field);
      for (const [field, kind] of Object.entries(definition.fields)) if (body[field] !== undefined && !(field in values)) values[field] = clean(body[field], kind, field);
      await validateReferences(db, resource, values, timetableId);
      if (resource === 'entries') {
        const timetable = await db.query(`SELECT "numberOfDays","periodsPerDay","weekend" FROM ${DOCUMENT} WHERE "id"=$1`, [timetableId]);
        const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
        const teachingDays = weekdays.map((name, index) => ({ name, day: index + 1 })).filter(({ name }) => !(timetable[0].weekend || []).includes(name)).slice(0, timetable[0].numberOfDays).map(({ day }) => day);
        if (!teachingDays.includes(values.day) || values.period > timetable[0].periodsPerDay) throw new Error('Entry day or period exceeds timetable limits');
      }
      const rowId = randomUUID();
      if (resource === 'teachers') values.qrCode = randomBytes(16).toString('hex');
      const columns = ['id', 'timetableId', ...Object.keys(values)];
      const params = [rowId, timetableId, ...Object.values(values)];
      await db.execute(`INSERT INTO ${table} (${columns.map((field) => `"${field}"`).join(',')}) VALUES (${columns.map((_, index) => `$${index + 1}${values.customFields !== undefined && columns[index] === 'customFields' ? '::jsonb' : ''}`).join(',')})`, params);
      const rows = await db.query(`SELECT * FROM ${table} WHERE "id"=$1`, [rowId]);
      return rows[0];
    }});
    context.routes.register({ method: 'PUT', path: `${resource}/:id`, permission: manage, handler: async (request) => {
      const rowId = id(request?.params?.id);
      const existing = await db.query(`SELECT "timetableId" FROM ${table} WHERE "id"=$1`, [rowId]);
      if (!existing.length) throw new Error(`${resource} record not found`);
      const timetableId = existing[0].timetableId;
      const document = await db.query(`SELECT "status" FROM ${DOCUMENT} WHERE "id"=$1`, [timetableId]);
      if (document[0]?.status === 'PUBLISHED') throw new Error('Unpublish the timetable before editing it');
      const body = request?.body || {};
      const values = {};
      for (const [field, kind] of Object.entries(definition.fields)) if (body[field] !== undefined) values[field] = clean(body[field], kind, field);
      if (!Object.keys(values).length) throw new Error('No editable fields supplied');
      await validateReferences(db, resource, values, timetableId);
      const fields = Object.keys(values);
      await db.execute(`UPDATE ${table} SET ${fields.map((field, index) => `"${field}"=$${index + 2}${field === 'customFields' ? '::jsonb' : ''}`).join(',')},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [rowId, ...Object.values(values)]);
      const rows = await db.query(`SELECT * FROM ${table} WHERE "id"=$1`, [rowId]);
      return rows[0];
    }});
    context.routes.register({ method: 'DELETE', path: `${resource}/:id`, permission: manage, handler: async (request) => {
      const rowId = id(request?.params?.id);
      const existing = await db.query(`SELECT "timetableId" FROM ${table} WHERE "id"=$1`, [rowId]);
      if (!existing.length) throw new Error(`${resource} record not found`);
      const document = await db.query(`SELECT "status" FROM ${DOCUMENT} WHERE "id"=$1`, [existing[0].timetableId]);
      if (document[0]?.status === 'PUBLISHED') throw new Error('Unpublish the timetable before editing it');
      await db.execute(`DELETE FROM ${table} WHERE "id"=$1`, [rowId]);
      return { deleted: true, id: rowId };
    }});
  }
}

module.exports = { registerScheduling, resources };
