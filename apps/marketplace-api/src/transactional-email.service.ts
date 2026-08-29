import { MarketplaceConfig } from './config';

export type TransactionalMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface TransactionalEmailService {
  send(message: TransactionalMessage): Promise<void>;
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
