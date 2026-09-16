import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AcademicClassRoster, AcademicEnrollment } from './academic-roster.contract';

export interface DirectoryAudienceQuery {
  audience: 'SCHOOL' | 'ROLE' | 'CLASS';
  targetRole?: string;
  classId?: string;
}

export interface DirectoryRecipient {
  id: string;
  email: string | null;
  phone: string | null;
  role: string;
  channels: { inApp: boolean; email: boolean; sms: boolean };
}

type CoreUser = { id: string; email: string | null; phone: string | null; role: string };

/**
 * MP-2 boundary hook: once Academic Management is extracted, class audience
 * expansion must come from a versioned academic contract rather than direct
 * lean-core joins over class/student tables.
 */
export const ACADEMIC_DIRECTORY_PROVIDER = 'ACADEMIC_DIRECTORY_PROVIDER';
export interface AcademicDirectoryProvider {
  resolveClassAudience(classId: string): Promise<CoreUser[]>;
  resolveClassesForUser?(userId: string, role: string): Promise<string[]>;
  lookupClasses?(ids: string[]): Promise<Array<{ id: string; name: string }>>;
  departmentForUser?(userId: string): Promise<string | null>;
  getClassRoster?(classId: string, asOfIsoDate: string): Promise<AcademicClassRoster>;
  getEnrollmentAtDate?(studentId: string, asOfIsoDate: string): Promise<AcademicEnrollment>;
}

/**
 * Resolves "which core users should receive this" for a given audience
 * scope, without giving callers (including plugins, via the directory.read
 * capability) direct access to User/Class/Student/NotificationPreference
 * tables. This is the extracted, single-source-of-truth version of the
 * recipient-resolution logic that used to live only inside
 * AnnouncementsService.
 */
@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(ACADEMIC_DIRECTORY_PROVIDER)
    private readonly academic?: AcademicDirectoryProvider,
  ) {}

  async resolveAudience(input: DirectoryAudienceQuery): Promise<DirectoryRecipient[]> {
    const users = await this.resolveUsers(input);
    if (!users.length) return [];
    const preferences = await this.prisma.notificationPreference.findMany({ where: { userId: { in: users.map((user) => user.id) } } });
    const byUser = new Map(preferences.map((preference) => [preference.userId, preference]));
    return users.map((user) => {
      const preference = byUser.get(user.id);
      const enabled = preference ? preference.announcementsEnabled : true;
      return {
        id: user.id, email: user.email, phone: user.phone, role: user.role,
        channels: {
          inApp: enabled && (preference ? preference.inAppEnabled : true),
          email: enabled && (preference ? preference.emailEnabled : true),
          sms: enabled && (preference ? preference.smsEnabled : true),
        },
      };
    });
  }

  /** Names/roles for display -- resolved at read time so a later rename is reflected immediately, same as the live Prisma joins this replaces. */
  async lookupUsers(ids: string[]): Promise<Array<{ id: string; name: string; role: string }>> {
    if (!ids.length) return [];
    return this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, role: true } });
  }

  async lookupClasses(ids: string[]): Promise<Array<{ id: string; name: string }>> {
    if (!ids.length) return [];
    if (this.academic?.lookupClasses) return this.academic.lookupClasses(ids);
    return this.prisma.class.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  }

  /** The reverse of resolveAudience: which classes is this user a teacher, student, or parent-of-student in. */
  async classesForUser(userId: string, role: string): Promise<string[]> {
    if (this.academic?.resolveClassesForUser) return this.academic.resolveClassesForUser(userId, role);
    const teacherClassIds = (await this.prisma.class.findMany({ where: { teacherId: userId }, select: { id: true } })).map((c) => c.id);
    const classAdminIds = role === 'CLASS_ADMIN'
      ? (await this.prisma.class.findMany({ where: { classAdminId: userId }, select: { id: true } })).map((c) => c.id)
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

  async departmentForUser(userId: string): Promise<string | null> {
    if (!this.academic?.departmentForUser) {
      throw new Error('Academic directory provider does not support department membership');
    }
    return this.academic.departmentForUser(userId);
  }

  async getClassRoster(classId: string, asOfIsoDate: string): Promise<AcademicClassRoster> {
    if (!this.academic?.getClassRoster) throw new Error('Academic directory provider does not support roster contract v1');
    return this.academic.getClassRoster(classId, asOfIsoDate);
  }

  async getEnrollmentAtDate(studentId: string, asOfIsoDate: string): Promise<AcademicEnrollment> {
    if (!this.academic?.getEnrollmentAtDate) throw new Error('Academic directory provider does not support enrollment contract v1');
    return this.academic.getEnrollmentAtDate(studentId, asOfIsoDate);
  }

  private async resolveUsers(input: DirectoryAudienceQuery): Promise<CoreUser[]> {
    if (input.audience === 'SCHOOL') {
      return this.prisma.user.findMany({ select: { id: true, email: true, phone: true, role: true } });
    }
    if (input.audience === 'ROLE') {
      if (!input.targetRole) return [];
      if (input.targetRole === 'ALL') {
        return this.prisma.user.findMany({ select: { id: true, email: true, phone: true, role: true } });
      }
      return this.prisma.user.findMany({ where: { role: input.targetRole }, select: { id: true, email: true, phone: true, role: true } });
    }
    if (input.audience === 'CLASS' && input.classId) {
      if (this.academic) return this.academic.resolveClassAudience(input.classId);
      const cls = await this.prisma.class.findUnique({
        where: { id: input.classId },
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
    return [];
  }
}
