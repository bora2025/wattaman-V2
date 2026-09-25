# MP3 Academic roster and historical snapshot contract — 2026-09-25

Result: **local contract complete; production lifecycle remains MP3-015**

## Implementation

- The public SDK and backend runtime add two backward-compatible `directory.read` methods:
  `getClassRoster(classId, asOfIsoDate)` and `getEnrollmentAtDate(studentId, asOfIsoDate)`.
- Both return the already-established `wattanam.academic-management.roster@1.0.0` contract through
  `DirectoryService`; plugin-owned Academic mode fails closed when Academic Management is inactive
  or returns an invalid payload.
- Attendance Manager declares `directory.read` and calls the dated class-roster contract before any
  attendance write. A student absent from that roster is rejected before a database transaction.
- The accepted roster supplies student name/number and class name. The plugin reads its own Study
  Year table, then persists all four display snapshots with the attendance record.
- Conflict updates deliberately retain original snapshots, preserving the historical display state
  rather than silently rewriting old records after a student/class rename.
- Attendance SQL still references only `plugin_wattanam_attendance_manager_*`; the runtime namespace
  guard prevents direct Academic table access.

## Verification

```text
npm test -- --runInBand \
  src/plugins/attendance-manager-plugin-source.spec.ts \
  src/plugins/plugin-runtime.service.spec.ts \
  src/plugins/plugin-sdk-contract.spec.ts
PASS: 20 tests

npm run build (backend)
PASS: 304 files compiled

npm run build && npm test -- --runInBand (packages/plugin-sdk)
PASS: build and 12 tests

node packages/plugin-cli/bin/cli.js check plugins/wattanam.attendance-manager
ALL CHECKS PASSED
```

This closes MP3-004 and MP3-005 at implementation/contract scope. It does not claim legacy data
adoption, real-device certification or hosted install/update/recovery.
