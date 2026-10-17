-- wattanam-plugin-migration: 018_create_payroll_rewards_permissions
CREATE TABLE plugin_wattanam_organizing_management_permission_request (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "permissionType" TEXT NOT NULL CHECK ("permissionType" IN ('LATE_ARRIVAL','EARLY_DEPARTURE','SHORT_LEAVE','REMOTE_WORK','OTHER')),
  "permissionDate" DATE NOT NULL,
  "startsAt" TIME,
  "endsAt" TIME,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" >= "startsAt")
);
