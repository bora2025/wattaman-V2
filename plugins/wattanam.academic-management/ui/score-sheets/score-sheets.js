/* Score Sheets (តារាងសម្រង់ពិន្ទុ): a class's monthly or semester score sheet in the ministry layout.
 * Same subjects, months and scores as Academic Transcripts (one source of truth).
 *   Monthly:  subject scores, total, average (total / coefficients), rank, grade (KH + EN), notes.
 *   Semester: semester exam scores, total, exam average, monthly average (of the semester's months),
 *             semester average = (monthly + exam) / 2, rank and grade.
 * Below the table: the list summary; a second page with grade statistics per subject and student movement.
 * Plugin API: transcripts/sheets, transcripts/score-sheet, transcripts/tabs/:id/scores,
 * transcripts/sheets/:id/tabs, transcripts/score-sheet-print-template, classes. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var M = window.WattanamScoreMath;
  var KH_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
  var DEFAULT_FORM = { title: 'តារាងសម្រង់ពិន្ទុប្រចាំ', orgName: '', headerLines: ['មន្ទីរ អ.យ.ក. ខេត្ត៖', 'ការិ.អ.យ.ក.ស្រុក៖'], signers: ['នាយកសាលា', 'គ្រូទទួលបន្ទុកថ្នាក់'], paper: 'A4', orientation: 'landscape', footerText: '', mottoLines: ['ព្រះរាជាណាចក្រកម្ពុជា', 'ជាតិ សាសនា ព្រះមហាក្សត្រ'], titles: {}, styles: {}, ornament: '❧❧❧' };
  var SAVE_DELAY = 1200;

  var state = {
    sheets: [], classes: [], sheetId: '', classId: '', kind: 'MONTHLY', tabId: '', sort: 'number', editing: false, view: 'sheet',
    data: null, scores: {}, form: copy(DEFAULT_FORM), dirty: {}, timer: null, lunar: '', date: '', headerEditing: false, formBeforeEdit: null, styleTarget: null, cardStudent: null, rankScope: 'period',
  };
  var loadToken = 0;

  // ---------- helpers ----------
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function $(id) { return document.getElementById(id); }
  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) {
      var value = attributes[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key === 'onclick') node.addEventListener('click', value);
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    (children || []).forEach(function (child) { if (child !== null && child !== undefined) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function rows(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  var savedTimer = null;
  function saved(text, bad) {
    var node = $('saved'); node.textContent = text; node.hidden = false; node.classList.toggle('bad', Boolean(bad));
    clearTimeout(savedTimer); savedTimer = setTimeout(function () { node.hidden = true; }, bad ? 6000 : 2000);
  }
  function khDigits(value) { return String(value).replace(/[0-9]/g, function (d) { return '០១២៣៤៥៦៧៨៩'[Number(d)]; }); }
  function fmt(value) { return value === null || value === undefined ? '' : Number.isInteger(Number(value)) ? String(value) : Number(value).toFixed(2); }
  function avg(value) { return value === null || value === undefined ? '' : Number(value).toFixed(2); }
  function pct(n, base) { return base > 0 ? ((n / base) * 100).toFixed(2) + '%' : '0.00%'; }
  function sexMark(sex) { return sex === 'FEMALE' ? 'ស' : sex === 'MALE' ? 'ប' : ''; }
  function displayName(student) { return student.nameKh || student.name || ''; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ---------- selection ----------
  function activeSheet() { return state.sheets.filter(function (s) { return s.id === state.sheetId; })[0] || null; }
  function className(id) { var c = state.classes.filter(function (item) { return item.id === id; })[0]; return c ? c.name : ''; }
  // Monthly sheets list monthly (and quarterly) tabs; semester sheets list semester tabs.
  function tabsOfKind(sheet) {
    return ((sheet && sheet.tabs) || []).filter(function (t) { return state.kind === 'SEMESTER' ? t.type === 'SEMESTER' : t.type !== 'SEMESTER'; });
  }
  function pickDefaults() {
    var sheet = activeSheet();
    if (!sheet) { state.classId = ''; state.tabId = ''; return; }
    if (sheet.classIds.indexOf(state.classId) < 0) state.classId = sheet.classIds[0] || '';
    var tabs = tabsOfKind(sheet);
    if (!tabs.some(function (t) { return t.id === state.tabId; })) state.tabId = tabs.length ? tabs[tabs.length - 1].id : '';
  }
  function renderSelectors() {
    var sheetSelect = $('sheet'); sheetSelect.textContent = '';
    if (!state.sheets.length) sheetSelect.appendChild(el('option', { value: '', text: 'No score sheets yet' }));
    state.sheets.forEach(function (sheet) { sheetSelect.appendChild(el('option', { value: sheet.id, text: sheet.name })); });
    sheetSelect.value = state.sheetId;
    var sheet = activeSheet();
    var classSelect = $('class'); classSelect.textContent = '';
    ((sheet && sheet.classIds) || []).forEach(function (id) { classSelect.appendChild(el('option', { value: id, text: className(id) || id })); });
    classSelect.value = state.classId; classSelect.disabled = !sheet;
    var tabSelect = $('tab'); tabSelect.textContent = '';
    tabsOfKind(sheet).forEach(function (tab) { tabSelect.appendChild(el('option', { value: tab.id, text: tab.label })); });
    tabSelect.value = state.tabId; tabSelect.disabled = !sheet;
    $('tab-label').textContent = state.kind === 'SEMESTER' ? 'Semester' : 'Month';
    $('kind-monthly').setAttribute('aria-pressed', String(state.kind === 'MONTHLY'));
    $('kind-semester').setAttribute('aria-pressed', String(state.kind === 'SEMESTER'));
    $('tab-type').value = state.kind;
    $('add-tab').disabled = !sheet;
    $('sort').value = state.sort;
    $('edit-toggle').setAttribute('aria-pressed', String(state.editing));
    $('edit-toggle').textContent = state.editing ? '✓ Done entering' : '✏️ Enter scores';
    $('edit-toggle').hidden = state.view !== 'sheet';
    $('view-sheet').setAttribute('aria-pressed', String(state.view === 'sheet'));
    $('view-ranking').setAttribute('aria-pressed', String(state.view === 'ranking'));
    $('view-honor').setAttribute('aria-pressed', String(state.view === 'honor'));
    $('view-subjects').setAttribute('aria-pressed', String(state.view === 'subjects'));
    $('view-yearcard').setAttribute('aria-pressed', String(state.view === 'yearcard'));
    $('view-recordbook').setAttribute('aria-pressed', String(state.view === 'recordbook'));
    $('card-student-wrap').hidden = state.view !== 'yearcard' && state.view !== 'recordbook';
    // The selected month's (or semester's) dates: absences are counted between them.
    var tabNow = state.data ? state.data.tab : null;
    $('period-wrap').hidden = !tabNow;
    if (tabNow && document.activeElement !== $('period-start') && document.activeElement !== $('period-end')) {
      $('period-start').value = tabNow.periodStart ? String(tabNow.periodStart).slice(0, 10) : '';
      $('period-end').value = tabNow.periodEnd ? String(tabNow.periodEnd).slice(0, 10) : '';
      $('save-period').disabled = true;
    }
    $('rb-parts-wrap').hidden = state.view !== 'recordbook';
    $('rank-scope-wrap').hidden = state.view !== 'ranking' && state.view !== 'honor';
    $('rank-scope').value = state.rankScope;
    var pick = $('card-student'); pick.textContent = '';
    var everyone = state.data ? state.data.students : [];
    pick.appendChild(el('option', { value: '', text: 'All students (' + everyone.length + ')' }));
    everyone.forEach(function (s) { pick.appendChild(el('option', { value: s.id, text: (s.studentNumber ? s.studentNumber + ' · ' : '') + displayName(s) })); });
    pick.value = state.cardStudent || '';
    var ready = Boolean(state.data && state.data.students.length && state.data.subjects.length);
    $('print').disabled = !ready; $('export').disabled = !ready; $('edit-toggle').disabled = !ready; $('edit-header').disabled = !ready;
  }

  // ---------- figures ----------
  function model() {
    var data = state.data;
    return M.model(data ? data.subjects : [], data ? { coefficient: data.sheet.coefficient, averageMax: data.sheet.averageMax, grades: data.sheet.gradeScale } : null);
  }

  // ---------- មេគុណ: the class's divisor and the full average (editable, saved for the score sheet) ----------
  function fillAveraging() {
    var data = state.data, m = model();
    $('avg-coefficient').value = data.sheet.coefficient === null || data.sheet.coefficient === undefined ? '' : String(data.sheet.coefficient);
    $('avg-max').value = data.sheet.averageMax === null || data.sheet.averageMax === undefined ? '' : String(data.sheet.averageMax);
    $('avg-coefficient').placeholder = 'Auto: ' + fmt(M.round2(m.autoCoefficient));
    $('avg-max').placeholder = 'Auto: ' + fmt(M.round2(m.autoAverageMax));
    $('avg-hint').textContent = 'មធ្យមភាគ = ពិន្ទុសរុប ÷ ' + fmt(M.round2(m.sumCoefficient)) + ' · grades out of ' + fmt(M.round2(m.maxAverage)) +
      ' (A ≥ ' + fmt(M.round2(m.maxAverage * 0.9)) + ', E ≥ ' + fmt(M.round2(m.maxAverage * 0.5)) + '). Empty = automatic (sum of the subjects\' coefficients).';
  }
  function readAveraging() {
    var value = function (id) { var raw = $(id).value.trim().replace(',', '.'); return raw === '' ? null : Number(raw); };
    var coefficient = value('avg-coefficient'), averageMax = value('avg-max');
    var bad = (coefficient !== null && !(coefficient > 0 && coefficient <= 100)) || (averageMax !== null && !(averageMax > 0 && averageMax <= 1000));
    $('avg-coefficient').classList.toggle('invalid', coefficient !== null && !(coefficient > 0 && coefficient <= 100));
    $('avg-max').classList.toggle('invalid', averageMax !== null && !(averageMax > 0 && averageMax <= 1000));
    return bad ? null : { coefficient: coefficient, averageMax: averageMax };
  }
  // ---------- the grade scale (six grades: letter, Khmer name, from which average) ----------
  // Minimums are kept as percentages of the full average; they are typed as averages (A from 45 out of 50).
  function fillGrades() {
    var m = model(), host = $('grades-rows'); host.textContent = '';
    var full = m.maxAverage;
    $('grades-help').textContent = 'Each grade starts at an average out of ' + fmt(M.round2(full)) + '. The last grade is everything below the one above it (below the pass mark). Each subject is graded with the same percentages of its own maximum.';
    $('grades-from').textContent = 'From average (out of ' + fmt(M.round2(full)) + ')';
    m.grades.forEach(function (g, i) {
      var last = i === m.grades.length - 1;
      var letter = el('input', { class: 'letter', maxlength: '3', 'aria-label': 'Grade ' + (i + 1) + ' letter', 'data-grade': String(i), 'data-field': 'letter' }); letter.value = g.letter;
      var kh = el('input', { maxlength: '40', 'aria-label': 'Grade ' + (i + 1) + ' Khmer name', 'data-grade': String(i), 'data-field': 'kh' }); kh.value = g.kh;
      var from = last ? null : el('input', { class: 'from', type: 'text', inputmode: 'decimal', 'aria-label': 'Grade ' + (i + 1) + ' from average', 'data-grade': String(i), 'data-field': 'from' });
      if (from) from.value = fmt(M.round2(g.min * full / 100));
      host.appendChild(el('tr', {}, [el('td', {}, [letter]), el('td', {}, [kh]),
        last ? el('td', { class: 'below', text: 'below ' + (m.grades[i - 1] ? m.grades[i - 1].letter : '') }) : el('td', {}, [from]),
        el('td', { class: 'pct', 'data-pct': String(i), text: last ? '< ' + fmt(M.round2(m.grades[i - 1].min)) + '%' : fmt(M.round2(g.min)) + '%' })]));
    });
    show('grades-error');
  }
  function readGrades() {
    var full = model().maxAverage, scale = [], error = '';
    for (var i = 0; i < 6; i += 1) {
      var get = function (field) { var n = document.querySelector('#grades-rows [data-grade="' + i + '"][data-field="' + field + '"]'); return n ? n.value.trim() : ''; };
      var letter = get('letter'), kh = get('kh'), fromInput = document.querySelector('#grades-rows [data-grade="' + i + '"][data-field="from"]');
      var min = 0;
      if (fromInput) {
        var points = Number(fromInput.value.replace(',', '.'));
        var bad = fromInput.value.trim() === '' || !isFinite(points) || points < 0 || points > full;
        fromInput.classList.toggle('invalid', bad);
        if (bad && !error) error = (letter || 'Grade ' + (i + 1)) + ': the average must be between 0 and ' + fmt(M.round2(full)) + '.';
        min = full > 0 ? M.round2(points / full * 100) : 0;
        var cell = document.querySelector('#grades-rows [data-pct="' + i + '"]'); if (cell && !bad) cell.textContent = fmt(min) + '%';
      }
      if (!letter && !error) error = 'Every grade needs a letter.';
      scale.push({ letter: letter, kh: kh, min: min });
    }
    for (var j = 0; j < 5 && !error; j += 1) if (!(scale[j].min > scale[j + 1].min)) error = scale[j].letter + ' must start above ' + scale[j + 1].letter + '.';
    var letters = scale.map(function (g) { return g.letter.toUpperCase(); });
    if (!error && letters.some(function (l, k) { return letters.indexOf(l) !== k; })) error = 'Each grade needs its own letter.';
    var below = document.querySelector('#grades-rows [data-pct="5"]'); if (below && !error) below.textContent = '< ' + fmt(scale[4].min) + '%';
    return { scale: scale, error: error };
  }
  function gradesChanged() {
    var read = readGrades();
    show('grades-error', read.error);
    if (read.error || !state.data) return;
    state.data.sheet.gradeScale = read.scale;
    $('grades-save').disabled = false;
    renderCurrent();
  }
  function saveGrades(reset) {
    if (!state.data) return;
    var read = reset ? { scale: null, error: '' } : readGrades();
    if (read.error) { show('grades-error', read.error); return; }
    ui.api.put('transcripts/sheets/' + encodeURIComponent(state.data.sheet.id) + '/grades', { gradeScale: read.scale }).then(function (result) {
      state.data.sheet.gradeScale = result.gradeScale; state.savedGradeScale = result.gradeScale;
      $('grades-save').disabled = true; fillGrades(); renderCurrent(); saved(reset ? '✓ Ministry grade scale restored' : '✓ Grades saved');
    }).catch(function (error) { show('grades-error', error.status === 403 ? 'Only administrators can change the grades; this preview is not saved.' : error.message || 'The grades were not saved.'); });
  }
  function openGrades() {
    if (!state.data) return;
    state.savedGradeScale = state.data.sheet.gradeScale || null;
    $('grades-panel').hidden = false; $('grades-save').disabled = true; fillGrades();
    $('grades-panel').scrollIntoView({ block: 'nearest' });
  }
  // Closing without saving puts the saved scale back.
  function closeGrades() {
    $('grades-panel').hidden = true;
    if (state.data && !$('grades-save').disabled) { state.data.sheet.gradeScale = state.savedGradeScale; renderCurrent(); }
  }

  // Typing previews the sheet at once; Save keeps it for everyone.
  function averagingChanged() {
    var next = readAveraging(); if (!next || !state.data) return;
    state.data.sheet.coefficient = next.coefficient; state.data.sheet.averageMax = next.averageMax;
    $('avg-save').disabled = false;
    renderCurrent();
    var m = model();
    $('avg-hint').textContent = 'មធ្យមភាគ = ពិន្ទុសរុប ÷ ' + fmt(M.round2(m.sumCoefficient)) + ' · grades out of ' + fmt(M.round2(m.maxAverage)) + ' — not saved yet.';
  }
  function saveAveraging() {
    var next = readAveraging(); if (!next || !state.data) { saved('មេគុណ: more than 0 and at most 100', true); return; }
    ui.api.put('transcripts/sheets/' + encodeURIComponent(state.data.sheet.id) + '/averaging', next).then(function (result) {
      state.data.sheet.coefficient = result.coefficient; state.data.sheet.averageMax = result.averageMax;
      $('avg-save').disabled = true; fillAveraging(); renderCurrent(); if (!$('grades-panel').hidden) fillGrades(); saved('✓ មេគុណ saved');
    }).catch(function (error) { saved(error.status === 403 ? 'Only administrators can change the មេគុណ; this preview is not saved.' : error.message || 'The មេគុណ was not saved', true); });
  }
  function scoresOf(tabId, studentId) { return (state.scores[tabId] || {})[studentId] || {}; }
  // As in the ministry sheet: once a student has any score in the semester, a month or exam
  // without scores counts as 0; a student with no scores at all has no semester average.
  function semesterOf(monthAverages, examAverage) {
    var any = examAverage !== null || monthAverages.some(function (v) { return v !== null; });
    if (!any) return M.semester([], null);
    return M.semester(monthAverages.map(function (v) { return v === null ? 0 : v; }), examAverage === null ? 0 : examAverage);
  }
  function compute() {
    var data = state.data, m = model(), semester = data.tab.type === 'SEMESTER';
    var list = data.students.map(function (student) {
      var exam = M.result(m, scoresOf(data.tab.id, student.id));
      var row = { student: student, exam: exam, months: null, sem: null };
      if (semester) {
        var monthAverages = data.months.map(function (month) { return M.result(m, scoresOf(month.id, student.id)).average; });
        row.sem = semesterOf(monthAverages, exam.average);
        row.final = row.sem.average;
        row.hasScores = row.final !== null;
        // The year so far: each earlier semester's average, then the yearly average of all semesters.
        row.semesters = (data.earlierSemesters || []).map(function (s) {
          var months = s.months.map(function (month) { return M.result(m, scoresOf(month.id, student.id)).average; });
          return semesterOf(months, M.result(m, scoresOf(s.id, student.id)).average).average;
        });
        var known = row.semesters.concat([row.final]).filter(function (v) { return v !== null; });
        row.annual = row.semesters.length && known.length ? M.round2(known.reduce(function (a, b) { return a + b; }, 0) / known.length) : null;
      } else {
        row.final = exam.average;
        row.hasScores = exam.hasScores;
      }
      row.grade = row.final === null ? null : m.gradeOf(row.final, m.maxAverage);
      return row;
    });
    var ranks = M.ranks(list.map(function (r) { return { id: r.student.id, value: r.final }; }));
    list.forEach(function (r) { r.rank = ranks[r.student.id] || null; });
    return { model: m, rows: list, semester: semester };
  }
  function ordered(figures) {
    var list = figures.rows.slice();
    if (state.sort === 'name') list.sort(function (a, b) { return displayName(a.student).localeCompare(displayName(b.student), 'km'); });
    else if (state.sort === 'rank') list.sort(function (a, b) { return (a.rank || 1e9) - (b.rank || 1e9) || String(a.student.studentNumber).localeCompare(String(b.student.studentNumber)); });
    return list;
  }

  // ---------- the document ----------
  function titleText() { return (state.form.title || DEFAULT_FORM.title) + ' ' + state.data.tab.label; }
  function infoParts() {
    var data = state.data, female = data.students.filter(function (s) { return s.sex === 'FEMALE'; }).length, male = data.students.filter(function (s) { return s.sex === 'MALE'; }).length;
    return [
      'ថ្នាក់ទី: ' + data.className,
      data.tab.label,
      data.studyYear ? 'ឆ្នាំសិក្សា ' + data.studyYear : '',
      'សិស្សសរុប ' + data.students.length + ' នាក់',
      'ប្រុស ' + male + ' នាក់',
      'ស្រី ' + female + ' នាក់',
    ].filter(Boolean);
  }
  // ---------- the header: office lines + school (left), motto (right), title — all editable on the page ----------
  var MOTTO = ['ព្រះរាជាណាចក្រកម្ពុជា', 'ជាតិ សាសនា ព្រះមហាក្សត្រ'];
  var TITLE_DEFAULTS = { ranking: 'ចំណាត់ថ្នាក់ប្រចាំ', honor: 'តារាងកិត្តិយសប្រចាំ', subjects: 'តារាងស្រង់ពិន្ទុប្រឡង', subjectsMonthly: 'តារាងចំណាត់ថ្នាក់តាមមុខវិជ្ជា', yearcard: 'ព្រឹត្តិបត្រពិន្ទុប្រចាំឆ្នាំសិក្សា', yearParents: 'មាតាបិតាឬអាណាព្យាបាល', recordbook: 'សៀវភៅសិក្ខាគារិក', rbMinistry: 'ក្រសួងអប់រំ យុវជន និង កីឡា', rbLevel: 'មធ្យមសិក្សាចំណេះទូទៅ', rbGuidance: 'សេចក្តីណែនាំ' };
  function titleOf(key) {
    if (key === 'sheet') return state.form.title || DEFAULT_FORM.title;
    return (state.form.titles && state.form.titles[key]) || TITLE_DEFAULTS[key];
  }
  // The school on the documents: the print form's own name, else the academic year's (Academic Years).
  function yearSchool() { return (state.data && state.data.school) || {}; }
  function schoolName() { return state.form.orgName || yearSchool().name || ''; }
  function yearLogo() { var logo = yearSchool().logoUrl || ''; return /^data:image\//.test(logo) ? logo : ''; }
  // Marks a header region; while the header is being edited it becomes editable text on the page.
  function editable(node, field, multiLine) {
    node.setAttribute('data-edit', field);
    if (multiLine) node.setAttribute('data-multi', '');
    var block = blockOf(field);
    node.setAttribute('data-block', block);
    if (block !== 'title') styled(node, block);
    if (state.headerEditing) { node.setAttribute('contenteditable', 'true'); node.setAttribute('spellcheck', 'false'); node.classList.add('editable'); }
    if (state.headerEditing && state.styleTarget === block) node.classList.add('style-selected');
    return node;
  }

  // ---------- formatting of the header and footer blocks ----------
  var BLOCK_NAMES = { offices: 'Office lines', school: 'School name', motto: 'Motto', ornament: 'Symbol under the motto', title: 'Title', info: 'Class line', dates: 'Dates', approval: 'Approval line', roles: 'Signer roles', names: 'Signer names' };
  // Fonts installed with Windows and the usual Khmer font packs (the page cannot download fonts).
  var FONTS = ['Khmer OS Battambang', 'Khmer OS Siemreap', 'Khmer OS Muol Light', 'Khmer OS Muol', 'Khmer OS Content', 'Khmer OS System', 'Khmer OS Bokor', 'Khmer UI', 'Leelawadee UI', 'Noto Sans Khmer', 'Noto Serif Khmer', 'Hanuman', 'Moul', 'Battambang', 'Siemreap', 'Times New Roman', 'Arial', 'Calibri', 'Tahoma'];
  function blockOf(field) {
    if (field === 'headerLines') return 'offices';
    if (field === 'orgName') return 'school';
    if (field === 'mottoLines') return 'motto';
    if (field.indexOf('title:') === 0) return 'title';
    if (field === 'lunarLine' || field === 'dateLine') return 'dates';
    if (field === 'approvalText') return 'approval';
    if (field.indexOf('signerName:') === 0) return 'names';
    if (field.indexOf('signer:') === 0) return 'roles';
    return field;
  }
  function styleOf(block) { return (state.form.styles && state.form.styles[block]) || {}; }
  function applyStyle(node) {
    var s = styleOf(node.getAttribute('data-style-key'));
    var flex = node.classList.contains('doc-info');
    node.style.textAlign = flex ? '' : s.align || '';
    if (flex) node.style.justifyContent = s.align === 'left' ? 'flex-start' : s.align === 'right' ? 'flex-end' : s.align === 'center' ? 'center' : '';
    node.style.fontFamily = s.font ? '"' + s.font + '", var(--khmer)' : '';
    node.style.fontSize = s.size ? s.size + 'pt' : '';
    node.style.color = s.color || '';
    node.style.fontWeight = s.bold === true ? '700' : s.bold === false ? '400' : '';
  }
  function styled(node, block) { node.setAttribute('data-style-key', block); applyStyle(node); return node; }
  function restyle(block) { Array.prototype.forEach.call(document.querySelectorAll('[data-style-key="' + block + '"]'), applyStyle); }
  // The class line under the title can be formatted (not edited: it comes from the class).
  function styleInfo(node) {
    styled(node, 'info'); node.setAttribute('data-block', 'info');
    node.classList.toggle('stylable', Boolean(state.headerEditing));
    node.classList.toggle('style-selected', Boolean(state.headerEditing && state.styleTarget === 'info'));
    return node;
  }
  function selectBlock(block) {
    state.styleTarget = block;
    Array.prototype.forEach.call(document.querySelectorAll('[data-block]'), function (n) { n.classList.toggle('style-selected', n.getAttribute('data-block') === block); });
    fillStyleBar();
  }
  function fillStyleBar() {
    var block = state.styleTarget, s = block ? styleOf(block) : {};
    $('style-target').textContent = block ? 'Formatting: ' + BLOCK_NAMES[block] : 'Click a box on the page to format it';
    Array.prototype.forEach.call(document.querySelectorAll('#style-bar [data-control]'), function (control) { control.disabled = !block; });
    Array.prototype.forEach.call(document.querySelectorAll('#style-bar [data-align]'), function (b) { b.setAttribute('aria-pressed', String(Boolean(block) && (s.align || '') === b.getAttribute('data-align'))); });
    $('style-font').value = s.font || '';
    $('style-size').value = s.size ? String(s.size) : '';
    $('style-color').value = s.color || '#000000';
    $('style-bold').setAttribute('aria-pressed', String(s.bold === true));
    $('symbol-picker').hidden = block !== 'ornament';
  }
  function changeStyle(change) {
    var block = state.styleTarget; if (!block) return;
    var styles = Object.assign({}, state.form.styles || {});
    var s = Object.assign({}, styles[block] || {});
    change(s);
    Object.keys(s).forEach(function (k) { if (s[k] === '' || s[k] === null || s[k] === undefined) delete s[k]; });
    if (Object.keys(s).length) styles[block] = s; else delete styles[block];
    state.form.styles = styles;
    restyle(block); fillStyleBar();
  }
  function fillLetterhead(key) {
    var form = state.form, offices = $(key + '-offices'); offices.textContent = '';
    if (yearLogo()) offices.appendChild(el('img', { class: 'doc-logo', src: yearLogo(), alt: '' }));
    var lines = el('div', { class: 'office-lines', 'data-placeholder': 'Office lines' });
    (form.headerLines || []).forEach(function (line) { lines.appendChild(el('p', { text: line })); });
    offices.appendChild(editable(lines, 'headerLines', true));
    if (schoolName() || state.headerEditing) offices.appendChild(editable(el('p', { class: 'school', 'data-placeholder': 'School name', text: schoolName() }), 'orgName'));
    var motto = $(key + '-motto'); motto.textContent = '';
    var mottoLines = el('div', { class: 'motto-lines', 'data-placeholder': 'Motto' });
    (form.mottoLines || MOTTO).forEach(function (line) { mottoLines.appendChild(el('p', { text: line })); });
    motto.appendChild(editable(mottoLines, 'mottoLines', true));
    // The symbol under the motto: editable like the rest (empty = no symbol).
    var ornament = form.ornament === undefined || form.ornament === null ? '❧❧❧' : form.ornament;
    if (ornament || state.headerEditing) motto.appendChild(editable(el('p', { class: 'ornament', 'data-placeholder': 'Symbol (optional)', text: ornament }), 'ornament'));
  }
  function setTitle(id, key, label) {
    var host = $(id); host.textContent = '';
    styled(host, 'title');
    host.appendChild(editable(el('span', { class: 'title-prefix', 'data-placeholder': 'Title', text: titleOf(key) }), 'title:' + key));
    host.appendChild(document.createTextNode(' ' + label));
  }
  // What was typed goes straight into the print form, so a redraw keeps it.
  function readEditable(node) {
    var field = node.getAttribute('data-edit');
    // Spaces are kept as typed (they nudge text into place); a line of only spaces is empty.
    var clean = function (s) { return s.replace(/\u00a0/g, ' ').replace(/[\r\n\t]+/g, ' '); };
    var value = node.hasAttribute('data-multi')
      ? node.innerText.split(/\r?\n/).map(clean).filter(function (line) { return line.trim(); })
      : clean(node.textContent);
    if (!node.hasAttribute('data-multi') && !value.trim()) value = '';
    if (field === 'orgName' && value.trim() === String(yearSchool().name || '').trim()) value = '';
    if (field.indexOf('signer:') === 0 || field.indexOf('signerName:') === 0) {
      var list = field.indexOf('signer:') === 0 ? 'signers' : 'signerNames', at = Number(field.split(':')[1]);
      var items = (state.form[list] && state.form[list].length ? state.form[list] : list === 'signers' ? DEFAULT_FORM.signers : []).slice();
      while (items.length <= at) items.push('');
      items[at] = value;
      state.form[list] = items;
      return;
    }
    if (field.indexOf('title:') === 0) {
      var key = field.slice(6);
      if (key === 'sheet') state.form.title = value;
      else { state.form.titles = Object.assign({}, state.form.titles || {}); state.form.titles[key] = value; }
    } else state.form[field] = value;
  }
  function setHeaderEditing(on) {
    if (on) state.formBeforeEdit = copy(state.form);
    if (!on) state.styleTarget = null;
    state.headerEditing = on;
    $('header-bar').hidden = !on;
    if (on) fillStyleBar();
    $('edit-header').setAttribute('aria-pressed', String(on));
    var headerLabel = $('edit-header').querySelector('b');
    if (headerLabel) headerLabel.textContent = on ? 'Editing header & footer…' : 'Edit header & footer'; else $('edit-header').textContent = on ? '🖋️ Editing…' : '🖋️ Edit header & footer';
    if (state.data && !emptyText()) renderCurrent();
    if (on) { var first = document.querySelector('.doc:not([hidden]) .title-prefix'); if (first) first.focus(); }
  }
  function saveHeader() {
    ui.api.put(ENTRY ? 'transcripts/entry/print-template' : 'transcripts/score-sheet-print-template', state.form).then(function (form) {
      state.form = Object.assign(copy(DEFAULT_FORM), form || {});
      setHeaderEditing(false); saved('✓ Header and footer saved');
    }).catch(function (error) {
      saved(error.status === 403 ? (ENTRY ? 'Saving the header needs "Edit the score sheets\' header & footer" (ask your administrator on Roles & access)' : 'Only administrators can save the header') + '; your changes show until you leave this page.' : error.message || 'The header was not saved', true);
    });
  }
  function cancelHeader() { if (state.formBeforeEdit) state.form = state.formBeforeEdit; setHeaderEditing(false); }
  function renderDocument() {
    var data = state.data, figures = compute(), m = figures.model;
    fillLetterhead('d');
    setTitle('d-title', 'sheet', data.tab.label);
    var info = styleInfo($('d-info')); info.textContent = '';
    infoParts().forEach(function (part) { info.appendChild(el('span', { text: part })); });
    info.appendChild(el('span', { text: 'មេគុណ ' + fmt(M.round2(m.sumCoefficient)) }));
    // Per-subject coefficients only matter while the class មេគុណ is automatic.
    var perSubject = data.sheet.coefficient === null || data.sheet.coefficient === undefined;

    // Table head: names, then one vertical column per subject (parts before their subject), then results.
    var table = $('d-table'); table.textContent = '';
    var tail = figures.semester
      ? ['ពិន្ទុសរុប', 'មធ្យមភាគប្រឡង', 'មធ្យមភាគប្រចាំខែ', 'មធ្យមភាគឆមាស', 'ចំណាត់ថ្នាក់', 'និទ្ទេស', 'និទ្ទេស(EN)', 'ផ្សេងៗ']
      : ['ពិន្ទុសរុប', 'មធ្យមភាគ', 'ចំណាត់ថ្នាក់', 'និទ្ទេស', 'និទ្ទេស(EN)', 'ផ្សេងៗ'];
    var head1 = [el('th', { text: 'ល.រ' }), el('th', { text: 'គោត្តនាម និងនាម' }), el('th', { text: 'ភេទ' })];
    m.columns.forEach(function (subject) {
      head1.push(el('th', { class: 'vertical' + (m.isPart(subject) ? ' part' : ''), title: subject.name }, [el('span', { text: subject.name })]));
    });
    tail.forEach(function (label) { head1.push(el('th', { rowspan: perSubject ? '3' : '2', class: label === 'ផ្សេងៗ' ? '' : 'vertical' }, [el('span', { text: label })])); });
    var head2 = [el('th', { colspan: '3', text: 'ពិន្ទុអតិបរមា' })], head3 = [el('th', { colspan: '3', text: 'មេគុណ' })];
    m.columns.forEach(function (subject) {
      head2.push(el('th', { text: fmt(subject.maxScore) }));
      head3.push(el('th', { text: m.isPart(subject) ? '—' : fmt(subject.coefficient === undefined ? 1 : subject.coefficient) }));
    });
    table.appendChild(el('thead', {}, [el('tr', {}, head1), el('tr', { class: 'meta' }, head2), perSubject ? el('tr', { class: 'meta' }, head3) : null]));

    var remarks = {}; (data.remarks || []).forEach(function (r) { remarks[r.studentId] = r; });
    var body = el('tbody');
    ordered(figures).forEach(function (row, index) {
      var student = row.student;
      var cells = [el('td', { text: String(index + 1) }), el('td', { class: 'name', text: displayName(student) }), el('td', { text: sexMark(student.sex) })];
      m.columns.forEach(function (subject) {
        var computed = m.isComputed(subject), value = row.exam.scores[subject.id];
        if (state.editing && !computed) {
          var input = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': subject.name + ' — ' + displayName(student), 'data-row': String(index), 'data-col': subject.id });
          input.value = value === null || value === undefined ? '' : String(value);
          input.addEventListener('input', function () { scoreChanged(student.id, subject, input); });
          input.addEventListener('keydown', moveFocus);
          cells.push(el('td', {}, [input]));
        } else {
          cells.push(el('td', { class: 'num' + (computed ? ' computed' : ''), 'data-cell': student.id + ':' + subject.id, text: fmt(value) }));
        }
      });
      var gradeClass = M.gradeClass(row.grade);
      cells.push(el('td', { class: 'num', 'data-f': 'total:' + student.id, text: fmt(row.exam.total) }));
      if (figures.semester) {
        cells.push(el('td', { class: 'num', 'data-f': 'exam:' + student.id, text: avg(row.sem.exam) }));
        cells.push(el('td', { class: 'num', 'data-f': 'monthly:' + student.id, text: avg(row.sem.monthly) }));
      }
      cells.push(el('td', { class: 'num avg', 'data-f': 'final:' + student.id, text: avg(row.final) }));
      cells.push(el('td', { class: 'num', 'data-f': 'rank:' + student.id, text: row.rank ? String(row.rank) : '' }));
      cells.push(el('td', { class: gradeClass, 'data-f': 'kh:' + student.id, text: row.grade ? row.grade.kh : '' }));
      cells.push(el('td', { class: gradeClass, 'data-f': 'en:' + student.id, text: row.grade ? row.grade.letter : '' }));
      if (state.editing) {
        var mine = remarks[student.id] || {};
        var conduct = el('input', { type: 'text', class: 'remark', placeholder: 'សីលធម៌ / Conduct', 'aria-label': 'Conduct — ' + displayName(student), maxlength: '120' }); conduct.value = mine.conduct || '';
        var comment = el('input', { type: 'text', class: 'remark', placeholder: 'មតិ / Comment', 'aria-label': 'Comment — ' + displayName(student), maxlength: '1000' }); comment.value = mine.comment || '';
        conduct.addEventListener('input', function () { remarkChanged(student.id, 'conduct', conduct.value); });
        comment.addEventListener('input', function () { remarkChanged(student.id, 'comment', comment.value); });
        cells.push(el('td', { class: 'remarks-cell' }, [conduct, comment]));
      } else cells.push(el('td', { text: (remarks[student.id] && remarks[student.id].comment) || '' }));
      body.appendChild(el('tr', { class: row.hasScores ? '' : 'no-scores', 'data-student': student.id }, cells));
    });
    table.appendChild(body);
    renderSummary(figures, 'd-summary');
    renderSigns('d-signs');
    renderStats(figures);
  }

  // ---------- student ranking (ចំណាត់ថ្នាក់) ----------
  var RANK_HEAD = ['ល.រ', 'អ.ល', 'គោត្តនាម និង នាម', 'ភេទ', 'ព.សរុប', 'ម.ភាគ', 'ចំ.ថ្នាក់', 'និទ្ទេស'];
  function rankingCells(row, index) {
    return [String(index + 1), row.student.studentNumber || '', displayName(row.student), sexMark(row.student.sex), fmt(row.exam.total), avg(row.final), row.rank ? String(row.rank) : '', row.grade ? row.grade.letter : ''];
  }
  // The year: each semester's average, the year's average (their mean), the rank and grade of the year.
  function yearRankingRows() {
    var d = state.data, y = yearFigures(), m = y.model;
    var rows = d.students.map(function (s) {
      var mine = y.per[s.id], grade = mine.annual === null ? null : m.gradeOf(mine.annual, m.maxAverage);
      return { student: s, sems: mine.sems.map(function (x) { return x.figures.average; }), final: mine.annual, rank: y.ranks.year.annual[s.id] || null, grade: grade, hasScores: mine.annual !== null };
    });
    return { model: m, rows: rows, semesters: y.semesters };
  }
  function yearRankingHead(year) { return ['ល.រ', 'គោត្តនាម និង នាម', 'ភេទ'].concat(year.semesters.map(function (s, i) { return 'ម.ឆ' + khDigits(i + 1); })).concat(['ម.ឆ្នាំ', 'ចំ.ថ្នាក់', 'និទ្ទេស']); }
  function yearRankingCells(row, index) {
    return [String(index + 1), displayName(row.student), sexMark(row.student.sex)].concat(row.sems.map(avg)).concat([avg(row.final), row.rank ? String(row.rank) : '', row.grade ? row.grade.letter : '']);
  }
  function yearScope() { return state.rankScope === 'year' && state.data && state.data.tab.type === 'SEMESTER'; }
  function renderRanking() {
    if (yearScope()) { renderYearRanking(); return; }
    var data = state.data, figures = compute();
    fillLetterhead('r');
    setTitle('r-title', 'ranking', data.tab.label);
    var info = styleInfo($('r-info')); info.textContent = '';
    infoParts().filter(function (part) { return part !== data.tab.label; }).forEach(function (part) { info.appendChild(el('span', { text: part })); });
    // The class list in two columns, numbered down the first column then the second (as printed).
    var list = ordered(figures), half = Math.ceil(list.length / 2), host = $('r-cols'); host.textContent = '';
    [list.slice(0, half), list.slice(half)].forEach(function (part, column) {
      var body = el('tbody');
      part.forEach(function (row, i) {
        var cells = rankingCells(row, column * half + i);
        body.appendChild(el('tr', { class: !row.hasScores ? 'no-scores' : row.rank && row.rank <= 3 ? 'rank-top' : '', 'data-rank-student': row.student.id }, cells.map(function (text, c) {
          var cls = c === 2 ? 'name' : c === 5 ? 'avg' : c === 7 ? M.gradeClass(row.grade) : '';
          return el('td', { class: cls, text: text });
        })));
      });
      host.appendChild(el('table', { class: 'rank' }, [el('thead', {}, [el('tr', {}, RANK_HEAD.map(function (h) { return el('th', { text: h }); }))]), body]));
    });
    renderSummary(figures, 'r-summary');
    renderSigns('r-signs');
  }
  function renderYearRanking() {
    var data = state.data, year = yearRankingRows(), head = yearRankingHead(year), n = head.length;
    fillLetterhead('r');
    setTitle('r-title', 'ranking', 'ឆ្នាំសិក្សា');
    var info = styleInfo($('r-info')); info.textContent = '';
    ['ថ្នាក់ទី: ' + data.className, data.studyYear ? 'ឆ្នាំសិក្សា' + data.studyYear : ''].filter(Boolean).forEach(function (part) { info.appendChild(el('span', { text: part })); });
    var list = ordered(year), half = Math.ceil(list.length / 2), host = $('r-cols'); host.textContent = '';
    [list.slice(0, half), list.slice(half)].forEach(function (part, column) {
      var body = el('tbody');
      part.forEach(function (row, i) {
        var cells = yearRankingCells(row, column * half + i);
        body.appendChild(el('tr', { class: !row.hasScores ? 'no-scores' : row.rank && row.rank <= 3 ? 'rank-top' : '', 'data-rank-student': row.student.id }, cells.map(function (text, c) {
          var cls = c === 1 ? 'name' : c === n - 3 ? 'avg' : c === n - 1 ? M.gradeClass(row.grade) : '';
          return el('td', { class: cls, text: text });
        })));
      });
      host.appendChild(el('table', { class: 'rank' }, [el('thead', {}, [el('tr', {}, head.map(function (h) { return el('th', { text: h }); }))]), body]));
    });
    // The year's summary: promoted (ឡើងថ្នាក់), repeating (ត្រួតថ្នាក់), dropped out (no scores).
    renderSummary(year, 'r-summary', { total: 'សិស្សសរុប :', pass: 'សិស្សឡើងថ្នាក់ :', below: 'សិស្សត្រួតថ្នាក់ :', none: 'សិស្សបោះបង់ :' });
    renderSigns('r-signs');
  }
  // ---------- honor roll (តារាងកិត្តិយស) ----------
  var HONOR_PLACES = 5;
  // The top five by rank; a tie for a place keeps everyone who shares it.
  function honorees(figures) {
    return figures.rows.filter(function (r) { return r.rank && r.rank <= HONOR_PLACES; })
      .sort(function (a, b) { return a.rank - b.rank || String(a.student.studentNumber).localeCompare(String(b.student.studentNumber)); });
  }
  function honoree(row, first) {
    var student = row.student, medal = row.rank === 1 ? ' gold' : row.rank === 2 ? ' silver' : row.rank === 3 ? ' bronze' : '';
    var frame = el('div', { class: 'frame' });
    var letter = document.createTextNode(displayName(student).charAt(0));
    if (student.photo) {
      var image = el('img', { alt: '' });
      image.onerror = function () { frame.textContent = ''; frame.appendChild(letter); };
      image.setAttribute('src', student.photo);
      frame.appendChild(image);
    } else frame.appendChild(letter);
    return el('div', { class: 'honoree' + (first ? ' first' : '') + medal, 'data-honor-student': student.id }, [
      frame,
      el('p', { class: 'place', text: 'លេខ ' + khDigits(row.rank) }),
      el('p', { class: 'who', text: displayName(student) }),
      el('p', { class: 'figures', text: 'អ.ល ' + (student.studentNumber || '—') + ' · ' + (yearScope() ? 'មធ្យមភាគប្រចាំឆ្នាំ ' : 'មធ្យមភាគ ') + avg(row.final) + ' · និទ្ទេស ' + (row.grade ? row.grade.letter : '') }),
    ]);
  }
  function renderHonor() {
    var data = state.data, year = yearScope(), figures = year ? yearRankingRows() : compute(), list = honorees(figures);
    fillLetterhead('h');
    setTitle('h-title', 'honor', year ? 'ឆ្នាំសិក្សា' : data.tab.label);
    var info = styleInfo($('h-info')); info.textContent = '';
    ['ថ្នាក់ទី: ' + data.className, data.studyYear ? 'ឆ្នាំសិក្សា' + data.studyYear : ''].filter(Boolean).forEach(function (part) { info.appendChild(el('span', { text: part })); });
    var host = $('h-podium'); host.textContent = '';
    if (!list.length) { host.appendChild(el('p', { class: 'none', text: 'No ranked students yet — enter scores first.' })); }
    // លេខ ១ alone in the middle, then the rest two by two (2 · 3, 4 · 5).
    list.forEach(function (row, index) { host.appendChild(honoree(row, index === 0)); });
    renderSigns('h-signs');
  }

  // ---------- subject ranking (ចំណាត់ថ្នាក់តាមមុខវិជ្ជា) ----------
  // Every subject's score with the student's rank in that subject, then the averages with their ranks;
  // on a semester with earlier semesters, the year's results follow.
  function subjectRanking(figures) {
    var m = figures.model, data = state.data, rows = figures.rows;
    var rankBy = function (value) { return M.ranks(rows.map(function (r) { return { id: r.student.id, value: value(r) }; })); };
    var subjectRanks = {};
    m.columns.forEach(function (s) { subjectRanks[s.id] = rankBy(function (r) { return r.exam.scores[s.id]; }); });
    var results = figures.semester
      ? [{ label: 'ម.ភាគប្រឡងឆមាស', value: function (r) { return r.sem.exam; } }, { label: 'មធ្យមភាគប្រចាំខែ', value: function (r) { return r.sem.monthly; } }, { label: 'ម.ភាគប្រចាំឆមាស', value: function (r) { return r.final; } }]
      : [{ label: 'មធ្យមភាគ', value: function (r) { return r.final; } }];
    results.forEach(function (c) { c.ranks = rankBy(c.value); });
    var yearly = [];
    if (figures.semester && (data.earlierSemesters || []).length) {
      data.earlierSemesters.forEach(function (s, i) { yearly.push({ label: 'មភ.ប្រចាំ' + s.label, value: function (r) { return r.semesters[i]; } }); });
      yearly.push({ label: 'មភ.ប្រចាំ' + data.tab.label, value: function (r) { return r.final; } });
      yearly.push({ label: 'មធ្យមភាគប្រចាំឆ្នាំ', value: function (r) { return r.annual; }, annual: true });
      yearly.forEach(function (c) { c.ranks = rankBy(c.value); });
    }
    return { subjectRanks: subjectRanks, results: results, yearly: yearly };
  }
  function renderSubjects() {
    var data = state.data, figures = compute(), m = figures.model, sr = subjectRanking(figures);
    fillLetterhead('sr');
    setTitle('sr-title', figures.semester ? 'subjects' : 'subjectsMonthly', data.tab.label);
    var info = styleInfo($('sr-info')); info.textContent = '';
    infoParts().forEach(function (part) { info.appendChild(el('span', { text: part })); });
    info.appendChild(el('span', { text: 'មេគុណ ' + fmt(M.round2(m.sumCoefficient)) }));
    var table = $('sr-table'); table.textContent = '';
    var head1 = [el('th', { rowspan: '2', text: 'ល.រ' }), el('th', { rowspan: '2', text: 'គោត្តនាម និងនាម' }), el('th', { rowspan: '2', text: 'ភេទ' }),
      el('th', { colspan: String(m.columns.length * 2), text: (figures.semester ? 'ពិន្ទុប្រឡង' : 'ពិន្ទុប្រចាំ') + data.tab.label }),
      el('th', { colspan: String(sr.results.length * 2 + 1), text: 'លទ្ធផលប្រចាំ' + data.tab.label })];
    if (sr.yearly.length) head1.push(el('th', { colspan: String(sr.yearly.length * 2 + 1), text: 'លទ្ធផលប្រចាំឆ្នាំសិក្សា' }));
    var head2 = [];
    var pair = function (label, part) { head2.push(el('th', { class: 'vertical' + (part ? ' part' : '') }, [el('span', { text: label })]), el('th', { class: 'vertical rank-col' }, [el('span', { text: 'ចំណាត់ថ្នាក់' })])); };
    m.columns.forEach(function (s) { pair(s.name, m.isPart(s)); });
    sr.results.forEach(function (c) { pair(c.label); });
    head2.push(el('th', { class: 'vertical' }, [el('span', { text: 'និទ្ទេស' })]));
    if (sr.yearly.length) { sr.yearly.forEach(function (c) { pair(c.label); }); head2.push(el('th', { class: 'vertical' }, [el('span', { text: 'និទ្ទេសប្រចាំឆ្នាំ' })])); }
    table.appendChild(el('thead', {}, [el('tr', {}, head1), el('tr', {}, head2)]));
    var body = el('tbody');
    ordered(figures).forEach(function (row, index) {
      var id = row.student.id;
      var cells = [el('td', { text: String(index + 1) }), el('td', { class: 'name', text: displayName(row.student) }), el('td', { text: sexMark(row.student.sex) })];
      var rankCell = function (map) { var r = map[id]; return el('td', { class: 'rank-col' + (r && r <= 3 ? ' podium-rank' : ''), text: r ? String(r) : '' }); };
      m.columns.forEach(function (s) { cells.push(el('td', { class: 'num' + (m.isComputed(s) ? ' computed' : ''), text: fmt(row.exam.scores[s.id]) }), rankCell(sr.subjectRanks[s.id])); });
      sr.results.forEach(function (c) { cells.push(el('td', { class: 'num avg', text: avg(c.value(row)) }), rankCell(c.ranks)); });
      cells.push(el('td', { class: M.gradeClass(row.grade), text: row.grade ? row.grade.letter : '' }));
      if (sr.yearly.length) {
        sr.yearly.forEach(function (c) { cells.push(el('td', { class: 'num avg', text: avg(c.value(row)) }), rankCell(c.ranks)); });
        var yg = row.annual === null ? null : m.gradeOf(row.annual, m.maxAverage);
        cells.push(el('td', { class: M.gradeClass(yg), text: yg ? yg.letter : '' }));
      }
      body.appendChild(el('tr', { class: row.hasScores ? '' : 'no-scores', 'data-sr-student': id }, cells));
    });
    table.appendChild(body);
    renderSummary(figures, 'sr-summary');
    renderSigns('sr-signs');
  }
  function subjectsCsv(figures) {
    var m = figures.model, sr = subjectRanking(figures);
    var head = ['ល.រ', 'គោត្តនាម និងនាម', 'ភេទ'];
    m.columns.forEach(function (s) { head.push(s.name, 'ចំណាត់ថ្នាក់'); });
    sr.results.forEach(function (c) { head.push(c.label, 'ចំណាត់ថ្នាក់'); });
    head.push('និទ្ទេស');
    if (sr.yearly.length) { sr.yearly.forEach(function (c) { head.push(c.label, 'ចំណាត់ថ្នាក់'); }); head.push('និទ្ទេសប្រចាំឆ្នាំ'); }
    return [head].concat(ordered(figures).map(function (row, index) {
      var id = row.student.id, line = [String(index + 1), displayName(row.student), sexMark(row.student.sex)];
      var r = function (map) { return map[id] ? String(map[id]) : ''; };
      m.columns.forEach(function (s) { line.push(fmt(row.exam.scores[s.id]), r(sr.subjectRanks[s.id])); });
      sr.results.forEach(function (c) { line.push(avg(c.value(row)), r(c.ranks)); });
      line.push(row.grade ? row.grade.letter : '');
      if (sr.yearly.length) {
        sr.yearly.forEach(function (c) { line.push(avg(c.value(row)), r(c.ranks)); });
        var yg = row.annual === null ? null : m.gradeOf(row.annual, m.maxAverage); line.push(yg ? yg.letter : '');
      }
      return line;
    }));
  }

  // ---------- academic year report card (ព្រឹត្តិបត្រពិន្ទុប្រចាំឆ្នាំសិក្សា) ----------
  var CARD_DEFAULTS = { conductText: 'គោរពពេលវេលា វិន័យ និង មានសីលធម៌ល្អ', passComment: 'សិស្សបានឡើងថ្នាក់ សូមបន្តការខិតខំប្រឹងប្រែងរៀនសូត្របន្ថែមទៀត។', failComment: 'សិស្សត្រូវរៀនត្រួតថ្នាក់ តែក៏ត្រូវមាតាបិតា ឬអាណាព្យាបាលសិស្ស ជួយណែនាំកូនឱ្យរៀននៅផ្ទះផង។' };
  function mean(values) { var v = values.filter(function (x) { return x !== null && x !== undefined; }); return v.length ? M.round2(v.reduce(function (a, b) { return a + Number(b); }, 0) / v.length) : null; }
  // Every semester of the year up to this one, each student's figures, and the ranks of the class.
  function yearFigures() {
    var d = state.data, figures = compute(), m = figures.model;
    var semesters = (d.earlierSemesters || []).concat([{ id: d.tab.id, label: d.tab.label, months: d.months || [] }]);
    var rankBy = function (value) { return M.ranks(d.students.map(function (s) { return { id: s.id, value: value(s.id) }; })); };
    var per = {};
    d.students.forEach(function (s) {
      var sems = semesters.map(function (sem) {
        var exam = M.result(m, scoresOf(sem.id, s.id));
        var monthly = sem.months.map(function (month) { return M.result(m, scoresOf(month.id, s.id)).average; });
        return { exam: exam, figures: semesterOf(monthly, exam.average) };
      });
      var subjects = {};
      m.columns.forEach(function (sub) { subjects[sub.id] = mean(sems.map(function (x) { return x.exam.scores[sub.id]; })); });
      var total = m.counted.some(function (sub) { return subjects[sub.id] !== null; }) ? M.round2(m.counted.reduce(function (sum, sub) { return sum + (subjects[sub.id] || 0); }, 0)) : null;
      per[s.id] = {
        sems: sems, subjects: subjects, total: total,
        monthly: mean(sems.map(function (x) { return x.figures.monthly; })),
        exam: mean(sems.map(function (x) { return x.figures.exam; })),
        annual: mean(sems.map(function (x) { return x.figures.average; })),
      };
    });
    var ranks = { sem: semesters.map(function (sem, i) {
      var r = { subjects: {} };
      m.columns.forEach(function (sub) { r.subjects[sub.id] = rankBy(function (id) { return per[id].sems[i].exam.scores[sub.id]; }); });
      r.monthly = rankBy(function (id) { return per[id].sems[i].figures.monthly; });
      r.exam = rankBy(function (id) { return per[id].sems[i].figures.exam; });
      r.average = rankBy(function (id) { return per[id].sems[i].figures.average; });
      return r;
    }), year: { subjects: {} } };
    m.columns.forEach(function (sub) { ranks.year.subjects[sub.id] = rankBy(function (id) { return per[id].subjects[sub.id]; }); });
    ranks.year.monthly = rankBy(function (id) { return per[id].monthly; });
    ranks.year.exam = rankBy(function (id) { return per[id].exam; });
    ranks.year.annual = rankBy(function (id) { return per[id].annual; });
    var remarks = {}; (d.remarks || []).forEach(function (r) { remarks[r.studentId] = r; });
    var absences = {}; (d.yearAbsences || []).forEach(function (a) { absences[a.studentId] = a; });
    return { model: m, semesters: semesters, per: per, ranks: ranks, remarks: remarks, absences: absences };
  }
  function cardStudents() {
    var all = state.data ? state.data.students : [];
    if (state.cardStudent === null && all.length) state.cardStudent = all[0].id; // one card on screen; "All" for printing
    return state.cardStudent ? all.filter(function (s) { return s.id === state.cardStudent; }) : all;
  }
  function birthText(value) {
    if (!value) return '';
    var p = String(value).slice(0, 10).split('-');
    return khDigits(Number(p[2])) + ' ' + KH_MONTHS[Number(p[1]) - 1] + ' ' + khDigits(p[0]);
  }
  function cardText(field) { var v = state.form[field]; return v === undefined || v === null || v === '' ? CARD_DEFAULTS[field] : v; }
  function renderYearCards() {
    var host = $('yearcard-docs'); host.textContent = '';
    var d = state.data;
    if (d.tab.type !== 'SEMESTER') { host.appendChild(el('p', { class: 'empty', text: 'Choose the last semester of the year: the report card uses every semester up to it.' })); return; }
    var y = yearFigures(), m = y.model;
    cardStudents().forEach(function (student, index) {
      var key = 'yc' + index, mine = y.per[student.id];
      var page = el('article', { class: 'doc yearcard-page fit-box', 'data-card-student': student.id });
      page.appendChild(el('header', { class: 'letterhead' }, [el('div', { class: 'offices', id: key + '-offices' }), el('div', { class: 'motto', id: key + '-motto' })]));
      page.appendChild(el('h2', { class: 'doc-title', id: key + '-title' }));
      page.appendChild(el('p', { class: 'doc-info', id: key + '-info' }));
      host.appendChild(page);
      fillLetterhead(key);
      setTitle(key + '-title', 'yearcard', '');
      var info = styleInfo($(key + '-info')); info.textContent = '';
      ['ថ្នាក់ទី: ' + d.className, d.studyYear ? 'ឆ្នាំសិក្សា' + d.studyYear : ''].filter(Boolean).forEach(function (part) { info.appendChild(el('span', { text: part })); });
      page.appendChild(el('div', { class: 'card-student' }, [
        el('p', {}, [el('span', { class: 'k', text: 'របស់សិស្សឈ្មោះ ៖ ' }), el('b', { text: (student.studentNumber ? student.studentNumber + '  ' : '') + displayName(student) })]),
        el('p', {}, [el('span', { class: 'k', text: 'ភេទ ៖ ' }), el('b', { text: sexMark(student.sex) })]),
        el('p', {}, [el('span', { class: 'k', text: 'ថ្ងៃខែឆ្នាំកំណើត ៖ ' }), el('b', { text: birthText(student.dateOfBirth) })]),
        el('p', {}, [el('span', { class: 'k', text: 'ថ្នាក់ទី ៖ ' }), el('b', { text: d.className })]),
      ]));
      // the table: subject | each semester (score, rank) | the year (score, rank, grade) | notes
      var table = el('table', { class: 'card-table' });
      var h1 = [el('th', { rowspan: '2', text: 'មុខវិជ្ជា' })], h2 = [];
      y.semesters.forEach(function (sem) { h1.push(el('th', { colspan: '2', text: sem.label })); h2.push(el('th', { text: 'ពិន្ទុ' }), el('th', { text: 'ចំ.ថ្នាក់' })); });
      h1.push(el('th', { colspan: '3', text: 'ប្រចាំឆ្នាំ' }), el('th', { rowspan: '2', text: 'សេចក្តីផ្សេងៗ' }));
      h2.push(el('th', { text: 'ពិន្ទុ' }), el('th', { text: 'ចំ.ថ្នាក់' }), el('th', { text: 'និទ្ទេស' }));
      table.appendChild(el('thead', {}, [el('tr', {}, h1), el('tr', {}, h2)]));
      var body = el('tbody');
      var rank = function (map) { var r = map[student.id]; return r ? String(r) : ''; };
      m.columns.forEach(function (sub) {
        var cells = [el('td', { class: 'subject' + (m.isPart(sub) ? ' part' : ''), text: sub.name })];
        y.semesters.forEach(function (sem, i) { var v = mine.sems[i].exam.scores[sub.id]; cells.push(el('td', { class: 'num', text: fmt(v) }), el('td', { class: 'rk', text: v === null || v === undefined ? '' : rank(y.ranks.sem[i].subjects[sub.id]) })); });
        var yv = mine.subjects[sub.id], g = m.gradeOf(yv, sub.maxScore);
        cells.push(el('td', { class: 'num', text: fmt(yv) }), el('td', { class: 'rk', text: yv === null ? '' : rank(y.ranks.year.subjects[sub.id]) }), el('td', { class: M.gradeClass(g), text: g ? g.letter : '' }), el('td'));
        body.appendChild(el('tr', {}, cells));
      });
      var summary = function (label, semValue, semRanks, yearValue, yearRank, className) {
        var cells = [el('td', { class: 'subject', text: label })];
        y.semesters.forEach(function (sem, i) { var v = semValue(i); cells.push(el('td', { class: 'num', text: v === null || v === undefined ? '' : (className === 'total' ? fmt(v) : avg(v)) }), el('td', { class: 'rk', text: semRanks && v !== null && v !== undefined ? rank(semRanks(i)) : '' })); });
        cells.push(el('td', { class: 'num', text: yearValue === null || yearValue === undefined ? '' : (className === 'total' ? fmt(yearValue) : avg(yearValue)) }), el('td', { class: 'rk', text: yearRank && yearValue !== null && yearValue !== undefined ? rank(yearRank) : '' }), el('td'), el('td'));
        return el('tr', { class: 'sum ' + (className || '') }, cells);
      };
      body.appendChild(summary('សរុបពិន្ទុប្រឡងឆមាស', function (i) { return mine.sems[i].exam.total; }, null, mine.total, null, 'total'));
      body.appendChild(summary('មធ្យមភាគប្រចាំខែ', function (i) { return mine.sems[i].figures.monthly; }, function (i) { return y.ranks.sem[i].monthly; }, mine.monthly, y.ranks.year.monthly));
      body.appendChild(summary('មធ្យមភាគប្រឡងឆមាស', function (i) { return mine.sems[i].figures.exam; }, function (i) { return y.ranks.sem[i].exam; }, mine.exam, y.ranks.year.exam));
      body.appendChild(summary('មធ្យមភាគប្រចាំឆមាស', function (i) { return mine.sems[i].figures.average; }, function (i) { return y.ranks.sem[i].average; }, mine.annual, y.ranks.year.annual));
      table.appendChild(body);
      page.appendChild(el('div', { class: 'table-wrap' }, [table]));
      // result, absences, conduct, comment
      var grade = mine.annual === null ? null : m.gradeOf(mine.annual, m.maxAverage);
      var passed = grade && grade.level !== m.grades.length - 1;
      page.appendChild(el('div', { class: 'card-result' }, [
        el('p', {}, ['មធ្យមភាគ ', el('b', { text: avg(mine.annual) })]),
        el('p', {}, ['ចំណាត់ថ្នាក់ ', el('b', { text: mine.annual === null ? '' : rank(y.ranks.year.annual) })]),
        el('p', {}, ['និទ្ទេស ', el('b', { class: M.gradeClass(grade), text: grade ? grade.letter : '' })]),
        el('p', {}, ['លទ្ធផល ', el('b', { class: passed ? 'pass' : 'fail', text: grade ? (passed ? 'ជាប់' : 'ធ្លាក់') : '' })]),
      ]));
      var abs = y.absences[student.id] || { excused: 0, unexcused: 0 }, known = Boolean(d.absenceRange);
      page.appendChild(el('div', { class: 'card-result absence' }, [
        el('p', {}, [el('b', { text: 'អវត្តមាន' })]),
        el('p', {}, ['មានច្បាប់ ', el('b', { text: known ? khDigits(abs.excused) : '....' }), ' ដង']),
        el('p', {}, ['ឥតច្បាប់ ', el('b', { text: known ? khDigits(abs.unexcused) : '....' }), ' ដង']),
        el('p', {}, ['សរុប ', el('b', { text: known ? khDigits(abs.excused + abs.unexcused) : '....' }), ' ដង']),
      ]));
      var remark = y.remarks[student.id] || {};
      var conduct = remark.conduct ? el('span', { class: 'v', text: remark.conduct }) : editable(el('span', { class: 'v', 'data-placeholder': CARD_DEFAULTS.conductText, text: cardText('conductText') }), 'conductText');
      page.appendChild(el('p', { class: 'card-line' }, [el('b', { text: 'វិន័យនិងសីលធម៌ ៖ ' }), conduct]));
      var field = passed ? 'passComment' : 'failComment';
      var comment = remark.comment ? el('p', { class: 'card-comment', text: remark.comment }) : editable(el('p', { class: 'card-comment', 'data-placeholder': CARD_DEFAULTS[field], text: cardText(field) }), field);
      page.appendChild(el('p', { class: 'card-line' }, [el('b', { text: 'មូលវិចាររបស់គ្រូទទួលបន្ទុកថ្នាក់' })]));
      page.appendChild(comment);
      // footer: director | parents | class teacher (dates over the teacher)
      var form = state.form, editing = state.headerEditing;
      var signers = form.signers && form.signers.length ? form.signers : DEFAULT_FORM.signers, last = signers.length - 1;
      var names = form.signerNames || [];
      var grid = el('div', { class: 'sign-grid' }); grid.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
      var place = function (node, row, column) { if (!node) return; node.style.gridRow = String(row); node.style.gridColumn = String(column); grid.appendChild(node); };
      if (form.lunarLine || editing) place(editable(el('p', { class: 'lunar', 'data-placeholder': 'Lunar date line (optional)', text: form.lunarLine || '' }), 'lunarLine'), 1, 3);
      place(editable(el('p', { class: 'date-line', 'data-placeholder': dateLine(), text: form.dateLine || (editing ? '' : dateLine()) }), 'dateLine'), 2, 3);
      place(editable(el('p', { class: 'approval', 'data-placeholder': 'បានឃើញ និងឯកភាព', text: form.approvalText || (editing ? '' : 'បានឃើញ និងឯកភាព') }), 'approvalText'), 2, 1);
      place(editable(el('p', { class: 'role', 'data-placeholder': 'Role', text: signers[0] }), 'signer:0'), 3, 1);
      place(editable(el('p', { class: 'role', 'data-placeholder': TITLE_DEFAULTS.yearParents, text: titleOf('yearParents') }), 'title:yearParents'), 3, 2);
      place(editable(el('p', { class: 'role', 'data-placeholder': 'Role', text: signers[last] }), 'signer:' + last), 3, 3);
      var parents = el('div', { class: 'parent-lines' }, [el('p'), el('p'), el('p')]); place(parents, 4, 2);
      if (names[0] || editing) place(editable(el('p', { class: 'name', 'data-placeholder': 'Name (optional)', text: names[0] || '' }), 'signerName:0'), 4, 1);
      var teacherName = names[last] || (editing ? '' : d.teacherName || '');
      if (teacherName || editing) place(editable(el('p', { class: 'name', 'data-placeholder': d.teacherName || 'Name (optional)', text: teacherName }), 'signerName:' + last), 4, 3);
      page.appendChild(el('footer', { class: 'signs' }, [grid]));
    });
  }
  function yearCardsCsv() {
    var d = state.data, y = yearFigures(), m = y.model;
    var head = ['ល.រ', 'អ.ល', 'គោត្តនាម និងនាម', 'ភេទ'].concat(m.columns.map(function (s) { return s.name; })).concat(['មធ្យមភាគ', 'ចំណាត់ថ្នាក់', 'និទ្ទេស', 'លទ្ធផល']);
    return [head].concat(d.students.map(function (s, i) {
      var mine = y.per[s.id], g = mine.annual === null ? null : m.gradeOf(mine.annual, m.maxAverage);
      return [String(i + 1), s.studentNumber || '', displayName(s), sexMark(s.sex)].concat(m.columns.map(function (sub) { return fmt(mine.subjects[sub.id]); }))
        .concat([avg(mine.annual), mine.annual === null ? '' : String(y.ranks.year.annual[s.id] || ''), g ? g.letter : '', g ? (g.level !== m.grades.length - 1 ? 'ជាប់' : 'ធ្លាក់') : '']);
    }));
  }

  // ---------- student academic record book (សៀវភៅសិក្ខាគារិក) ----------
  var RECORD_DEFAULTS = { directorComment: 'សូមព្យាយាមខិតខំរៀនបន្ថែមទៀត', evalDefault: 'មធ្យម' };
  // A saved empty text stays empty (left for handwriting); never saved = the default.
  function recordText(field) { var v = state.form[field]; return v === undefined || v === null ? RECORD_DEFAULTS[field] : v; }
  function section(title, children) { return el('section', { class: 'rb-section' }, [el('h3', { text: title })].concat(children)); }
  // Cover, guidance and student information: the first pages of the book (portrait).
  var RB_GUIDANCE = [
    "១- នៅដើមឆ្នាំសិក្សា (ថ្នាក់ទី ៧) នាយកវិទ្យាល័យត្រូវណែនាំអោយបំពេញសេចក្តីក្នុងសៀវភៅសិក្ខាគារិក បានគ្រប់ចំណុច និងត្រឹមត្រូវល្អ មុននឹងចុះហត្ថលេខាកាត់រូបថតសិស្ស ។ គ្រប់អក្សរពុម្ព ឡាតាំង គ្រូទទួលបន្ទុកថ្នាក់ ឬ នាយកវិទ្យាល័យអាចជួយបំពេញបាន ។ ឪពុកម្តាយសិស្សបើសិនជាស្លាប់ក៏ត្រូវបញ្ជាក់នូវមុខរបរពីមុន ។ សាលារៀនត្រូវបោះត្រាកាត់រូបថតសិស្ស នៅក្នុងសៀវភៅសិក្ខាគារិក ហើយបើសិនជាសិស្សសុំផ្ទេរការសិក្សាចេញ ត្រូវបោះត្រាឆ្លងទំព័រមួយ ទៅទំព័រមួយទៀត នៃឆ្នាំសិក្សានីមួយៗផង ។",
    "២- គ្រូទទួលបន្ទុកថ្នាក់ជាអ្នកទទួលខុសត្រូវ ក្នុងការចុះពិន្ទុសិស្សគ្រប់មុខវិជ្ជា ក្នុងការចុះមូលវិចាររបស់គ្រូដទៃទៀត និងការប្រជុំវាយតម្លៃសិស្ស លើផ្នែកការសិក្សា សីលធម៌រស់នៅ ពលកម្ម សុខភាព ហើយបញ្ជាក់ច្បាស់នូវចំណុចសំខាន់ៗ (ឡើងថ្នាក់ ត្រួតថ្នាក់ សរសើរ កែលំអ...) ត្រង់មូលវិចារគ្រូទទួលបន្ទុក (ចំណុច «ឃ») មុននឹងជូននាយកវិទ្យាល័យចុះមូលវិចារ ។",
    "៣- ចំពោះសិស្សរៀននៅថ្នាក់សិស្សពូកែ (គណិតវិទ្យា-អក្សរសាស្ត្រ) ពិន្ទុនៃមុខវិជ្ជាឯកទេសត្រូវមានពីរផ្នែក សំរាប់ប្រើប្រាស់ផ្សេងគ្នាគឺ ៖",
    "ក- ពិន្ទុសំរាប់វាយតំលៃការសិក្សា ដើម្បីកំណត់អោយឡើងថ្នាក់ជាស្វ័យប្រវត្តិ ឬត្រូវប្រឡងឡើងថ្នាក់សិស្សពូកែ គឺពិន្ទុដែលចុះក្នុងផ្នែក «ក» (ខាងលើ) ដោយយកពិន្ទុសៀវភៅសិក្សាផ្ទាល់មាត់ សំនួរ ១៥នាទី និងពិន្ទុប្រឡងឆមាសធម្មតា (វិញ្ញាសារសំរាប់សិស្សធម្មតាថ្នាក់ធម្មតា) បញ្ចូលគ្នា ។",
    "ខ- ពិន្ទុសំរាប់ជាមូលដ្ឋានក្នុងការជ្រើសរើសអោយចូលរួមប្រឡងប្រណាំង ឬប្រឡងឡើងថ្នាក់សិស្សពូកែ ជាមួយសិស្សដទៃទៀត គឺពិន្ទុដែលចុះក្នុងផ្នែក «ខ» (ខាងក្រោម) ដោយយកពិន្ទុសរសេរចាប់ពី ១ ម៉ោងឡើងទៅ និងពិន្ទុប្រឡងឆមាសពិសេស (វិញ្ញាសារសំរាប់តែសិស្សពូកែ) ។",
    "៤- នៅដំណាច់ឆ្នាំសិក្សា នាយកវិទ្យាល័យត្រូវចុះមូលវិចារ និងទទួលខុសត្រូវលើការវាយតំលៃសិស្សគ្រប់ផ្នែក ។ នៅដើមភូមិសិក្សានីមួយៗ ត្រូវមានចុះលទ្ធផលនៃការប្រឡងរបស់សិស្ស សម័យប្រឡង - មណ្ឌល លេខបន្ទប់ - លេខតុ និង និទ្ទេសផង ។",
    "៥- នៅក្នុងសៀវភៅ សិក្ខាគារិក មិនត្រូវអោយមានការកោសលុប ឬសរសេរត្រួតគ្នាឡើយ ។ បើសិនជាមានក្នុងករណីចាំបាច់ នាយកវិទ្យាល័យត្រូវកែដោយទឹកខ្មៅក្រហម និងចុះហត្ថលេខាទទួលស្គាល់ផង ។ នៅពេលឈប់រៀន សិស្សអាចសុំសៀវភៅសិក្ខាគារិកទៅទុកផ្ទាល់ខ្លួនបាន ។"
  ];
  // The student's details first (place of birth, parents); else the school's registration fields, by their labels.
  function customValue(student, test) {
    var fields = (state.data && state.data.customFields) || [], values = student.customFieldValues || {};
    return fields.filter(function (f) { return test(String(f.label || '') + ' ' + String(f.key || '')); })
      .map(function (f) { var v = values[f.key]; return Array.isArray(v) ? v.join(', ') : v; })
      .filter(function (v) { return v !== undefined && v !== null && String(v).trim(); }).join(' · ');
  }
  function parentOf(student, who) {
    var person = who === 'father' ? /ឪពុក|father/i : /ម្តាយ|ម្ដាយ|mother/i, job = /មុខរបរ|occupation|job|work/i;
    var name = student[who + 'Name'] || customValue(student, function (s) { return person.test(s) && !job.test(s) && !/ទូរស័ព្ទ|phone/i.test(s); });
    var work = student[who + 'Job'] || customValue(student, function (s) { return person.test(s) && job.test(s); });
    return [name, work ? 'មុខរបរ ' + work : ''].filter(Boolean).join('   ');
  }
  function birthPlace(student) { return student.birthPlace || customValue(student, function (s) { return /ទីកន្លែងកំណើត|place\s*of\s*birth|birth\s*place|birthplace/i.test(s); }); }
  function dotted(label, value) { return el('p', { class: 'rb-field' }, [el('span', { class: 'k', text: label }), el('span', { class: 'v', text: value || '' })]); }
  function mottoBlock() {
    var form = state.form, block = el('div', { class: 'rb-motto' });
    var lines = el('div', { 'data-placeholder': 'Motto' });
    (form.mottoLines || MOTTO).forEach(function (l) { lines.appendChild(el('p', { text: l })); });
    block.appendChild(editable(lines, 'mottoLines', true));
    var ornament = form.ornament === undefined || form.ornament === null ? '❧❧❧' : form.ornament;
    if (ornament) block.appendChild(el('p', { class: 'ornament', text: ornament }));
    return block;
  }
  function recordFrontPages(host, student) {
    var d = state.data, form = state.form;
    var guidance = Array.isArray(form.rbGuidance) && form.rbGuidance.length ? form.rbGuidance : RB_GUIDANCE;
    if ($('rb-part-cover').checked) {
      // The outside of the cover sheet: the back (left) and the cover (right); folded, the cover is in front.
      var outside = el('article', { class: 'doc booklet-sheet rb-outside', 'data-record-student': student.id });
      outside.appendChild(el('section', { class: 'rb-half fit-box rb-back' }));
      var cover = el('section', { class: 'rb-half fit-box rb-cover' }); outside.appendChild(cover);
      var frame = el('div', { class: 'rb-frame' }); cover.appendChild(frame);
      frame.appendChild(mottoBlock());
      frame.appendChild(editable(el('p', { class: 'rb-ministry', 'data-placeholder': TITLE_DEFAULTS.rbMinistry, text: titleOf('rbMinistry') }), 'title:rbMinistry'));
      var orn = form.ornament === undefined || form.ornament === null ? '❧❧❧' : form.ornament;
      if (orn) frame.appendChild(el('p', { class: 'ornament', text: orn }));
      if (yearLogo()) frame.appendChild(el('img', { class: 'rb-cover-logo', src: yearLogo(), alt: '' }));
      frame.appendChild(editable(el('p', { class: 'rb-cover-title', 'data-placeholder': TITLE_DEFAULTS.recordbook, text: titleOf('recordbook') }), 'title:recordbook'));
      frame.appendChild(editable(el('p', { class: 'rb-level', 'data-placeholder': TITLE_DEFAULTS.rbLevel, text: titleOf('rbLevel') }), 'title:rbLevel'));
      var who = el('div', { class: 'rb-cover-fields' });
      who.appendChild(dotted('អនុវិ/វិទ្យាល័យ', schoolName()));
      who.appendChild(el('p', { class: 'rb-field' }, [el('span', { class: 'k', text: 'នាមត្រកូល និង នាមខ្លួន' }), el('span', { class: 'v', text: displayName(student) }), el('span', { class: 'k', text: 'ភេទ' }), el('span', { class: 'v short', text: student.sex === 'FEMALE' ? 'ស្រី' : student.sex === 'MALE' ? 'ប្រុស' : '' })]));
      who.appendChild(dotted('ថ្ងៃ ខែ ឆ្នាំ កំណើត', birthText(student.dateOfBirth)));
      who.appendChild(dotted('ទីកន្លែងកំណើត', birthPlace(student)));
      who.appendChild(dotted('', ''));
      frame.appendChild(who);
      host.appendChild(outside);
    }
    // The inside of the cover sheet: the guidance (left) and the student's information (right).
    var inside = null;
    if ($('rb-part-guidance').checked || $('rb-part-info').checked) { inside = el('article', { class: 'doc booklet-sheet rb-inside', 'data-record-student': student.id }); host.appendChild(inside); }
    if (inside && !$('rb-part-guidance').checked) inside.appendChild(el('section', { class: 'rb-half fit-box rb-blank' }));
    if ($('rb-part-guidance').checked) {
      var page = el('section', { class: 'rb-half fit-box rb-guidance' });
      page.appendChild(editable(el('h2', { class: 'rb-guidance-title', 'data-placeholder': TITLE_DEFAULTS.rbGuidance, text: titleOf('rbGuidance') }), 'title:rbGuidance'));
      var orn2 = form.ornament === undefined || form.ornament === null ? '❧❧❧' : form.ornament;
      if (orn2) page.appendChild(el('p', { class: 'ornament', text: orn2 }));
      var list = el('div', { class: 'rb-guidance-text', 'data-placeholder': 'Guidance' });
      guidance.forEach(function (line) { list.appendChild(el('p', { class: /^\s*[ក-ឣ]\s*-/.test(line) && !/^\s*[០-៩0-9]/.test(line) ? 'sub' : '', text: line })); });
      page.appendChild(editable(list, 'rbGuidance', true));
      inside.appendChild(page);
    }
    if ($('rb-part-info').checked) {
      var info = el('section', { class: 'rb-half fit-box rb-info' });
      var top = el('div', { class: 'rb-info-top' });
      var titles = el('div', {}, [mottoBlock(), el('p', { class: 'rb-cover-title small', text: titleOf('recordbook') })]);
      var orn3 = form.ornament === undefined || form.ornament === null ? '❧❧❧' : form.ornament;
      if (orn3) titles.appendChild(el('p', { class: 'ornament', text: orn3 }));
      var photo = el('div', { class: 'rb-photo' });
      if (student.photo) {
        var img = el('img', { alt: '' });
        img.onerror = function () { photo.textContent = 'រូបថត ៤x៦'; };
        img.setAttribute('src', student.photo); photo.appendChild(img);
      } else photo.textContent = 'រូបថត ៤x៦';
      top.appendChild(titles); top.appendChild(photo); info.appendChild(top);
      info.appendChild(el('p', { class: 'rb-field' }, [el('span', { class: 'k', text: 'គោត្តនាម និង នាម :' }), el('span', { class: 'v', text: displayName(student) }), el('span', { class: 'k', text: 'ជាអក្សរឡាតាំង' }), el('span', { class: 'v', text: String(student.name || '').toUpperCase() })]));
      info.appendChild(dotted('ថ្ងៃ ខែ ឆ្នាំកំណើត :', birthText(student.dateOfBirth)));
      info.appendChild(dotted('ទីកន្លែងកំណើត :', birthPlace(student)));
      info.appendChild(dotted('អាសយដ្ឋានបច្ចុប្បន្ន :', student.address || ''));
      info.appendChild(dotted('ឈ្មោះ និង មុខរបរឪពុក :', parentOf(student, 'father')));
      info.appendChild(dotted('', ''));
      info.appendChild(dotted('ឈ្មោះ និង មុខរបរម្តាយ :', parentOf(student, 'mother')));
      info.appendChild(dotted('', ''));
      // The school history: this year filled in; the following years are written by hand.
      var history = el('table', { class: 'card-table rb-history' });
      history.appendChild(el('thead', {}, [el('tr', {}, ['ឆ្នាំសិក្សា', 'ថ្នាក់', 'អត្តលេខ', 'សាលា', 'ថ្ងៃខែឆ្នាំចូល', 'ថ្ងៃខែឆ្នាំចេញ', 'សេចក្តីផ្សេងៗ'].map(function (h) { return el('th', { text: h }); }))]));
      var hb = el('tbody');
      var from = student.enrolledFrom ? student.enrolledFrom.split('-').reverse().join('-') : '';
      hb.appendChild(el('tr', {}, [d.studyYear || '', d.className || '', student.studentNumber || '', schoolName(), from, '', ''].map(function (v) { return el('td', { text: v }); })));
      for (var r = 0; r < 9; r += 1) hb.appendChild(el('tr', {}, [0, 1, 2, 3, 4, 5, 6].map(function () { return el('td'); })));
      history.appendChild(hb);
      info.appendChild(history);
      inside.appendChild(info);
    } else if (inside) inside.appendChild(el('section', { class: 'rb-half fit-box rb-blank' }));
  }

  function renderRecordBooks() {
    var host = $('recordbook-docs'); host.textContent = '';
    var d = state.data;
    if (d.tab.type !== 'SEMESTER') { host.appendChild(el('p', { class: 'empty', text: 'Choose the last semester of the year: the record book uses every semester up to it.' })); return; }
    var y = yearFigures(), m = y.model, form = state.form, editing = state.headerEditing;
    var semAbsence = {}; (d.semesterAbsences || []).forEach(function (s) { semAbsence[s.tabId] = { counts: {} }; s.counts.forEach(function (c) { semAbsence[s.tabId].counts[c.studentId] = c; }); });
    var signers = form.signers && form.signers.length ? form.signers : DEFAULT_FORM.signers, last = signers.length - 1, names = form.signerNames || [];
    cardStudents().forEach(function (student, index) {
      var key = 'rb' + index, mine = y.per[student.id];
      var rank = function (map) { var r = map[student.id]; return r ? String(r) : ''; };
      recordFrontPages(host, student);
      if (!$('rb-part-results').checked) return;
      // One A4 landscape sheet, folded in the middle: the results on the left page, the rest on the right.
      var sheet = el('article', { class: 'doc booklet-sheet recordbook-page', 'data-record-student': student.id });
      var page = el('section', { class: 'rb-half fit-box rb-results-half' }), right = el('section', { class: 'rb-half fit-box rb-eval-half' });
      sheet.appendChild(page); sheet.appendChild(right);
      page.appendChild(el('header', { class: 'rb-head' }, [el('div', { class: 'offices', id: key + '-offices' }), el('h2', { class: 'doc-title rb-title', id: key + '-title' })]));
      right.appendChild(el('div', { class: 'motto rb-motto-right', id: key + '-motto' }));
      host.appendChild(sheet);
      fillLetterhead(key);
      setTitle(key + '-title', 'recordbook', '');
      var info = styleInfo(el('p', { class: 'doc-info rb-student' }));
      [['គោត្តនាម និង នាម ', (student.studentNumber ? student.studentNumber + '  ' : '') + displayName(student)], ['ភេទ ', sexMark(student.sex)], ['ថ្នាក់ទី: ', d.className], ['', d.studyYear ? 'ឆ្នាំសិក្សា' + d.studyYear : ''], ['ចំនួនសិស្សក្នុងថ្នាក់ ', khDigits(d.students.length) + ' នាក់']]
        .forEach(function (p) { if (p[1]) info.appendChild(el('span', {}, [p[0], el('b', { text: p[1] })])); });
      page.appendChild(info);

      // ក / results in every subject: average and rank per semester and for the year, teacher's signature
      var table = el('table', { class: 'card-table rb-results' });
      var h1 = [el('th', { rowspan: '2', text: 'ល.រ' }), el('th', { rowspan: '2', text: 'មុខវិជ្ជា' })], h2 = [];
      var roman = ['I', 'II', 'III', 'IV'];
      y.semesters.forEach(function (sem, i) { h1.push(el('th', { colspan: '2', text: 'ឆមាសទី ' + (roman[i] || i + 1) })); h2.push(el('th', { text: 'ម.ភាគ' }), el('th', { text: 'ចំ.ថ្នាក់' })); });
      h1.push(el('th', { colspan: '2', text: 'ប្រចាំឆ្នាំ' }), el('th', { text: 'មូលវិចារ' }));
      h2.push(el('th', { text: 'ម.ភាគ' }), el('th', { text: 'ចំ.ថ្នាក់' }), el('th', { text: 'ហត្ថលេខា/ឈ្មោះគ្រូ' }));
      table.appendChild(el('thead', {}, [el('tr', {}, h1), el('tr', {}, h2)]));
      var body = el('tbody');
      m.columns.forEach(function (sub, i) {
        var cells = [el('td', { text: String(i + 1) }), el('td', { class: 'subject' + (m.isPart(sub) ? ' part' : ''), text: sub.name })];
        y.semesters.forEach(function (sem, s) { var v = mine.sems[s].exam.scores[sub.id]; cells.push(el('td', { class: 'num', text: fmt(v) }), el('td', { class: 'rk', text: v === null || v === undefined ? '' : rank(y.ranks.sem[s].subjects[sub.id]) })); });
        var yv = mine.subjects[sub.id];
        cells.push(el('td', { class: 'num', text: fmt(yv) }), el('td', { class: 'rk', text: yv === null ? '' : rank(y.ranks.year.subjects[sub.id]) }), el('td', { class: 'sign-cell' }));
        body.appendChild(el('tr', {}, cells));
      });
      var summary = function (label, semValue, semRanks, yearValue, yearRank, total) {
        var cells = [el('td', { colspan: '2', class: 'subject', text: label })];
        y.semesters.forEach(function (sem, s) { var v = semValue(s); cells.push(el('td', { class: 'num', text: v === null || v === undefined ? '' : (total ? fmt(v) : avg(v)) }), el('td', { class: 'rk', text: semRanks && v !== null && v !== undefined ? rank(semRanks(s)) : '' })); });
        cells.push(el('td', { class: 'num', text: yearValue === null || yearValue === undefined ? '' : (total ? fmt(yearValue) : avg(yearValue)) }), el('td', { class: 'rk', text: yearRank && yearValue !== null && yearValue !== undefined ? rank(yearRank) : '' }), el('td'));
        return el('tr', { class: 'sum' }, cells);
      };
      body.appendChild(summary('សរុបពិន្ទុប្រឡងឆមាស', function (s) { return mine.sems[s].exam.total; }, null, mine.total, null, true));
      body.appendChild(summary('មធ្យមភាគពិន្ទុប្រឡងឆមាស', function (s) { return mine.sems[s].figures.exam; }, function (s) { return y.ranks.sem[s].exam; }, mine.exam, y.ranks.year.exam));
      body.appendChild(summary('មធ្យមភាគពិន្ទុខែប្រចាំឆមាស', function (s) { return mine.sems[s].figures.monthly; }, function (s) { return y.ranks.sem[s].monthly; }, mine.monthly, y.ranks.year.monthly));
      body.appendChild(summary('មធ្យមភាគប្រចាំឆមាស', function (s) { return mine.sems[s].figures.average; }, function (s) { return y.ranks.sem[s].average; }, mine.annual, y.ranks.year.annual));
      table.appendChild(body);
      page.appendChild(section('ក / លទ្ធផលនៃការសិក្សាគ្រប់មុខវិជ្ជា', [table]));

      var semHead = function (first) { return el('tr', {}, [el('th', { text: first })].concat(y.semesters.map(function (sem, i) { return el('th', { text: 'ឆមាសទី ' + (roman[i] || i + 1) }); })).concat([el('th', { text: 'ប្រចាំឆ្នាំ' })])); };
      // ខ / absences per semester and for the year
      var absTable = el('table', { class: 'card-table rb-small' }, [el('thead', {}, [semHead('អវត្តមាន')])]);
      var absBody = el('tbody');
      [['excused', '- មានច្បាប់'], ['unexcused', '- អត់ច្បាប់']].forEach(function (kind) {
        var cells = [el('td', { class: 'subject', text: kind[1] })], sum = 0, known = true;
        y.semesters.forEach(function (sem) {
          var range = semAbsence[sem.id];
          if (!range) { known = false; cells.push(el('td', { text: '.... ដង' })); return; }
          var n = (range.counts[student.id] || {})[kind[0]] || 0; sum += n;
          cells.push(el('td', { text: khDigits(n) + ' ដង' }));
        });
        var yearCount = d.absenceRange ? ((d.yearAbsences || []).filter(function (a) { return a.studentId === student.id; })[0] || {})[kind[0]] || 0 : known ? sum : null;
        cells.push(el('td', { text: yearCount === null ? '.... ដង' : khDigits(yearCount) + ' ដង' }));
        absBody.appendChild(el('tr', {}, cells));
      });
      absTable.appendChild(absBody);
      right.appendChild(section('ខ / ចំនួនអវត្តមានក្នុងឆ្នាំសិក្សា', [absTable]));
      // គ / the four assessed areas: studies (the grade), then three filled with the school's default
      var evalTable = el('table', { class: 'card-table rb-small' }, [el('thead', {}, [semHead('ផ្នែក')])]);
      var evalBody = el('tbody');
      var studies = [el('td', { class: 'subject', text: '១- ការសិក្សា' })];
      y.semesters.forEach(function (sem, s) { var g = mine.sems[s].figures.average === null ? null : m.gradeOf(mine.sems[s].figures.average, m.maxAverage); studies.push(el('td', { class: M.gradeClass(g), text: g ? g.letter : '' })); });
      var yg = mine.annual === null ? null : m.gradeOf(mine.annual, m.maxAverage);
      studies.push(el('td', { class: M.gradeClass(yg), text: yg ? yg.letter : '' }));
      evalBody.appendChild(el('tr', {}, studies));
      ['២- សីលធម៌រស់នៅ', '៣- ពលកម្ម-បង្កបង្កើនផល', '៤- សុខភាព-អនាម័យ'].forEach(function (label, row) {
        var cells = [el('td', { class: 'subject', text: label })];
        for (var c = 0; c <= y.semesters.length; c += 1) {
          // the first cell is where the school changes the default for every cell
          cells.push(row === 0 && c === 0 ? el('td', {}, [editable(el('span', { 'data-placeholder': '(blank)', text: recordText('evalDefault') }), 'evalDefault')]) : el('td', { text: recordText('evalDefault') }));
        }
        evalBody.appendChild(el('tr', {}, cells));
      });
      evalTable.appendChild(evalBody);
      right.appendChild(section('គ / ការវាយតម្លៃផ្នែកទាំង៤', [evalTable]));
      // ឃ / commendations (filled in by hand)
      var praise = el('table', { class: 'card-table rb-small' }, [el('thead', {}, [semHead('បានទទួលការសរសើរ')])]);
      var praiseBody = el('tbody');
      ['- ប័ណ្ណសរសើរចំនួនៈ', '- លិខិតសរសើរៈ', '- សក្ខីប័ណ្ណលើកទឹកចិត្តៈ'].forEach(function (label) {
        praiseBody.appendChild(el('tr', {}, [el('td', { class: 'subject', text: label })].concat(y.semesters.map(function () { return el('td'); })).concat([el('td')])));
      });
      praise.appendChild(praiseBody);
      right.appendChild(section('ឃ / ការសរសើរ', [praise]));
      // ង / the end-of-level exam (filled in by hand)
      right.appendChild(section('ង / លទ្ធផលនៃការប្រឡងបញ្ចប់ភូមិសិក្សា (ជាប់ ឬ ធ្លាក់)', [el('p', { class: 'rb-exam', text: '- មណ្ឌលប្រឡង.............................(ខេត្ត..................) លេខបន្ទប់.......... លេខតុ..........' })]));
      // the director's and the class teacher's comments, each dated and signed
      var grade = mine.annual === null ? null : m.gradeOf(mine.annual, m.maxAverage), passed = grade && grade.level !== m.grades.length - 1;
      var remark = y.remarks[student.id] || {};
      var commentField = passed ? 'passComment' : 'failComment';
      var dates = function () {
        return [form.lunarLine || editing ? editable(el('p', { class: 'lunar', 'data-placeholder': 'Lunar date line (optional)', text: form.lunarLine || '' }), 'lunarLine') : null,
          editable(el('p', { class: 'date-line', 'data-placeholder': dateLine(), text: form.dateLine || (editing ? '' : dateLine()) }), 'dateLine')];
      };
      var teacherName = names[last] || (editing ? '' : d.teacherName || '');
      right.appendChild(el('div', { class: 'rb-comments' }, [
        el('div', { class: 'col' }, [el('p', { class: 'role', text: 'មូលវិចារណ៍ ' + signers[0] }),
          editable(el('p', { class: 'rb-comment', 'data-placeholder': RECORD_DEFAULTS.directorComment, text: recordText('directorComment') }), 'directorComment')]
          .concat(dates()).concat([editable(el('p', { class: 'role', 'data-placeholder': 'Role', text: signers[0] }), 'signer:0'),
            names[0] || editing ? editable(el('p', { class: 'name', 'data-placeholder': 'Name (optional)', text: names[0] || '' }), 'signerName:0') : null])),
        el('div', { class: 'col' }, [el('p', { class: 'role', text: 'មូលវិចារណ៍ ' + signers[last] }),
          remark.comment ? el('p', { class: 'rb-comment', text: remark.comment }) : editable(el('p', { class: 'rb-comment', 'data-placeholder': CARD_DEFAULTS[commentField], text: cardText(commentField) }), commentField)]
          .concat(dates()).concat([el('p', { class: 'role', text: 'ហត្ថលេខា' }),
            teacherName || editing ? editable(el('p', { class: 'name', 'data-placeholder': d.teacherName || 'Name (optional)', text: teacherName }), 'signerName:' + last) : null])),
      ]));
    });
  }

  function renderCurrent() {
    if (state.view === 'ranking') renderRanking(); else if (state.view === 'honor') renderHonor();
    else if (state.view === 'subjects') renderSubjects(); else if (state.view === 'yearcard') renderYearCards(); else if (state.view === 'recordbook') renderRecordBooks(); else renderDocument();
    fitPages();
    updateChrome();
  }
  // One-page documents (honor roll, year report cards, record book pages) are drawn at their paper size and
  // print exactly as shown; a page whose content is taller than the paper is scaled down to fit it.
  // Paper sizes in mm (portrait), for pages drawn at the print form's paper.
  var PAPER_MM = { A4: [210, 297], A3: [297, 420], B5: [176, 250], A5: [148, 210], Letter: [216, 279], Legal: [216, 356] };
  function fitPages() {
    var wrap = $('paper-wrap'); if (wrap.hidden) return;
    // The ranking is drawn at the print form's paper; it fits on one page when it needs only a little shrinking,
    // otherwise it flows over pages like the score sheet.
    var size = PAPER_MM[state.form.paper] || PAPER_MM.A4, landscape = (state.form.orientation || 'landscape') === 'landscape';
    Array.prototype.forEach.call(wrap.querySelectorAll('.fit-soft'), function (box) {
      box.classList.remove('flow');
      box.style.setProperty('--page-w', (landscape ? size[1] : size[0]) + 'mm');
      box.style.setProperty('--page-h', ((landscape ? size[0] : size[1]) - 0.5) + 'mm');
    });
    var zoom = wrap.style.getPropertyValue('--zoom');
    wrap.style.setProperty('--zoom', '1');
    Array.prototype.forEach.call(wrap.querySelectorAll('.fit-box'), function (box) {
      if (box.offsetParent === null) return;
      var fit = box.firstElementChild;
      if (!fit || !fit.classList.contains('fit')) { fit = el('div', { class: 'fit' }); while (box.firstChild) fit.appendChild(box.firstChild); box.appendChild(fit); }
      fit.style.zoom = '';
      var cs = window.getComputedStyle(box);
      var room = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), scale = 1;
      for (var i = 0; i < 6; i += 1) {
        var height = fit.getBoundingClientRect().height;
        if (height <= room + 0.5) break;
        scale = scale * room / height * 0.995;
        fit.style.zoom = String(scale);
      }
      if (box.classList.contains('fit-soft') && scale < 0.75) { box.classList.add('flow'); fit.style.zoom = ''; scale = 1; }
      box.classList.toggle('shrunk', scale < 1);
    });
    if (zoom) wrap.style.setProperty('--zoom', zoom);
  }

  // ---------- chrome: context line, preview bar, zoom ----------
  var VIEW_NAMES = { sheet: 'Score sheet', ranking: 'Student ranking', honor: 'Honor roll', subjects: 'Subject ranking', yearcard: 'Year report cards', recordbook: 'Record books' };
  function updateChrome() {
    var d = state.data, line = $('context-line'), info = $('canvas-info');
    line.textContent = '';
    if (d) {
      var year = (state.view === 'ranking' || state.view === 'honor') && yearScope();
      [['Class', d.className], ['Period', year ? 'ឆ្នាំសិក្សា' + (d.studyYear ? ' ' + d.studyYear : '') : d.tab.label], ['Students', String(d.students.length)]].forEach(function (pair, i) {
        if (i) line.appendChild(el('span', { class: 'dot', text: '  ·  ' }));
        line.appendChild(document.createTextNode(pair[0] + ' ')); line.appendChild(el('b', { text: pair[1] }));
      });
    } else line.textContent = 'Monthly and semester results in the ministry layout';
    var visible = !$('paper-wrap').hidden;
    $('canvas-bar').hidden = !visible;
    if (visible) {
      var pages = state.view === 'yearcard' ? $('yearcard-docs').querySelectorAll('.yearcard-page').length : state.view === 'recordbook' ? $('recordbook-docs').querySelectorAll('.doc').length : state.view === 'sheet' && $('p-stats').checked ? 2 : 1;
      var paper = state.view === 'honor' || state.view === 'yearcard' ? 'A4 portrait' : state.view === 'recordbook' ? 'A4 landscape · booklet (2 pages per sheet)' : (state.form.paper || 'A4') + ' ' + (state.form.orientation || 'landscape');
      if (state.view === 'recordbook') pages = $('recordbook-docs').querySelectorAll('.booklet-sheet').length;
      info.textContent = '';
      [VIEW_NAMES[state.view] || '', paper, pages + (state.view === 'recordbook' ? (pages === 1 ? ' sheet' : ' sheets') : pages === 1 ? ' page' : ' pages')].forEach(function (part, i) {
        if (i) info.appendChild(el('span', { class: 'dot', text: '•' }));
        info.appendChild(document.createTextNode(part));
      });
    }
    applyZoom();
  }
  // "Fit width" scales the pages to the canvas; printing is always at full size.
  function applyZoom() {
    var wrap = $('paper-wrap'); if (wrap.hidden) return;
    var choice = $('zoom').value || 'fit';
    if (choice !== 'fit') { wrap.style.setProperty('--zoom', choice); return; }
    wrap.style.setProperty('--zoom', '1');
    var page = Array.prototype.filter.call(wrap.querySelectorAll('.doc'), function (n) { return n.offsetParent !== null; })[0];
    if (!page) return;
    var available = wrap.clientWidth - 46, natural = page.scrollWidth || page.offsetWidth;
    var scale = natural > 0 ? Math.min(1, available / natural) : 1;
    wrap.style.setProperty('--zoom', String(Math.max(0.35, Math.round(scale * 100) / 100)));
  }

  // Counts of the list, as in the ministry sheet's footer (percentages of the whole list).
  function tally(figures) {
    var all = figures.rows, female = function (list) { return list.filter(function (r) { return r.student.sex === 'FEMALE'; }).length; };
    var grades = figures.model.grades, last = grades.length - 1;
    var byLevel = grades.map(function (g) { return all.filter(function (r) { return r.grade && r.grade.level === g.level; }); });
    var pass = all.filter(function (r) { return r.grade && r.grade.level !== last; });
    var none = all.filter(function (r) { return !r.hasScores; });
    return { all: all, female: female, grades: grades, byLevel: byLevel, pass: pass, below: byLevel[last], none: none };
  }
  function summaryRow(label, list, t, withPct) {
    var n = list.length, f = t.female(list), base = t.all.length;
    return el('tr', {}, [el('td', { text: label }), el('td', { class: 'n', text: String(n) }), el('td', { text: 'នាក់' }), el('td', { text: 'ស្រី' }), el('td', { class: 'n', text: String(f) }), el('td', { text: 'នាក់' }),
      el('td', { text: withPct ? 'ភាគរយ' : '' }), el('td', { class: 'n', text: withPct ? pct(n, base) : '' })]);
  }
  function renderSummary(figures, id, labels) {
    var t = tally(figures), host = $(id); host.textContent = '';
    var L = labels || {};
    var left = el('table', {}, [el('tbody', {}, [
      summaryRow(L.total || 'បញ្ឈប់បញ្ជីត្រឹមចំនួន :', t.all, t, false),
      summaryRow(L.pass || 'សិស្សជាប់មធ្យមភាគ :', t.pass, t, true),
      summaryRow(L.below || 'សិស្សក្រោមមធ្យមភាគ :', t.below, t, true),
      // As on the ministry sheet: the third, fourth and fifth grades by their Khmer names (ល្អ, ល្អបង្គួរ, មធ្យម).
      summaryRow('និទ្ទេស' + t.grades[2].kh + ' ចំនួន :', t.byLevel[2], t, true),
      summaryRow('និទ្ទេស' + t.grades[3].kh + ' ចំនួន :', t.byLevel[3], t, true),
      summaryRow('និទ្ទេស' + t.grades[4].kh + ' ចំនួន :', t.byLevel[4], t, true),
      summaryRow(L.none || 'សិស្សគ្មានពិន្ទុ (បោះបង់) :', t.none, t, true),
    ])]);
    var right = el('table', {}, [el('tbody', {}, t.grades.map(function (g) { return summaryRow('និទ្ទេស ' + g.letter + ' មានចំនួន :', t.byLevel[g.level], t, true); }))]);
    host.appendChild(left); host.appendChild(right);
  }
  function dateLine() {
    var value = state.date || today(), parts = value.split('-');
    var place = state.form.footerText ? state.form.footerText + ' ' : '';
    return place + 'ថ្ងៃទី' + khDigits(Number(parts[2])) + ' ខែ' + KH_MONTHS[Number(parts[1]) - 1] + ' ឆ្នាំ' + khDigits(parts[0]);
  }
  // The footer: lunar date, date line, approval, the signers' roles and names — editable with the header.
  // Empty texts fall back: the date line to today's date, the last name to the class teacher.
  function renderSigns(id) {
    var host = $(id), form = state.form, editing = state.headerEditing; host.textContent = '';
    var signers = form.signers && form.signers.length ? form.signers : DEFAULT_FORM.signers;
    var names = form.signerNames || [], count = signers.length;
    // One column per signer, as on the ministry sheet: the dates sit over the last signer (the class
    // teacher), "បានឃើញ និងឯកភាព" over the first; roles share one row and names another, so everything
    // in a column is centred on the same line.
    var grid = el('div', { class: 'sign-grid' });
    grid.style.gridTemplateColumns = 'repeat(' + count + ', minmax(0, 1fr))';
    var place = function (node, row, column) { if (!node) return; node.style.gridRow = String(row); node.style.gridColumn = String(column); grid.appendChild(node); };
    if (form.lunarLine || editing) place(editable(el('p', { class: 'lunar', 'data-placeholder': 'Lunar date line (optional)', text: form.lunarLine || '' }), 'lunarLine'), 1, count);
    place(editable(el('p', { class: 'date-line', 'data-placeholder': dateLine(), text: form.dateLine || (editing ? '' : dateLine()) }), 'dateLine'), 2, count);
    if (count > 1) place(editable(el('p', { class: 'approval', 'data-placeholder': 'បានឃើញ និងឯកភាព', text: form.approvalText || (editing ? '' : 'បានឃើញ និងឯកភាព') }), 'approvalText'), 2, 1);
    signers.forEach(function (role, index) {
      var last = index === count - 1, auto = last ? state.data.teacherName || '' : '';
      var name = names[index] || (editing ? '' : auto);
      place(editable(el('p', { class: 'role', 'data-placeholder': 'Role', text: role }), 'signer:' + index), 3, index + 1);
      if (name || editing) place(editable(el('p', { class: 'name', 'data-placeholder': auto || 'Name (optional)', text: name }), 'signerName:' + index), 4, index + 1);
    });
    host.appendChild(grid);
  }
  function renderStats(figures) {
    var t = tally(figures), base = t.all.length, m = figures.model;
    $('s-title').textContent = 'ស្ថិតិនិទ្ទេសតាមមុខវិជ្ជា · ' + titleText();
    var info = $('s-info'); info.textContent = '';
    infoParts().forEach(function (part) { info.appendChild(el('span', { text: part })); });
    var table = $('s-grades'); table.textContent = '';
    var h1 = [el('th', { rowspan: '2', text: 'មុខវិជ្ជា' }), el('th', { rowspan: '2', text: 'ចំនួនសិស្ស' })];
    var h2 = [];
    t.grades.forEach(function (g) { h1.push(el('th', { colspan: '2', text: 'និទ្ទេស ' + g.letter })); h2.push(el('th', { text: 'ចំនួន' }), el('th', { text: 'ភាគរយ' })); });
    table.appendChild(el('thead', {}, [el('tr', {}, h1), el('tr', {}, h2)]));
    var body = el('tbody');
    var line = function (label, counts) {
      var cells = [el('td', { class: 'subject', text: label }), el('td', { text: String(base) })];
      t.grades.forEach(function (g) { cells.push(el('td', { text: String(counts[g.level]) }), el('td', { text: pct(counts[g.level], base) })); });
      return el('tr', {}, cells);
    };
    var overall = t.byLevel.map(function (list) { return list.length; });
    body.appendChild(line('សរុប (មធ្យមភាគ)', overall));
    m.columns.forEach(function (subject) {
      var counts = t.grades.map(function () { return 0; });
      figures.rows.forEach(function (r) { var g = m.gradeOf(r.exam.scores[subject.id], subject.maxScore); if (g) counts[g.level] += 1; });
      body.appendChild(line(subject.name, counts));
    });
    table.appendChild(body);
    // Student movement: the list from the system; moves are filled in by hand on the printed sheet.
    var move = $('s-movement'); move.textContent = '';
    var labels = ['ចំនួនសិស្ស', 'បោះបង់', 'ផ្ទេរចេញ', 'ស្លាប់', 'ក្រៅបញ្ជី', 'ផ្ទេរចូល', 'ចូលរៀនវិញ', 'សិស្សជាក់ស្តែង'];
    var mh1 = [], mh2 = [], md = [], female = t.female(t.all);
    labels.forEach(function (label, index) {
      mh1.push(el('th', { colspan: '2', text: label })); mh2.push(el('th', { text: 'សរុប' }), el('th', { text: 'ស្រី' }));
      var known = index === 0 || index === labels.length - 1;
      md.push(el('td', { text: known ? String(base) : '' }), el('td', { text: known ? String(female) : '' }));
    });
    move.appendChild(el('thead', {}, [el('tr', {}, mh1), el('tr', {}, mh2)]));
    move.appendChild(el('tbody', {}, [el('tr', {}, md)]));
  }

  // Typing updates totals, averages, ranks, grades and the counts without redrawing the inputs.
  function refreshFigures() {
    var figures = compute(), set = function (key, text, cls) {
      var node = document.querySelector('[data-f="' + key + '"]'); if (!node) return;
      node.textContent = text; if (cls !== undefined) node.className = cls;
    };
    figures.rows.forEach(function (row) {
      var id = row.student.id, gradeClass = M.gradeClass(row.grade);
      Object.keys(row.exam.scores).forEach(function (subjectId) {
        var cell = document.querySelector('[data-cell="' + id + ':' + subjectId + '"]'); if (cell) cell.textContent = fmt(row.exam.scores[subjectId]);
      });
      set('total:' + id, fmt(row.exam.total));
      if (figures.semester) { set('exam:' + id, avg(row.sem.exam)); set('monthly:' + id, avg(row.sem.monthly)); }
      set('final:' + id, avg(row.final)); set('rank:' + id, row.rank ? String(row.rank) : '');
      set('kh:' + id, row.grade ? row.grade.kh : '', gradeClass); set('en:' + id, row.grade ? row.grade.letter : '', gradeClass);
      var tr = document.querySelector('tr[data-student="' + id + '"]'); if (tr) tr.className = row.hasScores ? '' : 'no-scores';
    });
    renderSummary(figures, 'd-summary'); renderStats(figures);
  }

  // ---------- entering scores ----------
  // Conduct and comment: saved a moment after typing stops (one request per student).
  var remarkTimers = {};
  function remarkChanged(studentId, field, value) {
    var list = state.data.remarks = state.data.remarks || [];
    var mine = list.filter(function (r) { return r.studentId === studentId; })[0];
    if (!mine) { mine = { studentId: studentId, conduct: null, comment: null }; list.push(mine); }
    mine[field] = value;
    clearTimeout(remarkTimers[studentId]);
    remarkTimers[studentId] = setTimeout(function () { saveRemark(studentId); }, SAVE_DELAY);
  }
  function saveRemark(studentId) {
    delete remarkTimers[studentId];
    var mine = (state.data.remarks || []).filter(function (r) { return r.studentId === studentId; })[0] || {};
    return ui.api.put('transcripts/tabs/' + encodeURIComponent(state.data.tab.id) + '/remarks', { classId: state.classId, studentId: studentId, conduct: mine.conduct || '', comment: mine.comment || '' })
      .then(function () { saved('✓ Saved'); })
      .catch(function (error) { saved(error.status === 403 ? 'You may not write comments for this class' : error.message || 'The comment was not saved', true); });
  }
  function flushRemarks() { return Promise.all(Object.keys(remarkTimers).map(function (id) { clearTimeout(remarkTimers[id]); return saveRemark(id); })); }
  function scoreChanged(studentId, subject, input) {
    var raw = input.value.trim().replace(',', '.');
    var value = raw === '' ? null : Number(raw);
    var bad = value !== null && (!isFinite(value) || value < 0 || value > Number(subject.maxScore));
    input.classList.toggle('invalid', bad);
    if (bad) { saved(subject.name + ': 0 – ' + fmt(subject.maxScore), true); return; }
    var tabId = state.data.tab.id;
    var tab = state.scores[tabId] = state.scores[tabId] || {};
    (tab[studentId] = tab[studentId] || {})[subject.id] = value;
    state.dirty[studentId + ':' + subject.id] = { studentId: studentId, subjectId: subject.id, score: value };
    refreshFigures();
    clearTimeout(state.timer); state.timer = setTimeout(saveScores, SAVE_DELAY);
  }
  function saveScores() { return Promise.all([saveScoresOnly(), flushRemarks()]); }
  function saveScoresOnly() {
    clearTimeout(state.timer);
    var entries = Object.keys(state.dirty).map(function (key) { return state.dirty[key]; });
    if (!entries.length || !state.data) return Promise.resolve();
    state.dirty = {};
    return ui.api.post('transcripts/tabs/' + encodeURIComponent(state.data.tab.id) + '/scores', { classId: state.classId, entries: entries })
      .then(function () { saved('✓ Scores saved'); })
      .catch(function (error) {
        entries.forEach(function (entry) { var key = entry.studentId + ':' + entry.subjectId; if (!state.dirty[key]) state.dirty[key] = entry; });
        saved(error.status === 403 ? 'You may not enter scores for this class' : error.message || 'Scores were not saved', true);
      });
  }
  // Enter / arrow keys move down and up a subject's column, as in a spreadsheet.
  function moveFocus(event) {
    var down = event.key === 'Enter' || event.key === 'ArrowDown', up = event.key === 'ArrowUp';
    if (!down && !up) return;
    event.preventDefault();
    var row = Number(event.target.getAttribute('data-row')) + (up ? -1 : 1), col = event.target.getAttribute('data-col');
    var next = document.querySelector('input[data-row="' + row + '"][data-col="' + col + '"]');
    if (next) { next.focus(); next.select(); }
  }

  // ---------- data ----------
  function savePeriod() {
    var start = $('period-start').value || null, end = $('period-end').value || null;
    if (start && end && start > end) { saved('The start date must be on or before the end date', true); return; }
    ui.api.put('transcripts/tabs/' + encodeURIComponent(state.tabId), { classId: state.classId, periodStart: start, periodEnd: end })
      .then(function () { saved('✓ Dates saved'); return loadSheets().then(load); })
      .catch(function (error) { saved(error.message || 'The dates were not saved', true); });
  }

  // ---------- 1. setup: score sheets, their classes, subjects and months (administrators) ----------
  state.editingSheet = null;
  function sheetById(id) { return state.sheets.filter(function (s) { return s.id === id; })[0] || null; }
  function fillParents(sheet) {
    var select = $('sub-parent'), keep = select.value; select.textContent = '';
    select.appendChild(el('option', { value: '', text: 'Part of — (none)' }));
    ((sheet && sheet.subjects) || []).forEach(function (s) { if (!s.parentId) select.appendChild(el('option', { value: s.id, text: 'Part of ' + s.name })); });
    select.value = keep; if (select.value !== keep) select.value = '';
  }
  function setupError(error, fallback) { saved(error.status === 403 ? 'Only administrators can change score sheets.' : (error && error.message) || fallback, true); }
  function renderSetup() {
    var list = $('sheet-list'); list.textContent = '';
    state.sheets.forEach(function (sheet) {
      list.appendChild(el('button', { type: 'button', 'aria-current': String(state.editingSheet === sheet.id), onclick: function () { editSheet(sheet.id); } },
        [sheet.name, el('small', { text: sheet.subjects.length + ' subjects · ' + sheet.classIds.length + ' classes · ' + sheet.tabs.length + ' months/semesters' })]));
    });
    var sheet = sheetById(state.editingSheet);
    $('sheet-form-title').textContent = sheet ? 'Edit ' + sheet.name : 'New score sheet';
    $('delete-sheet').hidden = !sheet; $('sheet-extra').hidden = !sheet;
    $('f-kind-wrap').hidden = Boolean(sheet); // the type is chosen when the sheet is created
    var checks = $('f-classes'); checks.textContent = '';
    // primary, secondary, high school and short-course classes (and classes without a level); university classes use university sheets
    var LEVEL_NAMES = { PRIMARY: 'Primary', SECONDARY: 'Secondary', HIGH_SCHOOL: 'High school', UNIVERSITY: 'University', SHORT_COURSE: 'Short course' };
    state.classes.forEach(function (item) {
      var linked = Boolean(sheet && sheet.classIds.indexOf(item.id) >= 0);
      var university = !sheet && ((document.querySelector('input[name="f-kind"]:checked') || {}).value === 'UNIVERSITY');
      if (!linked && (university ? item.level === 'PRIMARY' || item.level === 'SECONDARY' || item.level === 'HIGH_SCHOOL' : item.level === 'UNIVERSITY')) return;
      var box = el('input', { type: 'checkbox', value: item.id }); box.checked = linked;
      checks.appendChild(el('label', {}, [box, (item.name || item.id) + (LEVEL_NAMES[item.level] ? ' · ' + LEVEL_NAMES[item.level] : '')]));
    });
    if (!state.classes.length) checks.appendChild(el('span', { class: 'muted', text: 'No classes yet.' }));
    if (!sheet) return;
    fillParents(sheet);
    var subjects = $('subjects'); subjects.textContent = '';
    sheet.subjects.forEach(function (subject, index) {
      var name = el('input', { 'aria-label': 'Subject name' }); name.value = subject.name;
      var max = el('input', { type: 'number', min: '1', max: '1000', 'aria-label': 'Max score' }); max.value = String(subject.maxScore);
      var weight = el('input', { type: 'number', min: '0', max: '10', step: 'any', 'aria-label': 'Coefficient' }); weight.value = String(subject.coefficient === undefined || subject.coefficient === null ? 1 : subject.coefficient);
      var parent = el('select', { 'aria-label': 'Part of' });
      parent.appendChild(el('option', { value: '', text: '— (counted on its own)' }));
      sheet.subjects.forEach(function (s) { if (s.id !== subject.id && !s.parentId) parent.appendChild(el('option', { value: s.id, text: s.name })); });
      parent.value = subject.parentId || '';
      var colour = el('input', { type: 'color', 'aria-label': 'Colour' }); colour.value = subject.color || '#334155';
      var save = function () {
        ui.api.put('transcripts/subjects/' + encodeURIComponent(subject.id), { name: name.value, maxScore: max.value, color: colour.value, order: index, coefficient: weight.value, parentId: parent.value || null })
          .then(function () { saved('✓ Subject saved'); return refreshAll(); }).catch(function (error) { setupError(error, 'The subject could not be saved.'); return refreshAll(); });
      };
      [name, max, colour, weight, parent].forEach(function (input) { input.addEventListener('change', save); });
      subjects.appendChild(el('tr', {}, [el('td', {}, [name]), el('td', {}, [max]), el('td', {}, [weight]), el('td', {}, [parent]), el('td', {}, [colour]),
        el('td', {}, [el('button', { type: 'button', class: 'link-danger', text: 'Delete', onclick: function () {
          if (!window.confirm('Delete the subject ' + subject.name + ' and its scores?')) return;
          ui.api.delete('transcripts/subjects/' + encodeURIComponent(subject.id)).then(refreshAll).catch(function (error) { setupError(error, 'The subject could not be deleted.'); });
        } })])]));
    });
    var tabs = $('setup-tabs'); tabs.textContent = '';
    sheet.tabs.forEach(function (tab) {
      tabs.appendChild(el('span', { class: 'chip' + (tab.type === 'SEMESTER' ? ' semester' : '') }, [tab.label + (tab.periodStart ? ' · ' + tab.periodStart + ' – ' + (tab.periodEnd || '') : ''),
        el('button', { type: 'button', title: 'Delete ' + tab.label, 'aria-label': 'Delete ' + tab.label, text: '×', onclick: function () {
          if (!window.confirm('Delete ' + tab.label + ' with its scores and comments?')) return;
          ui.api.delete('transcripts/tabs/' + encodeURIComponent(tab.id)).then(refreshAll).catch(function (error) { setupError(error, 'It could not be deleted.'); });
        } })]));
    });
    if (!sheet.tabs.length) tabs.appendChild(el('span', { class: 'muted', text: 'No months yet — use ＋ Add above the sheet.' }));
  }
  function editSheet(sheetId) {
    state.editingSheet = sheetId;
    var sheet = sheetById(sheetId);
    $('f-name').value = sheet ? sheet.name : ''; $('f-degree').value = sheet ? sheet.degree || '' : '';
    renderSetup();
  }
  function refreshAll() { return loadSheets().then(function () { renderSetup(); renderTabChips(); return load(); }); }
  function saveSheet(event) {
    event.preventDefault();
    var classIds = Array.prototype.map.call(document.querySelectorAll('#f-classes input:checked'), function (box) { return box.value; });
    var body = { name: $('f-name').value, degree: $('f-degree').value, classIds: classIds };
    // A university sheet is set up and filled on University Score Sheets.
    var kind = (document.querySelector('input[name="f-kind"]:checked') || {}).value || 'SCHOOL';
    if (!state.editingSheet && kind === 'UNIVERSITY') {
      body.kind = 'UNIVERSITY';
      ui.api.post('transcripts/sheets', body).then(function (sheet) { ui.navigate('university-sheets', { sheetId: sheet.id, setup: '1' }); })
        .catch(function (error) { setupError(error, 'The score sheet could not be saved.'); });
      return;
    }
    var request = state.editingSheet ? ui.api.put('transcripts/sheets/' + encodeURIComponent(state.editingSheet), body) : ui.api.post('transcripts/sheets', body);
    request.then(function (sheet) {
      saved('✓ Score sheet saved'); state.editingSheet = sheet.id; if (!state.sheetId) state.sheetId = sheet.id;
      return refreshAll().then(function () { editSheet(sheet.id); });
    }).catch(function (error) { setupError(error, 'The score sheet could not be saved.'); });
  }
  function addSubject() {
    if (!state.editingSheet) return;
    ui.api.post('transcripts/sheets/' + encodeURIComponent(state.editingSheet) + '/subjects', { name: $('sub-name').value, maxScore: $('sub-max').value, color: $('sub-color').value, coefficient: $('sub-coefficient').value, parentId: $('sub-parent').value || null })
      .then(function () { $('sub-name').value = ''; saved('✓ Subject added'); return refreshAll(); })
      .catch(function (error) { setupError(error, 'The subject could not be added.'); });
  }
  function openSetup() { $('setup').hidden = false; editSheet(state.sheetId || null); $('setup').scrollIntoView({ block: 'start' }); }

  // Entry mode (Enter Scores, ?entry=1): for teachers with only "Enter transcript scores…": the sheets of
  // their own classes come with the classes' names; set-up controls are hidden (the server refuses them anyway).
  var ENTRY = false;
  function loadSheets() {
    var request = ENTRY
      ? ui.api.get('transcripts/entry/sheets').then(function (r) { return [r && r.sheets, r && r.classes]; })
      : Promise.all([ui.api.get('transcripts/sheets'), ui.api.get('classes')]);
    return request.then(function (results) {
      state.sheets = rows(results[0]); state.classes = rows(results[1]);
      if (!activeSheet()) state.sheetId = (state.sheets[0] && state.sheets[0].id) || '';
      pickDefaults();
    });
  }
  function emptyText() {
    var sheet = activeSheet(), data = state.data;
    if (!sheet) return state.sheets.length ? 'Choose a score sheet.' : 'No score sheets yet. Use ⋯ More → ⚙️ Subjects & classes to create one with its subjects, coefficients and classes.';
    if (!sheet.classIds.length) return 'This score sheet has no classes yet. Add them in ⋯ More → ⚙️ Subjects & classes.';
    if (!tabsOfKind(sheet).length) return state.kind === 'SEMESTER' ? 'No semesters yet. Use ＋ Add → Semester (add it after the semester\'s months).' : 'No months yet. Use ＋ Add → Month.';
    if (!data) return 'Loading…';
    if (!data.subjects.length) return 'This score sheet has no subjects yet. Add them in ⋯ More → ⚙️ Subjects & classes.';
    if (!data.students.length) return 'No students in this class.';
    return '';
  }
  function render() {
    renderSelectors();
    var text = emptyText();
    show('empty', text);
    $('paper-wrap').hidden = Boolean(text);
    var note = '';
    if (!text && state.data.tab.type === 'SEMESTER') {
      note = state.data.months.length
        ? 'Semester average = (average of ' + state.data.months.map(function (m) { return m.label; }).join(', ') + ' + semester exam average) ÷ 2. The scores below are the semester exam.'
        : 'No months belong to this semester yet, so the semester average is the exam average. Months count when they are listed before this semester (after the previous one), or fall inside its period.';
    }
    show('months-note', note);
    var sheetView = state.view === 'sheet';
    $('sheet-doc').hidden = !sheetView; $('stats-doc').hidden = !sheetView;
    $('ranking-doc').hidden = state.view !== 'ranking'; $('honor-doc').hidden = state.view !== 'honor';
    $('subjects-doc').hidden = state.view !== 'subjects';
    $('yearcard-docs').hidden = state.view !== 'yearcard';
    $('recordbook-docs').hidden = state.view !== 'recordbook';
    applyPage();
    $('averaging').hidden = Boolean(text);
    if (!text) { fillAveraging(); $('avg-save').disabled = true; renderCurrent(); if (!$('grades-panel').hidden) { state.savedGradeScale = state.data.sheet.gradeScale || null; $('grades-save').disabled = true; fillGrades(); } } else $('grades-panel').hidden = true;
    updateChrome();
  }
  function setView(view) {
    if (state.view === view) return;
    var leaving = state.editing ? saveScores() : Promise.resolve();
    state.editing = false;
    leaving.then(function () { state.view = view; render(); });
  }
  function load() {
    var token = ++loadToken;
    state.data = null; render();
    if (!state.tabId || !state.classId) return Promise.resolve();
    return ui.api.get(ENTRY ? 'transcripts/entry/score-sheet' : 'transcripts/score-sheet', { tabId: state.tabId, classId: state.classId }).then(function (data) {
      if (token !== loadToken) return;
      state.data = data; state.scores = {};
      data.entries.forEach(function (e) { var tab = state.scores[e.tabId] = state.scores[e.tabId] || {}; (tab[e.studentId] = tab[e.studentId] || {})[e.subjectId] = e.score; });
    }).catch(function (error) { if (token === loadToken) show('error', error.message || 'The score sheet could not be loaded.'); })
      .then(function () { if (token === loadToken) render(); });
  }
  function reselect(change) { saveScores().then(function () { change(); pickDefaults(); show('error'); return load(); }); }

  // ---------- add / delete month and semester ----------
  // The ＋ Add panel lists the sheet's months and semesters in order; × deletes one (and its scores,
  // conduct and comments) after confirmation. Administrators only (the server refuses others).
  function renderTabChips() {
    var host = $('tab-chips'); host.textContent = '';
    var sheet = activeSheet();
    if (!sheet) return;
    sheet.tabs.forEach(function (tab) {
      host.appendChild(el('span', { class: 'chip' + (tab.type === 'SEMESTER' ? ' semester' : '') + (tab.id === state.tabId ? ' current' : ''), 'data-tab': tab.id }, [
        (tab.type === 'SEMESTER' ? '📘 ' : '📅 ') + tab.label,
        el('button', { type: 'button', title: 'Delete ' + tab.label, 'aria-label': 'Delete ' + tab.label, text: '×', onclick: function () { deleteTab(tab); } }),
      ]));
    });
    if (!sheet.tabs.length) host.appendChild(el('span', { class: 'muted small', text: 'No months or semesters yet — add the first one above.' }));
  }
  function deleteTab(tab) {
    var what = tab.type === 'SEMESTER' ? 'the semester' : 'the month';
    if (!window.confirm('Delete ' + what + ' “' + tab.label + '” with all its scores, conduct and comments? This cannot be undone.')) return;
    ui.api.delete('transcripts/tabs/' + encodeURIComponent(tab.id)).then(function () {
      if (state.tabId === tab.id) state.tabId = '';
      return loadSheets().then(function () { renderTabChips(); saved('✓ ' + tab.label + ' deleted'); return load(); });
    }).catch(function (error) { show('error', error.status === 403 ? 'Only administrators can delete months and semesters.' : error.message || 'It could not be deleted.'); });
  }
  function toggleTabPanel(open) {
    var panel = $('tab-panel');
    panel.hidden = open === undefined ? !panel.hidden : !open;
    $('add-tab').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) {
      renderTabChips();
      // open towards the side with room: from the button's left edge, or its right edge near the right side
      panel.classList.remove('align-right');
      if (panel.getBoundingClientRect().right > window.innerWidth - 8) panel.classList.add('align-right');
      if (panel.getBoundingClientRect().left < 8) panel.classList.remove('align-right');
      $('tab-name').focus();
    }
  }
  function addTab(event) {
    event.preventDefault();
    var label = $('tab-name').value.trim(), type = $('tab-type').value; if (!label || !state.sheetId) return;
    ui.api.post('transcripts/sheets/' + encodeURIComponent(state.sheetId) + '/tabs', { label: label, type: type }).then(function (tab) {
      $('tab-name').value = '';
      state.kind = type === 'SEMESTER' ? 'SEMESTER' : 'MONTHLY';
      return loadSheets().then(function () { state.tabId = tab.id; renderTabChips(); saved('✓ ' + tab.label + ' added'); return load(); });
    }).catch(function (error) { show('error', error.status === 403 ? 'Only administrators can add months and semesters.' : error.message || 'It could not be added.'); });
  }

  // ---------- CSV ----------
  function download(lines, suffix) {
    var csv = '﻿' + lines.map(function (line) { return line.map(function (cell) { var v = String(cell); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
    var link = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: (state.data.className + ' ' + state.data.tab.label + suffix).replace(/[\\/:*?"<>|]/g, '-') + '.csv' });
    document.body.appendChild(link); link.click(); link.remove();
  }
  function exportCsv() {
    if (!state.data) return;
    var figures = compute(), m = figures.model;
    if (state.view === 'ranking' && yearScope()) { var year = yearRankingRows(); download([yearRankingHead(year)].concat(ordered(year).map(yearRankingCells)), ' ចំណាត់ថ្នាក់ប្រចាំឆ្នាំ'); return; }
    if (state.view === 'ranking') { download([RANK_HEAD].concat(ordered(figures).map(rankingCells)), ' ចំណាត់ថ្នាក់'); return; }
    if (state.view === 'subjects') { download(subjectsCsv(figures), ' ចំណាត់ថ្នាក់តាមមុខវិជ្ជា'); return; }
    if (state.view === 'yearcard' || state.view === 'recordbook') { download(yearCardsCsv(), state.view === 'yearcard' ? ' ព្រឹត្តិបត្រប្រចាំឆ្នាំ' : ' សៀវភៅសិក្ខាគារិក'); return; }
    if (state.view === 'honor') {
      download([['លេខ', 'អ.ល', 'គោត្តនាម និង នាម', 'ភេទ', yearScope() ? 'ម.ឆ្នាំ' : 'ម.ភាគ', 'និទ្ទេស']].concat(honorees(yearScope() ? yearRankingRows() : figures).map(function (r) {
        return [String(r.rank), r.student.studentNumber || '', displayName(r.student), sexMark(r.student.sex), avg(r.final), r.grade ? r.grade.letter : ''];
      })), ' កិត្តិយស');
      return;
    }
    var head = ['ល.រ', 'គោត្តនាម និងនាម', 'ភេទ'].concat(m.columns.map(function (s) { return s.name; }))
      .concat(figures.semester ? ['ពិន្ទុសរុប', 'មធ្យមភាគប្រឡង', 'មធ្យមភាគប្រចាំខែ', 'មធ្យមភាគឆមាស'] : ['ពិន្ទុសរុប', 'មធ្យមភាគ'])
      .concat(['ចំណាត់ថ្នាក់', 'និទ្ទេស', 'និទ្ទេស(EN)']);
    var lines = [head].concat(ordered(figures).map(function (row, index) {
      return [String(index + 1), displayName(row.student), sexMark(row.student.sex)]
        .concat(m.columns.map(function (s) { return fmt(row.exam.scores[s.id]); }))
        .concat(figures.semester ? [fmt(row.exam.total), avg(row.sem.exam), avg(row.sem.monthly), avg(row.final)] : [fmt(row.exam.total), avg(row.final)])
        .concat([row.rank ? String(row.rank) : '', row.grade ? row.grade.kh : '', row.grade ? row.grade.letter : '']);
    }));
    download(lines, '');
  }

  // ---------- print form ----------
  function fillForm() {
    var f = state.form;
    $('t-title').value = f.title || ''; $('t-orgName').value = f.orgName || ''; $('t-place').value = f.footerText || '';
    $('t-orgName').placeholder = yearSchool().name ? yearSchool().name + ' (from Academic Years)' : 'From Academic Years';
    $('t-headerLines').value = (f.headerLines || []).join('\n'); $('t-signers').value = (f.signers || []).join('\n');
    $('t-paper').value = f.paper || 'A4'; $('t-orientation').value = f.orientation || 'landscape';
    $('p-lunar').value = f.lunarLine || ''; $('p-date').value = state.date || today();
  }
  function readForm() {
    // Spaces are kept as typed (they nudge printed text into place); blank lines are dropped.
    var lines = function (id) { return $(id).value.split(/\r?\n/).filter(function (l) { return l.trim(); }); };
    var kept = function (id) { var v = $(id).value; return v.trim() ? v : ''; };
    state.form.title = kept('t-title') || DEFAULT_FORM.title; state.form.orgName = kept('t-orgName'); state.form.footerText = $('t-place').value.trim();
    state.form.headerLines = lines('t-headerLines'); state.form.signers = lines('t-signers');
    state.form.paper = $('t-paper').value; state.form.orientation = $('t-orientation').value;
    state.form.lunarLine = kept('p-lunar'); state.date = $('p-date').value;
  }
  function applyPage() {
    // The honor roll is a portrait page, like the original; the sheet and ranking follow the print form.
    var fixed = { honor: 'A4 portrait', yearcard: 'A4 portrait', recordbook: 'A4 landscape' }[state.view];
    if (state.view === 'ranking' && !$('ranking-doc').classList.contains('flow')) fixed = (state.form.paper || 'A4') + ' ' + (state.form.orientation || 'landscape');
    $('page-style').textContent = fixed ? '@page { size: ' + fixed + '; margin: 0; }' : '@page { size: ' + (state.form.paper || 'A4') + ' ' + (state.form.orientation || 'landscape') + '; margin: 7mm; }';
    document.body.classList.toggle('no-stats', !$('p-stats').checked);
  }
  function formChanged() { readForm(); applyPage(); if (state.data && !emptyText()) renderCurrent(); }
  function saveForm() {
    readForm();
    ui.api.put('transcripts/score-sheet-print-template', state.form).then(function (form) {
      state.form = Object.assign(copy(DEFAULT_FORM), form || {}); fillForm(); applyPage(); render(); saved('✓ Print form saved');
    }).catch(function (error) { show('form-error', error.status === 403 ? 'Only administrators can save the print form; you can still print with your changes.' : error.message || 'The print form could not be saved.'); });
  }

  // ---------- events ----------
  $('sheet').addEventListener('change', function (event) { reselect(function () { state.sheetId = event.target.value; }); });
  $('class').addEventListener('change', function (event) { reselect(function () { state.classId = event.target.value; }); });
  $('tab').addEventListener('change', function (event) { reselect(function () { state.tabId = event.target.value; }); });
  $('kind-monthly').addEventListener('click', function () { if (state.kind !== 'MONTHLY') reselect(function () { state.kind = 'MONTHLY'; }); });
  $('kind-semester').addEventListener('click', function () { if (state.kind !== 'SEMESTER') reselect(function () { state.kind = 'SEMESTER'; }); });
  $('sort').addEventListener('change', function (event) { state.sort = event.target.value; render(); });
  $('avg-coefficient').addEventListener('input', averagingChanged);
  $('avg-max').addEventListener('input', averagingChanged);
  $('avg-save').addEventListener('click', saveAveraging);
  $('open-grades').addEventListener('click', function () { if ($('grades-panel').hidden) openGrades(); else closeGrades(); });
  $('grades-close').addEventListener('click', closeGrades);
  $('grades-save').addEventListener('click', function () { saveGrades(false); });
  $('grades-reset').addEventListener('click', function () { if (window.confirm('Use the ministry grade scale (A ≥ 90%, B ≥ 80%, C ≥ 70%, D ≥ 60%, E ≥ 50%) for this score sheet?')) saveGrades(true); });
  $('grades-rows').addEventListener('input', gradesChanged);
  $('view-sheet').addEventListener('click', function () { setView('sheet'); });
  $('view-ranking').addEventListener('click', function () { setView('ranking'); });
  $('view-honor').addEventListener('click', function () { setView('honor'); });
  $('view-subjects').addEventListener('click', function () { setView('subjects'); });
  // The report card needs a semester (the last one of the year).
  $('view-yearcard').addEventListener('click', function () {
    if (state.kind === 'SEMESTER') { setView('yearcard'); return; }
    reselect(function () { state.view = 'yearcard'; state.kind = 'SEMESTER'; });
  });
  $('view-recordbook').addEventListener('click', function () {
    if (state.kind === 'SEMESTER') { setView('recordbook'); return; }
    reselect(function () { state.view = 'recordbook'; state.kind = 'SEMESTER'; });
  });
  // Ranking for this month / semester, or for the whole year (needs the year's last semester).
  $('rank-scope').addEventListener('change', function (event) {
    var scope = event.target.value;
    if (scope === 'year' && state.kind !== 'SEMESTER') { reselect(function () { state.rankScope = 'year'; state.kind = 'SEMESTER'; }); return; }
    state.rankScope = scope; render();
  });
  $('card-student').addEventListener('change', function (event) { state.cardStudent = event.target.value; renderCurrent(); });
  $('edit-toggle').addEventListener('click', function () {
    state.editing = !state.editing;
    (state.editing ? Promise.resolve() : saveScores()).then(function () {
      render();
      if (state.editing) { var first = document.querySelector('table.sheet input'); if (first) first.focus(); }
    });
  });
  $('add-tab').addEventListener('click', function () { toggleTabPanel(); });
  $('tab-form').addEventListener('submit', addTab);
  $('open-setup').addEventListener('click', function () { saveScores().then(openSetup); });
  $('tab-university').addEventListener('click', function () { saveScores().then(function () { ui.navigate(ENTRY ? 'university-entry' : 'university-sheets', ENTRY ? { entry: '1' } : {}); }); });
  $('close-setup').addEventListener('click', function () { $('setup').hidden = true; });
  $('new-sheet').addEventListener('click', function () { editSheet(null); $('f-name').focus(); });
  // a new sheet's type decides which classes it can take
  Array.prototype.forEach.call(document.querySelectorAll('input[name="f-kind"]'), function (radio) { radio.addEventListener('change', function () { renderSetup(); }); });
  $('sheet-form').addEventListener('submit', saveSheet);
  $('add-subject').addEventListener('click', addSubject);
  $('delete-sheet').addEventListener('click', function () {
    var sheet = sheetById(state.editingSheet);
    if (!sheet || !window.confirm('Delete the score sheet ' + sheet.name + ' with all its months, scores and comments?')) return;
    ui.api.delete('transcripts/sheets/' + encodeURIComponent(sheet.id)).then(function () { state.editingSheet = null; if (state.sheetId === sheet.id) state.sheetId = ''; return refreshAll(); })
      .catch(function (error) { setupError(error, 'The score sheet could not be deleted.'); });
  });
  ['period-start', 'period-end'].forEach(function (id) { $(id).addEventListener('input', function () { $('save-period').disabled = false; }); });
  $('save-period').addEventListener('click', savePeriod);
  $('open-form').addEventListener('click', function () { var editor = $('form-editor'); editor.hidden = !editor.hidden; if (!editor.hidden) { fillForm(); show('form-error'); } });
  $('close-form').addEventListener('click', function () { $('form-editor').hidden = true; });
  $('save-form').addEventListener('click', saveForm);
  ['t-title', 't-orgName', 't-place', 't-headerLines', 't-signers', 't-paper', 't-orientation', 'p-lunar', 'p-date', 'p-stats'].forEach(function (id) {
    $(id).addEventListener(id.indexOf('t-paper') === 0 || id === 't-orientation' || id === 'p-stats' || id === 'p-date' ? 'change' : 'input', formChanged);
  });
  $('export').addEventListener('click', exportCsv);
  // Editing the header on the page.
  $('edit-header').addEventListener('click', function () { if (state.headerEditing) cancelHeader(); else setHeaderEditing(true); });
  $('header-save').addEventListener('click', saveHeader);
  $('header-cancel').addEventListener('click', cancelHeader);
  // Formatting: pick a block by clicking it, then align / font / size / colour / bold.
  FONTS.forEach(function (font) { var option = el('option', { value: font, text: font }); option.style.fontFamily = '"' + font + '"'; $('style-font').appendChild(option); });
  document.addEventListener('mousedown', function (event) {
    if (!state.headerEditing) return;
    var node = event.target && event.target.closest ? event.target.closest('.doc [data-block]') : null;
    if (node) selectBlock(node.getAttribute('data-block'));
  });
  document.addEventListener('focusin', function (event) {
    if (!state.headerEditing) return;
    var node = event.target && event.target.closest ? event.target.closest('.doc [data-block]') : null;
    if (node && node.getAttribute('data-block') !== state.styleTarget) selectBlock(node.getAttribute('data-block'));
  });
  Array.prototype.forEach.call(document.querySelectorAll('#style-bar [data-align]'), function (button) {
    button.addEventListener('click', function () { var align = button.getAttribute('data-align'); changeStyle(function (s) { s.align = s.align === align ? '' : align; }); });
  });
  $('style-font').addEventListener('change', function (event) { changeStyle(function (s) { s.font = event.target.value; }); });
  $('style-size').addEventListener('input', function (event) {
    var size = Number(event.target.value);
    var ok = event.target.value === '' || (size >= 6 && size <= 48);
    event.target.classList.toggle('invalid', !ok);
    if (ok) changeStyle(function (s) { s.size = event.target.value === '' ? '' : size; });
  });
  $('style-color').addEventListener('input', function (event) { changeStyle(function (s) { s.color = event.target.value; }); });
  $('style-bold').addEventListener('click', function () { changeStyle(function (s) { s.bold = s.bold === true ? false : true; }); });
  // Ready-made symbols for under the motto (or type any text on the page).
  $('symbol-picker').addEventListener('change', function (event) {
    var value = event.target.value; event.target.value = '';
    if (value === '' ) return;
    state.form.ornament = value === 'none' ? '' : value;
    renderCurrent(); selectBlock('ornament');
  });
  $('style-reset').addEventListener('click', function () { changeStyle(function (s) { Object.keys(s).forEach(function (k) { delete s[k]; }); }); });
  document.addEventListener('input', function (event) {
    var node = event.target && event.target.closest ? event.target.closest('[data-edit]') : null;
    if (node && state.headerEditing) readEditable(node);
  });
  document.addEventListener('keydown', function (event) {
    var node = event.target && event.target.closest ? event.target.closest('[data-edit]') : null;
    if (!node || !state.headerEditing) return;
    if (event.key === 'Escape') { event.preventDefault(); cancelHeader(); }
    else if (event.key === 'Enter' && !node.hasAttribute('data-multi')) { event.preventDefault(); node.blur(); }
  });
  // Pasted text arrives as plain text (no fonts or colours from Word or Excel).
  document.addEventListener('paste', function (event) {
    var node = event.target && event.target.closest ? event.target.closest('[data-edit]') : null;
    if (!node || !state.headerEditing) return;
    event.preventDefault();
    var pasted = (event.clipboardData && event.clipboardData.getData('text/plain')) || '';
    document.execCommand('insertText', false, node.hasAttribute('data-multi') ? pasted : pasted.replace(/\s+/g, ' '));
  });
  $('print').addEventListener('click', function () { saveScores().then(function () { fitPages(); applyPage(); window.print(); }); });
  window.addEventListener('beforeprint', function () { fitPages(); applyPage(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitPages(); applyZoom(); });

  $('zoom').addEventListener('change', applyZoom);
  ['rb-part-cover', 'rb-part-guidance', 'rb-part-info', 'rb-part-results'].forEach(function (id) { $(id).addEventListener('change', function () { renderCurrent(); }); });
  var resizeTimer = null;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(applyZoom, 120); });
  Array.prototype.forEach.call(document.querySelectorAll('#more-menu .menu-list button'), function (item) {
    item.addEventListener('click', function () { $('more-menu').open = false; });
  });
  document.addEventListener('click', function (event) { var menu = $('more-menu'); if (menu.open && !menu.contains(event.target)) menu.open = false; });
  ui.autoResize();
  ui.connect().then(function (context) {
    var query = context.query || {};
    ENTRY = query.entry === '1';
    // Enter Scores: "Edit the score sheets' header & footer" brings back the menu with that one item
    var granted = Array.isArray(context.permissions) ? context.permissions : null;
    document.body.classList.toggle('can-edit-header', ENTRY && (!granted || granted.indexOf('wattanam.academic-management.transcripts.print') >= 0));
    if (ENTRY) $('kind-tabs').hidden = true;
    document.body.classList.toggle('entry-mode', ENTRY);
    return Promise.all([loadSheets(), ui.api.get(ENTRY ? 'transcripts/entry/print-template' : 'transcripts/score-sheet-print-template').catch(function () { return {}; })]).then(function (results) {
      state.form = Object.assign(copy(DEFAULT_FORM), results[1] || {});
      if (query.sheetId && state.sheets.some(function (s) { return s.id === query.sheetId; })) state.sheetId = query.sheetId;
      if (query.kind === 'SEMESTER') state.kind = 'SEMESTER';
      if (['ranking', 'honor', 'subjects', 'yearcard', 'recordbook'].indexOf(query.view) >= 0) state.view = query.view;
      if ((query.view === 'yearcard' || query.view === 'recordbook') && query.kind !== 'MONTHLY') state.kind = 'SEMESTER';
      if (query.scope === 'year') { state.rankScope = 'year'; state.kind = 'SEMESTER'; }
      if (query.setup) setTimeout(openSetup, 0);
      // The subject ranking is first of all the semester sheet.
      if (query.view === 'subjects' && query.kind !== 'MONTHLY') state.kind = 'SEMESTER';
      pickDefaults();
      if (query.classId && activeSheet() && activeSheet().classIds.indexOf(query.classId) >= 0) state.classId = query.classId;
      applyPage();
      // University score sheets live on their own page: link to it, and in Enter Scores go straight there
      // when the caller's classes only use university sheets.
      ui.api.get(ENTRY ? 'transcripts/entry/sheets' : 'transcripts/sheets', { kind: 'UNIVERSITY' }).then(function (result) {
        var university = rows(ENTRY ? result && result.sheets : result);
        // a teacher sees the University tab only when one of their classes uses a university sheet
        if (ENTRY) $('kind-tabs').hidden = !university.length;
        var classInUniversity = query.classId && university.some(function (s) { return s.classIds.indexOf(query.classId) >= 0; }) && !state.sheets.some(function (s) { return s.classIds.indexOf(query.classId) >= 0; });
        if (ENTRY && !query.stay && university.length && (classInUniversity || !state.sheets.length)) ui.navigate('university-entry', query.classId ? { entry: '1', classId: query.classId } : { entry: '1' });
      }).catch(function () {});
      return load();
    });
  }).catch(function (error) { show('error', error.message || 'Score sheets could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); render(); });
})();
