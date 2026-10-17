-- wattanam-plugin-migration: 003_create_organization_foundation
CREATE TABLE plugin_wattanam_organizing_management_attendance_record (
  "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "attendanceDate" DATE NOT NULL, "status" TEXT NOT NULL CHECK ("status" IN ('PRESENT','LATE','ABSENT','ON_LEAVE')),
  "checkInAt" TIMESTAMPTZ, "checkOutAt" TIMESTAMPTZ,
  "source" TEXT NOT NULL DEFAULT 'MANUAL' CHECK ("source" IN ('QR_CAMERA','QR_USB','MANUAL','CORRECTION')),
  "notes" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("employeeId", "attendanceDate")
);
