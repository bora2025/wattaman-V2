# MP3 Attendance reports evidence — 2026-09-25

Status: **report projection and interactive filter UI complete locally; hosted parity proof remains**.

## Implemented report contract

Attendance Manager now owns these student school-day projections:

- status summary with class, student, exact date, date range, status and session filters;
- daily attendance grid;
- individual student detail;
- month/day/status trend;
- class progress against the dated Academic roster;
- snapshot-based print data;
- UTF-8 CSV data with a BOM and stable student/class snapshot columns;
- browser print, CSV and PDF generation through the declarative plugin UI;
- declarative class, student, start/end date, session and status controls that refresh only the
  report sources named by the descriptor and clear without leaving stale query state.

All projections use one validator and the MP3-009 row-scope policy. Teachers must supply an assigned
class; student and parent access is restricted by the dated Academic roster. Invalid dates, reversed
ranges, unsupported statuses and sessions outside 1–4 fail closed. Employee, lesson and course
attendance remain excluded.

## Verification

- `npm.cmd test -- --runInBand src/plugins/plugin-ui-schema.spec.ts src/plugins/attendance-manager-plugin-source.spec.ts`
  — 2 suites and 39 tests passed, including shared filter validation, row scope, summary, print,
  CSV, class progress, monthly trend and the safe generic query-filter descriptor contract.
- `npm.cmd run build` in `frontend/` — production compilation, TypeScript checking and all 129
  static pages completed successfully with the query-filter renderer.

## Remaining work

- Run browser comparison against the frozen legacy daily grid, class progress, trend, student detail,
  print, CSV and PDF surfaces in a hosted school.
- Decide whether XLSX remains a product requirement. The frozen plan requires CSV/PDF/print; XLSX is
  a legacy surface but is not claimed complete by this evidence.
