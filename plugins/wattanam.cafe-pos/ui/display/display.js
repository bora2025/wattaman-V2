/* Customer Display: a screen facing the customer shows what the counter is ringing up, the total in dollars and
 * riel, the shop's KHQR when paying by QR, and the change. It follows one register (the counter's register name,
 * "main" by default). Plugin API: GET settings, GET display/:register. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el, fmt = Pos.fmt;
  var state = { s: null, register: 'main', last: '' };
  function render(d) {
    var lines = Pos.clear($('lines')), total = Pos.clear($('total'));
    (d.lines || []).forEach(function (l) { lines.appendChild(el('div', {}, [el('span', { text: l.quantity + ' × ' + l.name }), el('b', { class: 'money', text: fmt(l.amount, d.currency) })])); });
    if (d.stage === 'done') {
      total.appendChild(el('div', { class: 'thanks', text: 'Thank you · សូមអរគុណ' }));
      if (d.changeUsd || d.changeKhr) total.appendChild(el('div', { class: 'change', text: 'Change · ប្រាក់អាប់ ' + [d.changeUsd ? fmt(d.changeUsd, 'USD') : '', d.changeKhr ? fmt(d.changeKhr, 'KHR') : ''].filter(Boolean).join(' + ') }));
      return;
    }
    if (!d.lines || !d.lines.length) { total.appendChild(el('div', { class: 'thanks', text: 'Welcome · សូមស្វាគមន៍' })); return; }
    total.appendChild(el('div', { text: d.stage === 'pay' ? 'To pay · ត្រូវបង់' : 'Total · សរុប' }));
    total.appendChild(el('div', { class: 'amount money', text: fmt(d.stage === 'pay' ? d.due : d.total, d.currency) }));
    total.appendChild(el('div', { class: 'other', text: '≈ ' + d.other }));
    if (d.khqr && state.s && state.s.khqrImage) { total.appendChild(el('img', { src: state.s.khqrImage, alt: 'KHQR' })); if (state.s.khqrName) total.appendChild(el('div', { text: state.s.khqrName })); }
  }
  function poll() {
    return ui.api.get('display/' + encodeURIComponent(state.register)).then(function (r) {
      var key = JSON.stringify(r.data || {});
      if (key !== state.last) { var was = state.stage; state.last = key; state.stage = (r.data || {}).stage; render(r.data || {}); if (state.stage === 'done' && was !== 'done') Pos.sound('success'); }
    }).catch(function () { /* keep showing the last screen */ });
  }
  $('register').addEventListener('change', function () { state.register = ($('register').value.trim().toLowerCase() || 'main').replace(/[^a-z0-9-]/g, ''); ui.storage.set('register', state.register).catch(function () {}); state.last = ''; poll(); });
  ui.connect().then(function () {
    return Promise.all([ui.api.get('settings'), ui.storage.get('register').catch(function () { return null; })]);
  }).then(function (r) {
    state.s = r[0]; state.register = r[1] || 'main'; Pos.setSound(state.s.sounds); $('register').value = state.register;
    $('shop').textContent = state.s.shopName || 'Welcome';
    if (state.s.shopNameKh) $('shop').appendChild(el('small', { text: state.s.shopNameKh }));
    render({}); return poll();
  }).catch(function () {}).then(function () { $('app').setAttribute('aria-busy', 'false'); });
  setInterval(poll, 1500);
})();
