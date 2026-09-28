# Wattanam Examination

This package is the target owner for exams, questions, attempts, grading, score sheets and
gradebooks. Version 0.1.5 provides the additive namespaced data boundary, scoped authoring,
answer-key-safe delivery, serialized attempts, grading, gradebooks and minimized student summary
projections. It is not a production cutover: legacy data remains authoritative until adoption,
reconciliation, rollback and full workflow certification pass.

External Academic class, student, subject and directory-user identifiers are stored as stable IDs.
The package deliberately creates no foreign keys to core or another plugin's tables.
