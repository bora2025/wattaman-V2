/* Shared helpers of the Examination screens: DOM, notices, dates, formatted text (cleaned before it is
 * shown), the formatted-text editor, confirm dialogs, and pictures/recordings stored with an exam
 * (uploaded in parts: a screen request is at most 256 KiB). */
(function () {
  'use strict';
  var ui = window.WattanamPluginUI;

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
      else if (k === 'value') node.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = true;
      else node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(id, text, tone) { var n = $(id); if (!n) return; n.textContent = text || ''; n.hidden = !text; n.className = 'notice ' + (tone || 'ok'); }
  function errorText(e, fallback) { return (e && (e.message || (e.body && e.body.message))) || fallback || 'Something went wrong'; }
  function busy(on) { var app = $('app'); if (app) app.setAttribute('aria-busy', on ? 'true' : 'false'); }

  var STATUS = ['DRAFT', 'PUBLISHED', 'ACTIVE', 'COMPLETED'];
  var STATUS_HINT = {
    DRAFT: 'Hidden from students — still being written.',
    PUBLISHED: "Visible to students, but they can't start it yet.",
    ACTIVE: 'Students can start and submit right now.',
    COMPLETED: 'Closed — students can no longer start it.',
  };
  function chip(text, kind) { return el('span', { class: 'chip ' + (kind || text), text: text }); }
  function plural(n, word) { return n + ' ' + word + (Number(n) === 1 ? '' : 's'); }
  function num(n) { var v = Math.round(Number(n || 0) * 100) / 100; return String(v); }
  function dateTime(value) { if (!value) return '—'; var d = new Date(value); return isNaN(d) ? '—' : d.toLocaleString(); }
  function localInput(value) { if (!value) return ''; var d = new Date(value); if (isNaN(d)) return ''; var p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function fromLocalInput(value) { if (!value) return null; var d = new Date(value); return isNaN(d) ? null : d.toISOString(); }
  function attemptsText(max) { return Number(max) === 0 ? 'unlimited attempts' : Number(max) === 1 ? '1 attempt' : 'up to ' + max + ' attempts'; }
  function stat(label, value, icon, tone, sub) {
    return el('div', { class: 'card stat' }, [el('div', { class: 'dot ' + (tone || 'tone-sky'), text: icon }), el('div', {}, [el('span', { text: label }), el('b', { text: String(value) }), sub ? el('em', { text: sub }) : null])]);
  }
  function skeletons(node, n) { clear(node); for (var i = 0; i < (n || 3); i++) node.appendChild(el('div', { class: 'skeleton' })); }
  function empty(icon, message, action) { return el('div', { class: 'card empty' }, [el('span', { class: 'big', text: icon }), el('p', { text: message }), action ? el('div', { style: 'margin-top:10px' }, [action]) : null]); }

  // ---------- formatted text: an allow-list, applied again here before anything is shown ----------
  var TAGS = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, SUB: 1, SUP: 1, BR: 1, P: 1, DIV: 1, SPAN: 1, UL: 1, OL: 1, LI: 1, H3: 1, H4: 1, BLOCKQUOTE: 1, CODE: 1, PRE: 1, FONT: 1, MARK: 1, SMALL: 1, HR: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TH: 1, TD: 1 };
  var DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEMPLATE: 1, SVG: 1, MATH: 1, NOSCRIPT: 1, TEXTAREA: 1, SELECT: 1, BUTTON: 1, FORM: 1, INPUT: 1, LINK: 1, META: 1, BASE: 1, IMG: 1, VIDEO: 1, AUDIO: 1 };
  var STYLES = ['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family', 'text-decoration', 'text-align', 'line-height'];
  function cleanNode(source, target) {
    Array.prototype.forEach.call(source.childNodes, function (child) {
      if (child.nodeType === 3) { target.appendChild(document.createTextNode(child.nodeValue)); return; }
      if (child.nodeType !== 1 || DROP[child.tagName]) return;
      if (!TAGS[child.tagName]) { cleanNode(child, target); return; } // keep the text of an unknown tag
      var copy = document.createElement(child.tagName.toLowerCase());
      STYLES.forEach(function (name) {
        var value = child.style && child.style.getPropertyValue(name);
        if (value && !/url\(|expression|javascript/i.test(value)) copy.style.setProperty(name, value);
      });
      if (child.tagName === 'FONT') { if (/^#?\w{1,20}$/.test(child.getAttribute('color') || '')) copy.setAttribute('color', child.getAttribute('color')); if (/^[1-7]$/.test(child.getAttribute('size') || '')) copy.setAttribute('size', child.getAttribute('size')); }
      if ((child.tagName === 'TD' || child.tagName === 'TH')) ['colspan', 'rowspan'].forEach(function (a) { if (/^\d{1,2}$/.test(child.getAttribute(a) || '')) copy.setAttribute(a, child.getAttribute(a)); });
      cleanNode(child, copy);
      target.appendChild(copy);
    });
    return target;
  }
  function cleanHtml(html) {
    var doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    var box = document.createElement('div');
    cleanNode(doc.body, box);
    return box;
  }
  /** formatted text as nodes (never innerHTML of what was stored) */
  function rich(html, tag, cls) {
    var box = cleanHtml(html);
    var node = el(tag || 'div', { class: 'rich' + (cls ? ' ' + cls : '') });
    while (box.firstChild) node.appendChild(box.firstChild);
    return node;
  }
  function plain(html) { return cleanHtml(html).textContent.replace(/\s+/g, ' ').trim(); }

  /** A small formatted-text editor (bold, italic, underline, size, colour, lists, alignment). */
  function richEditor(value, options) {
    var o = options || {};
    var area = el('div', { class: 'area rich', contenteditable: 'true', 'data-placeholder': o.placeholder || '', role: 'textbox', 'aria-multiline': 'true', 'aria-label': o.label || o.placeholder || 'Text' });
    var box = cleanHtml(value); while (box.firstChild) area.appendChild(box.firstChild);
    var changed = function () { if (o.onChange) o.onChange(get()); };
    var cmd = function (name, arg) { return function (e) { e.preventDefault(); area.focus(); document.execCommand(name, false, arg); changed(); }; };
    var size = el('select', { title: 'Text size', 'aria-label': 'Text size', onchange: function () { area.focus(); document.execCommand('fontSize', false, size.value); size.value = ''; changed(); } },
      [el('option', { value: '', text: 'Size' })].concat([['2', 'Small'], ['3', 'Normal'], ['4', 'Large'], ['5', 'Larger'], ['6', 'Huge']].map(function (s) { return el('option', { value: s[0], text: s[1] }); })));
    var color = el('input', { type: 'color', value: '#0f172a', title: 'Text colour', 'aria-label': 'Text colour', oninput: function () { area.focus(); document.execCommand('foreColor', false, color.value); changed(); } });
    var b = function (label, title, name, arg) { return el('button', { type: 'button', title: title, 'aria-label': title, onmousedown: cmd(name, arg) }, [label]); };
    var bar = el('div', { class: 'bar' }, [
      b(el('b', { text: 'B' }), 'Bold', 'bold'), b(el('i', { text: 'I' }), 'Italic', 'italic'), b(el('u', { text: 'U' }), 'Underline', 'underline'), b(el('s', { text: 'S' }), 'Strike through', 'strikeThrough'),
      b('x²', 'Superscript', 'superscript'), b('x₂', 'Subscript', 'subscript'), size, color,
      b('• List', 'Bulleted list', 'insertUnorderedList'), b('1. List', 'Numbered list', 'insertOrderedList'),
      b('⇤', 'Align left', 'justifyLeft'), b('↔', 'Centre', 'justifyCenter'), b('⇥', 'Align right', 'justifyRight'), b('⌫', 'Clear formatting', 'removeFormat'),
    ]);
    area.addEventListener('input', changed);
    // pasted text is cleaned like stored text (Word and web pages bring scripts, images and links)
    area.addEventListener('paste', function (e) {
      var data = e.clipboardData; if (!data) return;
      e.preventDefault();
      var html = data.getData('text/html');
      if (html) document.execCommand('insertHTML', false, cleanHtml(html).innerHTML);
      else document.execCommand('insertText', false, data.getData('text/plain'));
      changed();
    });
    function get() { var html = cleanHtml(area.innerHTML).innerHTML; return area.textContent.trim() || /<(hr|table)/i.test(html) ? html : ''; }
    return { node: el('div', { class: 'rte' }, [bar, area]), get: get, focus: function () { area.focus(); } };
  }

  // ---------- dialogs ----------
  // Most screens grow to their content (the school page scrolls, not the frame), so a dialog centred in
  // the frame could open far from what the person sees. A dialog opens where they last tapped instead;
  // a screen that fills the window (height "fill") keeps it centred.
  var lastTap = null;
  document.addEventListener('pointerdown', function (e) { lastTap = e.clientY + (window.scrollY || 0); }, true);
  function showDialog(dlg) {
    document.body.appendChild(dlg); dlg.showModal();
    var grows = document.body.getAttribute('data-height') !== 'fill';
    if (!grows || lastTap === null || window.innerHeight < 900) return dlg;
    var height = dlg.offsetHeight; var page = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    var top = Math.max(8, Math.min(lastTap - 80, page - height - 8));
    dlg.style.position = 'absolute'; dlg.style.margin = '0'; dlg.style.left = '50%'; dlg.style.transform = 'translateX(-50%)'; dlg.style.top = top + 'px'; dlg.style.maxHeight = '680px';
    var body = dlg.querySelector('.d-body'); if (body) body.style.maxHeight = '540px';
    return dlg;
  }
  function confirmBox(title, message, label, danger) {
    return new Promise(function (resolve) {
      var dlg = el('dialog', { class: 'sm' }, [
        el('div', { class: 'd-head' }, [el('h2', { text: title, style: 'margin:0' })]),
        el('div', { class: 'd-body' }, [el('p', { text: message })]),
        el('div', { class: 'd-foot' }, [
          el('button', { type: 'button', onclick: function () { dlg.close(); resolve(false); } }, ['Cancel']),
          el('button', { type: 'button', class: danger ? 'danger' : 'primary', onclick: function () { dlg.close(); resolve(true); } }, [label || 'OK']),
        ]),
      ]);
      dlg.addEventListener('close', function () { dlg.remove(); resolve(false); });
      showDialog(dlg);
    });
  }

  // ---------- pictures and recordings stored with an exam ----------
  var cache = {};
  function mediaId(ref) { var m = /^media:([0-9a-f-]{36})$/.exec(String(ref || '')); return m ? m[1] : null; }
  /** the data URL of "media:<id>" (student: through the student route), or an inline picture as it is */
  function loadMedia(ref, student) {
    if (/^data:/.test(String(ref || ''))) return Promise.resolve(ref);
    var id = mediaId(ref); if (!id) return Promise.resolve(null);
    var key = (student ? 's:' : 'm:') + id;
    if (!cache[key]) cache[key] = ui.api.get((student ? 'student/media/' : 'media/') + id).then(function (m) { return m && m.complete ? m.dataUrl : null; }).catch(function (e) { delete cache[key]; throw e; });
    return cache[key];
  }
  function readAsDataUrl(file) { return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = function () { reject(new Error('The file could not be read')); }; r.readAsDataURL(file); }); }
  // a picture made small enough to keep (at most maxSide pixels on its long side)
  function shrinkImage(file, maxSide) {
    return readAsDataUrl(file).then(function (src) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, (maxSide || 1600) / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = function () { reject(new Error('This picture cannot be opened')); };
        img.src = src;
      });
    });
  }
  /** Uploads a picture (shrunk) or a recording for an exam; resolves "media:<id>". */
  function uploadMedia(examId, file, kind, onProgress) {
    var ready = kind === 'IMAGE' ? shrinkImage(file, 1600) : readAsDataUrl(file);
    return ready.then(function (dataUrl) {
      var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      if (!m) throw new Error('The file could not be read');
      var mime = kind === 'AUDIO' && m[1] === 'audio/mp3' ? 'audio/mpeg' : m[1];
      var base64 = m[2]; var bytes = Math.floor(base64.length * 3 / 4) - (base64.slice(-2) === '==' ? 2 : base64.slice(-1) === '=' ? 1 : 0);
      var size = 188000; var parts = Math.max(1, Math.ceil(base64.length / size));
      return ui.api.post('media', { examId: examId, kind: kind, mime: mime, bytes: bytes, parts: parts }).then(function (created) {
        var index = 0;
        var next = function () {
          if (index >= parts) { cache['m:' + created.id] = Promise.resolve(dataUrl); return created.ref; }
          var i = index++;
          if (onProgress) onProgress(i / parts);
          return ui.api.put('media/' + created.id + '/parts/' + i, { data: base64.slice(i * size, (i + 1) * size) }).then(next);
        };
        return next();
      });
    });
  }

  window.Exam = {
    ui: ui, $: $, el: el, clear: clear, say: say, errorText: errorText, busy: busy,
    STATUS: STATUS, STATUS_HINT: STATUS_HINT, chip: chip, plural: plural, num: num, dateTime: dateTime, localInput: localInput, fromLocalInput: fromLocalInput,
    attemptsText: attemptsText, stat: stat, skeletons: skeletons, empty: empty,
    cleanHtml: cleanHtml, rich: rich, plain: plain, richEditor: richEditor, confirm: confirmBox, showDialog: showDialog,
    loadMedia: loadMedia, uploadMedia: uploadMedia, mediaId: mediaId,
    can: function (permission) { var p = (ui.context() || {}).permissions; return !p || p.indexOf('wattanam.examination.' + permission) >= 0; },
  };
})();
