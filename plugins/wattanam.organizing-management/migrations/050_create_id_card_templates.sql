-- wattanam-plugin-migration: 050_create_id_card_templates
CREATE TABLE plugin_wattanam_organizing_management_id_card_template (
  "id" TEXT PRIMARY KEY,
  "cardType" TEXT NOT NULL UNIQUE CHECK ("cardType" IN ('STAFF')),
  "schoolName" TEXT NOT NULL,
  "cardTitle" TEXT NOT NULL,
  "logoUrl" TEXT,
  "cardSize" TEXT NOT NULL CHECK ("cardSize" IN ('cr80-portrait','cr80-landscape')),
  "designPreset" TEXT NOT NULL,
  "primaryColor" TEXT NOT NULL,
  "accentColor" TEXT NOT NULL,
  "footerText" TEXT,
  "extraInfo" TEXT,
  "showPhone" BOOLEAN NOT NULL DEFAULT TRUE,
  "showEmail" BOOLEAN NOT NULL DEFAULT TRUE,
  "showAddress" BOOLEAN NOT NULL DEFAULT FALSE,
  "showDateOfBirth" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
