/* Café POS: helpers shared by every screen (money in dollars and riel, small DOM helpers, the receipt).
 * Money is in MINOR units everywhere: US cents and riel. The server computes every price and total; the
 * screens only preview them (the same rules as backend/money.js). */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
      else if (k === 'value') node.value = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(id, text, tone) {
    var n = $(id); if (!n) return;
    n.textContent = text || ''; n.hidden = !text; n.className = 'notice ' + (tone || 'ok');
    if (text && tone === 'bad') sound('fail'); // every error the screen shows is heard
  }

  // ---------- sounds: short tones made here (no sound files); the shop turns them off in POS Settings ----------
  // each note: [frequency Hz, start s, length s, wave, volume]
  var SOUNDS = {
    tap: [[880, 0, 0.05, 'sine', 0.06]],
    add: [[660, 0, 0.06, 'sine', 0.08], [990, 0.06, 0.08, 'sine', 0.08]],                       // an item in the cart
    success: [[523, 0, 0.12, 'sine', 0.12], [659, 0.12, 0.12, 'sine', 0.12], [784, 0.24, 0.22, 'sine', 0.12]], // paid, saved
    cash: [[1318, 0, 0.08, 'triangle', 0.12], [1760, 0.09, 0.3, 'triangle', 0.12]],             // the drawer: ka-ching
    fail: [[330, 0, 0.18, 'square', 0.05], [220, 0.2, 0.32, 'square', 0.05]],                    // an error
    warn: [[600, 0, 0.1, 'triangle', 0.1], [600, 0.16, 0.1, 'triangle', 0.1]],                   // kept offline, attention
    open: [[392, 0, 0.1, 'sine', 0.1], [523, 0.1, 0.1, 'sine', 0.1], [659, 0.2, 0.1, 'sine', 0.1], [784, 0.3, 0.25, 'sine', 0.1]], // shift opened
    close: [[784, 0, 0.1, 'sine', 0.1], [659, 0.1, 0.1, 'sine', 0.1], [523, 0.2, 0.1, 'sine', 0.1], [392, 0.3, 0.3, 'sine', 0.1]], // shift closed
    order: [[880, 0, 0.14, 'sine', 0.14], [1175, 0.18, 0.26, 'sine', 0.14]],                     // a new kitchen ticket, sent to the kitchen
    cooking: [[440, 0, 0.1, 'triangle', 0.12], [554, 0.1, 0.16, 'triangle', 0.12]],
    ready: [[784, 0, 0.12, 'sine', 0.14], [988, 0.13, 0.12, 'sine', 0.14], [1175, 0.26, 0.35, 'sine', 0.14]], // food ready: ding-ding-ding
    served: [[659, 0, 0.1, 'sine', 0.1], [523, 0.11, 0.2, 'sine', 0.1]],
    void: [[523, 0, 0.12, 'sawtooth', 0.04], [392, 0.13, 0.22, 'sawtooth', 0.04]],               // removed, cancelled, refunded
  };
  var audio = null, soundOn = true;
  function sound(name) {
    var notes = SOUNDS[name];
    if (!soundOn || !notes) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var now = audio.currentTime;
      notes.forEach(function (n) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = n[3] || 'sine'; o.frequency.value = n[0]; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.0001, now + n[1]); g.gain.exponentialRampToValueAtTime(n[4] || 0.1, now + n[1] + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + n[2]);
        o.start(now + n[1]); o.stop(now + n[1] + n[2] + 0.02);
      });
    } catch (e) { /* this device has no sound */ }
  }
  // browsers start sound only after a tap on the screen: get ready on the first one
  document.addEventListener('pointerdown', function () { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { /* none */ } }, { once: true });
  function setSound(on) { soundOn = on !== false; }

  // ---------- money ----------
  function round(v) { return v < 0 ? -Math.round(-v) : Math.round(v); }
  function convert(amount, from, to, rate) { if (from === to) return amount; return from === 'USD' ? round(amount * rate / 100) : round(amount * 100 / rate); }
  function roundRiel(amount, step) { step = step || 100; return round(amount / step) * step; }
  function fmt(amount, currency) {
    amount = Number(amount || 0);
    if (currency === 'KHR') return amount.toLocaleString('en-US') + '៛';
    var sign = amount < 0 ? '-' : '';
    return sign + '$' + (Math.abs(amount) / 100).toFixed(2);
  }
  // the same amount in the other currency ("≈ 20,500៛" under a dollar total)
  function other(amount, base, rate, step) {
    return base === 'USD' ? fmt(roundRiel(convert(amount, 'USD', 'KHR', rate), step), 'KHR') : fmt(convert(amount, 'KHR', 'USD', rate), 'USD');
  }
  // what a person types ("3.5", "20,000") as minor units
  function parseMoney(text, currency) {
    var clean = String(text || '').replace(/[,$៛\s]/g, '');
    if (!clean) return 0;
    if (!/^\d+(\.\d{0,2})?$/.test(clean)) return NaN;
    return currency === 'USD' ? Math.round(Number(clean) * 100) : Math.round(Number(clean));
  }
  function moneyInput(amount, currency) { return currency === 'USD' ? (Number(amount || 0) / 100).toFixed(2) : String(amount || 0); }

  // the order's totals before the server confirms them (backend/money.js orderTotals)
  function previewTotals(lines, discount, serviceRate, s, base) {
    var subtotal = 0, taxable = 0;
    lines.forEach(function (l) { subtotal += l.lineTotal; if (l.taxable !== false) taxable += l.lineTotal; });
    var d = 0;
    if (discount && discount.type === 'PERCENT') d = round(subtotal * Math.min(10000, discount.value) / 10000);
    else if (discount && discount.type === 'AMOUNT') d = Math.min(subtotal, discount.value);
    var after = subtotal - d, service = round(after * (serviceRate || 0) / 10000);
    var share = subtotal ? taxable / subtotal : 0, taxBase = round((after + service) * share), tax = 0, total = after + service;
    if (s.vatEnabled && s.vatRate > 0) { if (s.vatInclusive) tax = round(taxBase * s.vatRate / (10000 + s.vatRate)); else { tax = round(taxBase * s.vatRate / 10000); total += tax; } }
    var roundOff = 0;
    if (base === 'KHR') { var r = roundRiel(total, s.khrStep); roundOff = r - total; total = r; }
    return { subtotal: subtotal, discount: d, serviceCharge: service, tax: tax, roundOff: roundOff, total: total };
  }

  function name(item) { return item.nameKh ? item.name + ' · ' + item.nameKh : item.name; }
  function key(prefix) { return (prefix || 'k') + '-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); }
  function time(iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function dateTime(iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString() + ' ' + time(iso); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function errorText(e, fallback) { return (e && e.message) || fallback || 'Something went wrong'; }
  function errorCode(e) { return (e && (e.code || (e.body && e.body.code))) || ''; }
  // a picture chosen on this device, made small enough to keep (menu photos, logo, KHQR)
  function pickImage(file, maxSide, done) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        done(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- the receipt (and the bill before paying) ----------
  var METHOD = { CASH: 'Cash · សាច់ប្រាក់', CARD: 'Card · កាត', TRANSFER: 'Transfer · ផ្ទេរ', KHQR: 'KHQR', LOYALTY: 'Points · ពិន្ទុ' };
  function receipt(order, s, opts) {
    opts = opts || {};
    var cur = order.baseCurrency, w = s.paperWidth === 58 ? 'w58' : 'w80';
    var line = function (left, right, cls) { return el('div', { class: 'line ' + (cls || '') }, [el('span', { text: left }), el('span', { text: right })]); };
    var box = el('div', { class: 'receipt ' + w });
    if (s.logo) box.appendChild(el('img', { class: 'logo', src: s.logo, alt: '' }));
    if (s.shopName) box.appendChild(el('div', { class: 'center big', text: s.shopName }));
    if (s.shopNameKh) box.appendChild(el('div', { class: 'center', text: s.shopNameKh }));
    if (s.address) box.appendChild(el('div', { class: 'center', text: s.address }));
    if (s.phone) box.appendChild(el('div', { class: 'center', text: 'Tel ' + s.phone }));
    if (s.vatEnabled && s.vatNumber) box.appendChild(el('div', { class: 'center', text: 'VAT TIN ' + s.vatNumber }));
    box.appendChild(el('hr'));
    box.appendChild(el('div', { class: 'center big', text: (opts.bill ? 'BILL · វិក្កយបត្រ' : order.status === 'REFUNDED' ? 'REFUNDED' : 'RECEIPT · បង្កាន់ដៃ') + (order.number ? ' #' + order.number : '') }));
    box.appendChild(line(dateTime(order.paidAt || order.createdAt || new Date().toISOString()), (order.table && order.table.name ? 'Table ' + order.table.name : order.type === 'DELIVERY' ? 'Delivery' : order.type === 'DINE_IN' ? 'Dine-in' : 'Take away')));
    if (opts.offline) box.appendChild(el('div', { class: 'center', text: 'Saved offline — sent when the network is back' }));
    if (order.customer) box.appendChild(el('div', { text: 'Customer: ' + order.customer.name }));
    box.appendChild(el('hr'));
    (order.items || []).filter(function (i) { return i.status !== 'VOID'; }).forEach(function (i) {
      box.appendChild(line(i.quantity + ' × ' + i.name + (i.variantName ? ' (' + i.variantName + ')' : ''), fmt(i.lineTotal, cur)));
      if (i.nameKh) box.appendChild(el('div', { class: 'sub', text: i.nameKh }));
      (i.addons || []).forEach(function (a) { box.appendChild(el('div', { class: 'sub', text: '+ ' + (a.nameKh || a.name) + (a.price ? ' ' + fmt(a.price, cur) : '') })); });
      if (i.note) box.appendChild(el('div', { class: 'sub', text: '“' + i.note + '”' }));
    });
    box.appendChild(el('hr'));
    box.appendChild(line('Subtotal', fmt(order.subtotal, cur)));
    if (order.discount) box.appendChild(line('Discount', '-' + fmt(order.discount, cur)));
    if (order.serviceCharge) box.appendChild(line('Service', fmt(order.serviceCharge, cur)));
    if (order.tax && !order.taxInclusive) box.appendChild(line('VAT ' + (s.vatRate / 100) + '%', fmt(order.tax, cur)));
    if (order.roundOff) box.appendChild(line('Rounding', fmt(order.roundOff, cur)));
    box.appendChild(line('TOTAL · សរុប', fmt(order.total, cur), 'big'));
    box.appendChild(line('', '≈ ' + other(order.total, cur, order.rate, s.khrStep)));
    if (order.tax && order.taxInclusive) box.appendChild(line('incl. VAT ' + (s.vatRate / 100) + '%', fmt(order.tax, cur)));
    (order.payments || []).forEach(function (p) {
      box.appendChild(line(METHOD[p.method] || p.method, fmt(p.amount, cur)));
      if (p.method === 'CASH') {
        var given = [p.cashUsd ? fmt(p.cashUsd, 'USD') : '', p.cashKhr ? fmt(p.cashKhr, 'KHR') : ''].filter(Boolean).join(' + ');
        if (given) box.appendChild(el('div', { class: 'sub', text: 'Given ' + given }));
        var change = [p.changeUsd ? fmt(p.changeUsd, 'USD') : '', p.changeKhr ? fmt(p.changeKhr, 'KHR') : ''].filter(Boolean).join(' + ');
        if (change) box.appendChild(el('div', { class: 'sub', text: 'Change · ប្រាក់អាប់ ' + change }));
      } else if (p.reference) box.appendChild(el('div', { class: 'sub', text: 'Ref ' + p.reference }));
    });
    if (order.refunded) box.appendChild(line('Refunded', '-' + fmt(order.refunded, cur)));
    if (opts.bill && order.due) box.appendChild(line('To pay', fmt(order.due, cur), 'big'));
    box.appendChild(line('Rate', '$1 = ' + Number(order.rate).toLocaleString('en-US') + '៛'));
    if (opts.bill && s.khqrImage) { box.appendChild(el('img', { class: 'qr', src: s.khqrImage, alt: 'KHQR' })); if (s.khqrName) box.appendChild(el('div', { class: 'center', text: s.khqrName })); }
    box.appendChild(el('hr'));
    if (s.receiptFooter) box.appendChild(el('div', { class: 'center', text: s.receiptFooter }));
    return box;
  }
  // prints one receipt through the browser (the printer's own driver; 58/80 mm roll or A4)
  function printNode(node) {
    var area = $('print-area');
    if (!area) { area = el('div', { id: 'print-area' }); document.body.appendChild(area); }
    clear(area).appendChild(node);
    setTimeout(function () { window.print(); }, 50);
  }
  function printReceipt(order, s, opts) { printNode(receipt(order, s, opts)); }

  // The same receipt as plain lines for a USB thermal printer (the school page draws them, Khmer included).
  function receiptJob(order, s, opts) {
    opts = opts || {};
    var cur = order.baseCurrency, lines = [];
    var add = function (text, right, extra) { var l = { text: String(text || '') }; if (right !== undefined) l.right = String(right); Object.keys(extra || {}).forEach(function (k) { l[k] = extra[k]; }); lines.push(l); };
    if (s.logo) lines.push({ image: s.logo, width: 0.5 });
    if (s.shopName) add(s.shopName, undefined, { align: 'center', bold: true, size: 2 });
    if (s.shopNameKh) add(s.shopNameKh, undefined, { align: 'center' });
    if (s.address) add(s.address, undefined, { align: 'center' });
    if (s.phone) add('Tel ' + s.phone, undefined, { align: 'center' });
    if (s.vatEnabled && s.vatNumber) add('VAT TIN ' + s.vatNumber, undefined, { align: 'center' });
    lines.push({ divider: true });
    add((opts.bill ? 'BILL · វិក្កយបត្រ' : order.status === 'REFUNDED' ? 'REFUNDED' : 'RECEIPT · បង្កាន់ដៃ') + (order.number ? ' #' + order.number : ''), undefined, { align: 'center', bold: true });
    add(dateTime(order.paidAt || order.createdAt || new Date().toISOString()), order.table && order.table.name ? 'Table ' + order.table.name : order.type === 'DINE_IN' ? 'Dine-in' : order.type === 'DELIVERY' ? 'Delivery' : 'Take away');
    if (opts.offline) add('Saved offline', undefined, { align: 'center' });
    if (order.customer) add('Customer: ' + order.customer.name);
    lines.push({ divider: true });
    (order.items || []).filter(function (i) { return i.status !== 'VOID'; }).forEach(function (i) {
      add(i.quantity + ' × ' + i.name + (i.variantName ? ' (' + i.variantName + ')' : ''), fmt(i.lineTotal, cur));
      if (i.nameKh) add('   ' + i.nameKh);
      (i.addons || []).forEach(function (a) { add('   + ' + (a.nameKh || a.name)); });
      if (i.note) add('   “' + i.note + '”');
    });
    lines.push({ divider: true });
    add('Subtotal', fmt(order.subtotal, cur));
    if (order.discount) add('Discount', '-' + fmt(order.discount, cur));
    if (order.serviceCharge) add('Service', fmt(order.serviceCharge, cur));
    if (order.tax && !order.taxInclusive) add('VAT ' + (s.vatRate / 100) + '%', fmt(order.tax, cur));
    if (order.roundOff) add('Rounding', fmt(order.roundOff, cur));
    add('TOTAL · សរុប', fmt(order.total, cur), { bold: true, size: 2 });
    add('', '≈ ' + other(order.total, cur, order.rate, s.khrStep));
    if (order.tax && order.taxInclusive) add('incl. VAT ' + (s.vatRate / 100) + '%', fmt(order.tax, cur));
    (order.payments || []).forEach(function (p) {
      add(METHOD[p.method] || p.method, fmt(p.amount, cur));
      var change = [p.changeUsd ? fmt(p.changeUsd, 'USD') : '', p.changeKhr ? fmt(p.changeKhr, 'KHR') : ''].filter(Boolean).join(' + ');
      if (change) add('   Change · ប្រាក់អាប់ ' + change);
    });
    if (opts.bill && order.due) add('To pay', fmt(order.due, cur), { bold: true });
    add('Rate', '$1 = ' + Number(order.rate).toLocaleString('en-US') + '៛');
    if (opts.bill && s.khqrImage) lines.push({ image: s.khqrImage, width: 0.7 });
    lines.push({ divider: true });
    if (s.receiptFooter) add(s.receiptFooter, undefined, { align: 'center' });
    return { width: s.paperWidth === 58 ? 58 : 80, lines: lines, cut: true, drawer: Boolean(opts.drawer) };
  }
  // Prints through the USB printer when the shop chose it (falling back to the browser), or the browser.
  function printOrder(order, s, opts) {
    opts = opts || {};
    if (s.printMode === 'USB' && ui.printer) {
      return ui.printer.print(receiptJob(order, s, { bill: opts.bill, offline: opts.offline, drawer: opts.drawer && s.cashDrawer }))
        .catch(function (e) { printReceipt(order, s, opts); throw e; });
    }
    printReceipt(order, s, opts);
    return Promise.resolve();
  }
  // the cash drawer on its own (no receipt)
  function openDrawer(s) { return s.printMode === 'USB' && s.cashDrawer && ui.printer ? ui.printer.openDrawer() : Promise.resolve(); }

  window.Pos = {
    ui: ui, $: $, el: el, clear: clear, say: say, fmt: fmt, other: other, convert: convert, roundRiel: roundRiel, parseMoney: parseMoney, moneyInput: moneyInput,
    previewTotals: previewTotals, name: name, key: key, time: time, dateTime: dateTime, today: today, errorText: errorText, errorCode: errorCode, pickImage: pickImage, download: download,
    sound: sound, setSound: setSound,
    receipt: receipt, printNode: printNode, printReceipt: printReceipt, receiptJob: receiptJob, printOrder: printOrder, openDrawer: openDrawer, METHOD: METHOD,
  };
})();
