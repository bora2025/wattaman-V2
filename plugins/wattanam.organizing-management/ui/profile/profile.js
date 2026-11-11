/* Employee / Employer Profile: Organizing Management's own screen (moved out of the school core
 * in 0.26.0). Runs in the core's sandboxed plugin frame and talks to this plugin's API only:
 *   GET employees/:id, GET employees/:id/relations, PUT employees/:id.
 * The form fields come from fields.js (window.ORGANIZING_PROFILE_FIELDS). */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var fields = window.ORGANIZING_PROFILE_FIELDS || [];
  var lifecycle = [
    ['Rewards & bonuses', 'rewards'], ['Salary deductions', 'deductions'], ['Permissions & leave', 'permissions'],
    ['Disciplinary actions', 'disciplinaryActions'], ['Job promotions', 'promotions'], ['Payroll history', 'payroll'],
  ];
  var state = { id: '', profile: {}, history: {}, draft: {}, editing: false, busy: false, active: 'rewards' };

  function $(id) { return document.getElementById(id); }
  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attributes[key];
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), attributes[key]);
      else node.setAttribute(key, attributes[key]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }
  function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function text(value, fallback) { return value === undefined || value === null || value === '' ? (fallback || '') : String(value); }
  function dateValue(value) { return text(value).slice(0, 10); }
  function show(id, message) { var node = $(id); node.textContent = message || ''; node.hidden = !message; }
  function money(value, currency) {
    var amount = Number(value);
    if (value === undefined || value === null || value === '' || !isFinite(amount)) return 'Not configured';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: text(currency, 'USD') }).format(amount / 100); }
    catch (error) { return (amount / 100).toFixed(2) + ' ' + text(currency, 'USD'); }
  }
  function draftFromProfile() {
    var draft = {};
    fields.forEach(function (field) { var value = state.profile[field.id]; draft[field.id] = value === undefined || value === null ? '' : value; });
    return draft;
  }

  function renderPhoto() {
    var url = text(state.draft.photoUrl);
    var image = $('photo');
    var words = text(state.draft.fullName, 'Employee').split(/\s+/).slice(0, 2);
    $('initials').textContent = words.map(function (part) { return part.charAt(0); }).join('').toUpperCase();
    $('photo-hint').hidden = true;
    if (!url) { image.hidden = true; $('initials').hidden = false; return; }
    image.onload = function () { image.hidden = false; $('initials').hidden = true; };
    // The sandbox only loads images from the plugin package or data: links; anything else falls
    // back to the initials and a short explanation.
    image.onerror = function () { image.hidden = true; $('initials').hidden = false; $('photo-hint').hidden = false; };
    if (image.getAttribute('src') !== url) image.setAttribute('src', url);
  }

  function renderFields() {
    var host = $('fields'); host.textContent = '';
    fields.filter(function (field) { return field.id !== 'photoUrl'; }).forEach(function (field) {
      var disabled = !state.editing || state.busy;
      var value = state.draft[field.id];
      var control;
      if (field.type === 'select') {
        control = el('select', {}, [el('option', { value: '', text: 'Select…' })].concat((field.options || []).map(function (option) { return el('option', { value: option.value, text: option.label }); })));
        control.value = text(value);
      } else if (field.type === 'textarea') {
        control = el('textarea', {});
        control.value = text(value);
      } else {
        control = el('input', { type: field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text' });
        control.value = field.type === 'date' ? dateValue(value) : text(value);
      }
      control.disabled = disabled;
      control.setAttribute('data-field', field.id);
      control.addEventListener(field.type === 'select' ? 'change' : 'input', function (event) {
        state.draft[field.id] = event.target.value;
        if (field.id === 'fullName' || field.id === 'employmentStatus') renderHeader();
      });
      var label = el('label', { class: field.type === 'textarea' ? 'wide' : '' }, [document.createTextNode(field.label)]);
      if (field.required) label.appendChild(el('span', { class: 'required', text: ' *' }));
      label.appendChild(control);
      host.appendChild(label);
    });
  }

  function renderHeader() {
    $('name').textContent = text(state.draft.fullName, 'Employee / Employer Profile');
    $('status').textContent = text(state.draft.employmentStatus, 'ACTIVE');
    $('mode-help').textContent = state.editing ? 'Update the profile, then save your changes.' : 'Review this profile. Select Edit to change employee or employer information.';
    $('details-help').textContent = state.editing ? 'Edit identity, role, contact, and emergency information.' : 'Profile information is read-only until you select Edit profile.';
    $('edit').hidden = state.editing;
    $('cancel').hidden = !state.editing;
    $('save').hidden = !state.editing;
    $('cancel').disabled = state.busy;
    $('save').disabled = state.busy;
    $('save').textContent = state.busy ? 'Saving…' : 'Save changes';
  }

  function renderLifecycle() {
    var host = $('lifecycle'); host.textContent = '';
    lifecycle.forEach(function (entry) {
      var list = Array.isArray(state.history[entry[1]]) ? state.history[entry[1]] : [];
      host.appendChild(el('button', { type: 'button', 'aria-pressed': String(state.active === entry[1]), onclick: function () { state.active = entry[1]; renderLifecycle(); } },
        [el('strong', { text: entry[0] }), el('span', { text: String(list.length) })]));
    });
    var selected = lifecycle.filter(function (entry) { return entry[1] === state.active; })[0] || lifecycle[0];
    var items = Array.isArray(state.history[selected[1]]) ? state.history[selected[1]] : [];
    $('records-title').textContent = selected[0];
    var records = $('records'); records.textContent = '';
    if (!items.length) { records.appendChild(el('p', { class: 'empty', text: 'No records yet' })); return; }
    items.slice(0, 5).forEach(function (item) {
      var row = el('div', { class: 'record' }, [el('strong', { text: text(item.adjustmentType || item.permissionType || item.actionType || item.toPosition || item.status, 'Record') })]);
      row.appendChild(document.createTextNode(text(item.reason || item.title || item.effectiveDate || item.permissionDate || item.periodEnd)));
      records.appendChild(row);
    });
  }

  function renderSide() {
    var card = record(state.history.idCard);
    var employee = record(state.history.employee);
    $('photo-url').value = text(state.draft.photoUrl);
    $('photo-url').disabled = !state.editing || state.busy;
    $('fact-number').textContent = text(state.draft.employeeNumber, '—');
    $('fact-type').textContent = text(state.draft.employmentType, '—');
    $('fact-department').textContent = text(state.draft.department, '—');
    $('fact-start').textContent = dateValue(state.draft.startDate) || '—';
    $('card-name').textContent = text(card.name || state.draft.fullName, '—');
    $('card-detail').textContent = text(card.employeeNumber || state.draft.employeeNumber, '—') + ' · ' + text(card.position || state.draft.position, 'No position');
    $('salary').textContent = money(employee.baseSalaryMinor, employee.salaryCurrency);
    $('salary-basis').textContent = text(employee.salaryBasis, 'Salary not configured');
  }

  function render() { renderHeader(); renderPhoto(); renderSide(); renderFields(); renderLifecycle(); }

  function load() {
    var path = 'employees/' + encodeURIComponent(state.id);
    return Promise.all([ui.api.get(path), ui.api.get(path + '/relations')]).then(function (results) {
      state.profile = record(results[0]);
      state.history = record(results[1]);
      state.draft = draftFromProfile();
      render();
    });
  }

  function save(event) {
    event.preventDefault();
    if (!state.editing || state.busy) return;
    var missing = fields.filter(function (field) { return field.required && !text(state.draft[field.id]).trim(); })[0];
    if (missing) { show('message'); show('error', missing.label + ' is required.'); return; }
    state.busy = true; show('message'); show('error'); render();
    ui.api.put('employees/' + encodeURIComponent(state.id), state.draft)
      .then(function () { state.editing = false; return load(); })
      .then(function () { show('message', 'Profile updated successfully.'); })
      .catch(function (error) { show('error', error.message || 'Profile could not be saved.'); })
      .then(function () { state.busy = false; render(); });
  }

  $('app').addEventListener('submit', save);
  $('edit').addEventListener('click', function () { state.editing = true; show('message'); show('error'); render(); });
  $('cancel').addEventListener('click', function () { state.draft = draftFromProfile(); state.editing = false; show('message'); show('error'); render(); });
  $('photo-url').addEventListener('input', function (event) { state.draft.photoUrl = event.target.value; });
  $('photo-url').addEventListener('change', renderPhoto);

  ui.autoResize();
  ui.connect()
    .then(function (context) {
      state.id = text(context.params && context.params.id);
      if (!state.id) throw new Error('This profile link is missing the workforce member.');
      return load();
    })
    .catch(function (error) { show('error', error.message || 'Profile could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
