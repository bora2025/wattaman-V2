/* Sales Reports: a period's sales (net of refunds), best sellers, categories, payment methods (with the cash in
 * dollars and riel), by day, by hour, by staff, refunds and cancellations; CSV export and print.
 * Plugin API: GET reports/summary, GET reports/export. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el, fmt = Pos.fmt;
  function failed(e) { Pos.say('error', Pos.errorText(e), 'bad'); }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function rows(id, list, cells) {
    var body = Pos.clear($(id));
    if (!list.length) { body.appendChild(el('tr', {}, [el('td', { class: 'empty', text: 'Nothing in this period.' })])); return; }
    var max = Math.max.apply(null, list.map(function (x) { return x.amount || x.net || 0; })) || 1;
    list.forEach(function (x) { body.appendChild(el('tr', {}, cells(x, max))); });
  }
  function bar(value, max) { return el('td', { style: 'width:30%' }, [el('div', { class: 'bar', style: 'width:' + Math.round(100 * value / max) + '%' })]); }
  function show() {
    Pos.say('error', '');
    return ui.api.get('reports/summary', { from: $('from').value, to: $('to').value }).then(function (r) {
      var kpis = Pos.clear($('kpis'));
      if (!r.totals.length) kpis.appendChild(el('div', { class: 'kpi' }, [el('span', { text: 'Sales' }), el('b', { text: '—' })]));
      r.totals.forEach(function (t) {
        [['Net sales', fmt(t.net, t.currency)], ['Orders', String(t.orders)], ['Average order', fmt(t.orders ? Math.round(t.total / t.orders) : 0, t.currency)], ['Discounts', fmt(t.discount, t.currency)], ['Service', fmt(t.service, t.currency)], ['VAT', fmt(t.tax, t.currency)], ['Refunded', fmt(t.refunded, t.currency)]]
          .forEach(function (k) { kpis.appendChild(el('div', { class: 'kpi' }, [el('span', { text: k[0] + (r.totals.length > 1 ? ' (' + t.currency + ')' : '') }), el('b', { class: 'money', text: k[1] })])); });
      });
      rows('items', r.byItem, function (x, max) { return [el('td', {}, [el('b', { text: x.name + (x.size ? ' (' + x.size + ')' : '') }), x.nameKh ? el('div', { class: 'muted kh', text: x.nameKh }) : null]), el('td', { class: 'num', text: '×' + x.quantity }), el('td', { class: 'num', text: fmt(x.amount, x.currency) }), bar(x.amount, max)]; });
      rows('categories', r.byCategory, function (x, max) { return [el('td', { text: x.category }), el('td', { class: 'num', text: '×' + x.quantity }), el('td', { class: 'num', text: fmt(x.amount, x.currency) }), bar(x.amount, max)]; });
      rows('methods', r.byMethod, function (x, max) { return [el('td', { text: Pos.METHOD[x.method] + ' (' + x.count + ')' }), el('td', { class: 'num', text: fmt(x.amount, x.currency) }), el('td', { class: 'num muted', text: x.method === 'CASH' ? 'drawer ' + [x.cashUsd ? (x.cashUsd > 0 ? '+' : '') + fmt(x.cashUsd, 'USD') : '', x.cashKhr ? (x.cashKhr > 0 ? '+' : '') + fmt(x.cashKhr, 'KHR') : ''].filter(Boolean).join(', ') : '' }), bar(x.amount, max)]; });
      rows('days', r.byDay, function (x, max) { return [el('td', { text: x.day }), el('td', { class: 'num', text: x.orders + ' orders' }), el('td', { class: 'num', text: fmt(x.net, x.currency) }), bar(x.net, max)]; });
      rows('hours', r.byHour, function (x, max) { return [el('td', { text: String(x.hour).padStart(2, '0') + ':00' }), el('td', { class: 'num', text: x.orders + ' orders' }), el('td', { class: 'num', text: fmt(x.net, x.currency) }), bar(x.net, max)]; });
      rows('staff', r.byStaff, function (x, max) { return [el('td', { text: x.name || x.userId || '—' }), el('td', { class: 'num', text: x.orders + ' orders' }), el('td', { class: 'num', text: fmt(x.net, x.currency) }), bar(x.net, max)]; });
      $('voids').textContent = r.voidedOrders.map(function (v) { return v.count + ' cancelled orders (' + fmt(v.amount, v.currency) + ')'; }).concat(r.voidedItems.map(function (v) { return v.count + ' removed items (' + fmt(v.amount, v.currency) + ')'; })).join(' · ') || 'No cancellations.';
      rows('refunds', r.refunds.map(function (x) { return Object.assign({}, x, { amount: x.amount }); }), function (x) { return [el('td', { text: '#' + x.number + ' · ' + Pos.dateTime(x.createdAt) }), el('td', { text: x.reason + (x.by ? ' (' + x.by + ')' : '') }), el('td', { class: 'num', text: fmt(x.amount, x.currency) })]; });
    }).catch(failed);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-range]'), function (b) {
    b.addEventListener('click', function () {
      var now = new Date(), from = new Date(now);
      if (b.getAttribute('data-range') === 'week') from.setDate(now.getDate() - 6);
      if (b.getAttribute('data-range') === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
      $('from').value = ymd(from); $('to').value = ymd(now); show();
    });
  });
  $('show').addEventListener('click', show);
  $('export').addEventListener('click', function () { ui.api.get('reports/export', { from: $('from').value, to: $('to').value }).then(function (r) { Pos.download(r.filename, '﻿' + r.csv); }).catch(failed); });
  $('print').addEventListener('click', function () { window.print(); });
  ui.autoResize();
  ui.connect().then(function () { $('from').value = Pos.today(); $('to').value = Pos.today(); return show(); }).then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
