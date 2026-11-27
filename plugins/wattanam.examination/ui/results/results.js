/* My Results: each submitted exam with its score, pass or fail and the teacher's feedback (a partly
 * graded attempt shows "awaiting result"). Plugin API: GET student/results. */
(function () {
  'use strict';
  var X = window.Exam, ui = X.ui, $ = X.$, el = X.el, clear = X.clear;

  function load() {
    return ui.api.get('student/results').then(function (rows) {
      var list = clear($('list')); var stats = clear($('stats'));
      if (!rows.length) { list.appendChild(X.empty('📊', 'No results yet — they appear here after you submit an exam.')); return; }
      var graded = rows.filter(function (r) { return r.status === 'GRADED'; });
      var passed = graded.filter(function (r) { return r.grade === 'PASS'; }).length;
      var pct = graded.length ? graded.reduce(function (s, r) { return s + (Number(r.totalMarks) ? Number(r.score) / Number(r.totalMarks) : 0); }, 0) / graded.length * 100 : null;
      stats.hidden = false;
      stats.appendChild(X.stat('Exams taken', rows.length, '📝', 'tone-sky'));
      stats.appendChild(X.stat('Passed', passed + ' / ' + graded.length, '✅', 'tone-ok'));
      stats.appendChild(X.stat('Average', pct == null ? '—' : Math.round(pct) + '%', '📈', 'tone-indigo'));
      stats.appendChild(X.stat('Awaiting result', rows.length - graded.length, '⏳', 'tone-amber'));
      rows.forEach(function (r) {
        var done = r.status === 'GRADED';
        list.appendChild(el('div', { class: 'card pad', 'data-result': r.id }, [
          el('div', { class: 'row', style: 'justify-content:space-between' }, [
            el('div', { class: 'grow' }, [el('div', { class: 'row', style: 'gap:8px' }, [el('b', { text: r.title }), Number(r.attemptNumber) > 1 ? X.chip('Attempt ' + r.attemptNumber, 'attempt') : null]),
              el('p', { class: 'small muted', text: 'Submitted ' + X.dateTime(r.submittedAt) + (r.gradedAt ? ' · graded ' + X.dateTime(r.gradedAt) : '') })]),
            done ? el('div', { style: 'text-align:right' }, [el('b', { style: 'font-size:20px;color:' + (r.grade === 'PASS' ? 'var(--ok)' : 'var(--bad)'), text: X.num(r.score) + ' / ' + X.num(r.totalMarks) }), el('div', {}, [X.chip(r.grade)])])
              : el('span', { class: 'small', style: 'color:var(--warn);font-weight:700', text: 'Awaiting result' }),
          ]),
          done ? el('p', { class: 'tiny faint', style: 'margin-top:4px', text: 'Pass mark ' + X.num(r.passMark) + ' / ' + X.num(r.totalMarks) }) : null,
          r.feedback ? el('div', { class: 'answer-box', style: 'margin-top:10px' }, [el('b', { class: 'small', text: '💬 Feedback: ' }), r.feedback]) : null,
        ]));
      });
    });
  }

  $('exams').addEventListener('click', function () { ui.navigate('my-exams'); });
  ui.autoResize();
  X.skeletons($('list'), 2);
  ui.connect().then(load).catch(function (e) { clear($('list')); X.say('error', X.errorText(e), 'bad'); }).then(function () { X.busy(false); });
})();
