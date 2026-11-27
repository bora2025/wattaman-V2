'use strict';
// The screens grade the preview and the gradebook in the browser (ui/questions.js); the server grades
// the real attempt (backend/question-types.js). Both must give the same marks for every type and answer.
const test = require('node:test');
const assert = require('node:assert');
const ui = require('../ui/questions.js');
const server = require('../backend/question-types.js');

const fixtures = {
  MCQ: { data: { choices: [{ id: 'a', text: 'Four', isCorrect: true }, { id: 'b', text: 'Five', isCorrect: false }, { id: 'c', text: 'IV', isCorrect: true }], multiple: true, labelStyle: 'ROMAN' }, answers: [['a', 'c'], ['c', 'a'], ['a'], ['a', 'b', 'c'], [], 'a', ['a', 'a', 'c'], null, undefined] },
  TF: { data: { correct: false }, answers: [true, false, null, 0, 1, 'yes'] },
  TEXT: { data: {}, answers: [null, 'x'] },
  ESSAY: { data: { minWords: 20 }, answers: ['An essay', null] },
  SORT_PARAGRAPHS: { data: { paragraphs: [{ id: 'p1', text: 'First' }, { id: 'p2', text: 'Second' }, { id: 'p3', text: 'Third' }] }, answers: [['p1', 'p2', 'p3'], ['p2', 'p1', 'p3'], ['p3'], [], null, 'p1'] },
  DRAG_WORDS: { data: { text: 'The *cat* sat on the #mat# by the *door*.', distractors: ['dog'] }, answers: [{ b0: 'cat', b1: 'mat', b2: 'door' }, { b0: 'Cat ', b1: 'dog' }, {}, null, 'cat'] },
  FILL_BLANKS: { data: { text: 'Blueberries are *blue/purple* and grow on *bushes*.', style: { fontSize: '18px' } }, answers: [{ fb0: 'Purple!', fb1: 'bushes' }, { fb0: 'red', fb1: ' BUSHES ' }, {}, null] },
  DRAG_DROP: { data: { backgroundImage: 'media:123e4567-e89b-12d3-a456-426614174000', zones: [{ id: 'z1', x: 1, y: 1, width: 10, height: 10 }, { id: 'z2', x: 50, y: 50, width: 10, height: 10 }], items: [{ id: 'i1', label: 'Heart', correctZoneId: 'z1' }, { id: 'i2', label: 'Lung', correctZoneId: 'z2' }] }, answers: [{ i1: 'z1', i2: 'z2' }, { i1: 'z2', i2: 'z2' }, {}, null] },
  SPEAK_WORDS: { data: { prompt: 'Good morning', acceptedAnswers: ['good morning', 'morning'], lang: 'en-US' }, answers: ['Good morning.', 'GOOD MORNING', 'hello', '', null] },
  SPEAK_WORDS_SET: { data: { items: [{ id: 's1', prompt: 'One', acceptedAnswers: ['one'] }, { id: 's2', prompt: 'Two', acceptedAnswers: ['two', 'too'] }], lang: 'en-GB' }, answers: [{ s1: 'One', s2: 'too' }, { s1: 'won' }, {}, null] },
  DICTATION: { data: { script: 'The quick brown fox jumps.', lang: 'en-US', rate: 0.85, plays: 2 }, answers: ['the quick brown fox jumps', 'The quick fox jumps', '', null] },
};

test('browser and server give the same marks for every type and answer', () => {
  for (const [type, fixture] of Object.entries(fixtures)) {
    const data = server.sanitizeQuestionData(type, fixture.data);
    for (const answer of fixture.answers) {
      const a = server.gradeQuestionData(type, data, answer, 4);
      const b = ui.grade(type, data, answer, 4);
      assert.deepStrictEqual({ automatic: b.automatic, marks: Math.round(b.marks * 1e9) }, { automatic: a.automatic, marks: Math.round(a.marks * 1e9) }, `${type} ${JSON.stringify(answer)}`);
    }
  }
});

test('the preview hides the same answer keys as the server', () => {
  for (const [type, fixture] of Object.entries(fixtures)) {
    const data = server.sanitizeQuestionData(type, fixture.data);
    const shape = (value) => JSON.stringify(Object.keys(value).sort());
    assert.strictEqual(shape(ui.safeData(type, data)), shape(server.safeQuestionData(type, data)), type);
    assert.doesNotMatch(JSON.stringify(ui.safeData(type, data)), /isCorrect|correctZoneId|acceptedAnswers|"correct"|\*cat\*|blue\/purple/, type);
  }
});

test('every type has a label and default data the server accepts once filled', () => {
  for (const type of ui.TYPES) {
    assert.ok(ui.TYPE_LABEL[type], type);
    assert.strictEqual(typeof ui.defaultData(type), 'object');
    assert.ok(server.QUESTION_TYPES.has(type), type);
  }
  assert.strictEqual(ui.TYPES.length, server.QUESTION_TYPES.size);
});

test('sections become pages and passages are not numbered', () => {
  const qs = [{ type: 'TEXT', section: 'Reading' }, { type: 'MCQ', section: 'Reading' }, { type: 'TF', section: ' Listening' }, { type: 'ESSAY', section: '' }, { type: 'ESSAY' }];
  assert.deepStrictEqual(ui.pages(qs).map((p) => [p.section, p.questions.length, p.start]), [['Reading', 2, 0], ['Listening', 1, 2], [null, 2, 3]]);
  assert.deepStrictEqual(ui.numbers(qs), [null, 1, 2, 3, 4]);
  assert.strictEqual(ui.answered('MCQ', []), false);
  assert.strictEqual(ui.answered('FILL_BLANKS', { fb0: ' ' }), false);
  assert.strictEqual(ui.answered('TF', false), true);
  assert.strictEqual(ui.optionLabel('ROMAN', 3), 'IV');
  assert.strictEqual(ui.optionLabel('NONE', 0), '');
});
