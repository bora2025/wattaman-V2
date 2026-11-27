# Changelog

## 0.3.2
- Fix: "Internal server error" on Examinations, the exam editor (saving an exam) and Gradebooks for school administrators. Only the role ADMIN counted as an administrator; SUPER_ADMIN and SCHOOL_ADMIN were treated as teachers, and the plugin asked for their classes, which Academic Management only answers for teachers, class admins, students and parents. All three administrator roles now see and manage every exam, and the plugin asks for classes only for those four roles.
- Works with the school core fix that reads classes from Academic Management on the core build.

## 0.3.1
- Fix: 0.3.0 could not be activated ("Migration 015_create_media must contain exactly one SQL statement"). The index of exam files moved to its own migration (017). Nothing else changed. A test now checks that every migration is one statement.

## 0.3.0
Mono's exam workflow, features and screens. Needs school core 0.1.36 or newer, and Academic Management 0.35.1 so administrators can pick any class.
- **Examinations:**
  - exam cards with counts, the status and what it means;
  - Edit, Grade (n), ▶ Activate now, the status menu, Copy and Delete;
  - search and filters.
- **Exam editor:**
  - details: class, duration, marks, pass mark, attempts, opening and closing times;
  - the question editor for all 11 types: insert anywhere, move, duplicate, delete, sections with suggested names, formatted text;
  - **👁 Preview** to take the exam as a student, scored on the spot, with nothing saved.
- **Taking an exam:**
  - a start card;
  - a countdown that cannot be paused. It turns red under five minutes, and a resumed attempt counts the real time left;
  - answers saved every 30 seconds and after each change;
  - progress, and one page per section;
  - the exam submits by itself when the time is up.
- **Drag and drop** works with a finger or a mouse, or by tapping a word then its place.
- **Speaking and dictation** go through the school page, and the plugin screen gets only the recognised text. Students can type where the browser cannot listen.
- **Gradebook:**
  - each attempt with the student's name;
  - answers against the key, automatic marks, essay marks (which can be changed later) and feedback;
  - ↻ Re-attempt, and scores as CSV.
- **My Exams** and **My Results** for students.
- **Pictures and recordings** are uploaded with the exam (migrations 015 to 017).
- A taken exam keeps its questions; its details can still change.
- **Status changes** work as in mono, with guards: no exam opens without questions, and an exam goes back to draft or is deleted only before anyone takes it.
- Errors come with their reason (the platform error contract).

## 0.2.2

- Add covering indexes for 4 foreign keys (migrations 011-014) so lookups, cascades and parent deletes stay fast as school data grows. Additive only; no data changes.

## 0.2.1

- Declare the student grade summary read model and the database transaction capability.

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
