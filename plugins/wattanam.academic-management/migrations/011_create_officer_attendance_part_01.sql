-- wattanam-plugin-migration: 011_create_officer_attendance_part_01
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_officer_profile (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL UNIQUE,
  "employeeNumber" TEXT UNIQUE,
  "position" TEXT,
  "departmentId" UUID,
  "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" DATE,
  "endedAt" DATE,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT plugin_wattanam_academic_management_officer_profile_status_check
    CHECK ("employmentStatus" IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  CONSTRAINT plugin_wattanam_academic_management_officer_profile_dates_check
    CHECK ("endedAt" IS NULL OR "startedAt" IS NULL OR "endedAt" >= "startedAt")
)
;

