# Changelog

## 0.2.0

- Upgrade course, lesson, assignment, quiz, session, attendance, and learner workspaces to the universal SDK 1.3 declarative UI contract.

## 0.1.5

- Cast course-session timestamps explicitly for PostgreSQL runtime compatibility.

## 0.1.4

- Declare the operational contract and expose the standard runtime health probe.

## 0.1.3

- Publish an extension-driven dashboard contribution.
- Add approval-bound real-PostgreSQL certification for the destructive multi-attempt migration,
  course lifecycle, concurrent lesson attempts, redacted playback, completion and attendance.

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
