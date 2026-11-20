/* Attendance Stations: approve devices, choose their methods (QR, NFC), mode and classes; settings.
 * Plugin API: GET stations, PUT stations/:id, GET classes, GET/PUT settings. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var CONFIGURE = 'wattanam.smart-attendance.configure';
  var state = { stations: [], classes: [], canConfigure: false };
  var STATUS = { PENDING: ['warn', 'Waiting for approval'], ACTIVE: ['ok', 'On'], REVOKED: ['bad', 'Turned off'] };

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') node.textContent = attrs[k]; else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]); else node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function say(id, text) { $(id).textContent = text || ''; $(id).hidden = !text; }
  function when(iso) { return iso ? new Date(iso).toLocaleString() : 'never'; }

  function card(s) {
    var name = el('input', { maxlength: '80', value: s.name }), place = el('input', { maxlength: '120', value: s.place || '' });
    var mode = el('select', {}, [['AUTO', 'By the time of day'], ['CHECK_IN', 'Check-in only'], ['CHECK_OUT', 'Check-out only']].map(function (m) { return el('option', { value: m[0], text: m[1] }); }));
    mode.value = s.mode;
    var methods = [['QR', '🔳 QR codes (ID cards)'], ['NFC', '📶 NFC cards'], ['FACE', '🙂 Faces']].map(function (m) {
      var box = el('input', { type: 'checkbox', value: m[0] }); box.checked = s.methods.indexOf(m[0]) >= 0; return el('label', {}, [box, m[1]]);
    });
    var classes = state.classes.map(function (c) {
      var box = el('input', { type: 'checkbox', value: c.id }); box.checked = s.classIds.indexOf(c.id) >= 0; return el('label', {}, [box, c.name + ' (' + c.students + ')']);
    });
    function values(status) {
      return {
        name: name.value.trim(), place: place.value.trim(), mode: mode.value, status: status || s.status,
        methods: methods.map(function (l) { return l.firstChild; }).filter(function (b) { return b.checked; }).map(function (b) { return b.value; }),
        classIds: classes.map(function (l) { return l.firstChild; }).filter(function (b) { return b.checked; }).map(function (b) { return b.value; }),
      };
    }
    function save(status, done) {
      say('error'); say('message');
      ui.api.put('stations/' + encodeURIComponent(s.id), values(status))
        .then(function () { say('message', done); return load(); })
        .catch(function (e) { say('error', e.message || 'The station could not be saved.'); });
    }
    var badge = STATUS[s.status] || ['', s.status];
    return el('section', { class: 'panel station', 'data-station': s.id }, [
      el('div', { class: 'station-top' }, [
        el('h2', { text: (s.kind === 'TERMINAL' ? '🖥️ ' : '') + s.name }), el('span', { class: 'badge ' + badge[0], text: (s.kind === 'TERMINAL' ? 'Terminal · ' : '') + badge[1] }),
      ]),
      el('p', { class: 'muted', text: 'Last seen ' + when(s.lastSeenAt) + ' · ' + s.capturesToday + ' scans in the last 24 hours' }),
      el('div', { class: 'grid' }, [el('label', {}, ['Name', name]), el('label', {}, ['Place', place]), el('label', {}, ['Check-in / check-out', mode])]),
      el('fieldset', {}, [el('legend', { text: 'Accepts' }), el('div', { class: 'checks' }, methods)]),
      el('fieldset', {}, [el('legend', { text: 'Classes (none ticked = the whole school)' }), state.classes.length ? el('div', { class: 'checks' }, classes) : el('p', { class: 'muted', text: 'No classes with students yet.' })]),
      el('div', { class: 'actions' }, [
        s.status === 'PENDING' ? el('button', { type: 'button', class: 'primary', 'data-approve': s.id, text: '✓ Approve', onclick: function () { save('ACTIVE', s.name + ' is approved; it can take attendance now.'); } }) : null,
        s.status !== 'PENDING' ? el('button', { type: 'button', class: 'primary', text: 'Save', onclick: function () { save(null, s.name + ' is saved.'); } }) : null,
        s.status === 'ACTIVE' ? el('button', { type: 'button', class: 'danger', text: 'Turn off', onclick: function () { if (window.confirm('Turn off ' + s.name + '? It stops taking attendance.')) save('REVOKED', s.name + ' is turned off.'); } }) : null,
        s.status === 'REVOKED' && s.kind !== 'TERMINAL' ? el('button', { type: 'button', text: 'Turn on again', onclick: function () { save('ACTIVE', s.name + ' is on again.'); } }) : null,
        s.kind === 'TERMINAL' ? el('button', { type: 'button', text: '🔑 New key', onclick: function () { if (window.confirm('Make a new key for ' + s.name + '? The old key stops working at once.')) newKey(s); } }) : null,
      ]),
    ]);
  }
  function fillSettings(s) {
    $('cooldown').value = s.cooldownSeconds; $('offline').value = s.maxOfflineHours;
    $('accept').value = s.faceAccept; $('review').value = s.faceReview; $('margin').value = s.faceMargin; $('liveness').checked = s.livenessRequired;
  }
  // a terminal's key: shown once, with what to put in the terminal (or its bridge program)
  function showKey(r) {
    $('key-box').hidden = false;
    $('key-text').textContent = ['Key: ' + r.token, 'Send to: POST ' + r.endpoint + ' (on this school address)', 'Header: ' + r.header, 'Body: ' + r.body].join('\n');
    $('key-box').scrollIntoView({ block: 'center' });
  }
  function newKey(s) {
    say('error'); say('message');
    ui.api.post('terminals/' + encodeURIComponent(s.id) + '/key', {}).then(function (r) { showKey(r); say('message', 'New key for ' + s.name + '.'); return load(); })
      .catch(function (e) { say('error', e.message || 'The key could not be made.'); });
  }
  $('terminal-form').addEventListener('submit', function (event) {
    event.preventDefault(); say('error'); say('message');
    var methods = []; if ($('t-face').checked) methods.push('FACE'); if ($('t-nfc').checked) methods.push('NFC');
    ui.api.post('terminals', { name: $('t-name').value.trim(), place: $('t-place').value.trim(), methods: methods })
      .then(function (r) { showKey(r); say('message', r.station.name + ' is added.'); $('t-name').value = ''; $('t-place').value = ''; return load(); })
      .catch(function (e) { say('error', e.message || 'The terminal could not be added.'); });
  });
  function render() {
    var list = $('list'); list.textContent = '';
    if (!state.stations.length) list.appendChild(el('p', { class: 'panel empty', text: 'No stations yet.' }));
    state.stations.forEach(function (s) { list.appendChild(card(s)); });
  }
  function load() {
    return Promise.all([ui.api.get('stations'), ui.api.get('classes').catch(function () { return []; })]).then(function (r) {
      state.stations = r[0] || []; state.classes = r[1] || []; render();
    });
  }
  $('reload').addEventListener('click', function () { say('message'); load().catch(function (e) { say('error', e.message); }); });
  $('settings').addEventListener('submit', function (event) {
    event.preventDefault(); say('error'); say('message');
    ui.api.put('settings', { cooldownSeconds: Number($('cooldown').value), maxOfflineHours: Number($('offline').value), faceAccept: Number($('accept').value), faceReview: Number($('review').value), faceMargin: Number($('margin').value), livenessRequired: $('liveness').checked })
      .then(function (s) { fillSettings(s); say('message', 'Settings saved.'); })
      .catch(function (e) { say('error', e.message || 'The settings could not be saved.'); });
  });

  ui.autoResize();
  ui.connect().then(function (context) {
    var granted = context && context.permissions;
    state.canConfigure = !Array.isArray(granted) || granted.indexOf(CONFIGURE) >= 0;
    $('settings-panel').hidden = !state.canConfigure;
    return Promise.all([load(), state.canConfigure ? ui.api.get('settings').then(fillSettings).catch(function () { $('settings-panel').hidden = true; }) : null]);
  }).catch(function (e) { say('error', e.message || 'The stations could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
