# WordPress-style plugin recovery contract v2

Date: 2026-09-28  
Status: **implementation and local PostgreSQL 16 restore verified; hosted portability pending**

## Requirement

An operational manifest declaration is useful only if backup and restore enforce it. A recovery set
must bind the exact immutable plugin manifests, database/file participation, data classifications,
retention and restore requirement to the database and filesystem artifacts it protects.

## Implementation

- Recovery-set format v2 inventories every installed plugin generation under `PLUGIN_DIR`.
- Each inventory record binds plugin ID, version, manifest path and manifest SHA-256 to its
  operational declaration.
- Database-participating plugins require a bound database artifact.
- File-participating plugins receive a preserved namespace under `PLUGIN_DATA_DIR`, including when
  it is empty at backup time.
- Restore stages and checksum-verifies both archives, then verifies every operational contract
  before the database or live plugin directories are touched.
- Manifest drift, missing file namespaces, duplicate identities, unknown classifications,
  delete-on-uninstall declarations and incomplete backup declarations fail restoration.
- V1 journals remain restorable for backward compatibility.
- Historical immutable rollback generations that predate the contract are preserved and recorded
  as explicit `legacyException` entries. `REQUIRE_PLUGIN_BACKUP_CONTRACTS=true` rejects them in
  strict certification. Backup status distinguishes a checksum-verified journal from a fully
  contract-verified recovery set and reports the exception count.

## Local verification

```text
node --test scripts/plugin-recovery-contract.test.js scripts/db-toolkit.test.js scripts/restore-recovery-set.test.js

10 passed, 0 failed

npm test -- --runInBand src/backup/backup.service.spec.ts

8 passed, 0 failed

npm run build

Backend build passed

Core deployment/blueprint/image contracts: 8 passed, 0 failed
```

Required PR deployment smoke now creates a structurally valid operational plugin and mutable file
namespace, enables strict contract mode, requires a v2 journal with zero legacy exceptions, restores
it into isolated database/file targets, and reconciles both the manifest and mutable state.

The production core image initially exposed a missing runtime dependency: the recovery scripts were
copied without `plugin-recovery-contract.js`. `Dockerfile.core` now includes it and a contract test
pins that image boundary. The core backup service also now receives
`REQUIRE_PLUGIN_BACKUP_CONTRACTS`; a service-scoped compose assertion prevents configuration drift.

## PostgreSQL 16 recovery execution

On 2026-09-28 the freshly built core API image and the physical web/gateway images were started with
an isolated PostgreSQL 16 database. A real Wattanam Announcements 0.1.1 generation and mutable file
were added to the persistent volumes. Strict backup produced:

- API image: `sha256:b2d6552b428d4f2ae9e8c683b83100b8340ad6e1d2736e95a4915f32eaeacfb2`
- Web image: `sha256:be032639d281cf3f21e5d100aa451e50ab94537f0b0f00c06b58767f710e419b`
- Gateway image: `sha256:67a39a845692d6bd74fa616bd1ff6662f848b189c74351eaa7f67543905c729f`

```text
format: wattanam-recovery-set-v2
pluginCount: 1
legacyExceptionCount: 0
contractVerification.verified: true
```

The recovery set restored into separate database and filesystem volumes. Restore reported eight
verified plugin files and one verified mutable-data file. The restored school database connected,
the exact plugin manifest and mutable-state sentinel were present, and the clean-core schema
verifier reported 29 canonical tables with zero unexpected tables.

## Remaining acceptance

The local self-hosted PostgreSQL requirement is complete. Railway execution remains open and must
record the journal, image/artifact digests, restored plugin registry, health results and data
reconciliation before the overall production gate can close.
