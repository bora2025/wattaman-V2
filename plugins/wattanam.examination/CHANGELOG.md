# Changelog

## 0.1.4

- Publish a student-keyed, privacy-minimized grade summary after committed gradebook and exam
  grading mutations for Parent Portal consumption.
- Exclude answers, answer keys, question content, formulas, feedback and manual-grading notes from
  the projection.

## 0.1.3

- Align examination questions with the legacy rich-question contract: MCQ, true/false, text,
  essay, paragraph sorting, drag words, fill blanks, drag/drop, speech and dictation.
- Validate and canonicalize type-specific authoring data before persistence.
- Remove answer keys and solution mappings from student projections.
- Add automatic and partial-credit grading parity while retaining essays for manual grading.

## 0.1.2

- Add compatible attempt directory identity and gradebook owner migrations.
- Add scoped exam, attempt and gradebook workflows backed by Academic directory contracts.
