/* Examinations (staff): mono's admin and teacher exam lists in one screen.
 * Plugin API: GET workspace/exams, PATCH exams/:id/status, DELETE exams/:id, POST workspace/exams/:id/copy. */
(function () {
  'use strict';
  var X = window.Exam, ui = X.ui, $ = X.$, el = X.el, clear = X.clear;
  var exams = [];

  function failed(e) { X.say('message', ''); X.say('error', X.errorText(e), 'bad'); }
  function done(text) { X.say('error', ''); X.say('message', text); }

  function setStatus(exam, status) {
    // "Activate now" from a draft publishes and opens it in one step
    return ui.api.patch('exams/' + encodeURIComponent(exam.id) + '/status', { status: status })
      .then(function () { done('“' + exam.title + '” is now ' + status.toLowerCase() + '.'); return load(); })
      .catch(function (e) { failed(e); render(); });
  }

  function stats() {
    var box = clear($('stats')); box.hidden = !exams.length;
    var count = function (f) { return exams.filter(f).length; };
    var attempts = exams.reduce(function (s, e) { return s + Number(e.attemptCount || 0); }, 0);
    var toGrade = exams.reduce(function (s, e) { return s + Number(e.toGrade || 0); }, 0);
    box.appendChild(X.stat('Total Exams', exams.length, '📝', 'tone-sky'));
    box.appendChild(X.stat('Draft', count(function (e) { return e.status === 'DRAFT'; }), '✏️', 'tone-slate'));
    box.appendChild(X.stat('Live', count(function (e) { return e.status === 'PUBLISHED' || e.status === 'ACTIVE'; }), '🟢', 'tone-ok', 'published or active'));
    box.appendChild(X.stat('Total Attempts', attempts, '🧑‍🎓', 'tone-amber', toGrade ? toGrade + ' to grade' : 'awaiting or done'));
  }

  function row(exam) {
    var canManage = X.can('exams.manage'); var canGrade = X.can('attempts.grade');
    var meta = [exam.className || 'All classes', X.plural(exam.questionCount, 'question'), exam.duration + ' min', 'Pass: ' + X.num(exam.passMark) + '/' + X.num(exam.totalMarks)];
    if (Number(exam.maxAttempts) !== 1) meta.push(X.attemptsText(exam.maxAttempts));
    var statusSelect = el('select', { title: 'Change exam status', 'aria-label': 'Status of ' + exam.title, onchange: function () { setStatus(exam, statusSelect.value); } },
      X.STATUS.map(function (s) { return el('option', { value: s, text: s, selected: s === exam.status }); }));
    var window_ = exam.startTime || exam.endTime ? 'Opens ' + (exam.startTime ? X.dateTime(exam.startTime) : 'any time') + ' · closes ' + (exam.endTime ? X.dateTime(exam.endTime) : 'when completed') : '';
    return el('div', { class: 'card hover exam-row', 'data-exam': exam.id }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'row', style: 'gap:8px;margin-bottom:2px' }, [el('span', { class: 'title', text: exam.title }), X.chip(exam.status)]),
        el('p', { class: 'meta', text: meta.join(' · ') }),
        el('p', { class: 'small', style: 'color:var(--warn);margin-top:2px', text: X.plural(exam.attemptCount, 'attempt') + (exam.toGrade ? ' · ' + exam.toGrade + ' to grade' : '') + (!exam.mine && exam.creatorName ? ' · by ' + exam.creatorName : '') }),
        window_ ? el('p', { class: 'tiny faint', text: window_ }) : null,
        el('p', { class: 'tiny faint', text: X.STATUS_HINT[exam.status] }),
      ]),
      el('div', { class: 'actions' }, [
        canManage ? el('button', { type: 'button', class: 'link', onclick: function () { ui.navigate('exams/' + exam.id + '/edit'); } }, ['Edit']) : null,
        canGrade ? el('button', { type: 'button', class: 'sm outline', onclick: function () { ui.navigate('exams/' + exam.id + '/attempts'); } }, ['Grade (' + exam.attemptCount + ')']) : null,
        canManage && (exam.status === 'DRAFT' || exam.status === 'PUBLISHED') ? el('button', { type: 'button', class: 'sm go', disabled: !exam.questionCount, title: exam.questionCount ? 'Students can start it right away' : 'Add questions first', onclick: function () { setStatus(exam, 'ACTIVE'); } }, ['▶ Activate Now']) : null,
        canManage ? statusSelect : null,
        canManage ? el('button', { type: 'button', class: 'link', title: 'A new draft with the same questions', onclick: function () {
          ui.api.post('workspace/exams/' + encodeURIComponent(exam.id) + '/copy', {}).then(function (copy) { ui.navigate('exams/' + copy.id + '/edit'); }).catch(failed);
        } }, ['Copy']) : null,
        canManage ? el('button', { type: 'button', class: 'link red', onclick: function () {
          X.confirm('Delete exam?', 'This permanently deletes “' + exam.title + '” and its questions.' + (exam.attemptCount ? ' Exams students have taken cannot be deleted; set them to Completed instead.' : ''), 'Delete', true).then(function (yes) {
            if (!yes) return;
            ui.api.delete('exams/' + encodeURIComponent(exam.id)).then(function () { done('Exam deleted.'); return load(); }).catch(failed);
          });
        } }, ['Delete']) : null,
      ]),
    ]);
  }

  function render() {
    var list = clear($('list'));
    var q = $('search').value.trim().toLowerCase(), status = $('status-filter').value, cls = $('class-filter').value;
    var shown = exams.filter(function (e) { return (!q || e.title.toLowerCase().indexOf(q) >= 0) && (!status || e.status === status) && (!cls || (e.academicClassId || '') === cls); });
    $('filters').hidden = exams.length < 2;
    if (!exams.length) {
      list.appendChild(X.empty('📝', 'No exams created yet', X.can('exams.manage') ? el('button', { type: 'button', class: 'link', onclick: function () { ui.navigate('exams/new'); } }, ['Create your first exam']) : null));
      return;
    }
    if (!shown.length) { list.appendChild(X.empty('🔍', 'No exam matches the filters')); return; }
    shown.forEach(function (e) { list.appendChild(row(e)); });
  }

  function load() {
    return ui.api.get('workspace/exams').then(function (rows) {
      exams = rows || [];
      var classes = {}; exams.forEach(function (e) { if (e.academicClassId) classes[e.academicClassId] = e.className || e.academicClassId; });
      var select = $('class-filter'), current = select.value;
      clear(select).appendChild(el('option', { value: '', text: 'All classes' }));
      Object.keys(classes).sort(function (a, b) { return classes[a].localeCompare(classes[b]); }).forEach(function (id) { select.appendChild(el('option', { value: id, text: classes[id], selected: id === current })); });
      stats(); render();
    });
  }

  ['search', 'status-filter', 'class-filter'].forEach(function (id) { $(id).addEventListener('input', render); });
  $('create').addEventListener('click', function () { ui.navigate('exams/new'); });

  ui.autoResize();
  X.skeletons($('list'), 3);
  ui.connect().then(function () {
    $('create').hidden = !X.can('exams.manage');
    if ((ui.context().query || {}).saved) done('Exam saved.');
    return load();
  }).catch(function (e) { clear($('list')).appendChild(el('div', { class: 'notice bad' }, [X.errorText(e, 'Failed to load exams'), ' ', el('button', { type: 'button', class: 'link', onclick: function () { X.skeletons($('list'), 3); load().catch(failed); } }, ['Retry'])])); })
    .then(function () { X.busy(false); });
})();
