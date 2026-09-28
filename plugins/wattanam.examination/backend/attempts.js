'use strict';

const { randomUUID } = require('crypto');
const { gradeQuestionData, safeQuestionData } = require('./question-types');
const { publishStudentGradeSummary } = require('./student-grade-summary');
const EXAM = 'plugin_wattanam_examination_exam';
const QUESTION = 'plugin_wattanam_examination_question';
const ATTEMPT = 'plugin_wattanam_examination_attempt';

function id(value, label = 'id') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error(`${label} is invalid`);
  return value;
}
function object(value, label) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (JSON.stringify(value).length > 250000) throw new Error(`${label} exceeds 250000 characters`);
  return value;
}
function json(value) {
  if (value == null) return {};
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return {}; } }
  return value;
}
function safeQuestion(row) {
  return { id: row.id, text: row.text, type: row.type, marks: row.marks, order: row.order, section: row.section, data: safeQuestionData(row.type, json(row.data)) };
}
function gradeQuestion(question, response) {
  return gradeQuestionData(question.type, json(question.data), response, question.marks);
}
function examAvailable(exam) {
  const now = Date.now();
  if (exam.status !== 'ACTIVE') throw new Error('This exam is not currently active');
  if (exam.startTime && new Date(exam.startTime).getTime() > now) throw new Error('This exam has not started');
  if (exam.endTime && new Date(exam.endTime).getTime() < now) throw new Error('This exam has ended');
}
async function resolveStudent(context, principal, requiredClassId) {
  const userId = id(principal?.userId, 'principal.userId');
  const classIds = await context.directory.classesForUser(userId, 'STUDENT');
  if (requiredClassId && !classIds.includes(requiredClassId)) throw new Error('Exam is outside your assigned classes');
  const candidates = requiredClassId ? [requiredClassId] : classIds;
  const today = new Date().toISOString().slice(0, 10);
  for (const classId of candidates) {
    const roster = await context.directory.getClassRoster(classId, today);
    const student = roster.students.find((item) => item.userId === userId);
    if (student) return { studentId: student.studentId, classIds };
  }
  throw new Error('Academic student profile is not available through the roster contract');
}
async function loadStudentAttempt(db, attemptId, principal, lock = false) {
  const rows = await db.query(`SELECT a.*,e."title",e."passMark",e."totalMarks",e."createdByDirectoryUserId" FROM ${ATTEMPT} a JOIN ${EXAM} e ON e."id"=a."examId" WHERE a."id"=$1${lock ? ' FOR UPDATE' : ''}`, [id(attemptId)]);
  if (!rows.length) throw new Error('Attempt not found');
  return rows[0];
}

