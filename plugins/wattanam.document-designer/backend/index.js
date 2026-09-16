'use strict';

const crypto = require('crypto');
const TABLE = 'plugin_wattanam_document_designer_template';
const DOCUMENT_TYPES = new Set(['student', 'staff', 'teacher-part-time', 'certificate-student', 'certificate-staff', 'qr-sheet', 'general']);

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
      { id: 'templates', label: 'Document Designer', href: '/plugins/wattanam.document-designer/templates', permission: 'wattanam.document-designer.view' },
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
        const design = designOf(bodyOf(request).design);
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
        const design = designOf(body.design || {});
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
        const design = designOf(body.design);
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
  },
  deactivate(context) { context.logger.log('Wattanam Document Designer deactivated'); },
  health() { return { status: 'ready' }; },
};
