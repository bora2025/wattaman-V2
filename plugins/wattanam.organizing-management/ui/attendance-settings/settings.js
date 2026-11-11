/* Workforce Attendance Settings: Organizing Management's own screen (moved out of the school core
 * in 0.26.0). Runs in the core's sandboxed plugin frame and talks to this plugin's API only:
 *   GET/POST attendance/sessions, GET/PUT attendance/session-settings. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var defaults = [
    { scope: 'STAFF', session: 1, type: 'CHECK_IN', startTime: '07:00', endTime: '07:30' },
    { scope: 'STAFF', session: 2, type: 'CHECK_OUT', startTime: '11:30', endTime: '12:00' },
    { scope: 'STAFF', session: 3, type: 'CHECK_IN', startTime: '13:00', endTime: '13:30' },
    { scope: 'STAFF', session: 4, type: 'CHECK_OUT', startTime: '17:00', endTime: '17:30' },
  ];
  var names = ['Morning 1', 'Morning 2', 'Afternoon 1', 'Afternoon 2'];
  var days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  var weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  var clock = /^[0-9]{2}:[0-9]{2}$/;

  var state = { sessions: copy(defaults), settings: { staffFormatRules: false, staffWorkingDays: weekdays.slice() }, busy: false };

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
  function normalize(value) {
    var found = rows(value);
    return defaults.map(function (item) {
      var current = found.filter(function (candidate) { return Number(candidate.session) === item.session; })[0];
      return current ? Object.assign({}, item, current, { scope: 'STAFF', startTime: String(current.startTime).slice(0, 5), endTime: String(current.endTime).slice(0, 5) }) : Object.assign({}, item);
    });
  }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }

  function renderSessions() {
    var host = $('sessions'); host.textContent = '';
    state.sessions.forEach(function (item, index) {
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
    $('format-rules').checked = state.settings.staffFormatRules === true;
    $('format-rules-label').textContent = state.settings.staffFormatRules ? 'Enabled' : 'Disabled';
    $('save').textContent = '💾 ' + (state.busy ? 'Saving…' : 'Save Workforce Settings');
    $('save').disabled = state.busy;
    renderDays();
    renderSessions();
  }

  function update(index, change) { state.sessions[index] = Object.assign({}, state.sessions[index], change); render(); }

  function reset() {
    state.sessions = copy(defaults); state.settings.staffFormatRules = false; state.settings.staffWorkingDays = weekdays.slice();
    show('error'); show('message', 'Defaults restored locally. Select Save to persist them.');
    render();
  }

  function save() {
    for (var i = 0; i < state.sessions.length; i += 1) {
      var item = state.sessions[i];
      if (!clock.test(item.startTime) || !clock.test(item.endTime)) { show('message'); show('error', 'Session ' + item.session + ' requires valid start and end times.'); return; }
      if (item.endTime <= item.startTime) { show('message'); show('error', 'Session ' + item.session + ': the end time must be after the start time.'); return; }
    }
    if (!state.settings.staffWorkingDays.length) { show('message'); show('error', 'Choose at least one working day.'); return; }
    state.busy = true; show('message'); show('error'); render();
    state.sessions.reduce(function (chain, item) {
      return chain.then(function () { return ui.api.post('attendance/sessions', { scope: 'STAFF', session: item.session, type: item.type, startTime: item.startTime, endTime: item.endTime }); });
    }, Promise.resolve())
      .then(function () { return ui.api.put('attendance/session-settings', { staffFormatRules: state.settings.staffFormatRules === true, staffWorkingDays: state.settings.staffWorkingDays }); })
      .then(function () { show('message', 'Workforce session settings saved.'); return load(); })
      .catch(function (error) { show('error', error.message || 'Settings could not be saved.'); })
      .then(function () { state.busy = false; render(); });
  }

  function load() {
    return Promise.all([ui.api.get('attendance/sessions'), ui.api.get('attendance/session-settings')]).then(function (results) {
      state.sessions = normalize(results[0]);
      var saved = results[1] && typeof results[1] === 'object' ? results[1] : {};
      state.settings = { staffFormatRules: saved.staffFormatRules === true, staffWorkingDays: Array.isArray(saved.staffWorkingDays) && saved.staffWorkingDays.length ? saved.staffWorkingDays.slice() : weekdays.slice() };
      render();
    });
  }

  $('format-rules').addEventListener('change', function (event) { state.settings.staffFormatRules = event.target.checked; render(); });
  $('save').addEventListener('click', save);
  $('reset').addEventListener('click', reset);
  Array.prototype.forEach.call(document.querySelectorAll('[data-days]'), function (button) {
    button.addEventListener('click', function () { state.settings.staffWorkingDays = button.getAttribute('data-days').split(','); render(); });
  });

  render();
  ui.autoResize();
  ui.connect()
    .then(load)
    .catch(function (error) { show('error', error.message || 'Attendance settings could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
