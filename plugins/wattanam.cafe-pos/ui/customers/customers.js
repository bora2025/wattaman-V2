/* Customers: find, add and edit customers; their points (earned on paid orders, redeemed as payment) and
 * manual corrections with a reason. Plugin API: GET/POST customers, GET/PUT customers/:id, POST customers/:id/points. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el, fmt = Pos.fmt;
  var state = { rows: [], customer: null, timer: null };
  var KIND = { EARN: 'earned', REDEEM: 'paid with points', ADJUST: 'correction', REVERSE: 'refund' };
  function failed(e) { Pos.say('message', ''); Pos.say('error', Pos.errorText(e), 'bad'); }
  function load() {
    var q = $('search').value.trim();
    return ui.api.get('customers', q ? { search: q } : undefined).then(function (rows) {
      state.rows = rows; var body = Pos.clear($('list'));
      rows.forEach(function (c) { body.appendChild(el('tr', { class: 'pick', onclick: function () { open(c.id); } }, [el('td', { text: c.name }), el('td', { text: c.phone }), el('td', { class: 'num', text: String(c.points) })])); });
      if (!rows.length) body.appendChild(el('tr', {}, [el('td', { colspan: '3', class: 'empty', text: 'No customers.' })]));
    }).catch(failed);
  }
  function show(c) {
    state.customer = c; $('form').hidden = false; $('title').textContent = c ? c.name : 'New customer';
    $('name').value = c ? c.name : ''; $('phone').value = c ? c.phone : ''; $('note').value = c ? c.note : ''; $('active').checked = c ? c.active : true;
    $('detail').hidden = !c;
    if (!c) return;
    $('points').textContent = String(c.points);
    var h = Pos.clear($('history'));
    c.history.forEach(function (x) { h.appendChild(el('tr', {}, [el('td', { text: Pos.dateTime(x.createdAt) }), el('td', { text: KIND[x.kind] + (x.orderNumber ? ' #' + x.orderNumber : '') + (x.note ? ' · ' + x.note : '') }), el('td', { class: 'num', text: (x.points > 0 ? '+' : '') + x.points })])); });
    var o = Pos.clear($('orders'));
    c.orders.forEach(function (x) { o.appendChild(el('tr', {}, [el('td', { text: '#' + x.number }), el('td', { text: String(x.businessDate).slice(0, 10) }), el('td', { text: x.status.toLowerCase() }), el('td', { class: 'num', text: fmt(x.total, x.currency) })])); });
  }
  function open(id) { return ui.api.get('customers/' + encodeURIComponent(id)).then(show).catch(failed); }
  $('search').addEventListener('input', function () { clearTimeout(state.timer); state.timer = setTimeout(load, 250); });
  $('new').addEventListener('click', function () { show(null); $('name').focus(); });
  $('save').addEventListener('click', function () {
    var body = { name: $('name').value.trim(), phone: $('phone').value.trim(), note: $('note').value.trim(), active: $('active').checked };
    (state.customer ? ui.api.put('customers/' + encodeURIComponent(state.customer.id), body) : ui.api.post('customers', body))
      .then(function (c) { Pos.say('error', ''); Pos.say('message', 'Saved ' + c.name + '.'); return load().then(function () { return open(c.id); }); }).catch(failed);
  });
  $('adjust-save').addEventListener('click', function () {
    ui.api.post('customers/' + encodeURIComponent(state.customer.id) + '/points', { points: Number($('adjust').value), note: $('adjust-note').value.trim() })
      .then(function (c) { $('adjust').value = ''; $('adjust-note').value = ''; Pos.say('message', c.name + ' has ' + c.points + ' points.'); return open(c.id); }).catch(failed);
  });
  ui.autoResize();
  ui.connect().then(load).then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
