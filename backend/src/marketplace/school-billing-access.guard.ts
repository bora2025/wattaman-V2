import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

// A suspended school must still be able to authenticate, sign out, and reach the one recovery
// surface that explains the debt. Blocking /auth made an expired administrator session
// unrecoverable: the person who could resolve the bill could no longer sign in.
const ALLOWED_WHILE_SUSPENDED = ['/health', '/health/ready', '/version', '/auth', '/admin/marketplace/billing-control'];

@Injectable()
export class SchoolBillingAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ path?: string; url?: string }>();
    const path = request.path || request.url?.split('?')[0] || '';
    if (ALLOWED_WHILE_SUSPENDED.some(allowed => path === allowed || path.startsWith(`${allowed}/`))) return true;
    const state = await this.prisma.marketplaceSchoolControl.findUnique({ where: { id: 'singleton' }, select: { access: true, reason: true } });
    if (state?.access === 'SUSPENDED') throw new HttpException({ code: 'SCHOOL_BILLING_SUSPENDED', message: state.reason || 'School access is suspended because a platform invoice is unpaid' }, HttpStatus.PAYMENT_REQUIRED);
    return true;
  }
}
