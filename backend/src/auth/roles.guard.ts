import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Role hierarchy — a user with a "higher" role implicitly satisfies any
 * @Roles() check that requires one of the "lower" roles.
 *
 *   SUPER_ADMIN  ─┐
 *                 ├─ implicitly grants ADMIN, SCHOOL_ADMIN, WATTAMAN, WATTAMAN_REPORTER, CLASS_ADMIN
 *   SCHOOL_ADMIN ─┘     (and anything ADMIN can do)
 *
 *   ADMIN        ─── implicitly grants WATTAMAN, WATTAMAN_REPORTER, CLASS_ADMIN
 *
 *   WATTAMAN_REPORTER — read-only role; can view and print attendance reports
 *                       for staff and students. Cannot scan or edit attendance.
 *
 *   CLASS_ADMIN  — limited edit role; can manage classes, scoring, student
 *                  attendance, and timetable. Cannot access user/staff management.
 *
 * This avoids having to list every higher-tier role on every endpoint.
 */
const ROLE_INHERITS: Record<string, string[]> = {
  SUPER_ADMIN: ['ADMIN', 'SCHOOL_ADMIN', 'WATTAMAN', 'WATTAMAN_REPORTER', 'CLASS_ADMIN', 'ACCOUNTER'],
  SCHOOL_ADMIN: ['ADMIN', 'WATTAMAN', 'WATTAMAN_REPORTER', 'CLASS_ADMIN', 'ACCOUNTER'],
  ADMIN: ['WATTAMAN', 'WATTAMAN_REPORTER', 'CLASS_ADMIN', 'ACCOUNTER'],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No @Roles() decorator → allow all authenticated users
    }
    const { user } = context.switchToHttp().getRequest();
    const userRole: string | undefined = user?.role;
    if (!userRole) return false;

    // Direct match
    if (requiredRoles.includes(userRole)) return true;

    // Hierarchical match — does this user's role inherit any required role?
    const inherited = ROLE_INHERITS[userRole] || [];
    return inherited.some((r) => requiredRoles.includes(r));
  }
}
