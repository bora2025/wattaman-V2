# WordPress-style Communication PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Certification command

`npm run certify:communication:postgres` requires the exact
`COMMUNICATION_CERTIFY_ALLOW_DROP=communication-only` guard and operates only on the
`plugin_wattanam_communication_` namespace. It:

- verifies checksums and identity headers for all three immutable migrations;
- activates the actual plugin with a PostgreSQL-backed database adapter;
- proves message and delivery-outbox rows commit atomically;
- verifies the student communication projection does not contain message content;
- runs the registered delivery job and verifies receiver-targeted Plugin SDK delivery, stable event
  identity, attempt count and delivered state;
- rejects an unauthorized parent-to-parent message; and
- creates and reads a published school post.

The PostgreSQL 16 PR backend job runs this command after the Academic Management and Human
Resources certifications.

## Local verification

- Certification guard and migration tests: 2 passed.
- Communication source and behavior suites: 8 passed.
- Architecture and clean-core gates remain green.

## Remaining acceptance gap

The first hosted PostgreSQL run, deliberate realtime outage/backoff execution, WebSocket reconnect
and deduplication, restored-backup adoption/rollback, browser/mobile parity and pilot evidence remain
required.

