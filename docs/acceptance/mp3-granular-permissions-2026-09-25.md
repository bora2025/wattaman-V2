# MP3 granular permission contract — 2026-09-25

Result: **complete at local permission-enforcement scope**

Attendance Manager now declares the required granular grants:

- `view`
- `scan`
- `mark`
- `correct`
- `report`
- `print`
- `configure`
- `devices.manage`

Current routes and navigation use the granular permissions rather than the previous coarse
`manage`/`export` grants. Corrections require `correct`; both print data and CSV export require
`print`. Those two old IDs remain
declared and clearly labelled deprecated so an installed beta can migrate grants without making its
manifest history invalid; no current route uses them. The declarative UI contains only student
identifier/session choices and its permissions match the route declarations.

```text
npm test -- --runInBand \
  src/plugins/plugin-ui-schema.spec.ts \
  src/plugins/attendance-manager-plugin-source.spec.ts
PASS: 33 tests

node packages/plugin-cli/bin/cli.js check plugins/wattanam.attendance-manager
ALL CHECKS PASSED
```

The correction test also proves an atomic before/after history row and durable correction event.
Role/data row scopes remain a separate MP3-009 requirement.
