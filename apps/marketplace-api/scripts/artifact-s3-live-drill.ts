import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash, randomBytes } from 'node:crypto';
import { S3ArtifactStorage } from '../src/artifact-storage';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function consume(body: any) {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function main() {
  const bucket = required('ARTIFACT_S3_BUCKET');
  const region = required('ARTIFACT_S3_REGION');
  const endpoint = process.env.ARTIFACT_S3_ENDPOINT?.trim() || undefined;
  const accessKeyId = process.env.ARTIFACT_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.ARTIFACT_S3_SECRET_ACCESS_KEY?.trim();
  if (!!accessKeyId !== !!secretAccessKey) throw new Error('Both artifact S3 credential variables must be configured together');
  const settings = { bucket, region, endpoint, forcePathStyle: process.env.ARTIFACT_S3_FORCE_PATH_STYLE === 'true', accessKeyId, secretAccessKey };
  const credentials = accessKeyId ? { accessKeyId, secretAccessKey: secretAccessKey! } : undefined;
  const client = new S3Client({ region, endpoint, forcePathStyle: settings.forcePathStyle, credentials });
  const firstInstance = new S3ArtifactStorage(settings);
  const secondInstance = new S3ArtifactStorage(settings);
  const bytes = Buffer.concat([Buffer.from('wattanam-lc4-001:'), randomBytes(128)]);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const [firstKey, secondKey] = await Promise.all([
    firstInstance.putImmutable(sha256, bytes),
    secondInstance.putImmutable(sha256, bytes),
  ]);
  if (firstKey !== secondKey) throw new Error('Scaled instances resolved different artifact keys');
  console.log(`PASS multi-instance create-only convergence: ${firstKey}`);

  // A new provider object represents a restarted API process with no in-memory state.
  const restartedInstance = new S3ArtifactStorage(settings);
  const restartedBytes = await consume(await restartedInstance.open(firstKey));
  if (createHash('sha256').update(restartedBytes).digest('hex') !== sha256) throw new Error('Restarted instance read digest mismatch');
  console.log('PASS restarted instance streamed the original digest');

  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: firstKey }));
  if (head.Metadata?.sha256 !== sha256 || Number(head.ContentLength) !== bytes.length) throw new Error('Stored immutable metadata mismatch');
  console.log('PASS immutable metadata and content length');

  const replacement = Buffer.from('forbidden replacement');
  let refused = false;
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: firstKey, Body: replacement, Metadata: { sha256: createHash('sha256').update(replacement).digest('hex') }, IfNoneMatch: '*' }));
  } catch (error: any) {
    refused = error?.$metadata?.httpStatusCode === 412 || error?.name === 'PreconditionFailed';
    if (!refused) throw error;
  }
  if (!refused) throw new Error('S3-compatible service accepted overwrite of an immutable artifact');
  const final = await client.send(new GetObjectCommand({ Bucket: bucket, Key: firstKey }));
  const finalBytes = await consume(final.Body);
  if (!finalBytes.equals(bytes)) throw new Error('Immutable object changed after overwrite attempt');
  console.log('PASS conditional overwrite was refused and original bytes remain');
  console.log(JSON.stringify({ status: 'passed', bucket, key: firstKey, sha256, bytes: bytes.length, retainedForAudit: true }));
}

main().catch((error) => {
  console.error(`FAIL LC4-001 artifact S3 live drill: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
