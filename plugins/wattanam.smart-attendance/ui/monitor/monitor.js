/* Station Monitor: the captures of one day (this device's local day), refreshed every 5 seconds when live.
 * Plugin API: GET captures?from&to&status. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var LABEL = {
    RECORDED: ['ok', 'Recorded'], ALREADY_RECORDED: ['ok', 'Already recorded'], REJECTED: ['bad', 'Not recorded'],
    NOT_SENT: ['warn', 'Not sent'], PENDING: ['', 'Waiting'],
  };
  var RESULT = { UNKNOWN: 'Not recognised', DUPLICATE: 'Scanned again', OUT_OF_SCOPE: 'Wrong station', METHOD_NOT_ALLOWED: 'Method not accepted', REVIEW: 'Teacher to confirm', LOW_CONFIDENCE: 'Face not recognised', SPOOF_SUSPECTED: 'Liveness failed' };
  var SOURCE = { USB: ' · USB', CAMERA: ' · camera', PHONE: ' · phone NFC', TERMINAL: ' · terminal' };
  var ATTENDANCE = { PRESENT: 'Present', LATE: 'Late' };

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') node.textContent = attrs[k]; else node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function time(iso) { var d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }

  function load() {
    var parts = ($('day').value || today()).split('-').map(Number);
    var from = new Date(parts[0], parts[1] - 1, parts[2]), to = new Date(parts[0], parts[1] - 1, parts[2] + 1);
    var query = { from: from.toISOString(), to: to.toISOString() };
    if ($('status').value) query.status = $('status').value;
    return ui.api.get('captures', query).then(function (r) {
      $('error').hidden = true;
      var totals = $('totals'); totals.textContent = '';
      [['RECORDED', 'Recorded'], ['ALREADY_RECORDED', 'Already recorded'], ['REJECTED', 'Not recorded'], ['NOT_SENT', 'Not recognised / not sent']].forEach(function (t) {
        totals.appendChild(el('div', { class: 'total' }, [el('b', { text: String(r.totals[t[0]] || 0) }), el('span', { text: t[1] })]));
      });
      var body = $('rows'); body.textContent = '';
      if (!r.items.length) body.appendChild(el('tr', {}, [el('td', { colspan: '6', class: 'empty', text: 'No scans on this day.' })]));
      r.items.forEach(function (c) {
        var s = LABEL[c.status] || ['', c.status];
        var text = c.status === 'RECORDED' ? (ATTENDANCE[c.attendanceStatus] || 'Recorded') + (c.sessionType === 'CHECK_OUT' ? ' · check-out' : '') : RESULT[c.result] || s[1];
        body.appendChild(el('tr', {}, [
          el('td', { text: time(c.capturedAt) }), el('td', { text: c.stationName || '' }),
          el('td', { class: 'kh', text: c.person ? (c.person.nameKh || c.person.name) + ' · ' + [c.person.number, c.person.className].filter(Boolean).join(' · ') : '—' }),
          el('td', { text: (c.method || '?') + (SOURCE[c.source] || '') + (c.method === 'FACE' && c.score !== null ? ' · distance ' + c.score : '') }),
          el('td', {}, [el('span', { class: 'badge ' + (c.attendanceStatus === 'LATE' ? 'warn' : s[0]), text: text })]),
          el('td', { text: c.reason || '' }),
        ]));
      });
    }).catch(function (e) { $('error').textContent = e.message || 'The captures could not be loaded.'; $('error').hidden = false; });
  }
  $('day').value = today();
  $('day').addEventListener('change', load);
  $('status').addEventListener('change', load);
  setInterval(function () { if ($('live').checked && $('day').value === today()) load(); }, 5000);

  ui.autoResize();
  ui.connect().then(load).then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
