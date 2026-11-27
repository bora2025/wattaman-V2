/* Stock: supplies with low-stock warnings; deliveries, waste and counts; each item's recipe.
 * Plugin API: GET supplies, POST/PUT supplies, POST supplies/:id/movements, GET supplies/:id/movements,
 * GET menu/all, GET/PUT recipes/:productId. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el;
  var state = { supplies: [], products: [], supply: null };
  var KIND = { RECEIVE: 'delivery', USE: 'sold', WASTE: 'waste', ADJUST: 'count', RETURN: 'refund' };
  function failed(e) { Pos.say('message', ''); Pos.say('error', Pos.errorText(e), 'bad'); }
  function qty(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 }); }
  Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-pane]'), function (p) { p.hidden = p.getAttribute('data-pane') !== b.getAttribute('data-tab'); });
    });
  });
  function load() { return ui.api.get('supplies').then(function (rows) { state.supplies = rows; render(); }).catch(failed); }
  function render() {
    var body = Pos.clear($('s-list'));
    state.supplies.forEach(function (s) {
      body.appendChild(el('tr', { class: 'pick', onclick: function () { edit(s); } }, [el('td', {}, [el('b', { text: s.name }), s.active ? null : el('span', { class: 'badge', text: ' not used' })]), el('td', { class: 'num', text: qty(s.quantity) + ' ' + s.unit }), el('td', {}, [s.low && s.active ? el('span', { class: 'badge bad', text: 'low' }) : null])]));
    });
    if (!body.firstChild) body.appendChild(el('tr', {}, [el('td', { colspan: '3', class: 'empty', text: 'No supplies yet.' })]));
  }
  function edit(s) {
    state.supply = s; $('s-form').hidden = false; $('s-title').textContent = s ? s.name : 'New supply';
    $('s-name').value = s ? s.name : ''; $('s-unit').value = s ? s.unit : 'pcs'; $('s-low').value = s ? s.lowAt : 0; $('s-currency').value = s ? s.currency : 'USD';
    $('s-cost').value = s && s.cost !== null ? Pos.moneyInput(s.cost, s.currency) : ''; $('s-active').checked = s ? s.active : true;
    $('s-opening-label').hidden = Boolean(s); $('s-moves').hidden = !s;
    if (s) ui.api.get('supplies/' + encodeURIComponent(s.id) + '/movements').then(function (rows) {
      var body = Pos.clear($('m-list'));
      rows.forEach(function (m) { body.appendChild(el('tr', {}, [el('td', { text: Pos.dateTime(m.createdAt) }), el('td', { text: KIND[m.kind] + (m.orderNumber ? ' #' + m.orderNumber : '') + (m.note ? ' · ' + m.note : '') }), el('td', { class: 'num', text: (m.quantity > 0 ? '+' : '') + qty(m.quantity) })])); });
    }).catch(failed);
  }
  $('s-new').addEventListener('click', function () { edit(null); });
  $('s-save').addEventListener('click', function () {
    var currency = $('s-currency').value;
    var body = { name: $('s-name').value.trim(), unit: $('s-unit').value.trim(), lowAt: Number($('s-low').value) || 0, cost: $('s-cost').value.trim() ? Pos.parseMoney($('s-cost').value, currency) : null, currency: currency, active: $('s-active').checked };
    if (!state.supply) body.quantity = Number($('s-opening').value) || 0;
    (state.supply ? ui.api.put('supplies/' + encodeURIComponent(state.supply.id), body) : ui.api.post('supplies', body)).then(function (s) { Pos.say('message', 'Saved ' + s.name + '.'); return load().then(function () { edit(s); }); }).catch(failed);
  });
  $('m-save').addEventListener('click', function () {
    ui.api.post('supplies/' + encodeURIComponent(state.supply.id) + '/movements', { kind: $('m-kind').value, quantity: Number($('m-qty').value), note: $('m-note').value.trim() })
      .then(function (s) { $('m-qty').value = ''; $('m-note').value = ''; Pos.say('message', s.name + ': ' + qty(s.quantity) + ' ' + s.unit + ' now.'); return load().then(function () { edit(s); }); }).catch(failed);
  });

  // ---------- recipes ----------
  function recipeRow(line) {
    var product = state.products.filter(function (p) { return p.id === $('r-product').value; })[0];
    var supply = el('select', { 'data-f': 'supply' }, state.supplies.filter(function (s) { return s.active || s.id === line.supplyId; }).map(function (s) { return el('option', { value: s.id, text: s.name + ' (' + s.unit + ')' }); }));
    var variant = el('select', { 'data-f': 'variant' }, [el('option', { value: '', text: 'Every size' })].concat((product ? product.variants : []).map(function (v) { return el('option', { value: v.id, text: v.name }); })));
    supply.value = line.supplyId || ''; variant.value = line.variantId || '';
    var row = el('div', { class: 'recipe-row' }, [supply, variant, el('input', { 'data-f': 'qty', value: line.quantity || '', placeholder: 'Quantity', inputmode: 'decimal' }), el('button', { type: 'button', class: 'small danger', onclick: function () { row.remove(); } }, ['✕'])]);
    return row;
  }
  function loadRecipe() {
    var id = $('r-product').value; Pos.clear($('r-lines')); if (!id) return;
    ui.api.get('recipes/' + encodeURIComponent(id)).then(function (lines) { lines.forEach(function (l) { $('r-lines').appendChild(recipeRow(l)); }); if (!lines.length) $('r-lines').appendChild(recipeRow({})); }).catch(failed);
  }
  $('r-product').addEventListener('change', loadRecipe);
  $('r-add').addEventListener('click', function () { $('r-lines').appendChild(recipeRow({})); });
  $('r-save').addEventListener('click', function () {
    var items = Array.prototype.map.call($('r-lines').children, function (row) {
      return { supplyId: row.querySelector('[data-f="supply"]').value, variantId: row.querySelector('[data-f="variant"]').value || null, quantity: Number(row.querySelector('[data-f="qty"]').value) };
    }).filter(function (l) { return l.supplyId && l.quantity; });
    ui.api.put('recipes/' + encodeURIComponent($('r-product').value), { items: items }).then(function () { Pos.say('message', 'Recipe saved.'); }).catch(failed);
  });

  ui.autoResize();
  ui.connect().then(function () { return Promise.all([load(), ui.api.get('menu/all').catch(function () { return { products: [] }; })]); }).then(function (r) {
    state.products = r[1].products.filter(function (p) { return p.active; });
    var select = $('r-product');
    state.products.forEach(function (p) { select.appendChild(el('option', { value: p.id, text: p.name })); });
    loadRecipe();
  }).catch(failed).then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
