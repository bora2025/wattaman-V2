import { decryptSecret, encryptSecret, parseSecretEncryptionKeys } from './secret-encryption';

const key = (fill: number) => Buffer.alloc(32, fill);

describe('identity secret encryption', () => {
  it('round-trips an authenticated envelope without exposing plaintext', () => {
    const keys = [{ keyId: 'identity-2026', key: key(1) }];
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', keys);
    expect(encrypted).toMatch(/^enc:v1:identity-2026:/);
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(encrypted, keys)).toEqual({ plaintext: 'JBSWY3DPEHPK3PXP', needsRotation: false });
  });

  it('detects ciphertext tampering', () => {
    const keys = [{ keyId: 'identity-2026', key: key(2) }];
    const encrypted = encryptSecret('secret', keys);
    const parts = encrypted.split(':');
    parts[5] = `${parts[5][0] === 'A' ? 'B' : 'A'}${parts[5].slice(1)}`;
    expect(() => decryptSecret(parts.join(':'), keys)).toThrow('authentication failed');
  });

  it('reads old-key and legacy plaintext values while marking both for rotation', () => {
    const keys = [{ keyId: 'new', key: key(3) }, { keyId: 'old', key: key(4) }];
    expect(decryptSecret(encryptSecret('value', [keys[1]]), keys)).toEqual({ plaintext: 'value', needsRotation: true });
    expect(decryptSecret('legacy-plaintext', keys)).toEqual({ plaintext: 'legacy-plaintext', needsRotation: true });
  });

  it('parses a keyring with the active key first', () => {
    const parsed = parseSecretEncryptionKeys(JSON.stringify({ old: key(5).toString('base64'), active: key(6).toString('base64') }), 'active');
    expect(parsed.map((entry) => entry.keyId)).toEqual(['active', 'old']);
  });
});
