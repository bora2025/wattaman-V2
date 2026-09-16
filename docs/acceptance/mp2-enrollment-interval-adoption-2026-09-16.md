# MP2 Enrollment Interval Adoption — Local Evidence

Date: 2026-09-16
Status: additive migration and local adoption proof; no live execution

Academic Management migration `003_create_enrollment_interval.sql` adds the namespaced
`plugin_wattanam_academic_management_enrollment_interval` table. It stores student/class stable
IDs, inclusive `validFrom`, nullable `validTo`, provenance, and timestamps. Constraints reject an
end date before its start and permit only one open interval per student. Legacy tables are not
altered or deleted.

`academic-enrollment-adopt.js` creates one deterministic open interval for each legacy Student with
a current `classId`, starting on the Student creation date. Preflight emits only counts, blockers,
and a SHA-256 fingerprint. Mutation requires an exact school slug, approved source fingerprint,
verified school-bound recovery backup, empty installed target, maintenance lock, and a resumable
journal. It rechecks the legacy fingerprint and exactly reconciles target rows before recording
`reconciled`.

Verification:

- 3/3 focused interval/adoption tests pass.
- 3/3 Academic Management package contract tests pass.
- Plugin CLI validates all three migration checksums and entry points.

Limitations: current legacy data cannot reconstruct earlier class transfers, so adoption creates
only the present open interval. No live restored-backup adoption, concurrency drill, plugin read
cutover, or rollback certification has run. Historical Attendance reports must remain disabled
until interval history is populated from an authoritative source or begins accumulating after an
approved cutover.
