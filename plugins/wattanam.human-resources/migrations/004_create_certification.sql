-- wattanam-plugin-migration: 004_create_certification
CREATE TABLE plugin_wattanam_human_resources_certification ("id" TEXT PRIMARY KEY,"directoryUserId" TEXT NOT NULL,"name" TEXT NOT NULL,"issuer" TEXT,"issueDate" DATE,"order" INTEGER NOT NULL DEFAULT 0 CHECK ("order">=0),"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
