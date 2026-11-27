/* Orders: a day's orders, each with its items and payments; reprint, continue an open one at the counter,
 * remove an item or cancel an unpaid order (void), refund a paid one. Every change asks for a reason.
 * Plugin API: GET settings, GET orders, GET orders/:id, POST orders/:id/void, POST orders/:id/items/:itemId/void,
 * POST orders/:id/refunds. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el, fmt = Pos.fmt;
  var state = { s: null, rows: [], order: null, perms: [] };
  var BADGE = { OPEN: 'warn', PAID: 'ok', VOIDED: 'bad', REFUNDED: 'bad' };
  function can(p) { return !state.perms.length || state.perms.indexOf('wattanam.cafe-pos.' + p) >= 0; }
  function load() {
    Pos.say('error', '');
    var q = { date: $('date').value || Pos.today() };
    if ($('status').value) q.status = $('status').value;
    if ($('number').value.trim()) q.number = $('number').value.trim();
    return ui.api.get('orders', q).then(function (rows) { state.rows = rows; render(); }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
  }
  function render() {
    var body = Pos.clear($('list'));
    if (!state.rows.length) body.appendChild(el('tr', {}, [el('td', { colspan: '6', class: 'empty', text: 'No orders.' })]));
    state.rows.forEach(function (o) {
      body.appendChild(el('tr', { class: 'pick', 'aria-selected': String(Boolean(state.order && state.order.id === o.id)), onclick: function () { open(o.id); } }, [
        el('td', { text: '#' + o.number }), el('td', { text: Pos.time(o.createdAt) }), el('td', { text: o.tableName ? 'Table ' + o.tableName : o.type.replace('_', '-').toLowerCase() }),
        el('td', { text: o.methods.join(', ').toLowerCase() }), el('td', { class: 'num', text: fmt(o.total, o.baseCurrency) }), el('td', {}, [el('span', { class: 'badge ' + BADGE[o.status], text: o.status.toLowerCase() })]),
      ]));
    });
  }
  function open(id) {
    return ui.api.get('orders/' + encodeURIComponent(id)).then(function (o) { state.order = o; detail(); render(); }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
  }
  function detail() {
    var o = state.order, cur = o.baseCurrency;
    $('detail').hidden = false;
    $('d-title').textContent = 'Order #' + o.number + ' · ' + o.businessDate;
    $('d-status').textContent = o.status.toLowerCase(); $('d-status').className = 'badge ' + BADGE[o.status];
    $('d-meta').textContent = [Pos.dateTime(o.createdAt), o.table ? 'Table ' + o.table.name : o.type.toLowerCase(), o.customer ? '👤 ' + o.customer.name : '', '$1 = ' + o.rate.toLocaleString('en-US') + '៛', o.voidReason ? 'Cancelled: ' + o.voidReason : ''].filter(Boolean).join(' · ');
    var items = Pos.clear($('d-items'));
    o.items.forEach(function (i) {
      items.appendChild(el('tr', { class: i.status === 'VOID' ? 'void' : '' }, [
        el('td', {}, [el('b', { text: i.quantity + ' × ' + i.name + (i.variantName ? ' (' + i.variantName + ')' : '') }), el('div', { class: 'muted', text: i.addons.map(function (a) { return a.name; }).concat(i.note ? ['“' + i.note + '”'] : []).concat(i.voidReason ? ['removed: ' + i.voidReason] : []).join(' · ') })]),
        el('td', { class: 'num', text: fmt(i.lineTotal, cur) }),
        el('td', {}, [o.status === 'OPEN' && i.status !== 'VOID' && can('void') ? el('button', { type: 'button', class: 'small danger', onclick: function () { voidItem(i); } }, ['Remove']) : null]),
      ]));
    });
    var t = Pos.clear($('d-totals'));
    [['Subtotal', o.subtotal], ['Discount', -o.discount], ['Service', o.serviceCharge], [o.taxInclusive ? 'incl. VAT' : 'VAT', o.tax], ['Rounding', o.roundOff], ['Total', o.total], ['Paid', o.paid], ['Refunded', -o.refunded]]
      .filter(function (x) { return x[1] || x[0] === 'Total'; })
      .forEach(function (x) { t.appendChild(el('div', { class: 'spread' }, [el('span', { text: x[0] }), el('b', { class: 'money', text: fmt(x[1], cur) })])); });
    var pays = Pos.clear($('d-payments'));
    if (!o.payments.length && !o.refunds.length) pays.appendChild(el('p', { class: 'muted', text: 'Nothing paid.' }));
    o.payments.forEach(function (p) { pays.appendChild(el('div', { class: 'spread' }, [el('span', { text: Pos.METHOD[p.method] + ' · ' + Pos.time(p.createdAt) + (p.reference ? ' · ' + p.reference : '') + (p.changeUsd || p.changeKhr ? ' · change ' + [p.changeUsd ? fmt(p.changeUsd, 'USD') : '', p.changeKhr ? fmt(p.changeKhr, 'KHR') : ''].filter(Boolean).join(' + ') : '') }), el('b', { class: 'money', text: fmt(p.amount, cur) })])); });
    o.refunds.forEach(function (r) { pays.appendChild(el('div', { class: 'spread' }, [el('span', { text: '↩️ Refund (' + r.method.toLowerCase() + ') · ' + r.reason }), el('b', { class: 'money', text: '−' + fmt(r.amount, cur) })])); });
    $('continue').hidden = o.status !== 'OPEN';
    $('void').hidden = !(o.status === 'OPEN' && !o.paid && can('void'));
    $('refund').hidden = !((o.status === 'PAID' || (o.status === 'OPEN' && o.paid)) && o.paid > o.refunded && can('refund'));
    $('refund-form').hidden = true;
  }
  function voidItem(i) {
    var reason = window.prompt('Why remove ' + i.name + '? (required)'); if (!reason) return;
    ui.api.post('orders/' + encodeURIComponent(state.order.id) + '/items/' + encodeURIComponent(i.id) + '/void', { reason: reason })
      .then(function (o) { state.order = o; detail(); Pos.sound('void'); load(); }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
  }
  $('void').addEventListener('click', function () {
    var reason = window.prompt('Why cancel order #' + state.order.number + '? (required)'); if (!reason) return;
    ui.api.post('orders/' + encodeURIComponent(state.order.id) + '/void', { reason: reason })
      .then(function (o) { state.order = o; detail(); Pos.say('message', 'Order #' + o.number + ' cancelled.'); Pos.sound('void'); load(); }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
  });
  $('refund').addEventListener('click', function () { $('refund-form').hidden = false; $('r-amount').value = Pos.moneyInput(state.order.paid - state.order.refunded, state.order.baseCurrency); $('r-reason').focus(); });
  $('r-save').addEventListener('click', function () {
    var o = state.order, amount = Pos.parseMoney($('r-amount').value, o.baseCurrency);
    if (!amount || isNaN(amount)) { Pos.say('error', 'Enter the amount to refund', 'bad'); return; }
    ui.api.post('orders/' + encodeURIComponent(o.id) + '/refunds', { amount: amount, method: $('r-method').value, reason: $('r-reason').value.trim() })
      .then(function (x) { state.order = x; detail(); Pos.say('message', 'Refunded ' + fmt(amount, x.baseCurrency) + '.'); Pos.sound('void'); load(); }).catch(function (e) {
        Pos.say('error', Pos.errorCode(e) === 'CASH_SHIFT_REQUIRED' ? 'A cash refund comes out of the drawer: open a cash shift (Cash Shifts), or refund by card, transfer or KHQR.' : Pos.errorText(e), 'bad');
      });
  });
  $('reprint').addEventListener('click', function () { Pos.printOrder(state.order, state.s, { bill: state.order.status === 'OPEN' }).catch(function (e) { Pos.say('error', 'Printer: ' + Pos.errorText(e), 'bad'); }); });
  $('continue').addEventListener('click', function () { ui.navigate('counter', { orderId: state.order.id }); });
  $('reload').addEventListener('click', load);
  ['date', 'status'].forEach(function (id) { $(id).addEventListener('change', load); });
  ui.autoResize();
  ui.connect().then(function (context) {
    state.perms = (context && context.permissions) || [];
    $('date').value = Pos.today();
    return ui.api.get('settings').then(function (s) { state.s = s; Pos.setSound(s.sounds); return load(); });
  }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); }).then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
