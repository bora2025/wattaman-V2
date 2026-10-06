-- wattanam-plugin-migration: 017_add_attendance_legacy_adoption_fields
ALTER TABLE "plugin_wattanam_academic_management_attendance_record"
  ADD COLUMN IF NOT EXISTS "permissionStartDate" DATE,
  ADD COLUMN IF NOT EXISTS "permissionEndDate" DATE;

ALTER TABLE "plugin_wattanam_academic_management_attendance_identifier"
  ADD COLUMN IF NOT EXISTS "createdById" TEXT;

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
);

ALTER TABLE "plugin_wattanam_academic_management_attendance_record"
  ADD CONSTRAINT "academic_management_attendance_permission_date_order"
  CHECK ("permissionEndDate" IS NULL OR "permissionStartDate" IS NULL OR "permissionEndDate" >= "permissionStartDate") NOT VALID;


