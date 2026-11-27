# Wattanam Examination

Exams for a class, with the workflow, features and screens of the exam module in mono
(`architecture/examination-plugin-plan.md`), plus score sheets and gradebooks.

## Screens (`ui/`)
| Page | Who | What |
|---|---|---|
| Examinations (`exams`) | staff | counts, exam cards with status and hint, Edit, Grade (n), ▶ Activate now, status, Copy, Delete |
| Create / Edit exam (`exams/new`, `exams/:id/edit`) | staff | details (class, minutes, marks, pass mark, attempts, opens/closes) and the question editor: 11 types, insert anywhere, move, duplicate, delete, sections, 👁 Preview |
| Gradebook (`exams/:id/attempts`) | exam creator, admin | stat cards, attempts by student, Grade/Review (answers against the key, automatic marks, essay marks, feedback), ↻ Re-attempt, CSV |
| My Exams (`my-exams`) | students | Start / Resume / Retake, awaiting result, score and pass or fail |
| Exam (`my-exams/:id`) | students | start card, countdown (cannot pause; resumes the real time left), auto-save, progress, one page per section, submits itself when time is up |
| My Results (`my-results`) | students | scores, pass or fail, teachers' feedback |

## Question types
Multi-choice (single or several answers; A/B/C, 1/2/3, I/II/III labels, shuffled per student), True/False,
Text passage (not scored, not numbered), Essay (graded by hand), Sort the paragraphs, Drag the words
(`*word*`, `#word#` second colour, extra words), Fill in the blanks (`*a/b*` accepted answers, font and
spacing), Drag and drop on a picture (zones drawn on it), Speak the words and Speak the words set (the
school page listens: device `speech`; typing works too), Dictation (read aloud by the school page or an
uploaded recording; plays can be limited). Grading is the same in the browser (`ui/questions.js`) and on the
server (`backend/question-types.js`), checked by `tests/questions-mirror.test.js`.

## Notes
- Needs school core 0.1.36+ (screens, partner screens, the `speech` device).
- Pictures and recordings are stored with the exam in parts (`media`, `media_part`); questions refer to them as `media:<id>`.
- A taken exam keeps its questions (the details can still change); reset its attempts in the gradebook or copy it.
- Question text is formatted text kept to an allow-list on the server and again in the browser.
- External Academic class, student and directory-user ids are stored as stable ids, without foreign keys to other plugins.
