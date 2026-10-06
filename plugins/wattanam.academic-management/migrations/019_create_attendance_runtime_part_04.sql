-- wattanam-plugin-migration: 019_create_attendance_runtime_part_04
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_holiday (
  "id" TEXT PRIMARY KEY,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'HOLIDAY',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("date", "name")
)
;

