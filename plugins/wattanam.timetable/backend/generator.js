'use strict';

const { randomUUID } = require('crypto');
const PREFIX = 'plugin_wattanam_timetable_';

function configuration(value, label, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { throw new Error(`${label} configuration is invalid`); }
}
function minutes(value, label) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${label} must use HH:mm`);
  const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute;
}

function planSchedule(document, lessons, classrooms = []) {
  if (!Array.isArray(lessons) || lessons.length === 0) throw new Error('Add lessons before generating a timetable');
  const days = Number(document.numberOfDays);
  const periods = Number(document.periodsPerDay);
  if (!Number.isInteger(days) || !Number.isInteger(periods) || days < 1 || days > 7 || periods < 1 || periods > 24) throw new Error('Timetable day/period settings are invalid');
  const weekend = Array.isArray(document.weekend) ? document.weekend : [];
  const names = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const availableDays = names.map((name, index) => ({ name, day: index + 1 })).filter(({ name }) => !weekend.includes(name)).slice(0, days).map(({ day }) => day);
  if (availableDays.length !== days) throw new Error('Not enough teaching days after weekend exclusions');
  const periodTimes = configuration(document.periodTimes, 'periodTimes', []);
  if (!Array.isArray(periodTimes) || (periodTimes.length && periodTimes.length < periods)) throw new Error('periodTimes must contain every configured period');
  const timeOffRules = configuration(document.timeOffRules, 'timeOffRules', []);
  if (!Array.isArray(timeOffRules)) throw new Error('timeOffRules must be an array');
  const blockedPeriods = new Set();
  if (periodTimes.length) {
    const starts = periodTimes.slice(0, periods).map((value, index) => minutes(value, `periodTimes[${index}]`));
    for (const [index, start] of starts.entries()) {
      const end = starts[index + 1] ?? start + 60;
      for (const [ruleIndex, rule] of timeOffRules.entries()) {
        const from = minutes(rule?.from, `timeOffRules[${ruleIndex}].from`); const to = minutes(rule?.to, `timeOffRules[${ruleIndex}].to`);
        if (to <= from) throw new Error(`timeOffRules[${ruleIndex}] must end after it starts`);
        if (start < to && end > from) blockedPeriods.add(index + 1);
      }
    }
  } else if (timeOffRules.length) throw new Error('periodTimes are required when timeOffRules are configured');
  const distribution = configuration(document.distribution, 'distribution', {});
  const structuredDistribution = distribution && typeof distribution === 'object' && !Array.isArray(distribution) ? distribution : {};
  const maxSameSubjectPerDay = structuredDistribution.maxSameSubjectPerDay == null ? null : Number(structuredDistribution.maxSameSubjectPerDay);
  if (maxSameSubjectPerDay !== null && (!Number.isInteger(maxSameSubjectPerDay) || maxSameSubjectPerDay < 1 || maxSameSubjectPerDay > periods)) throw new Error('distribution.maxSameSubjectPerDay is invalid');
  const maxOnDay = document.maxOnDay == null ? null : Number(document.maxOnDay);
  if (maxOnDay !== null && (!Number.isInteger(maxOnDay) || maxOnDay < 1 || maxOnDay > periods)) throw new Error('maxOnDay is invalid');
  const ordered = [...lessons].sort((a, b) => Number(b.perWeek) - Number(a.perWeek) || String(a.id).localeCompare(String(b.id)));
  const entries = [];
  const occupied = { class: new Set(), teacher: new Set(), classroom: new Set() };
  const perClassDay = new Map(); const perSubjectDay = new Map();
  const unplaced = [];
  for (const lesson of ordered) {
    const needed = Number(lesson.perWeek);
    if (!Number.isInteger(needed) || needed < 1 || needed > availableDays.length * periods) throw new Error(`Invalid perWeek for lesson ${lesson.id}`);
    const assignedDays = new Set();
    let assigned = 0;
    for (let pass = 0; pass < 2 && assigned < needed; pass++) {
      for (const day of availableDays) {
        if (pass === 0 && assignedDays.has(day)) continue;
        for (let period = 1; period <= periods; period++) {
          if (blockedPeriods.has(period)) continue;
          const slot = `${day}:${period}`;
          if (occupied.class.has(`${lesson.classId}:${slot}`) || occupied.teacher.has(`${lesson.teacherId}:${slot}`)) continue;
          const classDay = `${lesson.classId}:${day}`; const subjectDay = `${lesson.classId}:${lesson.subjectId}:${day}`;
          if (maxOnDay !== null && (perClassDay.get(classDay) || 0) >= maxOnDay) continue;
          if (maxSameSubjectPerDay !== null && (perSubjectDay.get(subjectDay) || 0) >= maxSameSubjectPerDay) continue;
          const classroom = classrooms.find((room) => !occupied.classroom.has(`${room.id}:${slot}`));
          if (classrooms.length && !classroom) continue;
          entries.push({ lessonId: lesson.id, classId: lesson.classId, teacherId: lesson.teacherId, subjectId: lesson.subjectId, classroomId: classroom?.id || null, day, period });
          occupied.class.add(`${lesson.classId}:${slot}`);
          occupied.teacher.add(`${lesson.teacherId}:${slot}`);
          if (classroom) occupied.classroom.add(`${classroom.id}:${slot}`);
          perClassDay.set(classDay, (perClassDay.get(classDay) || 0) + 1);
          perSubjectDay.set(subjectDay, (perSubjectDay.get(subjectDay) || 0) + 1);
          assignedDays.add(day);
          assigned++;
          break;
        }
        if (assigned >= needed) break;
      }
    }
    if (assigned < needed) unplaced.push({ lessonId: lesson.id, required: needed, assigned });
  }
  return { entries, unplaced, complete: unplaced.length === 0, constraints: { blockedPeriods: [...blockedPeriods], maxOnDay, maxSameSubjectPerDay } };
}

function registerGenerator(context) {
  const db = context.database;
  const load = async (id) => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Timetable id is invalid');
    const documents = await db.query(`SELECT * FROM ${PREFIX}document WHERE "id"=$1`, [id]);
    if (!documents.length) throw new Error('Timetable not found');
    const lessons = await db.query(`SELECT * FROM ${PREFIX}lesson WHERE "timetableId"=$1 ORDER BY "id"`, [id]);
    const classrooms = await db.query(`SELECT * FROM ${PREFIX}classroom WHERE "timetableId"=$1 ORDER BY "id"`, [id]);
    return { document: documents[0], lessons, classrooms };
  };
  context.routes.register({ method: 'GET', path: 'timetables/:id/generation-preview', permission: 'wattanam.timetable.view', handler: async (request) => {
    const { document, lessons, classrooms } = await load(request?.params?.id);
    return planSchedule(document, lessons, classrooms);
  }});
  context.routes.register({ method: 'POST', path: 'timetables/:id/generate', permission: 'wattanam.timetable.manage', handler: async (request) => {
    const timetableId = request?.params?.id;
    const { document, lessons, classrooms } = await load(timetableId);
    if (document.status === 'PUBLISHED') throw new Error('Unpublish before regenerating the schedule');
    const planned = planSchedule(document, lessons, classrooms);
    if (!planned.complete) return { ...planned, generated: planned.entries.length, saved: false };
    await db.transaction(async (tx) => {
      const current = await tx.query(`SELECT "status","updatedAt" FROM ${PREFIX}document WHERE "id"=$1 FOR UPDATE`, [timetableId]);
      if (!current.length || current[0].status !== 'DRAFT' || String(current[0].updatedAt) !== String(document.updatedAt)) throw new Error('Timetable changed during generation; retry the preview');
      const currentLessons = await tx.query(`SELECT * FROM ${PREFIX}lesson WHERE "timetableId"=$1 ORDER BY "id"`, [timetableId]);
      const currentRooms = await tx.query(`SELECT * FROM ${PREFIX}classroom WHERE "timetableId"=$1 ORDER BY "id"`, [timetableId]);
      if (JSON.stringify(currentLessons) !== JSON.stringify(lessons) || JSON.stringify(currentRooms) !== JSON.stringify(classrooms)) throw new Error('Lessons or rooms changed during generation; retry the preview');
      await tx.execute(`DELETE FROM ${PREFIX}entry WHERE "timetableId"=$1`, [timetableId]);
      for (const entry of planned.entries) {
        await tx.execute(`INSERT INTO ${PREFIX}entry ("id","timetableId","lessonId","classId","teacherId","subjectId","classroomId","day","period") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), timetableId, entry.lessonId, entry.classId, entry.teacherId, entry.subjectId, entry.classroomId, entry.day, entry.period]);
      }
      await tx.execute(`UPDATE ${PREFIX}document SET "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, [timetableId]);
    });
    return { ...planned, generated: planned.entries.length, saved: true };
  }});
}

module.exports = { planSchedule, registerGenerator };
