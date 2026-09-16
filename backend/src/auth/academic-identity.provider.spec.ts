import { PrismaAcademicIdentityProvider } from './academic-identity.provider';

describe('PrismaAcademicIdentityProvider detach command', () => {
  it('owns the academic transaction and safely detaches all academic bindings', async () => {
    const tx = {
      student: {
        findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }),
        delete: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      class: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      attendance: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      feeRecord: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as any;
    const prisma = {
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<void>) => work(tx)),
    } as any;
    const provider = new PrismaAcademicIdentityProvider(prisma);

    await provider.detachUserAcademicIdentity({
      userId: 'user-1',
      idempotencyKey: 'delete-user:user-1',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.class.updateMany).toHaveBeenCalledWith({ where: { teacherId: 'user-1' }, data: { teacherId: null } });
    expect(tx.attendance.deleteMany).toHaveBeenCalledWith({ where: { studentId: 'student-1' } });
    expect(tx.feeRecord.deleteMany).toHaveBeenCalledWith({ where: { studentId: 'student-1' } });
    expect(tx.student.delete).toHaveBeenCalledWith({ where: { id: 'student-1' } });
    expect(tx.student.updateMany).toHaveBeenCalledWith({ where: { parentId: 'user-1' }, data: { parentId: null } });
  });

  it('is repeat-safe when the student profile is already absent', async () => {
    const tx = {
      student: {
        findUnique: jest.fn().mockResolvedValue(null),
        delete: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      class: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      attendance: { deleteMany: jest.fn() },
      feeRecord: { deleteMany: jest.fn() },
    } as any;
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) } as any;
    const provider = new PrismaAcademicIdentityProvider(prisma);

    await provider.detachUserAcademicIdentity({
      userId: 'user-1',
      idempotencyKey: 'delete-user:user-1',
    });

    expect(tx.student.delete).not.toHaveBeenCalled();
    expect(tx.attendance.deleteMany).not.toHaveBeenCalled();
    expect(tx.feeRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a mismatched idempotency key before starting a transaction', async () => {
    const prisma = { $transaction: jest.fn() } as any;
    const provider = new PrismaAcademicIdentityProvider(prisma);

    await expect(provider.detachUserAcademicIdentity({
      userId: 'user-1',
      idempotencyKey: 'delete-user:another-user',
    })).rejects.toThrow('invalid idempotency key');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('PrismaAcademicIdentityProvider academic profile membership reads', () => {
  const originalOwner = process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER;
  afterEach(() => {
    if (originalOwner === undefined) delete process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER;
    else process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER = originalOwner;
  });

  it('defaults to legacy enrichment and keeps the existing profile shape', async () => {
    delete process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER;
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', departmentId: 'd1', department: { id: 'd1' } }]) }, $transaction: jest.fn() } as any;
    await expect(new PrismaAcademicIdentityProvider(prisma).attachAcademicProfiles([{ id: 'u1' }]))
      .resolves.toMatchObject([{ departmentId: 'd1', department: { id: 'd1' } }]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('checks batch membership parity before enriching profiles in plugin-read mode', async () => {
    process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER = 'plugin';
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ id: 'u1', departmentId: 'd1' }]).mockResolvedValueOnce([{ userId: 'u1', departmentId: 'd1' }]),
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', departmentId: 'd1', department: { id: 'd1' } }]) },
    };
    const prisma = { $transaction: jest.fn((work) => work(tx)), user: { findMany: jest.fn() } } as any;
    await expect(new PrismaAcademicIdentityProvider(prisma).attachAcademicProfiles([{ id: 'u1' }]))
      .resolves.toMatchObject([{ departmentId: 'd1' }]);
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('FOR SHARE');
    expect(tx.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('rejects divergence before profile query', async () => {
    process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER = 'plugin';
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ id: 'u1', departmentId: 'd1' }]).mockResolvedValueOnce([]),
      user: { findMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work) => work(tx)) } as any;
    await expect(new PrismaAcademicIdentityProvider(prisma).attachAcademicProfiles([{ id: 'u1' }]))
      .rejects.toThrow('mirror differs');
    expect(tx.user.findMany).not.toHaveBeenCalled();
  });
});

