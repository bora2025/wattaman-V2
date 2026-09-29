# Wattanam Academic Management

Academic Management owns study years, departments, subjects, classes, student profiles, enrollment
intervals, and admissions. Version 0.1.14 restores Study Years to the academic aggregate and exposes
the existing rich Study Years and Manage Classes workflows through plugin navigation. Attendance
Manager remains supported during the staged ownership transition; its historical study-year routes
must not be removed until production adoption and rollback gates pass.

Official Academic Management plugin. Version 0.1.0 establishes the department and account
membership namespace required for the MP-2 adoption toolkit. Classes, study years, admissions,
enrollment, rosters and lifecycle events remain planned and must not be represented as complete.

Legacy source tables are preserved during adoption and are not removed by these migrations.
Department mutation routes and UI actions are intentionally absent in this interim package:
legacy account assignment and membership readers still use the original schema.
