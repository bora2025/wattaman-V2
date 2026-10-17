-- wattanam-plugin-migration: 024_create_employee_relations_workflow
CREATE TABLE plugin_wattanam_organizing_management_job_promotion (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "fromPositionId" TEXT REFERENCES plugin_wattanam_organizing_management_position("id"),
  "toPositionId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_position("id"),
  "effectiveDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "previousBaseSalaryMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("previousBaseSalaryMinor" >= 0),
  "newBaseSalaryMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("newBaseSalaryMinor" >= 0),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
