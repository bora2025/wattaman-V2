import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StudyYearsService {
  constructor(private prisma: PrismaService) {}

  async getAll() {
    return this.prisma.studyYear.findMany({
      orderBy: { year: 'desc' },
      include: { _count: { select: { classes: true } } },
    });
  }

  async getCurrent() {
    return this.prisma.studyYear.findFirst({
      where: { isCurrent: true },
      include: { _count: { select: { classes: true } } },
    });
  }

  async create(data: { year: number; label?: string; startDate?: string; endDate?: string; schoolName?: string; logoUrl?: string }) {
    const existing = await this.prisma.studyYear.findUnique({ where: { year: data.year } });
    if (existing) {
      throw new BadRequestException(`Study year ${data.year} already exists`);
    }

    return this.prisma.studyYear.create({
      data: {
        year: data.year,
        label: data.label || `${data.year}-${data.year + 1}`,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        schoolName: data.schoolName || undefined,
        logoUrl: data.logoUrl || undefined,
      },
      include: { _count: { select: { classes: true } } },
    });
  }

  async update(id: string, data: { year?: number; label?: string; startDate?: string; endDate?: string; schoolName?: string; logoUrl?: string | null }) {
    if (data.year) {
      const existing = await this.prisma.studyYear.findFirst({
        where: { year: data.year, NOT: { id } },
      });
      if (existing) {
        throw new BadRequestException(`Study year ${data.year} already exists`);
      }
    }

    return this.prisma.studyYear.update({
      where: { id },
      data: {
        ...(data.year !== undefined && { year: data.year }),
        ...(data.label !== undefined && { label: data.label }),
        ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
        ...(data.schoolName !== undefined && { schoolName: data.schoolName }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      },
      include: { _count: { select: { classes: true } } },
    });
  }

  async setCurrent(id: string) {
    // Unset all current flags
    await this.prisma.studyYear.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });
    // Set the selected one as current
    return this.prisma.studyYear.update({
      where: { id },
      data: { isCurrent: true },
      include: { _count: { select: { classes: true } } },
    });
  }

  async delete(id: string) {
    const studyYear = await this.prisma.studyYear.findUnique({
      where: { id },
      include: { _count: { select: { classes: true } } },
    });
    if (studyYear && studyYear._count.classes > 0) {
      throw new BadRequestException('Cannot delete study year that has classes. Remove or reassign classes first.');
    }
    return this.prisma.studyYear.delete({ where: { id } });
  }
}
