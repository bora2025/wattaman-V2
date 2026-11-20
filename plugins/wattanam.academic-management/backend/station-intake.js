'use strict';

// Smart Attendance (wattanam.smart-attendance) stations identify a student by QR code or NFC card;
// this plugin stays the owner of attendance records. Two read models tell the stations who people are,
// and every station capture arrives as a durable event and leaves as a result event:
//
//   read model  attendance-people v1        one row per student: number, names, class, hashed QR codes
//   read model  attendance-person-photo v1  one row per student: the photo (kept apart: rows are large)
//   subscribes  wattanam.smart-attendance.presence.captured v1   { captureId, personType, personId, stationId, method, source, capturedAt, direction? }
//   publishes   wattanam.academic-management.attendance.station-result v1
//               { captureId, outcome: RECORDED | ALREADY_RECORDED | REJECTED, reason?, record? }
//
// The school's own rules decide the record: the student's class that day, a study day and not a holiday,
// the attendance session open at the capture time (the class's own sessions first), present or late
// (attendance-late-after-minutes after a check-in session starts). A student already present or late in
// that session keeps the first arrival; an absence or permission is replaced by the arrival.

const crypto = require('crypto');

const T = {
  student: 'plugin_wattanam_academic_management_student_profile',
  enrollment: 'plugin_wattanam_academic_management_enrollment_interval',
  klass: 'plugin_wattanam_academic_management_class',
  identifier: 'plugin_wattanam_academic_management_attendance_identifier',
  session: 'plugin_wattanam_academic_management_attendance_session',
  holiday: 'plugin_wattanam_academic_management_attendance_holiday',
  record: 'plugin_wattanam_academic_management_attendance_record',
};
const PRESENCE = 'wattanam.smart-attendance.presence.captured';
const RESULT = 'wattanam.academic-management.attendance.station-result';
const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const SYNC_SECONDS = 120;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const digest = (value) => sha256(JSON.stringify(value));
const weekOf = (value) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value || {};
    return Array.isArray(parsed.week) && parsed.week.length ? parsed.week.map((d) => String(d).toUpperCase()) : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  } catch { return ['MON', 'TUE', 'WED', 'THU', 'FRI']; }
};
// The school's local date and time of an instant.
const zoned = (instant, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(instant).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};
const minutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
// A session window may pass midnight (a night class): 18:00 – 06:00.
const within = (time, start, end) => {
  const t = minutes(time), s = minutes(start), e = minutes(end);
  if (t === null || s === null || e === null) return false;
  return s <= e ? t >= s && t <= e : t >= s || t <= e;
};

