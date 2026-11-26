/* Kitchen Display: open tickets for this station, oldest first, refreshed every 4 seconds. Tap an item to move it
 * on (new → preparing → ready → served); the big button moves the whole ticket. New tickets chime.
 * The station chosen is remembered on this device. Plugin API: GET kitchen/stations, GET kitchen/tickets,
 * POST kitchen/items/:id/status, POST kitchen/orders/:id/advance. */
(function () {
  'use strict';
  var Pos = window.Pos, ui = Pos.ui, $ = Pos.$, el = Pos.el;
  var NEXT = { NEW: 'PREPARING', PREPARING: 'READY', READY: 'SERVED' };
  var LABEL = { NEW: 'new', PREPARING: 'cooking', READY: 'ready' };
  var state = { station: '', seen: {}, sound: true, first: true };

  function minutes(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); }
  var STEP_SOUND = { PREPARING: 'cooking', READY: 'ready', SERVED: 'served' };
  function chime() { if (state.sound) Pos.sound('order'); }
  function stepSound(status) { if (state.sound && STEP_SOUND[status]) Pos.sound(STEP_SOUND[status]); }
  function load() {
    return ui.api.get('kitchen/tickets', state.station ? { stationId: state.station } : undefined).then(function (tickets) {
      var fresh = tickets.some(function (t) { return !state.seen[t.orderId] || t.items.some(function (i) { return !state.seen[i.id]; }); });
      if (fresh && !state.first) chime();
      state.first = false;
      state.seen = {}; tickets.forEach(function (t) { state.seen[t.orderId] = true; t.items.forEach(function (i) { state.seen[i.id] = true; }); });
      render(tickets); Pos.say('error', '');
    }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
  }
  function render(tickets) {
    var board = Pos.clear($('board'));
    if (!tickets.length) board.appendChild(el('p', { class: 'empty', text: 'No orders waiting · គ្មានការបញ្ជាទិញ' }));
    tickets.forEach(function (t) {
      var age = minutes(t.since), allReady = t.items.every(function (i) { return i.status === 'READY'; });
      var card = el('section', { class: 'ticket' + (allReady ? ' ready' : age >= 20 ? ' very-late' : age >= 10 ? ' late' : '') }, [
        el('header', {}, [el('span', { text: '#' + t.number }), el('span', { text: age + ' min' })]),
        el('div', { class: 'meta', text: [t.table ? 'Table ' + t.table : t.type === 'DELIVERY' ? 'Delivery' : 'Take away', t.note].filter(Boolean).join(' · ') }),
      ]);
      t.items.forEach(function (i) {
        card.appendChild(el('button', { type: 'button', class: 'item ' + i.status, onclick: function () {
          ui.api.post('kitchen/items/' + encodeURIComponent(i.id) + '/status', { status: NEXT[i.status] }).then(function (r) { stepSound(r.status); return load(); }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
        } }, [el('span', { class: 'q', text: i.quantity + '×' }), el('span', {}, [i.name + (i.variantName ? ' (' + i.variantName + ')' : ''), i.nameKh ? el('small', { class: 'kh', text: i.nameKh }) : null, i.addons.length ? el('small', { text: '+ ' + i.addons.join(', ') }) : null, i.note ? el('small', { text: '“' + i.note + '”' }) : null]), el('span', { class: 'st', text: LABEL[i.status] })]));
      });
      card.appendChild(el('button', { type: 'button', class: 'bump', onclick: function () {
        ui.api.post('kitchen/orders/' + encodeURIComponent(t.orderId) + '/advance', state.station ? { stationId: state.station } : {}).then(function (r) { stepSound(r.status); return load(); }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); });
      } }, [allReady ? '✓ Served' : t.items.some(function (i) { return i.status === 'NEW'; }) ? '🔥 Start' : '✓ Ready']));
      board.appendChild(card);
    });
  }
  $('station').addEventListener('change', function () { state.station = $('station').value; ui.storage.set('station', state.station).catch(function () {}); state.first = true; load(); });
  $('sound').addEventListener('click', function () { state.sound = !state.sound; Pos.setSound(state.sound); $('sound').textContent = state.sound ? '🔔 Sound on' : '🔕 Sound off'; ui.storage.set('sound', state.sound).catch(function () {}); if (state.sound) chime(); });
  function tick() { $('clock').textContent = Pos.time(new Date().toISOString()); }
  tick(); setInterval(tick, 1000);
  ui.autoResize();
  ui.connect().then(function () {
    return Promise.all([ui.api.get('kitchen/stations').catch(function () { return []; }), ui.storage.get('station').catch(function () { return ''; }), ui.storage.get('sound').catch(function () { return null; })]);
  }).then(function (r) {
    (r[0] || []).forEach(function (s) { $('station').appendChild(el('option', { value: s.id, text: s.name })); });
    if (r[2] === false) { state.sound = false; Pos.setSound(false); $('sound').textContent = '🔕 Sound off'; }
    state.station = r[1] && (r[0] || []).some(function (s) { return s.id === r[1]; }) ? r[1] : '';
    $('station').value = state.station;
    return load();
  }).catch(function (e) { Pos.say('error', Pos.errorText(e), 'bad'); }).then(function () { $('app').setAttribute('aria-busy', 'false'); });
  setInterval(load, 4000);
})();
