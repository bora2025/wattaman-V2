# MP5 Examination adoption preflight — 2026-09-25

Status: **local preflight, guarded copier, reconciliation and rollback drill complete; real-PostgreSQL execution remains**.

`backend/scripts/examination-adoption-preflight.js` inventories all eight legacy datasets in
dependency order: score sheets, class bindings, gradebook subjects, reporting periods, score
entries, exams, questions and attempts. It normalizes legacy class/student/directory identifiers
to the plugin boundary, deliberately leaves timetable-local subject IDs unmapped rather than
misrepresenting them as canonical Academic subjects, and derives an attempt's core user ID only
through the legacy Student relation.

The output contains only per-dataset counts and SHA-256 fingerprints. Question text, answer keys,
student answers, feedback, teacher/student identifiers and names are never emitted. Validation
fails closed for malformed JSON, invalid timestamps/lifecycle values/bounds, broken parent-child
relationships, unordered chunks, absent target tables and non-empty targets.

`backend/scripts/examination-adopt.js` binds an exact approved source fingerprint to a verified,
school-bound recovery backup. Its guarded dry-run makes no writes; the adoption path journals each
idempotent chunk, resumes after interruption, detects source changes and requires exact per-dataset
and aggregate reconciliation. `backend/scripts/examination-rollback-drill.js` accepts only a
reconciled journal and switches routing metadata back to legacy without deleting either dataset.

Verification:

- `npm run test:examination:adoption` — 6/6 tests pass for deterministic eight-dataset inventory,
  privacy-safe output, malformed-source rejection, relationship validation, target emptiness,
  ordering and chunk limits, exact-slug guards, zero-write dry-run, simulated crash/resume, exact
  reconciliation and non-destructive rollback.
- `npm run db:examination:preflight` is read-only and requires `DATABASE_URL`.
- `npm run db:examination:dry-run`, `db:examination:adopt` and
  `db:examination:rollback-drill` are implemented with explicit non-interactive, slug, fingerprint,
  backup and rollback guards.
- No real-PostgreSQL adoption or production cutover is claimed by this evidence. Execute the
  commands against a restored recovery set and retain the artifacts before switching route owners.
