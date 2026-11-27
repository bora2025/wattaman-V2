/* Academic Years: Academic Management's own screen (0.17.0).
 * A year carries its dates, the school's name and logo; the score sheets, report cards, record books
 * and progress books of the year print them.
 * Plugin API used: GET study-years; POST study-years; PUT/DELETE study-years/:id;
 * POST study-years/:id/set-current. The logo is uploaded into the record (data:image) because plugin
 * screens cannot show images from web links. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var state = { years: [], editing: null, form: null, busy: false };

  function $(id) { return document.getElementById(id); }
  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attributes[key];
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), attributes[key]);
      else node.setAttribute(key, attributes[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }
  function rows(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  function day(value) { return value ? String(value).slice(0, 10) : ''; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function nice(value) { var v = day(value); if (!v) return ''; var p = v.split('-'); return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0]; }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function lengthText(a, b) {
    if (!a || !b || b < a) return '—';
    var n = daysBetween(a, b) + 1, months = Math.round(n / 30.44);
    return months >= 1 ? months + ' month' + (months === 1 ? '' : 's') : n + ' days';
  }
  function phase(item) {
    var s = day(item.startDate), e = day(item.endDate), t = today();
    if (!s || !e) return null;
    if (t < s) return 'next'; if (t > e) return 'past'; return 'now';
  }
  function progress(item) {
    var s = day(item.startDate), e = day(item.endDate), t = today();
    if (!s || !e || e <= s) return 0;
    if (t <= s) return 0; if (t >= e) return 100;
    return Math.round(daysBetween(s, t) / daysBetween(s, e) * 100);
  }
  function uploaded(value) { return /^data:image\//.test(String(value || '')); }
  function logoNode(value, fallback) {
    return uploaded(value) ? el('img', { src: value, alt: '' }) : document.createTextNode(fallback);
  }
  function current() { return state.years.filter(function (y) { return y.isCurrent; })[0] || null; }

  // ---------- the list ----------
  function renderList() {
    var list = $('list'); list.textContent = '';
    $('empty').hidden = state.years.length > 0;
    state.years.forEach(function (item) {
      var p = phase(item), classes = Number(item._count && item._count.classes || 0);
      var badge = item.isCurrent ? el('span', { class: 'badge now', text: '● Current' })
        : p === 'past' ? el('span', { class: 'badge past', text: 'Ended' })
        : p === 'next' ? el('span', { class: 'badge next', text: 'Upcoming' }) : null;
      var school = item.schoolName ? el('span', { text: item.schoolName, title: item.schoolName }) : el('span', { class: 'missing', text: 'No school name set' });
      var facts = [el('span', { text: '🏫 ' + classes + ' class' + (classes === 1 ? '' : 'es') }), el('span', { text: '⏱ ' + lengthText(day(item.startDate), day(item.endDate)) })];
      if (!uploaded(item.logoUrl)) facts.push(el('span', { class: 'warn', text: item.logoUrl ? 'Logo is a web link (not printed)' : 'No logo' }));
      var card = el('article', { class: 'year' + (item.isCurrent ? ' current' : ''), 'data-id': item.id }, [
        badge,
        el('div', { class: 'year-top' }, [
          el('div', { class: 'year-logo' }, [logoNode(item.logoUrl, '🎓')]),
          el('div', { class: 'year-title' }, [el('strong', { text: item.label || String(item.year) }), school]),
        ]),
        el('div', { class: 'dates' }, [
          el('span', { class: item.startDate ? '' : 'missing', text: item.startDate ? '▸ ' + nice(item.startDate) : 'No start date' }),
          el('span', { class: item.endDate ? '' : 'missing', text: item.endDate ? nice(item.endDate) + ' ◂' : 'No end date' }),
        ]),
        el('div', { class: 'bar', title: progress(item) + '% of the year' }, [el('i', { style: 'width:' + progress(item) + '%' })]),
        el('div', { class: 'facts' }, facts),
        el('div', { class: 'actions' }, [
          el('button', { type: 'button', class: 'edit', text: '✎ Edit', onclick: function () { openEditor(item); } }),
          item.isCurrent ? null : el('button', { type: 'button', class: 'make', text: '★ Set current', onclick: function () { setCurrent(item); } }),
          el('button', { type: 'button', class: 'del', text: 'Delete', disabled: classes > 0 ? 'disabled' : null, title: classes > 0 ? 'Move or delete its classes first' : 'Delete this academic year', onclick: function () { remove(item); } }),
        ]),
      ]);
      if (classes === 0) card.querySelector('.del').removeAttribute('disabled');
      list.appendChild(card);
    });
  }

  // ---------- the editor ----------
  function openEditor(item) {
    show('form-error');
    var base = current() || state.years[0] || {};
    if (item) {
      state.editing = item;
      state.form = { year: item.year, label: item.label || '', startDate: day(item.startDate), endDate: day(item.endDate), schoolName: item.schoolName || '', logoUrl: item.logoUrl || '' };
    } else {
      // A new year follows the latest one and keeps its school name and logo.
      var latest = state.years.reduce(function (max, y) { return Math.max(max, Number(y.year) || 0); }, 0);
      var year = latest ? latest + 1 : new Date().getFullYear();
      state.editing = null;
      state.form = { year: year, label: year + '-' + (year + 1), startDate: '', endDate: '', schoolName: base.schoolName || '', logoUrl: base.logoUrl || '' };
    }
    $('editor-title').textContent = item ? 'Edit academic year ' + (item.label || item.year) : 'New academic year';
    $('save').textContent = item ? 'Save changes' : 'Create academic year';
    $('f-year').value = state.form.year; $('f-label').value = state.form.label;
    $('f-start').value = state.form.startDate; $('f-end').value = state.form.endDate;
    $('f-school').value = state.form.schoolName;
    $('editor').hidden = false;
    renderForm();
    $('editor').scrollIntoView({ block: 'start', behavior: 'smooth' });
    $('f-year').focus();
  }
  function closeEditor() { $('editor').hidden = true; state.editing = null; state.form = null; }
  function readForm() {
    var f = state.form;
    f.year = $('f-year').value; f.label = $('f-label').value; f.startDate = $('f-start').value; f.endDate = $('f-end').value; f.schoolName = $('f-school').value;
  }
  function renderForm() {
    var f = state.form; if (!f) return;
    $('f-length').textContent = lengthText(f.startDate, f.endDate);
    $('f-label').placeholder = f.year ? f.year + '-' + (Number(f.year) + 1) : '2025-2026';
    var preview = $('f-logo-preview'); preview.textContent = ''; preview.appendChild(logoNode(f.logoUrl, '🏫'));
    $('logo-remove').hidden = !f.logoUrl;
    $('logo-pick').textContent = f.logoUrl ? '📷 Change logo' : '📷 Upload logo';
    $('logo-note').className = 'hint';
    $('logo-note').textContent = f.logoUrl && !uploaded(f.logoUrl)
      ? '⚠ The saved logo is a web link, which documents cannot show. Upload the image file instead.'
      : uploaded(f.logoUrl) ? '✓ Uploaded (' + Math.max(1, Math.round(f.logoUrl.length * 0.75 / 1024)) + ' KB)' : 'PNG or JPG. It is made small automatically and printed on the documents.';
    var dl = $('dp-logo'); dl.textContent = ''; if (uploaded(f.logoUrl)) dl.appendChild(el('img', { src: f.logoUrl, alt: '' }));
    $('dp-school').textContent = f.schoolName.trim() || 'School name';
    $('dp-school').className = 'dp-school' + (f.schoolName.trim() ? '' : ' placeholder');
    $('dp-year').textContent = 'ឆ្នាំសិក្សា ' + (f.label.trim() || (f.year ? f.year + '-' + (Number(f.year) + 1) : ''));
  }
  function validate(f) {
    var year = Number(f.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) return 'Year must be between 2020 and 2100.';
    if (!f.startDate || !f.endDate) return 'Set the start and end dates.';
    if (f.startDate > f.endDate) return 'The end date must be on or after the start date.';
    var clash = state.years.filter(function (y) { return Number(y.year) === year && (!state.editing || y.id !== state.editing.id); })[0];
    if (clash) return 'Academic year ' + year + ' already exists.';
    return '';
  }
  function save(event) {
    event.preventDefault();
    if (state.busy) return;
    readForm();
    var f = state.form, problem = validate(f);
    if (problem) { show('form-error', problem); return; }
    var body = { year: Number(f.year), label: f.label.trim(), startDate: f.startDate, endDate: f.endDate, schoolName: f.schoolName.trim(), logoUrl: f.logoUrl || '' };
    var editing = state.editing;
    state.busy = true; $('save').disabled = true; show('form-error');
    var call = editing ? ui.api.put('study-years/' + encodeURIComponent(editing.id), body) : ui.api.post('study-years', body);
    call.then(function () {
      closeEditor();
      flash(editing ? 'Academic year saved' : 'Academic year created');
      return load();
    }).catch(function (error) { show('form-error', error.message || 'The academic year could not be saved.'); })
      .then(function () { state.busy = false; $('save').disabled = false; });
  }
  function setCurrent(item) {
    if (!window.confirm('Make ' + (item.label || item.year) + ' the current academic year?')) return;
    ui.api.post('study-years/' + encodeURIComponent(item.id) + '/set-current', {})
      .then(function () { flash((item.label || item.year) + ' is now the current year'); return load(); })
      .catch(function (error) { show('error', error.message || 'Could not set the current year.'); });
  }
  function remove(item) {
    if (!window.confirm('Delete academic year ' + (item.label || item.year) + '? This cannot be undone.')) return;
    ui.api.delete('study-years/' + encodeURIComponent(item.id))
      .then(function () { if (state.editing && state.editing.id === item.id) closeEditor(); flash('Academic year deleted'); return load(); })
      .catch(function (error) { show('error', error.message || 'The academic year could not be deleted.'); });
  }
  var flashTimer = null;
  function flash(text) { show('error'); show('notice', text); clearTimeout(flashTimer); flashTimer = setTimeout(function () { show('notice'); }, 4000); }

  function load() {
    return ui.api.get('study-years').then(function (result) {
      state.years = rows(result).slice().sort(function (a, b) { return Number(b.year) - Number(a.year); });
      renderList();
    });
  }

  $('add-year').addEventListener('click', function () { openEditor(null); });
  $('close-editor').addEventListener('click', closeEditor);
  $('cancel').addEventListener('click', closeEditor);
  $('year-form').addEventListener('submit', save);
  ['f-year', 'f-label', 'f-start', 'f-end', 'f-school'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      if (!state.form) return;
      readForm();
      // The label follows the year until it is typed by hand.
      if (id === 'f-year' && (!$('f-label').dataset.typed)) { var y = Number($('f-year').value); $('f-label').value = y ? y + '-' + (y + 1) : ''; readForm(); }
      if (id === 'f-label') $('f-label').dataset.typed = $('f-label').value ? '1' : '';
      // The end date defaults to the day before the same date a year later.
      if (id === 'f-start' && state.form.startDate && !$('f-end').value) {
        var d = new Date(state.form.startDate + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + 1); d.setUTCDate(d.getUTCDate() - 1);
        $('f-end').value = d.toISOString().slice(0, 10); readForm();
      }
      renderForm();
    });
  });
  $('logo-pick').addEventListener('click', function () { $('logo-file').click(); });
  $('logo-file').addEventListener('change', function () {
    var file = $('logo-file').files && $('logo-file').files[0]; $('logo-file').value = '';
    if (!file || !state.form) return;
    $('logo-note').textContent = 'Preparing…';
    window.WattanamPhoto.shrink(file).then(function (data) { state.form.logoUrl = data; renderForm(); })
      .catch(function (error) { $('logo-note').className = 'hint'; $('logo-note').textContent = '⚠ ' + error.message; });
  });
  $('logo-remove').addEventListener('click', function () { if (state.form) { state.form.logoUrl = ''; renderForm(); } });

  ui.autoResize();
  ui.connect().then(function (context) {
    return load().then(function () {
      // The old edit route (study-years/edit/:id) opens the year's editor.
      var wanted = String((context.params && context.params.id) || (context.query && context.query.edit) || '');
      var row = state.years.filter(function (item) { return item.id === wanted; })[0];
      if (row) openEditor(row);
    });
  })
    .catch(function (error) { show('error', error.message || 'Academic years could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
