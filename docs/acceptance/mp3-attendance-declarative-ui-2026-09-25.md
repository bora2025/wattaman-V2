# MP3 Attendance declarative UI evidence — 2026-09-25

Status: **local implementation complete; hosted browser and physical-device certification remain**.

## Scope delivered

- Attendance Manager owns declarative pages for recent student attendance, camera/USB scanning,
  correction selection and editing, reports/print/export, Study Years, sessions, holidays and scan
  identifiers.
- The scanner captures required class and session context and submits the input mode, client clock
  and a retry-stable idempotency key to the unified scan command.
- The correction workflow loads a single scoped student record, displays its immutable snapshots,
  and writes status, permission type and a mandatory correction reason through the dedicated
  `correct` permission.
- Both the plugin manifest and runtime register the correction navigation item. The record lookup
  route applies the same Academic-backed row-scope policy used by list, scan, report and correction
  mutations.
- The UI schema validates scanner context fields and rejects duplicate identifiers, unsafe field
  types and empty select declarations.

## Verification

- `npm.cmd test -- --runInBand src/plugins/plugin-ui-schema.spec.ts src/plugins/attendance-manager-plugin-source.spec.ts`
  — 2 suites, 37 tests passed.
- `npm.cmd run build` in `frontend/` — production Next.js compilation, TypeScript checking and 129
  static pages completed successfully.
- `node packages/plugin-cli/bin/cli.js check plugins/wattanam.attendance-manager` — manifest,
  migration checksums, entries and activation harness all passed.

## Remaining certification

MP3-010 is not marked fully complete until the pages have been exercised in a hosted school with
administrator and teacher grants. Camera, QR/card and USB hardware proof remains MP3-014 rather than
being inferred from local rendering and source tests.
