# MP2 Academic Management production pre-switch evidence — 2026-09-29

Status: pre-switch data and recovery gates passed; production owner switch not authorized.

## Pilot

- Railway project: `wattanam-bora-school-3`
- Installation slug: `angkor-international-school`
- Academic Management: `0.1.12`, signed Stable release, active
- Attendance Manager: `0.1.9`, signed Stable release, active
- Expected and observed Academic owner: `legacy` for all nine boundaries
- Legacy Academic shadow writes: disabled

## Recovery and restored-copy proof

- Recovery dump: `wattanam-20260929T065735Z.dump`
- SHA-256: `1b1d950d7c3a5780ba0c9a246548fdcf14055d093374ba8eb3d54c4d5a7dc045`
- Isolated restore database: `wattanam_academic_restore_20260929`
- Restore target began empty and was distinct from the production `railway` database.
- The restore command verified archive checksum, installation identity and schema lineage.

## Adoption and reconciliation

The following backup-bound, additive adoptions passed their zero-write dry-runs and reconciled in
production and in the isolated restored copy:

1. departments and department memberships;
2. student profiles;
3. enrollment intervals;
4. classes;
5. subjects;
6. admissions registrations, settings and fields;
7. Attendance-owned Study Years.

The aggregate `db:academic-management:cutover-check` returned `ready: true`, an empty blocker list,
matching source/target fingerprints, eight reconciled journals, active required plugins and a valid
legacy-owner checkpoint in both databases.

## Remaining mandatory gate

The focused Academic routing and authorization regression run passed 11 suites and 58 tests covering
Classes, Class Registrations, Study Years, Department routing, Directory integration, session
configuration, identity ownership and authenticated academic reads. This is supporting local evidence,
not a substitute for the hosted browser/API role matrix.

Hosted administrator, teacher and student role/API/browser parity has not yet been accepted. Keep all
nine Academic owner variables set to `legacy` until that gate passes. After acceptance, use a planned
maintenance window for write freeze, owner switch, plugin-owner checkpoint, observation and rollback
exercise. Do not delete the isolated restore database or legacy tables as part of the owner switch.
