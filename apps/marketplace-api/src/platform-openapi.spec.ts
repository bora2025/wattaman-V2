import { platformOpenApi } from './platform-openapi';

describe('platformOpenApi', () => {
  const document = platformOpenApi('https://marketplace.example');

  it('publishes an OpenAPI 3.1 contract with opaque bearer authentication by default', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.servers[0].url).toBe('https://marketplace.example');
    expect(document.security).toEqual([{ platformBearer: [] }]);
    expect(document.components.securitySchemes.platformBearer).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('marks only login and refresh as public', () => {
    const operations = Object.values(document.paths).flatMap(value => Object.values(value));
    const publicOperations = operations.filter(value => 'security' in value && Array.isArray(value.security) && value.security.length === 0);
    expect(publicOperations.map(value => value.operationId).sort()).toEqual(['auth_create_session', 'auth_refresh_session']);
  });

  it('declares permission metadata for every permission-protected read route', () => {
    const protectedReads = Object.entries(document.paths)
      .filter(([route]) => !route.startsWith('/platform/v1/auth/') && route !== '/platform/v1/me')
      .map(([, value]) => Object.values(value)[0]);
    expect(protectedReads).toHaveLength(21);
    expect(protectedReads.every(value => 'x-wattanam-permission' in value)).toBe(true);
  });

  it('describes CSV exports with their actual media type', () => {
    expect(document.paths['/platform/v1/exports'].get.responses['200'].content).toHaveProperty('text/csv');
  });
});
