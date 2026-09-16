import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';

describe('AttendanceService class-admin directory boundary', () => {
  const gateway = { notifyAttendanceUpdate: jest.fn() } as any;
  const notificationService = { sendAbsenceNotification: jest.fn() } as any;
  const sessionConfigService = { getConfigs: jest.fn().mockResolvedValue([]) } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects recordAttendance when CLASS_ADMIN is not assigned to class via directory contract', async () => {
    const prisma = {
      student: { findFirst: jest.fn() },
      attendance: { findUnique: jest.fn(), upsert: jest.fn() },
    } as any;
    const directory = {
      classesForUser: jest.fn().mockResolvedValue(['class-allowed']),
    } as any;
    const service = new AttendanceService(prisma, gateway, notificationService, sessionConfigService, directory);

    await expect(
      service.recordAttendance('student-1', 'class-blocked', 'PRESENT', 'admin-1', 'CLASS_ADMIN'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(directory.classesForUser).toHaveBeenCalledWith('admin-1', 'CLASS_ADMIN');
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });

  it('allows recordAttendance for assigned CLASS_ADMIN and continues normal flow', async () => {
    const prisma = {
      student: { findFirst: jest.fn().mockResolvedValue(null) },
      attendance: { findUnique: jest.fn(), upsert: jest.fn() },
    } as any;
    const directory = {
      classesForUser: jest.fn().mockResolvedValue(['class-1']),
    } as any;
    const service = new AttendanceService(prisma, gateway, notificationService, sessionConfigService, directory);

    await expect(
      service.recordAttendance('student-1', 'class-1', 'PRESENT', 'admin-1', 'CLASS_ADMIN'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(directory.classesForUser).toHaveBeenCalledWith('admin-1', 'CLASS_ADMIN');
    expect(prisma.student.findFirst).toHaveBeenCalled();
  });

  it('rejects bulk attendance when CLASS_ADMIN is not assigned to class via directory contract', async () => {
    const prisma = {
      student: { findMany: jest.fn() },
      $transaction: jest.fn(),
    } as any;
    const directory = {
      classesForUser: jest.fn().mockResolvedValue(['class-allowed']),
    } as any;
    const service = new AttendanceService(prisma, gateway, notificationService, sessionConfigService, directory);

    await expect(
      service.recordBulkAttendance([{ studentId: 'student-1', status: 'PRESENT' }], 'class-blocked', 'admin-1', 'CLASS_ADMIN'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(directory.classesForUser).toHaveBeenCalledWith('admin-1', 'CLASS_ADMIN');
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });
});
