'use strict';

// The school's saved print form for student attendance reports (letterhead, logo, signers, paper).
// Read by anyone who may view reports; changed only by attendance configurators.
// One saved form per report kind: student (class) reports and staff reports.
const KEYS = { student: 'attendance-report-print-template', staff: 'attendance-staff-report-print-template', transcript: 'transcript-print-template', scoresheet: 'transcript-score-sheet-print-template', progressbook: 'transcript-progress-book-template' };
function kindOf(request) { const kind = String(request?.query?.kind || 'student'); if (!KEYS[kind]) throw new Error('kind must be student or staff'); return kind; }
const PAPERS = ['A4', 'A3', 'B5', 'A5', 'Letter', 'Legal'];
const ORIENTATIONS = ['portrait', 'landscape'];
const MAX_LOGO = 250000; // characters of a data: URL (about 180 KB of image)

const DEFAULT_TEMPLATE = Object.freeze({
  title: 'Attendance Report',
  orgName: 'Wattanam School',
  logoUrl: '',
  logoTextLines: [],
  headerLines: ['ព្រះរាជាណាចក្រកម្ពុជា', 'ជាតិ សាសនា ព្រះមហាក្សត្រ'],
  logoGap: 4,
  logoTextGap: 4,
  headerGap: 6,
  signers: ['Teacher', 'Admin'],
  paper: 'A4',
  orientation: 'portrait',
  showAddress: true,
  footerText: '',
});

function text(value, name, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`${name} must be text`);
  // Spaces inside and around printed text are kept: schools nudge lines into place with them.
  // Text that is only spaces counts as empty.
  const cleaned = value.replace(/[\u0000-\u001f]/g, ' ').replace(/ /g, ' ');
  const result = cleaned.trim() ? cleaned : '';
  if (result.length > max) throw new Error(`${name} must be at most ${max} characters`);
  return result;
}

