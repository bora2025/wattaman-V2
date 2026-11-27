/* Attendance Reports: Academic Management's own report screen, with printing and an editable,
 * saved print form (letterhead, logo, signatures, paper). Same workflow as the school's original
 * report: daily check-in/out per session, or present/late/absent/permission totals for a period.
 * Plugin API used: GET classes, study-years, sessions, holidays, classes/:id/students,
 * reports/print-data (attendance records), GET/PUT reports/print-template.
 * Staff mode (<body data-mode="staff">): GET officers, departments, session-settings,
 * staff-attendance/reports, GET/PUT reports/staff-print-template. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  // Moved into Smart Attendance: the records and rules stay with wattanam.academic-management, called as a partner.
  var academic = ui.partner('wattanam.academic-management');
  var STAFF = document.body.getAttribute('data-mode') === 'staff';
  var SCOPE = STAFF ? 'STAFF' : 'STUDENT';
  var TEMPLATE_PATH = STAFF ? 'reports/staff-print-template' : 'reports/print-template';
  var PEOPLE = STAFF ? 'Staff' : 'Students';
  var DEFAULT_TEMPLATE = {
    title: 'Attendance Report', orgName: 'Wattanam School', logoUrl: '', logoTextLines: [],
    headerLines: ['ព្រះរាជាណាចក្រកម្ពុជា', 'ជាតិ សាសនា ព្រះមហាក្សត្រ'], logoGap: 4, logoTextGap: 4, headerGap: 6,
    signers: ['Teacher', 'Admin'], paper: 'A4', orientation: 'portrait', showAddress: true, footerText: '',
  };
  if (STAFF) { DEFAULT_TEMPLATE.title = 'Staff Attendance Report'; DEFAULT_TEMPLATE.signers = ['Admin', 'Director']; }
  var PERIOD_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', custom: 'Custom range' };
  var WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  var DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var LOGO_EDGE = 240, LOGO_MAX = 250000;

  var state = {
    classes: [], departments: [], staffDays: null, years: [], sessions: [], holidays: [], students: [], records: [], classId: '', period: 'daily',
    date: '', start: '', end: '', template: copy(DEFAULT_TEMPLATE), saved: copy(DEFAULT_TEMPLATE), loading: false, report: null,
  };
  var loadToken = 0;

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
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
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(date) { return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate()); }
  function localToday() { var now = new Date(); return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); }
  function parse(day) { return new Date(day + 'T00:00:00Z'); }
  function addDays(day, n) { var d = parse(day); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function longDate(day) { return parse(day).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); }
  function dayOnly(value) { return String(value || '').slice(0, 10); }
  function clock(value) {
    if (!value) return '';
    var d = new Date(value);
    return isNaN(d.getTime()) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function studentName(s) { return STAFF ? s.name || (s.user && s.user.name) || s.employeeNumber || 'Staff' : s.name || s.nameKh || (s.user && s.user.name) || s.studentNumber || 'Student'; }
  function personNumber(s) { return STAFF ? s.employeeNumber || '' : s.studentNumber || ''; }
  function thirdColumn(s) { return STAFF ? positionLabel(s.position) + (s.department && s.department.name && !state.classId ? ' · ' + s.department.name : '') : s.address || ''; }
  function positionLabel(code) { return String(code || '').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); }); }
  var THIRD = STAFF ? 'Position' : 'Address';

  // ---------- period ----------
  function range() {
    if (state.period === 'custom') return { start: state.start || state.date, end: state.end || state.start || state.date };
    var base = parse(state.date), y = base.getUTCFullYear(), m = base.getUTCMonth(), d = base.getUTCDate();
    if (state.period === 'weekly') { var back = (base.getUTCDay() + 6) % 7; return { start: iso(new Date(Date.UTC(y, m, d - back))), end: iso(new Date(Date.UTC(y, m, d - back + 6))) }; }
    if (state.period === 'monthly') return { start: iso(new Date(Date.UTC(y, m, 1))), end: iso(new Date(Date.UTC(y, m + 1, 0))) };
    if (state.period === 'yearly') {
      var year = state.years.filter(function (item) { return item.startDate && item.endDate && dayOnly(item.startDate) <= state.date && state.date <= dayOnly(item.endDate); })[0]
        || state.years.filter(function (item) { return Number(item.year) === y; })[0];
      return year && year.startDate && year.endDate ? { start: dayOnly(year.startDate), end: dayOnly(year.endDate) } : { start: y + '-01-01', end: y + '-12-31' };
    }
    return { start: state.date, end: state.date };
  }

  // ---------- school calendar ----------
  function selectedClass() { return state.classes.filter(function (item) { return item.id === state.classId; })[0]; }
  function studyDays() {
    if (STAFF) return state.staffDays && state.staffDays.length ? state.staffDays : WEEKDAYS.slice();
    var chosen = selectedClass();
    try { var parsed = JSON.parse((chosen && chosen.schedule) || '{}'); if (Array.isArray(parsed.week) && parsed.week.length) return parsed.week.map(function (day) { return String(day).toUpperCase(); }); } catch (error) { /* default below */ }
    return WEEKDAYS.slice();
  }
  function holidayOn(day) { return state.holidays.filter(function (item) { var from = dayOnly(item.date), to = dayOnly(item.endDate || item.date); return from <= day && day <= to; })[0]; }
  function isStudyDay(day) { return studyDays().indexOf(DAY_CODES[parse(day).getUTCDay()]) >= 0; }
  function sessionStart(n) {
    var mine = (!STAFF && state.sessions.filter(function (item) { return item.scope === SCOPE && item.classId === state.classId && Number(item.session) === n; })[0])
      || state.sessions.filter(function (item) { return item.scope === SCOPE && !item.classId && Number(item.session) === n; })[0];
    return mine ? String(mine.startTime).slice(0, 5) : '';
  }
  function notStartedYet(day, n) {
    if (day !== localToday()) return false;
    var now = new Date(), start = sessionStart(n);
    return Boolean(start) && start > pad(now.getHours()) + ':' + pad(now.getMinutes());
  }
  function activeSessions() {
    var mine = STAFF ? [] : state.sessions.filter(function (item) { return item.scope === SCOPE && item.classId === state.classId; });
    var list = mine.length ? mine : state.sessions.filter(function (item) { return item.scope === SCOPE && !item.classId; });
    var active = list.filter(function (item) { return String(item.startTime).slice(0, 5) !== String(item.endTime).slice(0, 5); }).map(function (item) { return Number(item.session); });
    return active.length ? active : [1, 2, 3, 4];
  }

  // ---------- report building ----------
  function byStudentDay() {
    var map = {};
    state.records.forEach(function (record) {
      var key = record.personId + '|' + dayOnly(record.date);
      (map[key] = map[key] || {})[Number(record.session)] = record;
    });
    return map;
  }
  // One status for a student's day, as the original report counts it.
  function dayStatus(sessions, active) {
    var statuses = active.map(function (n) { return sessions && sessions[n] ? sessions[n].status : null; });
    if (statuses.indexOf('PERMISSION') >= 0) return 'permission';
    if (statuses.indexOf('PRESENT') >= 0) return 'present';
    if (statuses.indexOf('LATE') >= 0) return 'late';
    return 'absent';
  }

  function build() {
    var span = range(), today = localToday(), active = activeSessions(), map = byStudentDay();
    var totals = { present: 0, late: 0, absent: 0, permission: 0 };
    if (state.period === 'daily') {
      var day = span.start, holiday = holidayOn(day), closed = Boolean(holiday) || !isStudyDay(day), future = day > today;
      var dailyRows = state.students.map(function (student) {
        var sessions = map[student.id + '|' + day] || (student.userId && map[student.userId + '|' + day]) || {};
        if (!closed && !future) totals[dayStatus(sessions, active)] += 1;
        return { student: student, sessions: sessions };
      });
      return { kind: 'daily', span: span, active: active, rows: dailyRows, totals: totals, closed: closed, closedReason: holiday ? 'Holiday: ' + (holiday.name || '') : closed ? (STAFF ? 'Not a working day' : 'Not a study day for this class') : '', future: future };
    }
    var days = [];
    for (var d = span.start; d <= span.end && d <= today; d = addDays(d, 1)) if (!holidayOn(d) && isStudyDay(d)) days.push(d);
    var summaryRows = state.students.map(function (student) {
      var counts = { present: 0, late: 0, absent: 0, permission: 0 };
      days.forEach(function (day) { counts[dayStatus(map[student.id + '|' + day] || (student.userId && map[student.userId + '|' + day]), active)] += 1; });
      Object.keys(counts).forEach(function (key) { totals[key] += counts[key]; });
      return { student: student, counts: counts };
    });
    return { kind: 'summary', span: span, rows: summaryRows, totals: totals, schoolDays: days.length };
  }

  // ---------- rendering ----------
  function renderControls() {
    var select = $('class');
    if (STAFF && select.options.length !== state.departments.length + 1) {
      select.textContent = '';
      select.appendChild(el('option', { value: '', text: 'All departments' }));
      state.departments.forEach(function (item) { select.appendChild(el('option', { value: item.id, text: item.name || '' })); });
    } else if (!STAFF && select.options.length !== state.classes.length) {
      select.textContent = '';
      state.classes.forEach(function (item) { select.appendChild(el('option', { value: item.id, text: (item.name || '') + (item.subject ? ' — ' + item.subject : '') })); });
    }
    select.value = state.classId;
    Array.prototype.forEach.call(document.querySelectorAll('[data-period]'), function (button) { button.setAttribute('aria-pressed', String(button.getAttribute('data-period') === state.period)); });
    var custom = state.period === 'custom';
    $('date-field').hidden = custom; $('start-field').hidden = !custom; $('end-field').hidden = !custom;
    $('date').value = state.date; $('start').value = state.start; $('end').value = state.end;
    var report = state.report, host = $('totals'); host.textContent = '';
    if (!report) return;
    [['present', 'Present'], ['late', 'Late'], ['absent', 'Absent'], ['permission', 'Permission']].forEach(function (entry) {
      host.appendChild(el('div', { class: entry[0] }, [el('strong', { text: String(report.totals[entry[0]]) }), el('span', { text: entry[1] + (report.kind === 'summary' ? ' (days)' : '') })]));
    });
    host.appendChild(el('div', {}, [el('strong', { text: String(state.students.length) }), el('span', { text: report.kind === 'summary' ? PEOPLE + ' · ' + report.schoolDays + (STAFF ? ' working days' : ' school days') : PEOPLE })]));
  }

  function renderLetterhead() {
    var t = state.template;
    var head = document.querySelector('.letterhead');
    head.className = 'letterhead' + (t.logoUrl ? '' : ' no-logo');
    $('logo-block').hidden = !t.logoUrl; $('logo-spacer').hidden = !t.logoUrl;
    var logo = $('logo');
    if (t.logoUrl) { logo.setAttribute('src', t.logoUrl); logo.hidden = false; logo.style.marginBottom = t.logoGap + 'px'; } else logo.hidden = true;
    var logoText = $('logo-text'); logoText.textContent = ''; logoText.style.marginBottom = t.logoTextGap + 'px';
    t.logoTextLines.forEach(function (line) { logoText.appendChild(el('p', { text: line })); });
    var header = $('header-lines'); header.textContent = ''; header.style.marginBottom = t.headerGap + 'px';
    t.headerLines.forEach(function (line) { header.appendChild(el('p', { text: line })); });
    if (t.orgName) header.appendChild(el('p', { class: 'org', text: t.orgName }));
    $('title').textContent = t.title || 'Attendance Report';
    var signers = $('signers'); signers.textContent = '';
    t.signers.forEach(function (name) { signers.appendChild(el('div', { text: name })); });
    $('footer-text').textContent = [t.orgName, t.footerText].filter(Boolean).join(' — ');
    var size = t.paper === 'Letter' ? 'letter' : t.paper === 'Legal' ? 'legal' : 'A4';
    $('page-size').textContent = '@page { size: ' + size + ' ' + (t.orientation === 'landscape' ? 'landscape' : 'portrait') + '; margin: 12mm; }';
  }

  function cell(record, session, closed, future) {
    if (closed) return el('span', { class: 'off', text: '—' });
    if (!record) return future ? el('span', { class: 'off', text: '' }) : el('span', { class: 'abs', text: '✗' });
    if (record.status === 'PERMISSION') return el('span', { class: 'perm', text: 'P' });
    if (record.status === 'ABSENT') return el('span', { class: 'abs', text: '✗' });
    var time = clock(session % 2 === 1 ? record.checkInTime || record.checkOutTime : record.checkOutTime || record.checkInTime);
    if (record.status === 'LATE') return el('span', { class: 'late', text: 'L' + (time ? ' (' + time + ')' : '') });
    return el('span', { class: 'ok', text: '✓' + (time ? ' (' + time + ')' : '') });
  }

  function renderSheet() {
    renderLetterhead();
    var report = state.report, t = state.template, chosen = selectedClass();
    var meta = $('meta'); meta.textContent = '';
    var thead = $('thead'), tbody = $('tbody'), tfoot = $('tfoot');
    thead.textContent = ''; tbody.textContent = ''; tfoot.textContent = '';
    if (!report || (!STAFF && !chosen)) { $('empty').hidden = false; $('empty').textContent = state.loading ? 'Loading…' : STAFF ? 'No report yet.' : 'Choose a class.'; return; }
    var span = report.span;
    var add = function (label, value) { meta.appendChild(el('span', {}, [el('strong', { text: label + ': ' }), value])); };
    add('Period', PERIOD_LABEL[state.period]);
    add('Date', span.start === span.end ? longDate(span.start) : longDate(span.start) + ' — ' + longDate(span.end));
    if (STAFF) { var department = state.departments.filter(function (item) { return item.id === state.classId; })[0]; add('Department', department ? department.name : 'All departments'); }
    else { add('Class', (chosen.name || '') + (chosen.subject ? ' — ' + chosen.subject : '')); if (chosen.teacher && chosen.teacher.name) add('Teacher', chosen.teacher.name); }
    if (report.kind === 'daily' && report.closedReason) add('Note', report.closedReason);
    var address = t.showAddress;
    if (report.kind === 'daily') {
      var morning = report.active.some(function (n) { return n === 1 || n === 2; }), afternoon = report.active.some(function (n) { return n === 3 || n === 4; });
      var columns = []; if (morning) columns.push(1, 2); if (afternoon) columns.push(3, 4);
      var first = [el('th', { rowspan: '2', text: 'ID' }), el('th', { rowspan: '2', class: 'left', text: 'Name' })];
      if (address) first.push(el('th', { rowspan: '2', class: 'left', text: THIRD }));
      if (morning) first.push(el('th', { colspan: '2', text: 'Morning' }));
      if (afternoon) first.push(el('th', { colspan: '2', text: 'Afternoon' }));
      thead.appendChild(el('tr', {}, first));
      thead.appendChild(el('tr', {}, columns.map(function (n) { return el('th', { text: n % 2 === 1 ? 'Check-In' : 'Check-Out' }); })));
      report.rows.forEach(function (row) {
        var cells = [el('td', { text: personNumber(row.student) }), el('td', { class: 'left', text: studentName(row.student) })];
        if (address) cells.push(el('td', { class: 'left', text: thirdColumn(row.student) }));
        columns.forEach(function (n) { cells.push(el('td', {}, [cell(row.sessions[n], n, report.closed, report.future || notStartedYet(span.start, n))])); });
        tbody.appendChild(el('tr', {}, cells));
      });
      var total = report.totals;
      tfoot.appendChild(el('tr', {}, [el('td', { colspan: String(2 + (address ? 1 : 0) + columns.length), class: 'left', text: 'Present ' + total.present + ' · Late ' + total.late + ' · Absent ' + total.absent + ' · Permission ' + total.permission + ' · Total ' + state.students.length })]));
      $('legend').textContent = '✓ on time · L late · ✗ absent · P permission · — holiday or day off';
    } else {
      var head = [el('th', { text: 'ID' }), el('th', { class: 'left', text: 'Name' })];
      if (address) head.push(el('th', { class: 'left', text: THIRD }));
      ['Present', 'Late', 'Absent', 'Permission'].forEach(function (label) { head.push(el('th', { text: label })); });
      thead.appendChild(el('tr', {}, head));
      report.rows.forEach(function (row) {
        var cells = [el('td', { text: personNumber(row.student) }), el('td', { class: 'left', text: studentName(row.student) })];
        if (address) cells.push(el('td', { class: 'left', text: thirdColumn(row.student) }));
        cells.push(el('td', { class: 'ok', text: String(row.counts.present) }), el('td', { class: 'late', text: String(row.counts.late) }), el('td', { class: 'abs', text: String(row.counts.absent) }), el('td', { class: 'perm', text: String(row.counts.permission) }));
        tbody.appendChild(el('tr', {}, cells));
      });
      var foot = [el('td', { colspan: String(2 + (address ? 1 : 0)), class: 'left', text: 'Total (' + report.schoolDays + (STAFF ? ' working days)' : ' school days)') })];
      ['present', 'late', 'absent', 'permission'].forEach(function (key) { foot.push(el('td', { text: String(report.totals[key]) })); });
      tfoot.appendChild(el('tr', {}, foot));
      $('legend').textContent = STAFF ? 'Counted per working day: holidays and non-working days are excluded; a day with no record counts as absent.' : 'Counted per school day: holidays and the class\'s days off are excluded; a day with no record counts as absent.';
    }
    $('empty').hidden = state.students.length > 0;
    $('empty').textContent = STAFF ? 'No staff in this department.' : 'No students in this class.';
    $('printed').textContent = 'Printed: ' + new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function render() { renderControls(); renderSheet(); renderEditor(); }

  // ---------- data ----------
  // Long ranges are fetched a month at a time so no single answer hits the server's row limit.
  function monthChunks(span) {
    var chunks = [], from = span.start;
    while (from <= span.end) {
      var d = parse(from), to = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
      if (to > span.end) to = span.end;
      chunks.push({ start: from, end: to });
      from = addDays(to, 1);
    }
    return chunks;
  }
  function loadReport() {
    if (!STAFF && !state.classId) { state.report = null; render(); return Promise.resolve(); }
    var token = ++loadToken, span = range(), classId = state.classId;
    if (span.start > span.end) { show('error', 'The start date must be on or before the end date.'); return Promise.resolve(); }
    state.loading = true; show('error'); render();
    var fetchRecords = monthChunks(span).reduce(function (chain, chunk) {
      return chain.then(function (all) {
        var request = STAFF ? academic.get('staff-attendance/reports', { startDate: chunk.start, endDate: chunk.end }) : academic.get('reports/print-data', { classId: classId, startDate: chunk.start, endDate: chunk.end });
        return request.then(function (result) { return all.concat(rows(result)); });
      });
    }, Promise.resolve([]));
    var people = STAFF ? academic.get('officers').then(function (result) { return rows(result).filter(function (item) { return item.employmentStatus !== 'INACTIVE' && (!classId || item.departmentId === classId); }).sort(function (a, b) { return String(a.employeeNumber || a.name || '').localeCompare(String(b.employeeNumber || b.name || '')); }); }) : academic.get('classes/' + encodeURIComponent(classId) + '/students');
    return Promise.all([people, fetchRecords]).then(function (results) {
      if (token !== loadToken) return;
      state.students = rows(results[0]); state.records = results[1]; state.report = build();
    }).catch(function (error) { if (token === loadToken) { state.report = null; show('error', error.message || 'The report could not be loaded.'); } })
      .then(function () { if (token === loadToken) { state.loading = false; render(); } });
  }

  // ---------- export ----------
  function exportCsv() {
    var report = state.report; if (!report) return;
    var q = function (value) { return '"' + String(value === undefined || value === null ? '' : value).replace(/"/g, '""') + '"'; };
    var lines = [];
    if (report.kind === 'daily') {
      lines.push(['ID', 'Name', THIRD, 'Morning check-in', 'Morning check-out', 'Afternoon check-in', 'Afternoon check-out'].map(q).join(','));
      report.rows.forEach(function (row) {
        var values = [1, 2, 3, 4].map(function (n) { var node = cell(row.sessions[n], n, report.closed, report.future || notStartedYet(report.span.start, n)); return node.textContent; });
        lines.push([personNumber(row.student), studentName(row.student), thirdColumn(row.student)].concat(values).map(q).join(','));
      });
    } else {
      lines.push(['ID', 'Name', THIRD, 'Present', 'Late', 'Absent', 'Permission'].map(q).join(','));
      report.rows.forEach(function (row) { lines.push([personNumber(row.student), studentName(row.student), thirdColumn(row.student), row.counts.present, row.counts.late, row.counts.absent, row.counts.permission].map(q).join(',')); });
    }
    var chosen = selectedClass(), span = report.span;
    var name = (STAFF ? 'staff' : ((chosen && chosen.name) || 'class')).replace(/[^A-Za-z0-9-]+/g, '-') + '-attendance-' + span.start + (span.end !== span.start ? '_' + span.end : '') + '.csv';
    var url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    var anchor = el('a', { href: url, download: name }); document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- print form editor ----------
  var FIELDS = ['title', 'orgName', 'logoGap', 'logoTextGap', 'headerGap', 'paper', 'orientation', 'footerText'];
  var LISTS = ['headerLines', 'logoTextLines', 'signers'];
  function renderEditor() {
    if ($('editor').hidden) return;
    var t = state.template;
    $('t-logoPreview').hidden = !t.logoUrl; $('t-logoRemove').hidden = !t.logoUrl;
    if (t.logoUrl) $('t-logoPreview').setAttribute('src', t.logoUrl);
  }
  function fillEditor() {
    var t = state.template;
    FIELDS.forEach(function (key) { $('t-' + key).value = t[key]; });
    LISTS.forEach(function (key) { $('t-' + key).value = t[key].join('\n'); });
    $('t-showAddress').checked = t.showAddress !== false;
    show('editor-error'); renderEditor();
  }
  function readEditor() {
    var t = state.template;
    FIELDS.forEach(function (key) { var value = $('t-' + key).value; t[key] = /Gap$/.test(key) ? Math.max(0, Math.min(60, parseInt(value, 10) || 0)) : value; });
    LISTS.forEach(function (key) { t[key] = $('t-' + key).value.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean); });
    t.showAddress = $('t-showAddress').checked;
    renderSheet();
  }
  function selectLogo(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { show('editor-error', 'The logo could not be read.'); };
    reader.onload = function () {
      var image = new Image();
      image.onerror = function () { show('editor-error', 'The logo is not a valid image.'); };
      image.onload = function () {
        var scale = Math.min(1, LOGO_EDGE / Math.max(image.width, image.height, 1)), canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        var data = canvas.toDataURL('image/png');
        if (data.length > LOGO_MAX) data = canvas.toDataURL('image/jpeg', 0.85);
        if (data.length > LOGO_MAX) { show('editor-error', 'The logo is too detailed. Choose a simpler or smaller image.'); return; }
        state.template.logoUrl = data; show('editor-error'); renderSheet(); renderEditor();
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }
  function saveTemplate() {
    readEditor();
    $('editor-save').disabled = true; show('editor-error');
    academic.put(TEMPLATE_PATH, state.template).then(function (saved) {
      state.template = Object.assign(copy(DEFAULT_TEMPLATE), saved || {}); state.saved = copy(state.template);
      show('message', STAFF ? 'Print form saved. It is used for every staff attendance report.' : 'Print form saved. It is used for every attendance report of this school.');
      fillEditor(); renderSheet();
    }).catch(function (error) {
      show('editor-error', error.status === 403 ? 'You can preview and print with these changes, but only staff who configure attendance can save the print form.' : error.message || 'The print form could not be saved.');
    }).then(function () { $('editor-save').disabled = false; });
  }

  // ---------- events ----------
  $('class').addEventListener('change', function (event) { state.classId = event.target.value; loadReport(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-period]'), function (button) {
    button.addEventListener('click', function () {
      state.period = button.getAttribute('data-period');
      if (state.period === 'custom' && !state.start) { var span = range(); state.start = state.date; state.end = state.date; void span; }
      loadReport();
    });
  });
  $('date').addEventListener('change', function (event) { if (event.target.value) { state.date = event.target.value; loadReport(); } });
  $('start').addEventListener('change', function (event) { state.start = event.target.value; loadReport(); });
  $('end').addEventListener('change', function (event) { state.end = event.target.value; loadReport(); });
  $('print').addEventListener('click', function () { renderSheet(); window.print(); });
  $('export').addEventListener('click', exportCsv);
  $('edit-form').addEventListener('click', function () { $('editor').hidden = false; fillEditor(); $('editor').scrollIntoView({ block: 'start' }); });
  $('editor-close').addEventListener('click', function () { state.template = copy(state.saved); $('editor').hidden = true; show('editor-error'); renderSheet(); });
  $('editor-save').addEventListener('click', saveTemplate);
  $('editor-reset').addEventListener('click', function () { state.template = copy(DEFAULT_TEMPLATE); fillEditor(); renderSheet(); });
  $('t-logoFile').addEventListener('change', function (event) { selectLogo(event.target.files && event.target.files[0]); event.target.value = ''; });
  $('t-logoRemove').addEventListener('click', function () { state.template.logoUrl = ''; renderSheet(); renderEditor(); });
  FIELDS.concat(LISTS).forEach(function (key) { $('t-' + key).addEventListener('input', readEditor); $('t-' + key).addEventListener('change', readEditor); });
  $('t-showAddress').addEventListener('change', readEditor);

  state.date = localToday();
  render();
  ui.autoResize();
  ui.connect().then(function (context) {
    var wanted = String((context.query && context.query.classId) || '');
    return Promise.all([
      STAFF ? academic.get('departments').catch(function () { return []; }) : academic.get('classes'), academic.get('study-years').catch(function () { return []; }), academic.get('sessions').catch(function () { return []; }),
      academic.get('holidays').catch(function () { return []; }), academic.get(TEMPLATE_PATH).catch(function () { return {}; }),
      STAFF ? academic.get('session-settings').catch(function () { return {}; }) : Promise.resolve({}),
    ]).then(function (results) {
      if (STAFF) { state.departments = rows(results[0]); state.staffDays = Array.isArray(results[5] && results[5].staffWorkingDays) ? results[5].staffWorkingDays : null; state.template = Object.assign(copy(DEFAULT_TEMPLATE), results[4] || {}); state.saved = copy(state.template); state.years = rows(results[1]); state.sessions = rows(results[2]); state.holidays = rows(results[3]); state.classId = ''; return loadReport(); }
      state.classes = rows(results[0]); state.years = rows(results[1]); state.sessions = rows(results[2]); state.holidays = rows(results[3]);
      state.template = Object.assign(copy(DEFAULT_TEMPLATE), results[4] || {}); state.saved = copy(state.template);
      var found = state.classes.filter(function (item) { return item.id === wanted; })[0];
      state.classId = found ? found.id : (state.classes[0] && state.classes[0].id) || '';
      return loadReport();
    });
  }).catch(function (error) { show('error', error.message || 'Reports could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); render(); });
})();
