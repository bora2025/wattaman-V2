# Examination plugin extraction worksheet

Status: namespaced data foundation and read-only discovery slice implemented; workflow extraction,
legacy adoption and certification remain open.

## Ownership boundary

`wattanam.examination` owns exams, questions, attempts, manual and automatic grading, score sheets,
score-sheet class assignments, gradebook subjects, reporting periods and score entries. It stores
stable Academic class/student/subject identifiers and core directory-user identifiers without
cross-plugin SQL or foreign keys. Academic Management remains the owner of students, classes and
canonical subjects. Timetable is an optional source of schedule-local subject mappings only.

## Legacy inventory

| Surface | Legacy location | Target |
| --- | --- | --- |
| Exam/question/attempt workflows | `backend/src/exam`, `Exam`, `ExamQuestion`, `ExamAttempt` | Examination API and three namespaced tables |
| Score sheets and entries | `backend/src/scoring`, `ScoreSheet`, `ScoreSheetClass`, `ScoreSubject`, `ScoreExamTab`, `ScoreEntry` | Gradebook API and five namespaced tables |
| Exam administration and taking | `/admin/exams`, `/teacher/exams/*`, `/student/exams/*` | Plugin-owned trusted-host workflows |
| Gradebook and score printing | `/admin/scoring*`, `/teacher/gradebook`, `/student/scores`, parent grade view | Plugin UI plus stable read-model adapter for Parent Portal |

## Implemented foundation

Version 0.1.3 declares eight additive domain tables plus compatible owner/directory-user columns
through ten dependency-ordered migrations, six granular permissions,
Academic dependency, optional Timetable dependency, two permission-gated navigation entries,
exam/question management, read-only gradebook discovery and declarative fallback pages. Exam
creation writes questions atomically; external creator/class identifiers are resolved through
capability-gated directories; teacher reads are class-scoped; non-admin mutations are creator-owned;
only drafts may be edited/deleted; and publication requires at least one question. The student slice
uses the dated Academic roster contract, strips answer keys server-side, resumes or creates attempts
under a transaction lock, enforces active windows and attempt limits, saves only owned in-progress
attempts, atomically submits and auto-grades MCQ/true-false answers, queues other answers for manual
grading, restricts manual grading and attempt lists to the creator/administrator, and lets an
authorized operator reset an attempt with an in-app notification. Gradebooks now have creator/class
row scope, atomic create/update of class bindings, subjects and reporting-period creation, and a
bounded transactionally upserted score-entry batch validated against the dated Academic roster and
the selected gradebook's subject/period boundary. Direct detail/report reads enforce the same row
scope as discovery; subjects and reporting periods support guarded update/delete; scores cannot
exceed the subject maximum; and the report projection joins only namespaced score data to dated
Academic roster snapshots with a 50,000-entry bound. Database constraints
cover lifecycle states, non-negative marks and attempts, valid time ranges, and uniqueness of
student attempts and score entries. Its plugin-owned question contract now validates, redacts and
grades the same MCQ, true/false, text, essay, paragraph-sort, drag-word, fill-blank, drag/drop,
speech and dictation types used by the legacy examination surface, including partial credit and
manual essay grading. A row-scoped gradebook report page exposes a bounded, flattened projection
through the shared print/CSV/PDF renderer. The package is not published and does not replace legacy
authority.

The adoption toolkit inventories all eight legacy datasets in dependency order, validates
relationships and lifecycle values, checks target absence/emptiness and emits only counts and
deterministic hashes. Its copier requires a verified school-bound recovery backup, an exact school
slug and an explicitly approved source fingerprint; it journals idempotent chunks, resumes after a
crash and requires exact source/target count-and-hash reconciliation. The rollback drill changes
routing metadata only and preserves both datasets
([evidence](../acceptance/mp5-examination-adoption-preflight-2026-09-25.md)). These guarantees pass
locally but have not yet been executed against restored PostgreSQL, so this is not cutover evidence.

## Remaining gates

1. Certify exam/question CRUD, answer-key redaction and attempt locking on real PostgreSQL.
2. Certify the locally completed rich-question validation, redaction and grading parity through
   hosted student/teacher browser workflows; creator/administrator reset with in-app notification
   is also implemented locally.
3. Certify the locally completed bounded print/CSV/PDF gradebook projection and bulk-entry
   concurrency on real PostgreSQL. Canonical subject IDs now fail closed through the
   capability-gated Academic subject lookup contract.
4. Route rich admin/teacher/student/parent UI through plugin APIs and certify reports/printing/accessibility.
5. Execute the completed backup-bound adoption, exact reconciliation and metadata-only rollback
   toolkit for all eight datasets on restored PostgreSQL and retain the signed drill artifacts.
6. Certify signed clean install, real-PostgreSQL CRUD/concurrency, disable/update/remove/reinstall, portable backup/restore and hosted role/browser workflows.
7. Switch legacy routes only after parity and rollback proof; remove legacy tables only after the approved support window.
