'use strict';

const { randomUUID } = require('crypto');
const ATTENDANCE = 'plugin_wattanam_timetable_teacher_attendance';
const TEACHER = 'plugin_wattanam_timetable_teacher';

function identifier(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error(`${label} is invalid`);
  return value;
}
function isoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${label} is invalid`);
  return value;
}
function period(value) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24) throw new Error('period must be between 1 and 24'); return parsed; }
function status(value = 'PRESENT') { const parsed = String(value).toUpperCase(); if (!['PRESENT', 'ABSENT', 'LATE'].includes(parsed)) throw new Error('status is invalid'); return parsed; }
function localClock(now, timeZone) {
  let parts;
  try { parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])); }
  catch { throw new Error('Configured timetable timezone is invalid'); }
  const weekdays = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { date: `${parts.year}-${parts.month}-${parts.day}`, day: weekdays[parts.weekday], minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
function parsePeriodTimes(value) { const parsed = value == null ? [] : typeof value === 'string' ? JSON.parse(value) : value; if (!Array.isArray(parsed) || parsed.some((time) => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error('Timetable periodTimes are invalid'); return parsed; }
function currentPeriod(times, minutes) { for (let index = 0; index < times.length; index++) { const [hour, minute] = times[index].split(':').map(Number); const start = hour * 60 + minute; const next = times[index + 1]?.split(':').map(Number); const end = next ? next[0] * 60 + next[1] : start + 60; if (minutes >= start && minutes < end) return index + 1; } return times.length ? (minutes < Number(times[0].slice(0, 2)) * 60 + Number(times[0].slice(3)) ? 1 : times.length) : 1; }

async function mark(db, body, checkIn = new Date().toISOString()) {
  const teacherId = identifier(body?.teacherId, 'teacherId'); const date = isoDate(body?.date, 'date'); const lessonPeriod = period(body?.period); const state = status(body?.status);
  return db.transaction(async (tx) => {
    const teachers = await tx.query(`SELECT "id" FROM ${TEACHER} WHERE "id"=$1 FOR SHARE`, [teacherId]);
    if (!teachers.length) throw new Error('Timetable teacher not found');
    const id = randomUUID();
    await tx.execute(`INSERT INTO ${ATTENDANCE} ("id","teacherId","date","period","status","checkIn") VALUES ($1,$2,$3::date,$4,$5,$6) ON CONFLICT ("teacherId","date","period") DO UPDATE SET "status"=EXCLUDED."status","checkIn"=EXCLUDED."checkIn","updatedAt"=CURRENT_TIMESTAMP`, [id, teacherId, date, lessonPeriod, state, checkIn]);
    const rows = await tx.query(`SELECT * FROM ${ATTENDANCE} WHERE "teacherId"=$1 AND "date"=$2::date AND "period"=$3`, [teacherId, date, lessonPeriod]);
    return rows[0];
  });
}

function registerTeacherAttendance(context) {
  const db = context.database; const view = 'wattanam.timetable.attendance.view'; const manage = 'wattanam.timetable.attendance.manage';
  context.routes.register({ method: 'POST', path: 'teacher-attendance/mark', permission: manage, handler: (request) => mark(db, request?.body) });
  context.routes.register({ method: 'POST', path: 'teacher-attendance/scan', permission: manage, handler: async (request) => {
    const qrCode = identifier(request?.body?.qrCode, 'qrCode'); const teachers = await db.query(`SELECT "id" FROM ${TEACHER} WHERE "qrCode"=$1`, [qrCode]);
    if (!teachers.length) throw new Error('Teacher QR code not found');
    const now = new Date(); return mark(db, { teacherId: teachers[0].id, date: now.toISOString().slice(0, 10), period: request?.body?.period, status: 'PRESENT' }, now.toISOString());
  }});
  context.routes.register({ method: 'POST', path: 'teacher-attendance/wattaman-scan', permission: manage, handler: async (request) => {
    const qrCode = identifier(request?.body?.qrCode, 'qrCode'); const now = new Date(); const timeZone = await context.settings.get('timezone', 'Asia/Phnom_Penh'); const clock = localClock(now, timeZone || 'Asia/Phnom_Penh');
    const teachers = await db.query(`SELECT t.*,d."name" AS "timetableName",d."periodTimes" FROM ${TEACHER} t JOIN plugin_wattanam_timetable_document d ON d."id"=t."timetableId" WHERE t."qrCode"=$1`, [qrCode]);
    if (!teachers.length) throw new Error('Teacher QR code not found'); const teacher = teachers[0]; const periodTimes = parsePeriodTimes(teacher.periodTimes); const detected = currentPeriod(periodTimes, clock.minutes);
    const scheduled = await db.query(`SELECT e."period",s."name" AS "subjectName",c."name" AS "className" FROM plugin_wattanam_timetable_entry e JOIN plugin_wattanam_timetable_subject s ON s."id"=e."subjectId" JOIN plugin_wattanam_timetable_class c ON c."id"=e."classId" WHERE e."teacherId"=$1 AND e."timetableId"=$2 AND e."day"=$3 ORDER BY e."period"`, [teacher.id, teacher.timetableId, clock.day]);
    const target = scheduled.find((entry) => entry.period === detected) || scheduled[0]; const lessonPeriod = target?.period || detected;
    const existing = await db.query(`SELECT * FROM ${ATTENDANCE} WHERE "teacherId"=$1 AND "date"=$2::date AND "period"=$3`, [teacher.id, clock.date, lessonPeriod]);
    const base = { teacherId: teacher.id, teacherName: `${teacher.firstName} ${teacher.lastName}`.trim(), period: lessonPeriod, subjectName: target?.subjectName || '', className: target?.className || '', timetableName: teacher.timetableName, scheduledPeriods: scheduled.map((entry) => entry.period) };
    if (existing.length) return { action: 'ALREADY_RECORDED', ...base, status: existing[0].status, checkIn: existing[0].checkIn || null };
    const grace = Number(await context.settings.get('teacherLateGraceMinutes', 20)); if (!Number.isInteger(grace) || grace < 0 || grace > 240) throw new Error('teacherLateGraceMinutes setting is invalid');
    const [hour, minute] = (periodTimes[lessonPeriod - 1] || '00:00').split(':').map(Number); const state = periodTimes.length && clock.minutes > hour * 60 + minute + grace ? 'LATE' : 'PRESENT';
    const attendance = await mark(db, { teacherId: teacher.id, date: clock.date, period: lessonPeriod, status: state }, now.toISOString());
    return { action: 'CHECK_IN', ...base, status: attendance.status, checkIn: attendance.checkIn || now.toISOString() };
  }});
  context.routes.register({ method: 'GET', path: 'scheduled-teachers/all', permission: view, handler: async () => {
    const documents = await db.query(`SELECT "id","name","status" FROM plugin_wattanam_timetable_document WHERE "status"='PUBLISHED' ORDER BY "createdAt" DESC LIMIT 500`);
    const teachers = await db.query(`SELECT * FROM ${TEACHER} ORDER BY "lastName","firstName" LIMIT 5000`); const lessons = await db.query('SELECT l.*,s."name" AS "subjectName",c."name" AS "className" FROM plugin_wattanam_timetable_lesson l JOIN plugin_wattanam_timetable_subject s ON s."id"=l."subjectId" JOIN plugin_wattanam_timetable_class c ON c."id"=l."classId" LIMIT 20000'); const entries = await db.query('SELECT "timetableId","teacherId","day","period" FROM plugin_wattanam_timetable_entry LIMIT 50000');
    const timeZone = await context.settings.get('timezone', 'Asia/Phnom_Penh'); const today = localClock(new Date(), timeZone || 'Asia/Phnom_Penh').day;
    return teachers.flatMap((teacher) => { const document = documents.find((item) => item.id === teacher.timetableId); if (!document) return []; const assigned = lessons.filter((lesson) => lesson.teacherId === teacher.id); const scheduled = entries.filter((entry) => entry.teacherId === teacher.id); return [{ ...teacher, timetableName: document.name, timetableStatus: document.status, name: `${teacher.firstName} ${teacher.lastName}`.trim(), weeklyLessons: assigned.reduce((total, lesson) => total + Number(lesson.perWeek), 0), lessons: assigned.map((lesson) => ({ id: lesson.id, subjectName: lesson.subjectName, className: lesson.className, perWeek: lesson.perWeek })), todayPeriods: scheduled.filter((entry) => entry.day === today).map((entry) => entry.period), totalEntries: scheduled.length }]; });
  }});
  const report = async (request, monthly) => {
    const timetableId = identifier(request?.params?.id, 'timetableId'); const startDate = isoDate(request?.query?.startDate, 'startDate'); const endDate = isoDate(request?.query?.endDate, 'endDate');
    if (endDate < startDate) throw new Error('endDate must not precede startDate');
    const teachers = await db.query(`SELECT * FROM ${TEACHER} WHERE "timetableId"=$1 ORDER BY "lastName","firstName" LIMIT 1000`, [timetableId]);
    const rows = await db.query(`SELECT a.* FROM ${ATTENDANCE} a JOIN ${TEACHER} t ON t."id"=a."teacherId" WHERE t."timetableId"=$1 AND a."date" BETWEEN $2::date AND $3::date ORDER BY a."date",a."period" LIMIT 50000`, [timetableId, startDate, endDate]);
    return teachers.map((teacher) => { const attendances = rows.filter((row) => row.teacherId === teacher.id); if (!monthly) return { ...teacher, attendances }; const present = attendances.filter((row) => row.status === 'PRESENT').length; const late = attendances.filter((row) => row.status === 'LATE').length; const absent = attendances.filter((row) => row.status === 'ABSENT').length; return { id: teacher.id, name: `${teacher.firstName} ${teacher.lastName}`.trim(), short: teacher.short, color: teacher.color, present, late, absent, total: present + late + absent, attendances }; });
  };
  context.routes.register({ method: 'GET', path: 'timetables/:id/teacher-attendance', permission: view, handler: (request) => report(request, false) });
  context.routes.register({ method: 'GET', path: 'timetables/:id/teacher-attendance/monthly', permission: view, handler: (request) => report(request, true) });
}

module.exports = { registerTeacherAttendance, mark };
