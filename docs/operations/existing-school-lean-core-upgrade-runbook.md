# Existing-school upgrade to lean core and official plugins

Status: executable runbook; each school still requires its own signed acceptance record.  
Audience: release engineer, database operator, school owner and support lead.

This runbook migrates a supported `legacy-full` school without deleting legacy data. It does not
authorize a production cutover by itself. A school is supported only when its current core version,
database schema and business data pass every applicable preflight below. Any other installation
requires a documented exception and stays on its existing release.

## 1. Invariants

- Never run adoption against the only copy of a school database.
- Install signed plugin packages and their additive migrations before adoption.
- Keep route/read owners on `legacy` through preflight, dry-run, copy and reconciliation.
- Use one immutable `pg_dump` recovery archive and its school-bound manifest for the entire wave.
- Copy data; never rename, truncate or delete legacy tables during the rollback window.
- Treat source fingerprints, school slugs, currency/exponent policy and backup hashes as approvals,
  not convenient defaults.
- Stop on any count, hash, parity, journal, permission, health or browser discrepancy.
- Change one ownership boundary at a time, observe it, and retain the immediate `legacy` rollback.
- Never put database URLs, owner passwords, signing keys or access tokens in evidence files.

## 2. Dependency and cutover order

1. Document Designer and Human Resources may be installed independently.
2. Install Academic Management before Attendance Manager, Examination, Learning, Finance,
   Communication or Reporting.
3. Install Timetable, Transportation and Parent Portal when their required runtime contracts are
   available; their optional integrations must degrade safely.
4. Adopt and certify Academic identities/classes/enrollments/subjects/admissions before switching
   dependent plugin routes.
5. Adopt Attendance Manager and its Study Year ownership before certifying attendance consumers.
6. Adopt Timetable, Examination and Learning separately.
7. Adopt Transportation, Communication, Finance, Human Resources and Parent Portal separately.
8. Install Reporting last. It owns no data and consumes only Directory/read-model contracts.

## 3. Prepare the recovery point

From `backend/`, with the target school's `DATABASE_URL` available only to the process:

```powershell
npm.cmd run db:migrate:status
npm.cmd run backup:create
npm.cmd run recovery-set:create
```

Record the non-secret archive filename, manifest hash, school slug, core version and plugin versions.
Restore the recovery set into a disposable PostgreSQL instance and run the complete rehearsal there
before touching production. Keep `BACKUP_DIR` absolute and restricted to the verified backup folder.

## 4. Per-plugin command matrix

Run only rows applicable to the school's enabled legacy features. `preflight` is read-only;
`dry-run` verifies the approved fingerprint, empty target and backup binding without creating a
journal; `adopt` performs resumable additive copy and exact reconciliation; `rollback-drill`
restores routing/registry ownership without deleting either dataset.

| Domain | Preflight | Dry-run | Adopt | Rollback drill |
| --- | --- | --- | --- | --- |
| Document Designer | `npm.cmd run db:document-designer:preflight` | `npm.cmd run db:document-designer:dry-run` | `npm.cmd run db:document-designer:adopt` | `npm.cmd run db:document-designer:rollback-drill` |
| Academic aggregate | `npm.cmd run db:academic-management:preflight` | `npm.cmd run db:academic-management:dry-run` | `npm.cmd run db:academic-management:adopt` | run the component drills below |
| Academic student profiles | `npm.cmd run db:academic-student-profiles:preflight` | `npm.cmd run db:academic-student-profiles:dry-run` | `npm.cmd run db:academic-student-profiles:adopt` | `npm.cmd run db:academic-student-profiles:rollback-drill` |
| Academic enrollments | `npm.cmd run db:academic-enrollment:preflight` | same zero-write preflight command | `npm.cmd run db:academic-enrollment:adopt` | `npm.cmd run db:academic-enrollment:rollback-drill` |
| Academic classes | `npm.cmd run db:academic-classes:preflight` | `npm.cmd run db:academic-classes:dry-run` | `npm.cmd run db:academic-classes:adopt` | `npm.cmd run db:academic-classes:rollback-drill` |
| Academic subjects | `npm.cmd run db:academic-subjects:preflight` | `npm.cmd run db:academic-subjects:dry-run` | `npm.cmd run db:academic-subjects:adopt` | `npm.cmd run db:academic-subjects:rollback-drill` |
| Academic admissions | `npm.cmd run db:academic-admissions:preflight` | `npm.cmd run db:academic-admissions:dry-run` | `npm.cmd run db:academic-admissions:adopt` | `npm.cmd run db:academic-admissions:rollback-drill` |
| Attendance/Study Years | `npm.cmd run db:attendance:preflight` | `npm.cmd run db:attendance:dry-run` | `npm.cmd run db:attendance:adopt` | `npm.cmd run db:attendance:rollback-drill` |
| Timetable | `npm.cmd run db:timetable:preflight` | `npm.cmd run db:timetable:dry-run` | `npm.cmd run db:timetable:adopt` | `npm.cmd run db:timetable:rollback-drill` |
| Examination | `npm.cmd run db:examination:preflight` | `npm.cmd run db:examination:dry-run` | `npm.cmd run db:examination:adopt` | `npm.cmd run db:examination:rollback-drill` |
| Learning | `npm.cmd run db:learning:preflight` | `npm.cmd run db:learning:dry-run` | `npm.cmd run db:learning:adopt` | `npm.cmd run db:learning:rollback-drill` |
| Transportation | `npm.cmd run db:transportation:preflight` | `npm.cmd run db:transportation:dry-run` | `npm.cmd run db:transportation:adopt` | `npm.cmd run db:transportation:rollback-drill` |
| Communication | `npm.cmd run db:communication:preflight` | `npm.cmd run db:communication:dry-run` | `npm.cmd run db:communication:adopt` | `npm.cmd run db:communication:rollback-drill` |
| Finance | `npm.cmd run db:finance:preflight` | `npm.cmd run db:finance:dry-run` | `npm.cmd run db:finance:adopt` | `npm.cmd run db:finance:rollback-drill` |
| Human Resources | `npm.cmd run db:human-resources:preflight` | `npm.cmd run db:human-resources:dry-run` | `npm.cmd run db:human-resources:adopt` | `npm.cmd run db:human-resources:rollback-drill` |
| Parent Portal | `npm.cmd run db:parent-portal:preflight` | `npm.cmd run db:parent-portal:dry-run` | `npm.cmd run db:parent-portal:adopt` | `npm.cmd run db:parent-portal:rollback-drill` |

