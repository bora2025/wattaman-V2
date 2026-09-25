# MP9 Parent source projection evidence — 2026-09-25

## Scope

Attendance Manager, Examination, Transportation and Communication now publish versioned,
student-keyed read models consumed by Parent Portal's already key-scoped adapters:

- `student-attendance-summary` version 1 is refreshed after committed manual attendance, correction
  and non-replayed scan mutations.
- `student-grade-summary` version 1 is refreshed after committed bulk gradebook scores and completed
  automatic or manual exam grading.
- `student-transport-summary` version 1 is refreshed after rider assignment/removal and vehicle
  location mutations for every currently assigned student.
- `student-communication-summary` version 1 is refreshed after authorized send/read mutations for
  the student participating in that relationship.

Attendance exposes bounded status counts and recent school-day records. It excludes scanner codes,
hashes, coordinates, locations, marker identity, permission reasons and student numbers.
Examination exposes bounded subject/period scores and completed attempt results. It excludes
answers, answer keys, question content, formulas, feedback, per-question marks and grader notes.
Transportation exposes only current active assignments, public vehicle/route descriptors and the
latest position; it excludes driver identity, recorder identity and raw location history.
Communication exposes only total/unread counts and last-activity time; it excludes message content,
sender/receiver identity, participants and recipient lists.

Both projections use the canonical Academic student identifier as their record key. Publication is
post-commit, preventing consumers from observing rolled-back writes. Parent Portal first proves the
dated guardian relationship and then performs a server-side keyed read, rather than loading all
students and filtering locally.

## Local verification

On 2026-09-25 the consolidated source-adapter integration scope passed:

```text
Test Suites: 12 passed, 12 total
Tests:       61 passed, 61 total
```

The scope covered the keyed read-model runtime, Attendance, Finance, Examination, Transportation,
Communication and Parent Portal composition. Assertions verify projection names, versions,
canonical student keys and prohibited sensitive fields. The backend also compiled 319 files and
`git diff --check` passed. This is local contract evidence only; production backfill,
real-PostgreSQL execution and hosted parent-session verification remain open.
