# Wattanam Academic Management

Academic Management owns study years, departments, subjects, classes, officer profiles, student
profiles, enrollment intervals, admissions, and attendance. Version 0.1.16 merged the complete
Attendance Manager runtime and declarative UI into this plugin: manual recording, camera/QR and USB
scanning, corrections, attendance sessions, holidays, identifiers, alerts, reports, printing, and
CSV export. The attendance runtime uses the Academic Management namespace and its canonical Study
Year records.

Version 0.1.20 includes the dedicated Study Years workspace and the secure self-attendance design described by the monolith planning
documents. Authorized staff open a class/session window and receive short-lived, rotating
Ed25519-signed tokens. Authenticated students can scan only for themselves; the backend validates
the signature, installation identity, class enrollment, session, token lifetime, holiday, optional
geofence, optional registered device, offline age, and idempotency key before writing the canonical
attendance record. Every accepted or rejected attempt is auditable, and suspicious offline or
location submissions enter a staff review queue.

The release also adds four-session staff scanning and staff reports using the shared attendance
record model. Staff identifiers and staff session rules are configured from Attendance Settings.
The declarative student scanner submits signed QR values safely and exposes device registration
and personal history. Durable browser-side IndexedDB queuing remains a Customer School host
capability; this plugin accepts, validates, deduplicates, and reviews delayed submissions without
trusting arbitrary client timestamps.

Study Years includes create, edit, set-current, and guarded-delete workflows. Classes link into
plugin-owned detail and roster pages. Officer accounts remain owned by the Customer School core
directory; this plugin stores only their academic employment profile and attendance records.

Keep the standalone Attendance Manager installed during a staged production transition until its
historical data has been adopted and rollback verification is complete. This release does not
automatically delete or migrate data owned by an existing standalone installation.

Legacy source tables are preserved during adoption and are not removed by these migrations.
