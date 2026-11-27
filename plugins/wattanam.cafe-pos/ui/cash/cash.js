/* Cash Shifts: open the drawer with a float, record pay-ins and pay-outs, close with a count (dollars and riel
 * separately) and print the X report (while open) or Z report (closed).
 * Plugin API: GET settings, GET cash/current, POST cash/open, POST cash/movements, POST cash/close,
 * GET cash/sessions, GET cash/sessions/:id. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el, fmt = Pos.fmt;
  var state = { s: null, session: null };
  function both(usd, khr) { return fmt(usd, 'USD') + ' + ' + fmt(khr, 'KHR'); }
  function load() {
    return Promise.all([ui.api.get('cash/current'), ui.api.get('cash/sessions')]).then(function (r) {
      state.session = r[0].session; renderCurrent(); renderHistory(r[1]);
    }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
  }
  function renderCurrent() {
    var s = state.session;
    $('open-panel').hidden = Boolean(s); $('current').hidden = !s;
    if (!s) return;
    $('c-title').textContent = '🟢 Open since ' + Pos.dateTime(s.openedAt) + ' · ' + s.orders + ' orders paid';
    var kpis = Pos.clear($('c-kpis'));
    [['Float', both(s.floatUsd, s.floatKhr)], ['Cash taken', both(s.cashInUsd, s.cashInKhr)], ['Paid in', both(s.payInUsd, s.payInKhr)], ['Paid out', both(s.payOutUsd, s.payOutKhr)], ['Cash refunds', both(s.refundUsd, s.refundKhr)], ['Should be in the drawer', both(s.expectedUsd, s.expectedKhr)]]
      .forEach(function (k) { kpis.appendChild(el('div', { class: 'kpi' }, [el('span', { text: k[0] }), el('b', { class: 'money', style: 'font-size:16px', text: k[1] })])); });
    s.byMethod.forEach(function (m) { kpis.appendChild(el('div', { class: 'kpi' }, [el('span', { text: Pos.METHOD[m.method] + ' (' + m.count + ')' }), el('b', { class: 'money', text: fmt(m.amount, m.currency) })])); });
  }
  function renderHistory(rows) {
    var body = Pos.clear($('history'));
    rows.filter(function (r) { return r.status === 'CLOSED'; }).forEach(function (r) {
      var dUsd = r.countedUsd - r.expectedUsd, dKhr = r.countedKhr - r.expectedKhr;
      body.appendChild(el('tr', {}, [el('td', { text: Pos.dateTime(r.openedAt) }), el('td', { text: Pos.dateTime(r.closedAt) }), el('td', { class: 'num', text: both(r.expectedUsd, r.expectedKhr) }), el('td', { class: 'num', text: both(r.countedUsd, r.countedKhr) }),
        el('td', { class: 'num' }, [el('span', { class: 'badge ' + (dUsd || dKhr ? 'bad' : 'ok'), text: both(dUsd, dKhr) })]), el('td', {}, [el('button', { type: 'button', class: 'small', onclick: function () { report(r.id); } }, ['🖨️ Z report'])])]));
    });
    if (!body.firstChild) body.appendChild(el('tr', {}, [el('td', { colspan: '6', class: 'empty', text: 'No closed shifts yet.' })]));
  }
  function report(id) {
    ui.api.get('cash/sessions/' + encodeURIComponent(id)).then(function (s) {
      var line = function (a, b) { return el('div', { class: 'line' }, [el('span', { text: a }), el('span', { text: b })]); };
      var box = el('div', { class: 'receipt ' + (state.s.paperWidth === 58 ? 'w58' : 'w80') }, [
        el('div', { class: 'center big', text: (s.status === 'CLOSED' ? 'Z' : 'X') + ' REPORT' }), el('div', { class: 'center', text: state.s.shopName || '' }), el('hr'),
        line('Opened', Pos.dateTime(s.openedAt)), s.closedAt ? line('Closed', Pos.dateTime(s.closedAt)) : null, line('Orders paid', String(s.orders)), el('hr'),
      ].concat(s.byMethod.map(function (m) { return line(m.method + ' ×' + m.count, fmt(m.amount, m.currency)); })).concat([
        el('hr'), line('Float', both(s.floatUsd, s.floatKhr)), line('Cash taken', both(s.cashInUsd, s.cashInKhr)), line('Paid in', both(s.payInUsd, s.payInKhr)), line('Paid out', both(s.payOutUsd, s.payOutKhr)), line('Refunds', both(s.refundUsd, s.refundKhr)),
        el('hr'), line('Expected', both(s.expectedUsd, s.expectedKhr)), s.countedUsd !== null ? line('Counted', both(s.countedUsd, s.countedKhr)) : null, s.countedUsd !== null ? line('Difference', both(s.differenceUsd, s.differenceKhr)) : null,
      ]).filter(Boolean));
      Pos.printNode(box);
    }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
  }
  function act(promise, message, tone) { Pos.say('error', ''); return promise.then(function () { Pos.say('message', message); Pos.sound(tone || 'success'); return load(); }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); }); }
  $('open').addEventListener('click', function () {
    act(ui.api.post('cash/open', { floatUsd: Pos.parseMoney($('float-usd').value, 'USD'), floatKhr: Pos.parseMoney($('float-khr').value, 'KHR') }), 'Shift opened.', 'open');
  });
  $('move').addEventListener('click', function () {
    var currency = $('m-currency').value;
    act(ui.api.post('cash/movements', { kind: $('m-kind').value, currency: currency, amount: Pos.parseMoney($('m-amount').value, currency), reason: $('m-reason').value.trim() }), 'Recorded.', 'cash')
      .then(function () { $('m-amount').value = ''; $('m-reason').value = ''; });
  });
  $('close').addEventListener('click', function () {
    var usd = Pos.parseMoney($('count-usd').value, 'USD'), khr = Pos.parseMoney($('count-khr').value, 'KHR');
    if (isNaN(usd) || isNaN(khr) || ($('count-usd').value === '' && $('count-khr').value === '')) { Pos.say('error', 'Count the drawer first.', 'bad'); return; }
    if (!window.confirm('Close the shift with ' + both(usd, khr) + ' counted?')) return;
    var id = state.session.id;
    act(ui.api.post('cash/close', { countedUsd: usd, countedKhr: khr, note: $('close-note').value.trim() }), 'Shift closed.', 'close').then(function () { report(id); });
  });
  $('print').addEventListener('click', function () { if (state.session) report(state.session.id); });
  ui.autoResize();
  ui.connect().then(function () { return ui.api.get('settings'); }).then(function (s) { state.s = s; Pos.setSound(s.sounds); return load(); })
    .catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); }).then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
