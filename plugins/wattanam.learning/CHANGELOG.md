# Changelog

## 0.1.2

- Add an immutable, explicitly approval-gated multi-attempt assignment-submission identity migration.
- Add creator-scoped rich quiz-question authoring and deletion.
- Add dated-roster student assignment discovery and locked attempt start.
- Add answer-key-safe quiz delivery, time-limit enforcement, response upsert and automatic grading.
- Add atomic quiz completion, late penalty calculation and bounded creator/admin manual grading.
- Add enrollment-gated lesson engagement tracking with monotonic watch progress.
- Add creator-scoped course sessions, roster-validated attendance and engagement reporting.
- Expand the host-rendered UI to teacher course/lesson/enrollment/session/engagement and assignment/
  rich-question workspaces plus student course and assignment discovery.

## 0.1.1

- Add creator-scoped course lifecycle and lesson/page authoring.
- Add dated-roster enrollment and student course discovery.
- Add enrollment-gated, transaction-locked lesson attempts, response upserts and completion.
- Validate rich lesson questions, redact answer keys and auto-grade supported question types.
- Preserve essay/manual-grade responses as pending instead of inventing scores.
- Add creator/admin-scoped pending-grade review and transaction-locked bounded manual scoring.
- Add idempotent, history-preserving attempt reset with post-commit learner notification.

## 0.1.0

- Establish the 13-table namespaced Learning data foundation.
- Add granular permissions and scoped course/assignment discovery and creation.
