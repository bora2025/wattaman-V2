import { PrismaAcademicDirectoryProvider } from './academic-directory.provider';

describe('PrismaAcademicDirectoryProvider department membership read ownership', () => {
  const originalOwner = process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER;
  afterEach(() => {
    if (originalOwner === undefined) delete process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER;
    else process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER = originalOwner;
  });

  it('defaults to the legacy membership without accessing the plugin table', async () => {
    delete process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER;
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ departmentId: 'd1' }) }, $transaction: jest.fn() } as any;
    await expect(new PrismaAcademicDirectoryProvider(prisma).departmentForUser('u1')).resolves.toBe('d1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reads plugin membership only when it matches the locked legacy value', async () => {
    process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER = 'plugin';
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ departmentId: 'd1' }]).mockResolvedValueOnce([{ departmentId: 'd1' }]) };
    const prisma = { user: { findUnique: jest.fn() }, $transaction: jest.fn((callback) => callback(tx)) } as any;
    await expect(new PrismaAcademicDirectoryProvider(prisma).departmentForUser('u1')).resolves.toBe('d1');
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('FOR SHARE');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects divergence, missing plugin membership and invalid ownership', async () => {
    process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER = 'plugin';
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ departmentId: 'd1' }]).mockResolvedValueOnce([]) };
    const prisma = { user: { findUnique: jest.fn() }, $transaction: jest.fn((callback) => callback(tx)) } as any;
    const provider = new PrismaAcademicDirectoryProvider(prisma);
    await expect(provider.departmentForUser('u1')).rejects.toThrow('mirror differs');
    process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER = 'unknown';
    await expect(provider.departmentForUser('u1')).rejects.toThrow('must be legacy or plugin');
  });
});

describe('PrismaAcademicDirectoryProvider roster contract v1', () => {
  const today = new Date().toISOString().slice(0, 10);
  const originalOwner = process.env.ACADEMIC_ROSTER_READ_OWNER;
  afterEach(() => {
    if (originalOwner === undefined) delete process.env.ACADEMIC_ROSTER_READ_OWNER;
    else process.env.ACADEMIC_ROSTER_READ_OWNER = originalOwner;
  });

  it('returns a stable versioned current roster projection', async () => {
    const prisma = { installation: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) }, class: { findUnique: jest.fn().mockResolvedValue({
      id: 'c1', name: 'Grade 1A', students: [
        { id: 's2', userId: 'u2', studentNumber: '002', parentId: null, user: { name: 'Sokha' } },
        { id: 's1', userId: 'u1', studentNumber: '001', parentId: 'p1', user: { name: 'Dara' } },
      ],
    }) } } as any;
    const result = await new PrismaAcademicDirectoryProvider(prisma).getClassRoster('c1', today);
    expect(result).toMatchObject({
      contract: { id: 'wattanam.academic-management.roster', version: '1.0.0' },
      classId: 'c1', className: 'Grade 1A', asOfIsoDate: today,
    });
    expect(result.students).toHaveLength(2);
    expect(result.students[0]).toMatchObject({ studentId: 's2', userId: 'u2', name: 'Sokha' });
    expect(prisma.class.findUnique.mock.calls[0][0].select.students.orderBy).toEqual({ id: 'asc' });
  });

  it('returns current enrollment with an explicit legacy source', async () => {
    const prisma = { installation: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) }, student: { findUnique: jest.fn().mockResolvedValue({ id: 's1', classId: 'c1', class: { name: 'Grade 1A' } }) } } as any;
    await expect(new PrismaAcademicDirectoryProvider(prisma).getEnrollmentAtDate('s1', today)).resolves.toMatchObject({
      contract: { version: '1.0.0' }, studentId: 's1', classId: 'c1', className: 'Grade 1A',
      enrolled: true, asOfIsoDate: today, source: 'legacy-current-membership',
    });
  });

  it('fails closed for historical or malformed dates before querying current membership', async () => {
    const prisma = { installation: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) }, class: { findUnique: jest.fn() }, student: { findUnique: jest.fn() } } as any;
    const provider = new PrismaAcademicDirectoryProvider(prisma);
    await expect(provider.getClassRoster('c1', '2020-01-01')).rejects.toThrow('Historical enrollment lookup is unavailable');
    await expect(provider.getEnrollmentAtDate('s1', 'not-a-date')).rejects.toThrow('valid ISO date');
    expect(prisma.class.findUnique).not.toHaveBeenCalled();
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
  });

  it('reads a historical roster from plugin intervals without comparing current membership', async () => {
    process.env.ACADEMIC_ROSTER_READ_OWNER = 'plugin';
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ studentId: 's1' }]),
      class: { findUnique: jest.fn().mockResolvedValue({ name: 'Grade 1A' }) },
      student: { findMany: jest.fn().mockResolvedValue([{ id: 's1', userId: 'u1', studentNumber: '001', parentId: null, classId: 'c2', user: { name: 'Dara' } }]) },
    };
    const prisma = {
      installation: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
      $transaction: jest.fn((work) => work(tx)),
    } as any;
    await expect(new PrismaAcademicDirectoryProvider(prisma).getClassRoster('c1', '2020-01-01')).resolves.toMatchObject({
      classId: 'c1', source: 'plugin-enrollment-interval', students: [{ studentId: 's1' }],
    });
    expect(tx.student.findMany).toHaveBeenCalledTimes(1);
  });

  it('rejects current roster drift and overlapping interval membership', async () => {
    process.env.ACADEMIC_ROSTER_READ_OWNER = 'plugin';
    const overlapTx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ studentId: 's1' }, { studentId: 's1' }]),
      class: { findUnique: jest.fn() }, student: { findMany: jest.fn() },
    };
    const overlapPrisma = { installation: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) }, $transaction: jest.fn((work) => work(overlapTx)) } as any;
    await expect(new PrismaAcademicDirectoryProvider(overlapPrisma).getClassRoster('c1', today)).rejects.toThrow('Overlapping');

    const driftTx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ studentId: 's1' }]),
      class: { findUnique: jest.fn().mockResolvedValue({ name: 'Grade 1A' }) },
      student: { findMany: jest.fn()
        .mockResolvedValueOnce([{ id: 's1', userId: 'u1', studentNumber: null, parentId: null, classId: 'c1', user: { name: 'Dara' } }])
        .mockResolvedValueOnce([{ id: 's2' }]) },
    };
    const driftPrisma = { installation: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) }, $transaction: jest.fn((work) => work(driftTx)) } as any;
    await expect(new PrismaAcademicDirectoryProvider(driftPrisma).getClassRoster('c1', today)).rejects.toThrow('mirror differs');
  });

  it('resolves historical enrollment from intervals and validates the read-owner setting', async () => {
    process.env.ACADEMIC_ROSTER_READ_OWNER = 'plugin';
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ classId: 'c1' }]),
      student: { findUnique: jest.fn().mockResolvedValue({ id: 's1', classId: 'c2' }) },
      class: { findUnique: jest.fn().mockResolvedValue({ name: 'Grade 1A' }) },
    };
    const prisma = { installation: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) }, $transaction: jest.fn((work) => work(tx)) } as any;
    await expect(new PrismaAcademicDirectoryProvider(prisma).getEnrollmentAtDate('s1', '2020-01-01')).resolves.toMatchObject({
      classId: 'c1', enrolled: true, source: 'plugin-enrollment-interval',
    });
    process.env.ACADEMIC_ROSTER_READ_OWNER = 'invalid';
    await expect(new PrismaAcademicDirectoryProvider(prisma).getEnrollmentAtDate('s1', today)).rejects.toThrow('must be legacy or plugin');
  });
});
