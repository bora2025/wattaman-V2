# Examination plugin: mono's exam workflow, features, UX and UI

Status: **built** (Examination 0.3.0, core speech device, Academic 0.35.1). See the plugin CHANGELOG. Source of truth for behaviour: wattaman-mono `backend/src/exam/*`,
`backend/src/h5p/h5p-questions.ts`, `frontend/app/{admin,teacher,student}/exams/**`,
`frontend/components/Exam*.tsx`, `frontend/components/questions/*`, `frontend/lib/examQuestionLogic.ts`.
Mono is only read for reference. Nothing is copied from mono's repository tooling, env or deploy.

## 1. What mono does

**Roles.**
- **Admin:** sees every exam, can create, edit, grade, change status and delete.
- **Teacher:** sees the exams they created and their classes' exams, and grades attempts.
- **Student:** sees the exams for their class and takes them.

**Exam:**
- title, description, class (or all classes), start and end time, duration in minutes;
- total marks, pass mark, max attempts (0 = unlimited);
- status:

| Status | Meaning |
|---|---|
| DRAFT | hidden from students |
| PUBLISHED | visible, can't start |
| ACTIVE | students can start |
| COMPLETED | closed |

**Questions:** 11 types. Each question has text (rich text), marks and an optional **section**. Consecutive questions with the same section form one page for students.

| Type | Answer | Grading |
|---|---|---|
| MCQ: single or multiple, labels A/B/C, 1/2/3, I/II/III or none | choice ids, shuffled per student | exact set, all or nothing |
| True / False | boolean | all or nothing |
| Text passage | none (0 marks, not numbered) | — |
| Essay (min words) | text | **manual** |
| Sort the paragraphs | order of ids | partial, by position |
| Drag the words (`*word*` / `#word#` groups, distractors) | blank → word | partial, case-insensitive |
| Fill in the blanks (`*a/b*` accepted answers, block style) | blank → typed text | partial, normalised |
| Drag and drop on an image (zones in %, items → zone) | item → zone | partial |
| Speak the words (prompt, accepted answers) | transcript | normalised match |
| Speak the words set | id → transcript | partial |
| Dictation (script, optional audio, else browser TTS) | typed text | partial, word by word |

**Workflow:**
1. The teacher creates the exam with its questions. The question editor can:
   - insert a question at any position;
   - move a question up or down, duplicate it or delete it;
   - give a question a section, with section names suggested;
   - show a 👁 Preview that plays the exam as a student and scores it locally.
2. Teacher sets status. ▶ Activate now is offered on a draft or published exam.
3. **Student list:**
   - Start, Resume (in progress) or Retake (graded, attempts left, exam active);
   - "Submitted · awaiting result";
   - "Score x/y PASSED/FAILED".
4. **Take page:**
   - an intro card: questions, minutes, pass mark, "timer cannot be paused, auto-saves every 30 s";
   - a sticky header with the title and a countdown that turns red under 5 minutes;
   - a progress bar ("n of m answered", passages excluded);
   - section pages with a pager;
   - a fixed bottom bar: Next section → / Submit exam.
   - A resumed attempt counts down the real remaining time. The exam submits automatically at 0.
5. **Submit:**
   - all questions auto-graded → GRADED, with PASS/FAIL against the pass mark;
   - any essay → SUBMITTED, with a partial score.
6. **Gradebook page for the exam:**
   - stat cards: total marks, pass mark, questions, need manual grading;
   - one row per attempt: student, attempt number, submitted and graded times, score, PASS/FAIL, status;
   - Grade or Review opens a panel showing each question with the student's answer against the key, the auto marks, a marks box for manual questions and feedback;
   - ↻ Re-attempt deletes the attempt after a confirm, and the student is notified.
7. **Student results:** score, grade and feedback once the attempt is graded.

## 2. What V2's `wattanam.examination` 0.2.2 already has

- **Same data model:**
  - tables exam, question, attempt (with `directoryUserId`);
  - score sheets and gradebooks.
- **Same rules ported:**
  - all 11 types: sanitise, student-safe view (shuffle, keys stripped) and grading (`backend/question-types.js`);
  - start, resume and retake with an advisory lock;
  - autosave; submit with GRADED or SUBMITTED; manual grade with clamping; reset with a notification;
  - the `student-grade-summary` read model.
- **UI:** only declarative tables (an exam list and gradebooks). None of mono's screens exist. **The UI is the gap.**

**Backend gaps against mono:**
1. Lists lack the question and attempt counts, the class name and the creator name.
2. The student list lacks the student's own attempt (status, score, attempt number).
3. The attempt list lacks student names.
4. There is no student results list.
5. Questions are saved one at a time. Mono's editor saves the whole exam with its questions at once.
6. Errors are plain `Error`s rather than the platform contract `{status, message, detail}`.

## 3. Plan: extend `wattanam.examination` → 0.3.0 (same tables, data kept)

New app screens in `ui/`, built like Café POS: vanilla JS in the sandboxed app frame, with the SDK bridge. They follow mono's layout, wording and colours (sky for teachers, indigo for admins, emerald for students), with Khmer labels.

| Screen | Who | From mono |
|---|---|---|
| **Exams** | admin, teacher | stats (total, draft, live, attempts or completed), cards with a status chip and hint, Edit, Grade (n), ▶ Activate now, status select, Delete |
| **Exam editor** (new and edit) | admin, teacher | details form, plus a question editor for all 11 types, with insert, move, duplicate, delete, sections and 👁 Preview |
| **Gradebook (attempts)** | admin, teacher | stat cards, attempt rows, Grade/Review panel, ↻ Re-attempt confirm |
| **My exams** | student | Start, Resume, Retake, awaiting, score and pass/fail |
| **Take exam** | student | intro, countdown, autosave, progress, section pager, bottom bar, auto-submit |
| **My results** | student | score, grade, feedback |

**Backend changes:**
- enriched lists (gaps 1–4);
- `PUT exams/:id/full`, which saves the exam and replaces its questions in one transaction (draft, or no attempts yet);
- contract errors;
- rich text sanitised to an allow-list on save, and again on render.

**Shared question logic** goes in one browser file, `ui/questions.js`. It holds parse, preview-sanitise and grade, mirroring `backend/question-types.js`. A test checks that the browser and server grading agree.

**Interactions without React or dnd-kit.** Drag uses pointer events with a **tap to pick, tap to place** fallback, so it works on phones and tablets. The drag-and-drop zone editor draws rectangles over the uploaded image (a data URL, size-capped).

**Two browser limits of the sandboxed plugin frame:**
- **Speech recognition** (the Speak the Words types) needs the microphone. The plugin frame gets no microphone.
  - 0.3.0: the typed-answer fallback (mono has one too).
  - Later: a core `microphone`/`speech` device bridged by the school page, like face and NFC. It goes in core, SDK, CLI and verifier.
- **Dictation audio URL:** the frame's content policy may block audio from other sites, so audio is uploaded with the question. Text-to-speech works as in mono.

**Status workflow:** mono lets anyone with access pick any status. V2 keeps its guarded transitions (`DRAFT ↔ PUBLISHED → ACTIVE → COMPLETED`, publishing needs at least one question). "▶ Activate now" goes straight from draft to active, after checking there are questions.

**Tests:**
- plugin unit tests for grading and the browser/server mirror;
- the real-database harness for the start → autosave → submit → grade → reset flow;
- Playwright on the real core for the teacher editor, student taking (with timer and sections) and grading.
