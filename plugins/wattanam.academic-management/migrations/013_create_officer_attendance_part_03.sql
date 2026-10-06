-- wattanam-plugin-migration: 013_create_officer_attendance_part_03
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
)
;

