/* Manage Officers: Academic Management's own screen (moved out of the school core in 0.4.0).
 * Runs in the core's sandboxed plugin frame and talks to this plugin's API only:
 *   GET officers, GET departments, POST officers, PATCH officers/:id, DELETE officers/:id. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var positions = [
    ['TEACHER', 'Teacher'], ['PRIMARY_SCHOOL_PRINCIPAL', 'Primary School Principal'], ['SECONDARY_SCHOOL_PRINCIPAL', 'Secondary School Principal'],
    ['HIGH_SCHOOL_PRINCIPAL', 'High School Principal'], ['UNIVERSITY_RECTOR', 'University Rector'], ['OFFICER', 'Officer'], ['STAFF', 'Staff'],
    ['OFFICE_HEAD', 'Office Head'], ['DEPUTY_OFFICE_HEAD', 'Deputy Office Head'], ['DEPARTMENT_HEAD', 'Department Head'],
    ['DEPUTY_DEPARTMENT_HEAD', 'Deputy Department Head'], ['GENERAL_DEPARTMENT_DIRECTOR', 'General Department Director'],
    ['DEPUTY_GENERAL_DEPARTMENT_DIRECTOR', 'Deputy General Department Director'], ['COMPANY_CEO', 'Company CEO'], ['CREDIT_OFFICER', 'Credit Officer'],
    ['SECURITY_GUARD', 'Security Guard'], ['JANITOR', 'Janitor'], ['PROJECT_MANAGER', 'Project Manager'], ['BRANCH_MANAGER', 'Branch Manager'],
    ['EXECUTIVE_DIRECTOR', 'Executive Director'],
  ];
  var formFields = ['name', 'email', 'password', 'phone', 'photo', 'employeeNumber', 'position', 'departmentId', 'employmentStatus', 'startedAt', 'endedAt', 'notes'];
  var state = { officers: [], departments: [], tab: 'officers', open: false, query: '', department: '', position: '', busy: '', commandKey: '' };

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
  function rows(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function positionOf(officer) { return officer.position || officer.role || 'OFFICER'; }
  function labelPosition(code) {
    var known = positions.filter(function (entry) { return entry[0] === code; })[0];
    if (known) return known[1];
    return String(code || 'Officer').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, function (letter) { return letter.toUpperCase(); });
  }
  function displayName(officer) { return officer.name || officer.employeeNumber || 'this officer'; }
  function newKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return 'officer:' + window.crypto.randomUUID();
    return 'officer:' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  // A portrait when the school can serve it to the sandbox, otherwise the initials.
  function avatar(officer) {
    var initials = el('span', { class: 'avatar', text: String(officer.name || '?').slice(0, 2).toUpperCase() });
    var url = officer.photoUrl || (officer.user && officer.user.photo) || '';
    if (!url) return initials;
    var image = el('img', { class: 'avatar', alt: '' });
    image.onerror = function () { if (image.parentNode) image.parentNode.replaceChild(initials, image); };
    image.setAttribute('src', url);
    return image;
  }
  function icon(paths) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (d) { var path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.appendChild(path); });
    return svg;
  }
  function action(label, paths, handler, extraClass) {
    var button = el('button', { type: 'button', title: label, 'aria-label': label, class: extraClass || '', onclick: handler }, [icon(paths)]);
    button.disabled = Boolean(state.busy);
    return button;
  }

  function shown() {
    var query = state.query.toLowerCase();
    return state.officers.filter(function (item) {
      var haystack = [item.name, item.email, item.phone, item.employeeNumber, item.position].map(function (part) { return part || ''; }).join(' ').toLowerCase();
      return (!state.department || item.departmentId === state.department) && (!state.position || item.position === state.position) && haystack.indexOf(query) >= 0;
    });
  }

  function renderCards() {
    var host = $('cards'); host.textContent = '';
    state.officers.filter(function (item) { return item.employmentStatus !== 'INACTIVE'; }).forEach(function (item) {
      host.appendChild(el('article', { class: 'card' }, [
        el('div', { class: 'person' }, [avatar(item), el('div', {}, [
          el('strong', { text: item.name || '' }), el('span', { class: 'sub', text: labelPosition(item.position) }),
          el('span', { class: 'sub', text: (item.department && item.department.name) || 'No Department' }),
        ])]),
        el('p', { class: 'id', text: 'ID: ' + (item.employeeNumber || String(item.id || '').slice(0, 8)) }),
      ]));
    });
  }

  function renderDepartments() {
    var host = $('departments'); host.textContent = '';
    state.departments.forEach(function (item) {
      var count = state.officers.filter(function (officer) { return officer.departmentId === item.id; }).length;
      var titles = [el('h2', { text: item.name || '' })];
      if (item.nameKh) titles.push(el('p', { class: 'muted', text: item.nameKh }));
      var children = [el('header', {}, [el('div', {}, titles), el('span', { class: 'count', text: String(count) })])];
      if (item.description) children.push(el('p', { class: 'muted', text: item.description }));
      host.appendChild(el('article', { class: 'department' }, children));
    });
    $('departments-empty').hidden = state.departments.length > 0;
  }

  function renderFilters() {
    var select = $('department-filter');
    var formSelect = $('f-departmentId');
    var keep = formSelect.value;
    select.textContent = ''; formSelect.textContent = '';
    select.appendChild(el('option', { value: '', text: 'All Departments' }));
    formSelect.appendChild(el('option', { value: '', text: '— No Department —' }));
    state.departments.forEach(function (item) {
      select.appendChild(el('option', { value: item.id, text: item.name || '' }));
      formSelect.appendChild(el('option', { value: item.id, text: item.name || '' }));
    });
    select.value = state.department; formSelect.value = keep;

    var counts = {}; var order = [];
    state.officers.forEach(function (item) { var key = positionOf(item); if (!(key in counts)) { counts[key] = 0; order.push(key); } counts[key] += 1; });
    var chips = $('positions'); chips.textContent = '';
    chips.appendChild(el('button', { type: 'button', 'aria-pressed': String(!state.position), text: 'All (' + state.officers.length + ')', onclick: function () { state.position = ''; render(); } }));
    order.forEach(function (code) {
      chips.appendChild(el('button', { type: 'button', 'aria-pressed': String(state.position === code), text: labelPosition(code) + ' (' + counts[code] + ')', onclick: function () { state.position = state.position === code ? '' : code; render(); } }));
    });
  }

  function renderRows() {
    var host = $('rows'); host.textContent = '';
    var list = shown();
    list.forEach(function (item) {
      var status = item.employmentStatus || 'ACTIVE';
      var actions = [
        action('Print ID card', ['M6 9V3h12v6', 'M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2', 'M6 14h12v7H6z'], printCards),
        action('Edit officer', ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'], function () { ui.navigate('officers/edit/' + encodeURIComponent(item.id)); }),
      ];
      if (status !== 'INACTIVE') actions.push(action('Deactivate officer', ['M18 6L6 18', 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z'], function () { deactivate(item); }));
      actions.push(action('Delete ' + (item.name || item.employeeNumber || 'officer'), ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v5M14 11v5'], function () { remove(item); }, 'danger'));
      host.appendChild(el('tr', {}, [
        el('td', {}, [el('div', { class: 'person' }, [avatar(item), el('div', {}, [el('strong', { text: item.name || 'Unknown user' }), el('span', { class: 'sub', text: item.employeeNumber || 'No employee number' })])])]),
        el('td', { text: item.email || '—' }),
        el('td', { text: item.phone || '—' }),
        el('td', {}, [el('span', { class: 'pill', text: labelPosition(item.position) })]),
        el('td', { text: (item.department && item.department.name) || '—' }),
        el('td', {}, [el('span', { class: 'pill ' + String(status).toLowerCase(), text: status })]),
        el('td', {}, [el('div', { class: 'row-actions' }, actions)]),
      ]));
    });
    $('rows-empty').hidden = list.length > 0;
  }

  function render() {
    var officersTab = state.tab === 'officers';
    $('summary').textContent = state.officers.length + ' ' + (state.officers.length === 1 ? 'Officer' : 'Officers') + ' · ' + state.departments.length + ' Departments';
    $('tab-officers').textContent = 'Officers (' + state.officers.length + ')';
    $('tab-departments').textContent = 'Departments (' + state.departments.length + ')';
    $('tab-officers').setAttribute('aria-selected', String(officersTab));
    $('tab-departments').setAttribute('aria-selected', String(!officersTab));
    $('officers-view').hidden = !officersTab;
    $('departments-view').hidden = officersTab;
    $('form').hidden = !state.open;
    $('toggle-form').textContent = state.open ? '× Close' : '＋ Add Officer';
    $('create').disabled = state.busy === 'create';
    $('create').textContent = state.busy === 'create' ? 'Creating…' : 'Create Officer';
    renderCards(); renderDepartments(); renderFilters(); renderRows();
  }

  function resetForm() {
    formFields.forEach(function (id) { $('f-' + id).value = ''; });
    $('f-position').value = 'OFFICER'; $('f-employmentStatus').value = 'ACTIVE'; $('f-startedAt').value = today();
    state.commandKey = ''; show('form-error');
  }
  function value(id) { return $('f-' + id).value; }

  function load() {
    return Promise.all([ui.api.get('officers'), ui.api.get('departments')]).then(function (results) {
      state.officers = rows(results[0]); state.departments = rows(results[1]); render();
    });
  }

  function create(event) {
    event.preventDefault();
    show('form-error');
    if (!value('name').trim() || !value('email').trim() || value('password').length < 8) { show('form-error', 'Name, email, and a password of at least 8 characters are required.'); return; }
    // The same key is reused if the request is retried, so a repeated submit cannot create two officers.
    state.commandKey = state.commandKey || newKey();
    state.busy = 'create'; render();
    ui.api.post('officers', {
      commandKey: state.commandKey, name: value('name').trim(), email: value('email').trim(), password: value('password'),
      phone: value('phone').trim() || null, photo: value('photo').trim() || null, employeeNumber: value('employeeNumber').trim() || null,
      position: value('position'), departmentId: value('departmentId') || null, employmentStatus: value('employmentStatus'),
      startedAt: value('startedAt') || null, endedAt: value('endedAt') || null, notes: value('notes').trim() || null,
    }).then(function () {
      state.open = false; resetForm();
      show('error'); show('message', 'Login account, officer profile, and attendance ID card created successfully.');
      return load();
    }).catch(function (error) { show('form-error', error.message || 'Officer could not be created.'); })
      .then(function () { state.busy = ''; render(); });
  }

  function change(key, work, done, failed) {
    state.busy = key; show('message'); show('error'); render();
    work().then(function () { show('message', done); return load(); })
      .catch(function (error) { show('error', error.message || failed); })
      .then(function () { state.busy = ''; render(); });
  }
  function deactivate(item) {
    if (!window.confirm('Deactivate ' + displayName(item) + '? Their login and attendance history will be preserved.')) return;
    change('deactivate:' + item.id, function () { return ui.api.patch('officers/' + encodeURIComponent(item.id), { employmentStatus: 'INACTIVE', endedAt: today() }); }, 'Officer deactivated.', 'Officer could not be deactivated.');
  }
  function remove(item) {
    if (!window.confirm('Permanently remove ' + displayName(item) + ' profile?\n\nThe login account is preserved. Officers with attendance history must be deactivated instead.')) return;
    change('delete:' + item.id, function () { return ui.api.delete('officers/' + encodeURIComponent(item.id)); }, 'Officer profile removed. The login account was preserved.', 'Officer could not be removed.');
  }
  function printCards() { window.print(); }

  positions.forEach(function (entry) { $('f-position').appendChild(el('option', { value: entry[0], text: entry[1] + ' (' + entry[0] + ')' })); });
  resetForm();
  $('tab-officers').addEventListener('click', function () { state.tab = 'officers'; render(); });
  $('tab-departments').addEventListener('click', function () { state.tab = 'departments'; render(); });
  $('toggle-form').addEventListener('click', function () { state.open = !state.open; state.commandKey = ''; show('form-error'); render(); });
  $('cancel').addEventListener('click', function () { state.open = false; render(); });
  $('form').addEventListener('submit', create);
  $('query').addEventListener('input', function (event) { state.query = event.target.value; renderRows(); });
  $('department-filter').addEventListener('change', function (event) { state.department = event.target.value; renderRows(); });
  $('manage-departments').addEventListener('click', function () { ui.navigate('departments'); });
  $('print-cards').addEventListener('click', printCards);

  render();
  ui.autoResize();
  ui.connect()
    .then(load)
    .catch(function (error) { show('error', error.message || 'Officers could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
