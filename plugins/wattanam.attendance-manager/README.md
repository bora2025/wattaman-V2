# Attendance Manager

Official Wattanam plugin for Study Years and student, teacher, and staff attendance. It owns manual
attendance, camera/QR and USB keyboard-wedge scanning, corrections, sessions, holidays, reports,
printing/export contracts, and attendance lifecycle events.

The first release uses additive namespaced tables. It does not delete or mutate legacy attendance
data. Production cutover requires the adoption, reconciliation, rollback, device, and report-parity
gates in `docs/architecture/module-to-plugin-migration-plan.md`.
