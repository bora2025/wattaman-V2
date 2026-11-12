/* ID Cards: the plugin's own screen (it used to be built into the school core). Runs in the core's
 * sandboxed plugin frame and talks to this plugin's API only. The page's <body> says which cards it
 * shows and which of the plugin's API routes to use:
 *   data-mode="student|staff"  data-organization="true" (workforce wording)
 *   data-people (staff list)   data-template / data-save-template
 *   data-classes  data-years  data-students  data-ensure   (student mode; ":classId" is replaced)
 * QR codes are drawn with ui/vendor/qrcode.js (MIT). */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var config = document.body.dataset;
  var mode = config.mode === 'staff' ? 'staff' : 'student';
  var organization = config.organization === 'true';
  var STUDENT_PRESETS = [
    { id: 'classic-orange', name: 'Orange Scholar', primaryColor: '#ea580c', accentColor: '#f97316', cardSize: 'cr80-portrait' },
    { id: 'green-academy', name: 'Green Academy', primaryColor: '#047857', accentColor: '#16a34a', cardSize: 'cr80-portrait' },
    { id: 'heritage-red', name: 'Heritage Red', primaryColor: '#991b1b', accentColor: '#dc2626', cardSize: 'cr80-landscape' },
    { id: 'public-green', name: 'Public Green', primaryColor: '#166534', accentColor: '#22c55e', cardSize: 'cr80-landscape' },
    { id: 'royal-blue', name: 'Royal Blue', primaryColor: '#1e3a8a', accentColor: '#2563eb', cardSize: 'cr80-portrait' },
    { id: 'modern-violet', name: 'Modern Violet', primaryColor: '#5b21b6', accentColor: '#db2777', cardSize: 'cr80-portrait' },
    { id: 'teal-wave', name: 'Teal Wave', primaryColor: '#0f766e', accentColor: '#06b6d4', cardSize: 'cr80-landscape' },
    { id: 'gold-prestige', name: 'Gold Prestige', primaryColor: '#78350f', accentColor: '#d97706', cardSize: 'cr80-landscape' },
    { id: 'sky-minimal', name: 'Sky Minimal', primaryColor: '#0369a1', accentColor: '#38bdf8', cardSize: 'cr80-portrait' },
    { id: 'charcoal-pro', name: 'Charcoal Pro', primaryColor: '#111827', accentColor: '#f59e0b', cardSize: 'cr80-landscape' },
  ];
  var STAFF_PRESETS = [
    { id: 'staff-geometric-mint', name: 'Geometric Mint', description: 'Bold office employee portrait', primaryColor: '#164e3f', accentColor: '#3b9478', cardSize: 'cr80-portrait' },
    { id: 'staff-olive-modern', name: 'Olive Modern', description: 'Rounded professional identity card', primaryColor: '#52683c', accentColor: '#a6c46a', cardSize: 'cr80-portrait' },
    { id: 'staff-dual-cream', name: 'Cream Front & Back', description: 'Two-sided member card with QR back', primaryColor: '#292524', accentColor: '#d6b56f', cardSize: 'cr80-portrait' },
  ];
  var DEFAULTS = {
    student: { schoolName: 'Wattanam School', cardTitle: 'Student Identification Card', logoUrl: '', cardSize: 'cr80-portrait', designPreset: 'classic-orange', primaryColor: '#ea580c', accentColor: '#f97316', footerText: 'Scan QR code for attendance', extraInfo: '', showPhone: true, showEmail: false, showAddress: true, showDateOfBirth: true },
    staff: { schoolName: 'Wattanam School', cardTitle: 'Office Employee ID Card', logoUrl: '', cardSize: 'cr80-portrait', designPreset: 'staff-geometric-mint', primaryColor: '#164e3f', accentColor: '#3b9478', footerText: 'Official staff attendance card', extraInfo: '', showPhone: true, showEmail: true, showAddress: false, showDateOfBirth: false },
  };
  var TOGGLES = [['showPhone', 'Phone'], ['showEmail', 'Email'], ['showAddress', 'Address'], ['showDateOfBirth', 'Date of birth']];
  var LOGO_EDGE = 256;           // logos are scaled down so the template fits a bridge request
  var LOGO_MAX_CHARS = 180000;

  function defaultTemplate() {
    var base = Object.assign({}, DEFAULTS[mode]);
    if (organization && mode === 'staff') { base.schoolName = 'Organization'; base.cardTitle = 'Workforce Identification Card'; base.footerText = 'Official workforce attendance card'; }
    return base;
  }
  var state = { classes: [], years: [], staff: [], students: [], yearId: '', classId: '', query: '', busy: false, samples: false, template: defaultTemplate() };
  var qrCache = {};

  function $(id) { return document.getElementById(id); }
  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attributes[key];
      else if (key === 'style') Object.keys(attributes.style).forEach(function (name) { if (name.indexOf('--') === 0) node.style.setProperty(name, attributes.style[name]); else node.style[name] = attributes.style[name]; });
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), attributes[key]);
      else node.setAttribute(key, attributes[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }
  function rows(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  function route(template, params) { return String(template || '').replace(/:([a-zA-Z][a-zA-Z0-9_]*)/g, function (_, key) { return encodeURIComponent((params || {})[key] || ''); }); }
  function personName(person) { return person.nameKh || person.name || (person.user && person.user.name) || 'Unnamed'; }
  function displayDate(value) { var match = String(value || '').match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}/); return match ? match[0] : String(value || ''); }
  function numberOf(person) { return person.studentNumber || person.employeeNumber || String(person.id || '').slice(0, 8); }
  function word() { return mode === 'staff' ? 'Staff' : 'Student'; }

  // A PNG data URL of the QR code for `text` ('' when it cannot be drawn).
  function qrImage(text) {
    if (!text) return '';
    if (qrCache[text] !== undefined) return qrCache[text];
    var result = '';
    try {
      var code = window.qrcode(0, 'M');
      code.addData(String(text)); code.make();
      var count = code.getModuleCount(), margin = 1, scale = Math.max(4, Math.floor(320 / (count + margin * 2)));
      var size = (count + margin * 2) * scale;
      var canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      var context = canvas.getContext('2d');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, size); context.fillStyle = '#000000';
      for (var row = 0; row < count; row += 1) for (var column = 0; column < count; column += 1) if (code.isDark(row, column)) context.fillRect((column + margin) * scale, (row + margin) * scale, scale, scale);
      result = canvas.toDataURL('image/png');
    } catch (error) { result = ''; }
    qrCache[text] = result;
    return result;
  }

  // A portrait when the school can serve it to the sandbox, otherwise the first letter of the name.
  function photoNode(person, template) {
    var holder = el('div', { class: 'id-card-photo', style: { borderColor: template.primaryColor, color: template.primaryColor } });
    var url = person.photoUrl || person.photo || (person.user && person.user.photo) || '';
    var letter = document.createTextNode(personName(person).charAt(0));
    if (!url) { holder.appendChild(letter); return holder; }
    var image = el('img', { alt: '' });
    image.onerror = function () { holder.textContent = ''; holder.appendChild(letter); };
    image.setAttribute('src', url);
    holder.appendChild(image);
    return holder;
  }
  function line(label, value, className) {
    var paragraph = el('p', className ? { class: className } : {}, [el('b', { text: label + ':' })]);
    paragraph.appendChild(document.createTextNode(' ' + value));
    return paragraph;
  }
  function logoNode(template, alt) { return template.logoUrl ? el('img', { class: 'id-card-logo', src: template.logoUrl, alt: alt }) : null; }

  function card(person, subtitle, year) {
    var template = state.template;
    var qr = qrImage(person.qrCode || '');
    var number = numberOf(person);
    var phone = (person.user && person.user.phone) || person.phone;
    var email = (person.user && person.user.email) || person.email;
    var landscape = template.cardSize === 'cr80-landscape';
    var hasBack = template.designPreset === 'staff-dual-cream';
    var department = person.department && (person.department.nameKh || person.department.name);

    var details = el('div', { class: 'id-card-details' }, [
      el('h2', { text: personName(person) }),
      el('p', { class: 'id-card-number', style: { color: template.primaryColor }, text: 'ID: ' + number }),
      el('p', { class: 'id-card-role', style: { color: template.accentColor }, text: subtitle }),
      department ? line('Department', department) : null,
      year ? line('Study year', year) : null,
      template.showDateOfBirth && person.dateOfBirth ? line('Date of birth', displayDate(person.dateOfBirth)) : null,
      template.showPhone && phone ? line('Phone', phone) : null,
      template.showEmail && email ? line('Email', email, 'id-card-ellipsis') : null,
      template.showAddress && person.address ? line('Address', person.address, 'id-card-ellipsis') : null,
      template.extraInfo ? el('p', { class: 'id-card-extra', text: template.extraInfo }) : null,
    ]);
    var qrNode = qr ? el('img', { class: 'id-card-qr', src: qr, alt: 'Attendance QR for ' + personName(person) }) : el('div', { class: 'id-card-qr-missing', text: 'QR missing' });
    var front = el('article', { class: 'id-card-face preset-' + template.designPreset, style: { borderColor: template.primaryColor, '--staff-accent': template.accentColor } }, [
      el('header', { class: 'id-card-header', style: { background: 'linear-gradient(110deg, ' + template.primaryColor + ', ' + template.accentColor + ')' } }, [
        logoNode(template, template.schoolName + ' logo'),
        el('span', { style: { minWidth: '0' } }, [el('strong', { text: template.schoolName }), el('small', { text: template.cardTitle })]),
      ]),
      el('div', { class: 'id-card-body' }, [
        photoNode(person, template), details,
        el('div', { class: 'id-card-qr-wrap' }, [qrNode, el('span', { text: 'SCAN TO ATTEND' })]),
        el('p', { class: 'id-card-footer', style: { color: template.primaryColor }, text: template.footerText }),
      ]),
    ]);
    var sides = [front];
    if (hasBack) {
      sides.push(el('article', { class: 'id-card-face id-card-back preset-staff-dual-cream', style: { borderColor: template.primaryColor } }, [
        el('header', { class: 'id-card-back-header' }, [logoNode(template, ''), el('strong', { text: template.schoolName })]),
        el('div', { class: 'id-card-back-body' }, [
          el('h3', { text: personName(person) }), el('p', { text: subtitle }),
          el('div', { class: 'id-card-back-qr' }, [qr ? el('img', { src: qr, alt: 'Attendance QR for ' + personName(person) }) : el('span', { text: 'QR identifier missing' })]),
          el('strong', { text: 'SCAN FOR ATTENDANCE' }),
          phone ? el('p', { text: phone }) : null, email ? el('p', { text: email }) : null,
          template.extraInfo ? el('p', { text: template.extraInfo }) : null,
          el('small', { text: 'ID No. ' + number }),
        ]),
      ]));
    }
    var download = el('button', { type: 'button', text: '↓ QR PNG', onclick: function () {
      if (!qr) return;
      var anchor = el('a', { href: qr, download: number + '-attendance-qr.png' });
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    } });
    download.disabled = !qr;
    return el('div', { class: 'id-card-item ' + (landscape ? 'is-landscape' : 'is-portrait') + (hasBack ? ' has-back' : '') }, [
      el('div', { class: 'id-card-sides' }, sides),
      el('div', { class: 'id-card-actions' }, [download, el('button', { type: 'button', text: 'Print / PDF', style: { color: template.primaryColor }, onclick: function () { window.print(); } })]),
    ]);
  }

  function samplePeople() {
    var list = [];
    for (var index = 0; index < 10; index += 1) {
      var n = index + 1;
      list.push({
        id: 'sample-' + mode + '-' + n, name: word() + ' Sample ' + n, nameKh: index < 5 ? 'គំរូ ' + n : undefined,
        studentNumber: mode === 'student' ? 'STU-' + ('000' + n).slice(-4) : undefined, employeeNumber: mode === 'staff' ? 'EMP-' + ('00' + n).slice(-3) : undefined,
        position: mode === 'staff' ? ['Teacher', 'Administrator', 'Accountant', 'Librarian'][index % 4] : undefined,
        phone: '012 345 ' + (670 + index), email: 'sample' + n + '@school.edu',
        dateOfBirth: mode === 'student' ? '201' + (index % 6) + '-0' + ((index % 9) + 1) + '-15' : undefined, address: 'Phnom Penh, Cambodia', qrCode: 'wattanam:' + mode + ':sample-' + n,
      });
    }
    return list;
  }

  function selectedClass() { return state.classes.filter(function (item) { return item.id === state.classId; })[0]; }
  function selectedYear() { var chosen = selectedClass(); var id = (chosen && chosen.studyYearId) || state.yearId; return state.years.filter(function (item) { return item.id === id; })[0]; }
  function visibleClasses() { return state.classes.filter(function (item) { return !state.yearId || item.studyYearId === state.yearId; }); }
  function people() {
    var query = state.query.toLowerCase();
    var live = state.samples ? samplePeople() : mode === 'staff' ? state.staff : state.students;
    return live.filter(function (item) { return (personName(item) + ' ' + (item.studentNumber || '') + ' ' + (item.employeeNumber || '') + ' ' + (item.position || '')).toLowerCase().indexOf(query) >= 0; });
  }

  function renderHeader() {
    var year = selectedYear();
    $('title').textContent = mode === 'staff' ? '👥 Staff ID Cards' : '🎓 Student ID Cards';
    if (mode === 'staff') $('subtitle').textContent = state.staff.length + ' staff members';
    else {
      var classes = visibleClasses();
      var students = classes.reduce(function (sum, item) { return sum + Number(item.studentCount || 0); }, 0);
      $('subtitle').textContent = ((year && year.label) || 'Current study year') + ' · ' + classes.length + ' classes · ' + students + ' students';
    }
    var select = $('year'); select.hidden = mode !== 'student';
    if (mode === 'student') {
      select.textContent = '';
      state.years.forEach(function (item) { select.appendChild(el('option', { value: item.id, text: (item.label || item.year || '') + (item.isCurrent ? ' (Current)' : '') })); });
      select.value = state.yearId;
    }
  }

  function renderPresets() {
    var presets = mode === 'staff' ? STAFF_PRESETS : STUDENT_PRESETS;
    $('presets-title').textContent = mode === 'staff' ? 'Staff ID Card Templates' : '10 Student ID Card Templates';
    $('presets-help').textContent = mode === 'staff'
      ? 'Choose a professional portrait design. The Cream template includes printable front and back sides with the attendance QR on the back.'
      : 'Choose a professional design, then customize its logo, information, colors, and size.';
    var host = $('presets'); host.textContent = '';
    presets.forEach(function (preset, index) {
      var label = mode === 'staff' ? (index === 2 ? 'Front + Back' : 'Staff ID Card') : 'Student ID Card';
      host.appendChild(el('button', { type: 'button', class: 'preset', 'aria-pressed': String(state.template.designPreset === preset.id), onclick: function () {
        state.template = Object.assign({}, state.template, { designPreset: preset.id, primaryColor: preset.primaryColor, accentColor: preset.accentColor, cardSize: preset.cardSize });
        render();
      } }, [
        el('span', { class: 'swatch', style: { background: 'linear-gradient(135deg, ' + preset.primaryColor + ', ' + preset.accentColor + ')' } }, [el('b', { text: ('0' + (index + 1)).slice(-2) }), el('span', { text: label })]),
        el('span', { class: 'name' }, [document.createTextNode(preset.name), el('small', { text: preset.description || (preset.cardSize === 'cr80-portrait' ? 'Portrait' : 'Landscape') })]),
      ]));
    });
  }

  function renderDesign() {
    var template = state.template;
    $('design-help').textContent = 'Edit the shared ' + mode + ' card template. Attendance QR identifiers are protected and remain unchanged.';
    $('t-schoolName').value = template.schoolName; $('t-cardTitle').value = template.cardTitle; $('t-cardSize').value = template.cardSize;
    $('t-logoUrl').value = String(template.logoUrl || '').indexOf('data:') === 0 ? '' : template.logoUrl || '';
    $('t-primaryColor').value = template.primaryColor; $('t-accentColor').value = template.accentColor;
    $('t-footerText').value = template.footerText; $('t-extraInfo').value = template.extraInfo;
    TOGGLES.forEach(function (entry) { $('t-' + entry[0]).checked = template[entry[0]] === true; });
    var preview = $('logo-preview'); preview.textContent = '';
    if (template.logoUrl) {
      preview.appendChild(el('img', { src: template.logoUrl, alt: 'Logo preview' }));
      preview.appendChild(el('button', { type: 'button', text: 'Remove logo', onclick: function () { state.template = Object.assign({}, state.template, { logoUrl: '' }); render(); } }));
    } else preview.appendChild(el('span', { text: 'No logo selected' }));
    $('save-template').disabled = state.busy; $('save-template').textContent = state.busy ? 'Saving…' : 'Save Template';
    $('toggle-samples').textContent = state.samples ? 'Show live cards' : 'Preview 10 sample cards';
  }

  function renderClasses() {
    var visible = mode === 'student' && !state.classId && !state.samples;
    $('classes-view').hidden = !visible;
    if (!visible) return;
    var year = selectedYear();
    $('classes-title').textContent = '📖 All Classes in ' + ((year && year.label) || 'Study Year');
    var host = $('classes'); host.textContent = '';
    var list = visibleClasses();
    list.forEach(function (item) {
      var button = el('button', { type: 'button', class: 'class-card', onclick: function () { openClass(item.id); } }, [
        el('div', { class: 'head' }, [el('span', { text: (item.studentCount || 0) + ' students' }), el('h3', { text: item.name || '' })]),
        el('div', { class: 'foot' }, [el('span', { text: '♟ ' + ((item.teacher && item.teacher.name) || 'No teacher') }), el('span', { text: 'View →' })]),
      ]);
      button.disabled = state.busy;
      host.appendChild(button);
    });
    $('classes-empty').hidden = list.length > 0;
  }

  function renderCards() {
    var visible = state.samples || mode === 'staff' || Boolean(state.classId);
    $('cards-view').hidden = !visible;
    if (!visible) return;
    var list = people(), chosen = selectedClass(), year = selectedYear();
    $('back').hidden = !(mode === 'student' && state.classId && !state.samples);
    $('cards-title').textContent = state.samples ? '10 ' + mode + ' sample cards' : mode === 'staff' ? 'All Staff' : (chosen && chosen.name) || '';
    $('cards-count').textContent = list.length + ' cards ready';
    $('query').setAttribute('placeholder', 'Search ' + (mode === 'staff' ? 'staff' : 'students') + '…');
    $('print').textContent = '▣ Download / Print Cards (' + list.length + ')';
    $('print').disabled = !list.length;
    var host = $('cards'); host.textContent = '';
    list.forEach(function (person) {
      var subtitle = mode === 'staff' ? person.position || 'Staff' : state.samples ? 'Sample Class' : (chosen && chosen.name) || 'Student';
      host.appendChild(card(person, subtitle, mode === 'student' ? year && year.label : undefined));
    });
    $('cards-empty').hidden = list.length > 0 || state.busy;
  }

  function render() { renderHeader(); renderPresets(); renderDesign(); renderClasses(); renderCards(); }

  function openClass(id) {
    state.busy = true; show('error'); render();
    var ensure = config.ensure ? ui.api.post(route(config.ensure, { classId: id }), {}).catch(function (error) { throw new Error(error.message || 'Student card identifiers could not be prepared.'); }) : Promise.resolve();
    ensure.then(function () { return ui.api.get(route(config.students, { classId: id })); })
      .then(function (result) { state.students = rows(result); state.classId = id; })
      .catch(function (error) { show('error', error.message || 'Students could not be loaded.'); })
      .then(function () { state.busy = false; render(); });
  }

  function saveTemplate() {
    if (!config.saveTemplate) { show('error', 'Template save route is unavailable.'); return; }
    state.busy = true; show('error'); show('message'); render();
    ui.api.put(route(config.saveTemplate, { type: mode }), state.template)
      .then(function (result) { state.template = Object.assign(defaultTemplate(), result && typeof result === 'object' && !Array.isArray(result) ? result : state.template); show('message', word() + ' card template saved.'); })
      .catch(function (error) { show('error', error.message || 'Template could not be saved.'); })
      .then(function () { state.busy = false; render(); });
  }

  // Logos are redrawn at a small size so the saved template stays well inside one request.
  function selectLogo(file) {
    if (!file) return;
    if (String(file.type).indexOf('image/') !== 0) { show('error', 'School logo must be an image.'); return; }
    var reader = new FileReader();
    reader.onerror = function () { show('error', 'School logo could not be read.'); };
    reader.onload = function () {
      var image = new Image();
      image.onerror = function () { show('error', 'School logo could not be read.'); };
      image.onload = function () {
        var scale = Math.min(1, LOGO_EDGE / Math.max(image.width, image.height, 1));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        var data = canvas.toDataURL('image/png');
        if (data.length > LOGO_MAX_CHARS) data = canvas.toDataURL('image/jpeg', 0.85);
        if (data.length > LOGO_MAX_CHARS) { show('error', 'School logo is too detailed. Choose a simpler or smaller image.'); return; }
        state.template = Object.assign({}, state.template, { logoUrl: data }); show('error'); render();
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  function load() {
    var calls = [config.template ? ui.api.get(config.template) : Promise.resolve(null)];
    if (mode === 'staff') calls.push(ui.api.get(config.people));
    else { calls.push(ui.api.get(config.classes)); calls.push(ui.api.get(config.years)); }
    return Promise.all(calls).then(function (results) {
      var saved = results[0];
      state.template = saved && typeof saved === 'object' && !Array.isArray(saved) ? Object.assign(defaultTemplate(), saved) : defaultTemplate();
      if (mode === 'staff') state.staff = rows(results[1]);
      else {
        state.classes = rows(results[1]); state.years = rows(results[2]);
        var current = state.years.filter(function (item) { return item.isCurrent; })[0] || state.years[0];
        if (!state.yearId && current) state.yearId = current.id;
      }
      render();
    });
  }

  function bind(id, key, event) { $(id).addEventListener(event || 'input', function (e) { var change = {}; change[key] = e.target.value; state.template = Object.assign({}, state.template, change); renderCards(); renderPresets(); }); }
  bind('t-schoolName', 'schoolName'); bind('t-cardTitle', 'cardTitle'); bind('t-cardSize', 'cardSize', 'change'); bind('t-logoUrl', 'logoUrl', 'change');
  bind('t-primaryColor', 'primaryColor'); bind('t-accentColor', 'accentColor'); bind('t-footerText', 'footerText'); bind('t-extraInfo', 'extraInfo');
  TOGGLES.forEach(function (entry) { $('t-' + entry[0]).addEventListener('change', function (e) { var change = {}; change[entry[0]] = e.target.checked; state.template = Object.assign({}, state.template, change); renderCards(); }); });
  $('t-logoFile').addEventListener('change', function (e) { selectLogo(e.target.files && e.target.files[0]); e.target.value = ''; });
  $('save-template').addEventListener('click', saveTemplate);
  $('toggle-samples').addEventListener('click', function () { state.samples = !state.samples; render(); });
  $('reset-design').addEventListener('click', function () { state.template = defaultTemplate(); render(); });
  $('year').addEventListener('change', function (e) { state.yearId = e.target.value; state.classId = ''; state.students = []; render(); });
  $('back').addEventListener('click', function () { state.classId = ''; state.students = []; render(); });
  $('query').addEventListener('input', function (e) { state.query = e.target.value; renderCards(); });
  $('print').addEventListener('click', function () { window.print(); });

  render();
  ui.autoResize();
  ui.connect()
    .then(load)
    .catch(function (error) { show('error', error.message || 'ID cards could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
