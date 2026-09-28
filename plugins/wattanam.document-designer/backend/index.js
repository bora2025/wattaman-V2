'use strict';

const crypto = require('crypto');
const TABLE = 'plugin_wattanam_document_designer_template';
const DOCUMENT_TYPES = new Set(['student', 'staff', 'teacher-part-time', 'certificate-student', 'certificate-staff', 'qr-sheet', 'general']);
const ASSET_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'font/woff', 'font/woff2']);
const ELEMENT_TYPES = new Set(['text', 'image', 'qr', 'shape', 'photo']);
const SHAPE_TYPES = new Set(['rectangle', 'circle', 'line']);
const FONT_FAMILIES = new Set(['Inter, sans-serif', 'Arial, sans-serif', 'Times New Roman, serif', 'Georgia, serif', 'Courier New, monospace', 'Verdana, sans-serif', '"Noto Sans Khmer", sans-serif', 'Battambang, sans-serif', 'Moul, serif', 'Siemreap, sans-serif', 'Hanuman, serif', 'Bokor, serif', 'Koulen, sans-serif', 'Chenla, sans-serif', 'Content, sans-serif', 'Khmer, sans-serif']);
const DATA_PATH = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/;

function bodyOf(request) {
  return request.body && typeof request.body === 'object' ? request.body : {};
}

function requiredName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 120) throw new Error('name is required and must not exceed 120 characters');
  return name;
}

function requiredDocumentType(value) {
  if (!DOCUMENT_TYPES.has(value)) throw new Error(`documentType must be one of: ${[...DOCUMENT_TYPES].join(', ')}`);
  return value;
}

function designOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('design must be a JSON object');
  return value;
}

function assetId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/.test(value)) throw new Error('asset id is invalid');
  return value;
}

function assetInput(value) {
  const input = value && typeof value === 'object' ? value : {};
  const suppliedName = input.name ?? input.fileName;
  const fileName = typeof suppliedName === 'string' ? suppliedName.trim() : '';
  if (!fileName || fileName.length > 160 || /[\\/\0]/.test(fileName)) throw new Error('fileName is invalid');
  if (!ASSET_MIME_TYPES.has(input.mimeType)) throw new Error('mimeType is not allowed');
  const data = input.dataBase64 ?? input.data;
  if (typeof data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
    throw new Error('data must be canonical base64');
  }
  return { fileName, mimeType: input.mimeType, data };
}

function generationRecords(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) throw new Error('records must contain between 1 and 500 items');
  const records = value.map((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || Object.getPrototypeOf(record) !== Object.prototype) {
      throw new Error('each generation record must be a JSON object');
    }
    return record;
  });
  const encoded = JSON.stringify(records);
  if (Buffer.byteLength(encoded) > 1024 * 1024) throw new Error('generation records exceed 1 MiB');
  return JSON.parse(encoded);
}

function staffIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) throw new Error('staffIds must contain between 1 and 500 items');
  const ids = value.map((item) => {
    const id = typeof item === 'string' ? item.trim() : '';
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('staffId is invalid');
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new Error('staffIds must be unique');
  return ids;
}

async function staffDocumentSource(context, request) {
  const ids = staffIds(bodyOf(request).staffIds);
  const people = await context.directory.lookupUsers(ids);
  const byId = new Map(people.map((person) => [person.id, person]));
  if (ids.some((id) => !byId.has(id))) throw new Error('one or more staff identities were not found');
  for (const id of ids) {
    const role = String(byId.get(id).role || '').toUpperCase();
    if (role === 'STUDENT' || role === 'PARENT') throw new Error('staffIds must contain employee identities only');
  }
  let profiles = [];
  try { profiles = await context.readModels.read('wattanam.human-resources', 'staff-document-profile', [1], ids); } catch { /* HR is optional. */ }
  const profileById = new Map(profiles.map((profile) => [profile.key, profile.data]));
  return ids.map((id) => {
    const person = byId.get(id);
    const profile = profileById.get(id) || {};
    return { id, name: person.name || '', role: person.role || '', title: profile.title || null };
  });
}

function finiteNumber(value, name, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${name} is invalid`);
  return number;
}

function shapeGradient(value, name) {
  const gradient = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (!gradient.enabled) return { enabled: false, type: 'linear', angle: 0, stops: [] };
  const type = gradient.type === 'radial' ? 'radial' : 'linear';
  const angle = finiteNumber(gradient.angle ?? 0, `${name}.angle`, -360, 360);
  if (!Array.isArray(gradient.stops) || gradient.stops.length < 2 || gradient.stops.length > 8) throw new Error(`${name}.stops must contain 2..8 items`);
  const stops = gradient.stops.map((stop, index) => {
    if (!stop || typeof stop !== 'object' || Array.isArray(stop)) throw new Error(`${name}.stops[${index}] is invalid`);
    const offset = finiteNumber(stop.offset, `${name}.stops[${index}].offset`, 0, 1);
    if (typeof stop.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(stop.color)) throw new Error(`${name}.stops[${index}].color is invalid`);
    return { offset, color: stop.color };
  });
  if (stops.some((stop, index) => index > 0 && stop.offset < stops[index - 1].offset)) throw new Error(`${name}.stops must be ordered`);
  return { enabled: true, type, angle, stops };
}

function safeDataPath(path) {
  const segments = typeof path === 'string' ? path.split('.') : [];
  return DATA_PATH.test(path) && !segments.some((segment) => ['__proto__', 'prototype', 'constructor'].includes(segment));
}

function safePhotoValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 1024 * 1024) throw new Error('photo value is invalid');
  if (/^\/(?!\/)[a-zA-Z0-9._~!$&'()*+,;=:@%/-]{1,2047}$/.test(value)) return value;
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || match[1].length % 4 !== 0 || Buffer.from(match[1], 'base64').toString('base64') !== match[1]) throw new Error('photo value must be a same-origin path or canonical embedded raster image');
  return value;
}

function dataAt(record, path) {
  const segments = path.split('.');
  if (!safeDataPath(path)) throw new Error('element binding is invalid');
  return segments.reduce((value, key) => (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined), record);
}

function designForWrite(value) {
  const design = designOf(value);
  // Preserve legacy CardDesign payloads byte-for-byte during the rollback window. New schema-v2
  // page/element designs are normalized and bounded before they ever reach storage.
  return design.page !== undefined || design.elements !== undefined ? documentDesign(design) : design;
}

function legacyBinding(content) {
  if (typeof content !== 'string') return undefined;
  const match = /^\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}$/.exec(content);
  return match && safeDataPath(match[1]) ? match[1] : undefined;
}

function legacyDocumentDesign(design) {
  const width = finiteNumber(design.width ?? 856, 'legacy page width', 100, 4000);
  const height = finiteNumber(design.height ?? 540, 'legacy page height', 100, 4000);
  const background = typeof design.backgroundColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(design.backgroundColor) ? design.backgroundColor : '#ffffff';
  const frameColor = typeof design.frameColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(design.frameColor) ? design.frameColor : '#111827';
  const frameWidth = finiteNumber(design.frameWidth ?? 0, 'legacy page frameWidth', 0, 50);
  const elements = [];
  for (const [index, candidate] of (Array.isArray(design.texts) ? design.texts : []).entries()) {
    const id = typeof candidate?.id === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(candidate.id) ? candidate.id : `legacy-text-${index + 1}`;
    const x = finiteNumber(candidate?.x ?? 0, `${id}.x`, 0, width);
    const y = finiteNumber(candidate?.y ?? 0, `${id}.y`, 0, height);
    const fontSize = finiteNumber(candidate?.fontSize ?? 18, `${id}.fontSize`, 6, 200);
    const elementWidth = finiteNumber(candidate?.width ?? Math.min(width - x, Math.max(40, String(candidate?.content || '').length * fontSize * 0.65)), `${id}.width`, 1, width);
    const elementHeight = finiteNumber(candidate?.height ?? Math.min(height - y, fontSize * 1.5), `${id}.height`, 1, height);
    if (x + elementWidth > width || y + elementHeight > height) throw new Error(`legacy element ${id} exceeds the page`);
    const binding = legacyBinding(candidate?.content);
    elements.push({
      id, type: 'text', x, y, width: elementWidth, height: elementHeight,
      rotation: finiteNumber(candidate?.rotation ?? 0, `${id}.rotation`, -360, 360),
      zIndex: finiteNumber(candidate?.zIndex ?? 0, `${id}.zIndex`, -1000, 1000),
      text: binding ? '' : String(candidate?.content || '').slice(0, 2000), ...(binding ? { binding } : {}),
      color: typeof candidate?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.color) ? candidate.color : '#111827',
      fontSize, fontWeight: candidate?.fontWeight === 'bold' ? 'bold' : 'normal',
      fontStyle: candidate?.fontStyle === 'italic' ? 'italic' : 'normal',
      fontFamily: FONT_FAMILIES.has(candidate?.fontFamily) ? candidate.fontFamily : 'Inter, sans-serif',
      textAlign: ['left', 'center', 'right'].includes(candidate?.textAlign) ? candidate.textAlign : 'left',
    });
  }
  for (const [index, candidate] of (Array.isArray(design.shapes) ? design.shapes : []).entries()) {
    const id = typeof candidate?.id === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(candidate.id) ? candidate.id : `legacy-shape-${index + 1}`;
    if (!SHAPE_TYPES.has(candidate?.type)) throw new Error(`legacy shape ${id} has an unsupported type`);
    const x = finiteNumber(candidate.x ?? 0, `${id}.x`, 0, width);
    const y = finiteNumber(candidate.y ?? 0, `${id}.y`, 0, height);
    const elementWidth = finiteNumber(candidate.width ?? 80, `${id}.width`, 1, width);
    const elementHeight = finiteNumber(candidate.height ?? (candidate.type === 'line' ? 1 : 80), `${id}.height`, 1, height);
    if (x + elementWidth > width || y + elementHeight > height) throw new Error(`legacy element ${id} exceeds the page`);
    elements.push({
      id, type: 'shape', shapeType: candidate.type, x, y, width: elementWidth, height: elementHeight,
      rotation: finiteNumber(candidate.rotation ?? 0, `${id}.rotation`, -360, 360),
      zIndex: finiteNumber(candidate.zIndex ?? 0, `${id}.zIndex`, -1000, 1000),
      fill: typeof candidate.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.color) ? candidate.color : '#ffffff',
      borderColor: typeof candidate.borderColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.borderColor) ? candidate.borderColor : '#111827',
      borderWidth: finiteNumber(candidate.borderWidth ?? 0, `${id}.borderWidth`, 0, 50),
      borderRadius: finiteNumber(candidate.type === 'circle' ? Math.min(elementWidth, elementHeight) / 2 : candidate.borderRadius ?? 0, `${id}.borderRadius`, 0, 2000),
      opacity: finiteNumber(candidate.opacity ?? 1, `${id}.opacity`, 0, 1),
      lineStyle: ['solid', 'dashed', 'dotted'].includes(candidate.lineStyle) ? candidate.lineStyle : 'solid',
      gradient: shapeGradient(candidate.gradient, `${id}.gradient`),
    });
  }
  if (design.photo) {
    const candidate = design.photo;
    const elementWidth = finiteNumber(candidate.width ?? 100, 'legacy-photo.width', 1, width);
    const elementHeight = finiteNumber(candidate.height ?? 120, 'legacy-photo.height', 1, height);
    const x = finiteNumber(candidate.x ?? 0, 'legacy-photo.x', 0, width);
    const y = finiteNumber(candidate.y ?? 0, 'legacy-photo.y', 0, height);
    if (x + elementWidth > width || y + elementHeight > height) throw new Error('legacy element legacy-photo exceeds the page');
    elements.push({
      id: 'legacy-photo', type: 'photo', x, y, width: elementWidth, height: elementHeight, rotation: 0,
      zIndex: finiteNumber(candidate.zIndex ?? 0, 'legacy-photo.zIndex', -1000, 1000),
      binding: 'photo', fit: 'cover', borderColor: typeof candidate.borderColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.borderColor) ? candidate.borderColor : '#111827',
      borderWidth: finiteNumber(candidate.borderWidth ?? 0, 'legacy-photo.borderWidth', 0, 50),
      borderRadius: finiteNumber(candidate.borderRadius ?? 0, 'legacy-photo.borderRadius', 0, 2000),
    });
  }
  for (const [index, candidate] of (Array.isArray(design.logos) ? design.logos : []).entries()) {
    const id = typeof candidate?.id === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(candidate.id) ? candidate.id : `legacy-image-${index + 1}`;
    if (!candidate?.assetId) throw new Error(`legacy image ${id} is not converted to plugin-scoped storage`);
    const x = finiteNumber(candidate.x ?? 0, `${id}.x`, 0, width);
    const y = finiteNumber(candidate.y ?? 0, `${id}.y`, 0, height);
    const elementWidth = finiteNumber(candidate.width ?? 80, `${id}.width`, 1, width);
    const elementHeight = finiteNumber(candidate.height ?? 80, `${id}.height`, 1, height);
    if (x + elementWidth > width || y + elementHeight > height) throw new Error(`legacy element ${id} exceeds the page`);
    elements.push({ id, type: 'image', x, y, width: elementWidth, height: elementHeight, rotation: finiteNumber(candidate.rotation ?? 0, `${id}.rotation`, -360, 360), zIndex: finiteNumber(candidate.zIndex ?? 0, `${id}.zIndex`, -1000, 1000), assetId: assetId(candidate.assetId), fit: 'contain', opacity: finiteNumber(candidate.opacity ?? 1, `${id}.opacity`, 0, 1), borderRadius: finiteNumber(candidate.borderRadius ?? 0, `${id}.borderRadius`, 0, 2000) });
  }
  if (design.qr) {
    const candidate = design.qr;
    const elementWidth = finiteNumber(candidate.width ?? candidate.size ?? 80, 'legacy-qr.width', 1, width);
    const elementHeight = finiteNumber(candidate.height ?? candidate.size ?? 80, 'legacy-qr.height', 1, height);
    const x = finiteNumber(candidate.x ?? 0, 'legacy-qr.x', 0, width);
    const y = finiteNumber(candidate.y ?? 0, 'legacy-qr.y', 0, height);
    if (x + elementWidth > width || y + elementHeight > height) throw new Error('legacy element legacy-qr exceeds the page');
    elements.push({ id: 'legacy-qr', type: 'qr', x, y, width: elementWidth, height: elementHeight, rotation: 0, zIndex: finiteNumber(candidate.zIndex ?? 0, 'legacy-qr.zIndex', -1000, 1000), text: '', binding: 'qrCode', color: '#111827', fontSize: 18, fontWeight: 'normal', textAlign: 'left', borderColor: typeof candidate.borderColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.borderColor) ? candidate.borderColor : '#111827', borderWidth: finiteNumber(candidate.borderWidth ?? 0, 'legacy-qr.borderWidth', 0, 50), borderRadius: finiteNumber(candidate.borderRadius ?? 0, 'legacy-qr.borderRadius', 0, 2000) });
  }
  if (elements.length > 100) throw new Error('legacy design elements must contain at most 100 items');
  return { page: { width, height, background, frameColor, frameWidth, borderRadius: 12 }, elements };
}

function documentDesign(value) {
  const design = designOf(value);
  if (design.page === undefined && design.elements === undefined && (design.texts !== undefined || design.logos !== undefined || design.photo !== undefined || design.qr !== undefined)) {
    return legacyDocumentDesign(design);
  }
  const page = design.page && typeof design.page === 'object' && !Array.isArray(design.page) ? design.page : {};
  const width = finiteNumber(page.width ?? 856, 'page width', 100, 4000);
  const height = finiteNumber(page.height ?? 540, 'page height', 100, 4000);
  const background = typeof page.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(page.background) ? page.background : '#ffffff';
  const frameColor = typeof page.frameColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(page.frameColor) ? page.frameColor : '#111827';
  const frameWidth = finiteNumber(page.frameWidth ?? 0, 'page frameWidth', 0, 50);
  const borderRadius = finiteNumber(page.borderRadius ?? 0, 'page borderRadius', 0, 2000);
  const candidates = design.elements ?? design.blocks ?? [];
  if (!Array.isArray(candidates) || candidates.length > 100) throw new Error('design elements must contain at most 100 items');
  const ids = new Set();
  const elements = candidates.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`design element ${index + 1} is invalid`);
    const id = typeof candidate.id === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(candidate.id) ? candidate.id : `element-${index + 1}`;
    if (ids.has(id)) throw new Error('design element ids must be unique');
    ids.add(id);
    const type = String(candidate.type || 'text');
    if (!ELEMENT_TYPES.has(type)) throw new Error(`design element ${id} has an unsupported type`);
    const element = {
      id, type,
      x: finiteNumber(candidate.x ?? 0, `${id}.x`, 0, width),
      y: finiteNumber(candidate.y ?? 0, `${id}.y`, 0, height),
      width: finiteNumber(candidate.width ?? 160, `${id}.width`, 1, width),
      height: finiteNumber(candidate.height ?? 40, `${id}.height`, 1, height),
      rotation: finiteNumber(candidate.rotation ?? 0, `${id}.rotation`, -360, 360),
      zIndex: finiteNumber(candidate.zIndex ?? 0, `${id}.zIndex`, -1000, 1000),
    };
    if (element.x + element.width > width || element.y + element.height > height) throw new Error(`design element ${id} exceeds the page`);
    if (type === 'image') return { ...element, assetId: assetId(candidate.assetId), fit: ['contain', 'cover', 'fill'].includes(candidate.fit) ? candidate.fit : 'contain', opacity: finiteNumber(candidate.opacity ?? 1, `${id}.opacity`, 0, 1), borderRadius: finiteNumber(candidate.borderRadius ?? 0, `${id}.borderRadius`, 0, 2000) };
    if (type === 'photo') {
      const binding = String(candidate.binding || 'photo');
      if (!safeDataPath(binding)) throw new Error(`design element ${id} binding is invalid`);
      return {
        ...element, binding, fit: ['contain', 'cover', 'fill'].includes(candidate.fit) ? candidate.fit : 'cover',
        borderColor: typeof candidate.borderColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.borderColor) ? candidate.borderColor : '#111827',
        borderWidth: finiteNumber(candidate.borderWidth ?? 0, `${id}.borderWidth`, 0, 50),
        borderRadius: finiteNumber(candidate.borderRadius ?? 0, `${id}.borderRadius`, 0, 2000),
      };
    }
    if (type === 'shape') {
      const shapeType = SHAPE_TYPES.has(candidate.shapeType) ? candidate.shapeType : 'rectangle';
      return {
        ...element, shapeType,
        fill: typeof candidate.fill === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.fill) ? candidate.fill : '#ffffff',
        borderColor: typeof candidate.borderColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.borderColor) ? candidate.borderColor : '#111827',
        borderWidth: finiteNumber(candidate.borderWidth ?? 0, `${id}.borderWidth`, 0, 50),
        borderRadius: finiteNumber(shapeType === 'circle' ? Math.min(element.width, element.height) / 2 : candidate.borderRadius ?? 0, `${id}.borderRadius`, 0, 2000),
        opacity: finiteNumber(candidate.opacity ?? 1, `${id}.opacity`, 0, 1),
        lineStyle: ['solid', 'dashed', 'dotted'].includes(candidate.lineStyle) ? candidate.lineStyle : 'solid',
        gradient: shapeGradient(candidate.gradient, `${id}.gradient`),
      };
    }
    const binding = candidate.binding === undefined ? undefined : String(candidate.binding);
    if (binding !== undefined && !safeDataPath(binding)) throw new Error(`design element ${id} binding is invalid`);
    const text = typeof candidate.text === 'string' ? candidate.text.slice(0, 2000) : '';
    const color = typeof candidate.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.color) ? candidate.color : '#111827';
    return {
      ...element, text, ...(binding ? { binding } : {}), color,
      fontSize: finiteNumber(candidate.fontSize ?? 18, `${id}.fontSize`, 6, 200),
      fontWeight: ['normal', 'bold'].includes(candidate.fontWeight) ? candidate.fontWeight : 'normal',
      fontStyle: candidate.fontStyle === 'italic' ? 'italic' : 'normal',
      fontFamily: FONT_FAMILIES.has(candidate.fontFamily) ? candidate.fontFamily : 'Inter, sans-serif',
      textAlign: ['left', 'center', 'right'].includes(candidate.textAlign) ? candidate.textAlign : 'left',
    };
  });
  return { page: { width, height, background, frameColor, frameWidth, borderRadius }, elements };
}

function resolveElement(element, record) {
  if (element.type === 'image' || element.type === 'shape') return element;
  const value = element.binding ? dataAt(record, element.binding) : element.text;
  if (element.type === 'photo') return { ...element, value: safePhotoValue(value) };
  return { ...element, value: value == null ? '' : String(value).slice(0, 4000) };
}

async function renderModel(context, request) {
  const body = bodyOf(request);
  const records = generationRecords(body.records ?? body.payload?.records);
  const template = (await context.database.query(`SELECT "id", "name", "documentType", "design", "updatedAt" FROM ${TABLE} WHERE "id" = $1`, [request.params.id]))[0];
  if (!template) throw new Error('Template not found');
  const design = documentDesign(template.design);
  return {
    schemaVersion: 2,
    template: { id: template.id, name: template.name, documentType: template.documentType, design, updatedAt: template.updatedAt },
    records,
    documents: records.map((record, index) => ({
      id: String(record.id ?? `record-${index + 1}`),
      page: design.page,
      elements: design.elements.map((element) => resolveElement(element, record)),
    })),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  id: 'wattanam.document-designer',
  async activate(context) {
    context.logger.log('Wattanam Document Designer activated');
    context.permissions.register([
      { id: 'wattanam.document-designer.view', label: 'View document templates and previews' },
      { id: 'wattanam.document-designer.edit', label: 'Create and edit document templates' },
      { id: 'wattanam.document-designer.generate', label: 'Generate cards, certificates, and QR assets' },
      { id: 'wattanam.document-designer.print', label: 'Print or export generated documents' },
    ]);
    context.navigation.register([
      { id: 'templates', label: 'Document Designer', href: '/plugins/wattanam.document-designer/templates', permission: 'wattanam.document-designer.view', dashboard: { title: 'Document Designer', description: 'Design cards, certificates, QR sheets, and print-ready documents.', priority: 110 } },
    ]);

    context.routes.register({
      method: 'GET', path: 'templates', permission: 'wattanam.document-designer.view',
      handler: () => context.database.query(`SELECT "id", "name", "documentType", "isActive", "createdAt", "updatedAt" FROM ${TABLE} WHERE "isActive" = FALSE ORDER BY "createdAt" DESC`),
    });
    context.routes.register({
      method: 'GET', path: 'templates/:id', permission: 'wattanam.document-designer.view',
      async handler(request) {
        return (await context.database.query(`SELECT * FROM ${TABLE} WHERE "id" = $1`, [request.params.id]))[0] || null;
      },
    });
    context.routes.register({
      method: 'GET', path: 'active/:documentType', permission: 'wattanam.document-designer.view',
      async handler(request) {
        const documentType = requiredDocumentType(request.params.documentType);
        return (await context.database.query(`SELECT * FROM ${TABLE} WHERE "documentType" = $1 AND "isActive" = TRUE`, [documentType]))[0] || null;
      },
    });
    context.routes.register({
      method: 'PUT', path: 'active/:documentType', permission: 'wattanam.document-designer.edit',
      async handler(request) {
        const documentType = requiredDocumentType(request.params.documentType);
        const design = designForWrite(bodyOf(request).design);
        return context.database.transaction(async (tx) => {
          await tx.query(`SELECT "id" FROM ${TABLE} WHERE "documentType" = $1 ORDER BY "id" FOR UPDATE`, [documentType]);
          const active = await tx.query(`SELECT "id" FROM ${TABLE} WHERE "documentType" = $1 AND "isActive" = TRUE`, [documentType]);
          if (active[0]) {
            await tx.execute(`UPDATE ${TABLE} SET "design" = $1::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2`, [JSON.stringify(design), active[0].id]);
            return { id: active[0].id, name: '__active__', cardType: documentType, design };
          }
          const id = crypto.randomUUID();
          await tx.execute(`INSERT INTO ${TABLE} ("id", "name", "documentType", "design", "isActive") VALUES ($1, $2, $3, $4::jsonb, TRUE)`, [id, '__active__', documentType, JSON.stringify(design)]);
          return { id, name: '__active__', cardType: documentType, design };
        });
      },
    });
    context.routes.register({
      method: 'POST', path: 'templates', permission: 'wattanam.document-designer.edit',
      async handler(request) {
        const body = bodyOf(request);
        const id = crypto.randomUUID();
        const name = requiredName(body.name);
        const documentType = requiredDocumentType(body.documentType);
        const design = designForWrite(body.design || {});
        await context.database.execute(
          `INSERT INTO ${TABLE} ("id", "name", "documentType", "design") VALUES ($1, $2, $3, $4::jsonb)`,
          [id, name, documentType, JSON.stringify(design)],
        );
        return (await context.database.query(`SELECT * FROM ${TABLE} WHERE "id" = $1`, [id]))[0];
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'templates/:id', permission: 'wattanam.document-designer.edit',
      async handler(request) {
        const body = bodyOf(request);
        const name = requiredName(body.name);
        const design = designForWrite(body.design);
        await context.database.execute(
          `UPDATE ${TABLE} SET "name" = $1, "design" = $2::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $3`,
          [name, JSON.stringify(design), request.params.id],
        );
        return (await context.database.query(`SELECT * FROM ${TABLE} WHERE "id" = $1`, [request.params.id]))[0] || null;
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'templates/:id/active', permission: 'wattanam.document-designer.edit',
      async handler(request) {
        return context.database.transaction(async (tx) => {
          const found = await tx.query(`SELECT "id", "documentType" FROM ${TABLE} WHERE "id" = $1`, [request.params.id]);
          if (!found[0]) return null;
          await tx.query(`SELECT "id" FROM ${TABLE} WHERE "documentType" = $1 ORDER BY "id" FOR UPDATE`, [found[0].documentType]);
          await tx.execute(`UPDATE ${TABLE} SET "isActive" = FALSE, "updatedAt" = CURRENT_TIMESTAMP WHERE "documentType" = $1 AND "isActive" = TRUE`, [found[0].documentType]);
          await tx.execute(`UPDATE ${TABLE} SET "isActive" = TRUE, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [request.params.id]);
          return { id: request.params.id, documentType: found[0].documentType, isActive: true };
        });
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'templates/:id', permission: 'wattanam.document-designer.edit',
      async handler(request) {
        await context.database.execute(`DELETE FROM ${TABLE} WHERE "id" = $1`, [request.params.id]);
        return { ok: true };
      },
    });
    context.routes.register({
      method: 'POST', path: 'sources/staff', permission: 'wattanam.document-designer.generate',
      handler: (request) => staffDocumentSource(context, request),
    });
    context.routes.register({
      method: 'POST', path: 'templates/:id/generate', permission: 'wattanam.document-designer.generate',
      async handler(request) {
        // Callers must supply records that were already authorized by their owning domain.
        // This plugin deliberately performs no cross-plugin person or roster query.
        return renderModel(context, request);
      },
    });
    context.routes.register({
      method: 'POST', path: 'templates/:id/export-model', permission: 'wattanam.document-designer.print',
      handler: (request) => renderModel(context, request),
    });
    context.routes.register({
      method: 'GET', path: 'assets', permission: 'wattanam.document-designer.view',
      async handler() {
        const names = await context.storage.list('assets/');
        const metadataNames = names.filter((name) => name.endsWith('.json'));
        const assets = await Promise.all(metadataNames.map(async (name) => {
          const value = await context.storage.readText(name);
          try {
            if (!value) return null;
            const metadata = JSON.parse(value);
            return { ...metadata, name: metadata.name || metadata.fileName };
          } catch { return null; }
        }));
        return assets.filter(Boolean).sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
      },
    });
    context.routes.register({
      method: 'POST', path: 'assets', permission: 'wattanam.document-designer.edit',
      async handler(request) {
        const input = assetInput(bodyOf(request));
        const id = crypto.randomUUID();
        const metadata = { id, name: input.fileName, mimeType: input.mimeType, size: Buffer.from(input.data, 'base64').byteLength, createdAt: new Date().toISOString() };
        await context.storage.writeBinary(`assets/${id}.bin`, input.data);
        try {
          await context.storage.writeText(`assets/${id}.json`, JSON.stringify(metadata));
        } catch (error) {
          await context.storage.delete(`assets/${id}.bin`).catch(() => undefined);
          throw error;
        }
        return metadata;
      },
    });
    context.routes.register({
      method: 'GET', path: 'assets/:id', permission: 'wattanam.document-designer.view',
      async handler(request) {
        const id = assetId(request.params.id);
        const metadataValue = await context.storage.readText(`assets/${id}.json`);
        if (!metadataValue) return null;
        const data = await context.storage.readBinary(`assets/${id}.bin`);
        const metadata = JSON.parse(metadataValue);
        return data == null ? null : { ...metadata, name: metadata.name || metadata.fileName, dataBase64: data };
      },
    });
    context.routes.register({
      method: 'DELETE', path: 'assets/:id', permission: 'wattanam.document-designer.edit',
      async handler(request) {
        const id = assetId(request.params.id);
        await context.storage.delete(`assets/${id}.bin`);
        await context.storage.delete(`assets/${id}.json`);
        return { ok: true };
      },
    });
  },
  deactivate(context) { context.logger.log('Wattanam Document Designer deactivated'); },
  health() { return { status: 'ready' }; },
};