Reporting has no legacy tables or adoption command. Install it only after its required Academic
dependency and the desired optional projection providers are healthy.

## 5. Confirmation variables

Every domain command requires `DATABASE_URL` and an absolute `BACKUP_DIR`. The guarded adoption
scripts additionally require the exact backup filename, school slug, matching confirmation slug,
preflight SHA-256 and a domain-specific non-interactive flag. Prefixes are:

- `DOCUMENT_DESIGNER_*`, using `DOCUMENT_DESIGNER_ADOPT_NON_INTERACTIVE=true`;
- `ATTENDANCE_*`, `TIMETABLE_*`, `EXAMINATION_*`, `LEARNING_*`, `TRANSPORTATION_*`,
  `COMMUNICATION_*`, `FINANCE_*`, `HR_*`, and `PARENT_PORTAL_*`, each using
  `<PREFIX>_ADOPTION_NON_INTERACTIVE=true`;
- Academic component scripts document their exact confirmation fields in their preflight output.

Finance and HR also require an explicitly approved three-letter currency and minor-unit exponent.
Copy the fingerprint from the immediately preceding preflight; never reuse one from another school
or an older backup.

## 6. Cutover and observation

After a successful exact reconciliation, change only the documented owner variables for that
domain from `legacy` to `plugin`. Academic has separate owner variables for roster reads,
departments, profiles, identity detach, classes and admissions; do not switch them as one untested
bundle. Other rollback drills validate their domain route-owner variable.

For each boundary:

1. Restart API and worker with the same core/plugin artifact digests.
2. Verify plugin health, permissions, navigation and direct deep-link denial.
3. Exercise one create/read/update/report flow for every affected role.
4. Compare counts, monetary totals, attendance totals and rendered output with the legacy source.
5. Confirm jobs, realtime delivery and notifications do not duplicate.
6. Observe logs, latency, error rate and adoption journal state for the approved window.
7. Record non-secret evidence and obtain the school-owner acceptance.

## 7. Rollback

On any discrepancy, stop writes for the affected workflow, restore its owner variable to `legacy`,
run the domain rollback drill, restart API/worker and verify the legacy workflow. Do not delete the
plugin dataset: it is evidence for reconciliation and incident analysis. Restore the full recovery
set only when routing rollback cannot recover service or source data was changed unexpectedly.

The minimum rollback record contains the trigger, timestamps, versions/digests, journal stage,
parity result, owner variables before/after, health checks and approver. It contains no secrets or
student/staff records.

## 8. Rollback window and cleanup

Keep legacy tables and compatibility routes for at least one supported core release and 90 days
after that school's cutover, as required by ADR-0017. Cleanup needs explicit product, support,
operations and school-owner approval plus a fresh portable backup/restore drill. Until then the
school remains an upgraded dual-dataset installation, not proof that legacy schema can be removed
globally.

## 9. Exceptions

If a preflight reports an unsupported schema, ambiguous identity, unsafe monetary conversion,
missing provenance, duplicate active record, incomplete historical interval or changed source
fingerprint, do not edit the journal or bypass the guard. Open a school-specific exception that
states the affected data, remediation, accountable approver, recovery point and re-test evidence.
The installation remains on `legacy-full` until the exception is resolved or the legacy release is
formally retained for that school.