function lines(value, name, maxLines, maxLength) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be a list`);
  const result = value.map((line, index) => text(line, `${name} line ${index + 1}`, maxLength)).filter(Boolean);
  if (result.length > maxLines) throw new Error(`${name} may have at most ${maxLines} lines`);
  return result;
}

function gap(value, name) {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 60) throw new Error(`${name} must be 0-60`);
  return number;
}

function logo(value) {
  const result = text(value, 'logoUrl', MAX_LOGO).trim();
  if (!result) return '';
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(result)) return result;
  if (/^https:\/\/[^\s"'<>]+$/.test(result) && result.length <= 2000) return result;
  throw new Error('logoUrl must be an https link or an uploaded PNG, JPEG, WebP or GIF image');
}

// Each score document's own title (score sheet uses title): ranking, honor roll, subject ranking.
const TITLE_KEYS = ['ranking', 'honor', 'subjects', 'subjectsMonthly', 'yearcard', 'yearParents', 'recordbook', 'rbMinistry', 'rbLevel', 'rbGuidance', 'bulletin'];
function titles(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('titles must be an object');
  const result = {};
  for (const key of TITLE_KEYS) { const title = text(value[key], 'titles.' + key, 120); if (title) result[key] = title; }
  return result;
}

// A name under each signature, by position (empty keeps the place: the last one then shows the class teacher).
function names(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('signerNames must be a list');
  if (value.length > 6) throw new Error('signerNames may have at most 6 names');
  const result = value.map((name, index) => text(name, 'signerNames ' + (index + 1), 120));
  while (result.length && !result[result.length - 1]) result.pop();
  return result;
}

// Per-block text style of the score documents' header and footer: alignment, font, size (pt), colour, bold.
const STYLE_KEYS = ['offices', 'school', 'motto', 'ornament', 'title', 'info', 'dates', 'approval', 'roles', 'names'];
function styles(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('styles must be an object');
  const result = {};
  for (const key of STYLE_KEYS) {
    const s = value[key];
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    const out = {};
    if (s.align) { if (!['left', 'center', 'right'].includes(s.align)) throw new Error(key + ': alignment must be left, center or right'); out.align = s.align; }
    if (s.font) { const font = text(s.font, key + ' font', 60); if (!/^[A-Za-z0-9 ]+$/.test(font)) throw new Error(key + ': the font name is not valid'); out.font = font; }
    if (s.size !== undefined && s.size !== null && s.size !== '') { const size = Number(s.size); if (!Number.isFinite(size) || size < 6 || size > 48) throw new Error(key + ': the size must be 6-48 pt'); out.size = Math.round(size * 2) / 2; }
    if (s.color) { if (!/^#[0-9a-fA-F]{6}$/.test(String(s.color))) throw new Error(key + ': the colour must look like #1e293b'); out.color = String(s.color).toLowerCase(); }
    if (s.bold === true || s.bold === false) out.bold = s.bold;
    if (Object.keys(out).length) result[key] = out;
  }
  return result;
}

// The progress book ticks one of four grades per subject: { label, min % } highest first, the last 0.
function bookGrades(value) {
  if (value === null) return undefined;
  if (!Array.isArray(value) || value.length !== 4) throw new Error('The book needs four grades');
  const result = value.map((g, i) => {
    const label = text(g?.label, 'Book grade ' + (i + 1), 30);
    if (!label.trim()) throw new Error('Each book grade needs a name');
    const min = i === 3 ? 0 : Number(g?.min);
    if (!Number.isFinite(min) || min < 0 || min > 100) throw new Error(label.trim() + ': the minimum must be 0-100%');
    return { label, min };
  });
  for (let i = 0; i < 3; i += 1) if (!(result[i].min > result[i + 1].min)) throw new Error(result[i].label.trim() + ' must need more than ' + result[i + 1].label.trim());
  return result;
}

function normalizeTemplate(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const paper = input.paper === undefined ? DEFAULT_TEMPLATE.paper : String(input.paper);
  if (!PAPERS.includes(paper)) throw new Error(`paper must be one of ${PAPERS.join(', ')}`);
  const orientation = input.orientation === undefined ? DEFAULT_TEMPLATE.orientation : String(input.orientation);
  if (!ORIENTATIONS.includes(orientation)) throw new Error('orientation must be portrait or landscape');
  return {
    title: text(input.title, 'title', 120) || DEFAULT_TEMPLATE.title,
    orgName: text(input.orgName, 'orgName', 160),
    logoUrl: logo(input.logoUrl),
    logoTextLines: lines(input.logoTextLines, 'logoTextLines', 4, 120),
    headerLines: lines(input.headerLines, 'headerLines', 6, 160),
    logoGap: gap(input.logoGap, 'logoGap'),
    logoTextGap: gap(input.logoTextGap, 'logoTextGap'),
    headerGap: gap(input.headerGap, 'headerGap'),
    signers: lines(input.signers, 'signers', 6, 80),
    paper,
    orientation,
    showAddress: input.showAddress === undefined ? true : input.showAddress === true,
    footerText: text(input.footerText, 'footerText', 200),
    mottoLines: lines(input.mottoLines, 'mottoLines', 4, 160),
    titles: titles(input.titles),
    lunarLine: text(input.lunarLine, 'lunarLine', 200),
    dateLine: text(input.dateLine, 'dateLine', 200),
    approvalText: text(input.approvalText, 'approvalText', 120),
    signerNames: names(input.signerNames),
    styles: styles(input.styles),
    // The symbol under the motto; left out = the default (❧❧❧), empty = none.
    ornament: input.ornament === undefined ? undefined : text(input.ornament, 'ornament', 40),
    // Progress book: the internal rules page and the book's own four grades. Left out = the defaults.
    rulesLines: input.rulesLines === undefined ? undefined : lines(input.rulesLines, 'rulesLines', 80, 600),
    bookGrades: input.bookGrades === undefined ? undefined : bookGrades(input.bookGrades),
    // Academic year report card: conduct line and the teacher's comment for pass / fail (a student's own
    // conduct and comment on the last semester come first). Left out = the defaults.
    conductText: input.conductText === undefined ? undefined : text(input.conductText, 'conductText', 200),
    passComment: input.passComment === undefined ? undefined : text(input.passComment, 'passComment', 400),
    failComment: input.failComment === undefined ? undefined : text(input.failComment, 'failComment', 400),
    // Student Academic Record Book: the director's comment and the default for the three assessed areas.
    directorComment: input.directorComment === undefined ? undefined : text(input.directorComment, 'directorComment', 400),
    evalDefault: input.evalDefault === undefined ? undefined : text(input.evalDefault, 'evalDefault', 40),
    // The record book's guidance page (សេចក្តីណែនាំ), one paragraph per line. Left out = the default text.
    rbGuidance: input.rbGuidance === undefined ? undefined : lines(input.rbGuidance, 'rbGuidance', 30, 1500),
  };
}

const STAFF_DEFAULTS = Object.freeze({ title: 'Staff Attendance Report', signers: ['Admin', 'Director'] });
// Monthly bulletins (transcripts): Khmer title and the three signatures of the original bulletin.
const TRANSCRIPT_DEFAULTS = Object.freeze({ title: 'ព្រឹត្តិបត្រពិន្ទុប្រចាំខែ', orgName: '', signers: ['នាយកសាលា', 'គ្រូទទួលបន្ទុកថ្នាក់', 'មតិរបស់អាណាព្យាបាលសិស្ស'] });
// Class score sheets (ministry layout): ministry and district office lines on the left, the
// director and the class teacher signing, landscape paper. footerText is the place the sheet is signed.
const SCORESHEET_DEFAULTS = Object.freeze({
  title: 'តារាងសម្រង់ពិន្ទុប្រចាំ', orgName: '', headerLines: ['មន្ទីរ អ.យ.ក. ខេត្ត៖', 'ការិ.អ.យ.ក.ស្រុក៖'],
  signers: ['នាយកសាលា', 'គ្រូទទួលបន្ទុកថ្នាក់'], orientation: 'landscape', footerText: '',
  mottoLines: ['ព្រះរាជាណាចក្រកម្ពុជា', 'ជាតិ សាសនា ព្រះមហាក្សត្រ'], titles: {}, ornament: '❧❧❧',
  conductText: 'គោរពពេលវេលា វិន័យ និង មានសីលធម៌ល្អ',
  passComment: 'សិស្សបានឡើងថ្នាក់ សូមបន្តការខិតខំប្រឹងប្រែងរៀនសូត្របន្ថែមទៀត។',
  failComment: 'សិស្សត្រូវរៀនត្រួតថ្នាក់ តែក៏ត្រូវមាតាបិតា ឬអាណាព្យាបាលសិស្ស ជួយណែនាំកូនឱ្យរៀននៅផ្ទះផង។',
  directorComment: 'សូមព្យាយាមខិតខំរៀនបន្ថែមទៀត', evalDefault: 'មធ្យម',
});
// The Student Progress and Communication Book (B5): cover lines, rules page, the book's grades.
const BOOK_RULES = [
  '១.សម្លៀកបំពាក់ ការតុបតែងខ្លួន និងអនាម័យ',
  '-សិស្សទាំងអស់ត្រូវមានសម្លៀកបំពាក់ស្អាតជានិច្ច សិស្សប្រុសត្រូវស្លៀកពាក់អាវសបើកកសិតក្នុងខោវែងខៀវចាស់ រីឯសិស្សនារីត្រូវស្លៀកពាក់អាវសសិតក្នុងសំពត់ខៀវចាស់ក្រោមជង្គង់។ នៅលើទ្រូងអាវផ្នែកខាងលើហោប៉ៅអាវ ត្រូវប៉ាក់ឈ្មោះគ្រឹះស្ថានសិក្សា ឈ្មោះថ្នាក់ និងឈ្មោះសាមីខ្លួន។',
  '-សិស្សប្រុសត្រូវកាត់សក់ខ្លី រីឯសិស្សស្រីត្រូវសិតសក់ ដាក់បួ ឬចង ឬក្រង ឬកាត់សក់ខ្លីត្រឹមស្មា។',
  '-ការតុបតែងខ្លួនឲ្យឆើតឆាយ និងពាក់គ្រឿងអលង្ការផ្សេងៗ ដូចជាៈ សិស្សប្រុសពាក់ក្រវិល សិស្សស្រីពាក់ចង្រង់ជើងនៅកជើង ដាំក្បូននៅធ្មេញ លាបក្រចកដៃ លាបក្រចកជើង លាបសក់ពណ៌ផ្សេងៗ ដាក់មុខ លាបក្រែម និងពាក់ស្បែកជើងមិនសមរម្យត្រូវហាមឃាត់។',
  '២.អវត្តមាន និងលទ្ធផល',
  '-ប្រភេទទី១: ឈប់អត់ច្បាប់លើសពី៣០ដងឡើងទៅ',
  '-ប្រភេទទី២: ឈប់អត់ច្បាប់ និងមានច្បាប់លើសពី៤០ដងឡើងទៅ',
  '-ប្រភេទទី៣: ឈប់មានច្បាប់លើសពី៥៥ដងឡើងទៅ',
  '*ចំពោះសិស្ស៣ប្រភេទខាងលើ៖',
  '- បើជាប់មធ្យមភាគពិន្ទុប្រចាំឆ្នាំ ត្រូវបានអនុញ្ញាតឲ្យប្រឡងឡើងថ្នាក់',
  '- បើធ្លាក់មធ្យមភាគពិន្ទុប្រចាំឆ្នាំ ត្រូវរៀនត្រួតថ្នាក់',
  '*ចំពោះសិស្សដែលឈប់អត់ច្បាប់ លើសពី៥៥ដង ត្រូវលុបឈ្មោះចេញពីបញ្ជីរបស់គ្រឹះស្ថានសិក្សា។',
];
const PROGRESSBOOK_DEFAULTS = Object.freeze({
  title: 'សៀវភៅតាមដានការសិក្សា', orgName: '', paper: 'B5', orientation: 'portrait', footerText: 'ភ្នំពេញ',
  headerLines: ['មន្ទីរអប់រំ យុវជន និង កីឡារាជធានីភ្នំពេញ', 'មធ្យមសិក្សាចំណេះទូទៅ'],
  mottoLines: ['ព្រះរាជាណាចក្រកម្ពុជា', 'ជាតិ សាសនា ព្រះមហាក្សត្រ'], ornament: '— ❁ —',
  signers: ['នាយកសាលា', 'មូលវិចារណ៍គ្រូទទួលបន្ទុកថ្នាក់', 'មតិរបស់មាតាបិតា-អាណាព្យាបាលសិស្ស'],
  rulesLines: BOOK_RULES,
  bookGrades: [{ label: 'ល្អ', min: 80 }, { label: 'ល្អបង្គួរ', min: 65 }, { label: 'មធ្យម', min: 50 }, { label: 'ខ្សោយ', min: 0 }],
});
function defaultsFor(kind) {
  if (kind === 'progressbook') return { ...DEFAULT_TEMPLATE, ...PROGRESSBOOK_DEFAULTS };
  if (kind === 'staff') return { ...DEFAULT_TEMPLATE, ...STAFF_DEFAULTS };
  if (kind === 'transcript') return { ...DEFAULT_TEMPLATE, ...TRANSCRIPT_DEFAULTS };
  if (kind === 'scoresheet') return { ...DEFAULT_TEMPLATE, ...SCORESHEET_DEFAULTS };
  return { ...DEFAULT_TEMPLATE };
}

function registerReportPrintTemplate(context, permissions) {
  // reports/print-template (student; ?kind=staff also accepted on reads) and reports/staff-print-template.
  const paths = [['reports/print-template', null], ['reports/staff-print-template', 'staff']];
  if (permissions.transcriptRead) paths.push(['transcripts/print-template', 'transcript'], ['transcripts/score-sheet-print-template', 'scoresheet'], ['transcripts/progress-book-template', 'progressbook']);
  for (const [path, fixed] of paths) {
    const transcriptKind = fixed === 'transcript' || fixed === 'scoresheet' || fixed === 'progressbook';
    const read = fixed === 'staff' ? permissions.staffRead || permissions.read : transcriptKind ? permissions.transcriptRead : permissions.read;
    const write = fixed === 'staff' ? permissions.staffWrite || permissions.write : transcriptKind ? permissions.transcriptWrite : permissions.write;
  context.routes.register({
    method: 'GET', path, permission: read,
    handler: async (request) => { const kind = fixed || kindOf(request); return { ...defaultsFor(kind), ...(await context.settings.get(KEYS[kind], {})) }; },
  });
  context.routes.register({
    method: 'PUT', path, permission: write,
    handler: async (request) => {
      // Everyone prints with the school's print forms; only administrators change them.
      if (!['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'].includes(request?.principal?.role)) throw new Error('Only an administrator can change the print form');
      const kind = fixed || kindOf(request);
      const template = normalizeTemplate(request?.body);
      await context.settings.set(KEYS[kind], template);
      return template;
    },
  });
  }
}

/** The saved print form of a kind with its defaults (read-only use by other routes). */
async function readPrintTemplate(context, kind) {
  return { ...defaultsFor(kind), ...(await context.settings.get(KEYS[kind], {})) };
}

module.exports = { registerReportPrintTemplate, normalizeTemplate, DEFAULT_TEMPLATE, readPrintTemplate };
