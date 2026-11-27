'use strict';

// Pictures and recordings of exam questions (drag and drop backgrounds, dictation audio).
// A screen request carries at most 256 KiB, so a file is uploaded in parts: POST media announces it,
// PUT media/:id/parts/:index sends each base64 part, GET returns the whole file as a data URL once
// every part is there. Questions refer to a file as "media:<id>"; students read it only for an exam
// of their class while it is open.

const { isAdmin } = require('./roles');
const { randomUUID } = require('crypto');
const { fail } = require('./errors');
const EXAM = 'plugin_wattanam_examination_exam';
const QUESTION = 'plugin_wattanam_examination_question';
const MEDIA = 'plugin_wattanam_examination_media';
const PART = 'plugin_wattanam_examination_media_part';
const LIMITS = { IMAGE: 2 * 1024 * 1024, AUDIO: 6 * 1024 * 1024 };
const MIMES = { IMAGE: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], AUDIO: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/x-m4a'] };
const PART_CHARS = 190000;
const REF = /^media:([0-9a-f-]{36})$/;

const uuid = (value, label) => { if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/.test(value)) throw fail('INVALID_VALUE', `${label} is invalid`); return value; };
const plainId = (value, label) => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw fail('INVALID_VALUE', `${label} is invalid`); return value; };

