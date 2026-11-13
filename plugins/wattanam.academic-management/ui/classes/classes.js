/* Manage Classes: Academic Management's own screen (moved out of the school core in 0.5.0).
 * Runs in the core's sandboxed plugin frame and talks to this plugin's API only:
 *   GET classes, study-years, teachers, class-admins; POST classes; PUT/DELETE classes/:id;
 *   GET classes/:id/students, classes/:id/available-students; POST classes/:id/students,
 *   classes/:id/students/create, classes/:id/students/bulk-csv; DELETE classes/:id/students/:studentId.
 * Excel import/export uses xlsx.js (WattanamXlsx), bundled with the plugin. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var presets = [
    ['GLOBAL', '🌐', 'Global Default', 'Inherits from settings'], ['FULL', '🌞', 'Full Day', '7:00 AM – 5:00 PM'], ['MORNING', '🌅', 'Morning Only', '7:00 AM – 12:00 PM'],
    ['AFTERNOON', '🌤️', 'Afternoon Only', '1:00 PM – 5:30 PM'], ['EVENING', '🌆', 'Evening', '6:00 PM – 9:00 PM'], ['NIGHT', '🌙', 'Night Shift', '6:00 PM – 6:00 AM'], ['CUSTOM', '🔧', 'Custom', 'Set your own times'],
  ];
  var studyDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  var weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  var dayPresets = [['Mon–Fri', weekdays], ['Mon–Sat', studyDays.slice(0, 6)], ['All 7 days', studyDays], ['Weekend only', ['SAT', 'SUN']]];
  var templateHeaders = ['ID', 'Name', 'Sex', 'Email', 'Phone', 'Password', 'Photo', 'Date of Birth', 'Address', 'Generation', 'Khmer Name'];
  var studentFields = ['studentNumber', 'name', 'nameKh', 'email', 'phone', 'password', 'sex', 'dateOfBirth', 'photo', 'address', 'generation'];
  var XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  var state = {
    classes: [], years: [], teachers: [], admins: [], query: '', year: '', sort: 'name', layout: 'grid', view: 'list', busy: '',
    editing: null, form: null, daysClass: null, daysForm: null, studentsClass: null, students: [], available: [], studentsLoading: false,
    studentOpen: false, studentKey: '', importResult: null,
  };

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
  function scheduleOf(value) { try { return JSON.parse(value || '{}') || {}; } catch (error) { return {}; } }
  function dayLabel(day) { return day.charAt(0) + day.slice(1).toLowerCase(); }
  function orderedDays(list) { return studyDays.filter(function (day) { return list.indexOf(day) >= 0; }); }
  function yearLabel(item) { return String(item.label || item.year || '') + (item.isCurrent ? ' (Current)' : ''); }
  function currentYear() { var current = state.years.filter(function (item) { return item.isCurrent; })[0] || state.years[0]; return current ? current.id : ''; }
  function newKey(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return prefix + window.crypto.randomUUID();
    return prefix + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function path() { return Array.prototype.map.call(arguments, function (part, index) { return index % 2 ? encodeURIComponent(part) : part; }).join(''); }

  // People pickers are type-to-search inputs backed by a datalist; labels are made unique so a
  // label always maps back to one person.
  function personOptions(list) {
    var seen = {};
    return list.map(function (item) {
      var label = item.name || item.email || item.id;
      if (seen[label]) label = label + ' · ' + (item.email || item.id);
      seen[label] = true;
      return { value: item.id, label: label };
    });
  }
  function fillDatalist(id, options) { var host = $(id); host.textContent = ''; options.forEach(function (option) { host.appendChild(el('option', { value: option.label })); }); }
  function labelOf(options, value) { var found = options.filter(function (option) { return option.value === value; })[0]; return found ? found.label : ''; }
  function valueOf(options, label) { var text = String(label || '').trim().toLowerCase(); var found = options.filter(function (option) { return option.label.toLowerCase() === text; })[0]; return found ? found.value : ''; }

  function download(name, bytes, type) {
    var url = URL.createObjectURL(new Blob([bytes], { type: type }));
    var anchor = el('a', { href: url, download: name });
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Thumbnails are redrawn at 480 px (WebP) so they fit one request.
  function imageData(file) {
    return new Promise(function (resolve, reject) {
      if (file.size > 2 * 1024 * 1024) return reject(new Error('Thumbnail must be 2 MB or smaller.'));
      if (['image/png', 'image/jpeg', 'image/webp'].indexOf(file.type) < 0) return reject(new Error('Use a PNG, JPG, or WebP thumbnail.'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Thumbnail could not be read.')); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error('Thumbnail is invalid.')); };
        image.onload = function () {
          var scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight, 1));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/webp', 0.82));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- list ----------
  function shown() {
    var query = state.query.toLowerCase();
    return state.classes.filter(function (item) {
      return (!state.year || item.studyYearId === state.year) && ((item.name || '') + ' ' + (item.subject || '') + ' ' + ((item.teacher && item.teacher.name) || '')).toLowerCase().indexOf(query) >= 0;
    }).sort(function (a, b) {
      if (state.sort === 'students') return Number(b.studentCount || 0) - Number(a.studentCount || 0);
      if (state.sort === 'subject') return String(a.subject || '').localeCompare(String(b.subject || ''));
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }
  function renderList() {
    var select = $('year'), keep = state.year;
    select.textContent = '';
    select.appendChild(el('option', { value: '', text: 'All study years' }));
    state.years.forEach(function (item) { select.appendChild(el('option', { value: item.id, text: yearLabel(item) })); });
    select.value = keep;
    $('view-grid').setAttribute('aria-pressed', String(state.layout === 'grid'));
    $('view-list').setAttribute('aria-pressed', String(state.layout === 'list'));
    var host = $('classes'); host.textContent = ''; host.className = 'classes ' + state.layout;
    var list = shown();
    list.forEach(function (row, index) {
      var schedule = scheduleOf(row.schedule);
      var active = Array.isArray(schedule.week) && schedule.week.length ? schedule.week : weekdays;
      var preset = presets.filter(function (item) { return item[0] === schedule.attendanceFormat; })[0];
      var thumb = el('div', { class: 'thumb' });
      if (row.thumbnail) { var image = el('img', { alt: '' }); image.onerror = function () { thumb.textContent = '📕'; }; image.setAttribute('src', row.thumbnail); thumb.appendChild(image); } else thumb.textContent = '📕';
      var registration = row.registrationStatus === 'AVAILABLE' ? 'Open for Registration' : row.registrationStatus === 'UNAVAILABLE' ? 'Registration Closed' : 'Hidden';
      var remove = el('button', { type: 'button', class: 'danger', text: '🗑 Delete', onclick: function () { removeClass(row); } });
      remove.disabled = Boolean(state.busy);
      host.appendChild(el('article', { class: 'class c' + (index % 4) }, [
        el('div', { class: 'count' }, [el('strong', { text: String(row.studentCount || 0) }), el('span', { text: 'STUDENTS' })]),
        thumb, el('h2', { text: row.name || '' }),
        row.subject ? el('span', { class: 'subject', text: row.subject }) : null,
        el('div', { class: 'tags' }, [el('span', { text: '🗓️ ' + ((row.studyYear && row.studyYear.label) || 'No study year') }), el('span', { text: '● ' + registration }), el('span', { text: '🔧 ' + (preset ? preset[2] : 'Custom') })]),
        el('p', { class: 'line', text: '📅 Study days: ' + orderedDays(active).map(dayLabel).join(', ') }),
        el('p', { class: 'line', text: '👤 ' + ((row.teacher && row.teacher.name) || 'Teacher not assigned') }),
        el('div', { class: 'row-actions' }, [
          el('button', { type: 'button', text: '📚 Manage', onclick: function () { ui.navigate('classes/' + encodeURIComponent(row.id)); } }),
          el('button', { type: 'button', text: '🧑‍🎓 Students', onclick: function () { openStudents(row); } }),
          el('button', { type: 'button', text: 'Attendance', onclick: function () { ui.navigate('attendance', { classId: row.id }); } }),
          el('button', { type: 'button', text: '📅 Edit Study Days', onclick: function () { openDays(row); } }),
          el('button', { type: 'button', text: '✏️ Edit Class', onclick: function () { openClass(row); } }),
          remove,
        ]),
      ]));
    });
    $('classes-empty').hidden = list.length > 0 || state.view !== 'list';
  }

  // ---------- shared day / preset pickers ----------
  function renderDays(hostId, presetsId, form, rerender) {
    var host = $(hostId); host.textContent = '';
    studyDays.forEach(function (day) {
      var selected = form.week.indexOf(day) >= 0;
      host.appendChild(el('button', { type: 'button', 'aria-pressed': String(selected), text: dayLabel(day) + (selected ? ' ✓ Study' : ' Off'), onclick: function () {
        form.week = selected ? form.week.filter(function (item) { return item !== day; }) : orderedDays(form.week.concat([day]));
        rerender();
      } }));
    });
    var quick = $(presetsId); quick.textContent = '';
    dayPresets.forEach(function (preset) { quick.appendChild(el('button', { type: 'button', text: preset[0], onclick: function () { form.week = preset[1].slice(); rerender(); } })); });
  }

  // ---------- create / edit a class ----------
  function blankForm() { return { name: '', subject: '', teacherId: '', classAdminId: '', studyYearId: state.year || currentYear(), registrationStatus: 'HIDDEN', thumbnail: '', description: '', price: '', showPrice: false, attendanceFormat: 'GLOBAL', week: weekdays.slice() }; }
  function openClass(row) {
    state.editing = row || null;
    if (row) {
      var schedule = scheduleOf(row.schedule);
      state.form = {
        name: row.name || '', subject: row.subject || '', teacherId: row.teacherId || '', classAdminId: row.classAdminId || '', studyYearId: row.studyYearId || '',
        registrationStatus: row.registrationStatus || 'HIDDEN', thumbnail: row.thumbnail || '', description: row.description || '', price: row.price === null || row.price === undefined ? '' : String(row.price),
        showPrice: row.showPrice === true, attendanceFormat: typeof schedule.attendanceFormat === 'string' ? schedule.attendanceFormat : 'GLOBAL',
        week: Array.isArray(schedule.week) && schedule.week.length ? orderedDays(schedule.week) : weekdays.slice(),
      };
    } else state.form = blankForm();
    state.view = 'class'; show('class-error'); show('message'); show('error');
    var teachers = personOptions(state.teachers), admins = personOptions(state.admins), form = state.form;
    fillDatalist('teachers', teachers); fillDatalist('admins', admins);
    $('c-name').value = form.name; $('c-subject').value = form.subject;
    $('c-teacher').value = labelOf(teachers, form.teacherId); $('c-admin').value = labelOf(admins, form.classAdminId);
    var year = $('c-year'); year.textContent = '';
    year.appendChild(el('option', { value: '', text: 'None' }));
    state.years.forEach(function (item) { year.appendChild(el('option', { value: item.id, text: yearLabel(item) })); });
    year.value = form.studyYearId;
    $('c-status').value = form.registrationStatus; $('c-description').value = form.description; $('c-price').value = form.price; $('c-show-price').checked = form.showPrice; $('c-thumb').value = '';
    render();
  }
  function renderClassForm() {
    var form = state.form; if (!form) return;
    $('class-title').textContent = state.editing ? 'Edit Class' : 'New Class';
    $('class-help').textContent = state.editing ? 'Update class details, assignments, attendance format, and study days.' : 'Create a class, assign its teacher, and choose when it meets.';
    var busy = state.busy === 'class';
    $('class-save').disabled = busy; $('class-save').textContent = busy ? 'Saving…' : state.editing ? 'Save Class' : 'Create Class';
    var host = $('c-presets'); host.textContent = '';
    presets.forEach(function (preset) {
      host.appendChild(el('button', { type: 'button', 'aria-pressed': String(form.attendanceFormat === preset[0]), onclick: function () { form.attendanceFormat = preset[0]; renderClassForm(); } }, [el('span', { text: preset[1] }), el('strong', { text: preset[2] }), el('span', { class: 'detail', text: preset[3] })]));
    });
    renderDays('c-days', 'c-day-presets', form, renderClassForm);
    $('c-thumb-preview').hidden = !form.thumbnail; $('c-thumb-remove').hidden = !form.thumbnail;
    if (form.thumbnail) $('c-thumb-preview').setAttribute('src', form.thumbnail);
  }
  function saveClass(event) {
    event.preventDefault();
    var form = state.form, teachers = personOptions(state.teachers), admins = personOptions(state.admins);
    form.name = $('c-name').value; form.subject = $('c-subject').value; form.studyYearId = $('c-year').value; form.registrationStatus = $('c-status').value;
    form.description = $('c-description').value; form.price = $('c-price').value; form.showPrice = $('c-show-price').checked;
    form.teacherId = valueOf(teachers, $('c-teacher').value);
    var adminText = $('c-admin').value.trim(); form.classAdminId = valueOf(admins, adminText);
    show('class-error');
    if (!form.name.trim() || !form.teacherId) { show('class-error', $('c-teacher').value.trim() && !form.teacherId ? 'Choose the teacher from the list.' : 'Class name and teacher are required.'); return; }
    if (adminText && !form.classAdminId) { show('class-error', 'Choose the class administrator from the list, or leave it empty.'); return; }
    if (!form.week.length) { show('class-error', 'Select at least one study day.'); return; }
    var body = {
      name: form.name.trim(), subject: form.subject.trim() || null, teacherId: form.teacherId, classAdminId: form.classAdminId || null, studyYearId: form.studyYearId || null,
      registrationStatus: form.registrationStatus, thumbnail: form.thumbnail || null, description: form.description.trim() || null, price: form.price === '' ? null : Number(form.price),
      showPrice: form.showPrice, schedule: JSON.stringify({ attendanceFormat: form.attendanceFormat, week: form.week }),
    };
    var editing = state.editing;
    state.busy = 'class'; renderClassForm();
    (editing ? ui.api.put(path('classes/', editing.id), body) : ui.api.post('classes', body))
      .then(function () { state.view = 'list'; return loadClasses(); })
      .then(function () { show('message', editing ? body.name + ' updated successfully.' : 'Class created successfully.'); })
      .catch(function (error) { show('class-error', error.message || (editing ? 'Class could not be updated.' : 'Class could not be created.')); })
      .then(function () { state.busy = ''; render(); });
  }
  function removeClass(row) {
    if (!window.confirm('Delete ' + row.name + '? Registrations for this class will also be removed.')) return;
    state.busy = 'delete:' + row.id; show('message'); show('error'); render();
    ui.api.delete(path('classes/', row.id)).then(function () { return loadClasses(); }).then(function () { show('message', 'Class deleted.'); })
      .catch(function (error) { show('error', error.message || 'Class could not be deleted.'); })
      .then(function () { state.busy = ''; render(); });
  }

  // ---------- study days only ----------
  function openDays(row) {
    var schedule = scheduleOf(row.schedule);
    state.daysClass = row;
    state.daysForm = { attendanceFormat: typeof schedule.attendanceFormat === 'string' ? schedule.attendanceFormat : 'GLOBAL', week: Array.isArray(schedule.week) && schedule.week.length ? orderedDays(schedule.week) : weekdays.slice() };
    state.view = 'days'; show('days-error'); show('message'); show('error'); render();
  }
  function renderDaysForm() {
    if (!state.daysClass) return;
    $('days-help').textContent = state.daysClass.name + ' · Select the days students attend this class.';
    $('days-save').disabled = state.busy === 'days'; $('days-save').textContent = state.busy === 'days' ? 'Saving…' : 'Save Study Days';
    renderDays('d-days', 'd-day-presets', state.daysForm, renderDaysForm);
  }
  function saveDays(event) {
    event.preventDefault();
    if (!state.daysForm.week.length) { show('days-error', 'Select at least one study day.'); return; }
    var row = state.daysClass;
    state.busy = 'days'; show('days-error'); renderDaysForm();
    ui.api.put(path('classes/', row.id), { schedule: JSON.stringify(state.daysForm) })
      .then(function () { state.view = 'list'; return loadClasses(); }).then(function () { show('message', 'Study days updated for ' + row.name + '.'); })
      .catch(function (error) { show('days-error', error.message || 'Study days could not be saved.'); })
      .then(function () { state.busy = ''; render(); });
  }

  // ---------- students of a class ----------
  function studentName(item) { return item.name || (item.user && item.user.name) || ''; }
  function openStudents(row) {
    state.studentsClass = row; state.students = []; state.available = []; state.studentOpen = false; state.importResult = null; state.view = 'students';
    show('students-error'); show('students-message'); show('message'); show('error'); render();
    loadStudents();
  }
  function loadStudents() {
    var row = state.studentsClass; if (!row) return Promise.resolve();
    state.studentsLoading = true; renderStudents();
    return Promise.all([ui.api.get(path('classes/', row.id, '/students')), ui.api.get(path('classes/', row.id, '/available-students'))])
      .then(function (results) { state.students = rows(results[0]); state.available = rows(results[1]); })
      .catch(function (error) { show('students-error', error.message || 'Students could not be loaded.'); })
      .then(function () { state.studentsLoading = false; renderStudents(); });
  }
  function renderStudents() {
    var row = state.studentsClass; if (!row) return;
    var busy = Boolean(state.busy);
    $('students-help').textContent = row.name + ' · ' + state.students.length + ' students';
    $('students-title').textContent = 'Class Students (' + state.students.length + ')';
    $('student-form').hidden = !state.studentOpen;
    $('student-save').disabled = state.busy === 'student-create'; $('student-save').textContent = state.busy === 'student-create' ? 'Creating…' : 'Create Student';
    $('upload').disabled = state.busy === 'csv'; $('upload').textContent = state.busy === 'csv' ? 'Uploading…' : '▣ Bulk Upload Excel / CSV';
    var available = $('available'); available.textContent = '';
    if (state.studentsLoading) available.appendChild(el('p', { class: 'empty', text: 'Loading…' }));
    else if (!state.available.length) available.appendChild(el('p', { class: 'empty', text: 'No available students' }));
    else state.available.forEach(function (item) {
      var add = el('button', { type: 'button', text: 'Add', onclick: function () { studentAction('add', item); } }); add.disabled = busy;
      available.appendChild(el('div', { class: 'item' }, [el('span', { text: (item.studentNumber || '') + ' · ' + (studentName(item) || item.nameKh || '') }), add]));
    });
    var host = $('students'); host.textContent = '';
    state.students.forEach(function (item) {
      var letter = el('span', { class: 'avatar', text: (studentName(item) || '?').charAt(0) }), photo = letter;
      if (item.photo) { photo = el('img', { class: 'avatar', alt: '' }); photo.onerror = function () { if (photo.parentNode) photo.parentNode.replaceChild(letter, photo); }; photo.setAttribute('src', item.photo); }
      var remove = el('button', { type: 'button', class: 'danger', text: 'Delete', onclick: function () { studentAction('remove', item); } }); remove.disabled = busy;
      host.appendChild(el('tr', {}, [
        el('td', { text: item.studentNumber || '' }), el('td', {}, [photo]), el('td', { text: item.nameKh || '—' }), el('td', { text: studentName(item) || '—' }), el('td', { text: item.sex || '—' }),
        el('td', { text: item.dateOfBirth ? String(item.dateOfBirth).slice(0, 10) : '—' }), el('td', { text: item.phone || (item.user && item.user.phone) || '—' }), el('td', { text: item.address || '—' }),
        el('td', {}, [el('div', { class: 'cell-actions' }, [el('button', { type: 'button', text: 'Edit', onclick: function () { ui.navigate('classes/' + encodeURIComponent(row.id) + '/students/' + encodeURIComponent(item.id)); } }), remove])]),
      ]));
    });
    $('students-empty').hidden = state.studentsLoading || state.students.length > 0;
    var result = state.importResult;
    $('import-result').hidden = !result;
    if (result) {
      $('import-summary').textContent = (result.success || 0) + ' succeeded · ' + (result.errors || 0) + ' failed · ' + (result.skipped || 0) + ' skipped';
      var body = $('import-rows'); body.textContent = '';
      (result.details || []).forEach(function (item) {
        var status = String(item.status || '');
        body.appendChild(el('tr', {}, [el('td', { text: String(item.row === undefined ? '' : item.row) }), el('td', { text: item.id || '' }), el('td', { text: item.name || '' }),
          el('td', { class: /success|import|creat|ok/i.test(status) ? 'status-ok' : /skip/i.test(status) ? 'status-skip' : 'status-bad', text: status }), el('td', { text: item.error || 'Imported' })]));
      });
    }
  }
  function studentAction(kind, student) {
    var row = state.studentsClass;
    if (!row || (kind === 'remove' && !window.confirm('Remove ' + (student.name || student.studentNumber) + ' from this class?'))) return;
    state.busy = kind + ':' + student.id; show('students-error'); renderStudents();
    (kind === 'add' ? ui.api.post(path('classes/', row.id, '/students'), { studentId: student.id }) : ui.api.delete(path('classes/', row.id, '/students/', student.id)))
      .then(function () { return Promise.all([loadStudents(), loadClasses()]); })
      .catch(function (error) { show('students-error', error.message || 'Student action failed.'); })
      .then(function () { state.busy = ''; renderStudents(); });
  }
  function createStudent(event) {
    event.preventDefault();
    var row = state.studentsClass, values = {};
    studentFields.forEach(function (field) { values[field] = $('s-' + field).value; });
    show('students-error');
    if (!values.name.trim() || values.password.length < 6) { show('students-error', 'Latin name and a password of at least 6 characters are required.'); return; }
    // The same key is reused on a retry, so a repeated submit cannot create the student twice.
    state.studentKey = state.studentKey || newKey('class-student:');
    state.busy = 'student-create'; renderStudents();
    ui.api.post(path('classes/', row.id, '/students/create'), Object.assign({}, values, {
      commandKey: state.studentKey, studentNumber: values.studentNumber.trim() || null, email: values.email.trim() || null, phone: values.phone.trim() || null,
      photo: values.photo.trim() || null, dateOfBirth: values.dateOfBirth || null,
    })).then(function () {
      state.studentOpen = false; state.studentKey = '';
      studentFields.forEach(function (field) { $('s-' + field).value = ''; });
      show('students-message', 'Student login, class enrollment, QR code, and ID card were created.');
      return Promise.all([loadStudents(), loadClasses()]);
    }).catch(function (error) { show('students-error', error.message || 'Student could not be created.'); })
      .then(function () { state.busy = ''; renderStudents(); });
  }
  function readSpreadsheet(file) {
    if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return file.text();
    return file.arrayBuffer().then(function (buffer) { return window.WattanamXlsx.readCsv(buffer); });
  }
  function upload(event) {
    var file = event.target.files && event.target.files[0], row = state.studentsClass;
    event.target.value = '';
    if (!file || !row) return;
    state.busy = 'csv'; state.importResult = null; show('students-error'); show('students-message'); renderStudents();
    Promise.resolve().then(function () {
      if (file.size > 2 * 1024 * 1024) throw new Error('Spreadsheet must be 2 MB or smaller.');
      return readSpreadsheet(file);
    }).then(function (csv) { return ui.api.post(path('classes/', row.id, '/students/bulk-csv'), { csv: csv }); })
      .then(function (result) {
        result = result || {}; state.importResult = result;
        show('students-message', 'Import complete: ' + (result.success || 0) + ' succeeded, ' + (result.errors || 0) + ' failed, ' + (result.skipped || 0) + ' skipped.');
        return Promise.all([loadStudents(), loadClasses()]);
      }).catch(function (error) { show('students-error', error.message || 'Spreadsheet upload failed.'); })
      .then(function () { state.busy = ''; renderStudents(); });
  }
  function downloadTemplate() {
    download('student-import-template.xlsx', window.WattanamXlsx.write([templateHeaders, ['0001', 'Student Name', 'FEMALE', 'student@example.com', '012345678', 'change-me-123', '', '2008-01-01', 'Phnom Penh', '2026', 'ឈ្មោះសិស្ស']], 'Student Import'), XLSX_TYPE);
  }
  function exportStudents() {
    var row = state.studentsClass; if (!row) return;
    var data = state.students.map(function (item) {
      return [item.studentNumber, studentName(item), item.sex, item.email || (item.user && item.user.email), item.phone || (item.user && item.user.phone), '', item.photo, item.dateOfBirth ? String(item.dateOfBirth).slice(0, 10) : '', item.address, '', item.nameKh];
    });
    download(row.name + '-students.xlsx', window.WattanamXlsx.write([templateHeaders].concat(data), 'Students'), XLSX_TYPE);
  }

  // ---------- shell ----------
  function render() {
    $('list-view').hidden = state.view !== 'list';
    $('class-view').hidden = state.view !== 'class';
    $('days-view').hidden = state.view !== 'days';
    $('students-view').hidden = state.view !== 'students';
    if (state.view === 'list') renderList();
    if (state.view === 'class') renderClassForm();
    if (state.view === 'days') renderDaysForm();
    if (state.view === 'students') renderStudents();
  }
  function loadClasses() { return ui.api.get('classes').then(function (result) { state.classes = rows(result); }); }
  function load() {
    return Promise.all([ui.api.get('classes'), ui.api.get('study-years'), ui.api.get('teachers'), ui.api.get('class-admins')]).then(function (results) {
      state.classes = rows(results[0]); state.years = rows(results[1]); state.teachers = rows(results[2]); state.admins = rows(results[3]);
      render();
    });
  }

  $('query').addEventListener('input', function (event) { state.query = event.target.value; renderList(); });
  $('year').addEventListener('change', function (event) { state.year = event.target.value; renderList(); });
  $('sort').addEventListener('change', function (event) { state.sort = event.target.value; renderList(); });
  $('view-grid').addEventListener('click', function () { state.layout = 'grid'; renderList(); });
  $('view-list').addEventListener('click', function () { state.layout = 'list'; renderList(); });
  $('add-class').addEventListener('click', function () { openClass(null); });
  $('class-view').addEventListener('submit', saveClass);
  $('days-view').addEventListener('submit', saveDays);
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (button) { button.addEventListener('click', function () { state.view = 'list'; render(); }); });
  $('c-thumb').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0]; if (!file) return;
    imageData(file).then(function (data) { state.form.thumbnail = data; show('class-error'); renderClassForm(); }).catch(function (error) { show('class-error', error.message || 'Upload failed.'); });
  });
  $('c-thumb-remove').addEventListener('click', function () { state.form.thumbnail = ''; $('c-thumb').value = ''; renderClassForm(); });
  $('new-student').addEventListener('click', function () { state.studentOpen = !state.studentOpen; state.studentKey = ''; renderStudents(); });
  $('student-cancel').addEventListener('click', function () { state.studentOpen = false; renderStudents(); });
  $('student-form').addEventListener('submit', createStudent);
  $('upload').addEventListener('click', function () { $('upload-file').click(); });
  $('upload-file').addEventListener('change', upload);
  $('template').addEventListener('click', downloadTemplate);
  $('export').addEventListener('click', exportStudents);

  render();
  ui.autoResize();
  ui.connect().then(load)
    .catch(function (error) { show('error', error.message || 'Classes could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); render(); });
})();
