import { verify } from 'node:crypto';
import { MarketplaceConfig } from './config';
import { canonicalJson, repositoryPublicKey, signEnvelopeWithKeys } from './signing';

type Signature = { algorithm: 'ed25519'; keyId: string; value: string };
export type SignedEnvelope<T> = { payload: T; signature: Signature; signatures: Signature[] };

export interface RepositorySigner {
  keyDocument(): { schemaVersion: 1; activeKeyId: string; algorithm: 'ed25519'; keys: Array<{ keyId: string; publicKeyPem: string }> };
  sign<T>(payload: T): Promise<SignedEnvelope<T>>;
}

export function createRepositorySigner(config: MarketplaceConfig, fetcher: typeof fetch = fetch): RepositorySigner {
  const signingKeys = config.signingKeys ?? [];
  const publicKeys = config.signingPublicKeys?.length
    ? config.signingPublicKeys
    : signingKeys.map((key) => ({ keyId: key.keyId, publicKeyPem: repositoryPublicKey(key.privateKey) }));
  const keyDocument = () => ({ schemaVersion: 1 as const, activeKeyId: config.signingKeyId, algorithm: 'ed25519' as const, keys: publicKeys });
  if (config.signingProvider !== 'remote') {
    return { keyDocument, sign: async <T>(payload: T) => signEnvelopeWithKeys(payload, signingKeys) };
  }
  if (!config.remoteSigning) throw new Error('Remote repository signing is not configured');
  const keyById = new Map(publicKeys.map((key) => [key.keyId, key.publicKeyPem]));
  return {
    keyDocument,
    async sign<T>(payload: T) {
      const bytes = Buffer.from(canonicalJson(payload), 'utf8');
      const response = await fetcher(config.remoteSigning!.endpoint, {
        method: 'POST', signal: AbortSignal.timeout(config.remoteSigning!.timeoutMs),
        headers: { authorization: `Bearer ${config.remoteSigning!.bearerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ algorithm: 'ed25519', keyIds: publicKeys.map((key) => key.keyId), payloadBase64: bytes.toString('base64') }),
      });
      if (!response.ok) throw new Error(`Repository signing service failed (${response.status})`);
      const body = await response.json() as { signatures?: Signature[] };
      const signatures = Array.isArray(body.signatures) ? body.signatures : [];
      if (signatures.length !== publicKeys.length) throw new Error('Repository signing service returned an incomplete signature set');
      const seen = new Set<string>();
      for (const signature of signatures) {
        const publicKeyPem = keyById.get(signature.keyId);
        if (signature.algorithm !== 'ed25519' || !publicKeyPem || seen.has(signature.keyId)
          || !verify(null, bytes, publicKeyPem, Buffer.from(signature.value, 'base64'))) {
          throw new Error('Repository signing service returned an invalid signature');
        }
        seen.add(signature.keyId);
      }
      const active = signatures.find((signature) => signature.keyId === config.signingKeyId);
      if (!active) throw new Error('Repository signing service omitted the active key');
      return { payload, signature: active, signatures: [active, ...signatures.filter((signature) => signature !== active)] };
    },
  };
}
