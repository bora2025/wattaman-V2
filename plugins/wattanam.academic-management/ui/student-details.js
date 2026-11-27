/* Student details shared by Register New Student, Edit Student and the Teacher Portal's My Class:
 * place of birth, current address and parents (backend/student-details.js keeps the same keys).
 *   WattanamStudentDetails.render(host, { gridClass })  draws the three groups into host
 *   .read(host)            { key: text } for every detail
 *   .fill(host, student)   puts a student's details into the fields
 *   .KEYS, .HEADERS        the keys, and the spreadsheet columns in the same order
 *   .row(student)          a student's details in spreadsheet column order */
(function () {
  'use strict';
  var GROUPS = [
    { title: 'Place of birth', kh: 'ទីកន្លែងកំណើត', fields: [
      ['birthVillage', 'Village', 'ភូមិ'], ['birthCommune', 'Commune / Sangkat', 'ឃុំ/សង្កាត់'],
      ['birthDistrict', 'District / Khan', 'ស្រុក/ខណ្ឌ'], ['birthProvince', 'Province / City', 'ខេត្ត/រាជធានី'],
    ] },
    { title: 'Current address', kh: 'អាសយដ្ឋានបច្ចុប្បន្ន', fields: [
      ['houseNo', 'House no.', 'ផ្ទះលេខ'], ['street', 'Street', 'ផ្លូវ'], ['village', 'Village / Group', 'ភូមិ/ក្រុម'],
      ['commune', 'Commune / Sangkat', 'ឃុំ/សង្កាត់'], ['district', 'District / Khan', 'ស្រុក/ខណ្ឌ'], ['province', 'Province / City', 'ខេត្ត/រាជធានី'],
    ] },
    { title: 'Parents', kh: 'ឪពុកម្ដាយ', fields: [
      ['fatherName', 'Father’s name', 'ឈ្មោះឪពុក'], ['fatherJob', 'Father’s job', 'មុខរបរឪពុក'], ['fatherPhone', 'Father’s phone', 'ទូរស័ព្ទឪពុក', 'tel'],
      ['motherName', 'Mother’s name', 'ឈ្មោះម្ដាយ'], ['motherJob', 'Mother’s job', 'មុខរបរម្ដាយ'], ['motherPhone', 'Mother’s phone', 'ទូរស័ព្ទម្ដាយ', 'tel'],
    ] },
  ];
  var KEYS = [], HEADERS = [];
  var HEADER = {
    birthVillage: 'Birth Village (ភូមិកំណើត)', birthCommune: 'Birth Commune (ឃុំ/សង្កាត់កំណើត)', birthDistrict: 'Birth District (ស្រុក/ខណ្ឌកំណើត)', birthProvince: 'Birth Province (ខេត្ត/រាជធានីកំណើត)',
    houseNo: 'House No (ផ្ទះលេខ)', street: 'Street (ផ្លូវ)', village: 'Village (ភូមិ/ក្រុម)', commune: 'Commune (ឃុំ/សង្កាត់)', district: 'District (ស្រុក/ខណ្ឌ)', province: 'Province (ខេត្ត/រាជធានី)',
    fatherName: 'Father Name (ឈ្មោះឪពុក)', fatherJob: 'Father Job (មុខរបរឪពុក)', fatherPhone: 'Father Phone (ទូរស័ព្ទឪពុក)',
    motherName: 'Mother Name (ឈ្មោះម្ដាយ)', motherJob: 'Mother Job (មុខរបរម្ដាយ)', motherPhone: 'Mother Phone (ទូរស័ព្ទម្ដាយ)',
  };
  GROUPS.forEach(function (g) { g.fields.forEach(function (f) { KEYS.push(f[0]); HEADERS.push(HEADER[f[0]]); }); });

  function make(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') node.textContent = attrs[k]; else node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function render(host, options) {
    options = options || {};
    host.textContent = '';
    GROUPS.forEach(function (g) {
      var grid = make('div', { class: options.gridClass || 'detail-grid' });
      g.fields.forEach(function (f) {
        var input = make('input', { 'data-detail': f[0], name: f[0], maxlength: /Phone$/.test(f[0]) ? '40' : '160', autocomplete: 'off', type: f[3] || 'text' });
        grid.appendChild(make('label', {}, [f[1] + ' · ' + f[2], input]));
      });
      host.appendChild(make('fieldset', { class: 'student-details', 'data-group': g.fields[0][0] }, [make('legend', { text: g.title + ' · ' + g.kh }), grid]));
    });
  }
  function inputs(host) { return Array.prototype.slice.call(host.querySelectorAll('[data-detail]')); }
  function read(host) { var out = {}; inputs(host).forEach(function (i) { out[i.getAttribute('data-detail')] = i.value.trim(); }); return out; }
  function fill(host, student) { inputs(host).forEach(function (i) { var v = student && student[i.getAttribute('data-detail')]; i.value = v === undefined || v === null ? '' : String(v); }); }
  function row(student) { return KEYS.map(function (k) { return (student && student[k]) || ''; }); }

  window.WattanamStudentDetails = { KEYS: KEYS, HEADERS: HEADERS, GROUPS: GROUPS, render: render, read: read, fill: fill, row: row };
})();
