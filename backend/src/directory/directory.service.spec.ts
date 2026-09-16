import { DirectoryService } from './directory.service';

function prismaWith(overrides: any) {
  return {
    user: { findMany: jest.fn().mockResolvedValue([]) },
    class: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    student: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as any;
}

describe('DirectoryService', () => {
  it('resolves the SCHOOL audience to every user, defaulting channels to enabled with no preference row', async () => {
    const prisma = prismaWith({
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', email: 'a@example.com', phone: null, role: 'PARENT' }]) },
    });
    const service = new DirectoryService(prisma);
    await expect(service.resolveAudience({ audience: 'SCHOOL' })).resolves.toEqual([
      { id: 'u1', email: 'a@example.com', phone: null, role: 'PARENT', channels: { inApp: true, email: true, sms: true } },
    ]);
  });

  it('applies a per-user preference row, honoring the announcementsEnabled kill switch over individual channel flags', async () => {
    const prisma = prismaWith({
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', email: 'a@example.com', phone: '855', role: 'TEACHER' }]) },
      notificationPreference: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', announcementsEnabled: false, inAppEnabled: true, emailEnabled: true, smsEnabled: true }]) },
    });
    const service = new DirectoryService(prisma);
    const [recipient] = await service.resolveAudience({ audience: 'ROLE', targetRole: 'TEACHER' });
    expect(recipient.channels).toEqual({ inApp: false, email: false, sms: false });
  });

  it('resolves ROLE=ALL the same as SCHOOL', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'u1', email: null, phone: null, role: 'STUDENT' }]);
    const prisma = prismaWith({ user: { findMany } });
    const service = new DirectoryService(prisma);
    await service.resolveAudience({ audience: 'ROLE', targetRole: 'ALL' });
    expect(findMany).toHaveBeenCalledWith({ select: { id: true, email: true, phone: true, role: true } });
  });

  it('resolves CLASS to the teacher plus each student and parent, deduplicated', async () => {
    const prisma = prismaWith({
      class: {
        findUnique: jest.fn().mockResolvedValue({
          teacher: { id: 't1', email: 't@example.com', phone: null, role: 'TEACHER' },
          students: [
            { user: { id: 's1', email: 's1@example.com', phone: null, role: 'STUDENT' }, parent: { id: 'p1', email: 'p1@example.com', phone: null, role: 'PARENT' } },
            { user: { id: 's2', email: 's2@example.com', phone: null, role: 'STUDENT' }, parent: null },
          ],
        }),
      },
    });
    const service = new DirectoryService(prisma);
    const recipients = await service.resolveAudience({ audience: 'CLASS', classId: 'c1' });
    expect(recipients.map((r) => r.id).sort()).toEqual(['p1', 's1', 's2', 't1']);
  });

  it('returns nothing for a CLASS query with no classId and for an unknown class', async () => {
    const service = new DirectoryService(prismaWith({}));
    await expect(service.resolveAudience({ audience: 'CLASS' })).resolves.toEqual([]);
    await expect(service.resolveAudience({ audience: 'CLASS', classId: 'missing' })).resolves.toEqual([]);
  });

  it('lookupUsers/lookupClasses look up display names by id, deduplicated, and short-circuit on an empty list', async () => {
    const userFindMany = jest.fn().mockResolvedValue([{ id: 'u1', name: 'Ada', role: 'TEACHER' }]);
    const classFindMany = jest.fn().mockResolvedValue([{ id: 'c1', name: 'Grade 1' }]);
    const service = new DirectoryService(prismaWith({ user: { findMany: userFindMany }, class: { findMany: classFindMany } }));

    await expect(service.lookupUsers(['u1', 'u1'])).resolves.toEqual([{ id: 'u1', name: 'Ada', role: 'TEACHER' }]);
    expect(userFindMany).toHaveBeenCalledWith({ where: { id: { in: ['u1'] } }, select: { id: true, name: true, role: true } });
    await expect(service.lookupUsers([])).resolves.toEqual([]);

    await expect(service.lookupClasses(['c1'])).resolves.toEqual([{ id: 'c1', name: 'Grade 1' }]);
    await expect(service.lookupClasses([])).resolves.toEqual([]);
  });

  it('delegates department membership and fails closed when the contract is unavailable', async () => {
    const departmentForUser = jest.fn().mockResolvedValue('department-1');
    const service = new DirectoryService(prismaWith({}), { resolveClassAudience: jest.fn(), departmentForUser } as any);

    await expect(service.departmentForUser('user-1')).resolves.toBe('department-1');
    expect(departmentForUser).toHaveBeenCalledWith('user-1');

    await expect(new DirectoryService(prismaWith({})).departmentForUser('user-1'))
      .rejects.toThrow('does not support department membership');
  });

  it('classesForUser unions taught classes with the student/parent class, deduplicated', async () => {
    const classFindMany = jest.fn().mockResolvedValue([{ id: 'taught-1' }]);
    const studentFindUnique = jest.fn().mockResolvedValue({ classId: 'taught-1' });
    const service = new DirectoryService(prismaWith({ class: { findMany: classFindMany }, student: { findUnique: studentFindUnique } }));
    await expect(service.classesForUser('u1', 'STUDENT')).resolves.toEqual(['taught-1']);
  });

  it('classesForUser resolves a PARENT to every one of their children\'s classes', async () => {
    const classFindMany = jest.fn().mockResolvedValue([]);
    const studentFindMany = jest.fn().mockResolvedValue([{ classId: 'c1' }, { classId: 'c2' }, { classId: null }]);
    const service = new DirectoryService(prismaWith({ class: { findMany: classFindMany }, student: { findMany: studentFindMany } }));
    await expect(service.classesForUser('parent-1', 'PARENT')).resolves.toEqual(['c1', 'c2']);
  });

  it('uses the academic provider for CLASS audience resolution when configured', async () => {
    const classFindUnique = jest.fn();
    const prisma = prismaWith({ class: { findUnique: classFindUnique, findMany: jest.fn().mockResolvedValue([]) } });
    const provider = {
      resolveClassAudience: jest.fn().mockResolvedValue([
        { id: 't1', email: 't@example.com', phone: null, role: 'TEACHER' },
        { id: 's1', email: 's1@example.com', phone: null, role: 'STUDENT' },
      ]),
    } as any;

    const service = new DirectoryService(prisma, provider);
    const recipients = await service.resolveAudience({ audience: 'CLASS', classId: 'class-1' });

    expect(provider.resolveClassAudience).toHaveBeenCalledWith('class-1');
    expect(classFindUnique).not.toHaveBeenCalled();
    expect(recipients.map((recipient) => recipient.id)).toEqual(['t1', 's1']);
  });

  it('falls back to local class/student joins when no academic provider is configured', async () => {
    const classFindUnique = jest.fn().mockResolvedValue({
      teacher: { id: 't1', email: 't@example.com', phone: null, role: 'TEACHER' },
      students: [{ user: { id: 's1', email: 's1@example.com', phone: null, role: 'STUDENT' }, parent: null }],
    });
    const prisma = prismaWith({ class: { findUnique: classFindUnique, findMany: jest.fn().mockResolvedValue([]) } });
    const service = new DirectoryService(prisma);

    const recipients = await service.resolveAudience({ audience: 'CLASS', classId: 'class-1' });

    expect(classFindUnique).toHaveBeenCalled();
    expect(recipients.map((recipient) => recipient.id).sort()).toEqual(['s1', 't1']);
  });

  it('uses the academic provider for classesForUser when configured', async () => {
    const classFindMany = jest.fn();
    const studentFindUnique = jest.fn();
    const prisma = prismaWith({ class: { findUnique: jest.fn().mockResolvedValue(null), findMany: classFindMany }, student: { findUnique: studentFindUnique, findMany: jest.fn().mockResolvedValue([]) } });
    const provider = {
      resolveClassAudience: jest.fn().mockResolvedValue([]),
      resolveClassesForUser: jest.fn().mockResolvedValue(['class-1', 'class-2']),
    } as any;
    const service = new DirectoryService(prisma, provider);

    const result = await service.classesForUser('user-1', 'TEACHER');

    expect(result).toEqual(['class-1', 'class-2']);
    expect(provider.resolveClassesForUser).toHaveBeenCalledWith('user-1', 'TEACHER');
    expect(classFindMany).not.toHaveBeenCalled();
    expect(studentFindUnique).not.toHaveBeenCalled();
  });

  it('falls back to local joins for classesForUser when provider has no classes method', async () => {
    const classFindMany = jest.fn().mockResolvedValue([{ id: 'taught-1' }]);
    const studentFindUnique = jest.fn().mockResolvedValue({ classId: 'taught-1' });
    const prisma = prismaWith({ class: { findUnique: jest.fn().mockResolvedValue(null), findMany: classFindMany }, student: { findUnique: studentFindUnique, findMany: jest.fn().mockResolvedValue([]) } });
    const provider = { resolveClassAudience: jest.fn().mockResolvedValue([]) } as any;
    const service = new DirectoryService(prisma, provider);

    await expect(service.classesForUser('u1', 'STUDENT')).resolves.toEqual(['taught-1']);
    expect(classFindMany).toHaveBeenCalled();
    expect(studentFindUnique).toHaveBeenCalled();
  });

  it('uses the academic provider for lookupClasses when configured', async () => {
    const classFindMany = jest.fn();
    const prisma = prismaWith({ class: { findUnique: jest.fn().mockResolvedValue(null), findMany: classFindMany } });
    const provider = {
      resolveClassAudience: jest.fn().mockResolvedValue([]),
      lookupClasses: jest.fn().mockResolvedValue([{ id: 'class-1', name: 'Grade 1A' }]),
    } as any;
    const service = new DirectoryService(prisma, provider);

    await expect(service.lookupClasses(['class-1', 'class-1'])).resolves.toEqual([{ id: 'class-1', name: 'Grade 1A' }]);
    expect(provider.lookupClasses).toHaveBeenCalledWith(['class-1', 'class-1']);
    expect(classFindMany).not.toHaveBeenCalled();
  });

  it('falls back to local class lookup when provider has no lookupClasses method', async () => {
    const classFindMany = jest.fn().mockResolvedValue([{ id: 'class-1', name: 'Grade 1A' }]);
    const prisma = prismaWith({ class: { findUnique: jest.fn().mockResolvedValue(null), findMany: classFindMany } });
    const provider = { resolveClassAudience: jest.fn().mockResolvedValue([]) } as any;
    const service = new DirectoryService(prisma, provider);

    await expect(service.lookupClasses(['class-1'])).resolves.toEqual([{ id: 'class-1', name: 'Grade 1A' }]);
    expect(classFindMany).toHaveBeenCalledWith({ where: { id: { in: ['class-1'] } }, select: { id: true, name: true } });
  });

  it('delegates versioned roster and enrollment reads and fails closed without the contract', async () => {
    const getClassRoster = jest.fn().mockResolvedValue({ classId: 'c1', students: [] });
    const getEnrollmentAtDate = jest.fn().mockResolvedValue({ studentId: 's1', enrolled: true });
    const service = new DirectoryService(prismaWith({}), {
      resolveClassAudience: jest.fn(), getClassRoster, getEnrollmentAtDate,
    } as any);
    await expect(service.getClassRoster('c1', '2026-09-16')).resolves.toMatchObject({ classId: 'c1' });
    await expect(service.getEnrollmentAtDate('s1', '2026-09-16')).resolves.toMatchObject({ studentId: 's1' });
    expect(getClassRoster).toHaveBeenCalledWith('c1', '2026-09-16');
    expect(getEnrollmentAtDate).toHaveBeenCalledWith('s1', '2026-09-16');

    const unavailable = new DirectoryService(prismaWith({}));
    await expect(unavailable.getClassRoster('c1', '2026-09-16')).rejects.toThrow('roster contract v1');
    await expect(unavailable.getEnrollmentAtDate('s1', '2026-09-16')).rejects.toThrow('enrollment contract v1');
  });
});
