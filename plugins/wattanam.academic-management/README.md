# Wattanam Academic Management

Academic Management owns study years, departments, subjects, classes, officer profiles, student
profiles, enrollment intervals, admissions, and attendance. Version 0.1.16 merges the complete
Attendance Manager runtime and declarative UI into this plugin: manual recording, camera/QR and USB
scanning, corrections, attendance sessions, holidays, identifiers, alerts, reports, printing, and
CSV export. The attendance runtime uses the Academic Management namespace and its canonical Study
Year records.

Study Years includes create, edit, set-current, and guarded-delete workflows. Classes link into
plugin-owned detail and roster pages. Officer accounts remain owned by the Customer School core
directory; this plugin stores only their academic employment profile and attendance records.

Keep the standalone Attendance Manager installed during a staged production transition until its
historical data has been adopted and rollback verification is complete. This release does not
automatically delete or migrate data owned by an existing standalone installation.

Legacy source tables are preserved during adoption and are not removed by these migrations.
Department mutation routes and UI actions are intentionally absent in this interim package:
legacy account assignment and membership readers still use the original schema.
