'use strict';

// A student's place of birth, current address and parents (migration 093), kept as their own columns.
// The old one-line "address" stays: it is written from the parts whenever they are given, so every
// screen that shows the address (ID cards, My Class, exports) keeps working.

const BIRTH = ['birthVillage', 'birthCommune', 'birthDistrict', 'birthProvince'];
const ADDRESS = ['houseNo', 'street', 'village', 'commune', 'district', 'province'];
const PARENTS = ['fatherName', 'fatherJob', 'fatherPhone', 'motherName', 'motherJob', 'motherPhone'];
const KEYS = [...BIRTH, ...ADDRESS, ...PARENTS];

// Spreadsheet columns: the template's header, and other spellings people use (matched without
// spaces, dots, underscores or anything in brackets, in any letter case).
const CSV = {
  birthVillage: ['Birth Village (ភូមិកំណើត)', 'birthvillage', 'ភូមិកំណើត', 'placeofbirthvillage'],
  birthCommune: ['Birth Commune (ឃុំ/សង្កាត់កំណើត)', 'birthcommune', 'birthsangkat', 'ឃុំកំណើត', 'សង្កាត់កំណើត', 'ឃុំ/សង្កាត់កំណើត'],
  birthDistrict: ['Birth District (ស្រុក/ខណ្ឌកំណើត)', 'birthdistrict', 'birthkhan', 'ស្រុកកំណើត', 'ខណ្ឌកំណើត', 'ស្រុក/ខណ្ឌកំណើត'],
  birthProvince: ['Birth Province (ខេត្ត/រាជធានីកំណើត)', 'birthprovince', 'birthcity', 'ខេត្តកំណើត', 'ខេត្ត/រាជធានីកំណើត'],
  houseNo: ['House No (ផ្ទះលេខ)', 'houseno', 'housenumber', 'home', 'house', 'ផ្ទះលេខ'],
  street: ['Street (ផ្លូវ)', 'street', 'streetno', 'road', 'ផ្លូវ', 'ផ្លូវលេខ'],
  village: ['Village (ភូមិ/ក្រុម)', 'village', 'group', 'ភូមិ', 'ក្រុម', 'ភូមិ/ក្រុម'],
  commune: ['Commune (ឃុំ/សង្កាត់)', 'commune', 'sangkat', 'ឃុំ', 'សង្កាត់', 'ឃុំ/សង្កាត់'],
  district: ['District (ស្រុក/ខណ្ឌ)', 'district', 'khan', 'ស្រុក', 'ខណ្ឌ', 'ស្រុក/ខណ្ឌ'],
  province: ['Province (ខេត្ត/រាជធានី)', 'province', 'city', 'ខេត្ត', 'រាជធានី', 'ខេត្ត/រាជធានី'],
  fatherName: ['Father Name (ឈ្មោះឪពុក)', 'fathername', 'father', 'ឈ្មោះឪពុក', 'ឪពុក'],
  fatherJob: ['Father Job (មុខរបរឪពុក)', 'fatherjob', 'fatheroccupation', 'មុខរបរឪពុក'],
  fatherPhone: ['Father Phone (ទូរស័ព្ទឪពុក)', 'fatherphone', 'ទូរស័ព្ទឪពុក'],
  motherName: ['Mother Name (ឈ្មោះម្ដាយ)', 'mothername', 'mother', 'ឈ្មោះម្ដាយ', 'ឈ្មោះម្តាយ', 'ម្ដាយ', 'ម្តាយ'],
  motherJob: ['Mother Job (មុខរបរម្ដាយ)', 'motherjob', 'motheroccupation', 'មុខរបរម្ដាយ', 'មុខរបរម្តាយ'],
  motherPhone: ['Mother Phone (ទូរស័ព្ទម្ដាយ)', 'motherphone', 'ទូរស័ព្ទម្ដាយ', 'ទូរស័ព្ទម្តាយ'],
};
const normalHeader = (value) => String(value || '').replace(/\([^)]*\)/g, '').replace(/[\s._-]+/g, '').toLowerCase();

const limit = (key) => (/Phone$/.test(key) ? 40 : 160);
const clean = (key, value) => {
  if (value === undefined) return undefined;
  const text = value === null ? '' : String(value).replace(/\s+/g, ' ').trim();
  if (text.length > limit(key)) throw new Error(`${key} is too long (at most ${limit(key)} characters)`);
  return text || null;
};

// The details in a request body. partial: only the keys that were sent (an update).
function readDetails(body, partial) {
  const out = {};
  KEYS.forEach((key) => {
    const value = clean(key, body ? body[key] : undefined);
    if (value !== undefined) out[key] = value;
    else if (!partial) out[key] = null;
  });
  return out;
}

const prefixed = (prefix, value) => (!value ? '' : value.startsWith(prefix) ? value : `${prefix} ${value}`);
// "ផ្ទះលេខ ១២ ផ្លូវ ២៧១ ភូមិ ៣ សង្កាត់ទឹកល្អក់ទី១ ខណ្ឌទួលគោក រាជធានីភ្នំពេញ"
function composeAddress(d) {
  return [prefixed('ផ្ទះលេខ', d.houseNo), prefixed('ផ្លូវ', d.street), prefixed('ភូមិ', d.village), d.commune, d.district, d.province]
    .filter(Boolean).join(' ') || null;
}
function composeBirthPlace(d) {
  return [prefixed('ភូមិ', d.birthVillage), d.birthCommune, d.birthDistrict, d.birthProvince].filter(Boolean).join(' ') || null;
}
const hasAddress = (d) => ADDRESS.some((key) => d[key]);

// For SELECT lists (named columns: a cached SELECT * breaks when columns are added).
const detailColumns = (alias) => KEYS.map((key) => `${alias ? `${alias}.` : ''}"${key}"`).join(', ');
// For API answers: the parts, plus the place of birth as one line.
function detailsOut(row) {
  const out = {};
  KEYS.forEach((key) => { out[key] = (row && row[key]) || ''; });
  out.birthPlace = composeBirthPlace(out) || '';
  return out;
}

// Spreadsheet: which column holds each detail (-1 when the file has none).
function csvIndexes(header) {
  const normal = header.map(normalHeader);
  const indexes = {};
  KEYS.forEach((key) => {
    const names = CSV[key].map(normalHeader);
    indexes[key] = normal.findIndex((value) => names.includes(value));
  });
  return indexes;
}
// Headers that belong to a detail, so the older loose matches (phone*, birth*) skip them.
const isDetailHeader = (value) => KEYS.some((key) => CSV[key].map(normalHeader).includes(normalHeader(value)));
const TEMPLATE_HEADERS = KEYS.map((key) => CSV[key][0]);

module.exports = { KEYS, BIRTH, ADDRESS, PARENTS, readDetails, composeAddress, composeBirthPlace, hasAddress, detailColumns, detailsOut, csvIndexes, isDetailHeader, TEMPLATE_HEADERS };
