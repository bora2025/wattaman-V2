'use strict';

const crypto = require('crypto');

const DEPARTMENT = 'plugin_wattanam_academic_management_department';
const STUDY_YEAR = 'plugin_wattanam_academic_management_study_year';
const CLASS = 'plugin_wattanam_academic_management_class';
const REGISTRATION = 'plugin_wattanam_academic_management_class_registration';
const SETTINGS = 'plugin_wattanam_academic_management_class_registration_settings';
const FIELD = 'plugin_wattanam_academic_management_class_registration_field';

const MIN_PASSWORD_LENGTH = 6;
const FIELD_MODES = ['REQUIRED', 'OPTIONAL', 'HIDDEN'];
const CUSTOM_FIELD_TYPES = ['TEXT', 'SELECT', 'MULTI_SELECT'];
const CUSTOM_FIELD_TYPES_WITH_OPTIONS = ['SELECT', 'MULTI_SELECT'];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('855') && digits.length >= 9) return `+${digits}`;
  if (digits.startsWith('0')) return `+855${digits.slice(1)}`;
  return `+${digits}`;
}

function generatePassword(length = 8) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[crypto.randomInt(chars.length)];
  }
  return out;
}

function slugify(label) {
  return (label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field');
}

function assertMode(value, key) {
  if (!FIELD_MODES.includes(value)) {
    throw new Error(`${key} must be one of ${FIELD_MODES.join(', ')}`);
  }
}

function sanitizeFieldTypeAndOptions(fieldType, options) {
  const type = String(fieldType || 'TEXT').toUpperCase();
  if (!CUSTOM_FIELD_TYPES.includes(type)) {
    throw new Error(`fieldType must be one of ${CUSTOM_FIELD_TYPES.join(', ')}`);
  }
  if (!CUSTOM_FIELD_TYPES_WITH_OPTIONS.includes(type)) return { fieldType: type, options: null };
  const cleaned = Array.from(new Set((Array.isArray(options) ? options : []).map((o) => String(o).trim()).filter(Boolean)));
  if (cleaned.length < 2) throw new Error('This field needs at least 2 options');
  return { fieldType: type, options: cleaned };
}

module.exports = {
  id: 'wattanam.academic-management',
  async activate(context) {
    context.logger.log('Wattanam Academic Management activated');
    context.permissions.register([
      { id: 'wattanam.academic-management.view', label: 'View academic structures and rosters' },
      { id: 'wattanam.academic-management.manage', label: 'Manage academic structures and enrollment' },
    ]);
    context.navigation.register([
      { id: 'departments', label: 'Academic Management', href: '/plugins/wattanam.academic-management/departments', permission: 'wattanam.academic-management.view' },
      { id: 'study-years', label: 'Study Years', href: '/plugins/wattanam.academic-management/study-years', permission: 'wattanam.academic-management.view' },
      { id: 'classes', label: 'Classes', href: '/plugins/wattanam.academic-management/classes', permission: 'wattanam.academic-management.view' },
    ]);
    context.routes.register({
      method: 'GET', path: 'departments', permission: 'wattanam.academic-management.view',
      handler: () => context.database.query(`SELECT "id", "name", "nameKh", "description", "createdAt", "updatedAt" FROM ${DEPARTMENT} ORDER BY "name" ASC`),
    });
    context.routes.register({
      method: 'GET', path: 'study-years', permission: 'wattanam.academic-management.view',
      handler: () => context.database.query(`SELECT "id", "year", "label", "startDate", "endDate", "isCurrent", "schoolName", "logoUrl", "createdAt", "updatedAt" FROM ${STUDY_YEAR} ORDER BY "year" DESC`),
    });
    context.routes.register({
      method: 'GET', path: 'study-years/current', permission: 'wattanam.academic-management.view',
      handler: async () => {
        const rows = await context.database.query(`SELECT "id", "year", "label", "startDate", "endDate", "isCurrent", "schoolName", "logoUrl", "createdAt", "updatedAt" FROM ${STUDY_YEAR} WHERE "isCurrent" = TRUE ORDER BY "year" DESC LIMIT 1`);
        return rows[0] ?? null;
      },
    });
    context.routes.register({
      method: 'POST', path: 'study-years', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const body = request?.body || {};
        if (!body.year || typeof body.year !== 'number') throw new Error('year is required');
        const existing = await context.database.query(`SELECT "id" FROM ${STUDY_YEAR} WHERE "year" = $1 LIMIT 1`, [body.year]);
        if (existing.length) throw new Error(`Study year ${body.year} already exists`);
        const id = crypto.randomUUID();
        const label = body.label || `${body.year}-${body.year + 1}`;
        const startDate = body.startDate || null;
        const endDate = body.endDate || null;
        const schoolName = body.schoolName || null;
        const logoUrl = body.logoUrl || null;
        await context.database.execute(
          `INSERT INTO ${STUDY_YEAR} ("id", "year", "label", "startDate", "endDate", "isCurrent", "schoolName", "logoUrl", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [id, body.year, label, startDate, endDate, schoolName, logoUrl],
        );
        return context.database.query(`SELECT "id", "year", "label", "startDate", "endDate", "isCurrent", "schoolName", "logoUrl", "createdAt", "updatedAt" FROM ${STUDY_YEAR} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'PUT', path: 'study-years/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const id = request?.params?.id;
        const body = request?.body || {};
        const sets = [];
        const params = [];
        if (body.year !== undefined) {
          const yearConflict = await context.database.query(`SELECT "id" FROM ${STUDY_YEAR} WHERE "year" = $1 AND "id" <> $2 LIMIT 1`, [body.year, id]);
          if (yearConflict.length) throw new Error(`Study year ${body.year} already exists`);
          sets.push(`"year" = $${params.length + 1}`);
          params.push(body.year);
        }
        if (body.label !== undefined) { sets.push(`"label" = $${params.length + 1}`); params.push(body.label); }
        if (body.startDate !== undefined) { sets.push(`"startDate" = $${params.length + 1}`); params.push(body.startDate || null); }
        if (body.endDate !== undefined) { sets.push(`"endDate" = $${params.length + 1}`); params.push(body.endDate || null); }
        if (body.schoolName !== undefined) { sets.push(`"schoolName" = $${params.length + 1}`); params.push(body.schoolName || null); }
        if (body.logoUrl !== undefined) { sets.push(`"logoUrl" = $${params.length + 1}`); params.push(body.logoUrl || null); }
        if (sets.length === 0) throw new Error('No valid study year updates provided');
        sets.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        params.push(id);
        await context.database.execute(
          `UPDATE ${STUDY_YEAR} SET ${sets.join(', ')} WHERE "id" = $${params.length}`,
          params,
        );
        return context.database.query(`SELECT "id", "year", "label", "startDate", "endDate", "isCurrent", "schoolName", "logoUrl", "createdAt", "updatedAt" FROM ${STUDY_YEAR} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'POST', path: 'study-years/:id/set-current', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const id = request?.params?.id;
        await context.database.transaction(async (tx) => {
          const target = await tx.query(`SELECT "id" FROM ${STUDY_YEAR} WHERE "id" = $1 LIMIT 1`, [id]);
          if (!target.length) throw new Error('Study year not found');
          await tx.execute(`UPDATE ${STUDY_YEAR} SET "isCurrent" = FALSE, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" <> $1`, [id]);
          await tx.execute(`UPDATE ${STUDY_YEAR} SET "isCurrent" = TRUE, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [id]);
        });
        return context.database.query(`SELECT "id", "year", "label", "startDate", "endDate", "isCurrent", "schoolName", "logoUrl", "createdAt", "updatedAt" FROM ${STUDY_YEAR} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'study-years/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const id = request?.params?.id;
        const classCount = await context.database.query(`SELECT COUNT(*)::int AS "count" FROM ${CLASS} WHERE "studyYearId" = $1`, [id]);
        if (classCount[0]?.count > 0) throw new Error('Cannot delete study year that has classes. Remove or reassign classes first.');
        await context.database.execute(`DELETE FROM ${STUDY_YEAR} WHERE "id" = $1`, [id]);
        return { success: true };
      },
    });
    context.routes.register({
      method: 'POST', path: 'classes', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const body = request?.body || {};
        if (!body.name || typeof body.name !== 'string') throw new Error('name is required');
        if (!body.teacherId) throw new Error('teacherId is required');
        if (!['AVAILABLE', 'UNAVAILABLE', 'HIDDEN'].includes(body.registrationStatus)) throw new Error('registrationStatus must be one of AVAILABLE, UNAVAILABLE, HIDDEN');
        if (body.price !== undefined && body.price !== null && (typeof body.price !== 'number' || body.price < 0)) throw new Error('price must be a non-negative number');
        const teacherRows = await context.database.query(`SELECT "id", "role" FROM "User" WHERE "id" = $1 LIMIT 1`, [body.teacherId]);
        if (!teacherRows.length || teacherRows[0].role !== 'TEACHER') throw new Error('Only users with TEACHER role can be assigned as teacher');
        if (body.classAdminId) {
          const caRows = await context.database.query(`SELECT "id", "role" FROM "User" WHERE "id" = $1 LIMIT 1`, [body.classAdminId]);
          if (!caRows.length || caRows[0].role !== 'CLASS_ADMIN') throw new Error('Only users with CLASS_ADMIN role can be assigned as class admin');
        }
        const id = crypto.randomUUID();
        await context.database.execute(
          `INSERT INTO ${CLASS} ("id", "name", "subject", "teacherId", "classAdminId", "studyYearId", "schedule", "registrationStatus", "thumbnail", "description", "price", "showPrice", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            id,
            body.name,
            body.subject || null,
            body.teacherId,
            body.classAdminId || null,
            body.studyYearId || null,
            body.schedule || null,
            body.registrationStatus || 'HIDDEN',
            body.thumbnail || null,
            body.description || null,
            body.price ?? null,
            body.showPrice === true,
          ],
        );
        return context.database.query(
          `SELECT c."id", c."name", c."subject", c."teacherId", c."classAdminId", c."studyYearId", c."schedule", c."registrationStatus", c."thumbnail", c."description", c."price", c."showPrice", c."createdAt", c."updatedAt", jsonb_build_object('name', t."name") AS teacher, jsonb_build_object('name', ca."name") AS "classAdmin", CASE WHEN sy."id" IS NULL THEN NULL ELSE jsonb_build_object('id', sy."id", 'year', sy."year", 'label', sy."label", 'isCurrent', sy."isCurrent") END AS "studyYear" FROM ${CLASS} c LEFT JOIN "User" t ON t."id" = c."teacherId" LEFT JOIN "User" ca ON ca."id" = c."classAdminId" LEFT JOIN ${STUDY_YEAR} sy ON sy."id" = c."studyYearId" WHERE c."id" = $1`,
          [id],
        ).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'PUT', path: 'classes/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const id = request?.params?.id;
        const body = request?.body || {};
        if (body.registrationStatus !== undefined && !['AVAILABLE', 'UNAVAILABLE', 'HIDDEN'].includes(body.registrationStatus)) {
          throw new Error('registrationStatus must be one of AVAILABLE, UNAVAILABLE, HIDDEN');
        }
        if (body.price !== undefined && body.price !== null && (typeof body.price !== 'number' || body.price < 0)) throw new Error('price must be a non-negative number');
        if (body.teacherId) {
          const teacherRows = await context.database.query(`SELECT "id", "role" FROM "User" WHERE "id" = $1 LIMIT 1`, [body.teacherId]);
          if (!teacherRows.length || teacherRows[0].role !== 'TEACHER') throw new Error('Only users with TEACHER role can be assigned as teacher');
        }
        if (body.classAdminId) {
          const caRows = await context.database.query(`SELECT "id", "role" FROM "User" WHERE "id" = $1 LIMIT 1`, [body.classAdminId]);
          if (!caRows.length || caRows[0].role !== 'CLASS_ADMIN') throw new Error('Only users with CLASS_ADMIN role can be assigned as class admin');
        }
        const sets = [];
        const params = [];
        const add = (col, val) => { if (val !== undefined) { sets.push(`"${col}" = $${params.length + 1}`); params.push(val); } };
        add('name', body.name);
        add('subject', body.subject);
        add('teacherId', body.teacherId);
        add('classAdminId', body.classAdminId === '' ? null : body.classAdminId);
        add('studyYearId', body.studyYearId === '' ? null : body.studyYearId);
        add('schedule', body.schedule);
        add('registrationStatus', body.registrationStatus);
        add('thumbnail', body.thumbnail);
        add('description', body.description);
        add('price', body.price ?? null);
        add('showPrice', body.showPrice === undefined ? undefined : body.showPrice === true);
        if (sets.length === 0) throw new Error('No valid class updates provided');
        sets.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        params.push(id);
        await context.database.execute(
          `UPDATE ${CLASS} SET ${sets.join(', ')} WHERE "id" = $${params.length}`,
          params,
        );
        return context.database.query(
          `SELECT c."id", c."name", c."subject", c."teacherId", c."classAdminId", c."studyYearId", c."schedule", c."registrationStatus", c."thumbnail", c."description", c."price", c."showPrice", c."createdAt", c."updatedAt", jsonb_build_object('name', t."name") AS teacher, jsonb_build_object('name', ca."name") AS "classAdmin", CASE WHEN sy."id" IS NULL THEN NULL ELSE jsonb_build_object('id', sy."id", 'year', sy."year", 'label', sy."label", 'isCurrent', sy."isCurrent") END AS "studyYear" FROM ${CLASS} c LEFT JOIN "User" t ON t."id" = c."teacherId" LEFT JOIN "User" ca ON ca."id" = c."classAdminId" LEFT JOIN ${STUDY_YEAR} sy ON sy."id" = c."studyYearId" WHERE c."id" = $1`,
          [id],
        ).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'classes/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const id = request?.params?.id;
        await context.database.transaction(async (tx) => {
          await tx.execute(`DELETE FROM ${REGISTRATION} WHERE "classId" = $1`, [id]);
          await tx.execute(`DELETE FROM ${CLASS} WHERE "id" = $1`, [id]);
        });
        return { success: true };
      },
    });
    context.routes.register({
      method: 'GET', path: 'classes', permission: 'wattanam.academic-management.view',
      handler: async (request) => {
        const query = request?.query || {};
        const teacherId = Array.isArray(query.teacherId) ? query.teacherId[0] : query.teacherId;
        const classAdminId = Array.isArray(query.classAdminId) ? query.classAdminId[0] : query.classAdminId;
        const studyYearId = Array.isArray(query.studyYearId) ? query.studyYearId[0] : query.studyYearId;
        const params = [];
        const conditions = [];
        if (typeof teacherId === 'string' && teacherId) {
          params.push(teacherId);
          conditions.push(`c."teacherId" = $${params.length}`);
        }
        if (typeof classAdminId === 'string' && classAdminId) {
          params.push(classAdminId);
          conditions.push(`c."classAdminId" = $${params.length}`);
        }
        if (typeof studyYearId === 'string' && studyYearId) {
          params.push(studyYearId);
          conditions.push(`c."studyYearId" = $${params.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        return context.database.query(
          `SELECT c."id", c."name", c."subject", c."teacherId", c."classAdminId", c."studyYearId", c."schedule", c."registrationStatus", c."thumbnail", c."description", c."price", c."showPrice", c."createdAt", c."updatedAt", jsonb_build_object('name', t."name") AS teacher, jsonb_build_object('name', ca."name") AS "classAdmin", CASE WHEN sy."id" IS NULL THEN NULL ELSE jsonb_build_object('id', sy."id", 'year', sy."year", 'label', sy."label", 'isCurrent', sy."isCurrent") END AS "studyYear" FROM ${CLASS} c LEFT JOIN "User" t ON t."id" = c."teacherId" LEFT JOIN "User" ca ON ca."id" = c."classAdminId" LEFT JOIN ${STUDY_YEAR} sy ON sy."id" = c."studyYearId" ${where} ORDER BY c."name" ASC`,
          params,
        );
      },
    });
    async function tableExists(tableName) {
      const rows = await context.database.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = CURRENT_SCHEMA() AND table_name = $1 LIMIT 1`,
        [tableName],
      );
      return rows.length > 0;
    }
    function convertGoogleDriveUrl(url) {
      if (!url) return url;
      const match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
      return url;
    }
    context.routes.register({
      method: 'POST', path: 'classes/:id/students', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const classId = request?.params?.id;
        const body = request?.body || {};
        const studentId = body.studentId;
        if (!studentId) throw new Error('studentId is required');
        if (!classId) throw new Error('classId is required');
        const classRows = await context.database.query(`SELECT "id" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`, [classId]);
        if (!classRows.length) throw new Error('Class not found');
        let student = await context.database.query(`SELECT "id", "userId", "studentNumber", "classId" FROM "Student" WHERE "id" = $1 LIMIT 1`, [studentId]);
        if (!student.length) {
          student = await context.database.query(`SELECT "id", "userId", "studentNumber", "classId" FROM "Student" WHERE "userId" = $1 LIMIT 1`, [studentId]);
        }
        if (student.length) {
          const existing = student[0];
          if (existing.classId === classId) {
            const userRows = await context.database.query(`SELECT "id", "name", "email", "phone" FROM "User" WHERE "id" = $1 LIMIT 1`, [existing.userId]);
            return { ...existing, user: userRows[0] || null };
          }
          let studentNumber = existing.studentNumber;
          if (!studentNumber) {
            const countRows = await context.database.query(`SELECT COUNT(*)::int AS "count" FROM "Student" WHERE "classId" = $1`, [classId]);
            studentNumber = String(countRows[0].count + 1).padStart(4, '0');
          }
          await context.database.execute(
            `UPDATE "Student" SET "classId" = $1, "studentNumber" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $3`,
            [classId, studentNumber, existing.id],
          );
          const updated = await context.database.query(
            `SELECT s."id", s."userId", s."studentNumber", s."classId", jsonb_build_object('id', u."id", 'name', u."name", 'email', u."email", 'phone', u."phone") AS user, jsonb_build_object('id', c."id", 'name', c."name") AS class FROM "Student" s LEFT JOIN "User" u ON u."id" = s."userId" LEFT JOIN ${CLASS} c ON c."id" = s."classId" WHERE s."id" = $1 LIMIT 1`,
            [existing.id],
          );
          return updated[0];
        }
        const countRows = await context.database.query(`SELECT COUNT(*)::int AS "count" FROM "Student" WHERE "classId" = $1`, [classId]);
        const studentNumber = String(countRows[0].count + 1).padStart(4, '0');
        const id = crypto.randomUUID();
        await context.database.execute(
          `INSERT INTO "Student" ("id", "userId", "classId", "studentNumber", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [id, studentId, classId, studentNumber],
        );
        const created = await context.database.query(
          `SELECT s."id", s."userId", s."studentNumber", s."classId", jsonb_build_object('id', u."id", 'name', u."name", 'email', u."email", 'phone', u."phone") AS user, jsonb_build_object('id', c."id", 'name', c."name") AS class FROM "Student" s LEFT JOIN "User" u ON u."id" = s."userId" LEFT JOIN ${CLASS} c ON c."id" = s."classId" WHERE s."id" = $1 LIMIT 1`,
          [id],
        );
        return created[0];
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'classes/:classId/students/:studentId', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const studentId = request?.params?.studentId;
        const body = request?.body || {};
        const studentRows = await context.database.query(`SELECT "id", "userId" FROM "Student" WHERE "id" = $1 LIMIT 1`, [studentId]);
        if (!studentRows.length) throw new Error('Student not found');
        const student = studentRows[0];
        const studentSets = [];
        const studentParams = [];
        if (body.nameKh !== undefined) { studentSets.push(`"nameKh" = $${studentParams.length + 1}`); studentParams.push(body.nameKh); }
        if (body.sex !== undefined) { studentSets.push(`"sex" = $${studentParams.length + 1}`); studentParams.push(body.sex); }
        if (body.photo !== undefined) { studentSets.push(`"photo" = $${studentParams.length + 1}`); studentParams.push(convertGoogleDriveUrl(body.photo || '')); }
        if (body.dateOfBirth !== undefined) { studentSets.push(`"dateOfBirth" = $${studentParams.length + 1}`); studentParams.push(body.dateOfBirth ? new Date(body.dateOfBirth) : null); }
        if (body.address !== undefined) { studentSets.push(`"address" = $${studentParams.length + 1}`); studentParams.push(body.address); }
        if (body.generation !== undefined) { studentSets.push(`"generation" = $${studentParams.length + 1}`); studentParams.push(body.generation); }
        if (body.studentNumber !== undefined) { studentSets.push(`"studentNumber" = $${studentParams.length + 1}`); studentParams.push(body.studentNumber.trim() || null); }
        if (body.customFieldValues !== undefined) { studentSets.push(`"customFieldValues" = $${studentParams.length + 1}`); studentParams.push(JSON.stringify(body.customFieldValues)); }
        if (body.parentId !== undefined) {
          if (body.parentId) {
            const parentRows = await context.database.query(`SELECT "id", "role" FROM "User" WHERE "id" = $1 LIMIT 1`, [body.parentId]);
            if (!parentRows.length || parentRows[0].role !== 'PARENT') throw new Error('parentId must reference a user with role PARENT');
          }
          studentSets.push(`"parentId" = $${studentParams.length + 1}`);
          studentParams.push(body.parentId || null);
        }
        const userSets = [];
        const userParams = [];
        if (body.name !== undefined) { userSets.push(`"name" = $${userParams.length + 1}`); userParams.push(body.name); }
        if (body.phone !== undefined) { userSets.push(`"phone" = $${userParams.length + 1}`); userParams.push(body.phone); }
        await context.database.transaction(async (tx) => {
          if (studentSets.length) {
            studentSets.push(`"updatedAt" = CURRENT_TIMESTAMP`);
            studentParams.push(student.id);
            await tx.execute(`UPDATE "Student" SET ${studentSets.join(', ')} WHERE "id" = $${studentParams.length}`, studentParams);
          }
          if (userSets.length) {
            userParams.push(student.userId);
            await tx.execute(`UPDATE "User" SET ${userSets.join(', ')} WHERE "id" = $${userParams.length}`, userParams);
          }
        });
        const updated = await context.database.query(
          `SELECT s."id", s."userId", s."studentNumber", s."nameKh", s."qrCode", s."photo", s."sex", s."dateOfBirth", s."address", s."generation", s."customFieldValues", s."parentId", u."name", u."email", u."phone", c."name" AS "className" FROM "Student" s LEFT JOIN "User" u ON u."id" = s."userId" LEFT JOIN ${CLASS} c ON c."id" = s."classId" WHERE s."id" = $1 LIMIT 1`,
          [studentId],
        );
        const row = updated[0];
        return {
          id: row.id,
          studentNumber: row.studentNumber || '',
          userId: row.userId,
          name: row.name,
          nameKh: row.nameKh || '',
          email: row.email,
          phone: row.phone || '',
          qrCode: row.qrCode,
          photo: row.photo,
          sex: row.sex,
          dateOfBirth: row.dateOfBirth,
          address: row.address || '',
          generation: row.generation || '',
          customFieldValues: row.customFieldValues || {},
          parentId: row.parentId,
          className: row.className || null,
        };
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'classes/:id/students/:studentId', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const studentId = request?.params?.studentId;
        const studentRows = await context.database.query(`SELECT "id", "userId" FROM "Student" WHERE "id" = $1 LIMIT 1`, [studentId]);
        if (!studentRows.length) return { success: false, message: 'Student not found' };
        const { userId } = studentRows[0];
        const [hasExamAttempt, hasAssignmentSubmission, hasCourseEnrollment, hasCourseAttendance, hasLessonView] = await Promise.all([
          tableExists('ExamAttempt'),
          tableExists('AssignmentSubmission'),
          tableExists('CourseEnrollment'),
          tableExists('CourseAttendance'),
          tableExists('LessonView'),
        ]);
        await context.database.transaction(async (tx) => {
          await tx.execute(`DELETE FROM "Attendance" WHERE "studentId" = $1`, [studentId]);
          await tx.execute(`DELETE FROM "FeeRecord" WHERE "studentId" = $1`, [studentId]);
          await tx.execute(`DELETE FROM "ParentLinkRequest" WHERE "studentId" = $1`, [studentId]);
          if (hasExamAttempt) await tx.execute(`DELETE FROM "ExamAttempt" WHERE "studentId" = $1`, [studentId]);
          if (hasAssignmentSubmission) await tx.execute(`DELETE FROM "AssignmentSubmission" WHERE "studentId" = $1`, [studentId]);
          if (hasCourseEnrollment) await tx.execute(`DELETE FROM "CourseEnrollment" WHERE "studentId" = $1`, [studentId]);
          if (hasCourseAttendance) await tx.execute(`DELETE FROM "CourseAttendance" WHERE "studentId" = $1`, [studentId]);
          if (hasLessonView) await tx.execute(`DELETE FROM "LessonView" WHERE "studentId" = $1`, [studentId]);
          await tx.execute(`DELETE FROM "Student" WHERE "id" = $1`, [studentId]);
          await tx.execute(`DELETE FROM "RefreshToken" WHERE "userId" = $1`, [userId]);
          await tx.execute(`DELETE FROM "Notification" WHERE "userId" = $1`, [userId]);
          await tx.execute(`DELETE FROM "User" WHERE "id" = $1 AND "role" = 'STUDENT'`, [userId]);
        });
        return { success: true };
      },
    });
    context.routes.register({
      method: 'POST', path: 'classes/cleanup-orphaned-students', permission: 'wattanam.academic-management.manage',
      handler: async () => {
        const orphaned = await context.database.query(`SELECT "id", "userId" FROM "Student" WHERE "classId" IS NULL`);
        if (!orphaned.length) return { deleted: 0 };
        const studentIds = orphaned.map((s) => s.id);
        const userIds = orphaned.map((s) => s.userId);
        const idList = studentIds.map((_, i) => `$${i + 1}`).join(', ');
        await context.database.transaction(async (tx) => {
          await tx.execute(`DELETE FROM "Attendance" WHERE "studentId" IN (${idList})`, studentIds);
          await tx.execute(`DELETE FROM "Student" WHERE "id" IN (${idList})`, studentIds);
          if (userIds.length) {
            const userIdList = userIds.map((_, i) => `$${i + 1}`).join(', ');
            await tx.execute(`DELETE FROM "RefreshToken" WHERE "userId" IN (${userIdList})`, userIds);
            await tx.execute(`DELETE FROM "Notification" WHERE "userId" IN (${userIdList})`, userIds);
            await tx.execute(`DELETE FROM "User" WHERE "id" IN (${userIdList}) AND "role" = 'STUDENT'`, userIds);
          }
        });
        return { deleted: orphaned.length };
      },
    });
    context.routes.register({
      method: 'GET', path: 'admissions/public/classes', permission: 'wattanam.academic-management.view',
      handler: () => context.database.query(
        `SELECT c."id", c."name", c."subject", c."registrationStatus", c."thumbnail", c."description", CASE WHEN c."showPrice" THEN c."price" ELSE NULL END AS "price", c."showPrice", CASE WHEN sy."id" IS NULL THEN NULL ELSE jsonb_build_object('label', sy."label", 'year', sy."year") END AS "studyYear" FROM ${CLASS} c LEFT JOIN ${STUDY_YEAR} sy ON sy."id" = c."studyYearId" WHERE c."registrationStatus" <> 'HIDDEN' ORDER BY c."name" ASC`,
        [],
      ),
    });
    const defaultSettings = {
      id: 'singleton',
      khmerNameMode: 'REQUIRED',
      phoneMode: 'REQUIRED',
      emailMode: 'REQUIRED',
      photoMode: 'OPTIONAL',
      passwordMode: 'REQUIRED',
      sexMode: 'HIDDEN',
      dateOfBirthMode: 'HIDDEN',
      addressMode: 'HIDDEN',
      generationMode: 'HIDDEN',
      updatedAt: null,
    };

    async function getSettings() {
      const rows = await context.database.query(
        `SELECT "id", "khmerNameMode", "phoneMode", "emailMode", "photoMode", "passwordMode", "sexMode", "dateOfBirthMode", "addressMode", "generationMode", "updatedAt" FROM ${SETTINGS} WHERE "id" = 'singleton' LIMIT 1`,
        [],
      );
      return rows[0] ?? defaultSettings;
    }

    async function getEnabledFields() {
      return context.database.query(
        `SELECT "id", "key", "label", "fieldType", "options", "required", "order", "enabled", "createdAt", "updatedAt" FROM ${FIELD} WHERE "enabled" = TRUE ORDER BY "order" ASC`,
        [],
      );
    }

    context.routes.register({
      method: 'GET', path: 'admissions/public/form-config', permission: 'wattanam.academic-management.view',
      handler: async () => ({ settings: await getSettings(), fields: await getEnabledFields() }),
    });
    context.routes.register({
      method: 'GET', path: 'admissions/settings', permission: 'wattanam.academic-management.view',
      handler: () => getSettings(),
    });
    context.routes.register({
      method: 'GET', path: 'admissions/fields', permission: 'wattanam.academic-management.view',
      handler: () => context.database.query(
        `SELECT "id", "key", "label", "fieldType", "options", "required", "order", "enabled", "createdAt", "updatedAt" FROM ${FIELD} ORDER BY "order" ASC`,
        [],
      ),
    });
    context.routes.register({
      method: 'PATCH', path: 'admissions/settings', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const body = request?.body || {};
        const columns = [];
        const values = [];
        const params = [];
        for (const key of ['khmerNameMode', 'phoneMode', 'emailMode', 'photoMode', 'passwordMode', 'sexMode', 'dateOfBirthMode', 'addressMode', 'generationMode']) {
          const v = body[key];
          if (v === undefined) continue;
          assertMode(v, key);
          columns.push(`"${key}"`);
          values.push(`$${params.length + 1}`);
          params.push(v);
        }
        if (columns.length === 0) throw new Error('No valid settings provided');
        const current = await getSettings();
        const nextEmailMode = body.emailMode ?? current.emailMode;
        const nextPhoneMode = body.phoneMode ?? current.phoneMode;
        if (nextEmailMode === 'HIDDEN' && nextPhoneMode === 'HIDDEN') {
          throw new Error('Email and Phone cannot both be hidden — a student needs at least one to create a login');
        }
        await context.database.execute(
          `INSERT INTO ${SETTINGS} ("id", ${columns.join(', ')}, "updatedAt") VALUES ('singleton', ${values.join(', ')}, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO UPDATE SET ${columns.map((c, i) => `${c} = $${i + 1}`).join(', ')}, "updatedAt" = CURRENT_TIMESTAMP`,
          params,
        );
        return getSettings();
      },
    });
    context.routes.register({
      method: 'POST', path: 'admissions/fields', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const body = request?.body || {};
        const label = String(body.label || '').trim();
        if (!label) throw new Error('label is required');
        const { fieldType, options } = sanitizeFieldTypeAndOptions(body.fieldType, body.options);
        const base = slugify(label);
        let key = base;
        let n = 1;
        let existing = await context.database.query(`SELECT "id" FROM ${FIELD} WHERE "key" = $1 LIMIT 1`, [key]);
        while (existing.length) {
          key = `${base}_${++n}`;
          existing = await context.database.query(`SELECT "id" FROM ${FIELD} WHERE "key" = $1 LIMIT 1`, [key]);
        }
        const maxRows = await context.database.query(`SELECT MAX("order") AS "maxOrder" FROM ${FIELD}`);
        const order = (maxRows[0]?.maxOrder ?? -1) + 1;
        const id = crypto.randomUUID();
        await context.database.execute(
          `INSERT INTO ${FIELD} ("id", "key", "label", "fieldType", "options", "required", "order", "enabled", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [id, key, label, fieldType, options ? JSON.stringify(options) : null, !!body.required, order],
        );
        return { id, key, label, fieldType, options, required: !!body.required, order, enabled: true };
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'admissions/fields/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const id = request?.params?.id;
        const body = request?.body || {};
        const existingRows = await context.database.query(`SELECT "id", "fieldType", "options" FROM ${FIELD} WHERE "id" = $1 LIMIT 1`, [id]);
        const field = existingRows[0];
        if (!field) throw new Error('Field not found');
        const sets = [];
        const params = [];
        if (body.label !== undefined) {
          const label = String(body.label).trim();
          if (!label) throw new Error('label cannot be empty');
          sets.push(`"label" = $${params.length + 1}`);
          params.push(label);
        }
        if (body.required !== undefined) {
          sets.push(`"required" = $${params.length + 1}`);
          params.push(!!body.required);
        }
        if (body.enabled !== undefined) {
          sets.push(`"enabled" = $${params.length + 1}`);
          params.push(!!body.enabled);
        }
        if (body.fieldType !== undefined) {
          const { fieldType, options } = sanitizeFieldTypeAndOptions(body.fieldType, body.options ?? field.options);
          sets.push(`"fieldType" = $${params.length + 1}`);
          params.push(fieldType);
          sets.push(`"options" = $${params.length + 1}`);
          params.push(options ? JSON.stringify(options) : null);
        } else if (body.options !== undefined && CUSTOM_FIELD_TYPES_WITH_OPTIONS.includes(field.fieldType)) {
          const { options } = sanitizeFieldTypeAndOptions(field.fieldType, body.options);
          sets.push(`"options" = $${params.length + 1}`);
          params.push(options ? JSON.stringify(options) : null);
        }
        if (sets.length === 0) throw new Error('No valid field updates provided');
        sets.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        params.push(id);
        await context.database.execute(
          `UPDATE ${FIELD} SET ${sets.join(', ')} WHERE "id" = $${params.length}`,
          params,
        );
        return context.database.query(`SELECT * FROM ${FIELD} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'POST', path: 'admissions/fields/reorder', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const ids = request?.body?.ids;
        if (!Array.isArray(ids) || ids.length === 0) throw new Error('ids is required');
        await context.database.transaction(async (tx) => {
          for (let i = 0; i < ids.length; i += 1) {
            await tx.execute(`UPDATE ${FIELD} SET "order" = $1 WHERE "id" = $2`, [i, ids[i]]);
          }
        });
        return context.database.query(`SELECT "id", "key", "label", "fieldType", "options", "required", "order", "enabled", "createdAt", "updatedAt" FROM ${FIELD} ORDER BY "order" ASC`, []);
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'admissions/fields/:id', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const id = request?.params?.id;
        const existingRows = await context.database.query(`SELECT "id" FROM ${FIELD} WHERE "id" = $1 LIMIT 1`, [id]);
        if (!existingRows.length) throw new Error('Field not found');
        await context.database.execute(`DELETE FROM ${FIELD} WHERE "id" = $1`, [id]);
        return { success: true };
      },
    });
    context.routes.register({
      method: 'POST', path: 'admissions/public/submit', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const body = request?.body || {};
        const email = String(body.email || '').trim().toLowerCase();
        const nameKh = String(body.nameKh || '').trim();
        const nameEn = String(body.nameEn || '').trim();
        const phone = String(body.phone || '').trim();
        const password = body.password || '';
        const sex = String(body.sex || '').trim();
        const dateOfBirth = String(body.dateOfBirth || '').trim();
        const address = String(body.address || '').trim();
        const generation = String(body.generation || '').trim();

        if (!body.classId) throw new Error('classId is required');
        if (!nameEn) throw new Error('English name is required');
        if (email && !isValidEmail(email)) throw new Error('Invalid email address');

        const settings = await getSettings();
        if (settings.passwordMode === 'REQUIRED' && password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        if (settings.passwordMode !== 'REQUIRED' && password && password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        if (settings.khmerNameMode === 'REQUIRED' && !nameKh) throw new Error('Khmer name is required');
        if (settings.emailMode === 'REQUIRED' && !email) throw new Error('Email is required');
        if (settings.phoneMode === 'REQUIRED' && !phone) throw new Error('Phone number is required');
        if (!email && !phone) throw new Error('Email or phone number is required');
        if (settings.photoMode === 'REQUIRED' && !body.photo) throw new Error('Photo is required');
        if (settings.sexMode === 'REQUIRED' && !sex) throw new Error('Sex is required');
        if (settings.dateOfBirthMode === 'REQUIRED' && !dateOfBirth) throw new Error('Date of birth is required');
        if (settings.addressMode === 'REQUIRED' && !address) throw new Error('Address is required');
        if (settings.generationMode === 'REQUIRED' && !generation) throw new Error('Generation is required');

        const enabledFields = await getEnabledFields();
        const customFieldValues = {};
        const submitted = body.customFieldValues || {};
        for (const f of enabledFields) {
          const options = Array.isArray(f.options) ? f.options : [];
          if (f.fieldType === 'MULTI_SELECT') {
            const raw = submitted[f.key];
            const arr = Array.from(new Set((Array.isArray(raw) ? raw : []).map((s) => String(s).trim()).filter(Boolean)));
            if (f.required && arr.length === 0) throw new Error(`${f.label} is required`);
            for (const v of arr) {
              if (!options.includes(v)) throw new Error(`${f.label} must be one of the listed options`);
            }
            if (arr.length) customFieldValues[f.key] = arr;
            continue;
          }
          const v = String(submitted[f.key] ?? '').trim();
          if (f.required && !v) throw new Error(`${f.label} is required`);
          if (v && f.fieldType === 'SELECT' && !options.includes(v)) {
            throw new Error(`${f.label} must be one of the listed options`);
          }
          if (v) customFieldValues[f.key] = v;
        }

        const classRows = await context.database.query(
          `SELECT "id", "name", "registrationStatus" FROM ${CLASS} WHERE "id" = $1 LIMIT 1`,
          [body.classId],
        );
        const cls = classRows[0];
        if (!cls) throw new Error('Class not found');
        if (cls.registrationStatus !== 'AVAILABLE') throw new Error('Registration is not currently open for this class');

        const conditions = ['"classId" = $1', '"status" = \'PENDING\''];
        const params = [body.classId];
        const orClauses = [];
        if (email) { params.push(email); orClauses.push(`"email" = $${params.length}`); }
        if (phone) { params.push(phone); orClauses.push(`"phone" = $${params.length}`); }
        if (orClauses.length) {
          const existingRows = await context.database.query(
            `SELECT * FROM ${REGISTRATION} WHERE ${conditions.join(' AND ')} AND (${orClauses.join(' OR ')}) LIMIT 1`,
            params,
          );
          if (existingRows.length) return existingRows[0];
        }

        const autoGenerated = !password ? generatePassword() : null;
        const finalPassword = password || autoGenerated;
        const passwordHash = await context.crypto.hashBcrypt(finalPassword, 12);
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await context.database.execute(
          `INSERT INTO ${REGISTRATION} ("id", "classId", "nameKh", "nameEn", "email", "phone", "passwordHash", "generatedPassword", "photo", "sex", "dateOfBirth", "address", "generation", "customFieldValues", "status", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'PENDING', $15)`,
          [
            id,
            body.classId,
            settings.khmerNameMode === 'HIDDEN' ? null : (nameKh || null),
            nameEn,
            settings.emailMode === 'HIDDEN' ? null : (email || null),
            settings.phoneMode === 'HIDDEN' ? null : (phone || null),
            passwordHash,
            autoGenerated || null,
            settings.photoMode === 'HIDDEN' ? null : (body.photo || null),
            settings.sexMode === 'HIDDEN' ? null : (sex || null),
            settings.dateOfBirthMode === 'HIDDEN' ? null : (dateOfBirth ? new Date(dateOfBirth).toISOString() : null),
            settings.addressMode === 'HIDDEN' ? null : (address || null),
            settings.generationMode === 'HIDDEN' ? null : (generation || null),
            Object.keys(customFieldValues).length ? JSON.stringify(customFieldValues) : null,
            now,
          ],
        );

        try {
          const admins = await context.directory.resolveAudience({ audience: 'ROLE', targetRole: 'ADMIN' });
          if (admins.length) {
            await Promise.all(admins.map((a) => context.notifications.notifyInApp(a.id, `${nameEn} requested to register for class ${cls.name}`, 'class_registration_request')));
          }
        } catch {}

        return context.database.query(`SELECT * FROM ${REGISTRATION} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'admissions/registrations/:id/resolve', permission: 'wattanam.academic-management.manage',
      handler: async (request) => {
        const id = request?.params?.id;
        const body = request?.body || {};
        const action = body.action;
        if (action !== 'APPROVE' && action !== 'REJECT') throw new Error('action must be APPROVE or REJECT');
        const regRows = await context.database.query(`SELECT * FROM ${REGISTRATION} WHERE "id" = $1 LIMIT 1`, [id]);
        const reg = regRows[0];
        if (!reg) throw new Error('Registration not found');
        if (reg.status !== 'PENDING') throw new Error('Registration already resolved');
        const resolvedAt = new Date().toISOString();
        const resolvedBy = request?.principal?.userId;
        if (action === 'REJECT') {
          await context.database.execute(
            `UPDATE ${REGISTRATION} SET "status" = 'REJECTED', "rejectReason" = $1, "resolvedAt" = $2, "resolvedBy" = $3 WHERE "id" = $4`,
            [body.rejectReason?.trim() || null, resolvedAt, resolvedBy, id],
          );
          if (reg.email) {
            try {
              await context.notifications.sendEmail(reg.email, 'Your class registration was not approved', `Hi ${reg.nameEn}, your registration was not approved${body.rejectReason ? `: ${body.rejectReason}` : '.'}`);
            } catch {}
          }
          return context.database.query(`SELECT * FROM ${REGISTRATION} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
        }
        await context.database.execute(
          `UPDATE ${REGISTRATION} SET "status" = 'APPROVED', "resolvedAt" = $1, "resolvedBy" = $2 WHERE "id" = $3`,
          [resolvedAt, resolvedBy, id],
        );
        context.events.publish('academic.registration.approved.v1', {
          registrationId: id,
          classId: reg.classId,
          nameEn: reg.nameEn,
          nameKh: reg.nameKh,
          email: reg.email,
          phone: reg.phone,
          passwordHash: reg.passwordHash,
          photo: reg.photo,
          sex: reg.sex,
          dateOfBirth: reg.dateOfBirth,
          address: reg.address,
          generation: reg.generation,
          customFieldValues: reg.customFieldValues,
          resolvedBy,
          resolvedAt,
        });
        return context.database.query(`SELECT * FROM ${REGISTRATION} WHERE "id" = $1 LIMIT 1`, [id]).then((rows) => rows[0]);
      },
    });
  },
};
