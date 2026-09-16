import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AcademicDirectoryProvider } from './directory.service';
import { ACADEMIC_ROSTER_CONTRACT_ID, ACADEMIC_ROSTER_CONTRACT_VERSION, AcademicClassRoster, AcademicEnrollment, currentAcademicDate } from './academic-roster.contract';

type CoreUser = { id: string; email: string | null; phone: string | null; role: string };

@Injectable()
export class PrismaAcademicDirectoryProvider implements AcademicDirectoryProvider {
  constructor(private readonly prisma: PrismaService) {}

  async resolveClassAudience(classId: string): Promise<CoreUser[]> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        teacher: { select: { id: true, email: true, phone: true, role: true } },
        students: {
          include: {
            user: { select: { id: true, email: true, phone: true, role: true } },
            parent: { select: { id: true, email: true, phone: true, role: true } },
          },
        },
      },
    });
    if (!cls) return [];
    const byId = new Map<string, CoreUser>();
    if (cls.teacher) byId.set(cls.teacher.id, cls.teacher);
    for (const student of cls.students) {
      byId.set(student.user.id, student.user);
      if (student.parent) byId.set(student.parent.id, student.parent);
    }
    return [...byId.values()];
  }

  async resolveClassesForUser(userId: string, role: string): Promise<string[]> {
    const teacherClassIds = (await this.prisma.class.findMany({ where: { teacherId: userId }, select: { id: true } })).map((item) => item.id);
    const classAdminIds = role === 'CLASS_ADMIN'
      ? (await this.prisma.class.findMany({ where: { classAdminId: userId }, select: { id: true } })).map((item) => item.id)
      : [];
    let studentClassIds: string[] = [];
    if (role === 'STUDENT') {
      const record = await this.prisma.student.findUnique({ where: { userId }, select: { classId: true } });
      if (record?.classId) studentClassIds.push(record.classId);
    } else if (role === 'PARENT') {
      const kids = await this.prisma.student.findMany({ where: { parentId: userId }, select: { classId: true } });
      studentClassIds = kids.map((kid) => kid.classId).filter((id): id is string => !!id);
    }
    return [...new Set([...teacherClassIds, ...classAdminIds, ...studentClassIds])];
  }

  async lookupClasses(ids: string[]): Promise<Array<{ id: string; name: string }>> {
    if (!ids.length) return [];
    return this.prisma.class.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  }

  async getClassRoster(classId: string, asOfIsoDate: string): Promise<AcademicClassRoster> {
    const owner = this.rosterReadOwner();
    const date = currentAcademicDate(asOfIsoDate);
    if (owner === 'plugin') return this.getPluginClassRoster(classId, date);
    await this.assertCurrentAcademicDate(date);
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true, name: true,
        students: { orderBy: { id: 'asc' }, select: {
          id: true, userId: true, studentNumber: true, parentId: true,
          user: { select: { name: true } },
        } },
      },
    });
    return {
      contract: { id: ACADEMIC_ROSTER_CONTRACT_ID, version: ACADEMIC_ROSTER_CONTRACT_VERSION },
      classId, className: cls?.name ?? null, asOfIsoDate: date, source: 'legacy-current-membership',
      students: (cls?.students ?? []).map((student) => ({
        studentId: student.id, userId: student.userId, studentNumber: student.studentNumber,
        name: student.user.name, parentId: student.parentId,
      })),
    };
  }

  async getEnrollmentAtDate(studentId: string, asOfIsoDate: string): Promise<AcademicEnrollment> {
    const owner = this.rosterReadOwner();
    const date = currentAcademicDate(asOfIsoDate);
    if (owner === 'plugin') return this.getPluginEnrollment(studentId, date);
    await this.assertCurrentAcademicDate(date);
    const student = await this.prisma.student.findUnique({
      where: { id: studentId }, select: { id: true, classId: true, class: { select: { name: true } } },
    });
    return {
      contract: { id: ACADEMIC_ROSTER_CONTRACT_ID, version: ACADEMIC_ROSTER_CONTRACT_VERSION },
      studentId, classId: student?.classId ?? null, className: student?.class?.name ?? null,
      enrolled: Boolean(student?.classId), asOfIsoDate: date, source: 'legacy-current-membership' as const,
    };
  }

  private async getPluginClassRoster(classId: string, date: string): Promise<AcademicClassRoster> {
    const today = await this.schoolToday();
    return this.prisma.$transaction(async (tx) => {
      const intervals = await tx.$queryRawUnsafe<Array<{ studentId: string }>>(
        'SELECT "studentId" FROM "plugin_wattanam_academic_management_enrollment_interval" WHERE "classId" = $1 AND "validFrom" <= $2::date AND ("validTo" IS NULL OR "validTo" >= $2::date) ORDER BY "studentId"',
        classId, date,
      );
      const ids = intervals.map((row) => row.studentId);
      if (new Set(ids).size !== ids.length) throw new Error('Overlapping Academic Management enrollment intervals detected');
      const [cls, profiles] = await Promise.all([
        tx.class.findUnique({ where: { id: classId }, select: { name: true } }),
        ids.length ? tx.student.findMany({ where: { id: { in: ids } }, select: {
          id: true, userId: true, studentNumber: true, parentId: true, classId: true,
          user: { select: { name: true } },
        } }) : Promise.resolve([]),
      ]);
      if (profiles.length !== ids.length) throw new Error('Academic enrollment interval references a missing student profile');
      if (date === today) {
        const legacy = await tx.student.findMany({ where: { classId }, select: { id: true }, orderBy: { id: 'asc' } });
        if (legacy.map((row) => row.id).join('\0') !== [...ids].sort().join('\0')) {
          throw new Error('Academic enrollment interval mirror differs from legacy; roster lookup rejected');
        }
      }
      const byId = new Map(profiles.map((student) => [student.id, student]));
      return {
        contract: { id: ACADEMIC_ROSTER_CONTRACT_ID, version: ACADEMIC_ROSTER_CONTRACT_VERSION },
        classId, className: cls?.name ?? null, asOfIsoDate: date, source: 'plugin-enrollment-interval',
        students: ids.map((id) => byId.get(id)!).map((student) => ({
          studentId: student.id, userId: student.userId, studentNumber: student.studentNumber,
          name: student.user.name, parentId: student.parentId,
        })),
      };
    }, { isolationLevel: 'RepeatableRead' });
  }

  private async getPluginEnrollment(studentId: string, date: string): Promise<AcademicEnrollment> {
    const today = await this.schoolToday();
    return this.prisma.$transaction(async (tx) => {
      const intervals = await tx.$queryRawUnsafe<Array<{ classId: string }>>(
        'SELECT "classId" FROM "plugin_wattanam_academic_management_enrollment_interval" WHERE "studentId" = $1 AND "validFrom" <= $2::date AND ("validTo" IS NULL OR "validTo" >= $2::date) ORDER BY "validFrom" DESC',
        studentId, date,
      );
      if (intervals.length > 1) throw new Error('Overlapping Academic Management enrollment intervals detected');
      const student = await tx.student.findUnique({ where: { id: studentId }, select: { id: true, classId: true } });
      const classId = intervals[0]?.classId ?? null;
      if (date === today && (student?.classId ?? null) !== classId) {
        throw new Error('Academic enrollment interval mirror differs from legacy; enrollment lookup rejected');
      }
      const cls = classId ? await tx.class.findUnique({ where: { id: classId }, select: { name: true } }) : null;
      return {
        contract: { id: ACADEMIC_ROSTER_CONTRACT_ID, version: ACADEMIC_ROSTER_CONTRACT_VERSION },
        studentId, classId, className: cls?.name ?? null, enrolled: Boolean(classId),
        asOfIsoDate: date, source: 'plugin-enrollment-interval',
      };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async departmentForUser(userId: string): Promise<string | null> {
    const owner = process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER ?? 'legacy';
    if (owner !== 'legacy' && owner !== 'plugin') {
      throw new Error('ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER must be legacy or plugin');
    }
    if (owner === 'plugin') {
      return this.prisma.$transaction(async (tx) => {
        const source = await tx.$queryRawUnsafe<Array<{ departmentId: string | null }>>(
          'SELECT "departmentId" FROM "User" WHERE "id" = $1 FOR SHARE', userId,
        );
        if (!source[0]) return null;
        const target = await tx.$queryRawUnsafe<Array<{ departmentId: string }>>(
          'SELECT "departmentId" FROM "plugin_wattanam_academic_management_user_department" WHERE "userId" = $1', userId,
        );
        const sourceId = source[0].departmentId ?? null;
        const targetId = target[0]?.departmentId ?? null;
        if (sourceId !== targetId) {
          throw new Error('Academic department membership mirror differs from legacy; lookup rejected');
        }
        return targetId;
      });
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    return user?.departmentId ?? null;
  }

  private async assertCurrentAcademicDate(value: string): Promise<string> {
    const date = currentAcademicDate(value);
    const today = await this.schoolToday();
    if (date !== today) {
      throw new Error('Historical enrollment lookup is unavailable until Academic Management stores enrollment intervals');
    }
    return date;
  }

  private rosterReadOwner(): 'legacy' | 'plugin' {
    const owner = process.env.ACADEMIC_ROSTER_READ_OWNER ?? 'legacy';
    if (owner !== 'legacy' && owner !== 'plugin') throw new Error('ACADEMIC_ROSTER_READ_OWNER must be legacy or plugin');
    return owner;
  }

  private async schoolToday(): Promise<string> {
    const installation = await this.prisma.installation.findUnique({ where: { id: 'singleton' }, select: { timezone: true } });
    if (!installation) throw new Error('Installation timezone is unavailable');
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: installation.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
}
