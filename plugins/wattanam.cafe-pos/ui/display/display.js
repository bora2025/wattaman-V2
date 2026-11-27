/* Customer Display: a screen facing the customer.
 *   - Nobody at the till: the MENU BOARD — every category with its items' photos, Khmer and English names and
 *     prices (with the other currency), scrolling slowly when it is longer than the screen (POS Settings can
 *     turn it off). The menu is read again every five minutes.
 *   - The counter rings up an order: the items (with their photos), the total in dollars and riel, the shop's
 *     KHQR when paying by QR, then the change and a thank-you, and back to the menu.
 * It follows one register (the counter's register name, "main" by default).
 * Plugin API: GET settings, GET menu, GET display/:register. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el, fmt = Pos.fmt;
  var state = { s: null, menu: null, register: 'main', last: '', stage: '', data: {}, photos: {}, doneAt: 0 };
  var DONE_MS = 6000; // the thank-you stays this long, then the menu comes back

  // ---------- the menu board ----------
  function priceOf(p) {
    var base = state.s.baseCurrency, rate = state.s.rate;
    var prices = p.variants.length ? p.variants.map(function (v) { return v.price; }) : [p.price];
    var lowest = Pos.convert(Math.min.apply(null, prices), p.currency, base, rate);
    return { amount: lowest, from: p.variants.length > 1, other: Pos.other(lowest, base, rate, state.s.khrStep) };
  }
  function renderBoard() {
    var list = Pos.clear($('board-list')), menu = state.menu;
    $('board-shop').textContent = state.s.shopName || 'Menu';
    if (state.s.shopNameKh) $('board-shop').appendChild(el('small', { text: state.s.shopNameKh }));
    $('board-logo').hidden = !state.s.logo; if (state.s.logo) $('board-logo').src = state.s.logo;
    $('board-rate').textContent = '$1 = ' + Number(state.s.rate).toLocaleString('en-US') + '៛';
    if (!menu || !menu.products.length) { list.appendChild(el('p', { class: 'thanks', style: 'text-align:center;margin-top:20vh', text: 'Welcome · សូមស្វាគមន៍' })); return; }
    var color = {};
    var groups = menu.categories.map(function (c) { color[c.id] = c.color; return { category: c, items: menu.products.filter(function (p) { return p.categoryId === c.id; }) }; });
    var others = menu.products.filter(function (p) { return !menu.categories.some(function (c) { return c.id === p.categoryId; }); });
    if (others.length) groups.push({ category: { name: 'More', nameKh: 'ផ្សេងៗ' }, items: others });
    groups.filter(function (g) { return g.items.length; }).forEach(function (g) {
      list.appendChild(el('h2', {}, [g.category.name, g.category.nameKh ? el('small', { text: g.category.nameKh }) : null]));
      var tiles = el('div', { class: 'tiles' });
      g.items.forEach(function (p) {
        var price = priceOf(p);
        tiles.appendChild(el('div', { class: 'tile' }, [
          p.photo ? el('img', { src: p.photo, alt: '' }) : el('div', { class: 'ph', style: 'background:' + (color[p.categoryId] || '#155e57'), text: (p.name || '?').charAt(0) }),
          el('div', { class: 'info' }, [
            el('div', { class: 'name', text: p.name }),
            p.nameKh ? el('div', { class: 'kh', text: p.nameKh }) : null,
            p.variants.length > 1 ? el('div', { class: 'sizes', text: p.variants.map(function (v) { return v.name; }).join(' · ') }) : null,
            el('div', { class: 'price' }, [(price.from ? 'from ' : '') + fmt(price.amount, state.s.baseCurrency), el('small', { text: '≈ ' + price.other })]),
          ]),
        ]));
      });
      list.appendChild(tiles);
    });
    $('board-list').scrollTop = 0;
  }
  // a long menu scrolls down slowly, rests at the end, and starts again from the top
  var scroll = { pause: 0 };
  setInterval(function () {
    var list = $('board-list');
    if ($('board').hidden || list.scrollHeight <= list.clientHeight + 4) return;
    if (scroll.pause > 0) { scroll.pause -= 1; return; }
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 2) { scroll.pause = 80; setTimeout(function () { list.scrollTop = 0; scroll.pause = 60; }, 4000); return; }
    list.scrollTop += 1;
  }, 40);
  function loadMenu() {
    return ui.api.get('menu').then(function (m) {
      state.menu = m; state.photos = {};
      m.products.forEach(function (p) { if (p.photo) state.photos[p.id] = p.photo; });
      if (!$('board').hidden) renderBoard();
    }).catch(function () { /* keep the last menu */ });
  }

  // ---------- the order being rung up ----------
  function renderOrder(d) {
    var lines = Pos.clear($('lines')), total = Pos.clear($('total'));
    (d.lines || []).forEach(function (l) {
      var photo = l.productId && state.photos[l.productId];
      lines.appendChild(el('div', { class: 'line' }, [photo ? el('img', { src: photo, alt: '' }) : el('div', { class: 'ph' }), el('span', { text: l.quantity + ' × ' + l.name }), el('b', { class: 'money', text: fmt(l.amount, d.currency) })]));
    });
    if (d.stage === 'done') {
      total.appendChild(el('div', { class: 'thanks', text: 'Thank you · សូមអរគុណ' }));
      if (d.changeUsd || d.changeKhr) total.appendChild(el('div', { class: 'change', text: 'Change · ប្រាក់អាប់ ' + [d.changeUsd ? fmt(d.changeUsd, 'USD') : '', d.changeKhr ? fmt(d.changeKhr, 'KHR') : ''].filter(Boolean).join(' + ') }));
      return;
    }
    total.appendChild(el('div', { text: d.stage === 'pay' ? 'To pay · ត្រូវបង់' : 'Total · សរុប' }));
    total.appendChild(el('div', { class: 'amount money', text: fmt(d.stage === 'pay' ? d.due : d.total, d.currency) }));
    total.appendChild(el('div', { class: 'other', text: '≈ ' + d.other }));
    if (d.khqr && state.s && state.s.khqrImage) { total.appendChild(el('img', { src: state.s.khqrImage, alt: 'KHQR' })); if (state.s.khqrName) total.appendChild(el('div', { text: state.s.khqrName })); }
  }

  // which of the two: the order while there is one (and the thank-you for a moment), otherwise the menu
  function show() {
    var d = state.data || {};
    var busy = (d.lines && d.lines.length && d.stage !== 'done') || (d.stage === 'done' && Date.now() - state.doneAt < DONE_MS);
    var boardOn = state.s && state.s.displayMenu !== false && !busy;
    if (boardOn && $('board').hidden) { $('board').hidden = false; $('order').hidden = true; renderBoard(); }
    else if (!boardOn) {
      $('board').hidden = true; $('order').hidden = false;
      if (busy || !d.lines || !d.lines.length) renderOrder(busy ? d : {});
      if (!busy) { Pos.clear($('total')).appendChild(el('div', { class: 'thanks', text: 'Welcome · សូមស្វាគមន៍' })); }
    }
  }
  function poll() {
    return ui.api.get('display/' + encodeURIComponent(state.register)).then(function (r) {
      var key = JSON.stringify(r.data || {});
      if (key !== state.last) {
        var was = state.stage;
        state.last = key; state.data = r.data || {}; state.stage = state.data.stage;
        if (state.stage === 'done' && was !== 'done') { state.doneAt = Date.now(); Pos.sound('success'); }
        $('board').hidden = true; $('order').hidden = false; // the order screen first; show() decides
        renderOrder(state.data);
      }
      show();
    }).catch(function () { /* keep showing the last screen */ });
  }
  $('register').addEventListener('change', function () { state.register = ($('register').value.trim().toLowerCase() || 'main').replace(/[^a-z0-9-]/g, ''); ui.storage.set('register', state.register).catch(function () {}); state.last = ''; poll(); });
  ui.connect().then(function () {
    return Promise.all([ui.api.get('settings'), ui.storage.get('register').catch(function () { return null; })]);
  }).then(function (r) {
    state.s = r[0]; state.register = r[1] || 'main'; Pos.setSound(state.s.sounds); $('register').value = state.register;
    $('shop').textContent = state.s.shopName || 'Welcome';
    if (state.s.shopNameKh) $('shop').appendChild(el('small', { text: state.s.shopNameKh }));
    return loadMenu().then(poll);
  }).catch(function () {}).then(function () { $('app').setAttribute('aria-busy', 'false'); });
  setInterval(poll, 1500);
  setInterval(loadMenu, 5 * 60 * 1000);
  // the shop's settings (rate, logo, menu board on or off) every five minutes too
  setInterval(function () { ui.api.get('settings').then(function (s) { state.s = s; if (!$('board').hidden) renderBoard(); show(); }).catch(function () {}); }, 5 * 60 * 1000);
})();
