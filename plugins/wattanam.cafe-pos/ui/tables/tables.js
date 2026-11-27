/* Tables: the floor plan with what is happening at each table (free, eating, food ready), refreshed every 10 s.
 * Tap a table to take its order at the counter. Managers arrange the plan: add, rename, drag to place.
 * Plugin API: GET settings, GET tables, POST tables, PUT tables/:id. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el;
  var state = { s: null, tables: [], editing: false, chosen: null, perms: [] };
  function can(p) { return !state.perms.length || state.perms.indexOf('wattanam.cafe-pos.' + p) >= 0; }
  // a ding when a table's food becomes ready (compared with the last refresh)
  function load() { return ui.api.get('tables').then(function (rows) {
    var before = {}; state.tables.forEach(function (t) { before[t.id] = t.order ? t.order.ready : 0; });
    if (state.tables.length && rows.some(function (t) { return t.order && t.order.ready > (before[t.id] || 0); })) Pos.sound('ready');
    state.tables = rows; render(); }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); }); }
  function render() {
    var floor = Pos.clear($('floor'));
    floor.className = 'floor' + (state.editing ? ' editing' : '');
    if (!state.tables.length) floor.appendChild(el('p', { class: 'empty', text: can('tables') ? 'No tables yet: choose “Arrange tables” to add them.' : 'No tables yet.' }));
    state.tables.forEach(function (t) {
      var o = t.order;
      var node = el('div', { class: 'tbl ' + t.shape + (o ? (o.ready ? ' ready' : ' busy') : ''), style: 'left:' + t.x + 'px;top:' + t.y + 'px', role: 'button', tabindex: '0', 'data-table': t.id }, [
        el('span', { text: t.name }),
        el('small', { text: o ? Pos.fmt(o.total, state.s.baseCurrency) + ' · ' + Math.floor((Date.now() - new Date(o.since).getTime()) / 60000) + ' min' : t.seats + ' seats' }),
      ]);
      if (state.editing) drag(node, t); else node.addEventListener('click', function () { ui.navigate('waiter', { tableId: t.id }); });
      floor.appendChild(node);
    });
  }
  // placing a table by dragging (pointer events: mouse, pen, finger)
  function drag(node, t) {
    var start = null;
    node.addEventListener('pointerdown', function (event) { start = { x: event.clientX, y: event.clientY, left: t.x, top: t.y, moved: false }; node.setPointerCapture(event.pointerId); });
    node.addEventListener('pointermove', function (event) {
      if (!start) return;
      var dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) start.moved = true;
      t.x = Math.max(0, Math.min(1900, Math.round((start.left + dx) / 10) * 10)); t.y = Math.max(0, Math.min(1900, Math.round((start.top + dy) / 10) * 10));
      node.style.left = t.x + 'px'; node.style.top = t.y + 'px';
    });
    node.addEventListener('pointerup', function () {
      if (!start) return;
      var moved = start.moved; start = null;
      if (moved) save(t).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
      else choose(t);
    });
  }
  function save(t) { return ui.api.put('tables/' + encodeURIComponent(t.id), { name: t.name, seats: t.seats, area: t.area, x: t.x, y: t.y, shape: t.shape, active: t.active !== false }); }
  function choose(t) {
    state.chosen = t;
    $('t-name').value = t.name; $('t-seats').value = t.seats; $('t-area').value = t.area || ''; $('t-shape').value = t.shape;
    $('t-save').textContent = 'Save'; $('t-remove').hidden = false;
  }
  $('t-save').addEventListener('click', function () {
    var body = { name: $('t-name').value.trim(), seats: Number($('t-seats').value), area: $('t-area').value.trim(), shape: $('t-shape').value };
    var t = state.chosen;
    var p = t ? save(Object.assign(t, body)) : ui.api.post('tables', Object.assign(body, { x: 20 + (state.tables.length % 8) * 110, y: 20 + Math.floor(state.tables.length / 8) * 100 }));
    p.then(function () { state.chosen = null; $('t-name').value = ''; $('t-save').textContent = 'Add table'; $('t-remove').hidden = true; return load(); }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
  });
  $('t-remove').addEventListener('click', function () {
    var t = state.chosen; if (!t) return;
    if (t.order) { Pos.say('error', 'Table ' + t.name + ' has an open order.', 'bad'); return; }
    if (!window.confirm('Remove table ' + t.name + '?')) return;
    t.active = false; save(t).then(function () { state.chosen = null; $('t-remove').hidden = true; $('t-save').textContent = 'Add table'; return load(); }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
  });
  $('edit').addEventListener('click', function () { state.editing = true; $('editor').hidden = false; render(); });
  $('t-done').addEventListener('click', function () { state.editing = false; state.chosen = null; $('editor').hidden = true; render(); });
  ui.autoResize();
  ui.connect().then(function (context) {
    state.perms = (context && context.permissions) || [];
    $('edit').hidden = !can('tables');
    return ui.api.get('settings').then(function (s) { state.s = s; Pos.setSound(s.sounds); return load(); });
  }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); }).then(function () { $('app').setAttribute('aria-busy', 'false'); });
  setInterval(function () { if (!state.editing) load(); }, 10000);
})();
