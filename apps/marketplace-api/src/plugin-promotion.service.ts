import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from './http-error';
import { validateImageDataUrl } from './payment-image';
import { PlatformActionContext } from './platform-context';

const MAX_COVER_BYTES = 500 * 1024;
const MAX_SCREENSHOT_BYTES = 350 * 1024;

const promotionInput = z.object({
  promotionalDescription: z.string().trim().min(20).max(12_000),
  coverImage: z.string().nullable(),
  screenshots: z.array(z.string()).max(6),
  internalReason: z.string().trim().min(3).max(500),
}).strict();

export class PluginPromotionService {
  constructor(private readonly prisma: PrismaClient) {}

  async configure(pluginId: string, operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = promotionInput.parse(value);
    const plugin = await this.prisma.marketplacePlugin.findUnique({ where: { id: pluginId }, select: { id: true } });
    if (!plugin) throw new HttpError(404, 'Plugin not found');
    const coverImage = input.coverImage ? validateImageDataUrl(input.coverImage, MAX_COVER_BYTES, 'Plugin cover') : null;
    const screenshots = input.screenshots.map((image, index) => validateImageDataUrl(image, MAX_SCREENSHOT_BYTES, `Screenshot ${index + 1}`));
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.marketplacePlugin.update({
        where: { id: pluginId },
        data: { promotionalDescription: input.promotionalDescription, coverImage, screenshots },
        select: { id: true, promotionalDescription: true, coverImage: true, screenshots: true, updatedAt: true },
      });
      await tx.platformAuditEvent.create({ data: {
        operatorId, action: 'plugin_promotion_configured', targetType: 'MarketplacePlugin', targetId: pluginId,
        reason: input.internalReason,
        metadata: { hasCover: !!coverImage, screenshotCount: screenshots.length } as Prisma.InputJsonValue,
        correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
      } });
      return updated;
    });
  }
}
