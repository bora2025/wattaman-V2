'use strict';

const crypto = require('node:crypto');

const KEY = 'plugin_wattanam_academic_management_attendance_signing_key';
const WINDOW = 'plugin_wattanam_academic_management_attendance_window';
const DEVICE = 'plugin_wattanam_academic_management_attendance_device';
const AUDIT = 'plugin_wattanam_academic_management_attendance_self_scan';
const RECORD = 'plugin_wattanam_academic_management_attendance_record';
const SESSION = 'plugin_wattanam_academic_management_attendance_session';
const HOLIDAY = 'plugin_wattanam_academic_management_attendance_holiday';
const STUDENT = 'plugin_wattanam_academic_management_student_profile';
const STUDY_YEAR = 'plugin_wattanam_academic_management_study_year';

const manage = 'wattanam.academic-management.attendance.windows.manage';
const selfScan = 'wattanam.academic-management.attendance.self.scan';
const review = 'wattanam.academic-management.attendance.self.review';

function text(value, label, max = 500) {
  const result = String(value || '').trim();
  if (!result || result.length > max) throw new Error(`${label} is required and must contain at most ${max} characters`);
  return result;
}

function integer(value, label, minimum, maximum) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  return result;
}

function finite(value, label, minimum, maximum, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  return result;
}

