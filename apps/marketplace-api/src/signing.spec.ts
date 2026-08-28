import { generateKeyPairSync, verify } from 'node:crypto';
import { canonicalJson, repositoryPublicKey, signEnvelope, signEnvelopeWithKeys } from './signing';

describe('signed repository metadata', () => {
  it('canonicalizes object keys and produces a verifiable Ed25519 envelope', () => {
    const pair = generateKeyPairSync('ed25519');
    const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const payload = { z: 1, nested: { b: true, a: 'stable' }, a: ['one', 'two'] };
    const envelope = signEnvelope(payload, privateKey, 'repository-test');
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(verify(null, Buffer.from(canonicalJson(envelope.payload)), repositoryPublicKey(privateKey), Buffer.from(envelope.signature.value, 'base64'))).toBe(true);
  });

  it('signs identical metadata with old and new keys during rotation overlap', () => {
    const oldPair = generateKeyPairSync('ed25519');
    const newPair = generateKeyPairSync('ed25519');
    const oldPrivate = oldPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const newPrivate = newPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const envelope = signEnvelopeWithKeys({ schemaVersion: 1, releases: [] }, [
      { keyId: 'repository-new', privateKey: newPrivate }, { keyId: 'repository-old', privateKey: oldPrivate },
    ]);
    expect(envelope.signature.keyId).toBe('repository-new');
    expect(envelope.signatures).toHaveLength(2);
    for (const item of envelope.signatures) {
      const publicKey = item.keyId === 'repository-new' ? newPair.publicKey : oldPair.publicKey;
      expect(verify(null, Buffer.from(canonicalJson(envelope.payload)), publicKey, Buffer.from(item.value, 'base64'))).toBe(true);
    }
  });
});
