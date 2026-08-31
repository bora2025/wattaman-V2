import { platformOpenApi } from './platform-openapi';
import { PLATFORM_PERMISSIONS, PLATFORM_ROLES } from './platform-rbac-seed';
import { requirePlatformPermission } from './platform-rbac';

describe('PA-2 platform authorization matrix', () => {
  const document = platformOpenApi('https://marketplace.example');
  const protectedOperations = Object.entries(document.paths)
    .flatMap(([route, methods]) => Object.entries(methods).map(([method, operation]) => ({ route, method, operation })))
    .filter(({ operation }) => 'x-wattanam-permission' in operation)
    .map(({ route, method, operation }) => ({
      route, method, operation,
      permission: operation['x-wattanam-permission'] as string,
    }));

  it('references only seeded permissions and assigns each read permission to at least one role', () => {
    const seeded = new Set(PLATFORM_PERMISSIONS.map(item => item.key));
    const assigned = new Set(PLATFORM_ROLES.flatMap(role => role.permissions));
    for (const { route, permission } of protectedOperations) {
      expect(seeded.has(permission)).toBe(true);
      expect(assigned.has(permission)).toBe(true);
      expect(route).toMatch(/^\/platform\/v1\//);
    }
  });

  for (const role of PLATFORM_ROLES) {
    it(`${role.key} allows exactly its grants across every documented protected route`, async () => {
      const granted = new Set(role.permissions);
      const auth = { effectivePermissions: jest.fn().mockResolvedValue(granted) } as any;
      for (const { permission } of protectedOperations) {
        const next = jest.fn();
        await requirePlatformPermission(auth, permission)({ operatorId: 'operator-1' } as any, {} as any, next);
        if (granted.has(permission)) {
          expect(next.mock.calls).toEqual([[]]);
        } else {
          expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
        }
      }
      expect(auth.effectivePermissions).toHaveBeenCalledTimes(protectedOperations.length);
    });
  }
});
