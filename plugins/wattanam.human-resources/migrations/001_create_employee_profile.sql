-- wattanam-plugin-migration: 001_create_employee_profile
CREATE TABLE plugin_wattanam_human_resources_employee_profile ("id" TEXT PRIMARY KEY,"directoryUserId" TEXT NOT NULL UNIQUE,"title" TEXT,"summary" TEXT,"skills" JSONB NOT NULL DEFAULT '[]'::jsonb,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK (jsonb_typeof("skills")='array'));
