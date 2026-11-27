/* Taking an exam (mono's student/exams/[id]): the start card, a countdown that cannot be paused (red under
 * five minutes; a resumed attempt counts down the real time left), answers saved every 30 seconds and
 * shortly after each change, "n of m answered", one page per section, the bottom bar (Next section →,
 * Submit exam), and submission by itself when the time is up.
 * Plugin API: GET exams/:id/take, POST exams/:id/attempts/start, PUT attempts/:id/answers, POST attempts/:id/submit,
 * GET student/media/:id. Devices: speech (speaking questions, dictation), storage (dictation plays). */
(function () {
  'use strict';
  var X = window.Exam, Q = window.ExamQuestions, E = window.ExamEditor, ui = X.ui, $ = X.$, el = X.el, clear = X.clear;
  var state = { exam: null, attempt: null, answers: {}, page: 0, pages: [], numbers: [], deadline: 0, timer: null, saveTimer: null, savedJson: '', submitting: false, submitted: false, speech: true, plays: {} };

  function failed(e) { X.say('error', X.errorText(e), 'bad'); window.scrollTo(0, 0); }
  function barError(text) { $('bar-error').textContent = text || ''; $('bar-error').hidden = !text; }
  function fmt(secs) { var m = Math.floor(secs / 60), s = secs % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function json(v) { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return {}; } } return v || {}; }

  function intro() {
    var exam = state.exam; var box = clear($('intro')); box.hidden = false;
    var start = el('button', { type: 'button', class: 'primary lg', onclick: begin }, ['Start Exam']);
    box.appendChild(el('span', { class: 'big', text: '📝' }));
    box.appendChild(el('h2', { text: exam.title, style: 'font-size:20px' }));
    if (exam.description) box.appendChild(el('p', { class: 'small muted', style: 'white-space:pre-wrap;margin-bottom:8px', text: exam.description }));
    var count = exam.questions.filter(function (q) { return q.type !== 'TEXT'; }).length;
    box.appendChild(el('p', { class: 'small muted', text: X.plural(count, 'question') + ' · ' + exam.duration + ' minutes' }));
    box.appendChild(el('p', { class: 'small muted', style: 'margin-bottom:16px', text: 'Pass mark: ' + X.num(exam.passMark) + '/' + X.num(exam.totalMarks) }));
    box.appendChild(el('p', { class: 'notice warn small', style: 'font-weight:500', text: '⚠️ Once started, the timer cannot be paused. Answers auto-save every 30 seconds.' }));
    if (exam.questions.some(function (q) { return q.type === 'SPEAK_WORDS' || q.type === 'SPEAK_WORDS_SET' || q.type === 'DICTATION'; })) box.appendChild(el('p', { class: 'small muted', style: 'margin-bottom:14px', text: '🎧 This exam has listening or speaking questions: use headphones and allow the microphone when the school page asks.' }));
    box.appendChild(start);
    state.startButton = start;
  }

  function begin() {
    var button = state.startButton; button.disabled = true; button.textContent = 'Starting…'; X.say('error', '');
    ui.api.post('exams/' + encodeURIComponent(state.exam.id) + '/attempts/start', {}).then(function (attempt) {
      state.attempt = attempt; state.answers = json(attempt.answers); state.savedJson = JSON.stringify(state.answers);
      // a resumed attempt counts down the real time left, never a fresh full duration
      var started = new Date(attempt.startedAt).getTime();
      var deadline = started + Number(state.exam.duration) * 60000;
      if (state.exam.endTime) deadline = Math.min(deadline, new Date(state.exam.endTime).getTime());
      state.deadline = deadline;
      return ui.storage.get('plays:' + attempt.id).then(function (p) { state.plays = p || {}; }).catch(function () { state.plays = {}; });
    }).then(function () {
      $('intro').hidden = true; $('questions').hidden = false; $('bar').hidden = false; $('timer').hidden = false; $('progress-wrap').hidden = false;
      tick(); state.timer = setInterval(tick, 1000);
      render();
    }).catch(function (e) { button.disabled = false; button.textContent = 'Start Exam'; failed(e); });
  }

  function tick() {
    var left = Math.max(0, Math.round((state.deadline - Date.now()) / 1000));
    var t = $('timer'); t.textContent = '⏱ ' + fmt(left); t.classList.toggle('low', left < 300);
    if (left > 0 && left % 30 === 0) save();
    if (left === 60) t.setAttribute('aria-label', 'One minute left');
    if (left <= 0 && !state.submitted) { clearInterval(state.timer); submit(true); }
  }

  function progress() {
    var answerable = state.exam.questions.filter(function (q) { return q.type !== 'TEXT'; });
    var done = answerable.filter(function (q) { return Q.answered(q.type, state.answers[q.id]); }).length;
    $('progress').style.width = (done / (answerable.length || 1) * 100) + '%';
    $('progress-text').textContent = done + ' of ' + answerable.length + ' answered';
    return answerable.length - done;
  }

  function save() {
    if (!state.attempt || state.submitted) return Promise.resolve();
    var body = JSON.stringify(state.answers);
    if (body === state.savedJson) return Promise.resolve();
    return ui.api.put('attempts/' + encodeURIComponent(state.attempt.id) + '/answers', { answers: state.answers }).then(function () {
      state.savedJson = body; $('saved').textContent = '✓ Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }).catch(function () { $('saved').textContent = '⚠ Not saved — check the connection'; });
  }
  function changed() {
    progress();
    clearTimeout(state.saveTimer); state.saveTimer = setTimeout(save, 3000);
  }

  function render() {
    var pages = state.pages; var page = Math.min(state.page, pages.length - 1); var current = pages[page] || { questions: [], start: 0 };
    var box = clear($('questions'));
    var ctx = { student: true, speech: state.speech, plays: state.plays, onPlays: function () { ui.storage.set('plays:' + state.attempt.id, state.plays).catch(function () {}); }, onError: barError };
    current.questions.forEach(function (q, j) { box.appendChild(E.questionCard(q, state.numbers[current.start + j], state.answers, changed, ctx)); });
    $('sections').hidden = pages.length <= 1;
    if (pages.length > 1) {
      $('section-name').textContent = current.section || ''; $('section-name').hidden = !current.section;
      var pager = clear($('pager'));
      pages.forEach(function (p, n) { pager.appendChild(el('button', { type: 'button', 'aria-current': String(n === page), onclick: function () { go(n); } }, [p.section || 'Questions'])); });
    }
    var last = page >= pages.length - 1;
    $('next').hidden = last; $('submit').hidden = !last; $('bar-hint').hidden = !last;
    progress();
  }
  function go(n) { save(); X.ui.speech.stop(); state.page = n; render(); window.scrollTo(0, 0); }

  function submit(auto) {
    if (state.submitting || state.submitted) return;
    var unanswered = progress();
    var ask = auto || !unanswered ? Promise.resolve(true) : X.confirm('Submit the exam?', 'You have not answered ' + X.plural(unanswered, 'question') + '. Once submitted, you cannot change your answers.', 'Submit Exam', false);
    ask.then(function (yes) {
      if (!yes) return;
      state.submitting = true; $('submit').disabled = true; $('submit').textContent = 'Submitting…'; barError('');
      clearTimeout(state.saveTimer); X.ui.speech.stop();
      ui.api.post('attempts/' + encodeURIComponent(state.attempt.id) + '/submit', { answers: state.answers }).then(function (r) {
        state.submitted = true; clearInterval(state.timer);
        ui.storage.remove('plays:' + state.attempt.id).catch(function () {});
        finished(r, auto);
      }).catch(function (e) { barError(X.errorText(e, 'Failed to submit exam')); if (auto) setTimeout(function () { state.submitting = false; submit(true); }, 5000); })
        .then(function () { state.submitting = false; $('submit').disabled = false; $('submit').textContent = 'Submit Exam'; });
    });
  }

  function finished(result, auto) {
    $('questions').hidden = true; $('bar').hidden = true; $('timer').hidden = true; $('progress-wrap').hidden = true; $('sections').hidden = true; $('saved').textContent = '';
    var box = clear($('done')); box.hidden = false;
    box.appendChild(el('span', { class: 'big', text: '✅' }));
    box.appendChild(el('h2', { text: 'Exam Submitted!', style: 'font-size:20px' }));
    box.appendChild(el('p', { class: 'small muted', style: 'margin-bottom:12px', text: (auto ? 'The time was up, so your answers were submitted. ' : '') + (result.status === 'GRADED' ? 'Your exam was marked automatically.' : 'Your answers have been submitted. Results will be available soon.') }));
    if (result.status === 'GRADED') {
      var pass = result.grade === 'PASS';
      box.appendChild(el('p', { class: 'score-big', style: 'color:' + (pass ? 'var(--ok)' : 'var(--bad)'), text: X.num(result.score) + ' / ' + X.num(state.exam.totalMarks) }));
      box.appendChild(el('p', { style: 'margin-bottom:16px' }, [X.chip(result.grade)]));
    }
    box.appendChild(el('button', { type: 'button', class: 'primary', onclick: function () { ui.navigate('my-exams', { submitted: '1' }); } }, ['Back to Exams']));
    window.scrollTo(0, 0);
  }

  $('next').addEventListener('click', function () { go(state.page + 1); });
  $('submit').addEventListener('click', function () { submit(false); });

  ui.autoResize();
  ui.connect().then(function () {
    var id = (ui.context().params || {}).id;
    ui.speech.status().then(function (s) { state.speech = Boolean(s && s.listen); }).catch(function () { state.speech = false; });
    return ui.api.get('exams/' + encodeURIComponent(id) + '/take').then(function (exam) {
      exam.questions = (exam.questions || []).map(function (q) { return Object.assign({}, q, { data: json(q.data), marks: Number(q.marks) }); });
      state.exam = exam; state.pages = Q.pages(exam.questions); state.numbers = Q.numbers(exam.questions);
      $('title').textContent = exam.title;
      $('meta').textContent = X.num(exam.totalMarks) + ' marks · ' + X.plural(exam.questions.filter(function (q) { return q.type !== 'TEXT'; }).length, 'question');
      intro();
    });
  }).catch(function (e) { failed(e); $('intro').hidden = false; clear($('intro')).appendChild(el('button', { type: 'button', onclick: function () { ui.navigate('my-exams'); } }, ['← Back to My Exams'])); })
    .then(function () { X.busy(false); });
})();
