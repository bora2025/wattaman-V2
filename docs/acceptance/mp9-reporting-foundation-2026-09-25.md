# MP-9 Reporting local foundation evidence — 2026-09-25

Result: **local foundation passed; hosted certification and cutover remain open**.

Implemented:

- read-only `wattanam.reporting` 0.1.1 package with no migrations or database capability;
- dated Academic class-roster scope and administrator-only execution;
- bounded bulk student-keyed reads from five optional versioned projection contracts;
- privacy-minimized row composition and graceful missing-plugin behavior;
- schema-v2 filter, table and host-owned print/CSV/PDF UI;
- safely escaped BOM-prefixed CSV automation endpoint; and
- SDK bulk-key contract bounded to 500 unique keys; and
- an actor-free Human Resources staff projection composed through a bounded Directory identity set
  into a dated staff table/export.

Verification:

- `plugin-contract-runtime.service.spec.ts`
- `plugin-sdk-contract.spec.ts`
- `reporting-plugin-source.spec.ts`
- `reporting-plugin-behavior.spec.ts`

Together these focused suites pass 14 tests. Backend build, architecture inventory gate and diff
integrity also pass for this worktree: the backend compiled 321 files, the architecture gate owned
1,509 discovered items and classified all 83 models, and `git diff --check` reported no errors.
The public `wattanam-plugin check plugins/wattanam.reporting` path validates the manifest and entry
files and activates the package successfully against the SDK harness. This evidence does not certify real
PostgreSQL behavior, marketplace lifecycle, restored-backup parity, hosted authorization or legacy
cutover.
