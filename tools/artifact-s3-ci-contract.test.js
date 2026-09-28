const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('required PR CI executes the production-shaped S3 immutability drill', () => {
  const workflow = read('.github/workflows/pr-validation.yml');
  const drill = read('apps/marketplace-api/scripts/artifact-s3-live-drill.ts');
  assert.match(workflow, /artifact-s3-compatibility:/);
  assert.match(workflow, /go install github\.com\/minio\/minio@RELEASE\.2025-04-22T22-12-26Z/);
  assert.match(workflow, /nohup .*minio.* server .*minio-data.*--address :9000/);
  assert.doesNotMatch(workflow, /minio\/minio:/);
  assert.match(workflow, /npm run drill:artifact-s3/);
  assert.match(drill, /Promise\.all\(\[/);
  assert.match(drill, /restartedInstance\.open/);
  assert.match(drill, /IfNoneMatch: '\*'/);
  assert.match(drill, /original bytes remain/);
});

test('CI may create only its explicitly configured disposable bucket', () => {
  const workflow = read('.github/workflows/pr-validation.yml');
  const drill = read('apps/marketplace-api/scripts/artifact-s3-live-drill.ts');
  assert.match(workflow, /ARTIFACT_S3_CREATE_BUCKET: 'true'/);
  assert.match(drill, /process\.env\.ARTIFACT_S3_CREATE_BUCKET === 'true'/);
  assert.match(drill, /new CreateBucketCommand\(\{ Bucket: bucket \}\)/);
  assert.doesNotMatch(drill, /DeleteBucketCommand|DeleteObjectCommand/);
});
