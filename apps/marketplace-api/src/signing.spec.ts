import { generateKeyPairSync, verify } from 'node:crypto';
import { canonicalJson, repositoryPublicKey, signEnvelope } from './signing';

describe('signed repository metadata', () => {
  it('canonicalizes object keys and produces a verifiable Ed25519 envelope', () => {
    const pair = generateKeyPairSync('ed25519');
    const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const payload = { z: 1, nested: { b: true, a: 'stable' }, a: ['one', 'two'] };
    const envelope = signEnvelope(payload, privateKey, 'repository-test');
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(verify(null, Buffer.from(canonicalJson(envelope.payload)), repositoryPublicKey(privateKey), Buffer.from(envelope.signature.value, 'base64'))).toBe(true);
  });
});
