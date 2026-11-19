/* Edit Student: Academic Management's own screen for one student of a class. Same fields and order
 * as Register New Student in Manage Classes. Plugin API used:
 *   GET classes/:id/students/:studentId, PATCH classes/:id/students/:studentId. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var D = window.WattanamStudentDetails;
  var FIELDS = ['studentNumber', 'name', 'nameKh', 'email', 'phone', 'sex', 'dateOfBirth', 'photo', 'generation'];
  var DETAILS = D.KEYS; // place of birth, current address, parents
  var ACCOUNT = ['name', 'email', 'phone'];
  var state = { classId: '', studentId: '', student: null, busy: false, commandKey: '' };

  function $(id) { return document.getElementById(id); }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  function text(value) { return value === undefined || value === null ? '' : String(value); }
  function newKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return 'student-edit:' + window.crypto.randomUUID();
    return 'student-edit:' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function path() { return 'classes/' + encodeURIComponent(state.classId) + '/students/' + encodeURIComponent(state.studentId); }

  function renderHeader() {
    var s = state.student || {};
    var name = s.name || s.nameKh || 'Student';
    $('heading').textContent = 'Edit Student — ' + name;
    var facts = $('facts'); facts.textContent = '';
    [s.className ? 'Class ' + s.className : '', s.studentNumber ? 'ID ' + s.studentNumber : '', s.email || ''].filter(Boolean).forEach(function (value) {
      var chip = document.createElement('span'); chip.textContent = value; facts.appendChild(chip);
    });
    showPhoto(s.photo, name);
  }
  // The photo at the top follows the photo field (an upload shows at once, before saving).
  function showPhoto(url, name) {
    var label = (name || (state.student && (state.student.name || state.student.nameKh)) || 'Student').charAt(0).toUpperCase();
    var box = $('photo-box'); box.textContent = '';
    if (url) {
      var image = document.createElement('img'); image.className = 'photo'; image.alt = '';
      image.onerror = function () { box.textContent = label; };
      image.src = url; box.appendChild(image);
    } else box.textContent = label;
  }
  D.render($('s-details'), { gridClass: 'fields three' });
  var photoUpload = window.WattanamPhoto ? window.WattanamPhoto.attach($('s-photo'), function (value) { showPhoto(value); }) : null;
  function fill() {
    var s = state.student || {};
    FIELDS.forEach(function (field) { $('s-' + field).value = field === 'dateOfBirth' ? text(s.dateOfBirth).slice(0, 10) : text(s[field]); });
    D.fill($('s-details'), s);
    // an address typed before the parts existed: shown until the parts are filled in
    var partsGiven = ['houseNo', 'street', 'village', 'commune', 'district', 'province'].some(function (k) { return s[k]; });
    show('old-address', s.address && !partsGiven ? 'Saved address: ' + s.address + ' (fill in the current address above to replace it)' : '');
    renderHeader();
    if (photoUpload) photoUpload.refresh();
  }
  function values() {
    var result = {};
    FIELDS.forEach(function (field) { result[field] = $('s-' + field).value.trim(); });
    Object.assign(result, D.read($('s-details')));
    return result;
  }

  // Unsaved edits: any field that differs from the saved student.
  function dirty() {
    var next = values(), current = state.student || {};
    return FIELDS.concat(DETAILS).some(function (field) { return next[field] !== (field === 'dateOfBirth' ? text(current.dateOfBirth).slice(0, 10) : text(current[field])); });
  }
  // Back to the student list of this class in Manage Classes.
  function leave() {
    if (dirty() && !window.confirm('Discard your changes to this student?')) return;
    ui.navigate('classes', state.classId ? { students: state.classId } : undefined);
  }

  function load() {
    return ui.api.get(path()).then(function (student) { state.student = student || {}; fill(); });
  }

  function save(event) {
    event.preventDefault();
    if (state.busy) return;
    var next = values(), current = state.student || {};
    show('error'); show('message');
    if (!next.name) { show('error', 'Latin name is required.'); return; }
    // Send only what changed; login fields go together so the account update is complete.
    var body = {}, accountChanged = false;
    FIELDS.concat(DETAILS).forEach(function (field) {
      var before = field === 'dateOfBirth' ? text(current.dateOfBirth).slice(0, 10) : text(current[field]);
      if (next[field] !== before) {
        if (ACCOUNT.indexOf(field) >= 0) accountChanged = true;
        else body[field] = field === 'dateOfBirth' ? (next[field] || null) : next[field];
      }
    });
    if (accountChanged) {
      ACCOUNT.forEach(function (field) { body[field] = next[field]; });
      state.commandKey = state.commandKey || newKey();
      body.commandKey = state.commandKey;
    }
    if (!Object.keys(body).length) { show('message', 'Nothing to save — no changes.'); return; }
    state.busy = true; $('save').disabled = true; $('save').textContent = 'Saving…';
    ui.api.patch(path(), body)
      .then(function () { state.commandKey = ''; return load(); })
      .then(function () { show('message', 'Student updated.'); })
      .catch(function (error) { show('error', error.message || 'The student could not be saved.'); })
      .then(function () { state.busy = false; $('save').disabled = false; $('save').textContent = 'Save student'; });
  }

  $('form').addEventListener('submit', save);
  $('cancel').addEventListener('click', leave);
  $('back').addEventListener('click', leave);

  ui.autoResize();
  ui.connect().then(function (context) {
    state.classId = text(context.params && context.params.id);
    state.studentId = text(context.params && context.params.studentId);
    if (!state.classId || !state.studentId) throw new Error('This link is missing the class or the student.');
    return load();
  }).catch(function (error) { show('error', error.message || 'The student could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
