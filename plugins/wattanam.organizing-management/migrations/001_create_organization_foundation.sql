-- wattanam-plugin-migration: 001_create_organization_foundation
CREATE TABLE plugin_wattanam_organizing_management_organization_profile (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "organizationType" TEXT NOT NULL DEFAULT 'COMPANY' CHECK ("organizationType" IN ('COMPANY','SHOP','STORE','NONPROFIT','OTHER')),
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Phnom_Penh',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE plugin_wattanam_organizing_management_employee (
  "id" TEXT PRIMARY KEY, "directoryUserId" TEXT UNIQUE, "employeeNumber" TEXT NOT NULL UNIQUE,
  "fullName" TEXT NOT NULL, "email" TEXT, "phone" TEXT, "position" TEXT, "department" TEXT,
  "employmentType" TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK ("employmentType" IN ('EMPLOYER','EMPLOYEE','CONTRACTOR','INTERN')),
  "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("employmentStatus" IN ('ACTIVE','ON_LEAVE','INACTIVE','TERMINATED')),
  "photoUrl" TEXT, "qrIdentifier" TEXT NOT NULL UNIQUE, "startDate" DATE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE plugin_wattanam_organizing_management_attendance_record (
  "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "attendanceDate" DATE NOT NULL, "status" TEXT NOT NULL CHECK ("status" IN ('PRESENT','LATE','ABSENT','ON_LEAVE')),
  "checkInAt" TIMESTAMPTZ, "checkOutAt" TIMESTAMPTZ,
  "source" TEXT NOT NULL DEFAULT 'MANUAL' CHECK ("source" IN ('QR_CAMERA','QR_USB','MANUAL','CORRECTION')),
  "notes" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("employeeId", "attendanceDate")
);
CREATE TABLE plugin_wattanam_organizing_management_calendar_event (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL,
  "eventType" TEXT NOT NULL DEFAULT 'EVENT' CHECK ("eventType" IN ('HOLIDAY','EVENT','PAYDAY','MEETING','REMINDER')),
  "startsAt" TIMESTAMPTZ NOT NULL, "endsAt" TIMESTAMPTZ, "allDay" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE TABLE plugin_wattanam_organizing_management_attendance_setting (
  "id" TEXT PRIMARY KEY, "workDays" JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  "checkInTime" TIME NOT NULL DEFAULT '08:00', "lateAfterTime" TIME NOT NULL DEFAULT '08:15', "checkOutTime" TIME NOT NULL DEFAULT '17:00',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK (jsonb_typeof("workDays") = 'array')
);
CREATE INDEX plugin_wattanam_organizing_management_employee_status_idx ON plugin_wattanam_organizing_management_employee("employmentStatus");
CREATE INDEX plugin_wattanam_organizing_management_attendance_date_idx ON plugin_wattanam_organizing_management_attendance_record("attendanceDate");
CREATE INDEX plugin_wattanam_organizing_management_calendar_start_idx ON plugin_wattanam_organizing_management_calendar_event("startsAt");
