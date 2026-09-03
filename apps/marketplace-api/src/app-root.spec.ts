import request from 'supertest';
import { createApp } from './app';

describe('marketplace API discovery root', () => {
  it('identifies the API and advertises its public verification endpoints', async () => {
    const response = await request(createApp({} as never, {} as never)).get('/').expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      service: 'wattanam-marketplace-api',
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
});
