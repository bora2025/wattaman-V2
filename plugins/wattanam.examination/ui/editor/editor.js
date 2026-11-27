/* Create and edit an exam (mono's ExamForm + ExamQuestionsEditor + ExamPreviewModal).
 * Plugin API: GET workspace/exams/:id, GET workspace/classes, POST workspace/exams, PUT workspace/exams/:id,
 * POST media + PUT media/:id/parts/:index (pictures and recordings); partner: Academic's class list. */
(function () {
  'use strict';
  var X = window.Exam, Q = window.ExamQuestions, E = window.ExamEditor, ui = X.ui, $ = X.$, el = X.el, clear = X.clear;
  var ACADEMIC = 'wattanam.academic-management';
  var state = { id: null, exam: null, questions: [E.defaultQuestion()], locked: false, dirty: false, saving: false, editor: null, creating: null };

  function failed(e) { X.say('message', ''); X.say('error', X.errorText(e), 'bad'); window.scrollTo(0, 0); }
  function dirty() { state.dirty = true; summary(); }

  function summary() {
    var scored = state.questions.filter(function (q) { return q.type !== 'TEXT'; });
    var sum = scored.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0);
    var sections = Q.pages(state.questions).filter(function (p) { return p.section; }).length;
    $('q-summary').textContent = X.plural(scored.length, 'question') + ' · ' + X.num(sum) + ' marks' + (sections ? ' · ' + X.plural(sections, 'section') + ' (one page each)' : '');
    var hint = $('sum-hint'); clear(hint);
    if (Number($('totalMarks').value) !== sum && scored.length) {
      hint.appendChild(document.createTextNode('Questions add up to ' + X.num(sum) + ' — '));
      hint.appendChild(el('button', { type: 'button', class: 'link', style: 'font-size:12px', onclick: function () { $('totalMarks').value = X.num(sum); dirty(); } }, ['use it']));
    }
  }

  function details() {
    return {
      title: $('title').value.trim(), description: $('description').value.trim(), academicClassId: $('class').value || null,
      duration: Number($('duration').value) || 60, totalMarks: Number($('totalMarks').value), passMark: Number($('passMark').value), maxAttempts: Number($('maxAttempts').value) || 0,
      startTime: X.fromLocalInput($('startTime').value), endTime: X.fromLocalInput($('endTime').value),
    };
  }
  function check(body) {
    if (!body.title) return 'Give the exam a title.';
    if (!(body.totalMarks >= 0)) return 'Total marks must be 0 or more.';
    if (body.passMark > body.totalMarks) return 'The pass mark cannot be more than the total marks.';
    if (body.startTime && body.endTime && body.endTime < body.startTime) return 'The exam must close after it opens.';
    return null;
  }
  function payload() {
    var body = details();
    if (!state.locked) body.questions = state.questions.map(function (q) { var out = { type: q.type, text: q.text, marks: q.type === 'TEXT' ? 0 : Number(q.marks) || 0, section: q.section || null, data: q.data }; if (q.id) out.id = q.id; return out; });
    return body;
  }

  // a new exam is saved as a draft the first time a picture or recording is added (files belong to an exam)
  function ensureExam() {
    if (state.id) return Promise.resolve(state.id);
    if (!state.creating) {
      var body = details(); if (!body.title) body.title = 'Untitled exam';
      if (!$('title').value.trim()) $('title').value = body.title;
      state.creating = ui.api.post('workspace/exams', body).then(function (exam) { state.id = exam.id; state.exam = exam; showStatus(); X.say('message', 'Saved as a draft so pictures and recordings can be added.'); return exam.id; })
        .catch(function (e) { state.creating = null; throw e; });
    }
    return state.creating;
  }

  function showStatus() {
    var exam = state.exam; var chip = clear($('status-chip'));
    if (!exam) return;
    chip.appendChild(X.chip(exam.status));
    $('heading').textContent = 'Edit Exam';
    $('subheading').textContent = X.STATUS_HINT[exam.status] + (exam.attemptCount ? ' · ' + X.plural(exam.attemptCount, 'attempt') : '');
  }

  function fill(exam) {
    state.exam = exam; state.id = exam.id;
    $('title').value = exam.title || ''; $('description').value = exam.description || '';
    if (exam.academicClassId && !Array.prototype.some.call($('class').options, function (o) { return o.value === exam.academicClassId; })) $('class').appendChild(el('option', { value: exam.academicClassId, text: exam.className || exam.academicClassId }));
    $('class').value = exam.academicClassId || '';
    $('duration').value = exam.duration; $('totalMarks').value = X.num(exam.totalMarks); $('passMark').value = X.num(exam.passMark); $('maxAttempts').value = exam.maxAttempts;
    $('startTime').value = X.localInput(exam.startTime); $('endTime').value = X.localInput(exam.endTime);
    state.questions = exam.questions && exam.questions.length ? exam.questions.map(function (q) { return { id: q.id, type: q.type, text: q.text, marks: Number(q.marks), section: q.section || '', data: q.data || Q.defaultData(q.type) }; }) : [E.defaultQuestion()];
    state.locked = Number(exam.attemptCount) > 0;
    var lock = $('locked'); lock.hidden = !state.locked;
    clear(lock);
    if (state.locked) {
      lock.appendChild(document.createTextNode('🔒 ' + X.plural(exam.attemptCount, 'student attempt') + ' already exist, so the questions cannot change (the scores would no longer match). You can still change the details. To change questions: allow re-attempts in the '));
      lock.appendChild(el('button', { type: 'button', class: 'link', style: 'font-size:13px', onclick: function () { ui.navigate('exams/' + exam.id + '/attempts'); } }, ['gradebook']));
      lock.appendChild(document.createTextNode(', or Copy the exam from the list.'));
    }
    showStatus(); buildEditor();
  }

  function buildEditor() {
    state.editor = E.create({
      questions: state.questions, locked: state.locked,
      onChange: function (qs) { state.questions = qs; dirty(); },
      onError: failed,
      uploadMedia: function (file, kind, progress) { return ensureExam().then(function (id) { return X.uploadMedia(id, file, kind, progress); }); },
    });
    clear($('questions')).appendChild(state.editor.node);
    summary();
  }

  function loadClasses() {
    // the person's own classes, and (administrators, class admins) Academic's class list
    var mine = ui.api.get('workspace/classes').catch(function () { return []; });
    var academic = ui.partner(ACADEMIC).get('classes').catch(function () { return ui.partner(ACADEMIC).get('my/classes').catch(function () { return []; }); });
    return Promise.all([mine, academic]).then(function (r) {
      var seen = {}; var all = [];
      r[0].concat(Array.isArray(r[1]) ? r[1] : (r[1] && r[1].items) || []).forEach(function (c) { if (c && c.id && !seen[c.id]) { seen[c.id] = true; all.push({ id: c.id, name: c.name || c.id }); } });
      all.sort(function (a, b) { return a.name.localeCompare(b.name); });
      var select = $('class'); var current = select.value;
      all.forEach(function (c) { if (!Array.prototype.some.call(select.options, function (o) { return o.value === c.id; })) select.appendChild(el('option', { value: c.id, text: c.name })); });
      select.value = current;
      $('class-hint').textContent = all.length ? 'Only students of this class see the exam' : 'No class found — the exam is for all classes';
    });
  }

  function save() {
    if (state.saving) return;
    var body = payload(); var problem = check(body);
    if (problem) { failed(new Error(problem)); return; }
    state.saving = true; $('save').disabled = true; $('save').textContent = 'Saving…';
    var go = state.id ? ui.api.put('workspace/exams/' + encodeURIComponent(state.id), body) : ui.api.post('workspace/exams', body);
    go.then(function () { state.dirty = false; ui.navigate('exams', { saved: '1' }); })
      .catch(failed).then(function () { state.saving = false; $('save').disabled = false; $('save').textContent = '💾 Save exam'; });
  }

  function leave() {
    if (!state.dirty) { ui.navigate('exams'); return; }
    X.confirm('Leave without saving?', 'Your changes to this exam will be lost.', 'Leave', true).then(function (yes) { if (yes) ui.navigate('exams'); });
  }

  ['title', 'description', 'class', 'duration', 'totalMarks', 'passMark', 'maxAttempts', 'startTime', 'endTime'].forEach(function (id) { $(id).addEventListener('input', dirty); });
  $('save').addEventListener('click', save);
  $('cancel').addEventListener('click', leave);
  $('back').addEventListener('click', leave);
  $('preview').addEventListener('click', function () {
    if (!state.questions.length) return;
    E.preview(state.questions, { student: false, speech: true, onError: failed, plays: {} });
  });

  ui.autoResize();
  ui.connect().then(function () {
    var id = (ui.context().params || {}).id;
    return loadClasses().then(function () {
      if (!id) { buildEditor(); return; }
      return ui.api.get('workspace/exams/' + encodeURIComponent(id)).then(fill);
    });
  }).catch(failed).then(function () { X.busy(false); });
})();
