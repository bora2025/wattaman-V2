'use strict';

// Academic transcripts (monthly bulletins), cloned from the school's original Academic Transcript:
// score sheets used by classes, their subjects and exam months, per-student subject scores, conduct
// and comment remarks, and absences counted from attendance over the month's period (absences.js:
// the same counting as the attendance reports, so a missed scan on a study day is an absence).
//   Setup (sheets, classes, subjects, months): administrators with the manage permission.
//   Scores, remarks and the month's period: staff of the class with transcripts.edit.
//   Reading a class's transcript: staff of the class with the view permission.
const crypto = require('crypto');

const T = {
  sheet: 'plugin_wattanam_academic_management_transcript_sheet',
  sheetClass: 'plugin_wattanam_academic_management_transcript_sheet_class',
  subject: 'plugin_wattanam_academic_management_transcript_subject',
  tab: 'plugin_wattanam_academic_management_transcript_tab',
  score: 'plugin_wattanam_academic_management_transcript_score',
  remark: 'plugin_wattanam_academic_management_transcript_remark',
  klass: 'plugin_wattanam_academic_management_class',
  student: 'plugin_wattanam_academic_management_student_profile',
  enrollment: 'plugin_wattanam_academic_management_enrollment_interval',
  record: 'plugin_wattanam_academic_management_attendance_record',
  studyYear: 'plugin_wattanam_academic_management_study_year',
  field: 'plugin_wattanam_academic_management_class_registration_field',
};
// Named columns, never SELECT *: a pooled connection caches each statement's result shape, and an update that
// adds columns would make every cached SELECT * fail once ("cached plan must not change result type").
const SHEET_COLUMNS = '"id", "name", "degree", "studyYearId", "coefficient", "averageMax", "gradeScale", "kind", "createdAt", "updatedAt"';
const SUBJECT_COLUMNS = '"id", "sheetId", "name", "maxScore", "color", "order", "coefficient", "parentId", "tabId", "createdAt", "updatedAt"';
// The subject columns lists and score sheets read (a university subject belongs to one semester: "tabId").
const SUBJECT_LIST = '"id", "sheetId", "name", "maxScore", "color", "order", "coefficient", "parentId", "tabId"';
const { readPrintTemplate, writePrintTemplate } = require('./report-print-template');
const { absenceCounter } = require('./absences');
const studentDetails = require('./student-details');
const VIEW = 'wattanam.academic-management.view';
const MANAGE = 'wattanam.academic-management.manage';
const EDIT = 'wattanam.academic-management.transcripts.edit';
// The score sheets' header & footer (one design for the whole school), from the Teacher Portal.
const PRINT = 'wattanam.academic-management.transcripts.print';
const TAB_TYPES = ['MONTHLY', 'QUARTERLY', 'SEMESTER'];
// SCHOOL: the ministry's primary, secondary and high school sheets (months, semesters, ranking, report cards).
// UNIVERSITY: semesters, each with its own subjects; a letter grade per subject, the year's total,
// average, grade, GPA and rank (ui/university-math.js).
const KINDS = ['SCHOOL', 'UNIVERSITY'];
// A sheet's classes that fit its kind (s = sheet, c = class). A class whose level changed after it was added
// to a sheet of the other kind is left out everywhere; the link is kept, so changing the level back restores it.
const FITS = `(c."level" IS NULL OR c."level" = 'SHORT_COURSE' OR (s."kind" = 'UNIVERSITY' AND c."level" = 'UNIVERSITY') OR (s."kind" <> 'UNIVERSITY' AND c."level" IN ('PRIMARY', 'SECONDARY', 'HIGH_SCHOOL')))`;
const UNIVERSITY_SCALE = [
  { letter: 'A', kh: 'ល្អប្រសើរ', min: 85, gpa: 4 },
  { letter: 'B+', kh: 'ល្អណាស់', min: 80, gpa: 3.75 },
  { letter: 'B', kh: 'ល្អ', min: 70, gpa: 3.5 },
  { letter: 'C+', kh: 'ល្អបង្គួរ', min: 65, gpa: 3 },
  { letter: 'C', kh: 'មធ្យម', min: 50, gpa: 2.5 },
  { letter: 'D', kh: 'ខ្សោយ', min: 45, gpa: 2.25 },
  { letter: 'E', kh: 'ខ្សោយណាស់', min: 40, gpa: 2 },
  { letter: 'F', kh: 'ធ្លាក់', min: 0, gpa: 1.75 },
];
function kindOf(value) { return String(value || '').toUpperCase() === 'UNIVERSITY' ? 'UNIVERSITY' : 'SCHOOL'; }

