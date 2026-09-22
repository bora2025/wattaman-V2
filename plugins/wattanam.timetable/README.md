# Timetable plugin

This official plugin owns new timetable data in the `plugin_wattanam_timetable_` namespace. Version 0.1.1 contains document, subject, class, classroom, teacher, lesson and entry tables; permission-gated CRUD routes; collision-safe schedule generation with a non-mutating preview; declarative fallback pages; and the trusted rich timetable workspace shared with Wattanam core. The workspace provides the existing wizard, entity management, scheduling board, drag-and-drop entry editing, generation, printing and exports while sending timetable mutations exclusively through the plugin API.

The legacy `backend/src/timetable` service remains available during the rollback window. New plugin installations use plugin-owned tables and APIs. Existing schools still require the planned journaled data-adoption and reconciliation drill before legacy routes or tables can be retired. Teacher-attendance records belong to Attendance Manager, not this plugin.
