import { AuthService } from './auth.service';

describe('AuthService core distribution', () => {
  const originalEnvironment = process.env;
  beforeEach(() => { process.env = { ...originalEnvironment, WATTANAM_DISTRIBUTION: 'core' }; });
  afterEach(() => { process.env = originalEnvironment; });

  function service(prisma: any) { return new AuthService({} as any, prisma); }

  it('reads a user without selecting removed business relations', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'owner-1' });
    await service({ user: { findUnique } }).getUserById('owner-1');
    const select = findUnique.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('department');
    expect(select).not.toHaveProperty('studentProfile');
  });

  it('lists and updates users using only core User fields', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const update = jest.fn().mockResolvedValue({ id: 'admin-1' });
    const auth = service({ user: { findMany, update } });
    await auth.getUsers();
    await auth.updateUser('admin-1', { name: 'Admin', departmentId: 'legacy-department' });
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('department');
    expect(update.mock.calls[0][0].data).not.toHaveProperty('departmentId');
    expect(update.mock.calls[0][0].select).not.toHaveProperty('department');
  });

  it('deletes only core-owned dependent records', async () => {
    const operation = () => Promise.resolve({});
    const prisma = {
      notification: { deleteMany: jest.fn(operation) }, notificationPreference: { deleteMany: jest.fn(operation) },
      passwordResetToken: { deleteMany: jest.fn(operation) }, refreshToken: { deleteMany: jest.fn(operation) },
      user: { delete: jest.fn(operation) }, $transaction: jest.fn().mockResolvedValue([]),
    };
    await service(prisma).deleteUser('admin-1');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(Object.keys(prisma).sort()).toEqual(expect.arrayContaining(['notification', 'notificationPreference', 'passwordResetToken', 'refreshToken', 'user']));
  });

  it('fails closed before querying legacy schedules', async () => {
    await expect(service({}).getStudentSchedule('owner-1')).rejects.toThrow('requires a business plugin');
  });

  it('does not create a business-domain role before its plugin exists', async () => {
    await expect(service({}).register('teacher@example.com', 'password-1234', 'Teacher', 'TEACHER')).rejects.toThrow('install the owning business plugin');
  });
});
