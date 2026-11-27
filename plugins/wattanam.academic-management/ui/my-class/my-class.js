/* My Class (Teacher Portal): the teacher's class at a glance — today's attendance, every student with
 * their details, guardian and month, the recent permissions, and shortcuts to take attendance, record a
 * permission or enter scores for the class.
 * Plugin API used: GET my/classes; GET my/classes/:id/overview. A class opens directly with ?classId=.
 * With "Add, edit and remove the students of my class" (class.students): POST my/classes/:id/students/create,
 * PATCH my/classes/:classId/students/:studentId, DELETE my/classes/:id/students/:studentId. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var STATUS = {
    present: ['Present', 'មក'], late: ['Late', 'យឺត'], permission: ['Permission', 'ច្បាប់'],
    absent: ['Absent', 'អវត្តមាន'], unmarked: ['Not marked', 'មិនទាន់ស្រង់'], off: ['Day off', 'ឈប់'],
  };
  var PART = { MORNING: 'Morning', AFTERNOON: 'Afternoon', FULL_DAY: 'Full day' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CLASS_STUDENTS = 'wattanam.academic-management.class.students';
  // mode: '' (details), 'add', 'edit' or 'remove' (the side panel)
  var state = { classes: [], classId: '', data: null, filter: 'all', query: '', selected: '', can: false, mode: '', busy: false };

  function $(id) { return document.getElementById(id); }
  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attributes[key];
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), attributes[key]);
      else node.setAttribute(key, attributes[key]);
    });
    (children || []).forEach(function (child) { if (child !== null && child !== undefined) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function rows(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  function nice(day) { var p = String(day || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0] : ''; }
  function initials(text) { var w = String(text || '').trim().split(/\s+/).filter(Boolean); return ((w[0] || '').slice(0, 1) + (w.length > 1 ? w[w.length - 1].slice(0, 1) : '')).toUpperCase() || '•'; }
  function displayName(s) { return s.nameKh || s.name || s.studentNumber || 'Student'; }
  function avatar(s, big) {
    var box = el('span', { class: 'avatar' + (big ? ' big' : ''), 'aria-hidden': 'true' });
    if (s.photo && /^(data:image\/|https:\/\/)/.test(s.photo)) {
      var img = el('img', { alt: '' }); img.onerror = function () { box.textContent = initials(displayName(s)); }; img.src = s.photo; box.appendChild(img);
    } else box.textContent = initials(displayName(s));
    return box;
  }
  function pill(status) { var s = STATUS[status] || [status, '']; return el('span', { class: 'pill ' + status, title: s[1], text: s[0] }); }
  function sexText(sex) { return sex === 'FEMALE' ? 'F · ស' : sex === 'MALE' ? 'M · ប' : ''; }

  // ---------- the class ----------
  function renderHero() {
    var d = state.data;
    $('class-name').textContent = d ? d.class.name : (state.classes.length ? '…' : 'No class yet');
    $('class-meta').textContent = d ? [d.class.studyYear ? 'Academic year ' + d.class.studyYear : '', d.class.subject, d.class.teacher ? 'Teacher: ' + d.class.teacher : '', d.holiday ? '🎉 ' + d.holiday : !d.studyToday ? 'No class today' : ''].filter(Boolean).join(' · ') : '';
    var host = $('stats'); host.textContent = '';
    if (!d) return;
    var t = d.totals, marked = t.present + t.late + t.permission + t.absent;
    [
      ['', 'Students', t.students, t.male + ' M · ' + t.female + ' F'],
      ['present', 'Present today', d.studyToday ? (t.present + t.late) : '—', d.studyToday ? (t.late ? t.late + ' late' : marked ? 'of ' + t.students : 'not taken yet') : 'no class'],
      ['permission', 'Permission', t.permission, 'today'],
      ['absent', 'Absent', t.absent, 'today'],
      ['unmarked', 'Not marked', t.unmarked, d.studyToday ? 'no record yet' : ''],
    ].forEach(function (s) {
      host.appendChild(el('div', { class: 'stat ' + s[0], 'data-stat': s[1] }, [el('div', { class: 'k', text: s[1] }), el('div', { class: 'v', text: String(s[2]) }), el('div', { class: 'h', text: s[3] })]));
    });
  }

  // ---------- the students ----------
  function visibleStudents() {
    var q = state.query.trim().toLowerCase();
    return (state.data ? state.data.students : []).filter(function (s) {
      if (state.filter !== 'all' && s.today !== state.filter && !(state.filter === 'present' && s.today === 'late')) return false;
      return !q || [s.studentNumber, s.nameKh, s.name].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function renderFilters() {
    var host = $('filters'); host.textContent = '';
    var students = state.data ? state.data.students : [];
    var count = function (key) { return students.filter(function (s) { return key === 'all' || s.today === key || (key === 'present' && s.today === 'late'); }).length; };
    ['all', 'present', 'permission', 'absent', 'unmarked'].forEach(function (key) {
      var n = count(key);
      if (key !== 'all' && !n) return;
      host.appendChild(el('button', { type: 'button', role: 'tab', 'aria-selected': String(state.filter === key), 'data-filter': key, onclick: function () { state.filter = key; renderStudents(); renderFilters(); } },
        [key === 'all' ? 'All' : STATUS[key][0], el('span', { class: 'n', text: ' ' + n })]));
    });
  }
  function renderStudents() {
    var host = $('students'); host.textContent = '';
    var list = visibleStudents();
    $('count').textContent = state.data ? '· ' + state.data.students.length : '';
    $('empty').hidden = list.length > 0 || !state.data;
    list.forEach(function (s) {
      host.appendChild(el('button', { type: 'button', class: 'student', 'data-student': s.id, 'aria-pressed': String(state.selected === s.id), onclick: function () {
        state.selected = state.selected === s.id ? '' : s.id; state.mode = ''; renderStudents(); renderSide();
        if (state.selected) revealSide();
      } }, [
        avatar(s),
        el('span', { class: 'who' }, [el('span', { class: 'name', text: displayName(s) }), el('span', { class: 'sub', text: [s.studentNumber, s.name && s.name !== s.nameKh ? s.name : '', sexText(s.sex)].filter(Boolean).join(' · ') })]),
        pill(s.today),
      ]));
    });
  }

  // ---------- one student, or the recent permissions ----------
  function go(routePath, extra) {
    var query = { classId: state.classId };
    Object.keys(extra || {}).forEach(function (k) { query[k] = extra[k]; });
    // Take Attendance is a Smart Attendance screen; it opens on this class.
    if (routePath === 'attendance') ui.partner('wattanam.smart-attendance').navigate('take', query);
    else ui.navigate(routePath, query);
  }
  // one column (phones, narrow screens): the side panel is below the list, so bring it into view
  function revealSide() {
    if ($('side').getBoundingClientRect().top > window.innerHeight * 0.6) $('side').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Enter scores: the university score sheet for a class that only uses university sheets (or, before any
  // sheet uses it, a university class); otherwise the primary, secondary & high school sheets.
  function scoreScreen() {
    var c = state.data && state.data.class, kinds = (c && c.scoreKinds) || [];
    if (kinds.length) return kinds.indexOf('SCHOOL') < 0 ? 'university-entry' : 'score-entry';
    return c && c.level === 'UNIVERSITY' ? 'university-entry' : 'score-entry';
  }
  function renderSide() {
    var host = $('side'); host.textContent = '';
    var d = state.data;
    if (!d) return;
    var s = d.students.filter(function (x) { return x.id === state.selected; })[0];
    if (state.mode === 'add' || (s && state.mode === 'edit')) { renderForm(host, state.mode === 'edit' ? s : null); return; }
    if (!s) {
      host.appendChild(el('h3', { text: '📝 Recent permissions' }));
      if (!d.permissions.length) host.appendChild(el('p', { class: 'muted', text: 'No permission recorded in this class yet.' }));
      d.permissions.slice(0, 8).forEach(function (p) {
        host.appendChild(el('div', { class: 'perm' }, [el('b', { text: (p.studentNumber ? p.studentNumber + ' · ' : '') + p.name }),
          el('span', { text: (p.fromDate === p.toDate ? nice(p.fromDate) + ' · ' + (PART[p.part] || p.part) : nice(p.fromDate) + ' → ' + nice(p.toDate)) + ' · ' + p.reason })]));
      });
      host.appendChild(el('p', { class: 'muted', text: 'Tip: choose a student to see their details.' }));
      return;
    }
    host.appendChild(el('div', { class: 'head' }, [avatar(s, true), el('div', {}, [el('div', { class: 'name', text: displayName(s) }), el('div', { class: 'muted', text: [s.studentNumber ? 'ID ' + s.studentNumber : '', s.name && s.name !== s.nameKh ? s.name : ''].filter(Boolean).join(' · ') }), pill(s.today)]),
      el('button', { type: 'button', class: 'close', 'aria-label': 'Close', text: '✕', onclick: function () { state.selected = ''; renderStudents(); renderSide(); } })]));
    var facts = el('dl', { class: 'facts' });
    var parentLine = function (name, job, phone) { return [name, job, phone].filter(Boolean).join(' · '); };
    [['Sex', sexText(s.sex)], ['Date of birth', nice(s.dateOfBirth)], ['Place of birth', s.birthPlace], ['Address', s.address], ['Phone', s.phone], ['Email', s.email],
      ['Father', parentLine(s.fatherName, s.fatherJob, s.fatherPhone)], ['Mother', parentLine(s.motherName, s.motherJob, s.motherPhone)],
      ['Guardian', s.guardian ? [s.guardian.name, s.guardian.phone].filter(Boolean).join(' · ') : '']].forEach(function (f) {
      if (f[1]) facts.appendChild(el('div', {}, [el('dt', { text: f[0] }), el('dd', { text: f[1] })]));
    });
    host.appendChild(facts);
    host.appendChild(el('h3', { text: 'This month' }));
    host.appendChild(el('div', { class: 'month', 'data-month': s.id }, [['present', 'Present'], ['late', 'Late'], ['permission', 'Permission'], ['absent', 'Absent']].map(function (m) {
      return el('div', {}, [el('b', { text: String(s.month[m[0]]) }), el('span', { text: m[1] })]);
    })));
    var mine = d.permissions.filter(function (p) { return p.studentId === s.id; });
    if (mine.length) {
      host.appendChild(el('h3', { text: 'Permissions' }));
      mine.slice(0, 4).forEach(function (p) { host.appendChild(el('div', { class: 'perm' }, [el('span', { text: (p.fromDate === p.toDate ? nice(p.fromDate) : nice(p.fromDate) + ' → ' + nice(p.toDate)) + ' · ' + p.reason })])); });
    }
    if (state.mode === 'remove') { host.appendChild(removeConfirm(s)); return; }
    host.appendChild(el('div', { class: 'links' }, [
      el('button', { type: 'button', text: '📝 Record a permission', onclick: function () { go('student-permissions', { studentId: s.id }); } }),
      state.can ? el('button', { type: 'button', 'data-edit': s.id, text: '✏️ Edit details', onclick: function () { state.mode = 'edit'; renderSide(); } }) : null,
      state.can ? el('button', { type: 'button', class: 'danger', 'data-remove': s.id, text: '🗑 Remove from class', onclick: function () { state.mode = 'remove'; renderSide(); } }) : null,
    ]));
  }

  // ---------- adding, editing and removing a student ----------
  var flashTimer = null;
  function flash(text, sticky) { show('error'); show('notice', text); clearTimeout(flashTimer); if (!sticky) flashTimer = setTimeout(function () { show('notice'); }, 6000); }
  function commandKey() { return 'my-class-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function field(label, input, optional) {
    return el('label', {}, [el('span', {}, [label, optional ? el('span', { class: 'opt', text: ' (optional)' }) : null]), input]);
  }
  function input(name, value, attributes) {
    var node = el('input', Object.assign({ name: name }, attributes || {}));
    node.value = value || '';
    return node;
  }
  function isoDay(value) { return value ? String(value).slice(0, 10) : ''; }

  function renderForm(host, s) {
    var editing = Boolean(s);
    host.appendChild(el('div', { class: 'head' }, [
      el('h3', { text: editing ? '✏️ Edit ' + displayName(s) : '＋ New student in ' + state.data.class.name }),
      el('button', { type: 'button', class: 'close', 'aria-label': 'Close', text: '✕', onclick: closeForm }),
    ]));
    var sex = el('select', { name: 'sex' }, [el('option', { value: '', text: '—' }), el('option', { value: 'MALE', text: 'Male · ប្រុស' }), el('option', { value: 'FEMALE', text: 'Female · ស្រី' })]);
    sex.value = (s && s.sex) || '';
    // place of birth, current address and parents (student-details.js), folded away until needed
    var D = window.WattanamStudentDetails;
    var detailsBox = el('div', { class: 'details-groups' }); D.render(detailsBox, { gridClass: 'detail-grid' }); D.fill(detailsBox, s || {});
    var hasDetails = s && D.KEYS.some(function (k) { return s[k]; });
    var details = el('details', { class: 'more-details' }, [el('summary', { text: 'Place of birth, address and parents · ទីកន្លែងកំណើត អាសយដ្ឋាន ឪពុកម្ដាយ' }), detailsBox]);
    if (hasDetails || (s && s.address)) details.open = true;
    var oldAddress = s && s.address && !['houseNo', 'street', 'village', 'commune', 'district', 'province'].some(function (k) { return s[k]; })
      ? el('p', { class: 'hint', text: 'Saved address: ' + s.address + ' (fill in the current address to replace it)' }) : null;
    var error = el('p', { class: 'form-error', role: 'alert', hidden: '' });
    var save = el('button', { type: 'submit', class: 'primary', text: editing ? 'Save changes' : 'Add student' });
    var form = el('form', { class: 'student-form', 'data-form': editing ? 'edit' : 'add', novalidate: '' }, [
      field('Khmer name · ឈ្មោះខ្មែរ', input('nameKh', s && s.nameKh, { autocomplete: 'off' })),
      field('Latin name · ឈ្មោះឡាតាំង', input('name', s && s.name, { autocomplete: 'off' })),
      el('div', { class: 'row' }, [
        field('Student ID', input('studentNumber', s && s.studentNumber, { autocomplete: 'off', placeholder: editing ? '' : 'automatic' }), !editing),
        field('Sex', sex, true),
      ]),
      el('div', { class: 'row' }, [
        field('Date of birth', input('dateOfBirth', s && isoDay(s.dateOfBirth), { type: 'date' }), true),
        field('Phone', input('phone', s && s.phone, { type: 'tel', autocomplete: 'off' }), true),
      ]),
      field('Email', input('email', s && s.email, { type: 'email', autocomplete: 'off' }), true),
      details,
      oldAddress,
      editing ? null : el('p', { class: 'hint', text: 'A sign-in password is made for the student and shown once after adding.' }),
      error,
      el('div', { class: 'buttons' }, [save, el('button', { type: 'button', text: 'Cancel', onclick: closeForm })]),
    ]);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (state.busy) return;
      var v = function (name) { return String(form.elements[name] ? form.elements[name].value : '').trim(); };
      var fail = function (text) { error.textContent = text; error.hidden = false; };
      error.hidden = true;
      var nameKh = v('nameKh'), name = v('name') || nameKh;
      if (!name) return fail('Write the student\'s name (Khmer or Latin).');
      if (v('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) return fail('The email is not valid.');
      var body, call;
      if (editing) {
        body = {};
        var was = { nameKh: s.nameKh || '', studentNumber: s.studentNumber || '', sex: s.sex || '', dateOfBirth: isoDay(s.dateOfBirth) };
        D.KEYS.forEach(function (key) { was[key] = s[key] || ''; });
        Object.keys(was).forEach(function (key) { if (v(key) !== was[key]) body[key] = v(key) || null; });
        if (body.studentNumber === null) delete body.studentNumber; // an ID is kept once given
        if (name !== (s.name || '') || v('email') !== (s.email || '') || v('phone') !== (s.phone || '')) {
          body.name = name; body.email = v('email'); body.phone = v('phone'); body.commandKey = commandKey();
        }
        if (!Object.keys(body).length) { closeForm(); return; }
        call = ui.api.patch('my/classes/' + encodeURIComponent(state.classId) + '/students/' + encodeURIComponent(s.id), body);
      } else {
        body = { name: name, nameKh: nameKh, studentNumber: v('studentNumber'), sex: v('sex'), dateOfBirth: v('dateOfBirth') || null, phone: v('phone'), email: v('email'), commandKey: commandKey() };
        Object.assign(body, D.read(detailsBox));
        call = ui.api.post('my/classes/' + encodeURIComponent(state.classId) + '/students/create', body);
      }
      state.busy = true; save.disabled = true;
      call.then(function (result) {
        state.busy = false;
        flash(editing ? '✓ ' + (nameKh || name) + '\'s details are saved.' : '✓ ' + (nameKh || name) + ' is added to ' + state.data.class.name + ' (ID ' + result.studentNumber + ').' + (result.password ? ' Sign-in password: ' + result.password + ' (shown once; give it to the student).' : ''), Boolean(!editing && result && result.password));
        return reload(editing ? s.id : result.id);
      }).catch(function (e) { state.busy = false; save.disabled = false; fail(e.message || 'The student could not be saved.'); });
    });
    host.appendChild(form);
    var first = form.elements.nameKh; if (first && !editing) setTimeout(function () { first.focus(); }, 0);
  }
  function closeForm() { state.mode = ''; renderSide(); }

  function removeConfirm(s) {
    var yes = el('button', { type: 'button', class: 'danger', 'data-confirm-remove': s.id, text: 'Remove' });
    var error = el('p', { class: 'form-error', role: 'alert', hidden: '' });
    yes.addEventListener('click', function () {
      if (state.busy) return;
      state.busy = true; yes.disabled = true;
      ui.api.delete('my/classes/' + encodeURIComponent(state.classId) + '/students/' + encodeURIComponent(s.id)).then(function (result) {
        state.busy = false;
        if (result && result.success === false) throw new Error(result.message || 'The student is no longer in this class.');
        flash('✓ ' + displayName(s) + ' is removed from ' + state.data.class.name + '.');
        return reload('');
      }).catch(function (e) { state.busy = false; yes.disabled = false; error.textContent = e.message || 'The student could not be removed.'; error.hidden = false; });
    });
    return el('div', { class: 'confirm' }, [
      el('b', { text: 'Remove ' + displayName(s) + ' from ' + state.data.class.name + '?' }),
      el('span', { text: 'Their enrolment in this class ends today. The student, their account and past attendance and scores are kept, and the office can add them to a class again.' }),
      error,
      el('div', { class: 'buttons' }, [yes, el('button', { type: 'button', text: 'Keep', onclick: function () { state.mode = ''; renderSide(); } })]),
    ]);
  }

  // ---------- loading ----------
  function load() {
    state.data = null; state.selected = ''; state.mode = '';
    renderHero(); renderFilters(); renderStudents(); renderSide();
    $('add-student').hidden = true;
    if (!state.classId) return Promise.resolve();
    return ui.api.get('my/classes/' + encodeURIComponent(state.classId) + '/overview').then(function (data) {
      state.data = data; show('error');
      $('add-student').hidden = !state.can;
      renderHero(); renderFilters(); renderStudents(); renderSide();
    }).catch(function (error) { show('error', error.message || 'The class could not be loaded.'); });
  }
  // after a change: the same class again, with this student chosen (or none)
  function reload(selectId) {
    return ui.api.get('my/classes/' + encodeURIComponent(state.classId) + '/overview').then(function (data) {
      state.data = data; state.mode = '';
      state.selected = data.students.some(function (x) { return x.id === selectId; }) ? selectId : '';
      if (state.selected && state.filter !== 'all') state.filter = 'all';
      renderHero(); renderFilters(); renderStudents(); renderSide();
    }).catch(function (error) { show('error', error.message || 'The class could not be loaded.'); });
  }

  $('class').addEventListener('change', function (event) { state.classId = event.target.value; state.filter = 'all'; load(); });
  $('add-student').addEventListener('click', function () { state.selected = ''; state.mode = 'add'; renderStudents(); renderSide(); revealSide(); });
  $('search').addEventListener('input', function (event) { state.query = event.target.value; renderStudents(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (button) {
    button.addEventListener('click', function () {
      var target = button.getAttribute('data-go');
      if (target === 'score-entry') go(scoreScreen(), { entry: '1' }); else go(target);
    });
  });

  ui.autoResize();
  ui.connect().then(function (context) {
    // An older school core does not say what the user may do: offer the actions, the routes still check.
    state.can = !Array.isArray(context.permissions) || context.permissions.indexOf(CLASS_STUDENTS) >= 0;
    return ui.api.get('my/classes').then(function (result) {
      state.classes = rows(result).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      var wanted = String((context.query && context.query.classId) || '');
      state.classId = state.classes.some(function (c) { return c.id === wanted; }) ? wanted : (state.classes[0] && state.classes[0].id) || '';
      var select = $('class'); select.textContent = '';
      state.classes.forEach(function (c) { select.appendChild(el('option', { value: c.id, text: c.name })); });
      select.value = state.classId;
      $('class-pick-wrap').hidden = state.classes.length < 2;
      if (!state.classes.length) show('error', 'No class is assigned to you yet. Ask the school office to make you the teacher of a class.');
      return load();
    });
  }).catch(function (error) { show('error', error.message || 'My Class could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
