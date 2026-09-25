'use strict';

const { randomUUID } = require('crypto');
const { publishStudentGradeSummary } = require('./student-grade-summary');
const SHEET = 'plugin_wattanam_examination_score_sheet';
const SHEET_CLASS = 'plugin_wattanam_examination_score_sheet_class';
const SUBJECT = 'plugin_wattanam_examination_score_subject';
const TAB = 'plugin_wattanam_examination_score_tab';
const ENTRY = 'plugin_wattanam_examination_score_entry';

function id(value, label = 'id') { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error(`${label} is invalid`); return value; }
function text(value, label, max = 500, optional = false) { if ((value == null || value === '') && optional) return null; if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} is required (maximum ${max} characters)`); return value.trim(); }
function finite(value, label, minimum = 0, fallback) { const result = value == null || value === '' ? fallback : Number(value); if (!Number.isFinite(result) || result < minimum) throw new Error(`${label} must be at least ${minimum}`); return result; }
function integer(value, label, minimum = 0, fallback = 0) { const result = finite(value, label, minimum, fallback); if (!Number.isInteger(result)) throw new Error(`${label} must be an integer`); return result; }
function ids(values, label) { if (!Array.isArray(values)) throw new Error(`${label} must be an array`); const result = [...new Set(values.map((value) => id(value, label)))]; if (result.length > 100) throw new Error(`${label} may contain at most 100 values`); return result; }
async function validateClasses(context, classIds) { if (!classIds.length) return; const found = await context.directory.lookupClasses(classIds); if (new Set(found.map((row) => row.id)).size !== classIds.length) throw new Error('One or more Academic classes are unavailable'); }
async function sheet(db, sheetId, principal, requireOwner = false) {
  const rows = await db.query(`SELECT * FROM ${SHEET} WHERE "id"=$1`, [id(sheetId)]); if (!rows.length) throw new Error('Gradebook not found');
  if (requireOwner && principal?.role !== 'ADMIN' && rows[0].createdByDirectoryUserId !== principal?.userId) throw new Error('Only the gradebook creator or an administrator may change it');
  return rows[0];
}
async function sheetClassIds(db, sheetId) { return (await db.query(`SELECT "academicClassId" FROM ${SHEET_CLASS} WHERE "scoreSheetId"=$1`, [sheetId])).map((row) => row.academicClassId); }
async function authorizeView(context, db, record, principal) {
  if (principal?.role === 'ADMIN' || record.createdByDirectoryUserId === principal?.userId) return;
  const [allowed, assigned] = await Promise.all([sheetClassIds(db, record.id), context.directory.classesForUser(principal?.userId, principal?.role)]);
  if (!allowed.some((classId) => assigned.includes(classId))) throw new Error('Gradebook is outside your assigned classes');
}
async function ownedChild(db, table, childId, principal, label) {
  const rows = await db.query(`SELECT c.*,s."createdByDirectoryUserId" FROM ${table} c JOIN ${SHEET} s ON s."id"=c."scoreSheetId" WHERE c."id"=$1`, [id(childId)]);
  if (!rows.length) throw new Error(`${label} not found`);
  if (principal?.role !== 'ADMIN' && rows[0].createdByDirectoryUserId !== principal?.userId) throw new Error(`Only the gradebook creator or an administrator may change this ${label.toLowerCase()}`);
  return rows[0];
}
async function assertStudentInSheet(context, db, sheetId, studentId) {
  const classIds = await sheetClassIds(db, sheetId); const today = new Date().toISOString().slice(0, 10);
  for (const classId of classIds) { const roster = await context.directory.getClassRoster(classId, today); if (roster.students.some((student) => student.studentId === studentId)) return; }
  throw new Error('Student is not enrolled in a gradebook class');
}

function registerGradebooks(context) {
  const db = context.database; const view = 'wattanam.examination.gradebook.view'; const manage = 'wattanam.examination.gradebook.manage';
  context.routes.register({ method: 'GET', path: 'gradebooks', permission: view, handler: async (request) => {
    if (request?.principal?.role === 'ADMIN') return db.query(`SELECT * FROM ${SHEET} ORDER BY "createdAt" DESC LIMIT 500`);
    const classes = await context.directory.classesForUser(request?.principal?.userId, request?.principal?.role);
    return db.query(`SELECT DISTINCT s.* FROM ${SHEET} s LEFT JOIN ${SHEET_CLASS} c ON c."scoreSheetId"=s."id" WHERE s."createdByDirectoryUserId"=$1 OR c."academicClassId"=ANY($2::text[]) ORDER BY s."createdAt" DESC LIMIT 500`, [request?.principal?.userId, classes]);
  }});
  context.routes.register({ method: 'GET', path: 'gradebooks/:id', permission: view, handler: async (request) => {
    const record = await sheet(db, request?.params?.id, request?.principal || {}); await authorizeView(context, db, record, request?.principal || {}); const classes = await sheetClassIds(db, record.id);
    const subjects = await db.query(`SELECT * FROM ${SUBJECT} WHERE "scoreSheetId"=$1 ORDER BY "order","createdAt"`, [record.id]);
    const tabs = await db.query(`SELECT * FROM ${TAB} WHERE "scoreSheetId"=$1 ORDER BY "order","createdAt"`, [record.id]); return { ...record, classIds: classes, subjects, tabs };
  }});
  context.routes.register({ method: 'POST', path: 'gradebooks', permission: manage, handler: async (request) => {
    const body = request?.body || {}; const classIds = ids(body.classIds || [], 'classIds'); if (!classIds.length) throw new Error('At least one class is required'); await validateClasses(context, classIds);
    const owner = id(request?.principal?.userId, 'principal.userId'); const name = text(body.name, 'name', 300); const degree = text(body.degree, 'degree', 300, true); const logoUrl = text(body.logoUrl, 'logoUrl', 2000, true); const studyYearId = body.studyYearId == null || body.studyYearId === '' ? null : id(body.studyYearId, 'studyYearId');
    return db.transaction(async (tx) => { const sheetId = randomUUID(); await tx.execute(`INSERT INTO ${SHEET} ("id","name","degree","logoUrl","studyYearId","createdByDirectoryUserId") VALUES ($1,$2,$3,$4,$5,$6)`, [sheetId, name, degree, logoUrl, studyYearId, owner]); for (const classId of classIds) await tx.execute(`INSERT INTO ${SHEET_CLASS} ("id","scoreSheetId","academicClassId") VALUES ($1,$2,$3)`, [randomUUID(), sheetId, classId]); return (await tx.query(`SELECT * FROM ${SHEET} WHERE "id"=$1`, [sheetId]))[0]; });
  }});
  context.routes.register({ method: 'PUT', path: 'gradebooks/:id', permission: manage, handler: async (request) => {
    const record = await sheet(db, request?.params?.id, request?.principal || {}, true); const body = request?.body || {}; const values = {};
    if (body.name !== undefined) values.name = text(body.name, 'name', 300); if (body.degree !== undefined) values.degree = text(body.degree, 'degree', 300, true); if (body.logoUrl !== undefined) values.logoUrl = text(body.logoUrl, 'logoUrl', 2000, true); if (body.studyYearId !== undefined) values.studyYearId = body.studyYearId ? id(body.studyYearId, 'studyYearId') : null;
    const classIds = body.classIds === undefined ? null : ids(body.classIds, 'classIds'); if (classIds && !classIds.length) throw new Error('At least one class is required'); if (classIds) await validateClasses(context, classIds); if (!Object.keys(values).length && !classIds) throw new Error('No editable fields supplied');
    await db.transaction(async (tx) => { if (Object.keys(values).length) { const fields = Object.keys(values); await tx.execute(`UPDATE ${SHEET} SET ${fields.map((field, index) => `"${field}"=$${index + 2}`).join(',')},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [record.id, ...Object.values(values)]); } if (classIds) { await tx.execute(`DELETE FROM ${SHEET_CLASS} WHERE "scoreSheetId"=$1`, [record.id]); for (const classId of classIds) await tx.execute(`INSERT INTO ${SHEET_CLASS} ("id","scoreSheetId","academicClassId") VALUES ($1,$2,$3)`, [randomUUID(), record.id, classId]); } }); return { id: record.id, updated: true };
  }});
  context.routes.register({ method: 'DELETE', path: 'gradebooks/:id', permission: manage, handler: async (request) => { const record = await sheet(db, request?.params?.id, request?.principal || {}, true); await db.execute(`DELETE FROM ${SHEET} WHERE "id"=$1`, [record.id]); return { deleted: true, id: record.id }; }});
  context.routes.register({ method: 'POST', path: 'gradebooks/:id/subjects', permission: manage, handler: async (request) => {
    const record = await sheet(db, request?.params?.id, request?.principal || {}, true); const body = request?.body || {}; const subjectId = randomUUID();
    const academicSubjectId = body.academicSubjectId ? id(body.academicSubjectId, 'academicSubjectId') : null;
    if (academicSubjectId) { const found = await context.directory.lookupSubjects([academicSubjectId]); if (found.length !== 1 || found[0].id !== academicSubjectId) throw new Error('academicSubjectId is unavailable through the Academic subject contract'); }
    await db.execute(`INSERT INTO ${SUBJECT} ("id","scoreSheetId","name","maxScore","color","order","academicSubjectId") VALUES ($1,$2,$3,$4,$5,$6,$7)`, [subjectId, record.id, text(body.name, 'name', 300), finite(body.maxScore, 'maxScore', 0, 100), text(body.color || '#000000', 'color', 30), integer(body.order, 'order'), academicSubjectId]); return (await db.query(`SELECT * FROM ${SUBJECT} WHERE "id"=$1`, [subjectId]))[0];
  }});
  context.routes.register({ method: 'PUT', path: 'gradebook-subjects/:id', permission: manage, handler: async (request) => {
    const record = await ownedChild(db, SUBJECT, request?.params?.id, request?.principal || {}, 'Gradebook subject'); const body = request?.body || {}; const values = {};
    if (body.name !== undefined) values.name = text(body.name, 'name', 300); if (body.maxScore !== undefined) values.maxScore = finite(body.maxScore, 'maxScore', 0); if (body.color !== undefined) values.color = text(body.color, 'color', 30); if (body.order !== undefined) values.order = integer(body.order, 'order');
    if (body.academicSubjectId !== undefined) { values.academicSubjectId = body.academicSubjectId ? id(body.academicSubjectId, 'academicSubjectId') : null; if (values.academicSubjectId) { const found = await context.directory.lookupSubjects([values.academicSubjectId]); if (found.length !== 1 || found[0].id !== values.academicSubjectId) throw new Error('academicSubjectId is unavailable through the Academic subject contract'); } }
    const fields = Object.keys(values); if (!fields.length) throw new Error('No editable fields supplied'); await db.execute(`UPDATE ${SUBJECT} SET ${fields.map((field, index) => `"${field}"=$${index + 2}`).join(',')},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [record.id, ...Object.values(values)]); return { id: record.id, updated: true };
  }});
  context.routes.register({ method: 'DELETE', path: 'gradebook-subjects/:id', permission: manage, handler: async (request) => { const record = await ownedChild(db, SUBJECT, request?.params?.id, request?.principal || {}, 'Gradebook subject'); await db.execute(`DELETE FROM ${SUBJECT} WHERE "id"=$1`, [record.id]); return { deleted: true, id: record.id }; }});
  context.routes.register({ method: 'POST', path: 'gradebooks/:id/tabs', permission: manage, handler: async (request) => {
    const record = await sheet(db, request?.params?.id, request?.principal || {}, true); const body = request?.body || {}; const type = String(body.type || '').toUpperCase(); if (!['MONTHLY','QUARTERLY','SEMESTER'].includes(type)) throw new Error('type is invalid'); const tabId = randomUUID();
    await db.execute(`INSERT INTO ${TAB} ("id","scoreSheetId","label","type","order") VALUES ($1,$2,$3,$4,$5)`, [tabId, record.id, text(body.label, 'label', 200), type, integer(body.order, 'order')]); return (await db.query(`SELECT * FROM ${TAB} WHERE "id"=$1`, [tabId]))[0];
  }});
  context.routes.register({ method: 'PUT', path: 'gradebook-tabs/:id', permission: manage, handler: async (request) => {
    const record = await ownedChild(db, TAB, request?.params?.id, request?.principal || {}, 'Gradebook period'); const body = request?.body || {}; const values = {};
    if (body.label !== undefined) values.label = text(body.label, 'label', 200); if (body.type !== undefined) { const type = String(body.type).toUpperCase(); if (!['MONTHLY','QUARTERLY','SEMESTER'].includes(type)) throw new Error('type is invalid'); values.type = type; } if (body.order !== undefined) values.order = integer(body.order, 'order');
    const fields = Object.keys(values); if (!fields.length) throw new Error('No editable fields supplied'); await db.execute(`UPDATE ${TAB} SET ${fields.map((field, index) => `"${field}"=$${index + 2}`).join(',')},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [record.id, ...Object.values(values)]); return { id: record.id, updated: true };
  }});
  context.routes.register({ method: 'DELETE', path: 'gradebook-tabs/:id', permission: manage, handler: async (request) => { const record = await ownedChild(db, TAB, request?.params?.id, request?.principal || {}, 'Gradebook period'); await db.execute(`DELETE FROM ${TAB} WHERE "id"=$1`, [record.id]); return { deleted: true, id: record.id }; }});
  context.routes.register({ method: 'POST', path: 'gradebooks/:id/scores/bulk', permission: manage, handler: async (request) => {
    const record = await sheet(db, request?.params?.id, request?.principal || {}, true); const entries = request?.body?.entries; if (!Array.isArray(entries) || !entries.length || entries.length > 1000) throw new Error('entries must contain 1 to 1000 rows');
    const sanitized = [];
    for (const entry of entries) { const studentId = id(entry.academicStudentId, 'academicStudentId'); await assertStudentInSheet(context, db, record.id, studentId); sanitized.push({ tabId: id(entry.scoreTabId, 'scoreTabId'), subjectId: id(entry.subjectId, 'subjectId'), studentId, score: entry.score == null ? null : finite(entry.score, 'score', 0), formula: text(entry.formula, 'formula', 1000, true) }); }
    const result = await db.transaction(async (tx) => { for (const entry of sanitized) { const links = await tx.query(`SELECT t."id",s."maxScore" FROM ${TAB} t JOIN ${SUBJECT} s ON s."scoreSheetId"=t."scoreSheetId" WHERE t."id"=$1 AND s."id"=$2 AND t."scoreSheetId"=$3`, [entry.tabId, entry.subjectId, record.id]); if (!links.length) throw new Error('Score tab or subject does not belong to this gradebook'); if (entry.score != null && entry.score > Number(links[0].maxScore)) throw new Error('Score exceeds the subject maximum'); await tx.execute(`INSERT INTO ${ENTRY} ("id","scoreTabId","subjectId","academicStudentId","score","formula") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("scoreTabId","subjectId","academicStudentId") DO UPDATE SET "score"=EXCLUDED."score","formula"=EXCLUDED."formula","updatedAt"=CURRENT_TIMESTAMP`, [randomUUID(), entry.tabId, entry.subjectId, entry.studentId, entry.score, entry.formula]); } return { updated: sanitized.length }; });
    await Promise.all([...new Set(sanitized.map((entry) => entry.studentId))].map((studentId) => publishStudentGradeSummary(context, studentId)));
    return result;
  }});
  context.routes.register({ method: 'GET', path: 'gradebooks/:id/report', permission: view, handler: async (request) => {
    const record = await sheet(db, request?.params?.id, request?.principal || {}); await authorizeView(context, db, record, request?.principal || {}); const classIds = await sheetClassIds(db, record.id); const today = new Date().toISOString().slice(0, 10); const students = [];
    for (const classId of classIds) { const roster = await context.directory.getClassRoster(classId, today); for (const student of roster.students) students.push({ ...student, classId, className: roster.className }); }
    const subjects = await db.query(`SELECT * FROM ${SUBJECT} WHERE "scoreSheetId"=$1 ORDER BY "order","createdAt"`, [record.id]); const tabs = await db.query(`SELECT * FROM ${TAB} WHERE "scoreSheetId"=$1 ORDER BY "order","createdAt"`, [record.id]); const entries = await db.query(`SELECT e.* FROM ${ENTRY} e JOIN ${TAB} t ON t."id"=e."scoreTabId" WHERE t."scoreSheetId"=$1 ORDER BY e."academicStudentId",e."scoreTabId",e."subjectId" LIMIT 50000`, [record.id]);
    const uniqueStudents = [...new Map(students.map((student) => [student.studentId, student])).values()];
    const studentById = new Map(uniqueStudents.map((student) => [student.studentId, student])); const subjectById = new Map(subjects.map((subject) => [subject.id, subject])); const tabById = new Map(tabs.map((tab) => [tab.id, tab]));
    const reportRows = entries.map((entry) => { const student = studentById.get(entry.academicStudentId) || {}; const subject = subjectById.get(entry.subjectId) || {}; const tab = tabById.get(entry.scoreTabId) || {}; return { id: entry.id, studentId: entry.academicStudentId, studentName: student.name || student.displayName || entry.academicStudentId, className: student.className || '', period: tab.label || entry.scoreTabId, subject: subject.name || entry.subjectId, score: entry.score, maximumScore: subject.maxScore ?? null, formula: entry.formula ?? null }; });
    return { gradebook: record, classIds, students: uniqueStudents, subjects, tabs, entries, reportRows };
  }});
}

module.exports = { registerGradebooks };
