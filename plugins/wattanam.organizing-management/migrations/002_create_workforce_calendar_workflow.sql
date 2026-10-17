-- wattanam-plugin-migration: 002_create_workforce_calendar_workflow
CREATE TABLE plugin_wattanam_organizing_management_position (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "department" TEXT,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE plugin_wattanam_organizing_management_employee
  ADD COLUMN "positionId" TEXT REFERENCES plugin_wattanam_organizing_management_position("id");

CREATE TABLE plugin_wattanam_organizing_management_day_off_request (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "leaveType" TEXT NOT NULL CHECK ("leaveType" IN ('ANNUAL','SICK','PERSONAL','UNPAID','OTHER')),
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endsOn" >= "startsOn")
);

CREATE INDEX plugin_wattanam_organizing_management_position_active_idx ON plugin_wattanam_organizing_management_position("active");
CREATE INDEX plugin_wattanam_organizing_management_day_off_employee_idx ON plugin_wattanam_organizing_management_day_off_request("employeeId", "startsOn");
CREATE INDEX plugin_wattanam_organizing_management_day_off_status_idx ON plugin_wattanam_organizing_management_day_off_request("status", "startsOn");
