# Wattanam Examination

This package is the target owner for exams, questions, attempts, grading, score sheets and
gradebooks. Version 0.1.0 establishes an additive namespaced data boundary and read-only discovery
routes. It is not a production cutover: legacy data remains authoritative until adoption,
reconciliation, rollback and full workflow certification pass.

External Academic class, student, subject and directory-user identifiers are stored as stable IDs.
The package deliberately creates no foreign keys to core or another plugin's tables.
