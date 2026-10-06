-- wattanam-plugin-migration: 020_create_attendance_runtime_part_05
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_identifier (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "personId" TEXT NOT NULL,
  "personType" TEXT NOT NULL CHECK ("personType" IN ('STUDENT', 'TEACHER', 'STAFF')),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)
;

