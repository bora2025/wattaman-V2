# Official plugin PostgreSQL runtime certification — 2026-09-28

## Result

All official data-bearing and read-model plugins passed their guarded runtime certifications against
an isolated PostgreSQL 16.14 database. This was a live database execution, not a mocked adapter or
workflow-contract assertion.

| Plugin | Verified result |
| --- | --- |
| Academic Management | 10 tables, 51 routes, durable events and database uniqueness |
| Document Designer | template/asset lifecycle and one-active-template invariant |
| Attendance Manager 0.1.8 | six migrations, 11 tables, 29 routes, single-current Study Year, corrections and alert delivery |
| Timetable 0.1.6 | ten migrations, eight tables, 37 routes, non-mutating preview, collision serialization, generation and teacher attendance |
| Examination 0.1.7 | ten migrations, eight tables, 31 routes, concurrent attempt start/submit, answer-key redaction and gradebook |
| Learning 0.1.5 | fourteen migrations, 13 tables, 40 routes, concurrent attempt lifecycle, redaction and course attendance |
| Communication | three tables, ten routes and receiver-targeted delivery |
| Transportation | five tables, 19 routes, recipient resolution and parent scope |
| Finance 0.1.3 | four tables, concurrent overpayment prevention, immutable receipt and compensating reversal |
| Human Resources | six tables, eight routes and serialized payroll approval |
| Parent Portal | link-request storage, serialized resolution, row scope and optional-provider degradation |
| Reporting | zero owned tables, keyed read models, optional-provider degradation and formula-safe CSV |

Announcements is covered by the signed all-plugin lifecycle suite and recovery drill; it does not
have a separate dedicated PostgreSQL certification command.

## Defects found and corrected

Live execution found defects that adapter-only tests did not expose:

- the Academic uniqueness assertion did not recognize Prisma's PostgreSQL `23505` signal;
- Attendance and Timetable passed ISO timestamp strings without explicit `timestamptz` casts;
- Examination and Attendance attempted to deserialize PostgreSQL advisory-lock `void` results;
- Learning passed its course-session timestamp without an explicit cast;
- Finance passed a textual restored receipt amount into a `bigint` column;
- the Parent Portal certification runner submitted a multi-statement migration as one prepared
  statement instead of using the same statement splitting as the production installer.

Every affected runtime was corrected and patch-bumped before re-certification. All five modified
plugin certifications passed again on their new manifest versions. The Parent Portal runner also
passed after alignment with production migration execution.

## Safety and cleanup

Every destructive certification required its plugin-specific exact allow guard and operated only on
that plugin's namespace. Learning additionally required the exact destructive-migration approval.
Reporting wrote only records with the certification key prefix. The isolated database container was
removed after the successful runs.

## Remaining acceptance

This closes the local PostgreSQL runtime-execution gap. It does not replace hosted Railway runs,
browser/device parity, restored-production-data rehearsals, controlled customer pilots or formal
security/privacy/finance/support/operations approval.
