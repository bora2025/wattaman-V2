/* Take Attendance: Academic Management's own screen (moved out of the school core in 0.5.0).
 * Runs in the core's sandboxed plugin frame and talks to this plugin's API only:
 *   GET classes, GET sessions, GET records?classId&date, GET classes/:classId/students,
 *   POST records, POST scan.
 * The camera belongs to the school page (page option devices: scanner, location): this screen asks
 * for it and receives only decoded codes. A USB keyboard-mode scanner types into this screen. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var STATUS = ['PRESENT', 'LATE', 'PERMISSION', 'ABSENT'];
  var names = ['Morning Check-In', 'Morning Check-Out', 'Afternoon Check-In', 'Afternoon Check-Out'];
  var dayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var state = {
    classes: [], sessions: [], classId: '', session: 1, sessionChosen: false, students: [], records: {}, statuses: {},
    mode: 'dashboard', busy: false, location: null, locationText: 'Finding location…', history: [],
    usbValue: '', usbActive: false, usbLast: null, usbTest: false, usbTestResult: '',
  };
  var scanLock = false, lastScan = { code: '', at: 0 }, usbBuffer = '', usbLastKey = 0, usbTimer = null, requestedClass = '';

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
  function pad(value) { return ('0' + value).slice(-2); }
  function today() { var now = new Date(); return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); }
  function nowClock() { var now = new Date(); return pad(now.getHours()) + ':' + pad(now.getMinutes()); }
  function displayName(student) { return student.nameKh || student.name || (student.user && student.user.name) || student.studentNumber || 'Student'; }
  function timeLabel(value) {
    var parts = String(value || '00:00').slice(0, 5).split(':').map(Number);
    try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, parts[0], parts[1])); } catch (error) { return String(value).slice(0, 5); }
  }
  function withinWindow(current, start, end) { var from = String(start).slice(0, 5), until = String(end).slice(0, 5); return from <= until ? current >= from && current <= until : current >= from || current <= until; }
  function studyDays(value) {
    var fallback = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    try { var parsed = JSON.parse(value || '{}'); return Array.isArray(parsed.week) && parsed.week.length ? parsed.week.map(function (day) { return String(day).toUpperCase(); }) : fallback; } catch (error) { return fallback; }
  }
  function newKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function vibrate(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (error) { /* not available in this frame */ } }

  function selectedClass() { return state.classes.filter(function (item) { return item.id === state.classId; })[0]; }
  function applicableSessions() {
    var exact = state.sessions.filter(function (item) { return item.classId === state.classId; });
    return exact.length ? exact : state.sessions.filter(function (item) { return !item.classId; });
  }
  function activeSession() { return applicableSessions().filter(function (item) { return Number(item.session) === state.session; })[0]; }
  function dayCode() { return dayCodes[new Date().getDay()]; }
  function isStudyDay() { var chosen = selectedClass(); return studyDays(chosen && chosen.schedule).indexOf(dayCode()) >= 0; }
  function sessionOpen() { var active = activeSession(); return Boolean(active && withinWindow(nowClock(), active.startTime, active.endTime)); }
  function offDayMessage() { var chosen = selectedClass(); return dayCode() + ' is not a study day for ' + ((chosen && chosen.name) || 'this class') + '.'; }
  function summary() { var result = {}; state.students.forEach(function (student) { var status = state.statuses[student.id] || 'ABSENT'; result[status] = (result[status] || 0) + 1; }); return result; }

  function avatar(student, fallback) {
    var letter = el('span', { class: 'avatar', text: student ? displayName(student).charAt(0) : fallback });
    if (!student || !student.photo) return letter;
    var image = el('img', { class: 'avatar', alt: '' });
    image.onerror = function () { if (image.parentNode) image.parentNode.replaceChild(letter, image); };
    image.setAttribute('src', student.photo);
    return image;
  }

  function renderHeader() {
    var counts = summary(), active = activeSession(), host = $('summary');
    host.textContent = '';
    host.appendChild(el('span', { class: 'present', text: (counts.PRESENT || 0) + ' present' }));
    host.appendChild(document.createTextNode(' · '));
    host.appendChild(el('span', { class: 'late', text: (counts.LATE || 0) + ' late' }));
    host.appendChild(document.createTextNode(' · ' + state.students.length + ' total · Session ' + state.session + ' · ' + (active && active.type === 'CHECK_OUT' ? '📤 Check-Out' : '📥 Check-In')));
    $('session-label').textContent = active ? names[state.session - 1] + ' · ' + timeLabel(active.startTime) + ' – ' + timeLabel(active.endTime) : 'No sessions configured';
  }

  function renderControls() {
    var select = $('class');
    if (select.options.length !== state.classes.length) {
      select.textContent = '';
      state.classes.forEach(function (item) { select.appendChild(el('option', { value: item.id, text: (item.name || '') + (item.subject ? ' — ' + item.subject : '') })); });
    }
    select.value = state.classId;
    var host = $('sessions'); host.textContent = '';
    applicableSessions().forEach(function (item) {
      var button = el('button', { type: 'button', 'aria-pressed': String(Number(item.session) === state.session), onclick: function () { state.session = Number(item.session); state.sessionChosen = true; loadRoster(); } }, [el('strong', { text: names[Number(item.session) - 1] || 'Session ' + item.session })]);
      button.appendChild(document.createTextNode(timeLabel(item.startTime) + ' – ' + timeLabel(item.endTime)));
      host.appendChild(button);
    });
  }

  function renderStatus() {
    var chosen = selectedClass(), study = isStudyDay(), active = activeSession(), open = sessionOpen();
    $('location').textContent = '📍 ' + state.locationText;
    var day = $('study-day'); day.textContent = ''; day.className = 'info' + (study ? '' : ' off');
    var name = (chosen && chosen.name) || 'this class';
    day.appendChild(document.createTextNode('📅 ' + (study ? dayCode() + ' is an active study day for ' + name + '.' : dayCode() + ' is configured as Off for ' + name + '. Attendance scanning and submission are disabled.')));
    day.appendChild(el('span', { text: 'Study days: ' + studyDays(chosen && chosen.schedule).join(', ') }));
    show('closed', !open && active ? 'No attendance session is active now. Session ' + state.session + ' accepts scans from ' + timeLabel(active.startTime) + ' to ' + timeLabel(active.endTime) + '.' : '');
    $('open-camera').disabled = !state.classId || !open || !study;
    $('open-usb').disabled = !state.classId || !open || !study;
    $('submit').disabled = state.busy || !state.students.length || !study;
    $('submit').textContent = '💾 ' + (state.busy ? 'Saving…' : 'Submit');
  }

  function renderRoster() {
    var host = $('roster'); host.textContent = '';
    state.students.forEach(function (student) {
      var status = state.statuses[student.id] || 'ABSENT';
      var select = el('select', { 'aria-label': 'Status for ' + displayName(student), onchange: function (event) { state.statuses[student.id] = event.target.value; renderHeader(); renderRoster(); } }, STATUS.map(function (value) { return el('option', { value: value, text: value }); }));
      select.value = status;
      host.appendChild(el('article', { class: 'student' }, [
        el('div', { class: 'person' }, [avatar(student, '?'), el('div', {}, [el('strong', { text: displayName(student) }), el('span', { class: 'sub', text: student.studentNumber || 'No student number' })]), el('span', { class: 'badge ' + status, text: status })]),
        select,
      ]));
    });
    $('recorded').textContent = Object.keys(state.records).length + '/' + state.students.length + ' recorded';
    $('roster-empty').hidden = state.students.length > 0 || state.busy;
  }

  function renderActivity() {
    var scanning = state.mode !== 'dashboard';
    $('activity-view').hidden = !scanning && !state.history.length;
    $('activity-count').textContent = String(state.history.length);
    $('activity-empty').hidden = state.history.length > 0;
    var host = $('activity'); host.textContent = '';
    state.history.forEach(function (item) {
      var student = item.student || (item.record ? state.students.filter(function (candidate) { return candidate.id === item.record.personId; })[0] : undefined);
      var mismatch = item.outcome === 'MISMATCH', success = item.outcome === 'SUCCESS';
      host.appendChild(el('article', {}, [
        el('div', { class: 'person' }, [avatar(student, mismatch ? '!' : '×'), el('div', {}, [
          el('strong', { text: student ? displayName(student) : mismatch ? 'Student mismatch' : 'Unknown student' }),
          el('span', { class: 'sub', text: (student && student.studentNumber) || 'Code …' + item.code.slice(-8) }),
        ]), el('span', { class: 'badge ' + item.outcome, text: success ? '✓ SUCCESS' : mismatch ? '⚠ MISMATCH' : '× FAILED' })]),
        el('p', { text: item.message }), el('time', { text: item.at.toLocaleTimeString() }),
      ]));
    });
  }

  function renderModes() {
    var counts = summary(), chosen = selectedClass(), active = activeSession();
    $('camera-view').hidden = state.mode !== 'camera';
    $('usb-view').hidden = state.mode !== 'usb';
    $('camera-counts').textContent = '● Scanning for student QR codes… ' + (counts.PRESENT || 0) + ' ✓  ' + (counts.LATE || 0) + ' ⚠  ' + state.students.length + ' total';
    $('usb-context').textContent = ((chosen && chosen.name) || 'School Attendance Management System') + ' · S' + state.session + ' · ' + String((active && active.type) || '').replace('_', '-');
    $('usb-dot').className = 'dot' + (state.usbActive ? ' active' : '');
    $('usb-state').textContent = state.usbActive ? 'Scanner input detected' : 'Waiting for USB scanner…';
    $('usb-last').textContent = state.usbLast ? 'Last activity ' + state.usbLast.toLocaleTimeString() : 'Scan a card to verify';
    $('usb-test').textContent = state.usbTest ? 'Testing' : 'Test';
    $('usb-test').setAttribute('aria-pressed', String(state.usbTest));
    $('usb-title').textContent = state.usbTest ? 'Scanner Test Mode' : 'Ready to Scan';
    $('usb-help').textContent = state.usbTest ? 'Scan a card to test without recording attendance' : 'Point scanner at a student QR card';
    $('usb-input').value = state.usbValue;
    show('usb-test-result', state.usbTestResult ? 'Received: ' + state.usbTestResult : '');
    $('usb-checklist').hidden = state.usbActive || Boolean(state.usbLast);
  }

  function render() { renderHeader(); renderControls(); renderStatus(); renderRoster(); renderActivity(); renderModes(); }

  function pickActiveSession() {
    if (state.sessionChosen) return;
    var current = nowClock();
    var active = applicableSessions().filter(function (item) { return withinWindow(current, item.startTime, item.endTime); })[0];
    if (active) state.session = Number(active.session);
  }

  function loadRoster() {
    if (!state.classId) { render(); return Promise.resolve(); }
    state.busy = true; show('error'); render();
    var classId = state.classId, session = state.session;
    return Promise.all([ui.api.get('classes/' + encodeURIComponent(classId) + '/students'), ui.api.get('records', { classId: classId, date: today() })]).then(function (results) {
      if (classId !== state.classId || session !== state.session) return;
      var records = {};
      rows(results[1]).filter(function (item) { return Number(item.session) === session; }).forEach(function (item) { records[item.personId] = item; });
      state.students = rows(results[0]); state.records = records; state.statuses = {};
      state.students.forEach(function (student) { state.statuses[student.id] = (records[student.id] && records[student.id].status) || 'ABSENT'; });
    }).catch(function (error) { show('error', error.message || 'Attendance roster could not be loaded.'); })
      .then(function () { state.busy = false; render(); });
  }

  function addActivity(entry) { state.history = [entry].concat(state.history).slice(0, 100); }

  function scan(code, scanMode) {
    var clean = String(code || '').trim(), detectedAt = Date.now();
    if (!clean || !state.classId || scanLock) return Promise.resolve();
    if (!isStudyDay()) { show('error', offDayMessage()); return Promise.resolve(); }
    if (lastScan.code === clean && detectedAt - lastScan.at < 3000) return Promise.resolve();
    lastScan = { code: clean, at: detectedAt }; scanLock = true;
    show('error'); show('message', 'QR detected — recording attendance…');
    var body = { code: clean, classId: state.classId, session: state.session, mode: scanMode, clientTimestamp: new Date().toISOString(), idempotencyKey: newKey() };
    if (state.location) { body.latitude = state.location.latitude; body.longitude = state.location.longitude; }
    return ui.api.post('scan', body).then(function (record) {
      record = record || {};
      var student = state.students.filter(function (item) { return item.id === record.personId; })[0];
      var text = displayName(student || { studentNumber: '' }) + ' marked ' + String(record.status || 'PRESENT').toLowerCase() + '.';
      addActivity({ at: new Date(), code: clean, outcome: 'SUCCESS', message: text, record: record, student: student });
      if (record.personId) { state.records[record.personId] = record; state.statuses[record.personId] = record.status || 'PRESENT'; }
      show('message', text); $('camera-status').textContent = text; vibrate(100);
    }).catch(function (error) {
      var text = error.message || 'Code could not be scanned.';
      var mismatch = /class|enrol|student|person type|scope/i.test(text) && !/not found/i.test(text);
      addActivity({ at: new Date(), code: clean, outcome: mismatch ? 'MISMATCH' : 'FAILED', message: text });
      show('message'); show('error', text); $('camera-status').textContent = text; vibrate([80, 60, 80]);
    }).then(function () { setTimeout(function () { scanLock = false; }, 900); render(); });
  }

  function submit() {
    if (!isStudyDay()) { show('error', offDayMessage()); return; }
    state.busy = true; show('error'); show('message'); render();
    var count = state.students.length;
    state.students.reduce(function (chain, student) {
      return chain.then(function () {
        var body = { personId: student.id, personType: 'STUDENT', classId: state.classId, date: today(), session: state.session, status: state.statuses[student.id] || 'ABSENT' };
        if (state.location) { body.latitude = state.location.latitude; body.longitude = state.location.longitude; }
        return ui.api.post('records', body);
      });
    }, Promise.resolve()).then(function () { return loadRoster(); }).then(function () { show('message', 'Attendance saved for ' + count + ' students.'); })
      .catch(function (error) { show('error', error.message || 'Attendance could not be saved.'); })
      .then(function () { state.busy = false; render(); });
  }

  function openCamera() {
    if (!isStudyDay()) { show('error', offDayMessage()); return; }
    show('error'); state.mode = 'camera'; $('camera-status').textContent = 'Camera ready — scan student QR code'; render();
    ui.scanner.start({
      onResult: function (text) { scan(text, 'CAMERA'); },
      onError: function (message) { show('error', message || 'Camera permission was not granted.'); },
      onClose: function () { if (state.mode === 'camera') { state.mode = 'dashboard'; render(); } },
    });
  }
  function closeCamera() { state.mode = 'dashboard'; ui.scanner.stop(); render(); }
  function openUsb() {
    if (!isStudyDay()) { show('error', offDayMessage()); return; }
    show('error'); show('message'); state.usbTestResult = ''; state.mode = 'usb'; render();
    setTimeout(function () { $('usb-input').focus(); }, 50);
  }
  function closeUsb() { state.mode = 'dashboard'; render(); }

  // A keyboard-mode scanner "types" the code and ends with Enter. Keys are read by position so a
  // Khmer (or any non-Latin) keyboard layout still yields the code printed on the card.
  function physicalKey(event) {
    var code = event.code || '', shift = event.shiftKey;
    if (code.indexOf('Key') === 0) { var letter = code.slice(3); return shift ? letter : letter.toLowerCase(); }
    if (code.indexOf('Digit') === 0) { var digit = code.slice(5); if (!shift) return digit; return { 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')' }[digit] || digit; }
    if (code.indexOf('Numpad') === 0 && /^[0-9]$/.test(code.slice(6))) return code.slice(6);
    var punctuation = { Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'], Backslash: ['\\', '|'], Semicolon: [';', ':'], Quote: ["'", '"'], Backquote: ['`', '~'], Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'], Space: [' ', ' '] };
    if (punctuation[code]) return punctuation[code][shift ? 1 : 0];
    return event.key && event.key.length === 1 && event.key.charCodeAt(0) >= 32 ? event.key : null;
  }
  window.addEventListener('keydown', function (event) {
    if (state.mode !== 'usb' || event.ctrlKey || event.altKey || event.metaKey) return;
    var now = Date.now(); if (now - usbLastKey > 250) usbBuffer = '';
    usbLastKey = now; state.usbActive = true; state.usbLast = new Date();
    if (usbTimer) clearTimeout(usbTimer);
    usbTimer = setTimeout(function () { state.usbActive = false; renderModes(); }, 2500);
    if (event.key === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault(); var code = usbBuffer.trim(); usbBuffer = ''; state.usbValue = '';
      if (!code) { renderModes(); return; }
      if (state.usbTest) { state.usbTestResult = code; show('error'); show('message', 'Scanner test passed — code received. Turn off Test to record attendance.'); vibrate(80); renderModes(); }
      else scan(code, 'USB');
      return;
    }
    if (event.key === 'Backspace') { event.preventDefault(); usbBuffer = usbBuffer.slice(0, -1); state.usbValue = usbBuffer; renderModes(); return; }
    var character = physicalKey(event); if (character === null) return;
    event.preventDefault(); usbBuffer += character; state.usbValue = usbBuffer; renderModes();
  }, true);

  $('class').addEventListener('change', function (event) { state.classId = event.target.value; state.sessionChosen = false; pickActiveSession(); loadRoster(); });
  $('open-camera').addEventListener('click', openCamera);
  $('close-camera').addEventListener('click', closeCamera);
  $('open-usb').addEventListener('click', openUsb);
  $('close-usb').addEventListener('click', closeUsb);
  $('usb-test').addEventListener('click', function () { state.usbTest = !state.usbTest; state.usbTestResult = ''; show('message'); renderModes(); });
  $('submit').addEventListener('click', submit);
  setInterval(function () {
    $('clock').textContent = new Date().toLocaleTimeString();
    var before = state.session; pickActiveSession();
    if (before !== state.session) loadRoster(); else renderStatus();
  }, 1000);

  render();
  ui.autoResize();
  ui.connect().then(function (context) {
    requestedClass = String((context.query && context.query.classId) || '');
    ui.location().then(function (position) {
      state.location = { latitude: position.latitude, longitude: position.longitude };
      state.locationText = 'Location active (' + Number(position.latitude).toFixed(4) + ', ' + Number(position.longitude).toFixed(4) + ')';
    }).catch(function (error) { state.locationText = error.status === 503 || error.status === 0 ? 'Location unavailable' : 'Location permission not granted'; })
      .then(renderStatus);
    return Promise.all([ui.api.get('classes'), ui.api.get('sessions')]);
  }).then(function (results) {
    state.classes = rows(results[0]);
    state.sessions = rows(results[1]).filter(function (item) { return item.scope === 'STUDENT'; });
    var wanted = state.classes.filter(function (item) { return item.id === requestedClass; })[0];
    state.classId = wanted ? wanted.id : (state.classes[0] && state.classes[0].id) || '';
    pickActiveSession();
    return loadRoster();
  }).catch(function (error) { show('error', error.message || 'Attendance could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); render(); });
})();
