# WordPress-style core deployment smoke automation — 2026-09-26

## Scope

This evidence records the executable CI acceptance harness for a fresh self-hosted lean-core school.
It does **not** claim that Railway, paid-commerce, released-image self-hosting or production
approval gates have passed. Those remain separate acceptance requirements.

## Implemented evidence

- `.github/workflows/pr-validation.yml` has an isolated `core-deployment-smoke` job.
- The job builds the physical API and web artifacts from `backend/Dockerfile.core` and
  `frontend/Dockerfile.core`, plus the production gateway image.
- `docker-compose.core.yml` boots PostgreSQL, API, web and gateway with the explicit `core`
  distribution and persistent PostgreSQL/API volumes.
- `tools/core-deployment-smoke.js` waits for public readiness, verifies the runtime distribution,
  checks the fresh setup state and UI, proves representative optional pages are absent, completes a
  real HTTP installation, verifies persisted installation identity, and rejects a repeat install.
- The workflow queries PostgreSQL directly to require the `Installation` table and reject
  representative legacy business tables.
- The operations-profile backup container creates a non-empty recovery artifact in the persistent
  API volume.
- Failure logs are captured and containers/volumes are always removed from the isolated runner.

## Local contract verification

Run on 2026-09-26:

```text
node --test tools/core-deployment-smoke-contract.test.js \
  tools/core-deployment-blueprint-contract.test.js \
  tools/core-release-workflow-contract.test.js

tests 6
pass 6
fail 0
```

`git diff --check` also completed without whitespace errors; its output contained only the existing
Windows line-ending notices.

## Local production-shaped execution

The first real Docker execution on 2026-09-26 initially contradicted the earlier source-level
evidence and exposed two release-blocking defects:

1. The API core compiler still type-checked the entire optional legacy source tree against an
   ungenerated Prisma client inside Docker (944 errors).
2. The web standalone output preserved the isolated workspace's absolute dependency junction and
   crashed with `Cannot find module 'next'` in the runner image.

The implementation was corrected without expanding core ownership:

- `tsconfig.core.json` now admits only `src/main-core.ts` as a root, so TypeScript follows the
  reachable core import graph rather than every legacy source file.
- The Docker builder creates the legacy Prisma client only for compile-time superset types and
  aliases the bundled runtime to `generated/core-client`; the runner contains only
  `prisma/core`, never `prisma/schema.prisma`.
- The frontend keeps the fast dependency junction during compilation, then materializes a portable
  dependency tree inside the successful standalone output before the runner stage copies it.

After those fixes, real local Docker evidence passed:

```text
API core Docker build: webpack compiled successfully
Web core Docker build: 27 core routes generated; optional attendance/timetable/examination pages absent
PostgreSQL core migrations: 3/3 applied
API readiness: healthy (core distribution)
Web readiness: healthy
Gateway startup: successful
Fresh HTTP installation: core-smoke-school
Repeat installation: rejected
Core schema assertion: DO (passed)
Backup: wattanam-20260926T062042Z.dump, 57,800 bytes
Backup manifest: 418 bytes; schemaLineage=wattanam-core-v1
Legacy schema in API runner: absent
```

## Full recovery-set round trip

The deployment drill was then extended from a database-only backup to the supported recovery-set
format: database dump, immutable plugin files, mutable plugin data and a checksum-binding journal.
It restores into a second profile-gated PostgreSQL service and a separate recovery volume, so the
source installation is never the restore target.

The first real restore failed closed before swapping plugin directories because `pg_dump 18` had
written a `transaction_timeout` directive that the PostgreSQL 16 target did not support. The core
operations image now installs supported PostgreSQL 16 and 18 clients and selects `pg_dump` and
`pg_restore` from the major matching the connected server. Unit tests cover major selection and
invalid input.

The repeated production-shaped round trip passed:

```text
Recovery journal: wattanam-recovery-20260926T063345Z.recovery-set.json
Database archive: 57,119 bytes, SHA-256 verified, PostgreSQL 16 client
Plugin files archive: 10,240 bytes, one SHA-256-bound artifact file
Plugin data archive: 10,240 bytes, one SHA-256-bound mutable-data file
Target identity before restore: EMPTY
Restored school: core-smoke-school
Restored lineage: wattanam-core-v1
Restored plugin files: 1/1 exact checksum and content
Restored plugin data: 1/1 exact checksum and content
```

The PR workflow now performs this same backup/restore/reconciliation sequence automatically.

## Hosted CI execution

GitHub Actions workflow run `36521359176`, job `core-deployment-smoke`
(`109254725474`), passed on 2026-09-29 from commit `1201f34`. The hosted Ubuntu runner completed
every required step:

- deployment smoke contracts;
- physical core API, web and gateway image builds;
- runtime-image development-tooling and legacy-Prisma rejection;
- isolated topology configuration and fresh HTTP installation;
- exact core-only database verification;
- full recovery-set creation; and
- restore/reconciliation into the isolated target database and plugin-data volume.

The cleanup step also passed and removed the disposable topology. This closes the first hosted-CI
green-run requirement for source-built physical core images. It does not substitute for booting the
published `0.2.0` digests on an operator-controlled self-hosted host or clean Railway project.

## Exact released-image execution

Workflow `core-released-image-smoke.yml` deliberately does not build application images. It
downloads the retained `core-0.2.0-release-evidence` artifact, verifies the school blueprint,
authenticates to the private GHCR package, verifies all three keyless Cosign signatures, reads the
immutable image references from that blueprint, and boots those exact digests through
`docker-compose.core.yml`.

Run `36521972883`, job `109256616774`, passed on 2026-09-29 from commit `59a3b2a`. It proved:

- retained blueprint verification and all three immutable image signatures;
- deployment of API, web and gateway `0.2.0` digests without any `docker build` step;
- fresh HTTP installation and repeat-install rejection;
- exact migration-derived core-only schema verification;
- recovery-set creation containing database, plugin package and mutable plugin data; and
- restore/reconciliation into an isolated PostgreSQL and filesystem target.

Cleanup passed. This closes the ephemeral hosted-Docker execution of the released self-hosted
blueprint. A persistent operator-controlled host and clean Railway project remain distinct gates.

The isolated containers, network and both disposable volumes were removed after evidence capture.

## Remaining acceptance

- Execute the same released digest set on a persistent operator-controlled self-hosted environment.
- Execute the released digest set on a clean Railway project.
- Repeat the second-database restore/reconciliation sequence with released digests in Railway.
- Link the production-shaped marketplace and exercise one signed free and one paid plugin through
  install, activate, update, disable, uninstall and reinstall.
- Obtain release, security and operations approvals before making `core` the provisioning default.
