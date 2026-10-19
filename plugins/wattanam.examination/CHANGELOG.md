# Changelog

## 0.2.0

- Upgrade examination and score-sheet workspaces to the universal SDK 1.3 declarative UI contract.

## 0.1.7

- Execute attempt advisory locks through the mutation adapter so PostgreSQL `void` results are never deserialized.

## 0.1.6

- Declare the operational contract and expose the standard runtime health probe.

## 0.1.5

- Serialize first-attempt creation with a transaction-scoped advisory lock so concurrent start
  requests return one stable attempt instead of racing the unique constraint.
- Publish an extension-driven dashboard contribution.
- Add real-PostgreSQL lifecycle and concurrency certification without changing migration bytes.

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
