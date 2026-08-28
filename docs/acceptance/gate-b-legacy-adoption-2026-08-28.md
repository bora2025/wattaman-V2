# Gate B Legacy Adoption Evidence — 2026-08-28

Scope: B-001–003 implementation and a synthetic PostgreSQL 18 adoption drill. This evidence does not substitute for the two sanitized real legacy snapshots required by the master plan.

## Source fixture

The isolated fixture applied only `20260827000000_baseline`, then created one synthetic existing `SUPER_ADMIN` through parameterized Prisma access. Preflight reported:

```text
state: legacy_unadopted
tables: 68
columns: 711
migrations: 0
schemaFingerprint: 4cd495f66f76be3e282f5e386abc309c098012c43b804edf8d2e075d7fedbc73
containsCustomerRows: false
```

Fixture creation uses one PostgreSQL transaction. An earlier interrupted fixture exposed this requirement: unwrapped DDL produced a partial disposable schema, which was discarded. The corrected tool is atomic and can resume only from an empty or valid baseline-only state.

## Adoption controls exercised

- Explicit non-interactive guard and exact slug confirmation.
- Exact reviewed source fingerprint.
- Existing `SUPER_ADMIN` lookup before mutation.
- Native PostgreSQL custom backup before migration bookkeeping.
- Recovery journal written before `migrate resolve`.
- Journal binds slug, fingerprint, archive filename, size and SHA-256.
- Journal validates the backup manifest and rejects path traversal.
- Baseline recorded as applied without executing it again.
- Three post-baseline migrations deployed normally.
- Installation identity, site name and append-only adoption audit committed transactionally.
- `--resume` required when a journal exists.

## Results

The first command returned `installed` for `legacy-fixture-school`. A second command with `--resume` reported no pending migrations and returned the identical installation identity.

Post-adoption preflight reported:

```text
state: managed
tables: 75
columns: 773
migrations: 4
schemaFingerprint: 9d05f932d8b4a8443a50da0658f56170a7349566224942677a96fd52e2f2065f
```

Safe preservation proof returned:

```json
{"usersPreserved":true,"fixtureOwnerRole":"SUPER_ADMIN","installationPresent":true,"installationCount":1,"adoptionAuditCount":1,"schoolSlugMatches":true}
```

## Verification suite

```text
legacy adoption: 4 tests passed
legacy fixture: 1 test passed
legacy preflight: 5 tests passed
legacy status: 1 test passed
backend Jest: 21 suites, 75 tests passed
backend build: 156 files compiled
```

## Cleanup

All temporary adoption variables were removed. The synthetic recovery journal, dump and manifest were deleted by exact path; the real `angkor-school` backup remained. Disposable database services were deleted. Railway may show their detached volumes until the provider soft-deletion window expires. Deleted synthetic files and databases are not recoverable.

Remaining Gate B proof: acquire, handle and adopt two sanitized real legacy snapshots; compare model counts, relations and critical journeys before/after; rehearse failure/resume and restore against those snapshots.