function text(value, name, max, required) {
  const result = value === undefined || value === null ? '' : String(value).replace(/[\u0000-\u001f]/g, ' ').trim();
  if (required && !result) throw new Error(`${name} is required`);
  if (result.length > max) throw new Error(`${name} must be at most ${max} characters`);
  return result;
}
function id(value, name) { const result = text(value, name, 100, true); if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new Error(`${name} is invalid`); return result; }
function day(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const result = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(new Date(`${result}T00:00:00Z`).getTime())) throw new Error(`${name} must be a date`);
  return result;
}
// Coefficient (មេគុណ): how many "subjects" this one counts for when the total is averaged.
function coefficient(value) {
  if (value === undefined || value === null || value === '') return 1;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 10) throw new Error('coefficient must be between 0 and 10');
  return result;
}
function optionalNumber(value) { return value === null || value === undefined ? null : Number(value); }
// A sheet's averaging: empty means automatic (see ui/score-math.js).
function averaging(value, name, max) {
  if (value === undefined || value === null || value === '') return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0 || result > max) throw new Error(`${name} must be more than 0 and at most ${max}`);
  return result;
}
// Six grade levels, highest first: { letter, kh, min } with min a percentage of the best possible,
// strictly falling, the last 0. null = the ministry scale.
function gradeScale(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!Array.isArray(value) || value.length !== 6) throw new Error('The grade scale must have six grades');
  const scale = value.map((g, i) => {
    const letter = text(g?.letter, `Grade ${i + 1} letter`, 3, true);
    const kh = text(g?.kh, `Grade ${letter} name`, 40, false);
    const min = i === 5 ? 0 : Number(g?.min);
    if (!Number.isFinite(min) || min < 0 || min > 100) throw new Error(`Grade ${letter}: the minimum must be between 0% and 100%`);
    return { letter, kh, min: Math.round(min * 100) / 100 };
  });
  for (let i = 0; i < 5; i += 1) if (!(scale[i].min > scale[i + 1].min)) throw new Error(`Grade ${scale[i].letter} must need more than grade ${scale[i + 1].letter}`);
  if (new Set(scale.map((g) => g.letter.toUpperCase())).size !== 6) throw new Error('Each grade needs its own letter');
  return scale;
}
// A university grade scale: 2-12 grades, highest first: { letter, kh, min (% of the subject's maximum), gpa }.
function universityScale(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!Array.isArray(value) || value.length < 2 || value.length > 12) throw new Error('The grade scale must have 2 to 12 grades');
  const scale = value.map((g, i) => {
    const letter = text(g?.letter, `Grade ${i + 1} letter`, 3, true);
    const kh = text(g?.kh, `Grade ${letter} name`, 40, false);
    const min = i === value.length - 1 ? 0 : Number(g?.min);
    const gpa = Number(g?.gpa);
    if (!Number.isFinite(min) || min < 0 || min > 100) throw new Error(`Grade ${letter}: the minimum must be between 0% and 100%`);
    if (!Number.isFinite(gpa) || gpa < 0 || gpa > 5) throw new Error(`Grade ${letter}: the GPA must be between 0 and 5`);
    return { letter, kh, min: Math.round(min * 100) / 100, gpa: Math.round(gpa * 100) / 100 };
  });
  for (let i = 0; i < scale.length - 1; i += 1) if (!(scale[i].min > scale[i + 1].min)) throw new Error(`Grade ${scale[i].letter} must need more than grade ${scale[i + 1].letter}`);
  if (new Set(scale.map((g) => g.letter.toUpperCase())).size !== scale.length) throw new Error('Each grade needs its own letter');
  return scale;
}
function color(value) { const result = text(value, 'color', 7, false) || '#334155'; if (!/^#[0-9a-fA-F]{6}$/.test(result)) throw new Error('color must look like #1e293b'); return result; }

function registerTranscripts(context, helpers) {
  const db = context.database;
  const { requireClassStaffScope, requireAdministrativePrincipal, decorateStudentRows } = helpers;

  context.permissions.register([
    { id: EDIT, label: 'Enter transcript scores, conduct and comments for my classes', roles: ['TEACHER', 'CLASS_ADMIN'] },
    { id: PRINT, label: 'Edit the score sheets’ header & footer', description: 'From Enter Scores: the school name, lines, motto, titles and signatures printed on the primary, secondary & high school and the university score sheets. One design for the whole school.', roles: ['TEACHER', 'CLASS_ADMIN'] },
  ]);

  const sheetOf = async (sheetId) => {
    const rows = await db.query(`SELECT ${SHEET_COLUMNS} FROM ${T.sheet} WHERE "id" = $1 LIMIT 1`, [sheetId]);
    if (!rows.length) throw new Error('Score sheet not found');
    return rows[0];
  };
  // The academic year a document belongs to: the sheet's year, else the class's, else the current one.
  // It carries the school's name, logo and the year's dates (plain YYYY-MM-DD).
  const YEAR_COLUMNS = `"label", "year", to_char("startDate", 'YYYY-MM-DD') AS "startDate", to_char("endDate", 'YYYY-MM-DD') AS "endDate", "schoolName", "logoUrl"`;
  const yearOf = async (sheet, classId) => {
    const byId = async (yearId) => (yearId ? (await db.query(`SELECT ${YEAR_COLUMNS} FROM ${T.studyYear} WHERE "id" = $1 LIMIT 1`, [yearId]))[0] : null) || null;
    let year = await byId(sheet && sheet.studyYearId);
    if (!year && classId) {
      const klass = (await db.query(`SELECT "studyYearId" FROM ${T.klass} WHERE "id" = $1 LIMIT 1`, [classId]))[0];
      year = await byId(klass && klass.studyYearId);
    }
    if (!year) year = (await db.query(`SELECT ${YEAR_COLUMNS} FROM ${T.studyYear} WHERE "isCurrent" = TRUE ORDER BY "year" DESC LIMIT 1`))[0] || null;
    return year;
  };
  const schoolOf = (year) => ({
    name: (year && year.schoolName) || '', logoUrl: (year && year.logoUrl) || '',
    startDate: (year && year.startDate) || null, endDate: (year && year.endDate) || null,
  });
  const tabOf = async (tabId) => {
    const rows = await db.query(`SELECT t."id", t."sheetId", t."label", t."type", t."order", t."periodStart"::text AS "periodStart", t."periodEnd"::text AS "periodEnd", s."name" AS "sheetName", s."degree", s."coefficient" AS "sheetCoefficient", s."averageMax" AS "sheetAverageMax", s."gradeScale" AS "sheetGradeScale" FROM ${T.tab} t JOIN ${T.sheet} s ON s."id" = t."sheetId" WHERE t."id" = $1 LIMIT 1`, [tabId]);
    if (!rows.length) throw new Error('Exam month not found');
    return rows[0];
  };
  // The class must be one of the sheet's classes, and the caller must be staff of that class.
  const requireSheetClass = async (request, sheetId, classId) => {
    const rows = await db.query(`SELECT sc."id", ${FITS} AS "fits" FROM ${T.sheetClass} sc JOIN ${T.sheet} s ON s."id" = sc."sheetId" JOIN ${T.klass} c ON c."id" = sc."classId" WHERE sc."sheetId" = $1 AND sc."classId" = $2 LIMIT 1`, [sheetId, classId]);
    if (!rows.length) throw new Error('This class does not use this score sheet');
    if (!rows[0].fits) throw new Error('The class level does not suit this score sheet');
    await requireClassStaffScope(request, classId);
  };
  // A sheet's classes must suit its kind: school sheets take primary, secondary and high school
  // classes, university sheets university classes; short courses and classes without a level suit both.
  const LEVELS_FOR = { SCHOOL: ['PRIMARY', 'SECONDARY', 'HIGH_SCHOOL', 'SHORT_COURSE'], UNIVERSITY: ['UNIVERSITY', 'SHORT_COURSE'] };
  const setClasses = async (tx, sheetId, classIds, kind) => {
    const wanted = [...new Set((Array.isArray(classIds) ? classIds : []).map((value) => id(value, 'classId')))];
    if (wanted.length) {
      const found = await tx.query(`SELECT "id", "name", "level" FROM ${T.klass} WHERE "id" = ANY($1::text[])`, [wanted]);
      if (found.length !== wanted.length) throw new Error('One of the classes was not found');
      const allowed = LEVELS_FOR[kindOf(kind)];
      const misfit = found.find((row) => row.level && !allowed.includes(row.level));
      if (misfit) throw new Error(kindOf(kind) === 'UNIVERSITY' ? `${misfit.name} is not a university class` : `${misfit.name} is a university class; use a university score sheet`);
    }
    await tx.execute(`DELETE FROM ${T.sheetClass} WHERE "sheetId" = $1 AND NOT ("classId" = ANY($2::text[]))`, [sheetId, wanted]);
    for (const classId of wanted) {
      await tx.execute(`INSERT INTO ${T.sheetClass} ("id", "sheetId", "classId") VALUES ($1, $2, $3) ON CONFLICT ("sheetId", "classId") DO NOTHING`, [crypto.randomUUID(), sheetId, classId]);
    }
  };

  // A subject may be a part of another subject of the same sheet (one level: Khmer = dictation + composition + ...).
  const semesterFor = async (sheetId, value) => {
    const tabId = id(value, 'Semester');
    const tab = (await db.query(`SELECT "id" FROM ${T.tab} WHERE "id" = $1 AND "sheetId" = $2 LIMIT 1`, [tabId, sheetId]))[0];
    if (!tab) throw new Error('The semester was not found in this score sheet');
    return tabId;
  };
  const parentFor = async (sheetId, subjectId, value) => {
    if (value === undefined || value === null || value === '') return null;
    const parentId = id(value, 'parentId');
    if (parentId === subjectId) throw new Error('A subject cannot be a part of itself');
    const parent = (await db.query(`SELECT "id", "parentId" FROM ${T.subject} WHERE "id" = $1 AND "sheetId" = $2 LIMIT 1`, [parentId, sheetId]))[0];
    if (!parent) throw new Error('The subject it is part of was not found in this score sheet');
    if (parent.parentId) throw new Error('A part cannot have parts of its own');
    if (subjectId && (await db.query(`SELECT 1 FROM ${T.subject} WHERE "parentId" = $1 LIMIT 1`, [subjectId])).length) throw new Error('This subject has parts, so it cannot be a part of another subject');
    return parentId;
  };

  // ---------- sheets ----------
  context.routes.register({
    method: 'GET', path: 'transcripts/sheets', permission: VIEW,
    handler: async (request) => {
      const principal = request?.principal || {};
      const own = principal.role === 'TEACHER' ? 'teacherId' : principal.role === 'CLASS_ADMIN' ? 'classAdminId' : null;
      const mine = own ? new Set((await db.query(`SELECT "id" FROM ${T.klass} WHERE "${own}" = $1`, [principal.userId])).map((row) => row.id)) : null;
      const [sheets, classes, tabs, subjects] = await Promise.all([
        db.query(`SELECT ${SHEET_COLUMNS} FROM ${T.sheet} WHERE "kind" = $1 ORDER BY "createdAt" DESC`, [kindOf(request?.query?.kind)]),
        db.query(`SELECT sc."sheetId", sc."classId" FROM ${T.sheetClass} sc JOIN ${T.sheet} s ON s."id" = sc."sheetId" JOIN ${T.klass} c ON c."id" = sc."classId" WHERE ${FITS}`),
        db.query(`SELECT "id", "sheetId", "label", "type", "order", "periodStart"::text, "periodEnd"::text FROM ${T.tab} ORDER BY "order", "createdAt"`),
        db.query(`SELECT ${SUBJECT_LIST} FROM ${T.subject} ORDER BY "order", "createdAt"`),
      ]);
      return sheets.map((sheet) => ({
        ...sheet,
        classIds: classes.filter((row) => row.sheetId === sheet.id && (!mine || mine.has(row.classId))).map((row) => row.classId),
        tabs: tabs.filter((row) => row.sheetId === sheet.id),
        subjects: subjects.filter((row) => row.sheetId === sheet.id),
      })).filter((sheet) => !mine || sheet.classIds.length);
    },
  });
  context.routes.register({
    method: 'POST', path: 'transcripts/sheets', permission: MANAGE,
    handler: async (request) => {
      await requireAdministrativePrincipal(request);
      const body = request?.body || {};
      const sheetId = crypto.randomUUID();
      const kind = String(body.kind || 'SCHOOL').toUpperCase();
      if (!KINDS.includes(kind)) throw new Error('kind must be SCHOOL or UNIVERSITY');
      await db.transaction(async (tx) => {
        await tx.execute(`INSERT INTO ${T.sheet} ("id", "name", "degree", "studyYearId", "kind", "gradeScale") VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [sheetId, text(body.name, 'name', 160, true), text(body.degree, 'degree', 160, false) || null, text(body.studyYearId, 'studyYearId', 100, false) || null, kind, kind === 'UNIVERSITY' ? JSON.stringify(UNIVERSITY_SCALE) : null]);
        if (kind === 'UNIVERSITY') {
          for (const [order, label] of ['ឆមាសទី១', 'ឆមាសទី២'].entries()) {
            await tx.execute(`INSERT INTO ${T.tab} ("id", "sheetId", "label", "type", "order") VALUES ($1, $2, $3, 'SEMESTER', $4)`, [crypto.randomUUID(), sheetId, label, order]);
          }
        }
        await setClasses(tx, sheetId, body.classIds, kind);
      });
      return sheetOf(sheetId);
    },
  });
  context.routes.register({
    method: 'PUT', path: 'transcripts/sheets/:id', permission: MANAGE,
    handler: async (request) => {
      await requireAdministrativePrincipal(request);
      const sheetId = id(request?.params?.id, 'sheet id');
      const sheet = await sheetOf(sheetId);
      const body = request?.body || {};
      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE ${T.sheet} SET "name" = $2, "degree" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          [sheetId, text(body.name, 'name', 160, true), text(body.degree, 'degree', 160, false) || null]);
        if (body.classIds !== undefined) await setClasses(tx, sheetId, body.classIds, sheet.kind);
      });
      return sheetOf(sheetId);
    },
  });
  context.routes.register({
    method: 'DELETE', path: 'transcripts/sheets/:id', permission: MANAGE,
    handler: async (request) => {
      await requireAdministrativePrincipal(request);
      const changed = await db.execute(`DELETE FROM ${T.sheet} WHERE "id" = $1`, [id(request?.params?.id, 'sheet id')]);
      if (!changed?.count) throw new Error('Score sheet not found');
      return { deleted: true };
    },
  });

  // The class's មេគុណ (the total is divided by it) and what a full average is worth for grades.
  context.routes.register({
    method: 'PUT', path: 'transcripts/sheets/:id/averaging', permission: MANAGE,
    handler: async (request) => {
      await requireAdministrativePrincipal(request);
      const sheetId = id(request?.params?.id, 'sheet id');
      await sheetOf(sheetId);
      const body = request?.body || {};
      const coefficient = averaging(body.coefficient, 'មេគុណ (coefficient)', 100);
      const averageMax = averaging(body.averageMax, 'The full average', 1000);
      await db.execute(`UPDATE ${T.sheet} SET "coefficient" = $2, "averageMax" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [sheetId, coefficient, averageMax]);
      return { id: sheetId, coefficient, averageMax };
    },
  });

  // The score sheet's grade scale (letters, Khmer names and minimums).
  context.routes.register({
    method: 'PUT', path: 'transcripts/sheets/:id/grades', permission: MANAGE,
    handler: async (request) => {
      await requireAdministrativePrincipal(request);
      const sheetId = id(request?.params?.id, 'sheet id');
      const sheet = await sheetOf(sheetId);
      const scale = sheet.kind === 'UNIVERSITY' ? universityScale(request?.body?.gradeScale) : gradeScale(request?.body?.gradeScale);
      await db.execute(`UPDATE ${T.sheet} SET "gradeScale" = $2::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [sheetId, scale ? JSON.stringify(scale) : null]);
      return { id: sheetId, gradeScale: scale };
    },
  });

  // ---------- subjects ----------
  context.routes.register({
    method: 'POST', path: 'transcripts/sheets/:id/subjects', permission: MANAGE,
    handler: async (request) => {
      await requireAdministrativePrincipal(request);
      const sheetId = id(request?.params?.id, 'sheet id');
      const sheet = await sheetOf(sheetId);
      const body = request?.body || {};
      const maxScore = Number(body.maxScore === undefined || body.maxScore === '' ? 100 : body.maxScore);
      if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000) throw new Error('maxScore must be between 1 and 1000');
      const order = (await db.query(`SELECT COUNT(*)::int AS "count" FROM ${T.subject} WHERE "sheetId" = $1`, [sheetId]))[0].count;
      const subjectId = crypto.randomUUID();
      const university = sheet.kind === 'UNIVERSITY';
      const parentId = university ? null : await parentFor(sheetId, null, body.parentId);
      const tabId = university ? await semesterFor(sheetId, body.tabId) : null;
      await db.execute(`INSERT INTO ${T.subject} ("id", "sheetId", "name", "maxScore", "color", "order", "coefficient", "parentId", "tabId") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [subjectId, sheetId, text(body.name, 'name', 120, true), maxScore, color(body.color), order, coefficient(body.coefficient), parentId, tabId]);
      return (await db.query(`SELECT ${SUBJECT_COLUMNS} FROM ${T.subject} WHERE "id" = $1`, [subjectId]))[0];
    },
  });
  context.routes.register({
    method: 'PUT', path: 'transcripts/subjects/:id', permission: MANAGE,
    handler: async (request) => {
      await requireAdministrativePrincipal(request);
      const subjectId = id(request?.params?.id, 'subject id');
      const body = request?.body || {};
      const maxScore = Number(body.maxScore);
      if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000) throw new Error('maxScore must be between 1 and 1000');
      const order = Number.isInteger(Number(body.order)) ? Number(body.order) : 0;
      const current = (await db.query(`SELECT "sheetId", "coefficient", "parentId", "tabId" FROM ${T.subject} WHERE "id" = $1 LIMIT 1`, [subjectId]))[0];
      if (!current) throw new Error('Subject not found');
      if (current.tabId && body.tabId !== undefined && body.tabId !== current.tabId) {
        const tabId = await semesterFor(current.sheetId, body.tabId);
        await db.execute(`UPDATE ${T.subject} SET "tabId" = $2 WHERE "id" = $1`, [subjectId, tabId]);
      }
      // Fields left out keep their saved values (older screens send only name, max score, colour and order).
      const parentId = body.parentId === undefined ? current.parentId : await parentFor(current.sheetId, subjectId, body.parentId);
      const weight = body.coefficient === undefined ? Number(current.coefficient) : coefficient(body.coefficient);
      const changed = await db.execute(`UPDATE ${T.subject} SET "name" = $2, "maxScore" = $3, "color" = $4, "order" = $5, "coefficient" = $6, "parentId" = $7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        [subjectId, text(body.name, 'name', 120, true), maxScore, color(body.color), order, weight, parentId]);
      if (!changed?.count) throw new Error('Subject not found');
      return (await db.query(`SELECT ${SUBJECT_COLUMNS} FROM ${T.subject} WHERE "id" = $1`, [subjectId]))[0];
    },
  });
  context.routes.register({
    method: 'DELETE', path: 'transcripts/subjects/:id', permission: MANAGE,
    handler: async (request) => {
      await requireAdministrativePrincipal(request);
      const changed = await db.execute(`DELETE FROM ${T.subject} WHERE "id" = $1`, [id(request?.params?.id, 'subject id')]);
      if (!changed?.count) throw new Error('Subject not found');
      return { deleted: true };
    },
  });

  // ---------- exam months ----------
  context.routes.register({
    method: 'POST', path: 'transcripts/sheets/:id/tabs', permission: MANAGE,
    handler: async (request) => {
      await requireAdministrativePrincipal(request);
      const sheetId = id(request?.params?.id, 'sheet id');
      const sheet = await sheetOf(sheetId);
      const body = request?.body || {};
      const type = sheet.kind === 'UNIVERSITY' ? 'SEMESTER' : String(body.type || 'MONTHLY').toUpperCase();
      if (!TAB_TYPES.includes(type)) throw new Error('type must be MONTHLY, QUARTERLY or SEMESTER');
      const periodStart = day(body.periodStart, 'periodStart'), periodEnd = day(body.periodEnd, 'periodEnd');
      if (periodStart && periodEnd && periodStart > periodEnd) throw new Error('periodStart must be on or before periodEnd');
      const order = (await db.query(`SELECT COUNT(*)::int AS "count" FROM ${T.tab} WHERE "sheetId" = $1`, [sheetId]))[0].count;
      const tabId = crypto.randomUUID();
      await db.execute(`INSERT INTO ${T.tab} ("id", "sheetId", "label", "type", "order", "periodStart", "periodEnd") VALUES ($1, $2, $3, $4, $5, $6::date, $7::date)`,
        [tabId, sheetId, text(body.label, 'label', 80, true), type, order, periodStart, periodEnd]);
      return (await db.query(`SELECT "id", "sheetId", "label", "type", "order", "periodStart"::text, "periodEnd"::text FROM ${T.tab} WHERE "id" = $1`, [tabId]))[0];
    },
  });
  context.routes.register({
    method: 'DELETE', path: 'transcripts/tabs/:id', permission: MANAGE,
    handler: async (request) => {
      await requireAdministrativePrincipal(request);
      const changed = await db.execute(`DELETE FROM ${T.tab} WHERE "id" = $1`, [id(request?.params?.id, 'month id')]);
      if (!changed?.count) throw new Error('Exam month not found');
      return { deleted: true };
    },
  });
  // The month's label and calendar period (the period drives the absence counts).
  context.routes.register({
    method: 'PUT', path: 'transcripts/tabs/:id', permission: EDIT,
    handler: async (request) => {
      const tab = await tabOf(id(request?.params?.id, 'month id'));
      const body = request?.body || {};
      await requireSheetClass(request, tab.sheetId, id(body.classId, 'classId'));
      const periodStart = day(body.periodStart, 'periodStart'), periodEnd = day(body.periodEnd, 'periodEnd');
      if (periodStart && periodEnd && periodStart > periodEnd) throw new Error('periodStart must be on or before periodEnd');
      const label = body.label === undefined ? tab.label : text(body.label, 'label', 80, true);
      await db.execute(`UPDATE ${T.tab} SET "label" = $2, "periodStart" = $3::date, "periodEnd" = $4::date, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [tab.id, label, periodStart, periodEnd]);
      return (await db.query(`SELECT "id", "sheetId", "label", "type", "order", "periodStart"::text, "periodEnd"::text FROM ${T.tab} WHERE "id" = $1`, [tab.id]))[0];
    },
  });

  // ---------- the class transcript ----------
  const roster = async (classId) => {
    const rows = await db.query(
      `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."sex", s."dateOfBirth"::text, s."photo", s."address", ${studentDetails.detailColumns('s')}, s."customFieldValues", e."validFrom"::text AS "enrolledFrom", c."name" AS "className"
       FROM ${T.student} s JOIN ${T.enrollment} e ON e."studentId" = s."id" AND e."validTo" IS NULL JOIN ${T.klass} c ON c."id" = e."classId"
       WHERE e."classId" = $1 ORDER BY s."studentNumber" ASC NULLS LAST`, [classId]);
    return decorateStudentRows(rows);
  };
  context.routes.register({
    method: 'GET', path: 'transcripts/tabs/:id/report', permission: VIEW,
    handler: async (request) => {
      const tab = await tabOf(id(request?.params?.id, 'month id'));
      const classId = id(request?.query?.classId, 'classId');
      await requireSheetClass(request, tab.sheetId, classId);
      const [subjects, students, klass] = await Promise.all([
        db.query(`SELECT "id", "name", "maxScore", "color", "order", "coefficient", "parentId" FROM ${T.subject} WHERE "sheetId" = $1 ORDER BY "order", "createdAt"`, [tab.sheetId]),
        roster(classId),
        db.query(`SELECT c."name", c."teacherId" FROM ${T.klass} c WHERE c."id" = $1`, [classId]).then((rows) => rows[0] || {}),
      ]);
      const ids = students.map((student) => student.id);
      const [entries, remarks, absences] = await Promise.all([
        ids.length ? db.query(`SELECT "studentId", "subjectId", "score" FROM ${T.score} WHERE "tabId" = $1 AND "studentId" = ANY($2::text[])`, [tab.id, ids]) : [],
        ids.length ? db.query(`SELECT "studentId", "conduct", "comment" FROM ${T.remark} WHERE "tabId" = $1 AND "studentId" = ANY($2::text[])`, [tab.id, ids]) : [],
        // counted like the attendance reports: a missed scan on a study day is an absence
        tab.periodStart && tab.periodEnd && ids.length
          ? absenceCounter(context, classId, tab.periodStart, tab.periodEnd).then((counter) => counter.count(tab.periodStart, tab.periodEnd, ids))
          : [],
      ]);
      const teacher = klass.teacherId ? (await context.directory.lookupUsers([klass.teacherId]))[0] : null;
      const absenceMap = Object.fromEntries(students.map((student) => [student.id, { excused: 0, unexcused: 0 }]));
      absences.forEach((row) => { absenceMap[row.studentId] = { excused: row.excused, unexcused: row.unexcused }; });
      return {
        tab: { id: tab.id, label: tab.label, type: tab.type, periodStart: tab.periodStart ? String(tab.periodStart).slice(0, 10) : null, periodEnd: tab.periodEnd ? String(tab.periodEnd).slice(0, 10) : null, sheetId: tab.sheetId, sheetName: tab.sheetName, degree: tab.degree, sheetCoefficient: optionalNumber(tab.sheetCoefficient), sheetAverageMax: optionalNumber(tab.sheetAverageMax), sheetGradeScale: tab.sheetGradeScale || null },
        className: klass.name || '', teacherName: teacher?.name || '',
        subjects,
        students: students.map((s) => ({ id: s.id, studentNumber: s.studentNumber || '', name: s.name || '', nameKh: s.nameKh || '', sex: s.sex || null, dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : null, className: s.className || klass.name || '' })),
        entries, remarks, absences: absenceMap,
        totalStudents: students.length, femaleCount: students.filter((s) => s.sex === 'FEMALE').length,
      };
    },
  });
  // ---------- the class score sheet (ministry layout: monthly or semester) ----------
  // The months a semester averages: monthly tabs inside the semester's period when both have
  // periods; otherwise the monthly tabs listed between the previous semester and this one.
  const semesterMonths = (tabs, semesterTab) => {
    const monthly = tabs.filter((t) => t.type === 'MONTHLY');
    if (semesterTab.periodStart && semesterTab.periodEnd) {
      const inside = monthly.filter((t) => t.periodStart && t.periodStart >= semesterTab.periodStart && t.periodStart <= semesterTab.periodEnd);
      if (inside.length) return inside;
    }
    const at = tabs.findIndex((t) => t.id === semesterTab.id);
    const result = [];
    for (let i = at - 1; i >= 0 && tabs[i].type !== 'SEMESTER'; i -= 1) if (tabs[i].type === 'MONTHLY') result.unshift(tabs[i]);
    return result;
  };
  // The class's score sheet: for the View permission, and for score entry (Enter transcript scores…),
  // always limited to the caller's own classes for teachers and class admins.
  const scoreSheet = async (request) => {
      const tab = await tabOf(id(request?.query?.tabId, 'tabId'));
      const classId = id(request?.query?.classId, 'classId');
      await requireSheetClass(request, tab.sheetId, classId);
      const [sheet, tabs, subjects, students, klass] = await Promise.all([
        sheetOf(tab.sheetId),
        db.query(`SELECT "id", "label", "type", "order", "periodStart"::text AS "periodStart", "periodEnd"::text AS "periodEnd" FROM ${T.tab} WHERE "sheetId" = $1 ORDER BY "order", "createdAt"`, [tab.sheetId]),
        db.query(`SELECT "id", "name", "maxScore", "color", "order", "coefficient", "parentId" FROM ${T.subject} WHERE "sheetId" = $1 ORDER BY "order", "createdAt"`, [tab.sheetId]),
        roster(classId),
        db.query(`SELECT c."name", c."teacherId" FROM ${T.klass} c WHERE c."id" = $1`, [classId]).then((rows) => rows[0] || {}),
      ]);
      const year = await yearOf(sheet, classId);
      const months = tab.type === 'SEMESTER' ? semesterMonths(tabs, { ...tab, periodStart: tab.periodStart, periodEnd: tab.periodEnd }) : [];
      const ids = students.map((student) => student.id);
      // The year so far: the sheet's earlier semesters (with their months) feed the yearly average.
      const earlier = tab.type === 'SEMESTER' ? tabs.slice(0, tabs.findIndex((t) => t.id === tab.id)).filter((t) => t.type === 'SEMESTER').map((s) => ({ ...s, months: semesterMonths(tabs, s) })) : [];
      const tabIds = [...new Set([tab.id, ...months.map((month) => month.id), ...earlier.flatMap((s) => [s.id, ...s.months.map((m) => m.id)])])];
      const [entries, remarks] = await Promise.all([
        ids.length ? db.query(`SELECT "tabId", "studentId", "subjectId", "score" FROM ${T.score} WHERE "tabId" = ANY($1::text[]) AND "studentId" = ANY($2::text[])`, [tabIds, ids]) : [],
        ids.length ? db.query(`SELECT "studentId", "conduct", "comment" FROM ${T.remark} WHERE "tabId" = $1 AND "studentId" = ANY($2::text[])`, [tab.id, ids]) : [],
      ]);
      const teacher = klass.teacherId ? (await context.directory.lookupUsers([klass.teacherId]))[0] : null;
      // The year's absences (for the yearly report card): the study year's dates, or else the span of the
      // periods set on this year's semesters and months.
      // All counted like the attendance reports (absences.js): one load of the class's attendance.
      const spanOf = (list) => { const s = list.filter((x) => x && x.periodStart && x.periodEnd); return s.length ? [s.map((x) => String(x.periodStart).slice(0, 10)).sort()[0], s.map((x) => String(x.periodEnd).slice(0, 10)).sort().pop()] : null; };
      const wide = spanOf([tab, ...months, ...earlier.flatMap((s) => [s, ...s.months]), year && year.startDate && year.endDate ? { periodStart: year.startDate, periodEnd: year.endDate } : null]);
      const counter = wide && ids.length ? await absenceCounter(context, classId, wide[0], wide[1]) : { count: () => [] };
      let absenceRange = null, yearAbsences = [];
      if (tab.type === 'SEMESTER' && ids.length) {
        const spans = [tab, ...months, ...earlier.flatMap((s) => [s, ...s.months])].filter((x) => x.periodStart && x.periodEnd);
        const start = year && year.startDate ? String(year.startDate).slice(0, 10) : spans.map((x) => String(x.periodStart).slice(0, 10)).sort()[0];
        const end = year && year.endDate ? String(year.endDate).slice(0, 10) : spans.map((x) => String(x.periodEnd).slice(0, 10)).sort().pop();
        if (start && end) {
          absenceRange = { start, end };
          yearAbsences = counter.count(start, end, ids);
        }
      }
      // This month's (or semester's) own period: the monthly bulletin's absences.
      const tabAbsences = tab.periodStart && tab.periodEnd && ids.length
        ? counter.count(tab.periodStart, tab.periodEnd, ids)
        : [];
      // Each semester's absences (record book): the semester's own period, or the span of its months' periods.
      const semesterAbsences = [];
      if (tab.type === 'SEMESTER' && ids.length) {
        for (const semester of [...earlier, { ...tab, months }]) {
          const spans = semester.periodStart && semester.periodEnd ? [semester] : (semester.months || []).filter((x) => x.periodStart && x.periodEnd);
          if (!spans.length) continue;
          const start = spans.map((x) => String(x.periodStart).slice(0, 10)).sort()[0];
          const end = spans.map((x) => String(x.periodEnd).slice(0, 10)).sort().pop();
          const counted = counter.count(start, end, ids);
          semesterAbsences.push({ tabId: semester.id, start, end, counts: counted.map((row) => ({ studentId: row.studentId, excused: row.excused, unexcused: row.unexcused })) });
        }
      }
      return {
        tab: { id: tab.id, label: tab.label, type: tab.type, periodStart: tab.periodStart, periodEnd: tab.periodEnd },
        absenceRange, yearAbsences, semesterAbsences, tabAbsences,
        sheet: { id: sheet.id, name: sheet.name, degree: sheet.degree || '', coefficient: optionalNumber(sheet.coefficient), averageMax: optionalNumber(sheet.averageMax), gradeScale: sheet.gradeScale || null },
        studyYear: year ? year.label || String(year.year) : '',
        school: schoolOf(year),
        className: klass.name || '', teacherName: teacher?.name || '',
        subjects: subjects.map((s) => ({ ...s, maxScore: Number(s.maxScore), coefficient: Number(s.coefficient) })),
        students: students.map((s) => ({ id: s.id, studentNumber: s.studentNumber || '', name: s.name || '', nameKh: s.nameKh || '', sex: s.sex || null, photo: s.photo || '', dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : null, address: s.address || '', ...studentDetails.detailsOut(s), customFieldValues: s.customFieldValues || {}, enrolledFrom: s.enrolledFrom ? String(s.enrolledFrom).slice(0, 10) : null })),
        // The school's own registration fields (record book: place of birth, father, mother, by label).
        customFields: (await db.query(`SELECT "key", "label" FROM ${T.field} WHERE "enabled" = TRUE ORDER BY "order"`)).map((x) => ({ key: x.key, label: x.label })),
        months: months.map((m) => ({ id: m.id, label: m.label })),
        earlierSemesters: earlier.map((s) => ({ id: s.id, label: s.label, months: s.months.map((m) => ({ id: m.id, label: m.label })) })),
        entries: entries.map((e) => ({ tabId: e.tabId, studentId: e.studentId, subjectId: e.subjectId, score: e.score === null ? null : Number(e.score) })),
        remarks,
      };
  };
  context.routes.register({ method: 'GET', path: 'transcripts/score-sheet', permission: VIEW, handler: scoreSheet });
  context.routes.register({ method: 'GET', path: 'transcripts/entry/score-sheet', permission: EDIT, handler: scoreSheet });
  // Score entry without the View permission: the score sheets of the caller's own classes (all classes
  // for administrators), with those classes' names, and the school's print form to read.
  context.routes.register({
    method: 'GET', path: 'transcripts/entry/sheets', permission: EDIT,
    handler: async (request) => {
      const principal = request?.principal || {};
      const own = principal.role === 'TEACHER' ? 'teacherId' : principal.role === 'CLASS_ADMIN' ? 'classAdminId' : null;
      const classes = own
        ? await db.query(`SELECT "id", "name" FROM ${T.klass} WHERE "${own}" = $1 ORDER BY "name"`, [principal.userId])
        : ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'].includes(principal.role) ? await db.query(`SELECT "id", "name" FROM ${T.klass} ORDER BY "name"`) : [];
      const mine = new Set(classes.map((c) => c.id));
      const [sheets, links, tabs, subjects] = await Promise.all([
        db.query(`SELECT ${SHEET_COLUMNS} FROM ${T.sheet} WHERE "kind" = $1 ORDER BY "createdAt" DESC`, [kindOf(request?.query?.kind)]),
        db.query(`SELECT sc."sheetId", sc."classId" FROM ${T.sheetClass} sc JOIN ${T.sheet} s ON s."id" = sc."sheetId" JOIN ${T.klass} c ON c."id" = sc."classId" WHERE ${FITS}`),
        db.query(`SELECT "id", "sheetId", "label", "type", "order", "periodStart"::text, "periodEnd"::text FROM ${T.tab} ORDER BY "order", "createdAt"`),
        db.query(`SELECT ${SUBJECT_LIST} FROM ${T.subject} ORDER BY "order", "createdAt"`),
      ]);
      return {
        classes: classes.map((c) => ({ id: c.id, name: c.name })),
        sheets: sheets.map((sheet) => ({
          ...sheet,
          classIds: links.filter((row) => row.sheetId === sheet.id && mine.has(row.classId)).map((row) => row.classId),
          tabs: tabs.filter((row) => row.sheetId === sheet.id),
          subjects: subjects.filter((row) => row.sheetId === sheet.id),
        })).filter((sheet) => sheet.classIds.length),
      };
    },
  });
  context.routes.register({
    method: 'GET', path: 'transcripts/entry/print-template', permission: EDIT,
    handler: () => readPrintTemplate(context, 'scoresheet'),
  });
  // Saving the header & footer from Enter Scores ("Edit the score sheets' header & footer").
  context.routes.register({ method: 'PUT', path: 'transcripts/entry/print-template', permission: PRINT, handler: (request) => writePrintTemplate(context, 'scoresheet', request?.body) });
  context.routes.register({ method: 'PUT', path: 'transcripts/entry/university-print-template', permission: PRINT, handler: (request) => writePrintTemplate(context, 'university', request?.body) });
  // The university score sheets' header & footer, for score entry without the View permission.
  context.routes.register({
    method: 'GET', path: 'transcripts/entry/university-print-template', permission: EDIT,
    handler: () => readPrintTemplate(context, 'university'),
  });
  context.routes.register({
    method: 'GET', path: 'transcripts/progress-book', permission: VIEW,
    handler: async (request) => {
      const sheetId = id(request?.query?.sheetId, 'sheetId');
      const classId = id(request?.query?.classId, 'classId');
      await requireSheetClass(request, sheetId, classId);
      const [sheet, tabs, subjects, klass, fields] = await Promise.all([
        sheetOf(sheetId),
        db.query(`SELECT "id", "label", "type", "order", "periodStart"::text AS "periodStart", "periodEnd"::text AS "periodEnd" FROM ${T.tab} WHERE "sheetId" = $1 ORDER BY "order", "createdAt"`, [sheetId]),
        db.query(`SELECT "id", "name", "maxScore", "color", "order", "coefficient", "parentId" FROM ${T.subject} WHERE "sheetId" = $1 ORDER BY "order", "createdAt"`, [sheetId]),
        db.query(`SELECT c."name", c."teacherId" FROM ${T.klass} c WHERE c."id" = $1`, [classId]).then((rows) => rows[0] || {}),
        db.query(`SELECT "key", "label" FROM ${T.field} WHERE "enabled" = TRUE ORDER BY "order"`),
      ]);
      const months = tabs.filter((tab) => tab.type === 'MONTHLY').slice(0, 10);
      const rows = await db.query(
        `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."sex", s."dateOfBirth"::text AS "dateOfBirth", s."photo", s."address", ${studentDetails.detailColumns('s')}, s."customFieldValues", s."guardianUserId"
         FROM ${T.student} s JOIN ${T.enrollment} e ON e."studentId" = s."id" AND e."validTo" IS NULL WHERE e."classId" = $1 ORDER BY s."studentNumber" ASC NULLS LAST`, [classId]);
      const students = await decorateStudentRows(rows);
      const ids = students.map((s) => s.id), monthIds = months.map((m) => m.id);
      const guardianIds = [...new Set(students.map((s) => s.guardianUserId).filter(Boolean))];
      const [entries, remarks, guardians, teacher, year] = await Promise.all([
        ids.length && monthIds.length ? db.query(`SELECT "tabId", "studentId", "subjectId", "score" FROM ${T.score} WHERE "tabId" = ANY($1::text[]) AND "studentId" = ANY($2::text[])`, [monthIds, ids]) : [],
        ids.length && monthIds.length ? db.query(`SELECT "tabId", "studentId", "conduct", "comment" FROM ${T.remark} WHERE "tabId" = ANY($1::text[]) AND "studentId" = ANY($2::text[])`, [monthIds, ids]) : [],
        guardianIds.length ? context.directory.lookupUsers(guardianIds) : [],
        klass.teacherId ? context.directory.lookupUsers([klass.teacherId]).then((users) => users[0] || null) : null,
        yearOf(sheet, classId),
      ]);
      // counted like the attendance reports (absences.js), one load for all the months
      const absences = [];
      const dated = months.filter((m) => m.periodStart && m.periodEnd);
      const counter = dated.length && ids.length
        ? await absenceCounter(context, classId, dated.map((m) => String(m.periodStart).slice(0, 10)).sort()[0], dated.map((m) => String(m.periodEnd).slice(0, 10)).sort().pop())
        : null;
      for (const month of months) {
        if (!month.periodStart || !month.periodEnd || !ids.length) continue;
        const counted = counter.count(month.periodStart, month.periodEnd, ids);
        counted.forEach((row) => absences.push({ tabId: month.id, studentId: row.studentId, excused: row.excused, unexcused: row.unexcused }));
      }
      const guardianMap = new Map(guardians.map((user) => [user.id, user]));
      return {
        sheet: { id: sheet.id, name: sheet.name, coefficient: optionalNumber(sheet.coefficient), averageMax: optionalNumber(sheet.averageMax), gradeScale: sheet.gradeScale || null },
        studyYear: year ? year.label || String(year.year) : '',
        school: schoolOf(year),
        className: klass.name || '', teacherName: teacher?.name || '',
        subjects: subjects.map((s) => ({ ...s, maxScore: Number(s.maxScore), coefficient: Number(s.coefficient) })),
        months: months.map((m) => ({ id: m.id, label: m.label, periodStart: m.periodStart, periodEnd: m.periodEnd })),
        customFields: fields.map((f) => ({ key: f.key, label: f.label })),
        students: students.map((s) => {
          const guardian = s.guardianUserId ? guardianMap.get(s.guardianUserId) : null;
          return {
            id: s.id, studentNumber: s.studentNumber || '', name: s.name || '', nameKh: s.nameKh || '', sex: s.sex || null,
            dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : null, photo: s.photo || '', address: s.address || '',
            ...studentDetails.detailsOut(s), phone: s.phone || '', customFieldValues: s.customFieldValues || {},
            guardianName: guardian?.name || '', guardianPhone: guardian?.phone || '',
          };
        }),
        entries: entries.map((e) => ({ tabId: e.tabId, studentId: e.studentId, subjectId: e.subjectId, score: e.score === null ? null : Number(e.score) })),
        remarks, absences,
      };
    },
  });

  // ---------- the university result sheet ----------
  // Every semester of the sheet with its own subjects, the class's students, all their scores, and the
  // remarks (ផ្សេងៗ, kept with the first semester). The figures are worked out by ui/university-math.js.
  const universityResults = async (request) => {
    const sheetId = id(request?.query?.sheetId, 'sheetId');
    const classId = id(request?.query?.classId, 'classId');
    const sheet = await sheetOf(sheetId);
    if (sheet.kind !== 'UNIVERSITY') throw new Error('This is not a university score sheet');
    await requireSheetClass(request, sheetId, classId);
    const [semesters, subjects, students, klass, year] = await Promise.all([
      db.query(`SELECT "id", "label", "order" FROM ${T.tab} WHERE "sheetId" = $1 AND "type" = 'SEMESTER' ORDER BY "order", "createdAt"`, [sheetId]),
      db.query(`SELECT ${SUBJECT_LIST} FROM ${T.subject} WHERE "sheetId" = $1 AND "tabId" IS NOT NULL ORDER BY "order", "createdAt"`, [sheetId]),
      roster(classId),
      db.query(`SELECT c."name", c."teacherId" FROM ${T.klass} c WHERE c."id" = $1`, [classId]).then((rows) => rows[0] || {}),
      yearOf(sheet, classId),
    ]);
    const ids = students.map((s) => s.id), tabIds = semesters.map((s) => s.id);
    const [entries, remarks, teacher] = await Promise.all([
      ids.length && tabIds.length ? db.query(`SELECT "tabId", "studentId", "subjectId", "score" FROM ${T.score} WHERE "tabId" = ANY($1::text[]) AND "studentId" = ANY($2::text[])`, [tabIds, ids]) : [],
      ids.length && tabIds.length ? db.query(`SELECT "studentId", "comment" FROM ${T.remark} WHERE "tabId" = $1 AND "studentId" = ANY($2::text[])`, [tabIds[0], ids]) : [],
      klass.teacherId ? context.directory.lookupUsers([klass.teacherId]).then((users) => users[0] || null) : null,
    ]);
    return {
      sheet: { id: sheet.id, name: sheet.name, degree: sheet.degree || '', kind: sheet.kind, gradeScale: sheet.gradeScale || UNIVERSITY_SCALE },
      defaultGradeScale: UNIVERSITY_SCALE,
      studyYear: year ? year.label || String(year.year) : '',
      school: schoolOf(year),
      className: klass.name || '', teacherName: teacher?.name || '',
      semesters: semesters.map((s) => ({ id: s.id, label: s.label })),
      subjects: subjects.map((s) => ({ id: s.id, tabId: s.tabId, name: s.name, maxScore: Number(s.maxScore), order: s.order })),
      students: students.map((s) => ({ id: s.id, studentNumber: s.studentNumber || '', name: s.name || '', nameKh: s.nameKh || '', sex: s.sex || null, photo: s.photo || '', dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : null })),
      entries: entries.map((e) => ({ tabId: e.tabId, studentId: e.studentId, subjectId: e.subjectId, score: e.score === null ? null : Number(e.score) })),
      remarks: remarks.map((r) => ({ studentId: r.studentId, comment: r.comment || '' })),
    };
  };
  context.routes.register({ method: 'GET', path: 'transcripts/university/results', permission: VIEW, handler: universityResults });
  context.routes.register({ method: 'GET', path: 'transcripts/entry/university/results', permission: EDIT, handler: universityResults });

  context.routes.register({
    method: 'POST', path: 'transcripts/tabs/:id/scores', permission: EDIT,
    handler: async (request) => {
      const tab = await tabOf(id(request?.params?.id, 'month id'));
      const body = request?.body || {};
      const classId = id(body.classId, 'classId');
      await requireSheetClass(request, tab.sheetId, classId);
      const entries = Array.isArray(body.entries) ? body.entries : [];
      if (!entries.length || entries.length > 2000) throw new Error('entries must contain 1-2000 scores');
      const sheetSubjects = await db.query(`SELECT "id", "maxScore", "name", "parentId", "tabId" FROM ${T.subject} WHERE "sheetId" = $1`, [tab.sheetId]);
      const subjects = new Map(sheetSubjects.map((row) => [row.id, row]));
      const computed = new Set(sheetSubjects.filter((row) => row.parentId && subjects.has(row.parentId)).map((row) => row.parentId));
      const enrolled = new Set((await db.query(`SELECT "studentId" FROM ${T.enrollment} WHERE "classId" = $1 AND "validTo" IS NULL`, [classId])).map((row) => row.studentId));
      const clean = entries.map((entry) => {
        const subject = subjects.get(String(entry?.subjectId || ''));
        if (!subject) throw new Error('A score belongs to a subject outside this score sheet');
        if (computed.has(subject.id)) throw new Error(`${subject.name} is the sum of its parts; enter the parts instead`);
        if (subject.tabId && subject.tabId !== tab.id) throw new Error(`${subject.name} belongs to another semester`);
        const studentId = String(entry?.studentId || '');
        if (!enrolled.has(studentId)) throw new Error('A score belongs to a student who is not in this class');
        const score = entry.score === null || entry.score === undefined || entry.score === '' ? null : Number(entry.score);
        if (score !== null && (!Number.isFinite(score) || score < 0 || score > Number(subject.maxScore))) throw new Error(`${subject.name}: the score must be between 0 and ${subject.maxScore}`);
        return { subjectId: subject.id, studentId, score };
      });
      const actor = request?.principal?.userId || null;
      await db.transaction(async (tx) => {
        for (const entry of clean) {
          await tx.execute(
            `INSERT INTO ${T.score} ("id", "tabId", "subjectId", "studentId", "score", "updatedById") VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT ("tabId", "subjectId", "studentId") DO UPDATE SET "score" = EXCLUDED."score", "updatedById" = EXCLUDED."updatedById", "updatedAt" = CURRENT_TIMESTAMP`,
            [crypto.randomUUID(), tab.id, entry.subjectId, entry.studentId, entry.score, actor]);
        }
      });
      return { saved: clean.length };
    },
  });
  context.routes.register({
    method: 'PUT', path: 'transcripts/tabs/:id/remarks', permission: EDIT,
    handler: async (request) => {
      const tab = await tabOf(id(request?.params?.id, 'month id'));
      const body = request?.body || {};
      const classId = id(body.classId, 'classId');
      await requireSheetClass(request, tab.sheetId, classId);
      const studentId = id(body.studentId, 'studentId');
      const enrolled = await db.query(`SELECT 1 FROM ${T.enrollment} WHERE "classId" = $1 AND "studentId" = $2 AND "validTo" IS NULL LIMIT 1`, [classId, studentId]);
      if (!enrolled.length) throw new Error('This student is not in this class');
      const conduct = text(body.conduct, 'conduct', 120, false) || null;
      const comment = text(body.comment, 'comment', 1000, false) || null;
      await db.execute(
        `INSERT INTO ${T.remark} ("id", "tabId", "studentId", "conduct", "comment", "updatedById") VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("tabId", "studentId") DO UPDATE SET "conduct" = EXCLUDED."conduct", "comment" = EXCLUDED."comment", "updatedById" = EXCLUDED."updatedById", "updatedAt" = CURRENT_TIMESTAMP`,
        [crypto.randomUUID(), tab.id, studentId, conduct, comment, request?.principal?.userId || null]);
      return { studentId, conduct, comment };
    },
  });
}

module.exports = { registerTranscripts, TRANSCRIPT_EDIT_PERMISSION: EDIT, UNIVERSITY_SCALE };
