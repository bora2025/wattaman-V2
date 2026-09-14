# LC-4 Runtime, artifacts and cross-plugin contracts

Status: in progress

## LC4-001 — immutable artifact origin

Implemented on 2026-09-14:

- marketplace artifact persistence is abstracted behind `ArtifactStorage`;
- new keys are strictly `sha256/<first-two>/<digest>.wtp`;
- bytes are hashed again at the provider boundary before any write;
- local compatibility storage uses create-only hard links and verifies an existing object's digest;
- the S3-compatible provider records SHA-256 metadata/checksum, sends `If-None-Match: *`, and never
  exposes bucket paths in repository metadata;
- downloads stream through the selected provider while retaining immutable HTTP caching and ETags;
- Railway can select S3 with `ARTIFACT_STORAGE_PROVIDER=s3`, bucket, region, optional endpoint and
  paired credentials. Workload identity/default AWS credentials are supported when static keys are
  omitted.

Automated verification:

- marketplace full suite: 36 suites and 386 tests passed;
- marketplace TypeScript build passed;
- provider tests cover deterministic keys, byte-exact reads, idempotent identical writes, digest
  mismatch, corrupted-object refusal and traversal refusal.

Remaining before final acceptance: configure a production-shaped S3-compatible bucket and capture
a live create/read/attempted-overwrite drill. Until that evidence exists, LC4-001 remains in progress.
