/* NFC Cards: find a student, tap a card on a USB reader (it types the card number and Enter), done.
 * One card in use per student: a new card replaces the old one. Lost / returned cards stop working.
 * Plugin API: GET people, GET cards, POST cards, PUT cards/:id. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var state = { people: [], chosen: null, timer: null };
  var STATUS = { ACTIVE: ['ok', 'In use'], LOST: ['bad', 'Lost'], REPLACED: ['', 'Replaced'], RETURNED: ['', 'Returned'] };

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') node.textContent = attrs[k]; else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]); else node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function say(id, text) { $(id).textContent = text || ''; $(id).hidden = !text; }
  function day(iso) { return iso ? new Date(iso).toLocaleDateString() : ''; }

  function renderPeople() {
    var host = $('people'); host.textContent = '';
    $('people-note').textContent = state.people.length >= 60 ? 'Showing the first 60; type more of the name to narrow it down.' : '';
    if (!state.people.length) host.appendChild(el('p', { class: 'empty', text: 'No student found.' }));
    state.people.forEach(function (p) {
      host.appendChild(el('button', { type: 'button', class: 'person', 'data-person': p.id, 'aria-pressed': String(Boolean(state.chosen && state.chosen.id === p.id)), onclick: function () { choose(p); } }, [
        el('span', {}, [el('span', { class: 'kh', text: p.nameKh || p.name }), el('br'), el('small', { class: 'muted', text: [p.number, p.className].filter(Boolean).join(' · ') })]),
        el('span', { class: 'badge' + (p.card ? ' ok' : ''), text: p.card ? '📶 …' + p.card.last4 : 'No card' }),
      ]));
    });
  }
  // keep: after a save the list refreshes and the student stays chosen, with the success message kept
  function choose(p, keep) {
    state.chosen = p; renderPeople(); if (!keep) { say('message'); say('error'); }
    $('issue').hidden = false;
    $('chosen').textContent = (p.nameKh || p.name) + ' · ' + [p.number, p.className].filter(Boolean).join(' · ');
    $('current-card').textContent = p.card ? 'Card in use: …' + p.card.last4 + ' since ' + day(p.card.issuedAt) + '. A new card replaces it.' : 'No card yet.';
    $('lost').hidden = !p.card; $('returned').hidden = !p.card;
    $('uid').value = ''; $('uid').focus();
  }
  function searchPeople() {
    return ui.api.get('people', { search: $('search').value.trim() }).then(function (rows) {
      state.people = rows || [];
      if (state.chosen) state.chosen = state.people.filter(function (p) { return p.id === state.chosen.id; })[0] || state.chosen;
      renderPeople();
    }).catch(function (e) { say('error', e.message || 'Students could not be loaded.'); });
  }
  function loadCards() {
    var status = $('filter').value;
    return ui.api.get('cards', status ? { status: status } : {}).then(function (rows) {
      var body = $('cards'); body.textContent = '';
      if (!rows.length) body.appendChild(el('tr', {}, [el('td', { colspan: '5', class: 'empty', text: 'No cards.' })]));
      rows.forEach(function (c) {
        var s = STATUS[c.status] || ['', c.status];
        body.appendChild(el('tr', {}, [
          el('td', { class: 'kh', text: c.person ? (c.person.nameKh || c.person.name) + (c.person.number ? ' · ' + c.person.number : '') : '—' }),
          el('td', { text: c.person ? c.person.className : '' }), el('td', { text: '…' + c.last4 }),
          el('td', {}, [el('span', { class: 'badge ' + s[0], text: s[1] })]), el('td', { text: day(c.endedAt || c.issuedAt) }),
        ]));
      });
    }).catch(function (e) { say('error', e.message || 'Cards could not be loaded.'); });
  }
  function refresh() { return Promise.all([searchPeople(), loadCards()]).then(function () { if (state.chosen) choose(state.chosen, true); }); }

  $('tap-form').addEventListener('submit', function (event) { event.preventDefault(); });
  $('uid').addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || !state.chosen) return;
    event.preventDefault();
    var uid = $('uid').value.trim(); $('uid').value = '';
    if (!uid) return;
    say('error'); say('message');
    var who = state.chosen.nameKh || state.chosen.name;
    ui.api.post('cards', { personId: state.chosen.id, uid: uid }).then(function (card) {
      say('message', card.unchanged ? 'This card is already ' + who + '’s card.' : '✓ Card …' + card.last4 + ' now belongs to ' + who + '.');
      return refresh();
    }).catch(function (e) { say('error', e.message || 'The card could not be saved.'); $('uid').focus(); });
  });
  function end(status) {
    var p = state.chosen; if (!p || !p.card) return;
    if (!window.confirm((status === 'LOST' ? 'Mark card …' : 'Mark as returned card …') + p.card.last4 + ' of ' + (p.nameKh || p.name) + '? It stops working at once.')) return;
    ui.api.put('cards/' + encodeURIComponent(p.card.id), { status: status })
      .then(function () { say('message', 'Card …' + p.card.last4 + (status === 'LOST' ? ' is marked lost.' : ' is marked returned.')); return refresh(); })
      .catch(function (e) { say('error', e.message || 'The card could not be changed.'); });
  }
  $('lost').addEventListener('click', function () { end('LOST'); });
  $('returned').addEventListener('click', function () { end('RETURNED'); });
  $('search').addEventListener('input', function () { clearTimeout(state.timer); state.timer = setTimeout(searchPeople, 250); });
  $('filter').addEventListener('change', loadCards);

  ui.autoResize();
  ui.connect().then(refresh)
    .catch(function (e) { say('error', e.message || 'The cards could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
