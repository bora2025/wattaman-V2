import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { MarketplaceConfig } from './config';
import { decryptSecret, encryptSecret } from './secret-encryption';

export type TransactionalMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  deduplicationKey?: string;
};

export interface TransactionalEmailService {
  send(message: TransactionalMessage): Promise<void>;
}

const MAX_DELIVERY_ATTEMPTS = 8;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
const DELIVERY_BATCH_SIZE = 25;

/** Durable, encrypted delivery boundary. `send` means "accepted for delivery"; provider failures
 * remain in the outbox for bounded retry instead of breaking account creation or reset requests. */
export class DurableTransactionalEmailService implements TransactionalEmailService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly delivery: TransactionalEmailService,
    private readonly config: MarketplaceConfig,
  ) {}

  async send(message: TransactionalMessage): Promise<void> {
    const deduplicationKey = message.deduplicationKey ?? `message:${randomUUID()}`;
    const encryptedMessage = encryptSecret(JSON.stringify({ to: message.to, subject: message.subject, text: message.text, html: message.html }), this.config.identityEncryptionKeys);
    const row = await this.prisma.marketplaceEmailDelivery.upsert({
      where: { deduplicationKey }, update: {},
      create: { deduplicationKey, encryptedMessage }, select: { id: true },
    });
    await this.dispatchById(row.id);
  }

  async dispatchPending(now = new Date()): Promise<{ delivered: number; failed: number }> {
    let delivered = 0;
    let failed = 0;
    for (let index = 0; index < DELIVERY_BATCH_SIZE; index += 1) {
      const candidate = await this.prisma.marketplaceEmailDelivery.findFirst({
        where: {
          OR: [
            { status: { in: ['PENDING', 'FAILED'] }, nextAttemptAt: { lte: now } },
            { status: 'PROCESSING', claimedAt: { lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } },
          ],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }], select: { id: true },
      });
      if (!candidate) break;
      const result = await this.dispatchById(candidate.id, now);
      if (result === 'delivered') delivered += 1;
      if (result === 'failed') failed += 1;
    }
    return { delivered, failed };
  }

  private async dispatchById(id: string, now = new Date()): Promise<'delivered' | 'failed' | 'skipped'> {
    const current = await this.prisma.marketplaceEmailDelivery.findUnique({ where: { id } });
    if (!current || current.status === 'SENT' || current.status === 'DEAD') return 'skipped';
    const stale = current.status === 'PROCESSING' && current.claimedAt && current.claimedAt < new Date(now.getTime() - CLAIM_TIMEOUT_MS);
    if (current.status === 'PROCESSING' && !stale) return 'skipped';
    if (current.nextAttemptAt > now && !stale) return 'skipped';
    const claimToken = randomUUID();
    const claimed = await this.prisma.marketplaceEmailDelivery.updateMany({
      where: { id, status: current.status, attempts: current.attempts, ...(current.claimToken ? { claimToken: current.claimToken } : { claimToken: null }) },
      data: { status: 'PROCESSING', claimedAt: now, claimToken, attempts: { increment: 1 }, attemptedAt: now },
    });
    if (claimed.count !== 1) return 'skipped';
    try {
      const plaintext = decryptSecret(current.encryptedMessage, this.config.identityEncryptionKeys).plaintext;
      const message = JSON.parse(plaintext) as TransactionalMessage;
      await this.delivery.send(message);
      await this.prisma.marketplaceEmailDelivery.updateMany({
        where: { id, claimToken }, data: { status: 'SENT', sentAt: now, claimedAt: null, claimToken: null, failureMessage: null },
      });
      return 'delivered';
    } catch (error) {
      const attempts = current.attempts + 1;
      const dead = attempts >= MAX_DELIVERY_ATTEMPTS;
      const delayMs = Math.min(60 * 60 * 1000, 30_000 * (2 ** Math.max(0, attempts - 1)));
      await this.prisma.marketplaceEmailDelivery.updateMany({
        where: { id, claimToken },
        data: {
          status: dead ? 'DEAD' : 'FAILED', claimedAt: null, claimToken: null,
          nextAttemptAt: new Date(now.getTime() + delayMs),
          failureMessage: error instanceof Error ? error.message.slice(0, 500) : 'Delivery failed',
        },
      });
      return 'failed';
    }
  }
}

export class SendGridTransactionalEmailService implements TransactionalEmailService {
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(message: TransactionalMessage): Promise<void> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: message.to }] }],
            from: { email: this.from },
            subject: message.subject,
            content: [{ type: 'text/plain', value: message.text }, { type: 'text/html', value: message.html }],
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) return;
        lastError = new Error(`SendGrid returned HTTP ${response.status}`);
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Transactional email request failed');
      }
    }
    throw lastError ?? new Error('Transactional email request failed');
  }
}

export class DisabledTransactionalEmailService implements TransactionalEmailService {
  async send(): Promise<void> { throw new Error('Transactional email is not configured'); }
}

export function createTransactionalEmailService(config: MarketplaceConfig): TransactionalEmailService {
  if (config.transactionalEmail?.provider === 'sendgrid') {
    return new SendGridTransactionalEmailService(config.transactionalEmail.apiKey!, config.transactionalEmail.from!);
  }
  return new DisabledTransactionalEmailService();
}

export function createDurableTransactionalEmailService(prisma: PrismaClient, config: MarketplaceConfig) {
  return new DurableTransactionalEmailService(prisma, createTransactionalEmailService(config), config);
}
