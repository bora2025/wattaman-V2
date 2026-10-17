-- wattanam-plugin-migration: 047_audit_hr_and_attendance_corrections
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
