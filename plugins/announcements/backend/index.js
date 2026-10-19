'use strict';

const crypto = require('crypto');

const TABLE = 'plugin_wattanam_announcements_announcement';
const READ_TABLE = 'plugin_wattanam_announcements_announcement_read';
const AUDIENCES = ['SCHOOL', 'ROLE', 'CLASS'];
const CHANNELS = ['IN_APP', 'EMAIL', 'SMS'];

function toDto(row) {
  return {
    id: row.id, authorId: row.authorId, title: row.title, body: row.body,
    audience: row.audience, targetRole: row.targetRole, classId: row.classId,
    channels: row.channels, pinned: row.pinned, scheduledAt: row.scheduledAt,
    sentAt: row.sentAt, createdAt: row.createdAt,
  };
}

module.exports = {
  id: 'wattanam.announcements',
  async activate(context) {
    context.logger.log('Announcements reference plugin activated');
    context.permissions.register([
      { id: 'wattanam.announcements.read', label: 'Read announcements' },
      { id: 'wattanam.announcements.manage', label: 'Manage announcement settings' },
    ]);
    context.navigation.register([{ id: 'settings', label: 'Announcement settings', href: '/plugins/wattanam.announcements/settings', permission: 'wattanam.announcements.manage' }]);

    context.routes.register({
      method: 'GET', path: 'settings', permission: 'wattanam.announcements.read',
      async handler() {
        return context.settings.get('preferences', { digestEnabled: true, audience: 'all' });
      },
    });
    context.routes.register({
      method: 'PATCH', path: 'settings', permission: 'wattanam.announcements.manage',
      async handler(request) {
        const input = request.body && typeof request.body === 'object' ? request.body : {};
        const preferences = {
          digestEnabled: input.digestEnabled !== false,
          audience: ['all', 'staff', 'parents'].includes(input.audience) ? input.audience : 'all',
        };
        await context.settings.set('preferences', preferences);
        return preferences;
      },
    });

    // Resolve author name/role and class name at read time -- the plugin
    // holds only ids, never a live core-table join, so display data is
    // looked up through directory.read on every response.
    async function enrich(rows) {
      const authorIds = [...new Set(rows.map((row) => row.authorId))];
      const classIds = [...new Set(rows.filter((row) => row.classId).map((row) => row.classId))];
      const [authors, classes] = await Promise.all([
        context.directory.lookupUsers(authorIds),
        context.directory.lookupClasses(classIds),
      ]);
      const authorById = new Map(authors.map((author) => [author.id, author]));
      const classById = new Map(classes.map((cls) => [cls.id, cls]));
      return rows.map((row) => {
        const author = authorById.get(row.authorId);
        const cls = row.classId ? classById.get(row.classId) : undefined;
        return {
          ...toDto(row),
          author: author ? { id: author.id, name: author.name, role: author.role } : { id: row.authorId, name: 'Unknown', role: '' },
          class: cls ? { id: cls.id, name: cls.name } : null,
        };
      });
    }

    context.routes.register({
      method: 'GET', path: 'all', permission: 'wattanam.announcements.manage',
      async handler() {
        const rows = await context.database.query(`SELECT * FROM ${TABLE} ORDER BY pinned DESC, "createdAt" DESC`, []);
        const counts = await context.database.query(`SELECT "announcementId" as id, COUNT(*)::int as count FROM ${READ_TABLE} GROUP BY "announcementId"`, []);
        const countById = new Map(counts.map((row) => [row.id, row.count]));
        const enriched = await enrich(rows);
        return enriched.map((row) => {
          const readCount = countById.get(row.id) || 0;
          // Keep the legacy nested count for existing API clients while exposing a
          // portable field name that the universal table contract can bind safely.
          return { ...row, readCount, _count: { reads: readCount } };
        });
      },
    });

    context.routes.register({
      method: 'GET', path: 'feed', permission: 'wattanam.announcements.read',
      async handler(request) {
        const userId = request.principal.userId;
        const role = request.principal.role;
        const classIds = await context.directory.classesForUser(userId, role);
        const takeRaw = Array.isArray(request.query.take) ? request.query.take[0] : request.query.take;
        const skipRaw = Array.isArray(request.query.skip) ? request.query.skip[0] : request.query.skip;
        const take = Math.min(Math.max(parseInt(takeRaw, 10) || 100, 1), 100);
        const skip = Math.max(parseInt(skipRaw, 10) || 0, 0);

        const params = [role];
        const conditions = [`audience = 'SCHOOL'`, `(audience = 'ROLE' AND "targetRole" = 'ALL')`, `(audience = 'ROLE' AND "targetRole" = $1)`];
        if (classIds.length) {
          const placeholders = classIds.map((_, index) => `$${params.length + index + 1}`).join(',');
          conditions.push(`(audience = 'CLASS' AND "classId" IN (${placeholders}))`);
          params.push(...classIds);
        }
        const rows = await context.database.query(
          `SELECT * FROM ${TABLE} WHERE "sentAt" IS NOT NULL AND (${conditions.join(' OR ')}) ORDER BY pinned DESC, "sentAt" DESC LIMIT ${take} OFFSET ${skip}`,
          params,
        );

        const ids = rows.map((row) => row.id);
        let readRows = [];
        if (ids.length) {
          const placeholders = ids.map((_, index) => `$${index + 2}`).join(',');
          readRows = await context.database.query(`SELECT "announcementId" as id, "readAt" FROM ${READ_TABLE} WHERE "userId" = $1 AND "announcementId" IN (${placeholders})`, [userId, ...ids]);
        }
        const readById = new Map(readRows.map((row) => [row.id, row.readAt]));
        const enriched = await enrich(rows);
        return enriched.map((row) => ({ ...row, read: readById.has(row.id), readAt: readById.get(row.id) || null }));
      },
    });

    context.routes.register({
      method: 'GET', path: 'unread-count', permission: 'wattanam.announcements.read',
      async handler(request) {
        const userId = request.principal.userId;
        const role = request.principal.role;
        const classIds = await context.directory.classesForUser(userId, role);
        const params = [userId, role];
        const conditions = [`audience = 'SCHOOL'`, `(audience = 'ROLE' AND "targetRole" = 'ALL')`, `(audience = 'ROLE' AND "targetRole" = $2)`];
        if (classIds.length) {
          const placeholders = classIds.map((_, index) => `$${params.length + index + 1}`).join(',');
          conditions.push(`(audience = 'CLASS' AND "classId" IN (${placeholders}))`);
          params.push(...classIds);
        }
        const rows = await context.database.query(
          `SELECT COUNT(*)::int as count FROM ${TABLE} a WHERE a."sentAt" IS NOT NULL AND (${conditions.join(' OR ')}) AND NOT EXISTS (SELECT 1 FROM ${READ_TABLE} r WHERE r."announcementId" = a.id AND r."userId" = $1)`,
          params,
        );
        return { count: (rows[0] && rows[0].count) || 0 };
      },
    });

    context.routes.register({
      method: 'PATCH', path: 'read', permission: 'wattanam.announcements.read',
      async handler(request) {
        const id = request.body && request.body.id;
        if (!id || typeof id !== 'string') throw new Error('id is required');
        await context.database.execute(
          `INSERT INTO ${READ_TABLE} (id, "announcementId", "userId") VALUES ($1,$2,$3) ON CONFLICT ("announcementId","userId") DO NOTHING`,
          [crypto.randomUUID(), id, request.principal.userId],
        );
        return { ok: true };
      },
    });

    async function dispatchFanout(announcementId, title, bodyText, audience, targetRole, classId, channelsCsv) {
      const recipients = await context.directory.resolveAudience({ audience, targetRole: targetRole || undefined, classId: classId || undefined });
      const channels = channelsCsv.split(',').map((channel) => channel.trim());
      for (const recipient of recipients) {
        if (channels.includes('IN_APP') && recipient.channels.inApp) {
          await context.notifications.notifyInApp(recipient.id, `${title}: ${bodyText}`, 'announcement');
          try { context.realtime.notifyUser(recipient.id, 'announcement:new', { id: announcementId, title }); } catch (error) { /* best effort */ }
        }
        if (channels.includes('EMAIL') && recipient.email && recipient.channels.email) {
          await context.notifications.sendEmail(recipient.email, title, bodyText).catch((error) => context.logger.log(`email fail: ${error && error.message}`));
        }
        if (channels.includes('SMS') && recipient.phone && recipient.channels.sms) {
          await context.notifications.sendSms(recipient.phone, `${title}: ${bodyText}`).catch((error) => context.logger.log(`sms fail: ${error && error.message}`));
        }
      }
    }

    context.routes.register({
      method: 'POST', path: 'create', permission: 'wattanam.announcements.manage',
      async handler(request) {
        const body = request.body && typeof request.body === 'object' ? request.body : {};
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const bodyText = typeof body.body === 'string' ? body.body.trim() : '';
        if (!title || !bodyText) throw new Error('Title and body required');
        let audience = AUDIENCES.includes(body.audience) ? body.audience : null;
        if (!audience) throw new Error('audience must be SCHOOL, ROLE, or CLASS');
        // Teachers can only post CLASS announcements -- moved here from the core controller.
        if (request.principal.role === 'TEACHER' && audience !== 'CLASS') audience = 'CLASS';
        const classId = typeof body.classId === 'string' ? body.classId : null;
        if (audience === 'CLASS' && !classId) throw new Error('classId required for CLASS audience');
        const targetRole = typeof body.targetRole === 'string' ? body.targetRole : null;
        if (audience === 'ROLE' && !targetRole) throw new Error('targetRole required for ROLE audience');
        const requestedChannels = Array.isArray(body.channels) ? body.channels.filter((channel) => CHANNELS.includes(channel)) : [];
        const channelsCsv = (requestedChannels.length ? requestedChannels : ['IN_APP']).join(',');
        const pinned = body.pinned === true;
        const scheduledAt = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : null;
        const now = new Date();
        const shouldSendNow = !scheduledAt || scheduledAt <= now;
        const id = crypto.randomUUID();

        await context.database.execute(
          `INSERT INTO ${TABLE} (id, "authorId", title, body, audience, "targetRole", "classId", channels, pinned, "scheduledAt", "sentAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [id, request.principal.userId, title, bodyText, audience, targetRole, classId, channelsCsv, pinned, scheduledAt, shouldSendNow ? now : null],
        );

        if (shouldSendNow) {
          // Fire-and-forget multi-channel dispatch, same as the core version this replaces.
          dispatchFanout(id, title, bodyText, audience, targetRole, classId, channelsCsv).catch((error) => {
            context.logger.log(`Announcement dispatch failed: ${error && error.message}`);
          });
        }

        return { id, authorId: request.principal.userId, title, body: bodyText, audience, targetRole, classId, channels: channelsCsv, pinned, scheduledAt, sentAt: shouldSendNow ? now : null, createdAt: now };
      },
    });

    context.routes.register({
      method: 'DELETE', path: 'remove', permission: 'wattanam.announcements.manage',
      async handler(request) {
        const id = request.body && request.body.id;
        if (!id || typeof id !== 'string') throw new Error('id is required');
        await context.database.execute(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
        return { ok: true };
      },
    });

    await context.jobs.register({
      id: 'digest-heartbeat', intervalSeconds: 3600,
      async handler() { await context.storage.writeText('jobs/digest-heartbeat.txt', new Date().toISOString()); },
    });
    return context.events.subscribe('core.system.started.v1', async () => {
      context.logger.log('Announcements plugin received core startup event');
      await context.storage.writeText('lifecycle/last-started.txt', new Date().toISOString());
    });
  },
  deactivate(context) {
    context.logger.log('Announcements reference plugin deactivated');
  },
  health() { return { status: 'ready' }; },
};
