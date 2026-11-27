const examPlugin = require('../backend/index.js');
const { classify, withContract } = require('../backend/errors.js');
const { cleanRichText } = require('../backend/rich-text.js');
const { mediaRefs } = require('../backend/media.js');

describe('Examination 0.3.0 workspace', () => {
  function activate(overrides: any = {}) {
    const routes = new Map<string, any>();
    const database: any = {
      query: jest.fn().mockResolvedValue([]), execute: jest.fn().mockResolvedValue({ count: 1 }),
      transaction: jest.fn(async (work: any) => work(database)),
      ...overrides.database,
    };
    const directory = {
      lookupUsers: jest.fn().mockResolvedValue([{ id: 'teacher-1', name: 'Teacher One' }]),
      lookupClasses: jest.fn().mockResolvedValue([{ id: 'class-1', name: 'Grade 7A' }]),
      lookupSubjects: jest.fn().mockResolvedValue([]),
      classesForUser: jest.fn().mockResolvedValue(['class-1']),
      getClassRoster: jest.fn().mockResolvedValue({ students: [{ studentId: 'student-1', userId: 'student-user-1', name: 'Sok Dara', studentNumber: 'S-001' }] }),
      ...overrides.directory,
    };
    examPlugin.activate({
      database, directory, readModels: { publish: jest.fn() },
      notifications: { notifyInApp: jest.fn() }, permissions: { register: jest.fn() }, navigation: { register: jest.fn() },
      routes: { register: (definition: any) => routes.set(`${definition.method} ${definition.path}`, definition) },
    });
    return { routes, database, directory };
  }
  const teacher = { userId: 'teacher-1', role: 'TEACHER' };

  it('answers every route in the error contract with the reason as the message', async () => {
    const { routes } = activate();
    expect(routes.get('GET workspace/exams').contract).toBeTruthy();
    expect(routes.get('POST exams').contract.errors.CONFLICT.status).toBe(409);
    const error = await routes.get('DELETE exams/:id').handler({ params: { id: 'missing' }, principal: teacher }).catch((e: any) => e);
    expect(error).toMatchObject({ code: 'NOT_FOUND', isPluginContractError: true, message: 'Exam not found' });
    expect(classify('Only the exam creator or an administrator may change this exam')).toBe('FORBIDDEN');
    expect(classify('Maximum attempts (1) reached')).toBe('CONFLICT');
    expect(classify('title is required (maximum 300 characters)')).toBe('INVALID_VALUE');
    // a bug or an outage stays a server error
    const wrapped = withContract({ routes: { register: (d: any) => d } }).routes.register({ method: 'GET', path: 'x', handler: async () => { throw new TypeError('boom'); } });
    await expect(wrapped.handler({})).rejects.toMatchObject({ message: 'boom' });
    await expect(wrapped.handler({})).rejects.not.toHaveProperty('isPluginContractError');
  });

  it('keeps formatting but removes scripts, handlers and links from question text', () => {
    const html = cleanRichText('<p style="color:red;background:url(x)" onclick="steal()"><b>Bold</b> <a href="javascript:x">link</a><img src=x onerror=alert(1)><script>alert(1)</script><font color="#f00" size="5">big</font></p>');
    expect(html).toBe('<p style="color:red"><b>Bold</b> link<font color="#f00" size="5">big</font></p>');
    expect(cleanRichText('2 < 3 and 4 > 1')).toBe('2 &lt; 3 and 4 > 1');
  });

  it('follows mono status changes with guards (questions needed, back to draft only before attempts)', async () => {
    const { routes, database } = activate();
    const patch = (from: string, to: string, rows: any[][]) => {
      database.query.mockReset();
      database.query.mockResolvedValueOnce([{ id: 'exam-1', status: from, createdByDirectoryUserId: 'teacher-1' }]);
      rows.forEach((r) => database.query.mockResolvedValueOnce(r));
      return routes.get('PATCH exams/:id/status').handler({ params: { id: 'exam-1' }, body: { status: to }, principal: teacher });
    };
    await expect(patch('DRAFT', 'ACTIVE', [[{ id: 'q1' }]])).resolves.toEqual({ id: 'exam-1', status: 'ACTIVE' });
    await expect(patch('DRAFT', 'ACTIVE', [[]])).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(patch('COMPLETED', 'ACTIVE', [[{ id: 'q1' }]])).resolves.toEqual({ id: 'exam-1', status: 'ACTIVE' });
    await expect(patch('ACTIVE', 'DRAFT', [])).rejects.toThrow('Cannot transition');
    await expect(patch('PUBLISHED', 'DRAFT', [[{ id: 'attempt-1' }]])).rejects.toThrow('students have already taken it');
  });

  it('saves the whole exam, and refuses to change questions students already answered', async () => {
    const { routes, database } = activate();
    const exam = { id: 'exam-1', status: 'ACTIVE', createdByDirectoryUserId: 'teacher-1', academicClassId: 'class-1' };
    database.query.mockImplementation(async (sql: string) => {
      if (/SELECT \* FROM plugin_wattanam_examination_exam/.test(sql)) return [exam];
      if (/COUNT\(\*\)::int AS "count" FROM plugin_wattanam_examination_attempt/.test(sql)) return [{ count: 3 }];
      return [];
    });
    const body = { title: 'Unit 3', academicClassId: 'class-1', duration: 30, totalMarks: 10, passMark: 5, maxAttempts: 1, questions: [{ type: 'TF', text: '<b>Sky is blue</b>', marks: 1, data: { correct: true } }] };
    await expect(routes.get('PUT workspace/exams/:id').handler({ params: { id: 'exam-1' }, body, principal: teacher })).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('already taken this exam (3)') });
    // without questions, the details still change
    const { questions, ...details } = body;
    await routes.get('PUT workspace/exams/:id').handler({ params: { id: 'exam-1' }, body: details, principal: teacher });
    expect(database.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE plugin_wattanam_examination_exam SET "title"=$2'), expect.arrayContaining(['exam-1', 'Unit 3', 30]));
    // a pass mark above the total, another teacher's class, a broken question: refused with the reason
    await expect(routes.get('PUT workspace/exams/:id').handler({ params: { id: 'exam-1' }, body: { ...details, passMark: 11 }, principal: teacher })).rejects.toMatchObject({ code: 'INVALID_VALUE' });
    await expect(routes.get('POST workspace/exams').handler({ body: { ...body, questions: [{ type: 'MCQ', text: 'Q', data: { choices: [{ text: 'only one' }] } }] }, principal: teacher })).rejects.toMatchObject({ message: 'Question 1: Multiple choice needs at least two choices' });
  });

  it('accepts pictures and recordings in parts within their limits', async () => {
    const { routes, database } = activate();
    database.query.mockResolvedValue([{ id: 'exam-1', status: 'DRAFT', createdByDirectoryUserId: 'teacher-1' }]);
    const post = (body: any) => routes.get('POST media').handler({ body: { examId: 'exam-1', ...body }, principal: teacher });
    await expect(post({ kind: 'IMAGE', mime: 'image/jpeg', bytes: 300000, parts: 3 })).resolves.toMatchObject({ ref: expect.stringMatching(/^media:/) });
    await expect(post({ kind: 'IMAGE', mime: 'image/svg+xml', bytes: 300, parts: 1 })).rejects.toMatchObject({ code: 'INVALID_VALUE' });
    await expect(post({ kind: 'AUDIO', mime: 'audio/mpeg', bytes: 7 * 1024 * 1024, parts: 50 })).rejects.toMatchObject({ code: 'TOO_LARGE' });
    await expect(post({ kind: 'AUDIO', mime: 'audio/mpeg', bytes: 1000000, parts: 1 })).rejects.toMatchObject({ message: 'parts is invalid' });
    expect(mediaRefs({ a: 'media:123e4567-e89b-12d3-a456-426614174000', b: [{ c: 'media:bad' }] })).toEqual(['123e4567-e89b-12d3-a456-426614174000']);
  });

  it("gives students their own attempt on each exam and hides scores until grading is done", async () => {
    const { routes, database } = activate();
    database.query.mockImplementation(async (sql: string) => {
      if (/FROM plugin_wattanam_examination_exam e WHERE e."status" IN/.test(sql)) return [{ id: 'exam-1', title: 'Unit 3', academicClassId: 'class-1', totalMarks: 10, passMark: 5, maxAttempts: 2, status: 'ACTIVE', questionCount: 4 }];
      if (/FROM plugin_wattanam_examination_attempt a JOIN/.test(sql)) return [{ id: 'attempt-1', examId: 'exam-1', status: 'SUBMITTED', score: 6, grade: null, feedback: 'secret', attemptNumber: 1, title: 'Unit 3', totalMarks: 10, passMark: 5 }];
      return [];
    });
    const student = { userId: 'student-user-1', role: 'STUDENT' };
    const exams = await routes.get('GET student/workspace/exams').handler({ principal: student });
    expect(exams[0]).toMatchObject({ className: 'Grade 7A', attempt: { id: 'attempt-1', status: 'SUBMITTED', attemptNumber: 1 } });
    const results = await routes.get('GET student/results').handler({ principal: student });
    expect(results[0]).toMatchObject({ status: 'SUBMITTED', score: null, grade: null, feedback: null });
  });

  it.each(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'])('treats %s as an administrator and never asks the directory for its classes', async (role) => {
    const { routes, database, directory } = activate();
    const admin = { userId: 'admin-1', role };
    database.query.mockImplementation(async (sql: string) => (/SELECT \* FROM plugin_wattanam_examination_exam/.test(sql) ? [{ id: 'exam-1', status: 'DRAFT', createdByDirectoryUserId: 'teacher-1' }] : []));
    await routes.get('GET workspace/exams').handler({ principal: admin });
    expect(database.query.mock.calls[0][0]).not.toMatch(/WHERE e\."createdByDirectoryUserId"/);
    await expect(routes.get('GET workspace/classes').handler({ principal: admin })).resolves.toEqual([]);
    await routes.get('POST workspace/exams').handler({ principal: admin, body: { title: 'By the office', academicClassId: 'class-1' } });
    await routes.get('PUT workspace/exams/:id').handler({ principal: admin, params: { id: 'exam-1' }, body: { title: 'Changed by the office' } });
    await routes.get('GET exams').handler({ principal: admin });
    await routes.get('GET gradebooks').handler({ principal: admin });
    expect(directory.classesForUser).not.toHaveBeenCalled();
  });
});
