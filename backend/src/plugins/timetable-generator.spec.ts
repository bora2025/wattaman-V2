const { planSchedule } = require('../../../plugins/wattanam.timetable/backend/generator');

describe('Timetable plugin generator', () => {
  const document = { numberOfDays: 5, periodsPerDay: 3, weekend: ['SATURDAY', 'SUNDAY'] };
  const lessons = [
    { id: 'l1', classId: 'c1', teacherId: 't1', subjectId: 's1', perWeek: 4 },
    { id: 'l2', classId: 'c2', teacherId: 't1', subjectId: 's2', perWeek: 4 },
  ];

  it('places lessons without class, teacher, or room collisions', () => {
    const plan = planSchedule(document, lessons, [{ id: 'r1' }, { id: 'r2' }]);
    expect(plan.complete).toBe(true);
    expect(plan.entries).toHaveLength(8);
    for (const dimension of ['classId', 'teacherId', 'classroomId']) {
      const occupied = plan.entries.map((entry: any) => `${entry[dimension]}:${entry.day}:${entry.period}`);
      expect(new Set(occupied).size).toBe(occupied.length);
    }
    expect(plan.entries.every((entry: any) => entry.day <= 5)).toBe(true);
  });

  it('reports unplaced lessons instead of silently publishing a partial schedule', () => {
    const plan = planSchedule({ ...document, periodsPerDay: 1 }, lessons, [{ id: 'r1' }]);
    expect(plan.complete).toBe(false);
    expect(plan.unplaced.length).toBeGreaterThan(0);
  });
});
