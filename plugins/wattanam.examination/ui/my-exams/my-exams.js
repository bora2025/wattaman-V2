/* My Exams (mono's student/exams): Start, Resume or Retake, "awaiting result", score and pass or fail.
 * Plugin API: GET student/workspace/exams. */
(function () {
  'use strict';
  var X = window.Exam, ui = X.ui, $ = X.$, el = X.el, clear = X.clear;

  function row(exam) {
    var attempt = exam.attempt; var now = Date.now();
    var graded = attempt && attempt.status === 'GRADED'; var inProgress = attempt && attempt.status === 'IN_PROGRESS';
    var used = attempt ? Number(attempt.attemptNumber) : 0;
    var left = Number(exam.maxAttempts) === 0 || used < Number(exam.maxAttempts);
    var notYet = exam.startTime && new Date(exam.startTime).getTime() > now;
    var over = exam.endTime && new Date(exam.endTime).getTime() < now;
    var open = exam.status === 'ACTIVE' && !notYet && !over;
    var lines = [el('p', { class: 'small muted', text: [exam.className || 'General', exam.duration + ' min', X.plural(exam.questionCount, 'question'), 'Pass: ' + X.num(exam.passMark) + '/' + X.num(exam.totalMarks)].join(' · ') })];
    if (graded) { var pass = Number(attempt.score || 0) >= Number(exam.passMark); lines.push(el('p', { class: 'small', style: 'font-weight:700;margin-top:4px;color:' + (pass ? 'var(--ok)' : 'var(--bad)'), text: 'Score: ' + X.num(attempt.score) + '/' + X.num(exam.totalMarks) + ' — ' + (pass ? 'PASSED' : 'FAILED') })); }
    if (attempt && attempt.status === 'SUBMITTED') lines.push(el('p', { class: 'small', style: 'color:var(--warn);margin-top:4px', text: 'Submitted · Awaiting result' }));
    if (!attempt && exam.status === 'PUBLISHED') lines.push(el('p', { class: 'small faint', style: 'margin-top:4px', text: 'Not open yet — check back once your teacher starts it' }));
    if (!attempt && exam.status === 'ACTIVE' && notYet) lines.push(el('p', { class: 'small faint', style: 'margin-top:4px', text: 'Opens ' + X.dateTime(exam.startTime) }));
    if (!attempt && (exam.status === 'COMPLETED' || over)) lines.push(el('p', { class: 'small faint', style: 'margin-top:4px', text: 'Closed — this exam is no longer open' }));
    if (open && exam.endTime) lines.push(el('p', { class: 'tiny faint', style: 'margin-top:2px', text: 'Closes ' + X.dateTime(exam.endTime) }));
    if (graded && Number(exam.maxAttempts) !== 1) lines.push(el('p', { class: 'tiny faint', text: Number(exam.maxAttempts) === 0 ? 'Attempt ' + used + ' · unlimited attempts' : 'Attempt ' + used + ' of ' + exam.maxAttempts }));
    var take = function () { ui.navigate('my-exams/' + exam.id); };
    var action = null;
    if (open && !attempt) action = el('button', { type: 'button', class: 'go', onclick: take }, ['Start Exam']);
    else if (exam.status === 'ACTIVE' && inProgress) action = el('button', { type: 'button', class: 'amber', onclick: take }, ['Resume Exam']);
    else if (open && graded && left) action = el('button', { type: 'button', class: 'violet', onclick: take }, ['Retake Exam']);
    else if (graded) action = el('span', { class: 'small', style: 'color:var(--ok);font-weight:700', text: '✓ Completed' });
    return el('div', { class: 'card hover exam-row', 'data-exam': exam.id }, [
      el('div', { class: 'row grow', style: 'gap:14px;flex-wrap:nowrap' }, [el('div', { class: 'icon-tile', text: '📝' }), el('div', { class: 'grow' }, [
        el('div', { class: 'row', style: 'gap:8px;margin-bottom:2px' }, [el('b', { text: exam.title }), X.chip(exam.status)]),
      ].concat(lines))]),
      action ? el('div', { class: 'actions' }, [action]) : null,
    ]);
  }

  function load() {
    return ui.api.get('student/workspace/exams').then(function (exams) {
      var list = clear($('list'));
      if (!exams.length) { list.appendChild(X.empty('📝', 'No exams available')); return; }
      exams.forEach(function (e) { list.appendChild(row(e)); });
    });
  }

  $('results').addEventListener('click', function () { ui.navigate('my-results'); });
  ui.autoResize();
  X.skeletons($('list'), 3);
  ui.connect().then(function () { if ((ui.context().query || {}).submitted) X.say('message', 'Your exam was submitted.'); return load(); })
    .catch(function (e) { clear($('list')).appendChild(el('div', { class: 'notice bad' }, [X.errorText(e, 'Failed to load exams'), ' ', el('button', { type: 'button', class: 'link', onclick: function () { load().catch(function () {}); } }, ['Retry'])])); })
    .then(function () { X.busy(false); });
})();
