/* The exam editor's "Questions" section (mono's ExamQuestionsEditor and components/questions/*):
 * insert a question anywhere, move, duplicate, delete, sections (consecutive questions with the same
 * section are one page for students), and the authoring fields of all 11 types. */
(function () {
  'use strict';
  var X = window.Exam, Q = window.ExamQuestions, el = X.el, clear = X.clear;

  function cleanSection(raw) { return String(raw || '').replace(/^[\s"'“”‘’]+|[\s"'“”‘’,]+$/g, ''); }
  function defaultQuestion() { return { text: '', type: 'MCQ', marks: 1, data: Q.defaultData('MCQ'), section: '' }; }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function lines(text) { return String(text || '').split(/\n|,/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function langSelect(value, onChange) {
    return el('select', { 'aria-label': 'Language', onchange: function (e) { onChange(e.target.value); } }, Q.LANGUAGES.map(function (l) { return el('option', { value: l[0], text: l[1], selected: (value || 'en-US') === l[0] }); }));
  }
  function field(label, control, hint) { return el('label', { class: 'field' }, [label, control, hint ? el('span', { class: 'hint', text: hint }) : null]); }

  /**
   * options: { questions, onChange(questions), locked, uploadMedia(file, kind) -> Promise<ref>, onError(text) }
   * Returns { node, render() }.
   */
  function create(options) {
    var questions = options.questions;
    var root = el('div');
    var changed = function () { options.onChange(questions); };

    function render() {
      clear(root);
      var names = []; questions.forEach(function (q) { var s = (q.section || '').trim(); if (s && names.indexOf(s) < 0) names.push(s); });
      root.appendChild(el('datalist', { id: 'exam-section-names' }, names.map(function (n) { return el('option', { value: n }); })));
      var numbers = Q.numbers(questions);
      questions.forEach(function (q, i) {
        if (!options.locked) root.appendChild(el('div', { class: 'q-insert' }, [el('button', { type: 'button', title: 'Insert question here', 'aria-label': 'Insert question here', onclick: function () { questions.splice(i, 0, defaultQuestion()); changed(); render(); } }, [el('span', { text: '+' })])]));
        var section = (q.section || '').trim(); var prev = i > 0 ? (questions[i - 1].section || '').trim() : '';
        if (section && section !== prev) root.appendChild(el('div', { class: 'q-section', text: section }));
        root.appendChild(card(q, i, numbers[i]));
      });
      if (!options.locked) root.appendChild(el('button', { type: 'button', class: 'add-q', onclick: function () { questions.push(defaultQuestion()); changed(); render(); } }, ['＋ Add Question']));
    }

    function refreshSections() {
      Array.prototype.slice.call(root.querySelectorAll('.q-section')).forEach(function (n) { n.remove(); });
      var names = [];
      questions.forEach(function (q, i) {
        var section = (q.section || '').trim(); var prev = i > 0 ? (questions[i - 1].section || '').trim() : '';
        if (section && names.indexOf(section) < 0) names.push(section);
        var node = root.querySelector('[data-question="' + i + '"]');
        if (section && section !== prev && node) node.parentNode.insertBefore(el('div', { class: 'q-section', text: section }), node);
      });
      var list = root.querySelector('#exam-section-names');
      if (list) { clear(list); names.forEach(function (n) { list.appendChild(el('option', { value: n })); }); }
    }

    function card(q, i, number) {
      var locked = options.locked;
      var update = function (patch, rerender) { Object.assign(q, patch); changed(); if (rerender) render(); };
      var typeSelect = el('select', { 'aria-label': 'Question type', disabled: locked, onchange: function () { var type = typeSelect.value; update({ type: type, data: Q.defaultData(type), marks: type === 'TEXT' ? 0 : (q.marks || 1) }, true); } },
        Q.TYPES.map(function (t) { return el('option', { value: t, text: Q.TYPE_LABEL[t], selected: q.type === t }); }));
      var marks = q.type === 'TEXT' ? el('div', { class: 'not-scored', title: "A passage isn't scored", text: 'not scored' })
        : el('input', { type: 'number', step: 'any', min: '0', value: String(q.marks), 'aria-label': 'Marks', title: 'Marks', disabled: locked, oninput: function () { update({ marks: Number(marks.value) || 0 }); } });
      var tools = locked ? null : el('div', { class: 'q-tools' }, [
        el('button', { type: 'button', class: 'icon', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: function () { var t = questions[i - 1]; questions[i - 1] = q; questions[i] = t; changed(); render(); } }, ['▲']),
        el('button', { type: 'button', class: 'icon', title: 'Move down', 'aria-label': 'Move down', disabled: i === questions.length - 1, onclick: function () { var t = questions[i + 1]; questions[i + 1] = q; questions[i] = t; changed(); render(); } }, ['▼']),
        el('button', { type: 'button', class: 'icon', title: 'Duplicate', 'aria-label': 'Duplicate', onclick: function () { var c = copy(q); delete c.id; questions.splice(i + 1, 0, c); changed(); render(); } }, ['⧉']),
        el('button', { type: 'button', class: 'icon red', title: 'Delete', 'aria-label': 'Delete', disabled: questions.length <= 1, onclick: function () { questions.splice(i, 1); changed(); render(); } }, ['🗑']),
      ]);
      // (only the section headings are redrawn: redrawing the list here would swallow the click that took the focus away)
      var sectionInput = el('input', { list: 'exam-section-names', value: q.section || '', disabled: locked, placeholder: 'Section this question belongs to (optional) — e.g. Listening', title: 'One section name per question — questions in a row sharing the same name become one page for students.', class: 'small', oninput: function () { update({ section: cleanSection(sectionInput.value) }); }, onchange: refreshSections });
      var text = X.richEditor(q.text, { placeholder: q.type === 'TEXT' ? 'Passage: paste or write the reading text here' : 'Question ' + (number || '') + ' text', label: 'Question text', onChange: function (html) { q.text = html; changed(); } });
      var body = el('div', { class: 'q-body' }, [sectionInput, locked ? X.rich(q.text) : text.node, typeEditor(q, update, locked)]);
      return el('div', { class: 'q-card', 'data-question': String(i) }, [
        el('div', { class: 'q-top' }, [el('div', { class: 'row', style: 'gap:8px;flex:1;min-width:240px' }, [el('span', { class: 'q-num', text: number ? String(number) : '📖' }), el('div', { class: 'type grow' }, [typeSelect, marks])]), tools]),
        body,
      ]);
    }

    // ---------- the fields of each type ----------
    function typeEditor(q, update, locked) {
      var d = q.data || (q.data = Q.defaultData(q.type));
      // in place, so every field of this question keeps reading the same data object
      var set = function (patch, rerender) { Object.assign(d, patch); q.data = d; changed(); if (rerender) render(); };
      var box = el('div', { class: 'stack' });
      if (locked) { box.appendChild(Q.review(q, undefined) || el('span')); return box; }
      switch (q.type) {
        case 'MCQ': {
          var multi = Boolean(d.multiple); var style = Q.LABEL_STYLES.indexOf(d.labelStyle) >= 0 ? d.labelStyle : 'ALPHA';
          box.appendChild(el('div', { class: 'row', style: 'gap:16px' }, [
            el('label', { class: 'check' }, [el('input', { type: 'checkbox', checked: multi, onchange: function (e) { var choices = d.choices; if (!e.target.checked) { var first = true; choices = choices.map(function (c) { var keep = c.isCorrect && first; if (c.isCorrect) first = false; return Object.assign({}, c, { isCorrect: keep }); }); } set({ multiple: e.target.checked, choices: choices }, true); } }), 'Allow multiple correct answers']),
            el('label', { class: 'check' }, ['Answer labels', el('select', { style: 'width:auto', onchange: function (e) { set({ labelStyle: e.target.value }, true); } }, Q.LABEL_STYLES.map(function (s) { return el('option', { value: s, text: Q.LABEL_STYLE_NAME[s], selected: s === style }); }))]),
          ]));
          box.appendChild(el('p', { class: 'tiny faint', text: 'Choices are shown to students in random order every time — labels always match what they see. Tick the correct answer.' }));
          (d.choices || []).forEach(function (c, i) {
            var label = Q.optionLabel(style, i);
            box.appendChild(el('div', { class: 'choice' }, [
              el('input', { type: multi ? 'checkbox' : 'radio', name: 'correct-' + (q.id || '') + '-' + questions.indexOf(q), checked: c.isCorrect, title: 'Mark as correct', 'aria-label': 'Correct answer', onchange: function () { set({ choices: d.choices.map(function (x, j) { return Object.assign({}, x, { isCorrect: multi ? (j === i ? !x.isCorrect : x.isCorrect) : j === i }); }) }); } }),
              label ? el('span', { class: 'label', text: label + '.' }) : null,
              el('input', { value: c.text, placeholder: 'Choice ' + (i + 1), 'aria-label': 'Choice ' + (i + 1), oninput: function (e) { d.choices[i] = Object.assign({}, c, { text: e.target.value }); c = d.choices[i]; changed(); } }),
              el('button', { type: 'button', class: 'icon red', title: 'Remove choice', 'aria-label': 'Remove choice', disabled: d.choices.length <= 2, onclick: function () { set({ choices: d.choices.filter(function (_, j) { return j !== i; }) }, true); } }, ['✕']),
            ]));
          });
          box.appendChild(el('div', {}, [el('button', { type: 'button', class: 'link', onclick: function () { set({ choices: d.choices.concat([{ id: Q.uid('c'), text: '', isCorrect: false }]) }, true); } }, ['+ Add choice'])]));
          break;
        }
        case 'TF':
          box.appendChild(el('div', { class: 'row', style: 'gap:16px' }, [el('span', { class: 'small muted', text: 'Correct answer:' })].concat([true, false].map(function (v) {
            return el('label', { class: 'check' }, [el('input', { type: 'radio', name: 'tf-' + questions.indexOf(q), checked: d.correct === v, onchange: function () { set({ correct: v }); } }), v ? 'True' : 'False']);
          }))));
          break;
        case 'TEXT':
          box.appendChild(el('p', { class: 'tiny faint', text: 'A reading passage: students read it with the questions after it. It has no answer and no marks.' }));
          break;
        case 'ESSAY':
          box.appendChild(el('div', { class: 'row' }, [field('Minimum words (0 = no minimum)', el('input', { type: 'number', min: '0', value: String(d.minWords || 0), style: 'width:140px', oninput: function (e) { set({ minWords: Math.max(0, Number(e.target.value) || 0) }); } }))]));
          box.appendChild(el('p', { class: 'tiny faint', text: 'An essay is graded by hand in the gradebook; until then the attempt shows "awaiting result".' }));
          break;
        case 'SORT_PARAGRAPHS':
          box.appendChild(el('p', { class: 'tiny faint', text: 'Write the paragraphs in the CORRECT order. Students see them shuffled; each one in the right place earns its share of the marks.' }));
          (d.paragraphs || []).forEach(function (p, i) {
            box.appendChild(el('div', { class: 'choice' }, [el('span', { class: 'label', text: String(i + 1) }),
              el('textarea', { rows: '2', value: p.text, placeholder: 'Paragraph ' + (i + 1), 'aria-label': 'Paragraph ' + (i + 1), oninput: function (e) { d.paragraphs[i] = Object.assign({}, p, { text: e.target.value }); p = d.paragraphs[i]; changed(); } }),
              el('div', {}, [
                el('button', { type: 'button', class: 'icon', title: 'Move up', disabled: i === 0, onclick: function () { var a = d.paragraphs.slice(); a.splice(i - 1, 0, a.splice(i, 1)[0]); set({ paragraphs: a }, true); } }, ['▲']),
                el('button', { type: 'button', class: 'icon red', title: 'Remove', disabled: d.paragraphs.length <= 2, onclick: function () { set({ paragraphs: d.paragraphs.filter(function (_, j) { return j !== i; }) }, true); } }, ['✕']),
              ])]));
          });
          box.appendChild(el('div', {}, [el('button', { type: 'button', class: 'link', onclick: function () { set({ paragraphs: d.paragraphs.concat([{ id: Q.uid('p'), text: '' }]) }, true); } }, ['+ Add paragraph'])]));
          break;
        case 'DRAG_WORDS':
        case 'FILL_BLANKS':
          markupEditor(q, d, set, box);
          break;
        case 'DRAG_DROP':
          dragDropEditor(d, set, box);
          break;
        case 'SPEAK_WORDS':
          box.appendChild(el('div', { class: 'grid2' }, [
            field('What the student says (shown to them)', el('input', { value: d.prompt || '', placeholder: 'e.g. Good morning', oninput: function (e) { set({ prompt: e.target.value }); } })),
            field('Language', langSelect(d.lang, function (v) { set({ lang: v }); })),
          ]));
          box.appendChild(field('Accepted answers (one per line)', el('textarea', { rows: '3', value: (d.acceptedAnswers || []).join('\n'), placeholder: 'good morning', oninput: function (e) { set({ acceptedAnswers: lines(e.target.value) }); } }), 'Compared without capitals or punctuation.'));
          break;
        case 'SPEAK_WORDS_SET':
          box.appendChild(field('Language', langSelect(d.lang, function (v) { set({ lang: v }); })));
          (d.items || []).forEach(function (item, i) {
            box.appendChild(el('div', { class: 'card pad' }, [el('div', { class: 'grid2' }, [
              field('Say ' + (i + 1), el('input', { value: item.prompt, oninput: function (e) { d.items[i] = Object.assign({}, item, { prompt: e.target.value }); item = d.items[i]; changed(); } })),
              field('Accepted answers (one per line)', el('textarea', { rows: '2', value: (item.acceptedAnswers || []).join('\n'), oninput: function (e) { d.items[i] = Object.assign({}, item, { acceptedAnswers: lines(e.target.value) }); item = d.items[i]; changed(); } })),
            ]), el('button', { type: 'button', class: 'link red', disabled: d.items.length <= 1, onclick: function () { set({ items: d.items.filter(function (_, j) { return j !== i; }) }, true); } }, ['Remove'])]));
          });
          box.appendChild(el('div', {}, [el('button', { type: 'button', class: 'link', onclick: function () { set({ items: d.items.concat([{ id: Q.uid('sw'), prompt: '', acceptedAnswers: [] }]) }, true); } }, ['+ Add prompt'])]));
          break;
        case 'DICTATION':
          dictationEditor(d, set, box);
          break;
      }
      return box;
    }

    // Drag the Words (*word* blanks, #word# a second colour, distractors) and Fill in the Blanks (*a/b*).
    function markupEditor(q, d, set, box) {
      var drag = q.type === 'DRAG_WORDS';
      var preview = el('div', { class: 'answer-box sentence', style: 'white-space:normal' });
      var area = el('textarea', { rows: '4', value: d.text || '', placeholder: drag ? 'The cat is *sleeping* on the #sofa#.' : 'Blueberries are *blue/purple* and grow on *bushes*.', 'aria-label': 'Text with blanks', oninput: function () { set({ text: area.value }); showPreview(); } });
      var wrap = function (mark) { return function () {
        var s = area.selectionStart, e = area.selectionEnd; if (s === e) { if (options.onError) options.onError('Select the word to turn into a blank first.'); return; }
        area.value = area.value.slice(0, s) + mark + area.value.slice(s, e).trim() + mark + area.value.slice(e); set({ text: area.value }); showPreview(); area.focus();
      }; };
      var showPreview = function () {
        clear(preview);
        var parts = drag ? Q.parseDragWords(area.value) : Q.parseFillBlanks(area.value); var n = 0;
        parts.forEach(function (p) { if (p.type === 'text') preview.appendChild(document.createTextNode(p.value)); else { n++; preview.appendChild(el('span', { class: 'blank filled' + (p.group === 'b' ? ' b' : ''), text: n + ': ' + (drag ? p.answer : p.answers.join(' / ')) })); } });
        if (!n) preview.appendChild(el('span', { class: 'faint', text: ' (no blanks yet: select a word and press "Make blank")' }));
        if (!drag) ['fontFamily', 'fontSize', 'lineHeight', 'textAlign'].forEach(function (k) { preview.style[k] = (d.style || {})[k] || ''; });
      };
      box.appendChild(el('p', { class: 'tiny faint', text: drag ? 'Write the text, select a word and press "Make blank". *word* makes a blank; #word# makes a blank of a second colour (a hint for students). Students drag the words from a shuffled word bank.' : 'Write the text, select a word and press "Make blank". *word* is a blank; *colour/color* accepts either spelling. Students type each answer (capitals and punctuation do not matter).' }));
      box.appendChild(area);
      box.appendChild(el('div', { class: 'row' }, [el('button', { type: 'button', class: 'sm outline', onclick: wrap('*') }, ['Make blank']), drag ? el('button', { type: 'button', class: 'sm', onclick: wrap('#') }, ['Make blank (2nd colour)']) : null]));
      if (drag) box.appendChild(field('Extra wrong words for the word bank (comma or one per line)', el('input', { value: (d.distractors || []).join(', '), oninput: function (e) { set({ distractors: lines(e.target.value) }); } })));
      else {
        var st = d.style || {};
        var pick = function (name, choices, label) { return field(label, el('select', { onchange: function (e) { var next = Object.assign({}, d.style || {}); if (e.target.value) next[name] = e.target.value; else delete next[name]; set({ style: next }); showPreview(); } }, choices.map(function (c) { return el('option', { value: c[0], text: c[1], selected: (st[name] || '') === c[0] }); }))); };
        box.appendChild(el('div', { class: 'grid4' }, [
          pick('fontFamily', [['', 'Default font'], ['Arial, Helvetica, sans-serif', 'Arial'], ['Georgia, "Times New Roman", serif', 'Georgia'], ['"Courier New", monospace', 'Courier'], ['Verdana, sans-serif', 'Verdana'], ['"Comic Sans MS", cursive', 'Comic Sans']], 'Font'),
          pick('fontSize', [['', 'Default size'], ['12px', '12'], ['14px', '14'], ['16px', '16'], ['18px', '18'], ['20px', '20'], ['24px', '24'], ['28px', '28'], ['32px', '32']], 'Size'),
          pick('lineHeight', [['', 'Default spacing'], ['1', '1'], ['1.15', '1.15'], ['1.5', '1.5'], ['2', '2']], 'Line spacing'),
          pick('textAlign', [['', 'Default'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['justify', 'Justify']], 'Alignment'),
        ]));
      }
      box.appendChild(el('p', { class: 'tiny muted', text: 'Preview with the answers:' }));
      box.appendChild(preview);
      showPreview();
    }

    // Drag and Drop: a picture, drop zones drawn on it, and items that each belong in one zone.
    function dragDropEditor(d, set, box) {
      var img = el('img', { alt: 'Drag and drop picture' });
      var board = el('div', { class: 'board', style: 'cursor:crosshair' }, [img]);
      var status = el('span', { class: 'small muted' });
      var file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'width:auto', 'aria-label': 'Picture', onchange: function () {
        var f = file.files[0]; if (!f) return;
        status.textContent = 'Uploading…';
        options.uploadMedia(f, 'IMAGE', function (p) { status.textContent = 'Uploading ' + Math.round(p * 100) + '%…'; }).then(function (ref) { status.textContent = ''; set({ backgroundImage: ref }, true); })
          .catch(function (e) { status.textContent = ''; if (options.onError) options.onError(X.errorText(e)); });
      } });
      if (d.backgroundImage) X.loadMedia(d.backgroundImage).then(function (src) { if (src) img.src = src; }).catch(function () {});
      box.appendChild(el('div', { class: 'row' }, [field('Picture', file), status]));
      if (!d.backgroundImage) { box.appendChild(el('p', { class: 'tiny faint', text: 'Upload a picture (a map, a diagram, a labelled drawing). Then draw the drop spots on it.' })); return; }
      box.appendChild(el('p', { class: 'tiny muted', text: 'Click and drag over the picture to draw a drop spot.' }));
      var drawZones = function () {
        Array.prototype.slice.call(board.querySelectorAll('.zone')).forEach(function (z) { z.remove(); });
        (d.zones || []).forEach(function (z, n) {
          board.appendChild(el('div', { class: 'zone', style: 'left:' + z.x + '%;top:' + z.y + '%;width:' + z.width + '%;height:' + z.height + '%' }, [
            el('span', { class: 'zone-no', text: String(n + 1) }),
            el('button', { type: 'button', class: 'zone-x', title: 'Remove spot ' + (n + 1), 'aria-label': 'Remove spot ' + (n + 1), onpointerdown: function (e) { e.stopPropagation(); }, onclick: function (e) { e.stopPropagation(); set({ zones: d.zones.filter(function (x) { return x.id !== z.id; }), items: (d.items || []).map(function (it) { return it.correctZoneId === z.id ? Object.assign({}, it, { correctZoneId: '' }) : it; }) }, true); } }, ['✕']),
          ]));
        });
      };
      var start = null, draft = null;
      var pct = function (e) { var r = board.getBoundingClientRect(); return { x: Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), y: Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)) }; };
      board.addEventListener('pointerdown', function (e) { if (e.target.closest('.zone-x')) return; start = pct(e); draft = el('div', { class: 'zone' }); board.appendChild(draft); board.setPointerCapture(e.pointerId); });
      board.addEventListener('pointermove', function (e) { if (!start) return; var p = pct(e); draft.style.left = Math.min(start.x, p.x) + '%'; draft.style.top = Math.min(start.y, p.y) + '%'; draft.style.width = Math.abs(p.x - start.x) + '%'; draft.style.height = Math.abs(p.y - start.y) + '%'; });
      board.addEventListener('pointerup', function (e) {
        if (!start) return; var p = pct(e); var zone = { id: Q.uid('z'), x: Math.round(Math.min(start.x, p.x) * 10) / 10, y: Math.round(Math.min(start.y, p.y) * 10) / 10, width: Math.round(Math.abs(p.x - start.x) * 10) / 10, height: Math.round(Math.abs(p.y - start.y) * 10) / 10 };
        start = null; draft.remove();
        if (zone.width >= 2 && zone.height >= 2) set({ zones: (d.zones || []).concat([zone]) }, true);
      });
      drawZones();
      box.appendChild(board);
      box.appendChild(el('h3', { text: 'Items to drag', style: 'margin-top:6px' }));
      (d.items || []).forEach(function (it, i) {
        box.appendChild(el('div', { class: 'choice' }, [
          el('input', { value: it.label, placeholder: 'Item ' + (i + 1), 'aria-label': 'Item ' + (i + 1), oninput: function (e) { d.items[i] = Object.assign({}, it, { label: e.target.value }); it = d.items[i]; changed(); } }),
          el('select', { style: 'width:auto', 'aria-label': 'Correct spot', onchange: function (e) { d.items[i] = Object.assign({}, it, { correctZoneId: e.target.value }); it = d.items[i]; changed(); } }, [el('option', { value: '', text: 'Correct spot…' })].concat((d.zones || []).map(function (z, n) { return el('option', { value: z.id, text: 'Spot ' + (n + 1), selected: it.correctZoneId === z.id }); }))),
          el('button', { type: 'button', class: 'icon red', title: 'Remove item', onclick: function () { set({ items: d.items.filter(function (_, j) { return j !== i; }) }, true); } }, ['✕']),
        ]));
      });
      box.appendChild(el('div', {}, [el('button', { type: 'button', class: 'link', disabled: !(d.zones || []).length, onclick: function () { set({ items: (d.items || []).concat([{ id: Q.uid('i'), label: '', correctZoneId: (d.zones[0] || {}).id || '' }]) }, true); } }, ['+ Add item'])]));
    }

    // Dictation: the script read aloud by the school page (or an uploaded recording); students type it.
    function dictationEditor(d, set, box) {
      var status = el('span', { class: 'small muted' });
      box.appendChild(field('Script (what students hear and type — never shown to them)', el('textarea', { rows: '3', value: d.script || '', oninput: function (e) { set({ script: e.target.value }); } })));
      box.appendChild(el('div', { class: 'grid4' }, [
        field('Language', langSelect(d.lang, function (v) { set({ lang: v }); })),
        field('Reading speed', el('select', { onchange: function (e) { set({ rate: Number(e.target.value) }); } }, [['0.7', 'Slow'], ['0.85', 'A bit slow'], ['1', 'Normal'], ['1.15', 'A bit fast']].map(function (r) { return el('option', { value: r[0], text: r[1], selected: Number(d.rate || 1) === Number(r[0]) }); }))),
        field('Plays allowed (0 = any)', el('input', { type: 'number', min: '0', max: '10', value: String(d.plays || 0), oninput: function (e) { set({ plays: Math.max(0, Math.min(10, Number(e.target.value) || 0)) }); } })),
      ]));
      var file = el('input', { type: 'file', accept: 'audio/*', style: 'width:auto', 'aria-label': 'Recording', onchange: function () {
        var f = file.files[0]; if (!f) return; status.textContent = 'Uploading…';
        options.uploadMedia(f, 'AUDIO', function (p) { status.textContent = 'Uploading ' + Math.round(p * 100) + '%…'; }).then(function (ref) { status.textContent = 'Recording uploaded.'; set({ audio: ref }, true); })
          .catch(function (e) { status.textContent = ''; if (options.onError) options.onError(X.errorText(e)); });
      } });
      box.appendChild(el('div', { class: 'row' }, [
        field('Recording (optional, up to 6 MB — plays instead of the read-aloud script)', file),
        d.audio ? el('button', { type: 'button', class: 'sm danger', onclick: function () { var next = Object.assign({}, d); delete next.audio; q_set(next); } }, ['Remove recording']) : null,
        el('button', { type: 'button', class: 'sm outline', onclick: function () {
          var go = d.audio ? X.loadMedia(d.audio).then(function (src) { return X.ui.speech.play(src); }) : X.ui.speech.speak(d.script || '', { lang: d.lang || 'en-US', rate: d.rate || 1 });
          go.catch(function (e) { if (options.onError) options.onError(X.errorText(e)); });
        } }, ['▶ Try it']), status,
      ]));
      function q_set(next) { Object.keys(d).forEach(function (k) { delete d[k]; }); Object.assign(d, next); changed(); render(); }
    }

    render();
    return { node: root, render: render };
  }

  /** mono's ExamPreviewModal: try the exam as a student, scored here, nothing saved. */
  function preview(questions, ctx) {
    var safe = questions.map(function (q, i) { return { id: 'p' + i, type: q.type, text: q.text, marks: q.marks, section: q.section, data: Q.safeData(q.type, q.data), original: q }; });
    var pages = Q.pages(safe); var numbers = Q.numbers(safe); var answers = {}; var page = 0; var result = null;
    var body = el('div', { class: 'd-body' }); var foot = el('div', { class: 'd-foot' });
    var dlg = el('dialog', {}, [el('div', { class: 'd-head' }, [el('div', {}, [el('h2', { text: '👁 Preview', style: 'margin:0' }), el('p', { class: 'small muted', text: 'Try the exam as a student would. Nothing is saved.' })]), el('button', { type: 'button', class: 'icon', 'aria-label': 'Close', onclick: function () { dlg.close(); } }, ['✕'])]), body, foot]);
    var render = function () {
      clear(body); clear(foot);
      if (result) {
        body.appendChild(el('div', { class: 'center-card', style: 'margin:0 auto' }, [el('span', { class: 'big', text: '📊' }), el('p', { class: 'score-big', text: X.num(result.score) + ' / ' + X.num(result.total) }), el('p', { class: 'muted', text: result.manual ? 'Plus ' + result.manual + ' essay question(s) graded by hand.' : 'All questions were graded automatically.' })]));
        safe.forEach(function (q, i) { if (q.type === 'TEXT') return; var g = Q.grade(q.type, q.original.data, answers[q.id], q.marks); body.appendChild(el('div', { class: 'review ' + (g.automatic ? 'auto' : 'manual'), style: 'margin-top:8px' }, [el('div', { class: 'spread row' }, [el('b', { class: 'grow', text: 'Q' + numbers[i] + '. ' + X.plain(q.text).slice(0, 120) }), g.automatic ? Q.award(g.marks, q.marks) : el('span', { class: 'chip SUBMITTED', text: 'graded by hand' })]), Q.review(q.original, answers[q.id])])); });
        foot.appendChild(el('button', { type: 'button', onclick: function () { result = null; answers = {}; page = 0; render(); } }, ['↺ Try again']));
        foot.appendChild(el('button', { type: 'button', class: 'primary', onclick: function () { dlg.close(); } }, ['Close']));
        return;
      }
      var current = pages[Math.min(page, pages.length - 1)] || { questions: [], start: 0 };
      if (pages.length > 1) body.appendChild(el('div', { class: 'pager', style: 'margin-bottom:10px' }, pages.map(function (p, n) { return el('button', { type: 'button', 'aria-current': String(n === page), onclick: function () { page = n; render(); } }, [p.section || 'Questions']); })));
      current.questions.forEach(function (q, j) { body.appendChild(questionCard(q, numbers[current.start + j], answers, function () {}, ctx)); });
      if (page < pages.length - 1) foot.appendChild(el('button', { type: 'button', class: 'primary', onclick: function () { page++; render(); } }, ['Next Section →']));
      else foot.appendChild(el('button', { type: 'button', class: 'go', onclick: function () {
        var score = 0, total = 0, manual = 0;
        safe.forEach(function (q) { var g = Q.grade(q.type, q.original.data, answers[q.id], q.marks); total += Number(q.marks) || 0; if (g.automatic) score += g.marks; else manual++; });
        result = { score: score, total: total, manual: manual }; render();
      } }, ['Submit (preview)']));
    };
    dlg.addEventListener('close', function () { X.ui.speech && X.ui.speech.stop && X.ui.speech.stop(); dlg.remove(); });
    render(); X.showDialog(dlg);
  }

  /** A question as students see it (used by the take page and the preview). */
  function questionCard(q, number, answers, onAnswer, ctx) {
    var passage = q.type === 'TEXT';
    return el('div', { class: 'card question' + (passage ? ' passage' : ''), id: 'q-' + q.id }, [
      el('div', { class: 'q-head' }, [passage ? el('span', { text: '📖', style: 'font-size:18px' }) : el('span', { class: 'q-num', text: String(number) }),
        el('div', { class: 'q-text' }, [X.rich(q.text), passage ? null : el('span', { class: 'q-marks', text: '(' + X.num(q.marks) + ' mark' + (Number(q.marks) === 1 ? '' : 's') + ')' })])]),
      Q.input(q, answers[q.id], function (v) { answers[q.id] = v; onAnswer(q, v); }, ctx),
    ]);
  }

  window.ExamEditor = { create: create, preview: preview, questionCard: questionCard, defaultQuestion: defaultQuestion };
})();
