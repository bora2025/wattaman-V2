/* Attendance Station (Smart Attendance): a tablet, phone or PC at a gate or classroom.
 * The device registers itself (its per-plugin device id), an administrator approves it, then people are
 * identified by:
 *   - QR code on the ID card: the school page's camera, or a USB 2D scanner (types like a keyboard);
 *   - NFC card: a USB card reader (types the number and Enter), or this phone's NFC (Web NFC, Android);
 *   - face: the school page's face station (camera + face model in the school page: only a face vector
 *     reaches this screen; a head turn proves a live person).
 * Each capture shows who it is at once, then the attendance result from Academic Management (polled:
 * plugin screens cannot receive pushes). Face matches that are only fairly close wait for the teacher here.
 * Without network, captures are kept on this device (storage device) and sent later with their own time.
 * Plugin API: GET stations/me, POST stations/register, POST captures, GET captures/:id, POST captures/:id/review. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var state = { deviceId: '', station: null, busy: false, overlay: null, recent: [], reviews: [], idleTimer: null, current: '', queue: 0, flushing: false };
  var STATUS = {
    PRESENT: ['ok', '✓ មានវត្តមាន · Present'], LATE: ['warn', '⏰ យឺត · Late'],
    ALREADY: ['ok', '✓ បានកត់ត្រារួចហើយ · Already recorded'],
  };
  var QUEUE_KEY = 'offline-captures';

  function $(id) { return document.getElementById(id); }
  function show(id, on) { $(id).hidden = !on; }
  function error(message) { $('error').textContent = message || ''; $('error').hidden = !message; }
  function key() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return 'st-' + window.crypto.randomUUID();
    return 'st-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function hhmm(iso) { if (!iso) return ''; var d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function accepts(method) { return Boolean(state.station && state.station.methods.indexOf(method) >= 0); }

  // ---------- sound (a short tone; browsers may keep it silent until the screen was touched once) ----------
  var audio = null;
  function beep(kind) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var tones = kind === 'ok' ? [880, 1320] : kind === 'warn' ? [660, 660] : [300, 220];
      tones.forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = f; o.connect(g); g.connect(audio.destination);
        var t = audio.currentTime + i * 0.16; g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.start(t); o.stop(t + 0.15);
      });
    } catch (e) { /* no sound on this device */ }
  }

  // ---------- the result card ----------
  function setResult(tone, capture, statusText) {
    var box = $('result');
    box.className = 'result ' + tone;
    var p = capture && capture.person;
    var photo = $('r-photo'); photo.textContent = '';
    if (capture && capture.photo) { var img = document.createElement('img'); img.alt = ''; img.src = capture.photo; img.onerror = function () { photo.textContent = '🙂'; }; photo.appendChild(img); }
    else photo.textContent = tone === 'bad' ? '⚠️' : tone === 'idle' ? '👋' : '🙂';
    $('r-namekh').textContent = p ? (p.nameKh || p.name) : (tone === 'idle' ? 'Scan your QR code, tap your card or show your face' : 'Not recognised');
    $('r-name-latin').textContent = p ? String(p.name || '').toUpperCase() : (tone === 'idle' ? 'ស្កេន QR កូដ ប៉ះកាត ឬ បង្ហាញមុខ' : 'មិនស្គាល់');
    $('r-meta').textContent = p ? [p.number ? 'ID ' + p.number : '', p.className || ''].filter(Boolean).join(' · ') : '';
    $('r-status').textContent = statusText || '';
    clearTimeout(state.idleTimer);
    if (tone !== 'idle' && tone !== 'wait') state.idleTimer = setTimeout(function () { setResult('idle'); }, 6000);
  }
  // what a capture means for the person at the station
  function outcome(c) {
    var when = c.sessionType === 'CHECK_OUT' ? ' · Check-out ' : ' · ';
    if (c.offline) return ['warn', '💾 Saved on this device; it is sent when the network is back'];
    if (c.result === 'UNKNOWN' || c.result === 'METHOD_NOT_ALLOWED' || c.result === 'LOW_CONFIDENCE' || c.result === 'SPOOF_SUSPECTED') return ['bad', c.reason || 'Not recognised'];
    if (c.result === 'OUT_OF_SCOPE') return ['bad', c.reason];
    if (c.result === 'REVIEW') return ['warn', '👀 Please wait: the teacher confirms'];
    // the same person again within the cool-down: nothing new is recorded
    if (c.result === 'DUPLICATE') return ['ok', STATUS.ALREADY[1] + (c.attendanceStatus === 'LATE' ? ' · Late' : '')];
    if (c.status === 'PENDING') return ['wait', '… កំពុងកត់ត្រា · Recording'];
    if (c.status === 'RECORDED') { var s = STATUS[c.attendanceStatus] || STATUS.PRESENT; return [s[0], s[1] + when + hhmm(c.capturedAt)]; }
    if (c.status === 'ALREADY_RECORDED') return ['ok', STATUS.ALREADY[1]];
    if (c.status === 'REJECTED') return ['bad', '✗ ' + (c.reason || 'Not recorded')];
    return ['bad', c.reason || 'Not recorded'];
  }
  function hostTone(tone) { return tone === 'ok' ? 'success' : tone === 'warn' ? 'warning' : tone === 'wait' ? 'info' : 'error'; }
  function remember(c, tone, text) {
    var p = c.person;
    state.recent = [{ id: c.id || key(), name: p ? (p.nameKh || p.name) : (c.offline ? 'Saved offline' : 'Not recognised'), time: hhmm(c.capturedAt), tone: tone, text: text }]
      .concat(state.recent.filter(function (r) { return !c.id || r.id !== c.id; })).slice(0, 10);
    var list = $('recent'); list.textContent = '';
    state.recent.forEach(function (r) {
      var li = document.createElement('li'); li.className = r.tone;
      var b = document.createElement('b'); b.textContent = r.time + ' ' + r.name;
      var s = document.createElement('span'); s.textContent = r.tone === 'ok' ? '✓' : r.tone === 'warn' ? '⏰' : r.tone === 'wait' ? '…' : '✗';
      li.appendChild(b); li.appendChild(s); list.appendChild(li);
    });
    // the camera covers this screen: the school page's station shows the same in its bubble and list
    if (state.overlay) {
      var device = state.overlay === 'face' ? ui.face : ui.scanner;
      device.feedback(hostTone(tone), (p ? (p.nameKh || p.name) + ' — ' : '') + text);
      device.activity(state.recent.map(function (r) { return { title: r.name, detail: r.time + ' · ' + r.text, tone: hostTone(r.tone) }; }), 'Recent');
    }
  }

  // ---------- faces the teacher confirms ----------
  function renderReviews() {
    var host = $('reviews'); host.textContent = '';
    show('review-panel', state.reviews.length > 0);
    state.reviews.forEach(function (c) {
      var p = c.person || {};
      var row = document.createElement('div'); row.className = 'review'; row.setAttribute('data-review', c.id);
      var photo = document.createElement('div'); photo.className = 'review-photo';
      if (c.photo) { var img = document.createElement('img'); img.alt = ''; img.src = c.photo; photo.appendChild(img); } else photo.textContent = '🙂';
      var who = document.createElement('div'); who.className = 'review-who';
      var name = document.createElement('b'); name.className = 'kh'; name.textContent = (p.nameKh || p.name || '?') + ' · ' + (p.number || '');
      var meta = document.createElement('span'); meta.textContent = (p.className || '') + ' · ' + hhmm(c.capturedAt) + ' · Is this the person at the station?';
      who.appendChild(name); who.appendChild(meta);
      var yes = document.createElement('button'); yes.type = 'button'; yes.className = 'primary'; yes.textContent = '✓ Yes, record';
      var no = document.createElement('button'); no.type = 'button'; no.className = 'danger'; no.textContent = '✗ Not them';
      yes.addEventListener('click', function () { review(c, true); });
      no.addEventListener('click', function () { review(c, false); });
      row.appendChild(photo); row.appendChild(who); row.appendChild(yes); row.appendChild(no);
      host.appendChild(row);
    });
  }
  function review(c, confirm) {
    state.reviews = state.reviews.filter(function (r) { return r.id !== c.id; }); renderReviews();
    ui.api.post('captures/' + encodeURIComponent(c.id) + '/review', { deviceId: state.deviceId, confirm: confirm }).then(function (next) {
      if (!confirm) { remember(c, 'bad', 'Not confirmed'); return; }
      next.photo = c.photo;
      var o = outcome(next); setResult(o[0], next, o[1]); remember(next, o[0], o[1]);
      if (o[0] === 'wait') return follow(next, 0);
    }).catch(function (e) { error(e.message || 'The confirmation failed'); });
  }

  // ---------- a capture ----------
  function capture(body) {
    if (state.busy) return;
    state.busy = true; error('');
    body.deviceId = state.deviceId; body.capturedAt = body.capturedAt || new Date().toISOString(); body.clientKey = body.clientKey || key();
    ui.api.post('captures', body).then(function (c) {
      state.current = c.id;
      var o = outcome(c);
      setResult(o[0], c, o[1]); remember(c, o[0], o[1]);
      if (c.result === 'REVIEW') { state.reviews = [c].concat(state.reviews).slice(0, 6); renderReviews(); }
      if (o[0] !== 'wait') { beep(o[0]); return; }
      return follow(c, 0);
    }).catch(function (e) {
      // no network (or the school server is down): keep the capture on this device and send it later
      if ((!e.status || e.status >= 500) && e.status !== 503) return keep(body);
      setResult('bad', null, '✗ ' + (e.message || 'The capture failed'));
      beep('bad');
      if (e.status === 403 || e.status === 404) return load();
    }).then(function () { state.busy = false; focusUsb(); });
  }
  // Academic Management answers within about a second; ask again for up to ten seconds
  function follow(first, attempt) {
    return new Promise(function (resolve) { setTimeout(resolve, attempt < 4 ? 400 : 1000); })
      .then(function () { return ui.api.get('captures/' + encodeURIComponent(first.id)); })
      .then(function (c) {
        c.photo = first.photo;
        var o = outcome(c);
        if (o[0] === 'wait' && attempt < 12) return follow(first, attempt + 1);
        if (o[0] === 'wait') o = ['warn', 'Saved; the attendance list will show it shortly'];
        if (state.current === c.id) setResult(o[0], c, o[1]);
        remember(c, o[0], o[1]); beep(o[0]);
      })
      .catch(function () { /* the capture is saved; the monitor shows its result */ });
  }

  // ---------- offline: captures kept on this device (the storage device) ----------
  function readQueue() { return ui.storage.get(QUEUE_KEY).then(function (v) { return Array.isArray(v) ? v : []; }).catch(function () { return null; }); }
  function keep(body) {
    return readQueue().then(function (queue) {
      if (queue === null) { setResult('bad', null, '✗ No network, and this device cannot keep captures'); beep('bad'); return; }
      queue.push(body);
      return ui.storage.set(QUEUE_KEY, queue.slice(-500)).then(function () {
        state.queue = Math.min(queue.length, 500); showQueue();
        var c = { offline: true, capturedAt: body.capturedAt };
        setResult('warn', null, outcome(c)[1]); remember(c, 'warn', 'Saved offline'); beep('warn');
      });
    });
  }
  function showQueue() { $('queue').hidden = !state.queue; $('queue').textContent = '💾 ' + state.queue + ' capture' + (state.queue === 1 ? '' : 's') + ' waiting for the network'; }
  function flush() {
    if (state.flushing || !state.station || state.station.status !== 'ACTIVE') return;
    state.flushing = true;
    readQueue().then(function (queue) {
      if (!queue || !queue.length) { state.queue = 0; showQueue(); return; }
      var left = queue.slice();
      var next = function () {
        if (!left.length) return null;
        return ui.api.post('captures', left[0]).then(function () { left.shift(); return next(); }, function (e) {
          if (!e.status || e.status >= 500) return null;   // still offline: try again later
          left.shift(); return next();                     // refused for good (too old, unknown station…): drop it
        });
      };
      return Promise.resolve(next()).then(function () { state.queue = left.length; showQueue(); return ui.storage.set(QUEUE_KEY, left); });
    }).catch(function () {}).then(function () { state.flushing = false; });
  }
  setInterval(flush, 15000);

  // ---------- USB readers: keyboard input ending with Enter ----------
  function focusUsb() { if (!state.overlay && state.station && state.station.status === 'ACTIVE' && document.activeElement !== $('usb') && !document.activeElement.closest('.review')) $('usb').focus(); }
  $('usb').addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    var value = $('usb').value.trim(); $('usb').value = '';
    if (value) capture({ code: value, source: 'USB', method: 'AUTO' });
  });
  // keep the reader's typing landing here (a tap elsewhere on the kiosk takes the focus away)
  document.addEventListener('click', function (event) { if (!event.target.closest('input, select, button, form')) setTimeout(focusUsb, 0); });
  setInterval(focusUsb, 3000);

  // ---------- the camera (QR), the face station, and this phone's NFC: all run by the school page ----------
  function title() { return state.station.name + (state.station.place ? ' · ' + state.station.place : ''); }
  $('camera').addEventListener('click', function () {
    state.overlay = 'scanner';
    ui.scanner.start({
      layout: 'station', title: '📷 ' + title(),
      onResult: function (text) { capture({ code: text, source: 'CAMERA', method: 'QR' }); },
      onError: function (message) { state.overlay = null; error(message || 'The camera could not start.'); },
      onClose: function () { state.overlay = null; focusUsb(); },
    });
  });
  $('face').addEventListener('click', function () {
    state.overlay = 'face';
    ui.face.start({
      mode: 'identify', title: title(), liveness: true,
      onResult: function (r) {
        if (!r.descriptors || !r.descriptors.length) return;
        capture({ method: 'FACE', source: 'CAMERA', descriptor: r.descriptors[0], liveness: r.liveness, quality: r.quality, modelVersion: r.modelVersion });
      },
      onError: function (message) { state.overlay = null; error(message || 'The face camera could not start.'); },
      onClose: function () { state.overlay = null; focusUsb(); },
    });
  });
  $('phone-nfc').addEventListener('click', function () {
    if (ui.nfc.active()) { ui.nfc.stop(); return; }
    $('phone-nfc').textContent = '📶 Phone NFC: on (tap to stop)';
    ui.nfc.start({
      onRead: function (serial) { capture({ code: serial, source: 'PHONE', method: 'NFC' }); },
      onError: function (message) { error(message || 'NFC could not start on this device.'); },
      onClose: function () { $('phone-nfc').textContent = '📶 Read cards with this phone'; },
    });
  });

  // ---------- registration and approval ----------
  function render() {
    var s = state.station;
    show('register', !s); show('waiting', Boolean(s) && s.status !== 'ACTIVE'); show('station', Boolean(s) && s.status === 'ACTIVE');
    if (!s) { setTimeout(function () { $('r-name').focus(); }, 0); return; }
    if (s.status !== 'ACTIVE') {
      $('waiting-title').textContent = s.status === 'REVOKED' ? 'This station was turned off' : 'Waiting for approval';
      $('waiting-text').textContent = s.status === 'REVOKED'
        ? 'An administrator turned off "' + s.name + '". Ask them to turn it on again on Attendance Stations.'
        : '"' + s.name + '" asked to become an attendance station. An administrator approves it on Attendance Stations.';
      return;
    }
    $('s-name').textContent = '🛰️ ' + s.name;
    $('s-place').textContent = [s.place, s.mode === 'CHECK_IN' ? 'Check-in only' : s.mode === 'CHECK_OUT' ? 'Check-out only' : 'Check-in and check-out by the time of day'].filter(Boolean).join(' · ');
    var methods = $('methods'); methods.textContent = '';
    [['QR', '🔳 QR code'], ['NFC', '📶 NFC card'], ['FACE', '🙂 Face']].forEach(function (m) {
      var on = accepts(m[0]);
      var chip = document.createElement('span'); chip.className = 'badge' + (on ? ' ok' : '');
      chip.textContent = m[1] + (on ? '' : ' — off'); methods.appendChild(chip);
    });
    if (s.classIds.length) { var scope = document.createElement('span'); scope.className = 'badge'; scope.textContent = s.classIds.length + ' class' + (s.classIds.length === 1 ? '' : 'es') + ' only'; methods.appendChild(scope); }
    $('camera').hidden = !accepts('QR');
    $('face').hidden = !accepts('FACE');
    $('phone-nfc').hidden = !accepts('NFC');
    $('usb-state').textContent = accepts('NFC') ? 'QR scanner or NFC card reader' : 'QR scanner';
    setResult('idle');
    focusUsb();
    flush();
  }
  function load() {
    return ui.api.get('stations/me', { deviceId: state.deviceId }).then(function (r) { state.station = r.station; render(); });
  }
  $('register-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var name = $('r-name').value.trim();
    if (!name) { error('Give the station a name, e.g. Main gate.'); return; }
    $('r-save').disabled = true; error('');
    ui.api.post('stations/register', { deviceId: state.deviceId, name: name, place: $('r-place').value.trim() })
      .then(function (r) { state.station = r.station; render(); })
      .catch(function (e) { error(e.message || 'The station could not be registered.'); })
      .then(function () { $('r-save').disabled = false; });
  });
  $('refresh').addEventListener('click', function () { load().catch(function (e) { error(e.message); }); });
  // a waiting station checks by itself every 20 seconds
  setInterval(function () { if (state.station && state.station.status === 'PENDING') load().catch(function () {}); }, 20000);

  function tick() { var d = new Date(); $('clock').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  tick(); setInterval(tick, 10000);

  ui.autoResize();
  ui.connect().then(function () { return ui.deviceId(); }).then(function (id) {
    if (!id) throw new Error('This device has no identifier; update the school core to use stations.');
    state.deviceId = id;
    return load();
  }).catch(function (e) { error(e.message || 'The station could not start.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
