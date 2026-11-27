/* The 11 question types of mono's exams: their logic (a mirror of backend/question-types.js, checked by
 * tests/questions-mirror.test.js), the students' interactive inputs, and the gradebook's review of an
 * answer against the key. Drag and drop works with a finger or a mouse, and also by tapping a word then
 * its place. Speaking and listening go through the school page (device "speech"). */
(function (global) {
  'use strict';

  var TYPES = ['MCQ', 'TF', 'TEXT', 'ESSAY', 'SORT_PARAGRAPHS', 'DRAG_WORDS', 'FILL_BLANKS', 'DRAG_DROP', 'SPEAK_WORDS', 'SPEAK_WORDS_SET', 'DICTATION'];
  var TYPE_LABEL = { MCQ: 'Multi-Choice', TF: 'True / False', TEXT: 'Text Passage', ESSAY: 'Essay', SORT_PARAGRAPHS: 'Sort the Paragraphs', DRAG_WORDS: 'Drag the Words', FILL_BLANKS: 'Fill in the Blanks', DRAG_DROP: 'Drag and Drop', SPEAK_WORDS: 'Speak the Words', SPEAK_WORDS_SET: 'Speak the Words Set', DICTATION: 'Dictation' };
  var LABEL_STYLES = ['ALPHA', 'NUMERIC', 'ROMAN', 'NONE'];
  var LABEL_STYLE_NAME = { ALPHA: 'A, B, C', NUMERIC: '1, 2, 3', ROMAN: 'I, II, III', NONE: 'None' };
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
  var LANGUAGES = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['km-KH', 'ខ្មែរ Khmer'], ['fr-FR', 'Français'], ['zh-CN', '中文'], ['ja-JP', '日本語'], ['ko-KR', '한국어'], ['th-TH', 'ไทย'], ['vi-VN', 'Tiếng Việt']];

  // ---------- logic (the same rules as the server) ----------
  function clean(v) { return String(v == null ? '' : v).trim(); }
  function list(v) { return Array.isArray(v) ? v : []; }
  function normalizeAnswer(v) { return clean(v).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' '); }
  function shuffle(v) { var out = v.slice(); for (var i = out.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = out[i]; out[i] = out[j]; out[j] = t; } return out; }
  function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 8); }
  function parseMarked(text, pattern, prefix, splitAnswers) {
    var parts = clean(text).split(pattern).filter(Boolean); var index = 0;
    return parts.map(function (part) {
      var marker = (part.charAt(0) === '*' && part.slice(-1) === '*') || (part.charAt(0) === '#' && part.slice(-1) === '#');
      if (!marker || part.length < 3) return { type: 'text', value: part };
      var raw = part.slice(1, -1).trim(); var item = { type: 'blank', id: prefix + (index++) };
      if (splitAnswers) { item.answers = raw.split('/').map(clean).filter(Boolean); return item; }
      item.answer = raw; item.group = part.charAt(0) === '#' ? 'b' : 'a'; return item;
    });
  }
  function parseDragWords(text) { return parseMarked(text, /(\*[^*]+\*|#[^#]+#)/g, 'b'); }
  function parseFillBlanks(text) { return parseMarked(text, /(\*[^*]+\*)/g, 'fb', true); }
  function optionLabel(style, index) {
    if (style === 'ALPHA' || !style) return String.fromCharCode(65 + index);
    if (style === 'NUMERIC') return String(index + 1);
    if (style === 'ROMAN') return ROMAN[index] || String(index + 1);
    return '';
  }
  function defaultData(type) {
    switch (type) {
      case 'MCQ': return { choices: [{ id: uid('c'), text: '', isCorrect: false }, { id: uid('c'), text: '', isCorrect: false }], multiple: false, labelStyle: 'ALPHA' };
      case 'TF': return { correct: true };
      case 'ESSAY': return { minWords: 0 };
      case 'SORT_PARAGRAPHS': return { paragraphs: [{ id: uid('p'), text: '' }, { id: uid('p'), text: '' }] };
      case 'DRAG_WORDS': return { text: '', distractors: [] };
      case 'FILL_BLANKS': return { text: '', style: {} };
      case 'DRAG_DROP': return { backgroundImage: '', zones: [], items: [] };
      case 'SPEAK_WORDS': return { prompt: '', acceptedAnswers: [], lang: 'en-US' };
      case 'SPEAK_WORDS_SET': return { items: [{ id: uid('sw'), prompt: '', acceptedAnswers: [] }], lang: 'en-US' };
      case 'DICTATION': return { script: '', lang: 'en-US', rate: 1, plays: 0 };
      default: return {};
    }
  }
  /** what a student receives (answer keys removed, choices shuffled): backend safeQuestionData */
  function safeData(type, raw) {
    raw = raw || {};
    if (type === 'MCQ') return { choices: shuffle(list(raw.choices).map(function (c) { return { id: c.id, text: c.text }; })), multiple: Boolean(raw.multiple), labelStyle: raw.labelStyle || 'ALPHA' };
    if (type === 'TF' || type === 'TEXT') return {};
    if (type === 'ESSAY') return { minWords: Number(raw.minWords) || 0 };
    if (type === 'SORT_PARAGRAPHS') return { paragraphs: shuffle(list(raw.paragraphs).map(function (p) { return { id: p.id, text: p.text }; })) };
    if (type === 'DRAG_WORDS') { var parsed = parseDragWords(raw.text); return { segments: parsed.map(function (s) { return s.type === 'blank' ? { type: 'blank', id: s.id, group: s.group } : s; }), wordBank: shuffle(parsed.filter(function (s) { return s.type === 'blank'; }).map(function (s) { return { word: s.answer, group: s.group }; }).concat(list(raw.distractors).map(function (w) { return { word: w, group: 'a' }; }))) }; }
    if (type === 'FILL_BLANKS') return { segments: parseFillBlanks(raw.text).map(function (s) { return s.type === 'blank' ? { type: 'blank', id: s.id } : s; }), style: raw.style || {} };
    if (type === 'DRAG_DROP') return { backgroundImage: raw.backgroundImage, zones: list(raw.zones).map(function (z) { return { id: z.id, x: z.x, y: z.y, width: z.width, height: z.height }; }), items: shuffle(list(raw.items).map(function (i) { return { id: i.id, label: i.label }; })) };
    if (type === 'SPEAK_WORDS') { var a = { prompt: raw.prompt }; if (raw.lang) a.lang = raw.lang; return a; }
    if (type === 'SPEAK_WORDS_SET') { var b = { items: list(raw.items).map(function (i) { return { id: i.id, prompt: i.prompt }; }) }; if (raw.lang) b.lang = raw.lang; return b; }
    if (type === 'DICTATION') { var d = { script: raw.script, rate: Number(raw.rate) || 1, plays: Number(raw.plays) || 0 }; if (raw.audio) d.audio = raw.audio; if (raw.audioUrl) d.audioUrl = raw.audioUrl; if (raw.lang) d.lang = raw.lang; return d; }
    return {};
  }
  /** { automatic, marks }: backend gradeQuestionData */
  function grade(type, raw, response, marks) {
    var data = raw || {}; var full = Number(marks) || 0;
    if (type === 'ESSAY') return { automatic: false, marks: 0 };
    if (type === 'TEXT') return { automatic: true, marks: 0 };
    if (response == null) return { automatic: true, marks: 0 };
    var given = response && typeof response === 'object' ? response : {};
    var partial = function (items, ok) { return { automatic: true, marks: full * items.filter(ok).length / (items.length || 1) }; };
    if (type === 'MCQ') {
      var correct = list(data.choices).filter(function (c) { return c.isCorrect; }).map(function (c) { return String(c.id); });
      var chosen = (Array.isArray(response) ? response : [response]).map(String).filter(function (v, i, all) { return all.indexOf(v) === i; });
      return { automatic: true, marks: chosen.length === correct.length && chosen.every(function (c) { return correct.indexOf(c) >= 0; }) ? full : 0 };
    }
    if (type === 'TF') return { automatic: true, marks: Boolean(response) === Boolean(data.correct) ? full : 0 };
    if (type === 'SORT_PARAGRAPHS') { var order = list(response).map(String); return partial(list(data.paragraphs), function (p, i) { return order[i] === String(p.id); }); }
    if (type === 'DRAG_WORDS') return partial(parseDragWords(data.text).filter(function (s) { return s.type === 'blank'; }), function (b) { return clean(given[b.id]).toLowerCase() === clean(b.answer).toLowerCase(); });
    if (type === 'FILL_BLANKS') return partial(parseFillBlanks(data.text).filter(function (s) { return s.type === 'blank'; }), function (b) { return b.answers.map(normalizeAnswer).indexOf(normalizeAnswer(given[b.id])) >= 0; });
    if (type === 'DRAG_DROP') return partial(list(data.items), function (i) { return given[i.id] === i.correctZoneId; });
    if (type === 'SPEAK_WORDS') return { automatic: true, marks: list(data.acceptedAnswers).map(normalizeAnswer).indexOf(normalizeAnswer(response)) >= 0 ? full : 0 };
    if (type === 'SPEAK_WORDS_SET') return partial(list(data.items), function (i) { return list(i.acceptedAnswers).map(normalizeAnswer).indexOf(normalizeAnswer(given[i.id])) >= 0; });
    if (type === 'DICTATION') { var words = normalizeAnswer(response).split(' ').filter(Boolean); return partial(normalizeAnswer(data.script).split(' ').filter(Boolean), function (w, i) { return words[i] === w; }); }
    return { automatic: false, marks: 0 };
  }
  function answered(type, value) {
    if (type === 'TEXT' || value == null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).some(function (k) { return clean(value[k]); });
    return true;
  }
  function wordCount(text) { return clean(text).split(/\s+/).filter(Boolean).length; }
  /** consecutive questions with the same section form one page (mono's groupQuestionsBySection) */
  function pages(questions) {
    var out = [];
    questions.forEach(function (q, i) {
      var section = clean(q.section) || null; var last = out[out.length - 1];
      if (last && last.section === section) last.questions.push(q); else out.push({ section: section, questions: [q], start: i });
    });
    return out;
  }
  /** question numbers, skipping passages (null) */
  function numbers(questions) { var n = 0; return questions.map(function (q) { return q.type === 'TEXT' ? null : ++n; }); }

  var logic = { TYPES: TYPES, TYPE_LABEL: TYPE_LABEL, LABEL_STYLES: LABEL_STYLES, LABEL_STYLE_NAME: LABEL_STYLE_NAME, LANGUAGES: LANGUAGES, normalizeAnswer: normalizeAnswer, parseDragWords: parseDragWords, parseFillBlanks: parseFillBlanks, optionLabel: optionLabel, defaultData: defaultData, safeData: safeData, grade: grade, answered: answered, wordCount: wordCount, pages: pages, numbers: numbers, uid: uid, shuffle: shuffle };
  if (typeof module !== 'undefined' && module.exports) { module.exports = logic; return; }

  // ---------- browser only from here ----------
  var X = global.Exam, el = X.el, clear = X.clear;

  // A drag with a finger or the mouse (pointer events), or a tap: onTap() for a tap, onDrop(target) for a
  // drag released over an element marked data-drop.
  function draggable(node, label, onDrop, onTap) {
    node.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      var startX = e.clientX, startY = e.clientY, ghost = null, over = null;
      var move = function (m) {
        if (!ghost && Math.abs(m.clientX - startX) + Math.abs(m.clientY - startY) < 6) return;
        if (!ghost) { ghost = el('div', { class: node.className.replace(/\b(used|picked)\b/g, '') + ' ghost', text: label }); document.body.appendChild(ghost); node.classList.add('used'); }
        ghost.style.left = (m.clientX - ghost.offsetWidth / 2) + 'px'; ghost.style.top = (m.clientY - ghost.offsetHeight / 2) + 'px';
        var hit = document.elementFromPoint(m.clientX, m.clientY); var target = hit && hit.closest ? hit.closest('[data-drop]') : null;
        if (over !== target) { if (over) over.classList.remove('target'); over = target; if (over) over.classList.add('target'); }
        m.preventDefault();
      };
      var up = function () {
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
        if (over) over.classList.remove('target');
        if (ghost) { ghost.remove(); node.classList.remove('used'); if (over) onDrop(over); else onDrop(null); }
        else if (onTap) onTap();
      };
      document.addEventListener('pointermove', move, { passive: false }); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    });
  }

  function speechHelp(ctx) { return ctx && ctx.speech === false ? el('p', { class: 'tiny faint', text: 'Speaking needs Chrome or Edge with a microphone. You can type what you would say instead.' }) : null; }

  // the 🎤 button and the typed answer (mono's SpeechCaptureInput, with the school page listening)
  function speakInput(value, onChange, lang, ctx, disabled) {
    var input = el('input', { value: value || '', placeholder: 'What you said (or type it)', 'aria-label': 'Your spoken answer', disabled: disabled, oninput: function () { onChange(input.value); } });
    var mic = el('button', { type: 'button', class: 'outline', disabled: disabled || (ctx && ctx.speech === false), onclick: function () {
      mic.disabled = true; mic.textContent = '🎤 Listening…';
      X.ui.speech.listen({ lang: lang || 'en-US', seconds: 12 }).then(function (heard) {
        var text = (heard && heard.transcript) || '';
        if (text) { input.value = text; onChange(text); }
      }).catch(function (e) { if (ctx && ctx.onError) ctx.onError(X.errorText(e)); }).then(function () { mic.disabled = false; mic.textContent = '🎤 Speak'; });
    } }, ['🎤 Speak']);
    return el('div', { class: 'stack' }, [el('div', { class: 'mic' }, [mic, el('div', { class: 'heard' }, [input])]), el('p', { class: 'tiny faint', text: "Grading is based on what your browser's speech recognizer heard — it isn't always perfect." })]);
  }

  /** The student's input for a question (q: { id, type, data } with student-safe data). */
  function input(q, value, onChange, ctx) {
    var d = q.data || {}; var off = ctx && ctx.disabled;
    if (q.type === 'TEXT') return null;
    if (q.type === 'MCQ') {
      var selected = Array.isArray(value) ? value.slice() : [];
      var multi = Boolean(d.multiple);
      var box = el('div', { class: 'options', role: multi ? 'group' : 'radiogroup' });
      list(d.choices).forEach(function (c, i) {
        var on = selected.indexOf(c.id) >= 0; var label = optionLabel(d.labelStyle, i);
        var option = el('label', { class: 'option' + (multi ? ' multi' : '') + (on ? ' on' : '') }, [
          el('input', { type: multi ? 'checkbox' : 'radio', name: 'q-' + q.id, class: 'sr', style: 'position:absolute;opacity:0;width:1px', checked: on, disabled: off, onchange: function () {
            if (multi) selected = selected.indexOf(c.id) >= 0 ? selected.filter(function (x) { return x !== c.id; }) : selected.concat([c.id]); else selected = [c.id];
            Array.prototype.forEach.call(box.children, function (child, j) { child.classList.toggle('on', selected.indexOf(list(d.choices)[j].id) >= 0); });
            onChange(selected.slice());
          } }),
          el('span', { class: 'mark' }), label ? el('span', { class: 'label', text: label + '.' }) : null, el('span', { text: c.text }),
        ]);
        box.appendChild(option);
      });
      return box;
    }
    if (q.type === 'TF') {
      var tf = el('div', { class: 'tf', role: 'radiogroup' });
      [true, false].forEach(function (v) {
        tf.appendChild(el('label', { class: 'option' + (value === v ? ' on' : '') }, [
          el('input', { type: 'radio', name: 'q-' + q.id, style: 'position:absolute;opacity:0;width:1px', checked: value === v, disabled: off, onchange: function () { Array.prototype.forEach.call(tf.children, function (c, j) { c.classList.toggle('on', (j === 0) === v); }); onChange(v); } }),
          el('span', { text: v ? 'True' : 'False', style: 'font-weight:600' }),
        ]));
      });
      return tf;
    }
    if (q.type === 'ESSAY') {
      var count = el('p', { class: 'tiny faint' });
      var area = el('textarea', { rows: '7', placeholder: 'Write your answer…', 'aria-label': 'Your answer', disabled: off, value: typeof value === 'string' ? value : '', oninput: function () { onChange(area.value); words(); } });
      var words = function () { var n = wordCount(area.value); count.textContent = n + ' word' + (n === 1 ? '' : 's') + (d.minWords ? ' · at least ' + d.minWords : ''); count.style.color = d.minWords && n < d.minWords ? 'var(--warn)' : ''; };
      words();
      return el('div', {}, [area, count]);
    }
    if (q.type === 'SORT_PARAGRAPHS') return sortInput(q, value, onChange, off);
    if (q.type === 'DRAG_WORDS') return dragWordsInput(q, value, onChange, off);
    if (q.type === 'FILL_BLANKS') {
      var given = value && typeof value === 'object' ? Object.assign({}, value) : {};
      var style = d.style || {};
      var p = el('div', { class: 'sentence' });
      ['fontFamily', 'fontSize', 'lineHeight', 'textAlign'].forEach(function (k) { if (style[k]) p.style[k] = style[k]; });
      var n = 0;
      list(d.segments).forEach(function (s) {
        if (s.type !== 'blank') { p.appendChild(document.createTextNode(s.value)); return; }
        var box = el('input', { class: 'blank-input', 'aria-label': 'Blank ' + (++n), value: given[s.id] || '', disabled: off, oninput: function () { given[s.id] = box.value; onChange(Object.assign({}, given)); } });
        p.appendChild(box);
      });
      return el('div', {}, [el('p', { class: 'tiny muted', text: 'Type the missing word in each blank.', style: 'margin-bottom:6px' }), p]);
    }
    if (q.type === 'DRAG_DROP') return dragDropInput(q, value, onChange, ctx);
    if (q.type === 'SPEAK_WORDS') return el('div', { class: 'stack' }, [el('div', { class: 'prompt-box', text: d.prompt || '' }), speakInput(typeof value === 'string' ? value : '', onChange, d.lang, ctx, off), speechHelp(ctx)]);
    if (q.type === 'SPEAK_WORDS_SET') {
      var answers = value && typeof value === 'object' ? Object.assign({}, value) : {};
      return el('div', { class: 'stack' }, list(d.items).map(function (item, i) {
        return el('div', { class: 'card pad' }, [el('p', { class: 'small muted', text: 'Say ' + (i + 1) }), el('div', { class: 'prompt-box', text: item.prompt, style: 'margin:6px 0' }),
          speakInput(answers[item.id] || '', function (v) { answers[item.id] = v; onChange(Object.assign({}, answers)); }, d.lang, ctx, off)]);
      }).concat([speechHelp(ctx)]));
    }
    if (q.type === 'DICTATION') return dictationInput(q, value, onChange, ctx);
    return el('p', { class: 'small', style: 'color:var(--bad)', text: 'Unsupported question type' });
  }

  function sortInput(q, value, onChange, off) {
    var byId = {}; list(q.data.paragraphs).forEach(function (p) { byId[p.id] = p; });
    var order = Array.isArray(value) && value.length ? value.filter(function (id) { return byId[id]; }) : list(q.data.paragraphs).map(function (p) { return p.id; });
    list(q.data.paragraphs).forEach(function (p) { if (order.indexOf(p.id) < 0) order.push(p.id); });
    var box = el('div', { class: 'sortable' });
    var render = function () {
      clear(box);
      order.forEach(function (id, i) {
        var move = function (to) { if (off || to < 0 || to >= order.length) return; order.splice(to, 0, order.splice(i, 1)[0]); onChange(order.slice()); render(); };
        var item = el('div', { class: 'item', 'data-index': String(i) }, [
          el('span', { class: 'grip', text: '⠿', 'aria-hidden': 'true' }), el('span', { class: 'pos', text: String(i + 1) }), el('span', { class: 'grow', text: byId[id].text }),
          el('button', { type: 'button', class: 'icon', title: 'Move up', 'aria-label': 'Move up', disabled: off || i === 0, onclick: function () { move(i - 1); } }, ['▲']),
          el('button', { type: 'button', class: 'icon', title: 'Move down', 'aria-label': 'Move down', disabled: off || i === order.length - 1, onclick: function () { move(i + 1); } }, ['▼']),
        ]);
        // drag by the grip: the item lands where the finger is released
        item.querySelector('.grip').addEventListener('pointerdown', function (e) {
          if (off) return; e.preventDefault(); item.classList.add('dragging');
          var up = function (u) {
            document.removeEventListener('pointerup', up); item.classList.remove('dragging');
            var hit = document.elementFromPoint(u.clientX, u.clientY); var target = hit && hit.closest ? hit.closest('.sortable .item') : null;
            if (target && target.parentNode === box) move(Number(target.getAttribute('data-index')));
          };
          document.addEventListener('pointerup', up);
        });
        box.appendChild(item);
      });
    };
    render();
    return el('div', {}, [el('p', { class: 'tiny muted', text: 'Put the paragraphs in the right order (drag ⠿ or use ▲ ▼).', style: 'margin-bottom:6px' }), box]);
  }

  function dragWordsInput(q, value, onChange, off) {
    var placed = value && typeof value === 'object' ? Object.assign({}, value) : {};
    var picked = null; // a word chosen by tapping, waiting for a blank
    var wrap = el('div');
    var render = function () {
      clear(wrap);
      var sentence = el('div', { class: 'sentence' }); var n = 0;
      list(q.data.segments).forEach(function (s) {
        if (s.type !== 'blank') { sentence.appendChild(document.createTextNode(s.value)); return; }
        var word = placed[s.id];
        sentence.appendChild(el('span', { class: 'blank' + (s.group === 'b' ? ' b' : '') + (word ? ' filled' : ''), 'data-drop': s.id, role: 'button', tabindex: '0', 'aria-label': 'Blank ' + (++n) + (word ? ': ' + word + ' (tap to clear)' : ' (empty)'), onclick: function () {
          if (off) return;
          if (picked) { placed[s.id] = picked; picked = null; } else if (word) delete placed[s.id];
          onChange(Object.assign({}, placed)); render();
        } }, [word || ' ']));
      });
      var used = {}; Object.keys(placed).forEach(function (k) { used[placed[k]] = (used[placed[k]] || 0) + 1; });
      var bank = el('div', { class: 'bank', 'aria-label': 'Words' });
      list(q.data.wordBank).forEach(function (w) {
        var isUsed = used[w.word] > 0; if (isUsed) used[w.word]--;
        var chip = el('span', { class: 'word' + (w.group === 'b' ? ' b' : '') + (isUsed ? ' used' : '') + (picked === w.word && !isUsed ? ' picked' : ''), text: w.word, role: 'button', tabindex: '0' });
        if (!isUsed && !off) draggable(chip, w.word, function (target) { if (target) { placed[target.getAttribute('data-drop')] = w.word; picked = null; onChange(Object.assign({}, placed)); } render(); }, function () { picked = picked === w.word ? null : w.word; render(); });
        bank.appendChild(chip);
      });
      wrap.appendChild(el('p', { class: 'tiny muted', text: 'Drag a word into each blank, or tap a word then its blank (tap a filled blank to clear it).', style: 'margin-bottom:6px' }));
      wrap.appendChild(sentence); wrap.appendChild(bank);
    };
    render();
    return wrap;
  }

  function dragDropInput(q, value, onChange, ctx) {
    var d = q.data || {}; var off = ctx && ctx.disabled;
    var placed = value && typeof value === 'object' ? Object.assign({}, value) : {};
    var picked = null;
    var labels = {}; list(d.items).forEach(function (i) { labels[i.id] = i.label; });
    var img = el('img', { alt: 'Drag and drop picture' });
    var board = el('div', { class: 'board' }, [img]);
    var tray = el('div', { class: 'bank' });
    X.loadMedia(d.backgroundImage, ctx && ctx.student).then(function (src) { if (src) img.src = src; }).catch(function () { board.appendChild(el('p', { class: 'small', style: 'padding:12px;color:var(--bad)', text: 'The picture could not be loaded.' })); });
    var place = function (itemId, zoneId) {
      Object.keys(placed).forEach(function (k) { if (placed[k] === zoneId) delete placed[k]; }); // one item per zone
      placed[itemId] = zoneId; picked = null; onChange(Object.assign({}, placed)); render();
    };
    var render = function () {
      Array.prototype.slice.call(board.querySelectorAll('.zone')).forEach(function (z) { z.remove(); });
      list(d.zones).forEach(function (z, n) {
        var here = Object.keys(placed).filter(function (k) { return placed[k] === z.id; })[0];
        var zone = el('div', { class: 'zone' + (here ? ' filled' : ''), 'data-drop': z.id, style: 'left:' + z.x + '%;top:' + z.y + '%;width:' + z.width + '%;height:' + z.height + '%', onclick: function () {
          if (off) return; if (picked) place(picked, z.id); else if (here) { delete placed[here]; onChange(Object.assign({}, placed)); render(); }
        } }, [el('span', { class: 'zone-no', text: String(n + 1) }), here ? el('span', { class: 'word', text: labels[here] }) : null]);
        board.appendChild(zone);
      });
      clear(tray);
      list(d.items).filter(function (i) { return !placed[i.id]; }).forEach(function (i) {
        var chip = el('span', { class: 'word' + (picked === i.id ? ' picked' : ''), text: i.label, role: 'button', tabindex: '0' });
        if (!off) draggable(chip, i.label, function (target) { if (target) place(i.id, target.getAttribute('data-drop')); else render(); }, function () { picked = picked === i.id ? null : i.id; render(); });
        tray.appendChild(chip);
      });
      if (!tray.children.length) tray.appendChild(el('span', { class: 'small faint', text: 'Every item is placed — tap one on the picture to take it back.' }));
    };
    render();
    return el('div', {}, [board, el('p', { class: 'tiny muted', text: 'Drag each item onto the matching spot on the picture, or tap an item then its spot.', style: 'margin:8px 0 0' }), tray]);
  }

  function dictationInput(q, value, onChange, ctx) {
    var d = q.data || {}; var off = ctx && ctx.disabled;
    var key = 'plays-' + q.id; var played = (ctx && ctx.plays && ctx.plays[key]) || 0;
    var info = el('span', { class: 'small muted' });
    var showPlays = function () { info.textContent = d.plays ? (Math.max(0, d.plays - played) + ' of ' + d.plays + ' plays left') : ''; };
    var play = el('button', { type: 'button', class: 'outline', disabled: off, onclick: function () {
      if (d.plays && played >= d.plays) return;
      play.disabled = true; play.textContent = '🔊 Playing…';
      var done = function () { play.disabled = off || Boolean(d.plays && played >= d.plays); play.textContent = '▶ Play'; showPlays(); };
      var go = d.audio ? X.loadMedia(d.audio, ctx && ctx.student).then(function (src) { if (!src) throw new Error('The recording could not be loaded.'); return X.ui.speech.play(src); })
        : X.ui.speech.speak(d.script || '', { lang: d.lang || 'en-US', rate: d.rate || 1 });
      played += 1; if (ctx && ctx.plays) { ctx.plays[key] = played; if (ctx.onPlays) ctx.onPlays(); }
      go.catch(function (e) { if (ctx && ctx.onError) ctx.onError(X.errorText(e)); }).then(done);
    } }, ['▶ Play']);
    var stop = el('button', { type: 'button', class: 'sm', onclick: function () { X.ui.speech.stop(); } }, ['■ Stop']);
    if (d.plays && played >= d.plays) play.disabled = true;
    showPlays();
    var area = el('textarea', { rows: '4', placeholder: 'Type what you hear…', 'aria-label': 'What you hear', disabled: off, value: typeof value === 'string' ? value : '', oninput: function () { onChange(area.value); } });
    return el('div', { class: 'stack' }, [el('div', { class: 'play-row' }, [play, stop, info]), area]);
  }

  // ---------- the gradebook: an answer against the key ----------
  function award(marks, full) {
    var cls = marks >= full ? 'full' : marks > 0 ? 'part' : 'none';
    return el('span', { class: 'award ' + cls, text: '+' + X.num(marks) + ' (auto)' });
  }
  function key(items) { return el('ul', { class: 'key' }, items); }
  function li(text, cls) { return el('li', { class: cls || '', text: text }); }
  function review(q, answer) {
    var d = q.data || {}; var given = answer && typeof answer === 'object' ? answer : {};
    switch (q.type) {
      case 'MCQ': {
        var chosen = (Array.isArray(answer) ? answer : answer != null ? [answer] : []).map(String);
        return key(list(d.choices).map(function (c) { return li((chosen.indexOf(String(c.id)) >= 0 ? '☑ ' : '☐ ') + c.text + (c.isCorrect ? ' (correct)' : ''), c.isCorrect ? 'right' : chosen.indexOf(String(c.id)) >= 0 ? 'wrong' : ''); }));
      }
      case 'TF': return key([li('Answer: ' + (answer == null ? '—' : answer ? 'True' : 'False'), answer == null ? '' : Boolean(answer) === Boolean(d.correct) ? 'right' : 'wrong'), li('Correct answer: ' + (d.correct ? 'True' : 'False'))]);
      case 'ESSAY': return el('div', {}, [el('div', { class: 'answer-box', text: typeof answer === 'string' && answer.trim() ? answer : '(no answer)' }), el('p', { class: 'tiny faint', text: wordCount(answer) + ' words' + (d.minWords ? ' · at least ' + d.minWords + ' asked' : '') })]);
      case 'SORT_PARAGRAPHS': {
        var byId = {}; list(d.paragraphs).forEach(function (p) { byId[p.id] = p.text; });
        var order = Array.isArray(answer) ? answer : [];
        return key(list(d.paragraphs).map(function (p, i) { var put = order[i]; return li((i + 1) + '. ' + (put ? byId[put] : '—') + (put === p.id ? '' : '  → should be: ' + p.text), put === p.id ? 'right' : 'wrong'); }));
      }
      case 'DRAG_WORDS': return key(parseDragWords(d.text).filter(function (s) { return s.type === 'blank'; }).map(function (b, i) { var ok = clean(given[b.id]).toLowerCase() === clean(b.answer).toLowerCase(); return li('Blank ' + (i + 1) + ': ' + (given[b.id] || '—') + (ok ? '' : '  → ' + b.answer), ok ? 'right' : 'wrong'); }));
      case 'FILL_BLANKS': return key(parseFillBlanks(d.text).filter(function (s) { return s.type === 'blank'; }).map(function (b, i) { var ok = b.answers.map(normalizeAnswer).indexOf(normalizeAnswer(given[b.id])) >= 0; return li('Blank ' + (i + 1) + ': ' + (given[b.id] || '—') + (ok ? '' : '  → ' + b.answers.join(' / ')), ok ? 'right' : 'wrong'); }));
      case 'DRAG_DROP': {
        var zoneNo = {}; list(d.zones).forEach(function (z, n) { zoneNo[z.id] = n + 1; });
        return key(list(d.items).map(function (i) { var ok = given[i.id] === i.correctZoneId; return li(i.label + ' → spot ' + (zoneNo[given[i.id]] || '—') + (ok ? '' : '  (correct: spot ' + zoneNo[i.correctZoneId] + ')'), ok ? 'right' : 'wrong'); }));
      }
      case 'SPEAK_WORDS': { var ok = list(d.acceptedAnswers).map(normalizeAnswer).indexOf(normalizeAnswer(answer)) >= 0; return key([li('Said: ' + (answer || '—'), ok ? 'right' : 'wrong'), li('Accepted: ' + list(d.acceptedAnswers).join(' / '))]); }
      case 'SPEAK_WORDS_SET': return key(list(d.items).map(function (i) { var good = list(i.acceptedAnswers).map(normalizeAnswer).indexOf(normalizeAnswer(given[i.id])) >= 0; return li(i.prompt + ': ' + (given[i.id] || '—') + (good ? '' : '  → ' + list(i.acceptedAnswers).join(' / ')), good ? 'right' : 'wrong'); }));
      case 'DICTATION': {
        var words = normalizeAnswer(answer).split(' ').filter(Boolean);
        var box = el('div', { class: 'answer-box diff' });
        clean(d.script).split(/\s+/).filter(Boolean).forEach(function (w, i) { box.appendChild(el(normalizeAnswer(w) === words[i] ? 'ins' : 'del', { text: w })); box.appendChild(document.createTextNode(' ')); });
        return el('div', {}, [el('p', { class: 'tiny muted', text: 'Typed: ' + (answer || '—') }), box, el('p', { class: 'tiny faint', text: 'Green: heard right · red: missed or wrong (word by word, in order).' })]);
      }
      default: return null;
    }
  }

  global.ExamQuestions = Object.assign({}, logic, { input: input, review: review, award: award, draggable: draggable });
})(typeof window !== 'undefined' ? window : globalThis);