function registerAttempts(context) {
  const db = context.database; const take = 'wattanam.examination.attempts.take'; const grade = 'wattanam.examination.attempts.grade';
  context.routes.register({ method: 'GET', path: 'student/exams', permission: take, handler: async (request) => {
    const classIds = await context.directory.classesForUser(id(request?.principal?.userId, 'principal.userId'), 'STUDENT');
    return db.query(`SELECT "id","title","description","academicClassId","startTime","endTime","duration","totalMarks","passMark","maxAttempts","status" FROM ${EXAM} WHERE "status" IN ('PUBLISHED','ACTIVE','COMPLETED') AND ("academicClassId" IS NULL OR "academicClassId" = ANY($1::text[])) ORDER BY "createdAt" DESC LIMIT 500`, [classIds]);
  }});
  context.routes.register({ method: 'GET', path: 'exams/:id/take', permission: take, handler: async (request) => {
    const rows = await db.query(`SELECT * FROM ${EXAM} WHERE "id"=$1`, [id(request?.params?.id)]); if (!rows.length) throw new Error('Exam not found');
    await resolveStudent(context, request?.principal || {}, rows[0].academicClassId);
    if (!['PUBLISHED', 'ACTIVE'].includes(rows[0].status)) throw new Error('Exam is not available');
    const questions = await db.query(`SELECT * FROM ${QUESTION} WHERE "examId"=$1 ORDER BY "order","createdAt"`, [rows[0].id]);
    return { ...rows[0], questions: questions.map(safeQuestion) };
  }});
  context.routes.register({ method: 'POST', path: 'exams/:id/attempts/start', permission: take, handler: async (request) => {
    const examId = id(request?.params?.id); const examRows = await db.query(`SELECT * FROM ${EXAM} WHERE "id"=$1`, [examId]);
    if (!examRows.length) throw new Error('Exam not found'); const exam = examRows[0]; examAvailable(exam);
    const student = await resolveStudent(context, request?.principal || {}, exam.academicClassId);
    const result = await db.transaction(async (tx) => {
      await tx.execute(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0)) FROM (SELECT COUNT(*) FROM ${ATTEMPT}) AS namespace_guard`, [`wattanam.examination:attempt:${examId}:${student.studentId}`]);
      const existingRows = await tx.query(`SELECT * FROM ${ATTEMPT} WHERE "examId"=$1 AND "academicStudentId"=$2 FOR UPDATE`, [examId, student.studentId]);
      const existing = existingRows[0];
      if (existing?.status === 'IN_PROGRESS') return existing;
      if (existing?.status === 'SUBMITTED') throw new Error('This attempt is awaiting manual grading');
      if (existing && Number(exam.maxAttempts) > 0 && Number(existing.attemptNumber) >= Number(exam.maxAttempts)) throw new Error(`Maximum attempts (${exam.maxAttempts}) reached`);
      if (existing) {
        await tx.execute(`UPDATE ${ATTEMPT} SET "status"='IN_PROGRESS',"answers"=NULL,"manualMarks"=NULL,"feedback"=NULL,"score"=NULL,"grade"=NULL,"startedAt"=CURRENT_TIMESTAMP,"submittedAt"=NULL,"gradedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [existing.id]);
        return { ...existing, status: 'IN_PROGRESS', answers: null, score: null, grade: null };
      }
      const attemptId = randomUUID();
      await tx.execute(`INSERT INTO ${ATTEMPT} ("id","examId","academicStudentId","directoryUserId") VALUES ($1,$2,$3,$4)`, [attemptId, examId, student.studentId, request.principal.userId]);
      return (await tx.query(`SELECT * FROM ${ATTEMPT} WHERE "id"=$1`, [attemptId]))[0];
    });
    return result;
  }});
  context.routes.register({ method: 'PUT', path: 'attempts/:id/answers', permission: take, handler: async (request) => {
    const attempt = await loadStudentAttempt(db, request?.params?.id, request?.principal || {}); const student = await resolveStudent(context, request?.principal || {}, null);
    if (attempt.academicStudentId !== student.studentId) throw new Error('Attempt does not belong to this student');
    if (attempt.status !== 'IN_PROGRESS') throw new Error('Only an in-progress attempt may be saved');
    const answers = object(request?.body?.answers, 'answers');
    await db.execute(`UPDATE ${ATTEMPT} SET "answers"=$2::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [attempt.id, JSON.stringify(answers)]);
    return { id: attempt.id, saved: true };
  }});
  context.routes.register({ method: 'POST', path: 'attempts/:id/submit', permission: take, handler: async (request) => {
    const student = await resolveStudent(context, request?.principal || {}, null); const finalAnswers = request?.body?.answers;
    const result = await db.transaction(async (tx) => {
      const attempt = await loadStudentAttempt(tx, request?.params?.id, request?.principal || {}, true);
      if (attempt.academicStudentId !== student.studentId) throw new Error('Attempt does not belong to this student');
      if (attempt.status !== 'IN_PROGRESS') throw new Error('This attempt has already been submitted');
      const answers = finalAnswers === undefined ? json(attempt.answers) : object(finalAnswers, 'answers');
      const questions = await tx.query(`SELECT * FROM ${QUESTION} WHERE "examId"=$1 ORDER BY "order"`, [attempt.examId]);
      let total = 0; let manual = false;
      for (const question of questions) { const result = gradeQuestion(question, answers[question.id]); total += result.marks; if (!result.automatic) manual = true; }
      const status = manual ? 'SUBMITTED' : 'GRADED'; const gradeValue = manual ? null : total >= Number(attempt.passMark) ? 'PASS' : 'FAIL';
      await tx.execute(`UPDATE ${ATTEMPT} SET "status"=$2,"answers"=$3::jsonb,"score"=$4,"grade"=$5,"attemptNumber"="attemptNumber"+1,"submittedAt"=CURRENT_TIMESTAMP,"gradedAt"=${manual ? 'NULL' : 'CURRENT_TIMESTAMP'},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [attempt.id, status, JSON.stringify(answers), total, gradeValue]);
      return { id: attempt.id, status, score: total, grade: gradeValue };
    });
    if (result.status === 'GRADED') await publishStudentGradeSummary(context, student.studentId);
    return result;
  }});
  context.routes.register({ method: 'GET', path: 'attempts/:id/result', permission: take, handler: async (request) => {
    const attempt = await loadStudentAttempt(db, request?.params?.id, request?.principal || {}); const student = await resolveStudent(context, request?.principal || {}, null);
    if (attempt.academicStudentId !== student.studentId) throw new Error('Attempt does not belong to this student');
    if (attempt.status === 'IN_PROGRESS') throw new Error('Results are unavailable before submission');
    return attempt;
  }});
  context.routes.register({ method: 'GET', path: 'exams/:id/attempts', permission: grade, handler: async (request) => {
    const examId = id(request?.params?.id); const exams = await db.query(`SELECT "createdByDirectoryUserId" FROM ${EXAM} WHERE "id"=$1`, [examId]);
    if (!exams.length) throw new Error('Exam not found');
    if (request?.principal?.role !== 'ADMIN' && exams[0].createdByDirectoryUserId !== request?.principal?.userId) throw new Error('Only the exam creator or an administrator may view attempts');
    return db.query(`SELECT * FROM ${ATTEMPT} WHERE "examId"=$1 ORDER BY "submittedAt" DESC NULLS LAST LIMIT 1000`, [examId]);
  }});
  context.routes.register({ method: 'POST', path: 'attempts/:id/grade', permission: grade, handler: async (request) => {
    let studentId;
    const result = await db.transaction(async (tx) => {
    const attempt = await loadStudentAttempt(tx, request?.params?.id, request?.principal || {}, true); studentId = attempt.academicStudentId;
    if (request?.principal?.role !== 'ADMIN' && attempt.createdByDirectoryUserId !== request?.principal?.userId) throw new Error('Only the exam creator or an administrator may grade this attempt');
    if (attempt.status !== 'SUBMITTED') throw new Error('Only a submitted attempt may be manually graded');
    const manualMarks = object(request?.body?.perQuestionMarks, 'perQuestionMarks'); const answers = json(attempt.answers);
    const questions = await tx.query(`SELECT * FROM ${QUESTION} WHERE "examId"=$1`, [attempt.examId]); let total = 0; const sanitized = {};
    for (const question of questions) {
      const auto = gradeQuestion(question, answers[question.id]);
      if (auto.automatic) total += auto.marks;
      else { const mark = Math.max(0, Math.min(Number(question.marks), Number(manualMarks[question.id]) || 0)); sanitized[question.id] = mark; total += mark; }
    }
    const gradeValue = total >= Number(attempt.passMark) ? 'PASS' : 'FAIL'; const feedback = request?.body?.feedback == null ? null : String(request.body.feedback).trim().slice(0, 10000);
    await tx.execute(`UPDATE ${ATTEMPT} SET "status"='GRADED',"manualMarks"=$2::jsonb,"feedback"=$3,"score"=$4,"grade"=$5,"gradedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [attempt.id, JSON.stringify(sanitized), feedback, total, gradeValue]);
    return { id: attempt.id, status: 'GRADED', score: total, grade: gradeValue };
    });
    await publishStudentGradeSummary(context, studentId);
    return result;
  }});
  context.routes.register({ method: 'DELETE', path: 'attempts/:id/reset', permission: grade, handler: async (request) => {
    const attempt = await loadStudentAttempt(db, request?.params?.id, request?.principal || {});
    if (request?.principal?.role !== 'ADMIN' && attempt.createdByDirectoryUserId !== request?.principal?.userId) throw new Error('Only the exam creator or an administrator may reset this attempt');
    await db.execute(`DELETE FROM ${ATTEMPT} WHERE "id"=$1`, [attempt.id]);
    if (attempt.directoryUserId) await context.notifications.notifyInApp(attempt.directoryUserId, `Your attempt on "${attempt.title}" was reset. You may start again.`, 'exam_reset');
    return { reset: true, id: attempt.id, notified: Boolean(attempt.directoryUserId) };
  }});
}

module.exports = { registerAttempts, safeQuestion, gradeQuestion };
