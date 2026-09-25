# Attendance Manager

Official Wattanam plugin for Study Years and student school-day attendance. It owns manual student
attendance, camera/QR and USB keyboard-wedge scanning, corrections, class sessions, holidays,
student reports, printing/export contracts, and attendance lifecycle events. Employee daily
attendance belongs to Human Resources, lesson attendance to Timetable, and course-session
attendance to Learning as required by ADR-0019.

Attendance Manager is the canonical Study Year owner. It publishes the versioned `study-year`
read model consumed by Academic Management classes; Academic stores only the external Study Year
ID and does not write Attendance tables.

The first release uses additive namespaced tables. It does not delete or mutate legacy attendance
data. Production cutover requires the adoption, reconciliation, rollback, device, and report-parity
gates in `docs/architecture/module-to-plugin-migration-plan.md`.
