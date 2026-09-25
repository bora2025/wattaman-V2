# MP2 Class compatibility reads — 2026-09-25

Status: local plugin-owner routing verified; hosted certification remains open.

Academic Management 0.1.5 closes three compatibility read gaps:

- parent selection resolves core identities through the Directory capability and is administrator-only;
- multi-class roster lookup accepts at most 100 unique class IDs and enforces owner-side scope for
  every requested class before reading plugin-owned profiles/enrollments;
- available-student lookup is administrator-only, bounded to 500, and selects profiles with no
  current enrollment from plugin-owned tables.

`GET /classes/:id/students` also now dispatches to its existing plugin owner route whenever
`ACADEMIC_CLASSES_ROUTE_OWNER=plugin`; it no longer silently reads legacy Student rows in that mode.

CSV roster import remains fail-closed. The legacy operation creates/updates core User accounts, so
it must be redesigned as a core identity bulk command plus Academic enrollment command. Granting
the plugin direct User-table writes would violate the accepted boundary.

Verification:

- Classes compatibility controller suite: 3/3 passed.
- Academic Management reference suite: 13/13 passed.
- Backend build: 302 files compiled.
