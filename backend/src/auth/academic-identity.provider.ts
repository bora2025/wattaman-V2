import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AcademicIdentityProvider } from './academic-identity.contract';

@Injectable()
export class PrismaAcademicIdentityProvider implements AcademicIdentityProvider {
  constructor(private readonly prisma: PrismaService) {}

  async attachAcademicProfiles(users: Array<Record<string, any>>): Promise<Array<Record<string, any>>> {
    if (!users.length) return users;
    const ids = users.map((user) => user.id);
    const owner = process.env.ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER ?? 'legacy';
    if (owner !== 'legacy' && owner !== 'plugin') {
      throw new Error('ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER must be legacy or plugin');
    }
    const query = {
      where: { id: { in: ids } },
      select: {
        id: true,
        departmentId: true,
        department: { select: { id: true, name: true, nameKh: true } },
        studentProfile: {
          select: {
            id: true,
            studentNumber: true,
            sex: true,
            photo: true,
            dateOfBirth: true,
            address: true,
            parentId: true,
            class: { select: { id: true, name: true } },
            parent: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        parentStudents: {
          select: {
            id: true,
            user: { select: { name: true } },
          },
        },
      },
    } as const;
    const enriched = owner === 'plugin'
      ? await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRawUnsafe<Array<{ id: string; departmentId: string | null }>>(
          'SELECT "id", "departmentId" FROM "User" WHERE "id" = ANY($1::text[]) FOR SHARE', ids,
        );
        const mirrored = await tx.$queryRawUnsafe<Array<{ userId: string; departmentId: string }>>(
          'SELECT "userId", "departmentId" FROM "plugin_wattanam_academic_management_user_department" WHERE "userId" = ANY($1::text[])', ids,
        );
        const byUser = new Map(mirrored.map((row) => [row.userId, row.departmentId]));
        for (const row of locked) {
          if ((row.departmentId ?? null) !== (byUser.get(row.id) ?? null)) {
            throw new Error('Academic department membership mirror differs from legacy; profile lookup rejected');
          }
        }
        return tx.user.findMany(query);
      })
      : await this.prisma.user.findMany(query);
    const byId = new Map(enriched.map((row) => [row.id, row]));
    return users.map((user) => {
      const academic = byId.get(user.id);
      return {
        ...user,
        departmentId: academic?.departmentId ?? null,
        department: academic?.department ?? null,
        studentProfile: academic?.studentProfile ?? null,
        parentStudents: academic?.parentStudents ?? [],
      };
    });
  }

  async assignStudentParent(input: { studentUserId: string; parentId: string | null; idempotencyKey: string }): Promise<void> {
    const expectedKey = `assign-parent:${input.studentUserId}:${input.parentId ?? 'none'}`;
    if (input.idempotencyKey !== expectedKey) {
      throw new Error('Academic parent assignment command has an invalid idempotency key');
    }
    const student = await this.prisma.student.findUnique({ where: { userId: input.studentUserId } });
    if (!student) throw new Error('Student profile not found for this user');

    if (input.parentId) {
      const parent = await this.prisma.user.findUnique({
        where: { id: input.parentId },
        select: { id: true, role: true },
      });
      if (!parent || parent.role !== 'PARENT') {
        throw new Error('parentId must reference a user with role PARENT');
      }
    }

    await this.prisma.student.update({
      where: { id: student.id },
      data: { parentId: input.parentId },
    });
  }

  async assignUserDepartment(input: { userId: string; departmentId: string | null; idempotencyKey: string }): Promise<void> {
    const expectedKey = `assign-department:${input.userId}:${input.departmentId ?? 'none'}`;
    if (input.idempotencyKey !== expectedKey) {
      throw new Error('Academic department assignment command has an invalid idempotency key');
    }
    const shadowSetting = process.env.ACADEMIC_DEPARTMENT_SHADOW_WRITE;
    if (shadowSetting !== undefined && shadowSetting !== 'true' && shadowSetting !== 'false') {
      throw new Error('ACADEMIC_DEPARTMENT_SHADOW_WRITE must be true or false');
    }
    if (shadowSetting === 'true') {
      await this.assignDepartmentWithShadow(input);
      return;
    }
    if (input.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: input.departmentId },
        select: { id: true },
      });
      if (!department) throw new Error('Department not found');
    }
    await this.prisma.user.update({
      where: { id: input.userId },
      data: { departmentId: input.departmentId },
    });
  }

  private async assignDepartmentWithShadow(input: { userId: string; departmentId: string | null }): Promise<void> {
    const membershipTable = 'plugin_wattanam_academic_management_user_department';
    const departmentTable = 'plugin_wattanam_academic_management_department';
    await this.prisma.$transaction(async (tx) => {
      const legacy = await tx.$queryRawUnsafe<Array<{ departmentId: string | null }>>(
        'SELECT "departmentId" FROM "User" WHERE "id" = $1 FOR UPDATE', input.userId,
      );
      if (!legacy[0]) throw new Error('User not found');
      const mirror = await tx.$queryRawUnsafe<Array<{ departmentId: string }>>(
        `SELECT "departmentId" FROM "${membershipTable}" WHERE "userId" = $1 FOR UPDATE`, input.userId,
      );
      if ((legacy[0].departmentId ?? null) !== (mirror[0]?.departmentId ?? null)) {
        throw new Error('Academic department membership mirror differs from legacy; no assignment was written');
      }
      if (input.departmentId) {
        const source = await tx.department.findUnique({ where: { id: input.departmentId }, select: { id: true } });
        const target = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "${departmentTable}" WHERE "id" = $1`, input.departmentId,
        );
        if (!source || !target[0]) throw new Error('Department is not present in both academic stores');
      }
      await tx.user.update({ where: { id: input.userId }, data: { departmentId: input.departmentId } });
      if (input.departmentId) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "${membershipTable}" ("userId","departmentId") VALUES ($1,$2) ON CONFLICT ("userId") DO UPDATE SET "departmentId" = EXCLUDED."departmentId", "updatedAt" = CURRENT_TIMESTAMP`,
          input.userId, input.departmentId,
        );
      } else {
        await tx.$executeRawUnsafe(`DELETE FROM "${membershipTable}" WHERE "userId" = $1`, input.userId);
      }
    });
  }

  async detachUserAcademicIdentity(input: { userId: string; idempotencyKey: string }): Promise<void> {
    if (input.idempotencyKey !== `delete-user:${input.userId}`) {
      throw new Error('Academic identity detach command has an invalid idempotency key');
    }

    await this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({ where: { userId: input.userId } });

      await tx.class.updateMany({ where: { teacherId: input.userId }, data: { teacherId: null } });

      if (student) {
        await tx.attendance.deleteMany({ where: { studentId: student.id } });
        await tx.feeRecord.deleteMany({ where: { studentId: student.id } });
        await tx.student.delete({ where: { id: student.id } });
      }

      await tx.student.updateMany({ where: { parentId: input.userId }, data: { parentId: null } });
    });
  }
}
