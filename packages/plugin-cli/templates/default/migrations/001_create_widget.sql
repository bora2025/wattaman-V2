-- wattanam-plugin-migration: 001_create_widget
CREATE TABLE "plugin_{{publisher}}_{{name}}_widget" (
  "id" TEXT PRIMARY KEY,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
