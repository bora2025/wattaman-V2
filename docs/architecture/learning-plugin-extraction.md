# Learning plugin extraction worksheet

Status: complete namespaced data foundation, scoped course/assignment discovery and creation,
course lifecycle, lesson/page authoring, roster enrollment/discovery, answer-key-safe lesson player,
manual grading and non-destructive attempt reset implemented locally; remaining workflows,
adoption and certification remain open.

## Ownership boundary

`wattanam.learning` owns assignments, submissions, quiz questions/answers, courses, lessons, pages,
enrollment, lesson attempts/responses/views, engagement, course sessions and course-specific
attendance. Academic Management owns class/student identity and enrollment rosters. Learning stores
only stable Academic and core directory identifiers and has no cross-plugin database foreign keys.

## Legacy inventory

| Slice | Legacy models | Target |
| --- | --- | --- |
| Assignments and quizzes | `Assignment`, `AssignmentSubmission`, `QuizQuestion`, `QuizAnswer` | Four namespaced Learning tables |
| Courses and lesson player | `Course`, `CourseLesson`, `LessonPage`, `CourseEnrollment`, `LessonAttempt`, `PageResponse`, `LessonView` | Seven namespaced Learning tables |
| Course attendance | `CourseSession`, `CourseAttendance` | Two namespaced Learning tables; not school-day Attendance Manager data |
| UI | Student/teacher course, lesson, assignment, quiz, grading, engagement and attendance routes | Plugin APIs and trusted/declarative plugin UI |

## Implemented foundation

Version 0.1.2 defines all 13 domain tables in 14 immutable, dependency-ordered migrations with internal cascade
constraints, lifecycle/bounds checks, external Academic/directory identities, six granular
permissions, Academic dependency and two permission-gated discovery pages. Course and assignment
creation validate creator/class references through capability-gated directory contracts; teacher
discovery is limited to creator-owned or assigned-class records. Course publication requires a
lesson and follows an explicit transition graph; lesson/page mutation is creator/admin-only,
same-lesson branch targets fail closed, and published lessons cannot be deleted. Enrollment and
student discovery use dated Academic rosters and stable student/directory identities without direct
legacy table access. Legacy routes remain authoritative.

The student player resolves the learner through the dated roster, requires a non-dropped course
enrollment, reuses an in-progress attempt under a transaction lock, enforces attempt limits and
upserts one response per page. Authoring validates the complete legacy question set. Student page
projections strip solution IDs, accepted answers, correct mappings and dictation scripts; responses
are auto-graded with partial credit where supported, while essays remain explicitly pending manual
grading. Finish requires every question page and atomically selects `COMPLETED` or
`AWAITING_GRADE`. Course creators and administrators can inspect pending responses and assign
bounded scores under row locks; the final pending score completes and evaluates the attempt
atomically. Reset preserves history by changing the attempt to `ABANDONED`, is idempotent, and
notifies the learner only after the database transaction commits.

Assignment quizzes now reuse that rich-question validation, redaction and grading contract. The
creator can author questions only while the assignment is draft; students discover published work
through Academic class membership, start bounded attempts under a row lock, receive an answer-key-
safe projection, and upsert owned answers with time-limit enforcement. Finish is atomic, requires
every question, applies the configured late penalty, and waits for bounded creator/admin manual
grading where required. Migration `014_allow_assignment_attempts` replaces the original one-
submission uniqueness constraint with assignment/student/attempt identity; because the platform
classifies any dropped constraint as destructive, lifecycle execution must explicitly approve it
even though the statement does not delete submission rows.

Engagement and course-session attendance are also plugin-owned locally. Enrolled learners record
monotonic lesson opens/watch progress through their dated Academic identity. Course creators manage
bounded sessions and upsert attendance only for current roster students. The creator/assigned-class
engagement projection combines enrollment progress, lesson opens/completions and attended course
sessions without reading Attendance Manager's school-day records.

Seven declarative pages now expose teacher course creation/workspaces, lesson-page authoring,
pending-grade review, assignment/quiz authoring, and student course/assignment discovery through
the host renderer. Every data source is contract-checked against a runtime route and identical
permission; the production frontend build passes ([local UI evidence](../acceptance/mp6-learning-declarative-ui-2026-09-25.md)).

## Remaining gates

1. Extend the implemented lesson/page authoring and course lifecycle slice with rich trusted-host UI.
2. Certify the implemented roster enrollment/student discovery and transaction-locked lesson player on real PostgreSQL.
3. Certify the implemented rich assignment-quiz contract and answer-key safety on hosted PostgreSQL.
4. Certify engagement and course-session attendance concurrency and row scope on real PostgreSQL.
5. Run the implemented privacy-safe 13-dataset preflight, backup-bound adoption/reconciliation and
   metadata-only rollback toolkit against a restored production-shaped PostgreSQL backup
   ([local evidence](../acceptance/mp6-learning-adoption-preflight-2026-09-25.md)).
6. Extend the implemented host-rendered teacher/student workspaces to full legacy interaction
   parity, then certify accessibility and real devices.
7. Certify signed lifecycle, restored-backup adoption, portable recovery and hosted pilot before cutover.
