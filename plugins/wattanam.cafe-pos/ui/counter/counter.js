/* POS Counter and Waiter (<body data-mode="waiter">): take an order, choose sizes and add-ons, hold it or send
 * it to the kitchen, and take payment in dollars and/or riel (change worked out), card, transfer, KHQR or points.
 * The server prices everything; this screen previews. A sale made while the network is down is kept on this
 * device (storage device) and sent later with the same keys, so it is recorded once.
 * Plugin API: GET settings, GET menu, GET cash/current, GET tables, GET/POST customers, GET orders?status=OPEN,
 * POST orders, POST orders/:id/items, GET orders/:id, PUT orders/:id, PUT orders/:id/discount,
 * POST orders/:id/payments, POST orders/:id/close, PUT display/:register. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el, fmt = Pos.fmt;
  var WAITER = document.body.getAttribute('data-mode') === 'waiter';
  var QUEUE = 'offline-sales';
  var state = {
    s: null, menu: { categories: [], products: [], addonGroups: [] }, category: '', search: '', perms: [],
    order: null,          // the open order on the server (held, a table's tab), if any
    lines: [],            // new items not yet on the server: { productId, variantId, addonIds, quantity, note, label, sub, unitPrice, taxable }
    type: WAITER ? 'DINE_IN' : 'TAKEAWAY', tableId: '', customer: null, discount: null,
    tables: [], shift: null, register: 'main', busy: false,
    pay: { method: 'CASH', offline: null },
  };
  var groupsById = {}, productsById = {};

  function can(permission) { return !state.perms.length || state.perms.indexOf('wattanam.cafe-pos.' + permission) >= 0; }
  function base() { return state.order ? state.order.baseCurrency : state.s.baseCurrency; }
  function rate() { return state.order ? state.order.rate : state.s.rate; }
  function showError(text) { Pos.say('error', text, 'bad'); if (text) setTimeout(function () { if ($('error').textContent === text) Pos.say('error', ''); }, 6000); }
  // only real network trouble keeps a sale on the device; a server error is shown (it is a problem to fix)
  function offline(e) { return !e || !e.status || [502, 503, 504].indexOf(e.status) >= 0; }

  // ---------- the menu ----------
  function productPrice(p) {
    var price = p.variants.length ? Math.min.apply(null, p.variants.map(function (v) { return v.price; })) : p.price;
    return Pos.convert(price, p.currency, base(), rate());
  }
  function renderCategories() {
    var host = Pos.clear($('categories'));
    var all = [{ id: '', name: 'All · ទាំងអស់' }].concat(state.menu.categories);
    all.forEach(function (c) {
      host.appendChild(el('button', { type: 'button', 'aria-pressed': String(state.category === c.id), onclick: function () { state.category = c.id; renderCategories(); renderProducts(); } }, [c.nameKh ? c.name + ' · ' + c.nameKh : c.name]));
    });
  }
  function renderProducts() {
    var host = Pos.clear($('products'));
    var q = state.search.toLowerCase();
    var list = state.menu.products.filter(function (p) {
      if (state.category && p.categoryId !== state.category) return false;
      return !q || p.name.toLowerCase().indexOf(q) >= 0 || (p.nameKh || '').indexOf(state.search) >= 0 || p.sku.toLowerCase() === q || p.barcode === state.search;
    });
    if (!list.length) host.appendChild(el('p', { class: 'empty', text: state.menu.products.length ? 'Nothing matches.' : 'The menu is empty: add items on Menu.' }));
    var color = {}; state.menu.categories.forEach(function (c) { color[c.id] = c.color; });
    list.forEach(function (p) {
      host.appendChild(el('button', { type: 'button', class: 'product', 'data-product': p.id, onclick: function () { choose(p); } }, [
        p.photo ? el('img', { src: p.photo, alt: '' }) : el('div', { class: 'swatch', style: 'background:' + (color[p.categoryId] || '#d9dee5') }),
        el('span', { class: 'pname' }, [p.name, p.nameKh ? el('small', { text: p.nameKh }) : null]),
        el('span', { class: 'pprice money', text: (p.variants.length > 1 ? 'from ' : '') + fmt(productPrice(p), base()) }),
      ]));
    });
  }

  // ---------- choosing a size and add-ons ----------
  var picking = null;
  function choose(p) {
    var groups = p.addonGroupIds.map(function (id) { return groupsById[id]; }).filter(Boolean);
    if (!p.variants.length && !groups.length) { addLine(p, null, [], 1, ''); return; }
    picking = { p: p, groups: groups, variantId: p.variants.length ? p.variants[0].id : null, addonIds: [], qty: 1 };
    groups.forEach(function (g) { if (g.required && g.addons.length) picking.addonIds.push(g.addons[0].id); });
    $('options-title').textContent = Pos.name(p);
    $('options-note').value = '';
    renderOptions();
    $('options-dialog').showModal();
  }
  function renderOptions() {
    var host = Pos.clear($('options-body'));
    Pos.say('options-error', '');
    if (picking.p.variants.length) {
      var sizes = el('div', { class: 'choices' });
      picking.p.variants.forEach(function (v) {
        sizes.appendChild(el('button', { type: 'button', 'aria-pressed': String(picking.variantId === v.id), onclick: function () { picking.variantId = v.id; renderOptions(); } }, [v.name + (v.nameKh ? ' · ' + v.nameKh : '') + '  ' + fmt(Pos.convert(v.price, picking.p.currency, base(), rate()), base())]));
      });
      host.appendChild(el('div', { class: 'option-group' }, [el('b', { text: 'Size · ទំហំ' }), sizes]));
    }
    picking.groups.forEach(function (g) {
      var box = el('div', { class: 'choices' });
      g.addons.forEach(function (a) {
        var on = picking.addonIds.indexOf(a.id) >= 0;
        box.appendChild(el('button', { type: 'button', 'aria-pressed': String(on), onclick: function () {
          var chosen = picking.addonIds.filter(function (id) { return g.addons.some(function (x) { return x.id === id; }); });
          if (on) picking.addonIds = picking.addonIds.filter(function (id) { return id !== a.id; });
          else {
            if (g.maxSelect === 1) picking.addonIds = picking.addonIds.filter(function (id) { return chosen.indexOf(id) < 0; });
            else if (chosen.length >= g.maxSelect) return;
            picking.addonIds.push(a.id);
          }
          renderOptions();
        } }, [a.name + (a.nameKh ? ' · ' + a.nameKh : '') + (a.price ? ' +' + fmt(Pos.convert(a.price, a.currency, base(), rate()), base()) : '')]));
      });
      host.appendChild(el('div', { class: 'option-group' }, [el('b', { text: (g.nameKh ? g.name + ' · ' + g.nameKh : g.name) + (g.required ? ' *' : g.maxSelect > 1 ? ' (up to ' + g.maxSelect + ')' : '') }), box]));
    });
    $('options-qty').textContent = String(picking.qty);
    $('options-price').textContent = fmt(unitPrice(picking.p, picking.variantId, picking.addonIds) * picking.qty, base());
  }
  function unitPrice(p, variantId, addonIds) {
    var v = p.variants.filter(function (x) { return x.id === variantId; })[0];
    var price = Pos.convert(v ? v.price : p.price, p.currency, base(), rate());
    addonIds.forEach(function (id) {
      Object.keys(groupsById).forEach(function (g) { groupsById[g].addons.forEach(function (a) { if (a.id === id) price += Pos.convert(a.price, a.currency, base(), rate()); }); });
    });
    return price;
  }
  $('qty-minus').addEventListener('click', function () { if (picking.qty > 1) { picking.qty -= 1; renderOptions(); } });
  $('qty-plus').addEventListener('click', function () { picking.qty += 1; renderOptions(); });
  $('options-add').addEventListener('click', function () {
    var missing = picking.groups.filter(function (g) {
      var count = picking.addonIds.filter(function (id) { return g.addons.some(function (a) { return a.id === id; }); }).length;
      return count < (g.required ? Math.max(1, g.minSelect) : g.minSelect);
    })[0];
    if (missing) { Pos.say('options-error', 'Choose ' + missing.name, 'bad'); return; }
    addLine(picking.p, picking.variantId, picking.addonIds, picking.qty, $('options-note').value.trim());
    $('options-dialog').close();
  });
  function addLine(p, variantId, addonIds, quantity, note) {
    var v = p.variants.filter(function (x) { return x.id === variantId; })[0];
    var addonNames = [];
    addonIds.forEach(function (id) { Object.keys(groupsById).forEach(function (g) { groupsById[g].addons.forEach(function (a) { if (a.id === id) addonNames.push(a.nameKh || a.name); }); }); });
    var same = state.lines.filter(function (l) { return l.productId === p.id && l.variantId === variantId && l.addonIds.join() === addonIds.join() && l.note === note; })[0];
    Pos.sound('add');
    if (same) same.quantity += quantity;
    else state.lines.push({ productId: p.id, variantId: variantId, addonIds: addonIds.slice(), quantity: quantity, note: note, label: p.name + (v ? ' (' + v.name + ')' : ''), sub: [p.nameKh].concat(addonNames).concat(note ? ['“' + note + '”'] : []).filter(Boolean).join(' · '), unitPrice: unitPrice(p, variantId, addonIds), taxable: p.taxable });
    renderCart();
  }

  // ---------- the cart ----------
  function previewLines() {
    var lines = state.lines.map(function (l) { return { lineTotal: l.unitPrice * l.quantity, taxable: l.taxable }; });
    if (state.order) state.order.items.filter(function (i) { return i.status !== 'VOID'; }).forEach(function (i) { lines.push({ lineTotal: i.lineTotal, taxable: true }); });
    return lines;
  }
  function totals() {
    var discount = state.discount || (state.order && state.order.discountType ? { type: state.order.discountType, value: state.order.discountValue } : null);
    if (state.order && !state.lines.length && !state.discount) return state.order;
    return Pos.previewTotals(previewLines(), discount, state.type === 'DINE_IN' ? state.s.serviceRate : 0, state.s, base());
  }
  function renderCart() {
    var host = Pos.clear($('cart'));
    if (state.order) {
      state.order.items.filter(function (i) { return i.status !== 'VOID'; }).forEach(function (i) {
        host.appendChild(el('div', { class: 'cart-line sent' }, [
          el('span', { class: 'cl-name', text: i.quantity + ' × ' + i.name + (i.variantName ? ' (' + i.variantName + ')' : '') }), el('span', { class: 'money', text: fmt(i.lineTotal, base()) }),
          el('span', { class: 'cl-sub', text: [i.nameKh].concat(i.addons.map(function (a) { return a.nameKh || a.name; })).concat(i.note ? ['“' + i.note + '”'] : []).filter(Boolean).join(' · ') + (i.status !== 'SERVED' ? '  · ' + i.status.toLowerCase() : '') }),
        ]));
      });
    }
    state.lines.forEach(function (l, index) {
      host.appendChild(el('div', { class: 'cart-line' }, [
        el('span', { class: 'cl-name', text: l.label }), el('span', { class: 'money', text: fmt(l.unitPrice * l.quantity, base()) }),
        l.sub ? el('span', { class: 'cl-sub', text: l.sub }) : null,
        el('span', { class: 'cl-qty' }, [
          el('button', { type: 'button', 'aria-label': 'One less', onclick: function () { if (l.quantity > 1) l.quantity -= 1; else state.lines.splice(index, 1); renderCart(); } }, ['−']),
          el('b', { text: String(l.quantity) }),
          el('button', { type: 'button', 'aria-label': 'One more', onclick: function () { l.quantity += 1; renderCart(); } }, ['+']),
          el('button', { type: 'button', class: 'small danger', 'aria-label': 'Remove', onclick: function () { state.lines.splice(index, 1); renderCart(); } }, ['✕']),
        ]),
      ]));
    });
    if (!host.firstChild) host.appendChild(el('p', { class: 'empty', text: 'Tap an item to start · ចុចលើមុខម្ហូប' }));
    var t = totals(), b = base(), box = Pos.clear($('totals'));
    var line = function (label, value, cls) { box.appendChild(el('div', { class: 'line ' + (cls || '') }, [el('span', { text: label }), el('span', { class: 'money', text: value })])); };
    line('Subtotal', fmt(t.subtotal, b));
    if (t.discount) line('Discount', '−' + fmt(t.discount, b));
    if (t.serviceCharge) line('Service', fmt(t.serviceCharge, b));
    if (t.tax) line(state.s.vatInclusive ? 'incl. VAT' : 'VAT', fmt(t.tax, b));
    if (t.roundOff) line('Rounding', fmt(t.roundOff, b));
    line('Total', fmt(t.total, b), 'grand');
    line('', '≈ ' + Pos.other(t.total, b, rate(), state.s.khrStep));
    if (state.order && state.order.paid) line('Paid', fmt(state.order.paid, b));
    var empty = !state.lines.length && !state.order;
    $('charge').disabled = empty || state.busy; $('hold').disabled = !state.lines.length || state.busy; $('bill').disabled = empty || state.busy; $('send').disabled = !state.lines.length || state.busy;
    $('order-info').textContent = state.order ? 'Order #' + state.order.number + (state.order.table ? ' · Table ' + state.order.table.name : '') + (state.order.customer ? ' · ' + state.order.customer.name : '') : (state.customer ? '👤 ' + state.customer.name + ' · ' + state.customer.points + ' pts' : '');
    $('customer').textContent = state.customer || (state.order && state.order.customer) ? '👤 ' + (state.customer || state.order.customer).name : '👤 Customer';
    showDisplay('cart');
  }
  function reset() {
    state.order = null; state.lines = []; state.customer = null; state.discount = null;
    if (!WAITER) { state.type = 'TAKEAWAY'; state.tableId = ''; $('type').value = 'TAKEAWAY'; }
    renderType(); renderCart();
    if (WAITER) showPicker();
  }
  $('clear').addEventListener('click', function () {
    if ((state.lines.length || state.order) && !window.confirm('Clear this order from the screen? (An order already saved stays in Open orders.)')) return;
    reset();
  });

  // ---------- order type, table ----------
  function renderType() {
    var dine = state.type === 'DINE_IN';
    $('table').hidden = !dine;
    var select = Pos.clear($('table'));
    select.appendChild(el('option', { value: '', text: 'Table…' }));
    state.tables.forEach(function (t) { select.appendChild(el('option', { value: t.id, text: t.name + (t.order && (!state.order || t.order.id !== state.order.id) ? ' (busy)' : '') })); });
    select.value = state.tableId;
    $('type').disabled = Boolean(state.order);
    select.disabled = Boolean(state.order);
  }
  $('type').addEventListener('change', function () { state.type = $('type').value; renderType(); renderCart(); });
  $('table').addEventListener('change', function () {
    state.tableId = $('table').value;
    var t = state.tables.filter(function (x) { return x.id === state.tableId; })[0];
    if (t && t.order) openOrder(t.order.id); // the table already has a tab: continue it
  });
  function loadTables() { return ui.api.get('tables').then(function (rows) { state.tables = rows || []; renderType(); }); }

  // ---------- the server: create, add, hold ----------
  function itemsBody() { return state.lines.map(function (l) { return { productId: l.productId, variantId: l.variantId, addonIds: l.addonIds, quantity: l.quantity, note: l.note }; }); }
  function saveOrder() {
    if (state.type === 'DINE_IN' && !state.tableId && !state.order) return Promise.reject(new Error('Choose a table'));
    var p;
    if (!state.order) {
      state.pendingKey = state.pendingKey || Pos.key('order');
      p = ui.api.post('orders', { clientKey: state.pendingKey, type: state.type, tableId: state.type === 'DINE_IN' ? state.tableId : null, customerId: state.customer ? state.customer.id : null, items: itemsBody(), takenAt: new Date().toISOString() });
    } else if (state.lines.length) p = ui.api.post('orders/' + encodeURIComponent(state.order.id) + '/items', { items: itemsBody() });
    else p = Promise.resolve(state.order);
    return p.then(function (order) {
      state.order = order; state.lines = []; state.pendingKey = null;
      if (state.discount && can('discount')) {
        var d = state.discount; state.discount = null;
        return ui.api.put('orders/' + encodeURIComponent(order.id) + '/discount', d.type ? d : {}).then(function (o) { state.order = o; return o; });
      }
      if (state.customer && !order.customerId) return ui.api.put('orders/' + encodeURIComponent(order.id), { customerId: state.customer.id }).then(function (o) { state.order = o; return o; });
      return order;
    });
  }
  $('hold').addEventListener('click', function () {
    run(saveOrder().then(function (o) { Pos.say('error', ''); toast('Order #' + o.number + ' kept open'); Pos.sound('tap'); reset(); loadTables().catch(function () {}); }));
  });
  $('send').addEventListener('click', function () {
    run(saveOrder().then(function (o) { toast('Order #' + o.number + ' sent to the kitchen'); Pos.sound('order'); reset(); loadTables().catch(function () {}); }));
  });
  $('bill').addEventListener('click', function () {
    run(saveOrder().then(function (o) { renderCart(); return Pos.printOrder(o, state.s, { bill: true }); }));
  });
  function run(promise) {
    state.busy = true; renderCart();
    return promise.catch(function (e) { showError(Pos.errorText(e)); }).then(function () { state.busy = false; renderCart(); });
  }
  function toast(text) { Pos.say('error', text, 'ok'); setTimeout(function () { if ($('error').textContent === text) Pos.say('error', ''); }, 3000); }

  // ---------- paying ----------
  $('charge').addEventListener('click', function () {
    state.busy = true; renderCart();
    saveOrder().then(function (order) {
      if (order.due <= 0) return ui.api.post('orders/' + encodeURIComponent(order.id) + '/close', {}).then(finish);
      state.pay = { method: 'CASH', offline: null }; openPay();
    }).catch(function (e) {
      // no network while starting a new sale: take the payment and keep the whole sale on this device
      if (!state.order && offline(e)) { state.pay = { method: 'CASH', offline: { key: state.pendingKey, payments: [], paid: 0 } }; openPay(); return; }
      showError(Pos.errorText(e));
    }).then(function () { state.busy = false; renderCart(); });
  });
  function due() {
    if (state.pay.offline) return totals().total - state.pay.offline.paid;
    return state.order.due;
  }
  function openPay() {
    var methods = Pos.clear($('pay-methods'));
    ['CASH', 'CARD', 'TRANSFER', 'KHQR', 'LOYALTY'].forEach(function (m) {
      if (m === 'LOYALTY' && (!state.s.loyaltyEnabled || state.pay.offline || !(state.order && state.order.customer))) return;
      if (m === 'KHQR' && !state.s.khqrImage && !state.s.khqrName) return;
      methods.appendChild(el('button', { type: 'button', 'aria-pressed': String(state.pay.method === m), onclick: function () { state.pay.method = m; openPay(); } }, [Pos.METHOD[m]]));
    });
    $('pay-cash').hidden = state.pay.method !== 'CASH';
    $('pay-other-method').hidden = state.pay.method === 'CASH';
    $('pay-number').textContent = state.order ? '#' + state.order.number : '(offline)';
    var b = base(), d = due();
    $('pay-due').textContent = fmt(d, b);
    $('pay-other').textContent = '≈ ' + Pos.other(d, b, rate(), state.s.khrStep) + ' · $1 = ' + Number(rate()).toLocaleString('en-US') + '៛';
    $('pay-amount').value = Pos.moneyInput(d, b);
    if (state.pay.method === 'LOYALTY' && state.order && state.order.customer) {
      var most = state.order.customer.points * state.s.loyaltyPointValue;
      $('pay-amount').value = Pos.moneyInput(Math.min(d, most), b);
    }
    $('cash-usd').value = ''; $('cash-khr').value = '';
    var quick = Pos.clear($('quick-cash'));
    var exactUsd = b === 'USD' ? d : Pos.convert(d, 'KHR', 'USD', rate());
    var exactKhr = Pos.roundRiel(b === 'KHR' ? d : Pos.convert(d, 'USD', 'KHR', rate()), state.s.khrStep);
    [['Exact $', function () { $('cash-usd').value = Pos.moneyInput(Math.ceil(exactUsd), 'USD'); $('cash-khr').value = ''; }],
      ['Exact ៛', function () { $('cash-khr').value = String(exactKhr); $('cash-usd').value = ''; }]].concat(
      [100, 500, 1000, 2000, 5000].map(function (c) { return ['$' + c / 100, function () { $('cash-usd').value = Pos.moneyInput(c, 'USD'); $('cash-khr').value = ''; }]; }),
      [5000, 10000, 20000, 50000].map(function (r) { return [r.toLocaleString('en-US') + '៛', function () { $('cash-khr').value = String(r); $('cash-usd').value = ''; }]; }))
      .forEach(function (q) { quick.appendChild(el('button', { type: 'button', onclick: function () { q[1](); showChange(); } }, [q[0]])); });
    var khqr = Pos.clear($('khqr'));
    khqr.hidden = state.pay.method !== 'KHQR';
    if (state.pay.method === 'KHQR' && state.s.khqrImage) khqr.appendChild(el('img', { src: state.s.khqrImage, alt: 'KHQR' }));
    if (state.pay.method === 'KHQR') khqr.appendChild(el('p', { class: 'muted', text: (state.s.khqrName ? state.s.khqrName + ' · ' : '') + 'Check the payment arrived in the bank app, then confirm.' }));
    Pos.say('pay-error', ''); Pos.say('pay-done', ''); showChange(); showShift();
    $('pay-confirm').disabled = false;
    if (!$('pay-dialog').open) $('pay-dialog').showModal();
    showDisplay('pay');
    setTimeout(function () { (state.pay.method === 'CASH' ? $('cash-usd') : $('pay-ref')).focus(); }, 0);
  }
  // the change as the server will give it: whole dollars in dollars, the rest in riel (rounded)
  function tender() {
    var b = base(), r = rate(), usd = Pos.parseMoney($('cash-usd').value, 'USD'), khr = Pos.parseMoney($('cash-khr').value, 'KHR');
    if (isNaN(usd) || isNaN(khr)) return null;
    var given = Pos.convert(usd, 'USD', b, r) + Pos.convert(khr, 'KHR', b, r), d = due();
    var change = Math.max(0, given - d), changeUsd = 0, changeKhr = 0;
    if (change) { if (b === 'KHR') changeKhr = Pos.roundRiel(change, state.s.khrStep); else { changeUsd = Math.floor(change / 100) * 100; changeKhr = Pos.roundRiel(Pos.convert(change - changeUsd, 'USD', 'KHR', r), state.s.khrStep); } }
    return { usd: usd, khr: khr, given: given, enough: given >= d, change: change, changeUsd: changeUsd, changeKhr: changeKhr };
  }
  function showChange() {
    if (state.pay.method !== 'CASH') return;
    var t = tender();
    if (!t) { $('change').textContent = 'Check the amounts'; return; }
    if (!t.given) { $('change').textContent = ''; return; }
    $('change').textContent = t.enough
      ? 'Change · អាប់ ' + ([t.changeUsd ? fmt(t.changeUsd, 'USD') : '', t.changeKhr ? fmt(t.changeKhr, 'KHR') : ''].filter(Boolean).join(' + ') || '0')
      : 'Still to pay ' + fmt(due() - t.given, base());
    showDisplay('pay', t);
  }
  $('cash-usd').addEventListener('input', showChange);
  $('cash-khr').addEventListener('input', showChange);
  $('pay-confirm').addEventListener('click', function () {
    var b = base(), body = { method: state.pay.method, clientKey: Pos.key('pay') };
    if (state.pay.method === 'CASH') {
      var t = tender();
      if (!t || !t.given) { Pos.say('pay-error', 'Enter the cash given', 'bad'); return; }
      body.cashUsd = t.usd; body.cashKhr = t.khr;
      if (!state.shift && !state.pay.offline) { askShift(true); return; }
    } else {
      var amount = Pos.parseMoney($('pay-amount').value, b);
      if (!amount || isNaN(amount) || amount > due()) { Pos.say('pay-error', 'The amount must be between 0 and ' + fmt(due(), b), 'bad'); return; }
      body.amount = amount; body.reference = $('pay-ref').value.trim();
    }
    if (state.pay.offline) return payOffline(body);
    $('pay-confirm').disabled = true;
    ui.api.post('orders/' + encodeURIComponent(state.order.id) + '/payments', body).then(function (o) {
      state.order = o;
      if (o.status === 'PAID') finish(o, o.change);
      else { openPay(); Pos.say('pay-done', 'Received. Still to pay ' + fmt(o.due, b), 'ok'); }
    }).catch(function (e) {
      $('pay-confirm').disabled = false;
      if (Pos.errorCode(e) === 'CASH_SHIFT_REQUIRED') { state.shift = null; showShift(); askShift(true); return; }
      Pos.say('pay-error', Pos.errorText(e), 'bad');
    });
  });
  function finish(order, change) {
    var c = change || {};
    var text = '✓ Paid · បានបង់' + ((c.changeUsd || c.changeKhr) ? ' — change ' + [c.changeUsd ? fmt(c.changeUsd, 'USD') : '', c.changeKhr ? fmt(c.changeKhr, 'KHR') : ''].filter(Boolean).join(' + ') : '');
    Pos.say('pay-done', text, 'ok');
    Pos.sound('success');
    $('pay-confirm').disabled = true;
    // the receipt (and the cash drawer for cash) — on the USB printer when the shop uses one
    var cash = (order.payments || []).some(function (p) { return p.method === 'CASH'; });
    if (cash) setTimeout(function () { Pos.sound('cash'); }, 450);
    var printing = $('auto-print').checked ? Pos.printOrder(order, state.s, { drawer: cash }) : (cash ? Pos.openDrawer(state.s) : Promise.resolve());
    printing.catch(function (e) { showError('Printer: ' + Pos.errorText(e)); });
    showDisplay('done', c);
    setTimeout(function () { if ($('pay-dialog').open) $('pay-dialog').close(); reset(); loadTables().catch(function () {}); }, (c.changeUsd || c.changeKhr) ? 4000 : 1500);
  }
  // ---------- offline sales: kept on this device, sent in order when the network is back ----------
  function payOffline(body) {
    var o = state.pay.offline, t = body.method === 'CASH' ? tender() : null;
    var amount = body.method === 'CASH' ? Math.min(t.given, due()) : body.amount;
    o.payments.push(body); o.paid += amount;
    if (due() > 0) { openPay(); Pos.say('pay-done', 'Received. Still to pay ' + fmt(due(), base()), 'ok'); return; }
    var sale = { key: o.key, at: new Date().toISOString(), order: { clientKey: o.key, type: state.type, tableId: state.type === 'DINE_IN' ? state.tableId : null, customerId: state.customer ? state.customer.id : null, items: itemsBody(), takenAt: new Date().toISOString() }, discount: state.discount, payments: o.payments };
    readQueue().then(function (queue) {
      if (queue === null) { Pos.say('pay-error', 'No network, and this device cannot keep the sale. Try again when online.', 'bad'); return; }
      queue.push(sale);
      return ui.storage.set(QUEUE, queue).then(function () {
        var t2 = totals();
        var preview = { number: null, status: 'PAID', baseCurrency: base(), rate: rate(), createdAt: sale.at, items: state.lines.map(function (l) { return { name: l.label, nameKh: '', quantity: l.quantity, lineTotal: l.unitPrice * l.quantity, addons: [], status: 'NEW' }; }),
          subtotal: t2.subtotal, discount: t2.discount, serviceCharge: t2.serviceCharge, tax: t2.tax, taxInclusive: state.s.vatInclusive, roundOff: t2.roundOff, total: t2.total, payments: o.payments.map(function (p) { return { method: p.method, amount: p.amount || 0, cashUsd: p.cashUsd || 0, cashKhr: p.cashKhr || 0, changeUsd: 0, changeKhr: 0, reference: p.reference }; }) };
        if ($('auto-print').checked) Pos.printOrder(preview, state.s, { offline: true, drawer: true }).catch(function () {});
        Pos.say('pay-done', '✓ Saved on this device — it is sent when the network is back', 'ok');
        Pos.sound('warn');
        showQueue(queue.length);
        setTimeout(function () { if ($('pay-dialog').open) $('pay-dialog').close(); state.pendingKey = null; reset(); }, 2500);
      });
    });
  }
  function readQueue() { return ui.storage.get(QUEUE).then(function (v) { return Array.isArray(v) ? v : []; }).catch(function () { return null; }); }
  function showQueue(n) { $('queue').hidden = !n; $('queue').textContent = '💾 ' + n + ' offline sale' + (n === 1 ? '' : 's') + ' waiting'; }
  var flushing = false;
  function flush() {
    if (flushing) return; flushing = true;
    readQueue().then(function (queue) {
      if (!queue || !queue.length) { showQueue(0); return; }
      var left = queue.slice();
      var next = function () {
        if (!left.length) return null;
        var sale = left[0];
        return ui.api.post('orders', sale.order).then(function (order) {
          var chain = Promise.resolve();
          if (sale.discount && sale.discount.type) chain = chain.then(function () { return ui.api.put('orders/' + encodeURIComponent(order.id) + '/discount', sale.discount).catch(function () {}); });
          sale.payments.forEach(function (p) { chain = chain.then(function () { return ui.api.post('orders/' + encodeURIComponent(order.id) + '/payments', p).catch(function (e) { if (offline(e) || Pos.errorCode(e) === 'CASH_SHIFT_REQUIRED') throw e; }); }); });
          return chain;
        }).then(function () { left.shift(); return ui.storage.set(QUEUE, left).then(next); }, function (e) {
          if (offline(e)) return null;   // still offline: later
          if (Pos.errorCode(e) === 'CASH_SHIFT_REQUIRED') { state.waitingShift = true; return null; } // sent again once a shift is open
          sale.failed = Pos.errorText(e); left.push(left.shift()); return ui.storage.set(QUEUE, left); // refused: keep it for a manager, move on later
        });
      };
      return Promise.resolve(next()).then(function () { showQueue(left.length); if (state.waitingShift && left.length) $('queue').textContent += ' · open a cash shift'; });
    }).catch(function () {}).then(function () { flushing = false; });
  }
  setInterval(flush, 15000);

  // ---------- customers ----------
  $('customer').addEventListener('click', function () { $('customer-search').value = ''; Pos.clear($('customer-results')); Pos.say('customer-error', ''); $('customer-dialog').showModal(); $('customer-search').focus(); });
  var searchTimer = null;
  $('customer-search').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      var q = $('customer-search').value.trim(); if (!q) return;
      ui.api.get('customers', { search: q }).then(function (rows) {
        var host = Pos.clear($('customer-results'));
        if (!rows.length) host.appendChild(el('p', { class: 'empty', text: 'No customer found.' }));
        rows.forEach(function (c) { host.appendChild(el('div', { class: 'customer-row' }, [el('span', {}, [el('b', { text: c.name }), ' ', el('span', { class: 'muted', text: c.phone + ' · ' + c.points + ' pts' })]), el('button', { type: 'button', class: 'small', onclick: function () { pickCustomer(c); } }, ['Choose'])])); });
      }).catch(function (e) { Pos.say('customer-error', Pos.errorText(e), 'bad'); });
    }, 250);
  });
  $('new-save').addEventListener('click', function () {
    ui.api.post('customers', { name: $('new-name').value.trim(), phone: $('new-phone').value.trim() }).then(pickCustomer).catch(function (e) { Pos.say('customer-error', Pos.errorText(e), 'bad'); });
  });
  $('customer-none').addEventListener('click', function () { pickCustomer(null); });
  function pickCustomer(c) {
    state.customer = c; $('customer-dialog').close();
    if (state.order) run(ui.api.put('orders/' + encodeURIComponent(state.order.id), { customerId: c ? c.id : null }).then(function (o) { state.order = o; }));
    else renderCart();
  }

  // ---------- discount ----------
  $('discount').addEventListener('click', function () {
    var quick = Pos.clear($('discount-quick'));
    [500, 1000, 1500, 2000, 5000].forEach(function (p) { quick.appendChild(el('button', { type: 'button', onclick: function () { $('discount-type').value = 'PERCENT'; $('discount-value').value = String(p / 100); } }, [p / 100 + '%'])); });
    Pos.say('discount-error', ''); $('discount-dialog').showModal();
  });
  $('discount-save').addEventListener('click', function () {
    var type = $('discount-type').value, raw = $('discount-value').value;
    var value = type === 'PERCENT' ? Math.round(Number(raw) * 100) : Pos.parseMoney(raw, base());
    if (type && (!value || isNaN(value) || value < 0 || (type === 'PERCENT' && value > 10000))) { Pos.say('discount-error', 'Enter a valid discount', 'bad'); return; }
    state.discount = type ? { type: type, value: value } : { type: null, value: 0 };
    $('discount-dialog').close();
    if (state.order) run(saveOrder()); else renderCart();
  });

  // ---------- open orders (held at the counter, table tabs) ----------
  $('open-orders').addEventListener('click', function () {
    ui.api.get('orders', { status: 'OPEN' }).then(function (rows) {
      var host = Pos.clear($('open-list'));
      if (!rows.length) host.appendChild(el('p', { class: 'empty', text: 'No open orders.' }));
      rows.forEach(function (o) {
        host.appendChild(el('div', { class: 'customer-row' }, [
          el('span', {}, [el('b', { text: '#' + o.number }), ' ', el('span', { class: 'muted', text: [o.tableName ? 'Table ' + o.tableName : o.type.toLowerCase(), o.itemCount + ' items', Pos.time(o.createdAt), o.customerName].filter(Boolean).join(' · ') })]),
          el('span', {}, [el('b', { class: 'money', text: fmt(o.total, o.baseCurrency) + ' ' }), el('button', { type: 'button', class: 'small', onclick: function () { $('open-dialog').close(); openOrder(o.id); } }, ['Open'])]),
        ]));
      });
      $('open-dialog').showModal();
    }).catch(function (e) { showError(Pos.errorText(e)); });
  });
  function openOrder(id) {
    return run(ui.api.get('orders/' + encodeURIComponent(id)).then(function (o) {
      if (o.status !== 'OPEN') throw new Error('Order #' + o.number + ' is already ' + o.status.toLowerCase());
      state.order = o; state.lines = []; state.type = o.type; state.tableId = o.tableId || ''; state.customer = o.customer || null; state.discount = null;
      $('type').value = o.type; $('table-picker').hidden = true; $('pos').hidden = false;
      renderType();
    }));
  }

  // ---------- the waiter: tables first ----------
  function showPicker() {
    $('pos').hidden = true; $('table-picker').hidden = false;
    loadTables().then(function () {
      var host = Pos.clear($('picker-tables'));
      if (!state.tables.length) host.appendChild(el('p', { class: 'empty', text: 'No tables yet: add them on Tables.' }));
      state.tables.forEach(function (t) {
        host.appendChild(el('button', { type: 'button', class: 'table-tile' + (t.order ? (t.order.ready ? ' ready' : ' busy') : ''), onclick: function () {
          if (t.order) openOrder(t.order.id);
          else { state.order = null; state.tableId = t.id; state.type = 'DINE_IN'; $('type').value = 'DINE_IN'; $('table-picker').hidden = true; $('pos').hidden = false; renderType(); renderCart(); }
        } }, [el('b', { text: t.name }), el('span', { class: 'muted', text: t.order ? fmt(t.order.total, state.s.baseCurrency) + (t.order.ready ? ' · ready' : '') : t.seats + ' seats' })]));
      });
    }).catch(function (e) { showError(Pos.errorText(e)); });
  }

  // ---------- the customer display (another screen polls what this counter shows) ----------
  var displayTimer = null;
  function showDisplay(stage, cash) {
    clearTimeout(displayTimer);
    displayTimer = setTimeout(function () {
      if (!state.s) return;
      var t = totals(), b = base();
      var lines = (state.order ? state.order.items.filter(function (i) { return i.status !== 'VOID'; }).map(function (i) { return { name: i.name + (i.variantName ? ' (' + i.variantName + ')' : ''), quantity: i.quantity, amount: i.lineTotal }; }) : [])
        .concat(state.lines.map(function (l) { return { name: l.label, quantity: l.quantity, amount: l.unitPrice * l.quantity }; }));
      ui.api.put('display/' + encodeURIComponent(state.register), { stage: stage, lines: lines.slice(-30), currency: b, total: t.total, other: Pos.other(t.total, b, rate(), state.s.khrStep), due: state.order ? state.order.due : t.total, khqr: stage === 'pay' && state.pay.method === 'KHQR', changeUsd: cash && cash.changeUsd || 0, changeKhr: cash && cash.changeKhr || 0, at: new Date().toISOString() }).catch(function () {});
    }, 500);
  }

  // ---------- the shift badge, barcode scanners ----------
  function showShift() {
    $('shift').textContent = state.shift ? '🟢 Shift open' : '⚪ No cash shift — open';
    $('shift').className = 'badge ' + (state.shift ? 'ok' : 'warn');
    $('pay-noshift').hidden = Boolean(state.shift) || state.pay.method !== 'CASH' || Boolean(state.pay.offline);
  }
  function loadShift() {
    return ui.api.get('cash/current').then(function (r) {
      var had = state.shift;
      state.shift = r.session; showShift();
      if (!had && r.session && state.waitingShift) { state.waitingShift = false; flush(); }
    }).catch(function () {});
  }
  // no shift: open one here (with the cash permission), or pay another way; retry: send the cash payment after
  var retryPay = false;
  function askShift(retry) {
    retryPay = Boolean(retry);
    var allowed = can('cash');
    $('shift-open-form').hidden = !allowed; $('shift-open').hidden = !allowed; $('shift-ask').hidden = allowed;
    $('shift-other').hidden = !$('pay-dialog').open;
    Pos.say('shift-error', '');
    Pos.sound('warn');
    $('shift-dialog').showModal();
    if (allowed) setTimeout(function () { $('shift-usd').select(); }, 0);
  }
  $('shift').addEventListener('click', function () { if (!state.shift) askShift(false); else ui.navigate('cash'); });
  $('pay-open-shift').addEventListener('click', function () { askShift(false); });
  $('shift-open').addEventListener('click', function () {
    var usd = Pos.parseMoney($('shift-usd').value, 'USD'), khr = Pos.parseMoney($('shift-khr').value, 'KHR');
    if (isNaN(usd) || isNaN(khr)) { Pos.say('shift-error', 'Check the float amounts', 'bad'); return; }
    $('shift-open').disabled = true;
    ui.api.post('cash/open', { floatUsd: usd, floatKhr: khr }).then(function (session) {
      state.shift = session; showShift(); Pos.sound('open');
      $('shift-dialog').close(); toast('Cash shift opened');
      if (state.waitingShift) { state.waitingShift = false; flush(); }
      if (retryPay && $('pay-dialog').open) $('pay-confirm').click();
    }).catch(function (e) {
      if (Pos.errorCode(e) === 'CASH_SHIFT_OPEN') { $('shift-dialog').close(); return loadShift().then(function () { if (retryPay && $('pay-dialog').open) $('pay-confirm').click(); }); }
      Pos.say('shift-error', Pos.errorText(e), 'bad');
    }).then(function () { $('shift-open').disabled = false; });
  });
  $('shift-other').addEventListener('click', function () { $('shift-dialog').close(); state.pay.method = 'CARD'; openPay(); });
  $('search').addEventListener('input', function () { state.search = $('search').value.trim(); renderProducts(); });
  // a USB barcode scanner types the code and Enter
  $('search').addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var code = $('search').value.trim(); if (!code) return;
    var hit = state.menu.products.filter(function (p) { return p.barcode === code || (p.sku && p.sku.toLowerCase() === code.toLowerCase()); })[0];
    if (hit) { $('search').value = ''; state.search = ''; renderProducts(); choose(hit); }
  });

  // ---------- start ----------
  ui.autoResize();
  ui.connect().then(function (context) {
    state.perms = (context && context.permissions) || [];
    $('discount').hidden = !can('discount');
    $('auto-print').checked = true;
    // a waiter sends orders to the kitchen; paying stays with those who handle cash
    if (WAITER) { $('charge').hidden = !can('cash'); $('send').hidden = false; $('type').hidden = true; }
    var query = (context && context.query) || {};
    return Promise.all([ui.api.get('settings'), ui.api.get('menu'), ui.storage.get('register').catch(function () { return null; }), ui.storage.get('auto-print').catch(function () { return null; })]).then(function (r) {
      state.s = r[0]; state.menu = r[1]; state.register = r[2] || 'main';
      Pos.setSound(state.s.sounds);
      if (r[3] === false) $('auto-print').checked = false;
      groupsById = {}; state.menu.addonGroups.forEach(function (g) { groupsById[g.id] = g; });
      productsById = {}; state.menu.products.forEach(function (p) { productsById[p.id] = p; });
      renderCategories(); renderProducts(); renderType(); renderCart();
      loadShift().then(function () { if (!state.shift && !WAITER) { Pos.say('error', '⚪ No cash shift is open: cash payments need one. Tap “No cash shift — open” (top) to open it.', 'warn'); Pos.sound('warn'); } });
      loadTables().catch(function () {});
      readQueue().then(function (q) { showQueue(q ? q.length : 0); flush(); });
      if (query.orderId) return openOrder(query.orderId);
      if (query.tableId) { state.type = 'DINE_IN'; state.tableId = query.tableId; $('type').value = 'DINE_IN'; return loadTables().then(function () { var t = state.tables.filter(function (x) { return x.id === query.tableId; })[0]; if (t && t.order) return openOrder(t.order.id); renderType(); renderCart(); }); }
      if (WAITER) showPicker();
    });
  }).catch(function (e) { showError(Pos.errorText(e, 'The POS could not start')); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
  $('auto-print').addEventListener('change', function () { ui.storage.set('auto-print', $('auto-print').checked).catch(function () {}); });
  setInterval(loadShift, 60000);
})();
