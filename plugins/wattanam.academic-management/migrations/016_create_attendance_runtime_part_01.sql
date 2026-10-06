-- wattanam-plugin-migration: 016_create_attendance_runtime_part_01
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_study_year (
  "id" TEXT PRIMARY KEY,
  "year" INTEGER NOT NULL UNIQUE,
  "label" TEXT,
  "startDate" TIMESTAMPTZ,
  "endDate" TIMESTAMPTZ,
  "isCurrent" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)
;

