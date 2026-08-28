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
});
