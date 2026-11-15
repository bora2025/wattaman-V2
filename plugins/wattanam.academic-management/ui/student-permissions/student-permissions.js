/* Student Permissions (ច្បាប់ឈប់សម្រាក): a teacher records a student's permission for a morning, an
 * afternoon, a full day or several days, with the reason; the attendance shows Permission for those sessions.
 * Plugin API used: GET my/classes; GET my/classes/:id/students; GET/POST attendance/permissions;
 * DELETE attendance/permissions/:id. A class can be opened directly with ?classId=. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var PART_LABEL = { MORNING: 'Morning · ពេលព្រឹក', AFTERNOON: 'Afternoon · ពេលរសៀល', FULL_DAY: 'Full day · ពេញមួយថ្ងៃ', DAYS: 'Several days · ច្រើនថ្ងៃ' };
  var state = { classes: [], classId: '', students: [], permissions: [], studentId: '', part: 'FULL_DAY', busy: false };

  function $(id) { return document.getElementById(id); }
  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attributes[key];
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), attributes[key]);
      else node.setAttribute(key, attributes[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function rows(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function nice(day) { var p = String(day || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0] : day; }
  function studentName(s) { return s.nameKh || s.name || s.studentNumber || 'Student'; }
  var flashTimer = null;
  function flash(text) { show('error'); show('notice', text); clearTimeout(flashTimer); flashTimer = setTimeout(function () { show('notice'); }, 6000); }

  // ---------- class ----------
  function renderClasses() {
    var select = $('class'); select.textContent = '';
    state.classes.forEach(function (c) { select.appendChild(el('option', { value: c.id, text: c.name })); });
    select.value = state.classId;
  }
  function loadClass() {
    state.studentId = ''; state.students = []; state.permissions = [];
    renderStudents(); renderPermissions();
    if (!state.classId) return Promise.resolve();
    return Promise.all([
      ui.api.get('my/classes/' + encodeURIComponent(state.classId) + '/students'),
      ui.api.get('attendance/permissions', { classId: state.classId }),
    ]).then(function (results) {
      state.students = rows(results[0]); state.permissions = rows(results[1]);
      renderStudents(); renderPermissions();
    }).catch(function (error) { show('error', error.message || 'The class could not be loaded.'); });
  }

  // ---------- form ----------
  function renderStudents() {
    var list = $('student-list'); list.textContent = '';
    var chosen = state.students.filter(function (s) { return s.id === state.studentId; })[0];
    $('student-chosen').hidden = !chosen;
    $('student-search').hidden = Boolean(chosen);
    if (chosen) {
      var box = $('student-chosen'); box.textContent = '';
      box.appendChild(el('span', { text: (chosen.studentNumber ? chosen.studentNumber + ' · ' : '') + studentName(chosen) }));
      box.appendChild(el('button', { type: 'button', text: 'Change', onclick: function () { state.studentId = ''; renderStudents(); $('student-search').focus(); } }));
      return;
    }
    var q = $('student-search').value.trim().toLowerCase();
    if (!q && document.activeElement !== $('student-search')) return;
    state.students.filter(function (s) {
      return !q || [s.studentNumber, s.nameKh, s.name].filter(Boolean).join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 40).forEach(function (s) {
      list.appendChild(el('button', { type: 'button', role: 'option', 'data-student': s.id, onclick: function () { state.studentId = s.id; $('student-search').value = ''; renderStudents(); } }, [
        el('span', { class: 'num', text: s.studentNumber || '' }), el('span', { text: studentName(s) + (s.name && s.nameKh && s.name !== s.nameKh ? ' · ' + s.name : '') }),
      ]));
    });
  }
  function renderPart() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-part]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-part') === state.part)); });
    $('to-wrap').hidden = state.part !== 'DAYS';
    $('from').parentNode.firstChild.textContent = state.part === 'DAYS' ? 'From' : 'Day';
  }
  function save(event) {
    event.preventDefault();
    if (state.busy) return;
    show('form-error');
    var from = $('from').value, to = state.part === 'DAYS' ? $('to').value : from, reason = $('reason').value.trim();
    if (!state.studentId) { show('form-error', 'Choose the student.'); return; }
    if (!from) { show('form-error', 'Choose the day.'); return; }
    if (state.part === 'DAYS' && (!to || to < from)) { show('form-error', 'Choose the last day (on or after the first).'); return; }
    if (!reason) { show('form-error', 'Write the reason.'); return; }
    var body = { classId: state.classId, studentId: state.studentId, part: state.part === 'DAYS' ? 'FULL_DAY' : state.part, from: from, to: to, reason: reason };
    state.busy = true; $('save').disabled = true;
    ui.api.post('attendance/permissions', body).then(function (result) {
      var student = state.students.filter(function (s) { return s.id === state.studentId; })[0];
      var skipped = (result.skipped || []).map(function (s) { return nice(s.date) + ' (' + s.why + ')'; });
      flash('✓ Permission saved for ' + (student ? studentName(student) : 'the student') + ': ' + result.days + ' day' + (result.days === 1 ? '' : 's') + ', ' + result.sessions + ' session' + (result.sessions === 1 ? '' : 's') + (skipped.length ? '. Skipped: ' + skipped.join(', ') : '') + '.');
      state.studentId = ''; $('reason').value = '';
      renderStudents();
      return ui.api.get('attendance/permissions', { classId: state.classId }).then(function (list) { state.permissions = rows(list); renderPermissions(); });
    }).catch(function (error) { show('form-error', error.message || 'The permission could not be saved.'); })
      .then(function () { state.busy = false; $('save').disabled = false; });
  }

  // ---------- list ----------
  function renderPermissions() {
    var host = $('permissions'); host.textContent = '';
    $('empty').hidden = state.permissions.length > 0 || !state.classId;
    $('count').textContent = state.permissions.length ? state.permissions.length + ' recorded' : '';
    state.permissions.forEach(function (p) {
      var several = p.fromDate !== p.toDate, part = several ? 'DAYS' : p.part;
      host.appendChild(el('article', { class: 'item', 'data-permission': p.id }, [
        el('span', { class: 'badge ' + part, text: PART_LABEL[part].split(' · ')[0] }),
        el('div', {}, [
          el('p', { class: 'who', text: (p.studentNumber ? p.studentNumber + ' · ' : '') + (p.nameKh || p.name) }),
          el('p', { class: 'meta', text: (several ? nice(p.fromDate) + ' → ' + nice(p.toDate) : nice(p.fromDate)) + ' · ' + p.sessions + ' session' + (p.sessions === 1 ? '' : 's') + ' · ' + p.reason }),
        ]),
        el('button', { type: 'button', class: 'cancel', text: 'Cancel', onclick: function () { cancel(p); } }),
      ]));
    });
  }
  function cancel(p) {
    if (!window.confirm('Cancel this permission? Its Permission marks are removed (marks changed since are kept).')) return;
    ui.api.delete('attendance/permissions/' + encodeURIComponent(p.id)).then(function (result) {
      flash('Permission cancelled · ' + result.recordsRemoved + ' mark' + (result.recordsRemoved === 1 ? '' : 's') + ' removed.');
      state.permissions = state.permissions.filter(function (item) { return item.id !== p.id; });
      renderPermissions();
    }).catch(function (error) { show('error', error.message || 'The permission could not be cancelled.'); });
  }

  // ---------- wiring ----------
  $('class').addEventListener('change', function (event) { state.classId = event.target.value; loadClass(); });
  $('student-search').addEventListener('input', renderStudents);
  $('student-search').addEventListener('focus', renderStudents);
  Array.prototype.forEach.call(document.querySelectorAll('[data-part]'), function (b) {
    b.addEventListener('click', function () { state.part = b.getAttribute('data-part'); renderPart(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-reason]'), function (b) {
    b.addEventListener('click', function () { $('reason').value = b.getAttribute('data-reason'); });
  });
  $('form').addEventListener('submit', save);
  $('from').value = today(); $('to').value = today();
  renderPart();

  ui.autoResize();
  ui.connect().then(function (context) {
    return ui.api.get('my/classes').then(function (result) {
      state.classes = rows(result).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      var wanted = String((context.query && context.query.classId) || '');
      state.classId = state.classes.some(function (c) { return c.id === wanted; }) ? wanted : (state.classes[0] && state.classes[0].id) || '';
      renderClasses();
      if (!state.classes.length) show('error', 'No class is assigned to you yet.');
      return loadClass();
    });
  }).catch(function (error) { show('error', error.message || 'Student permissions could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
