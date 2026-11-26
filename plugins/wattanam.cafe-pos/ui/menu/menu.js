/* Menu: categories, items (price in dollars or riel, sizes, photo, add-on groups, VAT), add-on groups (milk,
 * sugar level…) and CSV import. Items are never deleted (orders keep their copy): take them off the menu instead.
 * Plugin API: GET menu/all, POST/PUT categories, POST/PUT products, POST/PUT addon-groups, POST menu/import. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el, fmt = Pos.fmt;
  var state = { menu: { categories: [], products: [], addonGroups: [] }, item: null, photo: undefined, group: null, category: null };

  function done(message) { Pos.say('error', ''); Pos.say('message', message); return load(); }
  function failed(e) { Pos.say('message', ''); Pos.say('error', Pos.errorText(e), 'bad'); }
  function load() { return ui.api.get('menu/all').then(function (m) { state.menu = m; renderItems(); renderCategories(); renderGroups(); }).catch(failed); }
  Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-pane]'), function (p) { p.hidden = p.getAttribute('data-pane') !== b.getAttribute('data-tab'); });
    });
  });

  // ---------- items ----------
  function categoryName(id) { var c = state.menu.categories.filter(function (x) { return x.id === id; })[0]; return c ? c.name : '—'; }
  function renderItems() {
    var q = $('item-search').value.trim().toLowerCase(), body = Pos.clear($('item-list'));
    state.menu.products.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0 || (p.nameKh || '').indexOf(q) >= 0; }).forEach(function (p) {
      var price = p.variants.filter(function (v) { return v.active; }).map(function (v) { return v.name + ' ' + fmt(v.price, p.currency); }).join(' · ') || fmt(p.price, p.currency);
      body.appendChild(el('tr', { class: 'pick' + (p.active ? '' : ' off'), onclick: function () { editItem(p); } }, [
        el('td', {}, [p.photo ? el('img', { class: 'thumb', src: p.photo, alt: '' }) : el('span', { class: 'thumb' })]),
        el('td', {}, [el('b', { text: p.name }), el('div', { class: 'muted kh', text: [p.nameKh, categoryName(p.categoryId)].filter(Boolean).join(' · ') })]),
        el('td', { class: 'num', text: price }),
      ]));
    });
    if (!body.firstChild) body.appendChild(el('tr', {}, [el('td', { class: 'empty', text: 'No items yet.' })]));
  }
  $('item-search').addEventListener('input', renderItems);
  function fillCategories(select, value) {
    Pos.clear(select).appendChild(el('option', { value: '', text: '— no category —' }));
    state.menu.categories.forEach(function (c) { select.appendChild(el('option', { value: c.id, text: c.name })); });
    select.value = value || '';
  }
  function variantRow(v, currency) {
    var row = el('div', { class: 'sub-row' }, [
      el('input', { 'data-f': 'name', value: v.name || '', placeholder: 'Size (S, M, L…)', maxlength: '60' }), el('input', { 'data-f': 'nameKh', value: v.nameKh || '', placeholder: 'Khmer', class: 'kh', maxlength: '60' }),
      el('input', { 'data-f': 'price', value: v.price !== undefined ? Pos.moneyInput(v.price, currency) : '', placeholder: 'Price', inputmode: 'decimal' }),
      el('label', { class: 'checks' }, [el('label', {}, [el('input', { type: 'checkbox', 'data-f': 'active', checked: v.active !== false }), 'on'])]),
      el('button', { type: 'button', class: 'small danger', onclick: function () { row.remove(); } }, ['✕']),
    ]);
    if (v.id) row.setAttribute('data-id', v.id);
    return row;
  }
  function editItem(p) {
    state.item = p; state.photo = undefined;
    $('item-form').hidden = false; $('item-title').textContent = p ? 'Edit ' + p.name : 'New item';
    $('i-name').value = p ? p.name : ''; $('i-namekh').value = p ? p.nameKh : ''; fillCategories($('i-category'), p ? p.categoryId : '');
    $('i-currency').value = p ? p.currency : 'USD';
    $('i-price').value = p ? Pos.moneyInput(p.price, p.currency) : ''; $('i-cost').value = p && p.cost !== null ? Pos.moneyInput(p.cost, p.currency) : '';
    $('i-sku').value = p ? p.sku : ''; $('i-barcode').value = p ? p.barcode : ''; $('i-description').value = p ? p.description : ''; $('i-sort').value = p ? p.sortOrder : 0;
    $('i-taxable').checked = p ? p.taxable : true; $('i-active').checked = p ? p.active : true;
    $('i-photo').value = ''; $('i-photo-preview').hidden = !(p && p.photo); $('i-photo-remove').hidden = !(p && p.photo); if (p && p.photo) $('i-photo-preview').src = p.photo;
    var variants = Pos.clear($('i-variants'));
    (p ? p.variants : []).forEach(function (v) { variants.appendChild(variantRow(v, p.currency)); });
    var groups = Pos.clear($('i-groups'));
    state.menu.addonGroups.forEach(function (g) { groups.appendChild(el('label', {}, [el('input', { type: 'checkbox', value: g.id, checked: Boolean(p && p.addonGroupIds.indexOf(g.id) >= 0) }), g.name])); });
    if (!state.menu.addonGroups.length) groups.appendChild(el('span', { class: 'muted', text: 'No add-on groups yet (Add-ons tab).' }));
    $('i-name').focus();
  }
  $('item-new').addEventListener('click', function () { editItem(null); });
  $('i-cancel').addEventListener('click', function () { $('item-form').hidden = true; state.item = null; });
  $('i-variant-add').addEventListener('click', function () { $('i-variants').appendChild(variantRow({}, $('i-currency').value)); });
  $('i-photo').addEventListener('change', function () { Pos.pickImage($('i-photo').files[0], 480, function (data) { state.photo = data; $('i-photo-preview').src = data; $('i-photo-preview').hidden = false; $('i-photo-remove').hidden = false; }); });
  $('i-photo-remove').addEventListener('click', function () { state.photo = null; $('i-photo-preview').hidden = true; $('i-photo-remove').hidden = true; });
  $('i-save').addEventListener('click', function () {
    var currency = $('i-currency').value;
    var body = {
      name: $('i-name').value.trim(), nameKh: $('i-namekh').value.trim(), categoryId: $('i-category').value || null, currency: currency,
      price: Pos.parseMoney($('i-price').value, currency), cost: $('i-cost').value.trim() ? Pos.parseMoney($('i-cost').value, currency) : null,
      sku: $('i-sku').value.trim(), barcode: $('i-barcode').value.trim(), description: $('i-description').value.trim(), sortOrder: Number($('i-sort').value) || 0,
      taxable: $('i-taxable').checked, active: $('i-active').checked,
      variants: Array.prototype.map.call($('i-variants').children, function (row) {
        var f = function (n) { return row.querySelector('[data-f="' + n + '"]'); };
        return { id: row.getAttribute('data-id') || undefined, name: f('name').value.trim(), nameKh: f('nameKh').value.trim(), price: Pos.parseMoney(f('price').value, currency), active: f('active').checked };
      }).filter(function (v) { return v.name; }),
      addonGroupIds: Array.prototype.filter.call($('i-groups').querySelectorAll('input'), function (c) { return c.checked; }).map(function (c) { return c.value; }),
    };
    if (isNaN(body.price) || body.variants.some(function (v) { return isNaN(v.price); })) { failed(new Error('Check the prices')); return; }
    if (state.photo !== undefined) body.photo = state.photo;
    else if (!state.item) body.photo = null;
    var p = state.item ? ui.api.put('products/' + encodeURIComponent(state.item.id), body) : ui.api.post('products', body);
    p.then(function () { $('item-form').hidden = true; state.item = null; return done('Saved ' + body.name + '.'); }).catch(failed);
  });

  // ---------- categories ----------
  function renderCategories() {
    var body = Pos.clear($('c-list'));
    state.menu.categories.forEach(function (c) {
      body.appendChild(el('tr', { class: 'pick' + (c.active ? '' : ' off'), onclick: function () {
        state.category = c; $('c-name').value = c.name; $('c-namekh').value = c.nameKh; $('c-color').value = c.color || '#0f766e'; $('c-sort').value = c.sortOrder; $('c-active').checked = c.active; $('c-save').textContent = 'Save category';
      } }, [el('td', {}, [el('span', { class: 'badge', style: 'background:' + (c.color || '#eef0f3') + ';color:#fff', text: ' ' })]), el('td', { text: c.name }), el('td', { class: 'kh', text: c.nameKh }), el('td', { class: 'num', text: state.menu.products.filter(function (p) { return p.categoryId === c.id; }).length + ' items' })]));
    });
  }
  $('c-save').addEventListener('click', function () {
    var body = { name: $('c-name').value.trim(), nameKh: $('c-namekh').value.trim(), color: $('c-color').value, sortOrder: Number($('c-sort').value) || 0, active: $('c-active').checked };
    (state.category ? ui.api.put('categories/' + encodeURIComponent(state.category.id), body) : ui.api.post('categories', body)).then(function () {
      state.category = null; $('c-name').value = ''; $('c-namekh').value = ''; $('c-save').textContent = 'Add category'; return done('Category saved.');
    }).catch(failed);
  });

  // ---------- add-on groups ----------
  function addonRow(a) {
    var row = el('div', { class: 'sub-row' }, [
      el('input', { 'data-f': 'name', value: a.name || '', placeholder: 'Choice (Oat milk)', maxlength: '60' }), el('input', { 'data-f': 'nameKh', value: a.nameKh || '', placeholder: 'Khmer', class: 'kh', maxlength: '60' }),
      el('input', { 'data-f': 'price', value: a.price !== undefined ? Pos.moneyInput(a.price, a.currency || 'USD') : '0', placeholder: 'Extra price', inputmode: 'decimal' }),
      el('select', { 'data-f': 'currency' }, [el('option', { value: 'USD', text: '$' }), el('option', { value: 'KHR', text: '៛' })]),
      el('button', { type: 'button', class: 'small danger', onclick: function () { row.remove(); } }, ['✕']),
    ]);
    row.querySelector('[data-f="currency"]').value = a.currency || 'USD';
    if (a.id) row.setAttribute('data-id', a.id);
    return row;
  }
  function editGroup(g) {
    state.group = g;
    $('g-name').value = g ? g.name : ''; $('g-namekh').value = g ? g.nameKh : ''; $('g-min').value = g ? g.minSelect : 0; $('g-max').value = g ? g.maxSelect : 1;
    $('g-required').checked = g ? g.required : false; $('g-active').checked = g ? g.active : true;
    var host = Pos.clear($('g-addons'));
    (g ? g.addons.filter(function (a) { return a.active; }) : [{}, {}]).forEach(function (a) { host.appendChild(addonRow(a)); });
  }
  function renderGroups() {
    var body = Pos.clear($('g-list'));
    state.menu.addonGroups.forEach(function (g) {
      body.appendChild(el('tr', { class: 'pick' + (g.active ? '' : ' off'), onclick: function () { editGroup(g); } }, [el('td', {}, [el('b', { text: g.name }), g.required ? el('span', { class: 'badge warn', text: ' required' }) : null]), el('td', { text: g.addons.filter(function (a) { return a.active; }).map(function (a) { return a.name + (a.price ? ' +' + fmt(a.price, a.currency) : ''); }).join(' · ') })]));
    });
    if (!state.group) editGroup(null);
  }
  $('g-addon-add').addEventListener('click', function () { $('g-addons').appendChild(addonRow({})); });
  $('g-new').addEventListener('click', function () { editGroup(null); });
  $('g-save').addEventListener('click', function () {
    var body = { name: $('g-name').value.trim(), nameKh: $('g-namekh').value.trim(), minSelect: Number($('g-min').value) || 0, maxSelect: Number($('g-max').value) || 1, required: $('g-required').checked, active: $('g-active').checked,
      addons: Array.prototype.map.call($('g-addons').children, function (row) {
        var f = function (n) { return row.querySelector('[data-f="' + n + '"]'); };
        var currency = f('currency').value;
        return { id: row.getAttribute('data-id') || undefined, name: f('name').value.trim(), nameKh: f('nameKh').value.trim(), price: Pos.parseMoney(f('price').value, currency), currency: currency };
      }).filter(function (a) { return a.name; }) };
    (state.group ? ui.api.put('addon-groups/' + encodeURIComponent(state.group.id), body) : ui.api.post('addon-groups', body)).then(function () { state.group = null; return done('Add-on group saved.'); }).catch(failed);
  });

  // ---------- import ----------
  $('csv').addEventListener('change', function () {
    var file = $('csv').files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      ui.api.post('menu/import', { csv: String(reader.result) }).then(function (r) {
        $('csv-result').textContent = r.created + ' items added.' + (r.problems.length ? '\n' + r.problems.join('\n') : '');
        return load();
      }).catch(failed);
    };
    reader.readAsText(file);
  });
  $('csv-template').addEventListener('click', function () { Pos.download('menu-template.csv', 'category,name,nameKh,price,currency,sku,barcode\nCoffee,Iced Latte,ឡាតេទឹកកក,2.50,USD,LAT-M,\nFood,Num Pang,នំបុ័ង,5000,KHR,,\n'); });

  ui.autoResize();
  ui.connect().then(load).then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
