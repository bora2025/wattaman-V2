import { SendGridTransactionalEmailService } from './transactional-email.service';

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
