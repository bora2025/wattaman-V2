'use strict';

const { randomUUID } = require('crypto');
const { registerAttempts } = require('./attempts');
const { registerGradebooks } = require('./gradebooks');
const { QUESTION_TYPES, sanitizeQuestionData } = require('./question-types');
const EXAM = 'plugin_wattanam_examination_exam';
const QUESTION = 'plugin_wattanam_examination_question';
const EXAM_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'ACTIVE', 'COMPLETED']);

function id(value, label = 'id') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error(`${label} is invalid`);
  return value;
}
function text(value, label, max = 500, optional = false) {
  if ((value == null || value === '') && optional) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} is required (maximum ${max} characters)`);
  return value.trim();
}
function number(value, label, minimum, fallback) {
  const parsed = value == null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) throw new Error(`${label} must be at least ${minimum}`);
  return parsed;
}
function integer(value, label, minimum, fallback) {
  const parsed = number(value, label, minimum, fallback);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}
function timestamp(value, label) {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be an ISO timestamp`);
  return parsed.toISOString();
}
function questionInput(body) {
  const type = String(body?.type || 'MCQ').toUpperCase();
  if (!QUESTION_TYPES.has(type)) throw new Error('question type is invalid');
  const marks = type === 'TEXT' ? 0 : number(body?.marks, 'marks', 0, 1);
  return { text: text(body?.text, 'question text', 10000), type, data: JSON.stringify(sanitizeQuestionData(type, body?.data || {})), marks, order: integer(body?.order, 'order', 0, 0), section: text(body?.section, 'section', 200, true) };
}
function examInput(body, partial = false) {
  const result = {};
  const set = (key, parser) => { if (!partial || body?.[key] !== undefined) result[key] = parser(body?.[key]); };
  set('title', (value) => text(value, 'title', 300)); set('description', (value) => text(value, 'description', 10000, true));
  set('academicClassId', (value) => value == null || value === '' ? null : id(value, 'academicClassId'));
  set('startTime', (value) => timestamp(value, 'startTime')); set('endTime', (value) => timestamp(value, 'endTime'));
  set('duration', (value) => integer(value, 'duration', 1, 60)); set('totalMarks', (value) => number(value, 'totalMarks', 0, 100));
  set('passMark', (value) => number(value, 'passMark', 0, 50)); set('maxAttempts', (value) => integer(value, 'maxAttempts', 0, 1));
  if (result.startTime && result.endTime && result.endTime < result.startTime) throw new Error('endTime must not precede startTime');
  return result;
}
async function validateReferences(context, values, principal) {
  const userId = id(principal?.userId, 'principal.userId');
  const users = await context.directory.lookupUsers([userId]);
  if (users.length !== 1 || users[0].id !== userId) throw new Error('Creator is not available through the core directory');
  if (values.academicClassId) {
    const classes = await context.directory.lookupClasses([values.academicClassId]);
    if (classes.length !== 1 || classes[0].id !== values.academicClassId) throw new Error('academicClassId is not available through the Academic directory');
  }
}
async function ownedExam(db, examId, principal) {
  const rows = await db.query(`SELECT * FROM ${EXAM} WHERE "id"=$1`, [id(examId)]);
  if (!rows.length) throw new Error('Exam not found');
  if (principal?.role !== 'ADMIN' && rows[0].createdByDirectoryUserId !== principal?.userId) throw new Error('Only the exam creator or an administrator may change this exam');
  return rows[0];
}

