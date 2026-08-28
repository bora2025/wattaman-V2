-- wattanam-plugin-migration: 003_create_announcement_read
CREATE TABLE "plugin_wattanam_announcements_announcement_read" ("id" TEXT PRIMARY KEY, "announcementId" TEXT NOT NULL REFERENCES "plugin_wattanam_announcements_announcement"("id") ON DELETE CASCADE, "userId" TEXT NOT NULL, "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("announcementId", "userId"));
