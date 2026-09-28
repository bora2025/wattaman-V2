# Wattanam Academic Management

Academic Management owns departments, subjects, classes, student profiles, enrollment intervals,
and admissions. Attendance Manager is the sole Study Year owner; this plugin consumes its versioned
read model when decorating class responses. The historical Academic Study Year migration is retained
only for immutable upgrade compatibility.

Official Academic Management plugin. Version 0.1.0 establishes the department and account
membership namespace required for the MP-2 adoption toolkit. Classes, study years, admissions,
enrollment, rosters and lifecycle events remain planned and must not be represented as complete.

Legacy source tables are preserved during adoption and are not removed by these migrations.
Department mutation routes and UI actions are intentionally absent in this interim package:
legacy account assignment and membership readers still use the original schema.