module.exports = {
  id: 'wattanam.examination',
  async activate(context) {
    const db = context.database; const view = 'wattanam.examination.exams.view'; const manage = 'wattanam.examination.exams.manage';
    context.permissions.register([
      { id: view, label: 'View examinations' }, { id: manage, label: 'Manage examinations' },
      { id: 'wattanam.examination.attempts.take', label: 'Take examinations' }, { id: 'wattanam.examination.attempts.grade', label: 'Grade examination attempts' },
      { id: 'wattanam.examination.gradebook.view', label: 'View gradebooks' }, { id: 'wattanam.examination.gradebook.manage', label: 'Manage gradebooks' },
    ]);
    context.navigation.register([
      { id: 'exams', label: 'Examinations', href: '/plugins/wattanam.examination/exams', permission: view },
      { id: 'gradebooks', label: 'Gradebooks', href: '/plugins/wattanam.examination/gradebooks', permission: 'wattanam.examination.gradebook.view' },
    ]);
    context.routes.register({ method: 'GET', path: 'exams', permission: view, handler: async (request) => {
      const principal = request?.principal || {};
      if (principal.role === 'ADMIN') return db.query(`SELECT * FROM ${EXAM} ORDER BY "createdAt" DESC LIMIT 500`);
      const classIds = await context.directory.classesForUser(principal.userId, principal.role);
      return db.query(`SELECT * FROM ${EXAM} WHERE "createdByDirectoryUserId"=$1 OR "academicClassId" = ANY($2::text[]) ORDER BY "createdAt" DESC LIMIT 500`, [principal.userId, classIds]);
    }});
    context.routes.register({ method: 'GET', path: 'exams/:id', permission: view, handler: async (request) => {
      const rows = await db.query(`SELECT * FROM ${EXAM} WHERE "id"=$1`, [id(request?.params?.id)]); if (!rows.length) throw new Error('Exam not found');
      const principal = request?.principal || {};
      if (principal.role !== 'ADMIN' && rows[0].createdByDirectoryUserId !== principal.userId) {
        const classes = await context.directory.classesForUser(principal.userId, principal.role);
        if (!rows[0].academicClassId || !classes.includes(rows[0].academicClassId)) throw new Error('Exam is outside your assigned classes');
      }
      const questions = await db.query(`SELECT * FROM ${QUESTION} WHERE "examId"=$1 ORDER BY "order","createdAt"`, [rows[0].id]);
      return { ...rows[0], questions };
    }});
    context.routes.register({ method: 'POST', path: 'exams', permission: manage, handler: async (request) => {
      const body = request?.body || {}; const values = examInput(body); const principal = request?.principal || {};
      await validateReferences(context, values, principal); const questions = Array.isArray(body.questions) ? body.questions.map(questionInput) : [];
      return db.transaction(async (tx) => {
        const examId = randomUUID();
        await tx.execute(`INSERT INTO ${EXAM} ("id","title","description","academicClassId","createdByDirectoryUserId","startTime","endTime","duration","totalMarks","passMark","maxAttempts") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [examId, values.title, values.description, values.academicClassId, principal.userId, values.startTime, values.endTime, values.duration, values.totalMarks, values.passMark, values.maxAttempts]);
        for (const question of questions) await tx.execute(`INSERT INTO ${QUESTION} ("id","examId","text","type","data","marks","order","section") VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`, [randomUUID(), examId, question.text, question.type, question.data, question.marks, question.order, question.section]);
        return (await tx.query(`SELECT * FROM ${EXAM} WHERE "id"=$1`, [examId]))[0];
      });
    }});
    context.routes.register({ method: 'PUT', path: 'exams/:id', permission: manage, handler: async (request) => {
      const examId = id(request?.params?.id); const existing = await ownedExam(db, examId, request?.principal || {});
      if (existing.status !== 'DRAFT') throw new Error('Only draft exams may be edited');
      const values = examInput(request?.body || {}, true); if (!Object.keys(values).length) throw new Error('No editable fields supplied');
      await validateReferences(context, { ...existing, ...values }, request?.principal || {}); const final = { ...existing, ...values };
      if (final.startTime && final.endTime && new Date(final.endTime) < new Date(final.startTime)) throw new Error('endTime must not precede startTime');
      const fields = Object.keys(values); await db.execute(`UPDATE ${EXAM} SET ${fields.map((field, index) => `"${field}"=$${index + 2}`).join(',')},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [examId, ...Object.values(values)]);
      return (await db.query(`SELECT * FROM ${EXAM} WHERE "id"=$1`, [examId]))[0];
    }});
    context.routes.register({ method: 'PATCH', path: 'exams/:id/status', permission: manage, handler: async (request) => {
      const examId = id(request?.params?.id); const existing = await ownedExam(db, examId, request?.principal || {});
      const status = String(request?.body?.status || '').toUpperCase(); if (!EXAM_STATUSES.has(status)) throw new Error('status is invalid');
      const transitions = { DRAFT: ['PUBLISHED'], PUBLISHED: ['DRAFT', 'ACTIVE'], ACTIVE: ['COMPLETED'], COMPLETED: [] };
      if (!transitions[existing.status]?.includes(status)) throw new Error(`Cannot transition exam from ${existing.status} to ${status}`);
      if (status === 'PUBLISHED' && !(await db.query(`SELECT "id" FROM ${QUESTION} WHERE "examId"=$1 LIMIT 1`, [examId])).length) throw new Error('An exam must contain at least one question before publication');
      await db.execute(`UPDATE ${EXAM} SET "status"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [examId, status]); return { id: examId, status };
    }});
    context.routes.register({ method: 'DELETE', path: 'exams/:id', permission: manage, handler: async (request) => {
      const examId = id(request?.params?.id); const existing = await ownedExam(db, examId, request?.principal || {});
      if (existing.status !== 'DRAFT') throw new Error('Only draft exams may be deleted');
      await db.execute(`DELETE FROM ${EXAM} WHERE "id"=$1`, [examId]); return { deleted: true, id: examId };
    }});
    context.routes.register({ method: 'POST', path: 'exams/:id/questions', permission: manage, handler: async (request) => {
      const examId = id(request?.params?.id); const existing = await ownedExam(db, examId, request?.principal || {});
      if (existing.status !== 'DRAFT') throw new Error('Only draft exams may be edited');
      const values = questionInput(request?.body || {}); const questionId = randomUUID();
      await db.execute(`INSERT INTO ${QUESTION} ("id","examId","text","type","data","marks","order","section") VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`, [questionId, examId, values.text, values.type, values.data, values.marks, values.order, values.section]);
      return (await db.query(`SELECT * FROM ${QUESTION} WHERE "id"=$1`, [questionId]))[0];
    }});
    context.routes.register({ method: 'PUT', path: 'questions/:id', permission: manage, handler: async (request) => {
      const questionId = id(request?.params?.id); const rows = await db.query(`SELECT q.*,e."createdByDirectoryUserId",e."status" AS "examStatus" FROM ${QUESTION} q JOIN ${EXAM} e ON e."id"=q."examId" WHERE q."id"=$1`, [questionId]);
      if (!rows.length) throw new Error('Question not found');
      if (request?.principal?.role !== 'ADMIN' && rows[0].createdByDirectoryUserId !== request?.principal?.userId) throw new Error('Only the exam creator or an administrator may change this question');
      if (rows[0].examStatus !== 'DRAFT') throw new Error('Only draft exams may be edited');
      const values = questionInput(request?.body || {}); await db.execute(`UPDATE ${QUESTION} SET "text"=$2,"type"=$3,"data"=$4::jsonb,"marks"=$5,"order"=$6,"section"=$7 WHERE "id"=$1`, [questionId, values.text, values.type, values.data, values.marks, values.order, values.section]);
      return (await db.query(`SELECT * FROM ${QUESTION} WHERE "id"=$1`, [questionId]))[0];
    }});
    context.routes.register({ method: 'DELETE', path: 'questions/:id', permission: manage, handler: async (request) => {
      const questionId = id(request?.params?.id); const rows = await db.query(`SELECT q."id",e."createdByDirectoryUserId",e."status" AS "examStatus" FROM ${QUESTION} q JOIN ${EXAM} e ON e."id"=q."examId" WHERE q."id"=$1`, [questionId]);
      if (!rows.length) throw new Error('Question not found');
      if (request?.principal?.role !== 'ADMIN' && rows[0].createdByDirectoryUserId !== request?.principal?.userId) throw new Error('Only the exam creator or an administrator may change this question');
      if (rows[0].examStatus !== 'DRAFT') throw new Error('Only draft exams may be edited');
      await db.execute(`DELETE FROM ${QUESTION} WHERE "id"=$1`, [questionId]); return { deleted: true, id: questionId };
    }});
    registerAttempts(context);
    registerGradebooks(context);
  },
};
