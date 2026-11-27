/* The gradebook of one exam (mono's teacher/exams/[id]/attempts): every attempt, the Grade / Review
 * panel (each question with the student's answer against the key, automatic marks, marks for essays,
 * feedback) and ↻ Re-attempt. Plugin API: GET workspace/exams/:id/attempts, POST attempts/:id/grade,
 * DELETE attempts/:id/reset. */
(function () {
  'use strict';
  var X = window.Exam, Q = window.ExamQuestions, ui = X.ui, $ = X.$, el = X.el, clear = X.clear;
  var state = { exam: null, attempts: [], open: null, tab: 'ALL' };

  function failed(e) { X.say('message', ''); X.say('error', X.errorText(e), 'bad'); window.scrollTo(0, 0); }
  function done(text) { X.say('error', ''); X.say('message', text); }
  var manualQuestions = function () { return state.exam.questions.filter(function (q) { return q.type === 'ESSAY'; }); };

  function stats() {
    var box = clear($('stats')); var exam = state.exam;
    var graded = state.attempts.filter(function (a) { return a.status === 'GRADED'; });
    var passed = graded.filter(function (a) { return a.grade === 'PASS'; }).length;
    var average = graded.length ? graded.reduce(function (s, a) { return s + Number(a.score || 0); }, 0) / graded.length : null;
    box.appendChild(X.stat('Total Marks', X.num(exam.totalMarks), '📋', 'tone-indigo'));
    box.appendChild(X.stat('Pass Mark', X.num(exam.passMark), '✅', 'tone-ok', graded.length ? passed + ' of ' + graded.length + ' passed' : null));
    box.appendChild(X.stat('Questions', exam.questions.filter(function (q) { return q.type !== 'TEXT'; }).length, '❓', 'tone-sky', average == null ? null : 'average ' + X.num(average)));
    box.appendChild(X.stat('Need Manual Grading', manualQuestions().length, '✍️', 'tone-amber', state.attempts.filter(function (a) { return a.status === 'SUBMITTED'; }).length + ' waiting'));
  }

  function tabs() {
    var box = clear($('tabs'));
    var count = function (s) { return state.attempts.filter(function (a) { return s === 'ALL' || a.status === s; }).length; };
    [['ALL', 'All'], ['SUBMITTED', 'To grade'], ['GRADED', 'Graded'], ['IN_PROGRESS', 'In progress']].forEach(function (t) {
      box.appendChild(el('button', { type: 'button', 'aria-current': String(state.tab === t[0]), onclick: function () { state.tab = t[0]; tabs(); render(); } }, [t[1] + ' (' + count(t[0]) + ')']));
    });
  }

  function gradePanel(attempt) {
    var exam = state.exam; var answers = attempt.answers || {}; var existing = attempt.manualMarks || {};
    var marks = {}; var numbers = Q.numbers(exam.questions);
    var total = el('b'); var autoTotal = 0;
    var feedback = el('textarea', { rows: '3', placeholder: 'Feedback for the student (optional)', 'aria-label': 'Feedback', value: attempt.feedback || '' });
    var panel = el('div', { class: 'panel-grade' });
    var recount = function () {
      var manual = Object.keys(marks).reduce(function (s, k) { var v = parseFloat(marks[k].value); return s + (isNaN(v) ? 0 : v); }, 0);
      var score = autoTotal + manual;
      total.textContent = X.num(score) + ' / ' + X.num(exam.totalMarks) + ' · ' + (score >= Number(exam.passMark) ? 'PASS' : 'FAIL');
      total.style.color = score >= Number(exam.passMark) ? 'var(--ok-dark)' : 'var(--bad)';
    };
    exam.questions.forEach(function (q, i) {
      var auto = q.type !== 'ESSAY';
      var g = Q.grade(q.type, q.data, answers[q.id], q.marks);
      if (auto) autoTotal += g.marks;
      var head = el('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;margin-bottom:4px' }, [
        el('div', { class: 'grow small', style: 'font-weight:600' }, [el('span', { text: q.type === 'TEXT' ? '📖 Reading Passage' : 'Q' + numbers[i] + '.' }), X.rich(q.text), el('span', { class: 'tiny faint', style: 'font-weight:400', text: '(' + Q.TYPE_LABEL[q.type] + ' · ' + X.plural(X.num(q.marks), 'mark') + ')' })]),
        auto && q.type !== 'TEXT' ? Q.award(g.marks, Number(q.marks)) : null,
      ]);
      var card = el('div', { class: 'review ' + (auto ? 'auto' : 'manual') }, [head, q.type === 'TEXT' ? null : Q.review(q, answers[q.id])]);
      if (!auto) {
        var input = el('input', { type: 'number', min: '0', max: String(q.marks), step: 'any', style: 'width:110px', 'aria-label': 'Marks for question ' + numbers[i], value: existing[q.id] !== undefined ? String(existing[q.id]) : '', oninput: recount });
        marks[q.id] = input;
        card.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [el('span', { class: 'small', style: 'font-weight:600', text: 'Marks' }), input, el('span', { class: 'small muted', text: '/ ' + X.num(q.marks) })]));
      }
      panel.appendChild(card);
    });
    var save = el('button', { type: 'button', class: 'primary', onclick: function () {
      var perQuestionMarks = {}; var problem = null;
      Object.keys(marks).forEach(function (id) {
        var v = marks[id].value.trim(); if (v === '') return; var n = parseFloat(v); var max = Number((exam.questions.filter(function (q) { return q.id === id; })[0] || {}).marks);
        if (isNaN(n) || n < 0 || n > max) problem = 'Marks must be between 0 and the question\'s marks.'; else perQuestionMarks[id] = n;
      });
      if (problem) { failed(new Error(problem)); return; }
      save.disabled = true; save.textContent = 'Saving…';
      ui.api.post('attempts/' + encodeURIComponent(attempt.id) + '/grade', { perQuestionMarks: perQuestionMarks, feedback: feedback.value.trim() || undefined }).then(function (r) {
        done(attempt.studentName + ': ' + X.num(r.score) + ' / ' + X.num(exam.totalMarks) + ' — ' + r.grade + '.'); state.open = null; return load();
      }).catch(failed).then(function () { save.disabled = false; save.textContent = '💾 Save grades'; });
    } }, ['💾 Save grades']);
    panel.appendChild(el('label', { class: 'field' }, ['Feedback', feedback]));
    panel.appendChild(el('div', { class: 'row', style: 'justify-content:space-between' }, [el('span', { class: 'small' }, ['Total: ', total]), attempt.status === 'IN_PROGRESS' ? el('span', { class: 'small muted', text: 'The student is still taking this exam.' }) : save]));
    recount();
    return panel;
  }

  function row(attempt) {
    var exam = state.exam; var open = state.open === attempt.id;
    var score = attempt.status === 'IN_PROGRESS' ? '—' : X.num(attempt.score || 0) + ' / ' + X.num(exam.totalMarks);
    var card = el('div', { class: 'card', style: 'overflow:hidden', 'data-attempt': attempt.id }, [
      el('div', { class: 'exam-row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'row', style: 'gap:8px' }, [el('b', { text: attempt.studentName }), attempt.studentNumber ? el('span', { class: 'small faint', text: attempt.studentNumber }) : null, Number(attempt.attemptNumber) > 1 ? X.chip('Attempt ' + attempt.attemptNumber, 'attempt') : null]),
          el('p', { class: 'small muted', text: (attempt.status === 'IN_PROGRESS' ? 'Started: ' + X.dateTime(attempt.startedAt) : 'Submitted: ' + X.dateTime(attempt.submittedAt)) + (attempt.gradedAt ? ' · Graded: ' + X.dateTime(attempt.gradedAt) : '') }),
        ]),
        el('div', { class: 'actions' }, [
          el('div', { style: 'text-align:right' }, [el('div', { class: 'row', style: 'gap:6px;justify-content:flex-end' }, [el('b', { class: 'small', text: score }), attempt.grade && attempt.status === 'GRADED' ? X.chip(attempt.grade) : null]), X.chip(attempt.status.replace('_', ' '), attempt.status)]),
          el('button', { type: 'button', class: 'sm outline', onclick: function () { state.open = open ? null : attempt.id; render(); } }, [open ? 'Close' : attempt.status === 'GRADED' ? 'Review' : attempt.status === 'IN_PROGRESS' ? 'View' : 'Grade']),
          el('button', { type: 'button', class: 'sm warn-line', onclick: function () {
            X.confirm('Allow re-attempt?', 'This permanently deletes ' + attempt.studentName + "'s current attempt" + (attempt.score != null ? ' (score: ' + X.num(attempt.score) + '/' + X.num(exam.totalMarks) + ')' : '') + ' so they can take this exam again from the start. They are notified.', 'Delete & Allow Retry', true).then(function (yes) {
              if (!yes) return;
              ui.api.delete('attempts/' + encodeURIComponent(attempt.id) + '/reset').then(function () { done(attempt.studentName + ' can take the exam again.'); return load(); }).catch(failed);
            });
          } }, ['↻ Re-Attempt']),
        ]),
      ]),
    ]);
    if (open) card.appendChild(gradePanel(attempt));
    return card;
  }

  function render() {
    var list = clear($('list'));
    var q = $('search').value.trim().toLowerCase();
    var shown = state.attempts.filter(function (a) { return (state.tab === 'ALL' || a.status === state.tab) && (!q || (a.studentName || '').toLowerCase().indexOf(q) >= 0 || (a.studentNumber || '').toLowerCase().indexOf(q) >= 0); });
    if (!state.attempts.length) { list.appendChild(X.empty('🧑‍🎓', 'No student has attempted this exam yet.')); return; }
    if (!shown.length) { list.appendChild(X.empty('🔍', 'No attempt matches')); return; }
    shown.forEach(function (a) { list.appendChild(row(a)); });
  }

  function csv() {
    var exam = state.exam; var numbers = Q.numbers(exam.questions);
    var scored = exam.questions.filter(function (q) { return q.type !== 'TEXT'; });
    var cell = function (v) { var s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var head = ['Student', 'Number', 'Attempt', 'Status', 'Score', 'Total', 'Grade', 'Submitted'].concat(scored.map(function (q) { return 'Q' + numbers[exam.questions.indexOf(q)]; }));
    var rows = state.attempts.map(function (a) {
      return [a.studentName, a.studentNumber || '', a.attemptNumber, a.status, a.score == null ? '' : X.num(a.score), X.num(exam.totalMarks), a.status === 'GRADED' ? a.grade : '', a.submittedAt || ''].concat(scored.map(function (q) {
        if (q.type === 'ESSAY') { var m = (a.manualMarks || {})[q.id]; return m == null ? '' : X.num(m); }
        return X.num(Q.grade(q.type, q.data, (a.answers || {})[q.id], q.marks).marks);
      }));
    });
    var text = '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n');
    var link = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: (exam.title || 'exam').replace(/[^\w\- ]+/g, '').trim() + ' - scores.csv' });
    document.body.appendChild(link); link.click(); setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  }

  function load() {
    var id = (ui.context().params || {}).id;
    return ui.api.get('workspace/exams/' + encodeURIComponent(id) + '/attempts').then(function (r) {
      state.exam = r.exam; state.attempts = r.attempts || [];
      $('heading').textContent = '📊 Gradebook · ' + r.exam.title;
      $('subheading').textContent = (r.exam.className || 'All classes') + ' · ' + r.exam.status.toLowerCase() + ' · ' + X.plural(state.attempts.length, 'attempt');
      $('filters').hidden = state.attempts.length < 2; $('csv').hidden = !state.attempts.length;
      stats(); tabs(); render();
    });
  }

  $('back').addEventListener('click', function () { ui.navigate('exams'); });
  $('search').addEventListener('input', render);
  $('csv').addEventListener('click', csv);
  ui.autoResize();
  X.skeletons($('list'), 2);
  ui.connect().then(load).catch(function (e) { clear($('list')); failed(e); }).then(function () { X.busy(false); });
})();
