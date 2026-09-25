# MP4 Timetable adoption preflight — 2026-09-25

Status: **complete local adoption toolkit; real-PostgreSQL execution remains**.

`backend/scripts/timetable-adoption-preflight.js` inventories the complete eight-dataset scheduling
boundary in dependency order: documents, subjects, classes, classrooms, teachers, lessons, entries
and teacher lesson-attendance. ADR-0019 assigns that last dataset to Timetable; staff employment,
student school-day and course-session attendance remain explicitly excluded.

The preflight emits aggregate counts and SHA-256 fingerprints only. It does not return teacher
names, contact details, QR values, timetable content or schedule rows. It fails closed for malformed
legacy JSON, invalid schedule bounds/statuses, missing required values, invalid audit timestamps,
cross-timetable or missing relationships, absent target tables and non-empty targets.

Verification:

- `npm run test:timetable:adoption` — 6/6 passed for all-dataset deterministic inventory,
  privacy-safe output, malformed-source rejection, relationship validation, ordering and chunk
  bounds, exact guarded dry-run, crash-and-resume copying, eight-dataset reconciliation and
  non-destructive rollback.
- `db:timetable:preflight` is the production read-only command and requires `DATABASE_URL`.
- `db:timetable:dry-run`, `db:timetable:adopt` and `db:timetable:rollback-drill` require an exact
  school-slug confirmation, an approved source fingerprint and a verified school-bound backup.

The copier uses one journal with independent cursors and committed-chunk histories, replays partial
chunks idempotently after a crash, rejects source drift, and requires exact per-dataset and combined
hash reconciliation. Rollback changes routing metadata only and preserves both datasets. This
evidence does not claim cutover: the toolkit still needs execution on restored real PostgreSQL.

Timetable 0.1.2 also adds nullable stable Academic-class and core-user identifiers. New values are
resolved through the capability-gated directory adapter before writes, while timetable-local names
remain historical snapshots and no cross-plugin SQL or foreign key is introduced. The original
eight legacy datasets remain losslessly adoptable with these identifiers unset until operator
mapping is available. Four focused plugin suites pass 16/16 tests, including immutable migration
validation, same-timetable scheduling checks, generator behavior, directory rejection and
teacher-lesson-attendance behavior.

The 0.1.3 runtime owns permission-separated mark and QR-scan mutations plus date-range and monthly
reports. Marks validate teacher/date/period/status and use a database transaction with the
`teacherId/date/period` uniqueness boundary, so concurrent retries converge on one record. QR codes
are resolved server-side; report queries are scoped to the requested timetable and bounded. Hosted
role/browser parity and real-PostgreSQL concurrency proof remain open.

The plugin-owned `/plugins/wattanam.timetable/teacher-attendance` entry now opens the existing rich
workspace in explicit plugin mode. Its timetable list, range report, manual mark and QR scan all run
through the namespaced plugin API adapter. Plugin-owned `/scheduled-teachers` and `/teacher-scan`
entries likewise open the existing Wattaman workspaces in explicit plugin mode; scheduled-teacher
listing, teacher edits and live scanner submissions are translated to the namespaced runtime routes.
The legacy endpoint paths remain available only for the rollback distribution. The complete four-suite
Timetable regression run passes 16/16, and the production frontend build compiled and prerendered
all 132 static pages, including all three attendance-related plugin entries. This is local UI
evidence, not hosted role/browser/device certification.

Generator preview and atomic save now apply configured time-off windows against `periodTimes`, a
per-class `maxOnDay`, and structured `distribution.maxSameSubjectPerDay`. Malformed constraints
fail closed, constrained schedules remain deterministic, and incomplete plans are returned without
replacing saved entries. The existing transaction still locks the document and rejects document,
lesson or room drift before deleting/replacing entries. Focused generator/behavior tests pass 10/10;
real-PostgreSQL concurrent-edit certification remains open.
