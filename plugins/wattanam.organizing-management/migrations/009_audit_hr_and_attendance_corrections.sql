-- wattanam-plugin-migration: 009_audit_hr_and_attendance_corrections
ALTER TABLE plugin_wattanam_organizing_management_day_off_request
  ADD COLUMN "requestedById" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ;

ALTER TABLE plugin_wattanam_organizing_management_disciplinary_action
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "resolvedById" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMPTZ;

ALTER TABLE plugin_wattanam_organizing_management_job_promotion
  ADD COLUMN "createdById" TEXT;

CREATE TABLE plugin_wattanam_organizing_management_attendance_correction (
  "id" TEXT PRIMARY KEY,
  "attendanceRecordId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_attendance_record("id") ON DELETE CASCADE,
  "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "previousStatus" TEXT NOT NULL,
  "newStatus" TEXT NOT NULL CHECK ("newStatus" IN ('PRESENT','LATE','ABSENT','ON_LEAVE')),
  "previousCheckInAt" TIMESTAMPTZ,
  "newCheckInAt" TIMESTAMPTZ,
  "previousCheckOutAt" TIMESTAMPTZ,
  "newCheckOutAt" TIMESTAMPTZ,
  "reason" TEXT NOT NULL,
  "correctedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX plugin_wattanam_organizing_management_attendance_correction_record_idx
  ON plugin_wattanam_organizing_management_attendance_correction("attendanceRecordId", "createdAt");

CREATE INDEX plugin_wattanam_organizing_management_attendance_correction_employee_idx
  ON plugin_wattanam_organizing_management_attendance_correction("employeeId", "createdAt");
