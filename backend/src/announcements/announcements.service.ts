import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { MessagesGateway } from '../parent/messages.gateway';

export type AnnouncementAudience = 'SCHOOL' | 'ROLE' | 'CLASS';
export type AnnouncementChannel = 'IN_APP' | 'EMAIL' | 'SMS';

export interface CreateAnnouncementDto {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  targetRole?: 'PARENT' | 'TEACHER' | 'STUDENT' | 'ALL';
  classId?: string;
  channels?: AnnouncementChannel[];
  pinned?: boolean;
  scheduledAt?: string;
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
    private gateway: MessagesGateway,
  ) {}

  /** Admin: list all announcements with author + read stats. */
  async listAll() {
    const items = await this.prisma.announcement.findMany({
      include: {
        author: { select: { id: true, name: true, role: true } },
        class: { select: { id: true, name: true } },
        _count: { select: { reads: true } },
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
    return items;
  }

  /** Per-user feed: announcements relevant to this user, with read state. */
  async listForUser(userId: string, take = 100, skip = 0) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Class scope: classes where user is teacher, student, or parent-of-student
    const teacherClassIds = (
      await this.prisma.class.findMany({ where: { teacherId: userId }, select: { id: true } })
    ).map((c) => c.id);

    let studentClassIds: string[] = [];
    if (user.role === 'STUDENT') {
      const sp = await this.prisma.student.findUnique({
        where: { userId },
        select: { classId: true },
      });
      if (sp?.classId) studentClassIds.push(sp.classId);
    } else if (user.role === 'PARENT') {
      const kids = await this.prisma.student.findMany({
        where: { parentId: userId },
        select: { classId: true },
      });
      studentClassIds = kids.map((k) => k.classId).filter((v): v is string => !!v);
    }

    const classIds = Array.from(new Set([...teacherClassIds, ...studentClassIds]));

    const items = await this.prisma.announcement.findMany({
      where: {
        sentAt: { not: null },
        OR: [
          { audience: 'SCHOOL' },
          { audience: 'ROLE', targetRole: 'ALL' },
          { audience: 'ROLE', targetRole: user.role },
          ...(classIds.length ? [{ audience: 'CLASS', classId: { in: classIds } }] : []),
        ],
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        class: { select: { id: true, name: true } },
        reads: { where: { userId }, select: { id: true, readAt: true } },
      },
      orderBy: [{ pinned: 'desc' }, { sentAt: 'desc' }],
      take: Math.min(Math.max(take, 1), 100),
      skip: Math.max(skip, 0),
    });

    return items.map((a) => ({
      ...a,
      read: a.reads.length > 0,
      readAt: a.reads[0]?.readAt ?? null,
      reads: undefined,
    }));
  }

  /**
   * Efficient unread count: counts relevant announcements that have no read
   * record for this user. Avoids fetching the entire feed.
   */
  async unreadCount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { count: 0 };

    const teacherClassIds = (
      await this.prisma.class.findMany({ where: { teacherId: userId }, select: { id: true } })
    ).map((c) => c.id);

    let studentClassIds: string[] = [];
    if (user.role === 'STUDENT') {
      const sp = await this.prisma.student.findUnique({
        where: { userId },
        select: { classId: true },
      });
      if (sp?.classId) studentClassIds.push(sp.classId);
    } else if (user.role === 'PARENT') {
      const kids = await this.prisma.student.findMany({
        where: { parentId: userId },
        select: { classId: true },
      });
      studentClassIds = kids.map((k) => k.classId).filter((v): v is string => !!v);
    }
    const classIds = Array.from(new Set([...teacherClassIds, ...studentClassIds]));

    const count = await this.prisma.announcement.count({
      where: {
        sentAt: { not: null },
        OR: [
          { audience: 'SCHOOL' },
          { audience: 'ROLE', targetRole: 'ALL' },
          { audience: 'ROLE', targetRole: user.role },
          ...(classIds.length ? [{ audience: 'CLASS', classId: { in: classIds } }] : []),
        ],
        reads: { none: { userId } },
      },
    });
    return { count };
  }

  async markRead(announcementId: string, userId: string) {
    await this.prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId },
      update: {},
    });
    return { ok: true };
  }

  async create(authorId: string, dto: CreateAnnouncementDto) {
    if (!dto.title?.trim() || !dto.body?.trim()) {
      throw new BadRequestException('Title and body required');
    }
    if (dto.audience === 'CLASS' && !dto.classId) {
      throw new BadRequestException('classId required for CLASS audience');
    }
    if (dto.audience === 'ROLE' && !dto.targetRole) {
      throw new BadRequestException('targetRole required for ROLE audience');
    }

    const channels = (dto.channels && dto.channels.length ? dto.channels : ['IN_APP']).join(',');
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const shouldSendNow = !scheduledAt || scheduledAt <= new Date();

    const a = await this.prisma.announcement.create({
      data: {
        authorId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        audience: dto.audience,
        targetRole: dto.targetRole ?? null,
        classId: dto.classId ?? null,
        channels,
        pinned: dto.pinned ?? false,
        scheduledAt,
        sentAt: shouldSendNow ? new Date() : null,
      },
    });

    if (shouldSendNow) {
      // Fire-and-forget multi-channel dispatch.
      this.dispatch(a.id).catch((err) =>
        console.error('Announcement dispatch failed:', err?.message || err),
      );
    }

    return a;
  }

  async remove(id: string) {
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }

  /** Resolve recipients then send via configured channels. */
  private async dispatch(announcementId: string) {
    const a = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      include: { author: { select: { name: true } } },
    });
    if (!a) return;

    const recipients = await this.resolveRecipients(a);
    const channels = a.channels.split(',').map((c) => c.trim());

    // Preload preferences for all recipients (single query).
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: recipients.map((r) => r.id) } },
    });
    const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
    const isAllowed = (userId: string, channel: 'IN_APP' | 'EMAIL' | 'SMS') => {
      const p = prefByUser.get(userId);
      if (!p) return true; // default: opted in
      if (!p.announcementsEnabled) return false;
      if (channel === 'IN_APP') return p.inAppEnabled;
      if (channel === 'EMAIL') return p.emailEnabled;
      if (channel === 'SMS') return p.smsEnabled;
      return true;
    };

    for (const user of recipients) {
      // IN_APP always logs a Notification row so unread badges work.
      if (channels.includes('IN_APP') && isAllowed(user.id, 'IN_APP')) {
        await this.prisma.notification.create({
          data: {
            userId: user.id,
            message: `${a.title}: ${a.body}`,
            type: 'announcement',
          },
        });
        try { this.gateway.notifyAnnouncement(user.id, { id: a.id, title: a.title }); } catch {}
      }
      if (channels.includes('EMAIL') && user.email && isAllowed(user.id, 'EMAIL')) {
        await this.notifications
          .sendEmail(user.email, a.title, a.body)
          .catch((e) => console.error('email fail', e?.message || e));
      }
      if (channels.includes('SMS') && user.phone && isAllowed(user.id, 'SMS')) {
        await this.notifications
          .sendSms(user.phone, `${a.title}: ${a.body}`)
          .catch((e) => console.error('sms fail', e?.message || e));
      }
    }
  }

  private async resolveRecipients(a: {
    audience: string;
    targetRole: string | null;
    classId: string | null;
  }) {
    if (a.audience === 'SCHOOL') {
      return this.prisma.user.findMany({
        select: { id: true, email: true, phone: true, role: true },
      });
    }
    if (a.audience === 'ROLE') {
      if (a.targetRole === 'ALL') {
        return this.prisma.user.findMany({
          select: { id: true, email: true, phone: true, role: true },
        });
      }
      return this.prisma.user.findMany({
        where: { role: a.targetRole ?? '' },
        select: { id: true, email: true, phone: true, role: true },
      });
    }
    if (a.audience === 'CLASS' && a.classId) {
      const cls = await this.prisma.class.findUnique({
        where: { id: a.classId },
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
      const set = new Map<string, { id: string; email: string | null; phone: string | null; role: string }>();
      if (cls.teacher) set.set(cls.teacher.id, cls.teacher);
      for (const s of cls.students) {
        set.set(s.user.id, s.user);
        if (s.parent) set.set(s.parent.id, s.parent);
      }
      return Array.from(set.values());
    }
    return [];
  }
}
