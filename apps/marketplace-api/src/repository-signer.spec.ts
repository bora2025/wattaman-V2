import { generateKeyPairSync, sign } from 'node:crypto';
import { canonicalJson } from './signing';
import { createRepositorySigner } from './repository-signer';

const pair = () => generateKeyPairSync('ed25519');
const pem = (key: ReturnType<typeof pair>['publicKey']) => key.export({ type: 'spki', format: 'pem' }).toString();

describe('repository signer', () => {
  it('allows discovery-only app construction without eager local signing keys', async () => {
    const signer = createRepositorySigner({} as any);
    expect(signer.keyDocument().keys).toEqual([]);
    await expect(signer.sign({ value: 1 })).rejects.toThrow();
  });

  it('uses the existing local signer by default', async () => {
    const key = pair();
    const signer = createRepositorySigner({ signingProvider: 'local', signingKeyId: 'local-1', signingKeys: [{ keyId: 'local-1', privateKey: key.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }], signingPublicKeys: [] } as any);
    await expect(signer.sign({ value: 1 })).resolves.toMatchObject({ signature: { keyId: 'local-1' } });
  });

  it('accepts only cryptographically valid signatures from a remote KMS adapter', async () => {
    const key = pair();
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      const bytes = Buffer.from(request.payloadBase64, 'base64');
      return new Response(JSON.stringify({ signatures: [{ algorithm: 'ed25519', keyId: 'kms-1', value: sign(null, bytes, key.privateKey).toString('base64') }] }), { status: 200 });
    }) as any;
    const config = { signingProvider: 'remote', signingKeyId: 'kms-1', signingKeys: [], signingPublicKeys: [{ keyId: 'kms-1', publicKeyPem: pem(key.publicKey) }], remoteSigning: { endpoint: 'https://signer.example/v1/sign', bearerToken: 'x'.repeat(32), timeoutMs: 1000 } } as any;
    const envelope = await createRepositorySigner(config, fetcher).sign({ value: 1 });
    expect(envelope.signature.keyId).toBe('kms-1');
    expect(fetcher).toHaveBeenCalledWith('https://signer.example/v1/sign', expect.objectContaining({ method: 'POST' }));
    expect(canonicalJson(envelope.payload)).toBe('{"value":1}');
  });

  it('fails closed when a remote signer returns an invalid signature', async () => {
    const key = pair();
    const fetcher = jest.fn(async () => new Response(JSON.stringify({ signatures: [{ algorithm: 'ed25519', keyId: 'kms-1', value: Buffer.alloc(64).toString('base64') }] }), { status: 200 })) as any;
    const config = { signingProvider: 'remote', signingKeyId: 'kms-1', signingKeys: [], signingPublicKeys: [{ keyId: 'kms-1', publicKeyPem: pem(key.publicKey) }], remoteSigning: { endpoint: 'https://signer.example/v1/sign', bearerToken: 'x'.repeat(32), timeoutMs: 1000 } } as any;
    await expect(createRepositorySigner(config, fetcher).sign({ value: 1 })).rejects.toThrow('invalid signature');
  });
});
