import { DurableTransactionalEmailService, SendGridTransactionalEmailService } from './transactional-email.service';

describe('SendGrid transactional email', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends without logging or returning the message token', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    const service = new SendGridTransactionalEmailService('secret-api-key', 'support@wattanam.example');
    await service.send({ to: 'owner@school.example', subject: 'Verify', text: 'token-value', html: '<p>token-value</p>' });
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer secret-api-key');
    expect(init?.body).toContain('owner@school.example');
  });

  it('retries transient failures and accepts the eventual delivery', async () => {
    const request = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    await new SendGridTransactionalEmailService('secret-api-key', 'support@wattanam.example').send({
      to: 'owner@school.example', subject: 'Reset', text: 'reset', html: '<p>reset</p>',
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent recipient failures', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 400 }));
    await expect(new SendGridTransactionalEmailService('secret-api-key', 'support@wattanam.example').send({
      to: 'invalid@example', subject: 'Reset', text: 'reset', html: '<p>reset</p>',
    })).rejects.toThrow('HTTP 400');
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('durable transactional email outbox', () => {
  const key = { keyId: 'identity-1', key: Buffer.alloc(32, 7) };

  it('encrypts secret-bearing messages and retains provider failures for retry', async () => {
    let row: any;
    const prisma = {
      marketplaceEmailDelivery: {
        upsert: jest.fn(async ({ create }: any) => {
          row = { id: 'delivery-1', status: 'PENDING', attempts: 0, nextAttemptAt: new Date(0), claimedAt: null, claimToken: null, ...create };
          return { id: row.id };
        }),
        findUnique: jest.fn(async () => row),
        updateMany: jest.fn(async ({ data }: any) => {
          row = { ...row, ...data, attempts: data.attempts?.increment ? row.attempts + data.attempts.increment : row.attempts };
          return { count: 1 };
        }),
      },
    } as any;
    const provider = { send: jest.fn().mockRejectedValue(new Error('provider unavailable')) };
    const service = new DurableTransactionalEmailService(prisma, provider, { identityEncryptionKeys: [key] } as any);

    await expect(service.send({
      to: 'owner@example.com', subject: 'Reset', text: 'secret-token', html: '<p>secret-token</p>', deduplicationKey: 'reset:hash',
    })).resolves.toBeUndefined();

    const create = prisma.marketplaceEmailDelivery.upsert.mock.calls[0][0].create;
    expect(create.encryptedMessage).toMatch(/^enc:v1:/);
    expect(create.encryptedMessage).not.toContain('secret-token');
    expect(row.status).toBe('FAILED');
    expect(row.failureMessage).toBe('provider unavailable');
  });

  it('uses an idempotency key and records successful delivery', async () => {
    const now = new Date('2026-10-21T00:00:00.000Z');
    let row: any;
    const prisma = {
      marketplaceEmailDelivery: {
        upsert: jest.fn(async ({ create }: any) => {
          row = { id: 'delivery-2', status: 'PENDING', attempts: 0, nextAttemptAt: new Date(0), claimedAt: null, claimToken: null, ...create };
          return { id: row.id };
        }),
        findUnique: jest.fn(async () => row),
        updateMany: jest.fn(async ({ data }: any) => {
          row = { ...row, ...data, attempts: data.attempts?.increment ? row.attempts + data.attempts.increment : row.attempts };
          return { count: 1 };
        }),
      },
    } as any;
    const provider = { send: jest.fn().mockResolvedValue(undefined) };
    const service = new DurableTransactionalEmailService(prisma, provider, { identityEncryptionKeys: [key] } as any);
    await service.send({ to: 'owner@example.com', subject: 'Verify', text: 'text', html: '<p>text</p>', deduplicationKey: 'verify:hash' });
    expect(prisma.marketplaceEmailDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { deduplicationKey: 'verify:hash' } }));
    expect(provider.send).toHaveBeenCalledWith({ to: 'owner@example.com', subject: 'Verify', text: 'text', html: '<p>text</p>' });
    expect(row.status).toBe('SENT');
    expect(row.sentAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });
});
