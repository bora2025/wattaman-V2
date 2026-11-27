'use strict';

// The routes behind the exam screens (ui/): the lists with their counts and names, the exam editor's
// whole-exam save, the gradebook's attempts with student names, and the students' own exams and results.
// The older routes (exams, exams/:id/questions, student/exams…) stay unchanged for existing callers.

const { isAdmin } = require('./roles');
const { randomUUID } = require('crypto');
const { fail } = require('./errors');
const { sanitizeQuestionData, QUESTION_TYPES } = require('./question-types');
const { cleanRichText } = require('./rich-text');
const { dropUnusedMedia } = require('./media');
const EXAM = 'plugin_wattanam_examination_exam';
const QUESTION = 'plugin_wattanam_examination_question';
const ATTEMPT = 'plugin_wattanam_examination_attempt';
const MAX_QUESTIONS = 300;

const id = (value, label = 'id') => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw fail('INVALID_VALUE', `${label} is invalid`); return value; };
const json = (value) => { if (value == null) return {}; if (typeof value === 'string') { try { return JSON.parse(value); } catch { return {}; } } return value; };
const today = () => new Date().toISOString().slice(0, 10);
const cleanSection = (value) => String(value ?? '').replace(/^[\s"'“”‘’]+|[\s"'“”‘’,]+$/g, '').slice(0, 200) || null;

function examValues(body) {
  const text = (value, label, max, optional) => {
    const result = value == null ? '' : String(value).trim();
    if (!result && !optional) throw fail('INVALID_VALUE', `${label} is required`);
    if (result.length > max) throw fail('INVALID_VALUE', `${label} is too long (at most ${max} characters)`);
    return result || null;
  };
  const number = (value, label, min, fallback, integer) => {
    const parsed = value == null || value === '' ? fallback : Number(value);
    if (!Number.isFinite(parsed) || parsed < min || (integer && !Number.isInteger(parsed))) throw fail('INVALID_VALUE', `${label} must be ${integer ? 'a whole number' : 'a number'} of at least ${min}`);
    return parsed;
  };
  const time = (value, label) => {
    if (value == null || value === '') return null;
    const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw fail('INVALID_VALUE', `${label} is not a date and time`);
    return parsed.toISOString();
  };
  const values = {
    title: text(body.title, 'Title', 300), description: text(body.description, 'Description', 10000, true),
    academicClassId: body.academicClassId ? id(body.academicClassId, 'Class') : null,
    startTime: time(body.startTime, 'Opens'), endTime: time(body.endTime, 'Closes'),
    duration: number(body.duration, 'Duration', 1, 60, true), totalMarks: number(body.totalMarks, 'Total marks', 0, 100),
    passMark: number(body.passMark, 'Pass mark', 0, 50), maxAttempts: number(body.maxAttempts, 'Attempts', 0, 1, true),
  };
  if (values.duration > 1440) throw fail('INVALID_VALUE', 'Duration may be at most 1440 minutes');
  if (values.passMark > values.totalMarks) throw fail('INVALID_VALUE', 'The pass mark cannot be more than the total marks');
  if (values.startTime && values.endTime && values.endTime < values.startTime) throw fail('INVALID_VALUE', 'The exam must close after it opens');
  return values;
}

function questionValues(raw, index) {
  const type = String(raw?.type || 'MCQ').toUpperCase();
  if (!QUESTION_TYPES.has(type)) throw fail('INVALID_VALUE', `Question ${index + 1}: the type is not known`);
  try {
    const marks = type === 'TEXT' ? 0 : Number(raw?.marks ?? 1);
    if (!Number.isFinite(marks) || marks < 0 || marks > 1000) throw new Error('marks must be between 0 and 1000');
    const text = cleanRichText(raw?.text ?? '');
    if (!text.replace(/<[^>]*>/g, '').trim() && type !== 'DRAG_DROP') throw new Error(type === 'TEXT' ? 'the passage is empty' : 'the question text is empty');
    return {
      id: typeof raw?.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(raw.id) ? raw.id : null,
      text, type, marks, section: cleanSection(raw?.section),
      data: sanitizeQuestionData(type, raw?.data && typeof raw.data === 'object' ? raw.data : {}),
    };
  } catch (error) {
    throw fail('INVALID_VALUE', `Question ${index + 1}: ${error.message}`);
  }
}

function registerWorkspace(context) {
  const db = context.database;
  const view = 'wattanam.examination.exams.view';
  const manage = 'wattanam.examination.exams.manage';
  const grade = 'wattanam.examination.attempts.grade';
  const take = 'wattanam.examination.attempts.take';

  const names = async (lookup, ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    try { return new Map((await lookup(unique)).map((item) => [item.id, item.name])); } catch { return new Map(); }
  };
  const classNames = (ids) => names((list) => context.directory.lookupClasses(list), ids);
  const userNames = (ids) => names((list) => context.directory.lookupUsers(list), ids);

  const scopedExam = async (examId, principal) => {
    const rows = await db.query(`SELECT * FROM ${EXAM} WHERE "id"=$1`, [id(examId)]);
    if (!rows.length) throw fail('NOT_FOUND', 'Exam not found');
    const exam = rows[0];
    if (!isAdmin(principal) && exam.createdByDirectoryUserId !== principal?.userId) {
      const classes = await context.directory.classesForUser(principal?.userId, principal?.role);
      if (!exam.academicClassId || !classes.includes(exam.academicClassId)) throw fail('FORBIDDEN', 'Exam is outside your assigned classes');
    }
    return exam;
  };
  const mayChange = (exam, principal) => {
    if (!isAdmin(principal) && exam.createdByDirectoryUserId !== principal?.userId) throw fail('FORBIDDEN', 'Only the exam creator or an administrator may change this exam');
  };
  const checkReferences = async (values, principal) => {
    const users = await context.directory.lookupUsers([id(principal?.userId, 'principal.userId')]);
    if (users.length !== 1) throw fail('FORBIDDEN', 'Creator is not available through the core directory');
    if (values.academicClassId) {
      const classes = await context.directory.lookupClasses([values.academicClassId]);
      if (classes.length !== 1) throw fail('INVALID_VALUE', 'The class is not available through the Academic directory');
      if (!isAdmin(principal)) {
        const mine = await context.directory.classesForUser(principal.userId, principal.role);
        if (!mine.includes(values.academicClassId)) throw fail('FORBIDDEN', 'You can set exams only for your own classes');
      }
    }
  };
  const writeQuestions = async (tx, examId, questions) => {
    const existing = new Set((await tx.query(`SELECT "id" FROM ${QUESTION} WHERE "examId"=$1`, [examId])).map((row) => row.id));
    const kept = [];
    for (const [order, question] of questions.entries()) {
      const data = JSON.stringify(question.data);
      if (question.id && existing.has(question.id)) {
        await tx.execute(`UPDATE ${QUESTION} SET "text"=$3,"type"=$4,"data"=$5::jsonb,"marks"=$6,"order"=$7,"section"=$8 WHERE "id"=$1 AND "examId"=$2`, [question.id, examId, question.text, question.type, data, question.marks, order, question.section]);
        kept.push(question.id);
      } else {
        const questionId = randomUUID();
        await tx.execute(`INSERT INTO ${QUESTION} ("id","examId","text","type","data","marks","order","section") VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`, [questionId, examId, question.text, question.type, data, question.marks, order, question.section]);
        kept.push(questionId);
      }
    }
    const removed = [...existing].filter((questionId) => !kept.includes(questionId));
    if (removed.length) await tx.execute(`DELETE FROM ${QUESTION} WHERE "examId"=$1 AND "id" = ANY($2::text[])`, [examId, removed]);
    await dropUnusedMedia(tx, examId, questions);
  };
  const editorView = async (exam) => {
    const questions = await db.query(`SELECT "id","text","type","data","marks","order","section" FROM ${QUESTION} WHERE "examId"=$1 ORDER BY "order","createdAt"`, [exam.id]);
    const counts = await db.query(`SELECT COUNT(*)::int AS "attempts", COUNT(*) FILTER (WHERE "status"='SUBMITTED')::int AS "toGrade" FROM ${ATTEMPT} WHERE "examId"=$1`, [exam.id]);
    const className = exam.academicClassId ? (await classNames([exam.academicClassId])).get(exam.academicClassId) || null : null;
    return { ...exam, className, attemptCount: Number(counts[0]?.attempts || 0), toGrade: Number(counts[0]?.toGrade || 0), questions: questions.map((row) => ({ ...row, marks: Number(row.marks), data: json(row.data) })) };
  };

  // ---------- staff ----------
  context.routes.register({ method: 'GET', path: 'workspace/exams', permission: view, handler: async (request) => {
    const principal = request?.principal || {};
    const scope = isAdmin(principal) ? { where: '', params: [] } : { where: `WHERE e."createdByDirectoryUserId"=$1 OR e."academicClassId" = ANY($2::text[])`, params: [principal.userId, await context.directory.classesForUser(principal.userId, principal.role)] };
    const rows = await db.query(`SELECT e."id",e."title",e."description",e."academicClassId",e."createdByDirectoryUserId",e."startTime",e."endTime",e."duration",e."totalMarks",e."passMark",e."maxAttempts",e."status",e."createdAt",
        (SELECT COUNT(*)::int FROM ${QUESTION} q WHERE q."examId"=e."id" AND q."type"<>'TEXT') AS "questionCount",
        (SELECT COUNT(*)::int FROM ${ATTEMPT} a WHERE a."examId"=e."id") AS "attemptCount",
        (SELECT COUNT(*)::int FROM ${ATTEMPT} a WHERE a."examId"=e."id" AND a."status"='SUBMITTED') AS "toGrade"
      FROM ${EXAM} e ${scope.where} ORDER BY e."createdAt" DESC LIMIT 500`, scope.params);
    const [classes, creators] = await Promise.all([classNames(rows.map((row) => row.academicClassId)), userNames(rows.map((row) => row.createdByDirectoryUserId))]);
    return rows.map((row) => ({ ...row, totalMarks: Number(row.totalMarks), passMark: Number(row.passMark), className: classes.get(row.academicClassId) || null, creatorName: creators.get(row.createdByDirectoryUserId) || null, mine: row.createdByDirectoryUserId === principal.userId }));
  }});

  // classes this person may set an exam for (an administrator's screen also reads Academic's class list)
  context.routes.register({ method: 'GET', path: 'workspace/classes', permission: view, handler: async (request) => {
    const principal = request?.principal || {};
    const ids = await context.directory.classesForUser(principal.userId, principal.role);
    const found = await classNames(ids);
    return ids.map((classId) => ({ id: classId, name: found.get(classId) || classId })).sort((a, b) => a.name.localeCompare(b.name));
  }});

  context.routes.register({ method: 'GET', path: 'workspace/exams/:id', permission: view, handler: async (request) => editorView(await scopedExam(request?.params?.id, request?.principal || {})) });

  context.routes.register({ method: 'POST', path: 'workspace/exams', permission: manage, handler: async (request) => {
    const body = request?.body || {}; const principal = request?.principal || {};
    const values = examValues(body); await checkReferences(values, principal);
    const questions = (Array.isArray(body.questions) ? body.questions : []).slice(0, MAX_QUESTIONS + 1).map(questionValues);
    if (questions.length > MAX_QUESTIONS) throw fail('INVALID_VALUE', `An exam may have at most ${MAX_QUESTIONS} questions`);
    const examId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(`INSERT INTO ${EXAM} ("id","title","description","academicClassId","createdByDirectoryUserId","startTime","endTime","duration","totalMarks","passMark","maxAttempts") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [examId, values.title, values.description, values.academicClassId, principal.userId, values.startTime, values.endTime, values.duration, values.totalMarks, values.passMark, values.maxAttempts]);
      await writeQuestions(tx, examId, questions);
    });
    return editorView((await db.query(`SELECT * FROM ${EXAM} WHERE "id"=$1`, [examId]))[0]);
  }});

  // The editor's save: the details and, while nobody has taken the exam, the whole list of questions.
  context.routes.register({ method: 'PUT', path: 'workspace/exams/:id', permission: manage, handler: async (request) => {
    const body = request?.body || {}; const principal = request?.principal || {};
    const exam = await scopedExam(request?.params?.id, principal); mayChange(exam, principal);
    const values = examValues(body); await checkReferences(values, principal);
    const withQuestions = Array.isArray(body.questions);
    const questions = withQuestions ? body.questions.slice(0, MAX_QUESTIONS + 1).map(questionValues) : [];
    if (questions.length > MAX_QUESTIONS) throw fail('INVALID_VALUE', `An exam may have at most ${MAX_QUESTIONS} questions`);
    if (withQuestions && exam.status !== 'DRAFT' && !questions.length) throw fail('CONFLICT', 'A published exam needs at least one question');
    await db.transaction(async (tx) => {
      if (withQuestions) {
        const attempts = await tx.query(`SELECT COUNT(*)::int AS "count" FROM ${ATTEMPT} WHERE "examId"=$1`, [exam.id]);
        if (Number(attempts[0]?.count) > 0) throw fail('CONFLICT', `Students have already taken this exam (${attempts[0].count}): its questions cannot change. Allow re-attempts in the gradebook first, or copy the exam.`);
      }
      await tx.execute(`UPDATE ${EXAM} SET "title"=$2,"description"=$3,"academicClassId"=$4,"startTime"=$5,"endTime"=$6,"duration"=$7,"totalMarks"=$8,"passMark"=$9,"maxAttempts"=$10,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [exam.id, values.title, values.description, values.academicClassId, values.startTime, values.endTime, values.duration, values.totalMarks, values.passMark, values.maxAttempts]);
      if (withQuestions) await writeQuestions(tx, exam.id, questions);
    });
    return editorView((await db.query(`SELECT * FROM ${EXAM} WHERE "id"=$1`, [exam.id]))[0]);
  }});

  // A copy of an exam (as a new draft), e.g. to change the questions of one students already took.
  context.routes.register({ method: 'POST', path: 'workspace/exams/:id/copy', permission: manage, handler: async (request) => {
    const principal = request?.principal || {};
    const source = await editorView(await scopedExam(request?.params?.id, principal));
    const examId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(`INSERT INTO ${EXAM} ("id","title","description","academicClassId","createdByDirectoryUserId","startTime","endTime","duration","totalMarks","passMark","maxAttempts") VALUES ($1,$2,$3,$4,$5,NULL,NULL,$6,$7,$8,$9)`, [examId, `${source.title} (copy)`.slice(0, 300), source.description, source.academicClassId, principal.userId, source.duration, source.totalMarks, source.passMark, source.maxAttempts]);
      for (const [order, question] of source.questions.entries()) {
        await tx.execute(`INSERT INTO ${QUESTION} ("id","examId","text","type","data","marks","order","section") VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`, [randomUUID(), examId, question.text, question.type, JSON.stringify(question.data), question.marks, order, question.section]);
      }
      // the copy keeps its own pictures and recordings
      const media = await tx.query(`SELECT "id","kind","mime","bytes","parts" FROM plugin_wattanam_examination_media WHERE "examId"=$1`, [source.id]);
      for (const item of media) {
        const copyId = randomUUID();
        await tx.execute(`INSERT INTO plugin_wattanam_examination_media ("id","examId","kind","mime","bytes","parts","createdByDirectoryUserId") VALUES ($1,$2,$3,$4,$5,$6,$7)`, [copyId, examId, item.kind, item.mime, item.bytes, item.parts, principal.userId]);
        await tx.execute(`INSERT INTO plugin_wattanam_examination_media_part ("mediaId","index","data") SELECT $1,"index","data" FROM plugin_wattanam_examination_media_part WHERE "mediaId"=$2`, [copyId, item.id]);
        await tx.execute(`UPDATE ${QUESTION} SET "data"=REPLACE("data"::text, $2, $3)::jsonb WHERE "examId"=$1`, [examId, `media:${item.id}`, `media:${copyId}`]);
      }
    });
    return { id: examId };
  }});

  // The gradebook: the exam with its answer keys and every attempt with the student's name.
  context.routes.register({ method: 'GET', path: 'workspace/exams/:id/attempts', permission: grade, handler: async (request) => {
    const principal = request?.principal || {};
    const exam = await scopedExam(request?.params?.id, principal);
    // grading (POST attempts/:id/grade) is the creator's or an administrator's, so is the gradebook
    if (!isAdmin(principal) && exam.createdByDirectoryUserId !== principal.userId) throw fail('FORBIDDEN', 'Only the exam creator or an administrator may view attempts');
    const attempts = await db.query(`SELECT "id","academicStudentId","directoryUserId","answers","manualMarks","feedback","score","grade","status","attemptNumber","startedAt","submittedAt","gradedAt" FROM ${ATTEMPT} WHERE "examId"=$1 ORDER BY "submittedAt" DESC NULLS LAST LIMIT 1000`, [exam.id]);
    const users = await userNames(attempts.map((row) => row.directoryUserId));
    let roster = new Map();
    if (exam.academicClassId && attempts.some((row) => !users.get(row.directoryUserId))) {
      try { roster = new Map((await context.directory.getClassRoster(exam.academicClassId, today())).students.map((student) => [student.studentId, { name: student.name, number: student.studentNumber }])); } catch { roster = new Map(); }
    }
    return {
      exam: await editorView(exam),
      attempts: attempts.map((row) => ({ ...row, score: row.score == null ? null : Number(row.score), answers: json(row.answers), manualMarks: row.manualMarks ? json(row.manualMarks) : null, studentName: users.get(row.directoryUserId) || roster.get(row.academicStudentId)?.name || 'Student', studentNumber: roster.get(row.academicStudentId)?.number || null })),
    };
  }});

  // ---------- students ----------
  const myAttempts = async (principal) => {
    const userId = id(principal?.userId, 'principal.userId');
    let studentId = null;
    try {
      const classes = await context.directory.classesForUser(userId, 'STUDENT');
      for (const classId of classes) {
        const student = (await context.directory.getClassRoster(classId, today())).students.find((item) => item.userId === userId);
        if (student) { studentId = student.studentId; break; }
      }
    } catch { studentId = null; }
    return db.query(`SELECT a."id",a."examId",a."status",a."score",a."grade",a."feedback",a."attemptNumber",a."startedAt",a."submittedAt",a."gradedAt",e."title",e."totalMarks",e."passMark",e."academicClassId"
      FROM ${ATTEMPT} a JOIN ${EXAM} e ON e."id"=a."examId" WHERE a."directoryUserId"=$1 OR a."academicStudentId"=$2 ORDER BY COALESCE(a."gradedAt",a."submittedAt",a."startedAt") DESC LIMIT 500`, [userId, studentId || '']);
  };

  context.routes.register({ method: 'GET', path: 'student/workspace/exams', permission: take, handler: async (request) => {
    const principal = request?.principal || {};
    const classIds = await context.directory.classesForUser(id(principal.userId, 'principal.userId'), 'STUDENT');
    const exams = await db.query(`SELECT e."id",e."title",e."description",e."academicClassId",e."startTime",e."endTime",e."duration",e."totalMarks",e."passMark",e."maxAttempts",e."status",
        (SELECT COUNT(*)::int FROM ${QUESTION} q WHERE q."examId"=e."id" AND q."type"<>'TEXT') AS "questionCount"
      FROM ${EXAM} e WHERE e."status" IN ('PUBLISHED','ACTIVE','COMPLETED') AND (e."academicClassId" IS NULL OR e."academicClassId" = ANY($1::text[])) ORDER BY e."createdAt" DESC LIMIT 500`, [classIds]);
    const attempts = new Map((await myAttempts(principal)).map((row) => [row.examId, row]));
    const classes = await classNames(exams.map((row) => row.academicClassId));
    return exams.map((exam) => {
      const attempt = attempts.get(exam.id);
      return { ...exam, totalMarks: Number(exam.totalMarks), passMark: Number(exam.passMark), className: classes.get(exam.academicClassId) || null,
        attempt: attempt ? { id: attempt.id, status: attempt.status, score: attempt.score == null ? null : Number(attempt.score), grade: attempt.grade, attemptNumber: Number(attempt.attemptNumber), startedAt: attempt.startedAt } : null };
    });
  }});

  context.routes.register({ method: 'GET', path: 'student/results', permission: take, handler: async (request) => {
    const rows = await myAttempts(request?.principal || {});
    return rows.filter((row) => row.status !== 'IN_PROGRESS').map((row) => ({
      id: row.id, examId: row.examId, title: row.title, status: row.status, attemptNumber: Number(row.attemptNumber),
      totalMarks: Number(row.totalMarks), passMark: Number(row.passMark), submittedAt: row.submittedAt, gradedAt: row.gradedAt,
      // a partly graded attempt (essays waiting) shows no score yet, as in mono
      score: row.status === 'GRADED' && row.score != null ? Number(row.score) : null, grade: row.status === 'GRADED' ? row.grade : null,
      feedback: row.status === 'GRADED' ? row.feedback : null,
    }));
  }});
}

module.exports = { registerWorkspace, examValues, questionValues };
