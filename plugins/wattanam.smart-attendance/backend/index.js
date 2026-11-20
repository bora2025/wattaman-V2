'use strict';

// Smart Attendance: attendance stations that identify students by QR code, NFC card or face (Phases 1–2
// of architecture/smart-attendance-plugin-plan.md). This plugin owns the stations, the NFC card registry
// and the capture log; Academic Management stays the owner of attendance records:
//
//   station  ──POST captures──▶  identify (card registry / hashed QR codes) · cool-down · log
//            ──event presence.captured v1──▶  Academic Management records it by the school's rules
//            ◀──event attendance.station-result v1──  RECORDED | ALREADY_RECORDED | REJECTED (reason)
//   the station polls GET captures/:id for that result (plugin screens cannot receive pushes).
//
// Who people are comes from Academic Management's read models (attendance-people, attendance-person-photo).
// Card numbers are kept only as an HMAC under a per-school key, plus the last four characters.
// Terminals (hardware face / card terminals, or a small bridge program next to them): an administrator
// adds a terminal and gets a device key once (core device credentials); the terminal posts its events to
// /api/plugin-device/wattanam.smart-attendance/terminal/events. A terminal that recognises faces itself
// sends the student ID it matched; card terminals send the card number; all go through the same capture.
// Faces: the school page computes a 128-number face vector (never an image reaches this plugin); a person
// is enrolled only after their (or their guardian's) consent is recorded, and withdrawing it deletes the
// vectors at once. Matching: the closest enrolled person by Euclidean distance; recorded when close enough
// AND clearly closer than anyone else (margin), shown to the teacher to confirm when only fairly close.

const crypto = require('crypto');

const ID = 'wattanam.smart-attendance';
const ACADEMIC = 'wattanam.academic-management';
const T = {
  station: 'plugin_wattanam_smart_attendance_station',
  card: 'plugin_wattanam_smart_attendance_card',
  capture: 'plugin_wattanam_smart_attendance_capture',
  faceConsent: 'plugin_wattanam_smart_attendance_face_consent',
  faceSample: 'plugin_wattanam_smart_attendance_face_sample',
};
const PERM = {
  view: `${ID}.view`,
  operate: `${ID}.station.operate`,
  stations: `${ID}.stations.manage`,
  cards: `${ID}.cards.manage`,
  configure: `${ID}.configure`,
  enroll: `${ID}.faces.enroll`,
  faces: `${ID}.faces.manage`,
};
const PRESENCE = `${ID}.presence.captured`;
const RESULT = `${ACADEMIC}.attendance.station-result`;
const METHODS = ['QR', 'NFC', 'FACE'];
const REVIEW_REASON = 'Not sure: a teacher confirms on the station';
const MODES = ['AUTO', 'CHECK_IN', 'CHECK_OUT'];

// ---------- errors the user sees (every other error stays a private server error) ----------
const ERRORS = {
  FIELD_REQUIRED: { status: 400, message: 'A required field is missing', detail: true },
  FIELD_TOO_LONG: { status: 400, message: 'A field is too long', detail: true },
  INVALID_VALUE: { status: 400, message: 'A value is not valid', detail: true },
  STATION_NOT_FOUND: { status: 404, message: 'This station is not registered' },
  STATION_NOT_ACTIVE: { status: 403, message: 'This station is waiting for approval or was turned off' },
  PERSON_NOT_FOUND: { status: 404, message: 'The student was not found' },
  CARD_NOT_FOUND: { status: 404, message: 'The card was not found' },
  CARD_TAKEN: { status: 409, message: 'This card already belongs to someone else', detail: true },
  FACE_INVALID: { status: 400, message: 'The face reading is not valid; try again' },
  NO_CONSENT: { status: 409, message: 'Record the consent first: faces are enrolled only with consent' },
  CONSENT_NOT_FOUND: { status: 404, message: 'The consent was not found' },
  CAPTURE_NOT_REVIEWABLE: { status: 409, message: 'This capture cannot be confirmed any more' },
  TERMINALS_UNAVAILABLE: { status: 503, message: 'Terminals need a school core with device credentials' },
  NOT_A_TERMINAL: { status: 409, message: 'This station is not a terminal' },
  CAPTURE_TOO_OLD: { status: 422, message: 'This capture is older than the stations keep offline captures' },
  PEOPLE_UNAVAILABLE: { status: 503, message: 'The student list is not available yet: stations need Academic Management 0.34 or newer, which shares it (refreshed every two minutes)' },
};
const fail = (code, message) => Object.assign(new Error(message || ERRORS[code].message), { code, isPluginContractError: true });
const CONTRACT = { version: '1.0', response: { parse: (value) => value }, errors: ERRORS };

