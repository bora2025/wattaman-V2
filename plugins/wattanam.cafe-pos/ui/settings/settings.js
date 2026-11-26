/* POS Settings: currencies and exchange rate, VAT and service charge, the receipt (logo, Khmer name, paper width),
 * KHQR, loyalty points, and the kitchen stations. Percentages are stored in hundredths (10 % = 1000).
 * Plugin API: GET settings, PUT settings, GET menu/all, POST stations, PUT stations/:id. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el;
  var state = { s: null, logo: undefined, khqr: undefined, menu: { categories: [], stations: [] }, station: null };
  var TEXT = ['shopName', 'shopNameKh', 'address', 'phone', 'vatNumber', 'receiptFooter', 'khqrName', 'timeZone'];
  var CHECK = ['vatEnabled', 'vatInclusive', 'loyaltyEnabled', 'kitchenTickets', 'cashDrawer', 'sounds'];
  function failed(e) { Pos.say('message', ''); Pos.say('error', Pos.errorText(e), 'bad'); }
  function fill(s) {
    state.s = s; Pos.setSound(s.sounds);
    TEXT.forEach(function (k) { $(k).value = s[k] || ''; });
    CHECK.forEach(function (k) { $(k).checked = Boolean(s[k]); });
    $('printMode').value = s.printMode || 'BROWSER';
    $('baseCurrency').value = s.baseCurrency; $('rate').value = s.rate; $('khrStep').value = String(s.khrStep); $('paperWidth').value = String(s.paperWidth);
    $('vatRate').value = s.vatRate / 100; $('serviceRate').value = s.serviceRate / 100;
    $('loyaltySpend').value = Pos.moneyInput(s.loyaltySpend, s.baseCurrency); $('loyaltyPointValue').value = Pos.moneyInput(s.loyaltyPointValue, s.baseCurrency);
    preview('logo', s.logo); preview('khqr', s.khqrImage);
  }
  function preview(name, src) { $(name + '-preview').hidden = !src; if (src) $(name + '-preview').src = src; }
  $('logo-file').addEventListener('change', function () { Pos.pickImage($('logo-file').files[0], 360, function (d) { state.logo = d; preview('logo', d); }); });
  $('khqr-file').addEventListener('change', function () { Pos.pickImage($('khqr-file').files[0], 720, function (d) { state.khqr = d; preview('khqr', d); }); });
  $('logo-remove').addEventListener('click', function () { state.logo = null; preview('logo', null); });
  $('khqr-remove').addEventListener('click', function () { state.khqr = null; preview('khqr', null); });
  $('save').addEventListener('click', function () {
    var base = $('baseCurrency').value, body = {};
    TEXT.forEach(function (k) { body[k] = $(k).value.trim(); });
    CHECK.forEach(function (k) { body[k] = $(k).checked; });
    body.printMode = $('printMode').value;
    body.baseCurrency = base; body.rate = Number($('rate').value); body.khrStep = Number($('khrStep').value); body.paperWidth = Number($('paperWidth').value);
    body.vatRate = Math.round(Number($('vatRate').value) * 100); body.serviceRate = Math.round(Number($('serviceRate').value) * 100);
    body.loyaltySpend = Pos.parseMoney($('loyaltySpend').value, base) || 1; body.loyaltyPointValue = Pos.parseMoney($('loyaltyPointValue').value, base) || 0;
    if (state.logo !== undefined) body.logo = state.logo;
    if (state.khqr !== undefined) body.khqrImage = state.khqr;
    ui.api.put('settings', body).then(function (s) { state.logo = undefined; state.khqr = undefined; fill(s); Pos.say('error', ''); Pos.say('message', 'Settings saved.'); Pos.sound('success'); }).catch(failed);
  });

  // a sample receipt on the printer as it is set up on this form (save to keep it)
  $('test-print').addEventListener('click', function () {
    var s = Object.assign({}, state.s, { printMode: $('printMode').value, cashDrawer: $('cashDrawer').checked, paperWidth: Number($('paperWidth').value), shopName: $('shopName').value.trim(), shopNameKh: $('shopNameKh').value.trim(), receiptFooter: $('receiptFooter').value.trim() });
    var sample = { number: 0, status: 'PAID', type: 'TAKEAWAY', baseCurrency: s.baseCurrency, rate: Number($('rate').value) || s.rate, createdAt: new Date().toISOString(),
      items: [{ name: 'Test item', nameKh: 'សាកល្បង', quantity: 1, lineTotal: s.baseCurrency === 'USD' ? 250 : 10000, addons: [], status: 'SERVED' }],
      subtotal: s.baseCurrency === 'USD' ? 250 : 10000, discount: 0, serviceCharge: 0, tax: 0, roundOff: 0, total: s.baseCurrency === 'USD' ? 250 : 10000, payments: [] };
    Pos.printOrder(sample, s, { drawer: true }).then(function (r) { Pos.say('message', r && r.printer ? 'Printed on ' + r.printer + '.' : 'Sent to the printer.'); }).catch(function (e) { failed(e); });
  });

  // each sound once, so the shop hears what they mean
  $('sound-test').addEventListener('click', function () {
    Pos.setSound(true);
    ['add', 'success', 'cash', 'open', 'order', 'cooking', 'ready', 'served', 'warn', 'void', 'fail'].forEach(function (name, i) { setTimeout(function () { Pos.sound(name); }, i * 900); });
  });

  // ---------- kitchen stations ----------
  function renderStations() {
    var checks = Pos.clear($('st-categories')), chosen = state.station ? state.station.categoryIds : [];
    state.menu.categories.forEach(function (c) { checks.appendChild(el('label', {}, [el('input', { type: 'checkbox', value: c.id, checked: chosen.indexOf(c.id) >= 0 }), c.name])); });
    if (!state.menu.categories.length) checks.appendChild(el('span', { class: 'muted', text: 'Add menu categories first.' }));
    var body = Pos.clear($('st-list'));
    state.menu.stations.forEach(function (s) {
      body.appendChild(el('tr', {}, [el('td', {}, [el('b', { text: s.name }), s.active ? null : el('span', { class: 'badge', text: ' off' })]), el('td', { text: state.menu.categories.filter(function (c) { return s.categoryIds.indexOf(c.id) >= 0; }).map(function (c) { return c.name; }).join(', ') || '—' }),
        el('td', {}, [el('button', { type: 'button', class: 'small', onclick: function () { state.station = s; $('st-name').value = s.name; $('st-active').checked = s.active; $('st-save').textContent = 'Save station'; renderStations(); } }, ['Edit'])])]));
    });
  }
  $('st-save').addEventListener('click', function () {
    var body = { name: $('st-name').value.trim(), active: $('st-active').checked, categoryIds: Array.prototype.filter.call($('st-categories').querySelectorAll('input'), function (c) { return c.checked; }).map(function (c) { return c.value; }) };
    (state.station ? ui.api.put('stations/' + encodeURIComponent(state.station.id), body) : ui.api.post('stations', body)).then(function () {
      state.station = null; $('st-name').value = ''; $('st-save').textContent = 'Add station'; Pos.say('message', 'Station saved.');
      return ui.api.get('menu/all').then(function (m) { state.menu = m; renderStations(); });
    }).catch(failed);
  });

  ui.autoResize();
  ui.connect().then(function () { return Promise.all([ui.api.get('settings'), ui.api.get('menu/all').catch(function () { return { categories: [], stations: [] }; })]); })
    .then(function (r) { fill(r[0]); state.menu = r[1]; renderStations(); }).catch(failed).then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
