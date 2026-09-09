import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { InstallationKeyService } from './installation-key.service';
import { readMarketplaceIdentityConfig } from './marketplace-identity-config';

type Warning = { invoiceId: string; invoiceNumber: string; currency: string; outstandingMinor: number; dueAt: string; suspendAt: string; final: boolean };

@Injectable()
export class SchoolBillingControlService {
  private readonly logger = new Logger(SchoolBillingControlService.name);
  constructor(private readonly prisma: PrismaService, private readonly keys: InstallationKeyService) {}

  @Cron('0 * * * *')
  async sync(now = new Date()) {
    const config = readMarketplaceIdentityConfig();
    if (!config) return { configured: false };
    const installation = await this.prisma.installation.findUnique({ where: { id: 'singleton' }, select: { installationId: true } });
    if (!installation) return { configured: true, installed: false };
    const ts = String(Math.floor(now.getTime() / 1000));
    const signature = await this.keys.sign({ installationId: installation.installationId, ts });
    const url = new URL(`/v1/installations/${installation.installationId}/school-control`, config.marketplaceUrl);
    url.searchParams.set('ts', ts); url.searchParams.set('signature', signature);
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(config.requestTimeoutMs), headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`Marketplace responded with ${response.status}`);
      const body = await response.json() as { access?: string; reason?: string | null; warnings?: Warning[] };
      if (!['ACTIVE', 'SUSPENDED'].includes(String(body.access)) || !Array.isArray(body.warnings)) throw new Error('Marketplace returned invalid school control state');
      await this.prisma.$transaction(async (tx) => {
        const previous = await tx.marketplaceSchoolControl.findUnique({ where: { id: 'singleton' } });
        await tx.marketplaceSchoolControl.upsert({
          where: { id: 'singleton' },
          create: { id: 'singleton', access: body.access!, reason: body.reason || null, warningsJson: JSON.stringify(body.warnings), lastVerifiedAt: now, lastAttemptAt: now },
          update: { access: body.access!, reason: body.reason || null, warningsJson: JSON.stringify(body.warnings), lastVerifiedAt: now, lastAttemptAt: now, lastError: null },
        });
        const admins = await tx.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } }, select: { id: true } });
        const previousWarnings = new Set<string>(previous ? safeWarnings(previous.warningsJson).map(item => item.invoiceId) : []);
        for (const warning of body.warnings) {
          if (previousWarnings.has(warning.invoiceId)) continue;
          await tx.notification.createMany({ data: admins.map(admin => ({
            userId: admin.id, type: 'platform_billing_final_notice',
            message: `FINAL BILLING NOTICE: invoice ${warning.invoiceNumber} has ${warning.outstandingMinor / 100} ${warning.currency} outstanding. Pay before ${new Date(warning.suspendAt).toLocaleString()} to prevent school suspension.`,
          })) });
        }
        if (previous?.access !== 'SUSPENDED' && body.access === 'SUSPENDED') {
          await tx.notification.createMany({ data: admins.map(admin => ({ userId: admin.id, type: 'platform_billing_suspended', message: `School access is suspended: ${body.reason || 'platform invoice unpaid'}.` })) });
        }
        if (previous?.access === 'SUSPENDED' && body.access === 'ACTIVE') {
          await tx.notification.createMany({ data: admins.map(admin => ({ userId: admin.id, type: 'platform_billing_reactivated', message: 'School access has been automatically reactivated after billing clearance.' })) });
        }
      });
      return { configured: true, access: body.access, warnings: body.warnings.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.marketplaceSchoolControl.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', lastAttemptAt: now, lastError: message }, update: { lastAttemptAt: now, lastError: message } });
      this.logger.warn(`School billing control sync failed: ${message}`);
      return { configured: true, unavailable: true };
    }
  }

  status() { return this.prisma.marketplaceSchoolControl.findUnique({ where: { id: 'singleton' } }); }
}

function safeWarnings(value: string): Warning[] {
  try { const result = JSON.parse(value); return Array.isArray(result) ? result : []; } catch { return []; }
}
