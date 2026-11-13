/* Minimal Excel (.xlsx) reader and writer for the class roster import/export.
 * No dependencies, no network, no dynamic code: it runs inside the sandboxed plugin frame.
 *   WattanamXlsx.write(rows, sheetName)  -> Uint8Array of a one-sheet workbook (styled header row)
 *   WattanamXlsx.readCsv(arrayBuffer)    -> Promise<string>: the first worksheet as CSV text
 * Reading uses the browser's DecompressionStream for compressed entries. */
(function (global) {
  'use strict';
  var encoder = new TextEncoder();
  var decoder = new TextDecoder('utf-8');

  // ---- CRC-32 and a store-only (uncompressed) zip writer ----
  var crcTable = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n += 1) { var c = n; for (var k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
    return table;
  })();
  function crc32(bytes) { var crc = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var parts = [], central = [], offset = 0;
    files.forEach(function (file) {
      var name = encoder.encode(file.name), data = encoder.encode(file.text), crc = crc32(data);
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
      local.setUint16(10, 0, true); local.setUint16(12, 0x21, true); local.setUint32(14, crc, true); local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      var entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true); entry.setUint16(10, 0, true);
      entry.setUint16(12, 0, true); entry.setUint16(14, 0x21, true); entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true);
      entry.setUint16(28, name.length, true); entry.setUint32(42, offset, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      central.push(new Uint8Array(entry.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var centralSize = central.reduce(function (sum, part) { return sum + part.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var out = new Uint8Array(all.reduce(function (sum, part) { return sum + part.length; }, 0)), at = 0;
    all.forEach(function (part) { out.set(part, at); at += part.length; });
    return out;
  }

  // ---- writer ----
  function xml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/[^\x09\x0A\x0D\x20-퟿-�]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function columnName(index) { var name = ''; for (var n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name; return name; }
  function write(rows, sheetName) {
    var width = rows.reduce(function (max, row) { return Math.max(max, row.length); }, 1);
    var cols = ''; for (var c = 1; c <= width; c += 1) cols += '<col min="' + c + '" max="' + c + '" width="20" customWidth="1"/>';
    var body = rows.map(function (row, r) {
      return '<row r="' + (r + 1) + '">' + row.map(function (value, col) {
        var ref = columnName(col) + (r + 1), style = r === 0 ? ' s="1"' : '';
        // Everything is written as text so identifiers such as "0001" keep their leading zeros.
        return '<c r="' + ref + '" t="inlineStr"' + style + '><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
      }).join('') + '</row>';
    }).join('');
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    var rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return zip([
      { name: '[Content_Types].xml', text: head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', text: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + rel + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: head + '<workbook xmlns="' + main + '" xmlns:r="' + rel + '"><sheets><sheet name="' + xml(String(sheetName || 'Sheet1').slice(0, 31)) + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + rel + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + rel + '/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', text: head + '<styleSheet xmlns="' + main + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>' },
      { name: 'xl/worksheets/sheet1.xml', text: head + '<worksheet xmlns="' + main + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + cols + '</cols><sheetData>' + body + '</sheetData></worksheet>' },
    ]);
  }

  // ---- reader ----
  function inflate(bytes) {
    if (typeof global.DecompressionStream !== 'function') return Promise.reject(new Error('This browser cannot open Excel files here. Save the sheet as CSV and upload that instead.'));
    var stream = new Blob([bytes]).stream().pipeThrough(new global.DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
  }
  function unzip(buffer) {
    var bytes = new Uint8Array(buffer), view = new DataView(buffer), end = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('This file is not a valid Excel workbook.');
    var count = view.getUint16(end + 10, true), at = view.getUint32(end + 16, true), entries = {};
    for (var n = 0; n < count; n += 1) {
      if (view.getUint32(at, true) !== 0x02014b50) throw new Error('This file is not a valid Excel workbook.');
      var method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true), nameLength = view.getUint16(at + 28, true);
      var extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
      var name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
      var dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      entries[name] = { method: method, data: bytes.subarray(dataStart, dataStart + size) };
      at += 46 + nameLength + extra + comment;
    }
    return {
      has: function (name) { return Boolean(entries[name]); },
      text: function (name) {
        var entry = entries[name];
        if (!entry) return Promise.resolve('');
        if (entry.method === 0) return Promise.resolve(decoder.decode(entry.data));
        if (entry.method !== 8) return Promise.reject(new Error('This Excel file uses an unsupported compression method.'));
        return inflate(entry.data).then(function (data) { return decoder.decode(data); });
      },
    };
  }
  function parse(text) { return new DOMParser().parseFromString(text, 'application/xml'); }
  function children(node, name) { return Array.prototype.filter.call(node.childNodes, function (child) { return child.localName === name; }); }
  function richText(node) { return Array.prototype.map.call(node.getElementsByTagNameNS('*', 't'), function (item) { return item.parentNode.localName === 'rPh' ? '' : item.textContent; }).join(''); }
  function columnIndex(ref) { var letters = String(ref || '').replace(/[^A-Z]/gi, '').toUpperCase(), index = 0; for (var i = 0; i < letters.length; i += 1) index = index * 26 + (letters.charCodeAt(i) - 64); return index - 1; }
  function isDateFormat(id, custom) {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    var code = custom[id];
    return Boolean(code) && /[dmyhs]/i.test(code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '').replace(/\\./g, ''));
  }
  function excelDate(serial) {
    var date = new Date(Math.round((serial - 25569) * 86400000));
    return isNaN(date.getTime()) ? String(serial) : date.toISOString().slice(0, 10);
  }
  function csvCell(value) { var text = String(value === undefined || value === null ? '' : value); return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; }

  function readCsv(buffer) {
    var archive;
    try { archive = unzip(buffer); } catch (error) { return Promise.reject(error); }
    return Promise.all([archive.text('xl/workbook.xml'), archive.text('xl/_rels/workbook.xml.rels'), archive.text('xl/sharedStrings.xml'), archive.text('xl/styles.xml')]).then(function (parts) {
      var sheets = parse(parts[0]).getElementsByTagNameNS('*', 'sheet');
      if (!sheets.length) throw new Error('The workbook has no worksheet.');
      var relId = sheets[0].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sheets[0].getAttribute('r:id');
      var target = 'worksheets/sheet1.xml';
      Array.prototype.forEach.call(parse(parts[1] || '<x/>').getElementsByTagNameNS('*', 'Relationship'), function (item) { if (item.getAttribute('Id') === relId) target = item.getAttribute('Target'); });
      var path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target;
      var shared = parts[2] ? Array.prototype.map.call(parse(parts[2]).getElementsByTagNameNS('*', 'si'), richText) : [];
      var custom = {}, dateStyles = [];
      if (parts[3]) {
        var styles = parse(parts[3]);
        Array.prototype.forEach.call(styles.getElementsByTagNameNS('*', 'numFmt'), function (item) { custom[Number(item.getAttribute('numFmtId'))] = item.getAttribute('formatCode') || ''; });
        var cellXfs = styles.getElementsByTagNameNS('*', 'cellXfs')[0];
        if (cellXfs) children(cellXfs, 'xf').forEach(function (xf) { dateStyles.push(isDateFormat(Number(xf.getAttribute('numFmtId') || 0), custom)); });
      }
      return archive.text(path).then(function (sheetText) {
        if (!sheetText) throw new Error('The workbook has no worksheet.');
        var lines = [];
        Array.prototype.forEach.call(parse(sheetText).getElementsByTagNameNS('*', 'row'), function (row) {
          var values = [], next = 0;
          children(row, 'c').forEach(function (cell) {
            var index = cell.getAttribute('r') ? columnIndex(cell.getAttribute('r')) : next;
            next = index + 1;
            var type = cell.getAttribute('t'), raw = (children(cell, 'v')[0] || {}).textContent || '', value;
            if (type === 's') value = shared[Number(raw)] || '';
            else if (type === 'inlineStr') value = children(cell, 'is')[0] ? richText(children(cell, 'is')[0]) : '';
            else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
            else if (type === 'str' || type === 'e') value = raw;
            else if (type === 'd') value = raw.slice(0, 10);
            else if (raw !== '' && dateStyles[Number(cell.getAttribute('s') || 0)] && isFinite(Number(raw))) value = excelDate(Number(raw));
            else value = raw;
            values[index] = value;
          });
          for (var i = 0; i < values.length; i += 1) if (values[i] === undefined) values[i] = '';
          if (values.some(function (value) { return String(value) !== ''; })) lines.push(values.map(csvCell).join(','));
        });
        return lines.join('\n');
      });
    });
  }

  global.WattanamXlsx = { write: write, readCsv: readCsv };
})(window);
