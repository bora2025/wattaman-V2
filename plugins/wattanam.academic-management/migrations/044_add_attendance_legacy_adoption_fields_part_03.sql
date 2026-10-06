-- wattanam-plugin-migration: 044_add_attendance_legacy_adoption_fields_part_03
CREATE TABLE IF NOT EXISTS "plugin_wattanam_academic_management_attendance_format_rule" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL DEFAULT '',
  "permissionsPerAbsent" INTEGER NOT NULL DEFAULT 3 CHECK ("permissionsPerAbsent" > 0),
  "latesPerAbsentHalf" INTEGER NOT NULL DEFAULT 3 CHECK ("latesPerAbsentHalf" > 0),
  "absentSessionsForDayAbsent" INTEGER NOT NULL DEFAULT 3 CHECK ("absentSessionsForDayAbsent" >= 0),
  "caseStudyABEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId")
)
;

