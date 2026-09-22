'use strict';

const { randomUUID } = require('crypto');
const PREFIX = 'plugin_wattanam_timetable_';

function planSchedule(document, lessons, classrooms = []) {
  if (!Array.isArray(lessons) || lessons.length === 0) throw new Error('Add lessons before generating a timetable');
  const days = Number(document.numberOfDays);
  const periods = Number(document.periodsPerDay);
  if (!Number.isInteger(days) || !Number.isInteger(periods) || days < 1 || days > 7 || periods < 1 || periods > 24) throw new Error('Timetable day/period settings are invalid');
  const weekend = Array.isArray(document.weekend) ? document.weekend : [];
  const names = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const availableDays = names.map((name, index) => ({ name, day: index + 1 })).filter(({ name }) => !weekend.includes(name)).slice(0, days).map(({ day }) => day);
  if (availableDays.length !== days) throw new Error('Not enough teaching days after weekend exclusions');
  const ordered = [...lessons].sort((a, b) => Number(b.perWeek) - Number(a.perWeek) || String(a.id).localeCompare(String(b.id)));
  const entries = [];
  const occupied = { class: new Set(), teacher: new Set(), classroom: new Set() };
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
          const slot = `${day}:${period}`;
          if (occupied.class.has(`${lesson.classId}:${slot}`) || occupied.teacher.has(`${lesson.teacherId}:${slot}`)) continue;
          const classroom = classrooms.find((room) => !occupied.classroom.has(`${room.id}:${slot}`));
          if (classrooms.length && !classroom) continue;
          entries.push({ lessonId: lesson.id, classId: lesson.classId, teacherId: lesson.teacherId, subjectId: lesson.subjectId, classroomId: classroom?.id || null, day, period });
          occupied.class.add(`${lesson.classId}:${slot}`);
          occupied.teacher.add(`${lesson.teacherId}:${slot}`);
          if (classroom) occupied.classroom.add(`${classroom.id}:${slot}`);
          assignedDays.add(day);
          assigned++;
          break;
        }
        if (assigned >= needed) break;
      }
    }
    if (assigned < needed) unplaced.push({ lessonId: lesson.id, required: needed, assigned });
  }
  return { entries, unplaced, complete: unplaced.length === 0 };
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
