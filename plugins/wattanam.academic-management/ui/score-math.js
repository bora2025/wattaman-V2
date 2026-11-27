/* Score arithmetic shared by Academic Transcripts and Score Sheets (and the plugin's tests).
 * The ministry score sheet model:
 *   - A subject with parts (e.g. Khmer = dictation + composition + reading speed) scores the sum of
 *     its parts; the parts themselves are not counted again in the total.
 *   - Total = sum of the counted subjects' scores.
 *   - Average = total / sum of the counted subjects' coefficients (មេគុណ).
 *   - Grades A-F use the share of the best possible average: A >= 90%, B >= 80%, C >= 70%,
 *     D >= 60%, E >= 50% (passes the average), F below.
 *   - Semester average = (average of the monthly averages + semester exam average) / 2.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WattanamScoreMath = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // The ministry scale (the default). A score sheet may save its own: six levels, highest first, each
  // with a letter, a Khmer name and its minimum as a percentage of the best possible; the last is 0
  // (below the pass mark). level 0..5 drives colours and the summary rows whatever the letters are.
  var GRADES = [
    { letter: 'A', min: 90, kh: 'ល្អប្រសើរ', en: 'Excellent', level: 0 },
    { letter: 'B', min: 80, kh: 'ល្អណាស់', en: 'Very good', level: 1 },
    { letter: 'C', min: 70, kh: 'ល្អ', en: 'Good', level: 2 },
    { letter: 'D', min: 60, kh: 'ល្អបង្គួរ', en: 'Fairly good', level: 3 },
    { letter: 'E', min: 50, kh: 'មធ្យម', en: 'Average', level: 4 },
    { letter: 'F', min: 0, kh: 'ខ្សោយ', en: 'Weak', level: 5 },
  ];
  var LETTERS = GRADES.map(function (g) { return g.letter; });
  // A saved scale when it is complete and in order; otherwise the ministry scale.
  function grades(scale) {
    if (!Array.isArray(scale) || scale.length !== GRADES.length) return GRADES;
    var out = scale.map(function (g, i) {
      return { letter: String((g && g.letter) || '').trim() || GRADES[i].letter, kh: String((g && g.kh) || '').trim() || GRADES[i].kh, en: GRADES[i].en, min: i === scale.length - 1 ? 0 : Number(g && g.min), level: i };
    });
    for (var i = 0; i < out.length - 1; i += 1) if (!(out[i].min > out[i + 1].min) || !(out[i].min <= 100)) return GRADES;
    return out;
  }
  function gradeClass(g) { return g ? 'g-' + 'ABCDEF'.charAt(g.level) : ''; }

  function num(value) { return value === null || value === undefined || value === '' || !isFinite(Number(value)) ? null : Number(value); }
  function round2(value) { return Math.round(value * 100) / 100; }

  // Orders subjects (parents followed by their parts) and works out what counts.
  // options.coefficient: the class's មេគុណ (the total is divided by it); empty = sum of the subjects' coefficients.
  // options.averageMax: what a full average is worth for grading (e.g. 50); empty = best total / មេគុណ.
  function model(subjects, options) {
    var list = (subjects || []).slice();
    var byId = {}; list.forEach(function (s) { byId[s.id] = s; });
    var parts = {};
    list.forEach(function (s) { if (s.parentId && byId[s.parentId]) (parts[s.parentId] = parts[s.parentId] || []).push(s); });
    var counted = list.filter(function (s) { return !(s.parentId && byId[s.parentId]); });
    var coefficient = function (s) { var c = num(s.coefficient); return c === null ? 1 : c; };
    var autoCoefficient = counted.reduce(function (sum, s) { return sum + coefficient(s); }, 0);
    var fixed = num(options && options.coefficient), fixedMax = num(options && options.averageMax);
    var sumCoefficient = fixed !== null && fixed > 0 ? fixed : autoCoefficient;
    var maxTotal = counted.reduce(function (sum, s) { return sum + Number(s.maxScore || 0); }, 0);
    var autoAverageMax = sumCoefficient > 0 ? maxTotal / sumCoefficient : 0;
    var scale = grades(options && options.grades);
    // Columns as printed: each part just before the subject it makes up (as in the ministry sheet).
    var columns = [];
    counted.forEach(function (s) { (parts[s.id] || []).forEach(function (p) { columns.push(p); }); columns.push(s); });
    return {
      subjects: list, counted: counted, columns: columns, parts: parts, byId: byId,
      sumCoefficient: sumCoefficient, autoCoefficient: autoCoefficient, maxTotal: maxTotal,
      maxAverage: fixedMax !== null && fixedMax > 0 ? fixedMax : autoAverageMax, autoAverageMax: autoAverageMax,
      grades: scale, gradeOf: function (score, max) { return gradeOf(score, max, scale); },
      isComputed: function (s) { return Boolean(parts[s.id] && parts[s.id].length); },
      isPart: function (s) { return Boolean(s.parentId && byId[s.parentId]); },
    };
  }

  // A subject's score for one student: parts add up into their subject.
  function subjectScore(m, subject, scores) {
    var own = scores || {};
    if (m.isComputed(subject)) {
      var values = m.parts[subject.id].map(function (p) { return num(own[p.id]); }).filter(function (v) { return v !== null; });
      return values.length ? round2(values.reduce(function (a, b) { return a + b; }, 0)) : null;
    }
    return num(own[subject.id]);
  }

  function gradeOf(score, max, scale) {
    var list = scale || GRADES, s = num(score), top = Number(max);
    if (s === null || !(top > 0)) return null;
    var pct = (s / top) * 100;
    for (var i = 0; i < list.length; i += 1) if (pct >= list[i].min - 1e-9) return list[i];
    return list[list.length - 1];
  }

  // One student's result for one month (or exam).
  function result(m, scores) {
    var any = false, total = 0;
    var bySubject = {};
    m.columns.forEach(function (s) {
      var value = subjectScore(m, s, scores);
      bySubject[s.id] = value;
      if (value !== null) { any = true; if (!m.isPart(s)) total += value; }
    });
    var average = any && m.sumCoefficient > 0 ? total / m.sumCoefficient : null;
    return { hasScores: any, total: any ? round2(total) : null, average: average === null ? null : round2(average), scores: bySubject, grade: average === null ? null : gradeOf(average, m.maxAverage, m.grades) };
  }

  // Semester: the months' averages averaged, then halved with the exam average.
  function semester(monthAverages, examAverage) {
    var months = (monthAverages || []).map(num).filter(function (v) { return v !== null; });
    var monthly = months.length ? months.reduce(function (a, b) { return a + b; }, 0) / months.length : null;
    var exam = num(examAverage);
    var value = monthly !== null && exam !== null ? (monthly + exam) / 2 : monthly !== null ? monthly : exam;
    return { monthly: monthly === null ? null : round2(monthly), exam: exam === null ? null : round2(exam), average: value === null ? null : round2(value) };
  }

  // Competition ranking (1, 2, 2, 4) by a value, highest first; people without a value have no rank.
  function ranks(items) {
    var ranked = items.filter(function (i) { return num(i.value) !== null; }).sort(function (a, b) { return Number(b.value) - Number(a.value); });
    var map = {};
    ranked.forEach(function (item, index) {
      map[item.id] = index > 0 && Number(ranked[index - 1].value) === Number(item.value) ? map[ranked[index - 1].id] : index + 1;
    });
    return map;
  }

  return { GRADES: GRADES, LETTERS: LETTERS, grades: grades, gradeClass: gradeClass, model: model, subjectScore: subjectScore, gradeOf: gradeOf, result: result, semester: semester, ranks: ranks, round2: round2 };
});
