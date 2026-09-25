# MP2 Academic Department ownership — 2026-09-25

## Result

Academic Management 0.1.7 now owns Department runtime CRUD after the explicit
`ACADEMIC_DEPARTMENTS_ROUTE_OWNER=plugin` cutover. Core compatibility endpoints dispatch to the
active plugin and do not call the legacy provider in that mode. Legacy remains the default and
rollback owner until the hosted adoption gate authorizes the switch.

## Implemented boundary

- Plugin-owned list, detail, create, update and delete routes use only the namespaced Department
  and membership tables.
- Create/update/delete require an administrator principal even if a broader permission grant is
  accidentally configured.
- Delete requires the deterministic `delete-department:<id>` key and atomically removes membership
  rows before the Department row.
- Create/update/delete publish durable lifecycle events inside the owner transaction.
- Declarative pages provide Department list, create and edit workflows without rebuilding core.
  Route identifiers accept deterministic adopted legacy IDs as well as new IDs.
- The compatibility controller retains legacy-default rollback while routing every operation to
  the plugin once the explicit owner setting changes.

## Verification

- Department compatibility controller: 3/3 passed.
- Academic reference plugin: 14/14 passed.
- Plugin CLI manifest, migration checksum, entrypoint and activation validation: all passed.
- Backend build: 302 files compiled.

This is local implementation evidence. Real PostgreSQL adoption, restored-backup reconciliation,
hosted route/UI certification and rollback remain required before enabling the owner setting in
production.