function timestamp(value, label) {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error(`${label} is invalid`);
  return result;
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url');
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function localDateTime(value, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function minutes(value) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function distanceMeters(aLat, aLon, bLat, bLon) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(bLat - aLat);
  const dLon = radians(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function resultFromAudit(row, idempotentReplay = false) {
  return {
    result: row.result,
    recordId: row.recordId || null,
    reviewStatus: row.reviewStatus,
    rejectionReason: row.rejectionReason || null,
    idempotentReplay,
  };
}

async function ensureSigningKey(db) {
  let row = (await db.query(`SELECT * FROM ${KEY} WHERE "id"='primary' LIMIT 1`))[0];
  if (row) return row;
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const fingerprint = hash(publicKeyPem);
  await db.execute(
    `INSERT INTO ${KEY} ("id","algorithm","publicKeyPem","privateKeyPem","fingerprint") VALUES ('primary','Ed25519',$1,$2,$3) ON CONFLICT ("id") DO NOTHING`,
    [publicKeyPem, privateKeyPem, fingerprint],
  );
  row = (await db.query(`SELECT * FROM ${KEY} WHERE "id"='primary' LIMIT 1`))[0];
  if (!row) throw new Error('Attendance signing key could not be initialized');
  return row;
}

function signToken(key, claims) {
  const payload = encode(JSON.stringify(claims));
  const signature = crypto.sign(null, Buffer.from(payload), key.privateKeyPem);
  return `${payload}.${signature.toString('base64url')}`;
}

function verifyToken(key, token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 4096) throw new Error('INVALID_QR');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('INVALID_QR');
  let claims;
  try {
    if (!crypto.verify(null, Buffer.from(parts[0]), key.publicKeyPem, decode(parts[1]))) throw new Error('INVALID_QR');
    claims = JSON.parse(decode(parts[0]).toString('utf8'));
  } catch {
    throw new Error('INVALID_QR');
  }
  if (claims?.version !== 1 || !claims.windowId || !claims.classId || !claims.nonce) throw new Error('INVALID_QR');
  if (!safeEqual(claims.organizationId, key.fingerprint.slice(0, 24))) throw new Error('INVALID_QR');
  return claims;
}

async function authorizeWindow(context, request, classId) {
  const principal = request?.principal || {};
  const role = String(principal.role || '').toUpperCase();
  if (!principal.userId) throw new Error('Authenticated principal is required');
  if (['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'].includes(role)) return;
  if (!['TEACHER', 'CLASS_ADMIN'].includes(role)) throw new Error('This role cannot manage attendance windows');
  const classIds = await context.directory.classesForUser(principal.userId, role);
  if (!classIds.includes(classId)) throw new Error('Attendance window is outside your assigned classes');
}

async function tokenForWindow(db, window) {
  const key = await ensureSigningKey(db);
  const now = Math.floor(Date.now() / 1000);
  const windowEnd = Math.floor(new Date(window.endsAt).getTime() / 1000);
  const expiresAt = Math.min(now + Number(window.qrValiditySeconds), windowEnd);
  if (window.status !== 'OPEN' || expiresAt <= now) throw new Error('Attendance window is not open');
  const claims = {
    version: 1,
    organizationId: key.fingerprint.slice(0, 24),
    classId: window.classId,
    session: Number(window.session),
    sessionType: window.sessionType,
    attendanceWindowId: window.id,
    windowId: window.id,
    nonce: crypto.randomUUID(),
    issuedAt: now,
    expiresAt,
  };
  return {
    attendanceToken: signToken(key, claims),
    issuedAt: new Date(now * 1000).toISOString(),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    validitySeconds: expiresAt - now,
  };
}

async function recordAttempt(db, input) {
  await db.execute(
    `INSERT INTO ${AUDIT} ("id","clientRequestId","tokenHash","tokenVersion","nonce","attendanceWindowId","studentProfileId","directoryUserId","classId","session","scannedAt","syncState","deviceIdHash","networkQuality","latitude","longitude","accuracyMeters","locationDecision","result","rejectionReason","recordId","reviewStatus")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT ("clientRequestId") DO NOTHING`,
    [
      crypto.randomUUID(), input.clientRequestId, input.tokenHash, input.tokenVersion || null,
      input.nonce || null, input.windowId || null, input.studentId || null, input.userId,
      input.classId || null, input.session || null, input.scannedAt || null, input.syncState || 'ONLINE',
      input.deviceIdHash || null, input.networkQuality || null, input.latitude ?? null,
      input.longitude ?? null, input.accuracy ?? null, input.locationDecision || 'NOT_REQUIRED',
      input.result, input.reason || null, input.recordId || null, input.reviewStatus || 'NOT_REQUIRED',
    ],
  );
  return (await db.query(`SELECT * FROM ${AUDIT} WHERE "clientRequestId"=$1 LIMIT 1`, [input.clientRequestId]))[0];
}

function registerSelfAttendance(context) {
  context.permissions.register([
    { id: manage, label: 'Open and close student self-attendance windows' },
    { id: selfScan, label: 'Record my own attendance with a signed school QR' },
    { id: review, label: 'Review exceptional student self-attendance scans' },
  ]);
  context.navigation.register([
    { id: 'attendance-windows', label: 'Self-attendance QR', href: '/plugins/wattanam.academic-management/attendance-windows', permission: manage },
    { id: 'student-attendance-scan', label: 'Scan Attendance', href: '/plugins/wattanam.academic-management/student/attendance-scan', permission: selfScan },
    { id: 'attendance-self-review', label: 'Self-attendance Review', href: '/plugins/wattanam.academic-management/attendance-self-review', permission: review },
  ]);

  context.routes.register({
    method: 'GET', path: 'attendance-windows', permission: manage,
    handler: async (request) => {
      const classId = request?.query?.classId ? String(request.query.classId) : '';
      if (classId) await authorizeWindow(context, request, classId);
      const params = [];
      const where = classId ? `WHERE "classId"=$${params.push(classId)}` : '';
      const rows = await context.database.query(`SELECT * FROM ${WINDOW} ${where} ORDER BY "createdAt" DESC LIMIT 200`, params);
      return Promise.all(rows.map(async (row) => {
        if (row.status !== 'OPEN' || new Date(row.endsAt) <= new Date()) return row;
        try { return { ...row, ...(await tokenForWindow(context.database, row)) }; } catch { return row; }
      }));
    },
  });

  context.routes.register({
    method: 'POST', path: 'attendance-windows', permission: manage,
    handler: async (request) => {
      const body = request?.body || {};
      const classId = text(body.classId, 'classId', 200);
      await authorizeWindow(context, request, classId);
      const session = integer(body.session, 'session', 1, 4);
      const sessionType = String(body.sessionType || 'CHECK_IN').toUpperCase();
      if (!['CHECK_IN', 'CHECK_OUT'].includes(sessionType)) throw new Error('sessionType is invalid');
      const startsAt = timestamp(body.startsAt || new Date(), 'startsAt');
      const endsAt = timestamp(body.endsAt, 'endsAt');
      if (endsAt <= startsAt) throw new Error('endsAt must be after startsAt');
      if (endsAt.getTime() - startsAt.getTime() > 12 * 60 * 60 * 1000) throw new Error('Attendance windows cannot exceed 12 hours');
      const classes = await context.directory.lookupClasses([classId]);
      if (!classes.length) throw new Error('Class not found');
      const overlapping = await context.database.query(
        `SELECT "id" FROM ${WINDOW} WHERE "classId"=$1 AND "session"=$2 AND "status"='OPEN' AND "startsAt"<$4::timestamptz AND "endsAt">$3::timestamptz LIMIT 1`,
        [classId, session, startsAt.toISOString(), endsAt.toISOString()],
      );
      if (overlapping.length) throw new Error('An overlapping attendance window is already open for this class and session');
      const locationRequired = Boolean(body.locationRequired);
      const latitude = finite(body.latitude, 'latitude', -90, 90, !locationRequired);
      const longitude = finite(body.longitude, 'longitude', -180, 180, !locationRequired);
      const radiusMeters = body.radiusMeters == null && !locationRequired ? null : integer(body.radiusMeters, 'radiusMeters', 10, 10000);
      const id = crypto.randomUUID();
      await context.database.execute(
        `INSERT INTO ${WINDOW} ("id","classId","session","sessionType","startsAt","endsAt","qrValiditySeconds","locationRequired","latitude","longitude","radiusMeters","maxAccuracyMeters","registeredDeviceRequired","maxOfflineMinutes","createdById")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          id, classId, session, sessionType, startsAt.toISOString(), endsAt.toISOString(),
          integer(body.qrValiditySeconds ?? 45, 'qrValiditySeconds', 15, 300), locationRequired,
          latitude, longitude, radiusMeters,
          integer(body.maxAccuracyMeters ?? 100, 'maxAccuracyMeters', 5, 5000),
          Boolean(body.registeredDeviceRequired),
          integer(body.maxOfflineMinutes ?? 1440, 'maxOfflineMinutes', 0, 10080),
          request.principal.userId,
        ],
      );
      const window = (await context.database.query(`SELECT * FROM ${WINDOW} WHERE "id"=$1`, [id]))[0];
      context.events.publish('wattanam.academic-management.attendance.window.opened', { windowId: id, classId, session, sessionType });
      return { ...window, ...(await tokenForWindow(context.database, window)) };
    },
  });

  context.routes.register({
    method: 'POST', path: 'attendance-windows/:id/rotate', permission: manage,
    handler: async (request) => {
      const window = (await context.database.query(`SELECT * FROM ${WINDOW} WHERE "id"=$1 LIMIT 1`, [text(request?.params?.id, 'window id')]))[0];
      if (!window) throw new Error('Attendance window not found');
      await authorizeWindow(context, request, window.classId);
      return { windowId: window.id, ...(await tokenForWindow(context.database, window)) };
    },
  });

  context.routes.register({
    method: 'POST', path: 'attendance-windows/:id/close', permission: manage,
    handler: async (request) => {
      const id = text(request?.params?.id, 'window id');
      const window = (await context.database.query(`SELECT * FROM ${WINDOW} WHERE "id"=$1 LIMIT 1`, [id]))[0];
      if (!window) throw new Error('Attendance window not found');
      await authorizeWindow(context, request, window.classId);
      await context.database.execute(`UPDATE ${WINDOW} SET "status"='CLOSED',"closedById"=$2,"closedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [id, request.principal.userId]);
      context.events.publish('wattanam.academic-management.attendance.window.closed', { windowId: id, classId: window.classId });
      return { id, status: 'CLOSED' };
    },
  });

  context.routes.register({
    method: 'GET', path: 'attendance-windows/:id/live', permission: manage,
    handler: async (request) => {
      const id = text(request?.params?.id, 'window id');
      const window = (await context.database.query(`SELECT * FROM ${WINDOW} WHERE "id"=$1 LIMIT 1`, [id]))[0];
      if (!window) throw new Error('Attendance window not found');
      await authorizeWindow(context, request, window.classId);
      const counts = (await context.database.query(
        `SELECT "result",COUNT(*)::int AS "count" FROM ${AUDIT} WHERE "attendanceWindowId"=$1 GROUP BY "result"`, [id],
      )).reduce((all, row) => ({ ...all, [row.result]: Number(row.count) }), {});
      const recent = await context.database.query(
        `SELECT "id","studentProfileId","result","reviewStatus","receivedAt" FROM ${AUDIT} WHERE "attendanceWindowId"=$1 ORDER BY "receivedAt" DESC LIMIT 50`, [id],
      );
      return { window, counts, recent };
    },
  });

  context.routes.register({
    method: 'POST', path: 'student/self-scan', permission: selfScan,
    handler: async (request) => {
      const body = request?.body || {};
      const principal = request?.principal || {};
      const userId = text(principal.userId, 'authenticated user');
      const clientRequestId = text(body.clientRequestId || body.idempotencyKey, 'clientRequestId', 200);
      const attendanceToken = text(body.attendanceToken, 'attendanceToken', 4096);
      const tokenHash = hash(attendanceToken);
      const existing = (await context.database.query(`SELECT * FROM ${AUDIT} WHERE "clientRequestId"=$1 LIMIT 1`, [clientRequestId]))[0];
      if (existing) {
        if (!safeEqual(existing.directoryUserId, userId)) throw new Error('clientRequestId belongs to another user');
        return resultFromAudit(existing, true);
      }
      if (String(principal.role || '').toUpperCase() !== 'STUDENT') {
        const attempt = await recordAttempt(context.database, { clientRequestId, tokenHash, userId, result: 'UNAUTHORIZED', reason: 'Only an authenticated student may self-scan' });
        return resultFromAudit(attempt);
      }
      const recent = await context.database.query(`SELECT COUNT(*)::int AS "count" FROM ${AUDIT} WHERE "directoryUserId"=$1 AND "receivedAt">CURRENT_TIMESTAMP-INTERVAL '1 minute'`, [userId]);
      if (Number(recent[0]?.count || 0) >= 10) throw new Error('Too many attendance scan attempts; wait one minute');
      const student = (await context.database.query(`SELECT "id","userId","studentNumber","nameKh" FROM ${STUDENT} WHERE "userId"=$1 LIMIT 1`, [userId]))[0];
      if (!student) throw new Error('Student academic profile not found');
      const key = await ensureSigningKey(context.database);
      let claims;
      try {
        claims = verifyToken(key, attendanceToken);
      } catch {
        const attempt = await recordAttempt(context.database, { clientRequestId, tokenHash, userId, studentId: student.id, result: 'INVALID_QR', reason: 'Signature or token structure is invalid' });
        return resultFromAudit(attempt);
      }
      const window = (await context.database.query(`SELECT * FROM ${WINDOW} WHERE "id"=$1 LIMIT 1`, [claims.windowId]))[0];
      const base = {
        clientRequestId, tokenHash, tokenVersion: claims.version, nonce: claims.nonce,
        windowId: claims.windowId, userId, studentId: student.id, classId: claims.classId,
        session: Number(claims.session), networkQuality: String(body.networkQuality || '').slice(0, 50) || null,
        deviceIdHash: body.deviceId ? hash(String(body.deviceId)) : null,
      };
      if (!window || !safeEqual(window.classId, claims.classId) || Number(window.session) !== Number(claims.session) || window.sessionType !== claims.sessionType) {
        return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'INVALID_QR', reason: 'Token does not match an attendance window' }));
      }
      const now = new Date();
      const scannedAt = timestamp(body.scannedAt || body.clientTimestamp || now, 'scannedAt');
      const ageMinutes = (now - scannedAt) / 60000;
      const syncState = ageMinutes > 2 ? 'OFFLINE' : 'ONLINE';
      base.scannedAt = scannedAt.toISOString();
      base.syncState = syncState;
      if (ageMinutes < -5) return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'REQUIRES_REVIEW', reviewStatus: 'PENDING', syncState: 'REVIEW', reason: 'Device clock is too far in the future' }));
      if (ageMinutes > Number(window.maxOfflineMinutes)) return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'EXPIRED_QR', reason: 'Offline scan is older than the window policy allows' }));
      const scannedSeconds = Math.floor(scannedAt.getTime() / 1000);
      if (scannedSeconds < Number(claims.issuedAt) - 60 || scannedSeconds > Number(claims.expiresAt)) {
        return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'EXPIRED_QR', reason: 'QR was not valid at the original scan time' }));
      }
      if (scannedAt < new Date(window.startsAt) || scannedAt > new Date(window.endsAt)) {
        return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'NO_ACTIVE_SESSION', reason: 'Scan is outside the attendance window' }));
      }
      const timeZone = await context.settings.get('school-timezone', 'Asia/Phnom_Penh');
      const local = localDateTime(scannedAt, timeZone);
      const enrollment = await context.directory.getEnrollmentAtDate(student.id, local.date);
      if (!enrollment.enrolled || !safeEqual(enrollment.classId, claims.classId)) {
        return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'WRONG_CLASS', reason: 'Student is not enrolled in this class' }));
      }
      if ((await context.database.query(`SELECT "id" FROM ${HOLIDAY} WHERE "date"=$1::date LIMIT 1`, [local.date])).length) {
        return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'DAY_OFF', reason: 'The scan date is a configured holiday' }));
      }
      const latitude = finite(body.latitude, 'latitude', -90, 90, true);
      const longitude = finite(body.longitude, 'longitude', -180, 180, true);
      const accuracy = finite(body.accuracyMeters, 'accuracyMeters', 0, 100000, true);
      let locationDecision = 'NOT_REQUIRED';
      if (window.locationRequired) {
        if (latitude === null || longitude === null || accuracy === null) locationDecision = 'UNAVAILABLE';
        else if (accuracy > Number(window.maxAccuracyMeters)) locationDecision = 'INACCURATE';
        else if (distanceMeters(latitude, longitude, Number(window.latitude), Number(window.longitude)) > Number(window.radiusMeters)) locationDecision = 'OUTSIDE_GEOFENCE';
        else locationDecision = 'ACCEPTED';
      }
      Object.assign(base, { latitude, longitude, accuracy, locationDecision });
      if (window.locationRequired && locationDecision !== 'ACCEPTED') {
        return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'REQUIRES_REVIEW', reviewStatus: 'PENDING', syncState: 'REVIEW', reason: `Location validation: ${locationDecision}` }));
      }
      if (window.registeredDeviceRequired) {
        if (!base.deviceIdHash) return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'DEVICE_REJECTED', reason: 'A registered device is required' }));
        const devices = await context.database.query(`SELECT "id" FROM ${DEVICE} WHERE "studentProfileId"=$1 AND "deviceIdHash"=$2 AND "active"=TRUE LIMIT 1`, [student.id, base.deviceIdHash]);
        if (!devices.length) return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'DEVICE_REJECTED', reason: 'This device is not registered for the student' }));
      }
      if (window.status !== 'OPEN' && syncState !== 'OFFLINE') {
        return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'CLOSED_WINDOW', reason: 'Attendance window is closed' }));
      }
      if (window.status !== 'OPEN') {
        return resultFromAudit(await recordAttempt(context.database, { ...base, result: 'REQUIRES_REVIEW', reviewStatus: 'PENDING', syncState: 'REVIEW', reason: 'Offline scan arrived after the window closed' }));
      }
      const session = (await context.database.query(
        `SELECT * FROM ${SESSION} WHERE "scope"='STUDENT' AND "session"=$1 AND ("classId"=$2 OR "classId"='') ORDER BY CASE WHEN "classId"=$2 THEN 0 ELSE 1 END LIMIT 1`,
        [Number(claims.session), claims.classId],
      ))[0];
      const lateAfterMinutes = Number(await context.settings.get('attendance-late-after-minutes', 15));
      const localMinutes = minutes(local.time);
      const sessionStart = minutes(session?.startTime);
      const status = claims.sessionType === 'CHECK_IN' && sessionStart !== null && localMinutes > sessionStart + lateAfterMinutes ? 'LATE' : 'PRESENT';
      const studyYear = (await context.database.query(`SELECT "id","label","year" FROM ${STUDY_YEAR} WHERE "isCurrent"=TRUE ORDER BY "year" DESC LIMIT 1`))[0] || null;
      const result = await context.database.transaction(async (tx) => {
        await tx.query(`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended($1,0)), (SELECT COUNT(*) FROM ${AUDIT}) AS namespace_guard`, [`student-self-scan:${clientRequestId}`]);
        const replay = (await tx.query(`SELECT * FROM ${AUDIT} WHERE "clientRequestId"=$1 LIMIT 1`, [clientRequestId]))[0];
        if (replay) return { audit: replay, record: replay.recordId ? (await tx.query(`SELECT * FROM ${RECORD} WHERE "id"=$1`, [replay.recordId]))[0] : null };
        const prior = (await tx.query(`SELECT * FROM ${RECORD} WHERE "personType"='STUDENT' AND "personId"=$1 AND "classId"=$2 AND "date"=$3::date AND "session"=$4 LIMIT 1 FOR UPDATE`, [student.id, claims.classId, local.date, Number(claims.session)]))[0];
        if (prior) {
          if (claims.sessionType === 'CHECK_OUT' && !prior.checkOutTime) await tx.execute(`UPDATE ${RECORD} SET "checkOutTime"=$2,"synchronizedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [prior.id, scannedAt.toISOString()]);
          const audit = await recordAttempt(tx, { ...base, result: 'ALREADY_RECORDED', recordId: prior.id });
          return { audit, record: prior };
        }
        const roster = await context.directory.getClassRoster(claims.classId, local.date);
        const rosterStudent = roster.students.find((candidate) => candidate.studentId === student.id);
        if (!rosterStudent) throw new Error('Student is absent from the authoritative class roster');
        const recordId = crypto.randomUUID();
        await tx.execute(
          `INSERT INTO ${RECORD} ("id","personId","personType","classId","studyYearId","date","session","status","checkInTime","checkOutTime","markedById","scanMode","scanLatitude","scanLongitude","personNameSnapshot","personNumberSnapshot","classNameSnapshot","studyYearLabelSnapshot","source","attendanceWindowId","originalScanAt","synchronizedAt")
           VALUES ($1,$2,'STUDENT',$3,$4,$5::date,$6,$7,$8,$9,$10,'CAMERA',$11,$12,$13,$14,$15,$16,$17,$18,$19,CURRENT_TIMESTAMP)`,
          [
            recordId, student.id, claims.classId, studyYear?.id || null, local.date, Number(claims.session), status,
            claims.sessionType === 'CHECK_IN' ? scannedAt.toISOString() : null,
            claims.sessionType === 'CHECK_OUT' ? scannedAt.toISOString() : null,
            userId, latitude, longitude, rosterStudent.name, rosterStudent.studentNumber || student.studentNumber || null,
            roster.className || null, studyYear?.label || (studyYear?.year ? String(studyYear.year) : null),
            syncState === 'OFFLINE' ? 'STUDENT_OFFLINE_SYNC' : 'STUDENT_SELF_SCAN', window.id, scannedAt.toISOString(),
          ],
        );
        const record = (await tx.query(`SELECT * FROM ${RECORD} WHERE "id"=$1`, [recordId]))[0];
        const audit = await recordAttempt(tx, { ...base, result: status === 'LATE' ? 'LATE' : 'RECORDED', recordId });
        await tx.publish({
          event: 'wattanam.academic-management.attendance.student-self-recorded', version: 1,
          subjectKey: recordId, payload: { record, windowId: window.id },
          idempotencyKey: `student-self-attendance:${clientRequestId}`,
        });
        return { audit, record };
      });
      if (base.deviceIdHash) await context.database.execute(`UPDATE ${DEVICE} SET "lastUsedAt"=CURRENT_TIMESTAMP WHERE "studentProfileId"=$1 AND "deviceIdHash"=$2`, [student.id, base.deviceIdHash]);
      if (result.record) {
        context.realtime.notifyUser(window.createdById, 'attendance:self-scan', { windowId: window.id, result: result.audit.result, record: result.record });
        context.events.publish('attendance.recorded.v1', { record: result.record, principal: request.principal });
      }
      return { ...resultFromAudit(result.audit), record: result.record || null, idempotentReplay: false };
    },
  });

  context.routes.register({
    method: 'GET', path: 'student/attendance-devices', permission: selfScan,
    handler: async (request) => {
      if (String(request?.principal?.role || '').toUpperCase() !== 'STUDENT') throw new Error('Student role is required');
      return context.database.query(
        `SELECT "id","label","active","registeredAt","lastUsedAt" FROM ${DEVICE} WHERE "directoryUserId"=$1 ORDER BY "registeredAt" DESC`,
        [request.principal.userId],
      );
    },
  });

  context.routes.register({
    method: 'POST', path: 'student/attendance-devices', permission: selfScan,
    handler: async (request) => {
      if (String(request?.principal?.role || '').toUpperCase() !== 'STUDENT') throw new Error('Student role is required');
      const student = (await context.database.query(`SELECT "id" FROM ${STUDENT} WHERE "userId"=$1 LIMIT 1`, [request.principal.userId]))[0];
      if (!student) throw new Error('Student academic profile not found');
      const deviceIdHash = hash(text(request?.body?.deviceId, 'deviceId', 500));
      const label = String(request?.body?.label || '').trim().slice(0, 100) || null;
      const id = crypto.randomUUID();
      await context.database.execute(
        `INSERT INTO ${DEVICE} ("id","studentProfileId","directoryUserId","deviceIdHash","label") VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT ("studentProfileId","deviceIdHash") DO UPDATE SET "label"=EXCLUDED."label","active"=TRUE`,
        [id, student.id, request.principal.userId, deviceIdHash, label],
      );
      return (await context.database.query(`SELECT "id","label","active","registeredAt","lastUsedAt" FROM ${DEVICE} WHERE "studentProfileId"=$1 AND "deviceIdHash"=$2`, [student.id, deviceIdHash]))[0];
    },
  });

  context.routes.register({
    method: 'GET', path: 'student/attendance-history', permission: selfScan,
    handler: async (request) => {
      if (String(request?.principal?.role || '').toUpperCase() !== 'STUDENT') throw new Error('Student role is required');
      const student = (await context.database.query(`SELECT "id" FROM ${STUDENT} WHERE "userId"=$1 LIMIT 1`, [request.principal.userId]))[0];
      if (!student) throw new Error('Student academic profile not found');
      return context.database.query(
        `SELECT "id","date","session","status","classNameSnapshot","checkInTime","checkOutTime","source","reviewStatus" FROM ${RECORD} WHERE "personType"='STUDENT' AND "personId"=$1 ORDER BY "date" DESC,"session" DESC LIMIT 200`,
        [student.id],
      );
    },
  });

  context.routes.register({
    method: 'GET', path: 'attendance-self-review', permission: review,
    handler: async () => context.database.query(
      `SELECT * FROM ${AUDIT} WHERE "reviewStatus"='PENDING' ORDER BY "receivedAt" ASC LIMIT 500`,
    ),
  });

  context.routes.register({
    method: 'POST', path: 'attendance-self-review/:id/decide', permission: review,
    handler: async (request) => {
      const id = text(request?.params?.id, 'attempt id');
      const decision = String(request?.body?.decision || '').toUpperCase();
      if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('decision must be APPROVED or REJECTED');
      const reason = text(request?.body?.reason, 'reason', 500);
      const attempt = (await context.database.query(`SELECT * FROM ${AUDIT} WHERE "id"=$1 AND "reviewStatus"='PENDING' LIMIT 1`, [id]))[0];
      if (!attempt) throw new Error('Pending self-attendance attempt not found');
      let recordId = attempt.recordId || null;
      if (decision === 'APPROVED' && !recordId) {
        const scannedAt = timestamp(attempt.scannedAt, 'stored scan time');
        const timeZone = await context.settings.get('school-timezone', 'Asia/Phnom_Penh');
        const local = localDateTime(scannedAt, timeZone);
        const roster = await context.directory.getClassRoster(attempt.classId, local.date);
        const rosterStudent = roster.students.find((candidate) => candidate.studentId === attempt.studentProfileId);
        if (!rosterStudent) throw new Error('Student is no longer available in the authoritative roster for this scan');
        const studyYear = (await context.database.query(`SELECT "id","label","year" FROM ${STUDY_YEAR} WHERE "isCurrent"=TRUE ORDER BY "year" DESC LIMIT 1`))[0] || null;
        recordId = crypto.randomUUID();
        await context.database.execute(
          `INSERT INTO ${RECORD} ("id","personId","personType","classId","studyYearId","date","session","status","checkInTime","markedById","scanMode","scanLatitude","scanLongitude","personNameSnapshot","personNumberSnapshot","classNameSnapshot","studyYearLabelSnapshot","source","attendanceWindowId","originalScanAt","synchronizedAt","reviewStatus")
           VALUES ($1,$2,'STUDENT',$3,$4,$5::date,$6,'PRESENT',$7,$8,'CAMERA',$9,$10,$11,$12,$13,$14,'STUDENT_OFFLINE_SYNC',$15,$7,CURRENT_TIMESTAMP,'APPROVED')
           ON CONFLICT ("personType","personId","classId","date","session") DO NOTHING`,
          [recordId, attempt.studentProfileId, attempt.classId, studyYear?.id || null, local.date, Number(attempt.session), scannedAt.toISOString(), request.principal.userId, attempt.latitude, attempt.longitude, rosterStudent.name, rosterStudent.studentNumber || null, roster.className || null, studyYear?.label || (studyYear?.year ? String(studyYear.year) : null), attempt.attendanceWindowId],
        );
        const stored = (await context.database.query(`SELECT "id" FROM ${RECORD} WHERE "personType"='STUDENT' AND "personId"=$1 AND "classId"=$2 AND "date"=$3::date AND "session"=$4 LIMIT 1`, [attempt.studentProfileId, attempt.classId, local.date, Number(attempt.session)]))[0];
        recordId = stored?.id || null;
      }
      await context.database.execute(
        `UPDATE ${AUDIT} SET "reviewStatus"=$2,"reviewedById"=$3,"reviewedAt"=CURRENT_TIMESTAMP,"rejectionReason"=CASE WHEN $2='REJECTED' THEN $4 ELSE "rejectionReason" END,"recordId"=COALESCE($5,"recordId") WHERE "id"=$1`,
        [id, decision, request.principal.userId, reason, recordId],
      );
      context.events.publish('wattanam.academic-management.attendance.self-scan-reviewed', { attemptId: id, decision, reviewerId: request.principal.userId });
      return { id, reviewStatus: decision, reason, recordId };
    },
  });
}

module.exports = { registerSelfAttendance };
