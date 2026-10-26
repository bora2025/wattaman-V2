'use strict';

const crypto = require('crypto');

const YEAR = 'plugin_wattanam_attendance_manager_study_year';
const RECORD = 'plugin_wattanam_attendance_manager_record';
const IDENTIFIER = 'plugin_wattanam_attendance_manager_identifier';
const SESSION = 'plugin_wattanam_attendance_manager_session';
const HOLIDAY = 'plugin_wattanam_attendance_manager_holiday';
const SCAN = 'plugin_wattanam_attendance_manager_scan';
const CORRECTION = 'plugin_wattanam_attendance_manager_correction';
const ALERT_RULE = 'plugin_wattanam_attendance_manager_alert_rule';
const ALERT = 'plugin_wattanam_attendance_manager_alert';
const ALERT_DELIVERY = 'plugin_wattanam_attendance_manager_alert_delivery';

const PERSON_TYPE = 'STUDENT';
const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'PERMISSION'];
const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function one(value) { return Array.isArray(value) ? value[0] : value; }
function required(value, name) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`); return value.trim(); }
function choice(value, values, name) { const result = required(value, name).toUpperCase(); if (!values.includes(result)) throw new Error(`${name} is invalid`); return result; }
function date(value) { const result = value ? new Date(value) : new Date(); if (Number.isNaN(result.getTime())) throw new Error('date is invalid'); return result.toISOString().slice(0, 10); }
function optionalDate(value, name) { if (value === undefined || value === null || value === '') return null; const result = new Date(String(value)); if (Number.isNaN(result.getTime())) throw new Error(`${name} is invalid`); return result.toISOString().slice(0, 10); }
function eventKey(prefix, payload) { return `${prefix}-${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`; }
function idempotencyKey(value) {
  const result = required(value, 'idempotencyKey');
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(result)) throw new Error('idempotencyKey is invalid');
  return result;
}
function finiteSetting(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < minimum || number > maximum) return fallback;
  return number;
}
function zonedDateTime(value, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function timeWithinWindow(current, start, end) {
  const now = String(current || '').slice(0, 5);
  const from = String(start || '').slice(0, 5);
  const until = String(end || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(now) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(until)) return false;
  return from <= until ? now >= from && now <= until : now >= from || now <= until;
}

module.exports = {
  id: 'wattanam.attendance-manager',
  health() { return { status: 'ready' }; },
  async activate(context) {
    context.logger.log('Wattanam Attendance Manager activated');
    const publishStudyYear = (year) => context.readModels.publish('study-year', 1, year.id, year);
    const publishStudentAttendanceSummary = async (studentId) => {
      const rows = await context.database.query(
        `SELECT "date", "session", "status", "classId", "classNameSnapshot", "studyYearId", "studyYearLabelSnapshot" FROM ${RECORD} WHERE "personType"='STUDENT' AND "personId"=$1 ORDER BY "date" DESC, "session" DESC LIMIT 365`,
        [studentId],
      );
      const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, PERMISSION: 0 };
      for (const row of rows) if (Object.prototype.hasOwnProperty.call(counts, row.status)) counts[row.status] += 1;
      const recent = rows.slice(0, 30).map((row) => ({
        date: String(row.date).slice(0, 10), session: Number(row.session), status: row.status,
        classId: row.classId, className: row.classNameSnapshot || null,
        studyYearId: row.studyYearId || null, studyYearLabel: row.studyYearLabelSnapshot || null,
      }));
      await context.readModels.publish('student-attendance-summary', 1, studentId, {
        studentId, totalRecords: rows.length, counts, recent, generatedAt: new Date().toISOString(),
      });
    };
    const GLOBAL_ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'];
    const requireRecordScope = async (request, classId, personId = null) => {
      const principal = request?.principal || {};
      const role = required(principal.role, 'authenticated role').toUpperCase();
      const userId = required(principal.userId, 'authenticated principal');
      if (GLOBAL_ROLES.includes(role) || role === 'WATTAMAN') return personId;
      if (!classId) throw new Error('classId is required for scoped attendance access');
      if (role === 'TEACHER' || role === 'CLASS_ADMIN') {
        const classIds = await context.directory.classesForUser(userId, role);
        if (!classIds.includes(classId)) throw new Error('You are not assigned to this attendance class');
        return personId;
      }
      if (role === 'STUDENT' || role === 'PARENT') {
        const roster = await context.directory.getClassRoster(classId, date(request?.query?.date || request?.body?.date));
        const visible = roster.students.filter((student) => role === 'STUDENT' ? student.userId === userId : student.parentId === userId);
        if (!visible.length) throw new Error('You cannot access attendance for this class');
        if (personId && !visible.some((student) => student.studentId === personId)) throw new Error('You cannot access this student attendance');
        if (!personId && visible.length !== 1) throw new Error('personId is required when more than one student is in scope');
        return personId || visible[0].studentId;
      }
      throw new Error('This role cannot access attendance records');
    };
    context.permissions.register([
      { id: 'wattanam.attendance-manager.view', label: 'View attendance and reports' },
      { id: 'wattanam.attendance-manager.scan', label: 'Scan student attendance' },
      { id: 'wattanam.attendance-manager.mark', label: 'Mark student attendance manually' },
      { id: 'wattanam.attendance-manager.correct', label: 'Correct recorded student attendance' },
      { id: 'wattanam.attendance-manager.report', label: 'View student attendance reports' },
      { id: 'wattanam.attendance-manager.print', label: 'Print and export student attendance reports' },
      { id: 'wattanam.attendance-manager.configure', label: 'Configure sessions, holidays and Study Years' },
      { id: 'wattanam.attendance-manager.devices.manage', label: 'Manage student scan identifiers and devices' },
      { id: 'wattanam.attendance-manager.manage', label: 'Deprecated compatibility permission; grant specific administration permissions instead' },
      { id: 'wattanam.attendance-manager.export', label: 'Deprecated compatibility permission; grant report and print instead' },
    ]);
    context.navigation.register([
      { id: 'attendance', label: 'Attendance', href: '/plugins/wattanam.attendance-manager/attendance', permission: 'wattanam.attendance-manager.view', dashboard: { title: 'Attendance Manager', description: 'Scan attendance, correct records, and review today\'s results.', priority: 100 } },
      { id: 'scanner', label: 'Attendance Scanner', href: '/plugins/wattanam.attendance-manager/scanner', permission: 'wattanam.attendance-manager.scan' },
      { id: 'corrections', label: 'Attendance Corrections', href: '/plugins/wattanam.attendance-manager/corrections', permission: 'wattanam.attendance-manager.correct' },
      { id: 'alerts', label: 'Attendance Alerts', href: '/plugins/wattanam.attendance-manager/alerts', permission: 'wattanam.attendance-manager.view' },
      { id: 'reports', label: 'Attendance Reports', href: '/plugins/wattanam.attendance-manager/reports', permission: 'wattanam.attendance-manager.report' },
      { id: 'study-years', label: 'Study Years', href: '/plugins/wattanam.attendance-manager/study-years', permission: 'wattanam.attendance-manager.configure' },
      { id: 'settings', label: 'Attendance Settings', href: '/plugins/wattanam.attendance-manager/settings', permission: 'wattanam.attendance-manager.configure' },
    ]);
    const existingStudyYears = await context.database.query(`SELECT * FROM ${YEAR} ORDER BY "year" DESC`);
    await Promise.all(existingStudyYears.map(publishStudyYear));

    context.routes.register({ method: 'GET', path: 'records', permission: 'wattanam.attendance-manager.view', handler: async (request) => {
      const query = request?.query || {}; const params = [PERSON_TYPE]; const conditions = ['"personType" = $1'];
      if (one(query.personType) && choice(one(query.personType), [PERSON_TYPE], 'personType') !== PERSON_TYPE) throw new Error('personType is invalid');
      const scopedPersonId = await requireRecordScope(request, one(query.classId) ? String(one(query.classId)) : '', one(query.personId) ? String(one(query.personId)) : null);
      if (scopedPersonId && !one(query.personId)) query.personId = scopedPersonId;
      for (const [field, column] of [['personId', 'personId'], ['classId', 'classId'], ['date', 'date']]) {
        const value = one(query[field]); if (value) { params.push(String(value)); conditions.push(`"${column}" = $${params.length}${field === 'date' ? '::date' : ''}`); }
      }
      return context.database.query(`SELECT * FROM ${RECORD} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY "date" DESC, "createdAt" DESC LIMIT 500`, params);
    }});
    context.routes.register({ method: 'GET', path: 'records/:id', permission: 'wattanam.attendance-manager.view', handler: async (request) => {
      const recordId = required(request?.params?.id, 'record id');
      const rows = await context.database.query(`SELECT * FROM ${RECORD} WHERE "id"=$1 AND "personType"='STUDENT' LIMIT 1`, [recordId]);
      if (!rows.length) throw new Error('Attendance record not found');
      const record = rows[0];
      request.query = { ...(request.query || {}), date: String(record.date).slice(0, 10) };
      await requireRecordScope(request, record.classId || '', record.personId);
      return record;
    }});

    const prepareRecord = async (request, scanMode) => {
      const body = request?.body || {};
      const personId = required(body.personId, 'personId');
      const personType = choice(body.personType || PERSON_TYPE, [PERSON_TYPE], 'personType');
      const status = choice(body.status || 'PRESENT', STATUSES, 'status');
      const attendanceDate = date(body.date);
      const session = Number(body.session || 1);
      if (!Number.isInteger(session) || session < 1 || session > 4) throw new Error('session must be 1 through 4');
      const markedById = required(request?.principal?.userId, 'authenticated principal');
      const classId = required(body.classId, 'classId');
      if (typeof context.directory.getClassAttendanceSchedule === 'function') {
        const classSchedule = await context.directory.getClassAttendanceSchedule(classId);
        const dayCode = DAY_CODES[new Date(`${attendanceDate}T00:00:00.000Z`).getUTCDay()];
        if (!classSchedule.week.includes(dayCode)) throw new Error(`Attendance is disabled because ${dayCode} is not a study day for this class`);
      }
      const roster = await context.directory.getClassRoster(classId, attendanceDate);
      const student = roster.students.find((candidate) => candidate.studentId === personId);
      if (!student) throw new Error('Student is not enrolled in this class on the attendance date');
      await requireRecordScope(request, classId, personId);
      let studyYear = null;
      if (body.studyYearId) {
        studyYear = (await context.database.query(`SELECT "id", "label", "year" FROM ${YEAR} WHERE "id"=$1 LIMIT 1`, [String(body.studyYearId)]))[0] || null;
        if (!studyYear) throw new Error('Study Year not found');
      } else {
        studyYear = (await context.database.query(`SELECT "id", "label", "year" FROM ${YEAR} WHERE "isCurrent"=TRUE ORDER BY "year" DESC LIMIT 1`))[0] || null;
      }
      return {
        id: crypto.randomUUID(), personId, personType, classId, attendanceDate, session, status,
        studyYearId: studyYear?.id || null, permissionType: body.permissionType || null,
        checkInTime: body.checkInTime || (body.checkOutTime ? null : new Date().toISOString()),
        checkOutTime: body.checkOutTime || null, markedById, scanMode,
        latitude: body.latitude ?? null, longitude: body.longitude ?? null, location: body.location || null,
        personNameSnapshot: student.name, personNumberSnapshot: student.studentNumber || null,
        classNameSnapshot: roster.className || null,
        studyYearLabelSnapshot: studyYear?.label || (studyYear?.year ? String(studyYear.year) : null),
      };
    };
    const writeRecord = async (tx, prepared) => {
        await tx.execute(
          `INSERT INTO ${RECORD} ("id","personId","personType","classId","studyYearId","date","session","status","permissionType","checkInTime","checkOutTime","markedById","scanMode","scanLatitude","scanLongitude","scanLocation","personNameSnapshot","personNumberSnapshot","classNameSnapshot","studyYearLabelSnapshot") VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12,$13,$14,$15,$16,$17,$18,$19,$20) ON CONFLICT ("personType","personId","classId","date","session") DO UPDATE SET "status"=EXCLUDED."status", "permissionType"=EXCLUDED."permissionType", "checkInTime"=COALESCE(EXCLUDED."checkInTime", ${RECORD}."checkInTime"), "checkOutTime"=COALESCE(EXCLUDED."checkOutTime", ${RECORD}."checkOutTime"), "markedById"=EXCLUDED."markedById", "scanMode"=EXCLUDED."scanMode", "scanLatitude"=EXCLUDED."scanLatitude", "scanLongitude"=EXCLUDED."scanLongitude", "scanLocation"=EXCLUDED."scanLocation", "updatedAt"=CURRENT_TIMESTAMP`,
          [prepared.id, prepared.personId, prepared.personType, prepared.classId, prepared.studyYearId, prepared.attendanceDate, prepared.session, prepared.status, prepared.permissionType, prepared.checkInTime, prepared.checkOutTime, prepared.markedById, prepared.scanMode, prepared.latitude, prepared.longitude, prepared.location, prepared.personNameSnapshot, prepared.personNumberSnapshot, prepared.classNameSnapshot, prepared.studyYearLabelSnapshot],
        );
        const record = await tx.query(`SELECT * FROM ${RECORD} WHERE "personType"=$1 AND "personId"=$2 AND "classId"=$3 AND "date"=$4::date AND "session"=$5 LIMIT 1`, [prepared.personType, prepared.personId, prepared.classId, prepared.attendanceDate, prepared.session]).then((rows) => rows[0]);
        await tx.publish({
          event: 'wattanam.attendance-manager.attendance.recorded', version: 1,
          subjectKey: record.id, payload: { record }, idempotencyKey: eventKey('attendance-recorded', record),
        });
        return record;
    };
    const saveRecord = async (request, scanMode) => {
      const prepared = await prepareRecord(request, scanMode);
      const record = await context.database.transaction(async (tx) => {
        return writeRecord(tx, prepared);
      });
      await publishStudentAttendanceSummary(record.personId);
      context.events.publish('attendance.recorded.v1', { record, principal: request.principal });
      return record;
    };
    context.routes.register({ method: 'POST', path: 'records', permission: 'wattanam.attendance-manager.mark', handler: (request) => saveRecord(request, 'MANUAL') });
    context.routes.register({ method: 'PATCH', path: 'records/:id/correct', permission: 'wattanam.attendance-manager.correct', handler: async (request) => {
      const recordId = required(request?.params?.id, 'record id');
      const body = request?.body || {};
      const status = choice(body.status, STATUSES, 'status');
      const reason = required(body.reason, 'reason');
      if (reason.length < 3 || reason.length > 500) throw new Error('reason must contain 3 to 500 characters');
      const actorId = required(request?.principal?.userId, 'authenticated principal');
      const scopeRows = await context.database.query(`SELECT "personId", "classId", "date" FROM ${RECORD} WHERE "id"=$1 AND "personType"='STUDENT' LIMIT 1`, [recordId]);
      if (!scopeRows.length) throw new Error('Attendance record not found');
      request.query = { ...(request.query || {}), date: String(scopeRows[0].date).slice(0, 10) };
      await requireRecordScope(request, scopeRows[0].classId || '', scopeRows[0].personId);
      const corrected = await context.database.transaction(async (tx) => {
        const rows = await tx.query(`SELECT * FROM ${RECORD} WHERE "id"=$1 AND "personType"='STUDENT' FOR UPDATE`, [recordId]);
        if (!rows.length) throw new Error('Attendance record not found');
        const previous = rows[0];
        const next = { status, permissionType: status === 'PERMISSION' ? (body.permissionType || null) : null };
        await tx.execute(`UPDATE ${RECORD} SET "status"=$1, "permissionType"=$2, "markedById"=$3, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$4 AND "personType"='STUDENT'`, [next.status, next.permissionType, actorId, recordId]);
        await tx.execute(`INSERT INTO ${CORRECTION} ("id","recordId","actorId","reason","previousValue","newValue") VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`, [crypto.randomUUID(), recordId, actorId, reason, JSON.stringify({ status: previous.status, permissionType: previous.permissionType || null }), JSON.stringify(next)]);
        const record = await tx.query(`SELECT * FROM ${RECORD} WHERE "id"=$1 LIMIT 1`, [recordId]).then((result) => result[0]);
        await tx.publish({
          event: 'wattanam.attendance-manager.attendance.corrected', version: 1, subjectKey: recordId,
          payload: { record, previous: { status: previous.status, permissionType: previous.permissionType || null }, reason, actorId },
          idempotencyKey: eventKey('attendance-corrected', { recordId, status, permissionType: next.permissionType, reason, actorId }),
        });
        return record;
      });
      await publishStudentAttendanceSummary(corrected.personId);
      context.events.publish('attendance.corrected.v1', { record: corrected, reason, principal: request.principal });
      return corrected;
    }});
    context.routes.register({ method: 'POST', path: 'scan', permission: 'wattanam.attendance-manager.scan', handler: async (request) => {
      const body = request?.body || {}; const code = required(body.code, 'code');
      const commandKey = idempotencyKey(body.idempotencyKey);
      const mode = String(body.mode || 'CAMERA').toUpperCase() === 'USB' ? 'USB' : 'CAMERA';
      const role = required(request?.principal?.role, 'authenticated role').toUpperCase();
      if (!['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'TEACHER', 'CLASS_ADMIN', 'WATTAMAN'].includes(role)) {
        throw new Error('This role cannot scan student attendance');
      }
      const timeZone = await context.settings.get('school-timezone', 'Asia/Phnom_Penh');
      try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); } catch { throw new Error('Attendance schoolTimezone setting is invalid'); }
      const maxOfflineMinutes = finiteSetting(await context.settings.get('max-offline-minutes', 1440), 1440, 0, 10080);
      const futureToleranceMinutes = finiteSetting(await context.settings.get('future-tolerance-minutes', 5), 5, 0, 60);
      const now = new Date(); const capturedAt = body.clientTimestamp ? new Date(body.clientTimestamp) : now;
      if (Number.isNaN(capturedAt.getTime())) throw new Error('clientTimestamp is invalid');
      const ageMinutes = (now.getTime() - capturedAt.getTime()) / 60000;
      if (ageMinutes < -futureToleranceMinutes) throw new Error('Scanner clock is too far in the future');
      if (ageMinutes > maxOfflineMinutes) throw new Error('Offline attendance scan is too old');
      const local = zonedDateTime(capturedAt, timeZone);
      const classId = required(body.classId, 'classId');
      const requestedSession = body.session === undefined || body.session === null || body.session === '' ? null : Number(body.session);
      if (requestedSession !== null && (!Number.isInteger(requestedSession) || requestedSession < 1 || requestedSession > 4)) throw new Error('session must be 1 through 4');
      const sessions = await context.database.query(
        `SELECT "session", "type", "startTime", "endTime", "classId" FROM ${SESSION} WHERE "scope"='STUDENT' AND ("classId"=$1 OR "classId"='') ORDER BY CASE WHEN "classId"=$1 THEN 0 ELSE 1 END, "session"`,
        [classId],
      );
      const activeSession = sessions.find((candidate) => (requestedSession === null || Number(candidate.session) === requestedSession) && timeWithinWindow(local.time, candidate.startTime, candidate.endTime));
      if (!activeSession) throw new Error('No active attendance session for this class and school-local time');
      const holidays = await context.database.query(`SELECT "id" FROM ${HOLIDAY} WHERE "date"=$1::date LIMIT 1`, [local.date]);
      if (holidays.length) throw new Error('Attendance cannot be scanned on a configured holiday');
      if (role === 'TEACHER' || role === 'CLASS_ADMIN') await requireRecordScope(request, classId);
      let aliases = await context.database.query(`SELECT "personId", "personType" FROM ${IDENTIFIER} WHERE "code"=$1 AND "active"=TRUE LIMIT 1`, [code]);
      if (!aliases.length && typeof context.directory.resolveAttendanceIdentifier === 'function') {
        const resolved = await context.directory.resolveAttendanceIdentifier(code);
        if (resolved) aliases = [resolved];
      }
      if (!aliases.length) throw new Error('Attendance identifier not found');
      request.body = {
        ...body, ...aliases[0], classId, date: local.date, session: Number(activeSession.session), status: 'PRESENT',
        checkInTime: activeSession.type === 'CHECK_IN' ? capturedAt.toISOString() : null,
        checkOutTime: activeSession.type === 'CHECK_OUT' ? capturedAt.toISOString() : null,
      };
      const prepared = await prepareRecord(request, mode);
      const result = await context.database.transaction(async (tx) => {
        await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS "locked" FROM (SELECT COUNT(*) FROM ${SCAN}) AS namespace_guard`, [`${module.exports.id}:scan:${commandKey}`]);
        const previous = await tx.query(`SELECT "recordId", "outcome", "errorCode" FROM ${SCAN} WHERE "idempotencyKey"=$1 LIMIT 1`, [commandKey]);
        if (previous.length) {
          if (previous[0].outcome !== 'ACCEPTED' || !previous[0].recordId) throw new Error(previous[0].errorCode || 'Attendance scan was rejected');
          const rows = await tx.query(`SELECT * FROM ${RECORD} WHERE "id"=$1 LIMIT 1`, [previous[0].recordId]);
          if (!rows.length) throw new Error('Idempotent attendance record is unavailable');
          return { record: rows[0], replay: true };
        }
        const record = await writeRecord(tx, prepared);
        await tx.execute(
          `INSERT INTO ${SCAN} ("id","idempotencyKey","codeHash","mode","principalId","clientTimestamp","outcome","recordId","metadata") VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9::jsonb)`,
          [crypto.randomUUID(), commandKey, crypto.createHash('sha256').update(code).digest('hex'), mode, prepared.markedById, capturedAt.toISOString(), 'ACCEPTED', record.id, JSON.stringify({ classId: prepared.classId, session: prepared.session, timeZone })],
        );
        return { record, replay: false };
      });
      if (!result.replay) {
        await publishStudentAttendanceSummary(result.record.personId);
        context.events.publish('attendance.recorded.v1', { record: result.record, principal: request.principal });
      }
      return { ...result.record, idempotentReplay: result.replay };
    }});

    const reportFilter = async (request) => {
      const query = request?.query || {}; const params = [PERSON_TYPE]; const conditions = ['"personType" = $1'];
      const classId = one(query.classId) ? String(one(query.classId)) : '';
      const requestedPersonId = one(query.personId) ? String(one(query.personId)) : null;
      const scopedPersonId = await requireRecordScope(request, classId, requestedPersonId);
      if (classId) { params.push(classId); conditions.push(`"classId" = $${params.length}`); }
      if (scopedPersonId) { params.push(scopedPersonId); conditions.push(`"personId" = $${params.length}`); }
      const exactDate = optionalDate(one(query.date), 'date');
      const startDate = optionalDate(one(query.startDate), 'startDate');
      const endDate = optionalDate(one(query.endDate), 'endDate');
      if (exactDate && (startDate || endDate)) throw new Error('date cannot be combined with startDate or endDate');
      if (startDate && endDate && startDate > endDate) throw new Error('startDate must be on or before endDate');
      if (exactDate) { params.push(exactDate); conditions.push(`"date" = $${params.length}::date`); }
      if (startDate) { params.push(startDate); conditions.push(`"date" >= $${params.length}::date`); }
      if (endDate) { params.push(endDate); conditions.push(`"date" <= $${params.length}::date`); }
      if (one(query.status)) { params.push(choice(one(query.status), STATUSES, 'status')); conditions.push(`"status" = $${params.length}`); }
      if (one(query.session)) { const session = Number(one(query.session)); if (!Number.isInteger(session) || session < 1 || session > 4) throw new Error('session must be 1 through 4'); params.push(session); conditions.push(`"session" = $${params.length}`); }
      if (one(query.personType)) choice(one(query.personType), [PERSON_TYPE], 'personType');
      return { query, params, conditions, classId, personId: scopedPersonId || requestedPersonId, exactDate, startDate, endDate };
    };
    const reportRows = async (request) => {
      const { params, conditions } = await reportFilter(request);
      return context.database.query(`SELECT "id", "personId", "personNameSnapshot", "personNumberSnapshot", "classId", "classNameSnapshot", "studyYearId", "studyYearLabelSnapshot", "date", "session", "status", "permissionType", "checkInTime", "checkOutTime", "scanMode", "source", "attendanceWindowId", "originalScanAt", "synchronizedAt", "reviewStatus" FROM ${RECORD} WHERE ${conditions.join(' AND ')} ORDER BY "date" DESC, "classNameSnapshot", "personNameSnapshot", "session" LIMIT 10000`, params);
    };
    const reportSummary = async (request) => {
      const { params, conditions } = await reportFilter(request);
      return context.database.query(`SELECT "personType", "status", COUNT(*)::int AS "count" FROM ${RECORD} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} GROUP BY "personType", "status" ORDER BY "personType", "status"`, params);
    };
    context.routes.register({ method: 'GET', path: 'reports/summary', permission: 'wattanam.attendance-manager.report', handler: reportSummary });
    context.routes.register({ method: 'GET', path: 'reports/daily-grid', permission: 'wattanam.attendance-manager.report', handler: async (request) => { request.query = { ...(request.query || {}), date: required(one(request?.query?.date), 'date') }; return reportRows(request); } });
    context.routes.register({ method: 'GET', path: 'reports/student-detail', permission: 'wattanam.attendance-manager.report', handler: async (request) => { if (!one(request?.query?.personId)) throw new Error('personId is required'); return reportRows(request); } });
    context.routes.register({ method: 'GET', path: 'reports/monthly-trend', permission: 'wattanam.attendance-manager.report', handler: async (request) => {
      const query = request?.query || {}; const year = Number(one(query.year) || new Date().getUTCFullYear()); const month = Number(one(query.month) || new Date().getUTCMonth() + 1);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('year is invalid');
      if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('month is invalid');
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`; const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      request.query = { ...query, startDate, endDate };
      const { params, conditions } = await reportFilter(request);
      return context.database.query(`SELECT "date", "status", COUNT(*)::int AS "count" FROM ${RECORD} WHERE ${conditions.join(' AND ')} GROUP BY "date", "status" ORDER BY "date", "status"`, params);
    }});
    context.routes.register({ method: 'GET', path: 'reports/class-progress', permission: 'wattanam.attendance-manager.report', handler: async (request) => {
      const query = request?.query || {}; const classId = required(one(query.classId), 'classId'); const attendanceDate = date(one(query.date));
      request.query = { ...query, classId, date: attendanceDate };
      const records = await reportRows(request); const roster = await context.directory.getClassRoster(classId, attendanceDate);
      const marked = new Set(records.map((record) => record.personId)).size; const total = roster.students.length;
      return { classId, className: roster.className || records[0]?.classNameSnapshot || null, date: attendanceDate, total, marked, unmarked: Math.max(0, total - marked), percent: total ? Math.round((marked / total) * 10000) / 100 : 0 };
    }});
    context.routes.register({ method: 'GET', path: 'reports/print-data', permission: 'wattanam.attendance-manager.print', handler: reportRows });
    context.routes.register({ method: 'GET', path: 'reports/export-csv', permission: 'wattanam.attendance-manager.print', handler: async (request) => {
      const rows = await reportRows(request);
      const columns = [['Date', 'date'], ['Student number', 'personNumberSnapshot'], ['Student', 'personNameSnapshot'], ['Class', 'classNameSnapshot'], ['Session', 'session'], ['Status', 'status'], ['Permission', 'permissionType'], ['Source', 'scanMode']];
      const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [columns.map(([label]) => cell(label)).join(','), ...rows.map((row) => columns.map(([, key]) => cell(row[key])).join(','))].join('\r\n');
      return { filename: 'student-attendance.csv', contentType: 'text/csv; charset=utf-8', content: `\uFEFF${csv}` };
    }});

    context.routes.register({ method: 'GET', path: 'alert-rules', permission: 'wattanam.attendance-manager.configure', handler: () => context.database.query(`SELECT * FROM ${ALERT_RULE} ORDER BY "code"`) });
    context.routes.register({ method: 'POST', path: 'alert-rules', permission: 'wattanam.attendance-manager.configure', handler: async (request) => {
      const body = request?.body || {}; const code = required(body.code, 'code').toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,99}$/.test(code)) throw new Error('code is invalid');
      const threshold = Number(body.threshold); const windowDays = Number(body.windowDays);
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) throw new Error('threshold must be 1 through 100');
      if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) throw new Error('windowDays must be 1 through 365');
      const channels = Array.isArray(body.channels) ? [...new Set(body.channels.map((entry) => String(entry).toUpperCase()))] : ['IN_APP'];
      if (!channels.length || channels.some((entry) => !['IN_APP', 'REALTIME'].includes(entry))) throw new Error('channels are invalid');
      const id = crypto.randomUUID(); const actorId = required(request?.principal?.userId, 'authenticated principal');
      await context.database.execute(`INSERT INTO ${ALERT_RULE} ("id","code","enabled","threshold","windowDays","channels","createdById") VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT ("code") DO UPDATE SET "enabled"=EXCLUDED."enabled", "threshold"=EXCLUDED."threshold", "windowDays"=EXCLUDED."windowDays", "channels"=EXCLUDED."channels", "updatedAt"=CURRENT_TIMESTAMP`, [id, code, body.enabled !== false, threshold, windowDays, JSON.stringify(channels), actorId]);
      return (await context.database.query(`SELECT * FROM ${ALERT_RULE} WHERE "code"=$1 LIMIT 1`, [code]))[0];
    }});
    context.routes.register({ method: 'GET', path: 'alerts', permission: 'wattanam.attendance-manager.view', handler: async (request) => {
      const query = request?.query || {}; const params = []; const conditions = [];
      if (one(query.status)) { const status = choice(one(query.status), ['PENDING', 'SENT', 'FAILED', 'ACKNOWLEDGED', 'CANCELLED'], 'status'); params.push(status); conditions.push(`"status"=$${params.length}`); }
      return context.database.query(`SELECT * FROM ${ALERT} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY "createdAt" DESC LIMIT 500`, params);
    }});
    context.routes.register({ method: 'POST', path: 'alerts/:id/acknowledge', permission: 'wattanam.attendance-manager.configure', handler: async (request) => {
      const id = required(request?.params?.id, 'alert id');
      const result = await context.database.execute(`UPDATE ${ALERT} SET "status"='ACKNOWLEDGED', "acknowledgedAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "status" IN ('PENDING','SENT','FAILED')`, [id]);
      if (!result.count) throw new Error('Attendance alert not found or already closed');
      return { id, status: 'ACKNOWLEDGED' };
    }});

    const evaluateAlerts = async () => {
      const rules = await context.database.query(`SELECT * FROM ${ALERT_RULE} WHERE "enabled"=TRUE ORDER BY "code"`);
      const windowEnd = new Date().toISOString().slice(0, 10);
      for (const rule of rules) {
        const start = new Date(`${windowEnd}T00:00:00.000Z`); start.setUTCDate(start.getUTCDate() - Number(rule.windowDays) + 1); const windowStart = start.toISOString().slice(0, 10);
        const candidates = await context.database.query(`SELECT "personId", "classId", COUNT(*)::int AS "count" FROM ${RECORD} WHERE "personType"='STUDENT' AND "status"='ABSENT' AND "date">=$1::date AND "date"<=$2::date GROUP BY "personId", "classId" HAVING COUNT(*) >= $3`, [windowStart, windowEnd, Number(rule.threshold)]);
        for (const candidate of candidates) {
          const key = eventKey('attendance-alert', { ruleId: rule.id, personId: candidate.personId, classId: candidate.classId || null, windowStart, windowEnd });
          const alertId = crypto.randomUUID();
          await context.database.execute(`INSERT INTO ${ALERT} ("id","ruleId","personId","classId","windowStart","windowEnd","status","idempotencyKey") VALUES ($1,$2,$3,$4,$5::date,$6::date,'PENDING',$7) ON CONFLICT ("idempotencyKey") DO NOTHING`, [alertId, rule.id, candidate.personId, candidate.classId || null, windowStart, windowEnd, key]);
          const alert = (await context.database.query(`SELECT * FROM ${ALERT} WHERE "idempotencyKey"=$1 LIMIT 1`, [key]))[0];
          if (!alert || ['SENT', 'ACKNOWLEDGED', 'CANCELLED'].includes(alert.status)) continue;
          try {
            const roster = candidate.classId ? await context.directory.getClassRoster(candidate.classId, windowEnd) : null;
            const student = roster?.students.find((entry) => entry.studentId === candidate.personId);
            const recipients = [...new Set([student?.userId, student?.parentId].filter(Boolean))];
            const channels = Array.isArray(rule.channels) ? rule.channels : JSON.parse(String(rule.channels || '[]'));
            const message = `${student?.name || 'Student'} has ${candidate.count} absence records from ${windowStart} to ${windowEnd}.`;
            for (const userId of recipients) for (const channel of channels) {
              const deliveryId = crypto.randomUUID();
              await context.database.execute(`INSERT INTO ${ALERT_DELIVERY} ("id","alertId","userId","channel","status") VALUES ($1,$2,$3,$4,'PENDING') ON CONFLICT ("alertId","userId","channel") DO NOTHING`, [deliveryId, alert.id, userId, channel]);
              const delivery = (await context.database.query(`SELECT * FROM ${ALERT_DELIVERY} WHERE "alertId"=$1 AND "userId"=$2 AND "channel"=$3 LIMIT 1`, [alert.id, userId, channel]))[0];
              if (delivery?.status === 'SENT') continue;
              try {
                if (channel === 'IN_APP') await context.notifications.notifyInApp(userId, message, 'attendance_alert');
                if (channel === 'REALTIME') context.realtime.notifyUser(userId, 'attendance:alert', { alertId: alert.id, personId: candidate.personId, classId: candidate.classId, count: candidate.count, windowStart, windowEnd });
                await context.database.execute(`UPDATE ${ALERT_DELIVERY} SET "status"='SENT', "attempts"="attempts"+1, "lastError"=NULL, "sentAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [delivery.id]);
              } catch (error) {
                await context.database.execute(`UPDATE ${ALERT_DELIVERY} SET "status"='FAILED', "attempts"="attempts"+1, "lastError"=$1, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2`, [String(error?.message || error).slice(0, 1000), delivery.id]);
                throw error;
              }
            }
            await context.database.execute(`UPDATE ${ALERT} SET "status"='SENT', "attempts"="attempts"+1, "lastError"=NULL, "sentAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [alert.id]);
          } catch (error) {
            await context.database.execute(`UPDATE ${ALERT} SET "status"='FAILED', "attempts"="attempts"+1, "lastError"=$1, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2`, [String(error?.message || error).slice(0, 1000), alert.id]);
            throw error;
          }
        }
      }
    };
    if (context.jobs?.register) await context.jobs.register({ id: 'attendance-alerts', intervalSeconds: 900, handler: evaluateAlerts });

    context.routes.register({ method: 'GET', path: 'study-years', permission: 'wattanam.attendance-manager.view', handler: () => context.database.query(`SELECT * FROM ${YEAR} ORDER BY "year" DESC`) });
    context.routes.register({ method: 'GET', path: 'study-years/current', permission: 'wattanam.attendance-manager.view', handler: async () => {
      const rows = await context.database.query(`SELECT * FROM ${YEAR} WHERE "isCurrent"=TRUE ORDER BY "year" DESC LIMIT 1`);
      return rows[0] || null;
    }});
    context.routes.register({ method: 'GET', path: 'study-years/:id', permission: 'wattanam.attendance-manager.view', handler: async (request) => {
      const id = required(request?.params?.id, 'study year id');
      const rows = await context.database.query(`SELECT * FROM ${YEAR} WHERE "id"=$1 LIMIT 1`, [id]);
      if (!rows.length) throw new Error('Study year not found');
      return rows[0];
    }});
    context.routes.register({ method: 'POST', path: 'study-years', permission: 'wattanam.attendance-manager.configure', handler: async (request) => {
      const body = request?.body || {}; const year = Number(body.year); if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('year is invalid');
      const id = crypto.randomUUID();
      const created = await context.database.transaction(async (tx) => {
        await tx.execute(`INSERT INTO ${YEAR} ("id","year","label","startDate","endDate","schoolName","logoUrl") VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7)`, [id, year, body.label || `${year}-${year + 1}`, body.startDate || null, body.endDate || null, body.schoolName || null, body.logoUrl || null]);
        const row = await tx.query(`SELECT * FROM ${YEAR} WHERE "id"=$1 LIMIT 1`, [id]).then((rows) => rows[0]);
        await tx.publish({
          event: 'wattanam.attendance-manager.study-year.created', version: 1, subjectKey: row.id,
          payload: { studyYear: row, principal: request?.principal },
          idempotencyKey: eventKey('study-year-created', row),
        });
        return row;
      });
      await publishStudyYear(created);
      context.events.publish('attendance.study-year.created.v1', { studyYear: created, principal: request?.principal });
      return created;
    }});
    context.routes.register({ method: 'PUT', path: 'study-years/:id', permission: 'wattanam.attendance-manager.configure', handler: async (request) => {
      const id = required(request?.params?.id, 'study year id');
      const body = request?.body || {};
      const sets = []; const params = [];
      for (const field of ['label', 'startDate', 'endDate', 'schoolName', 'logoUrl']) {
        if (body[field] !== undefined) { params.push(body[field] || null); sets.push(`"${field}"=$${params.length}${field === 'startDate' || field === 'endDate' ? '::timestamptz' : ''}`); }
      }
      if (body.year !== undefined) {
        const year = Number(body.year); if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('year is invalid');
        params.push(year); sets.push(`"year"=$${params.length}`);
      }
      if (!sets.length) throw new Error('No valid Study Year updates provided');
      params.push(id);
      const updated = await context.database.transaction(async (tx) => {
        await tx.execute(`UPDATE ${YEAR} SET ${sets.join(', ')}, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$${params.length}`, params);
        const rows = await tx.query(`SELECT * FROM ${YEAR} WHERE "id"=$1 LIMIT 1`, [id]);
        if (!rows.length) throw new Error('Study year not found');
        await tx.publish({
          event: 'wattanam.attendance-manager.study-year.updated', version: 1, subjectKey: rows[0].id,
          payload: { studyYear: rows[0], principal: request?.principal },
          idempotencyKey: eventKey('study-year-updated', rows[0]),
        });
        return rows[0];
      });
      await publishStudyYear(updated);
      context.events.publish('attendance.study-year.updated.v1', { studyYear: updated, principal: request?.principal });
      return updated;
    }});
    context.routes.register({ method: 'POST', path: 'study-years/:id/set-current', permission: 'wattanam.attendance-manager.configure', handler: async (request) => {
      const id = required(request?.params?.id, 'study year id');
      const current = await context.database.transaction(async (tx) => {
        await tx.execute(`UPDATE ${YEAR} SET "isCurrent"=FALSE, "updatedAt"=CURRENT_TIMESTAMP WHERE "isCurrent"=TRUE`);
        await tx.execute(`UPDATE ${YEAR} SET "isCurrent"=TRUE, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [id]);
        const rows = await tx.query(`SELECT * FROM ${YEAR} WHERE "id"=$1 LIMIT 1`, [id]);
        if (!rows.length) throw new Error('Study year not found');
        await tx.publish({
          event: 'wattanam.attendance-manager.study-year.set-current', version: 1, subjectKey: rows[0].id,
          payload: { studyYear: rows[0], principal: request?.principal },
          idempotencyKey: eventKey('study-year-set-current', rows[0]),
        });
        return rows[0];
      });
      const years = await context.database.query(`SELECT * FROM ${YEAR} ORDER BY "year" DESC`);
      await Promise.all(years.map(publishStudyYear));
      context.events.publish('attendance.study-year.set-current.v1', { studyYear: current, principal: request?.principal });
      return current;
    }});
    context.routes.register({ method: 'DELETE', path: 'study-years/:id', permission: 'wattanam.attendance-manager.configure', handler: async (request) => {
      const id = required(request?.params?.id, 'study year id');
      const used = await context.database.query(`SELECT COUNT(*)::int AS "count" FROM ${RECORD} WHERE "studyYearId"=$1`, [id]);
      if ((used[0]?.count || 0) > 0) throw new Error('Cannot delete a Study Year used by attendance records');
      const existing = await context.database.query(`SELECT * FROM ${YEAR} WHERE "id"=$1 LIMIT 1`, [id]);
      if (!existing.length) throw new Error('Study year not found');
      await context.database.transaction(async (tx) => {
        await tx.execute(`DELETE FROM ${YEAR} WHERE "id"=$1`, [id]);
        await tx.publish({
          event: 'wattanam.attendance-manager.study-year.deleted', version: 1, subjectKey: id,
          payload: { studyYear: existing[0], principal: request?.principal },
          idempotencyKey: eventKey('study-year-deleted', existing[0]),
        });
      });
      await publishStudyYear({ ...existing[0], deleted: true, deletedAt: new Date().toISOString() });
      context.events.publish('attendance.study-year.deleted.v1', { studyYear: existing[0], principal: request?.principal });
      return { success: true };
    }});

    context.routes.register({ method: 'GET', path: 'identifiers', permission: 'wattanam.attendance-manager.devices.manage', handler: () => context.database.query(`SELECT * FROM ${IDENTIFIER} ORDER BY "createdAt" DESC LIMIT 500`) });
    context.routes.register({ method: 'POST', path: 'identifiers', permission: 'wattanam.attendance-manager.devices.manage', handler: async (request) => {
      const body = request?.body || {}; const id = crypto.randomUUID();
      const values = [id, required(body.code, 'code'), required(body.personId, 'personId'), choice(body.personType || PERSON_TYPE, [PERSON_TYPE], 'personType')];
      return context.database.transaction(async (tx) => {
        await tx.execute(`INSERT INTO ${IDENTIFIER} ("id","code","personId","personType") VALUES ($1,$2,$3,$4)`, values);
        return tx.query(`SELECT * FROM ${IDENTIFIER} WHERE "id"=$1 LIMIT 1`, [id]).then((rows) => rows[0]);
      });
    }});
    context.routes.register({ method: 'GET', path: 'sessions', permission: 'wattanam.attendance-manager.view', handler: () => context.database.query(`SELECT * FROM ${SESSION} ORDER BY "scope", "session"`) });
    context.routes.register({ method: 'POST', path: 'sessions', permission: 'wattanam.attendance-manager.configure', handler: async (request) => {
      const body = request?.body || {}; const session = Number(body.session);
      if (!Number.isInteger(session) || session < 1 || session > 4) throw new Error('session must be 1 through 4');
      const id = crypto.randomUUID(); const scope = choice(body.scope || PERSON_TYPE, [PERSON_TYPE], 'scope'); const classId = body.classId ? String(body.classId) : '';
      const values = [id, scope, classId, session, choice(body.type, ['CHECK_IN', 'CHECK_OUT'], 'type'), required(body.startTime, 'startTime'), required(body.endTime, 'endTime')];
      return context.database.transaction(async (tx) => {
        await tx.execute(`INSERT INTO ${SESSION} ("id","scope","classId","session","type","startTime","endTime") VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("scope","classId","session") DO UPDATE SET "type"=EXCLUDED."type", "startTime"=EXCLUDED."startTime", "endTime"=EXCLUDED."endTime", "updatedAt"=CURRENT_TIMESTAMP`, values);
        return tx.query(`SELECT * FROM ${SESSION} WHERE "scope"=$1 AND "classId"=$2 AND "session"=$3 LIMIT 1`, [scope, classId, session]).then((rows) => rows[0]);
      });
    }});
    context.routes.register({ method: 'GET', path: 'holidays', permission: 'wattanam.attendance-manager.view', handler: () => context.database.query(`SELECT * FROM ${HOLIDAY} ORDER BY "date" DESC LIMIT 500`) });
    context.routes.register({ method: 'POST', path: 'holidays', permission: 'wattanam.attendance-manager.configure', handler: async (request) => {
      const body = request?.body || {}; const id = crypto.randomUUID();
      const values = [id, date(body.date), required(body.name, 'name'), body.description || null, String(body.type || 'HOLIDAY').toUpperCase(), required(request?.principal?.userId, 'authenticated principal')];
      return context.database.transaction(async (tx) => {
        await tx.execute(`INSERT INTO ${HOLIDAY} ("id","date","name","description","type","createdById") VALUES ($1,$2::date,$3,$4,$5,$6)`, values);
        return tx.query(`SELECT * FROM ${HOLIDAY} WHERE "id"=$1 LIMIT 1`, [id]).then((rows) => rows[0]);
      });
    }});
  },
};


