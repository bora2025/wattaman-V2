-- wattanam-plugin-migration: 001_create_route
CREATE TABLE plugin_wattanam_transportation_route ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"description" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
