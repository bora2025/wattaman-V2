import { generateKeyPairSync } from 'node:crypto';
import { issueEntitlement, verifyEntitlement } from './entitlement';

function fixture() {
  const pair = generateKeyPairSync('ed25519');
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const now = new Date('2026-08-28T00:00:00.000Z');
  const token = issueEntitlement({
    installationId: 'school-001', customerId: 'customer-001', productId: 'official.attendance',
    licensedMajorRange: '^1.0.0', notBefore: now.toISOString(),
    expiresAt: '2027-08-28T00:00:00.000Z', updatesThrough: '2027-06-01T00:00:00.000Z',
    offlineRecheckAfter: '2026-09-27T00:00:00.000Z', features: ['attendance.core'],
    issuer: 'https://marketplace.wattanam.example',
  }, privateKey, 'entitlement-2026-01', now);
  return { token, publicKey, now };
}

describe('offline entitlement tokens', () => {
  it('issues and locally verifies a scoped Ed25519 token', () => {
    const { token, publicKey } = fixture();
    const payload = verifyEntitlement(token, new Map([['entitlement-2026-01', publicKey]]), {
      installationId: 'school-001', productId: 'official.attendance', now: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(payload.audience).toBe('wattanam-school');
    expect(payload.customerId).toBe('customer-001');
  });

  it.each([
    ['tampered payload', (value: any) => { value.payload.customerId = 'attacker'; }, 'signature'],
    ['wrong installation', (_value: any) => undefined, 'another installation'],
    ['unknown key', (value: any) => { value.signature.keyId = 'unknown'; value.payload.keyId = 'unknown'; }, 'not trusted'],
  ])('rejects %s', (_name, mutate, message) => {
    const { token, publicKey } = fixture();
    const value = structuredClone(token);
    mutate(value);
    expect(() => verifyEntitlement(value, new Map([['entitlement-2026-01', publicKey]]), {
      installationId: _name === 'wrong installation' ? 'school-999' : 'school-001', productId: 'official.attendance', now: new Date('2026-09-01T00:00:00.000Z'),
    })).toThrow(message);
  });

  it('rejects an expired offline recheck without disabling the longer license window', () => {
    const { token, publicKey } = fixture();
    expect(() => verifyEntitlement(token, new Map([['entitlement-2026-01', publicKey]]), {
      installationId: 'school-001', productId: 'official.attendance', now: new Date('2026-10-01T00:00:00.000Z'),
    })).toThrow('online refresh');
  });
});
