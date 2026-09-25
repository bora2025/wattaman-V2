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
- concurrent API instances now converge safely: if another instance wins between HEAD and the
  conditional PUT, the loser accepts the precondition failure only after re-reading and validating
  the winner's SHA-256 metadata and byte length;
- downloads stream through the selected provider while retaining immutable HTTP caching and ETags;
- Railway can select S3 with `ARTIFACT_STORAGE_PROVIDER=s3`, bucket, region, optional endpoint and
  paired credentials. Workload identity/default AWS credentials are supported when static keys are
  omitted.

Automated verification:

- marketplace full suite: 36 suites and 386 tests passed;
- marketplace TypeScript build passed;
- provider tests cover deterministic keys, byte-exact reads, idempotent identical writes, digest
  mismatch, corrupted-object refusal and traversal refusal.
- the focused artifact-storage suite passes 5/5, including verified and mismatched concurrent S3
  winner paths; the marketplace TypeScript build passes.

Production-shaped drill command (run from `apps/marketplace-api` with a dedicated real bucket or
prefix-safe test bucket):

```powershell
$env:ARTIFACT_S3_BUCKET='wattanam-production-artifacts'
$env:ARTIFACT_S3_REGION='ap-southeast-1'
# Set ARTIFACT_S3_ENDPOINT and ARTIFACT_S3_FORCE_PATH_STYLE=true only for an S3-compatible service.
# Set the paired access-key variables only when workload identity is unavailable.
npm.cmd run drill:artifact-s3
```

The drill creates one random content-addressed audit object, races two independent provider
instances, constructs a third provider to simulate restart, streams and re-hashes the object,
attempts a conditional overwrite, verifies the original bytes remain, and emits a JSON evidence
record. It intentionally retains the immutable object for audit. Do not paste credentials into the
evidence file.

Remaining before final acceptance: run the checked-in drill against the production-shaped
S3-compatible bucket and capture its non-secret JSON result, deployment/service identity, provider
version and timestamp. Until that evidence exists, LC4-001 remains in progress.

## LC4-002–015 — runtime and consistency contracts

Implemented on 2026-09-14:

- API and worker use independent local caches keyed by the marketplace SHA-256; install seeds the
  cache, while restart/cache-loss retrieves the artifact using installation-signed authorization
  when a paid release requires it. Every provider boundary and runtime load re-verifies content.
- `PluginArtifactGeneration` stages rollout identity and `PluginArtifactReadiness` records the digest
  verified by each required role. Split deployments require `api` and `worker`; the old active
  generation remains recoverable and `POST /plugins/:id/rollback` restores it atomically.
- split-role production refuses local mutable storage. S3-compatible storage supports workload
  identity, static credential pairs and the already-tested dual-write migration modes.
- recovery sets include the immutable cache. Plugin removal only removes the version directory;
  cached/withdrawn artifacts remain available for entitled restore and rollback.
- parameterized routes reject traversal and ambiguous shapes. Optional versioned request, response
  and declared-error schemas fail closed at the host dispatch boundary.
- transactional durable publication, idempotent consumer receipts, subject-key ordering, expiring
  claims, exponential retry, dead letters and versioned read models are implemented on PostgreSQL.
- dependency state distinguishes required from optional. Required dependencies gate activation and
  block unsafe disable; optional dependencies expose an availability check for degraded operation.
- host boundaries enforce request, SQL, concurrent-job, total/per-file storage, daily notification
  and realtime quotas.
- safe disable stops timers/new leases first, drains bounded in-flight jobs, invokes cleanup and then
  unregisters routes, durable consumers, permissions, navigation and pages.

Schema parity:

- `20260914090000_plugin_contract_runtime` exists for legacy-full and lean-core migrations.
- `20260914100000_plugin_artifact_generations` exists for legacy-full and lean-core migrations.

Automated evidence is supplied by `plugin-artifact-cache.service.spec.ts`,
`plugin-rollout.service.spec.ts`, `plugin-contract-runtime.service.spec.ts`,
`plugin-extensions.service.spec.ts`, `plugin-resource-quota.service.spec.ts`,
`plugin-jobs.service.spec.ts`, `plugin-storage.service.spec.ts`, `plugin-sql-guard.spec.ts`, and the
existing object-storage/runtime/lifecycle suites. The final verification counts below are updated
after the complete backend and marketplace runs.

Final local verification on 2026-09-14:

- backend: 71 suites, 421 tests passed; Nest/SWC production build passed;
- marketplace API: 37 suites, 389 tests passed; TypeScript build passed; npm audit reported zero
  vulnerabilities;
- published plugin SDK 1.1: 2 suites, 12 tests passed; TypeScript declaration build passed;
- `git diff --check`: passed (line-ending conversion notices only).

LC4-002 through LC4-015 are complete. LC4 as a whole remains in progress solely because LC4-001's
production-shaped S3 immutability drill requires configured external object storage; that remaining
live-environment proof is not represented as complete by these local results.