describe('PrismaAcademicIdentityProvider department assignment command', () => {
  const originalShadowSetting = process.env.ACADEMIC_DEPARTMENT_SHADOW_WRITE;
  afterEach(() => {
    if (originalShadowSetting === undefined) delete process.env.ACADEMIC_DEPARTMENT_SHADOW_WRITE;
    else process.env.ACADEMIC_DEPARTMENT_SHADOW_WRITE = originalShadowSetting;
  });
  it('validates the department and applies a repeat-safe assignment', async () => {
    const prisma = {
      department: { findUnique: jest.fn().mockResolvedValue({ id: 'department-1' }) },
      user: { update: jest.fn().mockResolvedValue({}) },
    } as any;
    const provider = new PrismaAcademicIdentityProvider(prisma);

    await provider.assignUserDepartment({
      userId: 'user-1',
      departmentId: 'department-1',
      idempotencyKey: 'assign-department:user-1:department-1',
    });

    expect(prisma.department.findUnique).toHaveBeenCalledWith({ where: { id: 'department-1' }, select: { id: true } });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { departmentId: 'department-1' } });
  });

  it('clears an assignment without querying a department', async () => {
    const prisma = {
      department: { findUnique: jest.fn() },
      user: { update: jest.fn().mockResolvedValue({}) },
    } as any;
    const provider = new PrismaAcademicIdentityProvider(prisma);

    await provider.assignUserDepartment({
      userId: 'user-1', departmentId: null, idempotencyKey: 'assign-department:user-1:none',
    });

    expect(prisma.department.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { departmentId: null } });
  });

  it('rejects missing departments and mismatched idempotency keys before assignment', async () => {
    const prisma = {
      department: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { update: jest.fn() },
    } as any;
    const provider = new PrismaAcademicIdentityProvider(prisma);

    await expect(provider.assignUserDepartment({
      userId: 'user-1', departmentId: 'department-1', idempotencyKey: 'wrong',
    })).rejects.toThrow('invalid idempotency key');
    await expect(provider.assignUserDepartment({
      userId: 'user-1', departmentId: 'department-1', idempotencyKey: 'assign-department:user-1:department-1',
    })).rejects.toThrow('Department not found');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('atomically updates both memberships only when their prior values match', async () => {
    process.env.ACADEMIC_DEPARTMENT_SHADOW_WRITE = 'true';
    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{ departmentId: 'old-department' }])
        .mockResolvedValueOnce([{ departmentId: 'old-department' }])
        .mockResolvedValueOnce([{ id: 'new-department' }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      department: { findUnique: jest.fn().mockResolvedValue({ id: 'new-department' }) },
      user: { update: jest.fn().mockResolvedValue({}) },
    } as any;
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) } as any;
    await new PrismaAcademicIdentityProvider(prisma).assignUserDepartment({
      userId: 'user-1', departmentId: 'new-department',
      idempotencyKey: 'assign-department:user-1:new-department',
    });

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { departmentId: 'new-department' } });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), 'user-1', 'new-department');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('fails before either shadow write when memberships differ', async () => {
    process.env.ACADEMIC_DEPARTMENT_SHADOW_WRITE = 'true';
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ departmentId: 'old-department' }]).mockResolvedValueOnce([{ departmentId: 'different-department' }]),
      $executeRawUnsafe: jest.fn(),
      department: { findUnique: jest.fn() },
      user: { update: jest.fn() },
    } as any;
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) } as any;

    await expect(new PrismaAcademicIdentityProvider(prisma).assignUserDepartment({
      userId: 'user-1', departmentId: 'new-department',
      idempotencyKey: 'assign-department:user-1:new-department',
    })).rejects.toThrow('mirror differs from legacy');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('atomically clears both stores and rejects invalid shadow configuration', async () => {
    process.env.ACADEMIC_DEPARTMENT_SHADOW_WRITE = 'true';
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ departmentId: 'department-1' }]).mockResolvedValueOnce([{ departmentId: 'department-1' }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      department: { findUnique: jest.fn() },
      user: { update: jest.fn().mockResolvedValue({}) },
    } as any;
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) } as any;
    const provider = new PrismaAcademicIdentityProvider(prisma);
    await provider.assignUserDepartment({ userId: 'user-1', departmentId: null, idempotencyKey: 'assign-department:user-1:none' });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { departmentId: null } });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM'), 'user-1');
    expect(tx.department.findUnique).not.toHaveBeenCalled();

    process.env.ACADEMIC_DEPARTMENT_SHADOW_WRITE = 'enabled';
    await expect(provider.assignUserDepartment({ userId: 'user-1', departmentId: null, idempotencyKey: 'assign-department:user-1:none' }))
      .rejects.toThrow('must be true or false');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('PrismaAcademicIdentityProvider parent assignment command', () => {
  function prismaFixture(parent: any = { id: 'parent-1', role: 'PARENT' }) {
    return {
      student: {
        findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findUnique: jest.fn().mockResolvedValue(parent) },
    } as any;
  }

  it('validates and assigns a parent with a deterministic command key', async () => {
    const prisma = prismaFixture();
    const provider = new PrismaAcademicIdentityProvider(prisma);

    await provider.assignStudentParent({
      studentUserId: 'student-user-1',
      parentId: 'parent-1',
      idempotencyKey: 'assign-parent:student-user-1:parent-1',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'parent-1' }, select: { id: true, role: true } });
    expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: 'student-1' }, data: { parentId: 'parent-1' } });
  });

  it('clears the parent without querying a replacement parent', async () => {
    const prisma = prismaFixture();
    const provider = new PrismaAcademicIdentityProvider(prisma);

    await provider.assignStudentParent({
      studentUserId: 'student-user-1', parentId: null,
      idempotencyKey: 'assign-parent:student-user-1:none',
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: 'student-1' }, data: { parentId: null } });
  });

  it('rejects a bad key, a missing student, and a non-parent account before mutation', async () => {
    const badKeyPrisma = prismaFixture();
    const badKeyProvider = new PrismaAcademicIdentityProvider(badKeyPrisma);
    await expect(badKeyProvider.assignStudentParent({
      studentUserId: 'student-user-1', parentId: 'parent-1', idempotencyKey: 'wrong',
    })).rejects.toThrow('invalid idempotency key');
    expect(badKeyPrisma.student.findUnique).not.toHaveBeenCalled();

    const missingStudentPrisma = prismaFixture();
    missingStudentPrisma.student.findUnique.mockResolvedValue(null);
    await expect(new PrismaAcademicIdentityProvider(missingStudentPrisma).assignStudentParent({
      studentUserId: 'student-user-1', parentId: 'parent-1',
      idempotencyKey: 'assign-parent:student-user-1:parent-1',
    })).rejects.toThrow('Student profile not found');

    const wrongRolePrisma = prismaFixture({ id: 'teacher-1', role: 'TEACHER' });
    await expect(new PrismaAcademicIdentityProvider(wrongRolePrisma).assignStudentParent({
      studentUserId: 'student-user-1', parentId: 'teacher-1',
      idempotencyKey: 'assign-parent:student-user-1:teacher-1',
    })).rejects.toThrow('role PARENT');
    expect(wrongRolePrisma.student.update).not.toHaveBeenCalled();
  });
});
