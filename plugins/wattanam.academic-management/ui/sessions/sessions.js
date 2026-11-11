/* Session Time Settings: Academic Management's own screen (moved out of the school core in 0.3.7).
 * Runs in the core's sandboxed plugin frame and talks to this plugin's API only:
 *   GET sessions, POST sessions, GET session-settings, PUT session-settings. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var classDefaults = [
    { scope: 'STUDENT', session: 1, type: 'CHECK_IN', startTime: '07:00', endTime: '07:15' },
    { scope: 'STUDENT', session: 2, type: 'CHECK_OUT', startTime: '12:00', endTime: '12:15' },
    { scope: 'STUDENT', session: 3, type: 'CHECK_IN', startTime: '13:00', endTime: '13:15' },
    { scope: 'STUDENT', session: 4, type: 'CHECK_OUT', startTime: '17:00', endTime: '17:15' },
  ];
  var staffDefaults = [
    { scope: 'STAFF', session: 1, type: 'CHECK_IN', startTime: '07:00', endTime: '07:30' },
    { scope: 'STAFF', session: 2, type: 'CHECK_OUT', startTime: '11:30', endTime: '12:00' },
    { scope: 'STAFF', session: 3, type: 'CHECK_IN', startTime: '13:00', endTime: '13:30' },
    { scope: 'STAFF', session: 4, type: 'CHECK_OUT', startTime: '17:00', endTime: '17:30' },
  ];
  var presets = [
    { id: 'FULL', icon: '🌞', label: 'Full Day', detail: '7:00 AM – 5:00 PM (Morning + Afternoon)', sessions: [['07:00', '07:15'], ['12:00', '12:15'], ['13:00', '13:15'], ['17:00', '17:15']] },
    { id: 'MORNING', icon: '🌅', label: 'Morning Only', detail: '7:00 AM – 12:00 PM', sessions: [['07:00', '07:15'], ['12:00', '12:15'], ['12:00', '12:15'], ['12:00', '12:15']] },
    { id: 'AFTERNOON', icon: '🌤️', label: 'Afternoon Only', detail: '1:00 PM – 5:30 PM', sessions: [['13:00', '13:15'], ['13:00', '13:15'], ['13:00', '13:15'], ['17:15', '17:30']] },
    { id: 'EVENING', icon: '🌆', label: 'Evening', detail: '6:00 PM – 9:00 PM', sessions: [['18:00', '18:15'], ['18:00', '18:15'], ['20:45', '21:00'], ['20:45', '21:00']] },
    { id: 'NIGHT', icon: '🌙', label: 'Night Shift', detail: '6:00 PM – 6:00 AM (overnight)', sessions: [['18:00', '18:15'], ['23:45', '23:59'], ['00:00', '00:15'], ['05:45', '06:00']] },
    { id: 'CUSTOM', icon: '🔧', label: 'Custom', detail: 'Set times manually', sessions: [] },
  ];
  var names = ['Morning 1', 'Morning 2', 'Afternoon 1', 'Afternoon 2'];
  var days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  var weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

  var state = {
    tab: 'STUDENT',
    student: copy(classDefaults),
    staff: copy(staffDefaults),
    settings: { classFormat: 'CUSTOM', classFormatRules: false, staffFormatRules: false, staffWorkingDays: weekdays.slice() },
    busy: false,
  };

  function copy(list) { return list.map(function (item) { return Object.assign({}, item); }); }
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
  function normalize(value, scope, fallback) {
    var found = rows(value).filter(function (item) { return item.scope === scope && !item.classId; });
    return fallback.map(function (item) {
      var current = found.filter(function (candidate) { return Number(candidate.session) === item.session; })[0];
      return current ? Object.assign({}, item, current, { startTime: String(current.startTime).slice(0, 5), endTime: String(current.endTime).slice(0, 5) }) : Object.assign({}, item);
    });
  }
  function active() { return state.tab === 'STUDENT' ? state.student : state.staff; }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }

  function renderPresets() {
    var host = $('presets'); host.textContent = '';
    presets.forEach(function (preset) {
      var selected = state.settings.classFormat === preset.id;
      var children = [el('span', { text: preset.icon }), el('strong', { text: preset.label }), el('span', { class: 'detail', text: preset.detail })];
      if (selected) children.push(el('span', { class: 'active', text: '✓ Active' }));
      host.appendChild(el('button', { type: 'button', class: 'preset', 'aria-pressed': String(selected), onclick: function () { applyPreset(preset.id); } }, children));
    });
  }

  function renderSessions() {
    var host = $('sessions'); host.textContent = '';
    active().forEach(function (item, index) {
      var type = el('select', { 'aria-label': names[index] + ' type', onchange: function (event) { update(index, { type: event.target.value }); } }, [
        el('option', { value: 'CHECK_IN', text: '📥 Check-In' }), el('option', { value: 'CHECK_OUT', text: '📤 Check-Out' }),
      ]);
      type.value = item.type;
      var start = el('input', { type: 'time', value: item.startTime, 'aria-label': names[index] + ' start time', onchange: function (event) { update(index, { startTime: event.target.value }); } });
      var end = el('input', { type: 'time', value: item.endTime, 'aria-label': names[index] + ' end time', onchange: function (event) { update(index, { endTime: event.target.value }); } });
      host.appendChild(el('article', { class: 'session' }, [
        el('header', {}, [el('span', { class: 'icon ' + (item.type === 'CHECK_IN' ? 'in' : 'out'), text: item.type === 'CHECK_IN' ? '📥' : '📤' }), el('div', {}, [el('h2', { text: names[index] }), el('p', { class: 'muted small', text: 'Session ' + item.session })])]),
        el('label', { text: 'Type' }, [type]),
        el('div', { class: 'grid2' }, [el('label', { text: 'Start Time' }, [start]), el('label', { text: 'End Time' }, [end])]),
      ]));
    });
  }

  function renderDays() {
    var host = $('days'); host.textContent = '';
    days.forEach(function (day) {
      var working = state.settings.staffWorkingDays.indexOf(day) >= 0;
      host.appendChild(el('button', {
        type: 'button', class: working ? 'working' : 'off', 'aria-pressed': String(working),
        text: day[0] + day.slice(1).toLowerCase() + (working ? ' ✓ Working' : ' ⊘ Off'),
        onclick: function () {
          state.settings.staffWorkingDays = working ? state.settings.staffWorkingDays.filter(function (value) { return value !== day; }) : state.settings.staffWorkingDays.concat([day]);
          render();
        },
      }));
    });
  }

  function render() {
    var student = state.tab === 'STUDENT';
    $('tab-student').setAttribute('aria-selected', String(student));
    $('tab-staff').setAttribute('aria-selected', String(!student));
    $('scope-help').textContent = student
      ? 'Configure global default time windows for student class attendance. Teachers can override these per-class.'
      : 'Configure time windows for staff check-in and check-out sessions.';
    $('student-only').hidden = !student;
    $('staff-only').hidden = student;
    $('rules-help').textContent = 'Convert accumulated lates/permissions into absences for ' + (student ? 'student' : 'staff') + ' reports';
    var rulesOn = student ? state.settings.classFormatRules : state.settings.staffFormatRules;
    $('format-rules').checked = rulesOn;
    $('format-rules-label').textContent = rulesOn ? 'Enabled' : 'Disabled';
    $('save').textContent = '💾 ' + (state.busy ? 'Saving…' : 'Save ' + (student ? 'Class' : 'Staff') + ' Settings');
    $('save').disabled = state.busy;
    if (student) renderPresets(); else renderDays();
    renderSessions();
  }

  function update(index, change) {
    var list = active();
    list[index] = Object.assign({}, list[index], change);
    if (state.tab === 'STUDENT') state.settings.classFormat = 'CUSTOM';
    render();
  }

  function applyPreset(id) {
    var preset = presets.filter(function (item) { return item.id === id; })[0];
    if (!preset) return;
    state.settings.classFormat = id;
    if (preset.sessions.length) state.student = classDefaults.map(function (item, index) { return Object.assign({}, item, { startTime: preset.sessions[index][0], endTime: preset.sessions[index][1] }); });
    render();
  }

  function reset() {
    if (state.tab === 'STUDENT') { state.student = copy(classDefaults); state.settings.classFormat = 'FULL'; state.settings.classFormatRules = false; }
    else { state.staff = copy(staffDefaults); state.settings.staffFormatRules = false; state.settings.staffWorkingDays = weekdays.slice(); }
    show('error'); show('message', 'Defaults restored locally. Select Save to persist them.');
    render();
  }

  function save() {
    var list = active();
    for (var i = 0; i < list.length; i += 1) {
      if (!/^\d{2}:\d{2}$/.test(list[i].startTime) || !/^\d{2}:\d{2}$/.test(list[i].endTime)) { show('message'); show('error', 'Session ' + list[i].session + ' requires valid start and end times.'); return; }
    }
    state.busy = true; show('message'); show('error'); render();
    list.reduce(function (chain, item) {
      return chain.then(function () { return ui.api.post('sessions', Object.assign({}, item, { classId: '' })); });
    }, Promise.resolve())
      .then(function () { return ui.api.put('session-settings', state.settings); })
      .then(function () { show('message', (state.tab === 'STUDENT' ? 'Class' : 'Staff') + ' session settings saved.'); return load(); })
      .catch(function (error) { show('error', error.message || 'Settings could not be saved.'); })
      .then(function () { state.busy = false; render(); });
  }

  function load() {
    return Promise.all([ui.api.get('sessions'), ui.api.get('session-settings')]).then(function (results) {
      state.student = normalize(results[0], 'STUDENT', classDefaults);
      state.staff = normalize(results[0], 'STAFF', staffDefaults);
      if (results[1] && typeof results[1] === 'object') state.settings = Object.assign({}, state.settings, results[1]);
      render();
    });
  }

  $('tab-student').addEventListener('click', function () { state.tab = 'STUDENT'; render(); });
  $('tab-staff').addEventListener('click', function () { state.tab = 'STAFF'; render(); });
  $('format-rules').addEventListener('change', function (event) { state.settings[state.tab === 'STUDENT' ? 'classFormatRules' : 'staffFormatRules'] = event.target.checked; render(); });
  $('save').addEventListener('click', save);
  $('reset').addEventListener('click', reset);
  Array.prototype.forEach.call(document.querySelectorAll('[data-days]'), function (button) {
    button.addEventListener('click', function () { state.settings.staffWorkingDays = button.getAttribute('data-days').split(','); render(); });
  });

  render();
  ui.autoResize();
  ui.connect()
    .then(load)
    .catch(function (error) { show('error', error.message || 'Session settings could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
