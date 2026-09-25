# MP3 Attendance row scope — 2026-09-25

Result: **complete at local authorization-contract scope**

Attendance Manager now enforces data scope inside its handlers after the core permission check:

- school administrators have school-wide access;
- `WATTAMAN` retains school-wide scanner scope but can read only if separately granted a read/report
  permission;
- teachers and class administrators must receive the class from Academic Management's versioned
  `classesForUser` contract;
- students are restricted to their own Academic roster identity;
- parents are restricted to students whose roster snapshot names them as parent;
- scoped roles must supply a class, and multi-child parents must identify the requested child;
- manual marking, scanning, corrections, record reads, reports, print data and CSV export share the
  same scope helper rather than implementing divergent filters.

The focused test proves that an unassigned teacher and a student requesting another student are
rejected before the attendance query, while the matching parent receives only the requested
class/student filter.

```text
npm test -- --runInBand src/plugins/attendance-manager-plugin-source.spec.ts
PASS: 8 tests
```

Hosted browser/session tests remain part of MP3-010/015, not this local handler contract.
