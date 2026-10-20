'use strict';

const { createHash } = require('node:crypto');
const { promises: fs } = require('node:fs');
const path = require('node:path');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function files(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(target));
    else if (entry.isFile() && entry.name.endsWith('.wtp')) result.push(target);
  }
  return result;
}

async function verify(client, bucket, key, digest, size) {
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (head.Metadata?.sha256 !== digest || Number(head.ContentLength) !== size) {
    throw new Error(`S3 verification failed for ${key}`);
  }
}

async function main() {
  const root = path.resolve(process.env.ARTIFACT_STORAGE_PATH || '/data/artifacts');
  const bucket = required('ARTIFACT_S3_BUCKET');
  const region = required('ARTIFACT_S3_REGION');
  const accessKeyId = required('ARTIFACT_S3_ACCESS_KEY_ID');
  const secretAccessKey = required('ARTIFACT_S3_SECRET_ACCESS_KEY');
  const endpoint = process.env.ARTIFACT_S3_ENDPOINT?.trim() || undefined;
  const client = new S3Client({ region, endpoint, forcePathStyle: process.env.ARTIFACT_S3_FORCE_PATH_STYLE === 'true', credentials: { accessKeyId, secretAccessKey } });
  const artifacts = await files(root);
  let copied = 0;
  let existing = 0;
  for (const file of artifacts) {
    const value = await fs.readFile(file);
    const digest = createHash('sha256').update(value).digest('hex');
    const key = path.relative(root, file).split(path.sep).join('/');
    if (key !== `sha256/${digest.slice(0, 2)}/${digest}.wtp`) throw new Error(`Artifact path does not match its digest: ${key}`);
    try {
      await verify(client, bucket, key, digest, value.length);
      existing += 1;
      continue;
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound') throw error;
    }
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: value, ContentType: 'application/vnd.wattanam.plugin+zip', CacheControl: 'public, max-age=31536000, immutable', Metadata: { sha256: digest }, ChecksumSHA256: createHash('sha256').update(value).digest('base64'), IfNoneMatch: '*' }));
      copied += 1;
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 412 && error?.name !== 'PreconditionFailed') throw error;
    }
    await verify(client, bucket, key, digest, value.length);
  }
  process.stdout.write(`${JSON.stringify({ status: 'verified', artifactCount: artifacts.length, copied, existing })}\n`);
}

main().catch((error) => { process.stderr.write(`Artifact migration failed: ${error.message}\n`); process.exitCode = 1; });
