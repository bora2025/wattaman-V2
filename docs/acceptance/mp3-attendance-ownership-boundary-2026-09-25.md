# MP3 Attendance ownership boundary — 2026-09-25

Result: **local implementation verified; hosted lifecycle certification remains MP3-015**

## Boundary

The accepted [ADR-0019](../architecture/adr/0019-attendance-ownership.md) is now enforced by the
Attendance Manager package:

- Attendance Manager accepts and returns student school-day attendance only.
- Employee daily attendance belongs to Human Resources.
- Teacher lesson attendance belongs to Timetable.
- Course-session attendance belongs to Learning.

The frozen source inventory is [MP3 attendance surface inventory](../architecture/mp3-attendance-surface-inventory.md).

## Durable implementation

- Attendance Manager `0.1.3` rejects non-`STUDENT` record, identifier, session and report/read
  requests before a database write.
- Migration `003_enforce_student_boundary` adds `NOT VALID` student-only constraints to record,
  identifier and session tables. PostgreSQL therefore rejects future violating inserts/updates while
  preserving excluded historical rows for migration export and rollback.
- The package description, permission copy and README no longer promise staff or teacher attendance.
- `ownership-manifest.json` assigns `StaffAttendance` and `StaffWeeklySchedule` to Human Resources;
  Timetable and Learning ownership remains unchanged.
- The clean-core schema contract now includes the core-owned `PluginAccountCommand` journal that was
  added during MP2, eliminating unrelated contract drift discovered during this gate.

## Verification

```text
npm test -- --runInBand src/plugins/attendance-manager-plugin-source.spec.ts
PASS: 3 tests

node packages/plugin-cli/bin/cli.js check plugins/wattanam.attendance-manager
ALL CHECKS PASSED (manifest, all three migration checksums, entries, activation)

node tools/core-schema-contract.test.js
PASS: 4 tests

npm run architecture:inventory:gate
PASS: 1437 discovered items owned; 83 models classified
```

This evidence closes MP3-002 only. It does not claim data adoption, real-device behavior, hosted
install/update/recovery, report parity or production pilot completion.
