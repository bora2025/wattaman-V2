-- wattanam-plugin-migration: 011_create_officer_attendance

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
);

CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_officer_profile_department_idx
  ON plugin_wattanam_academic_management_officer_profile ("departmentId", "employmentStatus");

CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_officer_attendance (
  "id" UUID PRIMARY KEY,
  "officerId" UUID NOT NULL REFERENCES plugin_wattanam_academic_management_officer_profile("id") ON DELETE RESTRICT,
  "attendanceDate" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "checkInAt" TIMESTAMP(3),
  "checkOutAt" TIMESTAMP(3),
  "note" TEXT,
  "recordedBy" UUID NOT NULL,
  "correctedBy" UUID,
  "correctedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT plugin_wattanam_academic_management_officer_attendance_unique UNIQUE ("officerId", "attendanceDate"),
  CONSTRAINT plugin_wattanam_academic_management_officer_attendance_status_check
    CHECK ("status" IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'EXCUSED')),
  CONSTRAINT plugin_wattanam_academic_management_officer_attendance_time_check
    CHECK ("checkOutAt" IS NULL OR "checkInAt" IS NULL OR "checkOutAt" >= "checkInAt")
);

CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_officer_attendance_date_idx
  ON plugin_wattanam_academic_management_officer_attendance ("attendanceDate", "status");

CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_officer_attendance_officer_idx
  ON plugin_wattanam_academic_management_officer_attendance ("officerId", "attendanceDate" DESC);

