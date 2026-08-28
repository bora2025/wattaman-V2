import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

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
 * Resolves "which core users should receive this" for a given audience
 * scope, without giving callers (including plugins, via the directory.read
 * capability) direct access to User/Class/Student/NotificationPreference
 * tables. This is the extracted, single-source-of-truth version of the
 * recipient-resolution logic that used to live only inside
 * AnnouncementsService.
 */
@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

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
