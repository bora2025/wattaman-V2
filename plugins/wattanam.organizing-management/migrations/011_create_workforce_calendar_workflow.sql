-- wattanam-plugin-migration: 011_create_workforce_calendar_workflow
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
