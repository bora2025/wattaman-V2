-- wattanam-plugin-migration: 001_create_template
CREATE TABLE "plugin_wattanam_document_designer_template" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "design" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isActive" BOOLEAN NOT NULL DEFAULT FALSE,
  "activeDocumentType" TEXT GENERATED ALWAYS AS
    (CASE WHEN "isActive" THEN "documentType" ELSE NULL END) STORED UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
