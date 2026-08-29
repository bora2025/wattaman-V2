import {
  base32Encode, generateRecoveryCodes, generateTotpSecret, hashPassword, hashToken, newOpaqueToken, totpCode, verifyPassword, verifyTotpCode,
} from './identity-crypto';

const RFC_SECRET_BASE32 = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('password hashing', () => {
  it('verifies a correctly hashed password and rejects a wrong one', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', encoded)).resolves.toBe(false);
  });

  it('produces a different encoded hash for the same password on each call', async () => {
    const a = await hashPassword('same-password-value');
    const b = await hashPassword('same-password-value');
    expect(a).not.toEqual(b);
  });

  it('rejects malformed encodings without throwing', async () => {
    await expect(verifyPassword('anything', 'not-a-valid-encoding')).resolves.toBe(false);
  });
});

describe('opaque tokens', () => {
  it('hashes deterministically and never stores the raw value in the hash', () => {
    const token = newOpaqueToken();
    expect(hashToken(token.raw)).toBe(token.hash);
    expect(token.hash).not.toBe(token.raw);
  });
});

describe('TOTP (RFC 4226 / RFC 6238 known-answer vectors)', () => {
  it('matches the RFC 4226 Appendix D HOTP vectors for counters 0-9', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => {
      expect(totpCode(RFC_SECRET_BASE32, counter)).toBe(code);
    });
  });

  it('matches the RFC 6238 Appendix B SHA1 TOTP vectors by unix time', () => {
    const vectors: Array<[number, string]> = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ];
    for (const [seconds, last6] of vectors) {
      expect(totpCode(RFC_SECRET_BASE32, Math.floor(seconds / 30))).toBe(last6);
      expect(verifyTotpCode(RFC_SECRET_BASE32, last6, new Date(seconds * 1000), 0)).toBe(true);
    }
  });

  it('accepts a code from the adjacent time step but rejects one two steps away', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-08-28T00:00:00.000Z');
    const nextStepCode = totpCode(secret, Math.floor(now.getTime() / 1000 / 30) + 1);
    const twoStepsAwayCode = totpCode(secret, Math.floor(now.getTime() / 1000 / 30) + 2);
    expect(verifyTotpCode(secret, nextStepCode, now)).toBe(true);
    expect(verifyTotpCode(secret, twoStepsAwayCode, now)).toBe(false);
  });

  it('rejects malformed codes', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '12a456', new Date())).toBe(false);
    expect(verifyTotpCode(secret, '12345', new Date())).toBe(false);
  });
});

describe('recovery codes', () => {
  it('generates the requested count of unique, fixed-format codes', () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[a-f0-9]{10}$/);
  });
});
