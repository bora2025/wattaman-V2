/* University Score Sheets (តារាងលទ្ធផលសិក្សា): a class's year on one sheet — every semester with its own
 * subjects, a score and letter grade per subject, then the total, average, grade, GPA, rank and remarks
 * (the school's university result sheet). Scores are typed on the sheet and saved as you go.
 * Administrators set up the sheets: classes, semesters, subjects and the grade scale.
 * Views: the score sheet, student ranking, honor roll and report cards (the year or one semester).
 * Entry mode (?entry=1, "Enter transcript scores…" only): the sheets of the caller's own classes.
 * Plugin API: transcripts/sheets?kind=UNIVERSITY, classes, transcripts/university/results (or the entry/
 * twins), transcripts/tabs/:id/scores, transcripts/tabs/:id/remarks; set-up: transcripts/sheets…,
 * transcripts/sheets/:id/subjects|tabs|grades, transcripts/subjects/:id, transcripts/tabs/:id. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var U = window.WattanamUniversityMath;
  var MANAGE = 'wattanam.academic-management.manage';
  var EDIT = 'wattanam.academic-management.transcripts.edit';
  var PRINT = 'wattanam.academic-management.transcripts.print';
  var SAVE_DELAY = 1000;
  var state = {
    entry: false, canManage: false, canEdit: false,
    sheets: [], classes: [], sheetId: '', classId: '', data: null, scores: {}, remarks: {},
    order: 'list', query: '', figures: {}, editingSheet: null, scale: null,
    view: 'sheet', scope: 'year', cardStudent: '',
  };
  var loadToken = 0;

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attributes[key];
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), attributes[key]);
      else node.setAttribute(key, attributes[key]);
    });
    (children || []).forEach(function (child) { if (child !== null && child !== undefined) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function rows(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  var savedTimer = null;
  function saved(text, bad) {
    var node = $('saved'); node.textContent = text; node.hidden = false; node.classList.toggle('bad', Boolean(bad));
    clearTimeout(savedTimer); savedTimer = setTimeout(function () { node.hidden = true; }, bad ? 7000 : 2500);
  }
  function num(value) { return value === null || value === undefined || value === '' ? '' : Number(value).toFixed(2); }
  function sexMark(sex) { return sex === 'FEMALE' ? 'ស' : sex === 'MALE' ? 'ប' : ''; }
  function activeSheet() { return state.sheets.filter(function (s) { return s.id === state.sheetId; })[0] || null; }
  function sheetById(id) { return state.sheets.filter(function (s) { return s.id === id; })[0] || null; }
  function className(id) { var c = state.classes.filter(function (x) { return x.id === id; })[0]; return c ? c.name : ''; }
  function scale() { return (state.data && state.data.sheet.gradeScale) || U.SCALE; }
  function failed(error, fallback) { saved(error && error.status === 403 ? 'You do not have access to do this.' : (error && error.message) || fallback, true); }

  // ---------- choosing a sheet and class ----------
  function renderSelectors() {
    var sheetSelect = $('sheet'); sheetSelect.textContent = '';
    state.sheets.forEach(function (s) { sheetSelect.appendChild(el('option', { value: s.id, text: s.name })); });
    sheetSelect.value = state.sheetId;
    var classSelect = $('class'); classSelect.textContent = '';
    var sheet = activeSheet();
    (sheet ? sheet.classIds : []).forEach(function (id) { classSelect.appendChild(el('option', { value: id, text: className(id) || id })); });
    classSelect.value = state.classId;
  }
  function pickDefaults() {
    var sheet = activeSheet();
    if (!sheet) { state.sheetId = (state.sheets[0] && state.sheets[0].id) || ''; sheet = activeSheet(); }
    if (!sheet || sheet.classIds.indexOf(state.classId) < 0) state.classId = (sheet && sheet.classIds[0]) || '';
  }
  function loadSheets() {
    var request = state.entry
      ? ui.api.get('transcripts/entry/sheets', { kind: 'UNIVERSITY' }).then(function (r) { return [r && r.sheets, r && r.classes]; })
      : Promise.all([ui.api.get('transcripts/sheets', { kind: 'UNIVERSITY' }), ui.api.get('classes')]);
    return request.then(function (result) {
      state.sheets = rows(result[0]); state.classes = rows(result[1]);
      pickDefaults();
    });
  }

  // ---------- the results ----------
  function load() {
    var token = ++loadToken;
    state.data = null; render();
    if (!state.sheetId || !state.classId) return Promise.resolve();
    return ui.api.get(state.entry ? 'transcripts/entry/university/results' : 'transcripts/university/results', { sheetId: state.sheetId, classId: state.classId }).then(function (data) {
      if (token !== loadToken) return;
      state.data = data; state.scores = {}; state.remarks = {};
      data.entries.forEach(function (e) { var tab = state.scores[e.tabId] = state.scores[e.tabId] || {}; (tab[e.studentId] = tab[e.studentId] || {})[e.subjectId] = e.score; });
      data.remarks.forEach(function (r) { state.remarks[r.studentId] = r.comment || ''; });
      show('error');
    }).catch(function (error) { if (token === loadToken) show('error', error.message || 'The score sheet could not be loaded.'); })
      .then(function () { if (token === loadToken) render(); });
  }
  function emptyText() {
    var sheet = activeSheet();
    if (!sheet) return state.sheets.length ? 'Choose a score sheet.' : state.canManage ? 'No university score sheets yet. Use ⚙️ Set up to create one.' : 'No university score sheet is used by your classes yet.';
    if (!sheet.classIds.length) return 'This score sheet has no classes yet.' + (state.canManage ? ' Add them in ⚙️ Set up.' : '');
    if (!state.data) return 'Loading…';
    if (!state.data.semesters.length) return 'This score sheet has no semesters yet.' + (state.canManage ? ' Add them in ⚙️ Set up.' : '');
    if (!state.data.subjects.length) return 'This score sheet has no subjects yet.' + (state.canManage ? ' Add each semester\'s subjects in ⚙️ Set up.' : ' The school office adds each semester\'s subjects; scores can be entered after that.');
    if (!state.data.students.length) return 'No students in this class.';
    return '';
  }
  function semesterSubjects(tab) { return state.data.subjects.filter(function (s) { return s.tabId === tab.id; }); }
  function render() {
    renderSelectors();
    var text = emptyText();
    show('empty', text);
    if (text && state.canManage && activeSheet() && state.data) {
      $('empty').appendChild(document.createTextNode(' '));
      $('empty').appendChild(el('button', { type: 'button', class: 'btn primary', 'data-open-setup': '1', text: !state.data.subjects.length ? '⚙️ Add subjects' : '⚙️ Open set-up', onclick: function () { openSetup(state.sheetId); focusNewSubject(); } }));
    }
    $('paper-wrap').hidden = Boolean(text);
    var sheet = activeSheet();
    $('context-line').textContent = sheet && state.classId ? [sheet.name, className(state.classId), state.data && state.data.studyYear ? 'ឆ្នាំសិក្សា ' + state.data.studyYear : ''].filter(Boolean).join(' · ') : 'Semesters, subjects, letter grades, GPA and rank';
    renderViewChrome();
    if (!text) renderView();
  }
  var cells = {};
  function renderDocument() {
    var d = state.data;
    var top = docHeader('title', d.studyYear ? ' ឆ្នាំសិក្សា ' + d.studyYear : '', [d.sheet.name, 'ថ្នាក់ ' + d.className].filter(Boolean).join(' · '), true);
    top.id = 'sheet-top';
    $('sheet-top').parentNode.replaceChild(top, $('sheet-top'));
    var table = $('results'); table.textContent = '';
    var semesters = d.semesters.filter(function (tab) { return semesterSubjects(tab).length; });
    // head: three rows (fixed columns span them)
    var head = el('thead');
    var r1 = el('tr'), r2 = el('tr'), r3 = el('tr');
    ['ល-រ', 'អត្តលេខ', 'គោត្តនាម-នាម', 'អក្សរឡាតាំង', 'ភេទ'].forEach(function (t) { r1.appendChild(el('th', { rowspan: '3', text: t })); });
    semesters.forEach(function (tab) {
      var own = semesterSubjects(tab);
      r1.appendChild(el('th', { class: 'semester-cell', colspan: String(own.length * 2), text: tab.label }));
      own.forEach(function (s) {
        r2.appendChild(el('th', { class: 'subject-cell', colspan: '2', text: s.name }));
        r3.appendChild(el('th', { text: s.maxScore === 100 ? 'ពិន្ទុ' : '/' + s.maxScore }));
        r3.appendChild(el('th', { text: 'និទ្ទេស' }));
      });
    });
    ['សរុប', 'ម.ភាគ', 'និទ្ទេស', 'GPA', 'ចំណាត់ថ្នាក់', 'ផ្សេងៗ'].forEach(function (t) { r1.appendChild(el('th', { rowspan: '3', text: t })); });
    head.appendChild(r1); head.appendChild(r2); head.appendChild(r3);
    table.appendChild(head);
    // body
    computeFigures();
    var body = el('tbody');
    cells = {};
    var q = state.query.trim().toLowerCase();
    var list = d.students.filter(function (s) { return !q || [s.studentNumber, s.nameKh, s.name].join(' ').toLowerCase().indexOf(q) >= 0; });
    if (state.order === 'rank') list = list.slice().sort(function (a, b) { return (state.figures[a.id].rank || 1e9) - (state.figures[b.id].rank || 1e9); });
    var editable = state.canEdit;
    list.forEach(function (student, index) {
      var row = el('tr', { 'data-student': student.id });
      var own = cells[student.id] = { letters: {} };
      row.appendChild(el('td', { text: String(index + 1) }));
      row.appendChild(el('td', { text: student.studentNumber }));
      row.appendChild(el('td', { class: 'name', text: student.nameKh || student.name }));
      row.appendChild(el('td', { class: 'latin', text: student.name && student.name !== student.nameKh ? student.name : '' }));
      row.appendChild(el('td', { text: sexMark(student.sex) }));
      semesters.forEach(function (tab) {
        semesterSubjects(tab).forEach(function (subject) {
          var value = ((state.scores[tab.id] || {})[student.id] || {})[subject.id];
          var cell = el('td', { class: 'score' });
          if (editable) {
            var input = el('input', { type: 'number', inputmode: 'decimal', min: '0', max: String(subject.maxScore), step: 'any', 'data-score': student.id + ':' + subject.id, 'aria-label': (student.nameKh || student.name) + ' · ' + subject.name + ' · ' + tab.label });
            input.value = value === null || value === undefined ? '' : String(value);
            input.addEventListener('input', function () { scoreChanged(tab, student, subject, input); });
            input.addEventListener('keydown', moveFocus);
            cell.appendChild(input);
          } else cell.textContent = num(value);
          row.appendChild(cell);
          var letterCell = el('td', { class: 'letter' });
          own.letters[subject.id] = letterCell;
          row.appendChild(letterCell);
        });
      });
      ['total', 'average', 'grade', 'gpa', 'rank'].forEach(function (key) { own[key] = el('td', { class: 'fig', 'data-fig': key }); row.appendChild(own[key]); });
      var remark = el('td', { class: 'remark' });
      if (editable) {
        var note = el('input', { maxlength: '1000', 'aria-label': 'ផ្សេងៗ · ' + (student.nameKh || student.name), 'data-remark': student.id });
        note.value = state.remarks[student.id] || '';
        note.addEventListener('input', function () { remarkChanged(student.id, note.value); });
        remark.appendChild(note);
      } else remark.textContent = state.remarks[student.id] || '';
      row.appendChild(remark);
      body.appendChild(row);
    });
    table.appendChild(body);
    paintFigures();
    var foot = $('sheet-foot'), dist = $('dist');
    foot.textContent = ''; foot.appendChild(dist); foot.appendChild(signatures(true));
    applyHeaderEditing();
    fitView();
  }
  // the visible width of the sheet (the header and footer stay in it while the table scrolls)
  // The header and footer span the visible part of the sheet: the sheet's own width when it fits, the frame's
  // width when the table is wider and scrolls. Measured again whenever the frame or the sheet changes size.
  function fitView() {
    var wrap = $('paper-wrap'), paper = $('paper');
    if (wrap.hidden || paper.hidden || !wrap.clientWidth) return;
    var visible = wrap.clientWidth - 60, sheet = $('results').offsetWidth;
    paper.style.setProperty('--view', Math.max(320, Math.min(visible, sheet > 0 ? sheet : visible)) + 'px');
  }
  if (window.ResizeObserver) { var sizes = new ResizeObserver(function () { fitView(); }); sizes.observe($('paper-wrap')); sizes.observe($('results')); }
  function computeFigures() { state.figures = U.results(state.data, state.scores, scale()); }
  function paintFigures() {
    var d = state.data;
    Object.keys(cells).forEach(function (studentId) {
      var c = cells[studentId], f = state.figures[studentId];
      d.subjects.forEach(function (subject) {
        var cell = c.letters[subject.id]; if (!cell) return;
        var value = ((state.scores[subject.tabId] || {})[studentId] || {})[subject.id];
        var letter = U.letter(value, subject.maxScore, scale());
        cell.textContent = letter; cell.className = 'letter ' + letter.replace('+', 'plus');
      });
      c.total.textContent = num(f.total); c.average.textContent = num(f.average);
      c.grade.textContent = f.grade; c.gpa.textContent = f.gpa === null ? '' : f.gpa.toFixed(2); c.rank.textContent = f.rank ? String(f.rank) : '';
    });
    // the grade distribution (by the year's grade)
    var host = $('dist'); host.textContent = '';
    var students = d.students, female = students.filter(function (s) { return s.sex === 'FEMALE'; }).length;
    host.appendChild(el('span', { text: 'សិស្សសរុប ' + students.length + ' នាក់ (ស្រី ' + female + ')' }));
    scale().forEach(function (g) {
      var n = students.filter(function (s) { return state.figures[s.id].grade === g.letter; }).length;
      host.appendChild(el('span', {}, [el('b', { text: g.letter }), ' ' + n]));
    });
  }

  // ---------- entering scores and remarks ----------
  var pending = {}, pendingTimer = null, saving = Promise.resolve();
  function scoreChanged(tab, student, subject, input) {
    var raw = input.value.trim();
    var value = raw === '' ? null : Number(raw);
    var bad = value !== null && (!Number.isFinite(value) || value < 0 || value > subject.maxScore);
    input.classList.toggle('bad', bad);
    if (bad) { saved(subject.name + ': the score must be between 0 and ' + subject.maxScore, true); return; }
    var tabScores = state.scores[tab.id] = state.scores[tab.id] || {};
    (tabScores[student.id] = tabScores[student.id] || {})[subject.id] = value;
    computeFigures(); paintFigures();
    (pending[tab.id] = pending[tab.id] || {})[student.id + ':' + subject.id] = { studentId: student.id, subjectId: subject.id, score: value };
    clearTimeout(pendingTimer); pendingTimer = setTimeout(flushScores, SAVE_DELAY);
  }
  function flushScores() {
    clearTimeout(pendingTimer);
    var batches = pending; pending = {};
    var classId = state.classId;
    saving = saving.then(function () {
      return Promise.all(Object.keys(batches).map(function (tabId) {
        var entries = Object.keys(batches[tabId]).map(function (k) { return batches[tabId][k]; });
        return ui.api.post('transcripts/tabs/' + encodeURIComponent(tabId) + '/scores', { classId: classId, entries: entries });
      })).then(function (done) { if (done.length) saved('✓ Saved'); })
        .catch(function (error) { failed(error, 'The scores could not be saved.'); });
    });
    return saving;
  }
  var remarkTimers = {};
  function remarkChanged(studentId, value) {
    state.remarks[studentId] = value;
    clearTimeout(remarkTimers[studentId]);
    remarkTimers[studentId] = setTimeout(function () { saveRemark(studentId); }, SAVE_DELAY);
  }
  function saveRemark(studentId) {
    delete remarkTimers[studentId];
    var first = state.data && state.data.semesters[0];
    if (!first) return Promise.resolve();
    return ui.api.put('transcripts/tabs/' + encodeURIComponent(first.id) + '/remarks', { classId: state.classId, studentId: studentId, comment: state.remarks[studentId] || '' })
      .then(function () { saved('✓ Saved'); }).catch(function (error) { failed(error, 'The remark could not be saved.'); });
  }
  function saveAll() {
    return Promise.all([flushScores()].concat(Object.keys(remarkTimers).map(function (id) { clearTimeout(remarkTimers[id]); return saveRemark(id); })));
  }
  // Enter / ↓ / ↑: the same subject for the next or previous student
  function moveFocus(event) {
    if (['Enter', 'ArrowDown', 'ArrowUp'].indexOf(event.key) < 0) return;
    var key = event.target.getAttribute('data-score').split(':')[1];
    var inputs = Array.prototype.filter.call(document.querySelectorAll('[data-score]'), function (x) { return x.getAttribute('data-score').split(':')[1] === key; });
    var at = inputs.indexOf(event.target), next = inputs[at + (event.key === 'ArrowUp' ? -1 : 1)];
    if (next) { event.preventDefault(); next.focus(); next.select(); }
  }

  // ---------- the year or one semester (ranking, honor roll, report cards) ----------
  var VIEW_PAGE = { sheet: 'A4 landscape', honor: 'A4 landscape', ranking: 'A4 portrait', cards: 'A4 portrait' };
  var HONOR_PLACES = 5;
  function rankedSemesters() { return state.data ? state.data.semesters.filter(function (tab) { return semesterSubjects(tab).length; }) : []; }
  function scopeTab() { return rankedSemesters().filter(function (tab) { return tab.id === state.scope; })[0] || null; }
  function scopeLabel() { var tab = scopeTab(); return tab ? tab.label : 'ឆ្នាំសិក្សា' + (state.data && state.data.studyYear ? ' ' + state.data.studyYear : ''); }
  // a student's figures for the chosen period: { total, average, grade, gpa, rank }
  function figureOf(studentId) { var f = state.figures[studentId], tab = scopeTab(); return tab ? f.semesters[tab.id] : f; }
  function rankedStudents() {
    return state.data.students.slice().sort(function (a, b) {
      var ra = figureOf(a.id).rank || 1e9, rb = figureOf(b.id).rank || 1e9;
      return ra - rb || String(a.studentNumber).localeCompare(String(b.studentNumber));
    });
  }
  function renderViewChrome() {
    var view = state.view;
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-view') === view)); });
    $('page-style').textContent = '@page { size: ' + VIEW_PAGE[view] + '; margin: ' + (view === 'cards' ? '10mm' : '7mm') + '; }';
    $('scope-wrap').hidden = view === 'sheet';
    $('order-wrap').hidden = view !== 'sheet';
    $('search-wrap').hidden = view !== 'sheet';
    $('card-student-wrap').hidden = view !== 'cards';
    var scope = $('scope'); scope.textContent = '';
    scope.appendChild(el('option', { value: 'year', text: 'The year (all semesters)' }));
    rankedSemesters().forEach(function (tab) { scope.appendChild(el('option', { value: tab.id, text: tab.label })); });
    if (!scopeTab()) state.scope = 'year';
    scope.value = state.scope;
    var pick = $('card-student'); pick.textContent = '';
    pick.appendChild(el('option', { value: '', text: 'Every student' }));
    (state.data ? state.data.students : []).forEach(function (s) { pick.appendChild(el('option', { value: s.id, text: (s.studentNumber ? s.studentNumber + ' · ' : '') + (s.nameKh || s.name) })); });
    if (state.data && !state.data.students.some(function (s) { return s.id === state.cardStudent; })) state.cardStudent = '';
    pick.value = state.cardStudent;
  }
  function renderView() {
    $('paper').hidden = state.view !== 'sheet';
    $('ranking-doc').hidden = state.view !== 'ranking';
    $('honor-doc').hidden = state.view !== 'honor';
    $('cards-doc').hidden = state.view !== 'cards';
    renderDocument(); // the sheet also works out the figures the other views use
    if (state.view === 'ranking') renderRanking();
    if (state.view === 'honor') renderHonor();
    if (state.view === 'cards') renderCards();
    applyHeaderEditing();
  }
  // the school's header (logo, name, programme, motto) and a title
  // ---------- header & footer (the school's print form for university sheets; admins edit it on the page) ----------
  var DEFAULT_TITLES = { title: 'តារាងលទ្ធផលសិក្សា', ranking: 'ចំណាត់ថ្នាក់សិស្ស', honor: 'តារាងកិត្តិយស', yearcard: 'ព្រឹត្តិបត្រពិន្ទុប្រចាំឆ្នាំសិក្សា', semestercard: 'ព្រឹត្តិបត្រពិន្ទុប្រចាំ' };
  function form() { return state.form || {}; }
  function titleText(key) { var f = form(); var value = key === 'title' ? f.title : (f.titles || {})[key]; return value || DEFAULT_TITLES[key]; }
  function schoolText() { return form().orgName || ((state.data && state.data.school) || {}).name || ''; }
  function underLines() { var lines = form().headerLines || []; return lines.length ? lines : [state.data.sheet.degree || ''].filter(Boolean); }
  function mottoLines() { var lines = form().mottoLines || []; return lines.length ? lines : ['ព្រះរាជាណាចក្រកម្ពុជា', 'ជាតិ សាសនា ព្រះមហាក្សត្រ']; }
  function signerText(i) { var s = form().signers || []; return s[i] || ['នាយកសាលា', 'គ្រូបន្ទុកថ្នាក់'][i]; }
  function signerName(i) { var n = form().signerNames || []; return n[i] || (i === 1 ? state.data.teacherName || '' : ''); }
  // a text the administrator can type over: data-edit names the print form field it changes
  // ---------- formatting: each text belongs to a block, styled together (font, size, colour, bold, alignment) ----------
  var BLOCK_NAMES = { offices: 'Lines under the school name', school: 'School name', motto: 'Motto', title: 'Title', dates: 'Place and date', approval: 'Approval line', roles: 'Signer titles', names: 'Signer names' };
  // Fonts installed with Windows and the usual Khmer font packs (the page cannot download fonts).
  var FONTS = ['Khmer OS Battambang', 'Khmer OS Siemreap', 'Khmer OS Muol Light', 'Khmer OS Muol', 'Khmer OS Content', 'Khmer OS System', 'Khmer OS Bokor', 'Khmer UI', 'Leelawadee UI', 'Noto Sans Khmer', 'Noto Serif Khmer', 'Hanuman', 'Moul', 'Battambang', 'Siemreap', 'Times New Roman', 'Arial', 'Calibri', 'Tahoma'];
  function blockOf(key) {
    if (key === 'orgName') return 'school';
    if (key === 'headerLines') return 'offices';
    if (key === 'mottoLines') return 'motto';
    if (key.indexOf('title:') === 0) return 'title';
    if (key === 'footerText' || key === 'dateLine') return 'dates';
    if (key === 'approvalText') return 'approval';
    if (key.indexOf('signerNames.') === 0) return 'names';
    if (key.indexOf('signers.') === 0) return 'roles';
    return '';
  }
  function styleOf(block) { return (form().styles && form().styles[block]) || {}; }
  function applyStyle(node) {
    var s = styleOf(node.getAttribute('data-style-key'));
    node.style.textAlign = s.align || '';
    node.style.fontFamily = s.font ? '"' + s.font + '", var(--khmer)' : '';
    node.style.fontSize = s.size ? s.size + 'pt' : '';
    node.style.color = s.color || '';
    node.style.fontWeight = s.bold === true ? '700' : s.bold === false ? '400' : '';
  }
  function styled(node, block) { node.setAttribute('data-style-key', block); applyStyle(node); return node; }
  function restyle(block) { Array.prototype.forEach.call(document.querySelectorAll('[data-style-key="' + block + '"]'), applyStyle); }
  function fillStyleBar() {
    var block = state.styleTarget, s = block ? styleOf(block) : {};
    $('style-target').textContent = block ? 'Formatting: ' + BLOCK_NAMES[block] : 'Click a text on the page to format it';
    Array.prototype.forEach.call(document.querySelectorAll('#style-bar [data-control]'), function (control) { control.disabled = !block; });
    Array.prototype.forEach.call(document.querySelectorAll('#style-bar [data-align]'), function (b) { b.setAttribute('aria-pressed', String(Boolean(block) && (s.align || '') === b.getAttribute('data-align'))); });
    $('style-font').value = s.font || '';
    $('style-size').value = s.size ? String(s.size) : '';
    $('style-color').value = s.color || '#000000';
    $('style-bold').setAttribute('aria-pressed', String(s.bold === true));
  }
  function selectBlock(block) {
    state.styleTarget = block || null;
    Array.prototype.forEach.call(document.querySelectorAll('[data-style-key]'), function (n) { n.classList.toggle('style-selected', Boolean(block) && n.getAttribute('data-style-key') === block); });
    fillStyleBar();
  }
  function changeStyle(change) {
    var block = state.styleTarget; if (!block) return;
    var f = form(); var styles = Object.assign({}, f.styles || {});
    var s = Object.assign({}, styles[block] || {});
    change(s);
    Object.keys(s).forEach(function (k) { if (s[k] === '' || s[k] === null || s[k] === undefined) delete s[k]; });
    if (Object.keys(s).length) styles[block] = s; else delete styles[block];
    state.form = Object.assign({}, f, { styles: styles });
    restyle(block); fillStyleBar();
  }
  function editable(tag, key, text, attrs) {
    var node = el(tag, Object.assign({ 'data-edit': key, text: text }, attrs || {}));
    // the place and date, and the title, are styled as a whole line (see signatures and docHeader)
    var block = blockOf(key);
    if (block && block !== 'dates' && block !== 'title') styled(node, block);
    return node;
  }
  function linesBlock(tag, key, lines, className) {
    var node = styled(el(tag, { 'data-edit': key, 'data-lines': '1', class: className || '' }), blockOf(key));
    lines.forEach(function (line, i) { if (i) node.appendChild(el('br')); node.appendChild(document.createTextNode(line)); });
    return node;
  }
  function docHeader(titleKey, suffix, info, sticky) {
    var d = state.data, school = d.school || {};
    var logo = /^data:image\//.test(school.logoUrl || '') ? el('img', { src: school.logoUrl, alt: '' }) : null;
    return el('div', { class: 'doc-top' + (sticky ? '' : ' static') }, [
      el('header', { class: 'doc-head' }, [
        el('div', { class: 'doc-school' }, [logo, el('div', {}, [editable('b', 'orgName', schoolText()), linesBlock('span', 'headerLines', underLines())])]),
        linesBlock('div', 'mottoLines', mottoLines(), 'doc-motto'),
      ]),
      styled(el('h2', { class: 'doc-title' }, [editable('span', 'title:' + titleKey, titleText(titleKey)), suffix ? el('span', { text: suffix }) : null]), 'title'),
      info ? el('p', { class: 'doc-info', text: info }) : null,
    ]);
  }
  // The signing date: the date saved in the print form (YYYY-MM-DD), else today. Typed as dd/mm/yyyy.
  function signDate() {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(form().dateLine || ''));
    return m ? { d: Number(m[3]), m: Number(m[2]), y: Number(m[1]) } : (function (t) { return { d: t.getDate(), m: t.getMonth() + 1, y: t.getFullYear() }; })(new Date());
  }
  function dateText() { var s = signDate(); return 'ថ្ងៃទី ' + s.d + ' ខែ ' + s.m + ' ឆ្នាំ ' + s.y; }
  function dateTyped() { var s = signDate(); return String(s.d).padStart(2, '0') + '/' + String(s.m).padStart(2, '0') + '/' + s.y; }
  // dd/mm/yyyy (also d/m/yyyy, with - or .) → YYYY-MM-DD; '' = today's date when printing
  function parseTypedDate(text) {
    if (!text) return '';
    var m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.replace(/\s+/g, ''));
    var d = m && new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    if (!m || d.getUTCDate() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1) throw new Error('Write the date as dd/mm/yyyy, e.g. 19/11/2026 (or leave it empty for today’s date).');
    return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  function signatures(withDirector) {
    return el('div', { class: 'signs' }, [
      withDirector ? el('div', { class: 'sign' }, [editable('span', 'approvalText', form().approvalText || 'បានឃើញ និង ឯកភាព'), editable('b', 'signers.0', signerText(0)), editable('span', 'signerNames.0', signerName(0), { class: 'sign-name' })]) : el('div'),
      el('div', { class: 'sign' }, [
        styled(el('span', { class: 'date-line' }, ['ធ្វើនៅ', editable('span', 'footerText', form().footerText || '', { class: 'place', 'data-placeholder': '…' }), ' ', editable('span', 'dateLine', dateText(), { class: 'date', 'data-placeholder': 'dd/mm/yyyy' })]), 'dates'),
        editable('b', 'signers.1', signerText(1)), editable('span', 'signerNames.1', signerName(1), { class: 'sign-name' }),
      ]),
    ]);
  }
  // editing: outline every editable text and let it be typed over
  function applyHeaderEditing() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (node) {
      var isDate = node.getAttribute('data-edit') === 'dateLine';
      if (state.editingHeader) {
        if (isDate && !node.hasAttribute('data-before')) node.textContent = dateTyped(); // typed as dd/mm/yyyy
        node.setAttribute('contenteditable', 'true'); node.setAttribute('spellcheck', 'false');
        // what it showed when editing began: only texts that were changed are saved (each report card repeats them)
        if (!node.hasAttribute('data-before')) node.setAttribute('data-before', readText(node));
      } else {
        node.removeAttribute('contenteditable'); node.removeAttribute('data-before');
        if (isDate) node.textContent = dateText();
      }
    });
    document.body.classList.toggle('editing-header', Boolean(state.editingHeader));
    $('header-bar').hidden = !state.editingHeader;
    $('edit-header').setAttribute('aria-pressed', String(Boolean(state.editingHeader)));
  }
  function setHeaderEditing(on) {
    state.editingHeader = on;
    if (!on) state.styleTarget = null;
    selectBlock(on ? state.styleTarget : null);
    if (on) state.formBefore = JSON.parse(JSON.stringify(form()));
    applyHeaderEditing();
  }
  function readText(node) { return String(node.innerText || node.textContent || '').replace(/\u00a0/g, ' ').trim(); }
  // the shown texts back into the print form; a text left as the automatic one stays automatic
  function readHeader() {
    var f = JSON.parse(JSON.stringify(form()));
    f.titles = Object.assign({}, f.titles || {});
    f.signers = (f.signers || []).slice(); f.signerNames = (f.signerNames || []).slice();
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (node) {
      if (node.closest('[hidden]')) return;
      var key = node.getAttribute('data-edit'), value = readText(node);
      if (node.hasAttribute('data-before') && node.getAttribute('data-before') === value) return; // not changed
      var lines = String(node.innerText || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (key === 'orgName') f.orgName = value === ((state.data.school || {}).name || '') && !form().orgName ? '' : value;
      else if (key === 'headerLines') f.headerLines = !form().headerLines || !form().headerLines.length ? (lines.join('|') === [state.data.sheet.degree || ''].filter(Boolean).join('|') ? [] : lines) : lines;
      else if (key === 'mottoLines') f.mottoLines = lines;
      else if (key === 'approvalText' || key === 'footerText') f[key] = value;
      else if (key === 'dateLine') f.dateLine = parseTypedDate(value);
      else if (key.indexOf('title:') === 0) { var t = key.slice(6); if (!value) value = DEFAULT_TITLES[t]; if (t === 'title') f.title = value; else f.titles[t] = value; }
      else if (key.indexOf('signers.') === 0) f.signers[Number(key.slice(8))] = value || signerText(Number(key.slice(8)));
      else if (key.indexOf('signerNames.') === 0) { var i = Number(key.slice(12)); f.signerNames[i] = i === 1 && value === (state.data.teacherName || '') && !(form().signerNames || [])[1] ? '' : value; }
    });
    for (var i = 0; i < f.signerNames.length; i += 1) if (f.signerNames[i] === undefined || f.signerNames[i] === null) f.signerNames[i] = '';
    return f;
  }
  function saveHeader() {
    var next;
    try { next = readHeader(); } catch (error) { failed(error, 'The header & footer could not be saved.'); return; }
    $('header-save').disabled = true;
    ui.api.put(state.entry ? 'transcripts/entry/university-print-template' : 'transcripts/university-print-template', next).then(function (savedForm) {
      state.form = savedForm; saved('✓ Header & footer saved'); setHeaderEditing(false); render();
    }).catch(function (error) { failed(error, 'The header & footer could not be saved.'); })
      .then(function () { $('header-save').disabled = false; });
  }
  function cancelHeader() { if (state.formBefore) state.form = state.formBefore; setHeaderEditing(false); render(); }
  function gpaText(value) { return value === null || value === undefined ? '' : Number(value).toFixed(2); }
  function photoOf(student, size) {
    var box = el('span', { class: 'photo', style: 'width:' + size + 'px;height:' + Math.round(size * 1.25) + 'px' });
    if (/^(data:image\/|https:\/\/)/.test(student.photo || '')) box.appendChild(el('img', { src: student.photo, alt: '' }));
    else box.textContent = String(student.nameKh || student.name || '•').trim().slice(0, 1);
    return box;
  }

  // ---------- student ranking (ចំណាត់ថ្នាក់) ----------
  function renderRanking() {
    var host = $('ranking-doc'); host.textContent = '';
    var d = state.data;
    host.appendChild(docHeader('ranking', ' ' + scopeLabel(), [d.sheet.name, 'ថ្នាក់ ' + d.className].filter(Boolean).join(' · ')));
    var table = el('table', { class: 'results ranking' });
    table.appendChild(el('thead', {}, [el('tr', {}, ['ចំ.ថ្នាក់', 'អត្តលេខ', 'គោត្តនាម-នាម', 'អក្សរឡាតាំង', 'ភេទ', 'សរុប', 'ម.ភាគ', 'និទ្ទេស', 'GPA'].map(function (t) { return el('th', { text: t }); }))]));
    var body = el('tbody');
    rankedStudents().forEach(function (s) {
      var f = figureOf(s.id);
      body.appendChild(el('tr', { 'data-rank-student': s.id, class: f.rank && f.rank <= 3 ? 'top' : '' }, [
        el('td', { class: 'fig', text: f.rank ? String(f.rank) : '—' }), el('td', { text: s.studentNumber }),
        el('td', { class: 'name', text: s.nameKh || s.name }), el('td', { class: 'latin', text: s.name && s.name !== s.nameKh ? s.name : '' }),
        el('td', { text: sexMark(s.sex) }), el('td', { text: num(f.total) }), el('td', { text: num(f.average) }),
        el('td', { class: 'letter ' + String(f.grade).replace('+', 'plus'), text: f.grade }), el('td', { text: gpaText(f.gpa) }),
      ]));
    });
    table.appendChild(body);
    host.appendChild(table);
    host.appendChild(signatures(true));
  }
  function rankingCsv() {
    var lines = [['ចំ.ថ្នាក់', 'អត្តលេខ', 'គោត្តនាម-នាម', 'អក្សរឡាតាំង', 'ភេទ', 'សរុប', 'ម.ភាគ', 'និទ្ទេស', 'GPA']];
    rankedStudents().forEach(function (s) { var f = figureOf(s.id); lines.push([f.rank || '', s.studentNumber, s.nameKh || s.name, s.name && s.name !== s.nameKh ? s.name : '', sexMark(s.sex), num(f.total), num(f.average), f.grade, gpaText(f.gpa)]); });
    return lines;
  }

  // ---------- honor roll (តារាងកិត្តិយស) ----------
  function renderHonor() {
    var host = $('honor-doc'); host.textContent = '';
    var d = state.data;
    host.appendChild(docHeader('honor', ' ' + scopeLabel(), [d.sheet.name, 'ថ្នាក់ ' + d.className].filter(Boolean).join(' · ')));
    var best = rankedStudents().filter(function (s) { var r = figureOf(s.id).rank; return r && r <= HONOR_PLACES; });
    if (!best.length) { host.appendChild(el('p', { class: 'doc-info', text: 'No scores yet for this period.' })); return; }
    var MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
    host.appendChild(el('div', { class: 'honor' }, best.map(function (s) {
      var f = figureOf(s.id);
      return el('div', { class: 'honoree' + (f.rank === 1 ? ' first' : ''), 'data-honor': s.id }, [
        el('span', { class: 'place', text: (MEDAL[f.rank] || '🎖️') + ' លេខ ' + f.rank }),
        photoOf(s, 96),
        el('b', { class: 'who', text: s.nameKh || s.name }),
        s.name && s.name !== s.nameKh ? el('span', { class: 'latin', text: s.name }) : null,
        el('span', { class: 'muted', text: (s.studentNumber ? 'អត្តលេខ ' + s.studentNumber + ' · ' : '') + (s.sex === 'FEMALE' ? 'ស្រី' : s.sex === 'MALE' ? 'ប្រុស' : '') }),
        el('span', { class: 'score-line', text: 'ម.ភាគ ' + num(f.average) + ' · និទ្ទេស ' + f.grade + ' · GPA ' + gpaText(f.gpa) }),
      ]);
    })));
    host.appendChild(signatures(true));
  }

  // ---------- report cards (ព្រឹត្តិបត្រពិន្ទុ): the year, or one semester ----------
  function renderCards() {
    var host = $('cards-doc'); host.textContent = '';
    var d = state.data, tab = scopeTab();
    var semesters = tab ? [tab] : rankedSemesters();
    var students = d.students.filter(function (s) { return !state.cardStudent || s.id === state.cardStudent; });
    var ranked = d.students.filter(function (s) { return figureOf(s.id).rank; }).length;
    var MONTH_KH = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
    var birth = function (value) { var p = String(value || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + MONTH_KH[Number(p[1]) - 1] + ' ' + p[0] : ''; };
    students.forEach(function (s) {
      var f = figureOf(s.id);
      var page = el('article', { class: 'paper card-page', 'data-card': s.id });
      page.appendChild(docHeader(tab ? 'semestercard' : 'yearcard', (tab ? tab.label : '') + (d.studyYear ? ' ' + d.studyYear : ''), ''));
      page.appendChild(el('div', { class: 'card-who' }, [
        photoOf(s, 84),
        el('dl', {}, [
          ['គោត្តនាម-នាម', s.nameKh || s.name], ['អក្សរឡាតាំង', s.name && s.name !== s.nameKh ? s.name : ''], ['អត្តលេខ', s.studentNumber],
          ['ភេទ', s.sex === 'FEMALE' ? 'ស្រី' : s.sex === 'MALE' ? 'ប្រុស' : ''], ['ថ្ងៃខែឆ្នាំកំណើត', birth(s.dateOfBirth)], ['ថ្នាក់', d.className], ['ជំនាញ', d.sheet.degree || d.sheet.name],
        ].map(function (pair) { return el('div', {}, [el('dt', { text: pair[0] }), el('dd', { text: pair[1] || '' })]); })),
      ]));
      var table = el('table', { class: 'results card-table' });
      table.appendChild(el('thead', {}, [el('tr', {}, ['ល.រ', 'មុខវិជ្ជា', 'ពិន្ទុ', 'និទ្ទេស', 'ពិន្ទុនិទ្ទេស'].map(function (t) { return el('th', { text: t }); }))]));
      var body = el('tbody');
      semesters.forEach(function (semester) {
        if (!tab) body.appendChild(el('tr', { class: 'semester-row' }, [el('td', { colspan: '5', text: semester.label })]));
        semesterSubjects(semester).forEach(function (subject, index) {
          var value = ((state.scores[semester.id] || {})[s.id] || {})[subject.id];
          var g = U.grade(value, subject.maxScore, scale());
          body.appendChild(el('tr', {}, [el('td', { text: String(index + 1) }), el('td', { class: 'name', text: subject.name }),
            el('td', { text: value === null || value === undefined ? '' : num(value) + (subject.maxScore === 100 ? '' : ' / ' + subject.maxScore) }),
            el('td', { class: 'letter ' + (g ? g.letter.replace('+', 'plus') : ''), text: g ? g.letter : '' }), el('td', { text: g ? gpaText(g.gpa) : '' })]));
        });
        if (!tab) {
          var sf = state.figures[s.id].semesters[semester.id];
          body.appendChild(el('tr', { class: 'subtotal' }, [el('td', { colspan: '2', text: 'លទ្ធផល' + semester.label }), el('td', { text: num(sf.total) + (sf.average === null ? '' : ' (' + num(sf.average) + ')') }), el('td', { text: sf.grade }), el('td', { text: gpaText(sf.gpa) })]));
        }
      });
      table.appendChild(body);
      page.appendChild(table);
      page.appendChild(el('div', { class: 'card-sum' }, [
        ['សរុប', num(f.total)], ['ម.ភាគ', num(f.average)], ['និទ្ទេស', f.grade], ['GPA', gpaText(f.gpa)], ['ចំណាត់ថ្នាក់', f.rank ? f.rank + ' / ' + ranked : ''],
      ].map(function (pair) { return el('div', { 'data-sum': pair[0] }, [el('span', { text: pair[0] }), el('b', { text: pair[1] || '—' })]); })));
      var g = U.grade(f.average, 100, scale());
      page.appendChild(el('p', { class: 'card-note' }, [el('span', { text: 'ផ្សេងៗ៖ ' }), (state.remarks[s.id] || '') + (g && g.kh ? (state.remarks[s.id] ? ' · ' : '') + 'លទ្ធផល' + g.kh : '')]));
      page.appendChild(signatures(true));
      host.appendChild(page);
    });
  }

  // ---------- CSV ----------
  function exportCsv() {
    var d = state.data; if (!d || emptyText()) return;
    if (state.view === 'ranking') return downloadCsv(rankingCsv(), d.className + ' ranking ' + scopeLabel());
    var semesters = d.semesters.filter(function (tab) { return semesterSubjects(tab).length; });
    var head1 = ['ល-រ', 'អត្តលេខ', 'គោត្តនាម-នាម', 'អក្សរឡាតាំង', 'ភេទ'], head2 = ['', '', '', '', ''];
    semesters.forEach(function (tab) { semesterSubjects(tab).forEach(function (s, i) { head1.push(i === 0 ? tab.label : '', ''); head2.push(s.name, ''); }); });
    head1.push('សរុប', 'ម.ភាគ', 'និទ្ទេស', 'GPA', 'ចំណាត់ថ្នាក់', 'ផ្សេងៗ');
    var lines = [head1, head2];
    d.students.forEach(function (student, index) {
      var f = state.figures[student.id], line = [index + 1, student.studentNumber, student.nameKh || student.name, student.name && student.name !== student.nameKh ? student.name : '', sexMark(student.sex)];
      semesters.forEach(function (tab) { semesterSubjects(tab).forEach(function (s) { var v = ((state.scores[tab.id] || {})[student.id] || {})[s.id]; line.push(num(v), U.letter(v, s.maxScore, scale())); }); });
      line.push(num(f.total), num(f.average), f.grade, f.gpa === null ? '' : f.gpa.toFixed(2), f.rank || '', state.remarks[student.id] || '');
      lines.push(line);
    });
    downloadCsv(lines, d.className + ' ' + d.sheet.name);
  }
  function downloadCsv(lines, name) {
    var csv ='﻿' + lines.map(function (line) { return line.map(function (cell) { var v = String(cell); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
    var link = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: String(name).replace(/[\\/:*?"<>|]/g, '-') + '.csv' });
    document.body.appendChild(link); link.click(); link.remove();
  }

  // ---------- set-up (administrators) ----------
  function refreshAll(keepEditing) {
    return loadSheets().then(function () { renderSetup(keepEditing); return load(); });
  }
  // the first semester's "Subject name" box (the next step after creating a sheet)
  function focusNewSubject() {
    setTimeout(function () {
      var box = document.querySelector('[data-new-subject]');
      if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
    }, 0);
  }
  function openSetup(sheetId) {
    $('setup').hidden = false;
    editSheet(sheetId === undefined ? state.sheetId || null : sheetId);
    $('setup').scrollIntoView({ block: 'start' });
  }
  function editSheet(sheetId) {
    state.editingSheet = sheetId;
    var sheet = sheetById(sheetId);
    $('f-name').value = sheet ? sheet.name : ''; $('f-degree').value = sheet ? sheet.degree || '' : '';
    state.scale = sheet ? JSON.parse(JSON.stringify(sheet.gradeScale || U.SCALE)) : null;
    renderSetup(true);
  }
  function renderSetup(keepScale) {
    var list = $('sheet-list'); list.textContent = '';
    state.sheets.forEach(function (sheet) {
      list.appendChild(el('button', { type: 'button', 'aria-current': String(state.editingSheet === sheet.id), onclick: function () { editSheet(sheet.id); } },
        [sheet.name, el('small', { text: sheet.tabs.length + ' semesters · ' + sheet.subjects.length + ' subjects · ' + sheet.classIds.length + ' classes' })]));
    });
    if (!state.sheets.length) list.appendChild(el('p', { class: 'muted', text: 'No university score sheets yet.' }));
    var sheet = sheetById(state.editingSheet);
    if (state.editingSheet && !sheet) { state.editingSheet = null; }
    $('sheet-form-title').textContent = sheet ? 'Edit ' + sheet.name : 'New university score sheet';
    $('delete-sheet').hidden = !sheet; $('sheet-extra').hidden = !sheet; $('new-hint').hidden = Boolean(sheet);
    var checks = $('f-classes'); checks.textContent = '';
    // university and short-course classes (and classes without a level); primary, secondary and high school classes use the other sheets
    var LEVEL_NAMES = { PRIMARY: 'Primary', SECONDARY: 'Secondary', HIGH_SCHOOL: 'High school', UNIVERSITY: 'University', SHORT_COURSE: 'Short course' };
    state.classes.forEach(function (item) {
      var linked = Boolean(sheet && sheet.classIds.indexOf(item.id) >= 0);
      if ((item.level === 'PRIMARY' || item.level === 'SECONDARY' || item.level === 'HIGH_SCHOOL') && !linked) return;
      var box = el('input', { type: 'checkbox', value: item.id }); box.checked = linked;
      checks.appendChild(el('label', {}, [box, (item.name || item.id) + (LEVEL_NAMES[item.level] ? ' · ' + LEVEL_NAMES[item.level] : '')]));
    });
    if (!state.classes.length) checks.appendChild(el('span', { class: 'muted', text: 'No classes yet.' }));
    if (!sheet) return;
    if (!keepScale || !state.scale) state.scale = JSON.parse(JSON.stringify(sheet.gradeScale || U.SCALE));
    renderSemesters(sheet);
    renderScale();
  }
  function renderSemesters(sheet) {
    // names typed but not added yet survive the re-draw
    var typed = {};
    pendingSubjects().forEach(function (s) { typed[s.tabId] = s; });
    var host = $('semesters'); host.textContent = '';
    var semesters = sheet.tabs.filter(function (t) { return t.type === 'SEMESTER'; });
    if (!semesters.length) host.appendChild(el('p', { class: 'muted', text: 'No semesters yet — add one below.' }));
    semesters.forEach(function (tab) {
      var own = sheet.subjects.filter(function (s) { return s.tabId === tab.id; });
      var box = el('div', { class: 'semester', 'data-semester': tab.id }, [
        el('div', { class: 'semester-head' }, [el('b', { text: tab.label }), el('button', { type: 'button', class: 'link-danger', text: 'Delete semester', onclick: function () {
          if (!window.confirm('Delete ' + tab.label + ' with its subjects and scores?')) return;
          ui.api.delete('transcripts/tabs/' + encodeURIComponent(tab.id)).then(function () { saved('✓ Deleted'); return refreshAll(true); }).catch(function (error) { failed(error, 'It could not be deleted.'); });
        } })]),
      ]);
      if (!own.length) box.appendChild(el('p', { class: 'muted', text: 'No subjects yet.' }));
      own.forEach(function (subject) {
        var name = el('input', { 'aria-label': 'Subject name', maxlength: '120' }); name.value = subject.name;
        var max = el('input', { type: 'number', min: '1', max: '1000', 'aria-label': 'Maximum score', title: 'Maximum score' }); max.value = String(subject.maxScore);
        var save = function () {
          ui.api.put('transcripts/subjects/' + encodeURIComponent(subject.id), { name: name.value, maxScore: max.value, color: subject.color || '#334155', order: subject.order, coefficient: subject.coefficient === undefined ? 1 : subject.coefficient })
            .then(function () { saved('✓ Subject saved'); return refreshAll(true); }).catch(function (error) { failed(error, 'The subject could not be saved.'); return refreshAll(true); });
        };
        name.addEventListener('change', save); max.addEventListener('change', save);
        box.appendChild(el('div', { class: 'subject', 'data-subject': subject.id }, [name, max, el('button', { type: 'button', class: 'link-danger', 'aria-label': 'Delete ' + subject.name, text: '✕', onclick: function () {
          if (!window.confirm('Delete the subject ' + subject.name + ' and its scores?')) return;
          ui.api.delete('transcripts/subjects/' + encodeURIComponent(subject.id)).then(function () { return refreshAll(true); }).catch(function (error) { failed(error, 'The subject could not be deleted.'); });
        } })]));
      });
      var newName = el('input', { placeholder: 'Subject name, e.g. English I', maxlength: '120', 'aria-label': 'New subject in ' + tab.label, 'data-new-subject': tab.id });
      var newMax = el('input', { type: 'number', min: '1', max: '1000', value: '100', 'aria-label': 'Maximum score' });
      if (typed[tab.id]) { newName.value = typed[tab.id].name; newMax.value = String(typed[tab.id].maxScore); }
      var add = function (event) {
        if (event) event.preventDefault();
        if (!newName.value.trim()) { newName.focus(); return; }
        ui.api.post('transcripts/sheets/' + encodeURIComponent(sheet.id) + '/subjects', { name: newName.value, maxScore: newMax.value || 100, tabId: tab.id })
          .then(function () { newName.value = ''; saved('✓ Subject added'); return refreshAll(true); })
          .then(function () { var again = document.querySelector('[data-new-subject="' + tab.id + '"]'); if (again) again.focus(); })
          .catch(function (error) { failed(error, 'The subject could not be added.'); });
      };
      newName.addEventListener('keydown', function (event) { if (event.key === 'Enter') add(event); });
      box.appendChild(el('div', { class: 'subject add-subject' }, [newName, newMax, el('button', { type: 'button', class: 'btn primary', text: '＋ Add subject', onclick: add })]));
      host.appendChild(box);
    });
  }
  function renderScale() {
    var body = $('scale'); body.textContent = '';
    state.scale.forEach(function (g, index) {
      var last = index === state.scale.length - 1;
      var input = function (key, attrs) {
        var node = el('input', Object.assign({ 'aria-label': key + ' ' + (index + 1) }, attrs || {}));
        node.value = last && key === 'min' ? '0' : String(g[key] === undefined || g[key] === null ? '' : g[key]);
        if (last && key === 'min') node.disabled = true;
        node.addEventListener('input', function () { g[key] = attrs && attrs.type === 'number' ? node.value : node.value; $('scale-save').disabled = false; });
        return node;
      };
      body.appendChild(el('tr', {}, [
        el('td', {}, [input('letter', { maxlength: '3', style: 'width:64px' })]),
        el('td', {}, [input('kh', { maxlength: '40' })]),
        el('td', {}, [input('min', { type: 'number', min: '0', max: '100', step: 'any', style: 'width:84px' })]),
        el('td', {}, [input('gpa', { type: 'number', min: '0', max: '5', step: 'any', style: 'width:84px' })]),
        el('td', {}, [state.scale.length > 2 ? el('button', { type: 'button', class: 'link-danger', text: '✕', 'aria-label': 'Remove grade ' + g.letter, onclick: function () { state.scale.splice(index, 1); $('scale-save').disabled = false; renderScale(); } }) : null]),
      ]));
    });
  }
  function saveScale(value) {
    var sheet = sheetById(state.editingSheet); if (!sheet) return;
    ui.api.put('transcripts/sheets/' + encodeURIComponent(sheet.id) + '/grades', { gradeScale: value })
      .then(function () { saved('✓ Grade scale saved'); $('scale-save').disabled = true; state.scale = null; return refreshAll(false); })
      .catch(function (error) { failed(error, 'The grade scale could not be saved.'); });
  }
  function saveSheet(event) {
    event.preventDefault();
    var classIds = Array.prototype.map.call(document.querySelectorAll('#f-classes input:checked'), function (box) { return box.value; });
    var body = { name: $('f-name').value, degree: $('f-degree').value, classIds: classIds };
    var creating = !state.editingSheet;
    if (creating) body.kind = 'UNIVERSITY';
    // Subject names typed in a semester's "Subject name" box but not yet added are saved too
    // (Save is the button people reach for; they must not lose what they typed).
    var typed = creating ? [] : pendingSubjects();
    var request = creating ? ui.api.post('transcripts/sheets', body) : ui.api.put('transcripts/sheets/' + encodeURIComponent(state.editingSheet), body);
    request.then(function (sheet) {
      return typed.reduce(function (chain, subject) {
        return chain.then(function () { return ui.api.post('transcripts/sheets/' + encodeURIComponent(sheet.id) + '/subjects', subject); });
      }, Promise.resolve()).then(function () { return sheet; });
    }).then(function (sheet) {
      saved(creating ? '✓ Score sheet created — now add each semester\'s subjects' : typed.length ? '✓ Score sheet and ' + typed.length + ' subject' + (typed.length === 1 ? '' : 's') + ' saved' : '✓ Score sheet saved');
      state.editingSheet = sheet.id; if (creating || !state.sheetId) state.sheetId = sheet.id;
      return refreshAll(false).then(function () { editSheet(sheet.id); if (creating) focusNewSubject(); });
    }).catch(function (error) { failed(error, 'The score sheet could not be saved.'); return refreshAll(true); });
  }
  // the subjects typed in the semesters' add rows: [{ name, maxScore, tabId }]
  function pendingSubjects() {
    return Array.prototype.map.call(document.querySelectorAll('[data-new-subject]'), function (input) {
      var max = input.parentNode.querySelector('input[type="number"]');
      return { name: input.value.trim(), maxScore: (max && max.value) || 100, tabId: input.getAttribute('data-new-subject') };
    }).filter(function (subject) { return subject.name; });
  }

  // ---------- events ----------
  $('sheet').addEventListener('change', function (event) { saveAll().then(function () { state.sheetId = event.target.value; pickDefaults(); load(); }); });
  $('class').addEventListener('change', function (event) { saveAll().then(function () { state.classId = event.target.value; load(); }); });
  $('order').addEventListener('change', function (event) { state.order = event.target.value; if (state.data && !emptyText()) renderDocument(); });
  $('scope').addEventListener('change', function (event) { state.scope = event.target.value; render(); });
  $('card-student').addEventListener('change', function (event) { state.cardStudent = event.target.value; render(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (button) {
    button.addEventListener('click', function () { saveAll().then(function () { state.view = button.getAttribute('data-view'); render(); }); });
  });
  $('search').addEventListener('input', function (event) { state.query = event.target.value; if (state.data && !emptyText()) renderDocument(); });
  $('print').addEventListener('click', function () { saveAll().then(function () { window.print(); }); });
  $('export').addEventListener('click', exportCsv);
  $('edit-header').addEventListener('click', function () { if (state.editingHeader) cancelHeader(); else setHeaderEditing(true); });
  $('header-save').addEventListener('click', saveHeader);
  $('header-cancel').addEventListener('click', cancelHeader);
  FONTS.forEach(function (name) { $('style-font').appendChild(el('option', { value: name, text: name, style: 'font-family:"' + name + '"' })); });
  // clicking a text while editing chooses what the bar formats
  document.addEventListener('focusin', function (event) {
    var node = event.target && event.target.closest ? event.target.closest('[data-edit]') : null;
    if (state.editingHeader && node) selectBlock(blockOf(node.getAttribute('data-edit')));
  });
  Array.prototype.forEach.call(document.querySelectorAll('#style-bar [data-align]'), function (b) {
    b.addEventListener('click', function () { var align = b.getAttribute('data-align'); changeStyle(function (s) { s.align = s.align === align ? '' : align; }); });
  });
  $('style-font').addEventListener('change', function (event) { changeStyle(function (s) { s.font = event.target.value; }); });
  $('style-size').addEventListener('change', function (event) { var v = Number(event.target.value); changeStyle(function (s) { s.size = event.target.value === '' ? '' : Math.min(48, Math.max(6, Math.round(v * 2) / 2)); }); });
  $('style-color').addEventListener('input', function (event) { changeStyle(function (s) { s.color = event.target.value; }); });
  $('style-bold').addEventListener('click', function () { changeStyle(function (s) { s.bold = s.bold === true ? '' : true; }); });
  $('style-reset').addEventListener('click', function () { changeStyle(function (s) { Object.keys(s).forEach(function (k) { delete s[k]; }); }); });
  // typing Enter in a one-line text ends it (several lines only where the text has lines)
  document.addEventListener('keydown', function (event) {
    var node = event.target;
    if (event.key === 'Enter' && node && node.getAttribute && node.getAttribute('data-edit') && !node.getAttribute('data-lines')) { event.preventDefault(); node.blur(); }
  });
  // pasted text stays plain
  document.addEventListener('paste', function (event) {
    var node = event.target && event.target.closest ? event.target.closest('[data-edit]') : null;
    if (!node || !event.clipboardData) return;
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  });
  $('open-setup').addEventListener('click', function () { openSetup(); });
  $('close-setup').addEventListener('click', function () { $('setup').hidden = true; });
  // the other kind of score sheet (stay=1: Enter Scores does not send a teacher straight back here)
  $('tab-school').addEventListener('click', function () { saveAll().then(function () { ui.navigate(state.entry ? 'score-entry' : 'score-sheets', state.entry ? { entry: '1', stay: '1' } : { stay: '1' }); }); });
  $('sheet-form').addEventListener('submit', saveSheet);
  $('new-sheet').addEventListener('click', function () { editSheet(null); $('f-name').focus(); });
  $('delete-sheet').addEventListener('click', function () {
    var sheet = sheetById(state.editingSheet); if (!sheet) return;
    if (!window.confirm('Delete the score sheet ' + sheet.name + ' with all its semesters, subjects and scores?')) return;
    ui.api.delete('transcripts/sheets/' + encodeURIComponent(sheet.id)).then(function () {
      saved('✓ Score sheet deleted'); state.editingSheet = null; if (state.sheetId === sheet.id) state.sheetId = '';
      return refreshAll(false).then(function () { editSheet(null); });
    }).catch(function (error) { failed(error, 'The score sheet could not be deleted.'); });
  });
  $('add-semester').addEventListener('submit', function (event) {
    event.preventDefault();
    var sheet = sheetById(state.editingSheet); if (!sheet) return;
    var label = $('semester-label').value.trim(); if (!label) { $('semester-label').focus(); return; }
    ui.api.post('transcripts/sheets/' + encodeURIComponent(sheet.id) + '/tabs', { label: label, type: 'SEMESTER' })
      .then(function () { $('semester-label').value = ''; saved('✓ Semester added'); return refreshAll(true); })
      .catch(function (error) { failed(error, 'The semester could not be added.'); });
  });
  $('scale-add').addEventListener('click', function () {
    if (state.scale.length >= 12) return;
    state.scale.splice(state.scale.length - 1, 0, { letter: '', kh: '', min: '', gpa: '' });
    $('scale-save').disabled = false; renderScale();
  });
  $('scale-reset').addEventListener('click', function () { if (window.confirm('Use the default university grade scale?')) saveScale(null); });
  $('scale-save').addEventListener('click', function () { saveScale(state.scale.map(function (g, i) { return { letter: g.letter, kh: g.kh, min: i === state.scale.length - 1 ? 0 : Number(g.min), gpa: Number(g.gpa) }; })); });
  window.addEventListener('resize', fitView);
  window.addEventListener('beforeunload', function () { saveAll(); });

  ui.autoResize();
  ui.connect().then(function (context) {
    var query = context.query || {};
    var granted = Array.isArray(context.permissions) ? context.permissions : null;
    state.entry = query.entry === '1';
    state.canManage = !state.entry && (!granted || granted.indexOf(MANAGE) >= 0);
    state.canEdit = state.entry || !granted || granted.indexOf(EDIT) >= 0;
    $('open-setup').hidden = !state.canManage;
    if (state.entry) {
      $('kind-tabs').hidden = true;
      ui.api.get('transcripts/entry/sheets').then(function (result) { $('kind-tabs').hidden = !rows(result && result.sheets).length; }).catch(function () {});
    }
    if (['sheet', 'ranking', 'honor', 'cards'].indexOf(query.view) >= 0) state.view = query.view;
    if (query.scope) state.scope = String(query.scope);
    if (query.sheetId) state.sheetId = String(query.sheetId);
    if (query.classId) state.classId = String(query.classId);
    // administrators, and in Enter Scores those allowed to "Edit the score sheets' header & footer"
    state.canEditHeader = state.canManage || (state.entry && (!granted || granted.indexOf(PRINT) >= 0));
    $('edit-header').hidden = !state.canEditHeader;
    var printForm = ui.api.get(state.entry ? 'transcripts/entry/university-print-template' : 'transcripts/university-print-template').then(function (value) { state.form = value || {}; }).catch(function () { state.form = {}; });
    return Promise.all([loadSheets(), printForm]).then(function () {
      if (query.classId && !query.sheetId) {
        var withClass = state.sheets.filter(function (s) { return s.classIds.indexOf(String(query.classId)) >= 0; })[0];
        if (withClass) { state.sheetId = withClass.id; state.classId = String(query.classId); }
      }
      if (state.canManage && query.setup) openSetup(query.sheetId ? String(query.sheetId) : null);
      return load();
    });
  }).catch(function (error) { show('error', error.message || 'University score sheets could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
