/* Progress Books (សៀវភៅតាមដានការសិក្សា): the Student Progress and Communication Book, printed on B5.
 * One book per student: cover, internal rules, student information and ten monthly pages
 * (subject scores with the book's four grades ticked, total, average, rank, absences, the class
 * teacher's comment and room for the director's approval and the parents' comment).
 * Scores, coefficients (មេគុណ) and the grade scale come from the score sheet, like Score Sheets.
 * Plugin API: transcripts/sheets, classes, transcripts/progress-book, transcripts/progress-book-template. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var M = window.WattanamScoreMath;
  var KH_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
  var MONTH_PAGES = 10, SUBJECT_ROWS = 15;
  var DEFAULT_GRADES = [{ label: 'ល្អ', min: 80 }, { label: 'ល្អបង្គួរ', min: 65 }, { label: 'មធ្យម', min: 50 }, { label: 'ខ្សោយ', min: 0 }];
  // The internal rules printed when the school has not written its own (same as the server default).
  var DEFAULT_RULES = [
    '១.សម្លៀកបំពាក់ ការតុបតែងខ្លួន និងអនាម័យ',
    '-សិស្សទាំងអស់ត្រូវមានសម្លៀកបំពាក់ស្អាតជានិច្ច សិស្សប្រុសត្រូវស្លៀកពាក់អាវសបើកកសិតក្នុងខោវែងខៀវចាស់ រីឯសិស្សនារីត្រូវស្លៀកពាក់អាវសសិតក្នុងសំពត់ខៀវចាស់ក្រោមជង្គង់។ នៅលើទ្រូងអាវផ្នែកខាងលើហោប៉ៅអាវ ត្រូវប៉ាក់ឈ្មោះគ្រឹះស្ថានសិក្សា ឈ្មោះថ្នាក់ និងឈ្មោះសាមីខ្លួន។',
    '-សិស្សប្រុសត្រូវកាត់សក់ខ្លី រីឯសិស្សស្រីត្រូវសិតសក់ ដាក់បួ ឬចង ឬក្រង ឬកាត់សក់ខ្លីត្រឹមស្មា។',
    '-ការតុបតែងខ្លួនឲ្យឆើតឆាយ និងពាក់គ្រឿងអលង្ការផ្សេងៗ ដូចជាៈ សិស្សប្រុសពាក់ក្រវិល សិស្សស្រីពាក់ចង្រង់ជើងនៅកជើង ដាំក្បូននៅធ្មេញ លាបក្រចកដៃ លាបក្រចកជើង លាបសក់ពណ៌ផ្សេងៗ ដាក់មុខ លាបក្រែម និងពាក់ស្បែកជើងមិនសមរម្យត្រូវហាមឃាត់។',
    '២.អវត្តមាន និងលទ្ធផល',
    '-ប្រភេទទី១: ឈប់អត់ច្បាប់លើសពី៣០ដងឡើងទៅ',
    '-ប្រភេទទី២: ឈប់អត់ច្បាប់ និងមានច្បាប់លើសពី៤០ដងឡើងទៅ',
    '-ប្រភេទទី៣: ឈប់មានច្បាប់លើសពី៥៥ដងឡើងទៅ',
    '*ចំពោះសិស្ស៣ប្រភេទខាងលើ៖',
    '- បើជាប់មធ្យមភាគពិន្ទុប្រចាំឆ្នាំ ត្រូវបានអនុញ្ញាតឲ្យប្រឡងឡើងថ្នាក់',
    '- បើធ្លាក់មធ្យមភាគពិន្ទុប្រចាំឆ្នាំ ត្រូវរៀនត្រួតថ្នាក់',
    '*ចំពោះសិស្សដែលឈប់អត់ច្បាប់ លើសពី៥៥ដង ត្រូវលុបឈ្មោះចេញពីបញ្ជីរបស់គ្រឹះស្ថានសិក្សា។',
  ];
  var state = { sheets: [], classes: [], sheetId: '', classId: '', studentId: '', data: null, form: {}, mode: 'a4' };
  try { var savedMode = window.localStorage.getItem('progress-book-print-mode'); if (['a4', 'b4', 'single'].indexOf(savedMode) >= 0) state.mode = savedMode; } catch (e) { /* no storage */ }
  var loadToken = 0;

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) {
      var value = attributes[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'text') node.textContent = value; else node.setAttribute(key, value === true ? '' : String(value));
    });
    (children || []).forEach(function (child) { if (child !== null && child !== undefined) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function rows(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  var savedTimer = null;
  function saved(text, bad) {
    var node = $('saved'); node.textContent = text; node.hidden = false; node.classList.toggle('bad', Boolean(bad));
    clearTimeout(savedTimer); savedTimer = setTimeout(function () { node.hidden = true; }, bad ? 6000 : 2200);
  }
  function khDigits(value) { return String(value).replace(/[0-9]/g, function (d) { return '០១២៣៤៥៦៧៨៩'[Number(d)]; }); }
  function fmt(value) { return value === null || value === undefined ? '' : Number.isInteger(Number(value)) ? String(value) : Number(value).toFixed(2); }
  function khDate(value) {
    if (!value) return '';
    var p = String(value).slice(0, 10).split('-');
    return 'ថ្ងៃទី' + khDigits(Number(p[2])) + ' ខែ' + KH_MONTHS[Number(p[1]) - 1] + ' ឆ្នាំ' + khDigits(p[0]);
  }
  function sexText(sex) { return sex === 'FEMALE' ? 'ស្រី' : sex === 'MALE' ? 'ប្រុស' : ''; }
  // A dotted field: label, then the value written on a dotted line.
  function field(label, value, size) {
    return el('p', { class: 'field' }, [el('span', { class: 'k', text: label }), el('span', { class: 'v' + (size ? ' ' + size : ''), text: value || '' })]);
  }
  function line(parts) { return el('div', { class: 'field' }, parts.map(function (p) { return p[0] === 'k' ? el('span', { class: 'k', text: p[1] }) : el('span', { class: 'v' + (p[2] ? ' ' + p[2] : ''), text: p[1] || '' }); })); }

  // Registration fields by label (the school's own fields): father, mother, place of birth, phone.
  function custom(student, test) {
    var fields = (state.data && state.data.customFields) || [];
    var values = student.customFieldValues || {};
    var hits = fields.filter(function (f) { return test(String(f.label || '') + ' ' + String(f.key || '')); })
      .map(function (f) { var v = values[f.key]; return Array.isArray(v) ? v.join(', ') : v; })
      .filter(function (v) { return v !== undefined && v !== null && String(v).trim(); });
    return hits.join(' · ');
  }
  function parent(student, who) {
    var person = who === 'father' ? /ឪពុក|father/i : /ម្តាយ|ម្ដាយ|mother/i;
    var job = /មុខរបរ|occupation|job|work/i;
    var name = custom(student, function (s) { return person.test(s) && !job.test(s) && !/ទូរស័ព្ទ|phone/i.test(s); });
    var work = custom(student, function (s) { return person.test(s) && job.test(s); });
    return [name, work].filter(Boolean).join('   ');
  }
  function placeOfBirth(student) { return custom(student, function (s) { return /ទីកន្លែងកំណើត|place\s*of\s*birth|birth\s*place|birthplace/i.test(s); }); }
  function phone(student) { return student.guardianPhone || custom(student, function (s) { return /ទូរស័ព្ទ|phone/i.test(s); }) || student.phone || ''; }

  // ---------- figures ----------
  function model() { var d = state.data; return M.model(d.subjects, { coefficient: d.sheet.coefficient, averageMax: d.sheet.averageMax, grades: d.sheet.gradeScale }); }
  function bookGrades() { var g = state.form.bookGrades; return Array.isArray(g) && g.length === 4 ? g : DEFAULT_GRADES; }
  function bookGradeIndex(score, max) {
    if (score === null || score === undefined || !(Number(max) > 0)) return -1;
    var pct = Number(score) / Number(max) * 100, grades = bookGrades();
    for (var i = 0; i < grades.length; i += 1) if (pct >= Number(grades[i].min) - 1e-9) return i;
    return grades.length - 1;
  }
  // Per month: every student's result and their rank in the class.
  function monthFigures() {
    var d = state.data, m = model(), scores = {};
    d.entries.forEach(function (e) { var t = scores[e.tabId] = scores[e.tabId] || {}; (t[e.studentId] = t[e.studentId] || {})[e.subjectId] = e.score; });
    var byMonth = {};
    d.months.forEach(function (month) {
      var results = {};
      d.students.forEach(function (s) { results[s.id] = M.result(m, (scores[month.id] || {})[s.id] || {}); });
      var ranks = M.ranks(d.students.map(function (s) { return { id: s.id, value: results[s.id].average }; }));
      byMonth[month.id] = { results: results, ranks: ranks };
    });
    var remarks = {}; (d.remarks || []).forEach(function (r) { remarks[r.tabId + ':' + r.studentId] = r; });
    var absences = {}; (d.absences || []).forEach(function (a) { absences[a.tabId + ':' + a.studentId] = a; });
    return { model: m, byMonth: byMonth, remarks: remarks, absences: absences };
  }

  // ---------- pages ----------
  // The school: the book's own name, else the academic year's (Academic Years); its uploaded logo.
  function yearSchool() { return (state.data && state.data.school) || {}; }
  function schoolName() { return state.form.orgName || yearSchool().name || ''; }
  function yearLogo() { var logo = yearSchool().logoUrl || ''; return /^data:image\//.test(logo) ? logo : ''; }
  function header(page) {
    page.appendChild(el('div', { class: 'motto' }, (state.form.mottoLines || []).map(function (l) { return el('p', { text: l }); })));
    if (state.form.ornament) page.appendChild(el('p', { class: 'ornament', text: state.form.ornament }));
  }
  function pageFor(kind, student) {
    var page = el('section', { class: 'page ' + kind, 'data-page': kind, 'data-student': student.id });
    page.appendChild(el('span', { class: 'who', text: (student.nameKh || student.name) + ' · ' + kind }));
    return page;
  }
  function coverPage(student) {
    var d = state.data, f = state.form, page = pageFor('cover', student), frame = el('div', { class: 'frame' });
    page.appendChild(frame);
    header(frame);
    var lines = f.headerLines || [];
    if (lines[0]) frame.appendChild(el('p', { class: 'dept', text: lines[0] }));
    lines.slice(1).forEach(function (l) { frame.appendChild(el('p', { class: 'level', text: l })); });
    frame.appendChild(field('អនុវិ./វិទ្យាល័យ: ', schoolName()));
    if (yearLogo()) frame.appendChild(el('img', { class: 'cover-logo', src: yearLogo(), alt: '' }));
    frame.appendChild(el('p', { class: 'book-title', text: f.title || 'សៀវភៅតាមដានការសិក្សា' }));
    frame.appendChild(el('p', { class: 'year', text: 'ឆ្នាំសិក្សា: ' + (d.studyYear ? khDigits(d.studyYear.replace(/\s*-\s*/, ' - ')) : '............ - ............') }));
    var who = el('div', { class: 'student' });
    who.appendChild(line([['k', 'សិស្សឈ្មោះ:'], ['v', student.nameKh || student.name], ['k', 'ភេទ'], ['v', sexText(student.sex), 'short'], ['k', 'ថ្នាក់ទី'], ['v', d.className, 'short']]));
    who.appendChild(field('ថ្ងៃខែឆ្នាំកំណើត:', khDate(student.dateOfBirth)));
    who.appendChild(field('ទីកន្លែងកំណើត:', placeOfBirth(student)));
    who.appendChild(el('div', { class: 'blank-line' }));
    frame.appendChild(who);
    return page;
  }
  function rulesPage(student) {
    var page = pageFor('rules', student);
    page.appendChild(el('h2', { text: 'សម្រង់បទបញ្ជាផ្ទៃក្នុង' }));
    if (state.form.ornament) page.appendChild(el('p', { class: 'ornament', text: state.form.ornament }));
    (state.form.rulesLines || []).forEach(function (l) {
      var heading = /^\s*[០-៩0-9]+\s*[.។]/.test(l);
      page.appendChild(el('p', { class: heading ? 'rule-head' : 'rule', text: l }));
    });
    return page;
  }
  function infoPage(student) {
    var f = state.form, page = pageFor('info', student);
    var top = el('div', { class: 'info-top' }), left = el('div');
    header(left);
    left.appendChild(el('p', { class: 'book-title', text: f.title || 'សៀវភៅតាមដានការសិក្សា' }));
    var photo = el('div', { class: 'photo' });
    if (student.photo) {
      var img = el('img', { alt: '' });
      img.onerror = function () { photo.textContent = 'រូបថត ៣x៤'; };
      img.setAttribute('src', student.photo); photo.appendChild(img);
    } else photo.textContent = 'រូបថត ៣x៤';
    top.appendChild(left); top.appendChild(photo); page.appendChild(top);
    page.appendChild(line([['k', 'សិស្សឈ្មោះ:'], ['v', student.nameKh || student.name], ['k', 'ជាអក្សរឡាតាំង'], ['v', String(student.name || '').toUpperCase()]]));
    page.appendChild(field('ថ្ងៃខែឆ្នាំកំណើត:', khDate(student.dateOfBirth)));
    page.appendChild(field('ទីកន្លែងកំណើត:', placeOfBirth(student)));
    page.appendChild(el('div', { class: 'blank-line' }));
    page.appendChild(field('ឈ្មោះ និងមុខរបរឪពុក:', parent(student, 'father')));
    page.appendChild(el('div', { class: 'blank-line' }));
    page.appendChild(field('ឈ្មោះ និងមុខរបរម្តាយ:', parent(student, 'mother')));
    page.appendChild(el('div', { class: 'blank-line' }));
    if (student.address) {
      page.appendChild(field('អាសយដ្ឋានសព្វថ្ងៃ:', student.address));
      page.appendChild(el('div', { class: 'blank-line' }));
    } else {
      page.appendChild(line([['k', 'អាសយដ្ឋានសព្វថ្ងៃ: ផ្ទះលេខ'], ['v', ''], ['k', 'ផ្លូវលេខ'], ['v', ''], ['k', 'ក្រុមទី'], ['v', '']]));
      page.appendChild(line([['k', 'សង្កាត់'], ['v', ''], ['k', 'ខណ្ឌ'], ['v', ''], ['k', f.footerText ? 'រាជធានី/ខេត្ត ' + f.footerText : 'រាជធានី/ខេត្ត'], ['v', '']]));
    }
    page.appendChild(field('ទូរស័ព្ទទាក់ទងជាមួយឪពុកម្តាយ ឬអាណាព្យាបាល:', phone(student)));
    var g = bookGrades();
    page.appendChild(el('p', { class: 'note' }, [el('b', { text: 'សម្គាល់៖ ការវាយតម្លៃការសិក្សា' }), el('br'),
      'និទ្ទេស' + g[0].label + ' ពិន្ទុចាប់ពី' + khDigits(g[0].min) + '%  ' + g[1].label + ' ចាប់ពី' + khDigits(g[1].min) + '%  ' + g[2].label + ' ចាប់ពី' + khDigits(g[2].min) + '%  និង' + g[3].label + 'ក្រោម' + khDigits(g[2].min) + '%']));
    return page;
  }
  function monthPage(student, month, figures) {
    var f = state.form, m = figures.model, page = pageFor('month', student);
    page.appendChild(el('h2', { text: 'ពិន្ទុ ចំណាត់ថ្នាក់ ប្រចាំខែ ' + (month ? month.label : '.....................') }));
    var grades = bookGrades();
    var head = [
      el('tr', {}, [el('th', { rowspan: '3', text: 'ល.រ' }), el('th', { rowspan: '3', text: 'មុខវិជ្ជា' }), el('th', { colspan: '6', text: 'លទ្ធផលនៃការសិក្សា' })]),
      el('tr', {}, [el('th', { colspan: '2', text: 'ពិន្ទុ' }), el('th', { colspan: '4', text: 'និទ្ទេស' })]),
      el('tr', {}, [el('th', { text: 'អតិបរមា' }), el('th', { text: 'ពិន្ទុខែ' })].concat(grades.map(function (g) { return el('th', { text: g.label }); }))),
    ];
    var result = month ? figures.byMonth[month.id].results[student.id] : null;
    var body = el('tbody');
    var subjects = m.counted;
    for (var i = 0; i < Math.max(SUBJECT_ROWS, subjects.length); i += 1) {
      var s = subjects[i], score = s && result ? result.scores[s.id] : null, at = s ? bookGradeIndex(score, s.maxScore) : -1;
      body.appendChild(el('tr', {}, [el('td', { text: khDigits(i + 1) }), el('td', { class: 'subject', text: s ? s.name : '' }),
        el('td', { text: s ? fmt(s.maxScore) : '' }), el('td', { class: 'score', text: fmt(score) })]
        .concat(grades.map(function (g, gi) { return el('td', { class: 'tick', text: at === gi ? '✓' : '' }); }))));
    }
    page.appendChild(el('table', {}, [el('thead', {}, head), body]));
    var rank = month && result && result.hasScores ? figures.byMonth[month.id].ranks[student.id] : null;
    var totals = el('div', { class: 'totals' }, [
      field('ពិន្ទុសរុប', result && result.hasScores ? fmt(result.total) : ''),
      field('មធ្យមភាគ', result && result.hasScores ? fmt(result.average) : ''),
      field('ចំណាត់ថ្នាក់', rank ? String(rank) : ''),
    ]);
    page.appendChild(totals);
    var abs = month ? figures.absences[month.id + ':' + student.id] : null;
    var known = month && month.periodStart && month.periodEnd;
    page.appendChild(line([['k', 'អវត្តមានៈ  មានច្បាប់'], ['v', known ? String(abs ? abs.excused : 0) : '', 'short'], ['k', 'ដង   គ្មានច្បាប់'], ['v', known ? String(abs ? abs.unexcused : 0) : '', 'short'], ['k', 'ដង']]));
    var signers = f.signers && f.signers.length ? f.signers : ['នាយកសាលា', 'មូលវិចារណ៍គ្រូទទួលបន្ទុកថ្នាក់', 'មតិរបស់មាតាបិតា-អាណាព្យាបាលសិស្ស'];
    var remark = month ? figures.remarks[month.id + ':' + student.id] : null;
    var comment = remark ? [remark.conduct, remark.comment].filter(Boolean).join(' — ') : '';
    var place = f.footerText ? f.footerText + ' ' : '';
    page.appendChild(el('div', { class: 'signs' }, [
      el('div', { class: 'col' }, [el('p', { text: 'បានឃើញ និងឯកភាព' }), el('p', { text: 'ថ្ងៃ..........ខែ..........ឆ្នាំ..........ព.ស.២៥៦....' }), el('p', { class: 'role', text: signers[0] || '' })]),
      el('div', { class: 'col' }, [el('p', { text: place + 'ថ្ងៃទី.......ខែ.......ឆ្នាំ២០២....' }), el('p', { class: 'role', text: signers[1] || '' }),
        el('p', { class: 'comment', text: comment }), el('p', { class: 'comment', text: '' })]),
    ]));
    page.appendChild(el('div', { class: 'parents' }, [el('p', { class: 'role', text: signers[2] || '' }), el('p', { class: 'comment', text: '' }), el('p', { class: 'comment', text: '' })]));
    return page;
  }
  function students() {
    var all = state.data ? state.data.students : [];
    return state.studentId ? all.filter(function (s) { return s.id === state.studentId; }) : all;
  }
  function render() {
    renderSelectors();
    var book = $('book'); book.textContent = '';
    var text = emptyText();
    show('empty', text); book.hidden = Boolean(text);
    var d = state.data;
    show('months-note', !text ? (d.months.length
      ? 'Monthly pages: ' + d.months.map(function (m) { return m.label; }).join(', ') + (d.months.length < MONTH_PAGES ? ' — the other ' + (MONTH_PAGES - d.months.length) + ' pages are blank for the months still to come.' : '.')
        + (d.months.some(function (m) { return !(m.periodStart && m.periodEnd); }) ? ' Absences are counted only for months with a period (set them in Score Sheets, next to the month).' : '')
      : 'This score sheet has no months yet, so the ten monthly pages are blank.') : '');
    if (text) return;
    var figures = monthFigures(), booklet = state.mode !== 'single', sheetsPerBook = 0;
    book.classList.toggle('booklet', booklet);
    students().forEach(function (student) {
      var pages = [];
      if ($('part-cover').checked) pages.push(coverPage(student));
      if ($('part-rules').checked) pages.push(rulesPage(student));
      if ($('part-info').checked) pages.push(infoPage(student));
      if ($('part-months').checked) for (var i = 0; i < MONTH_PAGES; i += 1) pages.push(monthPage(student, d.months[i] || null, figures));
      if (!booklet) { pages.forEach(function (p) { book.appendChild(p); }); return; }
      sheetsPerBook = imposeBooklet(book, pages, student);
    });
    $('page-style').textContent = state.mode === 'a4' ? '@page { size: A4 landscape; margin: 0; }'
      : state.mode === 'b4' ? '@page { size: B4 landscape; margin: 0; }'
      : '@page { size: ' + (state.form.paper || 'B5') + ' portrait; margin: 0; }';
    show('booklet-note', booklet && sheetsPerBook
      ? 'Booklet: ' + sheetsPerBook + ' sheet' + (sheetsPerBook === 1 ? '' : 's') + ' (' + sheetsPerBook * 2 + ' printed sides) per student. Print double-sided, “flip on short edge”, at 100% (no scaling); then fold the sheets in half together and staple on the fold.'
      : '');
  }

  // A fold-and-staple booklet: the book's pages, padded with blank pages to a multiple of four (the last
  // one is the back cover), placed two to a side so that, printed double-sided and folded, they read in order.
  // Side k of n/2 holds pages (n - k, k + 1) on even sides and (k + 1, n - k) on odd ones (numbered from 1).
  function imposeBooklet(book, pages, student) {
    var n = Math.max(4, Math.ceil(pages.length / 4) * 4);
    while (pages.length < n) pages.push(el('section', { class: 'page blank', 'data-page': 'blank', 'data-student': student.id }));
    for (var k = 0; k < n / 2; k += 1) {
      var pair = k % 2 === 0 ? [n - k, k + 1] : [k + 1, n - k];
      var side = el('div', { class: 'sheet ' + state.mode, 'data-student': student.id }, pair.map(function (number) {
        return el('div', { class: 'slot' }, [pages[number - 1], el('span', { class: 'page-no', text: String(number) })]);
      }));
      side.appendChild(el('span', { class: 'side-label', text: (student.nameKh || student.name) + ' · sheet ' + (Math.floor(k / 2) + 1) + (k % 2 ? ' · back' : ' · front') }));
      book.appendChild(side);
    }
    return n / 4;
  }

  // ---------- selection & data ----------
  function activeSheet() { return state.sheets.filter(function (s) { return s.id === state.sheetId; })[0] || null; }
  function className(id) { var c = state.classes.filter(function (item) { return item.id === id; })[0]; return c ? c.name : ''; }
  function renderSelectors() {
    var sheetSelect = $('sheet'); sheetSelect.textContent = '';
    if (!state.sheets.length) sheetSelect.appendChild(el('option', { value: '', text: 'No score sheets yet' }));
    state.sheets.forEach(function (s) { sheetSelect.appendChild(el('option', { value: s.id, text: s.name })); });
    sheetSelect.value = state.sheetId;
    var sheet = activeSheet(), classSelect = $('class'); classSelect.textContent = '';
    ((sheet && sheet.classIds) || []).forEach(function (id) { classSelect.appendChild(el('option', { value: id, text: className(id) || id })); });
    classSelect.value = state.classId;
    var studentSelect = $('student'); studentSelect.textContent = '';
    var list = state.data ? state.data.students : [];
    studentSelect.appendChild(el('option', { value: '', text: 'All students (' + list.length + ')' }));
    list.forEach(function (s) { studentSelect.appendChild(el('option', { value: s.id, text: (s.studentNumber ? s.studentNumber + ' · ' : '') + (s.nameKh || s.name) })); });
    studentSelect.value = state.studentId;
    $('print').disabled = !(state.data && list.length);
  }
  function emptyText() {
    var sheet = activeSheet();
    if (!sheet) return state.sheets.length ? 'Choose a score sheet.' : 'No score sheets yet. Create one in Score Sheets → ⋯ More → ⚙️ Subjects & classes.';
    if (!sheet.classIds.length) return 'This score sheet has no classes yet.';
    if (!state.data) return 'Loading…';
    if (!state.data.students.length) return 'No students in this class.';
    return '';
  }
  function load() {
    var token = ++loadToken;
    state.data = null; render();
    if (!state.sheetId || !state.classId) return Promise.resolve();
    return ui.api.get('transcripts/progress-book', { sheetId: state.sheetId, classId: state.classId }).then(function (data) {
      if (token !== loadToken) return;
      state.data = data;
      if (state.studentId && !data.students.some(function (s) { return s.id === state.studentId; })) state.studentId = '';
      // One book on screen at a time keeps the page quick; "All students" is there for printing.
      if (!state.studentId && data.students.length) state.studentId = data.students[0].id;
    }).catch(function (error) { if (token === loadToken) show('error', error.message || 'The books could not be loaded.'); })
      .then(function () { if (token === loadToken) render(); });
  }
  function pickDefaults() {
    var sheet = activeSheet();
    if (!sheet) { state.classId = ''; return; }
    if (sheet.classIds.indexOf(state.classId) < 0) state.classId = sheet.classIds[0] || '';
  }

  // ---------- settings ----------
  function fillSettings() {
    var f = state.form;
    $('f-headerLines').value = (f.headerLines || []).join('\n'); $('f-mottoLines').value = (f.mottoLines || []).join('\n');
    $('f-orgName').value = f.orgName || '';
    $('f-orgName').placeholder = yearSchool().name ? yearSchool().name + ' (from Academic Years)' : 'From Academic Years'; $('f-title').value = f.title || ''; $('f-ornament').value = f.ornament || ''; $('f-place').value = f.footerText || '';
    $('f-signers').value = (f.signers || []).join('\n'); $('f-rules').value = (f.rulesLines || []).join('\n');
    var host = $('f-grades'); host.textContent = '';
    bookGrades().forEach(function (g, i) {
      var label = el('input', { 'data-grade': String(i), 'data-field': 'label', 'aria-label': 'Grade ' + (i + 1) }); label.value = g.label;
      var min = i === 3 ? el('span', { text: 'below ' + bookGrades()[2].label }) : el('input', { class: 'min', type: 'number', min: '0', max: '100', step: 'any', 'data-grade': String(i), 'data-field': 'min', 'aria-label': 'From %' });
      if (i !== 3) min.value = String(g.min);
      host.appendChild(el('tr', {}, [el('td', {}, [label]), el('td', {}, [min])]));
    });
    show('settings-error');
  }
  function readSettings() {
    var lines = function (id) { return $(id).value.split(/\r?\n/).filter(function (l) { return l.trim(); }); };
    var kept = function (id) { var v = $(id).value; return v.trim() ? v : ''; };
    var grades = [0, 1, 2, 3].map(function (i) {
      var label = document.querySelector('#f-grades [data-grade="' + i + '"][data-field="label"]').value;
      var minInput = document.querySelector('#f-grades [data-grade="' + i + '"][data-field="min"]');
      return { label: label, min: minInput ? Number(minInput.value) : 0 };
    });
    return Object.assign({}, state.form, {
      headerLines: lines('f-headerLines'), mottoLines: lines('f-mottoLines'), orgName: kept('f-orgName'), title: kept('f-title') || 'សៀវភៅតាមដានការសិក្សា',
      ornament: kept('f-ornament'), footerText: $('f-place').value.trim(), signers: lines('f-signers'), rulesLines: lines('f-rules'), bookGrades: grades,
    });
  }
  function saveSettings() {
    var next = readSettings();
    ui.api.put('transcripts/progress-book-template', next).then(function (form) {
      state.form = form; fillSettings(); render(); saved('✓ Book settings saved');
    }).catch(function (error) { show('settings-error', error.status === 403 ? 'Only administrators can change the book settings.' : error.message || 'The book settings were not saved.'); });
  }

  // ---------- events ----------
  $('sheet').addEventListener('change', function (event) { state.sheetId = event.target.value; state.studentId = ''; pickDefaults(); load(); });
  $('class').addEventListener('change', function (event) { state.classId = event.target.value; state.studentId = ''; load(); });
  $('student').addEventListener('change', function (event) { state.studentId = event.target.value; render(); });
  $('print-mode').value = state.mode;
  $('print-mode').addEventListener('change', function (event) {
    state.mode = event.target.value;
    try { window.localStorage.setItem('progress-book-print-mode', state.mode); } catch (e) { /* no storage */ }
    render();
  });
  ['part-cover', 'part-rules', 'part-info', 'part-months'].forEach(function (id) { $(id).addEventListener('change', render); });
  $('print').addEventListener('click', function () { window.print(); });
  $('open-settings').addEventListener('click', function () { $('settings').hidden = !$('settings').hidden; if (!$('settings').hidden) fillSettings(); });
  $('close-settings').addEventListener('click', function () { $('settings').hidden = true; });
  $('save-settings').addEventListener('click', saveSettings);
  $('reset-rules').addEventListener('click', function () { $('f-rules').value = DEFAULT_RULES.join('\n'); });

  ui.autoResize();
  ui.connect().then(function (context) {
    var query = context.query || {};
    return Promise.all([ui.api.get('transcripts/sheets'), ui.api.get('classes'), ui.api.get('transcripts/progress-book-template').catch(function () { return {}; })]).then(function (results) {
      state.sheets = rows(results[0]); state.classes = rows(results[1]); state.form = results[2] || {};
      state.sheetId = query.sheetId && state.sheets.some(function (s) { return s.id === query.sheetId; }) ? query.sheetId : (state.sheets[0] && state.sheets[0].id) || '';
      pickDefaults();
      if (query.classId && activeSheet() && activeSheet().classIds.indexOf(query.classId) >= 0) state.classId = query.classId;
      return load();
    });
  }).catch(function (error) { show('error', error.message || 'Progress books could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); render(); });
})();
