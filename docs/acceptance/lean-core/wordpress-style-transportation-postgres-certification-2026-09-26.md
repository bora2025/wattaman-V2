# WordPress-style Transportation PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Certified release

Transportation `0.1.3` adds extension-driven dashboard metadata without changing any published
migration bytes. Its database remains confined to five `plugin_wattanam_transportation_*` tables,
and school identities remain stable references supplied through Academic Management and Directory
contracts rather than foreign keys into core business tables.

## Certification command

`npm run certify:transportation:postgres` requires the exact
`TRANSPORTATION_CERTIFY_ALLOW_DROP=transportation-only` guard and then:

- discovers and removes only Transportation-namespaced certification tables;
- verifies every immutable migration checksum and identity header before applying it;
- activates the real plugin with a PostgreSQL-backed runtime adapter;
- validates its extension-driven dashboard contribution;
- creates a route, stop and Directory-validated vehicle through plugin routes;
- creates a rider assignment only after validating the dated Academic roster;
- writes a live location inside the plugin transaction boundary;
- verifies student and linked-parent delivery without notifying unrelated accounts;
- verifies the student read model excludes driver identity;
- verifies the parent tracking route returns only the caller's roster-linked child; and
- proves invalid coordinates fail before a location write can commit.

The PostgreSQL 16 PR backend job runs this certification after Learning with the exact namespace
guard. The script refuses to run without both a database URL and that guard.

## Local verification

- Certification guard and immutable migration harness: 2 passed.
- Backup-bound adoption, reconciliation and metadata-only rollback: 4 passed.
- Transportation source and runtime behavior suites: 11 passed.
- The backend build and architecture gates remain required before handoff.

## Remaining acceptance gap

The first hosted PostgreSQL run, execution against a restored production-shaped backup, legacy Bus
route cutover, real GPS/device ingestion, browser/map and accessibility parity, portable
backup/restore, full plugin lifecycle and a controlled school pilot remain required before
production cutover.