const text = (value, label, max, required) => {
  const result = value === undefined || value === null ? '' : String(value).trim();
  if (required && !result) throw fail('FIELD_REQUIRED', `${label} is required`);
  if (result.length > max) throw fail('FIELD_TOO_LONG', `${label} is too long (at most ${max} characters)`);
  return result;
};
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const deviceHash = (deviceId) => sha256(`${ID}:device:${deviceId}`);
// Readers type the same card in different ways (spaces, colons, lower case): keep only letters and digits.
const normalizeUid = (value) => String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const jsonList = (value) => {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const iso = (value) => (value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null);

function stationOut(row) {
  return row && {
    id: row.id, name: row.name, place: row.place || '', status: row.status, mode: row.mode,
    methods: jsonList(row.methods), classIds: jsonList(row.classIds),
    approvedAt: iso(row.approvedAt), lastSeenAt: iso(row.lastSeenAt), createdAt: iso(row.createdAt),
    kind: row.kind || 'STATION',
  };
}
function captureOut(row, person) {
  return row && {
    id: row.id, stationId: row.stationId, method: row.method, source: row.source, result: row.result, status: row.status,
    attendanceStatus: row.attendanceStatus || null, session: row.session === null || row.session === undefined ? null : Number(row.session),
    sessionType: row.sessionType || null, reason: row.reason || null,
    score: row.score === null || row.score === undefined ? null : Number(row.score), margin: row.margin === null || row.margin === undefined ? null : Number(row.margin),
    capturedAt: iso(row.capturedAt), receivedAt: iso(row.receivedAt), resolvedAt: iso(row.resolvedAt),
    personId: row.personId || null,
    person: person ? { id: person.id, number: person.number, name: person.name, nameKh: person.nameKh, className: person.className } : null,
  };
}

module.exports = {
  id: ID,
  health() { return { status: 'ready' }; },
  async activate(context) {
    const db = context.database;
    const register = (definition) => context.routes.register({ ...definition, contract: CONTRACT });

    context.permissions.register([
      { id: PERM.view, label: 'See the attendance stations’ live monitor and capture log', roles: ['ADMIN', 'SCHOOL_ADMIN'] },
      { id: PERM.operate, label: 'Run an attendance station on an approved device', description: 'Open the Station screen on a tablet or PC the school approved; students then scan their QR code or tap their card.', roles: ['ADMIN', 'SCHOOL_ADMIN', 'RECEPTIONIST', 'TEACHER', 'CLASS_ADMIN'] },
      { id: PERM.stations, label: 'Approve attendance stations and choose what they accept', roles: ['ADMIN', 'SCHOOL_ADMIN'] },
      { id: PERM.cards, label: 'Issue, replace and end students’ NFC cards', roles: ['ADMIN', 'SCHOOL_ADMIN', 'RECEPTIONIST'] },
      { id: PERM.configure, label: 'Change Smart Attendance settings', roles: ['ADMIN', 'SCHOOL_ADMIN'] },
      { id: PERM.enroll, label: 'Record face consent and enrol students’ faces', description: 'Faces are biometric data: enrol only after the student (or a guardian for students under 18) has agreed.', roles: ['ADMIN', 'SCHOOL_ADMIN', 'RECEPTIONIST'] },
      { id: PERM.faces, label: 'Delete enrolled faces and withdraw consent', roles: ['ADMIN', 'SCHOOL_ADMIN'] },
    ]);

    // The sidebar: the core shows only the entries registered here (plugin.json's list is the declaration).
    context.navigation.register([
      { id: 'station', label: 'Attendance Station', href: `/plugins/${ID}/station`, permission: PERM.operate },
      { id: 'monitor', label: 'Station Monitor', href: `/plugins/${ID}/monitor`, permission: PERM.view },
      { id: 'stations', label: 'Attendance Stations', href: `/plugins/${ID}/stations`, permission: PERM.stations },
      { id: 'cards', label: 'NFC Cards', href: `/plugins/${ID}/cards`, permission: PERM.cards },
      { id: 'faces', label: 'Face Enrolment', href: `/plugins/${ID}/faces`, permission: PERM.enroll },
    ]);

    // ---------- settings: the per-school card key, the cool-down ----------
    let cardKey = await context.settings.get('card-key', null);
    if (!cardKey || typeof cardKey !== 'string' || cardKey.length < 32) {
      cardKey = crypto.randomBytes(32).toString('hex');
      await context.settings.set('card-key', cardKey);
    }
    const cardHmac = (uid) => crypto.createHmac('sha256', cardKey).update(normalizeUid(uid)).digest('hex');
    const SETTINGS = {
      cooldownSeconds: ['cooldown-seconds', 60, 0, 3600, true],
      faceAccept: ['face-accept', 0.5, 0.3, 0.7, false],     // distance at or below: the same person
      faceReview: ['face-review', 0.58, 0.3, 0.8, false],    // up to here: the teacher confirms
      faceMargin: ['face-margin', 0.06, 0, 0.3, false],      // the next person must be at least this much farther
      maxOfflineHours: ['max-offline-hours', 24, 0, 168, true],
    };
    const settings = async () => {
      const out = {};
      for (const [name, [key, fallback, min, max, integer]] of Object.entries(SETTINGS)) {
        const value = Number(await context.settings.get(key, fallback));
        out[name] = Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)) ? value : fallback;
      }
      out.livenessRequired = (await context.settings.get('liveness-required', true)) !== false;
      if (out.faceReview < out.faceAccept) out.faceReview = out.faceAccept;
      return out;
    };

    // ---------- who people are (Academic Management's read models, cached briefly) ----------
    let cache = { at: 0, list: [], byId: new Map(), byCode: new Map() };
    const people = async (fresh) => {
      if (!fresh && Date.now() - cache.at < 30_000) return cache;
      let rows;
      try { rows = await context.readModels.read(ACADEMIC, 'attendance-people', [1]); }
      catch { throw fail('PEOPLE_UNAVAILABLE'); }
      const list = rows.map((row) => row.data).filter((p) => p && p.id);
      const byId = new Map(list.map((p) => [p.id, p]));
      const byCode = new Map();
      list.forEach((p) => (p.codeHashes || []).forEach((hash) => byCode.set(hash, p)));
      cache = { at: Date.now(), list, byId, byCode };
      return cache;
    };
    const photoOf = async (personId) => {
      try { return ((await context.readModels.read(ACADEMIC, 'attendance-person-photo', [1], personId))[0] || {}).data?.photo || ''; }
      catch { return ''; }
    };

    // ---------- stations ----------
    const stationByDevice = async (deviceId) => (await db.query(`SELECT * FROM ${T.station} WHERE "deviceIdHash" = $1 LIMIT 1`, [deviceHash(deviceId)]))[0] || null;
    register({
      method: 'GET', path: 'stations/me', permission: PERM.operate,
      handler: async (request) => {
        const deviceId = text(request?.query?.deviceId, 'deviceId', 200, true);
        const station = await stationByDevice(deviceId);
        if (station) await db.execute(`UPDATE ${T.station} SET "lastSeenAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [station.id]);
        return { station: stationOut(station) };
      },
    });
    register({
      method: 'POST', path: 'stations/register', permission: PERM.operate,
      handler: async (request) => {
        const body = request?.body || {};
        const deviceId = text(body.deviceId, 'deviceId', 200, true);
        const existing = await stationByDevice(deviceId);
        if (existing) return { station: stationOut(existing) };
        const id = crypto.randomUUID();
        await db.execute(
          `INSERT INTO ${T.station} ("id", "name", "place", "deviceIdHash", "requestedBy") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("deviceIdHash") DO NOTHING`,
          [id, text(body.name, 'Station name', 80, true), text(body.place, 'Place', 120) || null, deviceHash(deviceId), request.principal.userId]);
        return { station: stationOut(await stationByDevice(deviceId)) };
      },
    });
    register({
      method: 'GET', path: 'stations', permission: PERM.stations,
      handler: async () => {
        const rows = await db.query(
          `SELECT s.*, (SELECT COUNT(*)::int FROM ${T.capture} c WHERE c."stationId" = s."id" AND c."receivedAt" > NOW() - INTERVAL '1 day') AS "capturesToday"
             FROM ${T.station} s ORDER BY CASE s."status" WHEN 'PENDING' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END, s."name"`);
        return rows.map((row) => ({ ...stationOut(row), capturesToday: Number(row.capturesToday || 0) }));
      },
    });
    register({
      method: 'PUT', path: 'stations/:id', permission: PERM.stations,
      handler: async (request) => {
        const id = text(request?.params?.id, 'id', 100, true);
        const current = (await db.query(`SELECT * FROM ${T.station} WHERE "id" = $1`, [id]))[0];
        if (!current) throw fail('STATION_NOT_FOUND');
        const body = request?.body || {};
        const next = {
          name: body.name === undefined ? current.name : text(body.name, 'Station name', 80, true),
          place: body.place === undefined ? current.place : (text(body.place, 'Place', 120) || null),
          status: body.status === undefined ? current.status : String(body.status).toUpperCase(),
          mode: body.mode === undefined ? current.mode : String(body.mode).toUpperCase(),
          methods: body.methods === undefined ? jsonList(current.methods) : body.methods,
          classIds: body.classIds === undefined ? jsonList(current.classIds) : body.classIds,
        };
        if (!['PENDING', 'ACTIVE', 'REVOKED'].includes(next.status)) throw fail('INVALID_VALUE', 'status must be PENDING, ACTIVE or REVOKED');
        if (!MODES.includes(next.mode)) throw fail('INVALID_VALUE', 'mode must be AUTO, CHECK_IN or CHECK_OUT');
        if (!Array.isArray(next.methods) || !next.methods.length || next.methods.some((m) => !METHODS.includes(m))) throw fail('INVALID_VALUE', 'Choose at least one way to identify people: QR or NFC');
        if (!Array.isArray(next.classIds) || next.classIds.length > 200 || next.classIds.some((c) => typeof c !== 'string' || !c || c.length > 100)) throw fail('INVALID_VALUE', 'classIds must be a list of classes');
        const approving = next.status === 'ACTIVE' && current.status !== 'ACTIVE';
        if (current.kind === 'TERMINAL' && approving) throw fail('INVALID_VALUE', 'A terminal that was turned off needs a new key: use "New key"');
        if (current.kind === 'TERMINAL' && next.status === 'REVOKED' && current.credentialId && context.devices) await context.devices.revoke(current.credentialId);
        await db.execute(
          `UPDATE ${T.station} SET "name" = $2, "place" = $3, "status" = $4, "mode" = $5, "methods" = $6::jsonb, "classIds" = $7::jsonb,
             "approvedBy" = CASE WHEN $8 THEN $9 ELSE "approvedBy" END, "approvedAt" = CASE WHEN $8 THEN CURRENT_TIMESTAMP ELSE "approvedAt" END,
             "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          [id, next.name, next.place, next.status, next.mode, JSON.stringify([...new Set(next.methods)]), JSON.stringify([...new Set(next.classIds)]), approving, request.principal.userId]);
        return stationOut((await db.query(`SELECT * FROM ${T.station} WHERE "id" = $1`, [id]))[0]);
      },
    });
    // the classes a station can be limited to (from the people the stations know)
    register({
      method: 'GET', path: 'classes', permission: PERM.stations,
      handler: async () => {
        const counts = new Map();
        (await people(true)).list.forEach((p) => { if (p.active && p.classId) { const c = counts.get(p.classId) || { id: p.classId, name: p.className || p.classId, students: 0 }; c.students += 1; counts.set(p.classId, c); } });
        return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
      },
    });

    // ---------- captures ----------
    const captureById = async (id) => (await db.query(`SELECT * FROM ${T.capture} WHERE "id" = $1`, [id]))[0] || null;

    // Faces: every enrolled vector in memory (about 0.5 KB each), reloaded when enrolment changes.
    let faceIndex = { at: 0, rows: [] };
    const faces = async () => {
      if (Date.now() - faceIndex.at < 60_000) return faceIndex.rows;
      const rows = await db.query(
        `SELECT s."personId", s."vector", s."modelVersion" FROM ${T.faceSample} s JOIN ${T.faceConsent} c ON c."id" = s."consentId" AND c."withdrawnAt" IS NULL`);
      faceIndex = { at: Date.now(), rows: rows.map((r) => ({ personId: r.personId, vector: (r.vector || []).map(Number), modelVersion: r.modelVersion })) };
      return faceIndex.rows;
    };
    const forgetFaces = () => { faceIndex = { at: 0, rows: [] }; };
    const distance = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i += 1) { const d = a[i] - b[i]; sum += d * d; } return Math.sqrt(sum); };
    // The closest enrolled person, and how far ahead of the next person it is. Vectors of another face
    // model are never compared (a model change means enrolling again).
    const matchFace = async (descriptor, modelVersion) => {
      const best = new Map();
      for (const row of await faces()) {
        if (row.vector.length !== descriptor.length || (modelVersion && row.modelVersion !== modelVersion)) continue;
        const d = distance(descriptor, row.vector);
        if (!best.has(row.personId) || d < best.get(row.personId)) best.set(row.personId, d);
      }
      const ranked = [...best.entries()].sort((a, b) => a[1] - b[1]);
      if (!ranked.length) return null;
      return { personId: ranked[0][0], distance: ranked[0][1], margin: ranked.length > 1 ? ranked[1][1] - ranked[0][1] : 1 };
    };
    const vectorOf = (value) => (Array.isArray(value) && value.length === 128 && value.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 10) ? value : null);

    // One capture: who it is (card, QR code or face), the station's rules, the cool-down, the log, and
    // the event to Academic Management. Shared by stations, review confirmations and terminals.
    const takeCapture = async ({ station, clientKey, asked, source, code, descriptor, liveness, capturedAt, operatorId, confirmed, modelVersion }) => {
      const replay = (await db.query(`SELECT * FROM ${T.capture} WHERE "clientKey" = $1 LIMIT 1`, [clientKey]))[0];
      if (replay) {
        const known = replay.personId ? (await people()).byId.get(replay.personId) : null;
        return { ...captureOut(replay, known), photo: known ? await photoOf(known.id) : '' };
      }
      const config = await settings();
      const age = (Date.now() - capturedAt.getTime()) / 3600_000;
      if (age > config.maxOfflineHours) throw fail('CAPTURE_TOO_OLD');
      if (age < -0.1) throw fail('INVALID_VALUE', 'The capture time is in the future; check the station clock');
      const allowed = jsonList(station.methods);
      // an older Academic Management shares no student list: say so instead of 'not recognised' for everyone
      const directory = await people();
      if (!directory.list.length) throw fail('PEOPLE_UNAVAILABLE');
      let person = null, method = null, result = null, reason = null, score = null, margin = null;
      if (asked === 'FACE') {
        method = 'FACE';
        if (!allowed.includes('FACE')) { result = 'METHOD_NOT_ALLOWED'; reason = 'This station does not accept faces'; }
        else if (confirmed) {
          person = directory.byId.get(confirmed.personId) || null; score = confirmed.score; margin = confirmed.margin;
          if (!person) { result = 'UNKNOWN'; reason = 'This student ID is not known to the school'; }
        }
        else if (config.livenessRequired && !(liveness && liveness.passed === true)) { result = 'SPOOF_SUSPECTED'; reason = 'The liveness check was not passed: turn the head when asked'; }
        else {
          const match = await matchFace(descriptor, modelVersion);
          if (match) { score = Math.round(match.distance * 1000) / 1000; margin = Math.round(match.margin * 1000) / 1000; }
          if (match && match.distance <= config.faceAccept && match.margin >= config.faceMargin) person = directory.byId.get(match.personId) || null;
          else if (match && match.distance <= config.faceReview) { person = directory.byId.get(match.personId) || null; result = 'REVIEW'; reason = REVIEW_REASON; }
          else if (!match && modelVersion && (await faces()).length) { result = 'LOW_CONFIDENCE'; reason = 'Faces must be enrolled again for the new face model: use your card or QR code'; }
          else { result = 'LOW_CONFIDENCE'; reason = 'Face not recognised: use your card or QR code'; }
        }
      } else {
        if ((asked === 'NFC' || asked === 'AUTO') && allowed.includes('NFC') && normalizeUid(code)) {
          const card = (await db.query(`SELECT "personId" FROM ${T.card} WHERE "uidHmac" = $1 AND "status" = 'ACTIVE' LIMIT 1`, [cardHmac(code)]))[0];
          if (card) { person = directory.byId.get(card.personId) || null; method = 'NFC'; }
        }
        if (!person && (asked === 'QR' || asked === 'AUTO') && allowed.includes('QR')) {
          person = directory.byCode.get(sha256(code)) || null;
          if (person) method = 'QR';
        }
        if (!person && asked !== 'AUTO' && !allowed.includes(asked)) { result = 'METHOD_NOT_ALLOWED'; reason = `This station does not accept ${asked}`; }
      }
      if (!result) {
        result = person ? 'MATCHED' : 'UNKNOWN';
        reason = person ? null : 'Not recognised: this code or card is not registered';
      }
      const scope = jsonList(station.classIds);
      if (person && result === 'MATCHED' && scope.length && !scope.includes(person.classId)) { result = 'OUT_OF_SCOPE'; reason = `This station is not for ${person.className || 'this class'}`; }

      // the same person again within the cool-down: show the earlier result instead of recording twice
      let previous = null;
      if (result === 'MATCHED' && config.cooldownSeconds > 0) {
        previous = (await db.query(
          `SELECT * FROM ${T.capture} WHERE "personId" = $1 AND "result" = 'MATCHED' AND "capturedAt" > $2::timestamptz AND "capturedAt" <= $3::timestamptz ORDER BY "capturedAt" DESC LIMIT 1`,
          [person.id, new Date(capturedAt.getTime() - config.cooldownSeconds * 1000).toISOString(), capturedAt.toISOString()]))[0] || null;
        if (previous) { result = 'DUPLICATE'; reason = 'Already scanned a moment ago'; }
      }

      const id = crypto.randomUUID();
      const send = result === 'MATCHED';
      const codeHash = code ? sha256(code) : sha256(`${method || asked}:${clientKey}`);
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO ${T.capture} ("id", "clientKey", "stationId", "method", "source", "codeHash", "personType", "personId", "result", "status",
             "attendanceStatus", "session", "sessionType", "reason", "operatorId", "capturedAt", "resolvedAt", "score", "margin")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz, $17::timestamptz, $18, $19)`,
          [id, clientKey, station.id, method, source, codeHash, person ? 'STUDENT' : null, person ? person.id : null, result,
            send ? 'PENDING' : (previous ? previous.status : 'NOT_SENT'),
            previous ? previous.attendanceStatus : null, previous ? previous.session : null, previous ? previous.sessionType : null,
            reason, operatorId, capturedAt.toISOString(), send ? null : new Date().toISOString(), score, margin]);
        if (send) {
          await tx.publish({
            event: PRESENCE, version: 1, subjectKey: id, idempotencyKey: `presence-${id}`,
            payload: {
              captureId: id, personType: 'STUDENT', personId: person.id, stationId: station.id, method,
              // Academic Management keeps CAMERA or USB as the record's scan mode
              source: source === 'USB' ? 'USB' : 'CAMERA',
              capturedAt: capturedAt.toISOString(), direction: station.mode === 'AUTO' ? null : station.mode, classIds: scope,
            },
          });
        }
      });
      await db.execute(`UPDATE ${T.station} SET "lastSeenAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [station.id]);
      return { ...captureOut(await captureById(id), person), photo: person ? await photoOf(person.id) : '', previousCapturedAt: previous ? iso(previous.capturedAt) : null };
    };

    const activeStation = async (deviceId) => {
      const station = await stationByDevice(text(deviceId, 'deviceId', 200, true));
      if (!station) throw fail('STATION_NOT_FOUND');
      if (station.status !== 'ACTIVE') throw fail('STATION_NOT_ACTIVE');
      return station;
    };
    register({
      method: 'POST', path: 'captures', permission: PERM.operate,
      handler: async (request) => {
        const body = request?.body || {};
        const station = await activeStation(body.deviceId);
        const asked = String(body.method || 'AUTO').toUpperCase();
        const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date();
        if (Number.isNaN(capturedAt.getTime())) throw fail('INVALID_VALUE', 'capturedAt is not a valid time');
        const source = ['USB', 'PHONE'].includes(String(body.source || '').toUpperCase()) ? String(body.source).toUpperCase() : 'CAMERA';
        let code = null, descriptor = null;
        if (asked === 'FACE') {
          descriptor = vectorOf(body.descriptor);
          if (!descriptor) throw fail('FACE_INVALID');
        } else code = text(body.code, 'code', 512, true);
        const modelVersion = asked === 'FACE' && body.modelVersion ? text(body.modelVersion, 'modelVersion', 80) : null;
        return takeCapture({ station, clientKey: text(body.clientKey, 'clientKey', 120, true), asked, source, code, descriptor, liveness: body.liveness, capturedAt, operatorId: request.principal.userId, modelVersion });
      },
    });
    // A face match in the review band: the teacher at the station says yes (recorded) or no.
    register({
      method: 'POST', path: 'captures/:id/review', permission: PERM.operate,
      handler: async (request) => {
        const body = request?.body || {};
        const station = await activeStation(body.deviceId);
        const capture = await captureById(text(request?.params?.id, 'id', 100, true));
        if (!capture || capture.stationId !== station.id || capture.result !== 'REVIEW' || Date.now() - new Date(capture.receivedAt).getTime() > 10 * 60_000) throw fail('CAPTURE_NOT_REVIEWABLE');
        const answer = body.confirm === true;
        // claimed once: a second answer (another tap, another tab) finds it already decided
        const claimed = await db.execute(`UPDATE ${T.capture} SET "reason" = $2, "resolvedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "result" = 'REVIEW' AND "reason" = $3`,
          [capture.id, answer ? 'Confirmed by the teacher' : 'The teacher said this is not the person', REVIEW_REASON]);
        if (!claimed || !claimed.count) throw fail('CAPTURE_NOT_REVIEWABLE');
        if (!answer) return captureOut(await captureById(capture.id), null);
        return takeCapture({
          station, clientKey: `review-${capture.id}`, asked: 'FACE', source: capture.source, code: null, descriptor: null, liveness: null,
          capturedAt: new Date(capture.capturedAt), operatorId: request.principal.userId,
          confirmed: { personId: capture.personId, score: capture.score, margin: capture.margin },
        });
      },
    });
    // the station asks for its capture's result (Academic Management answers within about a second)
    register({
      method: 'GET', path: 'captures/:id', permission: PERM.operate,
      handler: async (request) => {
        const row = await captureById(text(request?.params?.id, 'id', 100, true));
        if (!row) throw fail('INVALID_VALUE', 'Capture not found');
        return captureOut(row, row.personId ? (await people()).byId.get(row.personId) : null);
      },
    });
    // the live monitor and capture log: the captures received in a time range (default: the last 24 hours)
    register({
      method: 'GET', path: 'captures', permission: PERM.view,
      handler: async (request) => {
        const q = request?.query || {};
        const to = q.to ? new Date(q.to) : new Date();
        const from = q.from ? new Date(q.from) : new Date(to.getTime() - 24 * 3600 * 1000);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw fail('INVALID_VALUE', 'from and to must be valid times');
        const params = [from.toISOString(), to.toISOString()];
        let where = `c."receivedAt" BETWEEN $1::timestamptz AND $2::timestamptz`;
        if (q.stationId) { params.push(String(q.stationId)); where += ` AND c."stationId" = $${params.length}`; }
        if (q.status) { params.push(String(q.status).toUpperCase()); where += ` AND c."status" = $${params.length}`; }
        const rows = await db.query(
          `SELECT c.*, s."name" AS "stationName" FROM ${T.capture} c JOIN ${T.station} s ON s."id" = c."stationId" WHERE ${where} ORDER BY c."receivedAt" DESC LIMIT 500`, params);
        const directory = await people();
        const items = rows.map((row) => ({ ...captureOut(row, row.personId ? directory.byId.get(row.personId) : null), stationName: row.stationName }));
        const totals = {};
        items.forEach((item) => { totals[item.status] = (totals[item.status] || 0) + 1; });
        return { from: params[0], to: params[1], items, totals };
      },
    });

    // ---------- NFC cards ----------
    register({
      method: 'GET', path: 'people', permission: PERM.cards,
      handler: async (request) => {
        const term = String(request?.query?.search || '').trim().toLowerCase();
        const classId = String(request?.query?.classId || '');
        const directory = await people(true);
        const found = directory.list.filter((p) => p.active && (!classId || p.classId === classId)
          && (!term || [p.number, p.name, p.nameKh, p.className].some((v) => String(v || '').toLowerCase().includes(term)))).slice(0, 60);
        const cards = found.length ? await db.query(`SELECT "id", "personId", "uidLast4", "issuedAt" FROM ${T.card} WHERE "status" = 'ACTIVE' AND "personId" = ANY($1::text[])`, [found.map((p) => p.id)]) : [];
        const cardOf = new Map(cards.map((c) => [c.personId, c]));
        return found.map((p) => ({ id: p.id, number: p.number, name: p.name, nameKh: p.nameKh, classId: p.classId, className: p.className,
          card: cardOf.has(p.id) ? { id: cardOf.get(p.id).id, last4: cardOf.get(p.id).uidLast4, issuedAt: iso(cardOf.get(p.id).issuedAt) } : null }));
      },
    });
    register({
      method: 'GET', path: 'cards', permission: PERM.cards,
      handler: async (request) => {
        const q = request?.query || {};
        const params = []; let where = 'TRUE';
        if (q.personId) { params.push(String(q.personId)); where += ` AND "personId" = $${params.length}`; }
        if (q.status) { params.push(String(q.status).toUpperCase()); where += ` AND "status" = $${params.length}`; }
        const rows = await db.query(`SELECT "id", "personId", "uidLast4", "status", "issuedAt", "endedAt" FROM ${T.card} WHERE ${where} ORDER BY "issuedAt" DESC LIMIT 500`, params);
        const directory = await people();
        return rows.map((c) => { const p = directory.byId.get(c.personId); return { id: c.id, personId: c.personId, last4: c.uidLast4, status: c.status, issuedAt: iso(c.issuedAt), endedAt: iso(c.endedAt), person: p ? { number: p.number, name: p.name, nameKh: p.nameKh, className: p.className } : null }; });
      },
    });
    register({
      method: 'POST', path: 'cards', permission: PERM.cards,
      handler: async (request) => {
        const body = request?.body || {};
        const personId = text(body.personId, 'personId', 100, true);
        const uid = normalizeUid(text(body.uid, 'Card number', 100, true));
        if (uid.length < 4) throw fail('INVALID_VALUE', 'The card number is too short; tap the card on the reader again');
        const person = (await people(true)).byId.get(personId);
        if (!person) throw fail('PERSON_NOT_FOUND');
        const hmac = cardHmac(uid);
        const holder = (await db.query(`SELECT "id", "personId" FROM ${T.card} WHERE "uidHmac" = $1 AND "status" = 'ACTIVE' LIMIT 1`, [hmac]))[0];
        if (holder && holder.personId !== personId) {
          const other = cache.byId.get(holder.personId);
          throw fail('CARD_TAKEN', `This card already belongs to ${other ? `${other.nameKh || other.name} (${other.number})` : 'another student'}`);
        }
        if (holder) return { id: holder.id, personId, last4: uid.slice(-4), status: 'ACTIVE', unchanged: true };
        const id = crypto.randomUUID();
        await db.transaction(async (tx) => {
          // one active card per person: the old one is replaced
          await tx.execute(`UPDATE ${T.card} SET "status" = 'REPLACED', "endedAt" = CURRENT_TIMESTAMP, "endedBy" = $2 WHERE "personId" = $1 AND "status" = 'ACTIVE'`, [personId, request.principal.userId]);
          await tx.execute(`INSERT INTO ${T.card} ("id", "personType", "personId", "uidHmac", "uidLast4", "issuedBy") VALUES ($1, 'STUDENT', $2, $3, $4, $5)`, [id, personId, hmac, uid.slice(-4), request.principal.userId]);
        });
        return { id, personId, last4: uid.slice(-4), status: 'ACTIVE' };
      },
    });
    register({
      method: 'PUT', path: 'cards/:id', permission: PERM.cards,
      handler: async (request) => {
        const id = text(request?.params?.id, 'id', 100, true);
        const status = String(request?.body?.status || '').toUpperCase();
        if (!['LOST', 'RETURNED'].includes(status)) throw fail('INVALID_VALUE', 'status must be LOST or RETURNED');
        const card = (await db.query(`SELECT * FROM ${T.card} WHERE "id" = $1`, [id]))[0];
        if (!card) throw fail('CARD_NOT_FOUND');
        if (card.status === 'ACTIVE') await db.execute(`UPDATE ${T.card} SET "status" = $2, "endedAt" = CURRENT_TIMESTAMP, "endedBy" = $3 WHERE "id" = $1`, [id, status, request.principal.userId]);
        const row = (await db.query(`SELECT "id", "personId", "uidLast4", "status", "issuedAt", "endedAt" FROM ${T.card} WHERE "id" = $1`, [id]))[0];
        return { id: row.id, personId: row.personId, last4: row.uidLast4, status: row.status, issuedAt: iso(row.issuedAt), endedAt: iso(row.endedAt) };
      },
    });

    // ---------- terminals: hardware that calls the plugin with a device key ----------
    const TERMINAL_HELP = (token) => ({
      token,
      endpoint: `/api/plugin-device/${ID}/terminal/events`,
      header: 'Authorization: Bearer <key>',
      body: '{ "events": [ { "eventId": "unique-per-event", "time": "2026-11-20T07:05:00+07:00", "method": "FACE" | "NFC" | "QR", "studentNumber": "0001" (FACE), "card": "04A1B2C3" (NFC), "code": "…" (QR) } ] }',
    });
    const issueKey = async (name) => {
      if (!context.devices) throw fail('TERMINALS_UNAVAILABLE');
      return context.devices.issue({ name, scope: 'terminal' });
    };
    register({
      method: 'POST', path: 'terminals', permission: PERM.stations,
      handler: async (request) => {
        const body = request?.body || {};
        const name = text(body.name, 'Terminal name', 80, true);
        const methods = Array.isArray(body.methods) && body.methods.length ? body.methods : ['FACE', 'NFC'];
        if (methods.some((m) => !METHODS.includes(m))) throw fail('INVALID_VALUE', 'Choose what the terminal sends: FACE, NFC or QR');
        const key = await issueKey(name);
        const id = crypto.randomUUID();
        await db.execute(
          `INSERT INTO ${T.station} ("id", "name", "place", "deviceIdHash", "status", "methods", "kind", "credentialId", "requestedBy", "approvedBy", "approvedAt")
           VALUES ($1, $2, $3, $4, 'ACTIVE', $5::jsonb, 'TERMINAL', $6, $7, $7, CURRENT_TIMESTAMP)`,
          [id, name, text(body.place, 'Place', 120) || null, sha256(`${ID}:terminal:${key.id}`), JSON.stringify([...new Set(methods)]), key.id, request.principal.userId]);
        return { station: stationOut((await db.query(`SELECT * FROM ${T.station} WHERE "id" = $1`, [id]))[0]), ...TERMINAL_HELP(key.token) };
      },
    });
    // a new key for a terminal (lost, leaked, or the terminal was turned off): the old key stops at once
    register({
      method: 'POST', path: 'terminals/:id/key', permission: PERM.stations,
      handler: async (request) => {
        const id = text(request?.params?.id, 'id', 100, true);
        const station = (await db.query(`SELECT * FROM ${T.station} WHERE "id" = $1`, [id]))[0];
        if (!station) throw fail('STATION_NOT_FOUND');
        if (station.kind !== 'TERMINAL') throw fail('NOT_A_TERMINAL');
        const key = await issueKey(station.name);
        if (station.credentialId) await context.devices.revoke(station.credentialId);
        await db.execute(`UPDATE ${T.station} SET "credentialId" = $2, "deviceIdHash" = $3, "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          [id, key.id, sha256(`${ID}:terminal:${key.id}`)]);
        return { station: stationOut((await db.query(`SELECT * FROM ${T.station} WHERE "id" = $1`, [id]))[0]), ...TERMINAL_HELP(key.token) };
      },
    });
    const terminalOf = async (request) => {
      const credentialId = String(request?.principal?.userId || '').replace(/^device:/, '');
      const station = (await db.query(`SELECT * FROM ${T.station} WHERE "credentialId" = $1 LIMIT 1`, [credentialId]))[0];
      if (!station) throw fail('STATION_NOT_FOUND');
      if (station.status !== 'ACTIVE') throw fail('STATION_NOT_ACTIVE');
      return station;
    };
    // the terminal's events (at most 100 at a time; each eventId once — a resend returns the same answer)
    context.routes.register({
      method: 'POST', path: 'terminal/events', permission: PERM.stations, access: 'device', contract: CONTRACT,
      handler: async (request) => {
        const station = await terminalOf(request);
        const events = Array.isArray(request?.body?.events) ? request.body.events : [];
        if (!events.length || events.length > 100) throw fail('INVALID_VALUE', 'Send 1 to 100 events');
        const directory = await people();
        const results = [];
        for (const event of events) {
          const eventId = String((event && event.eventId) || '').trim();
          try {
            if (!/^[A-Za-z0-9._:-]{1,80}$/.test(eventId)) throw fail('INVALID_VALUE', 'eventId must be 1-80 letters, digits or . _ : -');
            const method = String(event.method || '').toUpperCase();
            const capturedAt = event.time ? new Date(event.time) : new Date();
            if (Number.isNaN(capturedAt.getTime())) throw fail('INVALID_VALUE', 'time is not valid');
            const base = { station, clientKey: `terminal:${station.id}:${eventId}`, source: 'TERMINAL', liveness: null, descriptor: null, capturedAt, operatorId: request.principal.userId };
            let capture;
            if (method === 'FACE') {
              // the terminal recognised the face itself and sends the student ID it matched
              const number = text(event.studentNumber, 'studentNumber', 100, true);
              const person = directory.list.find((p) => p.number === number && p.active);
              capture = await takeCapture({ ...base, asked: 'FACE', code: null, confirmed: person ? { personId: person.id, score: null, margin: null } : { personId: '__unknown__' } });
            } else if (method === 'NFC') capture = await takeCapture({ ...base, asked: 'NFC', code: text(event.card, 'card', 100, true) });
            else if (method === 'QR') capture = await takeCapture({ ...base, asked: 'QR', code: text(event.code, 'code', 512, true) });
            else throw fail('INVALID_VALUE', 'method must be FACE, NFC or QR');
            results.push({ eventId, captureId: capture.id, result: capture.result, status: capture.status, studentNumber: capture.person ? capture.person.number : null, reason: capture.reason });
          } catch (error) {
            results.push({ eventId, error: error && error.isPluginContractError ? error.message : 'The event could not be saved' });
            if (!(error && error.isPluginContractError)) context.logger.error ? context.logger.error(`terminal event failed: ${error && error.message}`) : undefined;
          }
        }
        return { station: station.name, received: events.length, results };
      },
    });
    // who the terminal may expect (to load names into it): no photos, no faces
    context.routes.register({
      method: 'GET', path: 'terminal/people', permission: PERM.stations, access: 'device', contract: CONTRACT,
      handler: async (request) => {
        const station = await terminalOf(request);
        const scope = jsonList(station.classIds);
        return (await people(true)).list.filter((p) => p.active && (!scope.length || scope.includes(p.classId)))
          .map((p) => ({ studentNumber: p.number, name: p.name, nameKh: p.nameKh, className: p.className }));
      },
    });

    // ---------- faces: consent first, then enrolment ----------
    const activeConsent = async (personId) => (await db.query(
      `SELECT * FROM ${T.faceConsent} WHERE "personId" = $1 AND "withdrawnAt" IS NULL ORDER BY "givenAt" DESC LIMIT 1`, [personId]))[0] || null;
    const consentOut = (c) => c && { id: c.id, givenBy: c.givenBy, relation: c.relation, method: c.method, documentRef: c.documentRef || '', note: c.note || '', givenAt: iso(c.givenAt) };
    register({
      method: 'GET', path: 'faces/people', permission: PERM.enroll,
      handler: async (request) => {
        const term = String(request?.query?.search || '').trim().toLowerCase();
        const classId = String(request?.query?.classId || '');
        const directory = await people(true);
        const found = directory.list.filter((p) => p.active && (!classId || p.classId === classId)
          && (!term || [p.number, p.name, p.nameKh, p.className].some((v) => String(v || '').toLowerCase().includes(term)))).slice(0, 60);
        const ids = found.map((p) => p.id);
        const consents = ids.length ? await db.query(`SELECT * FROM ${T.faceConsent} WHERE "withdrawnAt" IS NULL AND "personId" = ANY($1::text[])`, [ids]) : [];
        const samples = ids.length ? await db.query(`SELECT "personId", COUNT(*)::int AS "count", MAX("createdAt") AS "at", MAX("modelVersion") AS "modelVersion" FROM ${T.faceSample} WHERE "personId" = ANY($1::text[]) GROUP BY "personId"`, [ids]) : [];
        const latest = (await db.query(`SELECT "modelVersion" FROM ${T.faceSample} ORDER BY "createdAt" DESC LIMIT 1`))[0];
        const consentOf = new Map(consents.map((c) => [c.personId, c]));
        const sampleOf = new Map(samples.map((s) => [s.personId, s]));
        return found.map((p) => ({
          id: p.id, number: p.number, name: p.name, nameKh: p.nameKh, classId: p.classId, className: p.className,
          consent: consentOut(consentOf.get(p.id)) || null,
          samples: sampleOf.has(p.id) ? sampleOf.get(p.id).count : 0, enrolledAt: sampleOf.has(p.id) ? iso(sampleOf.get(p.id).at) : null,
          reenrol: Boolean(latest && sampleOf.has(p.id) && sampleOf.get(p.id).modelVersion !== latest.modelVersion),
        }));
      },
    });
    // how far each class is: students, consents, enrolled faces
    register({
      method: 'GET', path: 'faces/coverage', permission: PERM.enroll,
      handler: async () => {
        const directory = await people(true);
        const consents = new Set((await db.query(`SELECT DISTINCT "personId" FROM ${T.faceConsent} WHERE "withdrawnAt" IS NULL`)).map((r) => r.personId));
        const enrolled = new Set((await db.query(`SELECT DISTINCT s."personId" FROM ${T.faceSample} s`)).map((r) => r.personId));
        const classes = new Map();
        directory.list.filter((p) => p.active && p.classId).forEach((p) => {
          const c = classes.get(p.classId) || { id: p.classId, name: p.className || p.classId, students: 0, consents: 0, enrolled: 0 };
          c.students += 1; if (consents.has(p.id)) c.consents += 1; if (enrolled.has(p.id)) c.enrolled += 1;
          classes.set(p.classId, c);
        });
        return [...classes.values()].sort((a, b) => a.name.localeCompare(b.name));
      },
    });
    register({
      method: 'POST', path: 'faces/consents', permission: PERM.enroll,
      handler: async (request) => {
        const body = request?.body || {};
        const personId = text(body.personId, 'personId', 100, true);
        if (!(await people(true)).byId.has(personId)) throw fail('PERSON_NOT_FOUND');
        const method = String(body.method || '').toUpperCase();
        if (!['PAPER', 'DIGITAL'].includes(method)) throw fail('INVALID_VALUE', 'How was consent given: PAPER or DIGITAL');
        const existing = await activeConsent(personId);
        if (existing) return consentOut(existing);
        const id = crypto.randomUUID();
        await db.execute(
          `INSERT INTO ${T.faceConsent} ("id", "personType", "personId", "givenBy", "relation", "method", "documentRef", "note", "recordedBy") VALUES ($1, 'STUDENT', $2, $3, $4, $5, $6, $7, $8)`,
          [id, personId, text(body.givenBy, 'Given by', 160, true), text(body.relation, 'Relation', 60, true), method,
            text(body.documentRef, 'Document reference', 200) || null, text(body.note, 'Note', 500) || null, request.principal.userId]);
        return consentOut((await db.query(`SELECT * FROM ${T.faceConsent} WHERE "id" = $1`, [id]))[0]);
      },
    });
    // withdrawing consent deletes the person's face vectors at once
    register({
      method: 'POST', path: 'faces/consents/:id/withdraw', permission: PERM.faces,
      handler: async (request) => {
        const id = text(request?.params?.id, 'id', 100, true);
        const consent = (await db.query(`SELECT * FROM ${T.faceConsent} WHERE "id" = $1`, [id]))[0];
        if (!consent) throw fail('CONSENT_NOT_FOUND');
        let deleted = 0;
        await db.transaction(async (tx) => {
          deleted = (await tx.execute(`DELETE FROM ${T.faceSample} WHERE "personId" = $1`, [consent.personId])).count || 0;
          await tx.execute(`UPDATE ${T.faceConsent} SET "withdrawnAt" = COALESCE("withdrawnAt", CURRENT_TIMESTAMP), "withdrawnBy" = COALESCE("withdrawnBy", $2) WHERE "personId" = $1 AND "withdrawnAt" IS NULL`, [consent.personId, request.principal.userId]);
        });
        forgetFaces();
        return { personId: consent.personId, withdrawn: true, deletedSamples: deleted };
      },
    });
    // enrolment: the vectors the school page took (3 to 5), replacing any earlier ones
    register({
      method: 'POST', path: 'faces/samples', permission: PERM.enroll,
      handler: async (request) => {
        const body = request?.body || {};
        const personId = text(body.personId, 'personId', 100, true);
        const consent = await activeConsent(personId);
        if (!consent) throw fail('NO_CONSENT');
        const vectors = Array.isArray(body.descriptors) ? body.descriptors.map(vectorOf) : [];
        if (vectors.length < 1 || vectors.length > 5 || vectors.some((v) => !v)) throw fail('FACE_INVALID');
        if ((await settings()).livenessRequired && !(body.liveness && body.liveness.passed === true)) throw fail('INVALID_VALUE', 'The liveness check was not passed: turn the head when asked');
        const modelVersion = text(body.modelVersion, 'modelVersion', 80, true);
        const quality = Number(body.quality && body.quality.score);
        await db.transaction(async (tx) => {
          await tx.execute(`DELETE FROM ${T.faceSample} WHERE "personId" = $1`, [personId]);
          for (const vector of vectors) {
            await tx.execute(`INSERT INTO ${T.faceSample} ("id", "personType", "personId", "consentId", "modelVersion", "vector", "quality", "createdBy") VALUES ($1, 'STUDENT', $2, $3, $4, $5::real[], $6, $7)`,
              [crypto.randomUUID(), personId, consent.id, modelVersion, `{${vector.join(',')}}`, Number.isFinite(quality) ? quality : null, request.principal.userId]);
          }
        });
        forgetFaces();
        // the same face already enrolled for someone else: tell the person enrolling
        const others = (await faces()).filter((row) => row.personId !== personId);
        let closest = null;
        for (const row of others) for (const v of vectors) { const d = distance(v, row.vector); if (!closest || d < closest.d) closest = { personId: row.personId, d }; }
        const config = await settings();
        const twin = closest && closest.d <= config.faceAccept ? (await people()).byId.get(closest.personId) : null;
        return { personId, samples: vectors.length, warning: twin ? `This face is very close to ${twin.nameKh || twin.name} (${twin.number}); stations may ask a teacher to confirm.` : null };
      },
    });
    register({
      method: 'DELETE', path: 'faces/samples/:personId', permission: PERM.faces,
      handler: async (request) => {
        const personId = text(request?.params?.personId, 'personId', 100, true);
        const deleted = (await db.execute(`DELETE FROM ${T.faceSample} WHERE "personId" = $1`, [personId])).count || 0;
        forgetFaces();
        return { personId, deletedSamples: deleted };
      },
    });

    // ---------- settings ----------
    register({ method: 'GET', path: 'settings', permission: PERM.configure, handler: () => settings() });
    register({
      method: 'PUT', path: 'settings', permission: PERM.configure,
      handler: async (request) => {
        const body = request?.body || {};
        for (const [name, [key, , min, max, integer]] of Object.entries(SETTINGS)) {
          if (body[name] === undefined) continue;
          const value = Number(body[name]);
          if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw fail('INVALID_VALUE', `${name} must be ${integer ? 'a whole number ' : ''}from ${min} to ${max}`);
          await context.settings.set(key, value);
        }
        if (body.livenessRequired !== undefined) await context.settings.set('liveness-required', body.livenessRequired === true);
        return settings();
      },
    });

    // ---------- Academic Management's answer to a capture ----------
    context.durableEvents.subscribe({
      id: 'station-result', event: RESULT, versions: [1],
      handler: async (event) => {
        const p = (event && event.payload) || {};
        if (!p.captureId) return;
        const status = ['RECORDED', 'ALREADY_RECORDED', 'REJECTED'].includes(p.outcome) ? p.outcome : 'REJECTED';
        const record = p.record || {};
        await db.execute(
          `UPDATE ${T.capture} SET "status" = $2, "attendanceStatus" = $3, "attendanceRecordId" = $4, "session" = $5, "sessionType" = $6, "reason" = $7, "resolvedAt" = CURRENT_TIMESTAMP
            WHERE "id" = $1 AND "status" = 'PENDING'`,
          [p.captureId, status, record.status || null, record.id || null, Number.isInteger(record.session) ? record.session : null, record.type || null,
            status === 'REJECTED' ? String(p.reason || 'Not recorded').slice(0, 300) : null]);
      },
    });
    context.logger.log('Smart Attendance activated');
  },
};
