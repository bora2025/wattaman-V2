import request from 'supertest';
import { createApp } from './app';

describe('marketplace API discovery root', () => {
  it('identifies the API and advertises its public verification endpoints', async () => {
    const response = await request(createApp({} as never, { appVersion: '0.1.0-test.1' } as never)).get('/').expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      service: 'wattanam-marketplace-api',
      version: '0.1.0-test.1',
      status: 'online',
      endpoints: expect.objectContaining({
        live: '/health/live',
        ready: '/health/ready',
        catalog: '/v1/catalog',
        repositoryIndex: '/v1/index',
        repositoryKey: '/v1/repository-key',
      }),
    }));
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the customer-facing school link approval page and its same-origin assets', async () => {
    const app = createApp({} as never, {} as never);
    const page = await request(app).get('/marketplace/link/7763e38e-e984-461a-b6dd-5b2775102500').expect(200);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    expect(page.text).toContain('Approve school connection');
    expect(page.text).toContain('/marketplace/link/approval.js');
    expect(page.text).not.toContain('MFA or recovery code');
    expect(page.headers['cache-control']).toBe('no-store');

    const script = await request(app).get('/marketplace/link/approval.js').expect(200);
    expect(script.headers['content-type']).toMatch(/^application\/javascript/);
    expect(script.text).toContain('/v1/marketplace-links/');
    expect(script.text).toContain('window.close()');
  });
});
