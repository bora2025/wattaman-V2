/* Attendance Dashboard: Academic Management's own dashboard, cloned from the school's original
 * admin dashboard. Plugin API: GET dashboard/day?date=, dashboard/month?year=&month=,
 * dashboard/milestones. Refreshes every 30 seconds while showing today, and when the tab returns. */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;
  var COLORS = { present: '#10b981', late: '#f59e0b', absent: '#ef4444', permission: '#3b82f6', off: '#cbd5e1' };
  var LABELS = { present: 'Present', late: 'Late', absent: 'Absent', permission: 'Permission', off: 'Day off' };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var ACTIONS = [
    ['Take attendance', 'attendance', '📷', 'linear-gradient(135deg,#a855f7,#d946ef)'],
    ['Edit attendance', 'corrections', '✏️', 'linear-gradient(135deg,#6366f1,#3b82f6)'],
    ['Reports', 'reports', '📊', 'linear-gradient(135deg,#10b981,#14b8a6)'],
    ['Staff reports', 'staff-attendance-reports', '👥', 'linear-gradient(135deg,#06b6d4,#0ea5e9)'],
    ['Classes', 'classes', '🏫', 'linear-gradient(135deg,#f59e0b,#f97316)'],
    ['Sessions', 'settings', '⏰', 'linear-gradient(135deg,#8b5cf6,#a855f7)'],
    ['Transcripts', 'transcripts', '📜', 'linear-gradient(135deg,#f43f5e,#ec4899)'],
    ['Alerts', 'alerts', '🔔', 'linear-gradient(135deg,#eab308,#f59e0b)'],
  ];
  var PAGE = 100, POLL_MS = 30000;
  var state = {
    date: '', today: '', timeZone: 'Asia/Phnom_Penh', day: null, previous: null, month: null, milestones: null, activeMilestone: 3,
    role: 'all', group: '', status: 'all', search: '', visible: PAGE, classSearch: '', classSort: 'name', perfectAll: false,
    trendYear: 0, trendMonth: 0, updatedAt: null,
  };
  var token = 0;

  function $(id) { return document.getElementById(id); }
  var SVG = 'http://www.w3.org/2000/svg';
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
  function svg(tag, attributes, children) {
    var node = document.createElementNS(SVG, tag);
    Object.keys(attributes || {}).forEach(function (key) { if (key === 'text') node.textContent = attributes[key]; else node.setAttribute(key, attributes[key]); });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }
  function show(id, text) { var node = $(id); node.textContent = text || ''; node.hidden = !text; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function addDays(day, n) { var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function longDate(day) { return new Date(day + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); }
  function pct(value, total) { return total > 0 ? Math.round((value / total) * 100) : 0; }
  function initials(name) { return String(name || '?').trim().charAt(0).toUpperCase() || '?'; }

  // ---------- clock ----------
  function schoolNow() {
    try { return new Date().toLocaleTimeString('en-GB', { timeZone: state.timeZone, hour12: false }); } catch (error) { return new Date().toLocaleTimeString(); }
  }
  function tick() {
    $('clock').textContent = schoolNow();
    var hour = Number(schoolNow().slice(0, 2));
    $('greeting').textContent = hour < 12 ? 'Good morning ☀️' : hour < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';
    var live = $('live'), isToday = state.date === state.today;
    live.className = 'live' + (isToday ? '' : ' past');
    if (!isToday) { $('live-text').textContent = 'Past day'; return; }
    var ago = state.updatedAt ? Math.floor((Date.now() - state.updatedAt) / 1000) : null;
    $('live-text').textContent = 'Live' + (ago === null ? '' : ago < 5 ? ' · just now' : ago < 60 ? ' · ' + ago + 's ago' : ' · ' + Math.floor(ago / 60) + 'm ago');
  }

  // ---------- hero ----------
  function ring(value, total, color, size, stroke, labelColor) {
    var r = (size - stroke) / 2, c = 2 * Math.PI * r, p = total > 0 ? value / total : 0;
    return svg('svg', { width: String(size), height: String(size), viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': Math.round(p * 100) + '%' }, [
      svg('circle', { cx: String(size / 2), cy: String(size / 2), r: String(r), fill: 'none', stroke: labelColor ? 'rgba(255,255,255,0.2)' : '#f3f4f6', 'stroke-width': String(stroke) }),
      svg('circle', { cx: String(size / 2), cy: String(size / 2), r: String(r), fill: 'none', stroke: color, 'stroke-width': String(stroke), 'stroke-linecap': 'round', 'stroke-dasharray': String(c), 'stroke-dashoffset': String(c - p * c), transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' }),
      svg('text', { x: String(size / 2), y: String(size / 2), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': String(size > 80 ? 26 : 10), 'font-weight': '800', fill: labelColor || '#4b5563', text: total > 0 ? Math.round(p * 100) + '%' : '0' }),
    ]);
  }
  function renderHero() {
    var day = state.day;
    $('date-title').textContent = longDate(state.date);
    $('date').value = state.date;
    show('holiday', day && day.holiday ? '🎉 Holiday: ' + day.holiday : '');
    var gauge = $('gauge'); gauge.textContent = '';
    var kpis = $('kpis'); kpis.textContent = '';
    if (!day) return;
    var s = day.students, f = day.staff;
    var expected = s.total - s.off + f.total - f.off, attended = s.present + s.late + f.present + f.late;
    gauge.appendChild(ring(attended, expected, '#34d399', 132, 12, '#fff'));
    gauge.appendChild(el('p', { class: 'muted-light', style: 'text-align:center;margin-top:-4px', text: 'Attendance' }));
    [['Total', s.total + f.total], ['Present', s.present + f.present], ['Absent', s.absent + f.absent], ['Late', s.late + f.late]].forEach(function (k) {
      kpis.appendChild(el('div', { class: 'kpi' }, [el('div', { text: k[0] }), el('strong', { text: String(k[1]) })]));
    });
  }

  // ---------- quick actions ----------
  function renderActions() {
    var host = $('actions'); host.textContent = '';
    ACTIONS.forEach(function (a) {
      host.appendChild(el('button', { type: 'button', class: 'action', onclick: function () { ui.navigate(a[1]); } }, [el('span', { class: 'emoji', style: 'background:' + a[3], text: a[2] }), a[0]]));
    });
  }

  // ---------- insights ----------
  function renderInsights() {
    var host = $('insights'); host.textContent = '';
    var day = state.day; if (!day) return;
    var classes = day.classProgress.filter(function (c) { return !c.off; });
    var perfectGroups = classes.filter(function (c) { return c.absent === 0 && c.late === 0 && c.total > 0; }).length;
    var perfectPeople = day.students.present;
    var permission = day.students.permission + day.staff.permission;
    var worst = classes.slice().sort(function (a, b) { return b.absent - a.absent; })[0];
    host.appendChild(el('div', { class: 'insight good' }, [el('span', { text: 'Perfect classes' }), el('strong', { text: String(perfectGroups) }), el('div', { text: 'No absent or late student' })]));
    host.appendChild(el('div', { class: 'insight good' }, [el('span', { text: 'On-time students' }), el('strong', { text: String(perfectPeople) }), el('div', { text: 'Present without being late' })]));
    host.appendChild(el('div', { class: 'insight info' }, [el('span', { text: 'Permission' }), el('strong', { text: String(permission) }), el('div', { text: 'Students and staff on permission today' })]));
    if (worst && worst.absent > 0) {
      host.appendChild(el('button', { type: 'button', class: 'insight warn', onclick: function () { setFilter('Student', 'absent', worst.classId); } }, [el('span', { text: 'Needs attention' }), el('strong', { text: worst.className }), el('div', { text: worst.absent + ' absent · tap to view' })]));
    } else {
      host.appendChild(el('div', { class: 'insight calm' }, [el('span', { text: 'Needs attention' }), el('strong', { text: 'All good ✓' }), el('div', { text: 'No class is flagged' })]));
    }
  }

  // ---------- summaries ----------
  function delta(current, previous, key) {
    if (!previous) return null;
    var diff = current[key] - previous[key];
    if (!diff) return el('div', { class: 'delta same', text: '= same as yesterday' });
    var good = key === 'present' ? diff > 0 : diff < 0;
    return el('div', { class: 'delta ' + (good ? 'up' : 'down'), text: (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff) + ' vs yesterday' });
  }
  function renderSummary(hostId, permId, kind, totals, previous) {
    var host = $(hostId); host.textContent = '';
    var expected = totals.total - totals.off;
    [['present', 'green', '✓'], ['absent', 'red', '✕'], ['late', 'orange', '⏱'], ['permission', 'blue', '📄']].forEach(function (s) {
      host.appendChild(el('button', { type: 'button', class: 'stat ' + s[1], 'aria-label': LABELS[s[0]] + ' ' + kind + ': ' + totals[s[0]], onclick: function () { setFilter(kind, s[0], ''); } }, [
        el('div', {}, [el('div', { class: 'label', text: s[2] + ' ' + LABELS[s[0]] }), el('div', { class: 'value', text: String(totals[s[0]]) }), el('div', { class: 'of', text: 'of ' + expected + (totals.off ? ' (' + totals.off + ' day off)' : '') }), delta(totals, previous, s[0])]),
        ring(totals[s[0]], expected, COLORS[s[0]], 48, 4),
      ]));
    });
    var b = totals.permissionBreakdown;
    $(permId).textContent = totals.permission ? 'Permission types: morning half = ' + b.halfDayMorning + ' · afternoon half = ' + b.halfDayAfternoon + ' · full day = ' + b.fullDay + ' · multi-day = ' + b.multiDay + (b.unknown ? ' · other = ' + b.unknown : '') : '';
  }

  // ---------- class progress ----------
  function renderProgress() {
    var host = $('class-progress'); host.textContent = '';
    var rows = (state.day ? state.day.classProgress : []).filter(function (c) { return c.className.toLowerCase().indexOf(state.classSearch.toLowerCase()) >= 0; });
    rows.sort(function (a, b) { return state.classSort === 'pctAsc' ? a.pctScanned - b.pctScanned : state.classSort === 'pctDesc' ? b.pctScanned - a.pctScanned : a.className.localeCompare(b.className); });
    rows.forEach(function (c) {
      var bar = el('div', { class: 'bar', title: c.pctScanned + '% scanned' });
      ['present', 'late', 'permission', 'absent'].forEach(function (k) { if (c[k]) bar.appendChild(el('span', { style: 'width:' + pct(c[k], c.total) + '%;background:' + COLORS[k] })); });
      host.appendChild(el('div', { class: 'progress-row' }, [
        el('div', {}, [el('strong', { text: c.className }), el('div', { class: 'muted small', text: c.off ? 'Day off' : c.pctScanned + '% scanned · ' + c.pctPresent + '% on time' })]),
        c.off ? el('span', { class: 'off-tag', text: 'Not a study day' }) : bar,
        el('div', { class: 'counts' }, [el('span', {}, ['✓ ', el('b', { text: String(c.present) })]), el('span', {}, ['⏱ ', el('b', { text: String(c.late) })]), el('span', {}, ['📄 ', el('b', { text: String(c.permission) })]), el('span', {}, ['✕ ', el('b', { text: String(c.absent) })]), el('span', { text: '/ ' + c.total })]),
      ]));
    });
    if (!rows.length) host.appendChild(el('p', { class: 'empty', text: 'No classes.' }));
  }

  // ---------- donuts ----------
  function donut(hostId, totals) {
    var host = $(hostId); host.textContent = '';
    var parts = ['present', 'late', 'permission', 'absent'].map(function (k) { return [k, totals[k]]; }).filter(function (p) { return p[1] > 0; });
    var sum = parts.reduce(function (s, p) { return s + p[1]; }, 0);
    if (!sum) { host.appendChild(el('p', { class: 'muted small', text: 'No data' })); return; }
    var size = 170, r = 62, c = 2 * Math.PI * r, offset = 0;
    var chart = svg('svg', { width: String(size), height: String(size), viewBox: '0 0 170 170', role: 'img', 'aria-label': 'Attendance distribution' });
    parts.forEach(function (p) {
      var length = (p[1] / sum) * c;
      chart.appendChild(svg('circle', { cx: '85', cy: '85', r: String(r), fill: 'none', stroke: COLORS[p[0]], 'stroke-width': '26', 'stroke-dasharray': length + ' ' + (c - length), 'stroke-dashoffset': String(-offset), transform: 'rotate(-90 85 85)' }));
      offset += length;
    });
    chart.appendChild(svg('text', { x: '85', y: '80', 'text-anchor': 'middle', 'font-size': '24', 'font-weight': '900', fill: '#0f172a', text: String(sum) }));
    chart.appendChild(svg('text', { x: '85', y: '100', 'text-anchor': 'middle', 'font-size': '11', fill: '#64748b', text: 'recorded' }));
    host.appendChild(chart);
    host.appendChild(el('div', { class: 'donut-legend' }, parts.map(function (p) { return el('div', {}, [el('span', { style: 'background:' + COLORS[p[0]] }), LABELS[p[0]] + ' ' + p[1] + ' (' + pct(p[1], sum) + '%)']); })));
  }

  // ---------- monthly trend ----------
  function renderTrend() {
    var host = $('trend'); host.textContent = '';
    var data = state.month ? state.month.trend : [];
    var series = [['studentPresent', '#8b5cf6', false, 'Students present'], ['studentAbsent', '#a78bfa', true, 'Students absent'], ['staffPresent', '#06b6d4', false, 'Staff present'], ['staffAbsent', '#67e8f9', true, 'Staff absent']];
    var max = 1; data.forEach(function (d) { series.forEach(function (s) { max = Math.max(max, d[s[0]]); }); });
    if (!data.length || !data.some(function (d) { return series.some(function (s) { return d[s[0]] > 0; }); })) { host.appendChild(el('p', { class: 'empty', text: 'No attendance recorded this month.' })); $('trend-legend').textContent = ''; return; }
    var W = 760, H = 260, L = 34, R = 10, T = 12, B = 26, w = W - L - R, h = H - T - B;
    var x = function (i) { return L + (data.length > 1 ? (i / (data.length - 1)) * w : 0); };
    var y = function (v) { return T + h - (v / max) * h; };
    var chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Monthly attendance trend' });
    for (var g = 0; g <= 4; g += 1) {
      var v = Math.round((max / 4) * g);
      chart.appendChild(svg('line', { x1: String(L), x2: String(W - R), y1: String(y(v)), y2: String(y(v)), stroke: '#f1f5f9' }));
      chart.appendChild(svg('text', { x: String(L - 6), y: String(y(v) + 4), 'text-anchor': 'end', 'font-size': '10', fill: '#94a3b8', text: String(v) }));
    }
    data.forEach(function (d, i) { if (i % Math.ceil(data.length / 10) === 0 || i === data.length - 1) chart.appendChild(svg('text', { x: String(x(i)), y: String(H - 8), 'text-anchor': 'middle', 'font-size': '10', fill: '#94a3b8', text: String(d.day) })); });
    series.forEach(function (s) {
      var points = data.map(function (d, i) { return x(i) + ',' + y(d[s[0]]); }).join(' ');
      chart.appendChild(svg('polyline', { points: points, fill: 'none', stroke: s[1], 'stroke-width': '2.5', 'stroke-dasharray': s[2] ? '6 5' : '', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });
    host.appendChild(chart);
    var legend = $('trend-legend'); legend.textContent = '';
    series.forEach(function (s) { legend.appendChild(el('span', { style: 'color:' + s[1] }, [el('i', { class: s[2] ? 'dash' : '', style: 'background:' + s[1] }), s[3]])); });
  }
  function renderTrendControls() {
    var m = $('trend-month'), y = $('trend-year');
    if (!m.options.length) {
      MONTHS.forEach(function (name, i) { m.appendChild(el('option', { value: String(i + 1), text: name })); });
      var now = Number(state.today.slice(0, 4)); for (var year = now; year >= now - 4; year -= 1) y.appendChild(el('option', { value: String(year), text: String(year) }));
    }
    m.value = String(state.trendMonth); y.value = String(state.trendYear);
  }

  // ---------- perfect attendance ----------
  function personCard(s) {
    var avatar = el('span', { class: 'avatar', text: initials(s.nameKh || s.name) });
    if (s.photo) { var img = el('img', { class: 'avatar', alt: '' }); img.onerror = function () { if (img.parentNode) img.parentNode.replaceChild(avatar, img); }; img.setAttribute('src', s.photo); avatar = img; }
    return el('div', { class: 'person' }, [avatar, el('div', { style: 'min-width:0' }, [el('p', { text: s.nameKh || s.name }), el('small', { text: s.className + (s.presentDays ? ' · ' + s.presentDays + ' present' : '') })])]);
  }
  function renderPerfect() {
    var list = state.month ? state.month.perfect : [];
    $('perfect-count').textContent = String(list.length);
    var host = $('perfect-list'); host.textContent = '';
    (state.perfectAll ? list : list.slice(0, 12)).forEach(function (s) { host.appendChild(personCard(s)); });
    if (!list.length) host.appendChild(el('p', { class: 'muted small', text: 'No student has perfect attendance this month yet.' }));
    $('perfect-more').hidden = list.length <= 12;
    $('perfect-more').textContent = state.perfectAll ? 'Show fewer' : 'Show all ' + list.length;
  }

  // ---------- milestones ----------
  function renderMilestones() {
    var data = state.milestones; if (!data) return;
    var latest = [9, 6, 3].filter(function (n) { return data.milestones[n].reached; })[0];
    var badge = $('milestone-badge');
    badge.hidden = !latest; if (latest) badge.textContent = data.milestones[latest].students.length + ' · ' + latest + ' months';
    if ($('milestones').hidden) return;
    var current = data.milestones[state.activeMilestone];
    $('milestone-help').textContent = (data.studyYear ? 'Study year ' + data.studyYear + ' · ' : '') + current.periodStart + ' → ' + current.periodEnd + (current.reached ? '' : ' · not reached yet');
    var tabs = $('milestone-tabs'); tabs.textContent = '';
    [3, 6, 9].forEach(function (n) { tabs.appendChild(el('button', { type: 'button', 'aria-selected': String(state.activeMilestone === n), onclick: function () { state.activeMilestone = n; renderMilestones(); } }, [n + ' months' + (data.milestones[n].reached ? ' (' + data.milestones[n].students.length + ')' : ' 🔒')])); });
    var query = $('milestone-search').value.toLowerCase();
    var host = $('milestone-list'); host.textContent = '';
    current.students.filter(function (s) { return (s.name + ' ' + s.nameKh + ' ' + s.className + ' ' + s.studentNumber).toLowerCase().indexOf(query) >= 0; }).forEach(function (s) { host.appendChild(personCard(s)); });
    if (!host.childNodes.length) host.appendChild(el('p', { class: 'muted small', text: current.reached ? 'No student matches.' : 'This milestone has not been reached yet.' }));
  }

  // ---------- detailed table ----------
  function setFilter(role, status, group) {
    state.role = role; state.status = status; state.group = group || ''; state.visible = PAGE;
    renderTable();
    $('rows').scrollIntoView({ block: 'center' });
  }
  function filtered() {
    var q = state.search.toLowerCase();
    return (state.day ? state.day.people : []).filter(function (p) {
      return (state.role === 'all' || p.kind === state.role) && (state.status === 'all' || p.status === state.status) && (!state.group || p.groupId === state.group)
        && (p.name + ' ' + p.nameKh + ' ' + p.number + ' ' + p.group).toLowerCase().indexOf(q) >= 0;
    });
  }
  function renderTable() {
    var groups = $('group'), keep = state.group; groups.textContent = '';
    groups.appendChild(el('option', { value: '', text: 'All classes & departments' }));
    var seen = {};
    (state.day ? state.day.people : []).forEach(function (p) { if (p.groupId && !seen[p.groupId] && (state.role === 'all' || p.kind === state.role)) { seen[p.groupId] = true; groups.appendChild(el('option', { value: p.groupId, text: (p.kind === 'Student' ? '🏫 ' : '🏢 ') + p.group })); } });
    groups.value = seen[keep] ? keep : ''; state.group = groups.value;
    $('role').value = state.role; $('search').value = state.search;
    var pills = $('status-pills'); pills.textContent = '';
    [['all', 'All', '#334155'], ['present', 'Present', COLORS.present], ['absent', 'Absent', COLORS.absent], ['late', 'Late', COLORS.late], ['permission', 'Permission', COLORS.permission], ['off', 'Day off', '#64748b']].forEach(function (p) {
      var active = state.status === p[0];
      pills.appendChild(el('button', { type: 'button', 'aria-pressed': String(active), style: 'border-color:' + p[2] + ';' + (active ? 'background:' + p[2] + ';color:#fff' : 'background:#fff;color:' + p[2]), onclick: function () { state.status = p[0]; state.visible = PAGE; renderTable(); } }, [p[1]]));
    });
    var list = filtered(), body = $('rows'); body.textContent = '';
    list.slice(0, state.visible).forEach(function (p) {
      body.appendChild(el('tr', {}, [el('td', { text: p.number }), el('td', { text: p.name + (p.nameKh && p.nameKh !== p.name ? ' · ' + p.nameKh : '') }), el('td', { text: p.kind === 'Student' ? 'Student' : 'Staff' }), el('td', { text: p.group || '—' }), el('td', {}, [el('span', { class: 'st ' + p.status, text: LABELS[p.status] })]), el('td', { text: p.kind === 'Student' ? p.address || '' : String(p.position || '').replace(/_/g, ' ').toLowerCase() })]));
    });
    $('rows-empty').hidden = list.length > 0;
    $('rows-more').hidden = list.length <= state.visible;
    $('rows-more').textContent = 'Show more (' + (list.length - state.visible) + ' left)';
    $('clear-filters').hidden = state.role === 'all' && state.status === 'all' && !state.group && !state.search;
  }
  function exportCsv() {
    var q = function (v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; };
    var lines = [['ID', 'Name', 'Khmer name', 'Role', 'Class / Department', 'Status', 'Address / Position'].map(q).join(',')];
    filtered().forEach(function (p) { lines.push([p.number, p.name, p.nameKh, p.kind, p.group, LABELS[p.status], p.kind === 'Student' ? p.address : p.position].map(q).join(',')); });
    var url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    var a = el('a', { href: url, download: 'attendance-' + state.date + '.csv' }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- data ----------
  function renderAll() {
    renderHero(); renderInsights();
    if (state.day) {
      renderSummary('student-summary', 'student-permissions', 'Student', state.day.students, state.previous && state.previous.students);
      renderSummary('staff-summary', 'staff-permissions', 'Staff', state.day.staff, state.previous && state.previous.staff);
      donut('student-donut', state.day.students); donut('staff-donut', state.day.staff);
    }
    renderProgress(); renderTable(); tick();
  }
  function loadDay(silent) {
    var mine = ++token, date = state.date;
    if (!silent) $('app').setAttribute('aria-busy', 'true');
    // The day first (it tells us which date "today" is), then the day before for the comparison.
    return ui.api.get('dashboard/day', date ? { date: date } : undefined)
      .then(function (current) { return ui.api.get('dashboard/day', { date: addDays(current.date, -1) }).catch(function () { return null; }).then(function (previous) { return [current, previous]; }); })
      .then(function (results) {
        if (mine !== token) return;
        state.day = results[0]; state.previous = results[1]; state.date = state.day.date; state.today = state.day.today; state.timeZone = state.day.timeZone || state.timeZone;
        state.updatedAt = Date.now(); show('error'); renderAll();
      })
      .catch(function (error) { if (mine === token) show('error', error.message || 'The dashboard could not be loaded.'); })
      .then(function () { if (mine === token) $('app').setAttribute('aria-busy', 'false'); });
  }
  function loadMonth() {
    return ui.api.get('dashboard/month', { year: state.trendYear, month: state.trendMonth })
      .then(function (month) { state.month = month; renderTrend(); renderPerfect(); })
      .catch(function (error) { show('error', error.message || 'The monthly trend could not be loaded.'); });
  }
  function loadMilestones() {
    return ui.api.get('dashboard/milestones').then(function (data) { state.milestones = data; renderMilestones(); }).catch(function () { /* optional */ });
  }

  // ---------- events ----------
  $('date').addEventListener('change', function (e) { if (e.target.value) { state.date = e.target.value; state.previous = null; loadDay(false); } });
  $('today').addEventListener('click', function () { state.date = state.today; loadDay(false); });
  $('refresh').addEventListener('click', function () { loadDay(false); loadMonth(); });
  $('class-search').addEventListener('input', function (e) { state.classSearch = e.target.value; renderProgress(); });
  $('class-sort').addEventListener('change', function (e) { state.classSort = e.target.value; renderProgress(); });
  $('trend-month').addEventListener('change', function (e) { state.trendMonth = Number(e.target.value); loadMonth(); });
  $('trend-year').addEventListener('change', function (e) { state.trendYear = Number(e.target.value); loadMonth(); });
  $('perfect-more').addEventListener('click', function () { state.perfectAll = !state.perfectAll; renderPerfect(); });
  $('open-milestones').addEventListener('click', function () { $('milestones').hidden = false; var latest = state.milestones && [9, 6, 3].filter(function (n) { return state.milestones.milestones[n].reached; })[0]; if (latest) state.activeMilestone = latest; renderMilestones(); $('milestones').scrollIntoView({ block: 'start' }); });
  $('close-milestones').addEventListener('click', function () { $('milestones').hidden = true; });
  $('milestone-search').addEventListener('input', renderMilestones);
  $('search').addEventListener('input', function (e) { state.search = e.target.value; state.visible = PAGE; renderTable(); });
  $('role').addEventListener('change', function (e) { state.role = e.target.value; state.visible = PAGE; renderTable(); });
  $('group').addEventListener('change', function (e) { state.group = e.target.value; state.visible = PAGE; renderTable(); });
  $('rows-more').addEventListener('click', function () { state.visible += PAGE; renderTable(); });
  $('clear-filters').addEventListener('click', function () { state.role = 'all'; state.status = 'all'; state.group = ''; state.search = ''; renderTable(); });
  $('export').addEventListener('click', exportCsv);
  // Keyboard shortcuts of the original: T = today, R = refresh, / = search.
  document.addEventListener('keydown', function (e) {
    var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.key === '/') { e.preventDefault(); $('search').focus(); }
    else if (e.key === 't' || e.key === 'T') { state.date = state.today; loadDay(false); }
    else if (e.key === 'r' || e.key === 'R') loadDay(false);
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && state.date === state.today) loadDay(true); });
  setInterval(function () { if (state.date && state.date === state.today && document.visibilityState !== 'hidden') loadDay(true); }, POLL_MS);
  setInterval(tick, 1000);

  renderActions();
  ui.autoResize();
  ui.connect().then(function () {
    return loadDay(false).then(function () {
      state.trendYear = Number(state.today.slice(0, 4)); state.trendMonth = Number(state.today.slice(5, 7));
      renderTrendControls();
      return Promise.all([loadMonth(), loadMilestones()]);
    });
  }).catch(function (error) { show('error', error.message || 'The dashboard could not be loaded.'); })
    .then(function () { $('app').setAttribute('aria-busy', 'false'); });
})();
