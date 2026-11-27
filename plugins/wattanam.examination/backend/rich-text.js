'use strict';

// Question text is formatted text (bold, lists, colours, sizes) written in the exam editor. It is kept
// as a small HTML subset. The screens show it inside the sandboxed plugin frame, whose CSP already
// blocks every script, and clean it again in the browser before showing it (ui/exam.js); this is
// the server's own allow-list, so stored text never carries scripts, event handlers or links.

const TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote', 'code', 'pre', 'font', 'mark', 'small', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const STYLE = /^(color|background-color|font-size|font-weight|font-style|font-family|text-decoration|text-align|line-height):[#(),.%\w\s"'-]{1,80}$/i;

function cleanStyle(value) {
  return String(value || '').split(';').map((part) => part.trim()).filter((part) => STYLE.test(part) && !/url\s*\(|expression|javascript/i.test(part)).join('; ');
}

function cleanAttributes(tag, raw) {
  const out = [];
  const pattern = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = pattern.exec(raw))) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? '';
    if (name === 'style') { const style = cleanStyle(value); if (style) out.push(`style="${style.replace(/"/g, "'")}"`); }
    else if (tag === 'font' && name === 'color' && /^#?[\w]{1,20}$/.test(value)) out.push(`color="${value}"`);
    else if (tag === 'font' && name === 'size' && /^[1-7]$/.test(value)) out.push(`size="${value}"`);
    else if ((tag === 'td' || tag === 'th') && (name === 'colspan' || name === 'rowspan') && /^\d{1,2}$/.test(value)) out.push(`${name}="${value}"`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

/** Formatted question text, reduced to the allowed tags and styles (plain text stays plain). */
function cleanRichText(value, max = 20000) {
  let text = String(value ?? '');
  if (text.length > max) throw new Error(`question text exceeds ${max} characters`);
  // whole blocks whose content must never be kept
  text = text.replace(/<(script|style|iframe|object|embed|template|svg|math|noscript|textarea|select|button|form|input|link|meta|base)\b[\s\S]*?(<\/\1\s*>|$)/gi, '');
  text = text.replace(/<!--[\s\S]*?(-->|$)/g, '');
  text = text.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (all, close, name, attributes) => {
    const tag = name.toLowerCase();
    if (!TAGS.has(tag)) return '';
    return close ? `</${tag}>` : `<${tag}${cleanAttributes(tag, attributes)}>`;
  });
  return text.replace(/<(?![a-zA-Z/])/g, '&lt;').trim();
}

/** Plain text of formatted text (for lists, titles and the answer of a passage-free check). */
function plainText(value) {
  return String(value ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

module.exports = { cleanRichText, plainText };
