import fs from 'node:fs';
import path from 'node:path';

describe('marketplace API container startup', () => {
  const dockerfile = fs.readFileSync(path.resolve(__dirname, '../Dockerfile'), 'utf8');

  it('seeds the complete RBAC catalog after migrations and before narrow permission repairs', () => {
    const migrate = dockerfile.indexOf('npx prisma migrate deploy');
    const seed = dockerfile.indexOf('node scripts/seed-platform-rbac.js');
    const repair = dockerfile.indexOf('node scripts/ensure-plugin-pricing-permission.js');
    const start = dockerfile.indexOf('node dist/main.js');

    expect(migrate).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(migrate);
    expect(repair).toBeGreaterThan(seed);
    expect(start).toBeGreaterThan(repair);
    expect(dockerfile).toContain(
      'COPY apps/marketplace-api/scripts/seed-platform-rbac.js ./scripts/seed-platform-rbac.js',
    );
  });
});
