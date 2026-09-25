-- wattanam-plugin-migration: 010_create_subject
CREATE TABLE "plugin_wattanam_academic_management_subject" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "nameKh" TEXT,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_subject_code" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'),
  CONSTRAINT "academic_subject_name" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120)
);
