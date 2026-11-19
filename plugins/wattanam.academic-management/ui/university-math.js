/* University result arithmetic, shared by the University Score Sheets screen and the plugin's tests.
 *   - Each semester has its own subjects; every subject has a score (0 to its maximum, usually 100)
 *     and a letter from the sheet's grade scale (by the score's share of the maximum).
 *   - Total (សរុប) = the sum of all the year's subject scores.
 *   - Average (ម.ភាគ) = total ÷ the sum of the subjects' maximums × 100 (with maximums of 100:
 *     total ÷ number of subjects). A subject without a score counts 0 once the student has any score.
 *   - Grade (និទ្ទេស) is the average's letter; GPA is that grade's GPA on the scale.
 *   - Rank (ចំណាត់ថ្នាក់): by total, highest first; equal totals share a rank (1, 2, 2, 4).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WattanamUniversityMath = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // The default scale (as the school's university result sheet): letter, Khmer name, from % of the maximum, GPA.
  var SCALE = [
    { letter: 'A', kh: 'ល្អប្រសើរ', min: 85, gpa: 4 },
    { letter: 'B+', kh: 'ល្អណាស់', min: 80, gpa: 3.75 },
    { letter: 'B', kh: 'ល្អ', min: 70, gpa: 3.5 },
    { letter: 'C+', kh: 'ល្អបង្គួរ', min: 65, gpa: 3 },
    { letter: 'C', kh: 'មធ្យម', min: 50, gpa: 2.5 },
    { letter: 'D', kh: 'ខ្សោយ', min: 45, gpa: 2.25 },
    { letter: 'E', kh: 'ខ្សោយណាស់', min: 40, gpa: 2 },
    { letter: 'F', kh: 'ធ្លាក់', min: 0, gpa: 1.75 },
  ];
  function round2(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
  function scaleOf(scale) { return Array.isArray(scale) && scale.length >= 2 ? scale : SCALE; }
  // The grade of a score out of max (null when there is no score).
  function grade(score, max, scale) {
    if (score === null || score === undefined || score === '' || !(Number(max) > 0)) return null;
    var share = round2((Number(score) / Number(max)) * 100), list = scaleOf(scale);
    for (var i = 0; i < list.length; i += 1) if (share >= Number(list[i].min) - 1e-9) return list[i];
    return list[list.length - 1];
  }
  function letter(score, max, scale) { var g = grade(score, max, scale); return g ? g.letter : ''; }
  // Competition ranking by value, highest first; ids without a value get no rank.
  function ranks(items) {
    var ranked = items.filter(function (x) { return x.value !== null && x.value !== undefined; })
      .sort(function (a, b) { return Number(b.value) - Number(a.value); });
    var map = {};
    ranked.forEach(function (item, index) {
      map[item.id] = index > 0 && round2(ranked[index - 1].value) === round2(item.value) ? map[ranked[index - 1].id] : index + 1;
    });
    return map;
  }
  // data: { semesters: [{id}], subjects: [{id, tabId, maxScore}], students: [{id}], gradeScale }
  // scores: { [tabId]: { [studentId]: { [subjectId]: number|null } } }
  // Returns { [studentId]: { semesters: {[tabId]: {total, average, grade, gpa, rank}}, total, average, grade, gpa, rank, entered } }
  function results(data, scores, scale) {
    var list = scaleOf(scale);
    var subjects = (data.subjects || []).filter(function (s) { return (data.semesters || []).some(function (t) { return t.id === s.tabId; }); });
    var maxAll = subjects.reduce(function (sum, s) { return sum + Number(s.maxScore || 0); }, 0);
    var out = {};
    (data.students || []).forEach(function (student) {
      var entered = 0, total = 0, semesters = {};
      (data.semesters || []).forEach(function (tab) {
        var own = subjects.filter(function (s) { return s.tabId === tab.id; });
        var row = ((scores || {})[tab.id] || {})[student.id] || {};
        var sum = 0, max = 0, any = false;
        own.forEach(function (s) {
          var v = row[s.id];
          max += Number(s.maxScore || 0);
          if (v === null || v === undefined || v === '') return;
          any = true; entered += 1; sum += Number(v);
        });
        var average = any && max > 0 ? round2((sum / max) * 100) : null;
        semesters[tab.id] = { total: any ? round2(sum) : null, average: average, grade: average === null ? '' : letter(average, 100, list) };
        total += sum;
      });
      var average = entered && maxAll > 0 ? round2((total / maxAll) * 100) : null;
      var g = average === null ? null : grade(average, 100, list);
      out[student.id] = { semesters: semesters, entered: entered, total: entered ? round2(total) : null, average: average, grade: g ? g.letter : '', gpa: g ? Number(g.gpa) : null };
    });
    var rankMap = ranks(Object.keys(out).map(function (id) { return { id: id, value: out[id].total }; }));
    Object.keys(out).forEach(function (id) { out[id].rank = rankMap[id] || null; });
    // each semester on its own: its grade's GPA and the rank by the semester's total
    (data.semesters || []).forEach(function (tab) {
      var semesterRanks = ranks(Object.keys(out).map(function (id) { return { id: id, value: out[id].semesters[tab.id].total }; }));
      Object.keys(out).forEach(function (id) {
        var s = out[id].semesters[tab.id], g = s.average === null ? null : grade(s.average, 100, list);
        s.gpa = g ? Number(g.gpa) : null;
        s.rank = semesterRanks[id] || null;
      });
    });
    return out;
  }
  return { SCALE: SCALE, grade: grade, letter: letter, results: results, ranks: ranks, round2: round2 };
});
