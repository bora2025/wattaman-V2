'use strict';

const crypto = require('crypto');

const YEAR = 'plugin_wattanam_attendance_manager_study_year';
const RECORD = 'plugin_wattanam_attendance_manager_record';
const IDENTIFIER = 'plugin_wattanam_attendance_manager_identifier';
const SESSION = 'plugin_wattanam_attendance_manager_session';
const HOLIDAY = 'plugin_wattanam_attendance_manager_holiday';

const PERSON_TYPES = ['STUDENT', 'TEACHER', 'STAFF'];
const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'PERMISSION'];

function one(value) { return Array.isArray(value) ? value[0] : value; }
function required(value, name) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`); return value.trim(); }
function choice(value, values, name) { const result = required(value, name).toUpperCase(); if (!values.includes(result)) throw new Error(`${name} is invalid`); return result; }
function date(value) { const result = value ? new Date(value) : new Date(); if (Number.isNaN(result.getTime())) throw new Error('date is invalid'); return result.toISOString().slice(0, 10); }

module.exports = {
  id: 'wattanam.attendance-manager',
  async activate(context) {
    context.logger.log('Wattanam Attendance Manager activated');
    context.permissions.register([
      { id: 'wattanam.attendance-manager.view', label: 'View attendance and reports' },
      { id: 'wattanam.attendance-manager.scan', label: 'Scan student, teacher, and staff attendance' },
      { id: 'wattanam.attendance-manager.manage', label: 'Correct attendance and manage attendance settings' },
      { id: 'wattanam.attendance-manager.export', label: 'Export and print attendance reports' },
    ]);
    context.navigation.register([
      { id: 'attendance', label: 'Attendance', href: '/plugins/wattanam.attendance-manager/attendance', permission: 'wattanam.attendance-manager.view' },
      { id: 'scanner', label: 'Attendance Scanner', href: '/plugins/wattanam.attendance-manager/scanner', permission: 'wattanam.attendance-manager.scan' },
      { id: 'reports', label: 'Attendance Reports', href: '/plugins/wattanam.attendance-manager/reports', permission: 'wattanam.attendance-manager.view' },
      { id: 'study-years', label: 'Study Years', href: '/plugins/wattanam.attendance-manager/study-years', permission: 'wattanam.attendance-manager.manage' },
      { id: 'settings', label: 'Attendance Settings', href: '/plugins/wattanam.attendance-manager/settings', permission: 'wattanam.attendance-manager.manage' },
    ]);

    context.routes.register({ method: 'GET', path: 'records', permission: 'wattanam.attendance-manager.view', handler: (request) => {
      const query = request?.query || {}; const params = []; const conditions = [];
      for (const [field, column] of [['personType', 'personType'], ['personId', 'personId'], ['classId', 'classId'], ['date', 'date']]) {
        const value = one(query[field]); if (value) { params.push(String(value)); conditions.push(`"${column}" = $${params.length}${field === 'date' ? '::date' : ''}`); }
      }
      return context.database.query(`SELECT * FROM ${RECORD} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY "date" DESC, "createdAt" DESC LIMIT 500`, params);
    }});

    const saveRecord = async (request, scanMode) => {
      const body = request?.body || {};
      const personId = required(body.personId, 'personId');
      const personType = choice(body.personType, PERSON_TYPES, 'personType');
      const status = choice(body.status || 'PRESENT', STATUSES, 'status');
      const attendanceDate = date(body.date);
      const session = Number(body.session || 1);
      if (!Number.isInteger(session) || session < 1 || session > 4) throw new Error('session must be 1 through 4');
      const markedById = required(request?.principal?.userId, 'authenticated principal');
      const classId = body.classId ? String(body.classId) : '';
      const id = crypto.randomUUID();
      const rows = await context.database.query(
        `INSERT INTO ${RECORD} ("id","personId","personType","classId","studyYearId","date","session","status","permissionType","checkInTime","markedById","scanMode","scanLatitude","scanLongitude","scanLocation") VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT ("personType","personId","classId","date","session") DO UPDATE SET "status"=EXCLUDED."status", "permissionType"=EXCLUDED."permissionType", "checkInTime"=EXCLUDED."checkInTime", "markedById"=EXCLUDED."markedById", "scanMode"=EXCLUDED."scanMode", "scanLatitude"=EXCLUDED."scanLatitude", "scanLongitude"=EXCLUDED."scanLongitude", "scanLocation"=EXCLUDED."scanLocation", "updatedAt"=CURRENT_TIMESTAMP RETURNING *`,
        [id, personId, personType, classId, body.studyYearId || null, attendanceDate, session, status, body.permissionType || null, body.checkInTime || new Date().toISOString(), markedById, scanMode, body.latitude ?? null, body.longitude ?? null, body.location || null],
      );
      context.events.publish('attendance.recorded.v1', { record: rows[0], principal: request.principal });
      return rows[0];
    };
    context.routes.register({ method: 'POST', path: 'records', permission: 'wattanam.attendance-manager.manage', handler: (request) => saveRecord(request, 'MANUAL') });
    context.routes.register({ method: 'POST', path: 'scan', permission: 'wattanam.attendance-manager.scan', handler: async (request) => {
      const body = request?.body || {}; const code = required(body.code, 'code');
      const aliases = await context.database.query(`SELECT "personId", "personType" FROM ${IDENTIFIER} WHERE "code"=$1 AND "active"=TRUE LIMIT 1`, [code]);
      if (!aliases.length) throw new Error('Attendance identifier not found');
      request.body = { ...body, ...aliases[0], status: body.status || 'PRESENT' };
      return saveRecord(request, String(body.mode || 'CAMERA').toUpperCase() === 'USB' ? 'USB' : 'CAMERA');
    }});

    context.routes.register({ method: 'GET', path: 'reports/summary', permission: 'wattanam.attendance-manager.view', handler: (request) => {
      const query = request?.query || {}; const params = []; const conditions = [];
      if (one(query.startDate)) { params.push(String(one(query.startDate))); conditions.push(`"date" >= $${params.length}::date`); }
      if (one(query.endDate)) { params.push(String(one(query.endDate))); conditions.push(`"date" <= $${params.length}::date`); }
      if (one(query.personType)) { params.push(choice(one(query.personType), PERSON_TYPES, 'personType')); conditions.push(`"personType" = $${params.length}`); }
      return context.database.query(`SELECT "personType", "status", COUNT(*)::int AS "count" FROM ${RECORD} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} GROUP BY "personType", "status" ORDER BY "personType", "status"`, params);
    }});

    context.routes.register({ method: 'GET', path: 'study-years', permission: 'wattanam.attendance-manager.view', handler: () => context.database.query(`SELECT * FROM ${YEAR} ORDER BY "year" DESC`) });
    context.routes.register({ method: 'POST', path: 'study-years', permission: 'wattanam.attendance-manager.manage', handler: async (request) => {
      const body = request?.body || {}; const year = Number(body.year); if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('year is invalid');
      const id = crypto.randomUUID();
      const rows = await context.database.query(`INSERT INTO ${YEAR} ("id","year","label","startDate","endDate") VALUES ($1,$2,$3,$4,$5) RETURNING *`, [id, year, body.label || `${year}-${year + 1}`, body.startDate || null, body.endDate || null]);
      return rows[0];
    }});
    context.routes.register({ method: 'POST', path: 'study-years/:id/set-current', permission: 'wattanam.attendance-manager.manage', handler: async (request) => {
      const id = required(request?.params?.id, 'study year id');
      return context.database.transaction(async (tx) => {
        await tx.execute(`UPDATE ${YEAR} SET "isCurrent"=FALSE, "updatedAt"=CURRENT_TIMESTAMP WHERE "isCurrent"=TRUE`);
        const rows = await tx.query(`UPDATE ${YEAR} SET "isCurrent"=TRUE, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 RETURNING *`, [id]);
        if (!rows.length) throw new Error('Study year not found');
        return rows[0];
      });
    }});

    context.routes.register({ method: 'GET', path: 'identifiers', permission: 'wattanam.attendance-manager.manage', handler: () => context.database.query(`SELECT * FROM ${IDENTIFIER} ORDER BY "createdAt" DESC LIMIT 500`) });
    context.routes.register({ method: 'POST', path: 'identifiers', permission: 'wattanam.attendance-manager.manage', handler: async (request) => {
      const body = request?.body || {}; const id = crypto.randomUUID();
      const rows = await context.database.query(`INSERT INTO ${IDENTIFIER} ("id","code","personId","personType") VALUES ($1,$2,$3,$4) RETURNING *`, [id, required(body.code, 'code'), required(body.personId, 'personId'), choice(body.personType, PERSON_TYPES, 'personType')]);
      return rows[0];
    }});
    context.routes.register({ method: 'GET', path: 'sessions', permission: 'wattanam.attendance-manager.view', handler: () => context.database.query(`SELECT * FROM ${SESSION} ORDER BY "scope", "session"`) });
    context.routes.register({ method: 'POST', path: 'sessions', permission: 'wattanam.attendance-manager.manage', handler: async (request) => {
      const body = request?.body || {}; const session = Number(body.session);
      if (!Number.isInteger(session) || session < 1 || session > 4) throw new Error('session must be 1 through 4');
      const id = crypto.randomUUID(); const scope = choice(body.scope, PERSON_TYPES, 'scope'); const classId = body.classId ? String(body.classId) : null;
      const rows = await context.database.query(`INSERT INTO ${SESSION} ("id","scope","classId","session","type","startTime","endTime") VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("scope","classId","session") DO UPDATE SET "type"=EXCLUDED."type", "startTime"=EXCLUDED."startTime", "endTime"=EXCLUDED."endTime", "updatedAt"=CURRENT_TIMESTAMP RETURNING *`, [id, scope, classId, session, choice(body.type, ['CHECK_IN', 'CHECK_OUT'], 'type'), required(body.startTime, 'startTime'), required(body.endTime, 'endTime')]);
      return rows[0];
    }});
    context.routes.register({ method: 'GET', path: 'holidays', permission: 'wattanam.attendance-manager.view', handler: () => context.database.query(`SELECT * FROM ${HOLIDAY} ORDER BY "date" DESC LIMIT 500`) });
    context.routes.register({ method: 'POST', path: 'holidays', permission: 'wattanam.attendance-manager.manage', handler: async (request) => {
      const body = request?.body || {}; const id = crypto.randomUUID();
      const rows = await context.database.query(`INSERT INTO ${HOLIDAY} ("id","date","name","description","type","createdById") VALUES ($1,$2::date,$3,$4,$5,$6) RETURNING *`, [id, date(body.date), required(body.name, 'name'), body.description || null, String(body.type || 'HOLIDAY').toUpperCase(), required(request?.principal?.userId, 'authenticated principal')]);
      return rows[0];
    }});
  },
};
