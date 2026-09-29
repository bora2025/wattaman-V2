'use strict';

const DIGEST_IMAGE = /^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/;

function required(environment, name) {
  const value = String(environment[name] || '').replace(/^\uFEFF/, '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function payloadFromEnvironment(environment) {
  const payload = {
    version: required(environment, 'VERSION'), channel: 'BETA', nodeRange: '>=20 <21', postgresRange: '>=16 <19',
    apiImage: required(environment, 'API'), webImage: required(environment, 'WEB'), gatewayImage: required(environment, 'GATEWAY'), releaseNotes: required(environment, 'NOTES'),
  };
  for (const [name, image] of Object.entries({ API: payload.apiImage, WEB: payload.webImage, GATEWAY: payload.gatewayImage })) {
    if (!DIGEST_IMAGE.test(image)) throw new Error(`${name} must be a lowercase digest-pinned GHCR image`);
  }
  return payload;
}

async function publishCoreRelease(environment = process.env, fetchImplementation = fetch) {
  const base = new URL(required(environment, 'MARKETPLACE_URL'));
  const response = await fetchImplementation(new URL('/admin/v1/core-releases', base), {
    method: 'POST',
    headers: { authorization: `Bearer ${required(environment, 'MARKETPLACE_ADMIN_TOKEN')}`, 'content-type': 'application/json' },
    body: JSON.stringify(payloadFromEnvironment(environment)),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Publish failed (${response.status}): ${body}`);
  return body;
}

if (require.main === module) {
  publishCoreRelease().then((body) => process.stdout.write(`${body}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { DIGEST_IMAGE, payloadFromEnvironment, publishCoreRelease };
