/* Scan Attendance: the student's own self-attendance screen (Academic Management 0.6.0).
 * Runs in the core's sandboxed plugin frame and talks to this plugin's API only:
 *   POST student/self-scan, GET student/attendance-history,
 *   GET/POST student/attendance-devices.
 * The school page runs the camera and location (devices: scanner, location, device-id); this screen
 * receives decoded codes, one position per scan, and a per-plugin device identifier. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var MIN_TOKEN = 40, MAX_TOKEN = 1000, RETRY_MS = 15000, REPEAT_MS = 20000;
  var last = { token: '', at: 0 };
  // Every result the server can return, in words a student understands.
  var RESULTS = {
    RECORDED: ['success', '✅', 'Attendance recorded', 'You are marked present.'],
    LATE: ['warning', '⏰', 'Recorded as late', 'Your attendance was recorded, but after the late limit.'],
    ALREADY_RECORDED: ['success', '✅', 'Already recorded', 'Your attendance for this session was recorded earlier.'],
    REQUIRES_REVIEW: ['warning', '🕵️', 'Sent for teacher review', 'Your scan was saved and a teacher will confirm it.'],
    INVALID_QR: ['danger', '⛔', 'Not a valid attendance code', 'Scan the QR code your teacher is showing for this class.'],
    EXPIRED_QR: ['danger', '⌛', 'This code has expired', 'Ask your teacher to show a fresh QR code and scan again.'],
    NO_ACTIVE_SESSION: ['danger', '🕒', 'Attendance is not open now', 'This QR code is outside its attendance time.'],
    CLOSED_WINDOW: ['danger', '🔒', 'Attendance is closed', 'Your teacher has closed attendance for this session.'],
    DAY_OFF: ['danger', '📅', 'No class today', 'Today is not a study day for this class.'],
    WRONG_CLASS: ['danger', '🏫', 'Not your class', 'You are not enrolled in the class this QR code belongs to.'],
    DEVICE_REJECTED: ['danger', '📱', 'Device not registered', 'This session only accepts registered devices. Register this device in the "This device" tab.'],
    UNAUTHORIZED: ['danger', '🚫', 'Students only', 'Only a signed-in student can record their own attendance.'],
  };
  var REASONS = {
    UNAVAILABLE: 'your location was not available', INACCURATE: 'your location was not accurate enough', OUTSIDE_GEOFENCE: 'you seemed to be outside the school area',
  };
  var state = { tab: 'scan', scanning: false, busy: false, deviceId: null, deviceNote: 'checking…', location: 'checking…', today: [], queue: [], history: [], devices: [], online: navigator.onLine !== false };

  function $(id) { return document.getElementById(id); }
  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attributes[key];
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), attributes[key]);
      else node.setAttribute(key, attributes[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }
  function rows(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  function newKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function vibrate(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (error) { /* optional */ } }
  function beep(ok) {
    try {
      var Context = window.AudioContext || window.webkitAudioContext; if (!Context) return;
      var audio = new Context(), tone = audio.createOscillator(), gain = audio.createGain();
      tone.frequency.value = ok ? 880 : 220; gain.gain.value = 0.06; tone.connect(gain); gain.connect(audio.destination);
      tone.start(); tone.stop(audio.currentTime + (ok ? 0.12 : 0.22)); tone.onended = function () { audio.close(); };
    } catch (error) { /* optional */ }
  }
  function timeOf(value) { var date = new Date(value); return isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

  function setResult(tone, icon, title, detail) {
    var node = $('result');
    node.className = 'result ' + tone;
    $('result-icon').textContent = icon; $('result-title').textContent = title; $('result-detail').textContent = detail || '';
  }
  function describe(response) {
    var known = RESULTS[response.result] || ['warning', 'ℹ️', String(response.result || 'Saved'), ''];
    var detail = known[3];
    if (response.result === 'REQUIRES_REVIEW' && response.rejectionReason) {
      var match = /Location validation: ([A-Z_]+)/.exec(response.rejectionReason);
      if (match && REASONS[match[1]]) detail = 'Saved for teacher review because ' + REASONS[match[1]] + '.';
    }
    return { tone: known[0], icon: known[1], title: known[2], detail: detail };
  }

  // ---------- rendering ----------
  function renderTabs() {
    ['scan', 'history', 'device'].forEach(function (name) {
      $('tab-' + name).setAttribute('aria-selected', String(state.tab === name));
      $(name + '-view').hidden = state.tab !== name;
    });
  }
  function renderChips() {
    var network = $('chip-network');
    network.textContent = state.online ? '● Online' : '● Offline — scans are kept on this screen';
    network.className = 'chip ' + (state.online ? 'ok' : 'warn');
    var location = $('chip-location');
    location.textContent = '📍 Location: ' + state.location;
    location.className = 'chip ' + (/^on/.test(state.location) ? 'ok' : /checking/.test(state.location) ? '' : 'warn');
    var registered = state.deviceId && state.devices.some(function (item) { return item.active !== false && item.matchesThisDevice; });
    var device = $('chip-device');
    device.textContent = '📱 Device: ' + (registered ? 'registered' : state.deviceNote);
    device.className = 'chip ' + (registered ? 'ok' : '');
    $('start').hidden = state.scanning; $('stop').hidden = !state.scanning;
    show('pending', state.queue.length ? state.queue.length + (state.queue.length === 1 ? ' scan is' : ' scans are') + ' waiting for the connection. Keep this screen open; they are sent automatically.' : '');
  }
  function renderToday() {
    var host = $('today'); host.textContent = '';
    state.today.forEach(function (entry) {
      host.appendChild(el('div', { class: 'item' }, [
        el('div', {}, [el('strong', { text: entry.title }), el('span', { class: 'sub', text: timeOf(entry.at) + (entry.detail ? ' · ' + entry.detail : '') })]),
        el('span', { class: 'badge ' + entry.badge, text: entry.badge.replace(/_/g, ' ') }),
      ]));
    });
    $('today-empty').hidden = state.today.length > 0;
  }
  function renderHistory() {
    var counts = { PRESENT: 0, LATE: 0, PERMISSION: 0, ABSENT: 0 };
    state.history.forEach(function (row) { if (row.status in counts) counts[row.status] += 1; });
    var summary = $('summary'); summary.textContent = '';
    [['PRESENT', 'Present'], ['LATE', 'Late'], ['PERMISSION', 'Permission'], ['ABSENT', 'Absent']].forEach(function (entry) {
      summary.appendChild(el('div', {}, [el('strong', { text: String(counts[entry[0]]) }), el('span', { text: entry[1].toUpperCase() })]));
    });
    var host = $('history'); host.textContent = '';
    state.history.forEach(function (row) {
      var when = String(row.date || '').slice(0, 10) + ' · Session ' + row.session + (row.checkInTime ? ' · in ' + timeOf(row.checkInTime) : '') + (row.checkOutTime ? ' · out ' + timeOf(row.checkOutTime) : '');
      var badges = [el('span', { class: 'badge ' + row.status, text: row.status })];
      if (row.reviewStatus && row.reviewStatus !== 'APPROVED' && row.reviewStatus !== 'NOT_REQUIRED') badges.push(el('span', { class: 'badge ' + row.reviewStatus, text: row.reviewStatus }));
      host.appendChild(el('div', { class: 'item' }, [el('div', {}, [el('strong', { text: row.classNameSnapshot || 'Class' }), el('span', { class: 'sub', text: when })]), el('div', {}, badges)]));
    });
    $('history-empty').hidden = state.history.length > 0;
  }
  function renderDevices() {
    var host = $('devices'); host.textContent = '';
    state.devices.forEach(function (item) {
      host.appendChild(el('div', { class: 'item' }, [
        el('div', {}, [el('strong', { text: (item.label || 'Unnamed device') + (item.matchesThisDevice ? ' (this device)' : '') }), el('span', { class: 'sub', text: 'Registered ' + String(item.registeredAt || '').slice(0, 10) + (item.lastUsedAt ? ' · last used ' + String(item.lastUsedAt).slice(0, 10) : '') })]),
        el('span', { class: 'badge ' + (item.active === false ? 'INACTIVE' : 'ACTIVE'), text: item.active === false ? 'INACTIVE' : 'ACTIVE' }),
      ]));
    });
    $('devices-empty').hidden = state.devices.length > 0;
    var registered = state.devices.some(function (item) { return item.matchesThisDevice && item.active !== false; });
    $('device-state').textContent = !state.deviceId ? 'This browser cannot keep a device identifier (private browsing?), so it cannot be registered.' : registered ? '✅ This device is registered.' : 'This device is not registered yet.';
    $('device-form').hidden = !state.deviceId;
    $('register').disabled = state.busy;
    $('register').textContent = registered ? 'Update name' : 'Register this device';
  }
  function render() { renderTabs(); renderChips(); renderToday(); renderHistory(); renderDevices(); }

  // ---------- scanning ----------
  function locate() {
    return ui.location().then(function (position) {
      state.location = 'on (±' + Math.round(Number(position.accuracy) || 0) + ' m)';
      return { latitude: position.latitude, longitude: position.longitude, accuracyMeters: position.accuracy };
    }).catch(function (error) {
      state.location = error.status === 403 ? 'permission not granted' : 'unavailable';
      return null;
    }).then(function (value) { renderChips(); return value; });
  }

  function send(entry) {
    return ui.api.post('student/self-scan', entry.body).then(function (response) {
      var view = describe(response || {});
      entry.done = true;
      state.today.unshift({ at: entry.at, title: view.title, detail: view.detail, badge: (response && response.result) || 'RECORDED' });
      setResult(view.tone, view.icon, view.title, view.detail);
      var ok = view.tone === 'success';
      beep(ok); vibrate(ok ? 180 : [250, 100, 250]);
      if (response && response.recordId) loadHistory();
      return true;
    }).catch(function (error) {
      // No answer at all (offline, server restarting): keep the scan and send it again later with
      // the same request id, so it can never be recorded twice.
      if (!error.status || error.status >= 500 || error.status === 429) return false;
      entry.done = true;
      state.today.unshift({ at: entry.at, title: 'Not recorded', detail: error.message || 'The scan was refused.', badge: 'FAILED' });
      setResult('danger', '⛔', 'Not recorded', error.message || 'The scan was refused.');
      beep(false); vibrate([250, 100, 250]);
      return true;
    });
  }

  function submit(raw, fromCamera) {
    var token = String(raw || '').trim();
    if (state.busy) return;
    // The camera keeps reporting a code while it stays in view; handle each code once.
    if (fromCamera && token === last.token && Date.now() - last.at < REPEAT_MS) return;
    last = { token: token, at: Date.now() };
    if (token.length < MIN_TOKEN || token.length > MAX_TOKEN) {
      setResult('danger', '⛔', 'Not an attendance code', 'This QR code is not a class attendance code. Scan the code your teacher shows.');
      return;
    }
    state.busy = true;
    setResult('working', '⏳', 'Recording…', 'Checking the code with the school.');
    var at = new Date().toISOString();
    locate().then(function (position) {
      var body = { attendanceToken: token, clientRequestId: newKey(), scannedAt: at, networkQuality: state.online ? 'ONLINE' : 'OFFLINE' };
      if (state.deviceId) body.deviceId = state.deviceId;
      if (position) { body.latitude = position.latitude; body.longitude = position.longitude; body.accuracyMeters = position.accuracyMeters; }
      var entry = { at: at, body: body, done: false };
      return send(entry).then(function (answered) {
        // Done with the camera once the scan is recorded or saved; keep it open after a refusal.
        var finished = !answered || /^(success|warning)$/.test($('result').className.replace('result ', ''));
        if (finished && state.scanning) stopCamera();
        if (!answered) {
          state.queue.push(entry);
          setResult('warning', '💾', 'Saved — waiting for connection', 'Keep this screen open. The scan is sent automatically with its original time.');
          vibrate([100, 60, 100]);
        }
      });
    }).then(function () { state.busy = false; $('manual').value = ''; render(); });
  }

  function flush() {
    if (!state.queue.length || state.flushing) return;
    state.flushing = true;
    state.queue.reduce(function (chain, entry) {
      return chain.then(function () { if (!entry.done) return send(entry); });
    }, Promise.resolve()).then(function () {
      state.queue = state.queue.filter(function (entry) { return !entry.done; });
      state.flushing = false; render();
    });
  }

  function startCamera() {
    state.scanning = true;
    setResult('idle', '📷', 'Camera ready', 'Point the camera at the attendance QR code.');
    renderChips();
    ui.scanner.start({
      onResult: function (text) { submit(text, true); },
      onError: function (message) { setResult('danger', '📷', 'Camera unavailable', message || 'Allow camera access for this site, or enter the code below.'); },
      onClose: function () { state.scanning = false; renderChips(); },
    });
  }
  function stopCamera() { ui.scanner.stop(); state.scanning = false; renderChips(); }

  // ---------- history and devices ----------
  function loadHistory() {
    return ui.api.get('student/attendance-history').then(function (result) { state.history = rows(result); renderHistory(); })
      .catch(function (error) { show('error', error.message || 'Attendance history could not be loaded.'); });
  }
  // The server compares this browser's identifier (as a hash) and marks the matching device.
  function loadDevices() {
    return ui.api.get('student/attendance-devices', state.deviceId ? { deviceId: state.deviceId } : undefined).then(function (result) {
      var list = rows(result);
      list.forEach(function (item) { item.matchesThisDevice = item.thisDevice === true; });
      state.devices = list; render();
    }).catch(function (error) { show('error', error.message || 'Devices could not be loaded.'); });
  }
  function register(event) {
    event.preventDefault();
    if (!state.deviceId || state.busy) return;
    state.busy = true; show('error'); renderDevices();
    ui.api.post('student/attendance-devices', { deviceId: state.deviceId, label: $('device-label').value.trim() || 'My device' })
      .then(function () { return loadDevices(); })
      .catch(function (error) { show('error', error.message || 'This device could not be registered.'); })
      .then(function () { state.busy = false; render(); });
  }

  $('tab-scan').addEventListener('click', function () { state.tab = 'scan'; render(); });
  $('tab-history').addEventListener('click', function () { state.tab = 'history'; render(); loadHistory(); });
  $('tab-device').addEventListener('click', function () { state.tab = 'device'; render(); });
  $('start').addEventListener('click', startCamera);
  $('stop').addEventListener('click', stopCamera);
  $('manual-form').addEventListener('submit', function (event) { event.preventDefault(); submit($('manual').value); });
  $('device-form').addEventListener('submit', register);
  window.addEventListener('online', function () { state.online = true; renderChips(); flush(); });
  window.addEventListener('offline', function () { state.online = false; renderChips(); });
  setInterval(flush, RETRY_MS);

  render();
  ui.autoResize();
  ui.connect().then(function () {
    ui.deviceId().then(function (id) { state.deviceId = id || null; state.deviceNote = id ? 'not registered' : 'unavailable'; })
      .catch(function () { state.deviceId = null; state.deviceNote = 'unavailable'; })
      .then(function () { render(); return loadDevices(); });
    locate();
    return loadHistory();
  }).catch(function (error) { show('error', error.message || 'Attendance could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); render(); });
})();
