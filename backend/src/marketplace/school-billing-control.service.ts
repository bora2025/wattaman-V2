import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { InstallationKeyService } from './installation-key.service';
import { readMarketplaceIdentityConfig } from './marketplace-identity-config';

type Warning = { invoiceId: string; invoiceNumber: string; currency: string; outstandingMinor: number; dueAt: string; suspendAt: string; final: boolean };
type BillingNotification = { id: string; invoiceId?: string | null; type: string; subject?: string | null; message?: string | null; createdAt?: string };
type BillingSummary = { schoolName?: string; marketplaceUrl?: string; billingPlan?: unknown; outstandingMinor?: number; invoices?: unknown[]; notifications?: BillingNotification[] };

/** Shared by every notification this service raises, so one unread count covers the lot. */
const NOTIFICATION_TYPE_PREFIX = 'platform_billing_';

/** OVERDUE is absent deliberately — see the sync's comment where these are raised. */
const NOTIFIED_TYPES = new Set(['INVOICE_ISSUED', 'DUE_SOON', 'PAYMENT_RECEIVED']);

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
      const body = await response.json() as { access?: string; reason?: string | null; warnings?: Warning[]; billing?: BillingSummary };
      if (!['ACTIVE', 'SUSPENDED'].includes(String(body.access)) || !Array.isArray(body.warnings)) throw new Error('Marketplace returned invalid school control state');
      await this.prisma.$transaction(async (tx) => {
        const previous = await tx.marketplaceSchoolControl.findUnique({ where: { id: 'singleton' } });
        await tx.marketplaceSchoolControl.upsert({
          where: { id: 'singleton' },
          create: { id: 'singleton', access: body.access!, reason: body.reason || null, warningsJson: JSON.stringify(body.warnings), billingJson: JSON.stringify(body.billing || {}), lastVerifiedAt: now, lastAttemptAt: now },
          update: { access: body.access!, reason: body.reason || null, warningsJson: JSON.stringify(body.warnings), billingJson: JSON.stringify(body.billing || {}), lastVerifiedAt: now, lastAttemptAt: now, lastError: null },
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
        /**
         * The billing lifecycle in the school's own notification bell.
         *
         * The marketplace records INVOICE_ISSUED, DUE_SOON and PAYMENT_RECEIVED and delivers them
         * by email, which this deployment has switched off -- so without this the first a school
         * hears of a bill is the final notice above, three days before it is locked out of its own
         * system. These records reach us on every sync regardless of whether their email was ever
         * delivered, which is exactly why they are worth surfacing here.
         *
         * OVERDUE is excluded on purpose: the warnings loop above already raises the final notice
         * for the same invoice, and two bells for one event teaches people to ignore both.
         */
        const seenNotificationIds = new Set(previous ? safeNotificationIds(previous.billingJson) : []);
        const fresh = (body.billing?.notifications ?? []).filter(
          (item) => NOTIFIED_TYPES.has(item.type) && !seenNotificationIds.has(item.id),
        );
        // On a school's first successful sync every historical record looks new. Recording them
        // without ringing avoids dumping a back catalogue into the bell on day one.
        if (previous?.lastVerifiedAt) {
          for (const item of fresh) {
            await tx.notification.createMany({ data: admins.map(admin => ({
              userId: admin.id,
              type: `platform_billing_${item.type.toLowerCase()}`,
              message: item.subject || `Platform billing update (${item.type.toLowerCase().replace(/_/g, ' ')}).`,
            })) });
          }
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

  /**
   * Unread platform-billing notifications for one administrator, which is what puts the badge on
   * the Platform Billing nav item. Without it the notifications raised above sit in a table with no
   * inbox: the billing page renders them, but nothing tells anybody to go and look at it.
   */
  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null, type: { startsWith: NOTIFICATION_TYPE_PREFIX } } });
    return { count };
  }

  /** Called when an administrator opens the billing page -- seeing the notices is what clears them. */
  async markRead(userId: string, now = new Date()) {
    const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null, type: { startsWith: NOTIFICATION_TYPE_PREFIX } }, data: { readAt: now } });
    return { marked: result.count };
  }

  async status() {
    const state = await this.prisma.marketplaceSchoolControl.findUnique({ where: { id: 'singleton' } });
    if (!state) return null;
    return { ...state, warnings: safeJson(state.warningsJson, []), billing: safeJson(state.billingJson, {}), marketplaceUrl: readMarketplaceIdentityConfig()?.marketplaceUrl || null };
  }
}

function safeWarnings(value: string): Warning[] {
  try { const result = JSON.parse(value); return Array.isArray(result) ? result : []; } catch { return []; }
}

function safeJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

/** Ids already surfaced, read back out of the previously stored billing summary so a notification
 * rings once rather than on every hourly sync for as long as the marketplace keeps returning it. */
function safeNotificationIds(value: string): string[] {
  const billing = safeJson<BillingSummary>(value, {});
  return Array.isArray(billing.notifications)
    ? billing.notifications.map((item) => item?.id).filter((id): id is string => typeof id === 'string')
    : [];
}
