import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async create(data: { name: string; nameKh?: string; description?: string }) {
    return this.prisma.department.create({ data });
  }

  async update(id: string, data: { name?: string; nameKh?: string; description?: string }) {
    return this.prisma.department.update({ where: { id }, data });
  }

  async delete(id: string) {
    // Unassign users from this department first
    await this.prisma.user.updateMany({
      where: { departmentId: id },
      data: { departmentId: null },
    });
    return this.prisma.department.delete({ where: { id } });
  }
}