/** Every media id a question's data refers to. */
function mediaRefs(data) {
  const refs = [];
  const visit = (value) => {
    if (typeof value === 'string') { const match = REF.exec(value); if (match) refs.push(match[1]); }
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(data);
  return refs;
}

async function assemble(db, media) {
  const parts = await db.query(`SELECT "index","data" FROM ${PART} WHERE "mediaId"=$1 ORDER BY "index"`, [media.id]);
  const complete = parts.length === Number(media.parts) && parts.every((part, index) => Number(part.index) === index);
  return { id: media.id, kind: media.kind, mime: media.mime, bytes: Number(media.bytes), complete, dataUrl: complete ? `data:${media.mime};base64,${parts.map((part) => part.data).join('')}` : null };
}

function registerMedia(context) {
  const db = context.database;
  const view = 'wattanam.examination.exams.view';
  const manage = 'wattanam.examination.exams.manage';
  const take = 'wattanam.examination.attempts.take';

  const examFor = async (examId) => {
    const rows = await db.query(`SELECT "id","status","academicClassId","createdByDirectoryUserId" FROM ${EXAM} WHERE "id"=$1`, [plainId(examId, 'examId')]);
    if (!rows.length) throw fail('NOT_FOUND', 'Exam not found');
    return rows[0];
  };
  const mayChange = (exam, principal) => {
    if (!isAdmin(principal) && exam.createdByDirectoryUserId !== principal?.userId) throw fail('FORBIDDEN', 'Only the exam creator or an administrator may change this exam');
  };
  const mediaRow = async (mediaId) => {
    const rows = await db.query(`SELECT * FROM ${MEDIA} WHERE "id"=$1`, [uuid(mediaId, 'media id')]);
    if (!rows.length) throw fail('NOT_FOUND', 'Media not found');
    return rows[0];
  };

  context.routes.register({ method: 'POST', path: 'media', permission: manage, handler: async (request) => {
    const body = request?.body || {};
    const exam = await examFor(body.examId); mayChange(exam, request?.principal);
    const kind = String(body.kind || '').toUpperCase();
    if (!LIMITS[kind]) throw fail('INVALID_VALUE', 'kind must be IMAGE or AUDIO');
    const mime = String(body.mime || '').toLowerCase();
    if (!MIMES[kind].includes(mime)) throw fail('INVALID_VALUE', kind === 'IMAGE' ? 'Pictures must be PNG, JPEG, WebP or GIF' : 'Recordings must be MP3, WAV, OGG, WebM, M4A or AAC');
    const bytes = Number(body.bytes);
    if (!Number.isInteger(bytes) || bytes < 1) throw fail('INVALID_VALUE', 'bytes is invalid');
    if (bytes > LIMITS[kind]) throw fail('TOO_LARGE', `${kind === 'IMAGE' ? 'A picture' : 'A recording'} may be at most ${LIMITS[kind] / 1024 / 1024} MB`);
    const parts = Number(body.parts);
    if (!Number.isInteger(parts) || parts < 1 || parts > 64 || parts < Math.ceil((Math.ceil(bytes / 3) * 4) / PART_CHARS)) throw fail('INVALID_VALUE', 'parts is invalid');
    const id = randomUUID();
    await db.execute(`INSERT INTO ${MEDIA} ("id","examId","kind","mime","bytes","parts","createdByDirectoryUserId") VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, exam.id, kind, mime, bytes, parts, request.principal.userId]);
    return { id, ref: `media:${id}`, partChars: PART_CHARS };
  }});

  context.routes.register({ method: 'PUT', path: 'media/:id/parts/:index', permission: manage, handler: async (request) => {
    const media = await mediaRow(request?.params?.id);
    mayChange(await examFor(media.examId), request?.principal);
    const index = Number(request?.params?.index);
    if (!Number.isInteger(index) || index < 0 || index >= Number(media.parts)) throw fail('INVALID_VALUE', 'part index is invalid');
    const data = String(request?.body?.data || '');
    if (!data || data.length > PART_CHARS || !/^[A-Za-z0-9+/]+=*$/.test(data)) throw fail('INVALID_VALUE', 'part data must be base64 of at most 190000 characters');
    await db.execute(`INSERT INTO ${PART} ("mediaId","index","data") VALUES ($1,$2,$3) ON CONFLICT ("mediaId","index") DO UPDATE SET "data"=EXCLUDED."data"`, [media.id, index, data]);
    const stored = await db.query(`SELECT COUNT(*)::int AS "count" FROM ${PART} WHERE "mediaId"=$1`, [media.id]);
    return { id: media.id, index, complete: Number(stored[0].count) === Number(media.parts) };
  }});

  // staff: the exam's creator, an administrator, or a teacher of the exam's class
  context.routes.register({ method: 'GET', path: 'media/:id', permission: view, handler: async (request) => {
    const media = await mediaRow(request?.params?.id); const exam = await examFor(media.examId); const principal = request?.principal || {};
    if (!isAdmin(principal) && exam.createdByDirectoryUserId !== principal.userId) {
      const classes = await context.directory.classesForUser(principal.userId, principal.role);
      if (!exam.academicClassId || !classes.includes(exam.academicClassId)) throw fail('FORBIDDEN', 'Exam is outside your assigned classes');
    }
    return assemble(db, media);
  }});

  // students: only a file one of the exam's questions uses, while the exam is open to their class
  context.routes.register({ method: 'GET', path: 'student/media/:id', permission: take, handler: async (request) => {
    const media = await mediaRow(request?.params?.id); const exam = await examFor(media.examId);
    if (!['PUBLISHED', 'ACTIVE'].includes(exam.status)) throw fail('CONFLICT', 'This exam is not open');
    if (exam.academicClassId) {
      const classes = await context.directory.classesForUser(plainId(request?.principal?.userId, 'principal.userId'), 'STUDENT');
      if (!classes.includes(exam.academicClassId)) throw fail('FORBIDDEN', 'Exam is outside your assigned classes');
    }
    const used = await db.query(`SELECT "id" FROM ${QUESTION} WHERE "examId"=$1 AND "data"::text LIKE $2 LIMIT 1`, [exam.id, `%media:${media.id}%`]);
    if (!used.length) throw fail('NOT_FOUND', 'Media not found');
    return assemble(db, media);
  }});
}

/** Removes an exam's files that none of its questions uses any more (after the editor saves). */
async function dropUnusedMedia(tx, examId, questions) {
  const used = new Set(questions.flatMap((question) => mediaRefs(question.data)));
  const rows = await tx.query(`SELECT "id" FROM ${MEDIA} WHERE "examId"=$1`, [examId]);
  const unused = rows.map((row) => row.id).filter((id) => !used.has(id));
  if (unused.length) await tx.execute(`DELETE FROM ${MEDIA} WHERE "examId"=$1 AND "id" = ANY($2::text[])`, [examId, unused]);
  return unused.length;
}

module.exports = { registerMedia, dropUnusedMedia, mediaRefs, PART_CHARS, LIMITS };
