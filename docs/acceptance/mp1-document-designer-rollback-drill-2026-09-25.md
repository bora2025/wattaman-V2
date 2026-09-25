# MP1 Document Designer Rollback Drill — Local Evidence

Date: 2026-09-25
Status: local non-destructive rollback verified; restored-backup certification remains open

`db:document-designer:rollback-drill` now verifies the school-bound backup, current legacy source
fingerprint, exact adoption-journal identity, backup hash and reconciled journal stage before it
returns route ownership to `legacy`. It records the rollback in the journal and disables plugin
routing without deleting either legacy `CardTemplate` rows or namespaced plugin templates.

The combined adoption and rollback suite passes 7/7 checks, including explicit confirmation,
zero-write dry-run, crash-safe resume, exact reconciliation, tamper rejection and data-preserving
rollback. A restored production-like PostgreSQL execution and post-rollback UI check remain open.
