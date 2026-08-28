# Wattanam Announcements Reference Plugin

This package is the first signed reference plugin for the Wattanam plugin contract. It demonstrates a namespaced manifest, permissions and navigation, backend lifecycle and health checks, versioned events, namespaced API routes, scoped JSON settings, scoped file storage, a persisted hourly job, signed namespaced SQL migrations, language declarations, support/privacy metadata, and a generic frontend settings page.

The plugin owns the full announcements business feature: the `plugin_wattanam_announcements_announcement`/`_announcement_read` tables and the `all`/`feed`/`unread-count`/`read`/`create`/`remove` routes core's `/announcements/*` proxy dispatches into. Core's original `Announcement`/`AnnouncementRead` tables were migrated into this plugin by `backend/scripts/announcements-cutover.js` and are kept, unused, as the rollback path — see `docs/acceptance/gate-c-announcements-cutover-2026-08-28.md`.
