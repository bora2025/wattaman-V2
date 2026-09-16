# MP-1 Document Designer Certification Evidence

Date: 2026-09-15
Status: pass for initial package contract; full Document Designer extraction remains open
Wave: MP-1 low-coupling proof

## Goal

Validate Document Designer package and runtime contract behavior as the second MP-1 low-coupling proof stream.

## Commands executed

From repository root:

- node packages/plugin-cli/bin/cli.js check plugins/wattanam.document-designer

From backend workspace:

- node scripts/document-designer-reference-plugin.test.js

From frontend workspace:

- npm.cmd run test:plugin-ui:e2e -- document-designer-ui.spec.ts --project=desktop

## Results

Plugin compatibility check:

- PASS plugin.json is a valid manifest
- PASS migration file exists: migrations/001_create_template.sql
- PASS migration checksum matches plugin.json: 001_create_template
- PASS entry file exists: backend/index.js
- PASS entry file exists: frontend/page.json
- PASS backend entry exports { id, activate }
- PASS activate(context) runs against local harness without throwing
- ALL CHECKS PASSED

Document Designer backend contract test:

- tests: 6
- pass: 6
- fail: 0
- cancelled: 0
- skipped: 0

Passing tests:

- registers document designer permissions, navigation, and route set
- template routes enforce validation and active-template behavior
- declarative UI page descriptor aligns with plugin navigation and permissions
- namespaced migration is one statement with active-by-type uniqueness
- re-activation preserves existing template data across simulated disable/remove/reinstall
- print/export flow is not yet configured as routes or declarative page actions in this wave

Document Designer host-render UI test:

- Suites: 1 passed
- Tests: 2 passed
- Failures: 0

Passing tests:

- renders document-designer list page from plugin descriptor and supports create flow
- renders document-designer detail page route via plugin host

## What this certifies

- Manifest, migration checksum, and entry-point integrity are valid.
- Runtime activation contract and registration of permissions/navigation/routes succeed.
- Template handlers are locally validated and use the host's SELECT-only query and
  INSERT/UPDATE/DELETE-only execute boundaries. Active switching uses a transaction and
  ordered row locks; it still requires a real PostgreSQL concurrency drill.
- Declarative UI descriptor wiring and permissions align with plugin metadata.
- Host-rendered plugin UI pages resolve and render from plugin-provided page descriptors without rebuilding core frontend/API images.
- Lifecycle data-preservation semantics are validated for this package scope by re-activation with persisted template rows.
- File/export/print behavior is validated as not yet configured in package version 0.1.0; no executable print/export routes or declarative page actions are present.

## Remaining scope

This is not certification of the complete Document Designer business feature. Legacy template
adoption/reconciliation, canvas editor, generation, print/export, scoped assets, marketplace
installation, hosted lifecycle/restore and pilot remain open under MP1-004 through MP1-012.
The MP-1 low-coupling proof gate uses the separately recertified Announcements plugin.
