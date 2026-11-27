'use strict';

const RICH_TYPES = Object.freeze(['TEXT','ESSAY','SORT_PARAGRAPHS','DRAG_WORDS','FILL_BLANKS','DRAG_DROP','SPEAK_WORDS','SPEAK_WORDS_SET','DICTATION']);
const QUESTION_TYPES = new Set(['MCQ','TF', ...RICH_TYPES]);
const LABEL_STYLES = new Set(['ALPHA','NUMERIC','ROMAN','NONE']);

function fail(message) { throw new Error(message); }
function clean(value) { return String(value ?? '').trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function normalizeAnswer(value) { return clean(value).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' '); }
function shuffle(value) { const out = [...value]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }
function parseMarked(text, pattern, prefix, splitAnswers = false) {
  const parts = clean(text).split(pattern).filter(Boolean); let index = 0;
  return parts.map((part) => {
    const marker = (part.startsWith('*') && part.endsWith('*')) || (part.startsWith('#') && part.endsWith('#'));
    if (!marker || part.length < 3) return { type:'text', value:part };
    const raw = part.slice(1, -1).trim(); const item = { type:'blank', id:`${prefix}${index++}` };
    return splitAnswers ? { ...item, answers:raw.split('/').map(clean).filter(Boolean) } : { ...item, answer:raw, group:part.startsWith('#') ? 'b' : 'a' };
  });
}
function parseDragWords(text) { return parseMarked(text, /(\*[^*]+\*|#[^#]+#)/g, 'b'); }
function parseFillBlanks(text) { return parseMarked(text, /(\*[^*]+\*)/g, 'fb', true); }
function requireCount(items, count, message) { if (items.length < count) fail(message); return items; }
// A picture or recording stored with the exam ("media:<id>", backend/media.js); older questions kept the picture inline.
const MEDIA_REF = /^media:[0-9a-f-]{36}$/;
const INLINE_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
function picture(value) { const ref = clean(value); if (MEDIA_REF.test(ref) || (INLINE_IMAGE.test(ref) && ref.length < 3000000)) return ref; return ''; }

function sanitizeQuestionData(type, raw = {}) {
  if (!QUESTION_TYPES.has(type)) fail(`question type must be one of ${[...QUESTION_TYPES].join(', ')}`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('question data must be an object');
  if (type === 'TEXT') return {};
  if (type === 'ESSAY') return { minWords:Math.max(0, Number(raw.minWords) || 0) };
  if (type === 'MCQ') {
    const choices = requireCount(list(raw.choices).filter((item) => clean(item?.text)).map((item, index) => ({ id:clean(item.id) || `c${index}`, text:clean(item.text), isCorrect:Boolean(item.isCorrect) })), 2, 'Multiple choice needs at least two choices');
    const correct = choices.filter((item) => item.isCorrect).length; const multiple = Boolean(raw.multiple);
    if (!correct || (!multiple && correct !== 1)) fail(multiple ? 'Multiple choice needs a correct choice' : 'Single-choice questions need exactly one correct choice');
    return { choices, multiple, labelStyle:LABEL_STYLES.has(raw.labelStyle) ? raw.labelStyle : 'ALPHA' };
  }
  if (type === 'TF') return { correct:Boolean(raw.correct) };
  if (type === 'SORT_PARAGRAPHS') return { paragraphs:requireCount(list(raw.paragraphs).filter((item) => clean(item?.text)).map((item,index) => ({ id:clean(item.id) || `p${index}`, text:clean(item.text) })), 2, 'Sort the Paragraphs needs at least two paragraphs') };
  if (type === 'DRAG_WORDS') { const text = clean(raw.text); const blanks = parseDragWords(text).filter((item) => item.type === 'blank'); requireCount(blanks, 1, 'Drag the Words needs at least one marked blank'); return { text, distractors:list(raw.distractors).map(clean).filter(Boolean) }; }
  if (type === 'FILL_BLANKS') { const text = clean(raw.text); const blanks = parseFillBlanks(text).filter((item) => item.type === 'blank'); requireCount(blanks, 1, 'Fill in the Blanks needs at least one marked blank'); if (blanks.some((item) => !item.answers.length)) fail('Every blank needs an accepted answer'); return { text, style:raw.style && typeof raw.style === 'object' && !Array.isArray(raw.style) ? raw.style : {} }; }
  if (type === 'DRAG_DROP') {
    const backgroundImage = picture(raw.backgroundImage); if (!backgroundImage) fail('Drag and Drop needs a background image');
    const zones = requireCount(list(raw.zones).filter((item) => clean(item?.id)).map((item) => ({ id:clean(item.id), x:Math.max(0,Math.min(100,Number(item.x)||0)), y:Math.max(0,Math.min(100,Number(item.y)||0)), width:Math.max(1,Math.min(100,Number(item.width)||10)), height:Math.max(1,Math.min(100,Number(item.height)||10)) })), 1, 'Drag and Drop needs a drop zone');
    const zoneIds = new Set(zones.map((item) => item.id));
    const items = requireCount(list(raw.items).filter((item) => clean(item?.label) && zoneIds.has(clean(item.correctZoneId))).map((item,index) => ({ id:clean(item.id)||`i${index}`, label:clean(item.label), correctZoneId:clean(item.correctZoneId) })), 1, 'Drag and Drop needs an item assigned to a valid zone');
    return { backgroundImage, zones, items };
  }
  if (type === 'SPEAK_WORDS') { const prompt=clean(raw.prompt); const acceptedAnswers=list(raw.acceptedAnswers).map(clean).filter(Boolean); if (!prompt || !acceptedAnswers.length) fail('Speak the Words needs a prompt and accepted answer'); const lang=/^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(clean(raw.lang)) ? clean(raw.lang) : ''; return lang ? { prompt, acceptedAnswers, lang } : { prompt, acceptedAnswers }; }
  if (type === 'SPEAK_WORDS_SET') { const items=list(raw.items).map((item,index)=>({id:clean(item?.id)||`sw${index}`,prompt:clean(item?.prompt),acceptedAnswers:list(item?.acceptedAnswers).map(clean).filter(Boolean)})).filter((item)=>item.prompt&&item.acceptedAnswers.length); const lang=/^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(clean(raw.lang)) ? clean(raw.lang) : ''; return { items:requireCount(items,1,'Speak the Words Set needs a prompt and accepted answer'), ...(lang ? { lang } : {}) }; }
  if (type === 'DICTATION') {
    const script=clean(raw.script); if (!script) fail('Dictation needs a script');
    const audio=clean(raw.audio); if (audio && !MEDIA_REF.test(audio)) fail('Dictation audio must be a recording uploaded with the exam');
    const audioUrl=clean(raw.audioUrl); const lang=/^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(clean(raw.lang)) ? clean(raw.lang) : '';
    const rate=Math.min(2, Math.max(0.5, Number(raw.rate) || 1)); const plays=Math.min(10, Math.max(0, Math.round(Number(raw.plays) || 0)));
    return { script, ...(audio ? { audio } : {}), ...(audioUrl ? { audioUrl } : {}), ...(lang ? { lang } : {}), rate, plays };
  }
  fail('question type is invalid');
}

function safeQuestionData(type, raw = {}) {
  if (type === 'MCQ') return { choices:shuffle(list(raw.choices).map(({id,text})=>({id,text}))), multiple:Boolean(raw.multiple), labelStyle:raw.labelStyle || 'ALPHA' };
  if (type === 'TF' || type === 'TEXT') return {};
  if (type === 'ESSAY') return { minWords:Number(raw.minWords)||0 };
  if (type === 'SORT_PARAGRAPHS') return { paragraphs:shuffle(list(raw.paragraphs).map(({id,text})=>({id,text}))) };
  if (type === 'DRAG_WORDS') { const parsed=parseDragWords(raw.text); return { segments:parsed.map((item)=>item.type==='blank'?{type:'blank',id:item.id,group:item.group}:item), wordBank:shuffle([...parsed.filter((item)=>item.type==='blank').map((item)=>({word:item.answer,group:item.group})),...list(raw.distractors).map((word)=>({word,group:'a'}))]) }; }
  if (type === 'FILL_BLANKS') return { segments:parseFillBlanks(raw.text).map((item)=>item.type==='blank'?{type:'blank',id:item.id}:item), style:raw.style||{} };
  if (type === 'DRAG_DROP') return { backgroundImage:raw.backgroundImage, zones:list(raw.zones).map(({id,x,y,width,height})=>({id,x,y,width,height})), items:shuffle(list(raw.items).map(({id,label})=>({id,label}))) };
  if (type === 'SPEAK_WORDS') return { prompt:raw.prompt, ...(raw.lang ? { lang:raw.lang } : {}) };
  if (type === 'SPEAK_WORDS_SET') return { items:list(raw.items).map(({id,prompt})=>({id,prompt})), ...(raw.lang ? { lang:raw.lang } : {}) };
  // The script goes to the screen only to be read aloud by the school page (as in mono; the screen never shows it).
  if (type === 'DICTATION') return { script:raw.script, ...(raw.audio ? { audio:raw.audio } : {}), ...(raw.audioUrl ? { audioUrl:raw.audioUrl } : {}), ...(raw.lang ? { lang:raw.lang } : {}), rate:Number(raw.rate)||1, plays:Number(raw.plays)||0 };
  return {};
}

function gradeQuestionData(type, raw, response, marks) {
  const data=raw||{}; const full=Number(marks)||0;
  if (type === 'ESSAY') return { automatic:false, marks:0 };
  if (type === 'TEXT') return { automatic:true, marks:0 };
  if (response == null) return { automatic:true, marks:0 };
  if (type === 'MCQ') { const correct=new Set(list(data.choices).filter((item)=>item.isCorrect).map((item)=>String(item.id))); const chosen=new Set((Array.isArray(response)?response:[response]).map(String)); return { automatic:true, marks:chosen.size===correct.size&&[...chosen].every((item)=>correct.has(item))?full:0 }; }
  if (type === 'TF') return { automatic:true, marks:Boolean(response)===Boolean(data.correct)?full:0 };
  const partial=(items, predicate)=>({automatic:true,marks:full*items.filter(predicate).length/(items.length||1)});
  if (type === 'SORT_PARAGRAPHS') { const items=list(data.paragraphs); const given=list(response).map(String); return partial(items,(item,index)=>given[index]===String(item.id)); }
  if (type === 'DRAG_WORDS') { const items=parseDragWords(data.text).filter((item)=>item.type==='blank'); const given=response&&typeof response==='object'?response:{}; return partial(items,(item)=>clean(given[item.id]).toLowerCase()===clean(item.answer).toLowerCase()); }
  if (type === 'FILL_BLANKS') { const items=parseFillBlanks(data.text).filter((item)=>item.type==='blank'); const given=response&&typeof response==='object'?response:{}; return partial(items,(item)=>item.answers.map(normalizeAnswer).includes(normalizeAnswer(given[item.id]))); }
  if (type === 'DRAG_DROP') { const items=list(data.items); const given=response&&typeof response==='object'?response:{}; return partial(items,(item)=>given[item.id]===item.correctZoneId); }
  if (type === 'SPEAK_WORDS') return { automatic:true, marks:list(data.acceptedAnswers).map(normalizeAnswer).includes(normalizeAnswer(response))?full:0 };
  if (type === 'SPEAK_WORDS_SET') { const items=list(data.items); const given=response&&typeof response==='object'?response:{}; return partial(items,(item)=>list(item.acceptedAnswers).map(normalizeAnswer).includes(normalizeAnswer(given[item.id]))); }
  if (type === 'DICTATION') { const expected=normalizeAnswer(data.script).split(' ').filter(Boolean); const given=normalizeAnswer(response).split(' ').filter(Boolean); return partial(expected,(word,index)=>given[index]===word); }
  return { automatic:false, marks:0 };
}

module.exports = { QUESTION_TYPES, RICH_TYPES, gradeQuestionData, safeQuestionData, sanitizeQuestionData };