function registerStationIntake(context, { internal, decorateStudentRows }) {
  const db = context.database;

  // ---------- who people are, for the stations ----------
  const published = new Map(); // key → digest of the last published data, so only changes are written
  const publishIfChanged = async (model, key, data) => {
    const id = `${model}:${key}`, value = digest(data);
    if (published.get(id) === value) return false;
    await context.readModels.publish(model, 1, key, data);
    published.set(id, value);
    return true;
  };
  let syncing = null;
  const syncPeople = () => {
    if (syncing) return syncing;
    syncing = (async () => {
      const rows = await db.query(
        `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."sex", s."photo", s."qrCode", e."classId", c."name" AS "className"
           FROM ${T.student} s
           LEFT JOIN ${T.enrollment} e ON e."studentId" = s."id" AND e."validTo" IS NULL
           LEFT JOIN ${T.klass} c ON c."id" = e."classId"
          ORDER BY s."studentNumber" ASC NULLS LAST LIMIT 10000`);
      const codes = await db.query(`SELECT "personId", "code" FROM ${T.identifier} WHERE "personType" = 'STUDENT' AND "active" = TRUE`);
      const codesOf = new Map();
      codes.forEach((row) => { if (!codesOf.has(row.personId)) codesOf.set(row.personId, []); codesOf.get(row.personId).push(row.code); });
      const people = await decorateStudentRows(rows);
      let changed = 0;
      for (const p of people) {
        const codeHashes = [...new Set([p.qrCode, ...(codesOf.get(p.id) || [])].filter(Boolean).map(sha256))];
        if (await publishIfChanged('attendance-people', p.id, {
          id: p.id, type: 'STUDENT', number: p.studentNumber || '', name: p.name || '', nameKh: p.nameKh || '', sex: p.sex || null,
          classId: p.classId || null, className: p.className || '', active: Boolean(p.classId), codeHashes,
        })) changed += 1;
        await publishIfChanged('attendance-person-photo', p.id, { id: p.id, photo: p.photo || '' });
      }
      return { people: people.length, changed };
    })().finally(() => { syncing = null; });
    return syncing;
  };

  // ---------- a station capture becomes an attendance record ----------
  const reject = (reason) => ({ outcome: 'REJECTED', reason });
  const recordPresence = async (p) => {
    if (p.personType !== 'STUDENT') return reject('Only students can be recorded at a station for now');
    if (!p.personId || !p.captureId || !p.stationId) return reject('The capture is incomplete');
    const capturedAt = new Date(p.capturedAt);
    if (Number.isNaN(capturedAt.getTime())) return reject('The capture time is invalid');
    let timeZone = await context.settings.get('school-timezone', 'Asia/Phnom_Penh');
    try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); } catch { timeZone = 'Asia/Phnom_Penh'; }
    const local = zoned(capturedAt, timeZone);

    const enrolled = (await db.query(
      `SELECT e."classId", c."name", c."schedule" FROM ${T.enrollment} e JOIN ${T.klass} c ON c."id" = e."classId"
        WHERE e."studentId" = $1 AND e."validFrom" <= $2::date AND (e."validTo" IS NULL OR e."validTo" >= $2::date) LIMIT 1`, [p.personId, local.date]))[0];
    if (!enrolled) return reject('The student is not in a class on this day');
    if (p.classIds && p.classIds.length && !p.classIds.includes(enrolled.classId)) return reject(`This station is not for ${enrolled.name}`);
    if ((await db.query(`SELECT "id" FROM ${T.holiday} WHERE "date" = $1::date LIMIT 1`, [local.date])).length) return reject('Today is a school holiday');
    if (!weekOf(enrolled.schedule).includes(DAY_CODES[new Date(`${local.date}T00:00:00.000Z`).getUTCDay()])) return reject(`${enrolled.name} does not study today`);

    const sessions = await db.query(
      `SELECT "session", "type", "startTime", "endTime", "classId" FROM ${T.session} WHERE "scope" = 'STUDENT' AND ("classId" = $1 OR "classId" = '')
        ORDER BY CASE WHEN "classId" = $1 THEN 0 ELSE 1 END, "session"`, [enrolled.classId]);
    // the class's own sessions replace the school's sessions of the same number
    const chosen = new Map();
    sessions.forEach((s) => { if (!chosen.has(Number(s.session))) chosen.set(Number(s.session), s); });
    const open = [...chosen.values()].filter((s) => within(local.time, s.startTime, s.endTime) && (!p.direction || s.type === p.direction));
    const session = open.sort((a, b) => Number(a.session) - Number(b.session))[0];
    if (!session) return reject(`No attendance session at ${local.time}`);

    const existing = (await db.query(
      `SELECT "id", "status", "session", "date"::text AS "date", "checkInTime", "checkOutTime" FROM ${T.record}
        WHERE "personType" = 'STUDENT' AND "personId" = $1 AND "classId" = $2 AND "date" = $3::date AND "session" = $4 LIMIT 1`,
      [p.personId, enrolled.classId, local.date, Number(session.session)]))[0];
    if (existing && (existing.status === 'PRESENT' || existing.status === 'LATE')) {
      return { outcome: 'ALREADY_RECORDED', record: { id: existing.id, status: existing.status, session: Number(existing.session), date: local.date, classId: enrolled.classId, className: enrolled.name, type: session.type } };
    }
    const lateAfter = Number(await context.settings.get('attendance-late-after-minutes', 15));
    const start = minutes(session.startTime);
    const status = session.type === 'CHECK_IN' && start !== null && minutes(local.time) > start + (Number.isFinite(lateAfter) ? lateAfter : 15) ? 'LATE' : 'PRESENT';
    let record;
    try {
      record = await internal.saveStationRecord({
        principal: { userId: `station:${p.stationId}`, role: 'SUPER_ADMIN' },
        body: {
          personId: p.personId, classId: enrolled.classId, date: local.date, session: Number(session.session), status,
          checkInTime: session.type === 'CHECK_IN' ? capturedAt.toISOString() : null,
          checkOutTime: session.type === 'CHECK_OUT' ? capturedAt.toISOString() : null,
        },
      }, p.source === 'USB' ? 'USB' : 'CAMERA');
    } catch (error) {
      // the attendance rules said no (not enrolled that day, not a study day…): tell the station why
      return reject(error instanceof Error ? error.message : String(error));
    }
    return { outcome: 'RECORDED', record: { id: record.id, status: record.status, session: Number(record.session), date: local.date, classId: enrolled.classId, className: enrolled.name, type: session.type } };
  };

  if (context.durableEvents && typeof context.durableEvents.subscribe === 'function') {
    context.durableEvents.subscribe({
      id: 'smart-attendance-presence', event: PRESENCE, versions: [1],
      handler: async (event) => {
        const p = (event && event.payload) || {};
        const result = await recordPresence(p);
        await db.transaction((tx) => tx.publish({
          event: RESULT, version: 1, subjectKey: String(p.captureId || event.id),
          payload: { captureId: p.captureId || null, ...result },
          idempotencyKey: `station-result-${String(p.captureId || event.id).replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 150)}`,
        }));
      },
    });
  }

  // the people the stations know: now, then every two minutes (only changes are written)
  const run = () => syncPeople().catch((error) => context.logger.error ? context.logger.error(`attendance-people sync failed: ${error.message}`) : undefined);
  run();
  if (context.jobs && context.jobs.register) Promise.resolve(context.jobs.register({ id: 'attendance-people-sync', intervalSeconds: SYNC_SECONDS, handler: () => syncPeople() })).catch(() => undefined);
  return { syncPeople, recordPresence };
}

module.exports = { registerStationIntake, zoned, within };
