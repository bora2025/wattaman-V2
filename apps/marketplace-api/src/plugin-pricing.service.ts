import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from './http-error';
import { PlatformActionContext } from './platform-context';

const pricingInput = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('FREE'),
    internalReason: z.string().trim().min(3).max(500),
  }),
  z.object({
    mode: z.literal('PAID'),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    amountMinor: z.number().int().positive().max(100_000_000),
    licensedMajor: z.number().int().min(0).max(10_000),
    licenseDays: z.number().int().min(1).max(36_500),
    updatesDays: z.number().int().min(1).max(36_500),
    validFrom: z.string().datetime().optional(),
    internalReason: z.string().trim().min(3).max(500),
  }),
]).refine((input) => input.mode === 'FREE' || input.updatesDays <= input.licenseDays, {
  message: 'Updates duration cannot exceed the licence duration',
  path: ['updatesDays'],
});

/**
 * Operator pricing mutations are deliberately append-only. A paid price is
 * never edited after orders may have referenced it; replacing an offer closes
 * the old validity window and creates a new immutable price row.
 */
export class PluginPricingService {
  constructor(private readonly prisma: PrismaClient) {}

  async configure(pluginId: string, operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = pricingInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const plugin = await tx.marketplacePlugin.findUnique({
        where: { id: pluginId },
        select: { id: true, name: true, isPaid: true },
      });
      if (!plugin) throw new HttpError(404, 'Plugin not found');

      const now = new Date();
      if (input.mode === 'FREE') {
        await tx.productPrice.updateMany({
          where: { pluginId, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
          data: { validUntil: now },
        });
        await tx.marketplacePlugin.update({ where: { id: pluginId }, data: { isPaid: false } });
        await this.audit(tx, operatorId, pluginId, input.internalReason, context, {
          previousMode: plugin.isPaid ? 'PAID' : 'FREE', mode: 'FREE', effectiveAt: now.toISOString(),
        });
      } else {
        const validFrom = input.validFrom ? new Date(input.validFrom) : now;
        await tx.productPrice.updateMany({
          where: {
            pluginId, currency: input.currency,
            OR: [{ validUntil: null }, { validUntil: { gt: validFrom } }],
          },
          data: { validUntil: validFrom },
        });
        const price = await tx.productPrice.create({ data: {
          pluginId, currency: input.currency, amountMinor: input.amountMinor,
          licensedMajor: input.licensedMajor, licenseDays: input.licenseDays,
          updatesDays: input.updatesDays, validFrom,
        } });
        await tx.marketplacePlugin.update({ where: { id: pluginId }, data: { isPaid: true } });
        await this.audit(tx, operatorId, pluginId, input.internalReason, context, {
          previousMode: plugin.isPaid ? 'PAID' : 'FREE', mode: 'PAID', priceId: price.id,
          currency: price.currency, amountMinor: price.amountMinor, validFrom: price.validFrom.toISOString(),
        });
      }

      return tx.marketplacePlugin.findUnique({
        where: { id: pluginId },
        select: {
          id: true, name: true, isPaid: true,
          prices: {
            select: { id: true, currency: true, amountMinor: true, licensedMajor: true, validFrom: true, validUntil: true, updatesDays: true, licenseDays: true },
            orderBy: { validFrom: 'desc' },
          },
        },
      });
    });
  }

  private async audit(tx: Prisma.TransactionClient, operatorId: string, targetId: string, reason: string, context: PlatformActionContext, metadata: Prisma.InputJsonValue) {
    await tx.platformAuditEvent.create({ data: {
      operatorId, action: 'plugin_pricing_configured', targetType: 'MarketplacePlugin', targetId,
      reason, metadata, correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
    } });
  }
}
