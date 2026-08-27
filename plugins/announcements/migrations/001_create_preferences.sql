-- wattanam-plugin-migration: 001_create_preferences
CREATE TABLE "plugin_wattanam_announcements_preferences" ("id" TEXT PRIMARY KEY, "digestEnabled" BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
