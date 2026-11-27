/* Face Enrolment: consent first, then three face samples taken by the school page's face station (only
 * face vectors reach this screen), with a head turn to prove a live person. Withdrawing consent deletes
 * the face at once. Plugin API: GET faces/people, GET faces/coverage, POST faces/consents,
 * POST faces/consents/:id/withdraw, POST faces/samples, DELETE faces/samples/:personId. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var MANAGE = 'wattanam.smart-attendance.faces.manage';
  var state = { people: [], chosen: null, timer: null, canManage: false };

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') node.textContent = attrs[k]; else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]); else node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function say(id, text) { $(id).textContent = text || ''; $(id).hidden = !text; }
  function clear() { say('message'); say('warning'); say('error'); }
  function day(iso) { return iso ? new Date(iso).toLocaleDateString() : ''; }
  function nameOf(p) { return p.nameKh || p.name; }

  function loadCoverage() {
    return ui.api.get('faces/coverage').then(function (rows) {
      var body = $('coverage'); body.textContent = '';
      if (!rows.length) body.appendChild(el('tr', {}, [el('td', { colspan: '5', class: 'empty', text: 'No classes with students yet.' })]));
      rows.forEach(function (c) {
        var share = c.students ? Math.round(c.enrolled * 100 / c.students) : 0;
        body.appendChild(el('tr', {}, [el('td', { text: c.name }), el('td', { text: String(c.students) }), el('td', { text: String(c.consents) }), el('td', { text: c.enrolled + ' (' + share + '%)' }),
          el('td', {}, [el('div', { class: 'bar' }, [el('span', { style: 'width:' + share + '%' })])])]));
      });
    });
  }
  function renderPeople() {
    var host = $('people'); host.textContent = '';
    if (!state.people.length) host.appendChild(el('p', { class: 'empty', text: 'No student found.' }));
    state.people.forEach(function (p) {
      var badge = p.reenrol ? ['warn', '🔄 Enrol again'] : p.samples ? ['ok', '🙂 Enrolled'] : p.consent ? ['warn', 'Consent, no face'] : ['', 'No consent'];
      host.appendChild(el('button', { type: 'button', class: 'person', 'data-person': p.id, 'aria-pressed': String(Boolean(state.chosen && state.chosen.id === p.id)), onclick: function () { clear(); choose(p); } }, [
        el('span', {}, [el('span', { class: 'kh', text: nameOf(p) }), el('br'), el('small', { class: 'muted', text: [p.number, p.className].filter(Boolean).join(' · ') })]),
        el('span', { class: 'badge ' + badge[0], text: badge[1] }),
      ]));
    });
  }
  function choose(p) {
    state.chosen = p; renderPeople();
    $('chosen-panel').hidden = false;
    $('chosen').textContent = nameOf(p);
    $('chosen-meta').textContent = [p.number ? 'ID ' + p.number : '', p.className].filter(Boolean).join(' · ');
    $('consent-form').hidden = Boolean(p.consent);
    $('consent-info').hidden = !p.consent;
    if (p.consent) {
      $('consent-text').textContent = 'Given by ' + p.consent.givenBy + ' (' + p.consent.relation + ') on ' + day(p.consent.givenAt) + ' · ' + (p.consent.method === 'PAPER' ? 'signed paper form' : 'digital') + (p.consent.documentRef ? ' · ' + p.consent.documentRef : '');
      $('face-text').textContent = p.reenrol ? 'Enrolled with an older face model: enrol again so face attendance recognises them.'
        : p.samples ? 'Enrolled on ' + day(p.enrolledAt) + ' (' + p.samples + ' samples). Enrolling again replaces it; do it once a year, as faces change.' : 'Not enrolled yet.';
      $('enrol').textContent = p.samples ? '🙂 Enrol again' : '🙂 Enrol the face';
      $('delete-face').hidden = !(state.canManage && p.samples);
      $('withdraw').hidden = !state.canManage;
    } else {
      $('c-by').value = ''; $('c-ref').value = ''; $('c-note').value = '';
      setTimeout(function () { $('c-by').focus(); }, 0);
    }
  }
  function search() {
    return ui.api.get('faces/people', { search: $('search').value.trim() }).then(function (rows) {
      state.people = rows || [];
      if (state.chosen) { var again = state.people.filter(function (p) { return p.id === state.chosen.id; })[0]; if (again) choose(again); else renderPeople(); }
      else renderPeople();
    }).catch(function (e) { say('error', e.message || 'Students could not be loaded.'); });
  }
  function refresh() { return Promise.all([search(), loadCoverage().catch(function () {})]); }

  $('consent-form').addEventListener('submit', function (event) {
    event.preventDefault(); clear();
    var p = state.chosen; if (!p) return;
    ui.api.post('faces/consents', { personId: p.id, givenBy: $('c-by').value.trim(), relation: $('c-relation').value, method: $('c-method').value, documentRef: $('c-ref').value.trim(), note: $('c-note').value.trim() })
      .then(function () { say('message', 'Consent recorded for ' + nameOf(p) + '. You can enrol the face now.'); return refresh(); })
      .catch(function (e) { say('error', e.message || 'The consent could not be saved.'); });
  });
  $('enrol').addEventListener('click', function () {
    var p = state.chosen; if (!p) return;
    clear();
    ui.face.start({
      mode: 'enroll', title: 'Enrol ' + nameOf(p), liveness: true, samples: 3,
      onResult: function (r) {
        ui.face.feedback('info', 'Saving…');
        ui.api.post('faces/samples', { personId: p.id, descriptors: r.descriptors, liveness: r.liveness, quality: r.quality, modelVersion: r.modelVersion })
          .then(function (saved) {
            ui.face.feedback('success', '✓ ' + nameOf(p) + ' is enrolled');
            say('message', '✓ ' + nameOf(p) + '’s face is enrolled (' + saved.samples + ' samples).');
            if (saved.warning) say('warning', saved.warning);
            setTimeout(function () { ui.face.stop(); }, 1500);
            return refresh();
          })
          .catch(function (e) { ui.face.feedback('error', e.message || 'Not saved'); say('error', e.message || 'The face could not be saved.'); });
      },
      onError: function (message) { say('error', message || 'The face camera could not start.'); },
    });
  });
  $('delete-face').addEventListener('click', function () {
    var p = state.chosen; if (!p || !window.confirm('Delete ' + nameOf(p) + '’s face? Face attendance stops working for them until they are enrolled again.')) return;
    clear();
    ui.api.delete('faces/samples/' + encodeURIComponent(p.id)).then(function () { say('message', nameOf(p) + '’s face is deleted.'); return refresh(); })
      .catch(function (e) { say('error', e.message || 'The face could not be deleted.'); });
  });
  $('withdraw').addEventListener('click', function () {
    var p = state.chosen; if (!p || !p.consent || !window.confirm('Withdraw the consent for ' + nameOf(p) + '? Their face is deleted at once.')) return;
    clear();
    ui.api.post('faces/consents/' + encodeURIComponent(p.consent.id) + '/withdraw', {})
      .then(function (r) { say('message', 'Consent withdrawn; ' + r.deletedSamples + ' face sample(s) deleted.'); return refresh(); })
      .catch(function (e) { say('error', e.message || 'The consent could not be withdrawn.'); });
  });
  $('search').addEventListener('input', function () { clearTimeout(state.timer); state.timer = setTimeout(search, 250); });

  ui.autoResize();
  ui.connect().then(function (context) {
    var granted = context && context.permissions;
    state.canManage = !Array.isArray(granted) || granted.indexOf(MANAGE) >= 0;
    return refresh();
  }).catch(function (e) { say('error', e.message || 'The page could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
