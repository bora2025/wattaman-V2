# MP3 Attendance alert lifecycle evidence — 2026-09-25

Status: **complete local contract evidence**.

Attendance Manager 0.1.5 registers one 15-minute absence evaluator through the core
`jobs.schedule` capability. It evaluates enabled threshold/window rules against student school-day
absence only, resolves the dated Academic roster, and delivers to the student and linked parent by
configured in-app and namespaced realtime channels.

## Safety properties

- Core prevents overlapping executions and uses a PostgreSQL advisory lock across replicas.
- Core skips plugin jobs while school access is suspended.
- Disabling/unloading the plugin unregisters its timer, marks definitions disabled and drains any
  in-flight handler before teardown.
- Every alert has a stable window/person/rule idempotency key.
- Migration `005_add_alert_delivery_ledger` adds a unique alert/recipient/channel ledger. A retry
  skips successful deliveries and retries only pending or failed deliveries.
- Alert and delivery attempts retain failure text and counters. Operators can review and acknowledge
  alerts through permission-gated routes and declarative UI.
- Realtime event names are wrapped by core as `plugin:wattanam.attendance-manager:attendance:alert`;
  the plugin cannot spoof core or another plugin namespace.

## Verification

- Attendance source tests prove job registration, recipient resolution, in-app delivery, realtime
  delivery, alert idempotency and acknowledgement permission.
- Core `plugin-jobs.service.spec.ts` proves no overlap, persisted failure state, suspension skip,
  disable/drain behavior and distributed lease behavior.
- Combined command: 3 suites, 47 tests passed.
- Plugin CLI validates all five immutable migrations, checksums, entries and activation harness.

Hosted timing is part of MP3-015 lifecycle certification, not a reason to weaken the deterministic
job and retry contract proved here.
